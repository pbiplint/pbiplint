---
id: MONTHCOLUMN_FORMATSTRING
name: "Provide format string for \"Month\" columns"
category: Formatting
severity: info
scope: [Column, CalculatedColumn, CalculatedTableColumn]
status: ported
video:
sources:
  - https://github.com/microsoft/Analysis-Services/blob/master/BestPracticeRules/BPARules.json
---

# Provide format string for "Month" columns

## What it checks

DateTime columns with month in the name whose format string is not exactly `MMMM yyyy`.

Each finding names the column, as `'Date'[Month Start]`. The line does not say what the format string was, only that it is not the expected one.

## Example

```tmdl fires
table Date
	column Date
		dataType: dateTime
		isKey
		formatString: mm/dd/yyyy
		summarizeBy: none
		sourceColumn: Date

	column 'Month Start'
		dataType: dateTime
		summarizeBy: none
		sourceColumn: Month Start
```

```tmdl fixed
table Date
	column Date
		dataType: dateTime
		isKey
		formatString: mm/dd/yyyy
		summarizeBy: none
		sourceColumn: Date

	column 'Month Start'
		dataType: dateTime
		formatString: MMMM yyyy
		summarizeBy: none
		sourceColumn: Month Start
```

## Why it matters

A DateTime column named Month usually holds the first day of each month, and with a default date format it reads as March 1, 2026 rather than March 2026. The `MMMM yyyy` format shows the month and year, and setting it on the column fixes every visual at once.

## How to fix it

In Power BI Desktop, select the column in the Data pane and set Format under Column tools. In the TMDL file, add `formatString: MMMM yyyy` under the column. The column keeps its DateTime type and its value, so it still sorts chronologically and still works in a relationship to the date table; only what a visual prints changes.

## When to ignore it

A DateTime column with month in its name that holds a full date, not a month start, is the case to leave alone: formatting Month End Date as `MMMM yyyy` throws away the day, which is the part a reader needs. House style is the other case, where a model already writes its month labels as `MMM yyyy` and changing them would leave two conventions in the same report. A hidden month column shows nothing to anyone, so its format string is not worth a change on its own.

## Quirks

- The name test is a substring matched without regard to letter case, so any DateTime column with month in its name is checked, including Month End Date and a Bimonthly Cutoff column.
- Only the exact string `MMMM yyyy` passes, and the comparison is case-sensitive, so a format string that differs from it only in letter case is still reported.
- Only DateTime columns are read. A month held as text or as a whole number is not reported here.
- Hidden columns, and columns in hidden tables, are in scope.

## Related rules

- `DATECOLUMN_FORMATSTRING` reads the same DateTime columns for date in the name and wants `mm/dd/yyyy`. A column called Month End Date is reported by both rules, and no single format string clears the two, so one of them has to be ignored on that column.
