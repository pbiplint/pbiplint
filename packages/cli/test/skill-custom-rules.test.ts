import { cpSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { defaultRules } from "@pbiplint/core";
import { readCustomRules, teReference, teSeverity } from "@pbiplint/core/custom-rules";
import { describe, expect, it } from "vitest";
import { tempDir } from "../../../tests/support/temp-dir.js";
import { parseArgs } from "../src/args.js";
import { main } from "../src/main.js";
import { skillVersion } from "../src/skill.js";

// The second skill: how an assistant writes, checks, and fixes a team's own rule (spec section 9).
const repo = new URL("../../../", import.meta.url).pathname;
const text = readFileSync(
  new URL("../skill/pbiplint-custom-rules/SKILL.md", import.meta.url),
  "utf8",
);
const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")) as {
  version: string;
};
const frontmatter = /^---\n([\s\S]*?)\n---\n/.exec(text)![1]!;
const description = /^description: (.+)$/m.exec(frontmatter)![1]!;
const headings = [...text.matchAll(/^## (.+)$/gm)].map((m) => m[1]!);
const section = (heading: string): string =>
  new RegExp(`^## ${heading}\\n([\\s\\S]*?)(?=\\n## |\\n<!--\\n)`, "m").exec(text)![1]!;

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

describe("the custom rules skill file", () => {
  it("is an Agent Skill named pbiplint-custom-rules, MIT, with the notice at the end", () => {
    expect(/^name: (.+)$/m.exec(frontmatter)![1]).toBe("pbiplint-custom-rules");
    expect(frontmatter).toMatch(/^license: MIT$/m);
    expect(text.trimEnd().endsWith("-->")).toBe(true);
    expect(text).toContain("Copyright (c) 2026 McKinley Consulting");
    expect(text).toContain("Permission is hereby granted, free of charge");
  });

  it("says when to load it in a description of at most 1,024 characters, ending with the version", () => {
    expect(description.length).toBeLessThanOrEqual(1024);
    for (const words of [
      "Write, check, and fix a team's own pbiplint rule",
      "Best Practice Analyzer",
      "BPARules.json",
      "custom rule",
      "RULE_COULD_NOT_FINISH",
      "customRules",
      "pbiplint.config.json",
    ])
      expect(description).toContain(words);
    expect(skillVersion(text)).toBe(pkg.version);
    expect(description.endsWith(` pbiplint ${pkg.version}.`)).toBe(true);
  });

  it("follows the house rules for prose", () => {
    expect(text).not.toContain(String.fromCharCode(0x2014));
    expect(text.split("\n").length).toBeLessThan(500);
  });

  it("has its sections in order", () => {
    expect(headings).toEqual([
      "When to use it",
      "The loop",
      "Writing the rule",
      "Judgment",
      "Worked examples",
      "Reporting back",
    ]);
  });

  it("takes the loop's steps in order", () => {
    const loop = section("The loop");
    const steps = loop.split("\n").filter((l) => /^\d+\. /.test(l));
    const marks = [
      /Ask/,
      /`pbiplint reference`.*`custom_rules_reference`/,
      /team's rule file/,
      /`customRules`/,
      /`pbiplint <path> --rule <ID>`/,
      /`pbiplint explain <ID> --config <file>`.*`<file>` is the project's `pbiplint.config.json`/,
      /`RULE_COULD_NOT_FINISH`/,
    ];
    expect(steps).toHaveLength(marks.length);
    marks.forEach((mark, i) => expect(steps[i], String(mark)).toMatch(mark));
  });

  it("gives only commands that parse, each one main runs", () => {
    const main = readFileSync(new URL("../src/main.ts", import.meta.url), "utf8");
    const runs = new Set([
      "lint",
      ...[...main.matchAll(/opts\.command === "([a-z]+)"/g)].map((m) => m[1]!),
    ]);
    const commands = [...text.matchAll(/`(?:npx )?pbiplint( [^`]+)`/g)].map((m) => m[1]!.trim());
    expect(commands.length).toBeGreaterThan(5);
    const placeholders: Record<string, string> = {
      "<path>": "./model",
      "<ID>": "TEAM_RULE",
      "<file>": "pbiplint.config.json",
    };
    for (const command of commands) {
      const argv = command.split(/\s+/).map((a) => placeholders[a] ?? a);
      expect(
        argv.filter((a) => a.startsWith("<")),
        command,
      ).toEqual([]);
      const opts = parseArgs(argv);
      expect(runs.has(opts.command), command).toBe(true);
      expect(opts.command, command).not.toBe("help");
    }
  });

  it("names only MCP tools the server registers", () => {
    const server = readFileSync(new URL("../src/mcp.ts", import.meta.url), "utf8");
    const tools = new Set([...server.matchAll(/registerTool\(\s*"([a-z_]+)"/g)].map((m) => m[1]!));
    const named = [...new Set([...text.matchAll(/`([a-z]+(?:_[a-z]+)+)`/g)].map((m) => m[1]!))];
    expect(named).toEqual(expect.arrayContaining(["custom_rules_reference", "explain_rule"]));
    for (const name of named) expect(tools.has(name), name).toBe(true);
  });
});

/** Each worked example: the rule in its fenced json block, under its own heading. */
const examples = [...section("Worked examples").matchAll(/^```json\n([\s\S]*?)\n```$/gm)].map(
  (m) => JSON.parse(m[1]!) as Record<string, unknown>,
);
const ruleFile = JSON.stringify(examples, null, 2) + "\n";

/** What each example flags on its fixture, by the object names pbiplint's JSON gives. */
const FLAGS: Record<string, string[]> = {
  NO_CAMELCASE_COLUMNS_HIERARCHIES: ["'Sales'[customerName]", "orderCalendar"],
  LAYOUT_MEASURES_DF: ["[Order Count]"],
  LAYOUT_COLUMNS_HIERARCHIES_DF: ["'Scratch'[Test Value]", "orderCalendar"],
  TEAM_APPROVED_SNOWFLAKE_SCHEMAS: ["Scratch"],
};

describe("the skill's worked examples", () => {
  it("are four rules with #117's ids and the approved schemas rule, each under its own heading", () => {
    expect(examples.map((e) => e.ID)).toEqual(Object.keys(FLAGS));
    const subheadings = [...section("Worked examples").matchAll(/^### (.+)$/gm)].map((m) => m[1]);
    expect(subheadings).toEqual(Object.keys(FLAGS).map((id) => `\`${id}\``));
  });

  it("read with no notices or problems, ids distinct and none of pbiplint's", () => {
    const set = readCustomRules([{ path: "rules/team.json", text: ruleFile }]);
    expect(set.notices).toEqual([]);
    expect(set.rules).toHaveLength(4);
    for (const rule of set.rules) {
      expect(rule.custom?.readProblem, rule.id).toBeUndefined();
      expect(rule.custom?.upstream, rule.id).toBeUndefined();
    }
    const builtIn = new Set(defaultRules.map((r) => r.id.toUpperCase()));
    const ids = examples.map((e) => String(e.ID).toUpperCase());
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.filter((id) => builtIn.has(id))).toEqual([]);
    for (const id of ids) expect(id).toMatch(/^[A-Z][A-Z0-9_]*$/);
  });

  it("name only scopes the reference lists, and carry every field a rule page needs", () => {
    const scopes = new Set(teReference().scopes.map((s) => s.name));
    for (const e of examples) {
      for (const key of [
        "ID",
        "Name",
        "Category",
        "Description",
        "Severity",
        "Scope",
        "Expression",
      ])
        expect(e[key], `${String(e.ID)}.${key}`).toBeDefined();
      for (const scope of String(e.Scope)
        .split(",")
        .map((s) => s.trim()))
        expect(scopes.has(scope), `${String(e.ID)}: ${scope}`).toBe(true);
    }
  });

  it("each have a description of three paragraphs: what it checks, why, and how to fix a finding", () => {
    for (const e of examples) {
      const paragraphs = String(e.Description).split("\n\n");
      expect(paragraphs, String(e.ID)).toHaveLength(3);
      for (const p of paragraphs) expect(p.trim().length, String(e.ID)).toBeGreaterThan(40);
    }
  });

  describe("on the fixture made for them", () => {
    const setUp = () => {
      const dir = tempDir("skill-examples");
      const model = join(dir, "custom-rules-examples.SemanticModel");
      cpSync(join(repo, "tests/fixtures/custom-rules-examples.SemanticModel"), model, {
        recursive: true,
      });
      mkdirSync(join(dir, "rules"));
      writeFileSync(join(dir, "rules", "team.json"), ruleFile);
      writeFileSync(
        join(dir, "pbiplint.config.json"),
        JSON.stringify({ customRules: ["rules/team.json"] }),
      );
      return { dir, model };
    };

    it.each(Object.entries(FLAGS))(
      "%s finds exactly the objects it was written for",
      async (id, objects) => {
        const { dir, model } = setUp();
        const r = await run([model, "--rule", id, "--format", "json"], dir);
        expect(r.err).toBe("");
        const doc = JSON.parse(r.out) as {
          groups: { rule: { id: string }; findings: { objectName: string }[] }[];
        };
        expect(doc.groups.map((g) => g.rule.id)).toEqual([id]);
        expect(doc.groups[0]!.findings.map((f) => f.objectName).sort()).toEqual(
          [...objects].sort(),
        );
        // The whole run, every rule: none of the examples fails to run.
        const all = await run([model, "--format", "json"], dir);
        expect(all.out).not.toContain("RULE_COULD_NOT_FINISH");
      },
    );

    it.each(Object.keys(FLAGS))(
      "pbiplint explain %s prints the rule as pbiplint read it",
      async (id) => {
        const { dir } = setUp();
        const r = await run(["explain", id], dir);
        expect(r.code).toBe(0);
        const example = examples.find((e) => e.ID === id)!;
        expect(r.out).toContain(`${id}  ${String(example.Name)}`);
        expect(r.out).toContain("custom rule");
        expect(r.out).toContain("rules/team.json");
        expect(r.out.replace(/\s+/g, " ")).toContain(
          String(example.Expression).replace(/\s+/g, " "),
        );
      },
    );

    it("pbiplint explain <ID> --config <file> finds the rule from a parent folder, as the loop runs it", async () => {
      const parent = tempDir("skill-explain-parent");
      const project = join(parent, "project");
      cpSync(
        join(repo, "tests/fixtures/custom-rules-examples.SemanticModel"),
        join(project, "m.SemanticModel"),
        {
          recursive: true,
        },
      );
      mkdirSync(join(project, "rules"));
      writeFileSync(join(project, "rules", "team.json"), ruleFile);
      writeFileSync(
        join(project, "pbiplint.config.json"),
        JSON.stringify({ customRules: ["rules/team.json"] }),
      );
      const id = "LAYOUT_MEASURES_DF";
      // Without --config, explain looks from the working folder, so it does not find the rule.
      expect((await run(["explain", id], parent)).code).toBe(2);
      const r = await run(["explain", id, "--config", "project/pbiplint.config.json"], parent);
      expect(r.code).toBe(0);
      expect(r.err).toBe("");
      expect(r.out).toContain("custom rule");
      expect(r.out).toContain("rules/team.json");
      // The CLI page's "Write a custom rule" loop gives the same command.
      const page = readFileSync(new URL("../../web/content/cli.md", import.meta.url), "utf8");
      expect(page).toContain("`pbiplint explain <RULE_ID> --config <file>`, where `<file>` is");
    });
  });
});

