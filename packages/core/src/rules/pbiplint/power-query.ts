import { Language } from "@microsoft/powerquery-parser";
import {
  callOf,
  calls,
  identifierName,
  type MCall,
  nodesOfKind,
  nodesWithin,
  parentOf,
  textLiterals,
  textValue,
  unwrap,
} from "../../m/ast.js";
import { boundValue, origin, resolve } from "../../m/resolve.js";
import type { MIndex, MQuery } from "../../m/types.js";
import { msg, type Message } from "../../messages/format.js";
import { tableRef } from "../../model/names.js";
import type { Partition } from "../../model/types.js";
import { finding } from "../helpers.js";
import { eachQuery, mFinding, queryLabel } from "../m-helpers.js";
import type { Rule } from "../types.js";
import { pbiplintRule } from "./define.js";
import { isRealDay } from "./period-forms.js";
import { isoDay } from "./periods.js";

type Node = Language.Ast.TNode;
const Kind = Language.Ast.NodeKind;

/** Text that starts with a drive letter, a colon, and a slash either way: `C:\Data`, `d:/Exports`. */
const DRIVE_PATH = /^([A-Za-z]):[\\/]/;

// Any text literal in any query, a parameter's value included (v3 spec, section 9.6). A network
// path (\\server\share), a web or file: address, a comment, and a path joined at refresh time are
// left alone. Only the drive is named: a path under C:\Users\ carries an account name, which an
// export need not repeat.
export const LOCAL_DRIVE_PATH = pbiplintRule({
  id: "LOCAL_DRIVE_PATH",
  name: "Path on a local drive",
  category: "Error Prevention",
  severity: 2,
  scope: ["Partition", "NamedExpression", "Table"],
  layer: "powerquery",
  check: (_project, { indexes: { m }, ...ctx }) =>
    eachQuery(ctx, m.queries, (q) =>
      textLiterals(q).flatMap(({ node, value }) => {
        const drive = DRIVE_PATH.exec(value);
        return drive
          ? [mFinding(m, q, node, msg("LOCAL_DRIVE_PATH", { drive: drive[1]!.toUpperCase() }))]
          : [];
      }),
    ),
});

/** The script functions, and the language each one runs, as SCRIPT_IN_QUERY's message selects it. */
const SCRIPT_LANGUAGE: ReadonlyMap<string, "python" | "r"> = new Map([
  ["Python.Execute", "python"],
  ["R.Execute", "r"],
]);

// A call, as the Run Python script and Run R script steps write it (v3 spec, section 9.9). Python
// and R visuals live in the report, not in M, and are not read.
export const SCRIPT_IN_QUERY = pbiplintRule({
  id: "SCRIPT_IN_QUERY",
  name: "Python or R script in a query",
  category: "Error Prevention",
  severity: 2,
  scope: ["Partition", "NamedExpression", "Table"],
  layer: "powerquery",
  check: (_project, { indexes: { m }, ...ctx }) =>
    eachQuery(ctx, m.queries, (q) =>
      calls(q).flatMap((c) => {
        const language = SCRIPT_LANGUAGE.get(c.name);
        return language ? [mFinding(m, q, c.node, msg("SCRIPT_IN_QUERY", { language }))] : [];
      }),
    ),
});

/** `true` as M writes it, with any parentheses or `meta` taken off. */
function isTrue(node: Node | undefined): boolean {
  const n = node && unwrap(node);
  return (
    n?.kind === Kind.LiteralExpression &&
    n.literalKind === Language.Ast.LiteralKind.Logical &&
    n.literal === "true"
  );
}

/** Excel.Workbook's second argument when it asks for headers: `true`, or a record written in the call with `UseHeaders = true`. */
function promotesHeaders(arg: Node | undefined): boolean {
  if (arg === undefined) return false;
  const a = unwrap(arg);
  if (isTrue(a)) return true;
  if (a.kind !== Kind.RecordExpression && a.kind !== Kind.RecordLiteral) return false;
  return a.content.elements.some(
    (csv) => identifierName(csv.node.key.literal) === "UseHeaders" && isTrue(csv.node.value),
  );
}

// Desktop's own call, Excel.Workbook(File.Contents(...), null, true), leaves useHeaders unset and
// sets delayTypes, and is left alone (v3 spec, section 9.12). Only a value written in the call is
// read.
export const EXCEL_USE_HEADERS = pbiplintRule({
  id: "EXCEL_USE_HEADERS",
  name: "Excel headers promoted by the workbook reader",
  category: "Error Prevention",
  severity: 1,
  scope: ["Partition", "NamedExpression", "Table"],
  layer: "powerquery",
  check: (_project, { indexes: { m }, ...ctx }) =>
    eachQuery(ctx, m.queries, (q) =>
      calls(q)
        .filter((c) => c.name === "Excel.Workbook" && promotesHeaders(c.args[1]))
        .map((c) => mFinding(m, q, c.node, msg("EXCEL_USE_HEADERS"))),
    ),
});

/**
 * The databases Power BI has a connector for, by what an ODBC driver's or an OLE DB provider's
 * name holds, any case (v3 spec, section 9.15), each as ODBC_WHERE_CONNECTOR_EXISTS's message
 * selects it, which holds the connector's name and its article. Kept small on purpose.
 */
