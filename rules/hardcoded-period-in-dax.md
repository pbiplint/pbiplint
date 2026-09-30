---
id: HARDCODED_PERIOD_IN_DAX
name: "Hardcoded period in DAX"
category: DAX Expressions
severity: info
scope: [Measure, CalculatedColumn, CalculationItem, CalculatedTable]
status: builtin
layer: model
video:
sources:
---

# Hardcoded period in DAX

## What it checks

Measures, calculated columns, and calculation items whose DAX fixes a year or a date, and date tables whose CALENDAR ends on a fixed date.

Each finding names the object, as `[Current Year Sales]` for a measure, `'Sales'[Is Recent]` for a calculated column, `'Date'` for a date table, or a calculation item by its name, and points at the line where the first fixed period is written rather than the line where the object starts. Its detail says what the object fixes, as `fixed year 2025` or `fixed dates January 1, 2024 and December 31, 2024`, or, for a date table, `ends on a fixed date, December 31, 2026`. A calculation item's detail adds its group, as `fixed year 2025 in calculation group 'Time Calc'`.

The rule reads three forms:

- A year from 1950 to 2049, as a number or a string of four digits, compared with `=`, `==`, or `<>`, or listed after `IN`, beside something that holds a year: a column, a measure, or a variable with a year's name (`'Date'[Year]`, `'Date'[Año]`, `SelectedYear`), a call to `YEAR()`, an aggregate or wrapper around a year column or `YEAR()`, such as `SELECTEDVALUE('Date'[Year])` or `RELATED('Date'[Year])`, or `FORMAT` with `"yyyy"` or `"yy"`, as in `FORMAT('Sales'[Order Date], "yyyy")`. A variable with a year's name set to a year alone counts too, as `VAR SelectedYear = 2025`.
- `DATE()` with a year from 1950 to 2049 as a number, such as `DATE(2024, 12, 31)` or `DATE(2024, 'Date'[Month], 1)`.
- The end of a `CALENDAR` call in a calculated table, when it is a fixed date written as `DATE()` of whole numbers or of variables holding them, a date string, `DATEVALUE("...")` (or `DATETIMEVALUE` or `VALUE` of a string), or `dt"2026-12-31"`, directly or through a variable. The start is never read, since a date table that starts on a fixed date is normal.

## Example

```tmdl fires
table Sales
	column Amount
		dataType: decimal
		sourceColumn: Amount
	column 'Order Date'
		dataType: dateTime
		sourceColumn: Order Date
	measure 'Current Year Sales' = CALCULATE(SUM(Sales[Amount]), YEAR(Sales[Order Date]) = 2025)
		formatString: #,0
```

```tmdl fixed
table Sales
	column Amount
		dataType: decimal
		sourceColumn: Amount
	column 'Order Date'
		dataType: dateTime
		sourceColumn: Order Date
	measure 'Current Year Sales' = CALCULATE(SUM(Sales[Amount]), YEAR(Sales[Order Date]) = YEAR(TODAY()))
		formatString: #,0
```

## Why it matters

A year typed into DAX is right for the year it was written in and quietly wrong after it. A measure named Current Year Sales that filters on 2025 still shows 2025's sales all through 2026, under the same name, with no error, and a reader has no way to tell.

