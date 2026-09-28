import { chmodSync, mkdtempSync, readdirSync, rmSync } from "node:fs";
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

export function removeTempDir(dir: string): void {
  try {
    rmSync(dir, { recursive: true, force: true });
  } catch {
    // A folder at mode 000 cannot be emptied, which is how a test that timed out, or forgot its
    // finally, leaves one. Opening every folder first lets the removal through.
    unlock(dir);
    rmSync(dir, { recursive: true, force: true });
  }
}

/** Gives `dir` and every folder under it the mode a new folder has, never following a link. */
function unlock(dir: string): void {
  chmodSync(dir, 0o755);
  for (const entry of readdirSync(dir, { withFileTypes: true }))
    if (entry.isDirectory()) unlock(join(dir, entry.name));
}
