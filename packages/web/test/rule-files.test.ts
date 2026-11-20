// @vitest-environment happy-dom
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { isConfigError, ruleFileName } from "@pbiplint/core";
import { LIMITS } from "@pbiplint/core/custom-rules";
import { afterEach, describe, expect, it, vi } from "vitest";
import { InputError, type OpenFile } from "../src/input/project-files.js";
import {
  CUSTOM_RULES_LOAD_FAILED,
  customRulesLoader,
  loadCustomRules,
  preloadCustomRules,
  readRuleFiles,
  ruleFilePath,
} from "../src/rule-files.js";

// A path rather than a URL: happy-dom's URL is not the one readFileSync takes.
const fixtures = join(
  dirname(fileURLToPath(import.meta.url)),
  "../../cli/test/fixtures/custom-rules",
);
const fixture = (name: string): string => readFileSync(join(fixtures, name), "utf8");
const TEAM = fixture("rules/team.json");
const MORE = fixture("rules/more.json");

const CONFIG = { path: "Team/pbiplint.config.json", text: "{}" };

/** Handles for a drop, each counting the times it is opened. */
function handlesOf(files: Record<string, string | File>): {
  handles: Map<string, OpenFile>;
  opened: string[];
} {
  const opened: string[] = [];
  const handles = new Map<string, OpenFile>();
  for (const [path, body] of Object.entries(files))
    handles.set(path, async () => {
      opened.push(path);
      return typeof body === "string" ? new File([body], path.split("/").pop()!) : body;
    });
  return { handles, opened };
}

/** The refusal `readRuleFiles` gives, or a failure naming what it gave instead. */
async function refusal(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
  } catch (e) {
    if (isConfigError(e)) return e.message;
    throw e;
  }
  throw new Error("no refusal");
}

describe("ruleFilePath", () => {
  it("resolves an entry against the config's folder in the drop", () => {
    expect(ruleFilePath(CONFIG.path, "rules/team.json")).toBe("Team/rules/team.json");
    expect(ruleFilePath(CONFIG.path, "./rules/team.json")).toBe("Team/rules/team.json");
    expect(ruleFilePath(CONFIG.path, "rules\\team.json")).toBe("Team/rules/team.json");
    expect(ruleFilePath(CONFIG.path, "rules/../rules/team.json")).toBe("Team/rules/team.json");
    expect(ruleFilePath("Team/Sales/pbiplint.config.json", "../x.json")).toBe("Team/x.json");
    // At the top of the drop, which is not above it.
    expect(ruleFilePath(CONFIG.path, "../x.json")).toBe("x.json");
    expect(ruleFilePath("pbiplint.config.json", "rules/team.json")).toBe("rules/team.json");
  });
  it("gives nothing for an entry that climbs above the top of the drop", () => {
    expect(ruleFilePath(CONFIG.path, "../../x.json")).toBeUndefined();
    expect(ruleFilePath("pbiplint.config.json", "../x.json")).toBeUndefined();
    expect(ruleFilePath(CONFIG.path, "rules/../../../x.json")).toBeUndefined();
  });
});

