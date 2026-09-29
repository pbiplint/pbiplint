import { describe, expect, it } from "vitest";
import {
  calendarEnds,
  expressionPeriods,
  type Period,
} from "../src/rules/pbiplint/period-forms.js";
import { nameClass, nameWords } from "../src/rules/pbiplint/period-words.js";

/** A period as a test reads it: a year, a day as y-m-d, or an ambiguous string in quotes. */
const show = (p: Period): string =>
  p.ambiguous !== undefined
    ? `"${p.ambiguous}"`
    : p.date
      ? `${p.date.year}-${p.date.month}-${p.date.day}`
      : String(p.year);
const found = (dax: string): string[] => expressionPeriods(dax).map(show);
const ends = (dax: string): string[] => calendarEnds(dax).map(show);

describe("year names", () => {
  it("splits a name into lowercased words at case changes, digits, and separators", () => {
    expect(nameWords("FiscalYear")).toEqual(["fiscal", "year"]);
    expect(nameWords("anio_venta")).toEqual(["anio", "venta"]);
    expect(nameWords("Year2025")).toEqual(["year", "2025"]);
    expect(nameWords("CurrentFY")).toEqual(["current", "fy"]);
    expect(nameWords("Calendar Year (Num)")).toEqual(["calendar", "year", "num"]);
  });

  it("reads a year name in several languages", () => {
    for (const name of [
      "Year",
      "Years",
      "Año",
      "anio",
      "Ano",
      "Jahr",
      "Année",
      "Anno",
      "Jaar",
      "År",
      "FiscalYear",
      "fiscalyear",
      "Calendar Year",
      "SelectedYear",
      "CurrentFY",
      "yr",
    ])
      expect(nameClass(name), name).toBe("year");
  });

  it("reads a year beside a month or a quarter as a key, and a count of years as neither", () => {
    for (const name of ["YearMonth", "Year Month", "year_month", "Year Quarter", "YearQtr"])
      expect(nameClass(name), name).toBe("yearKey");
    expect(nameClass("yyyymm")).toBe("yearKey");
    expect(nameClass("Years of Service")).toBe("yearCount");
    expect(nameClass("Month")).toBe("month");
    expect(nameClass("MonthNum")).toBe("month");
    expect(nameClass("Quarter")).toBe("quarter");
    for (const name of ["Amount", "Acao", "Sales", "Payment"])
      expect(nameClass(name), name).toBeUndefined();
  });

  it("keeps a combining mark in its word, so a decomposed Año is still a year", () => {
    expect(nameClass("Año")).toBe("year");
  });
});

