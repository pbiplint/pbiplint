import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import type { CliOptions } from "./args.js";
import type { Io } from "./main.js";

/** Each assistant `--install` takes, and the folder below the project where it reads skills. */
export const SKILL_TARGETS = {
  claude: ".claude/skills",
  copilot: ".github/skills",
  codex: ".agents/skills",
  gemini: ".agents/skills",
} as const;

export type SkillTarget = keyof typeof SKILL_TARGETS;

/**
 * Each skill the CLI ships, by the name it installs under, and its file below skill/. The first is
 * the one `pbiplint skill` prints without `--name`.
 */
export const SKILLS = {
  pbiplint: "SKILL.md",
  "pbiplint-custom-rules": "pbiplint-custom-rules/SKILL.md",
} as const;

export type SkillName = keyof typeof SKILLS;

const SKILL_NAMES = Object.keys(SKILLS) as SkillName[];

/** A skill as the package carries it: below skill/, beside dist in the package and src here. */
export function skillText(name: SkillName = "pbiplint"): string {
  const here = dirname(fileURLToPath(import.meta.url));
  return readFileSync(join(here, "..", "skill", SKILLS[name]), "utf8");
}

/** The version a skill file names in its metadata, or undefined when it names none. */
export const skillVersion = (text: string): string | undefined =>
  /^ {2}version: "([^"]+)"$/m.exec(text)?.[1];

/** Where a skill goes for an assistant, below `root`: a folder named after the skill. */
export const skillPath = (
  root: string,
  target: SkillTarget,
  name: SkillName = "pbiplint",
): string => join(root, SKILL_TARGETS[target], name, "SKILL.md");

export type InstallOutcome = "written" | "replaced" | "unchanged" | "differs";

export interface InstallResult {
  name: SkillName;
  outcome: InstallOutcome;
  path: string;
  /** The version of the skill this CLI ships. */
  version: string;
  /** The installed copy's version, when one was there. */
  installed?: string;
}

/** The file system calls an install makes, so a test can make one fail. */
export interface SkillFs {
  mkdirSync: (path: string, options: { recursive: true }) => string | undefined;
  writeFileSync: (path: string, data: string) => void;
  renameSync: (from: string, to: string) => void;
  rmSync: (path: string, options: { force: true }) => void;
  rmdirSync: (path: string) => void;
}

const NODE_FS: SkillFs = { mkdirSync, writeFileSync, renameSync, rmSync, rmdirSync };

/** Why an install could not finish, in one line for `pbiplint: ` to start; nothing is left written. */
export class SkillInstallError extends Error {}

/** A path below `root` as the CLI shows one: relative, with forward slashes. */
const shownPath = (root: string, path: string): string =>
  relative(root, path).split("\\").join("/");

/** A file system error in a few words, as `EACCES: permission denied`, without the path. */
function why(e: unknown): string {
  const err = e as { code?: unknown; message?: unknown };
  const message = typeof err.message === "string" ? err.message.split(", ")[0]! : String(e);
  const code = typeof err.code === "string" ? err.code : undefined;
  return code && !message.startsWith(code) ? `${code}: ${message}` : message;
}

/**
 * The first step on the way from `root` to `path` that is there and is not a folder, or the skill
 * file's own place when a folder is there; undefined when nothing stands in the way.
 */
function blocker(root: string, path: string): string | undefined {
  const steps = relative(root, path).split(/[\\/]/);
  let at = root;
  for (const [i, step] of steps.entries()) {
    at = join(at, step);
    let stat;
    try {
      stat = statSync(at);
    } catch {
      return undefined;
    }
    const last = i === steps.length - 1;
    if (last ? !stat.isFile() : !stat.isDirectory()) return at;
  }
  return undefined;
}

/**
 * Writes each skill (all of them, or those `names` gives) where `target` reads it, all or nothing:
 * every copy is checked before any is written. A copy already there is left alone when it
 * matches; when one differs and `force` is not set, nothing is written and that copy's outcome is
 * "differs". A file where a folder should be, or a folder where a skill file should be, stops the
 * install with a SkillInstallError before anything is written. Otherwise every folder is made
 * first, each copy is written beside its target under a temporary name, and then each is moved
 * into place; when any step fails, the temporary files, the folders it made, and any copy already
 * moved are undone, and a SkillInstallError says what failed. `dryRun` writes nothing and says
 * what would happen.
 */
export function installSkills(
  root: string,
  target: SkillTarget,
  options: {
    force?: boolean;
    dryRun?: boolean;
    names?: readonly SkillName[];
    fs?: Partial<SkillFs>;
  } = {},
): InstallResult[] {
  const fs: SkillFs = { ...NODE_FS, ...options.fs };
  const planned = (options.names ?? SKILL_NAMES).map((name) => {
    const path = skillPath(root, target, name);
    const stops = blocker(root, path);
    if (stops !== undefined)
      throw new SkillInstallError(
        `cannot install the skills: ${shownPath(root, stops)} is ${stops === path ? "a folder, not a file" : "a file, not a folder"}; move it and run again`,
      );
    const text = skillText(name);
    const version = skillVersion(text) ?? "";
    let result: InstallResult = { name, outcome: "written", path, version };
    let before: string | undefined;
    if (existsSync(path)) {
      try {
        before = readFileSync(path, "utf8");
      } catch (e) {
        throw new SkillInstallError(
          `cannot install the skills: could not read ${shownPath(root, path)} (${why(e)})`,
        );
      }
      const installed = skillVersion(before);
      const outcome = before === text ? "unchanged" : options.force ? "replaced" : "differs";
      result = { name, outcome, path, version, installed };
    }
    return { result, text, before };
  });
  const refused = planned.some((p) => p.result.outcome === "differs");
  if (!refused && !options.dryRun) write(root, planned, fs);
  return planned.map((p) => p.result);
}

