import {
  daxVariables,
  isPunctuation,
  isWord,
  tokenizeDax,
  variableAt,
  type DaxToken,
  type DaxVariable,
} from "../../dax/tokenize.js";
import { nameClass } from "./period-words.js";

/**
 * A fixed period DAX writes: a year, or a day. `at` is where it is written, the offset into the
 * expression of the token a reader edits: a year's own number or string, the `DATE` of a
 * `DATE(` call, a date string, or a `dt"..."` literal.
 */
export interface Period {
  at: number;
  /** The year as the DAX writes it, which HARDCODED_PERIOD_IN_DAX looks for in the object's name. */
  year: number;
  /** For a day, the one DAX makes of it: a month or day past its end rolls over, as in DATE(2025, 13, 1). */
  date?: { year: number; month: number; day: number };
  /** For a date string whose day and month read either way, the string as written. */
  ambiguous?: string;
}

/** A run of tokens, from `from` up to, not including, `to`. */
interface Span {
  from: number;
  to: number;
}

/** The years the forms of spec sections 4.2 to 4.4 report: none outside it went stale in the research. */
const FIRST_YEAR = 1950;
const LAST_YEAR = 2049;
const COMPARISONS = new Set(["=", "==", "<>"]);
/** The research's aggregates and wrappers, whose year column or YEAR() makes a year operand. */
const WRAPPERS = new Set([
  "SELECTEDVALUE",
  "MAX",
  "MIN",
  "VALUES",
  "DISTINCT",
  "FIRSTNONBLANK",
  "LASTNONBLANK",
  "MAXX",
  "MINX",
  "LOOKUPVALUE",
  "RELATED",
  "CALCULATE",
  "HASONEVALUE",
  "SUM",
  "AVERAGE",
  "CONVERT",
  "INT",
  "VALUE",
  "FORMAT",
]);
/** The calls whose arguments are a date table's bounds, which the DATE() form leaves to 4.1. */
const BOUNDS = new Set(["CALENDAR", "GENERATESERIES"]);
/** Power BI's named date formats that show the year, lowercased; none has a `y` in its name. */
const YEAR_FORMATS = new Set(["general date", "long date", "medium date", "short date"]);
/** The Unix epoch, which `DATE(1970, 1, 1) + 'Log'[UnixTime] / 86400` builds on: never stale. */
const UNIX_EPOCH = { year: 1970, month: 1, day: 1 };
/** The calls that read a date from one string argument. */
const STRING_DATES = new Set(["DATEVALUE", "DATETIMEVALUE", "VALUE"]);
const YEAR_FIRST = /^(\d{4})([-/])(\d{1,2})\2(\d{1,2})(?:[ T]\d{1,2}:\d{2}.*)?$/;
const YEAR_LAST = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})(?:[ T]\d{1,2}:\d{2}.*)?$/;

const isWhole = (t: DaxToken | undefined): t is DaxToken =>
  t?.kind === "number" && /^\d+$/.test(t.text);

/** The year a token holds: four digits from 1950 to 2049, as a whole number or, where `strings`, a string. */
function yearIn(t: DaxToken | undefined, strings: boolean): number | undefined {
  const text =
    t?.kind === "number" ? t.text : strings && t?.kind === "string" ? t.text.trim() : undefined;
  if (text === undefined || !/^\d{4}$/.test(text)) return undefined;
  const year = Number(text);
  return year >= FIRST_YEAR && year <= LAST_YEAR ? year : undefined;
}

/** The arguments of the call or braces opening at `open`, split at the commas directly inside. */
function argumentsOf(tokens: readonly DaxToken[], open: number): Span[] {
  const end = tokens[open]?.close ?? tokens.length;
  const spans: Span[] = [];
  let from = open + 1;
  for (let k = open + 1; k < end; k++)
    if (tokens[k]!.parent === open && isPunctuation(tokens[k], ",")) {
      spans.push({ from, to: k });
      from = k + 1;
    }
  spans.push({ from, to: end });
  return spans;
}

/** The one token a span holds, if it holds exactly one. */
const only = (tokens: readonly DaxToken[], span: Span | undefined): DaxToken | undefined =>
  span && span.to - span.from === 1 ? tokens[span.from] : undefined;

/** Whether the call whose `(` is at `open` gives a year: YEAR(), or an aggregate or wrapper of one. */
function callGivesYear(tokens: readonly DaxToken[], open: number): boolean {
  const o = tokens[open]!;
  if (o.call === "YEAR") return true;
  if (o.call === undefined || !WRAPPERS.has(o.call) || o.close === undefined) return false;
  const inside = tokens.slice(open + 1, o.close);
  if (inside.some((x) => x.call === "YEAR")) return true;
  for (const x of inside) {
    const named = x.kind === "column" ? nameClass(x.text) : undefined;
    if (named !== undefined) return named === "year";
  }
  return (
    o.call === "FORMAT" && inside.some((x) => x.kind === "string" && /^(?:yy|yyyy)$/i.test(x.text))
  );
}

