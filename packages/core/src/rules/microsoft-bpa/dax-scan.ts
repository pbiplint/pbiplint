import { escapeRegExp } from "../helpers.js";

// Matchers written by hand for Microsoft BPA patterns that a regex search ran in quadratic time: it
// started again at every function name and read on to the same comma or bracket each time (the
// pre-release security review, October 27, 2026). Each matches the same text as the pattern it
// replaces, which is kept in a comment where it is used.

/** Tests a DAX expression, as a RegExp does. */
export interface Matcher {
  test(s: string): boolean;
}

/**
 * The pattern `<head>[^,]+,<rest>`, or `<head>[^,]*,<rest>` when `empty` is set, where `head` (a
 * global regex) ends at an opening parenthesis. `[^,]+,` can only stop at the first comma after the
 * parenthesis, so every head before that comma shares it, and `rest` is tried once per comma. With
 * `closed`, the pattern goes on with `[^\]]+\]` after `rest`: the next `]` is not the next character.
 */
export const opening = (head: RegExp, empty: boolean, rest: string, closed = false): Matcher => {
  const after = new RegExp(rest, "iy");
  return {
    test(s) {
      let comma = -1;
      let tried = -1;
      // `close` is the first `]` at or after `from`, or the length when there is none.
      let from = 0;
      let close = -1;
      for (const h of s.matchAll(head)) {
        const p = h.index + h[0].length;
        if (comma < p) comma = s.indexOf(",", p);
        if (comma < 0) return false;
        if (comma === tried || (!empty && comma === p)) continue;
        tried = comma;
        after.lastIndex = comma + 1;
        if (!after.test(s)) continue;
        if (!closed) return true;
        const e = after.lastIndex;
        if (e < from || e > close) {
          from = e;
          close = s.indexOf("]", e);
          if (close < 0) close = s.length;
        }
        if (close > e && close < s.length) return true;
      }
      return false;
    },
  };
};

const USERELATIONSHIP = /USERELATIONSHIP\s*\(/gi;
const MARKS = /[\]\n\r\u2028\u2029]/g;
const SPACE = /\s/;

/**
 * The pattern `USERELATIONSHIP\s*\(\s*.+?(?=\])\]\s*,\s*'*<name>'*\[` (case-insensitive). A `]`
 * closes the `.+?` of the last call that opens before it when that call is on the same line, or when
 * only white space follows the call up to the end of an earlier line and the `]` is not the first
 * character of its own line. The rest of the pattern is tried once per such `]`.
 */
export const useRelationshipWith = (name: string): Matcher => {
  const after = new RegExp(String.raw`\s*,\s*'*${escapeRegExp(name)}'*\[`, "iy");
  return {
    test(s) {
      const heads = Array.from(s.matchAll(USERELATIONSHIP), (h) => h.index + h[0].length);
      if (heads.length === 0) return false;
      let next = 0;
      let last = -1;
      // The position after the last line break, and where the white space that ends there starts.
      let lineStart = 0;
      let blankFrom = 0;
      for (const { 0: c, index: i } of s.matchAll(MARKS)) {
        if (c !== "]") {
          let j = i;
          while (j > lineStart && SPACE.test(s[j - 1]!)) j--;
          if (j > lineStart || lineStart === 0) blankFrom = j;
          lineStart = i + 1;
          continue;
        }
        while (next < heads.length && heads[next]! < i) last = heads[next++]!;
        if (last < 0 || (last < lineStart && (last < blankFrom || i === lineStart))) continue;
        after.lastIndex = i + 1;
        if (after.test(s)) return true;
      }
      return false;
    },
  };
};
