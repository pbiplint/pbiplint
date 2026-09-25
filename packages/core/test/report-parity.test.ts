import { existsSync, readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { PbiplintConfig } from "../src/engine/config.js";
import { lint } from "../src/engine/lint.js";
import { INSPECTOR_RULES } from "../src/rules/pbi-inspector/inspector-rules.data.js";
import { defaultRules } from "../src/rules/index.js";
import { readProjectFiles } from "./helpers.js";

interface OracleResult {
  pass: boolean;
  actual: unknown;
}
/**
 * A fixture's report findings: `results` is fab-inspector's output, the oracle for the ported
 * rules, and `ours` holds pbiplint's side of each deviation.
 */
interface Expectation {
  name: string;
  fixture: string;
  report: string;
  deviations: Record<string, string>;
  ours: Record<string, string[]>;
  native: Record<string, string[]>;
  results: Record<string, Record<string, OracleResult>>;
}

const repoRoot = new URL("../../../", import.meta.url).pathname;
const expectationsDir = repoRoot + "tests/expectations/";
const expectations: Expectation[] = readdirSync(expectationsDir)
  .filter((f) => f.endsWith(".report.json"))
  .map((f) => ({
    name: f.replace(/\.report\.json$/, ""),
    ...(JSON.parse(readFileSync(expectationsDir + f, "utf8")) as Omit<Expectation, "name">),
  }));

const ported = defaultRules.filter((r) => r.status === "ported" && r.layer === "report");
const native = defaultRules.filter((r) => r.status === "builtin" && r.id !== "PARSE_ISSUE");

/**
 * The pbiplint.config.json at the fixture's root, or no settings. Only that one file is read:
 * unlike the CLI's search, which walks up from the project, the harness never reads a config above
 * the fixture. The sample needs its config: a policy rule such as FILTERS_PANE_STATE reports only
 * under a policy.
 */
function fixtureConfig(fixture: string): PbiplintConfig {
  const path = repoRoot + fixture + "/pbiplint.config.json";
  return existsSync(path) ? (JSON.parse(readFileSync(path, "utf8")) as PbiplintConfig) : {};
}

/** One lint per fixture, shared by the parity and native checks: the files, the run, and its ids per rule. */
const runs = new Map(
  expectations.map((exp) => {
    const files = readProjectFiles(repoRoot + exp.fixture);
    const result = lint([...files.model, ...files.report], {
      config: { ...fixtureConfig(exp.fixture), failOn: "none" },
    });
    const ours: Record<string, string[]> = {};
    for (const f of result.findings) (ours[f.ruleId] ??= []).push(f.objectId ?? f.objectName);
    return [exp.name, { files, result, ours }] as const;
  }),
);

/** What the oracle says fails, as object ids: a list rule's names, a count rule's page (or `report`). */
export function oracleIds(pages: Record<string, OracleResult> | undefined): string[] {
  if (!pages) return [];
  return Object.entries(pages)
    .filter(([, r]) => !r.pass)
    .flatMap(([page, r]) => (Array.isArray(r.actual) ? (r.actual as string[]) : [page]))
    .sort();
}

/** The ids a ported rule must report on a fixture: `ours` for a deviating rule, else the oracle's. */
function expectedIds(exp: Expectation, id: string): string[] {
  return exp.deviations[id] !== undefined
    ? [...(exp.ours[id] ?? [])].sort()
    : oracleIds(exp.results[id]);
}

describe.each(expectations)("parity with fab-inspector: $name", (exp) => {
  const { files, result, ours } = runs.get(exp.name)!;

  /**
   * The fixture's report was read, nothing in either part failed to parse or threw in a rule, and
   * every rule its config names exists, since a misspelt id would otherwise be ignored.
   */
  it("reads both parts without parse issues or rule errors", () => {
    expect(files.report.length).toBeGreaterThan(0);
    expect(result.findings.filter((f) => f.ruleId === "PARSE_ISSUE")).toEqual([]);
    expect(result.summary.ruleErrors).toEqual([]);
    expect(result.summary.unknownRules).toEqual([]);
  });
  it.each(ported.map((r) => [r.id] as const))("%s", (id) => {
    expect([...(ours[id] ?? [])].sort()).toEqual(expectedIds(exp, id));
  });
  it("has every rule the oracle failed ported", () => {
    const failed = Object.entries(exp.results)
      .filter(([, pages]) => Object.values(pages).some((r) => !r.pass))
      .map(([id]) => id);
    const missing = failed.filter((id) => !ported.some((r) => r.id === id));
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

/** Every expectation is captured from fab-inspector, so each fixture, the sample too, is a witness. */
describe("report parity coverage", () => {
  it("fires every ported report rule on at least one oracle fixture", () => {
    const fired = new Set<string>();
    for (const exp of expectations)
      for (const id of Object.keys(exp.results))
        if (oracleIds(exp.results[id]).length || (exp.ours[id] ?? []).length) fired.add(id);
    const silent = ported.map((r) => r.id).filter((id) => !fired.has(id));
    expect(silent).toEqual([]);
  });
});

/**
 * Native rules have no oracle, so each fixture's `native` map lists by name every native finding
 * it produces, and any other fails: the quiet check (spec section 10), run on every fixture.
 */
describe.each(expectations)("native rules on $name", (exp) => {
  const { ours } = runs.get(exp.name)!;
  it.each(native.map((r) => [r.id] as const))("%s", (id) => {
    expect([...(ours[id] ?? [])].sort()).toEqual([...(exp.native[id] ?? [])].sort());
  });
});

describe("native expectations", () => {
  it("name only native rules in every native map", () => {
    const ids = new Set(native.map((r) => r.id));
    for (const exp of expectations)
      expect(
        Object.keys(exp.native).filter((id) => !ids.has(id)),
        exp.name,
      ).toEqual([]);
  });
});

/**
 * The sample plants every report rule (spec section 11), so each native and each ported report
 * rule has a non-empty list in its expectation: the native map for a native rule, the oracle's ids
 * for a ported one, or `ours` for a deviating one. The checks above hold the run to those lists.
 */
describe("the sample", () => {
  const sample = expectations.find((exp) => exp.name === "messy-sales");
  it("fires every native rule and every ported report rule", () => {
    expect(sample, "tests/expectations/messy-sales.report.json").toBeDefined();
    for (const r of native) expect(sample!.native[r.id]?.length, r.id).toBeGreaterThan(0);
    for (const r of ported) expect(expectedIds(sample!, r.id).length, r.id).toBeGreaterThan(0);
  });
});
