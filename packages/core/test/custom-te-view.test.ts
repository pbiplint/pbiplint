import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  PROPERTIES,
  TE_SCOPES,
  TOM_TYPES,
  UNKNOWN_PROPERTIES,
  UNSET,
  buildTomView,
  getAnnotation,
  hasAnnotation,
  nearestProperty,
  unknownReason,
  type TeMap,
  type TeType,
  type TomObject,
  type TomType,
  type TomView,
} from "../src/custom-rules/te/view.js";
import { buildModel } from "../src/model/build.js";
import type { Model } from "../src/model/types.js";
import { parseModelDir } from "./helpers.js";

const repo = new URL("../../../", import.meta.url).pathname;
const modelAt = (path: string): Model => buildModel(parseModelDir(`${repo}${path}`));
const viewOf = (fixture: string): TomView =>
  buildTomView(modelAt(`tests/fixtures/${fixture}.SemanticModel`));

const names = (objects: readonly TomObject[]): string[] => objects.map((o) => o.teName).sort();

/** The object of a scope whose `teName` is `name`; fails the test when there is none. */
function find(view: TomView, scope: string, name: string): TomObject {
  const found = view.objectsOf(scope).find((o) => o.teName === name);
  if (!found) throw new Error(`no ${scope} named ${name}`);
  return found;
}

/** A property's value on an object, through PROPERTIES, as the evaluator reads it. */
function prop(view: TomView, o: TomObject, name: string): unknown {
  const spec = PROPERTIES[o.type][name];
  if (!spec) throw new Error(`${o.type} has no property ${name} in PROPERTIES`);
  return spec.get(o, view);
}

const teNameOf = (v: unknown): string | null => (v === null ? null : (v as TomObject).teName);
const teNamesOf = (v: unknown): string[] => (v as TomObject[]).map((o) => o.teName);
const mapGet = (v: unknown, key: string): unknown => {
  const hit = (v as TeMap).lookup(key);
  return hit.found ? hit.value : "<missing>";
};

interface ProbeCapture {
  results: Record<
    string,
    { findings?: Record<string, string[]>; ruleErrors?: Record<string, string>; error?: string }
  >;
}
const probeCapture = (fixture: string): ProbeCapture =>
  JSON.parse(
    readFileSync(`${repo}tests/expectations/custom-rules/probes/${fixture}.json`, "utf8"),
  ) as ProbeCapture;

describe("scopes match what Tabular Editor CLI 0.8.1.1 listed (PROBE_SCOPE_* rules)", () => {
  for (const fixture of ["custom-rules", "custom-rules-model-ignore"]) {
    const view = viewOf(fixture);
    const semantics = probeCapture(fixture).results["semantics.json"]!;
    for (const scope of TE_SCOPES) {
      const id = `PROBE_SCOPE_${scope.toUpperCase()}`;
      if (semantics.ruleErrors?.[id] !== undefined) continue; // the malformed annotation's error
      it(`${fixture}: ${scope}`, () => {
        // A rule of `true` with no findings ran on no objects of the scope.
        expect(names(view.objectsOf(scope))).toEqual([...(semantics.findings?.[id] ?? [])].sort());
      });
    }
  }

  it("covers every scope the rule file reader accepts, in any case", () => {
    expect(TE_SCOPES).toHaveLength(26);
    const view = viewOf("custom-rules");
    expect(names(view.objectsOf("datacolumn"))).toEqual(names(view.objectsOf("DataColumn")));
    expect(view.objectsOf("Visual")).toEqual([]);
  });

  it("gives the TOM type each scope holds", () => {
    const view = viewOf("custom-rules");
    const typesOf = (scope: string) => [...new Set(view.objectsOf(scope).map((o) => o.type))];
    expect(typesOf("Table")).toEqual(["Table"]);
    expect(typesOf("CalculatedTable")).toEqual(["CalculatedTable"]);
    expect(typesOf("CalculationGroup")).toEqual(["CalculationGroupTable"]);
    expect(typesOf("Column").sort()).toEqual([
      "CalculatedColumn",
      "CalculatedTableColumn",
      "DataColumn",
    ]);
    expect(typesOf("KPI")).toEqual(["KPI"]);
  });

  it("te3-zoo: a calendar is quoted, a function bare, Column is every column", () => {
    const view = viewOf("te3-zoo");
    expect(names(view.objectsOf("Calendar"))).toEqual(["'Gregorian'"]);
    expect(names(view.objectsOf("UserDefinedFunction"))).toEqual(["Discount", "Pricing.WithTax"]);
    expect(view.objectsOf("UserDefinedFunction")[0]!.type).toBe("Function");
    expect(names(view.objectsOf("Column"))).toEqual(
      names([
        ...view.objectsOf("DataColumn"),
        ...view.objectsOf("CalculatedColumn"),
        ...view.objectsOf("CalculatedTableColumn"),
      ]),
    );
    expect(names(view.objectsOf("Culture"))).toEqual(["en-US", "fr-FR"]);
  });

  it("rule-zoo: a role member by its name", () => {
    expect(names(viewOf("rule-zoo").objectsOf("ModelRoleMember"))).toEqual(["admin@example.com"]);
  });

  it("data-sources: provider and structured data sources by name", () => {
    const view = viewOf("data-sources");
    expect(names(view.objectsOf("ProviderDataSource"))).toEqual(["Legacy SQL"]);
    expect(names(view.objectsOf("StructuredDataSource"))).toEqual(["SQL/localhost;Sales"]);
  });

  it("tvw-baseline: a date column's variations", () => {
    const view = viewOf("tvw-baseline");
    const variations = view.objectsOf("Variation");
    expect(variations.length).toBeGreaterThan(0);
    expect(new Set(variations.map((v) => v.teName))).toEqual(new Set(["Variation"]));
  });
});

