import type { LintFile } from "../engine/lint.js";
import { datasetReferenceOf } from "../pbir/build.js";
import { readJson } from "../pbir/json.js";
import type { DatasetReference } from "../pbir/types.js";
import type { Diagnostic } from "./types.js";

export const isModelFile = (path: string): boolean => path.endsWith(".tmdl");

/**
 * definition.pbir, .platform, a .pbip, or any JSON under a definition folder: the files a report is
 * made of. definition.pbir and .platform are known by their whole names, so `old.definition.pbir`
 * is not one. One below the report root is routed to the report too, where buildReport checks
 * that it parses but reads nothing from it: only the report's own, at its root, says anything.
 */
export const isReportFile = (path: string): boolean =>
  /(^|\/)(definition\.pbir|\.platform)$/.test(path) ||
  path.endsWith(".pbip") ||
  /(^|\/)definition\/.*\.json$/.test(path);

/**
 * Whether a file is a Power BI Desktop file, known by its name alone: one ending in `.pbix`,
 * compared without regard to case, as a folder's name is compared (spec section 4). pbiplint
 * never opens one.
 */
export const isPbix = (path: string): boolean => /\.pbix$/i.test(path);

/** "Save as a project" on Learn's Power BI Desktop projects page. */
const SAVE_AS_PROJECT_URL =
  "https://learn.microsoft.com/power-bi/developer/projects/projects-overview#save-as-a-project";
/** "Convert existing report to PBIR" on Learn's report folder page. */
const CONVERT_TO_PBIR_URL =
  "https://learn.microsoft.com/power-bi/developer/projects/projects-report#convert-existing-report-to-pbir";

/**
 * The Learn sections pbiplint's messages link, in the order the .pbix message and the legacy
 * report notice give them. Exported so the site links exactly these and nothing else in a message
 * it shows. Each message ends with its URL, since a terminal's link detection can take a trailing
 * period into the link.
 */
export const LEARN_HELP_URLS: readonly string[] = Object.freeze([
  SAVE_AS_PROJECT_URL,
  CONVERT_TO_PBIR_URL,
]);

/**
 * The name 0.2.0 exported the .pbix message's Learn URLs under, kept until 0.3.0. Learn dropped
 * the preview sections it listed on September 23, 2026, so it now gives LEARN_HELP_URLS.
 *
 * @deprecated Use LEARN_HELP_URLS. PBIP_PREVIEW_HELP_URLS will be removed in 0.3.0.
 */
export const PBIP_PREVIEW_HELP_URLS: readonly string[] = LEARN_HELP_URLS;

/**
 * How to save a report as a Power BI project pbiplint can read. The menu path and the file type
 * are Learn's labels ("Save as a project" on the projects page), and that section follows. The
 * message used to add a condition on preview options and link Learn's three sections on them;
 * Learn dropped those sections on September 23, 2026, when PBIR became Desktop's default.
 */
const SAVE_AS_PROJECT = `pbiplint reads a report saved as a Power BI project (PBIP). In Power BI Desktop, choose File > Save as and pick Power BI project files (*.pbip) as the file type. See Microsoft Learn: ${SAVE_AS_PROJECT_URL}`;

/**
 * The refusal of an input of which nothing can be linted, and which nothing else explains, when
 * the walk met a .pbix (spec section 4): it names `path`, the first .pbix the walk met, counts the
 * `others` it met besides, and says how to save the report as a Power BI project
 * (SAVE_AS_PROJECT). The CLI and the browser both give it, so the words cannot drift: the CLI
 * prints it as text, and the site links the URL it ends with, one of LEARN_HELP_URLS.
 */
export function pbixRefusal(path: string, others = 0): string {
  const what =
    others === 0
      ? `${path} is a Power BI Desktop file (.pbix)`
      : `${path} and ${others} other .pbix ${others === 1 ? "file" : "files"} are Power BI Desktop files`;
  return `${what}, which pbiplint cannot read. ${SAVE_AS_PROJECT}`;
}

/**
 * The notice for a `.Report` folder saved in the legacy format, a single report.json, which the
 * CLI and the browser both give, so the words cannot drift. Learn's report folder page says PBIR
 * is Desktop's default and that editing and saving a PBIR-Legacy report converts it, which Desktop
 * released before September 2026 does not do; its section on that ends the notice, and the site
 * links it.
 */
export function legacyReportNotice(name: string): Diagnostic {
  return {
    kind: "legacy-report-format",
    path: name,
    message: `${name} is stored as a single report.json (PBIR-Legacy), which pbiplint cannot read. Power BI Desktop converts it to PBIR when you edit and save it, in releases from September 2026 on. See Microsoft Learn: ${CONVERT_TO_PBIR_URL}`,
  };
}

/**
 * The notice for a `.SemanticModel` folder saved in the legacy format, model.bim, as the CLI and
 * the browser both give it. Learn's semantic model folder page no longer says how to move a model
 * from model.bim to TMDL, so the notice links nothing.
 */
