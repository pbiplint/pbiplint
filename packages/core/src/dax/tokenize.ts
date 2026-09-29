/**
 * A small DAX tokenizer: enough of DAX's lexical rules to tell a number from a string, a comment,
 * or a name, and to say which call and argument each token sits in. It is a port of the one the
 * research for #104 used (`daxlex.py`), browser-pure like the rest of core, and it never throws:
 * text it cannot make out becomes punctuation, one UTF-16 code unit at a time, and a string, name,
 * or comment left open runs to the end of the text. #108 moves the reference reader onto it.
 */

export type DaxTokenKind =
  "number" | "string" | "date" | "table" | "column" | "identifier" | "operator" | "punctuation";

export interface DaxToken {
  kind: DaxTokenKind;
  /**
   * For a string, a `dt"..."` date, a `'table'` name, or a `[column]` name, the text between its
   * quotes or brackets with a doubled quote or bracket undone (`""`, `''`, `]]`); for any other
   * token, its source text.
   */
  text: string;
  /** Offsets into the expression: the token's source is `expression.slice(start, end)`. */
  start: number;
  end: number;
  /** How many `(` and `{` enclose the token. A bracket's own depth is the depth outside it. */
  depth: number;
  /** The index of the innermost `(` or `{` enclosing the token, if any. */
  parent?: number;
  /** The token's argument within `parent`: how many commas directly inside `parent` precede it. */
  arg?: number;
  /** On an opening `(` or `{`, the index of the token that closes it, if one does. */
  close?: number;
  /** On a closing `)` or `}`, the index of the token it closes, if it closes one. */
  open?: number;
  /**
   * On a `(` right after an identifier, that identifier upper-cased. It names the function called
   * when the identifier is a function's name; a keyword before a `(`, such as `RETURN` or `IN`, is
   * recorded the same way.
   */
  call?: string;
}

/** A `VAR name = definition` in an expression. */
export interface DaxVariable {
  /** The name as written. DAX compares names without regard to case. */
  name: string;
  /** The index of the `VAR` token. */
  at: number;
  /** The definition: the tokens from `from` up to, not including, `to`. */
  from: number;
  to: number;
  /**
   * The index of the first token outside the variable's block: the first token after the `VAR`
   * that is shallower than it, or a comma at its own depth, which ends the argument it sits in,
   * and never past the end of a definition that holds the `VAR`. In
   * `VAR a = VAR b = 1 RETURN b RETURN a`, the block of `b` ends at the second `RETURN`.
   */
  blockEnd: number;
}

