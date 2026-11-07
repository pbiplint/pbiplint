import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { evaluateTeRule, type TeOutcome } from "../src/custom-rules/te/evaluate.js";
import { LIBRARY } from "../src/custom-rules/te/library.js";
import { parseTeExpression } from "../src/custom-rules/te/parser.js";
import { readTeRuleFile, type TeRule } from "../src/custom-rules/te/read.js";
import { buildTomView, type TomView } from "../src/custom-rules/te/view.js";
import { buildModel } from "../src/model/build.js";
import { BPA_RULES } from "../src/rules/microsoft-bpa/bpa-rules.data.js";
import { modelFrom, parseModelDir } from "./helpers.js";

const repo = new URL("../../../", import.meta.url).pathname;
const viewOf = (fixture: string): TomView =>
  buildTomView(buildModel(parseModelDir(`${repo}tests/fixtures/${fixture}.SemanticModel`)));

/** Every reason any test here produced, for the check that none quotes the model. */
const reasons: string[] = [];

const SMALL = buildTomView(
  modelFrom(
    [
      "model Model",
      "\tculture: en-US",
      "",
      "\tannotation Team = Finance",
      "",
      "table Sales",
      "\tmeasure Total = SUM(Sales[Amount])",
      "\t\tformatString: #,0",
      "",
      "\tcolumn Amount",
      "\t\tdataType: int64",
      "\t\tsummarizeBy: sum",
      "\t\tsourceColumn: Amount",
      "",
      "\t\talternateOf",
      "\t\t\tbaseTable: Customers",
      "\t\t\tsummarization: sum",
      "",
      "\tcolumn 'Customer Key'",
      "\t\tdataType: int64",
      "\t\tsourceColumn: Customer Key",
      "",
      '\tcolumn Band = IF(Sales[Amount] > 10, "high", "low")',
      "",
      "\tpartition Sales = m",
      "\t\tmode: import",
      "\t\tsource = let x = 1 in x",
      "",
      "table Customers",
      "\tcolumn 'Customer Key'",
      "\t\tdataType: int64",
      "\t\tsourceColumn: Customer Key",
      "",
      "\tcolumn City",
      "\t\tdataType: string",
      "\t\tsourceColumn: City",
      "",
      "\tpartition Customers = m",
      "\t\tmode: import",
      "\t\tsource = let x = 1 in x",
      "",
      "relationship r1",
      "\tfromColumn: Sales.'Customer Key'",
      "\ttoColumn: Customers.'Customer Key'",
      "",
    ].join("\n"),
  ),
);

const ruleOf = (expression: string, scopes: string[]): TeRule => ({
  id: "TEST",
  name: "test",
  scopes,
  expression,
  disabled: false,
});

function outcome(expression: string, scopes = ["Model"], view = SMALL): TeOutcome {
  const parsed = parseTeExpression(expression);
  if ("error" in parsed) throw new Error(`${expression}: ${parsed.error}`);
  const result = evaluateTeRule(ruleOf(expression, scopes), parsed.expr, view);
  if (result.kind === "could-not-run") reasons.push(result.reason);
  return result;
}

/** Whether the expression holds for the scope's objects (all of them must agree). */
function holds(expression: string, scopes = ["Model"]): boolean {
  const o = outcome(expression, scopes);
  if (o.kind !== "findings") throw new Error(`${expression}: ${o.reason}`);
  return o.objects.length > 0;
}

function reason(expression: string, scopes = ["Model"]): string {
  const o = outcome(expression, scopes);
  if (o.kind !== "could-not-run") throw new Error(`${expression} ran`);
  return o.reason;
}

