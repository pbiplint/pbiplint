// Shared by the two parity tests for custom rules: custom-te-microsoft.test.ts (Microsoft's ruleset,
// in every pull request's CI) and custom-te-survey.test.ts (the survey's 46 files, in the Survey
// parity workflow). Both compare `runTeRules` with Tabular Editor's committed captures.
import { readFileSync } from "node:fs";
import { expect } from "vitest";
import type { TeOutcome } from "../src/custom-rules/te/index.js";
import { isStatisticsAnnotation } from "../src/custom-rules/te/library.js";
import { buildModel } from "../src/model/build.js";
import type { Model } from "../src/model/types.js";
import { readModelFiles, parseModelDir } from "./helpers.js";

export const repo = new URL("../../../", import.meta.url).pathname;

export const MICROSOFT_FILE = "microsoft/Analysis-Services/BestPracticeRules/BPARules.json";

/** Custom rules' recorded deviations in a survey capture, keyed by rule file id, then rule id. */
export interface CustomDeviations {
  /** One sentence per rule saying why pbiplint differs from Tabular Editor. */
  deviations?: Record<string, Record<string, string>>;
  /** pbiplint's objects for each rule with a deviation. */
  ours?: Record<string, Record<string, string[]>>;
}

/** One file's result in a survey capture. */
export type SurveyResult =
  | { findings: Record<string, string[]>; ruleErrors: Record<string, string> }
  | { error: string }
  | { unavailable: string };

export interface SurveyCapture {
  results: Record<string, SurveyResult>;
  custom?: CustomDeviations;
}

export interface MicrosoftCapture {
  /** The fixture's folder, from the repository root. */
  fixture: string;
  findings: Record<string, string[]>;
  ruleErrors?: Record<string, string>;
}

/**
 * The fixtures with Tabular Editor captures: the nine from te 0.7.1.2 and the two from pull request
 * A (te 0.8.1.1), with where each capture lives.
 */
export const PARITY_FIXTURES = [
  "data-sources",
  "kitchen-sink",
  "m-zoo",
  "messy-sales",
  "rule-zoo",
  "te3-zoo",
  "tvw-baseline",
  "udf-sales",
  "untyped-columns",
  "custom-rules",
  "custom-rules-model-ignore",
].map((name) => {
  const dir = name.startsWith("custom-rules")
    ? `${repo}tests/expectations/custom-rules/`
    : `${repo}tests/expectations/`;
  return {
    name,
    microsoftPath: `${dir}${name}.json`,
    surveyPath: `${dir}survey/${name}.json`,
    /** Whether the fixture carries Tabular Editor's ignore annotation, which pbiplint reads later. */
    annotated: name.startsWith("custom-rules"),
  };
});

const readJson = <T>(path: string): T => JSON.parse(readFileSync(path, "utf8")) as T;
export const readMicrosoftCapture = (path: string) => readJson<MicrosoftCapture>(path);
export const readSurveyCapture = (path: string) => readJson<SurveyCapture>(path);

/** The model of the fixture a capture names. */
export function fixtureModel(capture: MicrosoftCapture): Model {
  return buildModel(parseModelDir(`${repo}${capture.fixture}`));
}

/** Where a fixture carries Tabular Editor's ignore annotation; see `ignoreAnnotations`. */
export interface IgnoreAnnotations {
  ids: Set<string>;
  malformedScopes: Set<string>;
}

/**
 * What Tabular Editor's ignore annotation (`BestPracticeAnalyzer_IgnoreRules`) does in a fixture:
 * the rule ids it names anywhere, uppercased since Tabular Editor matches them ignoring case, and
 * the scopes whose objects carry an annotation that is not valid JSON, which fails a rule on such a
 * scope in Tabular Editor. pbiplint reads the annotation from pull request C on; until then the
 * parity tests leave those rules out on the annotated fixtures (`leftOutForAnnotation`).
 */
