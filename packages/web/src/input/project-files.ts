import {
  datasetReference,
  pairingDecision,
  type Diagnostic,
  type LayerName,
  type LintFile,
} from "@pbiplint/core";

/** One file read from a drop, a folder pick, or a directory input. Forward slashes, relative to the drop. */
export interface InputEntry {
  path: string;
  text: string;
}

/** A legacy part's marker file, seen by name and never opened. */
export interface InputMarker {
  path: string;
  kind: "legacy-report" | "legacy-model";
}

/**
 * What a reader saw: the files it read, every .SemanticModel and .Report folder it passed, read or
 * not, the legacy markers it saw by name, and what it could not read.
 */
export interface InputTree {
  entries: InputEntry[];
  /**
   * Drop-relative paths of the .SemanticModel folders seen, whether or not they held a .tmdl file.
   * A folder is known by its name alone; nothing inside it is opened unless it is a wanted file.
   */
  modelFolders: string[];
  /** Drop-relative paths of the .Report folders seen, read or not. */
  reportFolders: string[];
  /** A report.json directly under a .Report, or a model.bim directly under a .SemanticModel: seen by name, never opened. */
  markers: InputMarker[];
  /** What the walk could not do: a folder past the depth cap, a file or folder that failed to read. */
  diagnostics: Diagnostic[];
  /**
   * Drop-relative paths of the folders a walk could not list, each also named by an `unread-file`
   * diagnostic. The diagnostic does not say its path is a folder, and lint takes an unread folder
   * written with a trailing `/`, so the walk that knew records it here.
   */
  unreadFolders: string[];
  /**
   * The first path the walk could not read, with the browser's reason, as the CLI's Walk.refusal
   * holds it: set beside the first `unread-file` diagnostic and never overwritten, so a drop of
   * which nothing could be read is refused naming it. Absent when every read succeeded.
   */
  refusal?: { path: string; reason: string };
}

export const isReportFolder = (name: string): boolean => name.endsWith(".Report");
/** A tree before any reader has filled it; no refusal, since nothing has failed yet. */
export const emptyTree = (): InputTree => ({
  entries: [],
  modelFolders: [],
  reportFolders: [],
  markers: [],
  diagnostics: [],
  unreadFolders: [],
});

export interface SelectedProject {
  /**
   * The project root inside the drop, the folder the CLI's resolveProject would take: the dropped
   * PBIP folder, whether it holds one part or two; the part folder when a part is dropped alone; a
   * definition folder dropped alone; "" for a lone file, or several dropped side by side. The
   * config search starts here, and `read` is relative to it.
   */
  root: string;
  /**
   * What lint reads: the model's files relative to the model root, the report's relative to the
   * report root, and the project's .pbip as `../<name>.pbip`, one level above the report root, as
   * the CLI gives it.
   */
  files: LintFile[];
  /** Why a layer was left out, per layer: lint's `absent`. */
  absent: Partial<Record<LayerName, string>>;
  /**
   * What could not be read under each part present, relative to that part's root, a folder with a
   * trailing `/`: lint's `unreadPaths`. Each is also named in `diagnostics`, a folder that refused
   * by an `unread-file` notice and one past the depth cap by a `depth-cap` notice.
   */
  unreadPaths: Partial<Record<LayerName, string[]>>;
  /** The nearest pbiplint.config.json at or above the root, if the drop had one. */
  config?: { path: string; text: string };
  /** Sentences for under the results, such as a model folder in the drop that could not be linted. */
  notes: string[];
  /**
   * Every file that was read, as a path relative to the root, for listing under the results: the
   * model's files as they are, the report's marked "(report)", the config marked "(config)" and
   * any other "(config, not used)", and anything else read but not linted marked "(not linted)".
   * A skipped file shows by its absence.
   */
  read: string[];
  /**
   * What a reader of the results must know: the walk's notices about what this run would have
   * read or listed, as the CLI gives them (a folder past the depth cap always, since it could hide
   * a part), then a legacy part, then a report paired with no model beside it. Each path is
   * relative to `root`, as the CLI's are relative to its input.
   */
  diagnostics: Diagnostic[];
}