const NATIVE_CONNECTORS: readonly {
  pattern: RegExp;
  connector: "amazonRedshift" | "postgreSql" | "sqlServer" | "mySql" | "oracle" | "snowflake";
}[] = [
  { pattern: /amazon redshift/i, connector: "amazonRedshift" },
  { pattern: /postgresql/i, connector: "postgreSql" },
  { pattern: /sql server|sqlncli|sqloledb|msoledbsql/i, connector: "sqlServer" },
  { pattern: /mysql/i, connector: "mySql" },
  { pattern: /oracle/i, connector: "oracle" },
  { pattern: /snowflake/i, connector: "snowflake" },
];

/**
 * The generic sources, as the message selects each: ODBC, whose connection names a driver, and
 * OLE DB, whose connection names a provider.
 */
const GENERIC_SOURCES: ReadonlyMap<string, "odbc" | "oleDb"> = new Map([
  ["Odbc.DataSource", "odbc"],
  ["OleDb.DataSource", "oleDb"],
]);

/** The value of a connection string's `Driver=` or `Provider=` part, its key in any case, braces taken off. */
function driverOf(connection: string): string | undefined {
  for (const part of connection.split(";")) {
    const eq = part.indexOf("=");
    if (eq < 0) continue;
    const key = part.slice(0, eq).trim().toLowerCase();
    if (key === "driver" || key === "provider")
      return part
        .slice(eq + 1)
        .trim()
        .replace(/^\{|\}$/g, "");
  }
  return undefined;
}

/**
 * A connection string written in the call, or held as text by the `let` step or the model
 * parameter a name resolves to. Nothing further is followed, and a record is not read.
 */
function connectionText(m: MIndex, q: MQuery, arg: Node | undefined): string | undefined {
  if (arg === undefined) return undefined;
  const a = unwrap(arg);
  if (a.kind !== Kind.IdentifierExpression) return textValue(a);
  const r = resolve(m, q, a);
  if (r.kind === "value") return textValue(unwrap(r.node));
  if (r.kind === "modelParameter") return textValue(unwrap(r.value));
  return undefined;
}

// A connection string that names only a DSN says nothing of the driver behind it, and is left
// alone (v3 spec, section 9.15).
export const ODBC_WHERE_CONNECTOR_EXISTS = pbiplintRule({
  id: "ODBC_WHERE_CONNECTOR_EXISTS",
  name: "ODBC or OLE DB where Power BI has a connector",
  category: "Performance",
  severity: 1,
  scope: ["Partition", "NamedExpression", "Table"],
  layer: "powerquery",
  check: (_project, { indexes: { m }, ...ctx }) =>
    eachQuery(ctx, m.queries, (q) =>
      calls(q).flatMap((c) => {
        const kind = GENERIC_SOURCES.get(c.name);
        if (!kind) return [];
        const driver = driverOf(connectionText(m, q, c.args[0]) ?? "");
        const native =
          driver === undefined ? undefined : NATIVE_CONNECTORS.find((n) => n.pattern.test(driver));
        return native
          ? [
              mFinding(
                m,
                q,
                c.node,
                msg("ODBC_WHERE_CONNECTOR_EXISTS", { kind, connector: native.connector }),
              ),
            ]
          : [];
      }),
    ),
});

// Reads no M: Ignore the Privacy Levels is a Power Query option, saved in model.tmdl (v3 spec,
// section 9.8). legacyRedirects and returnErrorValuesAsNull, which Desktop writes by default, are
// left alone.
export const PRIVACY_LEVELS_IGNORED = pbiplintRule({
  id: "PRIVACY_LEVELS_IGNORED",
  name: "Privacy levels ignored for this file",
  category: "Error Prevention",
  severity: 2,
  scope: ["Model"],
  layer: "powerquery",
  check: ({ model }) => {
    const fastCombine = model?.dataAccessOptions?.flags.find((f) => f.name === "fastcombine");
    return model && fastCombine
      ? [
          {
            ...finding.model(model),
            location: fastCombine.location,
            message: msg("PRIVACY_LEVELS_IGNORED"),
          },
        ]
      : [];
  },
});

/** A `null` written as an argument, which M's table functions read as the argument left out. */
const isNull = (n: Node | undefined): boolean =>
  n !== undefined &&
  unwrap(n).kind === Kind.LiteralExpression &&
  (unwrap(n) as Language.Ast.LiteralExpression).literalKind === Language.Ast.LiteralKind.Null;

/** An `Order.Ascending` or `Order.Descending` written as itself. */
const isOrder = (n: Node | undefined): boolean => {
  const v = n && unwrap(n);
  return (
    v?.kind === Kind.IdentifierExpression &&
    /^Order\.(Ascending|Descending)$/.test(identifierName(v.identifier.literal))
  );
};

/** The items of a list written in place; undefined for anything else. */
function listItems(n: Node | undefined): Node[] | undefined {
  const v = n && unwrap(n);
  return v?.kind === Kind.ListExpression ? v.content.elements.map((csv) => csv.node) : undefined;
}

/**
 * A Table.Sort's columns, read from a text literal, a list of text literals, and `{column, order}`
 * pairs, a bare `{"Col", Order.Descending}` included; undefined for anything else.
 */
function sortColumns(n: Node | undefined): string[] | undefined {
  const one = textValue(n && unwrap(n));
  if (one !== undefined) return [one];
  const items = listItems(n);
  if (!items) return undefined;
  if (items.length === 2 && isOrder(items[1])) {
    const col = textValue(unwrap(items[0]!));
    return col === undefined ? undefined : [col];
  }
  const columns: string[] = [];
  for (const item of items) {
    const pair = listItems(item);
    const col = pair
      ? pair.length === 2 && isOrder(pair[1])
        ? textValue(unwrap(pair[0]!))
        : undefined
      : textValue(unwrap(item));
    if (col === undefined) return undefined;
    columns.push(col);
  }
  return columns;
}

