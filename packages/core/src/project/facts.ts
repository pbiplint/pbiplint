import { plural } from "../format/text.js";
import type { Indexes } from "../index/build.js";
import type { Report } from "../pbir/types.js";
import { allVisuals, isHiddenPage } from "../rules/report-helpers.js";
import type { Fact, Project } from "./types.js";

/** `n info`-style nouns are the caller's business; these take an s. */
const n = plural;

function reportFacts(report: Report, known: ReadonlySet<string>): Fact[] {
  const facts: Fact[] = [];
  const withRule = (fact: Fact, ruleId: string | undefined): Fact =>
    ruleId !== undefined && known.has(ruleId) ? { ...fact, ruleId } : fact;
  const pages = report.pages;
  const byId = new Map(pages.map((p) => [p.id, p]));
  const header = report.pagesHeader;

  // Opens on.
  const target = header.landingPageName ?? header.activePageName;
  const opened = target === undefined ? undefined : byId.get(target);
  const invalid = target !== undefined && (opened === undefined || isHiddenPage(opened));
  const value =
    target === undefined
      ? "unknown"
      : opened === undefined
        ? `"${target}" (no such page)`
        : isHiddenPage(opened)
          ? `${opened.displayName} (hidden)`
          : opened.displayName;
  facts.push(
    withRule(
      {
        layer: "report",
        label: "Opens on",
        value,
        detail:
          header.landingPageName !== undefined
            ? "landing page"
            : "the page open when it was saved; no landing page set",
      },
      invalid
        ? "OPENING_PAGE_INVALID"
        : header.landingPageName === undefined
          ? "LANDING_PAGE_NOT_SET"
          : undefined,
    ),
  );

  // Filters pane. Desktop collapses the pane unless the file says expanded.
  const pane = report.filtersPane;
  facts.push(
    withRule(
      {
        layer: "report",
        label: "Filters pane",
        value:
          pane.visible === false
            ? "hidden from readers"
            : pane.expanded === true
              ? "open"
              : "closed",
      },
      "FILTERS_PANE_STATE",
    ),
  );

  // Pages.
  const hidden = pages.filter(isHiddenPage).length;
  const tooltip = pages.filter((p) => p.bindingType === "Tooltip").length;
  const drill = pages.filter((p) => p.bindingType === "Drillthrough").length;
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

  // Visuals.
  const visuals = allVisuals(report).filter((v) => !v.isGroup);
  const hiddenVisuals = visuals.filter((v) => v.isHidden);
  const hiddenWithFields = hiddenVisuals.filter((v) => v.fields.length > 0).length;
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
      hiddenWithFields > 0
        ? "HIDDEN_VISUALS_STILL_QUERY"
        : registered.length > used
          ? "REMOVE_UNUSED_CUSTOM_VISUALS"
          : undefined,
    ),
  );

  // Report measures.
  const measures = report.measures.length;
  facts.push(
    withRule(
      measures
        ? {
            layer: "report",
            label: "Report measures",
            value: String(measures),
            detail: "defined in the report, not the model",
          }
        : { layer: "report", label: "Report measures", value: "none" },
      measures ? "REPORT_LEVEL_MEASURES" : undefined,
    ),
  );

  // Slicers.
  const slicers = visuals.filter((v) => v.type === "slicer");
  const saved = slicers.filter((v) => v.filters.some((f) => f.applied)).length;
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
 * The "Report at a glance" block: structured, always produced, in the order the spec's table
 * lists. A fact links to a rule only when that rule is in the run's rule set.
 */
export function buildFacts(
  project: Project,
  indexes: Indexes,
  knownRules: ReadonlySet<string>,
): Fact[] {
  const facts: Fact[] = project.report ? reportFacts(project.report, knownRules) : [];
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