/** A problem with what was dropped, in words meant for the status line. */
export class InputError extends Error {
  // Error's own name otherwise, which says nothing in a console or a stack trace. The page matches
  // on the class, not on this.
  override name = "InputError";
}

export const CONFIG_FILE = "pbiplint.config.json";
const MODEL_SUFFIX = ".SemanticModel";
export const isModelFolder = (name: string): boolean => name.endsWith(MODEL_SUFFIX);

// The cause is offered, not asserted: the folder may as well be empty or half copied.
const TMDL_ONLY =
  "Only a model stored as TMDL can be linted; if it is in the older model.bim format, save it in the TMDL format from Power BI Desktop first.";
const NOTHING_FOUND =
  "No model or report found. Drop a PBIP folder, a .SemanticModel or .Report folder, or a .tmdl file.";

// The CLI's words (packages/cli/src/walk.ts), so both surfaces say the same about a legacy part.
const legacyReport = (name: string): Diagnostic => ({
  kind: "legacy-report-format",
  path: name,
  message: `${name} is stored as a single report.json, which pbiplint cannot read; save it in the PBIR format from Power BI Desktop`,
});
const legacyModel = (name: string): Diagnostic => ({
  kind: "legacy-model-format",
  path: name,
  message: `${name} is stored as model.bim, which pbiplint cannot read; save it in the TMDL format from Power BI Desktop`,
});
const LEGACY_REPORT_REASON = "the report is saved in the legacy report.json format";
const LEGACY_MODEL_REASON = "the model is saved in the legacy model.bim format";
const UNREAD_PART: Record<LayerName, string> = {
  model: "the model folder could not be read",
  report: "the report folder could not be read",
};

/** "A", "A and B", "A, B, and C". */
const listOf = (items: string[]): string =>
  items.length <= 2 ? items.join(" and ") : `${items.slice(0, -1).join(", ")}, and ${items.at(-1)}`;

const parent = (p: string): string => (p.includes("/") ? p.slice(0, p.lastIndexOf("/")) : "");
const nameOf = (p: string): string => p.slice(p.lastIndexOf("/") + 1);
const within = (path: string, dir: string): boolean => dir === "" || path.startsWith(dir + "/");
const atOrWithin = (path: string, dir: string): boolean => path === dir || within(path, dir);
const relativeTo = (path: string, dir: string): string =>
  dir === "" ? path : path.slice(dir.length + 1);
const join = (dir: string, name: string): string => (dir === "" ? name : `${dir}/${name}`);
const byPath = (a: LintFile, b: LintFile): number => a.path.localeCompare(b.path, "en");
const byName = (a: string, b: string): number => a.localeCompare(b, "en");
/**
 * A drop-relative path written relative to the model root the way a shell would:
 * "../pbiplint.config.json" for a config one folder up, "../Other/x.tmdl" for a file beside the
 * root. For listing every file read beside the model files.
 */
export function relativeToRoot(root: string, path: string): string {
  const from = root === "" ? [] : root.split("/");
  const to = path.split("/");
  let shared = 0;
  while (shared < from.length && shared < to.length - 1 && from[shared] === to[shared]) shared++;
  return "../".repeat(from.length - shared) + to.slice(shared).join("/");
}

/** A part as read off the tree: its root, its files relative to it, and what of it was not read. */
interface Part {
  /** Drop-relative path of the folder the part's paths are relative to. */
  root: string;
  files: LintFile[];
  /** The drop-relative path of each of `files`, for `read`. */
  sources: Set<string>;
  /** lint's `unreadPaths` for this part's layer, filled once every read is known. */
  unread: string[];
}

