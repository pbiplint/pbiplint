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

/** Where a `//` comment whose text starts at `from` ends: at a line break as M's lexer reads one. */
function lineCommentEnd(text: string, from: number): number {
  for (let i = from; i < text.length; i++) {
    const c = text.charCodeAt(i);
    if (c === 0x0a || c === 0x2028 || c === 0x2029) return i;
  }
  return text.length;
}

/** Whether only tabs come before `at` on its line, as TMDL's parser reads a `///` description. */
function atLineStart(text: string, at: number): boolean {
  for (let i = at - 1; i >= 0; i--) {
    const c = text[i];
    if (c === "\n") return true;
    if (c !== "\t") return false;
  }
  return true;
}

/**
 * Which code units of `text` PARSE_ISSUE hides (v3 spec, section 7, amended October 13 and 27,
 * 2026), 1 for each: a text literal's text between its quotes (a literal left open runs to the end;
 * a `#"..."` name is kept), and a comment's text after `//` or between `/*` and `*\/` (an open one
 * runs to the end). A line feed is never hidden, so each line of a literal or comment shows its own
 * `…`. In M a line comment ends where M's lexer ends it, at a line feed, U+2028, or U+2029; an
 * apostrophe delimits nothing, and `///` is a line comment. With `tmdl`, a `'...'` name is kept, so a
 * double quote inside it never pairs with a literal's; a DAX `--` comment is hidden as `//` is; a
 * line comment is hidden to the line feed, while the scan resumes after a U+2028 or U+2029 in it, so
 * whatever either reading hides is hidden; and a `///` description, with only tabs before it on its
 * line, keeps its words, with the text inside each `"..."` on it hidden. Scanned by hand, each code
 * unit a bounded number of times, so text of any length is read in linear time (the pre-release
 * security review, October 27, 2026).
 */
export function hiddenLiterals(
  text: string,
  { tmdl = false }: { tmdl?: boolean } = {},
): Uint8Array {
  const hidden = new Uint8Array(text.length);
  const hide = (from: number, to: number): void => {
    for (let k = from; k < to; k++) if (text.charCodeAt(k) !== 0x0a) hidden[k] = 1;
  };
  // In TMDL, the next line feed at or after the scan, and how far a line comment has been hidden,
  // so a line of many comments split by U+2028 is hidden once.
  let lineEnd = -1;
  let hiddenTo = 0;
  for (let i = 0; i < text.length;) {
    const c = text[i];
    const name = c === "#" && text[i + 1] === '"';
    if (name || c === '"') {
      const open = name ? i + 1 : i;
      const close = closingQuote(text, open);
      const end = close < 0 ? text.length : close + 1;
      if (!name) hide(open + 1, close < 0 ? end : close);
      i = end;
      continue;
    }
    if (c === "'" && tmdl) {
      const nameEnd = tmdlNameEnd(text, i);
      if (nameEnd > 0) {
        i = nameEnd;
        continue;
      }
    }
    const lineComment =
      (c === "/" && text[i + 1] === "/") || (tmdl && c === "-" && text[i + 1] === "-");
    if (lineComment && !tmdl) {
      const end = lineCommentEnd(text, i + 2);
      hide(i + 2, end);
      i = end;
      continue;
    }
    if (lineComment) {
      if (lineEnd < i) {
        lineEnd = text.indexOf("\n", i);
        if (lineEnd < 0) lineEnd = text.length;
      }
      if (c === "/" && text[i + 2] === "/" && atLineStart(text, i)) {
        // A description: the text inside each pair of double quotes on its line.
        for (let q = i + 3, open = -1; q < lineEnd; q++) {
          if (text[q] !== '"') continue;
          if (open < 0) open = q;
          else {
            hide(open + 1, q);
            open = -1;
          }
        }
        i = lineEnd;
        continue;
      }
      hide(Math.max(i + 2, hiddenTo), lineEnd);
      hiddenTo = Math.max(hiddenTo, lineEnd);
      i = lineCommentEnd(text, i + 2);
      if (i < lineEnd) i++;
      continue;
    }
    if (c === "/" && text[i + 1] === "*") {
      const close = text.indexOf("*/", i + 2);
      hide(i + 2, close < 0 ? text.length : close);
      i = close < 0 ? text.length : close + 2;
      continue;
    }
    i++;
  }
  return hidden;
}

/** `text` with each run of the code units `hidden` marks as one `…`. */
export function renderMasked(text: string, hidden: ArrayLike<number>): string {
  let out = "";
  let from = 0;
  for (let i = 0; i < text.length; i++) {
    if (!hidden[i]) continue;
    out += `${text.slice(from, i)}…`;
    while (i + 1 < text.length && hidden[i + 1]) i++;
    from = i + 1;
  }
  return out + text.slice(from);
}

/**
 * Text with every text literal's text and every comment's text hidden, for a line PARSE_ISSUE
 * quotes (v3 spec, section 7): each line of text inside a `"..."`, after `//` (or, with `tmdl`, a
 * DAX `--`), or between `/*` and `*\/` becomes `…`, and the quotes, comment marks, and line breaks
 * stay. A comment is hidden whole; with `tmdl`, a `///` description keeps its words and hides only
 * its quoted text. See `hiddenLiterals` for what is kept.
 */
export function maskLiterals(text: string, options: { tmdl?: boolean } = {}): string {
  return renderMasked(text, hiddenLiterals(text, options));
}