describe("the skill on severities, held to how pbiplint reads them", () => {
  it("says 1 is info, 2 a warning, and 3 or more an error", () => {
    const writing = section("Writing the rule").replace(/\s+/g, " ");
    expect(writing).toContain("1 is info, 2 a warning, 3 or more an error");
    expect([1, 2, 3, 4, 10].map((n) => teSeverity(n))).toEqual([1, 2, 3, 3, 3]);
  });
});

describe("the skill on empty values, held to the evaluator", () => {
  const writing = section("Writing the rule").replace(/\s+/g, " ");

  it("says what an empty value does, as the evaluator runs it", () => {
    for (const words of [
      "A property marked `?` in the reference can be empty.",
      "calling a method on it",
      "gives no finding for that object",
      "test `== null` when an empty value should be flagged",
      "Passing an empty one to a function, as in `RegEx.IsMatch(Expression, ...)`, stops the rule",
    ])
      expect(writing).toContain(words);
    expect(writing).not.toMatch(/Calling a method on an empty one stops the rule/);
  });

  // Table.Expression is empty on every table of the fixture: none is a calculated table.
  const behaviours: [expression: string, flags: number | "stops"][] = [
    ["Expression == null", 3],
    ["Expression.Length > 0", 0],
    ['Expression.Contains("a") == false', 0],
    ['RegEx.IsMatch(Expression, "a")', "stops"],
  ];
  it.each(behaviours)("on the empty Table.Expression, %s gives %s", async (expression, flags) => {
    const dir = tempDir("skill-empty-values");
    const model = join(dir, "m.SemanticModel");
    cpSync(join(repo, "tests/fixtures/custom-rules-examples.SemanticModel"), model, {
      recursive: true,
    });
    const rule = {
      ID: "TEAM_EMPTY",
      Name: "Empty",
      Scope: "Table",
      Severity: 2,
      Expression: expression,
    };
    writeFileSync(join(dir, "team.json"), JSON.stringify([rule]));
    writeFileSync(
      join(dir, "pbiplint.config.json"),
      JSON.stringify({ customRules: ["team.json"] }),
    );
    const r = await run([model, "--format", "json"], dir);
    const doc = JSON.parse(r.out) as {
      groups: { rule: { id: string }; findings: { objectName: string; detail?: string }[] }[];
    };
    const own = doc.groups.find((g) => g.rule.id === "TEAM_EMPTY");
    const stopped = doc.groups
      .find((g) => g.rule.id === "RULE_COULD_NOT_FINISH")
      ?.findings.some((f) => f.detail?.includes("TEAM_EMPTY"));
    if (flags === "stops") {
      expect(stopped).toBe(true);
      expect(own).toBeUndefined();
    } else {
      expect(stopped ?? false).toBe(false);
      expect(own?.findings.length ?? 0).toBe(flags);
    }
  });
});