describe("readRuleFiles", () => {
  it("gives nothing, and loads nothing, for a config that names no rule files", async () => {
    const load = vi.fn(loadCustomRules);
    const { handles, opened } = handlesOf({ "Team/rules/team.json": TEAM });
    expect(await readRuleFiles(CONFIG, [], handles, load)).toBeUndefined();
    expect(load).not.toHaveBeenCalled();
    expect(opened).toEqual([]);
  });
  it("opens only the files the config names, in order, under the names the CLI gives them", async () => {
    const { handles, opened } = handlesOf({
      "Team/rules/team.json": TEAM,
      "Team/rules/more.json": MORE,
      "Team/rules/other.json": "never",
    });
    const read = await readRuleFiles(CONFIG, [".\\rules\\team.json", "rules/more.json"], handles);
    expect(opened).toEqual(["Team/rules/team.json", "Team/rules/more.json"]);
    expect(read?.opened).toEqual(["Team/rules/team.json", "Team/rules/more.json"]);
    // The names the output carries are core's ruleFileName, which the CLI uses too.
    expect(ruleFileName(".\\rules\\team.json")).toBe("rules/team.json");
    expect(read?.set.files.map((f) => f.path)).toEqual(["rules/team.json", "rules/more.json"]);
    expect(read?.set.rules.map((r) => r.id)).toContain("TEAM_VISIBLE");
  });
  it("refuses an entry outside the folder dropped or chosen", async () => {
    const { handles, opened } = handlesOf({ "Team/rules/team.json": TEAM });
    expect(await refusal(readRuleFiles(CONFIG, ["../rules/team.json"], handles))).toBe(
      "pbiplint.config.json: customRules: ../rules/team.json is outside the folder you dropped or chose; drop or choose the folder that holds both the project and its rule files",
    );
    expect(await refusal(readRuleFiles(CONFIG, ["../../team.json"], handles))).toBe(
      "pbiplint.config.json: customRules: ../../team.json is outside the folder you dropped or chose; drop or choose the folder that holds both the project and its rule files",
    );
    expect(opened).toEqual([]);
  });
  it("reads a file beside the config's folder when that was dropped too, and refuses one beside it that was not", async () => {
    const { handles } = handlesOf({
      "Team/pbiplint.config.json": "{}",
      "Rules/team.json": TEAM,
    });
    const read = await readRuleFiles(CONFIG, ["../Rules/team.json"], handles);
    expect(read?.opened).toEqual(["Rules/team.json"]);
    expect(await refusal(readRuleFiles(CONFIG, ["../Other/team.json"], handles))).toBe(
      "pbiplint.config.json: customRules: ../Other/team.json is outside the folder you dropped or chose; drop or choose the folder that holds both the project and its rule files",
    );
  });
  it("refuses a file that is not in the folder", async () => {
    const { handles } = handlesOf({ "Team/pbiplint.config.json": "{}" });
    expect(await refusal(readRuleFiles(CONFIG, ["rules/team.json"], handles))).toBe(
      "pbiplint.config.json: customRules: rules/team.json is not in the folder you dropped or chose; the path is relative to the folder pbiplint.config.json is in",
    );
  });
  it("refuses a file inside a folder the walk skips, naming that folder", async () => {
    const { handles } = handlesOf({ "Team/pbiplint.config.json": "{}" });
    expect(await refusal(readRuleFiles(CONFIG, [".git/team.json"], handles))).toBe(
      "pbiplint.config.json: customRules: .git/team.json is inside a .git folder, which pbiplint never opens; move the rule file to another folder",
    );
    expect(await refusal(readRuleFiles(CONFIG, ["tools/node_modules/x/team.json"], handles))).toBe(
      "pbiplint.config.json: customRules: tools/node_modules/x/team.json is inside a node_modules folder, which pbiplint never opens; move the rule file to another folder",
    );
    expect(
      await refusal(readRuleFiles(CONFIG, ["X.Report/StaticResources/rules/team.json"], handles)),
    ).toBe(
      "pbiplint.config.json: customRules: X.Report/StaticResources/rules/team.json is inside a StaticResources folder, which pbiplint never opens; move the rule file to another folder",
    );
  });
  it("refuses a folder in a file's place", async () => {
    const { handles } = handlesOf({ "Team/rules/team.json": TEAM });
    expect(await refusal(readRuleFiles(CONFIG, ["rules"], handles))).toBe(
      "pbiplint.config.json: customRules: rules is a folder; customRules takes paths to rule files",
    );
  });
  it("checks the size before reading the text, in the CLI's words", async () => {
    const big = Object.assign(new File([""], "team.json"), {
      text: () => Promise.reject(new Error("opened")),
    });
    Object.defineProperty(big, "size", { value: 2_000_000 });
    const { handles } = handlesOf({ "Team/rules/team.json": big });
    expect(LIMITS.fileBytes).toBe(1_048_576);
    expect(await refusal(readRuleFiles(CONFIG, ["rules/team.json"], handles))).toBe(
      "pbiplint.config.json: customRules: rules/team.json is 2,000,000 bytes, over the limit of 1,048,576 bytes for a rule file",
    );
  });
  it("refuses a file the browser could not hand over or read, with the browser's message", async () => {
    const handles = new Map<string, OpenFile>([
      [
        "Team/rules/team.json",
        () =>
          Promise.reject(new DOMException("A requested file could not be found", "NotFoundError")),
      ],
      [
        "Team/rules/more.json",
        async () =>
          Object.assign(new File([""], "more.json"), {
            text: () =>
              Promise.reject(new DOMException("The file could not be read", "NotReadableError")),
          }),
      ],
    ]);
    expect(await refusal(readRuleFiles(CONFIG, ["rules/team.json"], handles))).toBe(
      "pbiplint.config.json: customRules: rules/team.json could not be read (A requested file could not be found)",
    );
    expect(await refusal(readRuleFiles(CONFIG, ["rules/more.json"], handles))).toBe(
      "pbiplint.config.json: customRules: rules/more.json could not be read (The file could not be read)",
    );
  });
  it("passes on core's refusal of a file it cannot read whole", async () => {
    const { handles } = handlesOf({ "Team/rules/team.json": "{ not json" });
    expect(await refusal(readRuleFiles(CONFIG, ["rules/team.json"], handles))).toMatch(
      /^pbiplint\.config\.json: customRules: rules\/team\.json: \S/,
    );
  });
  it("loads the code once for two configs", async () => {
    const importer = vi.fn(() => import("../src/custom-rules.js"));
    const load = customRulesLoader(importer);
    const { handles } = handlesOf({ "A/rules/team.json": TEAM, "B/rules/team.json": TEAM });
    for (const path of ["A/pbiplint.config.json", "B/pbiplint.config.json"])
      await readRuleFiles({ path, text: "{}" }, ["rules/team.json"], handles, load);
    expect(importer).toHaveBeenCalledTimes(1);
  });
});