/** Expressions that hold, each with the scope it runs on (Model when none). */
const TRUE: (string | [string, string])[] = [
  // Operators, every spelling.
  "1 + 2 == 3",
  "5 - 7 == -2",
  "3 * 4 == 12",
  "7 / 2 == 3",
  "-7 / 2 == -3",
  "7 % 3 == 1",
  "-7 % 3 == -1",
  "7 mod 3 == 1",
  "7 / 2.0 == 3.5",
  "0.1 + 0.2 != 0.3",
  "1.5M + 1 == 2.5",
  "1 < 2",
  "2 > 1",
  "2 <= 2",
  "(2 >= 3) == false",
  "1 = 1",
  "1 <> 2",
  "1 != 2",
  "true and true",
  "true && true",
  "false or true",
  "false || true",
  "not false",
  "!false",
  "not true or true",
  "-(3) == -3",
  '"a" + "b" == "ab"',
  '"a" + null == "a"',
  '("a" & 1) == "a1"',
  '(null ?? "x") == "x"',
  'iif(1 > 2, "a", "b") == "b"',
  "(1 > 2 ? 1 : 2) == 2",
  '"a" < "B"',
  '"B" > "a"',
  '"a" == "a"',
  '"a" != "A"',
  "null == null",
  "'a' == 'a'",
  "'a' < 'b'",
  "'a' == 97",
  "char(97) == 'a'",
  "int('a') == 97",
  "double(1) / 2 == 0.5",
  // No escapes in string literals: a doubled quote is the only one.
  '"a\\b".Length == 3',
  '"a""b".Length == 3',
  // Strings.
  '"Sales".Contains("ale")',
  "\"Sales\".Contains('S')",
  '"Sales".Contains("SALES", StringComparison.OrdinalIgnoreCase)',
  '"Sales".StartsWith("Sa")',
  "\"Sales\".StartsWith('S')",
  '"Sales".StartsWith("sa", StringComparison.OrdinalIgnoreCase)',
  '"Sales".EndsWith("es")',
  "\"Sales\".EndsWith('s')",
  '"Sales".EndsWith("ES", StringComparison.CurrentCultureIgnoreCase)',
  '"Sales".IndexOf("l") == 2',
  "\"Sales\".IndexOf('l') == 2",
  '"Sales".IndexOf("SALES", StringComparison.OrdinalIgnoreCase) == 0',
  '"Sales".IndexOf("sales", "OrdinalIgnoreCase") == 0',
  '"Sales".IndexOf("sales", StringComparison.Ordinal) == -1',
  '"abcabc".IndexOf("b", 2) == 4',
  "\"abcabc\".IndexOf('b', 2) == 4",
  '"abc".IndexOf("") == 0',
  '"straße".IndexOf("strasse") == -1',
  '"abcabc".LastIndexOf("b") == 4',
  "\"abcabc\".LastIndexOf('b') == 4",
  '"abcabc".LastIndexOf("B", StringComparison.InvariantCultureIgnoreCase) == 4',
  '"a b c".Replace(" ", "") == "abc"',
  "\"a-b\".Replace('-', '+') == \"a+b\"",
  '"a\\nb".Replace("\\n", "") == "ab"',
  '"Sales".Substring(2) == "les"',
  '"Sales".Substring(1, 3) == "ale"',
  '"Sales".Substring(5) == ""',
  '"ä".ToUpper() == "Ä"',
  '"straße".ToUpper() == "STRAßE"',
  '"ABC".ToLower() == "abc"',
  '"abc".ToUpperInvariant() == "ABC"',
  '"ABC".ToLowerInvariant() == "abc"',
  '" a ".Trim() == "a"',
  '" a ".TrimStart() == "a "',
  '" a ".TrimEnd() == " a"',
  '"abc".Length == 3',
  '"a b".ToCharArray().Any(char.IsWhiteSpace(it))',
  '"abc".ToCharArray().Count() == 3',
  "\"abc\".Any(it == 'b')",
  "\"a,b,c\".Split(',').Count() == 3",
  '"a--b".Split("--").Count() == 2',
  '"a".Equals("a")',
  '"a".Equals("A", StringComparison.OrdinalIgnoreCase)',
  '"a".ToString() == "a"',
  '"a".CompareTo("B") == -1',
  // Other values.
  '(12).ToString() == "12"',
  '(2.5).ToString() == "2.5"',
  '(-7 / 2).ToString() == "-3"',
  "(1).Equals(1)",
  "(1).CompareTo(2) == -1",
  'true.ToString() == "True"',
  "true.Equals(true)",
  "'a'.ToString() == \"a\"",
  "'a'.Equals('a')",
  "'a'.CompareTo('b') == -1",
  // Collections.
  "Tables.Any()",
  'Tables.Any(Name == "Sales")',
  "Tables.All(Name.Length > 3)",
  "Tables.Count() == 2",
  'Tables.Count(Name == "Sales") == 1',
  "Tables.Count == 2",
  "Tables.LongCount() == 2",
  'Tables.LongCount(Name == "Sales") == 1',
  'Tables.Where(Name == "Sales").Count() == 1',
  'Tables.Select(Name).Contains("Sales")',
  'Tables.First().Name == "Sales"',
  'Tables.First(Name.StartsWith("C")).Name == "Customers"',
  'Tables.FirstOrDefault(Name == "x") == null',
  'Tables.FirstOrDefault().Name == "Sales"',
  'Tables.Last().Name == "Customers"',
  'Tables.Last(Name.StartsWith("S")).Name == "Sales"',
  'Tables.LastOrDefault(Name == "x") == null',
  'Tables.LastOrDefault().Name == "Customers"',
  "Tables.Sum(Columns.Count) == 5",
  "Tables.Select(Columns.Count).Sum() == 5",
  "Tables.Max(Columns.Count) == 3",
  'Tables.Select(Name).Max() == "Sales"',
  'Tables.Min(Name) == "Customers"',
  "Tables.Select(Columns.Count).Min() == 2",
  "Tables.Average(Columns.Count) == 2.5",
  "Tables.Select(Columns.Count).Average() == 2.5",
  "AllColumns.Select(Name).Distinct().Count() == 4",
  'Tables.OrderBy(Name).First().Name == "Customers"',
  'Tables.OrderByDescending(Name).First().Name == "Sales"',
  'Tables.Skip(1).First().Name == "Customers"',
  "Tables.Take(1).Count() == 1",
  "Tables.ToList().Count == 2",
  "Tables.ToArray().Count() == 2",
  'Tables[0].Name == "Sales"',
  "Tables.Contains(Tables[0])",
  // it, outerIt, current.
  "it.Name == Name",
  "$.Name == Name",
  'current.Name == "Model"',
  'Tables.Any(Columns.Any(outerIt.Name == "Sales"))',
  'Tables.Any(outerIt.Name == "Model")',
  'Tables.Any(Columns.Any(current.Name == "Model"))',
  "Tables.Any(Columns.Any(Table == outerIt))",
  // Static members.
  'string.IsNullOrEmpty("")',
  "String.IsNullOrEmpty(null)",
  'string.IsNullOrEmpty(" ") == false',
  'string.IsNullOrWhiteSpace(" ")',
  'string.IsNullOrWhitespace(" ")',
  'string.Concat("a", "b") == "ab"',
  'string.Concat("a", null, "c") == "ac"',
  'string.Join(",", Tables.Select(Name)) == "Sales,Customers"',
  'string.Compare("a", "B") == -1',
  'string.Equals("a", "a")',
  'String.Empty == ""',
  "char.IsWhiteSpace(' ')",
  "char.IsLetter('é')",
  "char.IsDigit('٣')",
  "char.IsLetterOrDigit('1')",
  "char.IsUpper('A')",
  "char.IsLower('a')",
  "char.IsControl(char(9))",
  "char.IsPunctuation('!')",
  "char.IsNumber('½')",
  "char.IsSymbol('$')",
  "char.IsSeparator(' ')",
  "char.ToUpper('a') == 'A'",
  "char.ToLower('A') == 'a'",
  'Convert.ToInt32("12") == 12',
  'Convert.ToInt64(" -3 ") == -3',
  "Convert.ToInt64(null) == 0",
  "Convert.ToInt32(2.5) == 2",
  "Convert.ToInt32(3.5) == 4",
  "Convert.ToInt32(true) == 1",
  'Convert.ToDecimal("1.5") == 1.5',
  'Convert.ToDouble("1,000.5") == 1000.5',
  "Convert.ToDouble(1) / 2 == 0.5",
  'Convert.ToString(12) == "12"',
  'Convert.ToString(null) == ""',
  'Convert.ToString(true) == "True"',
  "Convert.ToString(Convert.ToChar(10)).Length == 1",
  'Convert.ToBoolean("true")',
  "Convert.ToBoolean(1)",
  "Convert.ToChar(65) == 'A'",
  "Convert.ToChar(\"A\") == 'A'",
  "Math.Max(1, 2.5) == 2.5",
  "Math.Max(1, 2) / 2 == 1",
  "Math.Min(1, 2) == 1",
  "Math.Abs(-3) == 3",
  "Math.Round(2.5) == 2",
  "Math.Round(3.5) == 4",
  "Math.Round(1.234, 2) == 1.23",
  "Math.Floor(1.7) == 1",
  "Math.Ceiling(1.2) == 2",
  'RegEx.IsMatch("abc", "b")',
  'Regex.IsMatch("ABC", "b", RegexOptions.IgnoreCase)',
  'RegEx.IsMatch("ABC", "b", RegexOptions.None) == false',
  'RegEx.IsMatch("xDIVIDE", "x(?i)divide")',
  // Annotations.
  'GetAnnotation("Team") == "Finance"',
  'GetAnnotation("none") == null',
  'HasAnnotation("Team")',
  'HasAnnotation("none") == false',
  // Tokenize.
  ["Tokenize().Any(Type = SUM)", "Measure"],
  ['Tokenize().First().Text == "SUM"', "Measure"],
  ["Tokenize().Any(Type = CLOSE_PARENS and Next == null)", "Measure"],
  // Enums: by name through the property of that name, or by string.
  ['DataType == "Int64"', "DataColumn"],
  ["DataType == DataType.Int64", "DataColumn"],
  ['Type.ToString() == "Data"', "DataColumn"],
  ['SummarizeBy == "Sum" or SummarizeBy == "Default"', "DataColumn"],
  ["CrossFilteringBehavior == CrossFilteringBehavior.OneDirection", "Relationship"],
  ['FromCardinality == "Many" and ToCardinality.ToString() == "One"', "Relationship"],
  ["SecurityFilteringBehavior == SecurityFilteringBehavior.OneDirection", "Relationship"],
  ['JoinOnDateBehavior == "DateAndTime"', "Relationship"],
  ['SourceType == "M" and Mode == "Import"', "Partition"],
  ['DefaultMode == "Import"', "Model"],
  ['AllColumns.Any(AlternateOf.Summarization == "Sum")', "Model"],
  ["ObjectType == ObjectType.Model", "Model"],
  ['DependsOn.Any(Key.ObjectType = "Column" and Value.Any(FullyQualified))', "Measure"],
];

