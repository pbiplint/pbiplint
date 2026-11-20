import { execFileSync } from "node:child_process";
import {
  chmodSync,
  cpSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  writeFileSync,
  existsSync,
  renameSync,
} from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { tempDir } from "../../../tests/support/temp-dir.js";
import { parseArgs } from "../src/args.js";
import { main } from "../src/main.js";
import { installSkills, SKILLS, skillPath, skillText, skillVersion } from "../src/skill.js";

const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")) as {
  version: string;
  files: string[];
};

async function run(argv: string[], cwd: string) {
  let out = "";
  let err = "";
  const code = await main(argv, {
    stdout: (s) => (out += s),
    stderr: (s) => (err += s),
    cwd: () => cwd,
  });
  return { code, out, err };
}

const text = skillText();
const customText = skillText("pbiplint-custom-rules");
const frontmatter = /^---\n([\s\S]*?)\n---\n/.exec(text)![1]!;
const description = /^description: (.+)$/m.exec(frontmatter)![1]!;
const judgment = /^<!-- judgment -->\n([\s\S]*?)\n<!-- \/judgment -->$/m.exec(text);

describe("the skill file", () => {
  it("is an Agent Skill named pbiplint, as the folder it installs into is", () => {
    expect(/^name: (.+)$/m.exec(frontmatter)![1]).toBe("pbiplint");
    expect(description.length).toBeGreaterThan(0);
    expect(description.length).toBeLessThanOrEqual(1024);
    // MIT, so a copy can be committed to any repository; every copy carries the notice.
    expect(frontmatter).toMatch(/^license: MIT$/m);
    expect(text.trimEnd().endsWith("-->")).toBe(true);
    expect(text).toContain("Copyright (c) 2026 McKinley Consulting");
    expect(text).toContain("Permission is hereby granted, free of charge");
  });

  it("names the CLI's version in its description and its metadata", () => {
    expect(skillVersion(text)).toBe(pkg.version);
    expect(description.endsWith(` pbiplint ${pkg.version}.`)).toBe(true);
  });

  it("says when to load it in its description", () => {
    for (const words of ["TMDL", "PBIR", "check, review, or lint", "commit or pull request"])
      expect(description).toContain(words);
  });

  it("points at pbiplint's MCP tools, by the names the server registers, when they are there", () => {
    const run = /^## How to run it\n([\s\S]*?)\n## /m.exec(text)![1]!;
    const server = readFileSync(new URL("../src/mcp.ts", import.meta.url), "utf8");
    const tools = [...server.matchAll(/registerTool\(\s*"([a-z_]+)"/g)].map((m) => m[1]!);
    expect(tools).toEqual(["lint", "explain_rule", "list_rules", "custom_rules_reference"]);
    // custom_rules_reference is for writing a team's rule, which the custom rules skill covers.
    const linting = tools.filter((t) => t !== "custom_rules_reference");
    for (const name of [...linting, "quiet", "rules"]) expect(run).toContain(`\`${name}\``);
  });

  it("points to the custom rules skill and the reference for writing a team's own rule", () => {
    const run = /^## How to run it\n([\s\S]*?)\n## /m.exec(text)![1]!;
    const pointer = run.split("\n").filter((l) => l.includes("`pbiplint-custom-rules`"));
    expect(pointer).toHaveLength(1);
    expect(pointer[0]).toContain("`custom_rules_reference`");
    expect(pointer[0]).toContain("`pbiplint reference`");
  });

  it("says a folder that holds several projects lints whole, and how the quiet output names each (#237)", () => {
    const flat = text.replace(/\s+/g, " ");
    expect(flat).toContain(
      "Given a folder that holds several projects, it lints each in one run; the quiet output opens each with a `project ` line.",
    );
    expect(flat).not.toContain("one project per run");
    expect(flat).not.toContain("a folder with several projects");
  });

  it("holds one judgment block a chat assistant can read with no CLI", () => {
    expect(judgment).not.toBeNull();
    expect(text.match(/<!-- judgment -->/g)).toHaveLength(1);
    const block = judgment![1]!;
    expect(block).not.toMatch(/--[a-z]/);
    expect(block).not.toMatch(/\bpbiplint\b/);
    expect(block.split("\n").every((l) => l.startsWith("- "))).toBe(true);
  });

  it("follows the house rules for prose", () => {
    // No em dash, U+2014.
    expect(text).not.toContain(String.fromCharCode(0x2014));
    expect(text).not.toMatch(/tabular editor/i);
    // The Agent Skills format recommends a body under 500 lines.
    expect(text.split("\n").length).toBeLessThan(500);
  });

  it("ships in the npm package", () => {
    expect(pkg.files).toContain("skill");
  });
});

describe("pbiplint skill", () => {
  it("prints the skill", async () => {
    const r = await run(["skill"], tempDir("skill-print"));
    expect(r).toEqual({ code: 0, out: text, err: "" });
  });

  it("installs for an assistant, then leaves a matching copy alone", async () => {
    const dir = tempDir("skill-install");
    const first = await run(["skill", "--install", "claude"], dir);
    expect(first.code).toBe(0);
    expect(first.out).toBe(
      `pbiplint: wrote .claude/skills/pbiplint/SKILL.md (pbiplint ${pkg.version})\n` +
        `pbiplint: wrote .claude/skills/pbiplint-custom-rules/SKILL.md (pbiplint ${pkg.version})\n`,
    );
    expect(readFileSync(skillPath(dir, "claude"), "utf8")).toBe(text);
    expect(readFileSync(skillPath(dir, "claude", "pbiplint-custom-rules"), "utf8")).toBe(
      customText,
    );
    const again = await run(["skill", "--install", "claude"], dir);
    expect(again).toEqual({
      code: 0,
      out:
        `pbiplint: .claude/skills/pbiplint/SKILL.md is already this version's skill (${pkg.version}); nothing to do\n` +
        `pbiplint: .claude/skills/pbiplint-custom-rules/SKILL.md is already this version's skill (${pkg.version}); nothing to do\n`,
      err: "",
    });
    for (const [target, folder] of [
      ["copilot", ".github/skills"],
      ["codex", ".agents/skills"],
      ["gemini", ".agents/skills"],
    ] as const) {
      expect((await run(["skill", "--install", target], dir)).code).toBe(0);
      expect(readFileSync(join(dir, folder, "pbiplint", "SKILL.md"), "utf8")).toBe(text);
      expect(readFileSync(join(dir, folder, "pbiplint-custom-rules", "SKILL.md"), "utf8")).toBe(
        customText,
      );
    }
  });

  it("refuses to overwrite a copy that differs, unless --force", async () => {
    const dir = tempDir("skill-differs");
    const path = skillPath(dir, "claude");
    mkdirSync(join(path, ".."), { recursive: true });
    const edited = text.replace("# pbiplint", "# pbiplint, with notes");
    writeFileSync(path, edited);
    const refused = await run(["skill", "--install", "claude"], dir);
    expect(refused.code).toBe(2);
    expect(refused.out).toBe("");
    expect(refused.err).toBe(
      `pbiplint: .claude/skills/pbiplint/SKILL.md differs from this version's skill (installed: ${pkg.version}, this CLI: ${pkg.version}); run again with --force to replace it\n`,
    );
    expect(readFileSync(path, "utf8")).toBe(edited);
    // All or nothing: the copy that does not differ is not written either.
    expect(existsSync(join(dir, ".claude/skills/pbiplint-custom-rules"))).toBe(false);
    const dry = await run(["skill", "--install", "claude", "--force", "--dry-run"], dir);
    expect(dry.out).toContain("would replace");
    expect(dry.out).toContain("would write .claude/skills/pbiplint-custom-rules/SKILL.md");
    expect(readFileSync(path, "utf8")).toBe(edited);
    expect(existsSync(join(dir, ".claude/skills/pbiplint-custom-rules"))).toBe(false);
    const forced = await run(["skill", "--install", "claude", "--force"], dir);
    expect(forced.code).toBe(0);
    expect(forced.out).toBe(
      `pbiplint: replaced .claude/skills/pbiplint/SKILL.md (was ${pkg.version}, now ${pkg.version})\n` +
        `pbiplint: wrote .claude/skills/pbiplint-custom-rules/SKILL.md (pbiplint ${pkg.version})\n`,
    );
    expect(readFileSync(path, "utf8")).toBe(text);
    expect(readFileSync(skillPath(dir, "claude", "pbiplint-custom-rules"), "utf8")).toBe(
      customText,
    );
  });

  it("--dry-run writes nothing", async () => {
    const dir = tempDir("skill-dry");
    const r = await run(["skill", "--install", "copilot", "--dry-run"], dir);
    expect(r.out).toBe(
      `pbiplint: would write .github/skills/pbiplint/SKILL.md (pbiplint ${pkg.version})\n` +
        `pbiplint: would write .github/skills/pbiplint-custom-rules/SKILL.md (pbiplint ${pkg.version})\n`,
    );
    expect(existsSync(join(dir, ".github"))).toBe(false);
  });

  it("--show names each folder's state: not installed, current, older, or edited", async () => {
    const dir = tempDir("skill-show");
    await run(["skill", "--install", "claude"], dir);
    const older = skillPath(dir, "copilot");
    mkdirSync(join(older, ".."), { recursive: true });
    writeFileSync(older, text.replace(/version: "[^"]+"/, 'version: "0.0.1"'));
    const r = await run(["skill", "--show"], dir);
    expect(r.code).toBe(0);
    expect(r.out.split("\n").slice(0, 3)).toEqual([
      `claude: .claude/skills/pbiplint/SKILL.md: installed, ${pkg.version} (current)`,
      `copilot: .github/skills/pbiplint/SKILL.md: installed, 0.0.1 (this CLI is ${pkg.version})`,
      "codex, gemini: .agents/skills/pbiplint/SKILL.md: not installed",
    ]);
    expect(r.out.split("\n").slice(3, 6)).toEqual([
      `claude: .claude/skills/pbiplint-custom-rules/SKILL.md: installed, ${pkg.version} (current)`,
      "copilot: .github/skills/pbiplint-custom-rules/SKILL.md: not installed",
      "codex, gemini: .agents/skills/pbiplint-custom-rules/SKILL.md: not installed",
    ]);
    expect(r.out).toContain("GitHub Copilot reads all three folders");
    writeFileSync(skillPath(dir, "claude"), text + "\nA note.\n");
    expect((await run(["skill", "--show"], dir)).out).toContain(
      `installed, ${pkg.version}, edited`,
    );
  });

  it("refuses options that do not go with it, and its own options elsewhere", () => {
    expect(parseArgs(["skill", "--install", "claude", "--force"])).toMatchObject({
      command: "skill",
      install: "claude",
      force: true,
    });
    expect(() => parseArgs(["skill", "--install", "cursor"])).toThrow(/--install must be one of/);
    expect(() => parseArgs(["skill", "x"])).toThrow(/skill takes no arguments/);
    expect(() => parseArgs(["skill", "--format", "json"])).toThrow(/skill takes only/);
    expect(() => parseArgs(["skill", "--force"])).toThrow(/go with --install/);
    expect(() => parseArgs(["skill", "--install", "claude", "--show"])).toThrow(/either/);
    expect(() => parseArgs(["./m", "--show"])).toThrow(/go with pbiplint skill/);
    expect(() => parseArgs(["explain", "X", "--force"])).toThrow(/go with pbiplint skill/);
    expect(() => parseArgs(["./m", "--name", "pbiplint"])).toThrow(/go with pbiplint skill/);
    expect(() => parseArgs(["skill", "--name", "nope"])).toThrow(
      "--name must be one of pbiplint, pbiplint-custom-rules",
    );
    expect(parseArgs(["skill", "--name", "pbiplint-custom-rules", "--show"])).toMatchObject({
      command: "skill",
      name: "pbiplint-custom-rules",
      show: true,
    });
  });
});

describe("pbiplint skill, with two skills (from 0.4.0)", () => {
  type Name = keyof typeof SKILLS;
  const names = Object.keys(SKILLS) as Name[];

  it("names each skill's file below skill/", () => {
    expect(SKILLS).toEqual({
      pbiplint: "SKILL.md",
      "pbiplint-custom-rules": "pbiplint-custom-rules/SKILL.md",
    });
    expect(customText).toMatch(/^name: pbiplint-custom-rules$/m);
  });

  it("--name prints one skill; without it, the pbiplint skill byte for byte", async () => {
    const dir = tempDir("skill-name-print");
    expect(await run(["skill"], dir)).toEqual({ code: 0, out: text, err: "" });
    expect(await run(["skill", "--name", "pbiplint"], dir)).toEqual({
      code: 0,
      out: text,
      err: "",
    });
    expect(await run(["skill", "--name", "pbiplint-custom-rules"], dir)).toEqual({
      code: 0,
      out: customText,
      err: "",
    });
    const nope = await run(["skill", "--name", "nope"], dir);
    expect(nope.code).toBe(2);
    expect(nope.out).toBe("");
    expect(nope.err).toContain("--name must be one of pbiplint, pbiplint-custom-rules");
  });

  it("--name limits --install, --dry-run, and --show to one skill", async () => {
    const dir = tempDir("skill-name-install");
    const custom = ["skill", "--install", "claude", "--name", "pbiplint-custom-rules"];
    const dry = await run([...custom, "--dry-run"], dir);
    expect(dry.out).toBe(
      `pbiplint: would write .claude/skills/pbiplint-custom-rules/SKILL.md (pbiplint ${pkg.version})\n`,
    );
    expect(existsSync(join(dir, ".claude"))).toBe(false);
    expect(await run(custom, dir)).toEqual({
      code: 0,
      out: `pbiplint: wrote .claude/skills/pbiplint-custom-rules/SKILL.md (pbiplint ${pkg.version})\n`,
      err: "",
    });
    expect(existsSync(join(dir, ".claude/skills/pbiplint"))).toBe(false);
    const show = await run(["skill", "--show", "--name", "pbiplint-custom-rules"], dir);
    expect(show.out.split("\n").slice(0, 3)).toEqual([
      `claude: .claude/skills/pbiplint-custom-rules/SKILL.md: installed, ${pkg.version} (current)`,
      "copilot: .github/skills/pbiplint-custom-rules/SKILL.md: not installed",
      "codex, gemini: .agents/skills/pbiplint-custom-rules/SKILL.md: not installed",
    ]);
    expect(show.out).not.toContain(".claude/skills/pbiplint/");
    expect(show.out).toContain("GitHub Copilot reads all three folders");
    // A differing copy of the other skill does not stop --name from installing this one.
    const other = skillPath(dir, "claude");
    mkdirSync(join(other, ".."), { recursive: true });
    writeFileSync(other, "an edited copy\n");
    expect((await run(custom, dir)).code).toBe(0);
  });

  it("refuses when both copies differ, with one line for each, and writes neither", async () => {
    const dir = tempDir("skill-both-differ");
    for (const name of names) {
      const path = skillPath(dir, "codex", name);
      mkdirSync(join(path, ".."), { recursive: true });
      writeFileSync(path, "an edited copy\n");
    }
    const r = await run(["skill", "--install", "gemini"], dir);
    expect(r).toEqual({
      code: 2,
      out: "",
      err:
        `pbiplint: .agents/skills/pbiplint/SKILL.md differs from this version's skill (installed: no version, this CLI: ${pkg.version}); run again with --force to replace it\n` +
        `pbiplint: .agents/skills/pbiplint-custom-rules/SKILL.md differs from this version's skill (installed: no version, this CLI: ${pkg.version}); run again with --force to replace it\n`,
    });
    for (const name of names)
      expect(readFileSync(skillPath(dir, "codex", name), "utf8")).toBe("an edited copy\n");
  });

  it("refuses when only the second copy differs, and does not write the first", async () => {
    const dir = tempDir("skill-second-differs");
    const path = skillPath(dir, "claude", "pbiplint-custom-rules");
    mkdirSync(join(path, ".."), { recursive: true });
    writeFileSync(path, "an edited copy\n");
    const r = await run(["skill", "--install", "claude"], dir);
    expect(r.code).toBe(2);
    expect(r.out).toBe("");
    expect(r.err.trimEnd().split("\n")).toHaveLength(1);
    expect(r.err).toContain(".claude/skills/pbiplint-custom-rules/SKILL.md differs");
    expect(existsSync(join(dir, ".claude/skills/pbiplint"))).toBe(false);
  });

  it("refuses, writing nothing, when a folder on a target path is a plain file", async () => {
    const dir = tempDir("skill-plain-file");
    mkdirSync(join(dir, ".claude/skills"), { recursive: true });
    writeFileSync(join(dir, ".claude/skills/pbiplint-custom-rules"), "a plain file\n");
    for (const argv of [
      ["skill", "--install", "claude"],
      ["skill", "--install", "claude", "--dry-run"],
      ["skill", "--install", "claude", "--force"],
    ]) {
      const r = await run(argv, dir);
      expect(r.code, argv.join(" ")).toBe(2);
      expect(r.out).toBe("");
      expect(r.err).toBe(
        "pbiplint: cannot install the skills: .claude/skills/pbiplint-custom-rules is a file, not a folder; move it and run again\n",
      );
    }
    expect(readdirSync(join(dir, ".claude/skills"))).toEqual(["pbiplint-custom-rules"]);
  });

  it("writes neither copy when a write fails, and leaves no temporary file or new folder", () => {
    const dir = tempDir("skill-write-fails");
    let writes = 0;
    const failing = (path: string, data: string) => {
      if (++writes === 2) throw Object.assign(new Error("no space left"), { code: "ENOSPC" });
      writeFileSync(path, data);
    };
    expect(() => installSkills(dir, "claude", { fs: { writeFileSync: failing } })).toThrow(
      /^cannot install the skills: .*no space left/,
    );
    expect(writes).toBe(2);
    expect(existsSync(join(dir, ".claude"))).toBe(false);
    // A copy being replaced keeps its old text when the other one fails.
    const path = skillPath(dir, "claude");
    mkdirSync(join(path, ".."), { recursive: true });
    writeFileSync(path, "an edited copy\n");
    writes = 0;
    expect(() =>
      installSkills(dir, "claude", { force: true, fs: { writeFileSync: failing } }),
    ).toThrow(/no space left/);
    expect(readFileSync(path, "utf8")).toBe("an edited copy\n");
    expect(readdirSync(join(dir, ".claude/skills"))).toEqual(["pbiplint"]);
    expect(readdirSync(join(dir, ".claude/skills/pbiplint"))).toEqual(["SKILL.md"]);
  });

  it("restores the first copy when the second cannot be moved into place", () => {
    const dir = tempDir("skill-rename-fails");
    const path = skillPath(dir, "claude");
    mkdirSync(join(path, ".."), { recursive: true });
    writeFileSync(path, "an edited copy\n");
    let renames = 0;
    const failing = (from: string, to: string) => {
      if (++renames === 2) throw Object.assign(new Error("busy"), { code: "EBUSY" });
      renameSync(from, to);
    };
    expect(() =>
      installSkills(dir, "claude", { force: true, fs: { renameSync: failing } }),
    ).toThrow(/busy/);
    expect(readFileSync(path, "utf8")).toBe("an edited copy\n");
    expect(readdirSync(join(dir, ".claude/skills"))).toEqual(["pbiplint"]);
    expect(readdirSync(join(dir, ".claude/skills/pbiplint"))).toEqual(["SKILL.md"]);
  });

  it("reports a folder it may not write as one line, exit 2, with the other copy not written", async () => {
    const dir = tempDir("skill-read-only");
    const locked = join(dir, ".claude/skills/pbiplint-custom-rules");
    mkdirSync(locked, { recursive: true });
    chmodSync(locked, 0o555);
    try {
      const r = await run(["skill", "--install", "claude"], dir);
      expect(r.code).toBe(2);
      expect(r.out).toBe("");
      expect(r.err.split("\n")).toHaveLength(2);
      expect(r.err).toMatch(/^pbiplint: cannot install the skills: .*EACCES.*\n$/);
      expect(r.err).not.toMatch(/\n\s+at /);
      expect(existsSync(join(dir, ".claude/skills/pbiplint"))).toBe(false);
      expect(readdirSync(locked)).toEqual([]);
    } finally {
      chmodSync(locked, 0o755);
    }
  });

  it("sync-version writes the CLI's version into both skills", () => {
    const dir = tempDir("skill-sync-version");
    const repo = fileURLToPath(new URL("../../../", import.meta.url));
    for (const file of ["packages/core/package.json", "packages/cli/package.json"]) {
      mkdirSync(join(dir, file, ".."), { recursive: true });
      cpSync(join(repo, file), join(dir, file));
    }
    mkdirSync(join(dir, "packages/core/src"), { recursive: true });
    for (const file of Object.values(SKILLS)) {
      const at = join(dir, "packages/cli/skill", file);
      mkdirSync(join(at, ".."), { recursive: true });
      const stale = readFileSync(join(repo, "packages/cli/skill", file), "utf8")
        .replace(/ pbiplint \S+\.$/m, " pbiplint 0.0.1.")
        .replace(/^ {2}version: "[^"]+"$/m, '  version: "0.0.1"');
      expect(skillVersion(stale), file).toBe("0.0.1");
      writeFileSync(at, stale);
    }
    execFileSync(process.execPath, [join(repo, "scripts/sync-version.mjs")], {
      cwd: dir,
      stdio: "ignore",
    });
    for (const file of Object.values(SKILLS)) {
      const synced = readFileSync(join(dir, "packages/cli/skill", file), "utf8");
      expect(skillVersion(synced), file).toBe(pkg.version);
      expect(synced, file).toBe(readFileSync(join(repo, "packages/cli/skill", file), "utf8"));
    }
  });
});
