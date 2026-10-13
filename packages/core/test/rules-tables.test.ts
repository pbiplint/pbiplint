import { describe, expect, it } from "vitest";
import { buildIndexes } from "../src/index/build.js";
import { readM } from "../src/m/read.js";
import * as rules from "../src/rules/microsoft-bpa/tables.js";
import { mObjectNames, modelFrom, objectNames } from "./helpers.js";

const t = (
  name: string,
  body: string,
  partition = `\tpartition ${name} = m\n\t\tmode: import\n\t\tsource = 1\n`,
) => `table ${name}\n${body}${partition}\n`;

describe("date table rules", () => {
  const marked = t(
    "Date",
    "\tdataCategory: Time\n\tcolumn Date\n\t\tdataType: dateTime\n\t\tisKey\n",
  );
  const unmarked = t("Calendar", "\tcolumn Date\n\t\tdataType: dateTime\n\t\tisKey\n");
  it("MODEL_SHOULD_HAVE_A_DATE_TABLE needs Time category plus a dateTime key", () => {
    expect(objectNames(rules.MODEL_SHOULD_HAVE_A_DATE_TABLE, marked)).toEqual([]);
    expect(objectNames(rules.MODEL_SHOULD_HAVE_A_DATE_TABLE, unmarked)).toEqual(["Model"]);
    expect(objectNames(rules.MODEL_SHOULD_HAVE_A_DATE_TABLE, "table X\n")).toEqual(["Model"]);
  });
  it("MODEL_SHOULD_HAVE_A_DATE_TABLE reads a date table declared under the model (#137)", () => {
    // TMDL lets a model's tables sit indented under its declaration, as in one model.tmdl.
    const nested =
      "model Model\n\tculture: en-US\n\n\ttable Date\n\t\tdataCategory: Time\n\t\tcolumn Date\n\t\t\tdataType: dateTime\n\t\t\tisKey\n";
    expect(objectNames(rules.MODEL_SHOULD_HAVE_A_DATE_TABLE, nested)).toEqual([]);
  });
  it("DATE/CALENDAR_TABLES_SHOULD_BE_MARKED_AS_A_DATE_TABLE goes by name and ignores calculation groups", () => {
    const cg =
      "table 'Date Intelligence'\n\tcalculationGroup\n\t\tcalculationItem I = 1\n\tcolumn Name\n\t\tdataType: string\n\tpartition 'Date Intelligence' = calculationGroup\n\t\tmode: import\n";
    expect(
      objectNames(
        rules.DATE_CALENDAR_TABLES_SHOULD_BE_MARKED_AS_A_DATE_TABLE,
        marked + unmarked + t("Updates", "") + cg,
      ),
    ).toEqual(["'Calendar'", "'Updates'"]);
  });
  it("both date table rules accept a table that defines a calendar, marked or not", () => {
    // A documented deviation in both rules: calendar-based time intelligence needs no marking.
    const withCalendar = t(
      "Date",
      "\tcolumn Date\n\t\tdataType: dateTime\n\tcalendar Gregorian\n\t\tcalendarColumnGroup = date\n\t\t\tprimaryColumn: Date\n",
    );
    expect(objectNames(rules.MODEL_SHOULD_HAVE_A_DATE_TABLE, withCalendar)).toEqual([]);
    expect(
      objectNames(
        rules.DATE_CALENDAR_TABLES_SHOULD_BE_MARKED_AS_A_DATE_TABLE,
        withCalendar + unmarked,
      ),
    ).toEqual(["'Calendar'"]);
  });
  it("REMOVE_AUTO-DATE_TABLE requires a calculated table with the Desktop prefix", () => {
    const calc = t(
      "LocalDateTable_1",
      "\tcolumn Date\n\t\tdataType: dateTime\n",
      "\tpartition LocalDateTable_1 = calculated\n\t\tmode: import\n\t\tsource = CALENDARAUTO()\n",
    );
    const notCalc = t("DateTableTemplate_2", "\tcolumn Date\n\t\tdataType: dateTime\n");
    // A composite model's copy of an extended model's auto date/time table is not calculated, so
    // it is not reported, as the source rule does not report it.
    const copy = t(
      "LocalDateTable_3",
      "\tcolumn Date\n\t\tdataType: dateTime\n",
      "\tpartition LocalDateTable_3 = entity\n\t\tmode: directQuery\n\t\tsource\n\t\t\tentityName: LocalDateTable_3\n\t\t\texpressionSource: 'DirectQuery to AS - Sales'\n",
    );
    expect(objectNames(rules.REMOVE_AUTO_DATE_TABLE, calc + notCalc + copy)).toEqual([
      "'LocalDateTable_1'",
    ]);
    expect(objectNames(rules.REDUCE_USAGE_OF_CALCULATED_TABLES, calc + notCalc)).toEqual([
      "'LocalDateTable_1'",
    ]);
  });
});

