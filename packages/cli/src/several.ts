import { relative, resolve } from "node:path";
import {
  ConfigError,
  escapeJsonControls,
  formatJson,
  formatMarkdown,
  formatSarif,
  formatText,
  lint,
  markdownText,
  plural,
  resolveConfig,
  runSummary,
  runSummaryLine,
  shareModels,
  showControls,
  showOnly,
  summaryLine,
  unreadProject,
  type LintResult,
  type ProjectRun,
  type ResolvedConfig,
  type RuleHelp,
} from "@pbiplint/core";
import type { CliOptions } from "./args.js";
import { findConfig, type FoundConfig } from "./config.js";
import { EXPLAIN_HINT, QUIET_NEXT, quietText } from "./quiet.js";
import type { NamedProject, ResolvedProject } from "./walk.js";

/** What a run takes from the command line, besides the path: the config, the gate, the rules shown. */
export interface RunOptions extends Pick<CliOptions, "config" | "failOn"> {
  /** The folder the CLI runs in; --config and every prefix are relative to it. */
  cwd: string;
  /** The --rule ids, checked, or none when the run shows every rule. */
  shownIds?: string[];
}

/** A project's SARIF prefixes: each part's root, relative to the cwd, forward slashes. */
export interface Prefixes {
  model?: string;
  report?: string;
}

/** A several-project run, ready to format: each project's run, and its SARIF prefixes. */
export interface SeveralRun {
  runs: ProjectRun[];
  prefixes: Prefixes[];
}

/**
 * The config a project's own run uses: --config when given, else the nearest pbiplint.config.json
 * from `start` up, with --fail-on over it. Both the one-project run and each project of several
 * find it this way.
 */
export function configFor(
  start: string,
  options: RunOptions,
): { found: FoundConfig; config: ResolvedConfig } {
  const found = findConfig(
    start,
    options.config ? resolve(options.cwd, options.config) : undefined,
  );
  return { found, config: resolvedFor(found, options) };
}

/** The config `found` holds, with --fail-on over it. */
const resolvedFor = (found: FoundConfig, options: RunOptions): ResolvedConfig =>
  resolveConfig({
    ...found.config,
    ...(options.failOn ? { failOn: options.failOn } : {}),
  });

/** The lint of a project the walk read, with what the walk could not read on its layers. */
export function lintProject(project: ResolvedProject, config: ResolvedConfig): Promise<LintResult> {
  const files = [...(project.model?.files ?? []), ...(project.report?.files ?? [])];
  return lint(files, {
    config,
    diagnostics: project.diagnostics,
    absent: project.absent,
    // Each part's own list, relative to its root, so what the walk could not read reaches the
    // layer it belongs to.
    unreadPaths: {
      ...(project.model ? { model: project.model.unread } : {}),
      ...(project.report ? { report: project.report.unread } : {}),
    },
  });
}

/**
 * A path relative to the cwd with forward slashes. SARIF artifact URIs are resolved from where the
 * tool ran, so each part's root, made relative this way, goes in front of that part's finding paths.
 */
export const fromCwd = (cwd: string, path: string): string =>
  relative(cwd, path).split("\\").join("/");

/** A read project's SARIF prefixes. */
export const prefixesOf = (cwd: string, project: ResolvedProject): Prefixes => ({
  ...(project.model ? { model: fromCwd(cwd, project.model.root) } : {}),
  ...(project.report ? { report: fromCwd(cwd, project.report.root) } : {}),
});

/**
 * Each project linted as its own run would lint it (spec section 4), its config from its own path
 * up, then the shared-model step, then --rule. The shared-model step goes first so that a later
 * project drops the shared model's findings before `showOnly` counts what is left, and the
 * whole-run totals stay exact. A project the walk could not read is a result of its own with one
 * PARSE_ISSUE finding (spec section 3.3), under its own config, as its run would have been;
 * its SARIF result points at its legacy file through that part's prefix. `folder` is the folder
 * named, which each project's path is relative to. `found` is each project's config file, in the
 * runs' order, so the caller can name a config's unknown rules once.
 */
