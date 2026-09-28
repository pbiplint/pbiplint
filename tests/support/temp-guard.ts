import { mkdtempSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { TestProject } from "vitest/node";
import { removeTempDir } from "./temp-dir.js";

/** Every run's folder is named this, then the process id of the run, then random characters. */
const RUN = /^pbiplint-test-run-(\d+)-/;

/**
 * Vitest's global setup: one folder in the OS temp directory for the whole run, which tempDir
 * makes every test's folder in. At the end of the run the folder should be empty. Anything still
 * in it is a folder a test left behind, so the run fails naming each one, and the folder goes
 * anyway. A run of its own, rather than a count of the temp directory before and after, keeps a
 * second run at the same time from failing this one.
 */
export default function setup(project: TestProject): () => void {
  sweepDeadRuns();
  const root = mkdtempSync(join(tmpdir(), `pbiplint-test-run-${process.pid}-`));
  project.provide("tempRoot", root);
  return () => {
    // Vitest 5.0.2 and earlier leave a folder of their own behind on every run, about 10 MB of
    // the module copies they hand the test workers, named with 21 random characters and nothing
    // else (vitest-dev/vitest#11224). The fix, vitest-dev/vitest#11248, removes it when the run
    // closes; until a release that carries it is installed, it goes here. Teardown runs once the
    // last test has settled, so no worker reads from it again. Delete these lines with that bump.
    const vitestTmp = (project.vitest as unknown as { _tmpDir?: string })._tmpDir;
    if (vitestTmp) removeTempDir(vitestTmp);

    const left = readdirSync(root).sort();
    const problems: string[] = [];
    if (left.length > 0)
      problems.push(
        `${left.length} temp folder${left.length === 1 ? "" : "s"} left behind by a test: ${left.join(", ")}. Make them with tempDir from tests/support/temp-dir.ts, which removes each one when its test ends.`,
      );
    try {
      removeTempDir(root);
    } catch (e) {
      problems.push(`The run's temp folder ${root} could not be removed: ${(e as Error).message}`);
    }
    if (problems.length > 0) throw new Error(problems.join(" "));
  };
}

/**
 * Removes the folder of an earlier run whose process is gone: a run that was killed never
 * reached its teardown. A run still going, such as a watch session in another terminal, keeps
 * its folder. A folder that will not go is left for the next run to try again.
 */
function sweepDeadRuns(): void {
  for (const name of readdirSync(tmpdir())) {
    const pid = Number(RUN.exec(name)?.[1]);
    if (!pid || running(pid)) continue;
    try {
      removeTempDir(join(tmpdir(), name));
    } catch {
      // Not this run's to fail over.
    }
  }
}

function running(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    // EPERM is a process that is there but another user's.
    return (e as NodeJS.ErrnoException).code !== "ESRCH";
  }
}