describe("object names match the committed captures", () => {
  const FIXTURES = [
    "data-sources",
    "kitchen-sink",
    "m-zoo",
    "messy-sales",
    "rule-zoo",
    "te3-zoo",
    "tvw-baseline",
    "udf-sales",
    "untyped-columns",
  ];
  for (const name of FIXTURES) {
    it(`${name}: every object the Microsoft capture names is in the view`, () => {
      const capture = JSON.parse(
        readFileSync(`${repo}tests/expectations/${name}.json`, "utf8"),
      ) as { fixture: string; findings: Record<string, string[]> };
      const view = buildTomView(modelAt(capture.fixture));
      const all = new Set(TE_SCOPES.flatMap((s) => view.objectsOf(s).map((o) => o.teName)));
      const named = [...new Set(Object.values(capture.findings).flat())];
      expect(named.length).toBeGreaterThan(0);
      expect(named.filter((n) => !all.has(n))).toEqual([]);
    });

    it(`${name}: every object the survey and built-in captures name is in the view`, () => {
      const read = (dir: string) =>
        JSON.parse(readFileSync(`${repo}tests/expectations/${dir}/${name}.json`, "utf8")) as {
          fixture: string;
          findings?: Record<string, string[]>;
          results?: Record<string, { findings?: Record<string, string[]> } | null>;
        };
      for (const capture of [read("survey"), read("te3")]) {
        const view = buildTomView(modelAt(capture.fixture));
        const all = new Set(TE_SCOPES.flatMap((s) => view.objectsOf(s).map((o) => o.teName)));
        const named = new Set([
          ...Object.values(capture.findings ?? {}).flat(),
          ...Object.values(capture.results ?? {}).flatMap((r) =>
            Object.values(r?.findings ?? {}).flat(),
          ),
        ]);
        expect([...named].filter((n) => !all.has(n))).toEqual([]);
      }
    });
  }
});