/**
 * One read the CLI would make: the paths it would open or list, and the part those paths belong
 * to. Entering a part folder and listing a PBIP folder for its parts are reads too, of that folder
 * alone and for no part.
 */
interface Read {
  covers: (path: string, folder: boolean) => boolean;
  part?: Part;
  /** The order the CLI meets the paths this read covers, where it is not `walkOrder`. */
  order?: (a: string, b: string) => number;
}

/** An `unread-file` notice of the tree, with whether its path is a folder. */
interface Unread {
  diagnostic: Diagnostic;
  path: string;
  folder: boolean;
}

/** What one selection knows and has decided so far. */
interface Selection {
  tree: InputTree;
  /** Every folder the walk shows exists, from the paths it saw and the folders it passed. */
  dirs: Set<string>;
  unread: Unread[];
  /**
   * The reads the CLI would have made, in the order it makes them; a notice they do not cover is
   * dropped, as the CLI never meets its path.
   */
  reads: Read[];
  absent: Partial<Record<LayerName, string>>;
  /** Diagnostics selectProject adds: the legacy parts, then the pairing. */
  said: Diagnostic[];
  /** The part folders a legacy diagnostic named, which need no note besides. */
  legacy: Set<string>;
}

/**
 * The .tmdl files under `dir`, relative to `root`: a model's definition folder, a definition
 * folder dropped alone, or loose files under the base folder. Every .tmdl file and folder under
 * `dir` is this read's, as the CLI's readTree takes them.
 */
function tmdlRead(s: Selection, root: string, dir: string): Part | undefined {
  const part: Part = { root, files: [], sources: new Set(), unread: [] };
  s.reads.push({
    part,
    covers: (p, folder) => (folder ? atOrWithin(p, dir) : within(p, dir) && p.endsWith(".tmdl")),
  });
  for (const e of s.tree.entries)
    if (within(e.path, dir) && e.path.endsWith(".tmdl")) {
      part.files.push({ path: relativeTo(e.path, root), text: e.text });
      part.sources.add(e.path);
    }
  return part.files.length ? part : undefined;
}

/**
 * The report part at `folder`, as the CLI's reportPart reads it: its definition.pbir, .platform,
 * and every JSON under its definition folder, counted only when a file under that folder was read.
 * A folder with no definition folder is not read at all.
 */
function reportRead(s: Selection, folder: string): Part | undefined {
  const def = join(folder, "definition");
  if (!s.dirs.has(def)) return undefined;
  const part: Part = { root: folder, files: [], sources: new Set(), unread: [] };
  const own = [join(folder, "definition.pbir"), join(folder, ".platform")];
  const covers = (p: string, folder = false): boolean =>
    folder ? atOrWithin(p, def) : own.includes(p) || (within(p, def) && p.endsWith(".json"));
  // The CLI reads definition.pbir, then .platform, and then walks the definition folder, so a
  // path's place in that list comes before its place in the walk.
  const rank = (p: string): number => (own.includes(p) ? own.indexOf(p) : own.length);
  s.reads.push({ part, covers, order: (a, b) => rank(a) - rank(b) || walkOrder(a, b) });
  for (const e of s.tree.entries)
    if (covers(e.path)) {
      part.files.push({ path: relativeTo(e.path, folder), text: e.text });
      part.sources.add(e.path);
    }
  return part.files.some((f) => f.path.startsWith("definition/")) ? part : undefined;
}

/**
 * Whether a read so far would have opened the notice's path, or listed it when it is a folder;
 * entering a part folder and listing a PBIP folder are reads too. Only such a notice is one the
 * results show and one that can refuse, since the CLI gives no other: a folder no read would have
 * listed (a model's DAXQueries, say, or a folder beside the parts) is never met.
 */
const covered = (s: Selection, u: Unread): boolean =>
  s.reads.some((r) => r.covers(u.path, u.folder));