/** Enum cases on fixtures that have the objects: expression, scope, fixture. */
const OTHER_ENUMS: [string, string, string][] = [
  ['DataSource.Type == "Provider"', "Partition", "data-sources"],
  ['ModelPermission == "Read"', "ModelRole", "rule-zoo"],
  [
    'MetadataPermission == "Default" or MetadataPermission == "Read" or MetadataPermission == "None"',
    "TablePermission",
    "custom-rules",
  ],
  ['DefaultPowerBIDataSourceVersion == "PowerBI_V3"', "Model", "custom-rules"],
];

/** Expressions that are false for every object of their scope. */
const FALSE: (string | [string, string])[] = [
  '"a" == "A"',
  '"Sales".Contains("sales")',
  "0.1 + 0.2 == 0.3",
  "Description == null",
  "not true",
  'RegEx.IsMatch("XDIVIDE", "x(?i)divide")',
  '"a" > "B"',
  ["DataType == DataType.Boolean", "DataColumn"],
  // A member read or call on null gives null, which is never true (PROBE_PQ_EXPRESSION).
  ['SortByColumn.Name == ""', "DataColumn"],
  ['SortByColumn.Name.Contains("x")', "DataColumn"],
  ['not SortByColumn.Name.Contains("x")', "DataColumn"],
];

