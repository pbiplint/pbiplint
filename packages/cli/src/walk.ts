import { accessSync, constants, readdirSync, readFileSync, statSync, type Stats } from "node:fs";
import { basename, dirname, join, relative, resolve } from "node:path";
import {
  datasetReference,
  pairingDecision,
  type Diagnostic,
  type LayerName,
  type LintFile,
} from "@pbiplint/core";
import { UsageError } from "./args.js";

export interface ResolvedPart {
  /** Absolute path the part's finding locations are relative to. */
  root: string;
  files: LintFile[];
}

export interface ResolvedProject {
  /** The folder the config search starts from: the project folder, or the one part given. */
  root: string;
  model?: ResolvedPart;
  report?: ResolvedPart;
  /** Why a layer was left out, per layer. */
  absent: Partial<Record<LayerName, string>>;
  diagnostics: Diagnostic[];
}

export const EXPECTED_INPUT =
  "a PBIP folder, a .pbip file, a .SemanticModel folder, a .Report folder, a definition folder, or one .tmdl file";

/** Folders never read: Desktop's caches, git, packages, and a report's resources and custom visuals. */
const SKIP_DIRS = new Set([".git", ".pbi", "node_modules", "StaticResources", "CustomVisuals"]);

const toPosix = (p: string): string => p.split("\\").join("/");

type SystemError = NodeJS.ErrnoException & { code: string; syscall: string };

/** An error the operating system reported (EACCES, EISDIR, ELOOP, and the like), not a bug. */
const isSystemError = (e: unknown): e is SystemError =>
  e instanceof Error &&
  typeof (e as NodeJS.ErrnoException).code === "string" &&
  typeof (e as NodeJS.ErrnoException).syscall === "string";

/**
 * The operating system's reason, as "EACCES: permission denied". Node's message goes on to name
 * the call and the path ("..., scandir '/x'"), which the caller names in its own words.
 */
function reasonOf(e: SystemError): string {
  const end = e.message.indexOf(`, ${e.syscall}`);
  return end > 0 ? e.message.slice(0, end) : e.message;
}

/** A missing entry is simply not there; anything else the operating system refuses is thrown. */
const statOf = (p: string): Stats | undefined => statSync(p, { throwIfNoEntry: false });
const isDir = (p: string): boolean => statOf(p)?.isDirectory() ?? false;
const isFile = (p: string): boolean => statOf(p)?.isFile() ?? false;
const byName = (a: string, b: string): number => a.localeCompare(b, "en");

/** One walk under the input: where a notice's path starts, and the project it adds to. */
interface Walk {
  /** The folder the input names; a notice's path is relative to it. */
  base: string;
  project: ResolvedProject;
}

/**
 * The `unread-file` notice (spec section 4) for a file or folder below the input that the
 * operating system refused. A part given on its own is walked once for the model and once for the
 * report, so each path is named once.
 */
function unread(w: Walk, p: string, e: SystemError): void {
  const path = toPosix(relative(w.base, p));
  if (w.project.diagnostics.some((d) => d.kind === "unread-file" && d.path === path)) return;
  w.project.diagnostics.push({
    kind: "unread-file",
    path,
    message: `${path} could not be read (${reasonOf(e)}), so it was not linted`,
  });
}

/** `call` on `p`, below the input: what the operating system refuses is a notice, and the walk goes on. */
function attempt<T>(w: Walk, p: string, call: () => T): T | undefined {
  try {
    return call();
  } catch (e) {
    if (!isSystemError(e)) throw e;
    unread(w, p, e);
    return undefined;
  }
}

/**
 * Every file under `dir` that `keep` accepts. Listing `dir` itself is the caller's to answer for;
 * a folder or file below it that cannot be read is a notice, and the rest is still read.
 */
function readTree(
  w: Walk,
  root: string,
  dir: string,
  keep: (name: string) => boolean,
  out: LintFile[],
): void {
  for (const entry of readdirSync(dir, { withFileTypes: true }).sort((a, b) =>
    byName(a.name, b.name),
  )) {
    const p = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name)) attempt(w, p, () => readTree(w, root, p, keep, out));
    } else if (keep(entry.name)) {
      const text = attempt(w, p, () => readFileSync(p, "utf8"));
      if (text !== undefined) out.push({ path: toPosix(relative(root, p)), text });
    }
  }
}

/** The model part at `folder`: its definition folder's .tmdl files, or nothing. */
function modelPart(w: Walk, folder: string): ResolvedPart | undefined {
  const def = join(folder, "definition");
  if (!isDir(def)) return undefined;
  const files: LintFile[] = [];
  readTree(w, folder, def, (n) => n.endsWith(".tmdl"), files);
  return files.length ? { root: folder, files } : undefined;
}