/** Whether the operand that ends at token `k`, just before an operator, is a year operand. */
function yearBefore(tokens: readonly DaxToken[], k: number): boolean {
  const t = tokens[k];
  if (t === undefined) return false;
  if (t.kind === "column" || t.kind === "identifier") return nameClass(t.text) === "year";
  return isPunctuation(t, ")") && t.open !== undefined && callGivesYear(tokens, t.open);
}

/** Whether the operand that starts at token `k`, just after an operator, is a year operand. */
function yearAfter(tokens: readonly DaxToken[], k: number): boolean {
  const t = tokens[k];
  const next = tokens[k + 1];
  if ((t?.kind === "table" || t?.kind === "identifier") && next?.kind === "column")
    return nameClass(next.text) === "year";
  if (t?.kind === "column") return nameClass(t.text) === "year";
  if (t?.kind === "identifier" && isPunctuation(next, "(")) return callGivesYear(tokens, k + 1);
  return t?.kind === "identifier" && nameClass(t.text) === "year";
}

/** Whether the `DATE(` whose `(` is at `open` sits in a CALENDAR or GENERATESERIES argument, at any depth. */
function isBound(tokens: readonly DaxToken[], open: number): boolean {
  for (let p = tokens[open]!.parent; p !== undefined; p = tokens[p]!.parent)
    if (BOUNDS.has(tokens[p]!.call ?? "")) return true;
  return false;
}

/**
 * Whether the `DATE(` at `open` is FORMAT's first argument, with a format that shows no year: one
 * with no `y` in it that is not one of the named date formats, which show the year.
 */
function isYearFreeFormat(tokens: readonly DaxToken[], open: number): boolean {
  const date = tokens[open - 1]!;
  const p = date.parent;
  if (p === undefined || tokens[p]!.call !== "FORMAT" || date.arg !== 0) return false;
  const format = only(tokens, argumentsOf(tokens, p)[1]);
  return (
    format?.kind === "string" &&
    !/y/i.test(format.text) &&
    !YEAR_FORMATS.has(format.text.toLowerCase())
  );
}

/** Whether year, month, and day name a real day, with no rolling over. */
const isRealDay = (year: number, month: number, day: number): boolean =>
  month >= 1 && month <= 12 && day >= 1 && day <= new Date(Date.UTC(year, month, 0)).getUTCDate();

/** The day DATE(year, month, day) gives: a month past 12, or a day past its month's end, rolls into the next, as Date.UTC rolls it. */
function daxDate(year: number, month: number, day: number): NonNullable<Period["date"]> {
  const d = new Date(Date.UTC(year, month - 1, day));
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate() };
}

/**
 * The day a date string names (spec section 4.1): year first with `-` or `/`, or year last with
 * the day and month in either order, each with an optional time. A year-last string whose day and
 * month read either way is ambiguous and kept as written.
 */
function dateString(t: DaxToken): Period | undefined {
  const text = t.text.trim();
  const first = YEAR_FIRST.exec(text);
  if (first) {
    const [year, month, day] = [Number(first[1]), Number(first[3]), Number(first[4])];
    return isRealDay(year, month, day)
      ? { at: t.start, year, date: { year, month, day } }
      : undefined;
  }
  const last = YEAR_LAST.exec(text);
  if (!last) return undefined;
  const [a, b, year] = [Number(last[1]), Number(last[2]), Number(last[3])];
  const monthFirst = isRealDay(year, a, b);
  const dayFirst = isRealDay(year, b, a);
  if (monthFirst && dayFirst && a !== b) return { at: t.start, year, ambiguous: text };
  if (monthFirst) return { at: t.start, year, date: { year, month: a, day: b } };
  if (dayFirst) return { at: t.start, year, date: { year, month: b, day: a } };
  return undefined;
}

/**
 * The fixed years and days in a measure's, a calculated column's, or a calculation item's DAX
 * (spec sections 4.2 to 4.4), in the order they are written, each place once.
 */