/** Expressions that stop the rule, with what the reason must say. */
const FAILS: [string, string, string?][] = [
  ['"a" + 1 == "a1"', "`+` joins a String with an Int32"],
  [
    'Convert.ToInt64("x") == 1',
    "`Convert.ToInt64` was given a string that is not a whole number, on a Model",
  ],
  [
    "Name.Substring(10).Length > 0",
    "`Substring` was given a start index beyond the end of the string, on a Model",
  ],
  ['"abc".Substring(1, 5) == ""', "runs past the end"],
  ["1 / 0 == 1", "divides a whole number by zero"],
  ["7 % 0 == 1", "divides a whole number by zero"],
  ['RegEx.IsMatch("a", "(")', "does not compile"],
  ['RegEx.IsMatch("abc", "(?<=ab)c")', "cannot be translated exactly"],
  ['RegEx.IsMatch("a", "a", RegexOptions.Multiline)', "`RegexOptions.Multiline`"],
  ["1 == true", "compares an Int32 with a Boolean"],
  ['"a" < 1', "orders a String against an Int32"],
  ['Tables.First(Name == "x").Name == ""', "`First` was called on an empty collection"],
  ['Tables[5].Name == ""', "an index outside the collection"],
  ["Visible", "Measure has no property `Visible`; `IsHidden` is the nearest", "Measure"],
  ["Foo()", "Model has no method `Foo`"],
  ["Math.Foo(1) == 1", "`Math.Foo` is not one of the functions pbiplint runs"],
  ['"a".Foo() == 1', "String has no method `Foo`"],
  ['"a".Contains() == 1', "`Contains` takes"],
  [
    'GetAnnotation("Vertipaq_RowCount") == null',
    "reads `Vertipaq_RowCount`, which needs statistics from a live model",
  ],
  ['Tables.Any(GetAnnotation("Vertipaq_RowCount") == null)', "reads `Vertipaq_RowCount`"],
  ['State == ""', "reads `State`, which is kept by the server", "Partition"],
  ["Tables.Any(Name)", "the condition in `Any` gives a String, not true or false"],
  ["Name", "the expression gives a String, where a rule needs true or false"],
  [
    "SourceType = PartitionSourceType.M",
    "Partition has no property `PartitionSourceType`",
    "Partition",
  ],
  ["DataType == DataType.Whole", "DataType has no value `Whole`", "DataColumn"],
  ["DataType.Int64 == DataType", "Model has no property `DataType`"],
  ["Tokenize().Any(Type = ASSIGNMENT)", "DaxToken has no property `ASSIGNMENT`", "Measure"],
  ["Tokenize().Any(Type = TRUE)", "compares an Int32 with a Boolean, on a Measure", "Measure"],
  ["Tokenize().Count() > 0", "Model has no method `Tokenize`"],
  ['"Sales".IndexOf(null) == 1', "`IndexOf` was given null"],
  ['Tables.Any(Name.Contains(GetAnnotation("none")))', "`Contains` was given null, on a Model"],
  ["Convert.ToChar(\"ab\") == 'a'", "not one character"],
  ['Convert.ToBoolean("x")', "neither True nor False"],
  ['"a".Replace("", "b") == ""', "an empty string to replace"],
  [
    'DataType == "Integer"',
    "compares a DataType with a string that names none of its values",
    "DataColumn",
  ],
  ["Tables.Count.Foo", "Int32 has no property `Foo`"],
  ['string(1) == "1"', "converting to String"],
  ["outerIt.Name == Name and it.Nonsense", "Model has no property `Nonsense`"],
];

