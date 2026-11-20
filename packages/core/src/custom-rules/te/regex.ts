import { LIMITS } from "../limits.js";

/**
 * A matcher for the .NET regular expressions custom rules pass to `RegEx.IsMatch` (custom rules
 * spec, sections 6.4 and 6.5). It answers yes or no by simulating every state of the pattern at
 * once over the input, so its work is at most the input's length times the pattern's states: no
 * backtracking, whatever the pattern. A pattern .NET refuses is reported as `invalid` (the rule
 * fails, as it does in Tabular Editor); a construct .NET accepts but this matcher cannot run
 * exactly is reported as `unsupported`, naming the construct. Nothing is run approximately.
 *
 * Input is read as UTF-16 code units, as .NET reads a string, so a character outside the Basic
 * Multilingual Plane is two characters to `.` and to a class, as it is to .NET.
 */

/** The steps a match may still take; `isMatch` spends one per state visited at each position. */
export type Budget = { left: number };

/** Thrown by `isMatch` when the budget is spent. */
export class LimitReached extends Error {
  constructor() {
    super("reached the evaluation limit while matching a regular expression");
    this.name = "LimitReached";
  }
}

/** A test of one UTF-16 code unit. */
export type CharTest = (code: number) => boolean;
/** A test of a position in the input, for anchors, boundaries and one-character lookarounds. */
export type PositionTest = (input: string, at: number) => boolean;

/** One instruction of a compiled pattern. */
export type Inst =
  | { op: "char"; test: CharTest; next: number }
  | { op: "split"; next: number; alt: number }
  | { op: "assert"; test: PositionTest; next: number }
  | { op: "match" };

/** A compiled pattern, ready for `isMatch`. */
export interface CompiledPattern {
  readonly insts: readonly Inst[];
  readonly start: number;
}

/** What `compilePattern` returns. */
export type CompileResult =
  { regex: CompiledPattern } | { unsupported: string } | { invalid: string };

// ---------------------------------------------------------------------------------------------
// Character classes, with .NET's Unicode meanings. These regular expressions are constant source
// written here, used only to test one character against a Unicode property; no pattern text from
// a rule ever reaches JavaScript's RegExp.

/** Caches the answers for ASCII, so the common case needs no RegExp call. */
function charTest(re: RegExp): CharTest {
  const ascii = new Uint8Array(128);
  for (let c = 0; c < 128; c++) ascii[c] = re.test(String.fromCharCode(c)) ? 1 : 0;
  return (c) => (c < 128 ? ascii[c] === 1 : re.test(String.fromCharCode(c)));
}

/** `\d`: Unicode decimal digits (Nd). */
const isDigit = charTest(/\p{Nd}/u);
/** `\w`: letters, nonspacing marks, decimal digits and connector punctuation. */
const isWord = charTest(/[\p{L}\p{Mn}\p{Nd}\p{Pc}]/u);
const isSeparator = charTest(/\p{Z}/u);
/** `\s`: form feed, newline, carriage return, tab, vertical tab, next line, and separators. */
const isSpace: CharTest = (c) => (c >= 9 && c <= 13) || c === 0x20 || c === 0x85 || isSeparator(c);
/** The word characters `\b` looks for: `\w` plus the zero-width joiner and non-joiner, as .NET has. */
const isBoundaryWord: CharTest = (c) => isWord(c) || c === 0x200c || c === 0x200d;

/** The general categories `\p{}` accepts. */
const CATEGORIES: Record<string, RegExp> = {
  L: /\p{L}/u,
  Lu: /\p{Lu}/u,
  Ll: /\p{Ll}/u,
  Lt: /\p{Lt}/u,
  Lm: /\p{Lm}/u,
  Lo: /\p{Lo}/u,
  M: /\p{M}/u,
  Mn: /\p{Mn}/u,
  Mc: /\p{Mc}/u,
  Me: /\p{Me}/u,
  N: /\p{N}/u,
  Nd: /\p{Nd}/u,
  Nl: /\p{Nl}/u,
  No: /\p{No}/u,
  P: /\p{P}/u,
  Pc: /\p{Pc}/u,
  Pd: /\p{Pd}/u,
  Ps: /\p{Ps}/u,
  Pe: /\p{Pe}/u,
  Pi: /\p{Pi}/u,
  Pf: /\p{Pf}/u,
  Po: /\p{Po}/u,
  S: /\p{S}/u,
  Sm: /\p{Sm}/u,
  Sc: /\p{Sc}/u,
  Sk: /\p{Sk}/u,
  So: /\p{So}/u,
  Z: /\p{Z}/u,
  Zs: /\p{Zs}/u,
  Zl: /\p{Zl}/u,
  Zp: /\p{Zp}/u,
  C: /\p{C}/u,
  Cc: /\p{Cc}/u,
  Cf: /\p{Cf}/u,
  Cs: /\p{Cs}/u,
  Co: /\p{Co}/u,
  Cn: /\p{Cn}/u,
};
const CATEGORY_TESTS = new Map<string, CharTest>();
function categoryTest(name: string): CharTest | undefined {
  if (!Object.hasOwn(CATEGORIES, name)) return undefined;
  let t = CATEGORY_TESTS.get(name);
  if (!t) CATEGORY_TESTS.set(name, (t = charTest(CATEGORIES[name]!)));
  return t;
}
/** Categories whose members change under case-insensitive matching in ways not settled here. */
const CASED_CATEGORIES = new Set(["Lu", "Ll", "Lt"]);