/**
 * Whether every sort column is one of the Table.Distinct columns, by exact name, with the distinct
 * list all text literals and no comparer. Every row in a set of duplicates then ties on the sort,
 * so it cannot choose between them. Anything not read this way is false.
 */
function sortWithinKeys(sortArg: Node | undefined, distinctArg: Node): boolean {
  const keys = listItems(distinctArg)?.map((k) => textValue(unwrap(k)));
  if (!keys || keys.some((k) => k === undefined)) return false;
  const sorted = sortColumns(sortArg);
  return sorted !== undefined && sorted.length > 0 && sorted.every((c) => keys.includes(c));
}

// Desktop's Sorted Rows then Removed Duplicates, with a column list deciding what is a duplicate
// (v3 spec, section 9.2). The sort is the intended way to choose the row that survives; the fault
// is that nothing holds its order. A sort held by Table.Buffer, a distinct over whole rows, and a
// sort with other steps between are left alone, as is a sort only on the duplicate keys, which
// cannot choose between duplicates (amended October 13, 2026).
export const SORT_NOT_HELD_FOR_REMOVE_DUPLICATES = pbiplintRule({
  id: "SORT_NOT_HELD_FOR_REMOVE_DUPLICATES",
  name: "Sort may not decide which duplicate is kept",
  category: "Error Prevention",
  severity: 2,
  scope: ["Partition", "NamedExpression", "Table"],
  layer: "powerquery",
  check: (_project, { indexes: { m }, ...ctx }) =>
    eachQuery(ctx, m.queries, (q) =>
      calls(q).flatMap((c) => {
        const [table, columns] = c.args;
        if (c.name !== "Table.Distinct" || !table || !columns || isNull(columns)) return [];
        const sorted = boundValue(m, q, table);
        const sortCall = callOf(sorted.node);
        if (sortCall?.name !== "Table.Sort" || sortWithinKeys(sortCall.args[1], columns)) return [];
        const sort =
          sorted.step === undefined
            ? msg("SORT_NOT_HELD_FOR_REMOVE_DUPLICATES.sortInside")
            : msg("SORT_NOT_HELD_FOR_REMOVE_DUPLICATES.sortStep", {
                step: tableRef(sorted.step),
              });
        return [mFinding(m, q, c.node, msg("SORT_NOT_HELD_FOR_REMOVE_DUPLICATES", { sort }))];
      }),
    ),
});

/** A number written in place, as M reads it; undefined for anything else. */
function numberLiteral(n: Node): number | undefined {
  const v = unwrap(n);
  return v.kind === Kind.LiteralExpression && v.literalKind === Language.Ast.LiteralKind.Numeric
    ? Number(v.literal)
    : undefined;
}

/** A table that is a Table.Sort, or a Table.Buffer of one, written in place or held by a step. */
function isSorted(m: MIndex, q: MQuery, table: Node): boolean {
  let c = callOf(boundValue(m, q, table).node);
  if (c?.name === "Table.Buffer" && c.args[0]) c = callOf(boundValue(m, q, c.args[0]).node);
  return c?.name === "Table.Sort";
}

/** Whether a node sits inside an `each` or a function, where it runs once per row or per call. */
function inFunction(q: MQuery, node: Node): boolean {
  for (let n = parentOf(q, node); n; n = parentOf(q, n))
    if (n.kind === Kind.EachExpression || n.kind === Kind.FunctionExpression) return true;
  return false;
}

// Keep First Rows left in a query that loads: a partition's, or a refresh policy's that is read
// (v3 spec, section 9.11). A count of 0 or 1, a top N after a sort, a count that is not written
// in place, a top N per group, and shared expressions, which do not load, are left alone.
export const KEEP_FIRST_ROWS_LEFT_IN = pbiplintRule({
  id: "KEEP_FIRST_ROWS_LEFT_IN",
  name: "Keep First Rows left in a loaded query",
  category: "Error Prevention",
  severity: 2,
  scope: ["Partition", "NamedExpression", "Table"],
  layer: "powerquery",
  check: (_project, { indexes: { m }, ...ctx }) =>
    eachQuery(
      ctx,
      m.queries.filter((q) => q.kind !== "expression"),
      (q) =>
        calls(q).flatMap((c) => {
          const [table, count] = c.args;
          if (c.name !== "Table.FirstN" || !table || !count) return [];
          const n = numberLiteral(count);
          if (n === undefined || n <= 1 || isSorted(m, q, table) || inFunction(q, c.node))
            return [];
          return [mFinding(m, q, c.node, msg("KEEP_FIRST_ROWS_LEFT_IN", { count: n }))];
        }),
    ),
});

type RangeParameter = "RangeStart" | "RangeEnd";

/**
 * The incremental refresh parameter one side of a comparison reads: the model's `RangeStart` or
 * `RangeEnd`, written as itself, through steps that hold it, or inside a call
 * (`DateKey(RangeStart)`). A local name that shadows the parameter is not it.
 */
function rangeParameterOf(m: MIndex, q: MQuery, side: Node, depth = 0): RangeParameter | undefined {
  const v = boundValue(m, q, side).node;
  if (v.kind === Kind.IdentifierExpression) {
    const r = resolve(m, q, v);
    const name = r.kind === "modelParameter" ? r.query.name : undefined;
    return name === "RangeStart" || name === "RangeEnd" ? name : undefined;
  }
  const c = callOf(v);
  if (!c || depth > 8) return undefined;
  for (const a of c.args) {
    const found = rangeParameterOf(m, q, a, depth + 1);
    if (found) return found;
  }
  return undefined;
}

