import type { Indexes } from "../index/build.js";
import type { Project } from "../project/types.js";
import { layerOf, type Finding, type Rule, type RuleOptions } from "../rules/types.js";
import type { ResolvedConfig } from "./config.js";
import { isIgnored } from "./ignore.js";

export interface SkippedRule {
  id: string;
  reason: "disabled" | "needsLiveModel" | "noModel" | "noReport" | "reportFileUnread";
}

export interface RuleError {
  id: string;
  message: string;
}

export interface RunResult {
  findings: Finding[];
  rulesRun: string[];
  rulesSkipped: SkippedRule[];
  ruleErrors: RuleError[];
  ignored: number;
}

/** The rule's declared defaults with the config file's values laid over them. */
export function optionsFor(rule: Rule, config: ResolvedConfig): RuleOptions {
  const out: Record<string, number | string> = {};
  for (const o of rule.options ?? []) if (o.default !== undefined) out[o.name] = o.default;
  for (const [name, value] of Object.entries(config.options.get(rule.id) ?? {}))
    out[name] = value as number | string;
  return out;
}

export function runRules(
  project: Project,
  indexes: Indexes,
  rules: Rule[],
  config: ResolvedConfig,
): RunResult {
  const result: RunResult = {
    findings: [],
    rulesRun: [],
    rulesSkipped: [],
    ruleErrors: [],
    ignored: 0,
  };
  for (const rule of rules) {
    if (config.disabled.has(rule.id)) {
      result.rulesSkipped.push({ id: rule.id, reason: "disabled" });
      continue;
    }
    if (rule.status === "needsLiveModel") {
      result.rulesSkipped.push({ id: rule.id, reason: "needsLiveModel" });
      continue;
    }
    const missing = rule.needs.find((layer) => project[layer] === undefined);
    if (missing !== undefined) {
      result.rulesSkipped.push({
        id: rule.id,
        reason: missing === "model" ? "noModel" : "noReport",
      });
      continue;
    }
    if (rule.needsEveryReportFileRead && project.report?.unreadDefinitionFiles.length) {
      result.rulesSkipped.push({ id: rule.id, reason: "reportFileUnread" });
      continue;
    }
    result.rulesRun.push(rule.id);
    let raw;
    try {
      raw = rule.check(project, { indexes, options: optionsFor(rule, config) });
    } catch (e) {
      result.ruleErrors.push({ id: rule.id, message: e instanceof Error ? e.message : String(e) });
      continue;
    }
    for (const f of raw) {
      if (isIgnored(f.object, rule.id)) {
        result.ignored++;
        continue;
      }
      const out: Finding = {
        ruleId: rule.id,
        layer: f.layer ?? layerOf(f.objectType),
        objectType: f.objectType,
        objectName: f.objectName,
      };
      if (f.objectId !== undefined) out.objectId = f.objectId;
      if (f.location) out.location = f.location;
      if (f.detail !== undefined) out.detail = f.detail;
      result.findings.push(out);
    }
  }
  return result;
}