/**
 * The order the CLI's walk meets two paths in within one read. Its readTree
 * (packages/cli/src/walk.ts) lists each folder's entries sorted by its byName, the same
 * localeCompare(…, "en") as `byName` here, and walks into a folder where its name sorts, so a
 * folder comes before everything in it. Comparing segment by segment gives that order where
 * comparing whole paths would not: the walk is through `tables` and has met `tables/Sales.tmdl`
 * before it reaches `tables.old`, though "tables.old" sorts before "tables/Sales.tmdl".
 */
function walkOrder(a: string, b: string): number {
  const as = a.split("/");
  const bs = b.split("/");
  for (let i = 0; i < Math.min(as.length, bs.length); i++)
    if (as[i] !== bs[i]) return byName(as[i]!, bs[i]!);
  return as.length - bs.length;
}

/**
 * The notice a run of which nothing could be read is refused naming: the first path that refused
 * in the order the CLI's reads meet them (a folder as it is entered or listed, the model's reads
 * before the report's), since the CLI names the first refusal it met. Within one read, the path
 * the CLI meets first there, whatever order the drop listed them in.
 */
function firstRefused(s: Selection): Unread | undefined {
  for (const r of s.reads) {
    const order = r.order ?? walkOrder;
    const [first] = s.unread
      .filter((x) => r.covers(x.path, x.folder))
      .sort((a, b) => order(a.path, b.path));
    if (first) return first;
  }
  return undefined;
}

/**
 * The part at `folder`, read by `read`, as the CLI's readPart: a part that yields nothing while a
 * notice names the folder itself, or something under it a read so far would have opened, was not
 * found empty either, so its layer is absent with a reason. A folder under it that no read would
 * have listed (a model's DAXQueries, say) refuses nothing, as the CLI never lists it. A plain
 * folder has no layer to name.
 */
function readPart(
  s: Selection,
  layer: LayerName | undefined,
  folder: string,
  read: () => Part | undefined,
): Part | undefined {
  // Entering the folder comes first, as the CLI's readPart tries it before anything in it, so a
  // notice naming the folder is the run's before one naming anything under it.
  s.reads.push({ covers: (p) => p === folder });
  const part = read();
  const refused = s.unread.some(
    (u) => u.path === folder || (within(u.path, folder) && covered(s, u)),
  );
  if (!part && layer && refused) s.absent[layer] = UNREAD_PART[layer];
  return part;
}

/**
 * Whether a model folder holds a .tmdl file, or could: one it could not read, or the folder itself
 * or its definition folder could not be listed. One with none of these is linted by no one, so it
 * is named in a note rather than refused beside a lintable model, and it is what the error names
 * when nothing can be linted. Another folder in it that could not be listed (DAXQueries, say)
 * cannot hide the definition folder, which the folder's own listing would have shown.
 */
const holdsModel = (s: Selection, dir: string): boolean =>
  s.tree.entries.some((e) => within(e.path, dir) && e.path.endsWith(".tmdl")) ||
  s.unread.some((u) =>
    u.folder
      ? u.path === dir || atOrWithin(u.path, join(dir, "definition"))
      : within(u.path, dir) && u.path.endsWith(".tmdl"),
  );

const hasMarker = (s: Selection, path: string, kind: InputMarker["kind"]): boolean =>
  s.tree.markers.some((m) => m.path === path && m.kind === kind);

/**
 * Why the model layer is absent for a report read on its own, as the CLI's loneReportAbsent: its
 * own definition.pbir still says whether it reads a published model.
 */
function loneReportAbsent(report: Part): Partial<Record<LayerName, string>> {
  const pbir = report.files.find((f) => f.path === "definition.pbir");
  const decision = pairingDecision(
    pbir ? datasetReference(pbir.text) : { kind: "none" },
    undefined,
    nameOf(report.root),
  );
  return !decision.useModel && decision.reason ? { model: decision.reason } : {};
}

