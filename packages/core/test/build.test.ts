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

  it("reads each calendar's primary, associated, and time-related columns, unquoted, in file order", () => {
    const m = modelFrom(
      [
        "table Date",
        "\tcolumn Date",
        "\t\tdataType: dateTime",
        "\tcalendar 'Fiscal Calendar'",
        "\t\tlineageTag: 0a1b",
        "",
        "\t\tcalendarColumnGroup = year",
        "\t\t\tprimaryColumn: Year",
        "",
        "\t\tcalendarColumnGroup = month",
        "\t\t\tprimaryColumn: 'Month Key'",
        "\t\t\tassociatedColumn: 'Month Name'",
        "\t\t\tassociatedColumn: MonthShort",
        "",
        "\t\tcalendarColumnGroup",
        "\t\t\tcolumn: 'Holiday Name'",
        "\t\t\tcolumn: IsWorkingDay",
        "table Sales",
        "\tcolumn Amount",
        "\t\tdataType: decimal",
      ].join("\n"),
    );
    const [date, sales] = m.tables;
    expect(date!.calendars).toEqual([
      expect.objectContaining({
        name: "Fiscal Calendar",
        table: date,
        columns: ["Year", "Month Key", "Month Name", "MonthShort", "Holiday Name", "IsWorkingDay"],
        location: { file: "inline.tmdl", line: 4 },
      }),
    ]);
    expect(sales!.calendars).toEqual([]);
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

  it("merges a calculation group's block from each part of a table's declaration (#132)", () => {
    // Whichever part the walk meets first, each part's items stay and the first precedence holds.
    const block = (items: string, precedence = "") =>
      `table CG\n\tcalculationGroup\n${precedence}\n${items}`;
    const m = buildModel([
      parseTmdl("tables/CG.tmdl", block("\t\tcalculationItem B = 2\n", "\t\tprecedence: 3\n")),
      parseTmdl("tables/CG.a.tmdl", block("\t\tcalculationItem A = 1\n", "\t\tprecedence: 1\n")),
    ]);
    const cg = m.tables[0]!.calculationGroup!;
    expect(cg.precedence).toBe(1);
    expect(cg.items.map((i) => [i.name, i.table])).toEqual([
      ["A", m.tables[0]],
      ["B", m.tables[0]],
    ]);
    expect(m.tables[0]!.kind).toBe("calculationGroup");
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

  it("reads an alternateOf mapping in each form TMDL writes it", () => {
    // Power BI writes the base column qualified with its table and leaves out groupBy, the
    // default summarization; a count of the table's rows names the table alone. The quoted form is
    // TMDL's rule for a name with a space, and the bare column beside baseTable is a hand-written
    // form pbiplint's own aggregation page shows.
    const m = modelFrom(`table 'Sales Agg'
	column account_company_name
		dataType: string
		isAvailableInMdx: false

		alternateOf
			baseColumn: account.company_name

	column Amount
		dataType: decimal
		alternateOf
			summarization: sum
			baseColumn: Sales.Amount

	column 2
		dataType: int64
		alternateOf
			summarization: count
			baseTable: account

	column 'Order Date'
		dataType: dateTime
		alternateOf
			baseColumn: 'Sales Detail'.'Order Date'

	column Region
		dataType: string
		alternateOf
			summarization: groupBy
			baseColumn: Sales Region
			baseTable: 'Sales Detail'

	column Unmapped
		dataType: string
`);
    const cols = m.tables[0]!.columns;
    expect(cols.map((c) => c.alternateOf)).toEqual([
      { baseTable: "account", baseColumn: "company_name" },
      { summarization: "sum", baseTable: "Sales", baseColumn: "Amount" },
      { summarization: "count", baseTable: "account" },
      { baseTable: "Sales Detail", baseColumn: "Order Date" },
      { summarization: "groupby", baseTable: "Sales Detail", baseColumn: "Sales Region" },
      undefined,
    ]);
    expect(cols.map((c) => c.hasAlternateOf)).toEqual([true, true, true, true, true, false]);
  });

  it("reads the columns a field parameter's display column groups by", () => {
    const m = modelFrom(`table Metric
	column Metric
		dataType: string
		sortByColumn: 'Metric Order'

		relatedColumnDetails
			groupByColumn: 'Metric Fields'

	column 'Metric Fields'
		dataType: string
		isHidden

	column 'Metric Order'
		dataType: int64
		isHidden
`);
    const [display, fields] = m.tables[0]!.columns;
    expect(display!.groupByColumns).toEqual(["Metric Fields"]);
    expect(fields!.groupByColumns).toEqual([]);
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

describe("buildModel on root object types", () => {
  it("leaves out an object at the root whose type TMDL does not declare there, and everything under it", () => {
    const pf = parseTmdl(
      "tables/Sales.tmdl",
      "table Product\n\tcolumn Key\n\t\tdataType: int64\n\ntabel Sales\n\tcolumn Amount\n\t\tdataType: decimal\n\tmeasure Total = SUM(Sales[Amount])\n",
    );
    const m = buildModel([pf]);
    expect(m.tables.map((t) => t.name)).toEqual(["Product"]);
    expect(pf.issues.map((i) => [i.line, i.reason])).toEqual([
      [5, '"tabel" is not a type TMDL declares at the root of a file'],
    ]);
  });

  it("builds each root type it models, and holds nothing of the types TMDL defines that it does not model", () => {
    const pf = parseTmdl(
      "t.tmdl",
      [
        "database Sales",
        "\tcompatibilityLevel: 1567",
        "",
        "model Model",
        "\tculture: en-US",
        "",
        "queryGroup 'Fact Queries'",
        "",
        'annotation PBI_QueryOrder = ["Sales"]',
        "",
        "extendedProperty ParameterMetadata =",
        "\t\t{",
        '\t\t  "version": 1',
        "\t\t}",
        "",
        'bindingInfo \'{"kind":"AzureDataExplorer","path":"help"}\'',
        "\ttype: dataBindingHint",
        "",
        "table Sales",
        "\tcolumn Key",
        "\t\tdataType: int64",
        "",
        "relationship r1",
        "\tfromColumn: Sales.Key",
        "\ttoColumn: Product.Key",
        "",
        "role Readers",
        "\tmodelPermission: read",
        "",
        "perspective Finance",
        "\tperspectiveTable Sales",
        "",
        "cultureInfo en-US",
        "",
        'expression Server = "localhost"',
        "",
        "function Double = (x: INT64) => x * 2",
        "",
        "dataSource 'Legacy SQL' = provider",
        "",
        "createOrReplace",
        "",
        "\ttable Product",
        "\t\tcolumn Key",
        "\t\t\tdataType: int64",
        "",
      ].join("\n"),
    );
    expect(pf.issues).toEqual([]);
    const m = buildModel([pf]);
    expect(m.props.culture).toBe("en-US");
    expect(m.annotations).toEqual({ PBI_QueryOrder: '["Sales"]' });
    // Product sits under createOrReplace, a script command the model does not read.
    expect(m.tables.map((t) => t.name)).toEqual(["Sales"]);
    expect(m.relationships.map((r) => r.name)).toEqual(["r1"]);
    expect(m.roles.map((r) => r.name)).toEqual(["Readers"]);
    expect(m.perspectives.map((p) => [p.name, p.tables])).toEqual([["Finance", ["Sales"]]]);
    expect(m.cultures.map((c) => c.name)).toEqual(["en-US"]);
    expect(m.expressions.map((e) => e.name)).toEqual(["Server"]);
    expect(m.functions.map((f) => f.name)).toEqual(["Double"]);
    expect(m.dataSources.map((d) => [d.name, d.kind])).toEqual([["Legacy SQL", "provider"]]);
  });
});

describe("buildModel and a root annotation with lines under it", () => {
  it("leaves the annotation out of the model's annotations, and keeps one with nothing under it", () => {
    // A column's annotation that lost its tabs, with the columns after it attached to it. The line
    // is a parse issue; its value belongs to the column, not the model.
    const pf = parseTmdl(
      "tables/Sales.tmdl",
      [
        "annotation PBI_QueryOrder = 1",
        "",
        "table Sales",
        "\tcolumn Amount",
        "annotation pbiplint.ignore = MODEL_RULE",
        "\tcolumn Region",
        "",
      ].join("\n"),
    );
    expect(pf.issues.map((i) => i.line)).toEqual([5]);
    expect(buildModel([pf]).annotations).toEqual({ PBI_QueryOrder: "1" });
  });
});

describe("buildModel and the declarations under a model (#137)", () => {
  it("reads each type it models declared under a root model, as at the root of a file", () => {
    const pf = parseTmdl(
      "definition/model.tmdl",
      [
        "model Model",
        "\tculture: en-US",
        "",
        '\tannotation PBI_QueryOrder = ["Date"]',
        "",
        "\ttable Date",
        "\t\tdataCategory: Time",
        "\t\tcolumn Date",
        "\t\t\tdataType: dateTime",
        "\t\t\tisKey",
        "",
        "\trelationship r1",
        "\t\tfromColumn: Sales.Date",
        "\t\ttoColumn: Date.Date",
        "",
        "\trole Readers",
        "\t\tmodelPermission: read",
        "",
        "\tperspective Finance",
        "\t\tperspectiveTable Date",
        "",
        "\tcultureInfo en-US",
        "",
        '\texpression Server = "localhost"',
        "",
        "\tfunction Double = (x: INT64) => x * 2",
        "",
        "\tdataSource 'Legacy SQL' = provider",
        "",
      ].join("\n"),
    );
    expect(pf.issues).toEqual([]);
    const m = buildModel([pf]);
    expect(m.props.culture).toBe("en-US");
    expect(m.annotations).toEqual({ PBI_QueryOrder: '["Date"]' });
    expect(m.tables.map((t) => [t.name, t.dataCategory, t.columns.map((c) => c.name)])).toEqual([
      ["Date", "Time", ["Date"]],
    ]);
    expect(m.tables[0]!.location).toEqual({ file: "definition/model.tmdl", line: 6 });
    expect(m.relationships.map((r) => [r.name, r.fromTable, r.toTable])).toEqual([
      ["r1", "Sales", "Date"],
    ]);
    expect(m.roles.map((r) => r.name)).toEqual(["Readers"]);
    expect(m.perspectives.map((p) => [p.name, p.tables])).toEqual([["Finance", ["Date"]]]);
    expect(m.cultures.map((c) => c.name)).toEqual(["en-US"]);
    expect(m.expressions.map((e) => e.name)).toEqual(["Server"]);
    expect(m.functions.map((f) => f.name)).toEqual(["Double"]);
    expect(m.dataSources.map((d) => [d.name, d.kind])).toEqual([["Legacy SQL", "provider"]]);
  });

  it("merges a table declared under the model with its part at the root of another file", () => {
    const m = buildModel([
      parseTmdl(
        "definition/model.tmdl",
        "model Model\n\ttable Sales\n\t\tmeasure Total = SUM(Sales[Amount])\n",
      ),
      parseTmdl(
        "definition/tables/Sales.tmdl",
        "table Sales\n\tcolumn Amount\n\t\tdataType: decimal\n",
      ),
    ]);
    expect(
      m.tables.map((t) => [t.name, t.columns.map((c) => c.name), t.measures.map((x) => x.name)]),
    ).toEqual([["Sales", ["Amount"], ["Total"]]]);
  });

  it("reads a model under a root database as a part of the model, with what is declared under it", () => {
    // TMDL merges it with the model at the root of model.tmdl, as a table declared in two files.
    const m = buildModel([
      parseTmdl(
        "definition/database.tmdl",
        "database Sales\n\tcompatibilityLevel: 1567\n\tmodel Model\n\n\t\ttable T\n\t\t\tcolumn C\n\t\t\t\tdataType: string\n",
      ),
      parseTmdl(
        "definition/model.tmdl",
        "model Model\n\tculture: en-US\n\tdefaultPowerBIDataSourceVersion: powerBI_V3\n",
      ),
    ]);
    expect(m.tables.map((t) => [t.name, t.columns.map((c) => c.name)])).toEqual([["T", ["C"]]]);
    expect(m.props).toEqual({ culture: "en-US", defaultpowerbidatasourceversion: "powerBI_V3" });
    expect(m.location).toEqual({ file: "definition/model.tmdl", line: 1 });
  });

  it("keeps what each declaration of the model sets, whichever file comes last", () => {
    const m = buildModel([
      parseTmdl("definition/a.tmdl", "/// The sales model\nmodel Model\n\tculture: en-US\n"),
      parseTmdl("definition/b.tmdl", "model Model\n\tdiscourageImplicitMeasures\n"),
    ]);
    expect(m.props).toEqual({ culture: "en-US", discourageimplicitmeasures: true });
    expect(m.description).toBe("The sales model");
  });

  it("leaves out an annotation under the model with lines under it, as at the root", () => {
    // A column's annotation that lost two tabs, with the column after it attached to it.
    const pf = parseTmdl(
      "definition/model.tmdl",
      [
        "model Model",
        "\tannotation PBI_QueryOrder = 1",
        "",
        "\ttable Sales",
        "\t\tcolumn Amount",
        "\tannotation pbiplint.ignore = MODEL_RULE",
        "\t\tcolumn Region",
        "",
      ].join("\n"),
    );
    expect(pf.issues.map((i) => i.line)).toEqual([6]);
    expect(buildModel([pf]).annotations).toEqual({ PBI_QueryOrder: "1" });
  });

  it("reads no model under a culture's translations or a TMDL script", () => {
    const m = buildModel([
      parseTmdl(
        "definition/cultures/pt-PT.tmdl",
        "cultureInfo pt-PT\n\ttranslations\n\t\tmodel Model\n\t\t\ttable Sales\n\t\t\t\tcaption: Vendas\n",
      ),
      parseTmdl(
        "TMDLScripts/Script 1.tmdl",
        "createOrReplace\n\n\tmodel Model\n\t\tculture: pt-PT\n\n\t\ttable Date\n\t\t\tcolumn D\n",
      ),
    ]);
    expect(m.tables).toEqual([]);
    expect(m.props).toEqual({});
  });
});

describe("buildModel and the order of its files (tracked in #101)", () => {
  // A backup kept beside the tables folder. As whole paths, "definition/tables.old/Sales.tmdl"
  // sorts before "definition/tables/Sales.tmdl"; the CLI's walk goes through tables first.
  const current = () =>
    parseTmdl(
      "definition/tables/Sales.tmdl",
      "table Sales\n\tcolumn Amount\n\t\tdataType: double\n",
    );
  const backup = () =>
    parseTmdl(
      "definition/tables.old/Sales.tmdl",
      "table Sales\n\tcolumn 'Old Amount'\n\t\tdataType: double\n",
    );
  it("reads its files in the order the CLI's walk meets them, whatever order they are given in", () => {
    for (const files of [
      [current(), backup()],
      [backup(), current()],
    ]) {
      const m = buildModel(files);
      expect(m.files.map((f) => f.file)).toEqual([
        "definition/tables/Sales.tmdl",
        "definition/tables.old/Sales.tmdl",
      ]);
      // A table declared twice keeps its first declaration's place, so the order is the model's.
      expect(m.tables[0]!.location.file).toBe("definition/tables/Sales.tmdl");
      expect(m.tables[0]!.columns.map((c) => c.name)).toEqual(["Amount", "Old Amount"]);
    }
  });
  it("orders two names the CLI's comparison calls equal the same way whichever comes first", () => {
    // "Café" written with é, and with e and a combining accent: localeCompare(…, "en") returns 0,
    // and a file system that does not normalize names can hold both. Written as escapes, so an
    // editor that normalizes the file cannot make the two one name.
    const composed = () => parseTmdl("tables/Caf\u00e9.tmdl", "table A\n");
    const decomposed = () => parseTmdl("tables/Cafe\u0301.tmdl", "table B\n");
    // By code units, e (0x65) before é (0xE9).
    for (const files of [
      [composed(), decomposed()],
      [decomposed(), composed()],
    ])
      expect(buildModel(files).tables.map((t) => t.name)).toEqual(["B", "A"]);
  });
});
