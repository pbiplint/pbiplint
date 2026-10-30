import { capped, msg, type Message } from "../../messages/format.js";
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

/** A day in long form, as a detail names it: `December 31, 2025`. `month` is 1 to 12. */
export const longDate = (year: number, month: number, day: number): string =>
  `${MONTHS[month - 1]} ${day}, ${year}`;

/**
 * A day as the date kind reads it, `2025-12-31`, its year padded to four digits, since DAX's
 * DATE() gives years from 100.
 */
const isoDay = ({ year, month, day }: NonNullable<Period["date"]>): string =>
  [
    String(year).padStart(4, "0"),
    String(month).padStart(2, "0"),
    String(day).padStart(2, "0"),
  ].join("-");

/**
 * The periods a detail names, each once, in the order found: a year as `2025`, a day in long form,
 * an ambiguous string quoted as written.
 */
function shown(periods: readonly Period[]): (string | Message)[] {
  const named = new Map<string, string | Message>();
  for (const p of periods) {
    if (p.ambiguous !== undefined)
      named.set(`"${p.ambiguous}"`, msg("quoted", { name: p.ambiguous }));
    else if (p.date) named.set(isoDay(p.date), msg("date.long", { date: isoDay(p.date) }));
    else named.set(String(p.year), String(p.year));
  }
  return [...named.values()];
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
function fixesDetail(periods: readonly Period[]): Message {
  const names = shown(periods);
  const days = periods.filter((p) => p.date !== undefined || p.ambiguous !== undefined).length;
  const kind = days === 0 ? "year" : days === periods.length ? "date" : "mixed";
  return msg("HARDCODED_PERIOD_IN_DAX.fixed", {
    kind,
    count: names.length,
    periods: capped(names),
  });
}

/** A date table's detail: the day, or days, its CALENDAR calls end on. */
function endsDetail(periods: readonly Period[]): Message {
  const names = shown(periods);
  return msg("HARDCODED_PERIOD_IN_DAX.endsOn", { count: names.length, dates: capped(names) });
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
  detail: (periods: readonly Period[]) => Message,
): RuleFinding[] {
  const periods = found.map((f) => f.period);
  if (periods.length === 0 || periods.some((p) => namesYear(name, p.year))) return [];
  const where = lineAt(found[0]!.node, found[0]!.period.at);
  const own = detail(periods);
  const { message: context, ...rest } = base;
  return [
    {
      ...rest,
      message: context ? msg("HARDCODED_PERIOD_IN_DAX.inContext", { own, context }) : own,
      ...(where ? { location: where } : {}),
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
