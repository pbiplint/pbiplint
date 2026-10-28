import { countsLine, plural } from "../format/text.js";
import { isFindingFor, RULE_COULD_NOT_FINISH } from "../rules/rule-could-not-finish.js";
import type { Finding } from "../rules/types.js";
import type { ResolvedConfig } from "./config.js";
import type { LintResult, ShownSummary } from "./lint.js";
import { byRank, groupLayer, type RankedGroup } from "./rank.js";
import { countGroups, recount, type FindingCounts } from "./show-only.js";

/** One project of a several-project run (#237), with what the shared-model step needs to know. */
export interface ProjectRun {
  /** The project's path relative to the folder named, forward slashes, as projectsBelow gives it. */
  path: string;
  result: LintResult;
  config: ResolvedConfig;
  /** Identifies the model the run read (the CLI: its real path; the site: its path in the drop). */
  modelKey?: string;
  /** The config file the run used, as the caller names it, for the shared-model notice. */
  configPath?: string;
  /** The model's path relative to the folder named, forward slashes, for the shared-model notice. */
  modelPath?: string;
}

/** A several-project run's counts: each project's, added up, a shared model's files once. */
export interface RunSummary extends FindingCounts {
  projects: number;
  files: number;
  ignored: number;
  /** Rules that could not finish, counted once per project they failed in. */
  ruleErrors: number;
  /** What the projects show, added up, when the run shows only some rules. */
  shown?: ShownSummary;
}

const NOT_REACHED = "NOT_REACHED_FROM_REPORT";

/** Where a finding is, for matching one project's finding with another's about the same field. */
const fieldKey = (f: Finding): string =>
  JSON.stringify([f.objectType, f.objectName, f.location?.file, f.location?.line]);

/**
 * The run with only the findings `keep` holds and `notice` at the end of its diagnostics. A group
 * keeps its place in rank's order for the findings it still holds, and takes its layer again from
 * them, as `rank` gives it. The summary's totals lose the dropped findings, and `shown`, when the
 * run was kept to some rules first, counts what is left, so the result reads the same whether
 * `showOnly` ran before or after. A rule error whose finding is dropped goes with it.
 */
function keepOnly(run: ProjectRun, keep: (f: Finding) => boolean, notice: string): ProjectRun {
  const { result } = run;
  const groups: RankedGroup[] = [];
  const dropped: RankedGroup[] = [];
  for (const g of result.groups) {
    const findings = g.findings.filter(keep);
    if (findings.length === g.findings.length) {
      groups.push(g);
      continue;
    }
    if (findings.length)
      groups.push({ rule: { ...g.rule, layer: groupLayer(g.rule.layer, findings) }, findings });
    dropped.push({ rule: g.rule, findings: g.findings.filter((f) => !keep(f)) });
  }
  groups.sort(byRank);
  const { summary } = result;
  const gone = countGroups(dropped);
  const droppedFindings = dropped.flatMap((g) => g.findings);
  return {
    ...run,
    result: {
      ...recount(result, groups, run.config),
      diagnostics: [...result.diagnostics, { kind: "shared-model", message: notice }],
      summary: {
        ...summary,
        findings: summary.findings - gone.findings,
        errors: summary.errors - gone.errors,
        warnings: summary.warnings - gone.warnings,
        infos: summary.infos - gone.infos,
        ...(summary.shown ? { shown: { ...summary.shown, ...countGroups(groups) } } : {}),
        ruleErrors: summary.ruleErrors.filter(
          (e) => !droppedFindings.some((f) => isFindingFor(f, e)),
        ),
      },
    },
  };
}

/**
 * The runs with each shared model's findings listed once. Runs with the same `modelKey` read one
 * model: the first of them, in the order given, keeps the model's findings, and the others keep
 * only their report's. NOT_REACHED_FROM_REPORT counts a field as reached when any of the sharing
 * reports reaches it, so the first run keeps only the fields every sharing run reports, with its
 * own detail. A later run keeps a RULE_COULD_NOT_FINISH finding on the model that the first run
 * does not have: a rule over both layers can fail with one report only, and its failure is named
 * on the model. Each sharing run says so in a `shared-model` notice. A run that shares no model is
 * returned as it is. It may run before or after `showOnly`; after it, a later run's totals still
 * count the model findings `showOnly` left out, which this step cannot see.
 */