describe("properties on known objects (custom-rules)", () => {
  const view = viewOf("custom-rules");

  it("Model", () => {
    const m = find(view, "Model", "Model");
    expect(prop(view, m, "Name")).toBe("Model");
    expect(prop(view, m, "Description")).toBe("");
    expect(teNamesOf(prop(view, m, "Tables"))).toHaveLength(6);
    expect(teNamesOf(prop(view, m, "Relationships"))).toHaveLength(4);
    expect(teNamesOf(prop(view, m, "AllMeasures"))).toHaveLength(12);
    expect(teNamesOf(prop(view, m, "AllColumns"))).toHaveLength(23);
    expect(teNamesOf(prop(view, m, "AllPartitions"))).toHaveLength(6);
    expect(teNamesOf(prop(view, m, "AllCalculationItems"))).toEqual(["Current", "Half"]);
    expect(teNamesOf(prop(view, m, "AllHierarchies"))).toEqual(["Geography"]);
    expect(teNamesOf(prop(view, m, "Roles"))).toEqual(["East"]);
    expect(teNamesOf(prop(view, m, "Perspectives"))).toEqual(["Sales View"]);
    expect(teNamesOf(prop(view, m, "Cultures"))).toEqual(["en-US", "fr-FR"]);
    expect(teNamesOf(prop(view, m, "Expressions"))).toEqual(["Snowflake Products"]);
    expect(prop(view, m, "Culture")).toBe("en-US");
    expect(prop(view, m, "DefaultPowerBIDataSourceVersion")).toBe("PowerBI_V3");
    expect(prop(view, m, "ObjectType")).toBe("Model");
    expect(teNameOf(prop(view, m, "Model"))).toBe("Model");
  });

  it("Table", () => {
    const t = find(view, "Table", "'Customers'");
    expect(prop(view, t, "Name")).toBe("Customers");
    expect(prop(view, t, "IsHidden")).toBe(false);
    expect(prop(view, t, "IsVisible")).toBe(true);
    expect(prop(view, t, "DataCategory")).toBe("");
    expect(prop(view, t, "ObjectTypeName")).toBe("Table");
    expect(prop(view, t, "DaxObjectName")).toBe("'Customers'");
    expect(prop(view, t, "DaxObjectFullName")).toBe("'Customers'");
    expect(teNamesOf(prop(view, t, "Columns"))).toHaveLength(4);
    expect(teNamesOf(prop(view, t, "Hierarchies"))).toEqual(["Geography"]);
    expect(teNamesOf(prop(view, t, "Partitions"))).toEqual(["Customers"]);
    expect(teNamesOf(prop(view, t, "UsedInRelationships"))).toHaveLength(3);
    expect(mapGet(prop(view, t, "InPerspective"), "Sales View")).toBe(true);
    expect(
      mapGet(prop(view, find(view, "Table", "'Products'"), "InPerspective"), "Sales View"),
    ).toBe(false);
    expect(mapGet(prop(view, t, "RowLevelSecurity"), "East")).toBe(`'Customers'[Region] = "East"`);
    expect(mapGet(prop(view, find(view, "Table", "'Orders'"), "RowLevelSecurity"), "East")).toBe(
      "",
    );
    expect(mapGet(prop(view, t, "ObjectLevelSecurity"), "East")).toBe("Default");
    expect(getAnnotation(t, "BestPracticeAnalyzer_IgnoreRules")).toBe(
      `{"RuleIDs":["probe_ignore_custom_lower"]}`,
    );
    expect(hasAnnotation(t, "BestPracticeAnalyzer_IgnoreRules")).toBe(true);
    expect(getAnnotation(t, "Missing")).toBeNull();
    expect(hasAnnotation(t, "Missing")).toBe(false);
    const orders = find(view, "Table", "'Orders'");
    expect(mapGet(prop(view, orders, "TranslatedNames"), "fr-FR")).toBe("Commandes");
    expect(mapGet(prop(view, orders, "TranslatedNames"), "en-US")).toBe("");
    expect(teNamesOf(prop(view, find(view, "Table", "'Notes'"), "ReferencedBy"))).toEqual([
      "[Note Count]",
    ]);
  });

  it("CalculatedTable and CalculationGroupTable", () => {
    const t = find(view, "CalculatedTable", "'Targets'");
    expect(prop(view, t, "ObjectTypeName")).toBe("Calculated Table");
    expect(prop(view, t, "Expression")).toContain("DATATABLE(");
    const g = find(view, "CalculationGroup", "'Time Intelligence'");
    expect(g.type).toBe("CalculationGroupTable");
    expect(teNamesOf(prop(view, g, "CalculationItems"))).toEqual(["Current", "Half"]);
    expect(prop(view, g, "CalculationGroupPrecedence")).toBe(1);
    const group = prop(view, g, "CalculationGroup") as TomObject;
    expect(prop(view, group, "Precedence")).toBe(1);
    // Tabular Editor has no `Precedence` on the table itself, nor `CalculationItems` on a Table.
    expect(PROPERTIES.CalculationGroupTable["Precedence"]).toBeUndefined();
    expect(PROPERTIES.Table["CalculationItems"]).toBeUndefined();
  });

  it("columns", () => {
    const amount = find(view, "DataColumn", "'Orders'[Amount]");
    expect(prop(view, amount, "DataType")).toBe("Decimal");
    expect(prop(view, amount, "SummarizeBy")).toBe("Sum");
    expect(prop(view, amount, "SourceColumn")).toBe("Amount");
    expect(prop(view, amount, "FormatString")).toBe("#,0.00");
    expect(prop(view, amount, "DisplayFolder")).toBe("");
    expect(prop(view, amount, "IsKey")).toBe(false);
    expect(prop(view, amount, "IsAvailableInMDX")).toBe(true);
    expect(prop(view, amount, "Type")).toBe("Data");
    expect(prop(view, amount, "ObjectType")).toBe("Column");
    expect(prop(view, amount, "DaxObjectName")).toBe("[Amount]");
    expect(prop(view, amount, "DaxObjectFullName")).toBe("'Orders'[Amount]");
    expect(teNameOf(prop(view, amount, "Table"))).toBe("'Orders'");
    expect(teNameOf(prop(view, amount, "SortByColumn"))).toBeNull();
    expect(teNamesOf(prop(view, amount, "ReferencedBy")).sort()).toEqual([
      "'Orders'[Amount Band]",
      "'Orders'[Net Amount]",
      "[Total Amount]",
    ]);
    const all = prop(view, amount, "ReferencedBy") as TomObject[];
    const refs = PROPERTIES.DataColumn["ReferencedBy"]!.type;
    expect(refs.kind).toBe("collection");
    if (refs.kind !== "collection") return;
    // Measures that reference [Total Amount] reference [Amount] through it.
    expect(teNamesOf(refs.members!["AllMeasures"]!.get(all, view)).sort()).toContain(
      "[Amount per Unit]",
    );
    expect(teNamesOf(refs.members!["Measures"]!.get(all, view))).toEqual(["[Total Amount]"]);

    const key = find(view, "DataColumn", "'Customers'[Customer Key]");
    expect(prop(view, key, "IsKey")).toBe(true);
    expect(prop(view, key, "IsHidden")).toBe(true);
    expect(teNamesOf(prop(view, key, "UsedInRelationships"))).toHaveLength(3);
    const region = find(view, "DataColumn", "'Customers'[Region]");
    expect(teNamesOf(prop(view, region, "UsedInHierarchies"))).toEqual(["Geography"]);
    expect(teNamesOf(prop(view, region, "UsedInSortBy"))).toEqual([]);
    const customerName = find(view, "DataColumn", "'Customers'[Customer Name]");
    expect(mapGet(prop(view, customerName, "TranslatedNames"), "fr-FR")).toBe("Nom du client");
    expect(mapGet(prop(view, customerName, "InPerspective"), "Sales View")).toBe(true);
    expect(mapGet(prop(view, region, "InPerspective"), "Sales View")).toBe(false);

    const net = find(view, "CalculatedColumn", "'Orders'[Net Amount]");
    expect(prop(view, net, "DataType")).toBe("Decimal");
    expect(prop(view, net, "Expression")).toBe("Orders[Amount] - Orders[Discount]");
    expect(prop(view, net, "Type")).toBe("Calculated");
    expect(prop(view, net, "ObjectTypeName")).toBe("Calculated Column");
    const target = find(view, "CalculatedTableColumn", "'Targets'[Target]");
    expect(prop(view, target, "Type")).toBe("CalculatedTableColumn");
    expect(prop(view, target, "SourceColumn")).toBe("[Target]");
    // A data column has no expression, as Tabular Editor's DataColumn has none.
    expect(PROPERTIES.DataColumn["Expression"]).toBeUndefined();
  });

  it("an untyped calculated column's DataType is UNSET, never guessed", () => {
    const band = find(view, "CalculatedColumn", "'Orders'[Amount Band]");
    expect(prop(view, band, "DataType")).toBe(UNSET);
    const untyped = viewOf("untyped-columns");
    const unset = untyped
      .objectsOf("CalculatedColumn")
      .filter((c) => prop(untyped, c, "DataType") === UNSET);
    expect(unset.length).toBeGreaterThan(0);
  });

  it("Measure and KPI", () => {
    const total = find(view, "Measure", "[Total Amount]");
    expect(prop(view, total, "Expression")).toBe("SUM(Orders[Amount])");
    expect(prop(view, total, "FormatString")).toBe("#,0.00");
    expect(prop(view, total, "FormatStringExpression")).toBe("");
    expect(prop(view, total, "IsHidden")).toBe(false);
    expect(prop(view, total, "IsVisible")).toBe(true);
    expect(prop(view, total, "Description")).toBe("");
    expect(prop(view, total, "DisplayFolder")).toBe("");
    expect(prop(view, total, "DataType")).toBe(UNSET);
    expect(prop(view, total, "DaxObjectName")).toBe("[Total Amount]");
    expect(prop(view, total, "DaxTableName")).toBe("'Orders'");
    expect(teNameOf(prop(view, total, "Table"))).toBe("'Orders'");
    expect(teNameOf(prop(view, total, "KPI"))).toBe("[Total Amount].KPI");
    expect(teNameOf(prop(view, find(view, "Measure", "[Abc]"), "KPI"))).toBeNull();
    expect(teNamesOf(prop(view, total, "ReferencedBy")).sort()).toEqual([
      "[Amount per Order]",
      "[Amount per Unit]",
      "[Block Comment Amount]",
      "[Commented Amount]",
      "[Half Amount]",
      "[Safe Ratio]",
      "[Tenth Amount]",
      "[Total Amount].KPI",
    ]);
    const deps = prop(view, total, "DependsOn") as TomObject[];
    expect(deps).toHaveLength(1);
    const key = prop(view, deps[0]!, "Key") as TomObject;
    expect(key.teName).toBe("'Orders'[Amount]");
    expect(prop(view, key, "ObjectType")).toBe("Column");
    const refs = prop(view, deps[0]!, "Value") as TomObject[];
    expect(refs.map((r) => prop(view, r, "FullyQualified"))).toEqual([true]);

    const perUnit = find(view, "Measure", "[Amount per Unit]");
    const perUnitDeps = prop(view, perUnit, "DependsOn") as TomObject[];
    expect(perUnitDeps.map((d) => teNameOf(prop(view, d, "Key"))).sort()).toEqual([
      "[Total Amount]",
      "[Total Quantity]",
    ]);
    expect(
      perUnitDeps.flatMap((d) =>
        (prop(view, d, "Value") as TomObject[]).map((r) => prop(view, r, "FullyQualified")),
      ),
    ).toEqual([false, false]);

    const kpi = find(view, "KPI", "[Total Amount].KPI");
    expect(prop(view, kpi, "TargetExpression")).toBe("1000");
    expect(prop(view, kpi, "StatusExpression")).toBe("IF([Total Amount] > 1000, 1, -1)");
    expect(prop(view, kpi, "TrendExpression")).toBe("");
    expect(teNameOf(prop(view, kpi, "Measure"))).toBe("[Total Amount]");
  });

  it("Partition", () => {
    const orders = find(view, "Partition", "Orders");
    expect(prop(view, orders, "SourceType")).toBe("M");
    expect(prop(view, orders, "Mode")).toBe("Import");
    expect(prop(view, orders, "Expression")).toContain("Snowflake.Databases");
    expect(prop(view, orders, "Query")).toBe(prop(view, orders, "Expression"));
    expect(teNameOf(prop(view, orders, "Table"))).toBe("'Orders'");
    expect(teNameOf(prop(view, orders, "DataSource"))).toBeNull();
    expect(prop(view, find(view, "Partition", "Targets"), "SourceType")).toBe("Calculated");
    const group = find(view, "Partition", "Time Intelligence");
    expect(prop(view, group, "SourceType")).toBe("CalculationGroup");
    // No expression at all: Tabular Editor's pattern match on it fails, as on a null.
    expect(prop(view, group, "Expression")).toBeNull();
  });

  it("Relationship", () => {
    const r = find(
      view,
      "Relationship",
      "'Orders'[Ship Customer Key] ∞←1 'Customers'[Customer Key]",
    );
    expect(prop(view, r, "Name")).toBe("7c1e0b20-0000-4000-8000-000000000003");
    expect(prop(view, r, "IsActive")).toBe(false);
    expect(prop(view, r, "CrossFilteringBehavior")).toBe("OneDirection");
    expect(prop(view, r, "SecurityFilteringBehavior")).toBe("OneDirection");
    expect(prop(view, r, "FromCardinality")).toBe("Many");
    expect(prop(view, r, "ToCardinality")).toBe("One");
    expect(teNameOf(prop(view, r, "FromColumn"))).toBe("'Orders'[Ship Customer Key]");
    expect(teNameOf(prop(view, r, "ToColumn"))).toBe("'Customers'[Customer Key]");
    expect(teNameOf(prop(view, r, "FromTable"))).toBe("'Orders'");
    expect(teNameOf(prop(view, r, "ToTable"))).toBe("'Customers'");
  });

  it("hierarchy, level, calculation item, role, permission, perspective, culture, expression", () => {
    const h = find(view, "Hierarchy", "Geography");
    expect(teNamesOf(prop(view, h, "Levels"))).toEqual(["Region", "City"]);
    expect(prop(view, h, "IsHidden")).toBe(false);
    const level = find(view, "Level", "City");
    expect(teNameOf(prop(view, level, "Column"))).toBe("'Customers'[City]");
    expect(teNameOf(prop(view, level, "Hierarchy"))).toBe("Geography");
    expect(prop(view, level, "Ordinal")).toBe(1);

    const half = find(view, "CalculationItem", "Half");
    expect(prop(view, half, "Expression")).toBe("SELECTEDMEASURE() / 2");
    expect(teNameOf(prop(view, half, "CalculationGroup"))).toBe("'Time Intelligence'");

    const role = find(view, "ModelRole", "East");
    expect(prop(view, role, "ModelPermission")).toBe("Read");
    expect(teNamesOf(prop(view, role, "Members"))).toEqual([]);
    expect(teNamesOf(prop(view, role, "TablePermissions"))).toEqual(["Customers"]);
    const tp = find(view, "TablePermission", "Customers");
    expect(prop(view, tp, "Expression")).toBe(`'Customers'[Region] = "East"`);
    expect(prop(view, tp, "FilterExpression")).toBe(`'Customers'[Region] = "East"`);
    expect(teNameOf(prop(view, tp, "Role"))).toBe("East");
    expect(teNameOf(prop(view, tp, "Table"))).toBe("'Customers'");
    expect(prop(view, tp, "MetadataPermission")).toBe("Default");

    expect(prop(view, find(view, "Perspective", "Sales View"), "Name")).toBe("Sales View");
    expect(prop(view, find(view, "Culture", "fr-FR"), "Name")).toBe("fr-FR");
    const e = find(view, "NamedExpression", "Snowflake Products");
    expect(prop(view, e, "Expression")).toContain("Snowflake.Databases");
    expect(prop(view, e, "ObjectType")).toBe("Expression");
  });

  it("data sources, variations, calendars and functions on their fixtures", () => {
    const ds = viewOf("data-sources");
    const legacy = find(ds, "ProviderDataSource", "Legacy SQL");
    expect(prop(ds, legacy, "Type")).toBe("Provider");
    expect(teNamesOf(prop(ds, legacy, "UsedByPartitions"))).toHaveLength(1);
    const part = (prop(ds, legacy, "UsedByPartitions") as TomObject[])[0]!;
    expect(teNameOf(prop(ds, part, "DataSource"))).toBe("Legacy SQL");
    expect(prop(ds, part, "SourceType")).toBe("Query");

    const tvw = viewOf("tvw-baseline");
    const v = tvw.objectsOf("Variation")[0]!;
    expect(prop(tvw, v, "Name")).toBe("Variation");
    expect(teNameOf(prop(tvw, v, "DefaultHierarchy"))).toBe("Date Hierarchy");
    expect(teNameOf(prop(tvw, v, "Relationship"))).not.toBeNull();
    const column = prop(tvw, v, "Column") as TomObject;
    expect(teNamesOf(prop(tvw, column, "Variations"))).toEqual(["Variation"]);

    const zoo = viewOf("te3-zoo");
    const cal = find(zoo, "Calendar", "'Gregorian'");
    expect(teNameOf(prop(zoo, cal, "Table"))).toBe("'Date'");
    const f = find(zoo, "UserDefinedFunction", "Discount");
    expect(prop(zoo, f, "Expression")).toContain("price * ( 1 - pct )");
    expect(prop(zoo, f, "ObjectType")).toBe("Function");
  });
});