// ---------------------------------------------------------------------------------------------
// Case-insensitive comparison: two characters match when their simple case folds are equal. The
// fold of a character is the lower case of its upper case, where each is one character. The dotted
// and dotless i of Turkish fold only to themselves, as .NET has them outside a Turkish culture.

let foldOf: Uint16Array | undefined;
let foldGroups: Map<number, number[]> | undefined;

function buildFolds(): void {
  const fold = new Uint16Array(0x10000);
  const groups = new Map<number, number[]>();
  for (let c = 0; c < 0x10000; c++) {
    let f = c;
    if ((c < 0xd800 || c > 0xdfff) && c !== 0x130 && c !== 0x131) {
      const s = String.fromCharCode(c);
      const upper = s.toUpperCase();
      const lower = (upper.length === 1 ? upper : s).toLowerCase();
      if (lower.length === 1) f = lower.charCodeAt(0);
      if (f === 0x130 || f === 0x131) f = c;
    }
    fold[c] = f;
    const g = groups.get(f);
    if (g) g.push(c);
    else groups.set(f, [c]);
  }
  for (const [key, g] of groups) if (g.length < 2) groups.delete(key);
  foldOf = fold;
  foldGroups = groups;
}

/** Every character that matches `c` when case is ignored, `c` included. */
function caseVariants(c: number): number[] {
  if (!foldOf) buildFolds();
  return foldGroups!.get(foldOf![c]!) ?? [c];
}

function literalTest(code: number, ignoreCase: boolean): CharTest {
  if (!ignoreCase) return (c) => c === code;
  const variants = caseVariants(code);
  if (variants.length === 1) return (c) => c === code;
  return (c) => variants.includes(c);
}

// ---------------------------------------------------------------------------------------------
// The parser: .NET's syntax to a tree.

type Node =
  | { k: "char"; test: CharTest }
  | { k: "assert"; test: PositionTest }
  | { k: "cat"; items: Node[] }
  | { k: "alt"; items: Node[] }
  | { k: "rep"; body: Node; min: number; max: number }
  | { k: "empty" };

const EMPTY: Node = { k: "empty" };
const INT_MAX = 2_147_483_647;

/** A pattern .NET itself refuses. */
class Invalid extends Error {}
/** A construct that stops the parse at once (groups nested past the limit). */
class Stop extends Error {}

/** The groups a pattern defines, so a reference can be told from an undefined one. */
interface Groups {
  count: number;
  names: Set<string>;
  numbers: Set<number>;
}

const isAsciiDigit = (ch: string | undefined): boolean =>
  ch !== undefined && ch >= "0" && ch <= "9";
const isOctal = (ch: string | undefined): boolean => ch !== undefined && ch >= "0" && ch <= "7";
const hexValue = (ch: string | undefined): number => {
  if (ch === undefined) return -1;
  const c = ch.charCodeAt(0);
  if (c >= 48 && c <= 57) return c - 48;
  if (c >= 65 && c <= 70) return c - 55;
  if (c >= 97 && c <= 102) return c - 87;
  return -1;
};
const wordAt = (p: string, i: number): boolean => i < p.length && isWord(p.charCodeAt(i));
const boundaryWordAt = (p: string, i: number): boolean =>
  i < p.length && isBoundaryWord(p.charCodeAt(i));

