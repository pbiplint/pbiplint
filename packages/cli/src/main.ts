import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import {
  ConfigError,
  defaultRules,
  formatResult,
  lint,
  resolveConfig,
  SEVERITY_LABEL,
} from "@pbiplint/core";
import { HELP, parseArgs, UsageError } from "./args.js";
import { findConfig } from "./config.js";
import { sampleDir } from "./sample.js";
import { resolveModel } from "./walk.js";

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
        `${r.id.padEnd(width)}  ${(r.status === "needsLiveModel" ? "needs live model" : r.status).padEnd(16)}  ${SEVERITY_LABEL[r.severity].padEnd(7)}  ${r.category.padEnd(18)}  ${r.name}`,
    )
    .join("\n");
}

export async function main(argv: string[], io: Io): Promise<number> {
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
    const model = resolveModel(target);
    const found = findConfig(model.root, opts.config ? resolve(io.cwd(), opts.config) : undefined);
    const config = resolveConfig({
      ...found.config,
      ...(opts.failOn ? { failOn: opts.failOn } : {}),
    });
    const result = lint(model.files, { config });
    // SARIF artifact URIs are resolved from where the tool ran, so they carry the model root's
    // path relative to the cwd in front of each model-relative finding path.
    const pathPrefix = relative(io.cwd(), model.root).split("\\").join("/");
    const report = formatResult(opts.format, result, { toolVersion: VERSION, pathPrefix });
    if (opts.output) {
      const out = resolve(io.cwd(), opts.output);
      mkdirSync(dirname(out), { recursive: true });
      writeFileSync(out, report);
    } else {
      io.stdout(report);
    }
    for (const e of result.summary.ruleErrors) io.stderr(`rule ${e.id} failed: ${e.message}\n`);
    return result.failed ? 1 : 0;
  } catch (e) {
    if (e instanceof UsageError || e instanceof ConfigError) {
      io.stderr(`pbiplint: ${e.message}\n`);
      if (e instanceof UsageError) io.stderr(`Run pbiplint --help for usage.\n`);
      return 2;
    }
    io.stderr(
      `pbiplint: unexpected error: ${e instanceof Error ? (e.stack ?? e.message) : String(e)}\n`,
    );
    return 2;
  }
}
