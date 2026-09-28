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
    // Vitest 5.0.2 and earlier leave a folder of their own behind on every run, about 10 MB of
    // the module copies they hand the test workers, named with 21 random characters and nothing
    // else (vitest-dev/vitest#11224). The fix, vitest-dev/vitest#11248, removes it when the run
    // closes; until a release that carries it is installed, it goes here. Teardown runs once the
    // last test has settled, so no worker reads from it again. Delete these lines with that bump.
    const vitestTmp = (project.vitest as unknown as { _tmpDir?: string })._tmpDir;
    if (vitestTmp) rmSync(vitestTmp, { recursive: true, force: true });

    const left = readdirSync(root).sort();
    rmSync(root, { recursive: true, force: true });
    if (left.length > 0)
      throw new Error(
        `${left.length} temp folder${left.length === 1 ? "" : "s"} left behind by a test: ${left.join(", ")}. Make them with tempDir from tests/support/temp-dir.ts, which removes each one when its test ends.`,
      );
  };
}
