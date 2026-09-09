import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buildModel, splitQualifiedName } from "../src/model/build.js";
import { parseTmdl } from "../src/tmdl/parse.js";
import { fixturesDir, modelFrom } from "./helpers.js";

const specSample = readFileSync(fixturesDir + "spec-sample.tmdl", "utf8");

describe("splitQualifiedName", () => {
  it("splits quoted and unquoted table.column references", () => {
    expect(splitQualifiedName("Sales.'Product Key'")).toEqual({
      table: "Sales",
      column: "Product Key",
    });
    expect(splitQualifiedName("'Region Security'.Region")).toEqual({
      table: "Region Security",
      column: "Region",
    });
    expect(splitQualifiedName("Date.Date")).toEqual({ table: "Date", column: "Date" });
    expect(splitQualifiedName("'O''Brien'.'A.B'")).toEqual({ table: "O'Brien", column: "A.B" });
  });
});

describe("buildModel on the spec sample", () => {
  const model = buildModel([parseTmdl("spec-sample.tmdl", specSample)]);

  it("reads model name, properties, and root annotations", () => {
    expect(model.name).toBe("Model");
    expect(model.props.culture).toBe("en-US");
    expect(model.annotations.PBI_QueryOrder).toBe('["Sales"]');
  });

  it("merges partial table declarations by name and keeps descriptions", () => {
    expect(model.tables.map((t) => t.name)).toEqual(["Sales", "O'Brien"]);
    const sales = model.tables[0]!;
    expect(sales.description).toBe("Table Description");
    expect(sales.measures.map((m) => m.name)).toEqual([
      "Sales Amount",
      "Sales (ly)",
      "Measure1",
      "Partial Measure",
    ]);
    expect(model.tables[1]!.isHidden).toBe(true);
  });

  it("builds columns with kinds, flags, and sort-by", () => {
    const sales = model.tables[0]!;
    const byName = (n: string) => sales.columns.find((c) => c.name === n)!;
    expect(byName("Quantity")).toMatchObject({
      kind: "data",
      dataType: "int64",
      isHidden: true,
      isAvailableInMdx: false,
      summarizeBy: "None",
    });
    expect(byName("Net Price").sourceColumn).toBe("Net Price");
    expect(byName("Category").sortByColumn).toBe("Category Order");
    expect(byName("Margin %")).toMatchObject({
      kind: "calculated",
      expression: "DIVIDE([Sales Amount], 1)",
      dataType: "double",
    });
    expect(byName("Quantity").table).toBe(sales);
  });

  it("builds measures, partitions, hierarchies, and the calculation group", () => {
    const sales = model.tables[0]!;
    expect(sales.measures[0]).toMatchObject({
      formatString: "$ #,##0",
      displayFolder: ' My "Amazing" Measures',
      description: "This is the Measure Description\nOne more line",
    });
    expect(sales.partitions[0]).toMatchObject({
      name: "Sales-Partition",
      sourceType: "m",
      mode: "import",
    });
    expect(sales.partitions[0]!.source).toContain("Sql.Database(Server, Database)");
    expect(sales.hierarchies[0]!.levels).toEqual([
      expect.objectContaining({ name: "Category", column: "Category" }),
    ]);
    // The sample glues a calculationGroup block onto Sales, and a calculation group table is its
    // own object type (ground truth 1), so the m partition does not keep it a plain table.
    expect(sales.kind).toBe("calculationGroup");
    expect(sales.calculationGroup).toMatchObject({ name: "Sales", precedence: 1 });
    expect(sales.calculationGroup!.items.map((i) => i.name)).toEqual(["YTD", "Prior Year"]);
    expect(sales.calculationGroup!.items[1]!.formatStringDefinition).toBe('"0.0%"');
  });

  it("builds relationships with defaults, roles with table permissions, perspectives, expressions, cultures, functions", () => {
    expect(model.relationships[0]).toMatchObject({
      fromTable: "Sales",
      fromColumn: "Product Key",
      toTable: "Product",
      toColumn: "Product Key",
      isActive: true,
      crossFilteringBehavior: "onedirection",
      fromCardinality: "many",
      toCardinality: "one",
    });
    const role = model.roles[0]!;
    expect(role).toMatchObject({ name: "Role_Store1", modelPermission: "read" });
    expect(role.tablePermissions[0]).toMatchObject({
      table: "Store",
      filter: "'Store'[Store Code] IN {1,10,20,30}",
    });
    expect(role.tablePermissions[0]!.role).toBe(role);
    expect(role.members).toEqual([]);
    expect(model.perspectives[0]).toMatchObject({ name: "Product", tables: ["Product"] });
    expect(model.expressions.map((e) => e.name)).toEqual(["Server", "Database"]);
    expect(model.cultures[0]!.name).toBe("en-US");
    expect(model.functions[0]).toMatchObject({
      name: "Sales.Rate",
      expression: "(x: INT64) => x * 2",
    });
  });
});

