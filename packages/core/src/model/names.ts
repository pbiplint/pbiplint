import type { Relationship, Table } from "./types.js";

/**
 * A table Power BI Desktop manages for Auto date/time, by the names it gives them: a calculated
 * table named `LocalDateTable_<id>` (behind a date column's variation) or `DateTableTemplate_<id>`.
 * REMOVE_AUTO-DATE_TABLE reports them, and NOT_REACHED_FROM_REPORT leaves them out.
 */
export const isAutoDateTable = (t: Table): boolean =>
  t.kind === "calculated" &&
  (t.name.startsWith("DateTableTemplate_") || t.name.startsWith("LocalDateTable_"));

/** `'Name'` with embedded single quotes doubled, as DAX and Tabular Editor write table names. */
export const tableRef = (name: string): string => `'${name.replace(/'/g, "''")}'`;

const bracket = (name: string): string => `[${name.replace(/\]/g, "]]")}]`;

export const columnRef = (table: string, column: string): string =>
  `${tableRef(table)}${bracket(column)}`;

export const measureRef = (name: string): string => bracket(name);

const cardinalitySymbol = (c: string): string => (c === "many" ? "∞" : c === "one" ? "1" : "?");

/** Tabular Editor's relationship display name, e.g. `'Sales'[Sale Date] ∞←1 'Date'[Date]`. */
export function relationshipName(r: Relationship): string {
  const arrow = r.crossFilteringBehavior === "bothdirections" ? "↔" : "←";
  return `${columnRef(r.fromTable, r.fromColumn)} ${cardinalitySymbol(r.fromCardinality)}${arrow}${cardinalitySymbol(r.toCardinality)} ${columnRef(r.toTable, r.toColumn)}`;
}

/** Rule id to page slug: lowercase, runs of non-alphanumerics become one dash, no leading or trailing dash. */
export function slug(id: string): string {
  return id
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export const RULE_URL_BASE = "https://pbiplint.com/rules/";

export const ruleUrl = (id: string): string => RULE_URL_BASE + slug(id);
