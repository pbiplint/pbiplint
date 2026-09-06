import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { lint } from "../src/engine/lint.js";
import { defaultRules } from "../src/rules/index.js";
import { readModelFiles } from "./helpers.js";

interface Expectation {
  name: string;
  fixture: string;
  skipRules?: Record<string, string>;
  findings: Record<string, string[]>;
}

const repoRoot = new URL("../../../", import.meta.url).pathname;
const expectationsDir = repoRoot + "tests/expectations/";
const expectations: Expectation[] = readdirSync(expectationsDir)
  .filter((f) => f.endsWith(".json"))
  .map((f) => ({
    name: f.replace(/\.json$/, ""),
    ...(JSON.parse(readFileSync(expectationsDir + f, "utf8")) as Omit<Expectation, "name">),
  }));

const ported = defaultRules.filter((r) => r.status === "ported");
const expectedCounts = new Map<string, number>(ported.map((r) => [r.id, 0]));

describe.each(expectations)("parity with Tabular Editor: $name", (exp) => {
  const files = readModelFiles(repoRoot + exp.fixture);
  const result = lint(files, { config: { failOn: "none" } });
  const ours: Record<string, string[]> = {};
  for (const f of result.findings) (ours[f.ruleId] ??= []).push(f.objectName);

  it("reads at least one file", () => {
    expect(files.length).toBeGreaterThan(0);
  });
  it("parses every file without issues", () => {
    expect(result.findings.filter((f) => f.ruleId === "PARSE_ISSUE")).toEqual([]);
  });
  it("runs every rule without errors", () => {
    expect(result.summary.ruleErrors).toEqual([]);
  });
  it.each(ported.map((r) => [r.id] as const))("%s", (id) => {
    if (exp.skipRules?.[id]) return;
    const expected = [...(exp.findings[id] ?? [])].sort();
    const actual = [...(ours[id] ?? [])].sort();
    expectedCounts.set(id, (expectedCounts.get(id) ?? 0) + expected.length);
    expect(actual).toEqual(expected);
  });
  it("has every rule Tabular Editor fired ported", () => {
    const missing = Object.keys(exp.findings).filter(
      (id) => !ported.some((r) => r.id === id) && !exp.skipRules?.[id],
    );
    expect(missing).toEqual([]);
  });
});

// Vitest runs a file's blocks in order, so the describe.each counts above are complete here.
describe("parity coverage", () => {
  it("has fixture findings for every ported rule except the unit-tested five", () => {
    const untested = [...expectedCounts]
      .filter(([, n]) => n === 0)
      .map(([id]) => id)
      .sort();
    // These five cannot fire on a fixture Tabular Editor also reports on (they need a model state
    // TMDL cannot express, or characters the fixtures deliberately keep out), so each has a unit
    // test instead: see rules-naming.test.ts and rules-measures.test.ts.
    expect(untested).toEqual([
      "AVOID_INVALID_DESCRIPTION_CHARACTERS",
      "AVOID_INVALID_NAME_CHARACTERS",
      "EXPRESSION_RELIANT_OBJECTS_MUST_HAVE_AN_EXPRESSION",
      "REMOVE_DATA_SOURCES_NOT_REFERENCED_BY_ANY_PARTITIONS",
      "SPECIAL_CHARS_IN_OBJECT_NAMES",
    ]);
  });
});