interface Parts {
  model?: Part;
  report?: Part;
}

/** The parts of the folder at `base`, as the CLI's readFolder finds them, in the same order. */
function readFolder(s: Selection, base: string): Parts {
  const name = nameOf(base);
  // The folder is itself one part. Its name says which, and only that part's read may record a
  // reason: a .Report is read for .tmdl files first, and finding none is not a refusal.
  if (s.dirs.has(join(base, "definition"))) {
    const model = readPart(s, isModelFolder(name) ? "model" : undefined, base, () =>
      tmdlRead(s, base, join(base, "definition")),
    );
    if (model) return { model };
    const report = readPart(s, isReportFolder(name) ? "report" : undefined, base, () =>
      reportRead(s, base),
    );
    if (report) {
      s.absent = loneReportAbsent(report);
      return { report };
    }
  }
  // A definition folder dropped alone is a model's, read with the folder as its root. (A report's
  // is never read: the walkers want a report's JSON only under a .Report folder.)
  if (name === "definition") {
    const model = tmdlRead(s, base, base);
    if (model) return { model };
  }
  // A part folder in the legacy format.
  if (isReportFolder(name) && hasMarker(s, join(base, "report.json"), "legacy-report")) {
    s.said.push(legacyReport(name));
    s.absent.report = LEGACY_REPORT_REASON;
    s.legacy.add(base);
    return {};
  }
  if (isModelFolder(name) && hasMarker(s, join(base, "model.bim"), "legacy-model")) {
    s.said.push(legacyModel(name));
    s.absent.model = LEGACY_MODEL_REASON;
    s.legacy.add(base);
    return {};
  }

  // A PBIP folder: the parts sit beside each other. The CLI lists the folder to find them, so a
  // notice naming it (a listing the browser could make only in part) is one this run met.
  s.reads.push({ covers: (p) => p === base });
  const children = (is: (name: string) => boolean): string[] =>
    [...s.dirs].filter((d) => d !== base && parent(d) === base && is(nameOf(d))).sort(byName);
  const modelDirs = children(isModelFolder);
  const models = modelDirs.filter((d) => holdsModel(s, d));
  if (models.length > 1)
    throw new InputError(
      `${base || "The drop"} contains ${models.length} semantic models; drop one of them: ${models.map(nameOf).join(", ")}`,
    );
  const reports = children(isReportFolder);
  if (reports.length > 1)
    throw new InputError(
      `${base || "The drop"} contains ${reports.length} reports; drop one of them: ${reports.map(nameOf).join(", ")}`,
    );
  const modelDir = models[0] ?? (modelDirs.length === 1 ? modelDirs[0] : undefined);
  const reportDir = reports[0];
  let model = modelDir
    ? readPart(s, "model", modelDir, () => tmdlRead(s, modelDir, join(modelDir, "definition")))
    : undefined;
  // A part folder that could not be read has said so already.
  if (
    modelDir &&
    !model &&
    !s.absent.model &&
    hasMarker(s, join(modelDir, "model.bim"), "legacy-model")
  ) {
    s.said.push(legacyModel(nameOf(modelDir)));
    s.absent.model = LEGACY_MODEL_REASON;
    s.legacy.add(modelDir);
  }
  const report = reportDir
    ? readPart(s, "report", reportDir, () => reportRead(s, reportDir))
    : undefined;
  if (
    reportDir &&
    !report &&
    !s.absent.report &&
    hasMarker(s, join(reportDir, "report.json"), "legacy-report")
  ) {
    s.said.push(legacyReport(nameOf(reportDir)));
    s.absent.report = LEGACY_REPORT_REASON;
    s.legacy.add(reportDir);
  }
  if (report && reportDir) {
    readPbip(s, base, report);
    const pbir = report.files.find((f) => f.path === "definition.pbir");
    const decision = pairingDecision(
      pbir ? datasetReference(pbir.text) : { kind: "none" },
      model && modelDir ? nameOf(modelDir) : undefined,
      nameOf(reportDir),
    );
    // The reason is recorded whether or not a model sat beside the report: a thin report says it
    // reads a published model on the skipped line either way.
    if (!decision.useModel) {
      model = undefined;
      if (decision.reason) s.absent.model = decision.reason;
    }
    if (decision.diagnostic) s.said.push(decision.diagnostic);
  }
  if (model || report) return { model, report };

  // Loose .tmdl files anywhere under a plain folder, as v1 accepted.
  const loose = tmdlRead(s, base, base);
  return loose ? { model: loose } : {};
}