/** Whether a value is one the type describes. */
function conforms(value: unknown, type: TeType): boolean {
  if (value === UNSET) return true;
  switch (type.kind) {
    case "nullable":
      return value === null || conforms(value, type.of);
    case "string":
      return typeof value === "string";
    case "boolean":
      return typeof value === "boolean";
    case "int":
    case "long":
      return Number.isInteger(value);
    case "double":
    case "decimal":
      return typeof value === "number";
    case "enum":
      return typeof value === "string" && type.values.includes(value);
    case "object":
      return (
        value === null ||
        (typeof value === "object" &&
          "teName" in value &&
          (type.of === "any" || type.of.includes((value as TomObject).type)))
      );
    case "collection":
      return Array.isArray(value) && value.every((v) => conforms(v, type.of));
    case "map":
      return (value as TeMap).entries.every(
        ([k, v]) => typeof k === "string" && conforms(v, type.value),
      );
  }
}

describe("PROPERTIES", () => {
  it("has an entry for every TOM type", () => {
    for (const type of TOM_TYPES) expect(PROPERTIES[type]).toBeDefined();
  });

  for (const fixture of [
    "custom-rules",
    "te3-zoo",
    "kitchen-sink",
    "rule-zoo",
    "data-sources",
    "tvw-baseline",
  ]) {
    it(`${fixture}: every property reads on every object as its type says`, () => {
      const view = viewOf(fixture);
      const seen = new Set<TomObject>();
      const queue: TomObject[] = TE_SCOPES.flatMap((s) => view.objectsOf(s));
      const problems: string[] = [];
      while (queue.length > 0) {
        const o = queue.pop()!;
        if (seen.has(o)) continue;
        seen.add(o);
        for (const [name, spec] of Object.entries(PROPERTIES[o.type])) {
          const value = spec.get(o, view);
          if (!conforms(value, spec.type)) problems.push(`${o.type}.${name}`);
          // Reach the part objects (calculation groups, dependencies) through the properties.
          if (Array.isArray(value))
            queue.push(
              ...(value.filter((v) => v && typeof v === "object" && "teName" in v) as TomObject[]),
            );
          else if (value && typeof value === "object" && "teName" in value)
            queue.push(value as TomObject);
        }
      }
      expect(problems).toEqual([]);
    });
  }
});

