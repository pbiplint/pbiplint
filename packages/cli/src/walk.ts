import { accessSync, constants, readdirSync, readFileSync, statSync, type Stats } from "node:fs";
import { basename, dirname, join, relative, resolve } from "node:path";
import {
  datasetReference,
  isPbix,
  noTmdlRefusal,
  pairingDecision,
  pbixRefusal,
  readJson,
  type DatasetReference,
  type Diagnostic,
  type LayerName,
  type LintFile,
} from "@pbiplint/core";
import { UsageError } from "./args.js";

export interface ResolvedPart {
  /** Absolute path the part's finding locations are relative to. */
  root: string;
  files: LintFile[];
  /**
   * The paths below `root` this part's own read could not read, relative to `root` with forward
   * slashes as `files` are, a folder written with a trailing `/`: what `lint` takes as this
   * part's layer's `unreadPaths`. Each is also an `unread-file` notice, but the notices name a
   * path once however many reads meet it, so this list is the part's own.
   */
  unread: string[];
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
const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

/**
 * Whether the path a file names is a folder: undefined when nothing is there, and true when the
 * operating system will not say, so the read that follows meets the refusal and names it.
 */
function folderAt(p: string): boolean | undefined {
  try {
    const stat = statOf(p);
    return stat === undefined ? undefined : stat.isDirectory();
  } catch (e) {
    if (isSystemError(e)) return true;
    throw e;
  }
}

/** One walk under the input: where a notice's path starts, and the project it adds to. */
interface Walk {
  /** The folder the input names; a notice's path is relative to it. */
  base: string;
  project: ResolvedProject;
  /**
   * The first refusal a notice recorded, with the path the notice named: a run that could read
   * nothing is refused naming that path.
   */
  refusal?: { path: string; error: SystemError };
}

/**
 * The `unread-file` notice (spec section 4) for a file or folder below the input that the
 * operating system refused. A part given on its own is walked once for the model and once for the
 * report, so each path is named once.
 */
function unread(w: Walk, p: string, e: SystemError): void {
  const path = toPosix(relative(w.base, p));
  w.refusal ??= { path, error: e };
  if (w.project.diagnostics.some((d) => d.kind === "unread-file" && d.path === path)) return;
  w.project.diagnostics.push({
    kind: "unread-file",
    path,
    message: `${path} could not be read (${reasonOf(e)}), so it was not linted`,
  });
}

/**
 * `call` on `p`, below the input: what the operating system refuses is a notice, and the walk goes
 * on. The path is also recorded on `part`, the part being read, as `p` relative to its root, a
 * folder (`folder`) with a trailing `/`.
 */
function attempt<T>(
  w: Walk,
  p: string,
  call: () => T,
  part?: ResolvedPart,
  folder = false,
): T | undefined {
  try {
    return call();
  } catch (e) {
    if (!isSystemError(e)) throw e;
    unread(w, p, e);
    part?.unread.push(toPosix(relative(part.root, p)) + (folder ? "/" : ""));
    return undefined;
  }
}

/** A part at `root` with nothing read yet, for a read to fill. */
const emptyPart = (root: string): ResolvedPart => ({ root, files: [], unread: [] });

/**
 * What a walk noted by name as it passed, for the refusals of a folder that holds nothing to
 * lint: each path relative to the walk's base, in the order the walk met it.
 */
interface Passed {
  /** Each .pbix file, never opened. */
  pbix: string[];
  /** Each .SemanticModel folder, as it is entered. */
  models: string[];
}

/**
 * Every file under `dir` that `keep` accepts, into `part`, with each path relative to its root.
 * Listing `dir` itself is the caller's to answer for; a folder or file below it that cannot be
 * read is a notice and one of the part's unread paths, and the rest is still read. Given
 * `passed`, the walk also notes there each .pbix and each .SemanticModel folder it passes.
 */
function readTree(
  w: Walk,
  part: ResolvedPart,
  dir: string,
  keep: (name: string) => boolean,
  passed?: Passed,
): void {
  for (const entry of readdirSync(dir, { withFileTypes: true }).sort((a, b) =>
    byName(a.name, b.name),
  )) {
    const p = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      if (passed && entry.name.endsWith(".SemanticModel"))
        passed.models.push(toPosix(relative(w.base, p)));
      attempt(w, p, () => readTree(w, part, p, keep, passed), part, true);
    } else if (keep(entry.name)) {
      const text = attempt(w, p, () => readFileSync(p, "utf8"), part);
      if (text !== undefined) part.files.push({ path: toPosix(relative(part.root, p)), text });
    } else if (passed && isPbix(entry.name)) passed.pbix.push(toPosix(relative(w.base, p)));
  }
}

