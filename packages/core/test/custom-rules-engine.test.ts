import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { readCustomRules } from "@pbiplint/core/custom-rules";
import { fingerprint } from "../src/custom-rules/te/fingerprint.js";
import { buildTomView } from "../src/custom-rules/te/view.js";
import { isConfigError, resolveConfig, type PbiplintConfig } from "../src/engine/config.js";
import type { CustomRuleSet } from "../src/engine/custom.js";
import { lint, type LintFile, type LintResult } from "../src/engine/lint.js";
import { CUSTOM_RULES_URL } from "../src/engine/rank.js";
import { showOnly } from "../src/engine/show-only.js";
import { formatSarif } from "../src/format/sarif.js";
import {
  isFailureOf,
  isFindingFor,
  RULE_COULD_NOT_FINISH,
} from "../src/rules/rule-could-not-finish.js";
import { repo } from "./custom-te-parity.js";
import { fixturesDir, readModelFiles } from "./helpers.js";

vi.mock("../src/custom-rules/te/view.js", async (importOriginal) => {
  const real = await importOriginal<typeof import("../src/custom-rules/te/view.js")>();
  return { ...real, buildTomView: vi.fn(real.buildTomView) };
});
beforeEach(() => {
  vi.mocked(buildTomView).mockClear();
});

const fixture = (name: string): LintFile[] => readModelFiles(`${fixturesDir}${name}.SemanticModel`);
const files = fixture("custom-rules");

const rule = (fields: Record<string, unknown>) => ({
  Name: "A team rule",
  Category: "Team",
  Severity: 2,
  Scope: "Measure",
  ...fields,
});
/** Finds every measure with a format string: several in the fixture. */
const TEAM_FORMATTED = rule({ ID: "TEAM_FORMATTED", Expression: 'FormatString <> ""' });
/** Reads a property a measure does not have, so it cannot run. */
const TEAM_VISIBLE = rule({ ID: "TEAM_VISIBLE", Expression: "Visible" });
/** Has no scope, so the reader cannot read it. */
const TEAM_NO_SCOPE = rule({ ID: "TEAM_NO_SCOPE", Scope: undefined, Expression: "true" });

/** Microsoft's published rules, vendored (MIT): the source of a team's copies below. */
const microsoftText = readFileSync(`${repo}tests/rules/microsoft/BPARules.json`, "utf8");
const microsoft = JSON.parse(microsoftText.slice(microsoftText.indexOf("["))) as Record<
  string,
  unknown
>[];
/** A team's copy of a published rule, with the fields the team changed. */
const copyOf = (id: string, fields: Record<string, unknown> = {}) => ({
  ...microsoft.find((r) => r.ID === id)!,
  ...fields,
});
/** The same expression laid out again: every run of whitespace a line break and an indent. */
const reflow = (expression: unknown) => String(expression).replace(/\s+/g, "\n      ");

const set = (...rules: unknown[]): CustomRuleSet =>
  readCustomRules([{ path: "rules/team.json", text: JSON.stringify(rules) }]);
const run = (
  custom: CustomRuleSet | undefined,
  config: PbiplintConfig = {},
  input: LintFile[] = files,
): Promise<LintResult> =>
  lint(input, { config, ...(custom === undefined ? {} : { customRules: custom }) });

const failures = (r: LintResult) => r.findings.filter((f) => f.ruleId === RULE_COULD_NOT_FINISH.id);
const ofRule = (r: LintResult, id: string) => r.findings.filter((f) => f.ruleId === id);

/** Every measure, column, and table name in the fixture, to show a reason quotes none of them. */
const fixtureNames = [
  ...new Set(
    files.flatMap((f) =>
      [...f.text.matchAll(/^\t(?:measure|column|table) '?([^'=\n]+?)'?(?: =|$)/gm)].map((m) =>
        m[1]!.trim(),
      ),
    ),
  ),
].filter((n) => n.length > 3);