/** A relational operator read the other way round: `RangeStart <= [Date]` is `[Date] >= RangeStart`. */
const FLIPPED: Readonly<Record<string, string>> = { "<": ">", "<=": ">=", ">": "<", ">=": "<=" };

// Microsoft asks for an equals sign on one of RangeStart and RangeEnd, not both (v3 spec, section
// 9.4). A query whose comparisons with the two include both bounds, or neither, is an error: a row
// on the boundary lands in two partitions, or in none. Comparisons of both kinds on one parameter
// are left alone, since which one filters cannot be told.
export const INCREMENTAL_REFRESH_RANGE_BOUNDS = pbiplintRule({
  id: "INCREMENTAL_REFRESH_RANGE_BOUNDS",
  name: "Incremental refresh filter counts a boundary row twice or never",
  category: "Error Prevention",
  severity: 3,
  scope: ["Partition", "NamedExpression", "Table"],
  layer: "powerquery",
  check: (_project, { indexes: { m }, ...ctx }) =>
    eachQuery(ctx, m.queries, (q) => {
      const start = { inclusive: [] as Node[], exclusive: [] as Node[] };
      const end = { inclusive: [] as Node[], exclusive: [] as Node[] };
      for (const node of nodesOfKind(q, Kind.RelationalExpression)) {
        if (node.kind !== Kind.RelationalExpression) continue;
        const left = rangeParameterOf(m, q, node.left);
        const right = rangeParameterOf(m, q, node.right);
        if ((left === undefined) === (right === undefined)) continue;
        const op = node.operatorConstant.constantKind as string;
        // Read as "column, operator, parameter".
        const operator = right ? op : FLIPPED[op]!;
        const parameter = right ?? left;
        if (parameter === "RangeStart" && operator === ">=") start.inclusive.push(node);
        else if (parameter === "RangeStart" && operator === ">") start.exclusive.push(node);
        else if (parameter === "RangeEnd" && operator === "<=") end.inclusive.push(node);
        else if (parameter === "RangeEnd" && operator === "<") end.exclusive.push(node);
      }
      const one = (b: typeof start) => b.inclusive.length > 0 !== b.exclusive.length > 0;
      if (!one(start) || !one(end)) return [];
      if (start.inclusive.length > 0 && end.inclusive.length > 0)
        return [
          mFinding(m, q, end.inclusive[0]!, msg("INCREMENTAL_REFRESH_RANGE_BOUNDS.bothInclude")),
        ];
      if (start.exclusive.length > 0 && end.exclusive.length > 0)
        return [
          mFinding(
            m,
            q,
            start.exclusive[0]!,
            msg("INCREMENTAL_REFRESH_RANGE_BOUNDS.neitherIncludes"),
          ),
        ];
      return [];
    }),
});

/** The constructors of a fixed date. */
const DATE_CONSTRUCTORS: ReadonlySet<string> = new Set(["#date", "#datetime", "#datetimezone"]);

/** A whole number written in place, with a sign if it has one. */
function wholeNumber(n: Node): number | undefined {
  const v = unwrap(n);
  if (v.kind === Kind.UnaryExpression) {
    const inner = numberLiteral(v.typeExpression);
    const signs = v.operators.elements.map((o) => o.constantKind as string);
    if (inner === undefined || signs.some((s) => s !== "-" && s !== "+")) return undefined;
    return signs.filter((s) => s === "-").length % 2 ? -inner : inner;
  }
  const value = numberLiteral(v);
  return value !== undefined && Number.isInteger(value) ? value : undefined;
}

/**
 * A `#date`, `#datetime`, or `#datetimezone` of numbers written in place, as the ISO day it names
 * (`2025-12-31`). A day M refuses, past its month's end or in a year outside 1 to 9999, names none:
 * such a query fails to refresh rather than going stale.
 */
function fixedDate(n: Node): string | undefined {
  const c = callOf(unwrap(n));
  if (!c || !DATE_CONSTRUCTORS.has(c.name) || c.args.length < 3) return undefined;
  const parts = c.args.map(wholeNumber);
  if (parts.some((p) => p === undefined)) return undefined;
  const [year, month, day] = parts as [number, number, number];
  return year >= 1 && year <= 9999 && isRealDay(year, month, day)
    ? isoDay({ year, month, day })
    : undefined;
}

/**
 * What a filter does with a fixed date, by the operator read as "column, operator, date", as
 * FIXED_DATE_IN_ROW_FILTER's message selects it. A date left out with `<>`, such as a placeholder
 * or a holiday, does not go stale and is not read.
 */
const FIXED_DATE_USE: Readonly<Record<string, "endsAt" | "matches">> = {
  "<": "endsAt",
  "<=": "endsAt",
  "=": "matches",
};

/** Whether a filter's condition reads the model's RangeStart or RangeEnd anywhere. */
function readsRange(m: MIndex, q: MQuery, condition: Node): boolean {
  return nodesWithin(q, condition, Kind.IdentifierExpression).some(
    (n) => rangeParameterOf(m, q, n) !== undefined,
  );
}

/**
 * A partition of a table with more than one M partition: a slice of the table cut by hand, whose
 * fixed range is the point.
 */
function isHandPartition(q: MQuery): boolean {
  if (q.kind !== "partition") return false;
  const p = q.owner as Partition;
  return p.table.partitions.filter((x) => x.sourceType === "m").length > 1;
}

