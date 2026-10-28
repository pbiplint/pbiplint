import {
  accessSync,
  constants,
  lstatSync,
  readdirSync,
  readFileSync,
  realpathSync,
  statSync,
  type Dirent,
  type Stats,
} from "node:fs";
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import {
  datasetReference,
  isPbix,
  LEGACY_MODEL_REASON,
  LEGACY_REPORT_REASON,
  legacyModelNotice as legacyModel,
  legacyReportNotice as legacyReport,
  noTmdlRefusal,
  pairingDecision,
  pbixRefusal,
  projectBelowNotice,
  projectsBelow,
  reportsNamed,
  type DatasetReference,
  type Diagnostic,
  type FoundBelow,
  type LayerName,
  type LintFile,
  type Unreadable,
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

/**
 * Whether the path a file names, or a link points at, is a folder: undefined when nothing is
 * there, and true when the operating system will not say, so the read that follows meets the
 * refusal, or for a link the link's notice, and names it.
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
   * The first path a notice named, with the reason it was not read: a run that could read nothing
   * is refused naming that path.
   */
  refusal?: { path: string; reason: string };
  /**
   * Each part met in a legacy format, in the order the walk met it, by its path from `base` ("" for
   * the base itself): a run that read nothing else is refused with their notices (#175).
   */
  legacy: { layer: LayerName; path: string }[];
  /**
   * The folder the user named, on the command line or in an MCP request, when what they named is a
   * folder: a reference that stays inside it is followed even where it leaves the project folder.
   * It is never taken from a file, so a .pbip named alone has none.
   */
  named?: string;
  /** What the walks of one run share (Reach). */
  reach: Reach;
}

/** What every walk of one resolveInput shares, and whether this walk is of the path named. */
interface Reach {
  /**
   * Each model part read, by the real path of its folder, so a model several projects reach is
   * read once and each project lints the same object, named by the path that reached it first
   * (spec section 3.5). Kept only on resolveInput's several-project route: one project reads each
   * model once anyway.
   */
  models?: Map<string, ResolvedPart>;
  /**
   * Whether the walk is of the folder the user named, where several projects are linted rather
   * than refused (SeveralProjects). A project's own walk, below it, is not.
   */
  top?: boolean;
}

/**
 * The projects below the folder named, each by its path from it (projectsBelow), where one
 * project's route would refuse the folder: thrown up to resolveInput, which lints them all.
 */
class SeveralProjects extends Error {
  constructor(readonly paths: string[]) {
    super("several projects");
  }
}

/** Why a path below the input was not read: the reason a refused run gives, and a notice's words. */
interface Unread {
  reason: string;
  /** What a notice says of the path, after naming it. */
  says: string;
  /** What a notice says the user can do, after saying the path was not linted. */
  hint?: string;
}

/** A file or folder the operating system refused. */
function refusalOf(e: SystemError): Unread {
  const reason = reasonOf(e);
  return { reason, says: `could not be read (${reason})` };
}

/**
 * A symbolic link, or on Windows a junction, which Node reports as one. The walk does not follow
 * one, so nothing outside the project is read by way of it.
 */
const LINK: Unread = {
  reason: "it is a symbolic link, which pbiplint does not follow",
  says: "is a symbolic link, which pbiplint does not follow",
};

/**
 * A report or model at `p`, which the project at `base` names outside both the folder the user
 * named (`named`) and the project folder: references are followed only inside one of them. Its
 * notice says what the user can do (outsideHint).
 */
function outside(base: string, named: string | undefined, p: string): Unread {
  const says = "is outside the path you named and the project folder";
  const hint = outsideHint(resolve(base), named, resolve(p));
  return { says, hint, reason: `it ${says}${hint ? `; ${hint}` : ""}` };
}

/**
 * What the user can do about a reference to `p` the project at `base` was refused: lint the folder
 * nearest them that holds both by their paths as written, naming it relative to the project folder
 * as the notice names `p`. Linting that folder follows the reference, with every other project in
 * it linted too (#237). None when the reference leads out only through a link, which no folder
 * named would follow, or when the only folder holding both is the file system's root, which is
 * never searched.
 */
function outsideHint(base: string, named: string | undefined, p: string): string | undefined {
  if (within(base, p) || (named !== undefined && within(resolve(named), p))) return undefined;
  let top = dirname(base);
  while (!within(top, p)) {
    if (dirname(top) === top) return undefined;
    top = dirname(top);
  }
  if (dirname(top) === top || !reachedAsWritten(top, p)) return undefined;
  return `lint the folder that holds both (${toPosix(relative(base, top))} from the project folder) to include it`;
}

