// Microsoft's ruleset run as custom rules gives Tabular Editor's results on every captured fixture
// (spec section 11). Runs in every pull request's CI; the survey's other 45 files are held to their
// captures in the Survey parity workflow (custom-te-survey.test.ts).
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { beforeAll, describe, expect, it } from "vitest";
import { readCustomRules } from "@pbiplint/core/custom-rules";
import { runTeRules, STATISTICS_REASON, TOO_DEEP_REASON } from "../src/custom-rules/te/index.js";
import { lint, type LintResult } from "../src/engine/lint.js";
import { defaultRules } from "../src/rules/index.js";
import { isFailureOf, RULE_COULD_NOT_FINISH } from "../src/rules/rule-could-not-finish.js";
import { modelFrom, readModelFiles } from "./helpers.js";
import {
  MICROSOFT_FILE,
  PARITY_FIXTURES,
  expectPairedDeviations,
  expectRule,
  expectSaid,
  fixtureModel,
  ignoreAnnotations,
  leftOutForAnnotation,
  readMicrosoftCapture,
  readSurveyCapture,
  readsStatistics,
  repo,
} from "./custom-te-parity.js";

const RULES_PATH = `${repo}tests/rules/microsoft/BPARules.json`;
const RULES_SHA256 = "ddb9cff4c2a0611a6467e2559d38319d9867381998066473ffa1e11c2d360392";
const rulesText = readFileSync(RULES_PATH, "utf8");

describe("runTeRules", () => {
  const model = modelFrom(
    ["model Model", "", "table Sales", "\tmeasure Total = 1", "\tmeasure Other = 2", ""].join("\n"),
  );

  it("runs each rule of the file on the model, in file order", () => {
    const run = runTeRules(
      JSON.stringify([
        { ID: "B", Scope: "Measure", Expression: 'Name == "Total"' },
        { ID: "A", Scope: "Table", Expression: "Measures.Count == 2" },
      ]),
      model,
    );
    if ("error" in run) throw new Error(run.error);
    expect(run.results.map((r) => [r.rule.id, r.outcome.kind])).toEqual([
      ["B", "findings"],
      ["A", "findings"],
    ]);
    expect(
      run.results.map(
        (r) => r.outcome.kind === "findings" && r.outcome.objects.map((o) => o.teName),
      ),
    ).toEqual([["[Total]"], ["'Sales'"]]);
    expect(run.problems).toEqual([]);
  });

  it("gives a rule whose expression does not parse as one that could not run, with the parser's reason", () => {
    const run = runTeRules(
      JSON.stringify([
        { ID: "BAD", Scope: "Measure", Expression: "Name ==" },
        { ID: "GOOD", Scope: "Measure", Expression: "true" },
      ]),
      model,
    );
    if ("error" in run) throw new Error(run.error);
    expect(run.results[0]!.outcome.kind).toBe("could-not-run");
    expect(
      run.results[0]!.outcome.kind === "could-not-run" && run.results[0]!.outcome.reason,
    ).not.toBe("");
    expect(run.results[1]!.outcome.kind).toBe("findings");
  });

  it("gives a rule chained too long to run as one that could not run, and runs the rest", () => {
    // 9,990 terms fit the 20,000 character limit and run out of stack in every engine pbiplint
    // runs in; how few terms do depends on the engine's stack.
    const grown = `"aaaaaaaaaa"${'.Replace("a", "aaaaaaaaaa")'.repeat(9)}.Length > 0`;
    const run = runTeRules(
      JSON.stringify([
        { ID: "LONG", Scope: "Measure", Expression: `${Array(9990).fill("1").join("+")} > 0` },
        { ID: "GROWN", Scope: "Measure", Expression: grown },
        { ID: "GOOD", Scope: "Measure", Expression: 'Name == "Total"' },
      ]),
      model,
    );
    if ("error" in run) throw new Error(run.error);
    expect(run.results[0]!.outcome).toEqual({
      kind: "could-not-run",
      reason: TOO_DEEP_REASON,
    });
    expect(TOO_DEEP_REASON).toBe(
      "the expression is too deeply chained to run; split it into smaller rules",
    );
    const grownOutcome = run.results[1]!.outcome;
    expect(grownOutcome.kind === "could-not-run" && grownOutcome.reason).toContain(
      "reached the evaluation limit",
    );
    const good = run.results[2]!.outcome;
    expect(good.kind === "findings" && good.objects.map((o) => o.teName)).toEqual(["[Total]"]);
  });

  it("passes on the rules it could not read, and refuses a file that is not a rule file", () => {
    const run = runTeRules(JSON.stringify([{ ID: "NO_SCOPE", Expression: "true" }]), model);
    if ("error" in run) throw new Error(run.error);
    expect(run.results).toEqual([]);
    expect(run.problems.map((p) => p.id)).toEqual(["NO_SCOPE"]);
    expect(runTeRules('{"not": "rules"}', model)).toHaveProperty("error");
  });
});

