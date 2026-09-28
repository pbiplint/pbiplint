import { chmodSync, lstatSync, readdirSync, rmSync } from "node:fs";
import { join } from "node:path";

/**
 * Removes `dir` and everything in it. Kept apart from temp-dir.ts, which imports vitest's test
 * API, so the global setup can use it without loading that API into the main process.
 */
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
  if (lstatSync(dir).isSymbolicLink()) return;
  chmodSync(dir, 0o755);
  for (const entry of readdirSync(dir, { withFileTypes: true }))
    if (entry.isDirectory()) unlock(join(dir, entry.name));
}
