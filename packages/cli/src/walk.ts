import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
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
const isDir = (p: string): boolean => existsSync(p) && statSync(p).isDirectory();
const isFile = (p: string): boolean => existsSync(p) && statSync(p).isFile();
const byName = (a: string, b: string): number => a.localeCompare(b, "en");

function readTree(
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
      if (!SKIP_DIRS.has(entry.name)) readTree(root, p, keep, out);
    } else if (keep(entry.name))
      out.push({ path: toPosix(relative(root, p)), text: readFileSync(p, "utf8") });
  }
}

/** The model part at `folder`: its definition folder's .tmdl files, or nothing. */
function modelPart(folder: string): ResolvedPart | undefined {
  const def = join(folder, "definition");
  if (!isDir(def)) return undefined;
  const files: LintFile[] = [];
  readTree(folder, def, (n) => n.endsWith(".tmdl"), files);
  return files.length ? { root: folder, files } : undefined;
}

/** The report part at `folder`: definition.pbir, .platform, and every JSON under definition, or nothing. */
function reportPart(folder: string): ResolvedPart | undefined {
  const def = join(folder, "definition");
  if (!isDir(def)) return undefined;
  const files: LintFile[] = [];
  for (const name of ["definition.pbir", ".platform"])
    if (isFile(join(folder, name)))
      files.push({ path: name, text: readFileSync(join(folder, name), "utf8") });
  readTree(folder, def, (n) => n.endsWith(".json"), files);
  return files.some((f) => f.path.startsWith("definition/")) ? { root: folder, files } : undefined;
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
 * still says whether it reads a published model, which the layers line reports as the reason.
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
const LEGACY_REPORT_REASON = "saved in the legacy report.json format";
const LEGACY_MODEL_REASON = "saved in the legacy model.bim format";

/** Find the project at or under `input` and read its parts (spec section 4). */
export function resolveProject(input: string): ResolvedProject {
  const path = resolve(input);
  if (!existsSync(path)) throw new UsageError(`${input} does not exist`);
  if (statSync(path).isFile()) {
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
    if (path.endsWith(".pbip")) return resolveFolder(dirname(path), dirname(path), basename(path));
    throw new UsageError(`${input} is not a .tmdl file, a .pbip file, or a folder`);
  }
  return resolveFolder(input, path);
}

/**
 * A folder, either given directly or named by a .pbip. `preferred` is that .pbip's file name, so
 * a project holding more than one is read as the user asked instead of refused.
 */
function resolveFolder(input: string, path: string, preferred?: string): ResolvedProject {
  const out: ResolvedProject = { root: path, absent: {}, diagnostics: [] };
  const name = basename(path);

  // The folder is itself one part.
  if (isDir(join(path, "definition"))) {
    const model = modelPart(path);
    if (model) return { ...out, model };
    const report = reportPart(path);
    if (report) return { ...out, report, absent: loneReportAbsent(report, path) };
  }
  // A definition folder given directly: a model's is read as v1 did, a report's from its parent.
  if (name === "definition") {
    const tmdl: LintFile[] = [];
    readTree(path, path, (n) => n.endsWith(".tmdl"), tmdl);
    if (tmdl.length) return { ...out, model: { root: path, files: tmdl } };
    const report = reportPart(dirname(path));
    if (report)
      return {
        root: dirname(path),
        report,
        absent: loneReportAbsent(report, dirname(path)),
        diagnostics: [],
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
  let model = models[0] ? modelPart(join(path, models[0])) : undefined;
  if (models[0] && !model && isFile(join(path, models[0], "model.bim"))) {
    out.diagnostics.push(legacyModel(path, models[0]));
    out.absent.model = LEGACY_MODEL_REASON;
  }
  const report = reports[0] ? reportPart(join(path, reports[0])) : undefined;
  if (reports[0] && !report && isFile(join(path, reports[0], "report.json"))) {
    out.diagnostics.push(legacyReport(path, reports[0]));
    out.absent.report = LEGACY_REPORT_REASON;
  }
  if (report) {
    const pbip = pbipIn(input, path, preferred);
    // The .pbip sits at the project root, one level above the report root every other path is
    // relative to, so it carries that relative path and a finding on it points at the real file.
    if (pbip)
      report.files.push({
        path: toPosix(relative(report.root, join(path, pbip))),
        text: readFileSync(join(path, pbip), "utf8"),
      });
    const pbir = report.files.find((f) => f.path === "definition.pbir");
    const decision = pairingDecision(
      pbir ? datasetReference(pbir.text) : { kind: "none" },
      model ? models[0] : undefined,
      reports[0]!,
    );
    // The reason is recorded whether or not a model sat beside the report: a thin report says it
    // reads a published model on the layers line either way.
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
  readTree(path, path, (n) => n.endsWith(".tmdl"), direct);
  if (direct.length) return { ...out, model: { root: path, files: direct } };
  // Nothing to lint but something to say: a legacy part alone.
  if (out.diagnostics.length) return out;
  throw new UsageError(
    `No semantic model or report found at ${input} (expected ${EXPECTED_INPUT})`,
  );
}