/** A first pass that counts capturing groups and collects group names. */
function scanGroups(p: string): Groups {
  const groups: Groups = { count: 0, names: new Set(), numbers: new Set() };
  for (let i = 0; i < p.length; i++) {
    const c = p[i];
    if (c === "\\") {
      i++;
    } else if (c === "[") {
      let j = i + 1;
      if (p[j] === "^") j++;
      if (p[j] === "]") j++;
      while (j < p.length && p[j] !== "]") j += p[j] === "\\" ? 2 : 1;
      i = j;
    } else if (c === "(") {
      if (p[i + 1] !== "?") {
        groups.count++;
      } else if (p[i + 2] === "#") {
        while (i < p.length && p[i] !== ")") i++;
      } else if ((p[i + 2] === "<" && p[i + 3] !== "=" && p[i + 3] !== "!") || p[i + 2] === "'") {
        let j = i + 3;
        while (wordAt(p, j)) j++;
        const name = p.slice(i + 3, j);
        if (name && [...name].every(isAsciiDigit)) groups.numbers.add(Number(name));
        else if (name) groups.names.add(name);
      }
    }
  }
  return groups;
}

class Parser {
  private i = 0;
  private ignoreCase = false;
  private depth = 0;
  /** The first construct found that cannot be run; parsing goes on so an invalid pattern wins. */
  unsupported: string | undefined;

  constructor(
    private readonly p: string,
    private readonly groups: Groups,
  ) {}

  private refuse(what: string): void {
    this.unsupported ??= what;
  }

  private fail(what: string, at = this.i): never {
    throw new Invalid(`${what} (character ${at + 1})`);
  }

  parse(): Node {
    const node = this.alternation();
    if (this.i < this.p.length) this.fail("a `)` with no `(` before it to close");
    return node;
  }

  /** Alternatives up to a `)` or the end. */
  private alternation(): Node {
    const p = this.p;
    const alts: Node[] = [];
    let items: Node[] = [];
    for (;;) {
      this.skipComments();
      if (this.i >= p.length || p[this.i] === ")") break;
      if (p[this.i] === "|") {
        alts.push(concat(items));
        items = [];
        this.i++;
        continue;
      }
      if (this.quantifierAhead()) this.fail("a quantifier with nothing to repeat");
      const atom = this.atom();
      if (atom === null) continue;
      this.skipComments();
      if (!this.quantifierAhead()) {
        items.push(atom);
        continue;
      }
      items.push(this.quantifier(atom));
      this.skipComments();
      if (this.quantifierAhead()) this.fail("a quantifier after a quantifier");
    }
    alts.push(concat(items));
    return alts.length === 1 ? alts[0]! : { k: "alt", items: alts };
  }

  /** `(?#...)` comments, which .NET skips wherever they stand, even before a quantifier. */
  private skipComments(): void {
    const p = this.p;
    while (p.startsWith("(?#", this.i)) {
      const end = p.indexOf(")", this.i + 3);
      if (end < 0) this.fail("a `(?#` comment that is never closed");
      this.i = end + 1;
    }
  }

  private quantifierAhead(): boolean {
    const ch = this.p[this.i];
    return ch === "*" || ch === "+" || ch === "?" || (ch === "{" && this.braceQuantifierAt(this.i));
  }

  /** `{n}`, `{n,}` or `{n,m}`; any other brace is a literal. */
  private braceQuantifierAt(i: number): boolean {
    const p = this.p;
    let j = i + 1;
    if (!isAsciiDigit(p[j])) return false;
    while (isAsciiDigit(p[j])) j++;
    if (p[j] === ",") {
      j++;
      while (isAsciiDigit(p[j])) j++;
    }
    return p[j] === "}";
  }

  private quantifier(body: Node): Node {
    const p = this.p;
    const at = this.i;
    const ch = p[this.i++];
    let min: number;
    let max: number;
    if (ch === "*") [min, max] = [0, Infinity];
    else if (ch === "+") [min, max] = [1, Infinity];
    else if (ch === "?") [min, max] = [0, 1];
    else {
      min = this.count(at);
      if (p[this.i] === ",") {
        this.i++;
        max = isAsciiDigit(p[this.i]) ? this.count(at) : Infinity;
      } else {
        max = min;
      }
      this.i++; // the closing brace
      if (max < min) this.fail("a repeat whose minimum is larger than its maximum", at);
    }
    if (p[this.i] === "?") this.i++; // lazy: the same yes-or-no answer as greedy
    return { k: "rep", body, min, max };
  }

