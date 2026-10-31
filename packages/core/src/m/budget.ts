import { closingQuote } from "./mask.js";

/** A query's work as `mWork` counts it, and its deepest bracket nesting. */
export interface MWork {
  units: number;
  depth: number;
}

/** The most work readM gives one query and one model's M, and the deepest nesting it reads. */
export interface MBudget {
  query: number;
  model: number;
  depth: number;
}

/**
 * The budget (v3 spec, section 7, amended October 27, 2026). On the corpus of 1,321 models the
 * largest query is 847,457 units, the largest model's M 1,158,354, the deepest nesting 15. Just
 * under 2,000,000 units, the slowest shapes still take a few seconds.
 */
export const M_BUDGET: MBudget = { query: 2_000_000, model: 4_000_000, depth: 128 };

/**
 * M split as the budget counts it, after text literals and quoted names, which `closingQuote` reads:
 * a comment (group 1), a word (2), a line break as M's lexer breaks lines (3), spaces (4), or one
 * other character. A line comment ends at \n, U+2028, or U+2029, as M's lexer ends it.
 */
const SCAN =
  /(\/\/[^\n\u2028\u2029]*|\/\*[\s\S]*?(?:\*\/|$))|([\w.@]+)|([\n\u2028\u2029])|([^\S\n\u2028\u2029]+)|[\s\S]/y;
const BREAKS = /[\n\u2028\u2029]/g;
/** The words M reads as operators. */
const WORD_OPERATORS = new Set(["and", "or", "not", "as", "is", "meta"]);

/**
 * A query's work, counted from its text in one linear pass before Microsoft's parser runs (v3
 * spec, section 7, amended October 27, 2026). The parser is quadratic in an operator chain, a
 * list's items, and a line's tokens (an 80,000-term chain took 37.6 s), so each is charged by its
 * square; the rest is 2 units a token, 1 a line, and 1 per 8 characters.
 */
export function mWork(text: string): MWork {
  let tokens = 0,
    lines = 1,
    onLine = 0,
    lineSq = 0,
    chainSq = 0,
    commaSq = 0,
    depth = 0;
  // One entry per open bracket, the outermost for the text itself.
  const open = [{ commas: 0, chain: 0 }];
  const endChain = (g: { chain: number }) => {
    chainSq += g.chain * g.chain;
    g.chain = 0;
  };
  const endLine = () => {
    lineSq += onLine * onLine;
    onLine = 0;
    lines++;
  };
  for (let i = 0; i < text.length;) {
    // A text literal or a quoted name (`""` inside, open to the end), scanned by hand: a regex
    // overflowed its stack on one of millions of characters.
    const name = text[i] === "#" && text[i + 1] === '"';
    const literal = name || text[i] === '"';
    let t: string, comment: string | undefined, word: string | undefined;
    let lineBreak: string | undefined, spaces: string | undefined;
    if (literal) {
      const close = closingQuote(text, name ? i + 1 : i);
      t = text.slice(i, close < 0 ? text.length : close + 1);
    } else {
      SCAN.lastIndex = i;
      [t, comment, word, lineBreak, spaces] = SCAN.exec(text)!;
    }
    i += t.length;
    if (spaces !== undefined) continue;
    if (lineBreak !== undefined) {
      endLine();
      continue;
    }
    if (comment === undefined) {
      tokens++;
      onLine++;
    }
    if (word !== undefined) {
      if (WORD_OPERATORS.has(word)) open.at(-1)!.chain++;
      continue;
    }
    // A comment, a literal, or a quoted name: only the lines it spans count.
    if (comment !== undefined || literal) {
      for (const _ of t.matchAll(BREAKS)) endLine();
      continue;
    }
    const g = open.at(-1)!;
    if ("([{".includes(t)) {
      open.push({ commas: 0, chain: 0 });
      depth = Math.max(depth, open.length - 1);
    } else if (")]}".includes(t)) {
      const c = open.length > 1 ? open.pop()! : g;
      endChain(c);
      commaSq += c.commas * c.commas;
      c.commas = 0;
    } else if (t === ",") {
      endChain(g);
      g.commas++;
    } else if ("+-*/&=<>?".includes(t)) g.chain++;
  }
  lineSq += onLine * onLine;
  for (const g of open) {
    endChain(g);
    commaSq += g.commas * g.commas;
  }
  return {
    depth,
    units:
      2 * tokens +
      lines +
      Math.floor(text.length / 8) +
      Math.floor(chainSq / 256) +
      Math.floor(commaSq / 1024) +
      Math.floor(lineSq / 16384),
  };
}