// A row filter whose end, or equality, is a fixed date goes stale without an error (v3 spec,
// section 9.16, amended), as HARDCODED_PERIOD_IN_DAX says of DAX. A fixed start is normal history,
// and a filter on the incremental refresh range and a table partitioned by hand are left alone.
export const FIXED_DATE_IN_ROW_FILTER = pbiplintRule({
  id: "FIXED_DATE_IN_ROW_FILTER",
  name: "Fixed date in a row filter",
  category: "Maintenance",
  severity: 1,
  scope: ["Partition", "NamedExpression", "Table"],
  layer: "powerquery",
  check: (_project, { indexes: { m }, ...ctx }) =>
    eachQuery(
      ctx,
      m.queries.filter((q) => !isHandPartition(q)),
      (q) => {
        const reported = new Set<number>();
        return calls(q).flatMap((c) => {
          const condition = c.args[1];
          if (c.name !== "Table.SelectRows" || !condition || readsRange(m, q, condition)) return [];
          return nodesWithin(
            q,
            condition,
            Kind.RelationalExpression,
            Kind.EqualityExpression,
          ).flatMap((node) => {
            if (node.kind !== Kind.RelationalExpression && node.kind !== Kind.EqualityExpression)
              return [];
            const onLeft = fixedDate(node.left);
            const onRight = fixedDate(node.right);
            if ((onLeft === undefined) === (onRight === undefined)) return [];
            const op = node.operatorConstant.constantKind as string;
            const use = FIXED_DATE_USE[onRight ? op : (FLIPPED[op] ?? op)];
            const date = unwrap(onRight ? node.right : node.left);
            if (!use || reported.has(date.id)) return [];
            reported.add(date.id);
            return [
              mFinding(
                m,
                q,
                date,
                msg("FIXED_DATE_IN_ROW_FILTER", { use, date: (onRight ?? onLeft)! }),
              ),
            ];
          });
        });
      },
    ),
});

/** Power BI Desktop's default step names in English, each with or without a number after it. */
const DEFAULT_STEP = new RegExp(
  "^(?:(?:" +
    [
      "Changed Type",
      "Changed Type with Locale",
      "Promoted Headers",
      "Removed Columns",
      "Removed Other Columns",
      "Renamed Columns",
      "Reordered Columns",
      "Filtered Rows",
      "Sorted Rows",
      "Removed Duplicates",
      "Grouped Rows",
      "Merged Queries",
      "Appended Query",
      "Added Custom",
      "Added Conditional Column",
      "Added Index",
      "Duplicated Column",
      "Replaced Value",
      "Pivoted Column",
      "Unpivoted Columns",
      "Unpivoted Other Columns",
      "Split Column by Delimiter",
      "Removed Top Rows",
      "Removed Bottom Rows",
      "Removed Blank Rows",
      "Removed Alternate Rows",
      "Removed Errors",
      "Kept First Rows",
      "Kept Range of Rows",
      "Trimmed Text",
      "Cleaned Text",
      "Uppercased Text",
      "Lowercased Text",
      "Capitalized Each Word",
      "Transposed Table",
      "Filled Down",
      "Filled Up",
      "Invoke Custom Function",
      "Custom",
    ].join("|") +
    ")\\d*|(?:Expanded|Inserted|Extracted|Calculated)(?:\\d*| .*))$",
);

// Once per query, on its first such step, with the count (v3 spec, section 9.13): a shape Desktop
// writes by default, reported per step, would bury everything else. Only the outermost let's
// steps are read; Source and Navigation name what they are.
export const DEFAULT_STEP_NAMES = pbiplintRule({
  id: "DEFAULT_STEP_NAMES",
  name: "Steps keep Power Query's default names",
  category: "Maintenance",
  severity: 1,
  scope: ["Partition", "NamedExpression", "Table"],
  layer: "powerquery",
  check: (_project, { indexes: { m }, ...ctx }) =>
    eachQuery(ctx, m.queries, (q) => {
      const root = q.ast && unwrap(q.ast);
      if (root?.kind !== Kind.LetExpression) return [];
      const steps = root.variableList.elements
        .map((csv) => csv.node)
        .filter((pair) => DEFAULT_STEP.test(identifierName(pair.key.literal)));
      if (steps.length === 0) return [];
      const [a, b] = steps.map((pair) => tableRef(identifierName(pair.key.literal)));
      const what =
        steps.length === 1
          ? msg("DEFAULT_STEP_NAMES.one", { step: a! })
          : msg("DEFAULT_STEP_NAMES.several", { count: steps.length, steps: [a!, b!] });
      // The message names the query only: the steps it lists say where.
      return [
        {
          ...mFinding(m, q, steps[0]!, what),
          message: msg("query.finding", { query: queryLabel(q), finding: what }),
        },
      ];
    }),
});

/**
 * The functions whose first argument is the address of a data source (v3 spec, section 9.3), and
 * what each calls it: a path, an address, a connection string, or a server.
 */
const DATA_SOURCE =
  /^(?:(File\.Contents|Folder\.(?:Files|Contents))|(Web\.Contents|OData\.Feed|SharePoint\.(?:Files|Contents|Tables)|AzureStorage\.(?:Blobs|DataLake))|((?:Odbc|OleDb)\.(?:DataSource|Query))|Sql\.Databases?|Oracle\.Database|PostgreSQL\.Database|MySQL\.Database|Snowflake\.Databases|AnalysisServices\.Databases?|Databricks\.Catalogs|DB2\.Database|Teradata\.Database|SapHana\.Database)$/;

