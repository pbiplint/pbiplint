// The characters a terminal acts on instead of printing: C0 (tab and newline included), DEL, C1,
// and the Unicode bidirectional embeddings, overrides (U+202A to U+202E), and isolates (U+2066 to
// U+2069).
// eslint-disable-next-line no-control-regex -- matching control characters is the whole point
const CONTROL = /[\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/g;
// The same less C0, which JSON.stringify already writes as escapes inside a string, and which is
// the document's own line breaks and indentation outside one.
const CONTROL_JSON_KEEPS = /[\u007f-\u009f\u202a-\u202e\u2066-\u2069]/g;

const escaped = (c: string): string => `\\u${c.charCodeAt(0).toString(16).padStart(4, "0")}`;

/**
 * `text` with each control character shown as a backslash, `u`, and four lowercase hex digits
 * (ESC as `\u001b`, a newline as `\u000a`, RIGHT-TO-LEFT OVERRIDE as `\u202e`), and every other
 * character as it is. Names, paths, and messages in a result come from the repository being
 * linted, and a hostile one could name a measure with the escape sequence that clears the screen,
 * or a right-to-left override that reorders a line, and so hide or rewrite what a terminal shows,
 * or make a run look clean. The text format, and every line the CLI writes to stderr, show each
 * string from the input through this.
 */
export const showControls = (text: string): string => text.replace(CONTROL, escaped);

/**
 * A JSON document with DEL, C1, and the bidirectional controls written as `\u` escapes, which
 * JSON.stringify leaves raw. None of them is JSON syntax, so each stands inside a string, and the
 * document parses to exactly the same value.
 */
export const escapeJsonControls = (json: string): string =>
  json.replace(CONTROL_JSON_KEEPS, escaped);
