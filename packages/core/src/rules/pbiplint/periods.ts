import { isAutoDateTable } from "../../model/names.js";
import type { Model, SourceLocation, Table } from "../../model/types.js";
import type { TmdlNode } from "../../tmdl/types.js";
import { finding } from "../helpers.js";
import type { RuleFinding } from "../types.js";
import { pbiplintRule } from "./define.js";
import { calendarEnds, expressionPeriods, type Period } from "./period-forms.js";

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

/** A period found in an object's DAX, with the node whose value holds that DAX. */
interface Found {
  period: Period;
  node: TmdlNode | undefined;
}

/** How a detail names a period: a year as `2025`, a day in long form, an ambiguous string as written. */
const shown = (p: Period): string =>
  p.ambiguous !== undefined
    ? `"${p.ambiguous}"`
    : p.date
      ? `${MONTHS[p.date.month - 1]} ${p.date.day}, ${p.date.year}`
      : String(p.year);

/**
 * A list as English writes one: `a and b`, or `a, b, and c`, with semicolons in place of commas
 * when an item holds a comma, as a long-form date does. At most three are named; the rest are
 * counted, as `and 3 more`.
 */
export function englishList(items: readonly string[]): string {
  const named = items.length > 3 ? [...items.slice(0, 3), `${items.length - 3} more`] : [...items];
  if (named.length <= 2) return named.join(" and ");
  const sep = named.some((s) => s.includes(",")) ? "; " : ", ";
  return `${named.slice(0, -1).join(sep)}${sep}and ${named.at(-1)}`;
}

/**
 * Whether a name carries a year (spec section 4.5): its four digits anywhere (`Values2025`), or
 * its last two with no digit on either side (`Jan-24`, `19/20`). An object so named is almost
 * always meant to fix that year; all 87 in the research were.
 */
export function namesYear(name: string, year: number): boolean {
  const digits = String(year);
  if (digits.length !== 4) return false;
  return name.includes(digits) || new RegExp(`(?:^|\\D)${digits.slice(2)}(?:\\D|$)`).test(name);
}

/** The file and line of `offset` into a node's value: its first line, plus the line breaks before the offset. */
function lineAt(node: TmdlNode | undefined, offset: number): SourceLocation | undefined {
  if (node?.valueLine === undefined || node.value === undefined) return undefined;
  let line = node.valueLine;
  for (let k = 0; k < offset && k < node.value.length; k++) if (node.value[k] === "\n") line++;
  return { file: node.file, line };
}

/** A measure's, a column's, or a calculation item's detail: what it fixes, years, days, or both. */
function fixesDetail(periods: readonly Period[]): string {
  const names = [...new Set(periods.map(shown))];
  const days = periods.filter((p) => p.date !== undefined || p.ambiguous !== undefined).length;
  const noun = days === 0 ? "year" : days === periods.length ? "date" : "period";
  return `fixed ${noun}${names.length > 1 ? "s" : ""} ${englishList(names)}`;
}

/** A date table's detail: the day, or days, its CALENDAR calls end on. */
function endsDetail(periods: readonly Period[]): string {
  const names = [...new Set(periods.map(shown))];
  return names.length === 1
    ? `ends on a fixed date, ${names[0]}`
    : `ends on fixed dates ${englishList(names)}`;
}

/**
 * One finding for an object whose DAX fixes the periods found, at the line of the first, unless
 * its name carries one of their years. A finding that already names its context, as a
 * calculation item's names its group, keeps it after the rule's own words.
 */
function fixedFinding(
  base: RuleFinding,
  name: string,
  found: readonly Found[],
  detail: (periods: readonly Period[]) => string,
): RuleFinding[] {
  const periods = found.map((f) => f.period);
  if (periods.length === 0 || periods.some((p) => namesYear(name, p.year))) return [];
  const where = lineAt(found[0]!.node, found[0]!.period.at);
  const own = detail(periods);
  return [
    {
      ...base,
      ...(where ? { location: where } : {}),
      detail: base.detail === undefined ? own : `${own} in ${base.detail}`,
    },
  ];
}

/** The periods in an expression, each with the node whose value it is. */
const inNode = (node: TmdlNode | undefined, expression: string): Found[] =>
  expressionPeriods(expression).map((period) => ({ period, node }));

/**
 * A calculated table's fixed CALENDAR ends, from each calculated partition's `source`. The DAX is
 * read from the node its line is taken from, so an offset always lies in that node's value.
 * Desktop's auto date/time tables are left out: their template ends on a fixed day by design, and
 * REMOVE_AUTO-DATE_TABLE reports them.
 */
function dateTableEnds(t: Table): Found[] {
  if (t.kind !== "calculated" || isAutoDateTable(t)) return [];
  return t.partitions
    .filter((p) => p.sourceType === "calculated")
    .flatMap((p) => {
      const node = p.node?.children.find((c) => c.kind === "expr" && c.type === "source");
      return calendarEnds(node?.value ?? p.source ?? "").map((period) => ({ period, node }));
    });
}

function periodFindings(model: Model): RuleFinding[] {
  const out: RuleFinding[] = [];
  for (const t of model.tables) {
    out.push(...fixedFinding(finding.table(t), t.name, dateTableEnds(t), endsDetail));
    for (const x of t.measures)
      out.push(
        ...fixedFinding(finding.measure(x), x.name, inNode(x.node, x.expression), fixesDetail),
      );
    for (const c of t.columns)
      if (c.kind === "calculated")
        out.push(
          ...fixedFinding(
            finding.column(c),
            c.name,
            inNode(c.node, c.expression ?? ""),
            fixesDetail,
          ),
        );
    for (const i of t.calculationGroup?.items ?? [])
      out.push(
        ...fixedFinding(
          finding.calculationItem(i),
          i.name,
          inNode(i.node, i.expression),
          fixesDetail,
        ),
      );
  }
  return out;
}

export const HARDCODED_PERIOD_IN_DAX = pbiplintRule({
  id: "HARDCODED_PERIOD_IN_DAX",
  name: "Hardcoded period in DAX",
  category: "DAX Expressions",
  severity: 1,
  scope: ["Measure", "CalculatedColumn", "CalculationItem", "CalculatedTable"],
  layer: "model",
  // No skipWhenModelUnread: each finding rests on the object's own expression, so a file the
  // parser could not read can hide an object from the rule, never put a period in one.
  check: ({ model }) => (model ? periodFindings(model) : []),
});

export const periodRules = [HARDCODED_PERIOD_IN_DAX];
