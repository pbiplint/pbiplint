import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { ConfigError, isConfigError, resolveConfig, type PbiplintConfig } from "@pbiplint/core";
import { LIMITS, readCustomRules, type CustomRuleSet } from "@pbiplint/core/custom-rules";
import { UsageError } from "./args.js";

export const CONFIG_FILE = "pbiplint.config.json";

export interface FoundConfig {
  path?: string;
  config: PbiplintConfig;
}

function readConfig(path: string): PbiplintConfig {
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(path, "utf8"));
  } catch (e) {
    throw new UsageError(`Could not read ${path}: ${e instanceof Error ? e.message : String(e)}`);
  }
  // main spreads this into a fresh object before resolveConfig, which would hide core's
  // own guard, so a null, an array, or a scalar has to be rejected right here.
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed))
    throw new UsageError(`${path}: pbiplint.config.json must be a JSON object`);
  return parsed as PbiplintConfig;
}

/** `explicit` wins; otherwise walk up from `startDir` to the filesystem root looking for pbiplint.config.json. */
export function findConfig(startDir: string, explicit?: string): FoundConfig {
  if (explicit) {
    const path = resolve(explicit);
    if (!existsSync(path)) throw new UsageError(`${explicit} does not exist`);
    return { path, config: readConfig(path) };
  }
  let dir = resolve(startDir);
  for (;;) {
    const candidate = join(dir, CONFIG_FILE);
    if (existsSync(candidate)) return { path: candidate, config: readConfig(candidate) };
    const parent = dirname(dir);
    if (parent === dir) return { config: {} };
    dir = parent;
  }
}

/** A `customRules` entry as the output names it: forward slashes, no leading `./`. */
export const ruleFileName = (entry: string): string =>
  entry.replace(/\\/g, "/").replace(/^\.\//, "");

/** Node's code for an error it raised (`ENOENT`, `EACCES`), else the error's class. */
const codeOf = (e: unknown): string =>
  typeof (e as { code?: unknown })?.code === "string"
    ? (e as { code: string }).code
    : e instanceof Error
      ? e.name
      : "error";

/**
 * The custom rules the config's `customRules` names, each file read from the config's folder and
 * passed to the reader, or nothing when the config names none. Core reads no file, so this is where
 * they are read. A file's size is checked before it is read. One that cannot be found or read, a
 * folder, one over the size limit, and one the reader refuses whole each stop the project's lint
 * with a `ConfigError` naming the config and the entry, as a config that cannot be used does
 * (custom rules spec, section 3): a gate must never pass without the team's rules.
 */
export function readCustomRuleFiles(found: FoundConfig): CustomRuleSet | undefined {
  const entries = resolveConfig(found.config).customRules;
  if (entries.length === 0 || found.path === undefined) return undefined;
  const dir = dirname(found.path);
  const files = entries.map((entry) => {
    const name = ruleFileName(entry);
    const refuse = (why: string) =>
      new ConfigError(`pbiplint.config.json: customRules: ${name} ${why}`);
    const path = resolve(dir, name);
    let text: string;
    try {
      const stat = statSync(path);
      if (stat.isDirectory()) throw refuse("could not be read (EISDIR)");
      if (!stat.isFile()) throw refuse("could not be read (not a file)");
      if (stat.size > LIMITS.fileBytes)
        throw refuse(
          `is ${stat.size.toLocaleString("en")} bytes, over the limit of ${LIMITS.fileBytes.toLocaleString("en")} bytes for a rule file`,
        );
      text = readFileSync(path, "utf8");
    } catch (e) {
      if (isConfigError(e)) throw e;
      throw refuse(`could not be read (${codeOf(e)})`);
    }
    return { path: name, text };
  });
  return readCustomRules(files);
}