// A data source whose address is read from the rows, built by a function call, chosen with an if,
// or a custom function's parameter cannot refresh in the service (v3 spec, section 9.3; the last two
// from Michael's Desktop check of October 13, 2026). Only the first argument is read, so
// Web.Contents' RelativePath and Query options, Microsoft's route for a dynamic request to a static
// address, are left alone, as are literals, parameters, and joins of them.
export const DYNAMIC_DATA_SOURCE = pbiplintRule({
  id: "DYNAMIC_DATA_SOURCE",
  name: "Data source the service can't refresh",
  category: "Error Prevention",
  severity: 3,
  scope: ["Partition", "NamedExpression", "Table"],
  layer: "powerquery",
  check: (_project, { indexes: { m }, ...ctx }) =>
    eachQuery(ctx, m.queries, (q) =>
      calls(q).flatMap((c) => {
        const source = DATA_SOURCE.exec(c.name);
        const o = source && c.args[0] ? origin(m, q, c.args[0]) : "static";
        if (o === "static" || o === "unknown") return [];
        // What the function calls its source, and how it is made, as the message selects each.
        const noun = source![1]
          ? "path"
          : source![2]
            ? "address"
            : source![3]
              ? "connectionString"
              : "server";
        return [
          mFinding(
            m,
            q,
            c.node,
            msg("DYNAMIC_DATA_SOURCE", { function: c.name, source: noun, how: o }),
          ),
        ];
      }),
    ),
});

/** A text literal a value stands for: written in place, or held by a step or a model parameter. */
interface HeldText {
  node: Node;
  query: MQuery;
  value: string;
  /** Reached through a name, so the literal sits in a step or a parameter of its own. */
  named: boolean;
}

/**
 * The text a value holds: a literal written in place, or the literal a name stands for through
 * `let` steps or a model parameter. Nothing further is followed.
 */
function heldText(m: MIndex, q: MQuery, node: Node): HeldText | undefined {
  const v = boundValue(m, q, node).node;
  const named = v !== unwrap(node);
  const text = textValue(v);
  if (text !== undefined) return { node: v, query: q, value: text, named };
  const r = resolve(m, q, v);
  const p = r.kind === "modelParameter" ? unwrap(r.value) : undefined;
  const value = textValue(p);
  return p && value !== undefined && r.kind === "modelParameter"
    ? { node: p, query: r.query, value, named: true }
    : undefined;
}

/**
 * The parts of a value joined with `&`, in order; the value itself when it is not a join. Read in a
 * loop over a stack, since a join of thousands of parts is a tree as deep (v3 spec, section 8).
 */
function joined(n: Node): Node[] {
  const out: Node[] = [];
  const stack = [n];
  while (stack.length > 0) {
    const v = unwrap(stack.pop()!);
    if (v.kind === Kind.ArithmeticExpression && v.operatorConstant.constantKind === "&")
      stack.push(v.right, v.left);
    else out.push(v);
  }
  return out;
}

/**
 * The texts a header's or a field's value holds. A value joined with `&` is read as its literals
 * joined, located on the first of them, and each name in it as the text that name holds.
 */
function heldTexts(m: MIndex, q: MQuery, node: Node): HeldText[] {
  const parts = joined(node);
  const literals = parts.filter((p) => textValue(p) !== undefined);
  const out: HeldText[] = literals[0]
    ? [{ node: literals[0], query: q, value: literals.map(textValue).join(""), named: false }]
    : [];
  for (const p of parts)
    if (p.kind === Kind.IdentifierExpression) {
      const held = heldText(m, q, p);
      if (held) out.push(held);
    }
  return out;
}

/** A placeholder written where a credential would go (v3 spec, section 9.5). */
const PLACEHOLDER = /^(<.*>|\{.*\}|x{3,}.*|\*{3,}.*|your.*|placeholder|null|none|test|demo)$/i;
/**
 * Whether text holds a credential: 8 characters or more once a scheme word before it, such as
 * `Bearer `, is left off; no space left in it, which prose such as `Enter your key here` has; and
 * no placeholder.
 */
const isCredential = (value: string): boolean => {
  const v = value.trim().replace(/^\S+ (?=\S+$)/, "");
  return v.length >= 8 && !/\s/.test(v) && !PLACEHOLDER.test(v);
};

/** The headers that carry a credential, in any case. */
const SECRET_HEADER =
  /^(?:authorization|x-api-key|api-?key|ocp-apim-subscription-key|x-auth-token|x-functions-key)$/i;
/** The `Query` record's fields that carry one, in any case. */
const SECRET_FIELD =
  /^(?:api_?key|key|access_token|token|client_secret|secret|password|code|subscription-key)$/i;