export async function lintSeveral(
  folder: string,
  projects: NamedProject[],
  options: RunOptions,
): Promise<{ run: SeveralRun; found: FoundConfig[] }> {
  const found: FoundConfig[] = [];
  const prefixes: Prefixes[] = [];
  const linted: ProjectRun[] = [];
  for (const named of projects) {
    const { path, project, unreadable, modelKey, modelPath } = named;
    // A project that could not be read has no root, so its config is searched from its path.
    const file = findConfig(
      project?.root ?? resolve(folder, path),
      options.config ? resolve(options.cwd, options.config) : undefined,
    );
    found.push(file);
    const configPath = file.path === undefined ? undefined : fromCwd(options.cwd, file.path);
    // Several projects can each have a pbiplint.config.json, and core's refusal of one names none,
    // so it is named by its path from the cwd. Core checks a rule's options as lint binds them, so
    // the lint is inside too.
    let config: ResolvedConfig;
    let result: LintResult;
    try {
      config = resolvedFor(file, options);
      result = project ? await lintProject(project, config) : unreadProject(unreadable!, config);
    } catch (e) {
      if (!(e instanceof ConfigError) || configPath === undefined) throw e;
      throw new ConfigError(`${configPath}: ${e.message.replace(/^pbiplint\.config\.json: /, "")}`);
    }
    if (project) {
      prefixes.push(prefixesOf(options.cwd, project));
      linted.push({
        path,
        result,
        config,
        ...(modelKey === undefined ? {} : { modelKey }),
        ...(modelPath === undefined ? {} : { modelPath }),
        ...(configPath === undefined ? {} : { configPath }),
      });
    } else {
      const root = unreadable!.root;
      prefixes.push(root === undefined ? {} : { [unreadable!.layer]: fromCwd(options.cwd, root) });
      linted.push({
        path,
        result,
        config,
        ...(configPath === undefined ? {} : { configPath }),
      });
    }
  }
  const runs = shareModels(linted).map((r) =>
    options.shownIds ? { ...r, result: showOnly(r.result, options.shownIds, r.config) } : r,
  );
  return { run: { runs, prefixes }, found };
}

/** A project's counts, as its summary line gives them, without the files. */
const countsOf = (result: LintResult): string =>
  summaryLine(result).replace(` in ${plural(result.summary.files, "file")}`, "");

/** Whether any project has findings to list, and so a line naming the next step. */
const anyFindings = (runs: ProjectRun[]): boolean => runs.some((r) => r.result.groups.length > 0);

/**
 * The text format of several projects (spec section 6.1): the combined summary, a line for each
 * project, its path padded to the longest and its counts' numbers lined up, then each project as
 * `Project N of M: <path>` and its own text report, then the explain line once. A path comes
 * from the repository, so it is shown through `showControls`, and measured as shown.
 */
export function severalText({ runs }: SeveralRun): string {
  const paths = runs.map((r) => showControls(r.path));
  const counts = runs.map((r) => countsOf(r.result));
  const width = Math.max(...paths.map((p) => p.length));
  const lead = (c: string): number => c.indexOf(" ");
  const numbers = Math.max(...counts.map(lead));
  const out = [
    `pbiplint: ${runSummaryLine(runSummary(runs))}`,
    ...runs.map(
      (_, i) =>
        `  ${paths[i]!.padEnd(width)}  ${" ".repeat(numbers - lead(counts[i]!))}${counts[i]}`,
    ),
    "",
  ];
  // Each report ends with a line break, so joining them leaves a blank line before the next.
  runs.forEach((r, i) =>
    out.push(`Project ${i + 1} of ${runs.length}: ${paths[i]}`, formatText(r.result)),
  );
  if (anyFindings(runs)) out.push(EXPLAIN_HINT, "");
  return out.join("\n").trimEnd() + "\n";
}

/**
 * The quiet format of several projects (spec section 6.2): the combined summary, then for each
 * project a line `project <path>: <its summary>` and its quiet report after that report's summary
 * line, less its last line, the next step, which closes the whole report once.
 */
export function severalQuiet({ runs }: SeveralRun): string {
  const out = [`pbiplint: ${runSummaryLine(runSummary(runs))}`];
  for (const r of runs) {
    const own = quietText(r.result).trimEnd().split("\n").slice(1);
    if (r.result.groups.length > 0) own.pop();
    out.push(`project ${showControls(r.path)}: ${summaryLine(r.result)}`, ...own);
  }
  if (anyFindings(runs)) out.push(QUIET_NEXT);
  return out.join("\n") + "\n";
}

/**
 * The Markdown format of several projects (spec section 6.4): the title, the combined summary
 * sentence, a table of the projects, then each project as `## Project N of M: <path>` with its
 * own report one heading level down, less that report's title. A run kept to some rules counts
 * what it shows, out of all it found. A path is written as the format writes any text from the
 * input.
 */