describe("evaluateTeRule: operators, methods, static members, conversions, enums", () => {
  for (const c of TRUE) {
    const [expression, scope] = typeof c === "string" ? [c, "Model"] : c;
    it(`holds: ${expression}`, () => expect(holds(expression, [scope])).toBe(true));
  }
  for (const c of FALSE) {
    const [expression, scope] = typeof c === "string" ? [c, "Model"] : c;
    it(`does not hold: ${expression}`, () => expect(holds(expression, [scope])).toBe(false));
  }
  for (const [expression, says, scope] of FAILS) {
    it(`stops the rule: ${expression}`, () =>
      expect(reason(expression, [scope ?? "Model"])).toContain(says));
  }

  it("names a property pbiplint knows it cannot answer before running, even where no object reaches it", () => {
    expect(reason('false and GetAnnotation("Vertipaq_Cardinality") == null')).toContain(
      "needs statistics",
    );
    expect(reason("false and Visible", ["Measure"])).toContain("no property `Visible`");
  });

  it("matches names without regard to case, as Dynamic LINQ does", () => {
    expect(holds('name == "Model"')).toBe(true);
    expect(holds("tables.count() == 2")).toBe(true);
    expect(holds('OUTERIT.NAME == "Model"')).toBe(true);
  });

  it("runs once per object of every scope, in the view's order", () => {
    const o = outcome("true", ["Table", "DataColumn"]);
    expect(o.kind === "findings" && o.objects.map((x) => x.teName)).toEqual([
      "'Sales'",
      "'Customers'",
      "'Sales'[Amount]",
      "'Sales'[Customer Key]",
      "'Customers'[Customer Key]",
      "'Customers'[City]",
    ]);
  });

  it("leaves out an untyped calculated column under a DataType rule, and counts it", () => {
    expect(outcome('DataType == "String"', ["CalculatedColumn"])).toEqual({
      kind: "findings",
      objects: [],
      unset: 1,
    });
    const columns = outcome('DataType <> "String"', ["Column"]);
    expect(columns.kind === "findings" && columns.objects.length).toBe(3);
    expect(columns.kind === "findings" && columns.unset).toBe(1);
  });

  it("decides and and or past an unset value when the other side alone settles the answer", () => {
    const untyped = (expression: string) => outcome(expression, ["CalculatedColumn"]);
    const settled = untyped('DataType == "String" or true');
    expect(settled).toMatchObject({ kind: "findings", unset: 0 });
    expect(settled.kind === "findings" && settled.objects.length).toBe(1);
    expect(untyped('DataType == "String" and false')).toEqual({
      kind: "findings",
      objects: [],
      unset: 0,
    });
    // The other side does not settle it, or fails: the object stays out and is counted.
    expect(untyped('DataType == "String" or false')).toMatchObject({ unset: 1 });
    expect(untyped('DataType == "String" and true')).toMatchObject({ unset: 1 });
    expect(untyped('DataType == "String" or Convert.ToInt64("x") == 1')).toMatchObject({
      unset: 1,
    });
    expect(untyped('true and DataType == "String"')).toMatchObject({ unset: 1 });
    // A read on null on the right of `or`: with the real left value the object might be found,
    // so it is counted. Under `and` it passes whatever the left value is.
    expect(untyped('DataType == "String" or SortByColumn.Name == "x"')).toEqual({
      kind: "findings",
      objects: [],
      unset: 1,
    });
    expect(untyped('DataType == "String" and SortByColumn.Name == "x"')).toEqual({
      kind: "findings",
      objects: [],
      unset: 0,
    });
  });

  it("covers every entry of LIBRARY with a case written for the test", () => {
    const text = [...TRUE, ...FALSE, ...FAILS.map((f) => f[0]), ...OTHER_ENUMS.map((x) => x[0])]
      .map((c) => (typeof c === "string" ? c : c[0]))
      .join("\n");
    const missing: string[] = [];
    for (const [kind, list] of Object.entries(LIBRARY.methods))
      for (const e of list)
        if (!text.includes(`.${e.name}(`) && !(kind === "Object" && text.includes(`${e.name}(`)))
          missing.push(`${kind}.${e.name}`);
    for (const [type, list] of Object.entries(LIBRARY.statics))
      for (const e of list)
        if (!new RegExp(`${type}\\.${e.name}\\(`, "i").test(text))
          missing.push(`${type}.${e.name}`);
    for (const [type, values] of Object.entries(LIBRARY.staticValues))
      for (const name of Object.keys(values))
        if (!text.includes(`${type}.${name}`)) missing.push(`${type}.${name}`);
    for (const [kind, props] of Object.entries(LIBRARY.properties))
      for (const name of Object.keys(props))
        if (!text.includes(`.${name} `)) missing.push(`${kind}.${name}`);
    const enumCovered: Record<string, string> = {
      AggregateFunction: "SummarizeBy",
      RelationshipEndCardinality: "FromCardinality",
      DateTimeRelationshipBehavior: "JoinOnDateBehavior",
      PartitionSourceType: "SourceType",
      ModeType: "Mode",
      ColumnType: "Type.ToString()",
      DataSourceType: "DataSource.Type ==",
      MetadataPermission: "MetadataPermission",
      ModelPermission: "ModelPermission",
      PowerBIDataSourceVersion: "DefaultPowerBIDataSourceVersion",
      SummarizationType: "Summarization",
    };
    for (const name of Object.keys(LIBRARY.enums))
      if (!text.includes(`${name}.`) && !text.includes(enumCovered[name] ?? "\u0000"))
        missing.push(`enum ${name}`);
    expect(missing).toEqual([]);
  });

  it("gives every LIBRARY entry a description and types", () => {
    const all = [...Object.values(LIBRARY.methods), ...Object.values(LIBRARY.statics)].flat();
    for (const e of all) {
      expect(e.description.length, e.name).toBeGreaterThan(10);
      expect(e.description).not.toMatch(new RegExp(String.fromCharCode(0x2014)));
      expect(e.returns.length).toBeGreaterThan(0);
    }
  });
});

describe("enums on objects the small model lacks", () => {
  for (const [expression, scope, fixture] of OTHER_ENUMS) {
    it(`holds on ${fixture}: ${expression}`, () => {
      const parsed = parseTeExpression(expression);
      if ("error" in parsed) throw new Error(parsed.error);
      const o = evaluateTeRule(ruleOf(expression, [scope]), parsed.expr, viewOf(fixture));
      expect(o.kind === "findings" ? o.objects.length : o.reason).toBeGreaterThan(0);
    });
  }
});

// ---------------------------------------------------------------------------------------------
// The pull request A probes: every outcome Tabular Editor CLI 0.8.1.1 gave, on both fixtures.

interface ProbeResult {
  findings?: Record<string, string[]>;
  ruleErrors?: Record<string, string>;
  quiet?: string[];
  error?: string;
}
const probeCapture = (fixture: string) =>
  JSON.parse(
    readFileSync(`${repo}tests/expectations/custom-rules/probes/${fixture}.json`, "utf8"),
  ) as { results: Record<string, ProbeResult> };

/** Probe files pbiplint does not compare here, each with why. */
const SKIPPED_FILES: Record<string, string> = {
  "unknown-scope.json":
    "Tabular Editor refuses the whole file for an unknown scope; pbiplint refuses only that rule, and read.ts covers it",
};