describe("the engine runs custom rules", () => {
  it("reports a custom finding with no detail, message id, or params, and counts the rule as run", async () => {
    const result = await run(set(TEAM_FORMATTED));
    const found = ofRule(result, "TEAM_FORMATTED");
    expect(found.length).toBeGreaterThan(1);
    for (const f of found) {
      expect(f).toMatchObject({ layer: "model", objectType: "Measure" });
      expect(f.location?.file).toMatch(/^definition\/tables\/\w+\.tmdl$/);
      expect(f).not.toHaveProperty("detail");
      expect(f).not.toHaveProperty("messageId");
      expect(f).not.toHaveProperty("params");
    }
    expect(found.map((f) => f.objectName)).toContain("[Total Amount]");
    const without = await run(undefined);
    expect(result.summary.rulesRun).toBe(without.summary.rulesRun + 1);
    const group = result.groups.find((g) => g.rule.id === "TEAM_FORMATTED")!;
    expect(group.rule).toMatchObject({ severity: 2, category: "Team", status: "custom" });
  });

  it("skips a custom rule the config turns off, without evaluating it", async () => {
    const result = await run(set(TEAM_FORMATTED), { rules: { team_formatted: "off" } });
    expect(result.summary.rulesSkipped).toContainEqual({
      id: "TEAM_FORMATTED",
      reason: "disabled",
    });
    expect(ofRule(result, "TEAM_FORMATTED")).toEqual([]);
    expect(vi.mocked(buildTomView)).not.toHaveBeenCalled();
  });

  it("takes a custom rule's severity from the config, and fails a gate on it", async () => {
    const raised = await run(set(TEAM_FORMATTED), { rules: { TEAM_FORMATTED: "error" } });
    expect(raised.groups.find((g) => g.rule.id === "TEAM_FORMATTED")!.rule.severity).toBe(3);
    // No built-in rule runs, so the custom rule alone decides the gate.
    const gate = (config: PbiplintConfig) =>
      lint(files, { rules: [], customRules: set(TEAM_FORMATTED), config });
    expect((await gate({ failOn: "warning" })).failed).toBe(true);
    expect((await gate({ failOn: "error" })).failed).toBe(false);
    expect((await gate({ failOn: "warning", rules: { TEAM_FORMATTED: "info" } })).failed).toBe(
      false,
    );
  });

  it("never lists a custom id among the config's unknown rules", async () => {
    const result = await run(set(TEAM_FORMATTED), { rules: { TEAM_FORMATTED: "info" } });
    expect(result.summary.unknownRules).toEqual([]);
  });

  it("drops a custom finding on an object Tabular Editor's annotation or pbiplint.ignore names", async () => {
    const probe = rule({
      ID: "PROBE_IGNORE_CUSTOM",
      Scope: "Table, Measure, Column, Partition, Relationship, Perspective",
      Expression: "true",
    });
    const result = await run(set(probe));
    const found = ofRule(result, "PROBE_IGNORE_CUSTOM");
    const names = found.map((f) => f.objectName);
    expect(names).not.toContain("[Amount per Unit]");
    expect(names).not.toContain("'Orders'[Customer Key]");
    expect(names).not.toContain("'Notes'");
    expect(
      found.filter((f) => f.objectType === "Partition").map((f) => f.objectName),
    ).not.toContain("Orders");
    expect(names).toContain("[Total Amount]");
    // The perspective's annotation is malformed, so it ignores nothing (pull request C).
    expect(names).toContain("Sales View");
    // The measure, column, table, partition, and relationship.
    expect(result.summary.ignored).toBe((await run(undefined)).summary.ignored + 5);

    const inline: LintFile[] = [
      { path: "definition/model.tmdl", text: "model Model\n" },
      {
        path: "definition/tables/T.tmdl",
        text: "table T\n\tmeasure A = 1\n\t\tannotation pbiplint.ignore = probe_ignore_custom\n\tmeasure B = 2\n",
      },
    ];
    const annotated = await run(set(probe), {}, inline);
    expect(ofRule(annotated, "PROBE_IGNORE_CUSTOM").map((f) => f.objectName)).toEqual([
      "'T'",
      "[B]",
    ]);
  });

  it("drops every model-layer custom finding Tabular Editor's annotation on the model names", async () => {
    const probe = rule({
      ID: "PROBE_IGNORE_CUSTOM",
      Scope: "Model, Table, Measure",
      Expression: "true",
    });
    const result = await run(set(probe), {}, fixture("custom-rules-model-ignore"));
    expect(ofRule(result, "PROBE_IGNORE_CUSTOM")).toEqual([]);
    expect(result.summary.ignored).toBeGreaterThan(0);
  });

  it("never lets Tabular Editor's annotation hide a rule that could not finish", async () => {
    // The model's own annotation names PROBE_IGNORE_CUSTOM, and the failure sits on the model.
    const broken = rule({ ID: "PROBE_IGNORE_CUSTOM", Expression: "Visible" });
    const result = await run(set(broken), {}, fixture("custom-rules-model-ignore"));
    expect(failures(result).filter((f) => isFailureOf(f, "PROBE_IGNORE_CUSTOM"))).toHaveLength(1);
  });

  it.each([
    ["a rule that cannot run", "TEAM_VISIBLE", TEAM_VISIBLE, /Measure has no property `Visible`/],
    ["a rule the reader could not read", "TEAM_NO_SCOPE", TEAM_NO_SCOPE, /has no Scope/],
  ])(
    "reports %s once, on the model, naming the rule, its file, and the reason",
    async (_n, id, r, reason) => {
      const result = await run(set(r));
      const [failure, ...more] = failures(result);
      expect(more).toEqual([]);
      expect(failure).toMatchObject({ objectType: "Model", layer: "model" });
      expect(failure!.detail).toMatch(
        new RegExp(`^${id} could not finish on the model: rules/team\\.json: `),
      );
      expect(failure!.detail).toMatch(reason);
      for (const name of fixtureNames) expect(failure!.detail, name).not.toContain(name);
      expect(result.summary.ruleErrors).toEqual([
        {
          id,
          message: failure!.detail!.replace(`${id} could not finish on the model: `, ""),
          ruleFile: "rules/team.json",
        },
      ]);
      expect(isFailureOf(failure!, id)).toBe(true);
      expect(isFindingFor(failure!, result.summary.ruleErrors[0]!)).toBe(true);
      expect(ofRule(result, id)).toEqual([]);
      const gated = await lint(files, { rules: [RULE_COULD_NOT_FINISH], customRules: set(r) });
      expect(gated.failed).toBe(true);
      expect(result.summary.customRules![0]!.notRun).toEqual([id]);

      const shown = showOnly(result, [id], resolveConfig({}));
      expect(shown.findings).toEqual([failure]);

      const off = await run(set(r), { rules: { [id]: "off" } });
      expect(failures(off)).toEqual([]);
      expect(off.summary.ruleErrors).toEqual([]);
    },
  );

  it("gives one notice per rule for the objects it left out", async () => {
    const reads = (id: string) =>
      rule({ ID: id, Scope: "Column", Expression: "DataType = DataType.String" });
    const result = await run(set(reads("TEAM_TEXT"), reads("TEAM_TEXT_TOO")));
    const notices = result.diagnostics.filter((d) => d.kind === "custom-rule-left-out");
    expect(notices.map((d) => d.path)).toEqual(["rules/team.json", "rules/team.json"]);
    expect(notices[0]!.message).toContain("TEAM_TEXT ");
    expect(notices[1]!.message).toContain("TEAM_TEXT_TOO");
    expect(notices[0]!.message).not.toContain("Amount Band");
  });

  it("carries the reader's notices into the diagnostics", async () => {
    const custom = readCustomRules([
      { path: "rules/team.json", text: JSON.stringify([TEAM_FORMATTED]) },
      { path: "rules/more.json", text: JSON.stringify([{ ...TEAM_FORMATTED, Severity: 3 }]) },
    ]);
    const result = await run(custom);
    expect(result.diagnostics.filter((d) => d.kind === "custom-rule-duplicate")).toEqual(
      custom.notices,
    );
  });

  it("refuses a run whose config names rule files when it was not given them", async () => {
    // A team's rules must never pass in silence: a caller that resolved such a config and passed
    // no set, as the site does today, gets the config's refusal rather than a run without them.
    const message =
      "pbiplint.config.json: customRules names rule files, and this run was not given them";
    const config = { customRules: ["rules/team.json"] };
    await expect(lint(files, { config })).rejects.toThrow(message);
    await expect(lint(files, { config: resolveConfig(config) })).rejects.toSatisfy(isConfigError);
    // Given a set, even one that holds no rules, the run goes ahead; so does a config naming none.
    const none = { files: [], rules: [], notices: [] };
    await expect(lint(files, { config, customRules: none })).resolves.toBeDefined();
    await expect(lint(files, { config: { customRules: [] } })).resolves.toBeDefined();
  });

  it("runs a custom rule with a built-in id when pbiplint's rule of that id is not in the run", async () => {
    // Set aside only for a rule that runs in its place: a team's rule is never dropped for one
    // the caller left out.
    const copy = rule({ ID: "hide_foreign_keys", Scope: "Column", Expression: "IsHidden" });
    const result = await lint(files, {
      rules: [RULE_COULD_NOT_FINISH],
      customRules: set(copy),
      config: { failOn: "none" },
    });
    expect(ofRule(result, "hide_foreign_keys").length).toBeGreaterThan(0);
    expect(result.summary.rulesRun).toBe(2);
    expect(result.summary.customRules?.[0]?.asBuiltIn).toEqual([]);
    expect(result.diagnostics.filter((d) => d.kind === "custom-rules")).toEqual([]);
  });

  it("keeps RULE_COULD_NOT_FINISH pbiplint's own when a custom rule takes its id", async () => {
    const result = await run(set(rule({ ID: "RULE_COULD_NOT_FINISH", Expression: "true" })));
    const [failure, ...more] = failures(result);
    expect(more).toEqual([]);
    expect(failure!.detail).toMatch(
      /^RULE_COULD_NOT_FINISH could not finish on the model: rules\/team\.json: The ID RULE_COULD_NOT_FINISH/,
    );
    const group = result.groups.find((g) => g.rule.id === RULE_COULD_NOT_FINISH.id)!;
    expect(group.rule).toMatchObject({
      status: "builtin",
      severity: 3,
      name: RULE_COULD_NOT_FINISH.name,
    });
  });

  it("lists each file's rules in the summary only when custom rules are given", async () => {
    const result = await run(set(TEAM_FORMATTED, TEAM_VISIBLE));
    expect(result.summary.customRules).toEqual([
      {
        file: "rules/team.json",
        rules: ["TEAM_FORMATTED", "TEAM_VISIBLE"],
        asBuiltIn: [],
        replaced: [],
        notRun: ["TEAM_VISIBLE"],
      },
    ]);
    expect((await run(undefined)).summary).not.toHaveProperty("customRules");
  });

  it("gives today's result when no custom rules are given", async () => {
    const today = await lint(files);
    expect(await lint(files, {})).toEqual(today);
    expect(await lint(files, { config: {} })).toEqual(today);
    expect(today.diagnostics).toEqual([]);
    expect(today.summary).not.toHaveProperty("customRules");
    for (const e of today.summary.ruleErrors) expect(e).not.toHaveProperty("ruleFile");
    // A set with no rules changes nothing but the summary's list of files.
    const none = await lint(files, { customRules: { files: [], rules: [], notices: [] } });
    const { customRules, ...summary } = none.summary;
    expect(customRules).toEqual([]);
    expect({ ...none, summary }).toEqual(today);
  });
});

