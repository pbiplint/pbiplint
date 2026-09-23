import { spawnSync } from "node:child_process";
import { fileURLToPath, URL } from "node:url";
import { describe, expect, it } from "vitest";
import { convertResults, enabledRuleset } from "../fab-expectations.mjs";

const script = fileURLToPath(new URL("../fab-expectations.mjs", import.meta.url));

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
  it("throws on an item path it does not recognise, naming the rule and the path", () => {
    const result = {
      RuleId: "ENSURE_ALTTEXT",
      ItemPath: "/definition/pages/abc/visuals/v1/visual.json",
      Pass: false,
      Actual: ["v1"],
    };
    expect(() => convertResults([result], new Map())).toThrow(
      'ENSURE_ALTTEXT: unrecognised ItemPath "/definition/pages/abc/visuals/v1/visual.json"',
    );
    expect(() => convertResults([{ ...result, ItemPath: undefined }], new Map())).toThrow(
      "ENSURE_ALTTEXT: unrecognised ItemPath",
    );
  });
  it("throws on a second result for the same rule and key, naming both", () => {
    const twice = [
      { RuleId: "REDUCE_PAGES", ItemPath: "root", Pass: false, Actual: 13 },
      { RuleId: "REDUCE_PAGES", ItemPath: "/definition/report.json", Pass: true, Actual: 2 },
    ];
    expect(() => convertResults(twice, new Map())).toThrow(
      'REDUCE_PAGES: two results for "report", from "root" and "/definition/report.json"',
    );
    const page = { RuleId: "ENSURE_ALTTEXT", ItemPath: "/definition/pages/abc/page.json" };
    expect(() => convertResults([page, page], new Map())).toThrow(
      'ENSURE_ALTTEXT: two results for "abc"',
    );
  });
  it("refuses --cli without --cli-version, before it runs anything", () => {
    const run = (...args) =>
      spawnSync(process.execPath, [script, "fixture", "out.json", ...args], { encoding: "utf8" });
    for (const args of [
      ["--cli", "PBIRInspectorCLI", "--rules", "Base-rules.json"],
      ["--cli", "PBIRInspectorCLI", "--rules", "Base-rules.json", "--cli-version", "3.4"],
    ]) {
      const r = run(...args);
      expect(r.status, args.join(" ")).toBe(2);
      expect(r.stderr).toMatch(/--cli-version <x\.y\.z>/);
    }
  });
});

describe("enabledRuleset", () => {
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
