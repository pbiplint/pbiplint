---
id: DATECOLUMN_FORMATSTRING
name: "Provide format string for \"Date\" columns"
category: Formatting
severity: info
scope: [Column, CalculatedColumn, CalculatedTableColumn]
status: ported
layer: model
video:
sources:
  - https://github.com/microsoft/Analysis-Services/blob/master/BestPracticeRules/BPARules.json
---

# Provide format string for "Date" columns

## What it checks

DateTime columns with date in the name whose format string is not exactly `mm/dd/yyyy`.

Each finding names the column, as `'Date'[Date]`. The line does not say what the format string was, only that it is not the expected one, so open the column to see whether it is missing or merely different.

## Example

```tmdl fires
table Date
	column Date
		dataType: dateTime
		isKey
		summarizeBy: none
		sourceColumn: Date

	column Year
		dataType: int64
		isHidden
		summarizeBy: none
		sourceColumn: Year
```

```tmdl fixed
table Date
	column Date
		dataType: dateTime
		isKey
		formatString: mm/dd/yyyy
		summarizeBy: none
		sourceColumn: Date

	column Year
		dataType: int64
		isHidden
		summarizeBy: none
		sourceColumn: Year
```

## Why it matters

A date column with no format string is shown however the viewer's locale and the visual decide, so the same column can read 3/4/2026 in one visual and 4 March 2026 in another. A format string on the column fixes the presentation once for every report. The source ruleset picked the US short date as its convention.

## How to fix it

In Power BI Desktop, select the column in the Data pane and set Format under Column tools. In the TMDL file, add `formatString: mm/dd/yyyy` under the column. The format string changes only how the value is rendered; the stored value and the data type are untouched, so nothing downstream of the model has to change with it.

## When to ignore it

A model whose house convention is a different date order has nothing to gain here: every date column in it fires, and rewriting them all to the US short date is a worse outcome than the finding. Pick the format your readers expect, set it consistently, and treat the rule as house style you have already settled. The other case is a DateTime column that is not a date a reader ever sees, such as a hidden load timestamp caught by the name test, where a format string changes nothing on screen.

## Quirks

- The name test is a substring matched without regard to letter case, so any column containing the letters date is checked, including Update Time and Candidate Start.
- Only the exact string `mm/dd/yyyy` passes, and the comparison is case-sensitive, so a format string that differs from it only in letter case is still reported. Every other format fires too, including `dd/mm/yyyy` and `yyyy-mm-dd`.
- Hidden columns and columns in hidden tables are in scope.
- Only DateTime columns are read. A date held as text or as an integer date key is not reported here.

## Related rules

- `MONTHCOLUMN_FORMATSTRING` reads the same DateTime columns for month in the name and wants `MMMM yyyy`. A column called Month End Date is reported by both rules, and no single format string clears the two, so one of them has to be ignored on that column.
