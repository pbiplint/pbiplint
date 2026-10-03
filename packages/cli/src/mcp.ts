import { isAbsolute } from "node:path";
import type { Readable, Writable } from "node:stream";
import { McpServer } from "@modelcontextprotocol/server";
import { StdioServerTransport } from "@modelcontextprotocol/server/stdio";
import { defaultRules, SEVERITY_LABEL } from "@pbiplint/core";
import * as z from "zod/v4";

/** What one run of the CLI printed and how it exited. */
export interface CliRun {
  code: number;
  stdout: string;
  stderr: string;
}

/** Runs the CLI with argv, as `main` does, with its output captured. */
export type RunCli = (argv: string[]) => Promise<CliRun>;

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
  "findings, and explain_rule for how to fix a rule's findings.";

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

export function createServer(run: RunCli, version: string): McpServer {
  const server = new McpServer({ name: "pbiplint", version }, { instructions: INSTRUCTIONS });
  server.registerTool(
    "lint",
    {
      title: "Lint a Power BI project",
      description:
        "Lint a Power BI project on this machine and return the findings as the JSON document " +
        "pbiplint --format json writes, or with quiet, a short summary with one line per rule.",
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
      inputSchema: z.object({ ruleId: z.string().describe("The rule id, as in ENSURE_ALTTEXT") }),
      annotations: TOOL_ANNOTATIONS,
    },
    async ({ ruleId }) => answer(await run(["explain", ruleId, "--format", "json"])),
  );
  server.registerTool(
    "list_rules",
    {
      title: "List the rules",
      description: "Every rule pbiplint runs, with its layer, status, severity, and category.",
      inputSchema: z.object({}),
      annotations: TOOL_ANNOTATIONS,
    },
    async () =>
      text(
        JSON.stringify(
          defaultRules.map((r) => ({
            id: r.id,
            name: r.name,
            layer: r.layer,
            status: r.status,
            severity: SEVERITY_LABEL[r.severity],
            category: r.category,
          })),
          null,
          2,
        ) + "\n",
      ),
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
): Promise<McpHandle> {
  const server = createServer(run, version);
  const transport = new StdioServerTransport(streams.stdin, streams.stdout);
  await server.connect(transport);
  return { close: () => server.close() };
}
