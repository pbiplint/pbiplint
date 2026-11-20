import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { defaultRules } from "@pbiplint/core";
import { readCustomRules } from "@pbiplint/core/custom-rules";
import { describe, expect, it } from "vitest";
import { tempDir } from "../../../tests/support/temp-dir.js";
import {
  explainJson,
  explainRule,
  explainText,
  findCustomRule,
  shownRuleIds,
  splitSections,
  suggest,
} from "../src/explain.js";
import { main } from "../src/main.js";
import { RULE_HELP } from "../src/rule-help.data.js";

const found = (input: string) => {
  const r = explainRule(input);
  if (!("rule" in r)) throw new Error(`${input} did not explain`);
  return r;
};

describe("explainRule", () => {
  it.each(defaultRules.map((r) => r.id))("explains %s", (id) => {
    const e = found(id);
    expect(e.rule.id).toBe(id);
    expect(e.rule.description).not.toBe("");
    expect(e.sections.whyItMatters).toBeTruthy();
    expect(e.sections.howToFixIt).toBeTruthy();
    const text = explainText(e);
    expect(text.startsWith(`${id}  `)).toBe(true);
    expect(text).toContain(e.rule.url);
    expect(text).not.toContain("Read more:");
    expect(JSON.parse(explainJson(e, "1.2.3")).rule.id).toBe(id);
  });

  it("has help for every rule and no help for a rule that does not exist", () => {
    expect(Object.keys(RULE_HELP).sort()).toEqual(defaultRules.map((r) => r.id).sort());
  });

  it("splits every rule's help into sections that rejoin to the help exactly", () => {
    const titles = {
      example: "Example",
      whyItMatters: "Why it matters",
      howToFixIt: "How to fix it",
      whenToIgnoreIt: "When to ignore it",
      quirks: "Quirks",
    } as const;
    for (const [id, help] of Object.entries(RULE_HELP)) {
      const s = splitSections(help.markdown);
      const rejoined = (Object.keys(titles) as (keyof typeof titles)[])
        .filter((k) => s[k] !== undefined)
        .map((k) => `### ${titles[k]}\n\n${s[k]}\n`)
        .join("\n");
      expect(`${rejoined}\nRead more: ${found(id).rule.url}`, id).toBe(help.markdown);
    }
  });

  it("matches an id in any case, and a rule's page name", () => {
    expect(found("avoid_duplicate_measures").rule.id).toBe("AVOID_DUPLICATE_MEASURES");
    expect(found("broken-action-target").rule.id).toBe("BROKEN_ACTION_TARGET");
    expect(found(" Broken Action Target ").rule.id).toBe("BROKEN_ACTION_TARGET");
  });

  it("gives the rule's fields at their default severity, with its description", () => {
    const e = found("BROKEN_ACTION_TARGET");
    expect(e.rule).toEqual({
      id: "BROKEN_ACTION_TARGET",
      name: "Action points at nothing",
      category: "Error Prevention",
      severity: 3,
      layer: "report",
      slug: "broken-action-target",
      url: "https://pbiplint.com/rules/broken-action-target",
      status: "builtin",
      description: defaultRules.find((r) => r.id === "BROKEN_ACTION_TARGET")!.description,
    });
  });

  it("suggests the nearest ids for one it does not know", () => {
    expect(explainRule("AVOID_DUPLICATE_MEASURE")).toEqual({
      suggestions: ["AVOID_DUPLICATE_MEASURES"],
    });
    expect(explainRule("nothing like any rule at all")).toEqual({ suggestions: [] });
    expect(explainRule("")).toEqual({ suggestions: [] });
  });
});

describe("suggest", () => {
  it("puts ids that contain the input first, at most three", () => {
    const s = suggest("DUPLICATE");
    expect(s.length).toBeLessThanOrEqual(3);
    expect(s).toContain("AVOID_DUPLICATE_MEASURES");
  });
  it("finds a near miss by edit distance", () => {
    expect(suggest("BROKEN_ACTOIN_TARGET")).toEqual(["BROKEN_ACTION_TARGET"]);
  });
});

