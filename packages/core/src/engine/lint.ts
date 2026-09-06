import { buildIndexes } from "../index/build.js";
import { buildModel } from "../model/build.js";
import type { Model } from "../model/types.js";
import { defaultRules } from "../rules/index.js";
import type { Finding, Rule } from "../rules/types.js";
import { parseTmdl } from "../tmdl/parse.js";
import {
  isResolvedConfig,
  resolveConfig,
  type PbiplintConfig,
  type ResolvedConfig,
} from "./config.js";
import { rank, type RankedGroup } from "./rank.js";
import { runRules, type RuleError, type SkippedRule } from "./run.js";

export interface LintFile {
  /** Path relative to the model root, forward slashes, e.g. `definition/tables/Sales.tmdl`. */
  path: string;
  text: string;
}

export interface LintOptions {
  config?: PbiplintConfig | ResolvedConfig;
  rules?: Rule[];
}

export interface LintSummary {
  files: number;
  findings: number;
  errors: number;
  warnings: number;
  infos: number;
  rulesRun: number;
  rulesSkipped: SkippedRule[];
  ruleErrors: RuleError[];
  ignored: number;
}

export interface LintResult {
  model: Model;
  findings: Finding[];
  groups: RankedGroup[];
  summary: LintSummary;
  /** True when any finding's effective severity is at or above the configured failOn. */
  failed: boolean;
}

/** The one call the web app and the CLI both make. Pure: no I/O, no network. */
export function lint(files: LintFile[], options: LintOptions = {}): LintResult {
  const config = isResolvedConfig(options.config) ? options.config : resolveConfig(options.config);
  const rules = options.rules ?? defaultRules;
  const parsed = files.map((f) => parseTmdl(f.path, f.text));
  const model = buildModel(parsed);
  const indexes = buildIndexes(model);
  const run = runRules(model, indexes, rules, config);
  const groups = rank(run.findings, rules, config);
  const count = (severity: number) =>
    groups.filter((g) => g.rule.severity === severity).reduce((n, g) => n + g.findings.length, 0);
  const summary: LintSummary = {
    files: files.length,
    findings: run.findings.length,
    errors: count(3),
    warnings: count(2),
    infos: count(1),
    rulesRun: run.rulesRun.length,
    rulesSkipped: run.rulesSkipped,
    ruleErrors: run.ruleErrors,
    ignored: run.ignored,
  };
  const failed = config.failOn !== null && groups.some((g) => g.rule.severity >= config.failOn!);
  return { model, findings: run.findings, groups, summary, failed };
}
