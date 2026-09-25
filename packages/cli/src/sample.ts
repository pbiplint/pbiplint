import { existsSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/** True for a PBIP folder (a .SemanticModel or .Report child) or a bare model (a definition child). */
const looksLikeProject = (dir: string): boolean =>
  existsSync(dir) &&
  (readdirSync(dir).some((n) => n.endsWith(".SemanticModel") || n.endsWith(".Report")) ||
    existsSync(join(dir, "definition")));

/** The bundled sample (packages/cli/sample after build) or the repo copy (examples/messy-sales) in development. */
export function sampleDir(): string {
  const here = dirname(fileURLToPath(import.meta.url));
  for (const candidate of [
    join(here, "..", "sample"),
    join(here, "..", "..", "sample"),
    join(here, "..", "..", "..", "examples", "messy-sales"),
  ]) {
    if (looksLikeProject(candidate)) return candidate;
  }
  throw new Error("Bundled sample project not found");
}