describe("Microsoft's ruleset as custom rules", () => {
  it("is the file the captures ran, byte for byte", () => {
    expect(createHash("sha256").update(readFileSync(RULES_PATH)).digest("hex")).toBe(RULES_SHA256);
  });

  for (const fixture of PARITY_FIXTURES) {
    describe(fixture.name, () => {
      const capture = readMicrosoftCapture(fixture.microsoftPath);
      const { custom } = readSurveyCapture(fixture.surveyPath);
      const run = runTeRules(rulesText, fixtureModel(capture));
      if ("error" in run) throw new Error(run.error);
      // The annotated fixtures carry Tabular Editor's ignore annotation. pbiplint applies it in the
      // engine (engine/ignore.ts), which runTeRules does not reach, so a rule the annotation names,
      // or one Tabular Editor failed on it, is left out here: the annotation alone explains it.
      const ignored = fixture.annotated ? ignoreAnnotations(fixture.name) : undefined;

      it("reads all 71 rules", () => {
        expect(run.results).toHaveLength(71);
        expect(run.problems).toEqual([]);
      });

      for (const { rule, outcome } of run.results) {
        if (leftOutForAnnotation(ignored, rule, capture.ruleErrors?.[rule.id] !== undefined))
          continue;
        it(rule.id, () => {
          if (readsStatistics(rule.expression)) {
            // Tabular Editor reads null with no statistics and passes; pbiplint says it cannot run.
            expect(capture.findings[rule.id], "Tabular Editor found nothing").toBeUndefined();
            expect(outcome.kind).toBe("could-not-run");
            expect(outcome.kind === "could-not-run" && outcome.reason).toContain(STATISTICS_REASON);
            return;
          }
          const want =
            capture.ruleErrors?.[rule.id] !== undefined
              ? "could-not-run"
              : [...(capture.findings[rule.id] ?? [])].sort();
          expectRule(`${fixture.name} ${rule.id}`, outcome, want, custom, MICROSOFT_FILE, rule.id);
        });
      }

      it("records deviations only for Microsoft's rules, each with pbiplint's objects", () => {
        expectPairedDeviations(fixture.name, custom);
        const ids = new Set(run.results.map((r) => r.rule.id));
        for (const id of Object.keys(custom?.deviations?.[MICROSOFT_FILE] ?? {}))
          expect(ids.has(id), `${id} is a rule of Microsoft's file`).toBe(true);
      });

      it("finds nothing Tabular Editor has no rule for", () => {
        const ids = new Set(run.results.map((r) => r.rule.id));
        for (const id of Object.keys(capture.findings)) expect(ids.has(id), id).toBe(true);
      });
    });
  }
});

