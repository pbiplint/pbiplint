import { FORMATS, type FormatName, type SeverityName } from "@pbiplint/core";

export class UsageError extends Error {
  readonly #lines: readonly string[];
  constructor(message: string, lines: readonly string[] = []) {
    super(message);
    this.#lines = lines;
  }
  /**
   * What the message introduces, such as a list, one line each. main prints each on a line of its
   * own, its control characters shown, so nothing in one can write a line that reads as the CLI's.
   * A getter, so a usage error still compares equal to an Error with its message, as tests compare
   * them.
   */
  get lines(): readonly string[] {
    return this.#lines;
  }
}

export interface CliOptions {
  command: "lint" | "rules" | "explain" | "help" | "version";
  path?: string;
  /** The rule id `explain` was given. */
  ruleId?: string;
  format: FormatName;
  failOn?: SeverityName | "none";
  config?: string;
  output?: string;
  sample: boolean;
  /** --quiet: the summary and one line per rule. */
  quiet?: boolean;
  /** --rule, as typed, once per use. */
  rules?: string[];
}

const FAIL_ON = ["error", "warning", "info", "none"] as const;

export function parseArgs(argv: string[]): CliOptions {
  const opts: CliOptions = { command: "lint", format: "text", sample: false };
  const positional: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    let arg = argv[i]!;
    let inlineValue: string | undefined;
    const eq = arg.indexOf("=");
    if (arg.startsWith("--") && eq > 0) {
      inlineValue = arg.slice(eq + 1);
      arg = arg.slice(0, eq);
    }
    const value = (): string => {
      if (inlineValue !== undefined) return inlineValue;
      const v = argv[++i];
      if (v === undefined) throw new UsageError(`${arg} needs a value`);
      return v;
    };
    switch (arg) {
      case "--help":
      case "-h":
        return { ...opts, command: "help" };
      case "--version":
      case "-v":
        return { ...opts, command: "version" };
      case "--sample":
        opts.sample = true;
        break;
      case "--quiet":
      case "-q":
        opts.quiet = true;
        break;
      case "--rule":
        opts.rules = [...(opts.rules ?? []), value()];
        break;
      case "--format": {
        const f = value();
        if (!(FORMATS as readonly string[]).includes(f))
          throw new UsageError(`--format must be one of ${FORMATS.join(", ")}`);
        opts.format = f as FormatName;
        break;
      }
      case "--fail-on": {
        const f = value();
        if (!(FAIL_ON as readonly string[]).includes(f))
          throw new UsageError(`--fail-on must be one of ${FAIL_ON.join(", ")}`);
        opts.failOn = f as CliOptions["failOn"];
        break;
      }
      case "--config":
        opts.config = value();
        break;
      case "--output":
      case "-o":
        opts.output = value();
        break;
      default:
        if (arg.startsWith("-")) throw new UsageError(`Unknown option ${arg}`);
        positional.push(arg);
    }
  }
  if (positional[0] === "rules") {
    if (positional.length > 1) throw new UsageError("rules takes no arguments");
    return { ...opts, command: "rules" };
  }
  if (positional[0] === "explain") {
    if (positional.length === 1) throw new UsageError("explain needs a rule id");
    if (positional.length > 2) throw new UsageError("explain takes one rule id");
    if (opts.sample || opts.failOn || opts.config || opts.output || opts.quiet || opts.rules)
      throw new UsageError("explain takes only --format");
    if (opts.format !== "text" && opts.format !== "json")
      throw new UsageError("explain prints text or json");
    return { ...opts, command: "explain", ruleId: positional[1] };
  }
  if (opts.quiet && opts.format !== "text") throw new UsageError("--quiet is text only");
  if (positional.length > 1) throw new UsageError("Expected one path");
  if (positional.length === 1 && opts.sample)
    throw new UsageError("Give either a path or --sample, not both");
  if (positional.length === 0 && !opts.sample) {
    // Options with nothing to lint, as an empty $DIR gives, must not pass as a clean run.
    if (argv.length > 0) throw new UsageError("Give a path or --sample");
    return { ...opts, command: "help" };
  }
  if (positional.length === 1) opts.path = positional[0];
  return opts;
}

export const HELP = `Usage: pbiplint <path> [options]
       pbiplint --sample [options]
       pbiplint rules
       pbiplint explain <RULE_ID> [--format json]

Lint a Power BI project, its semantic model (TMDL) and its report (PBIR), for best-practice
violations. Either part alone is fine. Nothing is uploaded.

<path>              a PBIP folder, a .pbip file, a .SemanticModel folder, a .Report folder, a definition folder, or one .tmdl file
--sample            lint the bundled sample project instead of a path
--format <name>     text (default), json, sarif, markdown
--fail-on <level>   error (default), warning, info, none: lowest severity that exits 1
--config <file>     pbiplint.config.json to use (default: nearest one above the project)
--output <file>     write the report to a file instead of stdout (a one-line summary goes to stderr)
--quiet             the summary, then one line per rule with findings (text only)
--rule <RULE_ID>    show only this rule's findings (repeatable); --fail-on counts only these
--help, --version

Exit codes: 0 no findings at or above --fail-on, 1 findings, 2 a usage error, an input it cannot read, or nothing to lint.
With --format json, sarif, or markdown, stdout is one document and nothing else.
Notices and errors go to stderr; the text and Markdown reports also list notices.
What a script can rely on: https://pbiplint.com/cli/#contract
Rule pages: https://pbiplint.com/rules/
The pbiplint Privacy Promise: https://pbiplint.com/privacy/
`;