describe("customRulesLoader", () => {
  it("refuses in the page's words when the code will not load, and tries again next time", async () => {
    const importer = vi
      .fn<() => Promise<typeof import("../src/custom-rules.js")>>()
      .mockRejectedValueOnce(new TypeError("Failed to fetch dynamically imported module"))
      .mockImplementation(() => import("../src/custom-rules.js"));
    const load = customRulesLoader(importer);
    await expect(load()).rejects.toEqual(new InputError(CUSTOM_RULES_LOAD_FAILED));
    const { handles } = handlesOf({ "Team/rules/team.json": TEAM });
    await expect(readRuleFiles(CONFIG, ["rules/team.json"], handles, load)).resolves.toBeDefined();
    expect(importer).toHaveBeenCalledTimes(2);
  });
  it("says what failed and what to do", () => {
    expect(CUSTOM_RULES_LOAD_FAILED).toBe(
      "pbiplint could not load its custom rules code from this site, so the folder was not linted. Reload the page, then drop or choose the folder again.",
    );
  });
});

describe("preloadCustomRules", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });
  it("loads the code once the page is idle, and only then", () => {
    let idle: (() => void) | undefined;
    vi.stubGlobal("requestIdleCallback", (run: () => void) => {
      idle = run;
      return 1;
    });
    const load = vi.fn(() => Promise.resolve({} as never));
    preloadCustomRules(load);
    expect(load).not.toHaveBeenCalled();
    idle!();
    expect(load).toHaveBeenCalledTimes(1);
  });
  it("waits for the page's load event when the page is still loading", () => {
    const state = vi.spyOn(document, "readyState", "get").mockReturnValue("loading");
    let idle: (() => void) | undefined;
    vi.stubGlobal("requestIdleCallback", (run: () => void) => {
      idle = run;
      return 1;
    });
    const load = vi.fn(() => Promise.resolve({} as never));
    preloadCustomRules(load);
    expect(idle).toBeUndefined();
    window.dispatchEvent(new Event("load"));
    idle!();
    expect(load).toHaveBeenCalledTimes(1);
    state.mockRestore();
  });
  it("falls back to a timer where there is no requestIdleCallback, and swallows a failure", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("requestIdleCallback", undefined);
    const load = vi.fn(() => Promise.reject(new InputError(CUSTOM_RULES_LOAD_FAILED)));
    const unhandled = vi.fn();
    process.on("unhandledRejection", unhandled);
    preloadCustomRules(load);
    expect(load).not.toHaveBeenCalled();
    await vi.runAllTimersAsync();
    expect(load).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
    await new Promise((r) => setTimeout(r, 0));
    process.off("unhandledRejection", unhandled);
    expect(unhandled).not.toHaveBeenCalled();
  });
});