export function legacyModelNotice(name: string): Diagnostic {
  return {
    kind: "legacy-model-format",
    path: name,
    message: `${name} is stored as model.bim, which pbiplint cannot read; save it in the TMDL format from Power BI Desktop`,
  };
}

/** Why the report layer is absent when the report is saved as report.json. */
export const LEGACY_REPORT_REASON = "the report is saved in the legacy report.json format";
/** Why the model layer is absent when the model is saved as model.bim. */
export const LEGACY_MODEL_REASON = "the model is saved in the legacy model.bim format";

/** "A", "A and B", "A, B, and C". */
const listOf = (items: string[]): string =>
  items.length <= 2 ? items.join(" and ") : `${items.slice(0, -1).join(", ")}, and ${items.at(-1)}`;

// The cause is offered, not asserted: the folder may as well be empty or half copied.
const TMDL_ONLY =
  "Only a model stored as TMDL can be linted; if it is in the older model.bim format, save it in the TMDL format from Power BI Desktop first.";

/** "<folders> hold(s) no .tmdl files", the folders listed in the order given. */
const holdNoTmdl = (folders: string[]): string =>
  `${listOf(folders)} hold${folders.length === 1 ? "s" : ""} no .tmdl files`;

/**
 * The refusal of an input of which nothing can be linted, no read refused, and no notice explains
 * why, when one or more `.SemanticModel` folders the walk met hold no .tmdl files (spec section
 * 4): it names each of `folders`, in the order given, and says only a model stored as TMDL can be
 * linted. It comes ahead of pbixRefusal. The CLI and the browser both give it, so the words cannot
 * drift: the CLI names each folder joined to its input, the browser relative to the drop, and each
 * gives them in name order.
 */
export function noTmdlRefusal(folders: string[]): string {
  return `${holdNoTmdl(folders)}. ${TMDL_ONLY}`;
}

/**
 * The browser's note for the same folders when something else in the drop is linted: they were
 * not, and why. The CLI has no notes; built here beside the refusal so the two say the same.
 */
export function noTmdlNote(folders: string[]): string {
  return `${holdNoTmdl(folders)} and ${folders.length === 1 ? "was" : "were"} not linted. ${TMDL_ONLY}`;
}

/** Files route by path: TMDL to the model, report JSON to the report, anything else nowhere. */
export function routeFiles(files: LintFile[]): { model: LintFile[]; report: LintFile[] } {
  return {
    model: files.filter((f) => isModelFile(f.path)),
    report: files.filter((f) => !isModelFile(f.path) && isReportFile(f.path)),
  };
}

/** The dataset reference in a definition.pbir, read without the rest of the report. */
export function datasetReference(pbirText: string): DatasetReference {
  return datasetReferenceOf(readJson("definition.pbir", pbirText).json);
}

export interface PairingDecision {
  useModel: boolean;
  /** Why the model layer is left out, for the skipped line. */
  reason?: string;
  diagnostic?: Diagnostic;
}

/**
 * Whether the model beside a report is the one the report reads (spec section 4). The CLI and
 * the browser both call this, so the two surfaces decide alike: byPath naming the sibling pairs
 * them; byConnection, or byPath naming something else, makes it a report-only run with the reason
 * on the skipped line, and the mismatch is a diagnostic besides. With no model beside the report
 * read, byPath still gives the reason, naming the path, so the reader knows what to lint with it.
 * It says only that this run did not include that model: the folder may be outside the input, not
 * there at all, beside the report and holding no .tmdl files, or deeper in the input than the walk
 * looks for a part.
 */
export function pairingDecision(
  ref: DatasetReference,
  siblingModelFolder: string | undefined,
  reportFolder: string,
): PairingDecision {
  // What the report itself says comes first: a report bound to a published model reads one whether
  // or not a model sits beside it, and the skipped line has a reason to give either way.
  if (ref.kind === "byConnection")
    return { useModel: false, reason: "this report reads a published model" };
  if (siblingModelFolder === undefined)
    return ref.kind === "byPath" && ref.path.trim() !== ""
      ? { useModel: false, reason: `this report reads ${ref.path}, which this run did not include` }
      : { useModel: false };
  if (ref.kind === "none") return { useModel: true };
  const named = ref.path.replace(/\\/g, "/").replace(/\/+$/, "").split("/").pop() ?? "";
  // Windows and macOS file systems compare names without regard to case by default, so a path
  // written in another case still names the folder beside the report.
  if (named.toLowerCase() === siblingModelFolder.toLowerCase()) return { useModel: true };
  return {
    useModel: false,
    reason: `this report reads a model outside the input (${ref.path})`,
    diagnostic: {
      kind: "model-reference-mismatch",
      path: `${reportFolder}/definition.pbir`,
      message: `${reportFolder}/definition.pbir points at ${ref.path}, not at ${siblingModelFolder} beside it, so the model was not paired with this report`,
    },
  };
}