describe("explainText", () => {
  it("names the Power Query layer by its value", () => {
    const lines = explainText(found("MINIMIZE_POWER_QUERY_TRANSFORMATIONS")).split("\n");
    expect(lines[1]).toBe("Warning, powerquery layer, Performance");
  });
  it("leads with the id, the name, severity, layer, category, and the page link", () => {
    const lines = explainText(found("BROKEN_ACTION_TARGET")).split("\n");
    expect(lines.slice(0, 4)).toEqual([
      "BROKEN_ACTION_TARGET  Action points at nothing",
      "Error, report layer, Error Prevention",
      "https://pbiplint.com/rules/broken-action-target",
      "",
    ]);
    // The body is plain text, so the description drops its code spans too.
    expect(lines[4]).not.toContain("`");
  });
  it("says a rule that needs a live model is listed but not run", () => {
    const live = defaultRules.find((r) => r.status === "needsLiveModel")!;
    expect(explainText(found(live.id)).split("\n")[1]).toMatch(
      /, needs a live model \(listed, not run\)$/,
    );
  });
});

describe("explainJson", () => {
  it("prints one document with the version, the tool, the rule, and its sections", () => {
    const doc = JSON.parse(explainJson(found("BROKEN_ACTION_TARGET"), "1.2.3"));
    expect(Object.keys(doc)).toEqual(["version", "tool", "rule", "sections"]);
    expect(doc.version).toBe(1);
    expect(doc.tool).toEqual({ name: "pbiplint", version: "1.2.3" });
    expect(Object.keys(doc.sections)).toEqual(
      ["example", "whyItMatters", "howToFixIt", "whenToIgnoreIt", "quirks"].filter(
        (k) => k in doc.sections,
      ),
    );
    expect(doc.sections.howToFixIt).toBe(found("BROKEN_ACTION_TARGET").sections.howToFixIt);
  });
});