/** The model part at `folder`: its definition folder's .tmdl files, or nothing. */
function modelPart(w: Walk, folder: string): ResolvedPart | undefined {
  const def = join(folder, "definition");
  if (!isDir(def)) return undefined;
  const part = emptyPart(folder);
  readTree(w, part, def, (n) => n.endsWith(".tmdl"));
  return part.files.length ? part : undefined;
}

/** The report part at `folder`: definition.pbir, .platform, and every JSON under definition, or nothing. */
function reportPart(w: Walk, folder: string): ResolvedPart | undefined {
  const def = join(folder, "definition");
  if (!isDir(def)) return undefined;
  const part = emptyPart(folder);
  for (const name of ["definition.pbir", ".platform"]) {
    const p = join(folder, name);
    const text = attempt(w, p, () => (isFile(p) ? readFileSync(p, "utf8") : undefined), part);
    if (text !== undefined) part.files.push({ path: name, text });
  }
  readTree(w, part, def, (n) => n.endsWith(".json"));
  return part.files.some((f) => f.path.startsWith("definition/")) ? part : undefined;
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
            unread: [],
          },
          absent: {},
          diagnostics: [],
        };
      if (path.endsWith(".pbip")) return resolvePbip(input, path);
      // Named for what it is, by its name alone: a .pbix is never opened.
      if (isPbix(path)) throw new UsageError(pbixRefusal(input));
      throw new UsageError(`${input} is not a .tmdl file, a .pbip file, or a folder`);
    }
    return resolveFolder(input, path);
  } catch (e) {
    // What cannot be read below the input is a notice (attempt and readPart), so what reaches
    // here is the input itself: its stat, its listing, or the one file it names. It is refused as
    // "does not exist" is; anything that is not the operating system's is a bug and says so. An
    // input none of whose files could be read is refused in walked, on both routes.
    if (isSystemError(e)) throw new UsageError(`Could not read ${input}: ${reasonOf(e)}`);
    throw e;
  }
}

/**
 * A folder, either given directly or named by a .pbip that names no report. `preferred` is that
 * .pbip's file name, so a project holding more than one is read as the user asked instead of
 * refused.
 */
function resolveFolder(input: string, path: string, preferred?: string): ResolvedProject {
  return walked(input, path, (w) => readFolder(w, input, path, preferred));
}

/**
 * One walk from the folder `base`, which is the project root, by `read`. `input` names that folder
 * in a refusal.
 *
 * A walk of which nothing could be read, while something in it was refused, is an input that
 * could not be read: a run over it would report no findings in 0 files and read as clean with
 * nothing linted. It is refused naming the first path that refused, with that refusal's reason:
 * the folder itself was read, so what refused is below it, and a refused run prints none of the
 * notices that name it. A legacy part on its own refuses nothing, so it stays a notice.
 */
function walked(input: string, base: string, read: (w: Walk) => ResolvedProject): ResolvedProject {
  const w: Walk = { base, project: { root: base, absent: {}, diagnostics: [] } };
  const project = read(w);
  if (!project.model && !project.report && w.refusal) {
    const { path: below, error } = w.refusal;
    // Joined to `input`, as the readers' messages name the folder, in the notices' forward
    // slashes. The folder itself, were it to refuse once read, is named by `input` alone.
    const named = below === "" ? input : toPosix(join(input, below));
    throw new UsageError(`Could not read ${named}: ${reasonOf(error)}`);
  }
  return project;
}

/**
 * The report paths a .pbip's `artifacts` name, as it writes them. Microsoft's pbipProperties
 * schema gives `artifacts` as `{ "report": { "path" } }` entries only: a .pbip reaches its model
 * through the report's definition.pbir. A .pbip that is not a JSON object names none.
 */
