import { Language } from "@microsoft/powerquery-parser";
import { calls, identifierName, textLiterals, unwrap } from "../../m/ast.js";
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
 * pbiplint's own Power Query rules (v3 spec, section 9): each reads the M a model's queries hold,
 * or the file's Power Query options, and reports on the model's files.
 */
export const powerQueryRules: Rule[] = [LOCAL_DRIVE_PATH, SCRIPT_IN_QUERY, EXCEL_USE_HEADERS];
