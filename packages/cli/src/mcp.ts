import { statSync } from "node:fs";
import { dirname, isAbsolute, resolve } from "node:path";
import type { Readable, Writable } from "node:stream";
import { McpServer } from "@modelcontextprotocol/server";
import { StdioServerTransport } from "@modelcontextprotocol/server/stdio";
import {
  defaultRules,
  escapeJsonControls,
  isConfigError,
  SEVERITY_LABEL,
  showControls,
} from "@pbiplint/core";
import { sameIdAs, type CustomRuleSet } from "@pbiplint/core/custom-rules";
import * as z from "zod/v4";
import { UsageError } from "./args.js";
import { findConfig, readCustomRuleFiles, type FoundConfig } from "./config.js";

/** What one run of the CLI printed and how it exited. */
export interface CliRun {
  code: number;
  stdout: string;
  stderr: string;
}

/**
 * Runs the CLI with argv, as `main` does, with its output captured; in `cwd` when given, else in
 * the server's folder.
 */
export type RunCli = (argv: string[], cwd?: string) => Promise<CliRun>;

/**
 * Every tool only reads: it lints, explains, or lists, and never writes a file or reaches the
 * network, so an app can approve each once rather than ask before every call.
 */
export const TOOL_ANNOTATIONS = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
} as const;

const INSTRUCTIONS =
  "pbiplint lints Power BI projects (PBIP): the semantic model's TMDL and the report's PBIR. " +
  "Everything runs on this machine; nothing is uploaded. Call lint with an absolute path to a " +
  "PBIP folder, a .pbip file, a .SemanticModel or .Report folder, or a .tmdl file. On a large " +
  "project, call it with quiet first for the counts per rule, then with rules for one rule's " +
  "findings, and explain_rule for how to fix a rule's findings. A folder that holds several " +
  "projects, such as a repository's root, is linted whole in one call: the JSON is version 2, " +
  "with each project under projects, and the quiet text opens each project with a `project ` line. " +
  "To write or check a team's custom rule, call custom_rules_reference for what a rule can use, " +
  "and give explain_rule and list_rules a path in the project to include the custom rules its " +
  "pbiplint.config.json names.";

export interface LintInput {
  path: string;
  quiet?: boolean;
  rules?: string[];
  failOn?: "error" | "warning" | "info" | "none";
}

/** The CLI arguments for the lint tool's input: the JSON document, or the quiet text. */
export function lintArgv(input: LintInput): string[] {
  // A relative path the CLI would read as an option or a command (rules, explain) stays a path.
  const path = isAbsolute(input.path) ? input.path : `./${input.path}`;
  const argv = [path, ...(input.quiet ? ["--quiet"] : ["--format", "json"])];
  for (const rule of input.rules ?? []) argv.push("--rule", rule);
  if (input.failOn) argv.push("--fail-on", input.failOn);
  return argv;
}

/**
 * Where the nearest config to `path` is looked for: the folder `path` names, or the folder of the
 * file it names, a relative path taken from `cwd`, the server's folder. A path that is not there
 * is refused with the CLI's message.
 */
export function configStart(path: string, cwd: string): string {
  const full = resolve(cwd, path);
  const stat = statSync(full, { throwIfNoEntry: false });
  if (stat === undefined) throw new UsageError(`${path} does not exist`);
  return stat.isDirectory() ? full : dirname(full);
}

/** One entry of list_rules, as it has always listed a built-in rule. */
const listed = (r: (typeof defaultRules)[number]) => ({
  id: r.id,
  name: r.name,
  layer: r.layer,
  status: r.status,
  severity: SEVERITY_LABEL[r.severity],
  category: r.category,
});

/**
 * The custom rules list_rules adds: each the config's files hold, at its own severity, apart from
 * an unchanged copy of a published rule, which runs as pbiplint's rule and is listed as that.
 * `replaces` names the pbiplint rule an edited copy runs in place of; `problem` is why the reader
 * could not read a rule.
 */
function customListed(custom: CustomRuleSet | undefined) {
  const own = new Set(defaultRules.map((r) => r.id.toUpperCase()));
  const byId = new Map(defaultRules.map((r) => [r.id.toUpperCase(), r.id]));
  return (custom?.rules ?? []).flatMap((r) => {
    const same = sameIdAs(r, own);
    if (same === "asBuiltIn") return [];
    const problem = r.custom?.readProblem;
    return [
      {
        ...listed(r),
        custom: true,
        ruleFile: r.custom?.file,
        ...(same === "replaces" ? { replaces: byId.get(r.id.toUpperCase()) } : {}),
        ...(problem === undefined ? {} : { problem }),
      },
    ];
  });
}

const text = (t: string, isError = false) => ({
  content: [{ type: "text" as const, text: t }],
  ...(isError ? { isError: true } : {}),
});

/**
 * A run's answer: what it printed on stdout when it ran (exit 0, or 1 for findings, which are an
 * answer and not a failure), or its stderr as an error when it could not (exit 2), so the
 * assistant reads the CLI's own message. The JSON document carries the run's notices, but a rule
 * that failed or a config naming no rule reaches only stderr, so stderr follows the answer.
 */
