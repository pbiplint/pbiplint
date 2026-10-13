import type { LintFile } from "../engine/lint.js";
import type { Model, NamedExpression, Partition, SourceLocation, Table } from "../model/types.js";
import type { TmdlNode } from "../tmdl/types.js";
import { parseM, type MPosition } from "./parse.js";
import type { MIndex, MParseIssue, MQuery } from "./types.js";

/** Text with every run of whitespace as one space, to compare M as Desktop rewrites it. */
const squash = (s: string): string => s.replace(/\s+/g, " ").trim();

/** The node whose value is a partition's M: its `source =` expression. */
const partitionSource = (p: Partition): TmdlNode | undefined =>
  p.node?.children.find((c) => c.kind === "expr" && c.type === "source");

/** The node whose value is a shared expression's M: the declaration, or its `expression =` line. */
const expressionSource = (x: NamedExpression): TmdlNode | undefined =>
  x.node?.value !== undefined
    ? x.node
    : x.node?.children.find((c) => c.kind === "expr" && c.type === "expression");

/** The node whose value is a refresh policy's M: its `sourceExpression =` line. */
const policySource = (t: Table): TmdlNode | undefined =>
  t.refreshPolicy?.node?.children.find((c) => c.kind === "expr" && c.type === "sourceexpression");

/** Each file's lines, split as parseTmdl splits them, read only when a location needs one. */
function lineReader(files: LintFile[]): (file: string, line: number) => string {
  const texts = new Map(files.map((f) => [f.path, f.text]));
  const cache = new Map<string, string[]>();
  return (file, line) => {
    let lines = cache.get(file);
    if (!lines) {
      const text = texts.get(file) ?? "";
      const body = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
      lines = body.replace(/\r\n?/g, "\n").split("\n");
      cache.set(file, lines);
    }
    return lines[line - 1] ?? "";
  };
}

/** M's lines as TMDL holds them, where each starts, and where each line the parser counts starts. */
interface MLines {
  lines: string[];
  starts: number[];
  parserStarts: number[];
}

function splitM(text: string): MLines {
  const starts = [0];
  const parserStarts = [0];
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    if (c === 0x0a) starts.push(i + 1);
    if (c === 0x0a || c === 0x2028 || c === 0x2029) parserStarts.push(i + 1);
  }
  return { lines: text.split("\n"), starts, parserStarts };
}

/** The index of the last of ascending `xs` at or before `x`; 0 when none is. */
function lastAtOrBefore(xs: number[], x: number): number {
  let lo = 0;
  let hi = xs.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (xs[mid]! <= x) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}

/** The index of a model with no M, and of a lint with no model. */
export function emptyMIndex(): MIndex {
  return {
    queries: [],
    issues: [],
    locate: (q, at) => ({ file: q.file, line: q.valueLine + at.lineNumber }),
  };
}

/**
 * Reads every M expression in the model with Microsoft's parser (v3 spec, section 5): each M
 * partition's source, each shared expression, and each refresh policy's source expression that is
 * not, whitespace aside, one of its table's M partitions, which Desktop writes to both. Empty M is
 * skipped. M that does not parse is an issue at the TMDL line and column the parser stopped at,
 * and its query keeps no tree.
 */
export async function readM(model: Model, files: LintFile[]): Promise<MIndex> {
  const lineAt = lineReader(files);
  const mLines = new WeakMap<MQuery, MLines>();
  const locate = (q: MQuery, at: MPosition): SourceLocation => {
    let m = mLines.get(q);
    if (!m) mLines.set(q, (m = splitM(q.text)));
    // The parser counts lines as M's lexer breaks them, at \n, U+2028, and U+2029; TMDL breaks
    // only at \n. Its position becomes a code unit of the whole M, then a place on a TMDL line.
    const at0 = (m.parserStarts[at.lineNumber] ?? q.text.length) + at.lineCodeUnit;
    const n = lastAtOrBefore(m.starts, at0);
    const line = q.valueLine + n;
    // Every M line that is not blank ends where its TMDL line ends (v3 spec, section 6.1).
    const offset = lineAt(q.file, line).trimEnd().length - (m.lines[n] ?? "").trimEnd().length;
    return { file: q.file, line, column: Math.max(0, offset) + at0 - m.starts[n]! + 1 };
  };
  const queries: MQuery[] = [];
  const add = (
    kind: MQuery["kind"],
    name: string,
    owner: MQuery["owner"],
    node: TmdlNode | undefined,
  ) => {
    const text = node?.value ?? "";
    if (!node || node.valueLine === undefined || text.trim() === "") return;
    queries.push({ kind, name, owner, text, file: node.file, valueLine: node.valueLine });
  };
  for (const t of model.tables) {
    const mParts = t.partitions.filter((p) => p.sourceType === "m");
    for (const p of mParts) add("partition", t.name, p, partitionSource(p));
    const policy = policySource(t);
    if (policy && !mParts.some((p) => squash(p.source ?? "") === squash(policy.value ?? "")))
      add("refreshPolicy", t.name, t, policy);
  }
  for (const x of model.expressions) add("expression", x.name, x, expressionSource(x));

  const issues: MParseIssue[] = [];
  for (const q of queries) {
    const parsed = await parseM(q.text);
    if (parsed.ok) {
      q.ast = parsed.ast;
      q.nodeIdMapCollection = parsed.nodeIdMapCollection;
      continue;
    }
    const at = locate(q, parsed.position ?? { lineNumber: 0, lineCodeUnit: 0 });
    issues.push({
      file: at.file,
      line: at.line,
      column: at.column!,
      // Cut as a JSON issue's line is (readJson): a generated partition can hold lines of megabytes.
      text: lineAt(at.file, at.line).trim().slice(0, 120),
      reason: `M could not be parsed: ${parsed.message}`,
    });
  }
  return { queries, issues, locate };
}