/** Probes whose outcome differs from Tabular Editor's, by fixture, each with why. */
const PROBE_EXCEPTIONS: Record<string, Record<string, string>> = {
  "custom-rules": {
    PROBE_SCOPE_PERSPECTIVE:
      "Tabular Editor failed it on the malformed ignore annotation, which pull request C handles",
    PROBE_IGNORE_CUSTOM:
      "Tabular Editor skips the objects the ignore annotation names; pull request C reads the annotation",
    PROBE_IGNORE_CUSTOM_LOWER:
      "Tabular Editor skips the objects the ignore annotation names; pull request C reads the annotation",
    PROBE_VERTIPAQ_WITHOUT_STATISTICS:
      "better than the source by design: Tabular Editor reads a missing statistic as null and passes; pbiplint says the rule needs statistics",
    PROBE_NO_SCOPE:
      "the rule file reader reports a rule with no scope as a problem (read.ts covers it)",
  },
  "custom-rules-model-ignore": {
    PROBE_IGNORE_CUSTOM:
      "Tabular Editor skips every object for the model's ignore annotation; pull request C reads the annotation",
    PROBE_VERTIPAQ_WITHOUT_STATISTICS:
      "better than the source by design: Tabular Editor reads a missing statistic as null and passes; pbiplint says the rule needs statistics",
    PROBE_NO_SCOPE:
      "the rule file reader reports a rule with no scope as a problem (read.ts covers it)",
  },
};

const FIXTURES = ["custom-rules", "custom-rules-model-ignore"] as const;
const probeFiles = readdirSync(`${repo}tests/rules/te-probes`).filter((f) => f.endsWith(".json"));

/** Runs a rule as the engine will: a parse error is the rule not running. */
function runRule(rule: TeRule, view: TomView): TeOutcome {
  const parsed = parseTeExpression(rule.expression);
  if ("error" in parsed) return { kind: "could-not-run", reason: parsed.error };
  const result = evaluateTeRule(rule, parsed.expr, view);
  if (result.kind === "could-not-run") reasons.push(result.reason);
  return result;
}

describe("the pull request A probes reproduce Tabular Editor CLI 0.8.1.1", () => {
  for (const fixture of FIXTURES) {
    const view = viewOf(fixture);
    const capture = probeCapture(fixture);
    for (const file of probeFiles) {
      if (SKIPPED_FILES[file]) continue;
      const read = readTeRuleFile(readFileSync(`${repo}tests/rules/te-probes/${file}`, "utf8"));
      if ("error" in read) throw new Error(`${file}: ${read.error}`);
      const captured = capture.results[file]!;
      const ids = new Set([
        ...Object.keys(captured.findings ?? {}),
        ...Object.keys(captured.ruleErrors ?? {}),
        ...(captured.quiet ?? []),
      ]);
      for (const id of ids) {
        if (PROBE_EXCEPTIONS[fixture]?.[id]) continue;
        it(`${fixture}: ${file} ${id}`, () => {
          const rule = read.rules.find((r) => r.id === id);
          expect(rule, `${id} read`).toBeDefined();
          const got = runRule(rule!, view);
          if (captured.ruleErrors?.[id] !== undefined) {
            expect(got.kind, `${id}: Tabular Editor said ${captured.ruleErrors[id]}`).toBe(
              "could-not-run",
            );
          } else {
            if (got.kind !== "findings") throw new Error(`${id}: ${got.reason}`);
            expect(got.objects.map((o) => o.teName).sort()).toEqual(
              [...(captured.findings?.[id] ?? [])].sort(),
            );
          }
        });
      }
    }
  }

  it("lists only exceptions that differ", () => {
    for (const fixture of FIXTURES) {
      const view = viewOf(fixture);
      const capture = probeCapture(fixture);
      for (const id of Object.keys(PROBE_EXCEPTIONS[fixture]!)) {
        const file = probeFiles.find((f) => {
          const r = capture.results[f]!;
          return (
            r.findings?.[id] !== undefined ||
            r.ruleErrors?.[id] !== undefined ||
            (r.quiet ?? []).includes(id)
          );
        })!;
        const read = readTeRuleFile(readFileSync(`${repo}tests/rules/te-probes/${file}`, "utf8"));
        if ("error" in read) throw new Error(read.error);
        const rule = read.rules.find((r) => r.id === id);
        if (!rule) continue; // a problem of the reader, so nothing runs
        const got = runRule(rule, view);
        const r = capture.results[file]!;
        const same =
          r.ruleErrors?.[id] !== undefined
            ? got.kind === "could-not-run"
            : got.kind === "findings" &&
              JSON.stringify(got.objects.map((o) => o.teName).sort()) ===
                JSON.stringify([...(r.findings?.[id] ?? [])].sort());
        expect(same, `${fixture} ${id} matches, so it is no exception`).toBe(false);
      }
    }
  });

  it("the probe on a partition with no expression stops the rule naming the cause", () => {
    const view = viewOf("custom-rules");
    const o = runRule(ruleOf('RegEx.IsMatch(Expression, "Sql")', ["Partition"]), view);
    expect(o).toEqual({
      kind: "could-not-run",
      reason: "`RegEx.IsMatch` was given null as its input, on a Partition",
    });
  });
});

// ---------------------------------------------------------------------------------------------
// Nested collections on a big model reach the limit (plan, Review Focus 2).