  private count(at: number): number {
    const p = this.p;
    let n = 0;
    while (isAsciiDigit(p[this.i])) {
      n = n * 10 + (p.charCodeAt(this.i++) - 48);
      if (n > INT_MAX) this.fail("a repeat count larger than .NET allows", at);
    }
    return n;
  }

  /** One atom, or null for an inline option such as `(?i)`, which matches nothing itself. */
  private atom(): Node | null {
    const p = this.p;
    const ch = p[this.i]!;
    switch (ch) {
      case "(":
        return this.group();
      case "[": {
        const test = this.charClass();
        return { k: "char", test };
      }
      case ".":
        this.i++;
        return { k: "char", test: (c) => c !== 10 };
      case "^":
        this.i++;
        return { k: "assert", test: (_s, at) => at === 0 };
      case "$":
        this.i++;
        return { k: "assert", test: atEnd };
      case "\\":
        return this.escape();
      default:
        this.i++;
        return { k: "char", test: literalTest(ch.charCodeAt(0), this.ignoreCase) };
    }
  }

  private group(): Node | null {
    const p = this.p;
    const open = this.i;
    this.i++;
    if (p[this.i] !== "?") return this.groupBody(open);
    this.i++;
    const ch = p[this.i];
    switch (ch) {
      case ":":
        this.i++;
        return this.groupBody(open);
      case "=":
      case "!":
        this.i++;
        return this.lookaround(open, false, ch === "!");
      case "<":
        if (p[this.i + 1] === "=" || p[this.i + 1] === "!") {
          const negative = p[this.i + 1] === "!";
          this.i += 2;
          return this.lookaround(open, true, negative);
        }
        return this.namedGroup(open, ">");
      case "'":
        return this.namedGroup(open, "'");
      case ">":
        this.i++;
        this.refuse("an atomic group `(?>...)` cannot be translated exactly");
        return this.groupBody(open);
      case "(":
        // The condition is itself parenthesized; parsing it as a group keeps the structure.
        this.refuse("a conditional `(?(...)yes|no)` cannot be run");
        return this.groupBody(open);
      default:
        return this.options(open);
    }
  }

  private groupBody(open: number): Node {
    if (++this.depth > LIMITS.nesting) {
      throw new Stop(`groups nested more than ${LIMITS.nesting} deep, the most pbiplint runs`);
    }
    const saved = this.ignoreCase;
    const node = this.alternation();
    if (this.p[this.i] !== ")") this.fail("a `(` that is never closed", open);
    this.i++;
    this.ignoreCase = saved;
    this.depth--;
    return node;
  }

  private namedGroup(open: number, close: string): Node {
    const p = this.p;
    this.i++;
    const name = this.groupName();
    if (p[this.i] === "-") {
      this.i++;
      if (!this.groupName()) this.fail("an invalid group name", open);
      this.refuse("a balancing group `(?<name-other>...)` cannot be run");
    } else if (!name) {
      this.fail("an invalid group name", open);
    }
    if (p[this.i] !== close) this.fail("an invalid group name", open);
    this.i++;
    return this.groupBody(open);
  }

  private groupName(): string {
    const p = this.p;
    const start = this.i;
    if (isAsciiDigit(p[this.i])) while (isAsciiDigit(p[this.i])) this.i++;
    else while (wordAt(p, this.i)) this.i++;
    return p.slice(start, this.i);
  }

  /** `(?imnsx-imnsx)` or `(?imnsx-imnsx:...)`; only `i` changes anything pbiplint runs. */
  private options(open: number): Node | null {
    const p = this.p;
    let on = true;
    let ignoreCase = this.ignoreCase;
    for (;;) {
      const ch = p[this.i];
      if (ch === "-") on = false;
      else if (ch === "+") on = true;
      else if (ch === "i") ignoreCase = on;
      else if (ch === "m" || ch === "n" || ch === "s" || ch === "x") {
        if (on)
          this.refuse(`the inline option \`(?${ch})\` cannot be run; pbiplint runs only \`(?i)\``);
      } else break;
      this.i++;
    }
    if (p[this.i] === ")") {
      this.i++;
      this.ignoreCase = ignoreCase;
      return null;
    }
    if (p[this.i] === ":") {
      this.i++;
      const saved = this.ignoreCase;
      this.ignoreCase = ignoreCase;
      const node = this.groupBody(open);
      this.ignoreCase = saved;
      return node;
    }
    return this.fail("a grouping construct `(?` that .NET does not recognize", open);
  }