describe("expressionPeriods", () => {
  it("finds a year compared by =, ==, or <> with a year operand, on either side", () => {
    expect(found("'Date'[Year] = 2025")).toEqual(["2025"]);
    expect(found("2025 == 'Date'[Year]")).toEqual(["2025"]);
    expect(found("YEAR('Sales'[Order Date]) <> 2026")).toEqual(["2026"]);
    expect(found("Date[Year] = 2025")).toEqual(["2025"]);
    expect(found(`Productivity[Year] = "2025"`)).toEqual(["2025"]);
    expect(found("SELECTEDVALUE('Date'[Year]) = 2024")).toEqual(["2024"]);
    expect(found("MAX('Date'[Año]) = 2024")).toEqual(["2024"]);
    expect(found("MAX(YEAR('Sales'[Order Date])) = 2024")).toEqual(["2024"]);
    expect(found(`FORMAT('Sales'[Order Date], "yyyy") = "2024"`)).toEqual(["2024"]);
    expect(found(`"2024" = FORMAT('Sales'[Order Date], "yyyy")`)).toEqual(["2024"]);
    expect(found("SelectedYear = 2025")).toEqual(["2025"]);
    expect(found("2025 = _anio")).toEqual(["2025"]);
  });

  it("finds each year listed after IN beside a year operand", () => {
    expect(found("'Dim_Fecha'[Año] IN {2024, 2025, 2026}")).toEqual(["2024", "2025", "2026"]);
    expect(found(`NOT 'T'[Year] IN {"2024", "2025"}`)).toEqual(["2024", "2025"]);
    expect(found("YEAR('Sales'[Order Date]) IN {2024}")).toEqual(["2024"]);
  });

  it("finds a variable with a year's name set to a year alone", () => {
    expect(found("VAR SelectedYear = 2025 RETURN [Total]")).toEqual(["2025"]);
    expect(found(`VAR CurrentFY = "2025" RETURN [Total]`)).toEqual(["2025"]);
    expect(found("VAR x = 2025 RETURN [Total]")).toEqual([]);
    expect(found("VAR SelectedYear = 2025 + 0 RETURN [Total]")).toEqual([]);
  });

  it("finds DATE() with a fixed year, as a day when every argument is a whole number", () => {
    expect(found("DATE(2024, 12, 31)")).toEqual(["2024-12-31"]);
    expect(found("DATE(2024, 'Date'[Month], 1)")).toEqual(["2024"]);
    expect(found("DATE(2025, 13, 1)")).toEqual(["2026-1-1"]);
    expect(found(`FORMAT(DATE(2024, 1, 1), "yyyy")`)).toEqual(["2024-1-1"]);
    expect(
      found(
        "CALCULATE([Total], 'Date'[Date] >= DATE(2024, 1, 1), 'Date'[Date] <= DATE(2024, 12, 31))",
      ),
    ).toEqual(["2024-1-1", "2024-12-31"]);
    expect(found("date(2024, 1, 1)")).toEqual(["2024-1-1"]);
    expect(found("DATE(1970, 1, 2)")).toEqual(["1970-1-2"]);
  });

  it("keeps the year a rolled-over DATE() is written with", () => {
    expect(expressionPeriods("DATE(2025, 13, 1)")[0]).toEqual({
      at: 0,
      year: 2025,
      date: { year: 2026, month: 1, day: 1 },
    });
  });

  it("reads a named date format as showing the year", () => {
    expect(found(`FORMAT(DATE(2024, 12, 31), "Long Date")`)).toEqual(["2024-12-31"]);
    expect(found(`FORMAT(DATE(2024, 12, 31), "short date")`)).toEqual(["2024-12-31"]);
  });

  it("gives each period once, where it is written, in order", () => {
    const dax = "IF('Date'[Year] = 2023, DATE(2024, 1, 1))";
    expect(expressionPeriods(dax).map((p) => [p.at, show(p)])).toEqual([
      [dax.indexOf("2023"), "2023"],
      [dax.indexOf("DATE"), "2024-1-1"],
    ]);
    const year = "DATE(2024, 'Date'[Month], 1)";
    expect(expressionPeriods(year)[0]!.at).toBe(year.indexOf("2024"));
  });

  it("leaves alone what does not go stale or is not a year", () => {
    for (const dax of [
      "'Date'[Year] >= 2019",
      "'Date'[Year] < 2020",
      "'Date'[Month] = 12",
      "QUARTER('Date'[Date]) = 4",
      `DATESYTD('Date'[Date], "6/30")`,
      "DIVIDE([Total], 12)",
      "MOD([Key] * 1993, 100)",
      "[Total] // 'Date'[Year] = 2025",
      `"Year = 2025"`,
      "[Sales 2025] + 'FY2025'[Amount]",
      "[YearMonth] = 202306",
      "'Date'[YearMonth] = 2023",
      "[Years of Service] = 2030",
      `'Acao'[Acao] IN {"2011", "2012"}`,
      "'Date'[Year] = 1949",
      "'Date'[Year] = 2050",
      "'Date'[Year] = 2025.5",
      "DATE(1900, 1, 1)",
      "DATE(9999, 12, 31)",
      "DATE(2025, 99999999999999, 1)",
      "DATE(1970, 1, 1) + 'Log'[UnixTime] / 86400",
      `FORMAT(DATE(2000, 1, 1), "oooo")`,
      `FORMAT(DATE(2025, 'Date'[MonthNum], 1), "mmmm")`,
      "DATE(Yr, 1, 1)",
      "CALENDAR(DATE(2020, 1, 1), DATE(2026, 12, 31))",
      "GENERATESERIES(DATE(2020, 1, 1), DATE(2020, 12, 31), 1)",
      "CALENDAR(DATE(2020, 1, 1), EOMONTH(DATE(2026, 12, 1), 0))",
      `ADDCOLUMNS(CALENDAR(DATE(2020, 1, 1), TODAY()), "Year", YEAR([Date]))`,
    ])
      expect(found(dax), dax).toEqual([]);
  });
});