export function shareModels(runs: ProjectRun[]): ProjectRun[] {
  const byModel = new Map<string, ProjectRun[]>();
  for (const run of runs)
    if (run.modelKey !== undefined)
      byModel.set(run.modelKey, [...(byModel.get(run.modelKey) ?? []), run]);
  return runs.map((run) => {
    const sharing = run.modelKey === undefined ? [] : byModel.get(run.modelKey)!;
    const [first, ...rest] = sharing;
    if (first === undefined || rest.length === 0) return run;
    const theModel =
      first.modelPath === undefined ? "the model" : `the model at ${first.modelPath}`;
    if (run !== first) {
      const failures = new Set(
        first.result.findings
          .filter((f) => f.ruleId === RULE_COULD_NOT_FINISH.id)
          .map((f) => f.detail),
      );
      return keepOnly(
        run,
        (f) =>
          f.layer !== "model" || (f.ruleId === RULE_COULD_NOT_FINISH.id && !failures.has(f.detail)),
        `${theModel} is shared with ${first.path}; its findings are listed there`,
      );
    }
    const unreached = rest.map(
      (r) => new Set(r.result.findings.filter((f) => f.ruleId === NOT_REACHED).map(fieldKey)),
    );
    const differs = sharing.some((r) => r.configPath !== first.configPath);
    return keepOnly(
      run,
      (f) => f.ruleId !== NOT_REACHED || unreached.every((s) => s.has(fieldKey(f))),
      `${theModel} is shared with ${rest.map((r) => r.path).join(", ")}; ${NOT_REACHED} counts a field as reached when any of these reports reaches it` +
        (differs ? `; its findings follow ${first.configPath ?? "pbiplint's defaults"}` : ""),
    );
  });
}

/**
 * The runs' counts added up. A model several runs read counts its files once, under the first run
 * that read it; each run's model findings are its own after `shareModels`, so findings add as
 * they are.
 */
export function runSummary(runs: ProjectRun[]): RunSummary {
  const seen = new Set<string>();
  const sum = (n: (r: LintResult) => number) => runs.reduce((k, r) => k + n(r.result), 0);
  let files = 0;
  for (const { result, modelKey } of runs) {
    const model = result.layers.model;
    const again = modelKey !== undefined && seen.has(modelKey);
    files += result.summary.files - (again && model.present ? model.files : 0);
    if (modelKey !== undefined) seen.add(modelKey);
  }
  const out: RunSummary = {
    projects: runs.length,
    files,
    findings: sum((r) => r.summary.findings),
    errors: sum((r) => r.summary.errors),
    warnings: sum((r) => r.summary.warnings),
    infos: sum((r) => r.summary.infos),
    ignored: sum((r) => r.summary.ignored),
    ruleErrors: sum((r) => new Set(r.summary.ruleErrors.map((e) => e.id)).size),
  };
  if (runs.some((r) => r.result.summary.shown)) {
    // A run kept to no rules shows all of its findings.
    const shown = (r: LintResult) => r.summary.shown ?? { rules: [], ...countGroups(r.groups) };
    out.shown = {
      rules: [...new Set(runs.flatMap((r) => shown(r.result).rules))],
      findings: sum((r) => shown(r).findings),
      errors: sum((r) => shown(r).errors),
      warnings: sum((r) => shown(r).warnings),
      infos: sum((r) => shown(r).infos),
    };
  }
  return out;
}

/** `summaryLine` for a several-project run: the number of projects, then the counts in its words. */
export const runSummaryLine = (summary: RunSummary): string =>
  `${plural(summary.projects, "project")}, ${countsLine(summary, summary.ruleErrors)}`;
