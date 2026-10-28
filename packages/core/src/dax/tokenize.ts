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
 *
 * One pass from the right reads every definition at once. Tokens at one depth with nothing
 * shallower between them form a run, and each run keeps a count of the blocks its `VAR`s open
 * less those its `RETURN`s close, from the right: a definition ends at the nearest `RETURN` or
 * closing `VAR` to its right where that count is what it is at the definition's start.
 */
export function daxVariables(tokens: readonly DaxToken[]): DaxVariable[] {
  const n = tokens.length;
  /** Per index, the first comma at the token's own depth or token shallower than it, from there. */
  const ends: number[] = [];
  const to: number[] = [];
  /** Indexes of tokens, each shallower than the one above it: the nearest shallower token. */
  const shallower: number[] = [];
  /** Per depth, its run: where the run ends, its count, the nearest comma, and each count's end. */
  const runs: { end: number; count: number; comma: number; stops: Map<number, number> }[] = [];
  for (let k = n - 1; k >= 0; k--) {
    const t = tokens[k]!;
    while (shallower.length > 0 && tokens[shallower.at(-1)!]!.depth >= t.depth) shallower.pop();
    const end = shallower.at(-1) ?? n;
    shallower.push(k);
    let run = runs[t.depth];
    if (run?.end !== end) runs[t.depth] = run = { end, count: 0, comma: end, stops: new Map() };
    if (isPunctuation(t, ",")) run.comma = k;
    ends[k] = run.comma;
    // At `VAR name =`'s `=`, the run holds what lies after it: the definition.
    const v = tokens[k - 2];
    if (isWord(v, "VAR") && tokens[k - 1]?.kind === "identifier" && t.kind === "operator")
      if (t.text === "=") to[k - 2] = run.stops.get(run.count) ?? end;
    if (isWord(t, "RETURN")) run.stops.set(--run.count, k);
    else if (isWord(t, "VAR"))
      if (opensBlock(tokens, k)) run.count++;
      else run.stops.set(run.count, k);
  }
  const out: DaxVariable[] = [];
  /** The definitions holding the current `VAR`, innermost on top. */
  const holding: DaxVariable[] = [];
  to.forEach((stop, at) => {
    const t = tokens[at]!;
    const blockEnd = stop < n && tokens[stop]!.depth === t.depth ? ends[stop]! : stop;
    const v = { name: tokens[at + 1]!.text, at, from: at + 3, to: stop, blockEnd };
    // A block nested in a definition ends where the definition does. Definitions nest, so the
    // innermost one holding the `VAR` ends first.
    while (holding.length > 0 && holding.at(-1)!.to <= at) holding.pop();
    const d = holding.at(-1);
    if (d && d.to < v.blockEnd) v.blockEnd = d.to;
    holding.push(v);
    out.push(v);
  });
  return out;
}

/** Per array of variables, each name's scopes: where the name's meaning changes, and to what. */
const SCOPES = new WeakMap<
  readonly DaxVariable[],
  Map<string, { from: number[]; v: (DaxVariable | undefined)[] }>
>();

/** The scopes of each name, upper-cased: a sweep over the token ranges each variable covers. */
function scopesOf(
  vars: readonly DaxVariable[],
): Map<string, { from: number[]; v: (DaxVariable | undefined)[] }> {
  const known = SCOPES.get(vars);
  if (known) return known;
  // The uses a variable covers: after its `VAR`, before its block's end, outside its definition.
  const ranges = new Map<string, [number, number, number][]>();
  vars.forEach((v, i) => {
    const key = v.name.toUpperCase();
    const list = ranges.get(key) ?? [];
    ranges.set(key, list);
    list.push(
      [v.at + 1, Math.min(v.from, v.blockEnd), i],
      [Math.max(v.to, v.at + 1), v.blockEnd, i],
    );
  });
  const scopes = new Map<string, { from: number[]; v: (DaxVariable | undefined)[] }>();
  for (const [key, list] of ranges) {
    const live = list.filter(([lo, hi]) => lo < hi).sort((a, b) => a[0] - b[0]);
    const points = [...new Set(live.flatMap(([lo, hi]) => [lo, hi]))].sort((a, b) => a - b);
    const scope = { from: [] as number[], v: [] as (DaxVariable | undefined)[] };
    // A heap of the ranges begun, the latest variable on top; a range is dropped once it ends.
    const heap: [number, number, number][] = [];
    const up = (a: number, b: number): boolean => heap[a]![2] > heap[b]![2];
    const swap = (a: number, b: number): void => void ([heap[a], heap[b]] = [heap[b]!, heap[a]!]);
    let next = 0;
    for (const p of points) {
      for (; next < live.length && live[next]![0] <= p; next++) {
        let c = heap.push(live[next]!) - 1;
        for (; c > 0 && up(c, (c - 1) >> 1); c = (c - 1) >> 1) swap(c, (c - 1) >> 1);
      }
      while (heap.length > 0 && heap[0]![1] <= p) {
        swap(0, heap.length - 1);
        heap.pop();
        for (let c = 0; ;) {
          const l = 2 * c + 1;
          const top = l + 1 < heap.length && up(l + 1, l) ? l + 1 : l;
          if (top >= heap.length || !up(top, c)) break;
          swap(top, c);
          c = top;
        }
      }
      const v = heap[0] && vars[heap[0][2]];
      if (scope.v.at(-1) !== v || scope.from.length === 0) {
        scope.from.push(p);
        scope.v.push(v);
      }
    }
    scopes.set(key, scope);
  }
  SCOPES.set(vars, scopes);
  return scopes;
}

/**
 * The definition a variable's name refers to at token `use`, as DAX scopes a variable: the
 * nearest `VAR` of that name before the use whose block the use is still in, leaving out one whose
 * own definition holds the use. The first call for an array of variables indexes it, so the array
 * is not to change after.
 */
export function variableAt(
  vars: readonly DaxVariable[],
  name: string,
  use: number,
): DaxVariable | undefined {
  const scope = scopesOf(vars).get(name.toUpperCase());
  if (!scope) return undefined;
  // The last point at or before the use.
  let [lo, hi] = [0, scope.from.length];
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (scope.from[mid]! <= use) lo = mid + 1;
    else hi = mid;
  }
  return lo > 0 ? scope.v[lo - 1] : undefined;
}