const answer = (run: CliRun) => {
  if (run.code === 2) return text(run.stderr.trim(), true);
  const out = text(run.stdout);
  if (run.stderr.trim()) out.content.push({ type: "text", text: run.stderr });
  return out;
};

/** A usage or config error as the CLI writes it to stderr: an error answer. */
function refused(e: unknown) {
  if (e instanceof UsageError || isConfigError(e))
    return text(`pbiplint: ${showControls(e.message)}`, true);
  throw e;
}

const pathInput = z
  .string()
  .optional()
  .describe(
    "A file or folder in the project, to include the custom rules its nearest pbiplint.config.json names; a relative path is taken from the folder the app started the server in",
  );

/**
 * `cwd` is the server's folder, which a relative `path` is taken from; the process's own unless
 * given.
 */
export function createServer(run: RunCli, version: string, cwd = process.cwd()): McpServer {
  const server = new McpServer({ name: "pbiplint", version }, { instructions: INSTRUCTIONS });
  /** The folder a path's config is looked for from, and the config found there. */
  const configAt = (path: string): { start: string; found: FoundConfig } => {
    const start = configStart(path, cwd);
    return { start, found: findConfig(start) };
  };
  server.registerTool(
    "lint",
    {
      title: "Lint a Power BI project",
      description:
        "Lint a Power BI project on this machine and return the findings as the JSON document " +
        "pbiplint --format json writes, or with quiet, a short summary with one line per rule. " +
        "Given a folder that holds several projects, it lints every one: the JSON is version 2, " +
        "with each project under projects, and the quiet text opens each with a `project ` line.",
      inputSchema: z.object({
        path: z
          .string()
          .describe(
            "Absolute path to a PBIP folder, a .pbip file, a .SemanticModel or .Report folder, a definition folder, or one .tmdl file",
          ),
        quiet: z
          .boolean()
          .optional()
          .describe(
            "The summary and one line per rule with findings, as text, in place of the JSON",
          ),
        rules: z
          .array(z.string())
          .optional()
          .describe("Show only these rules' findings, by rule id"),
        failOn: z
          .enum(["error", "warning", "info", "none"])
          .optional()
          .describe(
            "The lowest severity that counts as failing (default error, or the project's config)",
          ),
      }),
      annotations: TOOL_ANNOTATIONS,
    },
    async (input) => answer(await run(lintArgv(input))),
  );
  server.registerTool(
    "explain_rule",
    {
      title: "Explain a rule",
      description:
        "A rule's guidance as JSON: what it checks, why it matters, how to fix it, and when to ignore it.",
      inputSchema: z.object({
        ruleId: z.string().describe("The rule id, as in ENSURE_ALTTEXT"),
        path: pathInput,
      }),
      annotations: TOOL_ANNOTATIONS,
    },
    async ({ ruleId, path }) => {
      const argv = ["explain", ruleId, "--format", "json"];
      if (path === undefined) return answer(await run(argv));
      // Run from the path's folder too, so a path with no config above it never finds the one
      // above the server's folder.
      let at;
      try {
        at = configAt(path);
      } catch (e) {
        return refused(e);
      }
      const config = at.found.path === undefined ? [] : ["--config", at.found.path];
      return answer(await run([...argv, ...config], at.start));
    },
  );
  server.registerTool(
    "list_rules",
    {
      title: "List the rules",
      description: "Every rule pbiplint runs, with its layer, status, severity, and category.",
      inputSchema: z.object({ path: pathInput }),
      annotations: TOOL_ANNOTATIONS,
    },
    async ({ path }) => {
      if (path === undefined) return text(JSON.stringify(defaultRules.map(listed), null, 2) + "\n");
      try {
        const custom = readCustomRuleFiles(configAt(path).found);
        const rules = [...defaultRules.map(listed), ...customListed(custom)];
        // A custom rule's fields come from a team's file, so no control character reaches a
        // terminal, as in explain's JSON.
        return text(escapeJsonControls(JSON.stringify(rules, null, 2)) + "\n");
      } catch (e) {
        return refused(e);
      }
    },
  );
  server.registerTool(
    "custom_rules_reference",
    {
      title: "What a custom rule can use",
      description:
        "What a custom rule can use at the installed version: scopes, properties, functions, regular expressions, limits, and what pbiplint does not run, with the reason.",
      inputSchema: z.object({
        format: z
          .enum(["text", "json"])
          .optional()
          .describe(
            "text (default), or json for the document pbiplint reference --format json prints",
          ),
      }),
      annotations: TOOL_ANNOTATIONS,
    },
    async ({ format }) => answer(await run(["reference", "--format", format ?? "text"])),
  );
  return server;
}

export interface McpHandle {
  close(): Promise<void>;
}

/**
 * Serves the tools over stdio until the client closes stdin. The streams default to the
 * process's own; tests pass their own pair.
 */
export async function serveMcp(
  run: RunCli,
  streams: { stdin?: Readable; stdout?: Writable } = {},
  version = "0.0.0-dev",
  cwd?: string,
): Promise<McpHandle> {
  const server = createServer(run, version, cwd);
  const transport = new StdioServerTransport(streams.stdin, streams.stdout);
  await server.connect(transport);
  return { close: () => server.close() };
}
