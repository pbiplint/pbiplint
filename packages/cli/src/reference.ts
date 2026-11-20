import { showControls } from "@pbiplint/core";
import { teReference, type TeReferenceMember } from "@pbiplint/core/custom-rules";

/**
 * What `pbiplint reference --format json` prints: the reference core builds at run time from the
 * evaluator's own tables, under `formats.tabularEditor`, so another rule format can be added beside
 * it without a new version.
 */
export function referenceJson(version: string): string {
  const doc = {
    version: 1,
    tool: { name: "pbiplint", version },
    formats: { tabularEditor: teReference() },
  };
  return JSON.stringify(doc, null, 2) + "\n";
}

/**
 * A regular expression's example, or the text it is tried on, in quotes, as written: a pattern's
 * backslashes stay single, and a control character such as a line feed shows as `\u000a`.
 */
const quoted = (s: string): string => `"${showControls(s)}"`;

const signature = (m: TeReferenceMember): string =>
  m.params === undefined
    ? `${m.name}: ${m.returns}`
    : `${m.name}(${m.params.map((p) => `${p.name}: ${p.type}`).join(", ")}): ${m.returns}`;

/** Names joined by `, `, in lines no longer than `width`, each indented by `indent`. */
function wrapped(names: readonly string[], indent: string, width = 100): string[] {
  const lines: string[] = [];
  let line = "";
  for (const name of names) {
    const next = line === "" ? name : `${line}, ${name}`;
    if (line !== "" && indent.length + next.length + 1 > width) {
      lines.push(`${indent}${line},`);
      line = name;
    } else line = next;
  }
  if (line !== "") lines.push(indent + line);
  return lines;
}

/**
 * What `pbiplint reference` prints: every entry of the reference, as plain text for an assistant
 * or a person writing a rule. The JSON holds the same entries; the test walks it to check.
 */
export function referenceText(version: string): string {
  const ref = teReference();
  const out: string[] = [];
  const section = (heading: string, lines: string[]) => out.push("", heading, ...lines);

  out.push(
    `pbiplint ${version}: what a custom rule can use`,
    "",
    "A custom rule is a Tabular Editor rule in a file a pbiplint.config.json names in customRules.",
    "Names match without regard to case: properties, methods, scopes, keywords, and enum values.",
    "Anything not listed here is not run: a rule that uses it is one RULE_COULD_NOT_FINISH finding with the reason.",
  );

  section(
    "Rule fields",
    ref.fields.map((f) => `  ${f.name} (${f.use}): ${f.note}`),
  );
  section(
    "Severities",
    ref.severities.map(
      (s) => `  ${s.written === null ? "none written" : s.written}: ${s.severity}`,
    ),
  );
  section(
    "Scopes, and the object types each runs on",
    ref.scopes.map((s) => `  ${s.name}: ${s.types.join(", ")}`),
  );
  section(
    "Properties by object type",
    // A blank line ends each type's block, so a reader can tell where one stops.
    ref.types.flatMap((t, i) => [
      ...(i > 0 ? [""] : []),
      `  ${t.name}`,
      `    In scopes: ${t.scopes.length > 0 ? t.scopes.join(", ") : "none; reached from another object"}`,
      ...t.properties.flatMap((p) => [
        `    ${p.name}: ${p.type}`,
        ...(p.members ?? []).map((m) => `      .${m.name}: ${m.type}`),
      ]),
    ]),
  );
  section(
    "Operators, loosest first",
    ref.syntax.operators.map(
      (o) => `  ${o.spellings.join(" ")} (${o.op}, precedence ${o.precedence}): ${o.meaning}`,
    ),
  );
  section(
    "Keywords",
    ref.syntax.keywords.map((k) => `  ${k.name}: ${k.meaning}`),
  );

  const ons = [...new Set([...ref.methods, ...ref.valueProperties].map((m) => m.on))];
  section(
    "Methods by value type",
    ons.flatMap((on) => [
      `  ${on}`,
      ...[...ref.valueProperties, ...ref.methods]
        .filter((m) => m.on === on)
        .map((m) => `    ${signature(m)}  ${m.description}`),
    ]),
  );
  section(
    "Static functions and values",
    [...ref.statics, ...ref.staticValues].map((m) => `  ${m.on}.${signature(m)}  ${m.description}`),
  );
  section(
    "Conversions",
    ref.conversions.map(
      (c) => `  ${c.type}: written ${c.spellings.map((s) => `${s}(...)`).join(" or ")}`,
    ),
  );
  section(
    "Enums",
    ref.enums.flatMap((e) => [
      `  ${e.name}: ${e.description}`,
      ...wrapped(e.values, "    "),
      ...(e.runs ? [`    Runs only: ${e.runs.join(", ")}`] : []),
    ]),
  );
  section("Tokenize()", [
    "  Each token Tokenize() gives has:",
    ...ref.tokens.members.map((m) => `    ${m.name}: ${m.type}  ${m.description}`),
    "  Token types:",
    ...wrapped(ref.tokens.types, "    "),
  ]);
  section("Regular expressions", [
    "  Run:",
    ...ref.regex.runs.map(
      (r) =>
        `    ${r.construct}: ${quoted(r.example)} matches ${quoted(r.matches)}, not ${quoted(r.doesNotMatch)}`,
    ),
    "  Refused, and why:",
    ...ref.regex.refused.map((r) => `    ${r.construct}: ${quoted(r.example)}: ${r.reason}`),
  ]);
  section(
    "Not run, and why",
    ref.notRun.map((n) => `  ${n.name} (${n.kind}): ${n.reason}`),
  );
  section(
    "Limits",
    ref.limits.map((l) => `  ${l.name}: ${l.value}  ${l.description}`),
  );
  return out.join("\n") + "\n";
}
