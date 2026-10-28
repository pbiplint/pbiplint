import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/** A folder under the OS temp directory, built by `fill` for one test and removed after it. */
export async function withTempFolder(
  prefix: string,
  fill: (dir: string) => void,
  use: (dir: string) => Promise<void>,
): Promise<void> {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  try {
    fill(dir);
    await use(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
