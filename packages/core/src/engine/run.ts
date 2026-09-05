import type { Indexes } from "../index/build.js";
import type { Model } from "../model/types.js";
import type { Finding, Rule } from "../rules/types.js";
import type { ResolvedConfig } from "./config.js";
import { isIgnored } from "./ignore.js";

export interface SkippedRule {
  id: string;
  reason: "disabled" | "needsLiveModel";
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

export function runRules(
  model: Model,
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
    result.rulesRun.push(rule.id);
    let raw;
    try {
      raw = rule.check(model, { indexes });
    } catch (e) {
      result.ruleErrors.push({ id: rule.id, message: e instanceof Error ? e.message : String(e) });
      continue;
    }
    for (const f of raw) {
      if (isIgnored(f.object, rule.id)) {
        result.ignored++;
        continue;
      }
      const out: Finding = { ruleId: rule.id, objectType: f.objectType, objectName: f.objectName };
      if (f.location) out.location = f.location;
      if (f.detail !== undefined) out.detail = f.detail;
      result.findings.push(out);
    }
  }
  return result;
}
