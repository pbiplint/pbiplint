/**
 * The English catalog: every message pbiplint writes, keyed by its message ID and sorted by ID,
 * so a catalog for another language is the same keys with other strings.
 *
 * A template is written in a subset of ICU MessageFormat: `{name}` for a parameter,
 * `{n, plural, one {# field} other {# fields}}` (with `=0`-style exact matches), and
 * `{k, select, a {...} other {...}}`, where `other` is required. There is no quoting: an
 * apostrophe is always itself, and there are no literal braces, so whoever adds a language never
 * writes ICU's doubled apostrophe.
 */
export const EN = {
  "context.table": "table {table}",
  "query.name": "query {query}",
  "query.partition": "query {query}, partition {partition}",
  "ruleError.theModel": "the model",
  "ruleError.theReport": "the report",
} as const;

export type MessageId = keyof typeof EN;