  private lookaround(open: number, behind: boolean, negative: boolean): Node {
    const body = this.groupBody(open);
    const single = oneCharacter(body);
    if (single === null) {
      const form = `(?${behind ? "<" : ""}${negative ? "!" : "="}...)`;
      this.refuse(`\`${form}\` wider than one character or one class cannot be translated exactly`);
      return EMPTY;
    }
    if (single === "empty") return negative ? { k: "assert", test: () => false } : EMPTY;
    const test: PositionTest = behind
      ? (s, at) => at > 0 && single(s.charCodeAt(at - 1))
      : (s, at) => at < s.length && single(s.charCodeAt(at));
    return { k: "assert", test: negative ? (s, at) => !test(s, at) : test };
  }

  /** A backslash outside a class. */
  private escape(): Node {
    const p = this.p;
    const at = this.i;
    if (at + 1 >= p.length) this.fail("the pattern ends with a lone `\\`");
    const ch = p[at + 1]!;
    switch (ch) {
      case "b":
        this.i += 2;
        return { k: "assert", test: (s, i) => wordBefore(s, i) !== wordAfter(s, i) };
      case "B":
        this.i += 2;
        return { k: "assert", test: (s, i) => wordBefore(s, i) === wordAfter(s, i) };
      case "A":
        this.i += 2;
        return { k: "assert", test: (_s, i) => i === 0 };
      case "z":
        this.i += 2;
        return { k: "assert", test: (s, i) => i === s.length };
      case "Z":
        this.i += 2;
        return { k: "assert", test: atEnd };
      case "G":
        this.i += 2;
        this.refuse("the anchor `\\G` cannot be run");
        return EMPTY;
      case "d":
      case "D":
      case "w":
      case "W":
      case "s":
      case "S":
        this.i += 2;
        return { k: "char", test: shorthand(ch) };
      case "p":
      case "P":
        return { k: "char", test: this.property() };
    }
    const reference = this.reference();
    if (reference) return reference;
    return { k: "char", test: literalTest(this.charEscape(false), this.ignoreCase) };
  }

  /**
   * A backreference: `\1`, `\k<name>`, `\<name>` or `\'name'`. Returns null when the text is not
   * one, leaving the position unchanged, so it reads as a character escape (as `\'*` does).
   */
  private reference(): Node | null {
    const p = this.p;
    const at = this.i;
    let j = at + 1;
    let close = "";
    if (p[j] === "k") {
      j++;
      if (p[j] !== "<" && p[j] !== "'") this.fail("an unrecognized escape `\\k`", at);
      close = p[j] === "<" ? ">" : "'";
      j++;
    } else if ((p[j] === "<" || p[j] === "'") && j + 1 < p.length) {
      close = p[j] === "<" ? ">" : "'";
      j++;
    }
    const isK = p[at + 1] === "k";
    if (close && isAsciiDigit(p[j])) {
      const start = j;
      while (isAsciiDigit(p[j])) j++;
      if (p[j] === close) {
        const n = Number(p.slice(start, j));
        if (!this.isSlot(n))
          this.fail(`a reference to group ${n}, which the pattern does not define`, at);
        this.refuse("a backreference (`\\1`, `\\k<name>`) cannot be run in linear time");
        this.i = j + 1;
        return EMPTY;
      }
    } else if (close && boundaryWordAt(p, j)) {
      const start = j;
      while (boundaryWordAt(p, j)) j++;
      if (p[j] === close) {
        if (!this.groups.names.has(p.slice(start, j))) {
          this.fail("a reference to a group name the pattern does not define", at);
        }
        this.refuse("a backreference (`\\1`, `\\k<name>`) cannot be run in linear time");
        this.i = j + 1;
        return EMPTY;
      }
    } else if (!close && p[j] !== "0" && isAsciiDigit(p[j])) {
      const start = j;
      let n = 0;
      while (isAsciiDigit(p[j])) {
        n = n * 10 + (p.charCodeAt(j++) - 48);
        if (n > INT_MAX) this.fail("a group number larger than .NET allows", at);
      }
      if (this.isSlot(n)) {
        this.refuse("a backreference (`\\1`, `\\k<name>`) cannot be run in linear time");
        this.i = j;
        return EMPTY;
      }
      if (j - start === 1)
        this.fail(`a reference to group ${n}, which the pattern does not define`, at);
      // A longer number that names no group reads as an octal escape, as .NET reads it.
    }
    if (isK) this.fail("an unrecognized escape `\\k`", at);
    return null;
  }

