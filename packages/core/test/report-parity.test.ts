import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { lint } from "../src/engine/lint.js";
import { INSPECTOR_RULES } from "../src/rules/pbi-inspector/inspector-rules.data.js";
import { defaultRules } from "../src/rules/index.js";
import { readProjectFiles } from "./helpers.js";

interface OracleResult {
  pass: boolean;
  actual: unknown;
}
interface Expectation {
  name: string;
  fixture: string;
  report: string;
  deviations: Record<string, string>;
  ours: Record<string, string[]>;
  native: Record<string, string[]>;
  results: Record<string, Record<string, OracleResult>>;
}

/** Rules the ruleset has that no task has ported yet; Tasks 16 and 17 empty it and Task 17 deletes it. */
const NOT_YET_PORTED = new Set([
  "AVOID_SHOW_ITEMS_WITH_NO_DATA",
  "ENSURE_THEME_COLOURS",
  "ENSURE_ALTTEXT",
]);

const repoRoot = new URL("../../../", import.meta.url).pathname;
const expectationsDir = repoRoot + "tests/expectations/";
const expectations: Expectation[] = readdirSync(expectationsDir)
  .filter((f) => f.endsWith(".report.json"))
  .map((f) => ({
    name: f.replace(/\.report\.json$/, ""),
    ...(JSON.parse(readFileSync(expectationsDir + f, "utf8")) as Omit<Expectation, "name">),
  }));

const ported = defaultRules.filter((r) => r.status === "ported" && r.layer === "report");

/** What the oracle says fails, as object ids: a list rule's names, a count rule's page (or `report`). */
export function oracleIds(pages: Record<string, OracleResult> | undefined): string[] {
  if (!pages) return [];
  return Object.entries(pages)
    .filter(([, r]) => !r.pass)
    .flatMap(([page, r]) => (Array.isArray(r.actual) ? (r.actual as string[]) : [page]))
    .sort();
}

describe.each(expectations)("parity with fab-inspector: $name", (exp) => {
  const files = readProjectFiles(repoRoot + exp.fixture);
  const result = lint([...files.model, ...files.report], { config: { failOn: "none" } });
  const ours: Record<string, string[]> = {};
  for (const f of result.findings) (ours[f.ruleId] ??= []).push(f.objectId ?? f.objectName);

  it("reads both parts without parse issues or rule errors", () => {
    expect(files.report.length).toBeGreaterThan(0);
    expect(result.findings.filter((f) => f.ruleId === "PARSE_ISSUE")).toEqual([]);
    expect(result.summary.ruleErrors).toEqual([]);
  });
  it.each(ported.map((r) => [r.id] as const))("%s", (id) => {
    const expected =
      exp.deviations[id] !== undefined
        ? [...(exp.ours[id] ?? [])].sort()
        : oracleIds(exp.results[id]);
    expect([...(ours[id] ?? [])].sort()).toEqual(expected);
  });
  it("has every rule the oracle failed ported, or listed as not yet ported", () => {
    const failed = Object.entries(exp.results)
      .filter(([, pages]) => Object.values(pages).some((r) => !r.pass))
      .map(([id]) => id);
    const missing = failed.filter(
      (id) => !ported.some((r) => r.id === id) && !NOT_YET_PORTED.has(id),
    );
    expect(missing).toEqual([]);
  });
  it("shows the difference each deviation names, and names only ported rules", () => {
    for (const id of Object.keys(exp.deviations)) {
      expect(
        INSPECTOR_RULES.some((r) => r.id === id),
        id,
      ).toBe(true);
      expect(exp.ours[id], `${id}: ours`).toBeDefined();
      // A deviation with no visible difference on this fixture is either unneeded here or wrong.
      expect(
        [...exp.ours[id]!].sort(),
        `${id}: ours must differ from the oracle on ${exp.name}`,
      ).not.toEqual(oracleIds(exp.results[id]));
    }
  });
});

describe("report parity coverage", () => {
  it("fires every ported report rule on at least one fixture", () => {
    const fired = new Set<string>();
    for (const exp of expectations)
      for (const id of Object.keys(exp.results))
        if (oracleIds(exp.results[id]).length || (exp.ours[id] ?? []).length) fired.add(id);
    const silent = ported.map((r) => r.id).filter((id) => !fired.has(id));
    expect(silent).toEqual([]);
  });
});
