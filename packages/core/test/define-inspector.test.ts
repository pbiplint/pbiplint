import { describe, expect, it } from "vitest";
import { inspectorRule } from "../src/rules/pbi-inspector/define.js";
import { INSPECTOR_RULES } from "../src/rules/pbi-inspector/inspector-rules.data.js";
import { pbiInspectorRules } from "../src/rules/pbi-inspector/index.js";
import { defaultRules } from "../src/rules/index.js";

const IDS = [
  "REMOVE_UNUSED_CUSTOM_VISUALS",
  "REDUCE_VISUALS_ON_PAGE",
  "REDUCE_OBJECTS_WITHIN_VISUALS",
  "REDUCE_TOPN_FILTERS",
  "REDUCE_ADVANCED_FILTERS",
  "REDUCE_PAGES",
  "AVOID_SHOW_ITEMS_WITH_NO_DATA",
  "HIDE_TOOLTIP_DRILLTROUGH_PAGES",
  "ENSURE_THEME_COLOURS",
  "ENSURE_PAGES_DO_NOT_SCROLL_VERTICALLY",
  "ENSURE_ALTTEXT",
];

describe("vendored fab-inspector ruleset", () => {
  it("holds the 11 base rules in source order, without the template", () => {
    expect(INSPECTOR_RULES.map((r) => r.id)).toEqual(IDS);
    expect(INSPECTOR_RULES.find((r) => r.id === "ENSURE_ALTTEXT")!.disabled).toBe(true);
    expect(INSPECTOR_RULES.filter((r) => r.id !== "ENSURE_ALTTEXT").every((r) => !r.disabled)).toBe(
      true,
    );
  });
});

describe("inspectorRule", () => {
  it("fills the metadata from the ruleset and the arguments, and runs against the project's report", () => {
    const r = inspectorRule(
      "REMOVE_UNUSED_CUSTOM_VISUALS",
      { category: "Performance", scope: ["Report"] },
      (report) => [
        { objectType: "Report", objectName: "Report", objectId: String(report.pages.length) },
      ],
    );
    expect(r).toMatchObject({
      id: "REMOVE_UNUSED_CUSTOM_VISUALS",
      name: "Remove custom visuals which are not used in the report",
      category: "Performance",
      severity: 2,
      scope: ["Report"],
      layer: "report",
      needs: ["report"],
      status: "ported",
      references: [],
    });
    expect(r.check({}, { indexes: {} as never, options: {} })).toEqual([]);
  });
  it("rejects an id the ruleset does not have", () => {
    expect(() =>
      inspectorRule("NOPE", { category: "Performance", scope: ["Report"] }, () => []),
    ).toThrow(/NOPE/);
  });
  it("is in the default rule set after the model rules", () => {
    expect(
      defaultRules.slice(defaultRules.length - pbiInspectorRules.length).map((r) => r.id),
    ).toEqual(pbiInspectorRules.map((r) => r.id));
  });
});
