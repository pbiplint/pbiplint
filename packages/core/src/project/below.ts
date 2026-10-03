import { readJson } from "../pbir/json.js";
import { datasetReference } from "./route.js";
import type { Diagnostic } from "./types.js";

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

/**
 * The report paths a .pbip's `artifacts` name, as it writes them. Microsoft's pbipProperties
 * schema gives `artifacts` as `{ "report": { "path" } }` entries only: a .pbip reaches its model
 * through the report's definition.pbir. A .pbip that is not a JSON object names none.
 */
export function reportsNamed(text: string): string[] {
  const json = readJson(".pbip", text).json;
  if (!isRecord(json) || !Array.isArray(json.artifacts)) return [];
  return json.artifacts.flatMap((a: unknown) =>
    isRecord(a) && isRecord(a.report) && typeof a.report.path === "string" ? [a.report.path] : [],
  );
}

/**
 * What a search below a plain folder met (spec section 4, #174): each path relative to that
 * folder, in forward slashes. The CLI's walk and the browser's tree each gather it, and
 * projectsBelow decides for both, so the two find the same projects.
 */
export interface FoundBelow {
  /** Each .pbip file, with its text when it could be read. */
  pbips: { path: string; text?: string }[];
  /** Each .Report folder, with its definition.pbir's text when it could be read. */
  reports: { path: string; pbir?: string }[];
  /** Each .SemanticModel folder. */
  models: string[];
}

const parentOf = (p: string): string => (p.includes("/") ? p.slice(0, p.lastIndexOf("/")) : "");

/**
 * The path `to`, which a project file writes relative to the folder `from`, as a path relative to
 * the folder searched, its `.` and `..` taken and either slash read as one; undefined when it
 * climbs out of that folder, where nothing the search met can be.
 */
function resolveIn(from: string, to: string): string | undefined {
  const out = from === "" ? [] : from.split("/");
  for (const segment of to.split(/[\\/]/)) {
    if (segment === "" || segment === ".") continue;
    if (segment !== "..") out.push(segment);
    else if (out.pop() === undefined) return undefined;
  }
  return out.join("/");
}

/**
 * The projects below a plain folder, each by the path that lints it, relative to that folder, in
 * name order by the whole path (spec section 4, #174). A project is a .pbip, or a .Report or
 * .SemanticModel folder that no .pbip takes in:
 *
 * - A .pbip takes in each report its `artifacts` name and the model each of those reports names in
 *   its definition.pbir by path, wherever they sit, as the CLI's .pbip route reads them; a .pbip
 *   that names no report takes in the parts beside it, as that route reads its folder.
 * - A report no .pbip names is a project of its own, and the model it names by path is part of it
 *   when the report's folder is the path that lints the two (below).
 * - A model nothing above takes in is a project of its own.
 *
 * A project of more than one of these, all in one folder that holds nothing else of the kind, is
 * given as that folder, which read as a PBIP folder lints exactly them; any other project is given
 * as its .pbip or its part folder. So a report and its model with no .pbip, alone in a folder, are
 * that folder, and beside another pair each is its own part folder, since pointed at, the folder
 * would be refused as holding two of each and a report folder reads its report alone. Names are
 * compared without regard to case, as pairingDecision compares the folder a report names.
 */
export function projectsBelow(found: FoundBelow): string[] {
  const key = (p: string): string => p.toLowerCase();
  const reports = new Map(found.reports.map((r) => [key(r.path), r]));
  const models = new Map(found.models.map((m) => [key(m), m]));
  const parts = [...found.reports.map((r) => r.path), ...found.models];
  const all = [...found.pbips.map((p) => p.path), ...parts];
  const modelOf = (report: FoundBelow["reports"][number]): string | undefined => {
    const ref = report.pbir === undefined ? undefined : datasetReference(report.pbir);
    const at = ref?.kind === "byPath" ? resolveIn(report.path, ref.path) : undefined;
    return at === undefined ? undefined : models.get(key(at));
  };
  /** The folder holding exactly these, when there is one, else undefined. */
  const folderOf = (members: string[]): string | undefined => {
    const dir = parentOf(members[0]!);
    const own = new Set(members.map(key));
    return dir !== "" &&
      own.size > 1 &&
      members.every((m) => parentOf(m) === dir) &&
      all.every((p) => parentOf(p) !== dir || own.has(key(p)))
      ? dir
      : undefined;
  };
  const taken = new Set<string>();
  const paths: string[] = [];
  for (const pbip of found.pbips) {
    const dir = parentOf(pbip.path);
    const named = pbip.text === undefined ? [] : reportsNamed(pbip.text);
    const members = [pbip.path];
    if (named.length === 0) members.push(...parts.filter((p) => parentOf(p) === dir));
    for (const written of named) {
      const at = resolveIn(dir, written);
      const report = at === undefined ? undefined : reports.get(key(at));
      if (!report) continue;
      const model = modelOf(report);
      members.push(report.path, ...(model === undefined ? [] : [model]));
    }
    for (const m of members) taken.add(key(m));
    paths.push(folderOf(members) ?? pbip.path);
  }
  for (const report of reports.values()) {
    if (taken.has(key(report.path))) continue;
    const model = modelOf(report);
    const folder = model === undefined ? undefined : folderOf([report.path, model]);
    // Only the folder lints the model with the report; a report folder reads its report alone.
    if (folder !== undefined) taken.add(key(model!));
    paths.push(folder ?? report.path);
  }
  for (const model of models.values()) if (!taken.has(key(model))) paths.push(model);
  return paths.sort((a, b) => a.localeCompare(b, "en"));
}

/**
 * The notice for the one project below a plain folder, which was linted as if it had been given,
 * as the CLI and the browser both give it: `path` is the project's path relative to that folder.
 * It comes first, since every path the run's other notices name is relative to the project.
 */
export function projectBelowNotice(path: string): Diagnostic {
  return {
    kind: "project-below-input",
    path,
    message: `${path} is the only project below the folder given, so it was linted as if given directly`,
  };
}
