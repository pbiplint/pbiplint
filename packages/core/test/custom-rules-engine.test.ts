import { beforeEach, describe, expect, it, vi } from "vitest";
import { readCustomRules } from "@pbiplint/core/custom-rules";
import { buildTomView } from "../src/custom-rules/te/view.js";
import { resolveConfig, type PbiplintConfig } from "../src/engine/config.js";
import type { CustomRuleSet } from "../src/engine/custom.js";
import { lint, type LintFile, type LintResult } from "../src/engine/lint.js";
import { showOnly } from "../src/engine/show-only.js";
import {
  isFailureOf,
  isFindingFor,
  RULE_COULD_NOT_FINISH,
} from "../src/rules/rule-could-not-finish.js";
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

  it("runs pbiplint's own rule for a custom id that is a built-in id, and says so", async () => {
    const copy = rule({ ID: "hide_foreign_keys", Scope: "Column", Expression: "true" });
    const result = await run(set(copy, TEAM_FORMATTED));
    const builtIn = await run(undefined);
    expect(ofRule(result, "HIDE_FOREIGN_KEYS")).toEqual(ofRule(builtIn, "HIDE_FOREIGN_KEYS"));
    expect(ofRule(result, "hide_foreign_keys")).toEqual([]);
    expect(result.summary.rulesRun).toBe(builtIn.summary.rulesRun + 1);
    expect(result.summary.customRules).toEqual([
      {
        file: "rules/team.json",
        rules: ["hide_foreign_keys", "TEAM_FORMATTED"],
        asBuiltIn: ["hide_foreign_keys"],
        replaced: [],
        notRun: [],
      },
    ]);
    const notice = result.diagnostics.filter((d) => d.kind === "custom-rules");
    expect(notice).toHaveLength(1);
    expect(notice[0]).toMatchObject({ path: "rules/team.json" });
    expect(notice[0]!.message).toContain("hide_foreign_keys");
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
