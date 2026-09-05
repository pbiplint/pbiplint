import { FORMATS, type FormatName, type SeverityName } from "@pbiplint/core";

export class UsageError extends Error {}

export interface CliOptions {
  command: "lint" | "rules" | "help" | "version";
  path?: string;
  format: FormatName;
  failOn?: SeverityName | "none";
  config?: string;
  output?: string;
  sample: boolean;
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
  if (positional.length > 1) throw new UsageError("Expected one path");
  if (positional.length === 1 && opts.sample)
    throw new UsageError("Give either a path or --sample, not both");
  if (positional.length === 0 && !opts.sample) return { ...opts, command: "help" };
  if (positional.length === 1) opts.path = positional[0];
  return opts;
}

export const HELP = `Usage: pbiplint <path> [options]
       pbiplint --sample [options]
       pbiplint rules

Lint a Power BI semantic model (TMDL) for best-practice violations. Nothing is uploaded.

<path>              a .SemanticModel folder, a PBIP folder, a definition folder, or one .tmdl file
--sample            lint the bundled sample project instead of a path
--format <name>     text (default), json, sarif, markdown
--fail-on <level>   error (default), warning, info, none: lowest severity that exits 1
--config <file>     pbiplint.config.json to use (default: nearest one above the model)
--output <file>     write the report to a file instead of stdout
--help, --version

Exit codes: 0 no findings at or above --fail-on, 1 findings, 2 usage or input error.
Rule pages: https://pbiplint.com/rules/
`;
