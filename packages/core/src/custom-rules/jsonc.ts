import { LIMITS } from "./limits.js";

/** True when `text` takes more than `limit` bytes as UTF-8; stops counting once it does. */
function overBytes(text: string, limit: number): boolean {
  // Every code unit is at least one byte, and at most three.
  if (text.length > limit) return true;
  if (text.length * 3 <= limit) return false;
  let bytes = 0;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    // A surrogate pair is four bytes, two for each half.
    bytes += c < 0x80 ? 1 : c < 0x800 || (c >= 0xd800 && c <= 0xdfff) ? 2 : 3;
    if (bytes > limit) return true;
  }
  return false;
}

/** Line and column (both from 1) of a character offset. */
function lineColumn(text: string, offset: number): string {
  let line = 1,
    start = 0;
  for (let i = 0; i < offset && i < text.length; i++) {
    if (text[i] === "\n") {
      line++;
      start = i + 1;
    }
  }
  return `line ${line}, column ${offset - start + 1}`;
}

/**
 * Reads JSON as Tabular Editor reads a rule file: a byte order mark first, and `//` and `/* *\/`
 * comments outside strings, are skipped. Comments become spaces of the same length, so offsets in
 * a JSON error still point into the file. Errors name the place, never the text there, since the
 * text may be a rule's expression.
 */
export function parseJsonc(text: string): { value: unknown } | { error: string } {
  if (overBytes(text, LIMITS.fileBytes)) {
    return {
      error: `The file is larger than ${LIMITS.fileBytes.toLocaleString("en-US")} bytes, the most pbiplint reads as a rule file.`,
    };
  }
  if (text.charCodeAt(0) === 0xfeff) text = " " + text.slice(1);
  let out = "";
  let from = 0;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"') {
      // Skip the string, escapes included; an unterminated one is left for JSON.parse to refuse.
      for (i++; i < text.length && text[i] !== '"'; i++) if (text[i] === "\\") i++;
    } else if (c === "/" && (text[i + 1] === "/" || text[i + 1] === "*")) {
      const line = text[i + 1] === "/";
      let end: number;
      if (line) {
        end = text.indexOf("\n", i);
        if (end < 0) end = text.length;
      } else {
        const close = text.indexOf("*/", i + 2);
        if (close < 0) {
          return {
            error: `The file has a /* comment that is never closed, at ${lineColumn(text, i)}.`,
          };
        }
        end = close + 2;
      }
      // Keep line breaks inside a block comment so line numbers stay right.
      out += text.slice(from, i) + text.slice(i, end).replace(/[^\n]/g, " ");
      from = end;
      i = end - 1;
    }
  }
  out += text.slice(from);
  try {
    return { value: JSON.parse(out) as unknown };
  } catch (e) {
    const at = /position (\d+)/.exec(e instanceof Error ? e.message : "");
    const where = at ? `, at ${lineColumn(out, Number(at[1]))}` : "";
    return { error: `The file is not valid JSON${where}.` };
  }
}