export function ignoreAnnotations(name: string): IgnoreAnnotations {
  const ids = new Set<string>();
  const malformedScopes = new Set<string>();
  for (const file of readModelFiles(`${repo}tests/fixtures/${name}.SemanticModel`)) {
    for (const line of file.text.split(/\r?\n/)) {
      const m = /annotation\s+BestPracticeAnalyzer_IgnoreRules\s*=\s*(.*)$/.exec(line);
      if (!m) continue;
      try {
        JSON.parse(m[1]!);
      } catch {
        // Only one place is expected: the perspective pull request A gave a cut-off annotation.
        if (!file.path.includes("perspectives/"))
          throw new Error(`${name}: a malformed ignore annotation in ${file.path}`);
        malformedScopes.add("Perspective");
      }
      for (const id of m[1]!.matchAll(/"([^"]+)"/g))
        if (id[1] !== "RuleIDs") ids.add(id[1]!.toUpperCase());
    }
  }
  return { ids, malformedScopes };
}

/**
 * Whether the annotation alone explains a rule's difference on an annotated fixture: the rule's id
 * is one an annotation names, or Tabular Editor failed the rule and one of its scopes holds the
 * malformed annotation. (In Tabular Editor's captures that annotation fails only some rules on its
 * scope, those that would report the object holding it; the others run and are compared.)
 */
export function leftOutForAnnotation(
  ignored: IgnoreAnnotations | undefined,
  rule: { id: string; scopes: string[] },
  teFailed: boolean,
): boolean {
  if (!ignored) return false;
  return (
    ignored.ids.has(rule.id.toUpperCase()) ||
    (teFailed && rule.scopes.some((s) => ignored.malformedScopes.has(s)))
  );
}

/** Whether a rule reads an annotation only a live model's statistics fill in (`Vertipaq_*` and kin). */
export function readsStatistics(expression: string): boolean {
  return [...expression.matchAll(/"([^"]*)"/g)].some((m) => isStatisticsAnnotation(m[1]!));
}

/** An outcome as the captures can say it: the objects found, sorted, or that the rule did not run. */
export function said(o: TeOutcome): string[] | "could-not-run" {
  return o.kind === "findings" ? o.objects.map((x) => x.teName).sort() : "could-not-run";
}

const same = (a: string[] | "could-not-run", b: string[] | "could-not-run") =>
  JSON.stringify(a) === JSON.stringify(b);

/** The label, with why pbiplint could not run the rule or how many objects it left out. */
const told = (label: string, got: TeOutcome) =>
  got.kind === "could-not-run"
    ? `${label}: could not run: ${got.reason}`
    : got.unset > 0
      ? `${label}: ${got.unset} left out for a value the files leave unset`
      : label;

/**
 * Holds one rule's outcome to what Tabular Editor gave (`want`), or, where the capture records a
 * deviation for it, to pbiplint's recorded objects, which must then differ from Tabular Editor's.
 * Returns whether the rule matched outright or was a deviation.
 */
export function expectRule(
  label: string,
  got: TeOutcome,
  want: string[] | "could-not-run",
  custom: CustomDeviations | undefined,
  fileId: string,
  ruleId: string,
): "match" | "deviation" {
  const sentence = custom?.deviations?.[fileId]?.[ruleId];
  if (sentence === undefined) {
    expect(said(got), told(label, got)).toEqual(want);
    return "match";
  }
  const ours = custom?.ours?.[fileId]?.[ruleId];
  expect(typeof sentence, `${label}: the deviation is a sentence`).toBe("string");
  expect(ours, `${label}: a deviation records pbiplint's objects`).toBeDefined();
  expect(said(got), told(label, got)).toEqual([...ours!].sort());
  expect(same([...ours!].sort(), want), `${label}: the deviation shows a difference`).toBe(false);
  return "deviation";
}

/** Every `ours` in a capture's custom deviations has its sentence, and the other way round. */
export function expectPairedDeviations(label: string, custom: CustomDeviations | undefined): void {
  for (const [fileId, rules] of Object.entries(custom?.ours ?? {}))
    for (const ruleId of Object.keys(rules))
      expect(
        custom?.deviations?.[fileId]?.[ruleId],
        `${label}: ${fileId} ${ruleId} has objects but no sentence`,
      ).toBeTypeOf("string");
  for (const [fileId, rules] of Object.entries(custom?.deviations ?? {}))
    for (const ruleId of Object.keys(rules))
      expect(
        custom?.ours?.[fileId]?.[ruleId],
        `${label}: ${fileId} ${ruleId} has a sentence but no objects`,
      ).toBeDefined();
}
