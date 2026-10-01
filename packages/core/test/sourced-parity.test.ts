import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { lint } from "../src/engine/lint.js";
import { defaultRules } from "../src/rules/index.js";
import { readModelFiles } from "./helpers.js";

/**
 * The pbiplint rules whose results follow Tabular Editor 3's built-in rules, each with the
 * built-in rules it follows. On every fixture with a built-in capture, the rule reports exactly
 * the objects those rules report together. The captures are `tests/expectations/te3/`, made with
 * `te` 0.7.1.2 (docs/RELEASING.md); spec section 5.3 adds the rules pbiplint takes from them.
 */
const SOURCED: { rule: string; builtIn: string[] }[] = [
  {
    rule: "ISAVAILABLEINMDX_FALSE_NONATTRIBUTE_COLUMNS",
    builtIn: ["TE3_BUILT_IN_SET_ISAVAILABLEINMDX_FALSE"],
  },
  {
    rule: "SET_ISAVAILABLEINMDX_TO_TRUE_ON_NECESSARY_COLUMNS",
    builtIn: ["TE3_BUILT_IN_SET_ISAVAILABLEINMDX_TRUE_NECESSARY"],
  },
];

interface BuiltInCapture {
  name: string;
  fixture: string;
  findings: Record<string, string[]>;
}

const repoRoot = new URL("../../../", import.meta.url).pathname;
const te3Dir = repoRoot + "tests/expectations/te3/";
const captures: BuiltInCapture[] = readdirSync(te3Dir)
  .filter((f) => f.endsWith(".json"))
  .map((f) => ({
    name: f.replace(/\.json$/, ""),
    ...(JSON.parse(readFileSync(te3Dir + f, "utf8")) as Omit<BuiltInCapture, "name">),
  }));

describe("the sourced rules", () => {
  it("name pbiplint rules and built-in rules that exist", () => {
    const ids = new Set(defaultRules.map((r) => r.id));
    const builtIns = new Set(captures.flatMap((c) => Object.keys(c.findings)));
    for (const { rule, builtIn } of SOURCED) {
      expect(ids.has(rule), rule).toBe(true);
      // Each built-in rule fires on some fixture, so a misspelt id cannot pass by matching nothing.
      for (const id of builtIn) expect(builtIns.has(id), id).toBe(true);
    }
  });
});

describe.each(captures)("parity with Tabular Editor 3's built-in rules: $name", (capture) => {
  const result = lint(readModelFiles(repoRoot + capture.fixture), { config: { failOn: "none" } });
  const ours: Record<string, string[]> = {};
  for (const f of result.findings) (ours[f.ruleId] ??= []).push(f.objectName);

  it.each(SOURCED.map((s) => [s.rule, s.builtIn] as const))("%s", (rule, builtIn) => {
    const expected = builtIn.flatMap((id) => capture.findings[id] ?? []).sort();
    expect([...(ours[rule] ?? [])].sort()).toEqual(expected);
  });
});