const OPERATORS = ["==", "<>", "<=", ">=", "&&", "||", "=", "<", ">", "+", "-", "*", "/", "^", "&"];
const NUMBER = /(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?/y;
const IDENTIFIER = /[\p{L}_][\p{L}\p{M}\p{N}_.]*/uy;
const WORD_CHAR = /[\p{L}\p{M}\p{N}_]/u;
const DIGIT = /[0-9]/;

/** Whether a token is the identifier or keyword `word`, given upper-case, in any case. */
export const isWord = (t: DaxToken | undefined, word: string): boolean =>
  t?.kind === "identifier" && t.text.toUpperCase() === word;

/** Whether a token is the punctuation `char`. */
export const isPunctuation = (t: DaxToken | undefined, char: string): boolean =>
  t?.kind === "punctuation" && t.text === char;

/** A run from the quote or bracket at `from` to its `close` character, a doubled `close` read as one. */
function quoted(text: string, from: number, close: string): { value: string; end: number } {
  let value = "";
  let j = from + 1;
  while (j < text.length) {
    const c = text[j]!;
    if (c === close) {
      if (text[j + 1] !== close) return { value, end: j + 1 };
      j++;
    }
    value += c;
    j++;
  }
  return { value, end: text.length };
}

/** The tokens of a DAX expression, comments dropped, each with its place among the brackets. */
export function tokenizeDax(expression: string): DaxToken[] {
  const s = expression;
  const tokens: DaxToken[] = [];
  const push = (kind: DaxTokenKind, text: string, start: number, end: number): void => {
    tokens.push({ kind, text, start, end, depth: 0 });
  };
  let i = 0;
  while (i < s.length) {
    const c = s[i]!;
    if (/\s/.test(c)) {
      i++;
    } else if (s.startsWith("//", i) || s.startsWith("--", i)) {
      const nl = s.indexOf("\n", i);
      i = nl === -1 ? s.length : nl;
    } else if (s.startsWith("/*", i)) {
      const close = s.indexOf("*/", i + 2);
      i = close === -1 ? s.length : close + 2;
    } else if (c === '"') {
      const q = quoted(s, i, '"');
      push("string", q.value, i, q.end);
      i = q.end;
    } else if (
      (c === "d" || c === "D") &&
      (s[i + 1] === "t" || s[i + 1] === "T") &&
      s[i + 2] === '"' &&
      !(i > 0 && WORD_CHAR.test(s[i - 1]!))
    ) {
      const q = quoted(s, i + 2, '"');
      push("date", q.value, i, q.end);
      i = q.end;
    } else if (c === "'" || c === "[") {
      const q = quoted(s, i, c === "'" ? "'" : "]");
      push(c === "'" ? "table" : "column", q.value, i, q.end);
      i = q.end;
    } else if (DIGIT.test(c) || (c === "." && DIGIT.test(s[i + 1] ?? ""))) {
      NUMBER.lastIndex = i;
      const text = NUMBER.exec(s)![0];
      push("number", text, i, i + text.length);
      i += text.length;
    } else {
      IDENTIFIER.lastIndex = i;
      const id = IDENTIFIER.exec(s)?.[0];
      const op = id === undefined ? OPERATORS.find((o) => s.startsWith(o, i)) : undefined;
      const text = id ?? op ?? c;
      push(
        id !== undefined ? "identifier" : op !== undefined ? "operator" : "punctuation",
        text,
        i,
        i + text.length,
      );
      i += text.length;
    }
  }
  annotate(tokens);
  return tokens;
}

/** Match brackets, and give each token its depth, its enclosing bracket, its argument, and its call. */
function annotate(tokens: DaxToken[]): void {
  const open: number[] = [];
  const args: number[] = [];
  const place = (t: DaxToken): void => {
    t.depth = open.length;
    if (open.length === 0) return;
    t.parent = open[open.length - 1];
    t.arg = args[args.length - 1];
  };
  tokens.forEach((t, k) => {
    if (isPunctuation(t, "(") || isPunctuation(t, "{")) {
      place(t);
      const before = tokens[k - 1];
      if (t.text === "(" && before?.kind === "identifier") t.call = before.text.toUpperCase();
      open.push(k);
      args.push(0);
    } else if (isPunctuation(t, ")") || isPunctuation(t, "}")) {
      const o = open.pop();
      args.pop();
      if (o !== undefined) {
        tokens[o]!.close = k;
        t.open = o;
      }
      place(t);
    } else {
      place(t);
      if (isPunctuation(t, ",") && args.length > 0) args[args.length - 1] = args.at(-1)! + 1;
    }
  });
}

/**
 * Whether the `VAR` at `k` opens a block of its own: it directly follows a `VAR name =`, so it
 * starts that variable's definition, or it directly follows a `RETURN`, so it starts that block's
 * result.
 */
function opensBlock(tokens: readonly DaxToken[], k: number): boolean {
  if (isWord(tokens[k - 1], "RETURN")) return true;
  const eq = tokens[k - 1];
  return (
    isWord(tokens[k - 3], "VAR") &&
    tokens[k - 2]?.kind === "identifier" &&
    eq?.kind === "operator" &&
    eq.text === "="
  );
}

/**
 * Each `VAR name = definition` in the tokens. A definition runs to the next `VAR` or `RETURN` at
 * its own depth, or to the first token shallower than it. A definition can itself be a `VAR`
 * block without parentheses (`VAR a = VAR b = 1 RETURN b + 1 RETURN a`), so the scan counts the
 * blocks nested at the definition's depth: a `VAR` there opens one when it is the definition's
 * first token or directly follows a nested `VAR name =` or a `RETURN`, a `RETURN` there closes
 * one, and only a `VAR` or `RETURN` there outside every nested block ends the definition. A `VAR`
 * inside a nested block that opens nothing is a sibling in that block.
 */
export function daxVariables(tokens: readonly DaxToken[]): DaxVariable[] {
  const out: DaxVariable[] = [];
  tokens.forEach((t, k) => {
    const name = tokens[k + 1];
    const eq = tokens[k + 2];
    if (!isWord(t, "VAR") || name?.kind !== "identifier" || eq?.kind !== "operator") return;
    if (eq.text !== "=") return;
    const from = k + 3;
    let to = from;
    let nested = 0;
    for (; to < tokens.length; to++) {
      const x = tokens[to]!;
      if (x.depth < t.depth) break;
      if (x.depth !== t.depth) continue;
      if (isWord(x, "VAR")) {
        if (opensBlock(tokens, to)) nested++;
        else if (nested === 0) break;
      } else if (isWord(x, "RETURN")) {
        if (nested === 0) break;
        nested--;
      }
    }
    let blockEnd = to;
    for (; blockEnd < tokens.length; blockEnd++) {
      const x = tokens[blockEnd]!;
      if (x.depth < t.depth || (x.depth === t.depth && isPunctuation(x, ","))) break;
    }
    out.push({ name: name.text, at: k, from, to, blockEnd });
  });
  // A block nested in a definition ends where the definition does. Definitions nest, so the
  // smallest end among those holding the `VAR` is the innermost one's.
  for (const v of out)
    for (const d of out) if (d.from <= v.at && v.at < d.to && d.to < v.blockEnd) v.blockEnd = d.to;
  return out;
}

/**
 * The definition a variable's name refers to at token `use`, as DAX scopes a variable: the
 * nearest `VAR` of that name before the use whose block the use is still in, leaving out one whose
 * own definition holds the use.
 */
export function variableAt(
  vars: readonly DaxVariable[],
  name: string,
  use: number,
): DaxVariable | undefined {
  const key = name.toUpperCase();
  let found: DaxVariable | undefined;
  for (const v of vars)
    if (
      v.name.toUpperCase() === key &&
      v.at < use &&
      use < v.blockEnd &&
      !(v.from <= use && use < v.to)
    )
      found = v;
  return found;
}