/** A web address's parameters that carry one: the same names, and a signature's. */
const SECRET_PARAMETER =
  /[?&](api_?key|key|access_token|token|client_secret|secret|password|code|subscription-key|sig|signature)=([^&#]*)/gi;
/** The functions whose connection string's `Password=` or `Pwd=` part is read. */
const CONNECTION_STRING = /^(?:Odbc|OleDb)\.(?:DataSource|Query)$/;

/** The fields of a record written in place, or held by a step, by their M names. */
function recordFields(
  m: MIndex,
  q: MQuery,
  node: Node | undefined,
): { name: string; value: Node }[] {
  const v = node && boundValue(m, q, node).node;
  return v?.kind === Kind.RecordExpression
    ? v.content.elements.map((csv) => ({
        name: identifierName(csv.node.key.literal),
        value: csv.node.value,
      }))
    : [];
}

/**
 * A credential and where a finding says it is, as a message whose parameters are M's own names
 * and the query's names for headers, fields, and parameters, never any part of the value.
 */
interface Credential {
  held: HeldText;
  where: Message;
}

/**
 * The credentials a query writes into a web request's headers or `Query` record, a connection
 * string, a web address, or a Bearer token, in that order, so a literal found twice keeps the
 * first place it was found.
 */
function credentialsIn(m: MIndex, q: MQuery): Credential[] {
  const out: Credential[] = [];
  const add = (value: Node, where: Message): void => {
    for (const held of heldTexts(m, q, value))
      if (isCredential(held.value)) out.push({ held, where });
  };
  for (const c of calls(q)) {
    if (c.name === "Web.Contents" || c.name === "OData.Feed") {
      // OData.Feed takes its headers as its second argument, and its options as its third.
      const options = recordFields(m, q, c.args[c.name === "OData.Feed" ? 2 : 1]);
      const field = (name: string) => options.find((f) => f.name === name)?.value;
      for (const h of [
        ...(c.name === "OData.Feed" ? recordFields(m, q, c.args[1]) : []),
        ...recordFields(m, q, field("Headers")),
      ])
        if (SECRET_HEADER.test(h.name))
          add(
            h.value,
            msg("HARDCODED_SECRET_IN_QUERY.header", { header: h.name, function: c.name }),
          );
      for (const f of recordFields(m, q, field("Query")))
        if (SECRET_FIELD.test(f.name))
          add(
            f.value,
            msg("HARDCODED_SECRET_IN_QUERY.queryField", { field: f.name, function: c.name }),
          );
    }
    const held =
      CONNECTION_STRING.test(c.name) && c.args[0] ? heldText(m, q, c.args[0]) : undefined;
    for (const part of held?.value.split(";") ?? []) {
      const [key = "", ...rest] = part.split("=");
      const k = key.trim().toLowerCase();
      if ((k === "password" || k === "pwd") && isCredential(rest.join("=").replace(/[{}]/g, "")))
        out.push({
          held: held!,
          where: msg("HARDCODED_SECRET_IN_QUERY.connectionString", { function: c.name }),
        });
    }
  }
  for (const { node, value } of textLiterals(q)) {
    const held = { node, query: q, value, named: false };
    if (/^https?:\/\//i.test(value))
      for (const [, name = "", v = ""] of value.matchAll(SECRET_PARAMETER))
        if (isCredential(v))
          out.push({
            held,
            where: msg("HARDCODED_SECRET_IN_QUERY.addressParameter", {
              parameter: name.toLowerCase(),
            }),
          });
    if (/^bearer [\w.~+/-]{16}/i.test(value) && isCredential(value))
      out.push({ held, where: msg("HARDCODED_SECRET_IN_QUERY.bearerToken") });
  }
  return out;
}

// A credential written into a query (v3 spec, section 9.5). The finding is on the literal that
// holds it, once however many places read it, and its detail names only where the credential is:
// no output prints any part of the value, its length, or a hash of it (spec 11.3).
export const HARDCODED_SECRET_IN_QUERY = pbiplintRule({
  id: "HARDCODED_SECRET_IN_QUERY",
  name: "Secret written into a query",
  category: "Error Prevention",
  severity: 3,
  scope: ["Partition", "NamedExpression", "Table"],
  layer: "powerquery",
  check: (_project, { indexes: { m }, ...ctx }) => {
    // A query's keys join `reported` only once its work returns, so a query that fails partway
    // does not hide a shared value from the next query that reads it.
    const reported = new Set<string>();
    return eachQuery(ctx, m.queries, (q) => {
      const added = new Set<string>();
      const found = credentialsIn(m, q).flatMap(({ held, where }) => {
        const key = `${held.query.kind}:${held.query.name}:${held.node.id}`;
        if (reported.has(key) || added.has(key)) return [];
        added.add(key);
        const what = msg(
          held.named ? "HARDCODED_SECRET_IN_QUERY.reads" : "HARDCODED_SECRET_IN_QUERY.holds",
          { where },
        );
        return [mFinding(m, held.query, held.node, what)];
      });
      for (const key of added) reported.add(key);
      return found;
    });
  },
});

/** The database connectors whose first argument names the server (v3 spec, section 9.14). */
const SERVER_CONNECTOR =
  /^(?:Sql\.Databases?|PostgreSQL\.Database|MySQL\.Database|Oracle\.Database|Snowflake\.Databases|AnalysisServices\.Databases?|DB2\.Database|Teradata\.Database)$/;

// Once per query, on its first connector that names its server as text, written in place or held
// by a step (v3 spec, section 9.14). A server from a model parameter is the fix. The server's name
// is not printed: an internal host name need not travel with an export.
export const HARDCODED_SERVER_NAME = pbiplintRule({
  id: "HARDCODED_SERVER_NAME",
  name: "Server name written into the query",
  category: "Maintenance",
  severity: 1,
  scope: ["Partition", "NamedExpression", "Table"],
  layer: "powerquery",
  check: (_project, { indexes: { m }, ...ctx }) =>
    eachQuery(ctx, m.queries, (q) => {
      const named = calls(q).filter(
        (c) =>
          SERVER_CONNECTOR.test(c.name) &&
          c.args[0] !== undefined &&
          textValue(boundValue(m, q, c.args[0]).node) !== undefined,
      );
      const [first] = named;
      if (!first) return [];
      return [
        mFinding(
          m,
          q,
          first.node,
          msg("HARDCODED_SERVER_NAME", { function: first.name, count: named.length }),
        ),
      ];
    }),
});

// An .xls or .xlsb workbook, read through the Access Database Engine, which the service's cloud
// cannot install (v3 spec, section 9.17). Only a path the resolver can read is checked.
export const LEGACY_EXCEL_FILE = pbiplintRule({
  id: "LEGACY_EXCEL_FILE",
  name: "Legacy Excel workbook",
  category: "Error Prevention",
  severity: 1,
  scope: ["Partition", "NamedExpression", "Table"],
  layer: "powerquery",
  check: (_project, { indexes: { m }, ...ctx }) => {
    // As in HARDCODED_SECRET_IN_QUERY, a query's keys join `reported` once its work returns.
    const reported = new Set<string>();
    return eachQuery(ctx, m.queries, (q) => {
      const added = new Set<string>();
      const found = calls(q).flatMap((c) => {
        const file =
          c.name === "Excel.Workbook" && c.args[0] && callOf(boundValue(m, q, c.args[0]).node);
        const path =
          file && file.name === "File.Contents" && file.args[0] && heldText(m, q, file.args[0]);
        const ext = path && /\.xls(b?)$/i.exec(path.value.trim());
        if (!path || !ext) return [];
        const key = `${path.query.kind}:${path.query.name}:${path.node.id}`;
        if (reported.has(key) || added.has(key)) return [];
        added.add(key);
        return [
          mFinding(
            m,
            path.query,
            path.node,
            msg("LEGACY_EXCEL_FILE", { kind: ext[1] ? "xlsb" : "xls" }),
          ),
        ];
      });
      for (const key of added) reported.add(key);
      return found;
    });
  },
});

/** The functions that list a folder's files, with an Extension column. */
const FILE_LISTING = /^(?:Folder|SharePoint)\.(?:Files|Contents)$/;

/**
 * Extensions left alone in any case, since the programs that write them keep one case: a log
 * file's (Michael, October 13, 2026). One alternative per extension.
 */
const ONE_CASE_EXTENSION = /^\.(?:log)$/i;

/**
 * Whether a table is a file listing whose Extension column keeps its case: followed back through
 * each step's first argument to one of the listing functions, with no Table.TransformColumns on the
 * way that names the Extension column, which may lowercase it.
 */
function listingKeepsCase(m: MIndex, q: MQuery, table: Node): boolean {
  const transformsExtension = (c: MCall): boolean =>
    c.name === "Table.TransformColumns" &&
    nodesWithin(q, c.node, Kind.LiteralExpression).some((n) => textValue(n) === "Extension");
  for (let c = callOf(boundValue(m, q, table).node), depth = 0; c && depth < 50; depth++) {
    if (FILE_LISTING.test(c.name)) return true;
    if (transformsExtension(c) || !c.args[0]) return false;
    c = callOf(boundValue(m, q, c.args[0]).node);
  }
  return false;
}

/** `[Extension]`, the file listing's column, as a row filter reads it. */
const isExtension = (n: Node): boolean => {
  const v = unwrap(n);
  return v.kind === Kind.FieldSelector && identifierName(v.content.literal) === "Extension";
};

// A row filter over a file listing that compares [Extension] with text as written, so ".csv" misses
// "B.CSV" (v3 spec, section 9.10). A comparison through Text.Lower, Text.Upper, or
// Comparer.OrdinalIgnoreCase, a listing whose Extension column a Table.TransformColumns step
// changes first, and a log file's extension are left alone.
export const EXTENSION_FILTER_CASE = pbiplintRule({
  id: "EXTENSION_FILTER_CASE",
  name: "File extension filter misses other cases",
  category: "Error Prevention",
  severity: 2,
  scope: ["Partition", "NamedExpression", "Table"],
  layer: "powerquery",
  check: (_project, { indexes: { m }, ...ctx }) =>
    eachQuery(ctx, m.queries, (q) =>
      calls(q).flatMap((c) => {
        const [table, condition] = c.args;
        if (c.name !== "Table.SelectRows" || !table || !condition || !listingKeepsCase(m, q, table))
          return [];
        return nodesWithin(q, condition, Kind.EqualityExpression).flatMap((node) => {
          if (node.kind !== Kind.EqualityExpression) return [];
          const text = isExtension(node.left)
            ? textValue(unwrap(node.right))
            : isExtension(node.right)
              ? textValue(unwrap(node.left))
              : undefined;
          if (text === undefined || !/[a-z]/i.test(text) || ONE_CASE_EXTENSION.test(text))
            return [];
          const other = text === text.toLowerCase() ? text.toUpperCase() : text.toLowerCase();
          return [
            mFinding(
              m,
              q,
              node,
              msg("EXTENSION_FILTER_CASE", { extension: text, otherCase: other }),
            ),
          ];
        });
      }),
    ),
});

/**
 * pbiplint's own Power Query rules (v3 spec, section 9): each reads the M a model's queries hold,
 * or the file's Power Query options, and reports on the model's files.
 */
export const powerQueryRules: Rule[] = [
  LOCAL_DRIVE_PATH,
  SCRIPT_IN_QUERY,
  EXCEL_USE_HEADERS,
  ODBC_WHERE_CONNECTOR_EXISTS,
  PRIVACY_LEVELS_IGNORED,
  SORT_NOT_HELD_FOR_REMOVE_DUPLICATES,
  KEEP_FIRST_ROWS_LEFT_IN,
  INCREMENTAL_REFRESH_RANGE_BOUNDS,
  FIXED_DATE_IN_ROW_FILTER,
  DEFAULT_STEP_NAMES,
  DYNAMIC_DATA_SOURCE,
  HARDCODED_SECRET_IN_QUERY,
  HARDCODED_SERVER_NAME,
  LEGACY_EXCEL_FILE,
  EXTENSION_FILTER_CASE,
];
