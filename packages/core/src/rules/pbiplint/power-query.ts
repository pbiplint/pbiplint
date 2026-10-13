import { calls, textLiterals } from "../../m/ast.js";
import { mFinding } from "../m-helpers.js";
import type { Rule } from "../types.js";
import { pbiplintRule } from "./define.js";

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

/**
 * pbiplint's own Power Query rules (v3 spec, section 9): each reads the M a model's queries hold,
 * or the file's Power Query options, and reports on the model's files.
 */
export const powerQueryRules: Rule[] = [LOCAL_DRIVE_PATH, SCRIPT_IN_QUERY];
