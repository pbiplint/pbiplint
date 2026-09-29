import type { Relationship, Table } from "./types.js";

/**
 * A table Power BI Desktop manages for Auto date/time, by the names it gives them: a calculated
 * table named `LocalDateTable_<id>` (behind a date column's variation) or `DateTableTemplate_<id>`.
 * REMOVE_AUTO-DATE_TABLE reports them, as its source rule does.
 */
export const isAutoDateTable = (t: Table): boolean =>
  t.kind === "calculated" &&
  (t.name.startsWith("DateTableTemplate_") || t.name.startsWith("LocalDateTable_"));

/**
 * A composite model's copy of an auto date/time table in the model it extends through DirectQuery
 * (a Power BI semantic model or Analysis Services): a table named `LocalDateTable_<id>` whose
 * `entity` partition reads that model's table of the same name in DirectQuery mode. Desktop copies
 * no `DateTableTemplate_` table. The calculated table lives in the model it extends, where
 * REMOVE_AUTO-DATE_TABLE reports it.
 */
export const isAutoDateTableCopy = (t: Table): boolean =>
  t.name.startsWith("LocalDateTable_") &&
  t.partitions.some((p) => p.sourceType === "entity" && p.mode === "directquery");

/**
 * An auto date/time table Desktop keeps out of view: the model's own, which is hidden, or a
 * composite model's copy, saved with `showAsVariationsOnly` and so shown only through a date
 * column's variation. The Model fact and NOT_REACHED_FROM_REPORT leave them out.
 */
export const isHiddenAutoDateTable = (t: Table): boolean =>
  isAutoDateTable(t) || isAutoDateTableCopy(t);

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