function reportsNamed(name: string, text: string): string[] {
  const json = readJson(name, text).json;
  if (!isRecord(json) || !Array.isArray(json.artifacts)) return [];
  return json.artifacts.flatMap((a: unknown) =>
    isRecord(a) && isRecord(a.report) && typeof a.report.path === "string" ? [a.report.path] : [],
  );
}

/**
 * A .pbip the user named (#86): the one report its `artifacts` name, its path relative to the
 * .pbip's folder, and the model that report's definition.pbir names, wherever each sits, so a
 * project beside others in one folder lints with both parts. Nothing else in the .pbip's folder
 * is read or refused, and that folder stays the project root: the config search's start and the
 * base of every notice's path. A .pbip naming more than one report is refused as a folder holding
 * more than one is; one naming none is read as its folder, as every .pbip was before.
 */
function resolvePbip(input: string, path: string): ResolvedProject {
  const folder = dirname(path);
  // The input itself, refused by resolveProject when it cannot be read.
  const text = readFileSync(path, "utf8");
  // Each report folder once, as first written, counted by the path it resolves to: a report
  // named twice as `Cost.Report`, `./Cost.Report`, or `Cost.Report/` is one report.
  const named = new Map<string, string>();
  for (const written of reportsNamed(basename(path), text)) {
    const at = resolve(folder, toPosix(written));
    if (!named.has(at)) named.set(at, written);
  }
  if (named.size === 0) return resolveFolder(folder, folder, basename(path));
  if (named.size > 1) {
    const names = [...named.values()].map((p) => basename(toPosix(p))).sort(byName);
    throw new UsageError(
      `${input} names ${named.size} reports; point at one of them: ${names.join(", ")}`,
    );
  }
  const [reportFolder, written] = [...named][0]!;
  const kind = folderAt(reportFolder);
  if (kind === undefined) throw new UsageError(`${input} names ${written}, which does not exist`);
  if (!kind) throw new UsageError(`${input} names ${written}, which is not a folder`);
  return walked(folder, folder, (w) => readNamed(w, input, path, text, reportFolder, written));
}

/**
 * The text of the report's definition.pbir, which names its model: the report part's copy when
 * the part was read, else the file read on its own, since a legacy report, or one whose definition
 * folder could not be read, still names its model. A report folder that could not be entered has
 * its notice already, and nothing in it is looked up.
 */
function pbirOf(w: Walk, report: ResolvedPart | undefined, folder: string): string | undefined {
  if (report) return report.files.find((f) => f.path === "definition.pbir")?.text;
  const at = toPosix(relative(w.base, folder));
  if (w.project.diagnostics.some((d) => d.kind === "unread-file" && d.path === at))
    return undefined;
  const p = join(folder, "definition.pbir");
  return attempt(w, p, () => (isFile(p) ? readFileSync(p, "utf8") : undefined));
}

const PBIR_UNREAD_REASON = "the report's definition.pbir could not be read";

/**
 * The report at `reportFolder`, which the .pbip at `pbip` names as `written`, and the model its
 * definition.pbir names by path, relative to the report folder. The path is followed rather than
 * compared with a folder beside the report, so model-reference-mismatch does not arise here.
 */
