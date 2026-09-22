import { describe, expect, it } from "vitest";
import { convertResults, enabledRuleset } from "../fab-expectations.mjs";

describe("convertResults", () => {
  it("keys the oracle's results by rule and page, translating display names for the two page-name rules", () => {
    const results = [
      {
        RuleId: "REDUCE_VISUALS_ON_PAGE",
        ItemPath: "/definition/pages/abc/page.json",
        Pass: false,
        Actual: 25,
      },
      {
        RuleId: "REDUCE_VISUALS_ON_PAGE",
        ItemPath: "/definition/pages/def/page.json",
        Pass: true,
        Actual: 3,
      },
      {
        RuleId: "ENSURE_ALTTEXT",
        ItemPath: "/definition/pages/abc/page.json",
        Pass: false,
        Actual: ["v1", "v2"],
      },
      { RuleId: "REDUCE_PAGES", ItemPath: "root", Pass: false, Actual: 13 },
      {
        RuleId: "HIDE_TOOLTIP_DRILLTROUGH_PAGES",
        ItemPath: "/definition/report.json",
        Pass: false,
        Actual: ["Tips"],
      },
      { RuleId: "template", ItemPath: "root", Pass: true, Actual: null },
    ];
    expect(convertResults(results, new Map([["Tips", "abc"]]))).toEqual({
      REDUCE_VISUALS_ON_PAGE: { abc: { pass: false, actual: 25 }, def: { pass: true, actual: 3 } },
      ENSURE_ALTTEXT: { abc: { pass: false, actual: ["v1", "v2"] } },
      REDUCE_PAGES: { report: { pass: false, actual: 13 } },
      HIDE_TOOLTIP_DRILLTROUGH_PAGES: { report: { pass: false, actual: ["abc"] } },
    });
    expect(() => convertResults([results[4]], new Map())).toThrow(/no page named "Tips"/);
  });
  it("enables every rule in a copy of the ruleset except the template", () => {
    const enabled = JSON.parse(
      enabledRuleset(
        JSON.stringify({
          rules: [
            { id: "ENSURE_ALTTEXT", disabled: true },
            { id: "template", disabled: true },
          ],
        }),
      ),
    );
    expect(enabled.rules).toEqual([
      { id: "ENSURE_ALTTEXT", disabled: false },
      { id: "template", disabled: true },
    ]);
  });
});