  private isSlot(n: number): boolean {
    return n === 0 || n <= this.groups.count || this.groups.numbers.has(n);
  }

  /** A character escape, inside a class or out; returns the character's code. */
  private charEscape(inClass: boolean): number {
    const p = this.p;
    const at = this.i;
    const ch = p[at + 1]!;
    this.i += 2;
    if (isOctal(ch)) {
      this.i = at + 1;
      let n = 0;
      for (let k = 0; k < 3 && isOctal(p[this.i]); k++) n = n * 8 + (p.charCodeAt(this.i++) - 48);
      return n & 0xff;
    }
    switch (ch) {
      case "a":
        return 7;
      case "b":
        if (inClass) return 8;
        break;
      case "e":
        return 27;
      case "f":
        return 12;
      case "n":
        return 10;
      case "r":
        return 13;
      case "t":
        return 9;
      case "v":
        return 11;
      case "x":
        return this.hex(2, at);
      case "u":
        return this.hex(4, at);
      case "c": {
        const c = p[this.i];
        if (c === undefined) this.fail("a missing control character after `\\c`", at);
        this.i++;
        let code = c.charCodeAt(0);
        if (code >= 97 && code <= 122) code -= 32;
        const control = code - 64;
        if (control < 0 || control >= 32)
          this.fail("an unrecognized control character after `\\c`", at);
        return control;
      }
    }
    if (isBoundaryWord(ch.charCodeAt(0))) this.fail(`an unrecognized escape \`\\${ch}\``, at);
    return ch.charCodeAt(0);
  }

  private hex(digits: number, at: number): number {
    let n = 0;
    for (let k = 0; k < digits; k++) {
      const d = hexValue(this.p[this.i]);
      if (d < 0) this.fail("too few hex digits in an escape", at);
      n = n * 16 + d;
      this.i++;
    }
    return n;
  }

  /** `\p{Name}` or `\P{Name}`, with the position at the backslash. */
  private property(): CharTest {
    const p = this.p;
    const at = this.i;
    const negative = p[at + 1] === "P";
    this.i += 2;
    if (p[this.i] !== "{") this.fail("`\\p` needs a category name in braces, as in `\\p{Lu}`", at);
    this.i++;
    const start = this.i;
    while (wordAt(p, this.i) || p[this.i] === "-") this.i++;
    const name = p.slice(start, this.i);
    if (p[this.i] !== "}") this.fail("`\\p` needs a category name in braces, as in `\\p{Lu}`", at);
    this.i++;
    const test = categoryTest(name);
    if (!test) {
      if (name.startsWith("Is")) this.refuse(`the Unicode block \`\\p{${name}}\` cannot be run`);
      else this.fail(`an unknown Unicode category \`\\p{${name}}\``, at);
      return () => false;
    }
    if (this.ignoreCase && CASED_CATEGORIES.has(name)) {
      this.refuse(`\`\\p{${name}}\` under \`(?i)\` cannot be translated exactly`);
    }
    return negative ? (c) => !test(c) : test;
  }

  /** `[...]`, with the position at the opening bracket; returns its test with case applied. */
  private charClass(): CharTest {
    const p = this.p;
    const open = this.i;
    this.i++;
    let negative = false;
    if (p[this.i] === "^") {
      negative = true;
      this.i++;
    }
    const ranges: number[] = [];
    const tests: CharTest[] = [];
    let first = true;
    let inRange = false;
    let rangeStart = 0;
    for (; ; first = false) {
      if (this.i >= p.length) this.fail("a `[` that is never closed", open);
      const ch = p[this.i]!;
      if (ch === "]" && !first) {
        this.i++;
        break;
      }
      let code: number;
      let escaped = false;
      if (ch === "\\" && this.i + 1 < p.length) {
        const e = p[this.i + 1]!;
        if ("dDwWsSpP".includes(e)) {
          if (inRange) this.fail("a class such as `\\d` cannot be the end of a range", this.i);
          if (e === "p" || e === "P") tests.push(this.property());
          else {
            tests.push(shorthand(e));
            this.i += 2;
          }
          continue;
        }
        code = this.charEscape(true);
        escaped = true;
      } else {
        code = ch.charCodeAt(0);
        this.i++;
        if (ch === "[" && !inRange && p[this.i] === ":") {
          // .NET skips a `[:name:]` inside a class and keeps only the `[`; too odd to copy.
          let j = this.i + 1;
          while (wordAt(p, j)) j++;
          if (p[j] === ":" && p[j + 1] === "]") {
            this.refuse("`[:name:]` inside a class cannot be translated exactly");
            this.i = j + 2;
          }
        }
      }
      if (inRange) {
        inRange = false;
        if (ch === "[" && !escaped) return this.subtraction(open);
        if (code < rangeStart) this.fail("a range in reverse order", this.i - 1);
        ranges.push(rangeStart, code);
      } else if (this.i + 1 < p.length && p[this.i] === "-" && p[this.i + 1] !== "]") {
        rangeStart = code;
        inRange = true;
        this.i++;
      } else if (!first && ch === "-" && !escaped && p[this.i] === "[") {
        return this.subtraction(open);
      } else {
        ranges.push(code, code);
      }
    }
    const base: CharTest = (c) => {
      for (let k = 0; k < ranges.length; k += 2)
        if (c >= ranges[k]! && c <= ranges[k + 1]!) return true;
      for (const t of tests) if (t(c)) return true;
      return false;
    };
    const cased: CharTest = this.ignoreCase ? (c) => caseVariants(c).some(base) : base;
    return negative ? (c) => !cased(c) : cased;
  }