/**
 * The project's .pbip, at the project root beside the report, joins the report's files as
 * `../<name>.pbip`, the path the CLI gives it. Only a report brings it in, so a .pbip never makes
 * a report layer present on its own (tracked in #59). Two are refused rather than guessed at.
 */
function readPbip(s: Selection, base: string, report: Part): void {
  const atBase = (p: string): boolean => parent(p) === base && p.endsWith(".pbip");
  const found = [
    ...new Set([
      ...s.tree.entries.map((e) => e.path).filter(atBase),
      ...s.unread.filter((u) => !u.folder && atBase(u.path)).map((u) => u.path),
    ]),
  ].sort(byName);
  if (found.length > 1)
    throw new InputError(
      `${base || "The drop"} contains ${found.length} .pbip files; drop a folder that holds one of them: ${found.map(nameOf).join(", ")}`,
    );
  const path = found[0];
  if (path === undefined) return;
  s.reads.push({ part: report, covers: (p, folder) => !folder && p === path });
  const entry = s.tree.entries.find((e) => e.path === path);
  if (entry) {
    report.files.push({ path: relativeToRoot(report.root, path), text: entry.text });
    report.sources.add(path);
  }
}

/**
 * The nearest config at or above `root`, walking up to the drop root, as the CLI walks up to the
 * filesystem root. One the walk could not read refuses the run, as the CLI's readConfig refuses
 * it and as the page refuses a config that is not valid JSON: linting around it would apply none
 * of the rules it sets and read as though it had.
 */
function findConfig(s: Selection, root: string): SelectedProject["config"] {
  const entries = new Map(s.tree.entries.map((e) => [e.path, e]));
  for (let dir = root; ; dir = parent(dir)) {
    const path = join(dir, CONFIG_FILE);
    const hit = entries.get(path);
    if (hit) return { path: hit.path, text: hit.text };
    const refused = s.unread.find((u) => !u.folder && u.path === path);
    if (refused) throw new InputError(`Could not read ${path}: ${reasonOf(s.tree, refused)}`);
    if (dir === "") return undefined;
  }
}

/**
 * Every folder the walk shows exists: the folders above each path it saw, and each folder it
 * passed or could not list, with the folders above those.
 */
function foldersOf(tree: InputTree): { dirs: Set<string>; files: string[]; folders: string[] } {
  const unreadFolders = new Set(tree.unreadFolders);
  const files = [
    ...tree.entries.map((e) => e.path),
    ...tree.markers.map((m) => m.path),
    ...tree.diagnostics
      .filter((d) => d.kind === "unread-file" && d.path !== undefined && !unreadFolders.has(d.path))
      .map((d) => d.path!),
  ];
  const folders = [
    ...tree.modelFolders,
    ...tree.reportFolders,
    ...tree.unreadFolders,
    ...tree.diagnostics.filter((d) => d.kind === "depth-cap" && d.path).map((d) => d.path!),
  ];
  const dirs = new Set<string>();
  for (const f of files) for (let d = parent(f); d !== ""; d = parent(d)) dirs.add(d);
  for (const f of folders) for (let d = f; d !== ""; d = parent(d)) dirs.add(d);
  return { dirs, files, folders };
}

