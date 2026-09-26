import type { LintFile } from "../engine/lint.js";
import { datasetReferenceOf } from "../pbir/build.js";
import { readJson } from "../pbir/json.js";
import type { DatasetReference } from "../pbir/types.js";
import type { Diagnostic } from "./types.js";

export const isModelFile = (path: string): boolean => path.endsWith(".tmdl");

/** definition.pbir, .platform, a .pbip, or any JSON under a definition folder: the files a report is made of. */
export const isReportFile = (path: string): boolean =>
  path.endsWith("definition.pbir") ||
  path.endsWith(".platform") ||
  path.endsWith(".pbip") ||
  /(^|\/)definition\/.*\.json$/.test(path);

/**
 * Whether a file is a Power BI Desktop file, known by its name alone: one ending in `.pbix`,
 * compared without regard to case, as a folder's name is compared (spec section 4). pbiplint
 * never opens one.
 */
export const isPbix = (path: string): boolean => /\.pbix$/i.test(path);

/** How to save a report as a Power BI project, in the labels Learn gives the dialog and option. */
const SAVE_AS_PROJECT =
  "pbiplint reads a report saved as a Power BI project (PBIP). In Power BI Desktop, choose File > Save as and pick Power BI project files (*.pbip) as the file type (if it isn't offered, first turn on Power BI Project (.pbip) save option under File > Options and settings > Options > Preview features).";

/**
 * The refusal of an input of which nothing can be linted, and which nothing else explains, when
 * the walk met a .pbix (spec section 4): it names `path`, the first .pbix the walk met, counts the
 * `others` it met besides, and says how to save the report as a Power BI project. The CLI and the
 * browser both give it, so the words cannot drift. The steps and their labels are Learn's, from
 * the Power BI Desktop projects page,
 * https://learn.microsoft.com/en-us/power-bi/developer/projects/projects-overview ("Save as a
 * project" and "Enable preview features"). The preview option is a condition rather than a step:
 * Learn still calls the format a preview, while Microsoft has since announced it generally
 * available, so a newer Desktop may not show the option.
 */
export function pbixRefusal(path: string, others = 0): string {
  const what =
    others === 0
      ? `${path} is a Power BI Desktop file (.pbix)`
      : `${path} and ${others} other .pbix ${others === 1 ? "file" : "files"} are Power BI Desktop files`;
  return `${what}, which pbiplint cannot read. ${SAVE_AS_PROJECT}`;
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
 * on the skipped line, and the mismatch is a diagnostic besides.
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
  if (siblingModelFolder === undefined) return { useModel: false };
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