describe("column count, pivot, partition, and Power Query rules", () => {
  it("REDUCE_NUMBER_OF_CALCULATED_COLUMNS fires above five calculated columns, not counting calculated table columns", () => {
    const six = Array.from(
      { length: 6 },
      (_, i) => `\tcolumn C${i} = ${i}\n\t\tdataType: int64\n`,
    ).join("");
    expect(objectNames(rules.REDUCE_NUMBER_OF_CALCULATED_COLUMNS, t("T", six))).toEqual(["Model"]);
    expect(
      objectNames(
        rules.REDUCE_NUMBER_OF_CALCULATED_COLUMNS,
        t("T", six.slice(0, six.lastIndexOf("\tcolumn"))),
      ),
    ).toEqual([]);
  });
  it("UNPIVOT_PIVOTED_(MONTH)_DATA needs numeric Jan through Jun columns", () => {
    const cols = (type: string) =>
      ["Jan", "Feb", "Mar", "Apr", "May", "Jun"]
        .map((mo) => `\tcolumn '${mo} Budget'\n\t\tdataType: ${type}\n`)
        .join("");
    expect(objectNames(rules.UNPIVOT_PIVOTED_MONTH_DATA, t("Budget", cols("decimal")))).toEqual([
      "'Budget'",
    ]);
    expect(objectNames(rules.UNPIVOT_PIVOTED_MONTH_DATA, t("Budget", cols("string")))).toEqual([]);
  });
  it("PARTITION_NAME_SHOULD_MATCH_TABLE_NAME_FOR_SINGLE_PARTITION_TABLES applies to plain tables only", () => {
    const plain = t(
      "Sales",
      "\tcolumn A\n\t\tdataType: int64\n",
      "\tpartition SalesData = m\n\t\tmode: import\n\t\tsource = 1\n",
    );
    const calc = t(
      "Calc",
      "\tcolumn A\n\t\tdataType: int64\n",
      "\tpartition Other = calculated\n\t\tmode: import\n\t\tsource = {1}\n",
    );
    const two = t(
      "Multi",
      "\tcolumn A\n\t\tdataType: int64\n",
      "\tpartition P1 = m\n\t\tmode: import\n\t\tsource = 1\n\tpartition P2 = m\n\t\tmode: import\n\t\tsource = 2\n",
    );
    expect(
      objectNames(
        rules.PARTITION_NAME_SHOULD_MATCH_TABLE_NAME_FOR_SINGLE_PARTITION_TABLES,
        plain + calc + two,
      ),
    ).toEqual(["'Sales'"]);
  });
  describe("MINIMIZE_POWER_QUERY_TRANSFORMATIONS reads the parsed M (v3 spec, section 9.7)", () => {
    const rule = rules.MINIMIZE_POWER_QUERY_TRANSFORMATIONS;
    const m = (name: string, source: string): string =>
      t(name, "", `\tpartition ${name} = m\n\t\tmode: import\n\t\tsource = ${source}\n`);
    it("is a ported rule on the Power Query layer that needs only the model", () => {
      expect(rule.layer).toBe("powerquery");
      expect(rule.needs).toEqual(["model"]);
      expect(rule.status).toBe("ported");
    });
    it("reports a partition whose M names a transformation, called or passed as a value", async () => {
      const tmdl =
        m("A", 'let x = Table.AddColumn(s, "c", each 1) in x') +
        m("B", "let x = table.addcolumn(s) in x") +
        m("C", 'let x = Table.Group (s, {"k"}, {}) in x') +
        m("D", "let x = List.Transform({}, Table.Distinct) in x") +
        t(
          "E",
          "",
          "\tpartition E = calculated\n\t\tmode: import\n\t\tsource = Table.Combine({})\n",
        );
      // M is case-sensitive, so table.addcolumn names nothing; a space before the parenthesis
      // and a function passed as a value both count; a calculated partition is not M.
      expect(await mObjectNames(rule, tmdl)).toEqual(["A", "C", "D"]);
    });
    it("does not count a name in a comment or a text literal", async () => {
      const tmdl =
        m("A", "let /* Table.Group(s) */ x = 1 in x") +
        m("B", 'let x = "Table.Combine(" in x') +
        m("C", 'let x = Value.NativeQuery(s, "select 1") in x');
      expect(await mObjectNames(rule, tmdl)).toEqual(["C"]);
    });
    it("finds a database connector's native query however its SQL is written", async () => {
      const tmdl =
        m("A", 'Sql.Database("s", "d", [Query = "select 1"])') +
        m(
          "B",
          'Sql.Database("s", "d", [Query="-- totals#(lf)WITH t AS (SELECT 1) SELECT * FROM t"])',
        ) +
        m("C", 'PostgreSQL.Database("s", "d", [Query = "EXEC dbo.Totals"])') +
        m("D", 'Oracle.Database("s", [Query = "DECLARE x NUMBER; BEGIN NULL; END;"])') +
        m("E", 'Sql.Database("s", "d", [CommandTimeout = #duration(0, 0, 5, 0)])');
      expect(await mObjectNames(rule, tmdl)).toEqual(["A", "B", "C", "D"]);
    });
    it("follows a named options record to its native query", async () => {
      const tmdl =
        m("A", 'let o = [Query = "SELECT 1"], s = Sql.Database("s", "d", o) in s') +
        m("B", 'Sql.Database("s", "d", SharedOptions)') +
        'expression SharedOptions = [Query = "select 1"]\n\n' +
        m("C", 'let f = (o) => Sql.Database("s", "d", o) in f') +
        m("D", 'Sql.Database("s", "d", NoSuchOptions)') +
        m(
          "E",
          'let o = [CommandTimeout = #duration(0, 0, 5, 0)], s = Sql.Database("s", "d", o) in s',
        );
      // A function's parameter, a name nothing defines, and a record with no Query stay silent.
      expect(await mObjectNames(rule, tmdl)).toEqual(["A", "B"]);
    });
    it("leaves alone a Query option that is not a native query", async () => {
      const tmdl =
        m("A", 'Web.Contents("https://api.example.com", [Query = [page = "1"]])') +
        m("B", 'AnalysisServices.Database("s", "d", [Query = "EVALUATE Sales"])') +
        m("C", 'Odbc.Query("dsn=x", "select 1")') +
        m(
          "D",
          'AnalysisServices.Database("s", "d", [Query = "SELECT * FROM $System.TMSCHEMA_TABLES"])',
        );
      // A DMV query is SQL-shaped but asks Analysis Services about a model, so it does not count.
      expect(await mObjectNames(rule, tmdl)).toEqual(["C"]);
    });
    it("does not report a partition whose M does not parse: PARSE_ISSUE does", async () => {
      const tmdl = m("A", "let x = Table.Combine({a, b} in x");
      expect(await mObjectNames(rule, tmdl)).toEqual([]);
      const { lint } = await import("../src/engine/lint.js");
      const result = await lint([{ path: "definition/tables/A.tmdl", text: tmdl }]);
      expect(result.findings.filter((f) => f.ruleId === "PARSE_ISSUE")).toHaveLength(1);
      expect(result.findings.filter((f) => f.ruleId === rule.id)).toEqual([]);
    });
    it("reads only partitions, not shared expressions", async () => {
      const tmdl = "expression Combined = Table.Combine({})\n\n" + m("A", "1");
      expect(await mObjectNames(rule, tmdl)).toEqual([]);
    });
    it("keeps the finding it always had: the partition, its location, and its table", async () => {
      const model = modelFrom(m("Sales", "Table.Combine({})"));
      const index = await readM(model, [
        { path: "inline.tmdl", text: m("Sales", "Table.Combine({})") },
      ]);
      const [f] = rule.check({ model }, { indexes: buildIndexes({ model }, index), options: {} });
      expect(f).toMatchObject({
        objectType: "Partition",
        objectName: "Sales",
        detail: "table 'Sales'",
        location: model.tables[0]!.partitions[0]!.location,
      });
    });
    it("names what it found, sorted", async () => {
      const text = m(
        "A",
        'let s = Sql.Database("s", "d", [Query = "select 1"]), j = Table.NestedJoin(s, {}, s, {}, "x") in Table.Sort(j, {})',
      );
      const index = await readM(modelFrom(text), [{ path: "inline.tmdl", text }]);
      expect(rules.powerQueryTransformations(index.queries[0]!)).toEqual([
        "Sql.Database Query",
        "Table.NestedJoin",
        "Table.Sort",
      ]);
    });
  });
});