export function severalMarkdown({ runs }: SeveralRun): string {
  const out = [
    "# pbiplint report",
    "",
    `${runSummaryLine(runSummary(runs))}.`,
    "",
    "| Project | Findings | Errors | Warnings | Info |",
    "|---|---|---|---|---|",
    ...runs.map(({ path, result: { summary } }) => {
      const k = summary.shown ?? summary;
      const findings = summary.shown ? `${k.findings} of ${summary.findings}` : `${k.findings}`;
      return `| ${markdownText(path, true)} | ${findings} | ${k.errors} | ${k.warnings} | ${k.infos} |`;
    }),
    "",
  ];
  runs.forEach((r, i) => {
    const body = formatMarkdown(r.result, { headingLevel: 2 });
    out.push(
      `## Project ${i + 1} of ${runs.length}: ${markdownText(r.path)}`,
      body.slice(body.indexOf("\n") + 1),
    );
  });
  return out.join("\n").trimEnd() + "\n";
}

/**
 * The JSON document of several projects (spec section 6.5): `version` 2, the tool, the combined
 * summary, and each project's own document without its `version` and `tool`, its path first.
 */
export function severalJson({ runs }: SeveralRun, toolVersion: string): string {
  const doc = {
    version: 2,
    tool: { name: "pbiplint", version: toolVersion },
    summary: runSummary(runs),
    projects: runs.map((r) => {
      const {
        version: _version,
        tool: _tool,
        ...own
      } = JSON.parse(formatJson(r.result, { toolVersion })) as Record<string, unknown>;
      return { path: r.path, ...own };
    }),
  };
  // No control character reaches a terminal the document is printed to, as in one project's.
  return escapeJsonControls(JSON.stringify(doc, null, 2)) + "\n";
}

interface SarifRun {
  tool: { driver: { rules: { id: string }[] } & Record<string, unknown> };
  invocations?: {
    executionSuccessful: boolean;
    toolExecutionNotifications: { message: { text: string } }[];
  }[];
  results: { ruleId: string; ruleIndex: number }[];
}

/**
 * The SARIF document of several projects (spec section 6.6): one run, as the Action and the Azure
 * task read only the first. Its rules are every project's, each listed once where it is first
 * seen; its results are every project's, each URI under that project's own prefixes and each
 * `ruleIndex` pointing into the merged rules. Its notifications are every project's, each message
 * naming its project first, as stderr does, since the path in it is relative to that project; the
 * run is unsuccessful when any project's is.
 */
export function severalSarif(
  { runs, prefixes }: SeveralRun,
  options: { toolVersion: string; help: Readonly<Record<string, RuleHelp>> },
): string {
  const docs = runs.map((r, i) => {
    const prefix = prefixes[i] ?? {};
    return JSON.parse(
      formatSarif(r.result, {
        toolVersion: options.toolVersion,
        pathPrefix: prefix.model ?? prefix.report ?? "",
        reportPathPrefix: prefix.report,
        help: options.help,
      }),
    ) as { runs: SarifRun[] } & Record<string, unknown>;
  });
  const rules: { id: string }[] = [];
  const index = new Map<string, number>();
  const results: SarifRun["results"] = [];
  const notifications: { message: { text: string } }[] = [];
  let invoked = false;
  let successful = true;
  docs.forEach((doc, i) => {
    const [own] = doc.runs;
    for (const rule of own!.tool.driver.rules)
      if (!index.has(rule.id)) index.set(rule.id, rules.push(rule) - 1);
    for (const res of own!.results) results.push({ ...res, ruleIndex: index.get(res.ruleId)! });
    for (const invocation of own!.invocations ?? []) {
      invoked = true;
      successful &&= invocation.executionSuccessful;
      for (const n of invocation.toolExecutionNotifications)
        notifications.push({ ...n, message: { text: `${runs[i]!.path}: ${n.message.text}` } });
    }
  });
  const [first] = docs;
  const run = {
    tool: { driver: { ...first!.runs[0]!.tool.driver, rules } },
    ...(invoked
      ? {
          invocations: [
            { executionSuccessful: successful, toolExecutionNotifications: notifications },
          ],
        }
      : {}),
    results,
  };
  return escapeJsonControls(JSON.stringify({ ...first, runs: [run] }, null, 2)) + "\n";
}