describe("buildModel on hand-written constructs", () => {
  it("classifies calculated tables and their columns", () => {
    const m = modelFrom(
      "table Calc\n\tcolumn Date\n\t\tdataType: dateTime\n\t\tisNameInferred\n\t\tsourceColumn: [Date]\n\tcolumn Year = YEAR([Date])\n\t\tdataType: int64\n\tpartition Calc = calculated\n\t\tmode: import\n\t\tsource = CALENDARAUTO()\n",
    );
    const t = m.tables[0]!;
    expect(t.kind).toBe("calculated");
    expect(t.columns.map((c) => c.kind)).toEqual(["calculatedTable", "calculated"]);
    expect(t.partitions[0]).toMatchObject({ sourceType: "calculated", source: "CALENDARAUTO()" });
  });

  it("classifies calculation group tables", () => {
    const m = modelFrom(
      "table CG\n\tcalculationGroup\n\t\tprecedence: 2\n\tcolumn Name\n\t\tdataType: string\n\t\tsourceColumn: Name\n\tpartition CG = calculationGroup\n\t\tmode: import\n",
    );
    expect(m.tables[0]!.kind).toBe("calculationGroup");
    expect(m.tables[0]!.columns[0]!.kind).toBe("data");
    expect(m.tables[0]!.calculationGroup!.items).toEqual([]);
  });

  it("reads query partitions with a data source, and data sources with kinds", () => {
    const m = modelFrom(
      "model Model\n\ndataSource 'Legacy SQL' = provider\n\tconnectionString: x\n\ndataSource SQL/localhost;Sales\n\tconnectionDetails =\n\t\t\t{}\n\ntable Legacy\n\tpartition Legacy = query\n\t\tdataView: full\n\t\tsource\n\t\t\tquery = SELECT * FROM dbo.Legacy\n\t\t\tdataSource: 'Legacy SQL'\n",
    );
    expect(m.dataSources.map((d) => [d.name, d.kind])).toEqual([
      ["Legacy SQL", "provider"],
      ["SQL/localhost;Sales", "structured"],
    ]);
    expect(m.tables[0]!.partitions[0]).toMatchObject({
      sourceType: "query",
      source: "SELECT * FROM dbo.Legacy",
      dataSource: "Legacy SQL",
    });
  });

  it("reads role members, metadata permissions, and column permissions", () => {
    const m = modelFrom(
      "role Admins\n\tmodelPermission: administrator\n\tmember 'admin@example.com'\n\t\tidentityProvider: AzureAD\n\t\tmemberType: user\n\ttablePermission 'Sensitive Notes'\n\t\tmetadataPermission: none\n\ttablePermission Product\n\t\tcolumnPermission 'Cost Price' = none\n",
    );
    const role = m.roles[0]!;
    expect(role.members.map((x) => x.name)).toEqual(["admin@example.com"]);
    expect(role.tablePermissions[0]).toMatchObject({
      table: "Sensitive Notes",
      filter: undefined,
      metadataPermission: "none",
    });
    expect(role.tablePermissions[1]!.columnPermissions).toEqual([
      { column: "Cost Price", permission: "none" },
    ]);
  });

  it("reads variations, alternateOf, and relationship options", () => {
    const m = modelFrom(
      "table Customer\n\tcolumn 'Join Date'\n\t\tdataType: dateTime\n\t\tvariation Variation\n\t\t\tisDefault\n\t\t\trelationship: rel1\n\t\t\tdefaultHierarchy: LocalDateTable_x.'Date Hierarchy'\n\t\t\tdefaultColumn: LocalDateTable_x.Date\n\tcolumn Agg\n\t\tdataType: int64\n\t\talternateOf\n\t\t\tbaseTable: Sales\n\t\t\tsummarization: sum\n\nrelationship rel1\n\tisActive: false\n\tcrossFilteringBehavior: bothDirections\n\tfromCardinality: many\n\ttoCardinality: many\n\tfromColumn: Customer.'Join Date'\n\ttoColumn: LocalDateTable_x.Date\n",
    );
    const c = m.tables[0]!.columns[0]!;
    expect(c.variations).toEqual([
      {
        name: "Variation",
        relationship: "rel1",
        defaultHierarchy: "LocalDateTable_x.'Date Hierarchy'",
        defaultColumn: { table: "LocalDateTable_x", column: "Date" },
      },
    ]);
    expect(m.tables[0]!.columns[1]!.hasAlternateOf).toBe(true);
    expect(m.relationships[0]).toMatchObject({
      isActive: false,
      crossFilteringBehavior: "bothdirections",
      fromCardinality: "many",
      toCardinality: "many",
    });
  });

  it("keeps ignore annotations and source locations on objects", () => {
    const m = modelFrom(
      "table T\n\tannotation pbiplint.ignore = A, B\n\n\tcolumn C\n\t\tdataType: string\n\n\t\tannotation pbiplint.ignore = *\n",
    );
    expect(m.tables[0]!.annotations["pbiplint.ignore"]).toBe("A, B");
    expect(m.tables[0]!.columns[0]!.annotations["pbiplint.ignore"]).toBe("*");
    expect(m.tables[0]!.columns[0]!.location).toEqual({ file: "inline.tmdl", line: 4 });
  });

  it("synthesizes a model object when no model.tmdl is present", () => {
    const m = modelFrom("table T\n");
    expect(m.name).toBe("Model");
    expect(m.location).toEqual({ file: "", line: 0 });
  });
});