// The same file through the engine, as a project's config names it: there the engine applies Tabular
// Editor's ignore annotation, so on the annotated fixtures every rule is compared, none left out.
// Only RULE_COULD_NOT_FINISH of pbiplint's own rules runs, so none of the file's rules that share an
// id with one of pbiplint's is set aside for it (the interim in engine/lint.ts sets a custom rule
// aside only for a built-in rule in the run).
describe("Microsoft's ruleset as custom rules, through the engine", () => {
  const RULE_FILE = "rules/BPARules.json";
  const builtInIds = new Set(defaultRules.map((r) => r.id.toUpperCase()));

  for (const fixture of PARITY_FIXTURES.filter((f) => f.annotated)) {
    describe(fixture.name, () => {
      const capture = readMicrosoftCapture(fixture.microsoftPath);
      const { custom } = readSurveyCapture(fixture.surveyPath);
      const set = readCustomRules([{ path: RULE_FILE, text: rulesText }]);
      let result: LintResult;
      const ours: Record<string, string[]> = {};
      beforeAll(async () => {
        result = await lint(readModelFiles(`${repo}${capture.fixture}`), {
          rules: [RULE_COULD_NOT_FINISH],
          customRules: set,
          config: { failOn: "none" },
        });
        for (const f of result.findings) (ours[f.ruleId] ??= []).push(f.objectName);
      });

      it("runs all 71 rules, those sharing an id with pbiplint's rules among them", () => {
        expect(set.rules).toHaveLength(71);
        expect(set.notices).toEqual([]);
        expect(set.rules.filter((r) => builtInIds.has(r.id.toUpperCase())).length).toBeGreaterThan(
          20,
        );
        expect(result.summary.rulesRun).toBe(72);
        expect(result.summary.rulesSkipped).toEqual([]);
        expect(result.summary.customRules).toEqual([
          {
            file: RULE_FILE,
            rules: set.rules.map((r) => r.id),
            asBuiltIn: [],
            replaced: [],
            notRun: set.rules.filter((r) => readsStatistics(r.custom!.expression)).map((r) => r.id),
          },
        ]);
        expect(result.diagnostics.filter((d) => d.kind === "custom-rules")).toEqual([]);
      });

      for (const rule of set.rules) {
        it(rule.id, () => {
          const failures = result.findings.filter(
            (f) => f.ruleId === RULE_COULD_NOT_FINISH.id && isFailureOf(f, rule.id),
          );
          if (readsStatistics(rule.custom!.expression)) {
            // Tabular Editor reads null with no statistics and passes; pbiplint says it cannot run.
            expect(capture.findings[rule.id], "Tabular Editor found nothing").toBeUndefined();
            expect(ours[rule.id]).toBeUndefined();
            expect(failures).toHaveLength(1);
            expect(failures[0]!.detail).toContain(`${RULE_FILE}: `);
            expect(failures[0]!.detail).toContain(STATISTICS_REASON);
            return;
          }
          expect(failures, `${rule.id} ran to the end`).toEqual([]);
          const want =
            capture.ruleErrors?.[rule.id] !== undefined
              ? "could-not-run"
              : [...(capture.findings[rule.id] ?? [])].sort();
          const got = [...(ours[rule.id] ?? [])].sort();
          expectSaid(`${fixture.name} ${rule.id}`, got, want, custom, MICROSOFT_FILE, rule.id);
        });
      }

      it("finds nothing but the file's rules and a failure for each statistics rule", () => {
        const ids = new Set([...set.rules.map((r) => r.id), RULE_COULD_NOT_FINISH.id]);
        for (const id of Object.keys(ours)) expect(ids.has(id), id).toBe(true);
        const statistics = set.rules.filter((r) => readsStatistics(r.custom!.expression));
        expect(ours[RULE_COULD_NOT_FINISH.id] ?? []).toHaveLength(statistics.length);
        expect(result.summary.ruleErrors.map((e) => e.id)).toEqual(statistics.map((r) => r.id));
        for (const e of result.summary.ruleErrors) expect(e.ruleFile).toBe(RULE_FILE);
      });
    });
  }
});
