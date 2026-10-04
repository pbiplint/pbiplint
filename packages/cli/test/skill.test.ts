import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { tempDir } from "../../../tests/support/temp-dir.js";
import { parseArgs } from "../src/args.js";
import { main } from "../src/main.js";
import { skillPath, skillText, skillVersion } from "../src/skill.js";

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
    expect(tools).toEqual(["lint", "explain_rule", "list_rules"]);
    for (const name of [...tools, "quiet", "rules"]) expect(run).toContain(`\`${name}\``);
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
      `pbiplint: wrote .claude/skills/pbiplint/SKILL.md (pbiplint ${pkg.version})\n`,
    );
    expect(readFileSync(skillPath(dir, "claude"), "utf8")).toBe(text);
    const again = await run(["skill", "--install", "claude"], dir);
    expect(again.code).toBe(0);
    expect(again.out).toContain("already this version's skill");
    for (const [target, folder] of [
      ["copilot", ".github/skills"],
      ["codex", ".agents/skills"],
      ["gemini", ".agents/skills"],
    ] as const) {
      expect((await run(["skill", "--install", target], dir)).code).toBe(0);
      expect(readFileSync(join(dir, folder, "pbiplint", "SKILL.md"), "utf8")).toBe(text);
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
    const dry = await run(["skill", "--install", "claude", "--force", "--dry-run"], dir);
    expect(dry.out).toContain("would replace");
    expect(readFileSync(path, "utf8")).toBe(edited);
    const forced = await run(["skill", "--install", "claude", "--force"], dir);
    expect(forced.code).toBe(0);
    expect(forced.out).toContain("replaced .claude/skills/pbiplint/SKILL.md");
    expect(readFileSync(path, "utf8")).toBe(text);
  });

  it("--dry-run writes nothing", async () => {
    const dir = tempDir("skill-dry");
    const r = await run(["skill", "--install", "copilot", "--dry-run"], dir);
    expect(r.out).toBe(
      `pbiplint: would write .github/skills/pbiplint/SKILL.md (pbiplint ${pkg.version})\n`,
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
  });
});
