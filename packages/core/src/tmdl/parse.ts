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
      canDropRootLines: false,
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
        canDropRootLines: mayBeRootLine(raw),
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
      const out: string[] = [];
      let lastNonBlank = -1;
      for (; j < lines.length; j++) {
        const l = lines[j]!;
        if (l.trim() === "") {
          out.push("");
          continue;
        }
        if (leadingWs(l) < blockIndent) break;
        out.push(l.slice(blockIndent));
        lastNonBlank = out.length - 1;
      }
      i = j - 1;
      return out.slice(0, lastNonBlank + 1).join("\n");
    };

    // Fenced expression: header ends with ```; closed by a line that is only ```; that closing
    // line's leading whitespace is the left boundary stripped from every line.
    const collectFenced = (): string => {
      const out: string[] = [];
      let j = i + 1;
      while (j < lines.length && lines[j]!.trim() !== "```") {
        out.push(lines[j]!);
        j++;
      }
      if (j >= lines.length)
        // "code fence", the words rules/parse-issue.md uses, so the finding and the page agree.
        // The rest of the file is read as this expression, so every declaration below is lost.
        issues.push({
          file,
          line: lineNo,
          text: raw,
          reason: "unterminated code fence",
          canDropObjects: true,
          canDropRootLines: out.some(mayBeRootLine),
        });
      const boundary = j < lines.length ? leadingWs(lines[j]!) : 0;
      i = j;
      return out.map((l) => l.slice(Math.min(boundary, leadingWs(l)))).join("\n");
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
          canDropRootLines: mayBeRootLine(raw),
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
      // A misspelt word or a flag (`tableSales`, a lost space) may be a `table` line; a property
      // or an expression with no name cannot be one, and the lines under it are indented.
      if (reason !== undefined)
        issues.push({
          file,
          line: lineNo,
          text: raw,
          reason,
          canDropObjects: true,
          canDropRootLines: node.kind === "object" || node.kind === "flag",
        });
    }

    if (pendingDescription) {
      node.description = pendingDescription.lines.join("\n");
      pendingDescription = null;
    }
    stack.length = indent;
    const parent = indent > 0 ? stack[indent - 1] : undefined;
    // Skipped with everything under it, which has no parent either.
    if (indent > 0 && !parent) {
      issues.push({
        file,
        line: lineNo,
        text: raw,
        reason: "orphan indentation",
        canDropObjects: true,
        canDropRootLines: false,
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
      canDropRootLines: false,
    };
    const at = issues.findIndex((i) => i.line > r.line);
    issues.splice(at === -1 ? issues.length : at, 0, issue);
  }
  return { file, roots, issues, lineCount: lines.length };
}
