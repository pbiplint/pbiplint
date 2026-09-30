import { fieldLabel } from "../../pbir/names.js";
import type { Report, ReportFilter } from "../../pbir/types.js";
import { reportFinding } from "../report-helpers.js";
import type { RuleFinding } from "../types.js";
import { pbiplintRule } from "./define.js";
import { inYearRange } from "./period-forms.js";
import { nameClass } from "./period-words.js";
import { englishList, namesYear } from "./periods.js";

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

/** What one condition keeps of a year column: the words for it, and where its year is written. */
interface Kept {
  /** The years it names, which a page or visual named for one of them makes deliberate. */
  years: number[];
  detail: string;
  /** The pointer of the literal a reader edits, where the finding points. */
  at: string;
  /** The pointer of the condition's column, which finds its reference among the filter's refs. */
  column: string;
}

/** The year a literal holds: a whole number (`2025L`) or text (`'2025'`) of four digits, from 1950 to 2049. */
function yearOf(e: unknown): number | undefined {
  const value = isRecord(e) && isRecord(e.Literal) ? e.Literal.Value : undefined;
  const m = typeof value === "string" ? /^(?:(\d{4})L|'(\d{4})')$/.exec(value) : null;
  const year = m ? Number(m[1] ?? m[2]) : undefined;
  return year !== undefined && inYearRange(year) ? year : undefined;
}

/** Whether an expression is a column, or a level of a hierarchy, whose name is a year's. */
function isYearColumn(e: unknown): boolean {
  if (!isRecord(e)) return false;
  const name = isRecord(e.Column)
    ? e.Column.Property
    : isRecord(e.HierarchyLevel)
      ? e.HierarchyLevel.Level
      : undefined;
  return typeof name === "string" && nameClass(name) === "year";
}

const fixed = (years: number[]): string =>
  `fixed year${years.length > 1 ? "s" : ""} ${englishList(years.map(String))}`;

/**
 * The years a condition keeps, when it keeps only years it names (spec section 4.1): `In` of a
 * year column, as Basic filtering and Include write it, or `Comparison` 0, Advanced filtering's
 * "is". A blank or any other value beside the years is passed over.
 */
function keptYears(condition: unknown, at: string): Kept | undefined {
  if (!isRecord(condition)) return undefined;
  const { In: inList, Comparison: compared } = condition;
  if (
    isRecord(inList) &&
    Array.isArray(inList.Expressions) &&
    inList.Expressions.length === 1 &&
    isYearColumn(inList.Expressions[0]) &&
    Array.isArray(inList.Values)
  ) {
    const found = inList.Values.flatMap((row, i) => {
      const year = Array.isArray(row) && row.length === 1 ? yearOf(row[0]) : undefined;
      return year === undefined ? [] : [{ year, at: `${at}/In/Values/${i}/0/Literal/Value` }];
    });
    if (found.length === 0) return undefined;
    const years = [...new Set(found.map((f) => f.year))];
    return { years, detail: fixed(years), at: found[0]!.at, column: `${at}/In/Expressions/0` };
  }
  if (isRecord(compared) && compared.ComparisonKind === 0 && isYearColumn(compared.Left)) {
    const year = yearOf(compared.Right);
    if (year === undefined) return undefined;
    return {
      years: [year],
      detail: fixed([year]),
      at: `${at}/Comparison/Right/Literal/Value`,
      column: `${at}/Comparison/Left`,
    };
  }
  return undefined;
}

/**
 * One finding for a filter that keeps fixed years, unless drilling set it or a name it sits under
 * carries one of its years. Desktop writes one condition per filter; the first that keeps years
 * is the one reported.
 */
function yearFinding(
  f: ReportFilter,
  names: (string | undefined)[],
  make: (pointer: string, detail: string) => RuleFinding,
): RuleFinding[] {
  // Drillthrough and drill-down save the last value passed or drilled into; the author set neither.
  if (f.howCreated === "Drillthrough" || f.howCreated === "Drill") return [];
  const kept = (f.where ?? [])
    .map((w, i) =>
      isRecord(w) ? keptYears(w.Condition, `${f.pointer}/filter/Where/${i}/Condition`) : undefined,
    )
    .find((k) => k !== undefined);
  if (!kept || kept.years.some((y) => names.some((n) => n !== undefined && namesYear(n, y))))
    return [];
  const ref = f.refs.find((r) => r.pointer === kept.column) ?? f.field;
  return [make(kept.at, ref ? `${kept.detail} on ${fieldLabel(ref)}` : kept.detail)];
}

function yearFindings(report: Report): RuleFinding[] {
  const out = report.filters.flatMap((f) =>
    yearFinding(f, [], (at, detail) => reportFinding.reportFilter(report, at, detail)),
  );
  for (const p of report.pages) {
    for (const f of p.filters)
      out.push(...yearFinding(f, [p.displayName], (at, d) => reportFinding.pageFilter(p, at, d)));
    for (const v of p.visuals)
      for (const f of v.filters)
        out.push(
          ...yearFinding(f, [p.displayName, v.title], (at, d) => reportFinding.visual(v, at, d)),
        );
  }
  return out;
}

export const HARDCODED_YEAR_IN_FILTER = pbiplintRule({
  id: "HARDCODED_YEAR_IN_FILTER",
  name: "Hardcoded year in a filter",
  category: "Report Design",
  severity: 1,
  scope: ["Visual", "Page", "Report"],
  layer: "report",
  // No skipWhenUnread: a report file that could not be read hides its filters from the rule,
  // never adds one.
  check: ({ report }) => (report ? yearFindings(report) : []),
});

export const filterRules = [HARDCODED_YEAR_IN_FILTER];
