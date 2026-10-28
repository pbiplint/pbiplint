/**
 * The index of the `"` that closes a text literal or `#"..."` name whose opening `"` is at `open`
 * (`""` is a quote inside one), or -1 when it runs to the end unclosed. A loop of `indexOf`, not a
 * regex: a literal of millions of characters overflowed the regex stack (the pre-release security
 * review, October 27, 2026).
 */
export function closingQuote(text: string, open: number): number {
  for (let i = open + 1; ; i += 2) {
    i = text.indexOf('"', i);
    if (i < 0 || text[i + 1] !== '"') return i;
  }
}

/**
 * The end of a TMDL `'...'` name opened at `open` (`''` is a quote inside one), which closes on its
 * line, or -1 when none does. As the regex `'(?:[^'\n]|'')*'` read it: a name left open after a
 * `''` closes at that pair's first quote.
 */
function tmdlNameEnd(text: string, open: number): number {
  let pair = -1;
  for (let i = open + 1; i < text.length; i++) {
    const c = text[i];
    if (c === "\n") break;
    if (c !== "'") continue;
    if (text[i + 1] !== "'") return i + 1;
    pair = i++;
  }
  return pair < 0 ? -1 : pair + 1;
}

/** A comment, or a run of anything but a quote, `#`, or `/`, or one other character. */
const OTHER = /\/\/[^\n]*|\/\*[\s\S]*?(?:\*\/|$)|[^"#/]+|[\s\S]/y;
/** The same, stopping at a TMDL name's `'` too. */
const TMDL_OTHER = /\/\/[^\n]*|\/\*[\s\S]*?(?:\*\/|$)|[^"#/']+|[\s\S]/y;

/**
 * Text with every text literal's text hidden, for a line PARSE_ISSUE quotes (v3 spec, section 7,
 * amended October 13, 2026): inside each `"..."` each line of text becomes `…`, and the quotes and
 * line breaks stay. A literal left open runs to the end. A `#"..."` name is kept. A comment is read
 * as one, so a quote in it never pairs with a literal's, and quoted text inside it is hidden too.
 * With `tmdl`, a `'...'` name is kept too, so a double quote inside it never pairs with a literal's;
 * in M an apostrophe delimits nothing.
 */
export function maskLiterals(text: string, { tmdl = false }: { tmdl?: boolean } = {}): string {
  const other = tmdl ? TMDL_OTHER : OTHER;
  let out = "";
  for (let i = 0; i < text.length;) {
    const name = text[i] === "#" && text[i + 1] === '"';
    if (name || text[i] === '"') {
      const open = name ? i + 1 : i;
      const close = closingQuote(text, open);
      const end = close < 0 ? text.length : close + 1;
      out += name
        ? text.slice(i, end)
        : `"${text.slice(open + 1, close < 0 ? end : close).replace(/[^\n]+/g, "…")}${close < 0 ? "" : '"'}`;
      i = end;
      continue;
    }
    const nameEnd = tmdl && text[i] === "'" ? tmdlNameEnd(text, i) : -1;
    if (nameEnd > 0) {
      out += text.slice(i, nameEnd);
      i = nameEnd;
      continue;
    }
    other.lastIndex = i;
    const token = other.exec(text)![0];
    out += token[0] === "/" ? token.replace(/"[^"\n]*"/g, '"…"') : token;
    i += token.length;
  }
  return out;
}
