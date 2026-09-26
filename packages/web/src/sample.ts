// The test project (tsconfig.test.json) pulls this module in without the package's vite types,
// so name them here to keep import.meta.glob typed everywhere this file is checked.
/// <reference types="vite/client" />
import type { LintFile } from "@pbiplint/core";
import { emptyTree, isModelFolder, isReportFolder, type InputTree } from "./input/project-files.js";

// Vite inlines the sample into the bundle at build time; the page never fetches it. The globs are
// what a drop of examples/messy-sales reads: the model's .tmdl files and its .platform, the
// report's files as the CLI reads a report part (definition.pbir, .platform, and every JSON under
// its definition folder), the project's .pbip, and pbiplint.config.json. sample.test.ts walks the
// folder as the drop route does and holds the tree to it, so a file the globs miss fails there.
// Vite reads each call's options as a literal, so they are written out on each one.
const model = import.meta.glob(
  "../../../examples/messy-sales/*.SemanticModel/definition/**/*.tmdl",
  {
    query: "?raw",
    import: "default",
    eager: true,
  },
) as Record<string, string>;
const report = import.meta.glob(
  [
    "../../../examples/messy-sales/*.Report/definition.pbir",
    "../../../examples/messy-sales/*.Report/definition/**/*.json",
  ],
  { query: "?raw", import: "default", eager: true },
) as Record<string, string>;
// A dotfile needs `exhaustive`. Without it the production build matches no dotfile, even one the
// pattern names outright, while the test run's transform does, so the site's sample would lint one
// report file fewer than its tests. The e2e pins on the sample's counts are what catch that.
const reportPlatform = import.meta.glob("../../../examples/messy-sales/*.Report/.platform", {
  query: "?raw",
  import: "default",
  eager: true,
  exhaustive: true,
}) as Record<string, string>;
// The model's .platform is read by a drop and listed as not linted, so the tree holds it; lint never
// takes it (decision 5: it would count as a report file), so SAMPLE_FILES does not.
const modelPlatform = import.meta.glob("../../../examples/messy-sales/*.SemanticModel/.platform", {
  query: "?raw",
  import: "default",
  eager: true,
  exhaustive: true,
}) as Record<string, string>;
const project = import.meta.glob("../../../examples/messy-sales/*.pbip", {
  query: "?raw",
  import: "default",
  eager: true,
}) as Record<string, string>;
const config = import.meta.glob("../../../examples/messy-sales/pbiplint.config.json", {
  query: "?raw",
  import: "default",
  eager: true,
}) as Record<string, string>;

/** Where the sample's files sit in the repository. */
const SAMPLE_ROOT = "examples/messy-sales/";
/** The same files seen from examples/, as a drop of the project folder names them. */
const DROPPED_AS = "messy-sales/";

/** A glob key's path under the sample project; a key from anywhere else is refused, not sliced. */
function underSample(key: string): string {
  // indexOf gives -1 for a key from outside the project, and slicing from there would cut the key
  // at an offset that means nothing.
  const at = key.indexOf(SAMPLE_ROOT);
  if (at === -1) throw new Error(`Sample file outside the sample project: ${key}`);
  return key.slice(at + SAMPLE_ROOT.length);
}

/**
 * The globbed files as the page lints them: each part's files by their path relative to that part
 * (`definition/...`, `definition.pbir`), and the project file as `../<name>.pbip`, one level above
 * the report root. That is the path the CLI gives lint, so a finding on the project file reads the
 * same on both surfaces. The model's files come first and then the report's, as the CLI and
 * selectProject hand them to lint, each part sorted with an explicit locale so the list reads the
 * same whatever machine built the bundle. A file beside the parts belongs to neither and is
 * refused.
 */
export function sampleFiles(raw: Record<string, string>): LintFile[] {
  const byPath = (a: LintFile, b: LintFile): number => a.path.localeCompare(b.path, "en");
  const parts: Record<"model" | "report", LintFile[]> = { model: [], report: [] };
  for (const [key, text] of Object.entries(raw)) {
    const rel = underSample(key);
    const part = /^[^/]+\.(SemanticModel|Report)\/(.+)$/.exec(rel);
    if (part)
      parts[part[1] === "SemanticModel" ? "model" : "report"].push({ path: part[2]!, text });
    else if (rel.endsWith(".pbip") && !rel.includes("/"))
      parts.report.push({ path: `../${rel}`, text });
    else throw new Error(`Sample file outside the sample project: ${key}`);
  }
  return [...parts.model.sort(byPath), ...parts.report.sort(byPath)];
}

/**
 * The globbed files as a drop of examples/messy-sales gives them to selectProject: each path
 * relative to examples/, so the dropped folder, and the project root, is `messy-sales`, with the
 * .SemanticModel and .Report folders the walk would pass. The sample button runs this tree, so its
 * results and its "Files read" list are the drop's, made by the same code from the same files.
 */
export function sampleTree(raw: Record<string, string>): InputTree {
  const tree = emptyTree();
  const folders = new Set<string>();
  for (const [key, text] of Object.entries(raw)) {
    const path = DROPPED_AS + underSample(key);
    tree.entries.push({ path, text });
    const segments = path.split("/");
    for (let i = 1; i < segments.length; i++) folders.add(segments.slice(0, i).join("/"));
  }
  tree.entries.sort((a, b) => a.path.localeCompare(b.path, "en"));
  const sorted = [...folders].sort((a, b) => a.localeCompare(b, "en"));
  tree.modelFolders = sorted.filter(isModelFolder);
  tree.reportFolders = sorted.filter(isReportFolder);
  return tree;
}

/** examples/messy-sales as lint reads it: the model's files, then the report's, the .pbip among them. */
export const SAMPLE_FILES: LintFile[] = sampleFiles({
  ...model,
  ...report,
  ...reportPlatform,
  ...project,
});

/** The sample's pbiplint.config.json, which sets the policies its planted violations need. */
export const SAMPLE_CONFIG: string = (() => {
  const text = Object.values(config)[0];
  if (text === undefined) throw new Error("The sample project has no pbiplint.config.json");
  return text;
})();

/** examples/messy-sales as a drop of the folder reads it: the model's .platform and the config included. */
export const SAMPLE_TREE: InputTree = sampleTree({
  ...model,
  ...modelPlatform,
  ...report,
  ...reportPlatform,
  ...project,
  ...config,
});

export const SAMPLE_NAME = "the sample project";
