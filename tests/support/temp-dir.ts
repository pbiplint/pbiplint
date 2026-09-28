import { mkdtempSync } from "node:fs";
import { join } from "node:path";
import { inject, onTestFinished } from "vitest";
import { removeTempDir } from "./remove-dir.js";

export { removeTempDir };

declare module "vitest" {
  export interface ProvidedContext {
    /** The folder temp-guard.ts made for this run, which every tempDir folder goes in. */
    tempRoot: string;
  }
}

/**
 * A new, empty folder for one test, removed when that test finishes, whether it passed or
 * failed. `name` starts the folder's name, so a folder the guard finds left behind still says
 * which test made it. A test that locks a file or folder in it restores the mode in a finally.
 */
export function tempDir(name: string): string {
  const dir = makeTempDir(name);
  onTestFinished(() => removeTempDir(dir));
  return dir;
}

/**
 * A new, empty folder the caller removes with removeTempDir: for a beforeAll, which runs outside
 * any one test.
 */
export function makeTempDir(name: string): string {
  return mkdtempSync(join(inject("tempRoot"), `${name}-`));
}