/** The report part at `folder`: definition.pbir, .platform, and every JSON under definition, or nothing. */
function reportPart(w: Walk, folder: string): ResolvedPart | undefined {
  const def = join(folder, "definition");
  if (!isDir(def)) return undefined;
  const files: LintFile[] = [];
  for (const name of ["definition.pbir", ".platform"]) {
    const p = join(folder, name);
    const text = attempt(w, p, () => (isFile(p) ? readFileSync(p, "utf8") : undefined));
    if (text !== undefined) files.push({ path: name, text });
  }
  readTree(w, folder, def, (n) => n.endsWith(".json"), files);
  return files.some((f) => f.path.startsWith("definition/")) ? { root: folder, files } : undefined;
}

const UNREAD_PART: Record<LayerName, string> = {
  model: "the model folder could not be read",
  report: "the report folder could not be read",
};

/**
 * The part at `folder`, read by `read`. A part folder that cannot be entered, or whose definition
 * folder cannot be listed, is a notice naming the folder that refused. A part that yields nothing
 * while something in it could not be read was not found empty either, so in both cases its layer
 * is absent with a reason and never reads as absent without a word. A plain folder given on its
 * own has no layer to name.
 */
function readPart(
  w: Walk,
  layer: LayerName | undefined,
  folder: string,
  read: (w: Walk, folder: string) => ResolvedPart | undefined,
): ResolvedPart | undefined {
  let part: ResolvedPart | undefined;
  try {
    // Entering the folder is tried first, so a folder that refuses entry is the one named rather
    // than the first entry looked up inside it.
    accessSync(folder, constants.X_OK);
    part = read(w, folder);
  } catch (e) {
    if (!isSystemError(e)) throw e;
    unread(w, e.path ?? folder, e);
  }
  // Any notice at or under the folder counts, not only one this read added: a part given on its
  // own is read for each layer, and a path is named once.
  const at = toPosix(relative(w.base, folder));
  const refused = w.project.diagnostics.some(
    (d) =>
      d.kind === "unread-file" &&
      (at === "" || d.path === at || d.path?.startsWith(`${at}/`) === true),
  );
  if (!part && layer && refused) w.project.absent[layer] = UNREAD_PART[layer];
  return part;
}

/**
 * The project's .pbip: the one the user pointed at, else the only regular file with that suffix
 * in the folder. A folder holding several is refused rather than guessed at, and a directory
 * whose name ends in .pbip is not one of them.
 */
function pbipIn(input: string, folder: string, preferred: string | undefined): string | undefined {
  if (preferred !== undefined) return preferred;
  const found = readdirSync(folder, { withFileTypes: true })
    .filter((e) => e.isFile() && e.name.endsWith(".pbip"))
    .map((e) => e.name)
    .sort(byName);
  if (found.length > 1)
    throw new UsageError(
      `${input} contains ${found.length} .pbip files; point at one of them: ${found.join(", ")}`,
    );
  return found[0];
}

/**
 * Why the model layer is absent for a report read on its own: the report's own definition.pbir
 * still says whether it reads a published model, which the skipped line reports as the reason.
 */
function loneReportAbsent(
  report: ResolvedPart,
  folder: string,
): Partial<Record<LayerName, string>> {
  const pbir = report.files.find((f) => f.path === "definition.pbir");
  const decision = pairingDecision(
    pbir ? datasetReference(pbir.text) : { kind: "none" },
    undefined,
    basename(folder),
  );
  return !decision.useModel && decision.reason ? { model: decision.reason } : {};
}

const legacyReport = (folder: string, name: string): Diagnostic => ({
  kind: "legacy-report-format",
  path: name,
  message: `${name} is stored as a single report.json, which pbiplint cannot read; save it in the PBIR format from Power BI Desktop`,
});
const legacyModel = (folder: string, name: string): Diagnostic => ({
  kind: "legacy-model-format",
  path: name,
  message: `${name} is stored as model.bim, which pbiplint cannot read; save it in the TMDL format from Power BI Desktop`,
});
const LEGACY_REPORT_REASON = "the report is saved in the legacy report.json format";
const LEGACY_MODEL_REASON = "the model is saved in the legacy model.bim format";

/** Find the project at or under `input` and read its parts (spec section 4). */
export function resolveProject(input: string): ResolvedProject {
  const path = resolve(input);
  try {
    const stat = statOf(path);
    if (stat === undefined) throw new UsageError(`${input} does not exist`);
    if (stat.isFile()) {
      if (path.endsWith(".tmdl"))
        return {
          root: dirname(path),
          model: {
            root: dirname(path),
            files: [{ path: basename(path), text: readFileSync(path, "utf8") }],
          },
          absent: {},
          diagnostics: [],
        };
      // The project is the .pbip's own folder, and the file named is the one read there.
      if (path.endsWith(".pbip"))
        return resolveFolder(dirname(path), dirname(path), basename(path));
      throw new UsageError(`${input} is not a .tmdl file, a .pbip file, or a folder`);
    }
    return resolveFolder(input, path);
  } catch (e) {
    // What cannot be read below the input is a notice (attempt and readPart), so what reaches
    // here is the input itself: its stat, its listing, or the one file it names. It is refused
    // as "does not exist" is; anything that is not the operating system's is a bug and says so.
    if (isSystemError(e)) throw new UsageError(`Could not read ${input}: ${reasonOf(e)}`);
    throw e;
  }
}

