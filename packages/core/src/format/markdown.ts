import type { LintResult } from "../engine/lint.js";
import { ruleUrl } from "../model/names.js";
import { SEVERITY_LABEL } from "../rules/types.js";
import { showControls } from "./controls.js";
import {
  layersLine,
  locationOf,
  skippedLine,
  summaryLine,
  topGroups,
  type FormatOptions,
} from "./text.js";

// Names, paths, details, and messages come from the repository being linted, and the export
// reaches a Markdown viewer (the CLI's --format markdown, the site's Download Markdown) as well as
// a terminal. A hostile repository could otherwise put HTML on a page that renders it, end the code
// span a name sits in and write the rest as Markdown, split a table row, or send a terminal escape
// sequence. Each string from the input is written through one of the helpers below.

/**
 * Each line ending as a space: a table row is one line, and CommonMark ends a line at a CR, an LF,
 * or the two together.
 */
const oneLine = (s: string): string => s.replace(/\r\n?|\n/g, " ");

/**
 * A word of input text outside a code span. Each backslash is doubled, so none escapes what follows
 * it; each control character is shown as the text format shows it; `&`, `<`, and `>` are written
 * as HTML entities, so no tag or entity is read as HTML; and `` ` ``, `[`, `]`, `*`, `_`, `~`, and
 * `|` are escaped with a backslash (CommonMark lets any ASCII punctuation be escaped, and shows the
 * character), so none of them opens a code span (inside which the entities would show as written),
 * a link, an image, emphasis, or strikethrough, and a table cell holds its text whole.
 * GitHub-flavoured Markdown also links a bare URL and a `www.` address as the source spells them,
 * so a backslash inside one would land in the link; the colon of `://` and the dot after `www` (in
 * any case) are escaped, so neither is a link and each shows as written.
 */
