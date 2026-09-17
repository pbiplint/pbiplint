// The test project (tsconfig.test.json) pulls this module in without the package's vite types,
// so name them here to keep import.meta.glob typed everywhere this file is checked.
/// <reference types="vite/client" />
import type { LintFile } from "@pbiplint/core";

// Vite inlines the sample's TMDL into the bundle at build time; the page never fetches it.
const raw = import.meta.glob("../../../examples/messy-sales/definition/**/*.tmdl", {
  query: "?raw",
  import: "default",
  eager: true,
}) as Record<string, string>;

const MODEL_ROOT = "definition/";

/**
 * The globbed files as the page lints them: each path from `definition/` on, sorted with an
 * explicit locale so the list reads the same whatever machine built the bundle. A key from outside
 * the definition folder is refused rather than sliced, since indexOf gives -1 for one and
 * slice(-1) would quietly turn the file into the last character of its name.
 */
export function sampleFiles(raw: Record<string, string>): LintFile[] {
  return Object.entries(raw)
    .map(([key, text]) => {
      const at = key.indexOf(MODEL_ROOT);
      if (at === -1) throw new Error(`Sample file outside the model definition folder: ${key}`);
      return { path: key.slice(at), text };
    })
    .sort((a, b) => a.path.localeCompare(b.path, "en"));
}

/** examples/messy-sales, the files `pbiplint --sample` lints, with paths relative to the model root. */
export const SAMPLE_FILES: LintFile[] = sampleFiles(raw);

export const SAMPLE_NAME = "the sample project";