describe("the evaluation limit", () => {
  it("stops a nested Any over 400 tables with the limit named", () => {
    const tables = Array.from({ length: 400 }, (_, i) =>
      [
        `table 'T${i}'`,
        `\tmeasure 'M${i}' = SUM('T${i}'[C0])`,
        ...Array.from({ length: 5 }, (_, c) => [
          `\tcolumn C${c}`,
          "\t\tdataType: int64",
          `\t\tsourceColumn: C${c}`,
          "",
        ]).flat(),
      ].join("\n"),
    );
    const view = buildTomView(modelFrom(["model Model", "", ...tables].join("\n")));
    const started = Date.now();
    const o = outcome(
      'Model.AllMeasures.Any(Model.AllColumns.Any(Name == "none" and outerIt.Name == "none"))',
      ["Measure"],
      view,
    );
    expect(o.kind).toBe("could-not-run");
    expect(o.kind === "could-not-run" && o.reason).toContain("reached the evaluation limit");
    expect(Date.now() - started).toBeLessThan(20_000);
  }, 30_000);

  const grow = (times: number) => '"aaaaaaaaaa"' + '.Replace("a", "aaaaaaaaaa")'.repeat(times);

  it("stops a string grown past the limit by chained Replace calls", () => {
    const started = Date.now();
    const o = outcome(`${grow(9)}.Length > 0`);
    expect(o.kind === "could-not-run" && o.reason).toContain("reached the evaluation limit");
    expect(Date.now() - started).toBeLessThan(2_000);
  });

  it("spends the length of each string that + and & build", () => {
    // Five Replace calls give a million characters; eight of them spend under nine million steps,
    // and joining them builds strings of two to eight million characters, over the limit in all.
    const eight = Array.from({ length: 8 }, () => `(${grow(5)})`);
    for (const op of [" + ", " & "]) {
      const o = outcome(`(${eight.join(op)}).Length > 0`);
      expect(o.kind === "could-not-run" && o.reason, op).toContain("reached the evaluation limit");
    }
  });

  it("spends the length of each string String.Concat builds", () => {
    // Eight strings of a million characters spend under nine million steps to build; the strings
    // String.Concat joins from them (four of two million, two of four, one of eight) take the
    // rule over the limit.
    const pair = `String.Concat(${grow(5)}, ${grow(5)})`;
    expect(holds(`String.Concat(${pair}, ${pair}).Length == 4000000`)).toBe(true);
    const o = outcome(
      `String.Concat(String.Concat(${pair}, ${pair}), String.Concat(${pair}, ${pair})).Length > 0`,
    );
    expect(o.kind === "could-not-run" && o.reason).toContain("reached the evaluation limit");
  });
});

// ---------------------------------------------------------------------------------------------
// Microsoft's rules on two captured fixtures: a quick check that the evaluator agrees with
// Tabular Editor on the large majority. Task B7 builds the full parity test.

/** Rules that do not match, by fixture, each with why. */
const STATISTICS =
  "better than the source by design: it reads a live model's statistics annotation, so pbiplint says it cannot run where Tabular Editor reads null and passes";
const STATISTICS_RULES = {
  "AVOID_BI-DIRECTIONAL_RELATIONSHIPS_AGAINST_HIGH-CARDINALITY_COLUMNS": STATISTICS,
  FIX_REFERENTIAL_INTEGRITY_VIOLATIONS: STATISTICS,
  LARGE_TABLES_SHOULD_BE_PARTITIONED: STATISTICS,
  "REDUCE_USAGE_OF_LONG-LENGTH_COLUMNS_WITH_HIGH_CARDINALITY": STATISTICS,
  SPLIT_DATE_AND_TIME: STATISTICS,
};
const MICROSOFT_DIFFERENCES: Record<string, Record<string, string>> = {
  "kitchen-sink": STATISTICS_RULES,
  "te3-zoo": STATISTICS_RULES,
};

describe("Microsoft's rules on kitchen-sink and te3-zoo", () => {
  for (const fixture of Object.keys(MICROSOFT_DIFFERENCES)) {
    it(`${fixture}: all but the listed rules match Tabular Editor`, () => {
      const view = viewOf(fixture);
      const capture = JSON.parse(
        readFileSync(`${repo}tests/expectations/${fixture}.json`, "utf8"),
      ) as { findings: Record<string, string[]> };
      const differ: Record<string, string> = {};
      for (const meta of BPA_RULES) {
        const rule: TeRule = {
          id: meta.id,
          name: meta.name,
          scopes: meta.scope.split(",").map((x) => x.trim()),
          expression: meta.expression,
          disabled: false,
        };
        const got = runRule(rule, view);
        const want = [...(capture.findings[meta.id] ?? [])].sort();
        const have = got.kind === "findings" ? got.objects.map((o) => o.teName).sort() : null;
        if (JSON.stringify(have) !== JSON.stringify(want))
          differ[meta.id] = got.kind === "findings" ? `found ${JSON.stringify(have)}` : got.reason;
      }
      expect(BPA_RULES).toHaveLength(71);
      expect(Object.keys(differ).sort()).toEqual(
        Object.keys(MICROSOFT_DIFFERENCES[fixture]!).sort(),
      );
    });
  }
});

// ---------------------------------------------------------------------------------------------
// What the survey's rule files showed (task B8), each against Tabular Editor's captures.

