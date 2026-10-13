import { Language } from "@microsoft/powerquery-parser";
import { calls, identifierName, textLiterals, textValue, unwrap } from "../../m/ast.js";
import { resolve } from "../../m/resolve.js";
import type { MIndex, MQuery } from "../../m/types.js";
import { finding } from "../helpers.js";
import { mFinding } from "../m-helpers.js";
import type { Rule } from "../types.js";
import { pbiplintRule } from "./define.js";

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
  check: (_project, { indexes: { m } }) =>
    m.queries.flatMap((q) =>
      textLiterals(q).flatMap(({ node, value }) => {
        const drive = DRIVE_PATH.exec(value);
        return drive
          ? [mFinding(m, q, node, `the path is on a local drive (${drive[1]!.toUpperCase()}:)`)]
          : [];
      }),
    ),
});

/** The script functions, and the language each one runs. */
const SCRIPT_LANGUAGE: ReadonlyMap<string, string> = new Map([
  ["Python.Execute", "Python"],
  ["R.Execute", "R"],
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
  check: (_project, { indexes: { m } }) =>
    m.queries.flatMap((q) =>
      calls(q).flatMap((c) => {
        const language = SCRIPT_LANGUAGE.get(c.name);
        return language
          ? [
              mFinding(
                m,
                q,
                c.node,
                `${c.name} refreshes only through a personal gateway on a machine with ${language} installed`,
              ),
            ]
          : [];
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
  check: (_project, { indexes: { m } }) =>
    m.queries.flatMap((q) =>
      calls(q)
        .filter((c) => c.name === "Excel.Workbook" && promotesHeaders(c.args[1]))
        .map((c) =>
          mFinding(
            m,
            q,
            c.node,
            "Excel.Workbook promotes headers in the refreshing machine's culture",
          ),
        ),
    ),
});

/**
 * The databases Power BI has a connector for, by what an ODBC driver's or an OLE DB provider's
 * name holds, any case (v3 spec, section 9.15). Kept small on purpose.
 */
const NATIVE_CONNECTORS: readonly { pattern: RegExp; name: string; article: "a" | "an" }[] = [
  { pattern: /amazon redshift/i, name: "Amazon Redshift", article: "an" },
  { pattern: /postgresql/i, name: "PostgreSQL", article: "a" },
  { pattern: /sql server|sqlncli|sqloledb|msoledbsql/i, name: "SQL Server", article: "a" },
  { pattern: /mysql/i, name: "MySQL", article: "a" },
  { pattern: /oracle/i, name: "Oracle", article: "an" },
  { pattern: /snowflake/i, name: "Snowflake", article: "a" },
];

/** The generic sources: what each calls its connection, and the part of it that names the driver. */
const GENERIC_SOURCES: ReadonlyMap<string, { kind: string; part: string }> = new Map([
  ["Odbc.DataSource", { kind: "ODBC", part: "driver" }],
  ["OleDb.DataSource", { kind: "OLE DB", part: "provider" }],
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
  check: (_project, { indexes: { m } }) =>
    m.queries.flatMap((q) =>
      calls(q).flatMap((c) => {
        const source = GENERIC_SOURCES.get(c.name);
        if (!source) return [];
        const driver = driverOf(connectionText(m, q, c.args[0]) ?? "");
        const native =
          driver === undefined ? undefined : NATIVE_CONNECTORS.find((n) => n.pattern.test(driver));
        return native
          ? [
              mFinding(
                m,
                q,
                c.node,
                `the ${source.kind} connection names the ${native.name} ${source.part}; Power BI has ${native.article} ${native.name} connector`,
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
            detail: "Ignore the Privacy Levels is on for this file; the service does not honor it",
          },
        ]
      : [];
  },
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
];