describe("DirectQuery rules", () => {
  const dq =
    "model Model\n\tdefaultPowerBIDataSourceVersion: powerBI_V3\n\n" +
    t(
      "Customer",
      "\tcolumn Id\n\t\tdataType: int64\n",
      "\tpartition Customer = m\n\t\tmode: directQuery\n\t\tsource = 1\n",
    );
  const sales = t(
    "Sales",
    "\tcolumn Amount\n\t\tdataType: decimal\n\tmeasure YTD = TOTALYTD([Amount], 'Date'[Date])\n\tmeasure Lower = totalytd([Amount], 'Date'[Date])\n\tmeasure Plain = SUM('Sales'[Amount])\n",
  );
  it("MODEL_USING_DIRECT_QUERY_AND_NO_AGGREGATIONS needs a DirectQuery table, no alternateOf, and PowerBI_V3", () => {
    expect(objectNames(rules.MODEL_USING_DIRECT_QUERY_AND_NO_AGGREGATIONS, dq)).toEqual(["Model"]);
    expect(
      objectNames(
        rules.MODEL_USING_DIRECT_QUERY_AND_NO_AGGREGATIONS,
        dq.replace("powerBI_V3", "powerBI_V2"),
      ),
    ).toEqual([]);
    expect(
      objectNames(
        rules.MODEL_USING_DIRECT_QUERY_AND_NO_AGGREGATIONS,
        dq.replace(
          "\t\tdataType: int64\n",
          "\t\tdataType: int64\n\t\talternateOf\n\t\t\tbaseTable: X\n",
        ),
      ),
    ).toEqual([]);
    expect(
      objectNames(
        rules.MODEL_USING_DIRECT_QUERY_AND_NO_AGGREGATIONS,
        dq.replace("directQuery", "import"),
      ),
    ).toEqual([]);
  });
  it("MEASURES_USING_TIME_INTELLIGENCE_AND_MODEL_IS_USING_DIRECT_QUERY is case-sensitive and needs a DirectQuery table", () => {
    expect(
      objectNames(
        rules.MEASURES_USING_TIME_INTELLIGENCE_AND_MODEL_IS_USING_DIRECT_QUERY,
        dq + sales,
      ),
    ).toEqual(["[YTD]"]);
    expect(
      objectNames(rules.MEASURES_USING_TIME_INTELLIGENCE_AND_MODEL_IS_USING_DIRECT_QUERY, sales),
    ).toEqual([]);
  });
});