describe("what the survey's rule files showed", () => {
  const view = buildTomView(
    modelFrom(
      [
        "model Model",
        "\tculture: en-US",
        "",
        "table Sales",
        "\tmeasure Total = 1",
        "",
        "\tcolumn Amount",
        "\t\tdataType: int64",
        "\t\tsourceColumn: Amount",
        "",
        "table Hidden",
        "\tisHidden",
        "",
        "\tmeasure 'Hidden Total' = 2",
        "",
        "\tcolumn Code",
        "\t\tdataType: string",
        "\t\tsourceColumn: Code",
        "",
        "role Reader",
        "\tmodelPermission: read",
        "",
        "\ttablePermission Sales = [Total] > 0",
        "",
        "perspective Main",
        "\tperspectiveTable Sales",
        "",
        "cultureInfo en-US",
        "",
      ].join("\n"),
    ),
  );
  const found = (expression: string, scopes: string[], on = view) => {
    const o = outcome(expression, scopes, on);
    if (o.kind !== "findings") throw new Error(`${expression}: ${o.reason}`);
    return o.objects.map((x) => x.teName);
  };

  it("checks a rule against every type its scopes name, with or without objects of them", () => {
    // Tabular Editor failed these on fixtures with no calculation group, and no measure.
    expect(reason("Precedence <= 0", ["CalculationGroup"])).toContain(
      "CalculationGroupTable has no property `Precedence`",
    );
    expect(reason("Visible", ["Measure", "KPI"])).toContain("Measure has no property `Visible`");
    expect(reason('GetAnnotation("Vertipaq_RowCount") == null', ["KPI"])).toContain(
      "needs statistics",
    );
  });

  it("compares an enum only with a quoted name of one of its values, even where no object gets there", () => {
    expect(reason('false and DataType != ""', ["DataColumn"])).toBe(
      "compares a DataType with a string that names none of its values",
    );
    expect(holds('DataType == "int64"', ["DataColumn"])).toBe(true);
  });

  it("gives a calculation group's table the object type CalculationGroupTable", () => {
    const zoo = viewOf("te3-zoo");
    expect(
      found("ObjectType == ObjectType.CalculationGroupTable", ["CalculationGroup"], zoo),
    ).toEqual(["'Time Intelligence'"]);
    expect(found("ObjectType == ObjectType.CalculationGroupTable", ["Table"], zoo)).toEqual([]);
  });

  it("translates the model's own name and description, and looks a translation up by a culture", () => {
    expect(
      found("Model.Cultures.Any(string.IsNullOrEmpty(outerIt.TranslatedNames[it]))", ["Model"]),
    ).toEqual(["Model"]);
    expect(
      found('Model.Cultures.Any(outerIt.TranslatedDescriptions[it] == "")', ["Model"]),
    ).toEqual(["Model"]);
    expect(
      found("Model.Cultures.Any(string.IsNullOrEmpty(outerIt.TranslatedNames[it]))", ["Table"]),
    ).toEqual(["'Sales'", "'Hidden'"]);
  });

  it("lists the roles whose filters reference an object under ReferencedBy.Roles", () => {
    expect(found('ReferencedBy.Roles.Any(Name == "Reader")', ["Measure"])).toEqual(["[Total]"]);
  });

  it("gives a table that is not calculated a null Expression", () => {
    expect(found("Expression == null", ["Table"])).toEqual(["'Sales'", "'Hidden'"]);
  });

  it("ends an object's evaluation as no finding on a member read or call on null", () => {
    // Tabular Editor found nothing and failed nothing for this rule on every captured fixture.
    expect(found('RegEx.IsMatch(Expression.Replace(" ", ""), "x")', ["Table"])).toEqual([]);
    expect(found("SortByColumn.Name == null", ["DataColumn"])).toEqual([]);
    expect(found('not SortByColumn.Name.Contains("x")', ["DataColumn"])).toEqual([]);
  });

  it("hides a column with its table, leaves a measure visible, and shows a table with a visible measure", () => {
    expect(found("not IsVisible", ["DataColumn"])).toEqual(["'Hidden'[Code]"]);
    expect(found("IsVisible", ["Measure"])).toEqual(["[Total]", "[Hidden Total]"]);
    expect(found("IsVisible and IsHidden", ["Table"])).toEqual(["'Hidden'"]);
  });

  it("hides a hierarchy with its table", () => {
    const hidden = buildTomView(
      modelFrom(
        [
          "model Model",
          "",
          "table Dates",
          "\tisHidden",
          "",
          "\tcolumn Year",
          "\t\tdataType: int64",
          "\t\tsourceColumn: Year",
          "",
          "\thierarchy 'Date Hierarchy'",
          "\t\tlevel Year",
          "\t\t\tcolumn: Year",
          "",
        ].join("\n"),
      ),
    );
    expect(found("IsHidden", ["Hierarchy"], hidden)).toEqual([]);
    expect(found("not IsVisible", ["Hierarchy"], hidden)).toEqual(["Date Hierarchy"]);
  });

  it("gives a perspective its translations", () => {
    expect(
      found("Model.Cultures.Any(string.IsNullOrEmpty(outerIt.TranslatedNames[it]))", [
        "Perspective",
      ]),
    ).toEqual(["Main"]);
    expect(found('TranslatedDescriptions["en-US"] == ""', ["Perspective"])).toEqual(["Main"]);
  });
});

// ---------------------------------------------------------------------------------------------
// Reasons never quote the model (spec section 6.7). Runs last, over every reason above.

describe("reasons", () => {
  it("never hold a table, column or measure name of the fixtures", () => {
    expect(reasons.length).toBeGreaterThan(40);
    const names = new Set<string>();
    for (const fixture of [...FIXTURES, "kitchen-sink", "te3-zoo"]) {
      const view = viewOf(fixture);
      for (const t of view.model.tables) {
        names.add(t.name);
        for (const c of t.columns) names.add(c.name);
        for (const m of t.measures) names.add(m.name);
      }
    }
    for (const t of SMALL.model.tables) {
      names.add(t.name);
      for (const c of t.columns) names.add(c.name);
    }
    // A name counts where it stands as a word: `Date` inside `DateTimeWithHourMinSec`, a name
    // from the rule's own text, is not the column `Date`.
    const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const asWord = (n: string) =>
      new RegExp(`(?<![\\p{L}\\p{N}_])${escape(n)}(?![\\p{L}\\p{N}_])`, "u");
    const hits = reasons.flatMap((r) =>
      [...names].filter((n) => asWord(n).test(r)).map((n) => `${n} in: ${r}`),
    );
    expect(hits).toEqual([]);
  });
});
