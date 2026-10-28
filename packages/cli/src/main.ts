import { mkdirSync, writeFileSync } from "node:fs";
import { basename, dirname, resolve } from "node:path";
import {
  ConfigError,
  defaultRules,
  errorKind,
  formatResult,
  runSummary,
  runSummaryLine,
  SEVERITY_LABEL,
  showControls,
  showOnly,
  summaryLine,
} from "@pbiplint/core";
import { HELP, parseArgs, UsageError, type CliOptions } from "./args.js";
import { CONFIG_FILE } from "./config.js";
import { explainJson, explainRule, explainText, findRule, noRuleLines } from "./explain.js";
import { EXPLAIN_HINT, quietText } from "./quiet.js";
import {
  configFor,
  lintProject,
  lintSeveral,
  prefixesOf,
  severalJson,
  severalMarkdown,
  severalQuiet,
  severalSarif,
  severalText,
  type RunOptions,
} from "./several.js";
import { runSkill } from "./skill.js";
import { logSafe } from "./log-safe.js";
import { sampleDir } from "./sample.js";
import { RULE_HELP } from "./rule-help.data.js";
import { resolveInput, type NamedProject } from "./walk.js";

declare const __PBIPLINT_VERSION__: string | undefined;
export const VERSION =
  typeof __PBIPLINT_VERSION__ === "string" ? __PBIPLINT_VERSION__ : "0.0.0-dev";

export { EXPLAIN_HINT };

export interface Io {
  stdout(text: string): void;
  stderr(text: string): void;
  cwd(): string;
}

// The layer column fits the longest layer, powerquery.
function listRules(): string {
  const width = Math.max(...defaultRules.map((r) => r.id.length));
  return defaultRules
    .map(
      (r) =>
        `${r.id.padEnd(width)}  ${r.layer.padEnd(10)}  ${(r.status === "needsLiveModel" ? "needs live model" : r.status).padEnd(16)}  ${SEVERITY_LABEL[r.severity].padEnd(7)}  ${r.category.padEnd(18)}  ${r.name}`,
    )
    .join("\n");
}

/** One run of the CLI with its output captured, as `pbiplint mcp` runs it for each tool call. */
async function capture(argv: string[], cwd: string) {
  let stdout = "";
  let stderr = "";
  const code = await main(argv, {
    stdout: (s) => (stdout += s),
    stderr: (s) => (stderr += s),
    cwd: () => cwd,
  });
  return { code, stdout, stderr };
}

export async function main(argv: string[], given: Io): Promise<number> {
  // Everything written to stdout and stderr, and nothing written to a file with --output.
  const io: Io = {
    stdout: (text) => given.stdout(logSafe(text)),
    stderr: (text) => given.stderr(logSafe(text)),
    cwd: () => given.cwd(),
  };
  // Every line on stderr can carry a name or a path from the repository, so its control
  // characters are shown, not sent to the terminal; the line's own newline is kept.
  const stderrLine = (line: string): void => io.stderr(`${showControls(line)}\n`);
  try {
    const opts = parseArgs(argv);
    if (opts.command === "help") {
      io.stdout(HELP);
      return 0;
    }
    if (opts.command === "version") {
      io.stdout(`pbiplint ${VERSION}\n`);
      return 0;
    }
    if (opts.command === "rules") {
      io.stdout(listRules() + "\n");
      return 0;
    }
    if (opts.command === "skill") return runSkill(opts, io, stderrLine);
    if (opts.command === "mcp") {
      // Serves until the app closes stdin. Each tool runs this CLI with its output captured.
      const { serveMcp } = await import("./mcp.js");
      await serveMcp((argv) => capture(argv, given.cwd()), {}, VERSION);
      return 0;
    }
    if (opts.command === "explain") {
      const explained = explainRule(opts.ruleId!);
      if (!("rule" in explained)) {
        for (const line of noRuleLines(opts.ruleId!)) stderrLine(line);
        return 2;
      }
      io.stdout(opts.format === "json" ? explainJson(explained, VERSION) : explainText(explained));
      return 0;
    }
    // Each --rule id is checked before the walk, so a mistyped one costs no lint.
    const shownIds: string[] = [];
    for (const input of opts.rules ?? []) {
      const rule = findRule(input);
      if (!rule) {
        for (const line of noRuleLines(input)) stderrLine(line);
        return 2;
      }
      if (!shownIds.includes(rule.id)) shownIds.push(rule.id);
    }
    const target = opts.sample ? sampleDir() : resolve(io.cwd(), opts.path!);
    const input = resolveInput(target);
    const options: RunOptions = {
      cwd: io.cwd(),
      config: opts.config,
      failOn: opts.failOn,
      ...(opts.rules ? { shownIds } : {}),
    };
    if (input.kind === "several")
      return await several(target, input.projects, opts, options, io, stderrLine);
    const { project } = input;
    const { found, config } = configFor(project.root, options);
    const linted = await lintProject(project, config);
    const result = opts.rules ? showOnly(linted, shownIds, config) : linted;
    const prefix = prefixesOf(io.cwd(), project);
    const formatted = opts.quiet
      ? quietText(result)
      : formatResult(opts.format, result, {
          toolVersion: VERSION,
          pathPrefix: prefix.model ?? prefix.report ?? "",
          reportPathPrefix: prefix.report,
          help: RULE_HELP,
        });
    // The text format is for a person or an assistant reading a terminal, so with findings it
    // ends by naming where each rule's guidance is. Core names no CLI command, so the line is added here.
    const report =
      opts.format === "text" && !opts.quiet && result.groups.length > 0
        ? `${formatted.trimEnd()}\n\n${EXPLAIN_HINT}\n`
        : formatted;
    if (opts.output) {
      const out = resolve(io.cwd(), opts.output);
      mkdirSync(dirname(out), { recursive: true });
      writeFileSync(out, report);
      // The report left stdout, so say what it holds and where it went.
      stderrLine(`pbiplint: ${summaryLine(result)}, wrote ${opts.output}`);
    } else {
      io.stdout(report);
    }
    for (const e of result.summary.ruleErrors) stderrLine(`rule ${e.id} failed: ${e.message}`);
    // A misspelled id would otherwise switch nothing off and say nothing, so name each one.
    const configName = basename(found.path ?? CONFIG_FILE);
    for (const id of result.summary.unknownRules)
      stderrLine(
        `pbiplint: ${configName}: no rule named "${id}" (run pbiplint rules for the list)`,
      );
    for (const d of result.diagnostics) stderrLine(`pbiplint: notice: ${d.message}`);
    return result.failed ? 1 : 0;
  } catch (e) {
    if (e instanceof UsageError || e instanceof ConfigError) {
      stderrLine(`pbiplint: ${e.message}`);
      if (e instanceof UsageError) {
        for (const line of e.lines) stderrLine(line);
        stderrLine(`Run pbiplint --help for usage.`);
      }
      return 2;
    }
    for (const [i, line] of unexpectedLines(e).entries())
      stderrLine(i === 0 ? `pbiplint: unexpected error: ${line}` : line);
    return 2;
  }
}

