import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { lint } from "../src/engine/lint.js";
import { defaultRules } from "../src/rules/index.js";
import { readModelFiles } from "./helpers.js";

/**
 * A fixture's model findings: `findings` is Tabular Editor's output, the oracle for the ported
 * rules, and `ours` holds pbiplint's side of each deviation, a difference `deviations` says is on
 * purpose. A rule whose fixture shows two deviations at once names each in a sentence of its own.
 */
interface Expectation {
  name: string;
  fixture: string;
  skipRules?: Record<string, string>;
  deviations?: Record<string, string | string[]>;
  ours?: Record<string, string[]>;
  findings: Record<string, string[]>;
}

const repoRoot = new URL("../../../", import.meta.url).pathname;
const expectationsDir = repoRoot + "tests/expectations/";
const expectations: Expectation[] = readdirSync(expectationsDir)
  .filter((f) => f.endsWith(".json") && !f.endsWith(".report.json"))
  .map((f) => ({
    name: f.replace(/\.json$/, ""),
    ...(JSON.parse(readFileSync(expectationsDir + f, "utf8")) as Omit<Expectation, "name">),
  }));

const ported = defaultRules.filter((r) => r.status === "ported" && r.layer === "model");
const expectedCounts = new Map<string, number>(ported.map((r) => [r.id, 0]));

/** The names a ported rule must report on a fixture: `ours` for a deviating rule, else the oracle's. */
function expectedNames(exp: Expectation, id: string): string[] {
  return exp.deviations?.[id] !== undefined
    ? [...(exp.ours?.[id] ?? [])].sort()
    : [...(exp.findings[id] ?? [])].sort();
}

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
    const expected = expectedNames(exp, id);
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
  it("shows the difference each deviation names, and names only ported rules", () => {
    for (const id of Object.keys(exp.deviations ?? {})) {
      expect(
        ported.some((r) => r.id === id),
        id,
      ).toBe(true);
      expect(exp.ours?.[id], `${id}: ours`).toBeDefined();
      // A deviation with no visible difference on this fixture is either unneeded here or wrong.
      expect(
        [...exp.ours![id]!].sort(),
        `${id}: ours must differ from the oracle on ${exp.name}`,
      ).not.toEqual([...(exp.findings[id] ?? [])].sort());
    }
    expect(Object.keys(exp.ours ?? {}).filter((id) => exp.deviations?.[id] === undefined)).toEqual(
      [],
    );
  });
});

// Vitest runs a file's blocks in order, so the describe.each counts above are complete here.
describe("parity coverage", () => {
  it("has fixture findings for every ported rule except the unit-tested five", () => {
    const untested = [...expectedCounts]
      .filter(([, n]) => n === 0)
      .map(([id]) => id)
      .sort();
    // These five cannot fire on a fixture Tabular Editor also reports on, because the fixtures
    // deliberately keep out the control characters, the empty declaration, and the unreferenced
    // data source those rules need. Each has a unit test instead: see rules-naming.test.ts and
    // rules-measures.test.ts.
    expect(untested).toEqual([
      "AVOID_INVALID_DESCRIPTION_CHARACTERS",
      "AVOID_INVALID_NAME_CHARACTERS",
      "EXPRESSION_RELIANT_OBJECTS_MUST_HAVE_AN_EXPRESSION",
      "REMOVE_DATA_SOURCES_NOT_REFERENCED_BY_ANY_PARTITIONS",
      "SPECIAL_CHARS_IN_OBJECT_NAMES",
    ]);
  });
});
