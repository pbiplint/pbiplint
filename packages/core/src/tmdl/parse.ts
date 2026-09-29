import { unquoteName, unquoteValue } from "./quote.js";
import { isRootType } from "./root-types.js";
import type { ParsedFile, TmdlNode, TmdlParseIssue } from "./types.js";

const HEADER = /^([A-Za-z_]\w*)(?:\s+(.+))?$/;
const PROP = /^([A-Za-z_]\w*):(?:\s(.*))?$/;
const REF = /^ref\s+([A-Za-z_]\w*)\s+(.+)$/;

const tabIndent = (line: string): number => {
  let n = 0;
  while (line[n] === "\t") n++;
  return n;
};
const leadingWs = (line: string): number => line.length - line.trimStart().length;
/**
 * Whether a line the parser could not use may have been a line at the root of the file, such as a
 * table's declaration: one with no indentation, or a `table` line whose only indentation is
 * spaces, which kept it from the root. Any other line indented with spaces was meant to sit under
 * the object above it.
 */
const mayBeRootLine = (line: string): boolean =>
  line.trim() !== "" &&
  tabIndent(line) === 0 &&
  (!/^\s/.test(line) || splitHeader(line)?.type.toLowerCase() === "table");
/**
 * Whether a line's word is `table`, however it is indented and whatever follows the word: a
 * stray tab, tabs and spaces, or `table: Sales` or `table = Sales` for `table Sales`. TMDL
 * declares a table nowhere but at the root, so a lost line of that word may be a table's
 * declaration (#132). `tablePermission` and M text such as `Table.AddColumn(` are other words.
 */
const namesTable = (line: string): boolean => /^table(?:[\s:=]|$)/i.test(line.trim());

/** Split `<type> <name> [= expr]` on the first `=` outside single quotes. */
function splitHeader(
  content: string,
): { type: string; name?: string; hasEq: boolean; inline: string } | null {
  let inQuote = false;
  let eqAt = -1;
  for (let i = 0; i < content.length; i++) {
    const ch = content[i];
    if (ch === "'") inQuote = !inQuote;
    else if (ch === "=" && !inQuote) {
      eqAt = i;
      break;
    }
  }
  const left = (eqAt >= 0 ? content.slice(0, eqAt) : content).trim();
  const inline = eqAt >= 0 ? content.slice(eqAt + 1).trim() : "";
  const m = HEADER.exec(left);
  if (!m) return null;
  return {
    type: m[1]!,
    name: m[2] === undefined ? undefined : unquoteName(m[2]),
    hasEq: eqAt >= 0,
    inline,
  };
}

/**
 * Whether a line opens a code fence: a declaration, or an expression with no name, whose `=` is
 * followed by three backticks, as `parseTmdl` reads a line. DAX and M give backticks no meaning
 * outside a string or a comment, and none of the 11,458 fences in 23,457 TMDL files surveyed on
 * September 28, 2026 holds such a line, so one inside a fence means that fence was never closed.
 */
const opensFence = (line: string): boolean => {
  const content = line.slice(tabIndent(line));
  if (/^\s/.test(content) || REF.test(content) || PROP.test(content)) return false;
  const h = splitHeader(content);
  return h !== null && h.hasEq && h.inline === "```";
};
/** Whether a line is a `///` description line, as `parseTmdl` reads one. */
const isDescription = (line: string): boolean => line.slice(tabIndent(line)).startsWith("///");
/**
 * Where an indented block from line `from` ends: at the first line before `limit` that is not
 * blank and is indented less than `depth`, or at `limit`. An indented expression and a code fence
 * left open both read their text with it, so the two stay one reading.
 */
const blockEnd = (lines: readonly string[], from: number, limit: number, depth: number): number => {
  let k = from;
  while (k < limit && (lines[k]!.trim() === "" || leadingWs(lines[k]!) >= depth)) k++;
  return k;
};
/** Lines `from` up to `end`, each less `depth` characters of indentation, with no blank line last. */
const blockText = (lines: readonly string[], from: number, end: number, depth: number): string => {
  const out = lines.slice(from, end).map((l) => (l.trim() === "" ? "" : l.slice(depth)));
  while (out.at(-1) === "") out.pop();
  return out.join("\n");
};

/**
 * Generic TMDL tree parser. Unknown object types and properties parse as generic nodes,
 * so a construct this code has never seen never aborts a run. A line at the root of a file that
 * TMDL does not allow there is also a parse issue: an object or a flag whose type TMDL does not
 * declare there (root-types.ts), a property or an expression with no name, and an annotation or
 * an extended property with lines under it. Nested lines are not checked. Each issue says whether
 * it can take an object out of the model (`TmdlParseIssue.canDropObjects`); every one can except
 * a description nothing claims.
 */