function readNamed(
  w: Walk,
  input: string,
  pbip: string,
  text: string,
  reportFolder: string,
  written: string,
): ResolvedProject {
  const out = w.project;
  const at = (p: string): string => toPosix(relative(w.base, p));
  const report = readPart(w, "report", reportFolder, reportPart);
  // A part folder that could not be read has said so already, and cannot be looked in.
  if (!report && !out.absent.report && isFile(join(reportFolder, "report.json"))) {
    out.diagnostics.push(legacyReport(reportFolder, at(reportFolder)));
    out.absent.report = LEGACY_REPORT_REASON;
  }
  // The .pbip rides with the report at its path from the report root, as it does from a folder,
  // so a finding on it points at the real file.
  if (report) report.files.push({ path: toPosix(relative(report.root, pbip)), text });

  const pbir = pbirOf(w, report, reportFolder);
  const ref: DatasetReference = pbir === undefined ? { kind: "none" } : datasetReference(pbir);
  // Refused rather than missing: on the part's own unread list, or, for a report not read, in the
  // notice its read on its own gave.
  const pbirPath = at(join(reportFolder, "definition.pbir"));
  const pbirRefused =
    report?.unread.includes("definition.pbir") === true ||
    out.diagnostics.some((d) => d.kind === "unread-file" && d.path === pbirPath);
  let model: ResolvedPart | undefined;
  if (ref.kind === "byPath") {
    const modelFolder = resolve(reportFolder, toPosix(ref.path));
    if (folderAt(modelFolder)) {
      model = readPart(w, "model", modelFolder, modelPart);
      if (!model && !out.absent.model && isFile(join(modelFolder, "model.bim"))) {
        out.diagnostics.push(legacyModel(modelFolder, at(modelFolder)));
        out.absent.model = LEGACY_MODEL_REASON;
      }
    } else {
      out.absent.model = `this report reads a model that is not there (${ref.path})`;
    }
  } else if (pbirRefused) {
    // Which model the report reads is not known, and the skipped line says so rather than
    // reading as a report that names none; the notice names the file.
    out.absent.model = PBIR_UNREAD_REASON;
  } else {
    // A report bound to a published model says so on the skipped line, as it does from a folder;
    // one that names no model is read alone.
    const decision = pairingDecision(ref, undefined, basename(reportFolder));
    if (decision.reason) out.absent.model = decision.reason;
  }
  if (model) out.model = model;
  if (report) out.report = report;
  if (model || report || out.diagnostics.length) return out;
  // The input is a .pbip, so the kinds of input a folder could have held do not apply: what held
  // nothing is the report folder it names.
  throw new UsageError(`No semantic model or report found in ${written}, which ${input} names`);
}

/** The parts of the folder `w` walks, or what it has to say about them. */
function readFolder(w: Walk, input: string, path: string, preferred?: string): ResolvedProject {
  const out = w.project;
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
  // A definition folder given directly: a model's is read as v1 did, with the folder as its root,
  // a report's from its parent.
  if (name === "definition") {
    const tmdl = emptyPart(path);
    readTree(w, tmdl, path, (n) => n.endsWith(".tmdl"));
    if (tmdl.files.length) return { ...out, model: tmdl };
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
          : attempt(w, p, () => readFileSync(p, "utf8"), report);
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

  // Loose .tmdl files anywhere under a plain folder, as v1 accepted. The same walk, the whole
  // folder but the skipped folders, notes each .pbix and model folder it passes, for the refusals
  // below.
  const direct = emptyPart(path);
  const passed: Passed = { pbix: [], models: [] };
  readTree(w, direct, path, (n) => n.endsWith(".tmdl"), passed);
  if (direct.files.length) return { ...out, model: direct };
  // Nothing to lint but something to say: a legacy part alone, or a part that could not be read,
  // which resolveFolder turns into a refused run naming the path that refused.
  if (out.diagnostics.length) return out;
  // Nothing else explains it, so a model folder the walk met is named first, in core's words, as
  // the browser names it: the input when it is one, and each below it. Each holds no .tmdl files,
  // or the walk would have read one, and none has a notice, legacy or unread, or the run would
  // have returned above. Each is joined to `input` as the nothing-read refusal joins its path,
  // the input itself named by `input` alone, and they are listed in name order by their whole
  // path, as the browser sorts its drop-relative paths, not in the order the walk met them.
  const noTmdl = [...(name.endsWith(".SemanticModel") ? [""] : []), ...passed.models].sort(byName);
  if (noTmdl.length)
    throw new UsageError(
      noTmdlRefusal(noTmdl.map((m) => (m === "" ? input : toPosix(join(input, m))))),
    );
  // Else a .pbix the walk met is named for what it is: the first it met, joined to `input` as the
  // nothing-read refusal joins its path, and how many more.
  const { pbix } = passed;
  if (pbix[0] !== undefined)
    throw new UsageError(pbixRefusal(toPosix(join(input, pbix[0])), pbix.length - 1));
  throw new UsageError(
    `No semantic model or report found at ${input} (expected ${EXPECTED_INPUT})`,
  );
}