/**
 * The reason a notice gives, as the walkers write it. The tree's refusal holds the first one's;
 * a later one is read back out of its message.
 */
function reasonOf(tree: InputTree, u: Unread): string {
  if (tree.refusal?.path === u.path) return tree.refusal.reason;
  const head = `${u.path} could not be read (`;
  const tail = "), so it was not linted";
  const m = u.diagnostic.message;
  return m.startsWith(head) && m.endsWith(tail) ? m.slice(head.length, m.length - tail.length) : m;
}

/**
 * A walker's notice with its path relative to the project root, as the CLI's are relative to its
 * input, and its message rebuilt in the same words: `<path> could not be read (<reason>), so it
 * was not linted`, or the depth cap's `the walk stopped 64 folders deep at <path>, so files below
 * it were not read`. The walkers write paths relative to the drop, so with the root "" nothing
 * changes; the root itself, which has no path relative to itself, keeps its name, as the CLI
 * names its input.
 */
function rebased(d: Diagnostic, root: string): Diagnostic {
  if (root === "" || d.path === undefined || !within(d.path, root)) return d;
  const from = d.path;
  const path = relativeTo(from, root);
  const m = d.message;
  const unreadTail = "), so it was not linted";
  const capTail = ", so files below it were not read";
  const capAt = ` folders deep at ${from}${capTail}`;
  const message =
    d.kind === "unread-file" &&
    m.startsWith(`${from} could not be read (`) &&
    m.endsWith(unreadTail)
      ? `${path}${m.slice(from.length)}`
      : d.kind === "depth-cap" && m.startsWith("the walk stopped ") && m.endsWith(capAt)
        ? `${m.slice(0, m.length - capAt.length)} folders deep at ${path}${capTail}`
        : m;
  return { ...d, path, message };
}

/**
 * Mirrors the CLI's resolveProject (packages/cli/src/walk.ts) on a tree of paths, making the same
 * decisions in the same order: a folder with a definition folder is one part, the model if it
 * holds .tmdl files, else a .Report's report; a definition folder dropped alone is a model; a part
 * folder in the legacy format is a diagnostic with its layer absent; else the .SemanticModel and
 * .Report folders directly inside the folder are the project, paired through the report's
 * definition.pbir, with the .pbip beside them; else every .tmdl file under the folder is linted
 * with paths relative to it.
 *
 * Where the browser has always differed, it still does: a .SemanticModel folder holding no .tmdl
 * file (an older model.bim model, or an empty one) never triggers the two-model refusal the CLI
 * gives; the one lintable model is linted and the other is named in a note. When nothing can be
 * linted, the error names it instead.
 *
 * The walkers read more than the CLI opens, since a drop is read before anything is decided. A
 * notice about a file this run would not have read, or a folder it would not have entered or
 * listed, is dropped, as the CLI never names such a path; one about the depth cap is kept, since
 * it could hide a part. Only what a read would have opened or listed refuses a part or the drop,
 * the first in the CLI's read order naming a refused drop, and a folder or cap under a part is one
 * of its unread paths. The notices passed on name their paths relative to the root, as the CLI's
 * are relative to its input. A config the run would use and could not read refuses the run, after
 * the parts, as the CLI finds its config after the project.
 */
