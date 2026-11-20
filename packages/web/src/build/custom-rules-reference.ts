import type {
  TeReference,
  TeReferenceMember,
} from "../../../core/src/custom-rules/te/reference.js";
import { escapeHtml } from "./pages.js";

/**
 * The reference section of the custom rules page: everything a Tabular Editor rule can use in
 * pbiplint, and what it cannot, rendered from the data scripts/sync-custom-rules-reference.mjs
 * writes from core's teReference(). Nothing in it is written by hand, so the page says what the
 * evaluator runs; `pbiplint reference` prints the same entries as text at the version installed.
 *
 * Every value is text from the evaluator's tables. It is escaped, a span between backticks becomes
 * code, and a control character, as a regular expression's example can hold, is written as its
 * `\uXXXX` escape, as `pbiplint reference` writes one.
 */
export function referenceHtml(ref: TeReference): string {
  const parts: string[] = [];
  const section = (id: string, title: string, body: string): void => {
    parts.push(`<h3 id="reference-${id}">${title}</h3>\n${body}`);
  };

  section(
    "fields",
    "Rule fields",
    table(
      ["Field", "Use", "What pbiplint does with it"],
      ref.fields.map((f) => [code(f.name), f.use === "read" ? "Read" : "Ignored", prose(f.note)]),
    ),
  );
  section(
    "severities",
    "Severities",
    table(
      ["Severity written", "pbiplint reads it as"],
      ref.severities.map((s) => [
        s.written === null
          ? "None written"
          : typeof s.written === "number"
            ? code(String(s.written))
            : escapeHtml(capitalize(s.written)),
        escapeHtml(s.severity),
      ]),
    ),
  );
  section(
    "scopes",
    "Scopes",
    `<p>A rule's <code>Scope</code> names one or more of these, separated by commas; the rule runs on each object of each object type listed.</p>\n` +
      table(
        ["Scope", "Object types it runs on"],
        ref.scopes.map((s) => [code(s.name), s.types.map(code).join(", ")]),
      ),
  );
  section(
    "properties",
    "Properties by object type",
    `<p>A type marked <code>?</code> may be empty (null). A type with no scope is reached from another object, as a partition's <code>Table</code> is.</p>\n` +
      ref.types
        .map((t) => {
          const rows = t.properties.flatMap((p) => [
            [code(p.name), code(p.type)],
            ...(p.members ?? []).map((m) => [code(`${p.name}.${m.name}`), code(m.type)]),
          ]);
          const scopes =
            t.scopes.length > 0
              ? `In scopes: ${t.scopes.map(code).join(", ")}.`
              : "In no scope: reached from another object.";
          return `<details class="reference-type">\n<summary>${code(t.name)}</summary>\n<p>${scopes}</p>\n${table(["Property", "Type"], rows)}</details>`;
        })
        .join("\n"),
  );
  section(
    "operators",
    "Operators, loosest first",
    table(
      ["Written", "Precedence", "What it does"],
      ref.syntax.operators.map((o) => [
        o.spellings.map(code).join(" "),
        String(o.precedence),
        prose(o.meaning),
      ]),
    ),
  );
  section(
    "keywords",
    "Keywords",
    table(
      ["Keyword", "What it means"],
      ref.syntax.keywords.map((k) => [code(k.name), prose(k.meaning)]),
    ),
  );
  section(
    "literals",
    "Literals",
    table(
      ["Written", "Type", "What it means"],
      ref.syntax.literals.map((l) => [code(l.written), code(l.type), prose(l.meaning)]),
    ),
  );
  section("empty-values", "Empty values", `<p>${prose(ref.syntax.emptyValues)}</p>`);

  const ons = [...new Set([...ref.valueProperties, ...ref.methods].map((m) => m.on))];
  section(
    "methods",
    "Methods by value type",
    ons
      .map((on) => {
        const rows = [...ref.valueProperties, ...ref.methods]
          .filter((m) => m.on === on)
          .map((m) => [code(signature(m)), prose(m.description)]);
        return `<details class="reference-type">\n<summary>${code(on)}</summary>\n${table(["Method or property", "What it gives"], rows)}</details>`;
      })
      .join("\n"),
  );
  section(
    "statics",
    "Static functions and values",
    table(
      ["Function or value", "What it gives"],
      [...ref.statics, ...ref.staticValues].map((m) => [
        code(`${m.on}.${signature(m)}`),
        prose(m.description),
      ]),
    ),
  );
  section(
    "conversions",
    "Conversions",
    table(
      ["Type", "Written"],
      ref.conversions.map((c) => [
        code(c.type),
        c.spellings.map((s) => code(`${s}(...)`)).join(" or "),
      ]),
    ),
  );
  section(
    "enums",
    "Enums",
    table(
      ["Enum", "Values", "What it is"],
      ref.enums.map((e) => [
        code(e.name),
        e.values.map(code).join(", "),
        prose(e.description) +
          (e.runs ? ` pbiplint runs only ${e.runs.map(code).join(" and ")}.` : ""),
      ]),
    ),
  );
  section(
    "tokenize",
    "Tokenize()",
    `<p>Each token <code>Tokenize()</code> gives has these members.</p>\n` +
      table(
        ["Member", "Type", "What it is"],
        ref.tokens.members.map((m) => [code(m.name), code(m.type), prose(m.description)]),
      ) +
      `<p>The token types, by name:</p>\n<p class="reference-names">${ref.tokens.types.map(code).join(", ")}</p>`,
  );
  section(
    "regex",
    "Regular expressions",
    `<p>These constructs run, each with an example pattern, a text it matches, and one it does not.</p>\n` +
      table(
        ["Construct", "Pattern", "Matches", "Does not match"],
        ref.regex.runs.map((r) => [
          prose(r.construct),
          quoted(r.example),
          quoted(r.matches),
          quoted(r.doesNotMatch),
        ]),
      ) +
      `<p>These are refused, and a rule that uses one stops with the reason.</p>\n` +
      table(
        ["Construct", "Pattern", "Reason"],
        ref.regex.refused.map((r) => [prose(r.construct), quoted(r.example), prose(r.reason)]),
      ),
  );
  section(
    "not-run",
    "Not run, and why",
    `<p>A rule that uses one of these is one <code>RULE_COULD_NOT_FINISH</code> finding, with this reason.</p>\n` +
      table(
        ["What the rule uses", "Kind", "Reason"],
        ref.notRun.map((n) => [code(n.name), escapeHtml(n.kind), prose(n.reason)]),
      ),
  );
  section(
    "limits",
    "Limits",
    table(
      ["Limit", "Value", "What it holds"],
      ref.limits.map((l) => [code(l.name), l.value.toLocaleString("en"), prose(l.description)]),
    ),
  );
  return parts.join("\n");
}

