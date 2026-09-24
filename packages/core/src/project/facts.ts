import { plural } from "../format/text.js";
import type { Indexes } from "../index/build.js";
import type { Report } from "../pbir/types.js";
import {
  allVisuals,
  filtersPaneState,
  hiddenVisualWithFields,
  isDrillthroughPage,
  isHiddenPage,
  isHiddenVisual,
  isSlicer,
  isTooltipPage,
  landingPageNotSet,
  openingPage,
  openingPageInvalid,
  reportMeasuresToMove,
  slicerSelection,
} from "../rules/report-helpers.js";
import type { Fact, Project } from "./types.js";

/** `n info`-style nouns are the caller's business; these take an s. */
const n = plural;

/** The report's facts; the project is there for a fact whose rule reads the model beside it. */
function reportFacts(project: Project, report: Report, known: ReadonlySet<string>): Fact[] {
  const facts: Fact[] = [];
  // The candidates are ordered from the most specific rule to the broadest, and the fact links to
  // the first the run actually carries, so leaving the specific rule out of a run does not cost
  // the fact its link to the rule that did run.
  const withRule = (fact: Fact, ...candidates: (string | undefined)[]): Fact => {
    const ruleId = candidates.find((id) => id !== undefined && known.has(id));
    return ruleId === undefined ? fact : { ...fact, ruleId };
  };
  const pages = report.pages;

  // Opens on. A hidden landing page says "(hidden)", which is true, but links no rule for it.
  const opens = openingPage(report);
  const value =
    opens === undefined
      ? "unknown"
      : opens.page === undefined
        ? `"${opens.name}" (no such page)`
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
  // silent then, so the fact links no rule.
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
          "FILTERS_PANE_STATE",
        ),
  );

  // Pages. A tooltip or drillthrough page counts by either marking Microsoft's page schema gives
  // it, page.json's own `type` or its `pageBinding.type` (Desktop-saved reports mark most tooltip
  // pages by `type` alone), the reading HIDE_TOOLTIP_DRILLTROUGH_PAGES shares.
  const hidden = pages.filter(isHiddenPage).length;
  const tooltip = pages.filter(isTooltipPage).length;
  const drill = pages.filter(isDrillthroughPage).length;
  const pageParts = [
    hidden && `${hidden} hidden`,
    tooltip && `${tooltip} tooltip`,
    drill && `${drill} drillthrough`,
  ].filter(Boolean) as string[];
  facts.push(
    withRule(
      {
        layer: "report",
        label: "Pages",
        value: String(pages.length),
        ...(pageParts.length ? { detail: pageParts.join(", ") } : {}),
      },
      tooltip + drill > 0 ? "HIDE_TOOLTIP_DRILLTROUGH_PAGES" : undefined,
    ),
  );

  // Visuals. A visual hidden through its group counts as hidden, the reading
  // HIDDEN_VISUAL_WITH_FIELDS shares.
  const visuals = allVisuals(report).filter((v) => !v.isGroup);
  const hiddenVisuals = visuals.filter(isHiddenVisual);
  const hiddenWithFields = visuals.filter(hiddenVisualWithFields).length;
  const registered = report.publicCustomVisuals;
  const usedTypes = new Set(visuals.map((v) => v.type));
  const used = registered.filter((t) => usedTypes.has(t)).length;
  const visualParts = [
    hiddenVisuals.length ? `${hiddenVisuals.length} hidden` : "",
    registered.length
      ? `${n(registered.length, "custom visual type")} registered, ${used} used`
      : "",
  ].filter(Boolean);
  facts.push(
    withRule(
      {
        layer: "report",
        label: "Visuals",
        value: String(visuals.length),
        ...(visualParts.length ? { detail: visualParts.join("; ") } : {}),
      },
      hiddenWithFields > 0 ? "HIDDEN_VISUAL_WITH_FIELDS" : undefined,
      registered.length > used ? "REMOVE_UNUSED_CUSTOM_VISUALS" : undefined,
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

  // Slicers: Microsoft's slicer types and any other visual that carries a saved selection, such as
  // a custom slicer from AppSource; then every visual saved with a selection, as the rule reads
  // them. Each visual with a selection is among the slicers, so the second never exceeds the first.
  const selected = new Set(visuals.filter((v) => slicerSelection(v) !== undefined));
  const slicers = visuals.filter((v) => isSlicer(v) || selected.has(v));
  const saved = selected.size;
  facts.push(
    withRule(
      slicers.length
        ? {
            layer: "report",
            label: "Slicers",
            value: String(slicers.length),
            detail: `${saved} with a saved selection`,
          }
        : { layer: "report", label: "Slicers", value: "none" },
      saved > 0 ? "SLICER_SELECTION_SAVED" : undefined,
    ),
  );

  // Mobile layouts and schema versions.
  const mobilePages = pages.filter((p) => p.visuals.some((v) => v.hasMobileLayout)).length;
  facts.push({
    layer: "report",
    label: "Mobile layouts",
    value: mobilePages ? `${mobilePages} of ${n(pages.length, "page")}` : "none",
  });
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
 * config, or skipped for want of a layer or a live model, links nothing.
 */
export function buildFacts(
  project: Project,
  indexes: Indexes,
  knownRules: ReadonlySet<string>,
): Fact[] {
  if (!project.report) return [];
  const facts: Fact[] = reportFacts(project, project.report, knownRules);
  const model = project.model;
  if (model) {
    const columns = model.tables.reduce((s, t) => s + t.columns.length, 0);
    const measures = model.tables.reduce((s, t) => s + t.measures.length, 0);
    const fact: Fact = {
      layer: "model",
      label: "Model",
      value: `${n(model.tables.length, "table")}, ${n(columns, "column")}, ${n(measures, "measure")}`,
    };
    const reach = indexes.reachability;
    if (reach) {
      const u = reach.unreached();
      fact.detail = `${n(u.columns.length, "column")} and ${n(u.measures.length, "measure")} not reached from this report`;
      if (u.columns.length + u.measures.length > 0 && knownRules.has("NOT_REACHED_FROM_REPORT"))
        fact.ruleId = "NOT_REACHED_FROM_REPORT";
    }
    facts.push(fact);
  }
  return facts;
}
