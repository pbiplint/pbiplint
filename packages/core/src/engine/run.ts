import type { Indexes } from "../index/build.js";
import { formatMessage, msg } from "../messages/format.js";
import type { Project } from "../project/types.js";
import { finding } from "../rules/helpers.js";
import { reportFinding } from "../rules/report-helpers.js";
import { failureDetail, RULE_COULD_NOT_FINISH } from "../rules/rule-could-not-finish.js";
import {
  layerOf,
  type ErrorSite,
  type Finding,
  type Rule,
  type RuleFinding,
  type RuleOptions,
} from "../rules/types.js";
import type { ResolvedConfig } from "./config.js";
import { isIgnored } from "./ignore.js";
import { errorKind } from "./rule-error.js";

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

/**
 * A rule whose check threw, or that caught an error in one part of its work and reported it (an M
 * rule's error in one query, which names the query). It counts as run. Its message is the error's
 * class alone, after the part's label when there is one (`query 'Sales': TypeError`), never the
 * error's own message, which can hold the model's text (v3 spec, section 11.3, amended October 28,
 * 2026). When RULE_COULD_NOT_FINISH runs, each error is also one of its findings, one per failed
 * rule and object.
 */
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
 * throws is recorded in `ruleErrors` and the run goes on, as is each error a rule reports through
 * `reportError`, its findings kept. When RULE_COULD_NOT_FINISH is among the rules that ran, each
 * error is also one of its findings, written after every rule has run, in the order the errors
 * happened: one per failed rule and object, on the query's owner for an error in one query, else on
 * the model (the report, for a report rule or a project without a model), and dropped when the
 * object's `pbiplint.ignore` names either rule. `config` must already be bound to the
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
  /** Each error's rule, where it happened, and the object it was about, for the findings. */
  const failures: { id: string; label: string; finding: RuleFinding; kind: string }[] = [];
  /**
   * Records a rule's error, by its class alone: every `RuleError` is made here, its message in
   * English. A throw out of `check` is about the model, or the report for a report rule or a
   * project without a model.
   */
  const fail = (rule: Rule, e: unknown, site?: ErrorSite): void => {
    const kind = errorKind(e);
    result.ruleErrors.push({
      id: rule.id,
      message: site === undefined ? kind : `${formatMessage(site.label)}: ${kind}`,
    });
    const { model, report } = project;
    const { label, finding: f }: ErrorSite =
      site ??
      (model && rule.layer !== "report"
        ? { label: msg("ruleError.theModel"), finding: finding.model(model) }
        : report
          ? { label: msg("ruleError.theReport"), finding: reportFinding.report(report) }
          : {
              label: msg("ruleError.theModel"),
              finding: { objectType: "Model", objectName: "Model" },
            });
    failures.push({ id: rule.id, kind, label: formatMessage(label), finding: f });
  };
  /** Adds a rule's finding, unless its object's `pbiplint.ignore` names the rule or `alsoIgnoredBy`. */
  const keep = (ruleId: string, f: RuleFinding, alsoIgnoredBy?: string): void => {
    if (
      isIgnored(f.object, ruleId) ||
      (alsoIgnoredBy !== undefined && isIgnored(f.object, alsoIgnoredBy))
    ) {
      result.ignored++;
      return;
    }
    const out: Finding = {
      ruleId,
      layer: f.layer ?? layerOf(f.objectType),
      objectType: f.objectType,
      objectName: f.objectName,
    };
    if (f.objectId !== undefined) out.objectId = f.objectId;
    if (f.location) out.location = f.location;
    if (f.message !== undefined) {
      out.detail = formatMessage(f.message);
      out.messageId = f.message.id;
      out.params = f.message.params;
    } else if (f.detail !== undefined) {
      out.detail = f.detail;
    }
    result.findings.push(out);
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
      raw = rule.check(project, {
        indexes,
        options: optionsFor(rule, config),
        reportError: (e, site) => fail(rule, e, site),
      });
    } catch (e) {
      fail(rule, e);
      continue;
    }
    for (const f of raw) keep(rule.id, f);
  }
  if (result.rulesRun.includes(RULE_COULD_NOT_FINISH.id)) {
    const seen = new Set<string>();
    for (const { id, label, finding: f, kind } of failures) {
      const key = JSON.stringify([id, f.objectType, f.objectName, f.objectId]);
      if (seen.has(key)) continue;
      seen.add(key);
      keep(RULE_COULD_NOT_FINISH.id, { ...f, detail: failureDetail(id, label, kind) }, id);
    }
  }
  return result;
}
