// The test project (tsconfig.test.json) pulls this module in without the package's vite types,
// so name them here to keep import.meta.glob typed everywhere this file is checked.
/// <reference types="vite/client" />
import type { LintFile } from "@pbiplint/core";

// Vite inlines the sample into the bundle at build time; the page never fetches it. The site's
// sample is the model alone until the browser reads reports: pull request 7 adds the report's
// files, the project file, and the config.
const raw = import.meta.glob("../../../examples/messy-sales/*.SemanticModel/definition/**/*.tmdl", {
  query: "?raw",
  import: "default",
  eager: true,
}) as Record<string, string>;

const SAMPLE_ROOT = "examples/messy-sales/";

/**
 * The globbed files as the page lints them: each part's files by their path relative to that part
 * (`definition/...`, `definition.pbir`), and the project file by its bare name, sorted with an
 * explicit locale so the list reads the same whatever machine built the bundle. A key from outside
 * the sample project is refused rather than sliced, since indexOf gives -1 for one and slicing
 * from there would cut the key at an offset that means nothing; so is a file beside the parts,
 * which belongs to neither.
 */
export function sampleFiles(raw: Record<string, string>): LintFile[] {
  return Object.entries(raw)
    .map(([key, text]) => {
      const at = key.indexOf(SAMPLE_ROOT);
      if (at === -1) throw new Error(`Sample file outside the sample project: ${key}`);
      const rel = key.slice(at + SAMPLE_ROOT.length);
      const part = /^[^/]+\.(SemanticModel|Report)\/(.+)$/.exec(rel);
      if (part) return { path: part[2]!, text };
      if (rel.endsWith(".pbip") && !rel.includes("/")) return { path: rel, text };
      throw new Error(`Sample file outside the sample project: ${key}`);
    })
    .sort((a, b) => a.path.localeCompare(b.path, "en"));
}

/** examples/messy-sales, the model files `pbiplint --sample` lints, with paths relative to the model root. */
export const SAMPLE_FILES: LintFile[] = sampleFiles(raw);

/** The sample's pbiplint.config.json; it joins the site's sample with the report's files in pull request 7. */
export const SAMPLE_CONFIG: string | undefined = undefined;

export const SAMPLE_NAME = "the sample project";

/** How many files each part contributes, for the results heading. */
export const sampleLayers = (files: LintFile[]): { model: number; report: number } => ({
  model: files.filter((f) => f.path.endsWith(".tmdl")).length,
  report: files.filter((f) => !f.path.endsWith(".tmdl")).length,
});
