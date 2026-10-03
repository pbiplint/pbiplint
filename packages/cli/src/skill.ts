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

/** The skill as the package carries it: skill/SKILL.md, beside dist in the package and src here. */
export function skillText(): string {
  const here = dirname(fileURLToPath(import.meta.url));
  return readFileSync(join(here, "..", "skill", "SKILL.md"), "utf8");
}

/** The version a skill file names in its metadata, or undefined when it names none. */
export const skillVersion = (text: string): string | undefined =>
  /^ {2}version: "([^"]+)"$/m.exec(text)?.[1];

/** Where the skill goes for an assistant, below `root`. */
export const skillPath = (root: string, target: SkillTarget): string =>
  join(root, SKILL_TARGETS[target], "pbiplint", "SKILL.md");

export type InstallOutcome = "written" | "replaced" | "unchanged" | "differs";

export interface InstallResult {
  outcome: InstallOutcome;
  path: string;
  /** The installed copy's version, when one was there. */
  installed?: string;
}

/**
 * Writes the skill where `target` reads it. A copy already there is left alone when it matches,
 * and never overwritten when it differs unless `force` is set. `dryRun` writes nothing and says
 * what would happen.
 */
export function installSkill(
  root: string,
  target: SkillTarget,
  options: { force?: boolean; dryRun?: boolean } = {},
): InstallResult {
  const path = skillPath(root, target);
  const text = skillText();
  if (existsSync(path)) {
    const current = readFileSync(path, "utf8");
    const installed = skillVersion(current);
    if (current === text) return { outcome: "unchanged", path, installed };
    if (!options.force) return { outcome: "differs", path, installed };
    if (!options.dryRun) writeFileSync(path, text);
    return { outcome: "replaced", path, installed };
  }
  if (!options.dryRun) {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, text);
  }
  return { outcome: "written", path };
}

/** One line per folder: which assistants read it and whether the skill there is this CLI's. */
export function skillStatus(root: string): string[] {
  const text = skillText();
  const version = skillVersion(text) ?? "";
  const folders = [...new Set(Object.values(SKILL_TARGETS))];
  const lines = folders.map((folder) => {
    const readers = (Object.keys(SKILL_TARGETS) as SkillTarget[]).filter(
      (t) => SKILL_TARGETS[t] === folder,
    );
    const path = skillPath(root, readers[0]!);
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
  return [
    ...lines,
    "GitHub Copilot reads all three folders, so one copy is enough for it; a second shows it the skill twice.",
  ];
}

/** `pbiplint skill`: print the skill, install it for an assistant, or show where it is. */
export function runSkill(opts: CliOptions, io: Io, stderrLine: (line: string) => void): number {
  const root = io.cwd();
  // The skill's own version, which the release writes to match the CLI's.
  const version = skillVersion(skillText()) ?? "";
  if (opts.show) {
    io.stdout(skillStatus(root).join("\n") + "\n");
    return 0;
  }
  if (!opts.install) {
    io.stdout(skillText());
    return 0;
  }
  const r = installSkill(root, opts.install, opts);
  const shown = relative(root, r.path).split("\\").join("/");
  const was = r.installed ?? "no version";
  const would = opts.dryRun ? "would " : "";
  switch (r.outcome) {
    case "written":
      io.stdout(
        `pbiplint: ${would}${opts.dryRun ? "write" : "wrote"} ${shown} (pbiplint ${version})\n`,
      );
      return 0;
    case "replaced":
      io.stdout(
        `pbiplint: ${would}${opts.dryRun ? "replace" : "replaced"} ${shown} (was ${was}, now ${version})\n`,
      );
      return 0;
    case "unchanged":
      io.stdout(`pbiplint: ${shown} is already this version's skill (${version}); nothing to do\n`);
      return 0;
    case "differs":
      stderrLine(
        `pbiplint: ${shown} differs from this version's skill (installed: ${was}, this CLI: ${version}); run again with --force to replace it`,
      );
      return 2;
  }
}
