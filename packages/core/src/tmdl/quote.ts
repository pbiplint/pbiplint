/** Strip single quotes from a TMDL object name; `''` inside is one quote. */
export function unquoteName(s: string): string {
  const t = s.trim();
  if (t.length >= 2 && t.startsWith("'") && t.endsWith("'"))
    return t.slice(1, -1).replace(/''/g, "'");
  return t;
}

/** Strip double quotes from a TMDL property value; `""` inside is one quote. */
export function unquoteValue(s: string): string {
  const t = s.trim();
  if (t.length >= 2 && t.startsWith('"') && t.endsWith('"'))
    return t.slice(1, -1).replace(/""/g, '"');
  return t;
}