describe("names pbiplint cannot answer", () => {
  it("the VertiPaq statistics annotations", () => {
    for (const name of [
      "Vertipaq_Cardinality",
      "Vertipaq_RowCount",
      "Vertipaq_RIViolationInvalidRows",
    ])
      expect(UNKNOWN_PROPERTIES[name]).toContain("needs statistics from a live model");
    expect(unknownReason("Vertipaq_TotalSize")).toContain("needs statistics from a live model");
    expect(unknownReason("BestPracticeAnalyzer_IgnoreRules")).toBeUndefined();
  });

  it("none of them is also a property", () => {
    for (const type of TOM_TYPES)
      for (const name of Object.keys(PROPERTIES[type]))
        expect(UNKNOWN_PROPERTIES[name], `${type}.${name}`).toBeUndefined();
  });
});

describe("nearestProperty", () => {
  it("Visible on a measure is IsHidden", () => {
    expect(nearestProperty("Measure", "Visible")).toBe("IsHidden");
  });

  it("a different case first, then a small misspelling", () => {
    expect(nearestProperty("DataColumn", "datatype")).toBe("DataType");
    expect(nearestProperty("Measure", "Expresion")).toBe("Expression");
    expect(nearestProperty("Table", "Partitons")).toBe("Partitions");
  });

  it("nothing when no name is close", () => {
    expect(nearestProperty("Measure", "Zzzzzzzz")).toBeUndefined();
    expect(nearestProperty("Measure", "Vertipaq_RowCount")).toBeUndefined();
  });

  it("answers for every type that has a name", () => {
    const named = (TOM_TYPES as readonly TomType[]).filter((t) => PROPERTIES[t]["Name"]);
    expect(named.length).toBeGreaterThan(20);
    for (const type of named) expect(nearestProperty(type, "name")).toBe("Name");
  });
});
