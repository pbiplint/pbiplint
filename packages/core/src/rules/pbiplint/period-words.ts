/**
 * The words #104's research read as naming a year, a month, or a quarter, in the languages of the
 * models it read. Multilingual by default, as decided on the issue: #97's language setting is for
 * the ported rules.
 */
const YEAR_WORDS = new Set([
  "year",
  "years",
  "yr",
  "yrs",
  "año",
  "años",
  "ano",
  "anos",
  "anio",
  "jahr",
  "année",
  "annee",
  "anno",
  "jaar",
  "år",
  "rok",
  "vuosi",
  "ejercicio",
  "exercice",
  "fy",
  "ay",
  "cy",
  "ly",
  "py",
  "yyyy",
  "y",
]);
const MONTH_WORDS = new Set([
  "month",
  "months",
  "mes",
  "mês",
  "meses",
  "monat",
  "mois",
  "mese",
  "maand",
  "mm",
  "mon",
  "mth",
  "period",
  "periodo",
  "período",
]);
const QUARTER_WORDS = new Set(["quarter", "qtr", "q", "trimestre", "quartal", "kwartaal"]);
/** Words that, beside `years`, make a name a count of years (`Years of Service`), not a year. */
const COUNT_WORDS = new Set(["of", "service", "experience", "at", "in", "since", "tenure", "old"]);

/**
 * What a name says it holds: a year, a key that joins a year with a month or a quarter
 * (`YearMonth`), a count of years, a month, or a quarter. Only a year makes a year operand.
 */
export type NameClass = "year" | "yearKey" | "yearCount" | "month" | "quarter";

/**
 * A name's words, lowercased: split at a lowercase letter followed by an uppercase one, at a
 * letter followed by a digit, and at every character that is neither a letter, a combining mark,
 * nor a digit. The name is composed first (NFC), so a decomposed `Año` matches the word lists.
 */
export function nameWords(name: string): string[] {
  return name
    .normalize("NFC")
    .replace(/(\p{Ll})(\p{Lu})/gu, "$1 $2")
    .replace(/(\p{L})(\p{N})/gu, "$1 $2")
    .split(/[^\p{L}\p{M}\p{N}]+/u)
    .filter((w) => w !== "")
    .map((w) => w.toLowerCase());
}

/** A name's class, as the research's `name_class` gives it (spec section 4.4). */
export function nameClass(name: string): NameClass | undefined {
  const words = nameWords(name);
  const low = name.toLowerCase();
  const squeezed = low.replace(/ /g, "");
  const year = words.some(
    (w) => YEAR_WORDS.has(w) || w.startsWith("year") || (w.endsWith("year") && w.length > 4),
  );
  const month = words.some((w) => MONTH_WORDS.has(w) || w.startsWith("month"));
  const quarter = words.some((w) => QUARTER_WORDS.has(w) || w.startsWith("quarter"));
  if (year && (month || quarter || squeezed.includes("yearmonth") || squeezed.includes("yearqtr")))
    return "yearKey";
  if (year && words.includes("years") && words.some((w) => COUNT_WORDS.has(w))) return "yearCount";
  if (year) return "year";
  if (
    low.includes("yyyymm") ||
    squeezed.includes("yearmonth") ||
    low.includes("periodkey") ||
    low.includes("monthkey")
  )
    return "yearKey";
  if (month) return "month";
  if (quarter) return "quarter";
  return undefined;
}