const escaped = (s: string): string =>
  showControls(s.replace(/\\/g, "\\\\"))
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/[`[\]*_~|]/g, "\\$&")
    .replace(/:(?=\/\/)/g, "\\:")
    .replace(/(www)\./gi, "$1\\.");

/**
 * Text from the input, outside a code span, word by word (a word ends at a space; a tab or line
 * break is a control character, shown, so it never ends one). GitHub ignores a backslash before
 * `@` and `$`: it links an email address (the link's text and target are the address as written),
 * links an @name, which notifies that user, or a #123 or GH-123 in an issue or comment, and
 * renders the text between two `$` on one line as math (#109). So a word holding `@`, `#` before a
 * digit, `GH-` before a digit, or `$` when the text holds two or more, is written as a code span,
 * which GitHub neither links nor renders and a CommonMark viewer shows as written; every other word
 * is escaped. In a table cell (`table`), the code span's `|` is escaped as a name's is.
 */
function text(s: string, table: boolean): string {
  const math = (s.match(/\$/g) ?? []).length > 1;
  return s
    .split(/( +)/)
    .map((w, i) =>
      i % 2 === 0 && (/@|#\d|\bGH-\d/i.test(w) || (math && w.includes("$")))
        ? spanned(w, table)
        : escaped(w),
    )
    .join("");
}

/** A pair of characters that can enclose a word in prose. */
const ENCLOSING = [
  ["(", ")"],
  ['"', '"'],
  ["'", "'"],
] as const;

/** How many times `ch` occurs in `s`. */
const count = (s: string, ch: string): number => s.split(ch).length - 1;

/**
 * A word as a code span, the punctuation prose puts around it left outside, as written: a run of
 * `.`, `,`, `;`, `:`, `!`, or `?` at its end; then a `(` at its start or a `)` at its end that has
 * no partner in the word, as a parenthesis around several words leaves; else one enclosing pair.
 * So `(#123),` is written (`#123`), `a@b.com)` keeps its `)` outside, and `"$#,0.00"` its quotes,
 * while `($#,0.00)` inside a format string stays whole. None of these characters is one GitHub
 * links or renders.
 */
function spanned(w: string, table: boolean): string {
  let after = /[.,;:!?]+$/.exec(w)?.[0] ?? "";
  let core = w.slice(0, w.length - after.length);
  let before = "";
  if (core.endsWith(")") && count(core, ")") > count(core, "(")) {
    after = `)${after}`;
    core = core.slice(0, -1);
  }
  if (core.startsWith("(") && count(core, "(") > count(core, ")")) {
    before = "(";
    core = core.slice(1);
  }
  const pair = ENCLOSING.find(
    ([o, c]) => core.length > 2 && core.startsWith(o) && core.endsWith(c),
  );
  if (before === "" && pair) {
    before = pair[0];
    after = pair[1] + after;
    core = core.slice(1, -1);
  }
  return `${escaped(before)}${code(core, table)}${escaped(after)}`;
}

/** Input text in a table cell, a line break shown as a space. */
const cell = (s: string): string => text(oneLine(s), true);

/**
 * A name from the input as a code span in a table cell, showing the whole name, or a word of text
 * as one anywhere. A code span shows its `<` and `&` as written, so nothing is entity-escaped
 * here. Its fence is one backtick longer than the longest run of backticks in the name. CommonMark
 * strips one space from each end of a span that begins and ends with a space and is not all
 * spaces, so a space goes inside each end when the name starts or ends with a backtick (which
 * would otherwise join the fence) or starts and ends with a space of its own. In a table cell
 * (`table`), a line break is shown as a space, as the cell shows it, and a `|` is escaped, since
 * GitHub-flavoured Markdown splits a row into cells before it reads code spans and shows `\|` as
 * `|`; outside a table, a line break is shown as the text format shows it and a `|` needs nothing. A renderer that counts the backslashes
 * before a pipe (marked, which the site's build uses) reads the pipe after an even run as the
 * cell's end, and the rest of the name as Markdown outside the span, so an odd run of backslashes
 * before a pipe in the name gains one, and shows one longer.
 */
function code(name: string, table: boolean): string {
  const shown = table
    ? showControls(oneLine(name)).replace(
        /(\\*)\|/g,
        (_, run: string) => `${run}${run.length % 2 ? "\\" : ""}\\|`,
      )
    : showControls(name);
  const fence = "`".repeat(Math.max(0, ...(shown.match(/`+/g) ?? []).map((r) => r.length)) + 1);
  const spaced = shown.startsWith(" ") && shown.endsWith(" ") && /[^ ]/.test(shown);
  const pad = shown.startsWith("`") || shown.endsWith("`") || spaced ? " " : "";
  return `${fence}${pad}${shown}${pad}${fence}`;
}

export function formatMarkdown(result: LintResult, _options: FormatOptions = {}): string {
  const out: string[] = [
    "# pbiplint report",
    "",
    `${summaryLine(result)}. ${text([layersLine(result), skippedLine(result)].filter(Boolean).join(" "), false)}.`,
    "",
  ];
  for (const d of result.diagnostics) out.push(`> Notice: ${text(d.message, false)}`, "");
  if (result.facts.length) {
    out.push("## Report at a glance", "", "| Fact | Value | Rule |", "|---|---|---|");
    for (const f of result.facts)
      out.push(
        `| ${cell(f.label)} | ${cell(f.detail ? `${f.value} (${f.detail})` : f.value)} | ${f.ruleId ? `[${f.ruleId}](${ruleUrl(f.ruleId)})` : ""} |`,
      );
    out.push("");
  }
  if (result.groups.length === 0) {
    out.push("No findings.", "");
    return out.join("\n");
  }
  out.push("## Fix these first", "");
  topGroups(result).forEach((g, i) =>
    out.push(
      `${i + 1}. **${g.rule.name}** (${g.findings.length}) [${g.rule.id}](${g.rule.url}) · ${g.rule.layer}`,
    ),
  );
  out.push("");
  for (const g of result.groups) {
    out.push(
      `## ${SEVERITY_LABEL[g.rule.severity].toUpperCase()}: ${g.rule.name} (${g.findings.length}) · ${g.rule.layer}`,
      "",
    );
    out.push(`[${g.rule.id}](${g.rule.url}) · ${g.rule.category}`, "");
    out.push("| Object | Type | Location | Detail |", "|---|---|---|---|");
    for (const f of g.findings)
      out.push(
        `| ${code(f.objectName, true)} | ${f.objectType} | ${cell(locationOf(f))} | ${cell(f.detail ?? "")} |`,
      );
    out.push("");
  }
  return out.join("\n");
}
