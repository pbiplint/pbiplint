import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { lint } from "../src/engine/lint.js";
import { defaultRules } from "../src/rules/index.js";
import { readModelFiles } from "./helpers.js";

/** The survey's copy of Tabular Editor's community rules for Power BI, by its id in files.json. */
const POWERBI_RULES = "TabularEditor/BestPracticeRules/BPARules-PowerBI.json";

/**
 * The pbiplint rules that take their test from Tabular Editor's rules, each with the capture that
 * holds the rules it follows: Tabular Editor 3's built-in rules (`te3`, in
 * `tests/expectations/te3/`), or one of the survey's rule files (`survey`, in
 * `tests/expectations/survey/`, by the file's id). On every fixture with both captures, made with
 * `te` 0.7.1.2 (docs/RELEASING.md), the rule reports exactly the objects those rules report
 * together, or, where the capture records a deviation for the rule, its `ours`. Spec section 5.3.
 */
const SOURCED: { rule: string; capture: "te3" | "survey"; file?: string; rules: string[] }[] = [
  {
    rule: "NAME_WITHOUT_TRANSLATION",
    capture: "survey",
    file: POWERBI_RULES,
    rules: ["TRANSLATE_HIDEABLE_OBJECT_NAMES", "TRANSLATE_HIERARCHY_LEVEL_NAMES"],
  },
  {
    rule: "DECIMAL_COLUMN_WITHOUT_FORMAT_STRING",
    capture: "te3",
    rules: ["TE3_BUILT_IN_FORMAT_STRING_COLUMNS"],
  },
  {
    rule: "UDF_USE_COMPOUND_NAMES",
    capture: "te3",
    rules: ["TE3_BUILT_IN_UDF_USE_COMPOUND_NAMES"],
  },
  {
    rule: "UDF_WITHOUT_DESCRIPTION",
    capture: "te3",
    rules: ["TE3_BUILT_IN_VISIBLE_UDF_NO_DESCRIPTION"],
  },
  {
    rule: "ISAVAILABLEINMDX_FALSE_NONATTRIBUTE_COLUMNS",
    capture: "te3",
    rules: ["TE3_BUILT_IN_SET_ISAVAILABLEINMDX_FALSE"],
  },
  {
    rule: "SET_ISAVAILABLEINMDX_TO_TRUE_ON_NECESSARY_COLUMNS",
    capture: "te3",
    rules: ["TE3_BUILT_IN_SET_ISAVAILABLEINMDX_TRUE_NECESSARY"],
  },
];

/** What both kinds of capture hold beside their results: the deviations pbiplint records. */
interface Deviations {
  fixture: string;
  deviations: Record<string, string | string[]>;
  ours: Record<string, string[]>;
}
interface BuiltInCapture extends Deviations {
  findings: Record<string, string[]>;
}
interface SurveyCapture extends Deviations {
  results: Record<string, { findings?: Record<string, string[]> }>;
}

const repoRoot = new URL("../../../", import.meta.url).pathname;
const dir = repoRoot + "tests/expectations/";
const read = <T>(path: string): T => JSON.parse(readFileSync(dir + path, "utf8")) as T;
const fixtures = readdirSync(dir + "te3/")
  .filter((f) => f.endsWith(".json"))
  .map((f) => f.replace(/\.json$/, ""));

/** The capture a sourced rule reads on `name`, and the objects its source rules report there. */
function sourceOf(
  name: string,
  s: (typeof SOURCED)[number],
): { capture: Deviations; oracle: string[] } {
  if (s.capture === "te3") {
    const capture = read<BuiltInCapture>(`te3/${name}.json`);
    return { capture, oracle: s.rules.flatMap((id) => capture.findings[id] ?? []).sort() };
  }
  const capture = read<SurveyCapture>(`survey/${name}.json`);
  const findings = capture.results[s.file!]?.findings ?? {};
  return { capture, oracle: s.rules.flatMap((id) => findings[id] ?? []).sort() };
}

describe("the sourced rules", () => {
  it("name pbiplint rules, and source rules that fire on some fixture", () => {
    const ids = new Set(defaultRules.map((r) => r.id));
    for (const s of SOURCED) {
      expect(ids.has(s.rule), s.rule).toBe(true);
      // A source rule that fires nowhere would let a misspelt id pass by matching nothing.
      for (const id of s.rules)
        expect(
          fixtures.some((name) => sourceOf(name, { ...s, rules: [id] }).oracle.length > 0),
          id,
        ).toBe(true);
    }
  });
});

describe.each(fixtures)("parity with Tabular Editor's rules: %s", (name) => {
  const fixture = read<BuiltInCapture>(`te3/${name}.json`).fixture;
  const result = lint(readModelFiles(repoRoot + fixture), { config: { failOn: "none" } });
  const ours: Record<string, string[]> = {};
  for (const f of result.findings) (ours[f.ruleId] ??= []).push(f.objectName);

  it.each(SOURCED.map((s) => [s.rule, s] as const))("%s", (rule, s) => {
    const { capture, oracle } = sourceOf(name, s);
    const expected =
      capture.deviations[rule] !== undefined ? [...(capture.ours[rule] ?? [])].sort() : oracle;
    expect([...(ours[rule] ?? [])].sort()).toEqual(expected);
  });

  it.each(["te3", "survey"] as const)(
    "records in the %s capture only deviations of rules sourced from it, each showing a difference",
    (kind) => {
      const capture = read<Deviations>(`${kind}/${name}.json`);
      for (const rule of Object.keys(capture.deviations)) {
        const s = SOURCED.find((x) => x.rule === rule && x.capture === kind);
        expect(s, `${rule} is not sourced from the ${kind} capture`).toBeDefined();
        expect(capture.ours[rule], `${rule}: ours`).toBeDefined();
        // A deviation with no visible difference on this fixture is either unneeded here or wrong.
        expect(
          [...capture.ours[rule]!].sort(),
          `${rule}: ours must differ from its source rules on ${name}`,
        ).not.toEqual(sourceOf(name, s!).oracle);
      }
      expect(
        Object.keys(capture.ours).filter((id) => capture.deviations[id] === undefined),
      ).toEqual([]);
    },
  );
});