/** Whether `p` really is where its path from `top` says, so no link on the way leads elsewhere. */
function reachedAsWritten(top: string, p: string): boolean {
  try {
    return realpathSync.native(p) === join(realpathSync.native(top), relative(top, p));
  } catch (e) {
    // A path that is not there is judged as written, as insideProject judges it.
    if (isSystemError(e)) return true;
    throw e;
  }
}

const OUTSIDE_MODEL =
  "the model this report reads is outside the path you named and the project folder";

/**
 * Whether `p` is `root` or below it, by where each really is, so a path that leads out through a
 * link counts as outside. When either is not there, or the operating system will not resolve it,
 * both are judged as written.
 */
function insideProject(root: string, p: string): boolean {
  let [r, q] = [resolve(root), resolve(p)];
  try {
    [r, q] = [realpathSync.native(r), realpathSync.native(q)];
  } catch (e) {
    // Both as written, so a root reached through a link is not set against a real path.
    if (!isSystemError(e)) throw e;
  }
  return within(r, q);
}

/** Whether the path `q` is `r` or below it, as written. */
function within(r: string, q: string): boolean {
  const way = relative(r, q);
  return !isAbsolute(way) && way !== ".." && !way.startsWith(`..${sep}`);
}

/** Whether a reference to `p` is followed: it stays inside the project folder or the folder named. */
const followed = (base: string, named: string | undefined, p: string): boolean =>
  insideProject(base, p) || (named !== undefined && insideProject(named, p));

/**
 * The `unread-file` notice (spec section 4) for a file or folder below the input that was not
 * read, and why. A part given on its own is walked once for the model and once for the report, so
 * each path is named once. The path is also recorded on `part`, the part being read, as `p`
 * relative to its root, a folder (`folder`) with a trailing `/`.
 */
function unread(w: Walk, p: string, why: Unread, part?: ResolvedPart, folder = false): void {
  const path = toPosix(relative(w.base, p));
  w.refusal ??= { path, reason: why.reason };
  part?.unread.push(toPosix(relative(part.root, p)) + (folder ? "/" : ""));
  if (w.project.diagnostics.some((d) => d.kind === "unread-file" && d.path === path)) return;
  w.project.diagnostics.push({
    kind: "unread-file",
    path,
    message: `${path} ${why.says}, so it was not linted${why.hint ? `; ${why.hint}` : ""}`,
  });
}

/** Whether `p` is itself a link. One the operating system will not say about is left to the read. */
function isLink(p: string): boolean {
  try {
    return lstatSync(p, { throwIfNoEntry: false })?.isSymbolicLink() ?? false;
  } catch (e) {
    if (isSystemError(e)) return false;
    throw e;
  }
}

/**
 * Whether `p`, below the input, is a link, which is not followed: it is a notice, recorded on
 * `part` as a refusal is, so what it stands for counts as unread. The input itself is followed, as
 * the user named it.
 */
function linked(w: Walk, p: string, part?: ResolvedPart, folder = false): boolean {
  if (p === w.base || !isLink(p)) return false;
  unread(w, p, LINK, part, folder);
  return true;
}

/**
 * The first link on the way from the walk's base to `to`, a folder a project file names by a path
 * that may pass through others (`../Shared/Sales.SemanticModel`): each folder below the one the two
 * share, down to `to` itself. The folders the base sits in are where the project is, and are
 * followed, as the input is. On a .pbip's route `to` is inside the project folder or the folder
 * named by then (followed), so the way climbs above the base only inside the folder named, and a
 * link there is named as any link is.
 */
function linkOnWay(w: Walk, to: string): string | undefined {
  const way = relative(w.base, to);
  // On Windows a folder on another drive or share shares no folder with the base, and `relative`
  // gives its whole path. The folders above it are not the project's, so only it is checked.
  if (isAbsolute(way)) return isLink(to) ? to : undefined;
  let at = w.base;
  for (const segment of way.split(/[\\/]/)) {
    at = join(at, segment);
    if (segment !== "" && segment !== ".." && isLink(at)) return at;
  }
  return undefined;
}

/**
 * `call` on `p`, below the input: a link there, or what the operating system refuses, is a notice,
 * recorded on `part` (see unread), and the walk goes on.
 */