  /** `[base-[excluded]]`: read through for its structure, then refused. */
  private subtraction(open: number): CharTest {
    const p = this.p;
    if (p[this.i] !== "[") this.i--; // back to the nested class's bracket
    this.charClass();
    if (p[this.i] !== "]") this.fail("a class subtraction that is not last in its class", open);
    this.i++;
    this.refuse("a class subtraction `[...-[...]]` cannot be translated exactly");
    return () => false;
  }
}

function concat(items: Node[]): Node {
  if (items.length === 0) return EMPTY;
  return items.length === 1 ? items[0]! : { k: "cat", items };
}

/** The body of a lookaround as one character test, "empty", or null when it is wider. */
function oneCharacter(node: Node): CharTest | "empty" | null {
  switch (node.k) {
    case "char":
      return node.test;
    case "empty":
      return "empty";
    case "cat":
      return node.items.length === 1 ? oneCharacter(node.items[0]!) : null;
    case "alt": {
      const tests: CharTest[] = [];
      for (const item of node.items) {
        const t = oneCharacter(item);
        if (t === null || t === "empty") return null;
        tests.push(t);
      }
      return (c) => tests.some((t) => t(c));
    }
    default:
      return null;
  }
}

function shorthand(letter: string): CharTest {
  switch (letter) {
    case "d":
      return isDigit;
    case "D":
      return (c) => !isDigit(c);
    case "w":
      return isWord;
    case "W":
      return (c) => !isWord(c);
    case "s":
      return isSpace;
    default:
      return (c) => !isSpace(c);
  }
}

/** `$` and `\Z`: the end, or just before a final newline. */
const atEnd: PositionTest = (s, i) =>
  i === s.length || (i === s.length - 1 && s.charCodeAt(i) === 10);
const wordBefore = (s: string, i: number): boolean => i > 0 && isBoundaryWord(s.charCodeAt(i - 1));
const wordAfter = (s: string, i: number): boolean =>
  i < s.length && isBoundaryWord(s.charCodeAt(i));

// ---------------------------------------------------------------------------------------------
// The program.

/** The instructions a tree compiles to, counted before any are built. */
function stateCount(node: Node): number {
  switch (node.k) {
    case "char":
    case "assert":
      return 1;
    case "empty":
      return 0;
    case "cat":
      return node.items.reduce((sum, item) => sum + stateCount(item), 0);
    case "alt":
      return node.items.reduce((sum, item) => sum + stateCount(item), node.items.length - 1);
    case "rep": {
      const s = stateCount(node.body);
      // Repeating an empty match is an empty match, however many times; see `emit`.
      if (s === 0) return 0;
      const optional = node.max === Infinity ? s + 1 : (node.max - node.min) * (s + 1);
      return node.min * s + optional;
    }
  }
}

