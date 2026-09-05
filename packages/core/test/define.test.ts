import { describe, expect, it } from "vitest";
import { BPA_RULES } from "../src/rules/microsoft-bpa/bpa-rules.data.js";
import { bpaRule, liveModelRule, mapScope } from "../src/rules/microsoft-bpa/define.js";

describe("vendored ruleset", () => {
  it("has all 71 Microsoft rules with unique ids", () => {
    expect(BPA_RULES.length).toBe(71);
    expect(new Set(BPA_RULES.map((r) => r.id)).size).toBe(71);
    expect(BPA_RULES.some((r) => r.expression.includes("\r"))).toBe(false);
  });
});

describe("mapScope", () => {
  it("maps Microsoft scope names to object types and drops KPI", () => {
    expect(mapScope("DataColumn, CalculatedColumn, CalculatedTableColumn")).toEqual([
      "Column",
      "CalculatedColumn",
      "CalculatedTableColumn",
    ]);
    expect(mapScope("Measure, KPI, TablePermission, CalculationItem")).toEqual([
      "Measure",
      "TablePermission",
      "CalculationItem",
    ]);
    expect(mapScope("ProviderDataSource, StructuredDataSource")).toEqual(["DataSource"]);
    expect(mapScope("CalculationGroup, ModelRole")).toEqual(["CalculationGroupTable", "Role"]);
    expect(() => mapScope("Widget")).toThrow(/Widget/);
  });
});

describe("bpaRule", () => {
  it("fills metadata from the ruleset and strips the category prefix from the name", () => {
    const r = bpaRule("HIDE_FOREIGN_KEYS", () => []);
    expect(r).toMatchObject({
      id: "HIDE_FOREIGN_KEYS",
      name: "Hide foreign keys",
      category: "Formatting",
      severity: 2,
      status: "ported",
      fixExpression: "IsHidden = true",
    });
    expect(r.scope).toEqual(["Column", "CalculatedColumn", "CalculatedTableColumn"]);
    expect(r.description).toBe("Foreign keys should always be hidden.");
  });
  it("extracts reference URLs from the description", () => {
    const r = bpaRule("ISAVAILABLEINMDX_FALSE_NONATTRIBUTE_COLUMNS", () => []);
    expect(r.references).toEqual([
      "https://blog.crossjoin.co.uk/2018/07/02/isavailableinmdx-ssas-tabular/",
    ]);
  });
  it("rejects unknown ids", () => {
    expect(() => bpaRule("NOPE", () => [])).toThrow(/NOPE/);
  });
  it("declares live-model rules that never run", () => {
    const r = liveModelRule("SPLIT_DATE_AND_TIME");
    expect(r.status).toBe("needsLiveModel");
    expect(r.check({} as never, {} as never)).toEqual([]);
  });
});
