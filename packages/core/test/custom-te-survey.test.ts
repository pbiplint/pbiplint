// The survey's 46 rule files run as custom rules give Tabular Editor's results on every fixture
// with a survey capture (spec section 11), or a deviation recorded under the capture's `custom`
// key. The files are not committed; scripts/fetch-survey-rules.mjs fetches them at their commits
// into a folder, and this test runs only when PBIPLINT_SURVEY_DIR names it:
//
//   node scripts/fetch-survey-rules.mjs tests/expectations/survey/files.json <dir>
//   PBIPLINT_SURVEY_DIR=<dir> npx vitest run packages/core/test/custom-te-survey.test.ts
//
// The Survey parity workflow (.github/workflows/survey-parity.yml) runs it on demand, weekly, and
// on each release commit; pull request CI runs Microsoft's file only (custom-te-microsoft.test.ts).
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { readCustomRules } from "../src/custom-rules/rules.js";
import { runTeRules, STATISTICS_REASON, type TeRunResult } from "../src/custom-rules/te/index.js";
import { readTeRuleFile } from "../src/custom-rules/te/read.js";
import { sameIdAs } from "../src/engine/custom.js";
import { defaultRules } from "../src/rules/index.js";
import {
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

const DIR = process.env.PBIPLINT_SURVEY_DIR;

interface ListedFile {
  id: string;
  alsoAt: string[];
}
const { files } = JSON.parse(
  readFileSync(`${repo}tests/expectations/survey/files.json`, "utf8"),
) as { files: ListedFile[] };

/** The fetched folder's index: each file id to its local name, or why it is unavailable. */
const index: Record<string, string | { unavailable: string }> = DIR
  ? (JSON.parse(readFileSync(join(DIR, "index.json"), "utf8")) as Record<
      string,
      string | { unavailable: string }
    >)
  : {};
const available = files.filter((f) => typeof index[f.id] === "string");
const unavailable = files.filter((f) => typeof index[f.id] !== "string");
const texts = new Map(
  available.map((f) => [f.id, readFileSync(join(DIR!, index[f.id] as string), "utf8")]),
);

/** How each rule-fixture pair came out, for the summary printed at the end. */
const tally = {
  match: 0,
  statistics: 0,
  skippedForAnnotation: 0,
  deviations: {} as Record<string, number>,
};
/**
 * The (file, rule) pairs pbiplint reported as could not run where Tabular Editor failed too, on any
 * fixture; keyed without the fixture, so a pair counts once however many fixtures show it.
 */
const failedInBoth = new Set<string>();

describe.skipIf(!DIR)("the survey's rule files as custom rules", () => {
  it("has every listed file, or lists it as unavailable", () => {
    expect(Object.keys(index).sort()).toEqual(files.map((f) => f.id).sort());
    if (unavailable.length > 0)
      console.info(
        `Unavailable, so skipped:\n${unavailable.map((f) => `  ${f.id}: ${(index[f.id] as { unavailable: string }).unavailable}`).join("\n")}`,
      );
  });

  it("reads all 46 files, reporting the 11 rules with no scope and the 9 with report scopes", () => {
    expect(files).toHaveLength(46);
    let noScope = 0;
    let report = 0;
    for (const f of available) {
      const run = readTeRuleFile(texts.get(f.id)!);
      if ("error" in run) throw new Error(`${f.id}: ${run.error}`);
      for (const p of run.problems) {
        if (p.reason.startsWith("The rule has no Scope")) noScope++;
        else if (p.reason.startsWith("The rule's Scope names a report object")) report++;
      }
    }
    // Counted with every file at hand; a file GitHub no longer has takes its rules with it.
    if (unavailable.length === 0) {
      expect(noScope).toBe(11);
      expect(report).toBe(9);
    }
  });

  // Custom rules spec, section 4: a team's copy of a rule pbiplint carries is unchanged when its
  // scopes and its expression, whitespace outside string literals aside, match a published version,
  // and edited otherwise.
  // Counted as lint sees each file: every rule readCustomRules keeps (a rule repeated word for word
  // in one file is one rule) whose id, in any case, is a built-in id. Microsoft's and Tabular
  // Editor's own files must all come out unchanged; the rest are team files, where the spec's
  // research counted 901 unchanged of 970 against the current upstream files only. With every
  // published version to match and today's built-in ids, the count is 1,156 unchanged of 1,188,
  // 31 edited in 10 files (1,249 and 31 weighted by the copies files.json lists), and 1 the reader
  // could not read: bonardi's report-scope REMOVE_UNUSED_CUSTOM_VISUALS. That one is neither: it
  // never replaces pbiplint's rule, which runs, and it is reported as a rule that could not finish
  // (spec, section 3). Keeping whitespace inside string literals moved no copy between classes.
  it("classifies every copy of a built-in rule in the survey as unchanged, edited, or unread", () => {
    if (unavailable.length > 0) return;
    const ownIds = new Set(defaultRules.map((r) => r.id.toUpperCase()));
    const published = (id: string) =>
      id.startsWith("microsoft/Analysis-Services/") ||
      id.startsWith("TabularEditor/BestPracticeRules/");
    const team = { unchanged: 0, edited: 0, weightedUnchanged: 0, weightedEdited: 0 };
    const unread: string[] = [];
    let publishedCopies = 0;
    const edited: string[] = [];
    const editedFiles = new Set<string>();
    for (const f of available) {
      const text = texts.get(f.id)!;
      if ("error" in readTeRuleFile(text)) continue;
      for (const rule of readCustomRules([{ path: f.id, text }]).rules) {
        const same = sameIdAs(rule, ownIds);
        const upper = rule.id.toUpperCase();
        if (rule.custom?.readProblem !== undefined && ownIds.has(upper)) {
          expect(same).toBeUndefined();
          expect(published(f.id)).toBe(false);
          unread.push(`${f.id} ${rule.id}`);
          continue;
        }
        if (same === undefined) continue;
        if (published(f.id)) {
          expect(same, `${f.id} ${rule.id}`).toBe("asBuiltIn");
          publishedCopies++;
          continue;
        }
        const copies = 1 + f.alsoAt.length;
        if (same === "asBuiltIn") {
          team.unchanged++;
          team.weightedUnchanged += copies;
        } else {
          team.edited++;
          team.weightedEdited += copies;
          edited.push(`  ${f.id} ${rule.id}`);
          editedFiles.add(f.id);
        }
      }
    }
    console.info(
      [
        `Copies of built-in rules: ${publishedCopies} in Microsoft's and Tabular Editor's own files, all unchanged; in team files ${team.unchanged} unchanged, ${team.edited} edited in ${editedFiles.size} files (weighted by copies: ${team.weightedUnchanged} unchanged, ${team.weightedEdited} edited); ${unread.length} pbiplint could not read. Edited:`,
        ...edited,
        "Could not read:",
        ...unread.map((u) => `  ${u}`),
      ].join("\n"),
    );
    expect(publishedCopies).toBeGreaterThan(0);
    expect(team.unchanged + team.edited + unread.length).toBe(1188);
    expect(unread).toEqual([
      "bonardi/PowerBI-CICD/resources/report/config/bparules.json REMOVE_UNUSED_CUSTOM_VISUALS",
    ]);
    // More published versions can only turn an edited copy into an unchanged one.
    expect(team.unchanged).toBeGreaterThanOrEqual(1156);
  });

  for (const fixture of PARITY_FIXTURES) {
    describe(fixture.name, () => {
      const survey = readSurveyCapture(fixture.surveyPath);
      const { custom } = survey;
      const model = fixtureModel(readMicrosoftCapture(fixture.microsoftPath));
      // The annotated fixtures carry Tabular Editor's ignore annotation. pbiplint applies it in the
      // engine (engine/ignore.ts), which runTeRules does not reach, so a rule the annotation names,
      // or one Tabular Editor failed on it, is left out here: the annotation alone explains it.
      const ignored = fixture.annotated ? ignoreAnnotations(fixture.name) : undefined;

      it("records custom deviations only in pairs, and only for rules of listed files", () => {
        expectPairedDeviations(fixture.name, custom);
        const ids = new Set(files.map((f) => f.id));
        for (const fileId of Object.keys(custom?.deviations ?? {}))
          expect(ids.has(fileId), fileId).toBe(true);
      });

      for (const file of available) {
        const captured = survey.results[file.id];
        if (captured === undefined || "unavailable" in captured) continue;
        const run: TeRunResult = DIR ? runTeRules(texts.get(file.id)!, model) : { error: "" };

        if ("error" in captured) {
          it(`${file.id}: refused, as Tabular Editor refused it`, () => {
            if ("error" in run) return;
            expect(run.results, "no rule runs").toEqual([]);
            expect(run.problems.length).toBeGreaterThan(0);
          });
          continue;
        }
        if ("error" in run) {
          it(`${file.id}: reads`, () => {
            throw new Error(run.error);
          });
          continue;
        }

        const deviation = (ruleId: string) => custom?.deviations?.[file.id]?.[ruleId];
        for (const { rule, outcome } of run.results) {
          const key = `${file.id} ${rule.id}`;
          if (leftOutForAnnotation(ignored, rule, captured.ruleErrors[rule.id] !== undefined)) {
            tally.skippedForAnnotation++;
            continue;
          }
          it(key, () => {
            if (readsStatistics(rule.expression) && deviation(rule.id) === undefined) {
              // Tabular Editor reads null with no statistics and passes; pbiplint says it cannot
              // run.
              expect(captured.findings[rule.id], "Tabular Editor found nothing").toBeUndefined();
              expect(captured.ruleErrors[rule.id], "Tabular Editor ran it").toBeUndefined();
              expect(outcome.kind === "could-not-run" && outcome.reason).toContain(
                STATISTICS_REASON,
              );
              tally.statistics++;
              return;
            }
            const failed = captured.ruleErrors[rule.id] !== undefined;
            // As te lists them: two objects with one name (hierarchies in two tables) come twice.
            const want = failed ? "could-not-run" : [...(captured.findings[rule.id] ?? [])].sort();
            const how = expectRule(
              `${fixture.name} ${key}`,
              outcome,
              want,
              custom,
              file.id,
              rule.id,
            );
            if (how === "match") {
              tally.match++;
              if (failed) failedInBoth.add(key);
            } else {
              const sentence = deviation(rule.id)!;
              tally.deviations[sentence] = (tally.deviations[sentence] ?? 0) + 1;
            }
          });
        }

        // A rule pbiplint reports as a problem runs on nothing: Tabular Editor found nothing for it
        // either, silently (no scope) or failing it (no expression).
        it(`${file.id}: Tabular Editor found nothing for a rule pbiplint could not read`, () => {
          for (const p of run.problems) {
            if (deviation(p.id) !== undefined) continue;
            expect(captured.findings[p.id], `${p.id}: ${p.reason}`).toBeUndefined();
            if (captured.ruleErrors[p.id] !== undefined) failedInBoth.add(`${file.id} ${p.id}`);
          }
        });

        it(`${file.id}: places every rule Tabular Editor reported`, () => {
          const placed = new Set([
            ...run.results.map((r) => r.rule.id),
            ...run.problems.map((p) => p.id),
          ]);
          for (const id of [...Object.keys(captured.findings), ...Object.keys(captured.ruleErrors)])
            expect(placed.has(id), id).toBe(true);
        });
      }
    });
  }

  it("reports the 23 rules Tabular Editor cannot run as could not run", () => {
    // Counted by file and rule over all eleven fixtures with captures, with every file at hand: a
    // rule that fails on several fixtures counts once, so this is the spec's 23 rules in 9 files.
    if (unavailable.length > 0) return;
    expect(failedInBoth.size).toBe(23);
    expect(new Set([...failedInBoth].map((key) => key.split(" ")[0])).size).toBe(9);
  });
});

afterAll(() => {
  if (!DIR) return;
  const lines = Object.entries(tally.deviations)
    .sort(([, a], [, b]) => b - a)
    .map(([sentence, n]) => `  ${n}: ${sentence}`);
  console.info(
    [
      `Survey parity: ${tally.match} rule-fixture pairs match, ${tally.statistics} statistics rules, ${tally.skippedForAnnotation} left out for the ignore annotation, ${Object.values(tally.deviations).reduce((a, b) => a + b, 0)} deviations:`,
      ...lines,
    ].join("\n"),
  );
});
