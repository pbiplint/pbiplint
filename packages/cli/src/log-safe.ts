/**
 * Text the CLI writes to stdout or stderr, with CI log command sequences escaped: the second `#` of
 * `##` before a word and `[` (as in `##[name]` and `##name[`), anywhere in a line, and the first
 * `:` of a line that starts with `::` after its whitespace (U+0085 counted, as .NET counts it),
 * each written as the `\u` escape showControls writes a control character as. In a JSON document
 * `#` and `:` stand only inside a string, where either escape reads back as the character it
 * replaced (the `:` one follows a line break or whitespace, never a backslash), so the JSON and
 * SARIF formats parse to the same value. Files written with --output are not passed through here
 * and hold the text as written.
 */
export const logSafe = (text: string): string =>
  text
    .replace(/(?<=#)#(?=\w*\[)/g, "\\u0023")
    .replace(/^((?:[^\S\n]|\u0085)*):(?=:)/gm, "$1\\u003a");
