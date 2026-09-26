import { plural } from "../format/text.js";
import type { Indexes } from "../index/build.js";
import { isAutoDateTable } from "../model/names.js";
import type { Report } from "../pbir/types.js";
import { modelPartlyRead } from "../rules/helpers.js";
import {
  allVisuals,
  customVisualUseUnknown,
  fieldFileUnread,
  filtersPaneState,
  hiddenVisualWithFields,
  isDrillthroughPage,
  isHiddenPage,
  isHiddenVisual,
  isSlicer,
  isTooltipPage,
  landingPageNotSet,
  mobileFileUnread,
  mobilePageUnread,
  openingPage,
  openingPageInvalid,
  pageFileUnread,
  reportMeasuresToMove,
  slicerSelection,
  visualFileUnread,
} from "../rules/report-helpers.js";
import type { RuleOptions } from "../rules/types.js";
import type { Fact, Project } from "./types.js";

/** `n info`-style nouns are the caller's business; these take an s. */
const n = plural;

/** The report's facts; the project is there for a fact whose rule reads the model beside it. */
function reportFacts(
  project: Project,
  report: Report,
  known: ReadonlySet<string>,
  ruleOptions: ReadonlyMap<string, RuleOptions>,
): Fact[] {
  const facts: Fact[] = [];
  // The candidates are ordered from the most specific rule to the broadest, and the fact links to
  // the first the run actually carries, so leaving the specific rule out of a run does not cost
  // the fact its link to the rule that did run.
  const withRule = (fact: Fact, ...candidates: (string | undefined)[]): Fact => {
    const ruleId = candidates.find((id) => id !== undefined && known.has(id));
    return ruleId === undefined ? fact : { ...fact, ruleId };
  };
  const pages = report.pages;

  // Opens on. A hidden landing page says "(hidden)", which is true, but links no rule for it. A
  // page whose page.json could not be read goes by the name pages.json gives it, the same name a
  // stub page takes from its folder, and is never called missing.
  const opens = openingPage(report);
  const value =
    opens === undefined
      ? "unknown"
      : opens.page === undefined
        ? opens.unread
          ? opens.name
          : `"${opens.name}" (no such page)`
        : isHiddenPage(opens.page)
          ? `${opens.page.displayName} (hidden)`
          : opens.page.displayName;
  const how = {
    landing: "landing page",
    active: "the page open when it was saved; no landing page set",
    first: "the first page; no landing page set",
  };
  facts.push(
    withRule(
      {
        layer: "report",
        label: "Opens on",
        value,
        detail:
          report.pagesHeader.file === undefined
            ? "pages.json was not read"
            : opens === undefined
              ? "no landing page set"
              : how[opens.by],
      },
      openingPageInvalid(opens) ? "OPENING_PAGE_INVALID" : undefined,
      landingPageNotSet(report) ? "LANDING_PAGE_NOT_SET" : undefined,
    ),
  );

  // Filters pane. Unknown, like Opens on, when the file that records it was not read; the rule is
  // silent then, so the fact links no rule. Known, it links FILTERS_PANE_STATE only under an
  // `expect` policy, the option the rule reads, whether the saved state meets the policy or breaks
  // it: without one the rule runs but can never fire.
  const pane = filtersPaneState(report);
  facts.push(
    pane === undefined
      ? {
          layer: "report",
          label: "Filters pane",
          value: "unknown",
          detail: "report.json was not read",
        }
      : withRule(
          {
            layer: "report",
            label: "Filters pane",
            value: pane.state,
            ...(pane.recordedAt === undefined
              ? { detail: "read as open; report.json does not record it" }
              : {}),
          },
          ruleOptions.get("FILTERS_PANE_STATE")?.expect !== undefined
            ? "FILTERS_PANE_STATE"
            : undefined,
        ),
  );

  // Pages. A tooltip page counts by either marking Microsoft's page schema gives it, page.json's
  // own `type` or its `pageBinding.type` (Desktop-saved reports mark most tooltip pages by `type`
  // alone); a drillthrough page by its `pageBinding.type` alone, which every drillthrough target in
  // Desktop-saved reports carries. HIDE_TOOLTIP_DRILLTROUGH_PAGES shares both readings. While a
  // page.json, or a folder that could hold one, could not be read (`pageFileUnread`), 0 would say
  // the report has no page, so the count reads unknown in its place; a count above 0 is a lower
  // bound and stays.
  const hidden = pages.filter(isHiddenPage).length;
  const tooltip = pages.filter(isTooltipPage).length;
  const drill = pages.filter(isDrillthroughPage).length;
  const pagesUnknown = pages.length === 0 && pageFileUnread(report);
  const pageParts = [
    hidden && `${hidden} hidden`,
    tooltip && `${tooltip} tooltip`,
    drill && `${drill} drillthrough`,
    pagesUnknown && "a page.json could not be read",
  ].filter(Boolean) as string[];
  facts.push(
    withRule(
      {
        layer: "report",
        label: "Pages",
        value: pagesUnknown ? "unknown" : String(pages.length),
        ...(pageParts.length ? { detail: pageParts.join(", ") } : {}),
      },
      tooltip + drill > 0 ? "HIDE_TOOLTIP_DRILLTROUGH_PAGES" : undefined,
    ),
  );

  // Visuals. A visual hidden through its group counts as hidden, the reading
  // HIDDEN_VISUAL_WITH_FIELDS shares. While a visual.json could not be read and a registered
  // custom visual type is used by no visual that was read, how many are used is unknown, since the
  // unread visual could be of that type; REMOVE_UNUSED_CUSTOM_VISUALS is skipped on the same
  // condition, so the fact links it only when it can fire. While a visual.json, or a folder that
  // could hold one, could not be read (`visualFileUnread`), 0 would say the report has no visual,
  // so the count reads unknown in its place, and the detail gives the reason once: with no visual
  // read, a registered type is used by none, so the custom visual clause already ends with it. A
  // count above 0, and the hidden count, are lower bounds and stay.
  const visualUnread = visualFileUnread(report);
  const unreadVisual = "a visual.json could not be read";
  const visuals = allVisuals(report).filter((v) => !v.isGroup);
  const hiddenVisuals = visuals.filter(isHiddenVisual);
  const hiddenWithFields = visuals.filter(hiddenVisualWithFields).length;
  const registered = report.publicCustomVisuals;
  const usedTypes = new Set(visuals.map((v) => v.type));
  const used = registered.filter((t) => usedTypes.has(t)).length;
  const usedUnknown = customVisualUseUnknown(report);
  const visualsUnknown = visuals.length === 0 && visualUnread;
  const visualParts = [
    hiddenVisuals.length ? `${hiddenVisuals.length} hidden` : "",
    registered.length
      ? `${n(registered.length, "custom visual type")} registered, ${
          usedUnknown ? `used: unknown, ${unreadVisual}` : `${used} used`
        }`
      : "",
    visualsUnknown && !usedUnknown ? unreadVisual : "",
  ].filter(Boolean);
  facts.push(
    withRule(
      {
        layer: "report",
        label: "Visuals",
        value: visualsUnknown ? "unknown" : String(visuals.length),
        ...(visualParts.length ? { detail: visualParts.join("; ") } : {}),
      },
      hiddenWithFields > 0 ? "HIDDEN_VISUAL_WITH_FIELDS" : undefined,
      registered.length > used && !usedUnknown ? "REMOVE_UNUSED_CUSTOM_VISUALS" : undefined,
    ),
  );

  // Report measures. Unknown, like Filters pane, when reportExtensions.json is in the input but was
  // not read; the rule cannot report measures it did not read, so the fact links no rule. Otherwise
  // the count shows whenever the report defines any, and the rule is linked only when it reports
  // them, which takes the model the report reads in the run.
  const measures = report.measures.length;
  facts.push(
    report.extensions === "unread"
      ? {
          layer: "report",
          label: "Report measures",
          value: "unknown",
          detail: "reportExtensions.json was not read",
        }
      : withRule(
          measures
            ? {
                layer: "report",
                label: "Report measures",
                value: String(measures),
                detail: "defined in the report, not the model",
              }
            : { layer: "report", label: "Report measures", value: "none" },
          reportMeasuresToMove(project).length > 0 ? "REPORT_LEVEL_MEASURES" : undefined,
        ),
  );

  // Slicers: the value counts Microsoft's slicer types only (`isSlicer`), with a selection or
  // without, so clearing a selection never changes it. A custom slicer from AppSource is known only
  // by the selection it carries, so the detail counts every saved selection, as
  // SLICER_SELECTION_SAVED reads them, and names those on a visual that is not a built-in slicer.
  // With no built-in slicer the value is none, and a custom slicer's selection still shows in the
  // detail beside it. While a visual.json could not be read, that visual could be a slicer or carry
  // a selection, so what would read none, the value or "no saved selection", reads unknown; a count
  // above none is a lower bound and stays.
  const slicers = visuals.filter(isSlicer).length;
  const selected = visuals.filter((v) => slicerSelection(v) !== undefined);
  const custom = selected.filter((v) => !isSlicer(v)).length;
  const slicerValue = slicers ? String(slicers) : visualUnread ? "unknown" : "none";
  const selections = selected.length
    ? n(selected.length, "saved selection") +
      (custom ? `, ${custom} on ${custom === 1 ? "a custom slicer" : "custom slicers"}` : "") +
      (slicerValue === "unknown" ? `; ${unreadVisual}` : "")
    : visualUnread
      ? `saved selections: unknown, ${unreadVisual}`
      : slicers
        ? "no saved selection"
        : undefined;
  facts.push(
    withRule(
      {
        layer: "report",
        label: "Slicers",
        value: slicerValue,
        ...(selections === undefined ? {} : { detail: selections }),
      },
      selected.length > 0 ? "SLICER_SELECTION_SAVED" : undefined,
    ),
  );

  // Mobile layouts and schema versions. A page counts by the mobile.json files read in its folder,
  // so a mobile layout pbiplint read counts even when its visual.json could not be read. None reads
  // unknown while a mobile.json could not be read, since the layout it marks is not counted, or
  // while a mobile.json that was read has no page to count and a page.json or a visual.json in its
  // folder could not be read (`mobilePageUnread`). A count above none is a lower bound and stays.
  const mobilePages = pages.filter((p) => p.hasMobileLayout).length;
  const mobileUnknown = mobilePages
    ? undefined
    : mobileFileUnread(report)
      ? "a mobile.json could not be read"
      : mobilePageUnread(report)
        ? "a page with a mobile layout could not be read"
        : undefined;
  facts.push(
    mobilePages
      ? {
          layer: "report",
          label: "Mobile layouts",
          value: `${mobilePages} of ${n(pages.length, "page")}`,
        }
      : mobileUnknown
        ? { layer: "report", label: "Mobile layouts", value: "unknown", detail: mobileUnknown }
        : { layer: "report", label: "Mobile layouts", value: "none" },
  );
  const sv = report.schemaVersions;
  const versions = [
    sv.report && `report ${sv.report}`,
    sv.page && `page ${sv.page}`,
    sv.visual && `visual ${sv.visual}`,
  ].filter(Boolean) as string[];
  if (versions.length)
    facts.push({ layer: "report", label: "Schema versions", value: versions.join(", ") });
  return facts;
}

