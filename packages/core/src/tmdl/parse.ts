import { unquoteName, unquoteValue } from "./quote.js";
import { allowsChild, checksChildren } from "./child-types.js";
import { isModelChildType, isNamedRootType, isRootType } from "./root-types.js";
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
 * Whether a line's word is `table`, however it is indented and whatever follows the word: a stray
 * tab, tabs and spaces, or `table: Sales` or `table = Sales` for `table Sales`. A model's
 * definition declares a table at the root of a file or directly under its model (#137), and a
 * culture's translations name one under a model, so a lost line of that word may be a table's
 * declaration (#132). `tablePermission` and M text such as `Table.AddColumn(` are other words.
 */
const namesTable = (line: string): boolean => /^table(?:[\s:=]|$)/i.test(line.trim());
/**
 * What a `table` line may sit under: a model, the model's own (#137) or the one a culture's
 * translations and a TMDL script write, or a script's `createOrReplace`. A database holds the
 * model, not a table.
 */
const HOLDS_TABLE = new Set(["model", "createorreplace"]);

/**
 * Whether a declaration's name, as written, is one TMDL can read: a name with a single quote in it
 * is enclosed in single quotes, with each quote inside doubled and nothing after the closing one
 * (https://learn.microsoft.com/analysis-services/tmdl/tmdl-overview#object-declaration). One whose
 * quote is left open also swallows the `=` after it, so the expression reads as part of the name.
 */
const nameReadable = (name: string): boolean =>
  !name.includes("'") || /^'(?:[^']|'')*'$/.test(name);

