import type { TeNumberKind } from "./ast.js";

/** A token of a rule expression. `start` and `end` are offsets into the text, end exclusive. */
export type TeToken = { start: number; end: number } & (
  | {
      type: "ident";
      text: string;
      /** Written with a leading `@`, so never a keyword or a type name. */
      escaped: boolean;
    }
  | { type: "string"; value: string }
  | { type: "char"; value: string }
  | { type: "number"; numberKind: TeNumberKind; value: number; text: string }
  | { type: "op"; text: string }
  | { type: "end" }
);

/** A problem in the expression text, at an offset. The parser turns it into the message. */
export class TeSyntaxError extends Error {
  constructor(
    readonly what: string,
    readonly at: number,
    found?: string,
    hint?: string,
  ) {
    super(
      `${what} at character ${at + 1}${found ? `, found ${found}` : ""}${hint ? `; ${hint}` : ""}`,
    );
  }
}

/** Operators, longest first so `<=` wins over `<`. */
const OPERATORS = [
  "??",
  "==",
  "=>",
  "!=",
  "<=",
  "<>",
  ">=",
  "&&",
  "||",
  "(",
  ")",
  "[",
  "]",
  ",",
  ".",
  "?",
  ":",
  "=",
  "!",
  "<",
  ">",
  "&",
  "|",
  "+",
  "-",
  "*",
  "/",
  "%",
  "$",
];

const LETTER = /^[\p{L}\p{Nl}_]$/u;
const NAME_PART = /^[\p{L}\p{Nl}\p{Nd}\p{Mn}\p{Mc}\p{Pc}]$/u;
const SPACE = /^\s$/u;
const isDigit = (c: string | undefined) => c !== undefined && c >= "0" && c <= "9";
const isLetter = (c: string | undefined) => c !== undefined && LETTER.test(c);
const isNamePart = (c: string | undefined) => c !== undefined && NAME_PART.test(c);

const INT32_MAX = 2_147_483_647n;
const UINT32_MAX = 4_294_967_295n;
const INT64_MAX = 9_223_372_036_854_775_807n;
const UINT64_MAX = 18_446_744_073_709_551_615n;

/**
 * Splits a rule expression into tokens. Each step reads one token by hand, character by character,
 * so the time is linear in the text and no pattern can backtrack. Strings have no backslash
 * escapes: a doubled quote is the only way to write a quote inside one (Tabular Editor CLI 0.8.1.1
 * captures, `tests/rules/te-probes/semantics.json`).
 */
export function lex(text: string): TeToken[] {
  const tokens: TeToken[] = [];
  let i = 0;
  const n = text.length;
  while (i < n) {
    const c = text[i]!;
    if (SPACE.test(c)) {
      i++;
      continue;
    }
    const start = i;
    if (c === '"' || c === "'") {
      let value = "";
      i++;
      for (;;) {
        if (i >= n) {
          throw new TeSyntaxError(
            c === '"'
              ? "string literal not closed, it starts"
              : "character literal not closed, it starts",
            start,
          );
        }
        const d = text[i]!;
        if (d === c) {
          if (text[i + 1] === c) {
            value += c;
            i += 2;
            continue;
          }
          i++;
          break;
        }
        value += d;
        i++;
      }
      if (c === "'") {
        if (value.length !== 1) {
          throw new TeSyntaxError(
            "a character literal must hold exactly one character; this one starts",
            start,
          );
        }
        tokens.push({ type: "char", value, start, end: i });
      } else {
        tokens.push({ type: "string", value, start, end: i });
      }
      continue;
    }
    if (isDigit(c)) {
      tokens.push(readNumber(text, start));
      i = tokens[tokens.length - 1]!.end;
      continue;
    }
    if (isLetter(c) || (c === "@" && !isDigit(text[i + 1]))) {
      const escaped = c === "@";
      if (escaped) i++;
      const nameStart = i;
      if (isLetter(text[i])) {
        i++;
        while (isNamePart(text[i])) i++;
      }
      const name = text.slice(nameStart, i);
      tokens.push({ type: "ident", text: name === "" ? "@" : name, escaped, start, end: i });
      continue;
    }
    const op = OPERATORS.find((o) => text.startsWith(o, i));
    if (op === undefined) throw new TeSyntaxError(`unexpected character '${c}'`, start);
    tokens.push({ type: "op", text: op, start, end: i + op.length });
    i += op.length;
  }
  tokens.push({ type: "end", start: n, end: n });
  return tokens;
}

/** Reads a number literal and its suffix, and works out its .NET type. */
function readNumber(text: string, start: number): TeToken {
  let i = start;
  while (isDigit(text[i])) i++;
  let real = false;
  if (text[i] === "." && isDigit(text[i + 1])) {
    real = true;
    i++;
    while (isDigit(text[i])) i++;
  }
  if (text[i] === "e" || text[i] === "E") {
    const sign = text[i + 1] === "+" || text[i + 1] === "-" ? 1 : 0;
    if (isDigit(text[i + 1 + sign])) {
      real = true;
      i += 1 + sign;
      while (isDigit(text[i])) i++;
    }
  }
  const digits = text.slice(start, i);
  const suffixStart = i;
  let suffix = "";
  while (/^[a-zA-Z]$/.test(text[i] ?? "") && suffix.length < 2) suffix += text[i++];
  suffix = suffix.toUpperCase();
  let kind: TeNumberKind | undefined;
  if (suffix === "") {
    if (real) kind = "double";
    else {
      const v = BigInt(digits);
      if (v <= INT32_MAX) kind = "int";
      else if (v <= UINT32_MAX) kind = "uint";
      else if (v <= INT64_MAX) kind = "long";
      else if (v <= UINT64_MAX) kind = "ulong";
      else throw new TeSyntaxError("integer literal too large", start);
    }
  } else if (suffix === "F" || suffix === "D" || suffix === "M") {
    kind = suffix === "F" ? "float" : suffix === "D" ? "double" : "decimal";
  } else if (suffix === "L" || suffix === "U" || suffix === "UL" || suffix === "LU") {
    if (real)
      throw new TeSyntaxError(
        `the suffix '${suffix}' needs an integer, and this number is not one; it starts`,
        start,
      );
    kind = suffix === "L" ? "long" : suffix === "U" ? "uint" : "ulong";
    const v = BigInt(digits);
    const max = kind === "long" ? INT64_MAX : kind === "uint" ? UINT32_MAX : UINT64_MAX;
    if (v > max) throw new TeSyntaxError("integer literal too large", start);
  }
  // A suffix that is not one, or a name run straight into the number.
  if (kind === undefined || isNamePart(text[i])) {
    throw new TeSyntaxError(
      "unexpected character after a number",
      kind === undefined ? suffixStart : i,
    );
  }
  return { type: "number", numberKind: kind, value: Number(digits), text: digits, start, end: i };
}