function attempt<T>(
  w: Walk,
  p: string,
  call: () => T,
  part?: ResolvedPart,
  folder = false,
): T | undefined {
  if (linked(w, p, part, folder)) return undefined;
  try {
    return call();
  } catch (e) {
    if (!isSystemError(e)) throw e;
    unread(w, p, refusalOf(e), part, folder);
    return undefined;
  }
}

const LEGACY_NOTICE = { model: legacyModel, report: legacyReport } as const;
/** The file that makes a part folder legacy, which an unreadable project's finding points at. */
const LEGACY_FILE = { model: "model.bim", report: "report.json" } as const;
/**
 * The legacy part that a refusal of a run that read nothing else names first, kept beside the
 * error rather than on it, so a UsageError still compares equal to an Error with its message.
 * resolveInput reads it to point an unreadable project's finding at the file (#237).
 */
const LEGACY_CAUSE = new WeakMap<UsageError, Omit<Unreadable, "message">>();

/**
 * The part folder `folder`, saved in a legacy format pbiplint cannot read (model.bim, or a single
 * report.json): its notice, named by its path from the walk's base or, for the base itself, by its
 * name, and its layer absent with the reason. The walk records it, for the refusal of a run that
 * reads nothing else.
 */
function legacyPart(w: Walk, layer: LayerName, folder: string): void {
  const path = toPosix(relative(w.base, folder));
  w.project.diagnostics.push(LEGACY_NOTICE[layer](path === "" ? basename(folder) : path));
  w.project.absent[layer] = layer === "model" ? LEGACY_MODEL_REASON : LEGACY_REPORT_REASON;
  w.legacy.push({ layer, path });
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
    // A link is not followed. What it points at is looked up only to tell whether the walk would
    // have entered or read it, so its notice names nothing the walk would have passed over.
    if (entry.isSymbolicLink() ? folderAt(p) === true : entry.isDirectory()) {
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

/**
 * The model part at `folder`: its definition folder's .tmdl files, or nothing. One another project
 * of the run read already is that same part (Reach).
 */
function modelPart(w: Walk, folder: string): ResolvedPart | undefined {
  const { models } = w.reach;
  const key = models && realpathSync.native(folder);
  const read = key === undefined ? undefined : models!.get(key);
  if (read) return read;
  const def = join(folder, "definition");
  if (linked(w, def) || !isDir(def)) return undefined;
  const part = emptyPart(folder);
  readTree(w, part, def, (n) => n.endsWith(".tmdl"));
  if (!part.files.length) return undefined;
  if (key !== undefined) models!.set(key, part);
  return part;
}

/** The report part at `folder`: definition.pbir, .platform, and every JSON under definition, or nothing. */
function reportPart(w: Walk, folder: string): ResolvedPart | undefined {
  const def = join(folder, "definition");
  if (linked(w, def) || !isDir(def)) return undefined;
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
  // A link on the way to the folder, or the folder itself as one, is not entered.
  const via = linkOnWay(w, folder);
  if (via !== undefined) {
    unread(w, via, LINK);
    if (layer) w.project.absent[layer] = UNREAD_PART[layer];
    return undefined;
  }
  let part: ResolvedPart | undefined;
  try {
    // Entering the folder is tried first, so a folder that refuses entry is the one named rather
    // than the first entry looked up inside it.
    accessSync(folder, constants.X_OK);
    part = read(w, folder);
  } catch (e) {
    if (!isSystemError(e)) throw e;
    unread(w, e.path ?? folder, refusalOf(e));
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
 * Whether an entry listed in `folder` is a .pbip: a file with that suffix, or a link that is not
 * to a folder, so that its read names it. A directory whose name ends in .pbip is not one.
 */
const isPbipEntry = (folder: string, e: Dirent): boolean =>
  e.name.endsWith(".pbip") &&
  (e.isFile() || (e.isSymbolicLink() && folderAt(join(folder, e.name)) !== true));

/**
 * The project's .pbip: the one the user pointed at, else the only one in the folder (isPbipEntry).
 * A folder holding several is refused rather than guessed at, after `several` has had its say.
 */
function pbipIn(
  input: string,
  folder: string,
  preferred: string | undefined,
  several: () => void,
): string | undefined {
  if (preferred !== undefined) return preferred;
  const found = readdirSync(folder, { withFileTypes: true })
    .filter((e) => isPbipEntry(folder, e))
    .map((e) => e.name)
    .sort(byName);
  if (found.length > 1) {
    several();
    throw new UsageError(
      `${input} contains ${found.length} .pbip files; point at one of them: ${found.join(", ")}`,
    );
  }
  return found[0];
}

/**
 * Why the model layer is absent for a report read on its own: the report's own definition.pbir
 * still says whether it reads a published model, or which model it reads by path, which the
 * skipped line reports as the reason.
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

/**
 * Find the project at or under `input`, the path the user named, and read its parts (spec section
 * 4). A folder that holds several projects is refused, as it was before #237, with the message the
 * one-project route gives (resolveInput lints them all).
 */
export function resolveProject(input: string): ResolvedProject {
  return resolveAt(input, undefined, {});
}

/** The most projects one run lints (spec section 3.4); more is refused with where they are. */
export const MAX_PROJECTS = 200;

/**
 * One project of a folder that holds several (#237): `project` when it was read, else
 * `unreadable`, with the refusal its own run gives (spec section 3.3). Exactly one is set.
 */
export interface NamedProject {
  /** The path that lints it, relative to the folder named, as projectsBelow gives it. */
  path: string;
  project?: ResolvedProject;
  unreadable?: Unreadable;
  /** The real path of the model folder it read, which projects reading one model share. */
  modelKey?: string;
  /** The model folder relative to the folder named, in forward slashes, for the shared-model notice. */
  modelPath?: string;
}

export type ResolvedInput =
  { kind: "one"; project: ResolvedProject } | { kind: "several"; projects: NamedProject[] };

/**
 * What the user named at `input`: the one project resolveProject reads, or, for a folder that holds
 * several, each of them (spec section 3), in projectsBelow's name order, which the shared-model step
 * takes as the order that decides which project's path names a model first. Several are read only
 * where resolveProject would refuse the folder for holding them, so an input that lints today
 * resolves as it did. Each is read as the one project below a folder is, under the folder named,
 * which stays the #236 boundary for every one, and a model several reach is read once (Reach).
 * A project whose own run would be refused is `unreadable`, with that refusal, and the others are
 * read; a folder none of whose projects can be read is refused with the first one's refusal and a
 * line for each other, since a run that reads nothing must not pass (#175).
 */
export function resolveInput(input: string): ResolvedInput {
  let paths: string[];
  try {
    // No model is kept from this walk: on the way to finding several projects it may have read a
    // model, whose notices go with the walk it was read in.
    return { kind: "one", project: resolveAt(input, undefined, { top: true }) };
  } catch (e) {
    if (!(e instanceof SeveralProjects)) throw e;
    paths = e.paths;
  }
  const at = (p: string): string => toPosix(join(input, p));
  if (paths.length > MAX_PROJECTS) throw tooMany(input, paths, at);
  // The folder named is the same for every project; a project's own walk does not look for more.
  const named = resolve(input);
  // A project's refusal names it by the path it was read at, which main made absolute. Its finding
  // reaches every format and a pipeline's code scanning, so there it names the project from the
  // folder named, that folder's own name first, as the site names it from the drop. The refusal of
  // a run that reads nothing keeps the paths as given, as every refusal does.
  const above = toPosix(dirname(named));
  const fromNamed = (text: string): string =>
    text.split(above.endsWith("/") ? above : `${above}/`).join("");
  const own: Reach = { models: new Map() };
  const refusals: UsageError[] = [];
  const projects = paths.map((path): NamedProject => {
    let project: ResolvedProject;
    try {
      project = resolveAt(at(path), named, own);
    } catch (e) {
      if (!(e instanceof UsageError)) throw e;
      refusals.push(e);
      return { path, unreadable: unreadableOf(path, e, fromNamed) };
    }
    if (!project.model) return { path, project };
    return {
      path,
      project,
      modelKey: realpathSync.native(project.model.root),
      modelPath: toPosix(relative(named, project.model.root)),
    };
  });
  const [first] = refusals;
  if (first !== undefined && refusals.length === projects.length)
    throw new UsageError(first.message, [
      ...first.lines,
      ...refusals.slice(1).map((e, i) => `  ${projects[i + 1]!.path}: ${e.message}`),
    ]);
  return { kind: "several", projects };
}

/**
 * The project at `path`, refused with `e`, whose message `shown` rewrites: on the legacy file when
 * a legacy part is the cause (walked records it), else named by its path, on the part the path
 * names, a .pbip's being its report's.
 */
function unreadableOf(path: string, e: UsageError, shown: (text: string) => string): Unreadable {
  const message = shown(e.message);
  const cause = LEGACY_CAUSE.get(e);
  if (cause) return { message, ...cause };
  return {
    message,
    layer: path.endsWith(".SemanticModel") ? "model" : "report",
    name: path,
  };
}

/**
 * The refusal of a folder holding more than MAX_PROJECTS projects: how many, and each folder at
 * its top that holds some, with how many and the command that lints them, so a person or an
 * assistant can split the run. A project at the top is a line of its own.
 */
function tooMany(input: string, paths: string[], at: (p: string) => string): UsageError {
  const counts = new Map<string, number>();
  for (const p of paths) {
    const first = p.split("/")[0]!;
    counts.set(first, (counts.get(first) ?? 0) + 1);
  }
  return new UsageError(
    `${input} contains ${paths.length} projects, more than the ${MAX_PROJECTS} one run lints; point at a folder that holds fewer:`,
    [...counts.keys()].sort(byName).map((first) => {
      const n = counts.get(first)!;
      return `  ${first}: ${n} project${n === 1 ? "" : "s"}: pbiplint ${shellWord(at(first))}`;
    }),
  );
}

/**
 * resolveProject at `input`, below the folder the user named (`named`) when the walk got here from
 * there, else the path the user named itself, which is the folder named when it is a folder.
 */
function resolveAt(input: string, named: string | undefined, reach: Reach): ResolvedProject {
  const path = resolve(input);
  try {
    const stat = statOf(path);
    if (stat === undefined) throw new UsageError(`${input} does not exist`);
    if (stat.isFile()) {
      // The input is followed, as the user named it, and known by the name the user gave it. A
      // folder is walked, and a .tmdl file read, where the link sits.
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
      // A .pbip is taken where it really sits, as the paths it writes are relative to its folder.
      if (path.endsWith(".pbip"))
        return resolvePbip(input, isLink(path) ? realpathSync(path) : path, named, reach);
      // Named for what it is, by its name alone: a .pbix is never opened.
      if (isPbix(path)) throw new UsageError(pbixRefusal(input));
      throw new UsageError(`${input} is not a .tmdl file, a .pbip file, or a folder`);
    }
    return resolveFolder(input, path, undefined, named ?? path, reach);
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
function resolveFolder(
  input: string,
  path: string,
  preferred: string | undefined,
  named: string | undefined,
  reach: Reach,
): ResolvedProject {
  return walked(input, path, (w) => readFolder(w, input, path, preferred), named, reach);
}

/**
 * One walk from the folder `base`, which is the project root, by `read`, under the folder the user
 * named (`named`, see Walk), unless the one project
 * below a plain folder is read in its place, by a walk of its own (readFolder, #174). `input`
 * names that folder in a refusal.
 *
 * A walk of which nothing was read is refused, whatever the reason: a run over it would report no
 * findings in 0 files and read as clean with nothing linted, passing a gated pipeline (#175). One
 * in which something was refused names the first path that refused, with that refusal's reason:
 * the folder itself was read, so what refused is below it, and a refused run prints none of the
 * notices that name it. Else one that met a part in a legacy format gives that part's notice, and
 * a second's on a line of its own, in the order the walk met them, rather than the run's first
 * diagnostic, which for the one project below a plain folder is the notice naming it.
 */
function walked(
  input: string,
  base: string,
  read: (w: Walk) => ResolvedProject,
  named: string | undefined,
  reach: Reach,
): ResolvedProject {
  const w: Walk = {
    base,
    project: { root: base, absent: {}, diagnostics: [] },
    legacy: [],
    named,
    reach,
  };
  const project = read(w);
  if (project.model || project.report) return project;
  // Each path joined to `input`, as the readers' messages name the folder, in the notices' forward
  // slashes. The folder itself is named by `input` alone.
  const joined = (below: string): string => (below === "" ? input : toPosix(join(input, below)));
  if (w.refusal)
    throw new UsageError(`Could not read ${joined(w.refusal.path)}: ${w.refusal.reason}`);
  const [first, ...rest] = w.legacy.map((l) => LEGACY_NOTICE[l.layer](joined(l.path)).message);
  if (first !== undefined) {
    const e = new UsageError(first, rest);
    const { layer, path } = w.legacy[0]!;
    LEGACY_CAUSE.set(e, { layer, root: join(base, path), file: LEGACY_FILE[layer] });
    throw e;
  }
  // Not reached today: every unread path sets the refusal, and readFolder and readNamed throw
  // before returning neither part with nothing else to say. Kept so that a run that read nothing
  // can never go on, whatever a later reader returns.
  throw new UsageError(
    `No semantic model or report found at ${input} (expected ${EXPECTED_INPUT})`,
  );
}

/**
 * A .pbip the user named (#86): the one report its `artifacts` name, its path relative to the
 * .pbip's folder, and the model that report's definition.pbir names, inside the project folder
 * (the folder that holds the .pbip) or the folder the user named (`named`), by where each really
 * is, so a link that leads out is caught too; a reference outside both is a notice and is not
 * followed. A project beside others in one
 * folder lints with both parts. Nothing else in the .pbip's folder is read or refused, and that
 * folder stays the project root: the config search's start and the base of every notice's path. A
 * .pbip naming more than one report is refused as a folder holding more than one is; one naming
 * none is read as its folder, as every .pbip was before.
 */
function resolvePbip(
  input: string,
  path: string,
  named: string | undefined,
  { models }: Reach,
): ResolvedProject {
  const folder = dirname(path);
  // A .pbip names one project, so its folder is never read as holding several.
  const reach: Reach = { models };
  // The input itself, refused by resolveProject when it cannot be read.
  const text = readFileSync(path, "utf8");
  // Each report folder once, as first written, counted by the path it resolves to: a report
  // named twice as `Cost.Report`, `./Cost.Report`, or `Cost.Report/` is one report.
  const reports = new Map<string, string>();
  for (const written of reportsNamed(text)) {
    const at = resolve(folder, toPosix(written));
    if (!reports.has(at)) reports.set(at, written);
  }
  if (reports.size === 0) return resolveFolder(folder, folder, basename(path), named, reach);
  if (reports.size > 1) {
    const names = [...reports.values()].map((p) => basename(toPosix(p))).sort(byName);
    throw new UsageError(
      `${input} names ${reports.size} reports; point at one of them: ${names.join(", ")}`,
    );
  }
  const [reportFolder, written] = [...reports][0]!;
  // A report outside both the project folder and the folder named is not looked up, and a run
  // that reads nothing else is refused naming it.
  if (!followed(folder, named, reportFolder))
    return walked(
      folder,
      folder,
      (w) => {
        unread(w, reportFolder, outside(folder, named, reportFolder));
        return w.project;
      },
      named,
      reach,
    );
  const kind = folderAt(reportFolder);
  if (kind === undefined) throw new UsageError(`${input} names ${written}, which does not exist`);
  if (!kind) throw new UsageError(`${input} names ${written}, which is not a folder`);
  return walked(
    folder,
    folder,
    (w) => readNamed(w, input, path, text, reportFolder, written),
    named,
    reach,
  );
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
  // A notice at the folder, or at a link on the way to it, means nothing in it may be looked up.
  if (
    w.project.diagnostics.some(
      (d) => d.kind === "unread-file" && (d.path === at || at.startsWith(`${d.path}/`)),
    )
  )
    return undefined;
  const p = join(folder, "definition.pbir");
  return attempt(w, p, () => (isFile(p) ? readFileSync(p, "utf8") : undefined));
}

const PBIR_UNREAD_REASON = "the report's definition.pbir could not be read";

/**
 * The report at `reportFolder`, which the .pbip at `pbip` names as `written`, and the model its
 * definition.pbir names by path, relative to the report folder, inside the project folder (the
 * folder that holds the .pbip) or the folder the user named, by where each really is, so a link
 * that leads out is caught too; a reference outside both is a notice and is not followed. The path is followed rather than compared
 * with a folder beside the report, so model-reference-mismatch does not arise here.
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
  if (!report && !out.absent.report && isFile(join(reportFolder, "report.json")))
    legacyPart(w, "report", reportFolder);
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
    if (!followed(w.base, w.named, modelFolder)) {
      // Not followed, and nothing in it is looked up.
      unread(w, modelFolder, outside(w.base, w.named, modelFolder));
      out.absent.model = OUTSIDE_MODEL;
    } else if (folderAt(modelFolder)) {
      model = readPart(w, "model", modelFolder, modelPart);
      if (!model && !out.absent.model && isFile(join(modelFolder, "model.bim")))
        legacyPart(w, "model", modelFolder);
      // A folder that is there and yields nothing else to say (one holding no .tmdl files) is
      // named as the folder route names it: the run did not include the model the report reads.
      if (!model && !out.absent.model) {
        const { reason } = pairingDecision(ref, undefined, basename(reportFolder));
        if (reason) out.absent.model = reason;
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

/**
 * The parts of the folder `w` walks, or of the one project below it (#174), or what it has to say
 * about them.
 */
function readFolder(w: Walk, input: string, path: string, preferred?: string): ResolvedProject {
  const out = w.project;
  const name = basename(path);

  // The folder is itself one part. A part's definition folder that is a link, to whatever, says so
  // in the part's read, as it does inside a PBIP folder; a plain folder is no part, so a link to
  // nothing there is passed over as any link to nothing is.
  const def = join(path, "definition");
  const namedPart = name.endsWith(".Report") || name.endsWith(".SemanticModel");
  if (isDir(def) || (namedPart && isLink(def))) {
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
    legacyPart(w, "report", path);
    return out;
  }
  if (name.endsWith(".SemanticModel") && isFile(join(path, "model.bim"))) {
    legacyPart(w, "model", path);
    return out;
  }

  // A PBIP folder: the parts sit beside each other. A link to a folder named as a part is one, so
  // that its read names it; a link to nothing is no folder, as in readTree.
  const listed = readdirSync(path, { withFileTypes: true });
  const dirs = listed
    .filter((e) => e.isDirectory() || (e.isSymbolicLink() && folderAt(join(path, e.name)) === true))
    .map((e) => e.name);
  const models = dirs.filter((d) => d.endsWith(".SemanticModel")).sort(byName);
  const reports = dirs.filter((d) => d.endsWith(".Report")).sort(byName);
  // Where one project's route refuses the folder named for holding several side by side, as Power
  // BI Desktop saves two projects into one folder, the run lints each (#237). A folder below the
  // one named, or a part, is refused as before.
  const several = (): void => {
    if (!w.reach.top || namedPart || name === "definition") return;
    const below = projectsBelow(foundBelow(w, path));
    if (below.length > 1) throw new SeveralProjects(below);
  };
  if (models.length > 1 || reports.length > 1) several();
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
  if (models[0] && !model && !out.absent.model && isFile(join(path, models[0], "model.bim")))
    legacyPart(w, "model", join(path, models[0]));
  const report = reports[0] ? readPart(w, "report", join(path, reports[0]), reportPart) : undefined;
  if (reports[0] && !report && !out.absent.report && isFile(join(path, reports[0], "report.json")))
    legacyPart(w, "report", join(path, reports[0]));
  if (report) {
    const pbip = pbipIn(input, path, preferred, several);
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
    const ref: DatasetReference = pbir ? datasetReference(pbir.text) : { kind: "none" };
    const decision = pairingDecision(ref, model ? models[0] : undefined, reports[0]!);
    // The reason is recorded whether or not a model sat beside the report: a thin report says it
    // reads a published model on the skipped line either way. A reason the model folder's own read
    // gave (a legacy model.bim, a folder that could not be read) says more than the path the report
    // names, which may be that very folder, so only a published model's replaces it.
    if (!decision.useModel) {
      model = undefined;
      if (decision.reason && (ref.kind === "byConnection" || !out.absent.model))
        out.absent.model = decision.reason;
    }
    if (decision.diagnostic) out.diagnostics.push(decision.diagnostic);
  }
  if (model) out.model = model;
  if (report) out.report = report;
  if (model || report) return out;

  // A plain folder, neither a part nor a PBIP folder and holding no .pbip (a link counted, as
  // pbipIn counts one), may hold projects in folders below it, as a repository holds each in a
  // folder of its own (#174). Read as loose files, one project's model would be linted without its
  // report, and two projects' models as one. So the one project found is linted as if it had been
  // given, its root the config search's start and the base of its notices' paths, with a notice
  // that names it first. Several below the folder named are each linted (#237, resolveInput); below
  // any other folder they are refused with a list, each with the command that lints it, and
  // nothing is linted. The project's walk is its own: what this folder's read met (a definition
  // folder that could not be read, say) is outside the project and refuses nothing, and a refusal
  // of the project itself, such as a model folder that holds no .tmdl files, is the run's, naming
  // the project's path joined to `input`, as any refusal of a path below the input does.
  if (
    !namedPart &&
    name !== "definition" &&
    !models.length &&
    !reports.length &&
    !listed.some((e) => isPbipEntry(path, e))
  ) {
    const below = projectsBelow(foundBelow(w, path));
    const at = (p: string): string => toPosix(join(input, p));
    if (below.length === 1) {
      // The folder named stays the user's, not the project's, so a reference that leaves the
      // project but stays inside it is followed.
      const project = resolveAt(at(below[0]!), w.named, { models: w.reach.models });
      w.refusal = undefined;
      return { ...project, diagnostics: [projectBelowNotice(below[0]!), ...project.diagnostics] };
    }
    if (below.length > 1 && w.reach.top) throw new SeveralProjects(below);
    if (below.length > 1)
      throw new UsageError(
        `${input} contains ${below.length} projects; point at one of them:`,
        below.map((p) => `  ${p}: pbiplint ${shellWord(at(p))}`),
      );
  }

  // Loose .tmdl files anywhere under a plain folder that holds no project, as v1 accepted. The
  // same walk, the whole folder but the skipped folders, notes each .pbix and model folder it
  // passes, for the refusals below.
  const direct = emptyPart(path);
  const passed: Passed = { pbix: [], models: [] };
  readTree(w, direct, path, (n) => n.endsWith(".tmdl"), passed);
  if (direct.files.length) return { ...out, model: direct };
  // Nothing to lint but something to say: a legacy part alone, or a part that could not be read,
  // which walked turns into a refused run naming the part or the path that refused.
  if (out.diagnostics.length) return out;
  // Nothing else explains it, so a model folder the walk met is named first, in core's words, as
  // the browser names it: the input when it is one, and each below it. Each holds no .tmdl files,
  // or the walk would have read one, and none has a notice, legacy or unread, or the run would
  // have returned above, to be refused in walked. Each is joined to `input` as the nothing-read
  // refusal joins its path, the input itself named by `input` alone, and they are listed in name
  // order by their whole path, as the browser sorts its drop-relative paths, not in the order the
  // walk met them.
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

/**
 * A file's text, or undefined when it is not there, is not a file, is a link, which is not
 * followed, or is one the operating system will not give.
 */
function textAt(p: string): string | undefined {
  try {
    return isLink(p) || !isFile(p) ? undefined : readFileSync(p, "utf8");
  } catch (e) {
    if (isSystemError(e)) return undefined;
    throw e;
  }
}

/**
 * What lies below the plain folder `dir`, for projectsBelow (#174): each .pbip with its text, each
 * .Report folder with its definition.pbir's, and each .SemanticModel folder, by its path from the
 * walk's base. A part folder is not entered, since what is in it is the part's, and neither are
 * the folders the walk skips (SKIP_DIRS: git's, the packages', Desktop's caches, and a report's
 * resources), which keeps a repository's root as quick to search as the walk for loose files is
 * to read. A link is not followed, a link to a .pbip included, and a folder the operating system
 * will not list is passed over without a notice: what either holds is outside every project
 * linted, and when no project is found the walk for loose files meets the same path and names it.
 * So the notice says the project is the only one found.
 */
function foundBelow(
  w: Walk,
  dir: string,
  found: FoundBelow = { pbips: [], reports: [], models: [] },
): FoundBelow {
  let entries: Dirent[];
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch (e) {
    if (isSystemError(e)) return found;
    throw e;
  }
  for (const entry of entries) {
    const p = join(dir, entry.name);
    const path = toPosix(relative(w.base, p));
    if (entry.isFile() && entry.name.endsWith(".pbip")) found.pbips.push({ path, text: textAt(p) });
    else if (!entry.isDirectory() || SKIP_DIRS.has(entry.name)) continue;
    else if (entry.name.endsWith(".Report"))
      found.reports.push({ path, pbir: textAt(join(p, "definition.pbir")) });
    else if (entry.name.endsWith(".SemanticModel")) found.models.push(path);
    else foundBelow(w, p, found);
  }
  return found;
}

/**
 * `p` as one word on a command line: as it is when it holds only characters no shell treats
 * specially, else in double quotes, which POSIX shells, PowerShell, and cmd all take for a path
 * with a space in it. A name holding `$`, a backquote, a double quote, `!` (bash's history), or
 * `%` (cmd's variables) needs escaping for the shell at hand, which no one quoting does for all
 * three.
 */
const shellWord = (p: string): string => (/^[\w./:@+-]+$/.test(p) ? p : `"${p}"`);
