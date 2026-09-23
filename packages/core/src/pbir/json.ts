import type { ParseIssue } from "../tmdl/types.js";

export interface JsonRead {
  /** The parsed document, or undefined when the text could not be read. */
  json: unknown;
  issues: ParseIssue[];
  /** The document's `$schema` URL, when it has one. */
  schema?: string;
  /** The version segment of that URL: `3.2.0` for `.../report/3.2.0/schema.json`. */
  schemaVersion?: string;
}

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

/** A git conflict marker at the start of a line: the file was saved mid-merge. */
const CONFLICT_MARKER = /^(?:<{7}|={7}|>{7})(?:\s|$)/;

/** How a document is cut into lines. Every line number in this file counts the same breaks. */
const LINE_BREAK = /\r\n?|\n/;

/**
 * An offset an engine names in a parse error message. Anchored to the engine's own phrasing, as in
 * V8's `in JSON at position 14` and `after JSON at position 9`, because the message also quotes a
 * slice of the document, and a document is free to say `position 400` itself.
 */
const AT_POSITION = /\bJSON at position (\d+)/;

/**
 * A line an engine names instead of an offset, anchored the same way: V8's `(line 3 column 1)` and
 * Firefox's `at line 3 column 9 of the JSON data`.
 */
const AT_LINE = /\bline (\d+) column \d+/;

/**
 * The run of text an engine quotes when it names neither, as in
 * `Unexpected token '}', ..."1,\n  "b": }\n" is not valid JSON`. What sits between the quotes is a
 * literal slice of the document, and the ellipses mark the sides it was cut on.
 */
const QUOTED_RUN = /^Unexpected token '(.)', (?:\.\.\.)?"([\s\S]*)"(?:\.\.\.)? is not valid JSON$/;

/**
 * The 1-based line a JSON.parse error points at. Engines say it three ways: an offset into the
 * document, a line of its own, or a quoted run of the text around the failure. That run is centred
 * on the character the parser stopped at, so of the places that character appears in it, the one
 * nearest the middle is the failure. An offset or a line the document cannot hold did not come
 * from the engine, so it falls through to the next way; line 1 is the honest answer when a message
 * says none of the three.
 */
function lineOfParseError(body: string, message: string): number {
  const lineCount = body.split(LINE_BREAK).length;
  const lineOf = (offset: number): number => body.slice(0, offset).split(LINE_BREAK).length;
  const at = AT_POSITION.exec(message);
  if (at && Number(at[1]) <= body.length) return lineOf(Number(at[1]));
  const named = AT_LINE.exec(message);
  if (named && Number(named[1]) >= 1 && Number(named[1]) <= lineCount) return Number(named[1]);
  const quoted = QUOTED_RUN.exec(message);
  if (!quoted) return 1;
  const char = quoted[1]!;
  const run = quoted[2]!;
  const start = body.indexOf(run);
  if (start < 0) return 1;
  const middle = run.length / 2;
  let offset = -1;
  for (let i = run.indexOf(char); i >= 0; i = run.indexOf(char, i + 1)) {
    if (offset < 0 || Math.abs(i - middle) < Math.abs(offset - middle)) offset = i;
  }
  return offset < 0 ? 1 : lineOf(start + offset);
}

/**
 * Reads one PBIR JSON file tolerantly. Conflict markers and invalid JSON become parse issues with
 * a line, in the same shape the TMDL parser reports, so PARSE_ISSUE lists them beside everything
 * else; the document is then undefined and the caller reads nothing from it.
 */
export function readJson(file: string, text: string): JsonRead {
  // Desktop writes JSON with a BOM at times; it is not part of the document.
  const body = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  const lines = body.split(LINE_BREAK);
  const issues: ParseIssue[] = lines.flatMap((line, i) =>
    CONFLICT_MARKER.test(line)
      ? [{ file, line: i + 1, text: line, reason: "merge conflict marker" }]
      : [],
  );
  if (issues.length > 0) return { json: undefined, issues };
  try {
    const json: unknown = JSON.parse(body);
    const schema = isRecord(json) && typeof json.$schema === "string" ? json.$schema : undefined;
    return { json, issues, schema, schemaVersion: schemaVersionOf(schema) };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    const line = lineOfParseError(body, message);
    // The message quotes a slice of the document, raw line breaks included. The line lookup reads
    // it as the engine wrote it; the reason takes it on one line, so a finding stays one row.
    const flat = message.replace(/\s+/g, " ");
    return {
      json: undefined,
      issues: [{ file, line, text: lines[line - 1] ?? "", reason: `not valid JSON (${flat})` }],
    };
  }
}

