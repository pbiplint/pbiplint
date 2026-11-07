import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath, URL } from "node:url";
import { describe, expect, it } from "vitest";
import { ruleIdsOf } from "../te-expectations.mjs";

// What Tabular Editor CLI 0.7.1.2 captured. That build stops working after October 31, 2026, so a
// missing or partial capture cannot be made again without a licensed build (docs/RELEASING.md).
const dir = fileURLToPath(new URL("../../tests/expectations/", import.meta.url));
const read = (path) => JSON.parse(readFileSync(join(dir, path), "utf8"));
/** The model fixtures with a capture in `sub`, by name. */
const names = (sub) =>
  readdirSync(join(dir, sub))
    .filter((f) => f.endsWith(".json") && !f.endsWith(".report.json") && f !== "files.json")
    .map((f) => f.slice(0, -".json".length))
    .sort();
/** Whether `value` is a plain object: not null, and not an array. */
const isObject = (value) => typeof value === "object" && value !== null && !Array.isArray(value);

// The model fixtures captured three ways with te 0.7.1.2 before October 31, 2026, by name. A
// fixture whose captures are made before October 31, 2026 is added here. A fixture
// added later has only its Microsoft capture and is not listed. A listed fixture keeps its captures
// as they are after that date: a change to it needs every listed fixture re-captured three ways
// with one licensed build (docs/RELEASING.md).
const CAPTURED = [
  "data-sources",
  "kitchen-sink",
  "m-zoo",
  "messy-sales",
  "rule-zoo",
  "te3-zoo",
  "tvw-baseline",
  "udf-sales",
  "untyped-columns",
];

// The oracle each kind of capture names. A re-capture with another build changes them here.
const MICROSOFT_ORACLE =
  "Tabular Editor CLI 0.7.1.2 with BPARules.json sha256 ddb9cff4c2a0611a6467e2559d38319d9867381998066473ffa1e11c2d360392";
const BUILT_IN_ORACLE = "Tabular Editor CLI 0.7.1.2 built-in rules";
const SURVEY_ORACLE =
  "Tabular Editor CLI 0.7.1.2, each rule file in tests/expectations/survey/files.json at its commit";

// Microsoft's ruleset as the survey lists it: the file every Microsoft capture runs.
const MICROSOFT_FILE = "microsoft/Analysis-Services/BestPracticeRules/BPARules.json";

describe("the survey's rule files", () => {
  const { files } = read("survey/files.json");
  it("lists the 46 distinct files once each, by id and by sha256", () => {
    expect(files).toHaveLength(46);
    expect(new Set(files.map((f) => f.id)).size).toBe(46);
    expect(new Set(files.map((f) => f.sha256)).size).toBe(46);
  });
  it("pins each file to a commit and a sha256, under an id made of its repository and path", () => {
    for (const f of files) {
      expect(f.id).toBe(`${f.repository}/${f.path}`);
      expect(f.commit, f.id).toMatch(/^[0-9a-f]{40}$/);
      expect(f.sha256, f.id).toMatch(/^[0-9a-f]{64}$/);
      expect(Number.isInteger(f.rules), f.id).toBe(true);
    }
  });
  it("records the 66 places the survey found them", () => {
    expect(files.reduce((n, f) => n + 1 + f.alsoAt.length, 0)).toBe(66);
  });
});

describe("the captures", () => {
  const { files } = read("survey/files.json");
  const ids = files.map((f) => f.id).sort();
  it("hold Microsoft's ruleset, Tabular Editor 3's built-in rules, and the survey's files for exactly the captured fixtures", () => {
    expect(names("te3")).toEqual(CAPTURED);
    expect(names("survey")).toEqual(CAPTURED);
    expect(names("")).toEqual(expect.arrayContaining(CAPTURED));
  });
  it.each(CAPTURED)("%s: all three come from te 0.7.1.2, on the same fixture", (name) => {
    const ms = read(`${name}.json`);
    const te3 = read(`te3/${name}.json`);
    const survey = read(`survey/${name}.json`);
    expect(te3.fixture).toBe(ms.fixture);
    expect(survey.fixture).toBe(ms.fixture);
    expect(ms.oracle).toBe(MICROSOFT_ORACLE);
    expect(te3.oracle).toBe(BUILT_IN_ORACLE);
    expect(survey.oracle).toBe(SURVEY_ORACLE);
  });
  it.each(CAPTURED)(
    "%s: the survey capture has findings, an error, or a note that GitHub no longer has it, for every listed file, and at most one error",
    (name) => {
      const { results } = read(`survey/${name}.json`);
      expect(Object.keys(results).sort()).toEqual(ids);
      for (const [id, result] of Object.entries(results)) {
        if ("error" in result || "unavailable" in result) {
          const [key] = Object.keys(result);
          expect(Object.keys(result), id).toEqual([key]);
          expect(typeof result[key], id).toBe("string");
          expect(result[key].length, id).toBeGreaterThan(0);
        } else {
          expect(Object.keys(result).sort(), id).toEqual(["findings", "ruleErrors"]);
          expect(isObject(result.findings), id).toBe(true);
          expect(isObject(result.ruleErrors), id).toBe(true);
        }
      }
      expect(Object.values(results).filter((r) => "error" in r).length).toBeLessThanOrEqual(1);
    },
  );
  it.each(CAPTURED)(
    "%s: the survey's copy of Microsoft's ruleset finds what the Microsoft capture finds",
    (name) => {
      const { results } = read(`survey/${name}.json`);
      expect(results[MICROSOFT_FILE]).toEqual({
        findings: read(`${name}.json`).findings,
        ruleErrors: {},
      });
    },
  );
  it.each(CAPTURED)("%s: the built-in capture has findings", (name) => {
    expect(isObject(read(`te3/${name}.json`).findings)).toBe(true);
  });
});

