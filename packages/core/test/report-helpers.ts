import { buildIndexes } from "../src/index/build.js";
import type { LintFile } from "../src/engine/lint.js";
import { optionsFor } from "../src/engine/run.js";
import { resolveConfig } from "../src/engine/config.js";
import { buildReport } from "../src/pbir/build.js";
import type { Project } from "../src/project/types.js";
import type { Rule, RuleFinding } from "../src/rules/types.js";
import { modelFrom } from "./helpers.js";

export const j = (v: unknown): string => JSON.stringify(v);
/** Indented JSON, as Power BI Desktop writes it, so each key sits on a line of its own. */
export const pretty = (v: unknown): string => JSON.stringify(v, null, 2);
/** The 1-based line of the first occurrence of `needle` in `text`, at or after `from`. */
export const lineOf = (text: string, needle: string, from = 0): number =>
  text.slice(0, text.indexOf(needle, from)).split("\n").length;
export const column = (entity: string, property: string) => ({
  Column: { Expression: { SourceRef: { Entity: entity } }, Property: property },
});
export const measure = (entity: string, property: string) => ({
  Measure: { Expression: { SourceRef: { Entity: entity } }, Property: property },
});
export const lit = (value: string) => ({ expr: { Literal: { Value: value } } });

/** A page file with defaults a Desktop page has. */
export const page = (name: string, extra: Record<string, unknown> = {}): LintFile => ({
  path: `definition/pages/${name}/page.json`,
  text: j({
    name,
    displayName: `Page ${name}`,
    displayOption: "FitToPage",
    height: 720,
    width: 1280,
    ...extra,
  }),
});
/** A visual file on a page; `container` goes beside `visual`, `inner` inside it. */
export const visual = (
  pageId: string,
  name: string,
  type: string,
  container: Record<string, unknown> = {},
  inner: Record<string, unknown> = {},
): LintFile => ({
  path: `definition/pages/${pageId}/visuals/${name}/visual.json`,
  text: j({
    name,
    position: { x: 0, y: 0, z: 0, height: 100, width: 100, tabOrder: 0 },
    ...container,
    visual: { visualType: type, ...inner },
  }),
});
/** A visual whose roles bind the given fields. */
export const bound = (
  pageId: string,
  name: string,
  type: string,
  fields: unknown[],
  container: Record<string, unknown> = {},
): LintFile =>
  visual(pageId, name, type, container, {
    query: { queryState: { Values: { projections: fields.map((field) => ({ field })) } } },
  });

export function projectFrom(reportFiles: LintFile[], tmdl?: string): Project {
  const { report } = buildReport(reportFiles);
  return tmdl === undefined ? { report } : { report, model: modelFrom(tmdl) };
}

/** Run one rule and return its findings, in emission order. */
export function reportFindings(
  rule: Rule,
  reportFiles: LintFile[],
  tmdl?: string,
  options: Record<string, unknown> = {},
): RuleFinding[] {
  const project = projectFrom(reportFiles, tmdl);
  // optionsFor reads the config's options by the rule's own id, so the map is set directly.
  const config = resolveConfig();
  if (Object.keys(options).length) config.options.set(rule.id, options);
  return rule.check(project, { indexes: buildIndexes(project), options: optionsFor(rule, config) });
}

/** Run one rule and return the object ids it flags, in emission order. */
export function reportObjectIds(
  rule: Rule,
  reportFiles: LintFile[],
  tmdl?: string,
  options: Record<string, unknown> = {},
): string[] {
  return reportFindings(rule, reportFiles, tmdl, options).map((f) => f.objectId ?? f.objectName);
}
