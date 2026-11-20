// What makes a team's copy of a published rule the same rule (custom rules spec, section 4): its
// expression, whitespace aside, and its scopes. scripts/fingerprint-upstream-rules.mjs computes the
// same two keys for every published version of Microsoft's and Tabular Editor's rule files, and its
// test holds the two implementations to each other.
import { isWhiteSpaceCode } from "./library.js";

const OFFSET = 0xcbf29ce484222325n;
const PRIME = 0x100000001b3n;
const MASK = 0xffffffffffffffffn;

/** The UTF-8 bytes of a string, written out so core needs no encoder from its host. */
function utf8(text: string): number[] {
  const bytes: number[] = [];
  for (const ch of text) {
    const c = ch.codePointAt(0)!;
    if (c < 0x80) bytes.push(c);
    else if (c < 0x800) bytes.push(0xc0 | (c >> 6), 0x80 | (c & 0x3f));
    else if (c < 0x10000) bytes.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 0x3f), 0x80 | (c & 0x3f));
    else
      bytes.push(
        0xf0 | (c >> 18),
        0x80 | ((c >> 12) & 0x3f),
        0x80 | ((c >> 6) & 0x3f),
        0x80 | (c & 0x3f),
      );
  }
  return bytes;
}

/**
 * An expression's fingerprint: every character Tabular Editor's `char.IsWhiteSpace` calls
 * whitespace dropped, the rest hashed as UTF-8 with 64-bit FNV-1a, as 16 lowercase hex digits. Two
 * expressions that differ only in line breaks, indentation, or spacing share it.
 */
export function fingerprint(expression: string): string {
  let kept = "";
  for (let i = 0; i < expression.length; i++)
    if (!isWhiteSpaceCode(expression.charCodeAt(i))) kept += expression[i];
  let h = OFFSET;
  for (const b of utf8(kept)) h = ((h ^ BigInt(b)) * PRIME) & MASK;
  return h.toString(16).padStart(16, "0");
}

/** A rule's scopes as the reader spells them, sorted and joined by commas. */
export const scopeKey = (scopes: readonly string[]): string => [...scopes].sort().join(",");
