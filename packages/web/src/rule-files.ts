import { ConfigError, isConfigError, RULE_FILE_BYTES, ruleFileName } from "@pbiplint/core";
import type { CustomRuleSet } from "@pbiplint/core/custom-rules";
import { InputError, type OpenFile } from "./input/project-files.js";
import { SKIP_DIRS, skipsFolder } from "./input/read-drop.js";

/** The custom rules chunk, as the dynamic import hands it over. */
export type CustomRulesModule = typeof import("./custom-rules.js");

/** The refusal of a drop whose config names rule files when the chunk could not be fetched. */
export const CUSTOM_RULES_LOAD_FAILED =
  "pbiplint could not load its custom rules code from this site, so the folder was not linted. Reload the page, then drop or choose the folder again.";

/** The custom rules chunk: fetched by `preload`, and only by it; handed to a drop by `loaded`. */
export interface CustomRulesLoader {
  /**
   * Fetches the chunk, once for the page however often it is called; a failed fetch is refused in
   * the page's words. The only way the chunk is ever asked for.
   */
  preload(): Promise<CustomRulesModule>;
  /**
   * The preload's promise, in flight or settled, for a drop. It never starts a fetch: when the
   * preload never started, or failed, it refuses in the page's words, which say to reload.
   */
  loaded(): Promise<CustomRulesModule>;
}

/** A loader for the custom rules chunk over `importer`, which only its `preload` calls. */
export function customRulesLoader(importer: () => Promise<CustomRulesModule>): CustomRulesLoader {
  let loading: Promise<CustomRulesModule> | undefined;
  const refused = (): never => {
    throw new InputError(CUSTOM_RULES_LOAD_FAILED);
  };
  return {
    preload: () => (loading ??= importer().catch(refused)),
    loaded: () => loading ?? Promise.reject(new InputError(CUSTOM_RULES_LOAD_FAILED)),
  };
}

/** The page's custom rules chunk, fetched from the site's own origin. */
const page = customRulesLoader(() => import("./custom-rules.js"));

/** The page's custom rules chunk for a drop: the start-up preload's, never a fetch of its own. */
export const loadCustomRules = (): Promise<CustomRulesModule> => page.loaded();

/**
 * Fetches the custom rules chunk from start-up, at the first idle moment or within a second,
 * without waiting for the page's load event, so it is there before anything is dropped: no
 * request follows a drop, and custom rules work offline once the page is open. A failure is
 * swallowed here; a drop that needs the chunk then refuses and says to reload.
 */
export function preloadCustomRules(preload: () => Promise<unknown> = () => page.preload()): void {
  const run = (): void => {
    preload().catch(() => {});
  };
  if (typeof requestIdleCallback === "function") requestIdleCallback(run, { timeout: 1000 });
  else setTimeout(run, 0);
}

/**
 * The drop-relative path a `customRules` entry names, resolved against the folder the config is in
 * within the drop: `\` read as `/`, `.` and `..` applied. Undefined when it climbs above the top
 * of the drop.
 */
export function ruleFilePath(configPath: string, entry: string): string | undefined {
  const path = configPath.split("/").slice(0, -1);
  for (const segment of entry.replace(/\\/g, "/").split("/")) {
    if (segment === "" || segment === ".") continue;
    if (segment !== "..") path.push(segment);
    else if (path.pop() === undefined) return undefined;
  }
  return path.join("/");
}

/** The name of the folder that keeps a walk away from `path`, if one does. */
function skippedFolderOf(path: string): string | undefined {
  const segments = path.split("/");
  for (let i = 1; i < segments.length; i++) {
    const folder = segments.slice(0, i).join("/");
    if (!skipsFolder(folder)) continue;
    const name = segments[i - 1]!;
    // The only other folder a walk skips is one inside a report's StaticResources.
    return SKIP_DIRS.has(name) ? name : "StaticResources";
  }
  return undefined;
}

const reasonOf = (e: unknown): string => (e instanceof Error ? e.message : String(e));

/**
 * The rule files a config names, opened from inside the dropped folder only, through the handles
 * the walk kept, and read by the custom rules chunk. Undefined, with nothing loaded, when the
 * config names none. Each entry in turn is resolved and checked, then opened: its size first,
 * against the reader's limit, then its text. All of that happens before the chunk is awaited, so a
 * mistake in the config gets its own refusal even when the chunk is not there. Any entry that
 * cannot be used refuses the project with a `ConfigError` naming the config and the entry, as the
 * CLI's readCustomRuleFiles does, in the CLI's words where the cause is the same; a file the
 * reader refuses whole is the reader's own refusal. `opened` holds the drop-relative paths read,
 * in order.
 */
export async function readRuleFiles(
  config: { path: string; text: string },
  entries: readonly string[],
  handles: ReadonlyMap<string, OpenFile>,
  load: () => Promise<CustomRulesModule> = loadCustomRules,
): Promise<{ set: CustomRuleSet; opened: string[] } | undefined> {
  if (entries.length === 0) return undefined;
  // What was dropped or chosen, by its top-level names: a path whose first segment is none of them
  // climbed out of the drop, even though it stayed below its top.
  const dropped = new Set([...handles.keys()].map((path) => path.split("/")[0]!));
  const opened: string[] = [];
  const files: { path: string; text: string }[] = [];
  for (const entry of entries) {
    const name = ruleFileName(entry);
    const refuse = (why: string) =>
      new ConfigError(`pbiplint.config.json: customRules: ${name} ${why}`);
    const path = ruleFilePath(config.path, entry);
    if (path === undefined || path === "" || !dropped.has(path.split("/")[0]!))
      throw refuse(
        "is outside the folder you dropped or chose; drop or choose the folder that holds both the project and its rule files",
      );
    const skipped = skippedFolderOf(path);
    if (skipped !== undefined)
      throw refuse(
        `is inside a ${skipped} folder, which pbiplint never opens; move the rule file to another folder`,
      );
    const open = handles.get(path);
    if (open === undefined) {
      if ([...handles.keys()].some((p) => p.startsWith(`${path}/`)))
        throw refuse("is a folder; customRules takes paths to rule files");
      throw refuse(
        "is not in the folder you dropped or chose; the path is relative to the folder pbiplint.config.json is in",
      );
    }
    let text: string;
    try {
      const file = await open();
      if (file.size > RULE_FILE_BYTES)
        throw refuse(
          `is ${file.size.toLocaleString("en")} bytes, over the limit of ${RULE_FILE_BYTES.toLocaleString("en")} bytes for a rule file`,
        );
      text = await file.text();
    } catch (e) {
      if (isConfigError(e)) throw e;
      throw refuse(`could not be read (${reasonOf(e)})`);
    }
    opened.push(path);
    files.push({ path: name, text });
  }
  const { readCustomRules } = await load();
  return { set: readCustomRules(files), opened };
}
