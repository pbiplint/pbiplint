/** Strip single quotes from a TMDL object name; `''` inside is one quote. */
export function unquoteName(s: string): string {
  const t = s.trim();
  if (t.length >= 2 && t.startsWith("'") && t.endsWith("'"))
    return t.slice(1, -1).replace(/''/g, "'");
  return t;
}

/**
 * The index of the quote that closes the `'...'` name `s` opens (`''` is a quote inside one), or -1
 * when `s` opens none or leaves it open. A loop of `indexOf`, not a regex: one overflowed its stack
 * on a name of millions of characters (the pre-release security review, October 27, 2026).
 */
export function quoteEnd(s: string): number {
  if (s[0] !== "'") return -1;
  for (let i = 1; ; i += 2) {
    i = s.indexOf("'", i);
    if (i < 0 || s[i + 1] !== "'") return i;
  }
}

/** Strip double quotes from a TMDL property value; `""` inside is one quote. */
export function unquoteValue(s: string): string {
  const t = s.trim();
  if (t.length >= 2 && t.startsWith('"') && t.endsWith('"'))
    return t.slice(1, -1).replace(/""/g, '"');
  return t;
}
