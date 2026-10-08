import type { Indexes } from "../index/build.js";
import type { Project } from "../project/types.js";
import { layerOf, type Finding, type Rule, type RuleOptions } from "../rules/types.js";
import type { ResolvedConfig } from "./config.js";
import { isIgnored } from "./ignore.js";

/** A rule that did not run, and why. */
export interface SkippedRule {
  id: string;
  /**
   * `disabled`: the config turns it off. `needsLiveModel`: it needs column statistics a TMDL file
   * does not carry, so it is listed and never run. `noModel` or `noReport`: a layer it needs is
   * absent from the input. `reportFileUnread` or `modelFileUnread`: a file its findings depend on
   * could not be read, so it reports nothing rather than something wrong.
   */
  reason:
    "disabled" | "needsLiveModel" | "noModel" | "noReport" | "reportFileUnread" | "modelFileUnread";
}

/** A rule whose check threw. It counts as run, and its message is the thrown error's. */
export interface RuleError {
  id: string;
  message: string;
}

export interface RunResult {
  /** Every finding, in rule order, with the ignored ones left out. Severity is not set here. */
  findings: Finding[];
  /** Ids of the rules that ran, a rule that threw among them. */
  rulesRun: string[];
  rulesSkipped: SkippedRule[];
  ruleErrors: RuleError[];
  /** Findings dropped because their object's `pbiplint.ignore` annotation names the rule. */
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

/**
 * Run each rule over the project, in the order given, and collect what it reports. A rule is
 * skipped, with its reason, when the config turns it off, when it needs a live model, when a layer
 * it needs is absent, or when its `skipWhenUnread` or `skipWhenModelUnread` holds. A rule that
 * throws is recorded in `ruleErrors` and the run goes on. `config` must already be bound to the
 * rules' ids (`bindConfig`), since ids are compared here as written. Most callers want `lint`,
 * which builds the project and indexes, runs this, and ranks the findings by severity.
 */
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
    // The report's condition is checked first, so a rule that both stop is skipped with its reason.
    if (rule.skipWhenUnread && project.report && rule.skipWhenUnread(project.report)) {
      result.rulesSkipped.push({ id: rule.id, reason: "reportFileUnread" });
      continue;
    }
    if (rule.skipWhenModelUnread && project.model && rule.skipWhenModelUnread(project.model)) {
      result.rulesSkipped.push({ id: rule.id, reason: "modelFileUnread" });
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
