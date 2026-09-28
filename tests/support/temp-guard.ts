import { mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { TestProject } from "vitest/node";

/**
 * Vitest's global setup: one folder in the OS temp directory for the whole run, which tempDir
 * makes every test's folder in. At the end of the run the folder should be empty. Anything still
 * in it is a folder a test left behind, so the run fails naming each one, and the folder goes
 * anyway, so a failing run leaves nothing on disk either. A run of its own, rather than a count
 * of the temp directory before and after, keeps a second run at the same time from failing this
 * one.
 */
export default function setup(project: TestProject): () => void {
  const root = mkdtempSync(join(tmpdir(), "pbiplint-test-run-"));
  project.provide("tempRoot", root);
  return () => {
    const left = readdirSync(root).sort();
    rmSync(root, { recursive: true, force: true });
    if (left.length > 0)
      throw new Error(
        `${left.length} temp folder${left.length === 1 ? "" : "s"} left behind by a test: ${left.join(", ")}. Make them with tempDir from tests/support/temp-dir.ts, which removes each one when its test ends.`,
      );
  };
}
