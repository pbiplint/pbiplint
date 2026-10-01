import { Buffer } from "node:buffer";
import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath, URL } from "node:url";
import { describe, expect, it } from "vitest";
import { tempDir } from "../../tests/support/temp-dir.js";
import {
  checkSha256,
  convertFindings,
  parseTeVersion,
  surveyResult,
  teError,
  teJson,
} from "../te-expectations.mjs";

const script = fileURLToPath(new URL("../te-expectations.mjs", import.meta.url));

/** One entry of te 0.7's `bpa run` findings array. */
const finding = (code, object, objectType = "Column") => ({
  severity: "warning",
  source: "bpa",
  code,
  message: "A message.",
  object,
  objectType,
});

/** te's error for a rule file it cannot read, as it printed it for a report-rules file. */
const unreadable = [
  "Warning: Early preview expires in 30 day(s), on 2026-10-31.",
  "Warning: Failed to parse BPA rules as array: Requested value 'CustomVisual' was not found.",
  "Error: Could not parse BPA rules. Expected JSON array or object with 'rules' array.",
  "",
].join("\n");

describe("convertFindings", () => {
  it("files each object under its rule, with the rules and each rule's objects sorted", () => {
    const out = convertFindings({
      findings: [
        finding("B_RULE", "'Sales'[b]"),
        finding("A_RULE", "Model", "Model"),
        finding("B_RULE", "'Sales'[a]"),
      ],
    });
    expect(out).toEqual({
      findings: { A_RULE: ["Model"], B_RULE: ["'Sales'[a]", "'Sales'[b]"] },
      ruleErrors: {},
    });
    expect(Object.keys(out.findings)).toEqual(["A_RULE", "B_RULE"]);
  });
  it("keeps an object as many times as te reports it", () => {
    const out = convertFindings({
      findings: [finding("R", "'Legacy'", "Table"), finding("R", "'Legacy'", "Table")],
    });
    expect(out.findings).toEqual({ R: ["'Legacy'", "'Legacy'"] });
  });
  it("records a rule te could not evaluate under ruleErrors, never as a finding", () => {
    const broken = {
      ...finding("BROKEN", "BROKEN", "BpaRule"),
      severity: "error",
      message: "Value cannot be null. (Parameter 'expression')",
    };
    expect(convertFindings({ findings: [broken, finding("OK", "'Sales'", "Table")] })).toEqual({
      findings: { OK: ["'Sales'"] },
      ruleErrors: { BROKEN: "Value cannot be null. (Parameter 'expression')" },
    });
  });
  it("refuses te 0.5's JSON, which has results in place of findings", () => {
    expect(() => convertFindings({ results: [] })).toThrow(
      "no findings array: this is not te 0.7's bpa run JSON",
    );
  });
});

describe("teJson", () => {
  it("reads the JSON object after any text te printed first", () => {
    expect(teJson('Warning: preview\n{"findings":[]}')).toEqual({ findings: [] });
  });
  it("throws when te printed no JSON", () => {
    expect(() => teJson("")).toThrow("te printed no JSON");
  });
});

describe("parseTeVersion", () => {
  it("finds the version line", () => {
    expect(parseTeVersion("0.7.1.2\n")).toBe("0.7.1.2");
  });
  it("throws when no line is a version", () => {
    expect(() => parseTeVersion("Warning: Early preview expires\n")).toThrow(
      "te --version printed no version",
    );
  });
});

describe("teError and surveyResult", () => {
  it("takes te's Error line, or its whole standard error when there is none", () => {
    expect(teError(unreadable)).toBe(
      "Could not parse BPA rules. Expected JSON array or object with 'rules' array.",
    );
    expect(teError("  something else  \n")).toBe("something else");
  });
  it("gives a rule file te could not read as an error", () => {
    expect(surveyResult({ status: 1, stdout: "", stderr: unreadable })).toEqual({
      error: "Could not parse BPA rules. Expected JSON array or object with 'rules' array.",
    });
  });
  it("gives a rule file te ran as its findings and rule errors", () => {
    const stdout = JSON.stringify({ findings: [finding("R", "'Sales'", "Table")] });
    expect(surveyResult({ status: 1, stdout, stderr: "" })).toEqual({
      findings: { R: ["'Sales'"] },
      ruleErrors: {},
    });
  });
});

describe("checkSha256", () => {
  // sha256 of the three bytes "foo"
  const foo = "2c26b46b68ffc68ff99b453c1d30413413422d706483bfa0f98a5e886266e7ae";
  it("passes data that matches", () => {
    expect(() => checkSha256(Buffer.from("foo"), foo, "x")).not.toThrow();
  });
  it("names the file and both checksums when the data does not match", () => {
    expect(() => checkSha256(Buffer.from("bar"), foo, "owner/repo/rules.json")).toThrow(
      /^owner\/repo\/rules\.json: sha256 [0-9a-f]{64}, expected 2c26b46b/,
    );
  });
});

describe("the command line", () => {
  const run = (args, cwd) =>
    spawnSync(process.execPath, [script, ...args], { encoding: "utf8", ...(cwd && { cwd }) });

  it("refuses no mode, two modes, or a mode without its file, before it runs anything", () => {
    for (const args of [[], ["--built-in", "--rules", "x.json"], ["--rules"], ["--survey"]]) {
      const r = run(["fixture", "out.json", ...args]);
      expect(r.status, args.join(" ")).toBe(2);
      expect(r.stderr).toMatch(/^usage: te-expectations/);
    }
  });
  it("converts a saved te output with --from, keeping skipRules, deviations, ours, and the oracle", () => {
    const dir = tempDir("te-expectations");
    const out = join(dir, "zoo.json");
    const saved = join(dir, "te.json");
    writeFileSync(
      out,
      JSON.stringify({
        fixture: "old",
        oracle: "Old oracle",
        captured: "2026-09-04",
        skipRules: { X: "Why it is skipped." },
        deviations: { B: "On purpose." },
        ours: { B: [] },
        findings: {},
      }),
    );
    writeFileSync(
      saved,
      `Warning: preview\n${JSON.stringify({ findings: [finding("B", "'T'[b]")] })}`,
    );
    const r = run(["fixture", out, "--from", saved], dir);
    expect(r.status, r.stderr).toBe(0);
    const written = JSON.parse(readFileSync(out, "utf8"));
    expect(Object.keys(written)).toEqual([
      "fixture",
      "oracle",
      "captured",
      "skipRules",
      "deviations",
      "ours",
      "findings",
    ]);
    expect(written).toEqual({
      fixture: "fixture",
      oracle: "Old oracle",
      captured: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
      skipRules: { X: "Why it is skipped." },
      deviations: { B: "On purpose." },
      ours: { B: [] },
      findings: { B: ["'T'[b]"] },
    });
  });
  it("names te 0.7.1.2 and Microsoft's ruleset when --from has no oracle to keep", () => {
    const dir = tempDir("te-expectations");
    const saved = join(dir, "te.json");
    writeFileSync(saved, JSON.stringify({ findings: [] }));
    const r = run(["fixture", join(dir, "new.json"), "--from", saved], dir);
    expect(r.status, r.stderr).toBe(0);
    expect(JSON.parse(readFileSync(join(dir, "new.json"), "utf8"))).toMatchObject({
      oracle:
        "Tabular Editor CLI 0.7.1.2 with BPARules.json sha256 ddb9cff4c2a0611a6467e2559d38319d9867381998066473ffa1e11c2d360392",
      skipRules: {},
      findings: {},
    });
  });
});