describe("a custom rule with the id of one of pbiplint's rules", () => {
  const HIDE = "HIDE_FOREIGN_KEYS";
  const builtInRun = () => run(undefined);
  const groupOf = (r: LintResult, id: string) => r.groups.find((g) => g.rule.id === id);
  const noticesOf = (r: LintResult) => r.diagnostics.filter((d) => d.kind === "custom-rules");

  it("skips an unchanged copy, whitespace aside, and runs pbiplint's rule with its page", async () => {
    const copy = copyOf(HIDE, { Expression: reflow(copyOf(HIDE).Expression) });
    const result = await run(set(copy, TEAM_FORMATTED));
    const builtIn = await builtInRun();
    expect(ofRule(builtIn, HIDE).length).toBeGreaterThan(0);
    expect(ofRule(result, HIDE)).toEqual(ofRule(builtIn, HIDE));
    expect(groupOf(result, HIDE)!.rule).toEqual(groupOf(builtIn, HIDE)!.rule);
    expect(groupOf(result, HIDE)!.rule).not.toHaveProperty("custom");
    expect(result.summary.rulesRun).toBe(builtIn.summary.rulesRun + 1);
    expect(result.summary.customRules).toEqual([
      {
        file: "rules/team.json",
        rules: [HIDE, "TEAM_FORMATTED"],
        asBuiltIn: [HIDE],
        replaced: [],
        notRun: [],
      },
    ]);
  });

  it("counts a copy of an older published version as unchanged", async () => {
    const scope = "CalculatedColumn,CalculatedTableColumn,DataColumn";
    const older = "IsHidden == false and UsedInRelationships.Any()";
    const upstream = [older, String(copyOf(HIDE).Expression)].map((e) => ({
      id: HIDE,
      scope,
      hash: fingerprint(e),
      severity: 2,
    }));
    const read = (expression: string) =>
      readCustomRules(
        [
          {
            path: "rules/team.json",
            text: JSON.stringify([copyOf(HIDE, { Expression: expression })]),
          },
        ],
        upstream,
      );
    const old = await run(read(older));
    expect(old.summary.customRules?.[0]).toMatchObject({ asBuiltIn: [HIDE], replaced: [] });
    expect(ofRule(old, HIDE)).toEqual(ofRule(await builtInRun(), HIDE));
    const neither = await run(read("IsHidden == false"));
    expect(neither.summary.customRules?.[0]).toMatchObject({ asBuiltIn: [], replaced: [HIDE] });
  });

  it("gives pbiplint's rule the copy's severity when the team changed it, unless the config sets one", async () => {
    // Microsoft publishes HIDE_FOREIGN_KEYS at severity 2, a warning.
    const raised = await run(set(copyOf(HIDE, { Severity: 3 })));
    expect(groupOf(raised, HIDE)!.rule).toMatchObject({ severity: 3, status: "ported" });
    expect(raised.summary.customRules?.[0]?.asBuiltIn).toEqual([HIDE]);
    expect(raised.failed).toBe(true);
    const config = await run(set(copyOf(HIDE, { Severity: 3 })), { rules: { [HIDE]: "info" } });
    expect(groupOf(config, HIDE)!.rule.severity).toBe(1);
    // 2.5 reads as a warning, as Microsoft's 2 does: the severity is unchanged.
    const same = await run(set(copyOf(HIDE, { Severity: 2.5 })));
    expect(groupOf(same, HIDE)!.rule.severity).toBe(2);
  });

  it("runs a copy with a changed scope as the team's rule, in place of pbiplint's", async () => {
    const copy = copyOf(HIDE, { Scope: "DataColumn" });
    const result = await run(set(copy));
    const builtIn = await builtInRun();
    expect(groupOf(result, HIDE)!.rule).toMatchObject({ status: "custom", custom: true });
    expect(result.summary.rulesRun).toBe(builtIn.summary.rulesRun);
    expect(result.summary.customRules?.[0]).toMatchObject({ asBuiltIn: [], replaced: [HIDE] });
  });

  it("runs an edited copy under its id as the team's rule, and pbiplint's rule not at all", async () => {
    const description = "Our own rule: a visible column needs a description.";
    const copy = copyOf(HIDE, {
      ID: "hide_foreign_keys",
      Expression: "IsHidden == false and string.IsNullOrWhitespace(Description)",
      Description: description,
    });
    const result = await run(set(copy));
    const found = ofRule(result, "hide_foreign_keys");
    expect(found.length).toBeGreaterThan(ofRule(await builtInRun(), HIDE).length);
    for (const f of found) expect(f).not.toHaveProperty("detail");
    expect(ofRule(result, HIDE)).toEqual([]);
    expect(result.groups.filter((g) => g.rule.id.toUpperCase() === HIDE)).toHaveLength(1);
    expect(groupOf(result, "hide_foreign_keys")!.rule).toMatchObject({
      status: "custom",
      custom: true,
      ruleFile: "rules/team.json",
      description,
      url: CUSTOM_RULES_URL,
    });
    const sarif = JSON.parse(formatSarif(result)).runs[0].tool.driver.rules as {
      id: string;
      helpUri?: string;
      help?: { text: string };
    }[];
    const descriptor = sarif.find((r) => r.id.toUpperCase() === HIDE)!;
    expect(descriptor.id).toBe("hide_foreign_keys");
    expect(descriptor).not.toHaveProperty("helpUri");
    expect(descriptor.help?.text).toBe(description);
    expect(result.summary.customRules?.[0]).toMatchObject({
      asBuiltIn: [],
      replaced: ["hide_foreign_keys"],
    });
  });

  it("counts an unchanged copy held by two files once", async () => {
    const copy = copyOf(HIDE);
    const custom = readCustomRules([
      { path: "rules/team.json", text: JSON.stringify([copy]) },
      { path: "rules/more.json", text: JSON.stringify([copy]) },
    ]);
    const result = await run(custom);
    const builtIn = await builtInRun();
    expect(ofRule(result, HIDE)).toEqual(ofRule(builtIn, HIDE));
    expect(result.summary.rulesRun).toBe(builtIn.summary.rulesRun);
    expect(result.summary.customRules?.map((f) => f.asBuiltIn)).toEqual([[HIDE], [HIDE]]);
    expect(noticesOf(result).map((d) => d.path)).toEqual(["rules/team.json", "rules/more.json"]);
  });

  it("says in one notice per file how many rules pbiplint runs as its own and which it replaces", async () => {
    const custom = readCustomRules([
      {
        path: "rules/team.json",
        text: JSON.stringify([
          copyOf(HIDE),
          copyOf("PROVIDE_FORMAT_STRING_FOR_MEASURES"),
          copyOf("DAX_COLUMNS_FULLY_QUALIFIED", { Expression: "true" }),
          TEAM_FORMATTED,
        ]),
      },
      { path: "rules/more.json", text: JSON.stringify([TEAM_VISIBLE]) },
    ]);
    const result = await run(custom);
    expect(noticesOf(result)).toEqual([
      {
        kind: "custom-rules",
        path: "rules/team.json",
        message:
          "rules/team.json holds 4 rules: pbiplint runs 2 as its own, since they match a published version of those rules; 2 run as your team's, 1 of them in place of pbiplint's rule with the same ID (DAX_COLUMNS_FULLY_QUALIFIED).",
      },
    ]);
    expect(result.summary.customRules).toEqual([
      {
        file: "rules/team.json",
        rules: [
          HIDE,
          "PROVIDE_FORMAT_STRING_FOR_MEASURES",
          "DAX_COLUMNS_FULLY_QUALIFIED",
          "TEAM_FORMATTED",
        ],
        asBuiltIn: [HIDE, "PROVIDE_FORMAT_STRING_FOR_MEASURES"],
        replaced: ["DAX_COLUMNS_FULLY_QUALIFIED"],
        notRun: [],
      },
      {
        file: "rules/more.json",
        rules: ["TEAM_VISIBLE"],
        asBuiltIn: [],
        replaced: [],
        notRun: ["TEAM_VISIBLE"],
      },
    ]);
    const one = await run(set(copyOf(HIDE)));
    expect(noticesOf(one).map((d) => d.message)).toEqual([
      "rules/team.json holds 1 rule: pbiplint runs 1 as its own, since it matches a published version of that rule.",
    ]);
  });

  it("runs pbiplint's rule in place of a copy it could not read, and says why in the file's notice", async () => {
    // The survey holds one: a report-scope rule with a built-in id. No published version matches a
    // rule the reader could not read, and still it never switches off pbiplint's rule.
    const REPORT = "The rule's Scope names a report object (Visual).";
    for (const copy of [
      copyOf(HIDE, { ID: "hide_foreign_keys", Scope: "Visual" }),
      copyOf(HIDE, { Scope: undefined }),
      copyOf(HIDE, { Expression: undefined }),
    ]) {
      const result = await run(set(copy, TEAM_FORMATTED));
      const builtIn = await builtInRun();
      expect(failures(result)).toEqual([]);
      expect(ofRule(result, HIDE)).toEqual(ofRule(builtIn, HIDE));
      expect(groupOf(result, HIDE)!.rule).toEqual(groupOf(builtIn, HIDE)!.rule);
      expect(result.summary.rulesRun).toBe(builtIn.summary.rulesRun + 1);
      expect(result.summary.ruleErrors).toEqual([]);
      expect(result.summary.customRules).toEqual([
        {
          file: "rules/team.json",
          // The reader lists the rules it could not read after the ones it read.
          rules: ["TEAM_FORMATTED", String(copy.ID)],
          asBuiltIn: [String(copy.ID)],
          replaced: [],
          notRun: [],
        },
      ]);
      const [notice, ...more] = noticesOf(result);
      expect(more).toEqual([]);
      expect(notice!.path).toBe("rules/team.json");
      expect(notice!.message).toMatch(
        new RegExp(
          `^rules/team\\.json holds 2 rules: pbiplint could not read 1, so its own rule with the same ID \\(${String(copy.ID)}\\) runs in its place; 1 runs as your team's\\. ${String(copy.ID)}: The rule`,
        ),
      );
    }
    const report = await run(set(copyOf(HIDE, { ID: "hide_foreign_keys", Scope: "Visual" })));
    expect(noticesOf(report).map((d) => d.message)).toEqual([
      `rules/team.json holds 1 rule: pbiplint could not read 1, so its own rule with the same ID (hide_foreign_keys) runs in its place. hide_foreign_keys: ${REPORT} Tabular Editor's rules check the semantic model; report rules use fab-inspector's format.`,
    ]);
    // With a published copy beside it, the notice says both.
    const both = await run(
      set(copyOf(HIDE, { Scope: "Visual" }), copyOf("PROVIDE_FORMAT_STRING_FOR_MEASURES")),
    );
    expect(noticesOf(both).map((d) => d.message)).toEqual([
      `rules/team.json holds 2 rules: pbiplint runs 1 as its own, since it matches a published version of that rule; pbiplint could not read 1, so its own rule with the same ID (HIDE_FOREIGN_KEYS) runs in its place. HIDE_FOREIGN_KEYS: ${REPORT} Tabular Editor's rules check the semantic model; report rules use fab-inspector's format.`,
    ]);
    expect(both.summary.customRules?.[0]?.asBuiltIn).toEqual([
      "PROVIDE_FORMAT_STRING_FOR_MEASURES",
      HIDE,
    ]);
  });

  it("keeps today's handling for a copy it could not read with a safety net's id, and for one that fails while it runs", async () => {
    const reserved = await run(
      set(rule({ ID: "PARSE_ISSUE", Scope: undefined, Expression: "true" })),
    );
    const [failure, ...more] = failures(reserved);
    expect(more).toEqual([]);
    expect(failure!.detail).toMatch(
      /^PARSE_ISSUE could not finish on the model: rules\/team\.json: The rule has no Scope/,
    );
    expect(reserved.summary.customRules?.[0]).toMatchObject({
      asBuiltIn: [],
      notRun: ["PARSE_ISSUE"],
    });
    // Read fine, it fails on the model: an edited copy, which runs in place of pbiplint's rule.
    const fails = await run(set(copyOf(HIDE, { Scope: "Measure", Expression: "Visible" })));
    expect(ofRule(fails, HIDE)).toEqual([]);
    expect(failures(fails)).toHaveLength(1);
    expect(fails.summary.customRules?.[0]).toMatchObject({
      asBuiltIn: [],
      replaced: [HIDE],
      notRun: [HIDE],
    });
  });

  it("leaves out of asBuiltIn, replaced, and the notice an id whose pbiplint rule the config turns off", async () => {
    // Neither rule runs: the config's off covers the id, and nothing runs in its place.
    for (const copy of [copyOf(HIDE), copyOf(HIDE, { Expression: "true" })]) {
      const result = await run(set(copy, TEAM_FORMATTED), { rules: { hide_foreign_keys: "off" } });
      expect(ofRule(result, HIDE)).toEqual([]);
      expect(result.summary.rulesSkipped).toContainEqual({ id: HIDE, reason: "disabled" });
      expect(result.summary.customRules).toEqual([
        {
          file: "rules/team.json",
          rules: [HIDE, "TEAM_FORMATTED"],
          asBuiltIn: [],
          replaced: [],
          notRun: [],
        },
      ]);
      expect(noticesOf(result)).toEqual([]);
    }
    // Another built-in id in the same file still takes its place, and is still named.
    const other = copyOf("DAX_COLUMNS_FULLY_QUALIFIED", { Expression: "true" });
    const mixed = await run(set(copyOf(HIDE), other), { rules: { HIDE_FOREIGN_KEYS: "off" } });
    expect(mixed.summary.customRules?.[0]).toMatchObject({
      asBuiltIn: [],
      replaced: ["DAX_COLUMNS_FULLY_QUALIFIED"],
    });
    expect(noticesOf(mixed).map((d) => d.message)).toEqual([
      "rules/team.json holds 2 rules: 1 runs as your team's, in place of pbiplint's rule with the same ID (DAX_COLUMNS_FULLY_QUALIFIED).",
    ]);
  });
});