/**
 * A folder, either given directly or named by a .pbip. `preferred` is that .pbip's file name, so
 * a project holding more than one is read as the user asked instead of refused.
 */
function resolveFolder(input: string, path: string, preferred?: string): ResolvedProject {
  const out: ResolvedProject = { root: path, absent: {}, diagnostics: [] };
  const w: Walk = { base: path, project: out };
  const name = basename(path);

  // The folder is itself one part.
  if (isDir(join(path, "definition"))) {
    // The folder's name says which part it is, and only the reader for that part may record a
    // reason: a .Report is read for .tmdl files first, and finding none is not a refusal.
    const model = readPart(
      w,
      name.endsWith(".SemanticModel") ? "model" : undefined,
      path,
      modelPart,
    );
    if (model) return { ...out, model };
    const report = readPart(w, name.endsWith(".Report") ? "report" : undefined, path, reportPart);
    if (report) return { ...out, report, absent: loneReportAbsent(report, path) };
  }
  // A definition folder given directly: a model's is read as v1 did, a report's from its parent.
  if (name === "definition") {
    const tmdl: LintFile[] = [];
    readTree(w, path, path, (n) => n.endsWith(".tmdl"), tmdl);
    if (tmdl.length) return { ...out, model: { root: path, files: tmdl } };
    const report = reportPart(w, dirname(path));
    if (report)
      return {
        ...out,
        root: dirname(path),
        report,
        absent: loneReportAbsent(report, dirname(path)),
      };
  }
  // A part folder in the legacy format.
  if (name.endsWith(".Report") && isFile(join(path, "report.json"))) {
    out.diagnostics.push(legacyReport(path, name));
    out.absent.report = LEGACY_REPORT_REASON;
    return out;
  }
  if (name.endsWith(".SemanticModel") && isFile(join(path, "model.bim"))) {
    out.diagnostics.push(legacyModel(path, name));
    out.absent.model = LEGACY_MODEL_REASON;
    return out;
  }

  // A PBIP folder: the parts sit beside each other.
  const dirs = readdirSync(path, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name);
  const models = dirs.filter((d) => d.endsWith(".SemanticModel")).sort(byName);
  const reports = dirs.filter((d) => d.endsWith(".Report")).sort(byName);
  if (models.length > 1)
    throw new UsageError(
      `${input} contains ${models.length} semantic models; point at one of them: ${models.join(", ")}`,
    );
  if (reports.length > 1)
    throw new UsageError(
      `${input} contains ${reports.length} reports; point at one of them: ${reports.join(", ")}`,
    );
  let model = models[0] ? readPart(w, "model", join(path, models[0]), modelPart) : undefined;
  // A part folder that could not be read has said so already, and cannot be looked in.
  if (models[0] && !model && !out.absent.model && isFile(join(path, models[0], "model.bim"))) {
    out.diagnostics.push(legacyModel(path, models[0]));
    out.absent.model = LEGACY_MODEL_REASON;
  }
  const report = reports[0] ? readPart(w, "report", join(path, reports[0]), reportPart) : undefined;
  if (
    reports[0] &&
    !report &&
    !out.absent.report &&
    isFile(join(path, reports[0], "report.json"))
  ) {
    out.diagnostics.push(legacyReport(path, reports[0]));
    out.absent.report = LEGACY_REPORT_REASON;
  }
  if (report) {
    const pbip = pbipIn(input, path, preferred);
    // The .pbip sits at the project root, one level above the report root every other path is
    // relative to, so it carries that relative path and a finding on it points at the real file.
    if (pbip !== undefined) {
      const p = join(path, pbip);
      // A .pbip the user named is the input, refused like any input that cannot be read; one
      // found beside the parts is a notice.
      const text =
        preferred !== undefined
          ? readFileSync(p, "utf8")
          : attempt(w, p, () => readFileSync(p, "utf8"));
      if (text !== undefined) report.files.push({ path: toPosix(relative(report.root, p)), text });
    }
    const pbir = report.files.find((f) => f.path === "definition.pbir");
    const decision = pairingDecision(
      pbir ? datasetReference(pbir.text) : { kind: "none" },
      model ? models[0] : undefined,
      reports[0]!,
    );
    // The reason is recorded whether or not a model sat beside the report: a thin report says it
    // reads a published model on the skipped line either way.
    if (!decision.useModel) {
      model = undefined;
      if (decision.reason) out.absent.model = decision.reason;
    }
    if (decision.diagnostic) out.diagnostics.push(decision.diagnostic);
  }
  if (model) out.model = model;
  if (report) out.report = report;
  if (model || report) return out;

  // Loose .tmdl files anywhere under a plain folder, as v1 accepted.
  const direct: LintFile[] = [];
  readTree(w, path, path, (n) => n.endsWith(".tmdl"), direct);
  if (direct.length) return { ...out, model: { root: path, files: direct } };
  // Nothing to lint but something to say: a legacy part alone, or a part that could not be read.
  if (out.diagnostics.length) return out;
  throw new UsageError(
    `No semantic model or report found at ${input} (expected ${EXPECTED_INPUT})`,
  );
}