/** Split `<type> <name> [= expr]` on the first `=` outside single quotes. */
function splitHeader(
  content: string,
): { type: string; name?: string; nameReadable: boolean; hasEq: boolean; inline: string } | null {
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
    nameReadable: m[2] === undefined || nameReadable(m[2].trim()),
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
 * Where an indented block from line `from` ends: at the first line before `limit` that is not blank
 * and is indented less than `depth`, or at `limit`. An indented expression and a code fence left
 * open both read their text with it, so the two stay one reading. A `table` line whose indentation
 * does not begin as the block's first line's does, and whose tabs go no deeper than the
 * declaration's properties, one deeper than the declaration (`head`), such as one indented with
 * spaces under an expression indented with tabs, ends it too: it is a table's declaration that lost
 * its place, not the expression's text (#135). TMDL puts every line of an expression deeper than
 * the declaration's properties
 * (https://learn.microsoft.com/analysis-services/tmdl/tmdl-overview#expressions), and Desktop
 * writes each two tabs deeper than the declaration and then the language's own indentation, tabs or
 * spaces, so a line of M or DAX that starts with `table`, such as a step named Table, stays.
 */
const blockEnd = (
  lines: readonly string[],
  from: number,
  limit: number,
  depth: number,
  head: number,
): number => {
  const lead = lines[from]?.slice(0, leadingWs(lines[from]!)) ?? "";
  const inBlock = (line: string): boolean =>
    line.trim() === "" ||
    (leadingWs(line) >= depth &&
      (line.startsWith(lead) || tabIndent(line) > head + 1 || !namesTable(line)));
  let k = from;
  while (k < limit && inBlock(lines[k]!)) k++;
  return k;
};
/** Lines `from` up to `end`, each less `depth` characters of indentation, with no blank line last. */
const blockText = (lines: readonly string[], from: number, end: number, depth: number): string => {
  const out = lines.slice(from, end).map((l) => (l.trim() === "" ? "" : l.slice(depth)));
  while (out.at(-1) === "") out.pop();
  return out.join("\n");
};

/**
 * Generic TMDL tree parser. Unknown object types and properties parse as generic nodes, so a
 * construct this code has never seen never aborts a run. A line at the root of a file that TMDL
 * does not allow there is also a parse issue: an object or a flag whose type TMDL does not declare
 * there (root-types.ts), a property or an expression with no name, and an annotation or an extended
 * property with lines under it. TMDL also reads the lines directly under a `model` at the root, or
 * under a `model` under a `database` at the root, as the model's own declarations
 * (https://learn.microsoft.com/analysis-services/tmdl/tmdl-overview#indentation), so these are
 * issues too (#137): there, a declaration of a type TMDL does not declare under a model, a
 * property whose word is one of the types it does, and an annotation, an extended property, a
 * property, or an expression with no name that has lines under it; and under that `database`, a
 * declaration other than its `model`. A flag there is checked only by a word TMDL declares, or,
 * under a model, by a declaration under it, since the model's own properties include flags and
 * blocks of flags. Under the model's objects, a declaration whose type its object does not hold
 * (child-types.ts) is an issue (#144), such as a misspelt `columm` under a table; flags, properties,
 * and lines inside a culture's translations or a TMDL script are not checked. A `table` line
 * under anything but a model is one too. A declaration the model reads by name that has none (at the root or under a model, as
 * above), and a name not enclosed in single quotes as TMDL requires wherever it sits, are issues
 * (#135). Each issue says whether it can take an object out of the model
 * (`TmdlParseIssue.canDropObjects`); every one can except a description nothing claims.
 */
export function parseTmdl(file: string, text: string): ParsedFile {
  // Power BI Desktop writes TMDL as UTF-8 with a BOM; it is not part of the first line.
  const body = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  const lines = body.replace(/\r\n?/g, "\n").split("\n");
  const roots: TmdlNode[] = [];
  const issues: TmdlParseIssue[] = [];
  const stack: TmdlNode[] = [];
  /**
   * The declarations whose direct lines TMDL reads as if they sat at the root (#137): a `model` at
   * the root, whose lines are the model's own declarations, a `database` at the root, which holds
   * the model, and a `model` under that `database`. A culture's translations and a TMDL script nest
   * a model too, and it is not the model's.
   */
  const holders = new Map<TmdlNode, "model" | "database">();
  /**
   * The lines kept out of the model with an issue of their own: nothing under one is checked
   * against its object's child types (#144), since the issue on that line already covers it.
   */
  const reported = new Set<TmdlNode>();
  /**
   * What sits above a line keeps the parser's reading of it: a culture's translations, which
   * restate the model's objects in a shape of their own, and a TMDL script's `createOrReplace`.
   */
  const KEEPS_READING = new Set(["cultureinfo", "createorreplace"]);
  /**
   * Whether a line the parser lost may have been one of the model's own declarations, such as a
   * table's: a line that may have been at the root (`mayBeRootLine`), or one whose tabs put it
   * directly under a holder among the `depth` declarations open above it, and that is not indented
   * with spaces as well unless its word is `table`, as at the root (#137).
   */
  const mayBeModelLevelLine = (line: string, depth: number): boolean => {
    const tabs = tabIndent(line);
    return (
      mayBeRootLine(line) ||
      (tabs > 0 &&
        tabs <= depth &&
        line.trim() !== "" &&
        holders.has(stack[tabs - 1]!) &&
        (!/^\s/.test(line.slice(tabs)) || namesTable(line)))
    );
  };
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

    /** Where the value read after `=` starts; `collectBlock` and `collectFenced` move it. */
    let valueLine = lineNo;
    // Indented multi-line expression. The first non-blank line after the header sets the block
    // indentation; the block continues while lines are blank or indented at least that much.
    const collectBlock = (): string => {
      let j = i + 1;
      while (j < lines.length && lines[j]!.trim() === "") j++;
      if (j >= lines.length) return "";
      const blockIndent = leadingWs(lines[j]!);
      if (blockIndent <= indent) return "";
      valueLine = j + 1;
      const end = blockEnd(lines, j, lines.length, blockIndent, indent);
      i = end - 1;
      return blockText(lines, j, end, blockIndent);
    };

    // Fenced expression: header ends with ```; closed by a line that is only ```; that closing
    // line's leading whitespace is the left boundary stripped from every line.
    const collectFenced = (): string => {
      valueLine = lineNo + 1;
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
      let end = depth > 0 ? blockEnd(lines, first, j, depth, indent) : j;
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
        canDropTableLine: read.some((l) => mayBeModelLevelLine(l, indent)),
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
    /** Whether a declaration's name, if it has one, is written as TMDL can read it. */
    let readableName = true;
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
          canDropTableLine: mayBeModelLevelLine(raw, indent),
        });
        i++;
        continue;
      }
      word = h.type;
      readableName = h.nameReadable;
      if (h.hasEq) {
        const value =
          h.inline === "```" ? collectFenced() : h.inline === "" ? collectBlock() : h.inline;
        node =
          h.name === undefined
            ? { ...base, kind: "expr", type: h.type.toLowerCase(), value, valueLine }
            : {
                ...base,
                kind: "object",
                type: h.type.toLowerCase(),
                name: h.name,
                value,
                valueLine,
              };
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
    let rootIssue: string | undefined;
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
      rootIssue = reason;
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
    // A line the model cannot read as written (#135, #137): under a model, a property whose word is
    // a type TMDL declares there; a table under anything but a model; under a model or the database
    // that holds it, a declaration of a type TMDL does not declare there; a declaration the model
    // reads by name that has none; or a name not quoted as TMDL requires. Kept out of the model
    // with everything under it, which goes under it: one issue, on its line. A culture's
    // translations name a table under a model, and a TMDL script nests one under its
    // `createOrReplace` or a model; neither reaches the model as a table. A declaration with an
    // empty quoted name, `table ''`, has no name either. A flag under a model or a database is one
    // of its properties, such as `discourageImplicitMeasures`, so one there is reported only when
    // its word is a type TMDL declares, such as a bare `table` or `model`; a flag or a property
    // that lost its tabs, with nothing under it, reads as one of the model's own.
    const level = parent && holders.get(parent);
    const declaration = node.kind === "object" || node.kind === "flag";
    const keyword = word?.toLowerCase();
    let malformed: string | undefined;
    // Whether the line may be a table's declaration: its word is `table`, or it is of a type TMDL
    // does not declare where it sits, which may be a misspelt `table`, as at the root.
    let mayBeTable = namesTable(raw);
    if (rootIssue === undefined && keyword !== undefined) {
      if (!declaration) {
        // A property, or an expression with no name, under a model is one of the model's own, but
        // for a word TMDL declares there as an object, such as `table: Sales` for `table Sales` or
        // an expression's `queryGroup` that lost its tabs. No property of a model has such a word.
        if (level === "model" && isModelChildType(keyword))
          malformed = `"${word}" is not a property TMDL allows under a model`;
      } else if (indent > 0 && keyword === "table" && !HOLDS_TABLE.has(parent?.type ?? "")) {
        malformed = `"${word}" is a type TMDL declares only at the root of a file or under a model`;
      } else if (
        level !== undefined &&
        !(level === "model" ? isModelChildType(keyword) : keyword === "model") &&
        (node.kind === "object" || isRootType(keyword))
      ) {
        malformed = `"${word}" is not a type TMDL declares under a ${level}`;
        mayBeTable = true;
      } else if (
        (indent === 0 || level === "model") &&
        (node.kind === "flag" || node.name === "") &&
        isNamedRootType(keyword)
      ) {
        malformed = `"${word}" is declared with no name`;
      } else if (
        node.kind === "object" &&
        parent !== undefined &&
        checksChildren(parent.type) &&
        !allowsChild(parent.type, keyword) &&
        !stack.slice(0, indent).some((a) => reported.has(a) || KEEPS_READING.has(a.type))
      ) {
        // A declaration its object does not hold (#144): a misspelt `columm`, a `level` that lost
        // its tab and landed under the table, a `measure` with a tab too many under a column. Only
        // a word followed by a name is checked, the way TMDL declares an object; a lone word is a
        // flag and keeps today's reading. Both words are named as written.
        const under = /^\s*(\w+)/.exec(lines[parent.line - 1]!)?.[1] ?? parent.type;
        malformed = `"${word}" is not a type TMDL declares under a ${under}`;
      } else if (!readableName) {
        malformed = "the name is not enclosed in single quotes as TMDL requires";
      }
    }
    if (malformed !== undefined) {
      issues.push({
        file,
        line: lineNo,
        text: raw,
        reason: malformed,
        canDropObjects: true,
        canDropTableLine: mayBeTable,
      });
      reported.add(node);
      stack[indent] = node;
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
    if (
      declaration &&
      ((!parent && (node.type === "model" || node.type === "database")) ||
        (level === "database" && node.type === "model"))
    )
      holders.set(node, node.type as "model" | "database");
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
  // One directly under a model is the model's annotation, as at the root (#137), and a table's
  // lost one lands there in a model.tmdl that nests its tables. So may a property that lost its
  // tabs, which is one of the model's own there and has no issue of its own; TMDL gives it no line
  // under it either, and an expression with no name only the value block read above. A flag there
  // is one of the model's boolean properties, or a block such as `dataAccessOptions` that holds
  // flags, so one is reported only when a declaration sits under it, as when a column's `isKey`
  // loses two tabs and the column after it attaches to it. The lines under any of these sit deeper
  // than the model's own declarations, so none is a `table` line.
  const modelLevel = [
    ...roots.map((node) => ({ node, root: true })),
    ...[...holders]
      .filter(([, holds]) => holds === "model")
      .flatMap(([m]) => m.children.map((node) => ({ node, root: false }))),
  ];
  for (const { node: r, root } of modelLevel) {
    if (r.children.length === 0) continue;
    if (r.kind === "ref") continue;
    const valued = r.kind === "prop" || r.kind === "expr";
    const noted = r.type === "annotation" || r.type === "extendedproperty";
    const holdsDeclaration =
      !root && r.kind === "flag" && !noted && r.children.some((c) => c.kind === "object");
    if (!(valued ? !root : noted || holdsDeclaration)) continue;
    const text = lines[r.line - 1]!;
    const where = root ? "at the root of a file" : "under a model";
    const under = holdsDeclaration ? "a declaration" : "lines";
    const issue = {
      file,
      line: r.line,
      text,
      reason: `"${/^\w+/.exec(text.trimStart())![0]}" ${where} has ${under} under it, which TMDL does not allow`,
      canDropObjects: true,
      canDropTableLine: false,
    };
    const at = issues.findIndex((i) => i.line > r.line);
    issues.splice(at === -1 ? issues.length : at, 0, issue);
  }
  return { file, roots, issues, lineCount: lines.length };
}
