/**
 * A text literal (`""` is a quote inside one, and one may run past a line, or to the end unclosed),
 * a `#"..."` name, a comment, or a run of anything else, as M's lexer reads them.
 */
const TOKEN = /(#?)"((?:[^"]|"")*)("?)|\/\/[^\n]*|\/\*[\s\S]*?(?:\*\/|$)|[^"#/]+|[\s\S]/g;

/** The same, with a TMDL `'...'` name (`''` is a quote inside one) read as a name, kept as written. */
const TMDL_TOKEN =
  /(#?)"((?:[^"]|"")*)("?)|'(?:[^'\n]|'')*'|\/\/[^\n]*|\/\*[\s\S]*?(?:\*\/|$)|[^"#/']+|[\s\S]/g;

/**
 * Text with every text literal's text hidden, for a line PARSE_ISSUE quotes (v3 spec, section 7,
 * amended October 13, 2026): inside each `"..."` each line of text becomes `…`, and the quotes and
 * line breaks stay. A literal left open runs to the end. A `#"..."` name is kept. A comment is read
 * as one, so a quote in it never pairs with a literal's, and quoted text inside it is hidden too.
 * With `tmdl`, a `'...'` name is kept too, so a double quote inside it never pairs with a literal's;
 * in M an apostrophe delimits nothing.
 */
export function maskLiterals(text: string, { tmdl = false }: { tmdl?: boolean } = {}): string {
  return text.replace(
    tmdl ? TMDL_TOKEN : TOKEN,
    (token, name: string, body?: string, close?: string) =>
      body !== undefined
        ? name
          ? token
          : `"${body.replace(/[^\n]+/g, "…")}${close}`
        : token[0] === "/"
          ? token.replace(/"[^"\n]*"/g, '"…"')
          : token,
  );
}
