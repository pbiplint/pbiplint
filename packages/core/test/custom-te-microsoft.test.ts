// Microsoft's ruleset run as custom rules gives Tabular Editor's results on every captured fixture
// (spec section 11). Runs in every pull request's CI; the survey's other 45 files are held to their
// captures in the Survey parity workflow (custom-te-survey.test.ts).
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { runTeRules, STATISTICS_REASON, TOO_DEEP_REASON } from "../src/custom-rules/te/index.js";
import { modelFrom } from "./helpers.js";
import {
  MICROSOFT_FILE,
  PARITY_FIXTURES,
  expectPairedDeviations,
  expectRule,
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
      // The annotated fixtures carry Tabular Editor's ignore annotation, which pbiplint reads from
      // pull request C on. Until then a rule the annotation names, or one it failed in Tabular
      // Editor, is left out here: the annotation alone explains its difference.
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