export function selectProject(tree: InputTree): SelectedProject {
  const { dirs, files: filePaths, folders } = foldersOf(tree);
  const unreadFolders = new Set(tree.unreadFolders);
  const s: Selection = {
    tree,
    dirs,
    unread: tree.diagnostics
      .filter((d) => d.kind === "unread-file" && d.path !== undefined)
      .map((d) => ({ diagnostic: d, path: d.path!, folder: unreadFolders.has(d.path!) })),
    reads: [],
    absent: {},
    said: [],
    legacy: new Set(),
  };

  // The dropped folder is the first path segment of everything; a lone file has no folder, and
  // several items dropped side by side have no one folder above them.
  const firsts = new Set([...filePaths, ...folders].map((p) => p.split("/")[0]!));
  const base = firsts.size === 1 && filePaths.every((p) => p.includes("/")) ? [...firsts][0]! : "";
  const { model, report } = readFolder(s, base);
  const root = base;

  // What each part could not read, relative to its root, from the reads that were its own: the
  // files and folders that refused, and a folder the walk stopped in at the depth cap, which is
  // as unread as one that refused but refuses nothing.
  const capped = tree.diagnostics
    .filter((d) => d.kind === "depth-cap" && d.path !== undefined)
    .map((d) => ({ path: d.path!, folder: true }));
  for (const u of [...s.unread, ...capped])
    for (const r of s.reads) {
      if (!r.part || !r.covers(u.path, u.folder) || u.path === r.part.root) continue;
      const rel = relativeToRoot(r.part.root, u.path) + (u.folder ? "/" : "");
      if (!r.part.unread.includes(rel)) r.part.unread.push(rel);
    }
  // The walk's notices this run met, and every depth cap, each rebased onto the root; then what
  // this selection has to say, already written relative to it.
  const diagnostics = [
    ...tree.diagnostics
      .filter((d) => {
        const u = s.unread.find((x) => x.diagnostic === d);
        return u === undefined || covered(s, u);
      })
      .map((d) => rebased(d, root)),
    ...s.said,
  ];

  // Model folders no one lints, and that nothing else here explains, are named in a note.
  const unlintable = [...dirs]
    .filter((d) => isModelFolder(nameOf(d)) && !s.legacy.has(d) && !holdsModel(s, d))
    .sort(byName);
  // "X holds no .tmdl files", built only when there is such a folder to name.
  const holdsNoTmdl = (): string =>
    `${listOf(unlintable)} hold${unlintable.length === 1 ? "s" : ""} no .tmdl files`;

  if (!model && !report) {
    // A drop of which nothing could be read, while something this run read refused, is refused
    // naming the first such path in the CLI's read order: a run over it would read as clean with
    // nothing linted. What refused counts only when a read would have opened or listed it, so a
    // legacy part alone refuses nothing, as in the CLI, whatever else it holds. The path stays
    // relative to the drop, which joins it to the dropped folder as the CLI joins it to its input.
    const refused = firstRefused(s);
    if (refused) throw new InputError(`Could not read ${refused.path}: ${reasonOf(tree, refused)}`);
    // Nothing to lint but something to say, a legacy part alone or a walk stopped at the cap: the
    // run goes on, and its notices say why nothing was linted.
    if (diagnostics.length === 0)
      throw new InputError(unlintable.length ? `${holdsNoTmdl()}. ${TMDL_ONLY}` : NOTHING_FOUND);
  }
  const notes = unlintable.length
    ? [`${holdsNoTmdl()} and ${unlintable.length === 1 ? "was" : "were"} not linted. ${TMDL_ONLY}`]
    : [];
  // The config after the parts, as the CLI finds it after resolveProject: a drop that is refused
  // for what it holds is refused for that first.
  const config = findConfig(s, root);

  const files = [...(model?.files ?? []).sort(byPath), ...(report?.files ?? []).sort(byPath)];
  const read = tree.entries
    .map((e) => {
      const rel = relativeToRoot(root, e.path);
      if (e.path === config?.path) return `${rel} (config)`;
      if (e.path.endsWith(CONFIG_FILE)) return `${rel} (config, not used)`;
      if (model?.sources.has(e.path)) return rel;
      if (report?.sources.has(e.path)) return `${rel} (report)`;
      return `${rel} (not linted)`;
    })
    .sort(byName);
  return {
    root,
    files,
    absent: s.absent,
    unreadPaths: {
      ...(model ? { model: model.unread } : {}),
      ...(report ? { report: report.unread } : {}),
    },
    config,
    notes,
    read,
    diagnostics,
  };
}