export function parseTmdl(file: string, text: string): ParsedFile {
  // Power BI Desktop writes TMDL as UTF-8 with a BOM; it is not part of the first line.
  const body = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  const lines = body.replace(/\r\n?/g, "\n").split("\n");
  const roots: TmdlNode[] = [];
  const issues: TmdlParseIssue[] = [];
  const stack: TmdlNode[] = [];
  /**
   * The `///` lines seen since the last declaration, and the line and raw text of the first of
   * them, for the issue reported when the run leads nowhere. One object rather than three
   * bindings: there is no line number to hold when no description is pending.
   */
  let pendingDescription: { line: number; text: string; lines: string[] } | null = null;
  /**
   * A pending description that nothing will claim: report it and drop it. The declaration below
   * the blank line is still read, so the issue loses a description and no object.
   */
  const orphanDescription = (pending: { line: number; text: string }): void => {
    issues.push({
      file,
      line: pending.line,
      text: pending.text,
      reason: "description is not followed by a declaration",
      canDropObjects: false,
      canDropTableLine: false,
    });
    pendingDescription = null;
  };
  let i = 0;

  while (i < lines.length) {
    const raw = lines[i]!;
    const lineNo = i + 1;
    if (raw.trim() === "") {
      // Tabular Editor's TMDL reader rejects a blank line after a `///` description, so a
      // description separated from its declaration never reaches it. Report and drop it.
      if (pendingDescription) orphanDescription(pendingDescription);
      i++;
      continue;
    }
    const indent = tabIndent(raw);
    const content = raw.slice(indent);
    if (content.startsWith("///")) {
      const line = content.replace(/^\/\/\/ ?/, "");
      if (pendingDescription) pendingDescription.lines.push(line);
      else pendingDescription = { line: lineNo, text: raw, lines: [line] };
      i++;
      continue;
    }
    // The line is skipped, whatever it declared.
    if (/^\s/.test(content)) {
      issues.push({
        file,
        line: lineNo,
        text: raw,
        reason: "space indentation (TMDL requires tabs)",
        canDropObjects: true,
        canDropTableLine: mayBeRootLine(raw) || namesTable(raw),
      });
      i++;
      continue;
    }

    // Indented multi-line expression. The first non-blank line after the header sets the block
    // indentation; the block continues while lines are blank or indented at least that much.
    const collectBlock = (): string => {
      let j = i + 1;
      while (j < lines.length && lines[j]!.trim() === "") j++;
      if (j >= lines.length) return "";
      const blockIndent = leadingWs(lines[j]!);
      if (blockIndent <= indent) return "";
      const end = blockEnd(lines, j, lines.length, blockIndent);
      i = end - 1;
      return blockText(lines, j, end, blockIndent);
    };

    // Fenced expression: header ends with ```; closed by a line that is only ```; that closing
    // line's leading whitespace is the left boundary stripped from every line.
    const collectFenced = (): string => {
      let j = i + 1;
      while (j < lines.length && lines[j]!.trim() !== "```" && !opensFence(lines[j]!)) j++;
      if (j < lines.length && lines[j]!.trim() === "```") {
        const boundary = leadingWs(lines[j]!);
        const out = lines.slice(i + 1, j).map((l) => l.slice(Math.min(boundary, leadingWs(l))));
        i = j;
        return out.join("\n");
      }
      // The fence was never closed: the file ended, or a line opened another fence, first. Fenced
      // text may sit at any depth, so nothing says where the expression should have ended. Text
      // indented deeper than the header is read as an indented expression is, up to the first line
      // indented less than its first line, which is where Power BI Desktop writes the object's
      // properties and the next declaration. Text that is not runs to the other fence's
      // declaration, or to the end of the file. Either way a `///` run directly above that
      // declaration is its description.
      let first = i + 1;
      while (first < j && lines[first]!.trim() === "") first++;
      const blockIndent = first < j ? leadingWs(lines[first]!) : 0;
      // Zero for text no deeper than the header, which is not read as a block.
      const depth = blockIndent > indent ? blockIndent : 0;
      let end = depth > 0 ? blockEnd(lines, first, j, depth) : j;
      if (end === j && j < lines.length)
        while (end > i + 1 && isDescription(lines[end - 1]!)) end--;
      const read = lines.slice(i + 1, end);
      // "code fence", the words rules/parse-issue.md uses, so the finding and the page agree.
      issues.push({
        file,
        line: lineNo,
        text: raw,
        reason: "unterminated code fence",
        canDropObjects: true,
        canDropTableLine: read.some(mayBeRootLine),
      });
      const value = blockText(lines, i + 1, end, depth);
      i = end - 1;
      return value;
    };

    const base = {
      props: {} as Record<string, string | true>,
      children: [] as TmdlNode[],
      file,
      line: lineNo,
      indent,
    };
    let node: TmdlNode;
    let m: RegExpExecArray | null;
    /** The line's keyword as written, for a reason that names it; a `ref` line has none. */
    let word: string | undefined;
    if ((m = REF.exec(content))) {
      node = { ...base, kind: "ref", type: m[1]!.toLowerCase(), name: unquoteName(m[2]!) };
    } else if ((m = PROP.exec(content))) {
      word = m[1]!;
      node = { ...base, kind: "prop", type: word.toLowerCase(), value: unquoteValue(m[2] ?? "") };
    } else {
      const h = splitHeader(content);
      if (!h) {
        // Skipped, and it may have been a declaration the parser could not make out.
        issues.push({
          file,
          line: lineNo,
          text: raw,
          reason: "unrecognized line",
          canDropObjects: true,
          canDropTableLine: mayBeRootLine(raw),
        });
        i++;
        continue;
      }
      word = h.type;
      if (h.hasEq) {
        const value =
          h.inline === "```" ? collectFenced() : h.inline === "" ? collectBlock() : h.inline;
        node =
          h.name === undefined
            ? { ...base, kind: "expr", type: h.type.toLowerCase(), value }
            : { ...base, kind: "object", type: h.type.toLowerCase(), name: h.name, value };
      } else if (h.name !== undefined) {
        node = { ...base, kind: "object", type: h.type.toLowerCase(), name: h.name };
      } else {
        node = { ...base, kind: "flag", type: h.type.toLowerCase() };
      }
    }
    // A line at the root that TMDL does not allow there. A property, or an expression with no name
    // (`source =`), belongs under an object whatever its word: `queryGroup: Support` is a property
    // although `queryGroup` is also a root type. A declaration or a flag is checked by its word, such
    // as a misspelt `table` or a `column` that lost its tab; Desktop writes a bare `database` flag
    // on the first line of database.tmdl. Either way the line stays a generic root, which the model
    // does not read, so nothing under it reaches a rule. Only the header line is reported: an
    // expression's value block was read above as its value.
    if (indent === 0 && word !== undefined) {
      const reason =
        node.kind === "prop" || node.kind === "expr"
          ? `"${word}" is a property, which TMDL allows only under an object`
          : isRootType(word)
            ? undefined
            : `"${word}" is not a type TMDL declares at the root of a file`;
      // A misspelt word or a flag (`tableSales`, a lost space) may be a `table` line, as may a
      // property or an expression with no name whose word is `table`; no other property or
      // expression can be one, and the lines under it are indented.
      if (reason !== undefined)
        issues.push({
          file,
          line: lineNo,
          text: raw,
          reason,
          canDropObjects: true,
          canDropTableLine: node.kind === "object" || node.kind === "flag" || namesTable(raw),
        });
    }

    if (pendingDescription) {
      node.description = pendingDescription.lines.join("\n");
      pendingDescription = null;
    }
    stack.length = indent;
    const parent = indent > 0 ? stack[indent - 1] : undefined;
    // Skipped with everything under it, which has no parent either. It may be a `table` line with
    // a stray tab, or the first line of a file whose own declaration line is missing, which may be
    // a table's; an orphan after a line the parser skipped belongs to that line, whose issue says.
    if (indent > 0 && !parent) {
      issues.push({
        file,
        line: lineNo,
        text: raw,
        reason: "orphan indentation",
        canDropObjects: true,
        canDropTableLine:
          namesTable(raw) || (roots.length === 0 && !issues.some((x) => x.canDropObjects)),
      });
      i++;
      continue;
    }
    if (parent) {
      if (node.kind === "prop" || node.kind === "expr") parent.props[node.type] = node.value ?? "";
      else if (node.kind === "flag") parent.props[node.type] = true;
      parent.children.push(node);
    } else {
      roots.push(node);
    }
    stack[indent] = node;
    i++;
  }
  // A description on the last line has no blank line after it to reach the check above. Desktop
  // always writes a trailing newline, which does, but a hand-edited file need not.
  if (pendingDescription) orphanDescription(pendingDescription);
  // A root annotation or extended property with lines under it: the tab-indented lines after its
  // value that the loop above attached to it as children. TMDL gives neither one a child line. An
  // annotation's value is inline, and an extended property's multi-line value is the block that
  // collectBlock or collectFenced read as its value, so a line under one can only come from a lost
  // tab, as when a column's `annotation SummarizationSetBy = Automatic` loses its two and every
  // column and measure after it attaches to it. The model never reads those children. One issue,
  // on the annotation's own line, placed in line order. A property or an expression with no name
  // of that word already has its issue. The lines under it are indented, so none is a `table` line.
  for (const r of roots) {
    if ((r.kind !== "object" && r.kind !== "flag") || r.children.length === 0) continue;
    if (r.type !== "annotation" && r.type !== "extendedproperty") continue;
    const text = lines[r.line - 1]!;
    const issue = {
      file,
      line: r.line,
      text,
      reason: `"${/^\w+/.exec(text)![0]}" at the root of a file has lines under it, which TMDL does not allow`,
      canDropObjects: true,
      canDropTableLine: false,
    };
    const at = issues.findIndex((i) => i.line > r.line);
    issues.splice(at === -1 ? issues.length : at, 0, issue);
  }
  return { file, roots, issues, lineCount: lines.length };
}