export function expressionPeriods(expression: string): Period[] {
  const tokens = tokenizeDax(expression);
  const found: Period[] = [];
  const year = (t: DaxToken, y: number): void => {
    found.push({ at: t.start, year: y });
  };
  tokens.forEach((t, k) => {
    // Compared: a year on one side of =, ==, or <>, a year operand on the other; not VAR's own =.
    if (t.kind === "operator" && COMPARISONS.has(t.text) && !isWord(tokens[k - 2], "VAR")) {
      const right = yearIn(tokens[k + 1], true);
      if (right !== undefined && yearBefore(tokens, k - 1)) year(tokens[k + 1]!, right);
      const left = yearIn(tokens[k - 1], true);
      if (left !== undefined && yearAfter(tokens, k + 1)) year(tokens[k - 1]!, left);
    }
    // Listed: each year in the braces after `<year operand> IN`.
    const list = tokens[k + 1];
    if (isWord(t, "IN") && isPunctuation(list, "{") && yearBefore(tokens, k - 1))
      for (const x of tokens.slice(k + 2, list!.close ?? tokens.length)) {
        const y = yearIn(x, true);
        if (y !== undefined) year(x, y);
      }
    // DATE() with a fixed year, outside a date table's bounds and a FORMAT that shows no year,
    // and not the Unix epoch.
    if (t.call === "DATE" && !isBound(tokens, k) && !isYearFreeFormat(tokens, k)) {
      const [y, m, d] = argumentsOf(tokens, k).map((span) => only(tokens, span));
      const fixed = yearIn(y, false);
      if (fixed !== undefined) {
        if (isWhole(m) && isWhole(d)) {
          const [month, day] = [Number(m.text), Number(d.text)];
          const epoch =
            fixed === UNIX_EPOCH.year && month === UNIX_EPOCH.month && day === UNIX_EPOCH.day;
          if (!epoch)
            found.push({ at: tokens[k - 1]!.start, year: fixed, date: daxDate(fixed, month, day) });
        } else year(y!, fixed);
      }
    }
  });
  // Assigned: `VAR <year name> = <year>`, the year alone.
  for (const v of daxVariables(tokens)) {
    const y = yearIn(only(tokens, v), true);
    if (y !== undefined && nameClass(v.name) === "year") year(tokens[v.from]!, y);
  }
  const seen = new Set<number>();
  const periods: Period[] = [];
  for (const p of found.sort((a, b) => a.at - b.at))
    if (!seen.has(p.at)) {
      seen.add(p.at);
      periods.push(p);
    }
  return periods;
}

/** A whole number a DATE() argument gives: one number token, or one variable defined as one. */
function wholeNumber(
  tokens: readonly DaxToken[],
  vars: readonly DaxVariable[],
  span: Span,
): number | undefined {
  let t = only(tokens, span);
  if (t?.kind === "identifier") {
    const v = variableAt(vars, t.text, span.from);
    t = v ? only(tokens, v) : undefined;
  }
  return isWhole(t) ? Number(t.text) : undefined;
}

/**
 * The day a CALENDAR end fixes (spec section 4.1): DATE() of whole numbers or of variables holding
 * one, a `dt"..."` literal of a real day, DATEVALUE, DATETIMEVALUE, or VALUE of a date string, or
 * a bare date string, filling the whole argument, directly or through a variable. Anything else is
 * not fixed.
 */
function fixedDay(
  tokens: readonly DaxToken[],
  vars: readonly DaxVariable[],
  span: Span,
  seen: Set<DaxVariable>,
): Period | undefined {
  const first = tokens[span.from];
  if (first === undefined || span.to <= span.from) return undefined;
  if (span.to - span.from === 1) {
    if (first.kind === "string") return dateString(first);
    if (first.kind === "date") {
      const m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(first.text.trim());
      if (!m) return undefined;
      const [year, month, day] = [Number(m[1]), Number(m[2]), Number(m[3])];
      return isRealDay(year, month, day)
        ? { at: first.start, year, date: { year, month, day } }
        : undefined;
    }
    if (first.kind !== "identifier") return undefined;
    const v = variableAt(vars, first.text, span.from);
    if (v === undefined || seen.has(v)) return undefined;
    seen.add(v);
    return fixedDay(tokens, vars, v, seen);
  }
  // A call filling the whole span.
  const open = span.from + 1;
  if (first.kind !== "identifier" || tokens[open]?.close !== span.to - 1) return undefined;
  const call = first.text.toUpperCase();
  const args = argumentsOf(tokens, open);
  if (call === "DATE" && args.length === 3) {
    const [y, m, d] = args.map((a) => wholeNumber(tokens, vars, a));
    if (y !== undefined && m !== undefined && d !== undefined)
      return { at: first.start, year: y, date: daxDate(y, m, d) };
  }
  const text = args.length === 1 ? only(tokens, args[0]) : undefined;
  if (STRING_DATES.has(call) && text?.kind === "string") return dateString(text);
  return undefined;
}

/** The fixed ends of the CALENDAR calls in a calculated table's DAX, in order, whatever their year. */
export function calendarEnds(expression: string): Period[] {
  const tokens = tokenizeDax(expression);
  const vars = daxVariables(tokens);
  const ends: Period[] = [];
  tokens.forEach((t, k) => {
    if (t.call !== "CALENDAR") return;
    const end = argumentsOf(tokens, k)[1];
    const day = end && fixedDay(tokens, vars, end, new Set());
    if (day) ends.push(day);
  });
  return ends;
}
