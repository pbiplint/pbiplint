import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/** The bundled sample (packages/cli/sample after build) or the repo copy (examples/messy-sales) in development. */
export function sampleDir(): string {
  const here = dirname(fileURLToPath(import.meta.url));
  for (const candidate of [
    join(here, "..", "sample"),
    join(here, "..", "..", "sample"),
    join(here, "..", "..", "..", "examples", "messy-sales"),
  ]) {
    if (existsSync(join(candidate, "definition"))) return candidate;
  }
  throw new Error("Bundled sample project not found");
}
