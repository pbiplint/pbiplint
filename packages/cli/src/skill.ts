import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
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

/**
 * Writes each skill (all of them, or those `names` gives) where `target` reads it, all or nothing:
 * every copy is checked before any is written. A copy already there is left alone when it
 * matches; when one differs and `force` is not set, nothing is written and that copy's outcome is
 * "differs". `dryRun` writes nothing and says what would happen.
 */
export function installSkills(
  root: string,
  target: SkillTarget,
  options: { force?: boolean; dryRun?: boolean; names?: readonly SkillName[] } = {},
): InstallResult[] {
  const planned = (options.names ?? SKILL_NAMES).map((name) => {
    const path = skillPath(root, target, name);
    const text = skillText(name);
    const version = skillVersion(text) ?? "";
    let result: InstallResult = { name, outcome: "written", path, version };
    if (existsSync(path)) {
      const current = readFileSync(path, "utf8");
      const installed = skillVersion(current);
      const outcome = current === text ? "unchanged" : options.force ? "replaced" : "differs";
      result = { name, outcome, path, version, installed };
    }
    return { result, text };
  });
  const refused = planned.some((p) => p.result.outcome === "differs");
  if (!refused && !options.dryRun)
    for (const { result, text } of planned) {
      if (result.outcome === "unchanged") continue;
      mkdirSync(dirname(result.path), { recursive: true });
      writeFileSync(result.path, text);
    }
  return planned.map((p) => p.result);
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
  const results = installSkills(root, opts.install, { ...opts, names });
  const shown = (r: InstallResult) => relative(root, r.path).split("\\").join("/");
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
