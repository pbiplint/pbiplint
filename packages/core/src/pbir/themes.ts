import type { LintFile } from "../engine/lint.js";
import type { ParseIssue } from "../tmdl/types.js";
import { readJson } from "./json.js";
import type { Report, ThemeFile } from "./types.js";

/**
 * The folders, relative to a report's root, whose JSON files every input reader opens: where
 * Power BI Desktop keeps a base theme, a built-in theme, and a custom theme. Only the files
 * directly in them; `report.json` says which of those are the report's themes.
 */
export const THEME_FOLDERS: readonly string[] = Object.freeze([
  "StaticResources/SharedResources/BaseThemes",
  "StaticResources/SharedResources/BuiltInThemes",
  "StaticResources/RegisteredResources",
]);

/**
 * A theme folder can also hold other JSON, which nobody asked pbiplint to read, so a file larger
 * than this is not opened. Microsoft's base themes are under 20 KB, so this sits far above any
 * theme. A theme `report.json` names that is over it reads as absent.
 */
export const MAX_THEME_BYTES = 5 * 1024 * 1024;

const THEME_FILE =
  /(^|\/)StaticResources\/(SharedResources\/(BaseThemes|BuiltInThemes)|RegisteredResources)\/[^/]+\.json$/;

/** Whether a path is a JSON file directly in a theme folder, at or below a report's root. */
export const isThemeFile = (path: string): boolean => THEME_FILE.test(path);

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

/**
 * The path an item of a resource package names, from the report's root: an item's `path` is
 * relative to `StaticResources/<package name>/`, and one that leaves that folder is not used.
 */
function itemPath(packageName: string, path: string): string | undefined {
  const parts = path.replace(/\\/g, "/").split("/");
  if (parts[0] === "" || parts.includes("..")) return undefined;
  return `StaticResources/${packageName}/${parts.join("/")}`;
}

/**
 * Where the theme `name` is, by the `resourcePackages` item of that name, whatever the item's type:
 * Microsoft's own samples register a custom theme as an `Image`. The package the theme's own `type`
 * names is looked in first.
 */
function themePath(json: Record<string, unknown>, name: string, type: unknown): string | undefined {
  const packages = Array.isArray(json.resourcePackages) ? json.resourcePackages.filter(isRecord) : [];
  const ordered = [
    ...packages.filter((p) => p.name === type),
    ...packages.filter((p) => p.name !== type),
  ];
  for (const pack of ordered) {
    if (typeof pack.name !== "string" || !Array.isArray(pack.items)) continue;
    const item = pack.items.filter(isRecord).find((i) => i.name === name);
    if (item) return typeof item.path === "string" ? itemPath(pack.name, item.path) : undefined;
  }
  return undefined;
}

function readTheme(
  json: Record<string, unknown>,
  entry: unknown,
  given: ReadonlyMap<string, LintFile>,
  issues: ParseIssue[],
): ThemeFile | undefined {
  if (!isRecord(entry) || typeof entry.name !== "string") return undefined;
  const { name } = entry;
  const path = themePath(json, name, entry.type);
  const file = path === undefined || !isThemeFile(path) ? undefined : given.get(path);
  if (!file) return { name, state: "absent" };
  const read = readJson(file.path, file.text, { objectRoot: true });
  if (read.issues.length > 0 || !isRecord(read.json)) {
    issues.push(...read.issues);
    return { name, state: "unparsed", file: file.path };
  }
  return { name, state: "read", file: file.path, text: file.text, json: read.json };
}

/**
 * The themes a read report.json names, from the theme files the reader handed over: a file nobody
 * names is never parsed, so other JSON in a theme folder raises nothing. A named theme that does
 * not parse raises an issue; one that is not there is not an error, as Desktop has its own copy of
 * a base theme, but whatever depends on it cannot be known.
 */
export function readThemes(
  reportJson: unknown,
  given: ReadonlyMap<string, LintFile>,
  issues: ParseIssue[],
): Report["themes"] {
  if (!isRecord(reportJson) || !isRecord(reportJson.themeCollection)) return {};
  const { baseTheme, customTheme } = reportJson.themeCollection;
  const base = readTheme(reportJson, baseTheme, given, issues);
  const custom = readTheme(reportJson, customTheme, given, issues);
  return { ...(base ? { base } : {}), ...(custom ? { custom } : {}) };
}