// The fixtures for the Tabular Editor behaviour custom rules depend on (#118), captured four ways
// with te 0.8.1.1, whose preview stops working after December 31, 2026. They live under
// custom-rules/ so the parity tests, which read every capture in tests/expectations/, te3/ and
// survey/, do not hold pbiplint's rules to them yet: both carry Tabular Editor's ignore annotation.
const CAPTURED_0_8 = ["custom-rules", "custom-rules-model-ignore"];
const MICROSOFT_ORACLE_0_8 =
  "Tabular Editor CLI 0.8.1.1 with BPARules.json sha256 ddb9cff4c2a0611a6467e2559d38319d9867381998066473ffa1e11c2d360392";
const BUILT_IN_ORACLE_0_8 = "Tabular Editor CLI 0.8.1.1 built-in rules";
const SURVEY_ORACLE_0_8 =
  "Tabular Editor CLI 0.8.1.1, each rule file in tests/expectations/survey/files.json at its commit";
const PROBES_ORACLE_0_8 =
  "Tabular Editor CLI 0.8.1.1, each probe rule file in tests/rules/te-probes";

describe("the custom rules captures", () => {
  const { files } = read("survey/files.json");
  const ids = files.map((f) => f.id).sort();
  const probesDir = fileURLToPath(new URL("../../tests/rules/te-probes/", import.meta.url));
  const probeFiles = readdirSync(probesDir)
    .filter((f) => f.endsWith(".json"))
    .sort();
  const sub = (name) => `custom-rules/${name}`;

  it("hold all four kinds for exactly these fixtures", () => {
    for (const kind of ["", "te3/", "survey/", "probes/"])
      expect(
        readdirSync(join(dir, "custom-rules", kind))
          .filter((f) => f.endsWith(".json"))
          .map((f) => f.slice(0, -".json".length))
          .sort(),
        kind,
      ).toEqual(CAPTURED_0_8);
  });
  it.each(CAPTURED_0_8)("%s: all four come from te 0.8.1.1, on the same fixture", (name) => {
    const ms = read(`${sub(name)}.json`);
    expect(ms.fixture).toBe(`tests/fixtures/${name}.SemanticModel`);
    expect(ms.oracle).toBe(MICROSOFT_ORACLE_0_8);
    expect(read(`custom-rules/te3/${name}.json`)).toMatchObject({
      fixture: ms.fixture,
      oracle: BUILT_IN_ORACLE_0_8,
    });
    expect(read(`custom-rules/survey/${name}.json`)).toMatchObject({
      fixture: ms.fixture,
      oracle: SURVEY_ORACLE_0_8,
    });
    expect(read(`custom-rules/probes/${name}.json`)).toMatchObject({
      fixture: ms.fixture,
      oracle: PROBES_ORACLE_0_8,
    });
  });
  it.each(CAPTURED_0_8)(
    "%s: the survey capture covers every listed file, at most one with an error, and its copy of Microsoft's ruleset finds what the Microsoft capture finds",
    (name) => {
      const { results } = read(`custom-rules/survey/${name}.json`);
      expect(Object.keys(results).sort()).toEqual(ids);
      expect(Object.values(results).filter((r) => "error" in r).length).toBeLessThanOrEqual(1);
      // custom-rules has a malformed ignore annotation, so its Microsoft capture has rule errors.
      const ms = read(`${sub(name)}.json`);
      expect(results[MICROSOFT_FILE]).toEqual({
        findings: ms.findings,
        ruleErrors: ms.ruleErrors ?? {},
      });
    },
  );
  it.each(CAPTURED_0_8)(
    "%s: the probe capture names every probe file at its current sha256, and places every rule of each file te read",
    (name) => {
      const { results } = read(`custom-rules/probes/${name}.json`);
      expect(Object.keys(results).sort()).toEqual(probeFiles);
      for (const file of probeFiles) {
        const body = readFileSync(join(probesDir, file));
        const result = results[file];
        expect(result.sha256, file).toBe(createHash("sha256").update(body).digest("hex"));
        if ("error" in result) continue;
        const placed = new Set([
          ...Object.keys(result.findings),
          ...Object.keys(result.ruleErrors),
          ...result.quiet,
        ]);
        expect(
          [...new Set(ruleIdsOf(body.toString("utf8")))].filter((id) => !placed.has(id)),
          file,
        ).toEqual([]);
        expect(Object.keys(result.severities).sort(), file).toEqual(
          Object.keys(result.findings).sort(),
        );
      }
    },
  );
});