A date table built with `CALENDAR(DATE(2020, 1, 1), DATE(2026, 12, 31))` has no rows after December 31, 2026. From January 1, 2027, new rows in a table related to it find no date there. A visual that groups by the date table's columns shows them under a blank value: the [blank virtual row](https://learn.microsoft.com/power-bi/transform-model/desktop-relationships-understand#regular-relationships) Power BI adds when a value on a relationship's many side has no match on its one side. A filter or slicer on the date table leaves them out, and time intelligence stops at the table's last day. [Microsoft's guidance on date tables](https://learn.microsoft.com/power-bi/guidance/model-date-tables#generate-with-dax) says CALENDAR's start and end can come from other DAX functions, like `MAX(Sales[OrderDate])`. An end taken from the data moves with it.

## How to fix it

Take the period from something that moves with time.

- For the current period, use `TODAY()`: `YEAR(TODAY())` for this year, as the fixed example does, or `TODAY()` itself for an as-of date.
- For the latest period in the data, which stays right when a refresh runs late, take it from the fact table: `YEAR(MAX(Sales[Order Date]))`. Inside a measure, MAX reads only the dates the visual's filters leave, so write `CALCULATE(MAX(Sales[Order Date]), REMOVEFILTERS())` when the measure needs the latest date in all the data.
- When a report reader should choose the period, add a parameter: on the Modeling tab, select New parameter, then Numeric range, and set its Minimum and Maximum to the first and last years it should offer. Power BI Desktop creates the parameter and, with it, a measure that gives the parameter's current value ([what-if parameters](https://learn.microsoft.com/power-bi/transform-model/desktop-what-if#create-a-parameter)), and your measure compares with that measure instead of a number. Parameters are [designed for measures](https://learn.microsoft.com/power-bi/transform-model/desktop-what-if#considerations-and-limitations), so this route suits a measure, not a calculated column.

A filter argument of CALCULATE written as a comparison, as in the example, [can't reference a measure or use a nested CALCULATE](https://learn.microsoft.com/dax/calculate-function-dax#boolean-filter-expressions), so put the latest year or the parameter's value in a variable first:

```
Latest Year Sales =
VAR LatestYear = YEAR ( CALCULATE ( MAX ( Sales[Order Date] ), REMOVEFILTERS () ) )
RETURN
    CALCULATE ( SUM ( Sales[Amount] ), YEAR ( Sales[Order Date] ) = LatestYear )
```

For a date table, end CALENDAR on the data rather than on a day:

```
Date = CALENDAR ( DATE ( 2020, 1, 1 ), DATE ( YEAR ( MAX ( Sales[Order Date] ) ), 12, 31 ) )
```

This ends on the last day of the latest year in Sales, so the table spans full years, as [Microsoft's guidance](https://learn.microsoft.com/power-bi/guidance/model-date-tables) asks of a date table, and grows when a refresh brings a new year. [CALENDARAUTO](https://learn.microsoft.com/dax/calendarauto-function-dax#remarks) does the same from every date in the model outside calculated columns and tables, so a birth date or a placeholder such as December 31, 9999 stretches it too. To reach the end of the current year whether or not the data gets there yet, end CALENDAR on `DATE ( YEAR ( TODAY () ), 12, 31 )` instead.

In Power BI Desktop, select a measure, calculated column, or calculated table in the Data pane and edit its DAX in the formula bar. A calculation item is edited in Model view: select Model at the top of the Data pane to open [Model explorer](https://learn.microsoft.com/power-bi/transform-model/model-explorer#find-model-explorer), then select the calculation item under its calculation group, and its DAX opens in the DAX formula bar ([calculation groups](https://learn.microsoft.com/power-bi/transform-model/calculation-groups#add-a-new-calculation-group-in-model-view)). In TMDL, edit the expression after the object's `=`, or, for a date table, the `source` of its `calculated` partition.

## When to ignore it

A fixed period is sometimes the point: a baseline year a measure compares against, a known event such as a change of data source or a day of bad data, a cohort such as customers whose first purchase was in 2023, a rule that changed in a given year, or sample data that never changes. A date table can end on purpose too, such as one that must stop at a contract's last day.

Often the better move is a name that says so. An object whose name carries its year, such as `Sales 2024` or `Growth from 19/20`, reads as deliberate to anyone who opens the model, and the rule leaves it alone.

## Quirks

- An object whose name carries one of the years it fixes, as four digits (`Sales 2024`) or as the year's last two digits with no digit beside them (`Jan-24`, `19/20`), is left out, since such an object is almost always meant to fix its year. Two digits can match by chance, as `Top 20` beside a fixed 2020 does, which hides that one object.
- A date string at a date table's end whose day and month read either way, such as `"01/02/2026"`, is quoted as written: DAX reads it by the model's culture, which pbiplint does not settle.
- A year outside 1950 to 2049 is left alone, such as `DATE(9999, 12, 31)` as an open end or `DATE(1900, 1, 1)` as a default, and so is the Unix epoch, `DATE(1970, 1, 1)`, the base of a conversion such as `DATE(1970, 1, 1) + 'Log'[UnixTime] / 86400`. A date table's end is reported whatever its year or day.
- A year compared with `<`, `<=`, `>`, or `>=` is left out, since in real models it is usually a cut-off or a cohort, and so are year-month keys such as `202306` and date strings outside a date table's end, which never went stale there. Year arithmetic such as `[Year] - 2025` and fiscal-year labels such as `"2024/25"` are left out too, since each came up in too few models to judge. A `DATE()` with a fixed year is read whatever it is compared with, though, so `'Sales'[Order Date] >= DATE(2024, 1, 1)` is reported.
- From a calculated table, the rule reads only where its CALENDAR calls end, so a year compared inside a date table's ADDCOLUMNS is not reported. The rest of a calculated table's DAX, user-defined functions, and row-level security filters are left out, since in real models they mostly hold inline data, sample generators, or deliberate cut-offs. Format string expressions are not read either, since they choose how a value is shown rather than which rows are counted, and fixed dates in Power Query (M) are left to pbiplint's Power Query rules, which are still to come. A date table end reached through a measure or written with arithmetic, such as `DATE(2026, 12, 31) + 1`, is not taken for a fixed end, and a `DATE()` inside a `CALENDAR` or `GENERATESERIES` call in a measure, a calculated column, or a calculation item is taken for a table's bound and left alone.
- A month or a quarter compared with a number, a year-end date such as `"6/30"` given to DATESYTD, and a `DATE()` given straight to FORMAT with a format that shows no year, as in `FORMAT(DATE(2000, [Month], 1), "mmmm")` for a month's name, never fire: none of them goes stale. The rule counts a format as showing the year when it has a `y` in it or is one of the named formats General Date, Long Date, Medium Date, and Short Date, so `FORMAT(DATE(2024, 12, 31), "Long Date")` is reported. A `DATE()` inside another call within FORMAT is reported whatever the format, as in `FORMAT(EOMONTH(DATE(2000, [Month], 1), 0), "mmmm")`.
- Year names are read in several languages (year, año, anio, jahr, année, anno, jaar, år, and more), whatever the model's culture.
- Desktop's own auto date/time tables are left alone, since Desktop builds them itself.

## Related rules

- `MODEL_SHOULD_HAVE_A_DATE_TABLE` reports a model with no marked date table; one built with CALENDAR counts once it is marked, and this rule checks where it ends.
- `DATE/CALENDAR_TABLES_SHOULD_BE_MARKED_AS_A_DATE_TABLE` asks that a table with date or calendar in its name be marked as a date table.
- `REMOVE_AUTO-DATE_TABLE` reports Desktop's auto date/time tables, which this rule leaves alone.
- `HARDCODED_YEAR_IN_FILTER` reports the same problem in the report: a Filters pane filter held to a fixed year.

## Links

- [CALENDAR function (DAX), whose start and end can each be any DAX expression that returns a datetime value](https://learn.microsoft.com/dax/calendar-function-dax#parameters)
- [CALENDARAUTO function (DAX), and the dates it takes its range from](https://learn.microsoft.com/dax/calendarauto-function-dax#remarks)
- [DATE function (DAX)](https://learn.microsoft.com/dax/date-function-dax)
- [TODAY function (DAX)](https://learn.microsoft.com/dax/today-function-dax)
- [CALCULATE function (DAX), on what a filter written as a comparison can reference](https://learn.microsoft.com/dax/calculate-function-dax#boolean-filter-expressions)
- [Design guidance for date tables in Power BI Desktop, including generating one with DAX](https://learn.microsoft.com/power-bi/guidance/model-date-tables#generate-with-dax)
- [Create and use parameters to visualize variables, the numeric range parameter](https://learn.microsoft.com/power-bi/transform-model/desktop-what-if#use-a-numeric-range-parameter)
- [Create calculation groups, where a calculation item's DAX is written in the DAX formula bar](https://learn.microsoft.com/power-bi/transform-model/calculation-groups#add-a-new-calculation-group-in-model-view)
- [Model relationships in Power BI Desktop, on the blank row a regular relationship adds](https://learn.microsoft.com/power-bi/transform-model/desktop-relationships-understand#regular-relationships)