/**
 * The "Report at a glance" block: structured, in the order the spec's table lists, and built only
 * when the report layer is present, so a run without a report produces none and no surface shows
 * the block. A fact links to a rule only when that rule ran in the run, so a rule turned off in
 * config, or skipped for want of a layer or a live model, links nothing. `ruleOptions` holds the
 * options each rule that ran was given (`optionsFor`), so a fact that depends on a rule's policy
 * reads the value the rule read; a rule missing from it has no options set.
 */
export function buildFacts(
  project: Project,
  indexes: Indexes,
  knownRules: ReadonlySet<string>,
  ruleOptions: ReadonlyMap<string, RuleOptions> = new Map(),
): Fact[] {
  if (!project.report) return [];
  const facts: Fact[] = reportFacts(project, project.report, knownRules, ruleOptions);
  const model = project.model;
  if (model) {
    // The tables Desktop shows: its auto date/time tables are hidden even from modelers, and the
    // not-reached clause below leaves them out too.
    const shown = model.tables.filter((t) => !isAutoDateTable(t));
    const columns = shown.reduce((s, t) => s + t.columns.length, 0);
    const measures = shown.reduce((s, t) => s + t.measures.length, 0);
    // While the model may lack an object its files declare (`modelPartlyRead`), 0 would say the
    // model has none, so each count that would read 0 reads `<noun>s: unknown` in its place; a
    // count above 0 is a lower bound and stays. A report file holds no model object, so only the
    // model's reading makes a count unknown.
    const partly = modelPartlyRead(model);
    const count = (k: number, noun: string) =>
      k === 0 && partly ? `${noun}s: unknown` : n(k, noun);
    const countUnknown = partly && [shown.length, columns, measures].includes(0);
    const fact: Fact = {
      layer: "model",
      label: "Model",
      value: `${count(shown.length, "table")}, ${count(columns, "column")}, ${count(measures, "measure")}`,
    };
    const reach = indexes.reachability;
    const unreadModel = "a model file could not be fully read";
    // Unknown when a file the report's field references are read from could not be read, or while
    // the model may lack an object its files declare, the cases NOT_REACHED_FROM_REPORT is skipped
    // in, the report's first as the rule's skipped line gives it: what that file would have
    // reached, or what only the missing object reaches, is not known, so the fact gives no count
    // and links no rule. When the clause gives the report file's reason and a count reads unknown,
    // the model's reason follows it, so the detail says why the count is unknown too.
    if (reach && fieldFileUnread(project.report)) {
      fact.detail = `not reached from this report: unknown, a report file could not be read${
        countUnknown ? `; ${unreadModel}` : ""
      }`;
    } else if (reach && partly) {
      fact.detail = `not reached from this report: unknown, ${unreadModel}`;
    } else if (reach) {
      const u = reach.unreached();
      fact.detail = `${n(u.columns.length, "column")} and ${n(u.measures.length, "measure")} not reached from this report`;
      if (u.columns.length + u.measures.length > 0 && knownRules.has("NOT_REACHED_FROM_REPORT"))
        fact.ruleId = "NOT_REACHED_FROM_REPORT";
    }
    facts.push(fact);
  }
  return facts;
}