describe("explain for a custom rule (#118)", () => {
  const TEAM_RULE = {
    ID: "TEAM_MEASURE_FORMAT",
    Name: "Measures carry a format string",
    Description: "A measure with no format string shows raw numbers.",
    Category: "Team formatting",
    Severity: 3,
    Scope: "Measure, CalculationItem",
    Expression: 'FormatString = ""\n\tand not IsHidden',
  };
  const set = readCustomRules([{ path: "rules/team.json", text: JSON.stringify([TEAM_RULE]) }]);

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
  /** A folder with a config naming rules/team.json, which holds TEAM_RULE unless `missing`. */
  function teamFolder(name: string, missing = false): string {
    const root = tempDir(name);
    writeFileSync(
      join(root, "pbiplint.config.json"),
      JSON.stringify({ customRules: ["rules/team.json"] }),
    );
    if (!missing) {
      mkdirSync(join(root, "rules"));
      writeFileSync(join(root, "rules", "team.json"), JSON.stringify([TEAM_RULE]));
    }
    return root;
  }

  it("gives the rule's fields, its scope, and its expression, with no sections", () => {
    const e = explainRule("team_measure_format", set);
    expect(e).toEqual({
      rule: {
        id: "TEAM_MEASURE_FORMAT",
        name: "Measures carry a format string",
        category: "Team formatting",
        severity: 3,
        layer: "model",
        slug: "team-measure-format",
        url: "https://pbiplint.com/custom-rules/",
        status: "custom",
        custom: true,
        ruleFile: "rules/team.json",
        description: "A measure with no format string shows raw numbers.",
        scope: ["Measure", "CalculationItem"],
        expression: 'FormatString = ""\n\tand not IsHidden',
      },
      sections: {},
    });
  });

  it("prints the id, name, severity, layer, category, file, description, scope, and expression", () => {
    const e = explainRule("TEAM_MEASURE_FORMAT", set);
    if (!("rule" in e)) throw new Error("did not explain");
    expect(explainText(e)).toBe(
      [
        "TEAM_MEASURE_FORMAT  Measures carry a format string",
        "Error, model layer, Team formatting, custom rule",
        "rules/team.json",
        "",
        "A measure with no format string shows raw numbers.",
        "",
        "Scope: Measure, CalculationItem",
        "",
        "Expression:",
        '    FormatString = ""',
        "        and not IsHidden",
        "",
      ].join("\n"),
    );
    const doc = JSON.parse(explainJson(e, "1.2.3"));
    expect(doc.rule).toEqual(e.rule);
    expect(doc.sections).toEqual({});
  });

  it("shows a control character in a rule file's text, never sends it raw", () => {
    const hostile = readCustomRules([
      {
        path: "rules/team.json",
        text: JSON.stringify([{ ...TEAM_RULE, Name: "Clear\u001b[2J", Expression: "true‮" }]),
      },
    ]);
    const e = explainRule("TEAM_MEASURE_FORMAT", hostile);
    if (!("rule" in e)) throw new Error("did not explain");
    const text = explainText(e);
    expect(text).toContain("Clear\\u001b[2J");
    expect(text).toContain("    true\\u202e");
    expect(explainJson(e, "1.2.3")).toContain("true\\u202e");
  });

  it("finds a custom id written as --quiet writes it, each whitespace character as %20", () => {
    const spaced = readCustomRules([
      {
        path: "rules/team.json",
        text: JSON.stringify([
          { ...TEAM_RULE, ID: "TEAM A" },
          { ...TEAM_RULE, ID: "TEAM TABLES\tALL" },
        ]),
      },
    ]).rules;
    expect(findCustomRule("TEAM%20A", spaced)?.id).toBe("TEAM A");
    expect(findCustomRule("team%20a", spaced)?.id).toBe("TEAM A");
    expect(findCustomRule("TEAM%20TABLES%20ALL", spaced)?.id).toBe("TEAM TABLES\tALL");
    expect(findCustomRule("TEAM%20B", spaced)).toBeUndefined();
    expect(shownRuleIds(["TEAM%20A", "TEAM A"], spaced)).toEqual(["TEAM A"]);
    const set = { files: [], rules: spaced, notices: [] };
    expect(explainRule("TEAM%20A", set)).toMatchObject({ rule: { id: "TEAM A", custom: true } });
  });

  it("keeps a built-in rule ahead of a custom one, and suggests custom ids", () => {
    expect(explainRule("BROKEN_ACTION_TARGET", set)).toMatchObject({
      rule: { status: "builtin" },
    });
    expect(explainRule("TEAM_MEASURE_FORMT", set)).toEqual({
      suggestions: ["TEAM_MEASURE_FORMAT"],
    });
    expect(suggest("TEAM_MEASURE_FORMT", set.rules)).toEqual(["TEAM_MEASURE_FORMAT"]);
  });

  it("finds the custom id through the nearest config, in text and JSON, in any case", async () => {
    const root = teamFolder("explain-custom");
    const below = join(root, "below");
    mkdirSync(below);
    const text = await run(["explain", "Team_Measure_Format"], below);
    expect(text.code).toBe(0);
    expect(text.err).toBe("");
    expect(text.out.split("\n").slice(0, 3)).toEqual([
      "TEAM_MEASURE_FORMAT  Measures carry a format string",
      "Error, model layer, Team formatting, custom rule",
      "rules/team.json",
    ]);
    const json = await run(["explain", "team_measure_format", "--format", "json"], root);
    expect(json.code).toBe(0);
    expect(JSON.parse(json.out).rule).toMatchObject({
      id: "TEAM_MEASURE_FORMAT",
      custom: true,
      scope: ["Measure", "CalculationItem"],
    });
  });

  it("reads the config --config names, from the working folder", async () => {
    const root = teamFolder("explain-config");
    const elsewhere = tempDir("explain-elsewhere");
    const r = await run(
      ["explain", "TEAM_MEASURE_FORMAT", "--config", join(root, "pbiplint.config.json")],
      elsewhere,
    );
    expect(r.code).toBe(0);
    expect(r.out).toContain("Scope: Measure, CalculationItem");
  });

  it("suggests a custom id for a near miss", async () => {
    const r = await run(["explain", "TEAM_MEASURE_FORMT"], teamFolder("explain-near"));
    expect(r).toEqual({
      code: 2,
      out: "",
      err: 'pbiplint: no rule named "TEAM_MEASURE_FORMT"\nDid you mean TEAM_MEASURE_FORMAT?\nRun pbiplint rules for the list.\n',
    });
  });

  it("exits 2 naming the config and the file when the rule file is missing", async () => {
    const r = await run(["explain", "TEAM_MEASURE_FORMAT"], teamFolder("explain-missing", true));
    expect(r).toEqual({
      code: 2,
      out: "",
      err: "pbiplint: pbiplint.config.json: customRules: rules/team.json could not be read (ENOENT)\n",
    });
  });

  it("with no config, exits 2 for a custom id as for any unknown id", async () => {
    const r = await run(["explain", "TEAM_MEASURE_FORMAT"], tempDir("explain-no-config"));
    expect(r).toEqual({
      code: 2,
      out: "",
      err: 'pbiplint: no rule named "TEAM_MEASURE_FORMAT"\nRun pbiplint rules for the list.\n',
    });
  });

  it("explains a built-in rule without reading the nearest config", async () => {
    const r = await run(["explain", "BROKEN_ACTION_TARGET"], teamFolder("explain-builtin", true));
    expect(r.code).toBe(0);
    expect(r.out.startsWith("BROKEN_ACTION_TARGET  ")).toBe(true);
  });
});