/**
 * A run over a folder that holds several projects (#237): each linted as its own run would be,
 * the report of them all on stdout or in --output, then stderr's lines, in a one-project run's
 * order, each naming its project, since a path in one is relative to that project. A config's
 * unknown rule ids are named once per config file, by its path from the cwd, as several files
 * can share one name. The exit code is 1 when any project fails its gate.
 */
async function several(
  folder: string,
  projects: NamedProject[],
  opts: CliOptions,
  options: RunOptions,
  io: Io,
  stderrLine: (line: string) => void,
): Promise<number> {
  const { run, found } = await lintSeveral(folder, projects, options);
  const formats = {
    text: () => severalText(run),
    json: () => severalJson(run, VERSION),
    markdown: () => severalMarkdown(run),
    sarif: () => severalSarif(run, { toolVersion: VERSION, help: RULE_HELP }),
  };
  const report = opts.quiet ? severalQuiet(run) : formats[opts.format]();
  const { runs } = run;
  if (opts.output) {
    const out = resolve(io.cwd(), opts.output);
    mkdirSync(dirname(out), { recursive: true });
    writeFileSync(out, report);
    stderrLine(`pbiplint: ${runSummaryLine(runSummary(runs))}, wrote ${opts.output}`);
  } else {
    io.stdout(report);
  }
  for (const { path, result } of runs)
    for (const e of result.summary.ruleErrors)
      stderrLine(`${path}: rule ${e.id} failed: ${e.message}`);
  // Each config file's unknown ids, gathered from every project that used it: a project that
  // could not be read binds only PARSE_ISSUE, so it names none of its config's.
  const unknown = new Map<string | undefined, { name: string; ids: Set<string> }>();
  runs.forEach(({ result, configPath }, i) => {
    const file = found[i]!.path;
    const entry = unknown.get(file) ?? { name: configPath ?? CONFIG_FILE, ids: new Set() };
    unknown.set(file, entry);
    for (const id of result.summary.unknownRules) entry.ids.add(id);
  });
  for (const { name, ids } of unknown.values())
    for (const id of ids)
      stderrLine(`pbiplint: ${name}: no rule named "${id}" (run pbiplint rules for the list)`);
  for (const { path, result } of runs)
    for (const d of result.diagnostics) stderrLine(`pbiplint: notice: ${path}: ${d.message}`);
  return runs.some((r) => r.result.failed) ? 1 : 0;
}

/** True for an error Node itself raised: it carries a string `code` (`ENOENT`, `EACCES`). */
const isNodeError = (e: unknown): e is Error & { code: string } =>
  e instanceof Error && typeof (e as { code?: unknown }).code === "string";

/**
 * An unexpected error as lines for stderr, then each frame of its stack. Node's own error keeps its
 * name and message, which describe the system and the path the user typed. Any other error, such
 * as one out of `lint`, can carry the model's text in its message, so it gives only its class,
 * through `errorKind`, and a request to report it (v3 spec, section 11.3; pb-coord, October 28,
 * 2026). The message can hold a line break of its own, so the stack is split only after the
 * message: Node's name and message stay one line, where `showControls` shows the break as
 * `\u000a` and no message can write a line that reads as the CLI's. The stack starts with what
 * `String(e)` gives, or with the name and message where a stack formatter writes those alone (as
 * the test runner's does). A stack that starts with neither is shown whole on the one line for
 * Node's error, and left out for any other.
 */
function unexpectedLines(e: unknown): string[] {
  const node = isNodeError(e);
  const head = node
    ? String(e)
    : `${errorKind(e)}. Please report this at https://github.com/pbiplint/pbiplint/issues.`;
  if (!(e instanceof Error) || typeof e.stack !== "string") return [head];
  const stack = e.stack;
  const header = [String(e), `${e.name}: ${e.message}`].find(
    (h) => stack === h || stack.startsWith(`${h}\n`),
  );
  if (header === undefined) return node ? [stack] : [head];
  const first = node ? header : head;
  return stack === header ? [first] : [first, ...stack.slice(header.length + 1).split("\n")];
}
