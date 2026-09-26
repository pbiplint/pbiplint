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

/**
 * How to save a report as a Power BI project pbiplint can read, in the labels Learn gives the
 * menu path, the three preview options, and the file type. The PBIR and TMDL options are named
 * because, without them, a PBIP save writes a report.json report and a model.bim model: pbiplint
 * lints neither and gives the legacy-report-format and legacy-model-format notices instead.
 */
const SAVE_AS_PROJECT =
  "pbiplint reads a report saved as a Power BI project (PBIP). In Power BI Desktop, open File > Options and settings > Options > Preview features and turn on each of these it lists: Power BI Project (.pbip) save option, Store reports using enhanced metadata format (PBIR), and Store semantic model using TMDL format. Then choose File > Save as and pick Power BI project files (*.pbip) as the file type.";

/**
 * The refusal of an input of which nothing can be linted, and which nothing else explains, when
 * the walk met a .pbix (spec section 4): it names `path`, the first .pbix the walk met, counts the
 * `others` it met besides, and says how to save the report as a Power BI project. The CLI and the
 * browser both give it, so the words cannot drift. The steps and their labels are Learn's: the
 * menu paths, the file type, and Power BI Project (.pbip) save option from the Power BI Desktop
 * projects page ("Enable preview features" and "Save as a project"),
 * https://learn.microsoft.com/en-us/power-bi/developer/projects/projects-overview; Store reports
 * using enhanced metadata format (PBIR) from the report folder page ("Enable the PBIR format
 * preview feature"), https://learn.microsoft.com/en-us/power-bi/developer/projects/projects-report;
 * and Store semantic model using TMDL format from the semantic model folder page ("Enable TMDL
 * format Preview feature"),
 * https://learn.microsoft.com/en-us/power-bi/developer/projects/projects-dataset. Each option is
 * conditional ("each of these it lists"): Learn still calls each a preview, while Microsoft has
 * announced PBIP generally available with PBIR as its default (Microsoft 365 Message Center post
 * MC1465770, September 2, 2026, not on Learn), so a newer Desktop may list fewer of them.
 */
export function pbixRefusal(path: string, others = 0): string {
  const what =
    others === 0
      ? `${path} is a Power BI Desktop file (.pbix)`
      : `${path} and ${others} other .pbix ${others === 1 ? "file" : "files"} are Power BI Desktop files`;
  return `${what}, which pbiplint cannot read. ${SAVE_AS_PROJECT}`;
}

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