describe("row-level security rules", () => {
  const rls =
    t("Date", "\tcolumn Year\n\t\tdataType: int64\n") +
    t(
      "Sales",
      "\tmeasure M = CALCULATE(1, USERELATIONSHIP('Sales'[D], 'Date'[Date]))\n\tmeasure N = CALCULATE(1, USERELATIONSHIP('Sales'[D], 'Other'[Date]))\n",
    ) +
    t("Other", "") +
    "role R\n\tmodelPermission: read\n\ttablePermission Date = L E F T('Date'[Year], 2) = \"20\"\n\ttablePermission Sales = 'Sales'[U] = USERNAME()\n\ttablePermission Other = 'Other'[U] = USERPRINCIPALNAME ()\n";
  it("LIMIT_ROW_LEVEL_SECURITY_(RLS)_LOGIC strips spaces before matching", () => {
    expect(objectNames(rules.LIMIT_ROW_LEVEL_SECURITY_LOGIC, rls)).toEqual(["'Date'"]);
  });
  it("CHECK_IF_DYNAMIC_ROW_LEVEL_SECURITY_(RLS)_IS_NECESSARY does not match a space before the parenthesis", () => {
    expect(objectNames(rules.CHECK_IF_DYNAMIC_ROW_LEVEL_SECURITY_IS_NECESSARY, rls)).toEqual([
      "Sales",
    ]);
  });
  it("AVOID_THE_USERELATIONSHIP_FUNCTION_AND_RLS_AGAINST_THE_SAME_TABLE looks at the second USERELATIONSHIP argument", () => {
    expect(
      objectNames(rules.AVOID_THE_USERELATIONSHIP_FUNCTION_AND_RLS_AGAINST_THE_SAME_TABLE, rls),
    ).toEqual(["'Date'", "'Other'"]);
  });
  it("AVOID_THE_USERELATIONSHIP_FUNCTION_AND_RLS_AGAINST_THE_SAME_TABLE matches a table name with parentheses literally (a deviation)", () => {
    // The source builds its pattern from the raw name, so "(Order)" reads as a group there and
    // Tabular Editor misses this table, while it would report one for a call naming 'Date Order'.
    const secured = (called: string) =>
      t("'Date (Order)'", "\tcolumn Date\n\t\tdataType: dateTime\n") +
      t("Sales", `\tmeasure M = CALCULATE(1, USERELATIONSHIP('Sales'[D], ${called}[Date]))\n`) +
      "role R\n\tmodelPermission: read\n\ttablePermission 'Date (Order)' = TRUE()\n";
    const rule = rules.AVOID_THE_USERELATIONSHIP_FUNCTION_AND_RLS_AGAINST_THE_SAME_TABLE;
    expect(objectNames(rule, secured("'Date (Order)'"))).toEqual(["'Date (Order)'"]);
    expect(objectNames(rule, secured("'Date Order'"))).toEqual([]);
  });
});

describe("OBJECTS_WITH_NO_DESCRIPTION", () => {
  it("covers visible tables, measures, columns, and calculation group tables once each", () => {
    const m =
      "/// described\ntable A\n\tcolumn X\n\t\tdataType: int64\n\t/// yes\n\tcolumn Y\n\t\tdataType: int64\n\tcolumn Z\n\t\tdataType: int64\n\t\tisHidden\n\tmeasure M = 1\n\tpartition A = m\n\t\tmode: import\n\t\tsource = 1\n\ntable H\n\tisHidden\n\tcolumn V\n\t\tdataType: int64\n\tpartition H = m\n\t\tmode: import\n\t\tsource = 1\n\ntable CG\n\tcalculationGroup\n\t\tcalculationItem I = 1\n\tcolumn Name\n\t\tdataType: string\n\tpartition CG = calculationGroup\n\t\tmode: import\n";
    expect(objectNames(rules.OBJECTS_WITH_NO_DESCRIPTION, m).sort()).toEqual([
      "'A'[X]",
      "'CG'",
      "'CG'[Name]",
      "'H'[V]",
      "[M]",
    ]);
  });
});