/** The writing half of installSkills: folders, then temporary files, then each moved into place. */
function write(
  root: string,
  planned: { result: InstallResult; text: string; before?: string }[],
  fs: SkillFs,
): void {
  const todo = planned.filter((p) => p.result.outcome !== "unchanged");
  const made: string[] = [];
  const temps: string[] = [];
  const moved: typeof todo = [];
  let step = "";
  try {
    for (const { result } of todo) {
      const folder = dirname(result.path);
      step = `could not create ${shownPath(root, folder)}`;
      const first = fs.mkdirSync(folder, { recursive: true });
      // The folders this call made, deepest first, ahead of those made before them, so an undo
      // removes each before its parent.
      const chain: string[] = [];
      if (first !== undefined)
        for (let at = folder; ; at = dirname(at)) {
          chain.push(at);
          if (at === first || at === dirname(at)) break;
        }
      made.unshift(...chain);
    }
    const unique = `.pbiplint-${process.pid}-${Date.now()}.tmp`;
    for (const { result, text } of todo) {
      const temp = result.path + unique;
      step = `could not write ${shownPath(root, result.path)}`;
      temps.push(temp);
      fs.writeFileSync(temp, text);
    }
    for (const [i, p] of todo.entries()) {
      step = `could not move ${shownPath(root, p.result.path)} into place`;
      fs.renameSync(temps[i]!, p.result.path);
      moved.push(p);
    }
  } catch (e) {
    // Undo quietly: what cannot be undone is left, and the first failure is the one reported.
    const quietly = (f: () => void) => {
      try {
        f();
      } catch {
        // left as it is
      }
    };
    for (const p of moved)
      quietly(() =>
        p.before === undefined
          ? fs.rmSync(p.result.path, { force: true })
          : fs.writeFileSync(p.result.path, p.before),
      );
    for (const temp of temps) quietly(() => fs.rmSync(temp, { force: true }));
    for (const folder of made) quietly(() => fs.rmdirSync(folder));
    throw new SkillInstallError(`cannot install the skills: ${step} (${why(e)})`);
  }
}

/**
 * One line per skill and folder: which assistants read the folder and whether the skill there is
 * this CLI's.
 */
export function skillStatus(root: string, names: readonly SkillName[] = SKILL_NAMES): string[] {
  const folders = [...new Set(Object.values(SKILL_TARGETS))];
  const lines = names.flatMap((name) => {
    const text = skillText(name);
    const version = skillVersion(text) ?? "";
    return folders.map((folder) => {
      const readers = (Object.keys(SKILL_TARGETS) as SkillTarget[]).filter(
        (t) => SKILL_TARGETS[t] === folder,
      );
      const path = skillPath(root, readers[0]!, name);
      const shown = relative(root, path).split("\\").join("/");
      let state = "not installed";
      if (existsSync(path)) {
        const current = readFileSync(path, "utf8");
        const installed = skillVersion(current) ?? "no version";
        state =
          current === text
            ? `installed, ${installed} (current)`
            : installed === version
              ? `installed, ${installed}, edited`
              : `installed, ${installed} (this CLI is ${version})`;
      }
      return `${readers.join(", ")}: ${shown}: ${state}`;
    });
  });
  return [
    ...lines,
    "GitHub Copilot reads all three folders, so one copy of each skill is enough for it; a second shows it that skill twice.",
  ];
}

/** `pbiplint skill`: print a skill, install the skills for an assistant, or show where they are. */
export function runSkill(opts: CliOptions, io: Io, stderrLine: (line: string) => void): number {
  const root = io.cwd();
  const names = opts.name ? [opts.name] : SKILL_NAMES;
  if (opts.show) {
    io.stdout(skillStatus(root, names).join("\n") + "\n");
    return 0;
  }
  if (!opts.install) {
    io.stdout(skillText(opts.name));
    return 0;
  }
  let results: InstallResult[];
  try {
    results = installSkills(root, opts.install, { ...opts, names });
  } catch (e) {
    if (!(e instanceof SkillInstallError)) throw e;
    stderrLine(`pbiplint: ${e.message}`);
    return 2;
  }
  const shown = (r: InstallResult) => shownPath(root, r.path);
  const differs = results.filter((r) => r.outcome === "differs");
  if (differs.length) {
    // Nothing was written; one line for each copy that stopped it.
    for (const r of differs)
      stderrLine(
        `pbiplint: ${shown(r)} differs from this version's skill (installed: ${r.installed ?? "no version"}, this CLI: ${r.version}); run again with --force to replace it`,
      );
    return 2;
  }
  const would = opts.dryRun ? "would " : "";
  for (const r of results) {
    switch (r.outcome) {
      case "written":
        io.stdout(
          `pbiplint: ${would}${opts.dryRun ? "write" : "wrote"} ${shown(r)} (pbiplint ${r.version})\n`,
        );
        break;
      case "replaced":
        io.stdout(
          `pbiplint: ${would}${opts.dryRun ? "replace" : "replaced"} ${shown(r)} (was ${r.installed ?? "no version"}, now ${r.version})\n`,
        );
        break;
      case "unchanged":
        io.stdout(
          `pbiplint: ${shown(r)} is already this version's skill (${r.version}); nothing to do\n`,
        );
        break;
    }
  }
  return 0;
}