/** Emits `node` with `next` as its continuation; returns its first instruction. */
function emit(node: Node, next: number, insts: Inst[]): number {
  const push = (inst: Inst): number => insts.push(inst) - 1;
  switch (node.k) {
    case "char":
      return push({ op: "char", test: node.test, next });
    case "assert":
      return push({ op: "assert", test: node.test, next });
    case "empty":
      return next;
    case "cat":
      for (let k = node.items.length - 1; k >= 0; k--) next = emit(node.items[k]!, next, insts);
      return next;
    case "alt": {
      const starts = node.items.map((item) => emit(item, next, insts));
      let pc = starts[starts.length - 1]!;
      for (let k = starts.length - 2; k >= 0; k--)
        pc = push({ op: "split", next: starts[k]!, alt: pc });
      return pc;
    }
    case "rep": {
      // A body of no instructions, such as `(?:)` or `(?=)`, matches empty; its repeat does too,
      // so it is emitted once rather than looped up to a count no limit has checked.
      if (stateCount(node.body) === 0) return emit(node.body, next, insts);
      let tail = next;
      if (node.max === Infinity) {
        const loop: Inst & { op: "split" } = { op: "split", next: -1, alt: next };
        tail = push(loop);
        loop.next = emit(node.body, tail, insts);
      } else {
        for (let k = node.min; k < node.max; k++) {
          tail = push({ op: "split", next: emit(node.body, tail, insts), alt: next });
        }
      }
      for (let k = 0; k < node.min; k++) tail = emit(node.body, tail, insts);
      return tail;
    }
  }
}

const fmt = (n: number): string => n.toLocaleString("en-US");

function compileUncached(pattern: string): CompileResult {
  if (pattern.length > LIMITS.patternChars) {
    return {
      unsupported: `a pattern longer than ${fmt(LIMITS.patternChars)} characters, the most pbiplint runs`,
    };
  }
  const parser = new Parser(pattern, scanGroups(pattern));
  let tree: Node;
  try {
    tree = parser.parse();
  } catch (e) {
    if (e instanceof Invalid) return { invalid: e.message };
    if (e instanceof Stop) return { unsupported: e.message };
    throw e;
  }
  if (parser.unsupported) return { unsupported: parser.unsupported };
  if (stateCount(tree) + 1 > LIMITS.patternStates) {
    return {
      unsupported: `a pattern that compiles to more than ${fmt(LIMITS.patternStates)} states, the most pbiplint runs; large repeat counts such as \`{1000}\` are the usual cause`,
    };
  }
  const insts: Inst[] = [{ op: "match" }];
  const start = emit(tree, 0, insts);
  return { regex: { insts, start } };
}

/** Rules build patterns from model names per object, so compiled patterns are kept by text. */
const CACHE = new Map<string, CompileResult>();
const CACHE_SIZE = 512;

/**
 * Compiles a .NET regular expression: `regex` to run, `unsupported` naming a construct pbiplint
 * does not run, or `invalid` when .NET itself would refuse the pattern.
 */
export function compilePattern(pattern: string): CompileResult {
  const cached = CACHE.get(pattern);
  if (cached) return cached;
  const result = compileUncached(pattern);
  if (CACHE.size >= CACHE_SIZE) CACHE.delete(CACHE.keys().next().value!);
  CACHE.set(pattern, result);
  return result;
}

/**
 * Whether the pattern matches anywhere in the input, as .NET's `Regex.IsMatch` answers. Every
 * state visited at each position spends one step of the budget; `LimitReached` is thrown when the
 * budget is spent.
 */
export function isMatch(regex: CompiledPattern, input: string, budget: Budget): boolean {
  const { insts, start } = regex;
  const seen = new Int32Array(insts.length).fill(-1);
  const stack: number[] = [];
  let current: number[] = [];
  let following: number[] = [];

  /** Adds `pc` and every state it reaches without reading, at `at`; true when one is the match. */
  const add = (pc: number, at: number, into: number[]): boolean => {
    stack.push(pc);
    while (stack.length > 0) {
      const p = stack.pop()!;
      if (seen[p] === at) continue;
      seen[p] = at;
      if (budget.left <= 0) throw new LimitReached();
      budget.left--;
      const inst = insts[p]!;
      switch (inst.op) {
        case "match":
          stack.length = 0;
          return true;
        case "char":
          into.push(p);
          break;
        case "split":
          stack.push(inst.alt, inst.next);
          break;
        case "assert":
          if (inst.test(input, at)) stack.push(inst.next);
          break;
      }
    }
    return false;
  };

  for (let at = 0; ; at++) {
    // A new attempt starts at every position: the search is unanchored.
    if (add(start, at, current)) return true;
    if (at === input.length) return false;
    const c = input.charCodeAt(at);
    for (const pc of current) {
      const inst = insts[pc] as Inst & { op: "char" };
      if (inst.test(c) && add(inst.next, at + 1, following)) return true;
    }
    [current, following] = [following, current];
    following.length = 0;
  }
}
