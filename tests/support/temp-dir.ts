import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { inject, onTestFinished } from "vitest";

declare module "vitest" {
  export interface ProvidedContext {
    /** The folder temp-guard.ts made for this run, which every tempDir folder goes in. */
    tempRoot: string;
  }
}

/**
 * A new, empty folder for one test, removed when that test finishes, whether it passed or
 * failed. `name` starts the folder's name, so a folder the guard finds left behind still says
 * which test made it. A test that locks a file or folder in it restores the mode before it ends,
 * or the removal fails on it.
 */
export function tempDir(name: string): string {
  const dir = makeTempDir(name);
  onTestFinished(() => removeTempDir(dir));
  return dir;
}

/**
 * A new, empty folder the caller removes with removeTempDir: for a beforeAll, which runs outside
 * any one test, so its folder goes in the teardown the beforeAll returns.
 */
export function makeTempDir(name: string): string {
  return mkdtempSync(join(inject("tempRoot"), `${name}-`));
}

export function removeTempDir(dir: string): void {
  rmSync(dir, { recursive: true, force: true });
}
