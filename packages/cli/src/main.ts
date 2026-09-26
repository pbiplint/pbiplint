import { mkdirSync, writeFileSync } from "node:fs";
import { basename, dirname, relative, resolve } from "node:path";
import {
  ConfigError,
  defaultRules,
  formatResult,
  lint,
  resolveConfig,
  SEVERITY_LABEL,
  showControls,
  summaryLine,
} from "@pbiplint/core";
import { HELP, parseArgs, UsageError } from "./args.js";
import { CONFIG_FILE, findConfig } from "./config.js";
import { sampleDir } from "./sample.js";
import { RULE_HELP } from "./rule-help.data.js";
import { resolveProject } from "./walk.js";

declare const __PBIPLINT_VERSION__: string | undefined;
export const VERSION =
  typeof __PBIPLINT_VERSION__ === "string" ? __PBIPLINT_VERSION__ : "0.0.0-dev";

export interface Io {
  stdout(text: string): void;
  stderr(text: string): void;
  cwd(): string;
}

function listRules(): string {
  const width = Math.max(...defaultRules.map((r) => r.id.length));
  return defaultRules
    .map(
      (r) =>
        `${r.id.padEnd(width)}  ${r.layer.padEnd(7)}  ${(r.status === "needsLiveModel" ? "needs live model" : r.status).padEnd(16)}  ${SEVERITY_LABEL[r.severity].padEnd(7)}  ${r.category.padEnd(18)}  ${r.name}`,
    )
    .join("\n");
}

export async function main(argv: string[], io: Io): Promise<number> {
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
    const target = opts.sample ? sampleDir() : resolve(io.cwd(), opts.path!);
    const project = resolveProject(target);
    const found = findConfig(
      project.root,
      opts.config ? resolve(io.cwd(), opts.config) : undefined,
    );
    const config = resolveConfig({
      ...found.config,
      ...(opts.failOn ? { failOn: opts.failOn } : {}),
    });
    const files = [...(project.model?.files ?? []), ...(project.report?.files ?? [])];
    const result = lint(files, {
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
    // SARIF artifact URIs are resolved from where the tool ran, so each part's root, relative to
    // the cwd, goes in front of that part's finding paths.
    const prefix = (root: string | undefined): string | undefined =>
      root === undefined ? undefined : relative(io.cwd(), root).split("\\").join("/");
    const report = formatResult(opts.format, result, {
      toolVersion: VERSION,
      pathPrefix: prefix(project.model?.root) ?? prefix(project.report?.root) ?? "",
      reportPathPrefix: prefix(project.report?.root),
      help: RULE_HELP,
    });
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
      if (e instanceof UsageError) stderrLine(`Run pbiplint --help for usage.`);
      return 2;
    }
    for (const [i, line] of unexpectedLines(e).entries())
      stderrLine(i === 0 ? `pbiplint: unexpected error: ${line}` : line);
    return 2;
  }
}

/**
 * An unexpected error as lines for stderr: its name and message, then each frame of its stack. The
 * message can hold a line break of its own, so the stack is split only after the message, and the
 * name and message stay one line, where `showControls` shows the break as `\u000a` and no message
 * can write a line that reads as the CLI's. The stack starts with what `String(e)` gives, or with
 * the name and message where a stack formatter writes those alone (as the test runner's does); a
 * stack that starts with neither is shown whole on the one line.
 */
function unexpectedLines(e: unknown): string[] {
  const head = String(e);
  if (!(e instanceof Error) || typeof e.stack !== "string") return [head];
  const stack = e.stack;
  const header = [head, `${e.name}: ${e.message}`].find(
    (h) => stack === h || stack.startsWith(`${h}\n`),
  );
  if (header === undefined) return [stack];
  return stack === header ? [header] : [header, ...stack.slice(header.length + 1).split("\n")];
}
