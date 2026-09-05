import { unquoteName, unquoteValue } from "./quote.js";
import type { ParsedFile, ParseIssue, TmdlNode } from "./types.js";

const HEADER = /^([A-Za-z_]\w*)(?:\s+(.+))?$/;
const PROP = /^([A-Za-z_]\w*):(?:\s(.*))?$/;
const REF = /^ref\s+([A-Za-z_]\w*)\s+(.+)$/;

const tabIndent = (line: string): number => {
  let n = 0;
  while (line[n] === "\t") n++;
  return n;
};
const leadingWs = (line: string): number => line.length - line.trimStart().length;

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
 * so a construct this code has never seen never aborts a run.
 */
export function parseTmdl(file: string, text: string): ParsedFile {
  // Power BI Desktop writes TMDL as UTF-8 with a BOM; it is not part of the first line.
  const body = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  const lines = body.replace(/\r\n?/g, "\n").split("\n");
  const roots: TmdlNode[] = [];
  const issues: ParseIssue[] = [];
  const stack: TmdlNode[] = [];
  let pendingDescription: string[] = [];
  let i = 0;

  while (i < lines.length) {
    const raw = lines[i]!;
    const lineNo = i + 1;
    if (raw.trim() === "") {
      i++;
      continue;
    }
    const indent = tabIndent(raw);
    const content = raw.slice(indent);
    if (content.startsWith("///")) {
      pendingDescription.push(content.replace(/^\/\/\/ ?/, ""));
      i++;
      continue;
    }
    if (/^\s/.test(content)) {
      issues.push({
        file,
        line: lineNo,
        text: raw,
        reason: "space indentation (TMDL requires tabs)",
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
        issues.push({ file, line: lineNo, text: raw, reason: "unterminated ``` fence" });
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
    if ((m = REF.exec(content))) {
      node = { ...base, kind: "ref", type: m[1]!.toLowerCase(), name: unquoteName(m[2]!) };
    } else if ((m = PROP.exec(content))) {
      node = { ...base, kind: "prop", type: m[1]!.toLowerCase(), value: unquoteValue(m[2] ?? "") };
    } else {
      const h = splitHeader(content);
      if (!h) {
        issues.push({ file, line: lineNo, text: raw, reason: "unrecognized line" });
        i++;
        continue;
      }
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

    if (pendingDescription.length) {
      node.description = pendingDescription.join("\n");
      pendingDescription = [];
    }
    stack.length = indent;
    const parent = indent > 0 ? stack[indent - 1] : undefined;
    if (indent > 0 && !parent) {
      issues.push({ file, line: lineNo, text: raw, reason: "orphan indentation" });
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
  return { file, roots, issues, lineCount: lines.length };
}
