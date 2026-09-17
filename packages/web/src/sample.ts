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

/** examples/messy-sales, the files `pbiplint --sample` lints, with paths relative to the model root. */
export const SAMPLE_FILES: LintFile[] = Object.entries(raw)
  .map(([key, text]) => ({ path: key.slice(key.indexOf("definition/")), text }))
  .sort((a, b) => a.path.localeCompare(b.path, "en"));

export const SAMPLE_NAME = "the sample project";
