import { buildIndexes } from "../index/build.js";
import { buildModel } from "../model/build.js";
import type { Model } from "../model/types.js";
import { buildReport } from "../pbir/build.js";
import { buildFacts } from "../project/facts.js";
import { routeFiles } from "../project/route.js";
import type { Diagnostic, Fact, Layers, Project } from "../project/types.js";
import { defaultRules } from "../rules/index.js";
import type { Finding, LayerName, Rule } from "../rules/types.js";
import { parseTmdl } from "../tmdl/parse.js";
import {
  bindConfig,
  isResolvedConfig,
  resolveConfig,
  type PbiplintConfig,
  type ResolvedConfig,
} from "./config.js";
import { rank, type RankedGroup } from "./rank.js";
import { runRules, type RuleError, type SkippedRule } from "./run.js";

export interface LintFile {
  /** Path relative to the part's root, forward slashes: `definition/tables/Sales.tmdl`, `definition/pages/<id>/page.json`. */
  path: string;
  text: string;
}

export interface LintOptions {
  config?: PbiplintConfig | ResolvedConfig;
  rules?: Rule[];
  /** What the input reader found that a reader of the results must know; carried onto the result. */
  diagnostics?: Diagnostic[];
  /** Why the reader left a layer out, per layer, for the skipped line. */
  absent?: Partial<Record<LayerName, string>>;
}

export interface LintSummary {
  /** Files that routed to a layer. */
  files: number;
  findings: number;
  errors: number;
  warnings: number;
  infos: number;
  rulesRun: number;
  rulesSkipped: SkippedRule[];
  ruleErrors: RuleError[];
  ignored: number;
  /** Rule ids named in the config that match no rule, as written there. */
  unknownRules: string[];
}

export interface LintResult {
  project: Project;
  /** The model layer, or the empty model when it is absent, so a v1 reader keeps working. */
  model: Model;
  layers: Layers;
  facts: Fact[];
  diagnostics: Diagnostic[];
  findings: Finding[];
  groups: RankedGroup[];
  summary: LintSummary;
  /** True when any finding's effective severity is at or above the configured failOn. */
  failed: boolean;
}

/** The one call the web app and the CLI both make. Pure: no I/O, no network. */
export function lint(files: LintFile[], options: LintOptions = {}): LintResult {
  const rules = options.rules ?? defaultRules;
  const { config, unknownRules } = bindConfig(
    isResolvedConfig(options.config) ? options.config : resolveConfig(options.config),
    rules,
  );
  const routed = routeFiles(files);
  const model = routed.model.length
    ? buildModel(routed.model.map((f) => parseTmdl(f.path, f.text)))
    : undefined;
  const built = routed.report.length ? buildReport(routed.report) : undefined;
  const project: Project = {
    ...(model ? { model } : {}),
    ...(built ? { report: built.report } : {}),
  };
  const layers: Layers = {
    model: model
      ? { present: true, files: routed.model.length }
      : { present: false, reason: options.absent?.model ?? "no model in the input" },
    report: built
      ? { present: true, files: routed.report.length }
      : { present: false, reason: options.absent?.report ?? "no report in the input" },
  };
  const diagnostics = [...(options.diagnostics ?? []), ...(built?.diagnostics ?? [])];
  const indexes = buildIndexes(project);
  const run = runRules(project, indexes, rules, config);
  const groups = rank(run.findings, rules, config);
  // Only the rules that ran: a fact never links the page of a rule turned off or skipped.
  const facts = buildFacts(project, indexes, new Set(run.rulesRun));
  const count = (severity: number) =>
    groups.filter((g) => g.rule.severity === severity).reduce((n, g) => n + g.findings.length, 0);
  const summary: LintSummary = {
    files: routed.model.length + routed.report.length,
    findings: run.findings.length,
    errors: count(3),
    warnings: count(2),
    infos: count(1),
    rulesRun: run.rulesRun.length,
    rulesSkipped: run.rulesSkipped,
    ruleErrors: run.ruleErrors,
    ignored: run.ignored,
    unknownRules,
  };
  const failed = config.failOn !== null && groups.some((g) => g.rule.severity >= config.failOn!);
  return {
    project,
    model: model ?? buildModel([]),
    layers,
    facts,
    diagnostics,
    findings: run.findings,
    groups,
    summary,
    failed,
  };
}
