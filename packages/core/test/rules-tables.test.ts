import { describe, expect, it } from "vitest";
import * as rules from "../src/rules/microsoft-bpa/tables.js";
import { objectNames } from "./helpers.js";

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
  it("REMOVE_AUTO-DATE_TABLE requires a calculated table with the Desktop prefix", () => {
    const calc = t(
      "LocalDateTable_1",
      "\tcolumn Date\n\t\tdataType: dateTime\n",
      "\tpartition LocalDateTable_1 = calculated\n\t\tmode: import\n\t\tsource = CALENDARAUTO()\n",
    );
    const notCalc = t("DateTableTemplate_2", "\tcolumn Date\n\t\tdataType: dateTime\n");
    expect(objectNames(rules.REMOVE_AUTO_DATE_TABLE, calc + notCalc)).toEqual([
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
  it("MINIMIZE_POWER_QUERY_TRANSFORMATIONS is a case-sensitive substring check on M partitions", () => {
    const m =
      t(
        "A",
        "",
        '\tpartition A = m\n\t\tmode: import\n\t\tsource = let x = Table.AddColumn(s, "c", each 1) in x\n',
      ) +
      t(
        "B",
        "",
        "\tpartition B = m\n\t\tmode: import\n\t\tsource = let x = table.addcolumn(s) in x\n",
      ) +
      t("C", "", "\tpartition C = calculated\n\t\tmode: import\n\t\tsource = Table.Combine(\n");
    expect(objectNames(rules.MINIMIZE_POWER_QUERY_TRANSFORMATIONS, m)).toEqual(["A"]);
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
