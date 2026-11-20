import { describe, expect, it } from "vitest";
import { fingerprint as coreFingerprint } from "../../packages/core/src/custom-rules/te/fingerprint.ts";
import { readTeRuleFile } from "../../packages/core/src/custom-rules/te/read.ts";
import { fingerprint, fingerprintVersions, readRules } from "../fingerprint-upstream-rules.mjs";

describe("fingerprint", () => {
  it("agrees with core's", () => {
    for (const s of [
      "",
      "a",
      "foobar",
      'Name.Contains("Total")\r\n\tand  IsHidden',
      "Größe\u00a0日付\u2003a😀b",
      "a\u200bb\u0085c\u000bd",
    ])
      expect(fingerprint(s), JSON.stringify(s)).toBe(coreFingerprint(s));
  });
});

describe("readRules", () => {
  it("reads a rule list, a rules wrapper, and a file of one rule", () => {
    const one = { ID: "A", Scope: "Model", Expression: "true" };
    for (const text of [
      JSON.stringify([one]),
      JSON.stringify({ rules: [one] }),
      JSON.stringify(one),
    ])
      expect(readRules(text, readTeRuleFile).map((r) => r.id)).toEqual(["A"]);
    expect(readRules("not json", readTeRuleFile)).toEqual([]);
  });
});

describe("fingerprintVersions", () => {
  const ids = new Map([
    ["DAX_TODO", "DAX_TODO"],
    ["META_AVOID_FLOAT", "META_AVOID_FLOAT"],
  ]);
  const v1 = JSON.stringify([
    {
      ID: "dax_todo",
      Scope: "Measure, CalculatedColumn",
      Severity: 1,
      Expression: 'Expression.Contains("TODO")',
    },
    { ID: "META_AVOID_FLOAT", Scope: "DataColumn", Expression: 'DataType = "Double"' },
    { ID: "TEAM_ONLY", Scope: "Model", Severity: 3, Expression: "true" },
    { ID: "META_AVOID_FLOAT", Expression: "no scope, so the reader cannot read it" },
  ]);
  // The next version reflows one rule (same fingerprint) and raises its severity.
  const v2 = `\uFEFF// a comment\n${JSON.stringify([
    {
      ID: "DAX_TODO",
      Scope: "CalculatedColumn,Measure",
      Severity: 1,
      Expression: 'Expression.Contains( "TODO" )',
    },
    { ID: "META_AVOID_FLOAT", Scope: "DataColumn", Severity: 2, Expression: 'DataType = "Double"' },
  ])}`;

  it("keeps the built-in ids, one entry per distinct version, sorted", () => {
    const entries = fingerprintVersions([{ text: v1 }, { text: v2 }], ids, readTeRuleFile);
    expect(entries).toEqual([
      {
        id: "DAX_TODO",
        scope: "CalculatedColumn,Measure",
        hash: fingerprint('Expression.Contains("TODO")'),
        severity: 1,
      },
      {
        id: "META_AVOID_FLOAT",
        scope: "DataColumn",
        hash: fingerprint('DataType="Double"'),
        severity: 1,
      },
      {
        id: "META_AVOID_FLOAT",
        scope: "DataColumn",
        hash: fingerprint('DataType="Double"'),
        severity: 2,
      },
    ]);
    for (const e of entries)
      expect(Object.keys(e).sort()).toEqual(["hash", "id", "scope", "severity"]);
  });
});