const SCHEMA_TAIL = /\/([^/]+)\/(\d+\.\d+\.\d+)\/schema\.json$/;

export const schemaVersionOf = (schema: string | undefined): string | undefined =>
  schema === undefined ? undefined : SCHEMA_TAIL.exec(schema)?.[2];

/** The family segment before the version: `report`, `page`, `visualContainer`, `pagesMetadata`. */
export const schemaFamilyOf = (schema: string | undefined): string | undefined =>
  schema === undefined ? undefined : SCHEMA_TAIL.exec(schema)?.[1];

/** True when `a` is a newer version than `b`, comparing each numeric segment. */
export function newerThan(a: string, b: string): boolean {
  const pa = a.split(".").map(Number);
  const pb = b.split(".").map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const x = pa[i] ?? 0;
    const y = pb[i] ?? 0;
    if (x !== y) return x > y;
  }
  return false;
}

/**
 * The 1-based line of what a JSON pointer names, for a finding's location: the line of the key
 * for an object member, the line the value starts on for an array element. 1 for the root or for
 * a pointer that names nothing. A token scanner rather than a parse, because JSON.parse keeps no
 * positions; it tracks the path as it walks and stops at the first match.
 */
export function lineOfPointer(text: string, pointer: string): number {
  if (pointer === "") return 1;
  const want = pointer
    .split("/")
    .slice(1)
    .map((s) => s.replace(/~1/g, "/").replace(/~0/g, "~"));
  const path: string[] = [];
  const kinds: ("object" | "array")[] = [];
  const parent = (): "object" | "array" | undefined => kinds[kinds.length - 1];
  const matches = (): boolean => path.length === want.length && path.every((p, i) => p === want[i]);
  let line = 1;
  let expectKey = false;
  // The text a finding factory holds keeps the BOM readJson drops. It is not part of the document;
  // read as a scalar, it would swallow the opening brace with it, and the scan would lose the root.
  for (let i = text.charCodeAt(0) === 0xfeff ? 1 : 0; i < text.length; i++) {
    const ch = text[i]!;
    if (ch === "\n") {
      line++;
      continue;
    }
    if (ch === " " || ch === "\t" || ch === "\r" || ch === ":") continue;
    if (ch === '"') {
      let j = i + 1;
      while (j < text.length && text[j] !== '"') {
        if (text[j] === "\\") j++;
        j++;
      }
      const value = JSON.parse(text.slice(i, j + 1)) as string;
      if (parent() === "object" && expectKey) {
        path[path.length - 1] = value;
        expectKey = false;
        if (matches()) return line;
      } else if (parent() === "array" && matches()) return line;
      for (let k = i; k <= j; k++) if (text[k] === "\n") line++;
      i = j;
      continue;
    }
    if (ch === "{" || ch === "[") {
      if (parent() === "array" && matches()) return line;
      kinds.push(ch === "{" ? "object" : "array");
      path.push(ch === "{" ? "" : "0");
      expectKey = ch === "{";
      continue;
    }
    if (ch === "}" || ch === "]") {
      kinds.pop();
      path.pop();
      expectKey = false;
      continue;
    }
    if (ch === ",") {
      if (parent() === "array") path[path.length - 1] = String(Number(path[path.length - 1]) + 1);
      else expectKey = true;
      continue;
    }
    // A number, true, false, or null. The skip takes at least this character, so a character a
    // regex `\s` matches but the whitespace test above does not, such as U+00A0, cannot stall it.
    if (parent() === "array" && matches()) return line;
    let j = i + 1;
    while (j < text.length && !/[\s,\]}]/.test(text[j]!)) j++;
    i = j - 1;
  }
  return 1;
}