describe("calendarEnds", () => {
  it("reads a fixed end however it is written", () => {
    expect(ends("CALENDAR(DATE(2020, 1, 1), DATE(2026, 12, 31))")).toEqual(["2026-12-31"]);
    expect(ends(`CALENDAR("2018-01-01", "2030-12-31")`)).toEqual(["2030-12-31"]);
    expect(ends(`CALENDAR(dt"2020-01-01", dt"2026-06-30")`)).toEqual(["2026-6-30"]);
    expect(ends(`CALENDAR(DATE(2020, 1, 1), DATEVALUE("31/12/2026"))`)).toEqual(["2026-12-31"]);
    expect(ends(`CALENDAR(DATE(2020, 1, 1), DATETIMEVALUE("2026/12/31 00:00"))`)).toEqual([
      "2026-12-31",
    ]);
    expect(ends(`CALENDAR(DATE(2020, 1, 1), VALUE("12/31/2026"))`)).toEqual(["2026-12-31"]);
    expect(ends("CALENDAR(DATE(2020, 1, 1), DATE(2025, 13, 1))")).toEqual(["2026-1-1"]);
    expect(ends("CALENDAR(DATE(2020, 1, 1), DATE(9999, 12, 31))")).toEqual(["9999-12-31"]);
    expect(
      ends(`ADDCOLUMNS(CALENDAR(DATE(2020, 1, 1), DATE(2024, 12, 31)), "Year", YEAR([Date]))`),
    ).toEqual(["2024-12-31"]);
    expect(ends("calendar(date(2020, 1, 1), Date(2026, 12, 31))")).toEqual(["2026-12-31"]);
  });

  it("reads an end through variables, and says where the day is written", () => {
    const viaVariable =
      "VAR EndDate = DATE(2025, 12, 31) RETURN CALENDAR(DATE(2020, 1, 1), EndDate)";
    expect(calendarEnds(viaVariable).map((p) => [p.at, show(p)])).toEqual([
      [viaVariable.indexOf("DATE"), "2025-12-31"],
    ]);
    const viaYear =
      "VAR __FirstYear = 2017 VAR __LastYear = 2023 RETURN CALENDAR(DATE(__FirstYear, 1, 1), DATE(__LastYear, 12, 31))";
    expect(calendarEnds(viaYear).map((p) => [p.at, p.year, show(p)])).toEqual([
      [viaYear.lastIndexOf("DATE"), 2023, "2023-12-31"],
    ]);
    for (const end of [`"2026-12-31"`, `dt"2026-12-31"`]) {
      const dax = `VAR e = ${end} RETURN CALENDAR(DATE(2020, 1, 1), e)`;
      expect(ends(dax), dax).toEqual(["2026-12-31"]);
    }
  });

  it("reads DATE()'s year as DAX does, and keeps the year as written", () => {
    // 0 to 49 is added to 2000, 50 to 99 to 1900, and 100 to 9999 is used as is, as the examples
    // on Learn's DATE page say (https://learn.microsoft.com/dax/date-function-dax#examples).
    expect(calendarEnds("CALENDAR(DATE(2020, 1, 1), DATE(25, 12, 31))")[0]).toMatchObject({
      year: 25,
      date: { year: 2025, month: 12, day: 31 },
    });
    expect(ends("CALENDAR(DATE(2020, 1, 1), DATE(0, 12, 31))")).toEqual(["2000-12-31"]);
    expect(ends("CALENDAR(DATE(2020, 1, 1), DATE(49, 13, 1))")).toEqual(["2050-1-1"]);
    expect(ends("CALENDAR(DATE(2020, 1, 1), DATE(50, 12, 31))")).toEqual(["1950-12-31"]);
    expect(ends("CALENDAR(DATE(2020, 1, 1), DATE(99, 12, 31))")).toEqual(["1999-12-31"]);
    expect(calendarEnds("CALENDAR(DATE(2020, 1, 1), DATE(125, 12, 31))")[0]).toMatchObject({
      year: 125,
      date: { year: 125, month: 12, day: 31 },
    });
  });

  it("quotes a date string whose day and month read either way", () => {
    const ambiguous = `CALENDAR(DATE(2020, 1, 1), "01/02/2026")`;
    expect(ends(ambiguous)).toEqual([`"01/02/2026"`]);
    expect(calendarEnds(ambiguous)[0]).toMatchObject({
      at: ambiguous.indexOf(`"01/02`),
      year: 2026,
    });
    expect(ends(`CALENDAR(DATE(2020, 1, 1), "05/05/2026")`)).toEqual(["2026-5-5"]);
  });

  it("leaves alone an end that is not fixed, or not written as the rule reads", () => {
    for (const dax of [
      "CALENDAR(DATE(2020, 1, 1), TODAY())",
      "CALENDAR(MIN('Sales'[Date]), MAX('Sales'[Date]))",
      "CALENDAR(DATE(2020, 1, 1), EOMONTH(TODAY(), 0))",
      "CALENDAR(DATE(2020, 1, 1), DATE(YEAR(MAX('Sales'[Date])), 12, 31))",
      "CALENDAR(DATE(2020, 1, 1), DATE(2026, 12, 31) + 1)",
      "CALENDAR(DATE(2020, 1, 1), DATE(10000, 1, 1))",
      "CALENDAR(DATE(2020, 1, 1), DATE(2026, 99999999999999, 1))",
      "CALENDAR(DATE(2020, 1, 1), [End Date])",
      `CALENDAR(DATE(2020, 1, 1), "2026.9.11")`,
      `CALENDAR(DATE(2020, 1, 1), "31/02/2026")`,
      `CALENDAR(DATE(2020, 1, 1), dt"2026-02-30")`,
      "CALENDARAUTO()",
      "VAR a = a RETURN CALENDAR(DATE(2020, 1, 1), a)",
      "CALENDAR(DATE(2020, 1, 1)",
    ])
      expect(ends(dax), dax).toEqual([]);
  });
});
