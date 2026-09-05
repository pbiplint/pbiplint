import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import type { PbiplintConfig } from "@pbiplint/core";
import { UsageError } from "./args.js";

export const CONFIG_FILE = "pbiplint.config.json";

export interface FoundConfig {
  path?: string;
  config: PbiplintConfig;
}

function readConfig(path: string): PbiplintConfig {
  try {
    return JSON.parse(readFileSync(path, "utf8")) as PbiplintConfig;
  } catch (e) {
    throw new UsageError(`Could not read ${path}: ${e instanceof Error ? e.message : String(e)}`);
  }
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