const capitalize = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);

/** A control character as its `\uXXXX` escape, so a line feed in an example shows as `\u000a`. */
const shown = (s: string): string =>
  // eslint-disable-next-line no-control-regex -- writing control characters visibly is the point
  s.replace(/[\u0000-\u001f\u007f]/g, (c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, "0")}`);

const code = (s: string): string => `<code>${escapeHtml(shown(s))}</code>`;

/** A regular expression's example or the text it is tried on, in quotes, as written. */
const quoted = (s: string): string => code(`"${s}"`);

/** Text from the tables: escaped, with each span between backticks as code. */
const prose = (s: string): string => escapeHtml(shown(s)).replace(/`([^`]+)`/g, "<code>$1</code>");

const signature = (m: TeReferenceMember): string =>
  m.params === undefined
    ? `${m.name}: ${m.returns}`
    : `${m.name}(${m.params.map((p) => `${p.name}: ${p.type}`).join(", ")}): ${m.returns}`;

/** A table with a header row; each cell is HTML already. */
function table(head: string[], rows: string[][]): string {
  const th = head.map((h) => `<th scope="col">${h}</th>`).join("");
  const body = rows.map((r) => `<tr>${r.map((c) => `<td>${c}</td>`).join("")}</tr>`).join("\n");
  return `<table class="reference-table">\n<thead><tr>${th}</tr></thead>\n<tbody>\n${body}\n</tbody>\n</table>\n`;
}
