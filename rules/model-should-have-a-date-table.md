---
id: MODEL_SHOULD_HAVE_A_DATE_TABLE
name: "Model should have a date table"
category: Performance
severity: warning
scope: [Model]
status: ported
video:
sources:
  - https://github.com/microsoft/Analysis-Services/blob/master/BestPracticeRules/BPARules.json
---

# Model should have a date table

## What it checks

Models with no table that has the data category Time and a DateTime column marked as the key, which is what Mark as date table sets.

Each finding names the model, as `Model`, and there is one per model however many tables hold dates.

## Example

```tmdl fires
table Sales
	column 'Order Date'
		dataType: dateTime
		formatString: mm/dd/yyyy
		sourceColumn: OrderDate

	column Amount
		dataType: decimal
		summarizeBy: sum
		sourceColumn: Amount
```

```tmdl fixed
table Sales
	column 'Order Date'
		dataType: dateTime
		formatString: mm/dd/yyyy
		sourceColumn: OrderDate

	column Amount
		dataType: decimal
		summarizeBy: sum
		sourceColumn: Amount

table Date
	dataCategory: Time

	column Date
		dataType: dateTime
		isKey
		formatString: mm/dd/yyyy
		sourceColumn: Date

	column Year
		dataType: int64
		summarizeBy: none
		sourceColumn: Year
```

## Why it matters

Every time intelligence function needs a contiguous date column to work over, and the marked date table is where it finds one. Without it, the model either leans on Auto date/time, which adds a hidden date table per date column and cannot be extended with fiscal periods or holidays, or does no time intelligence at all. A single shared date table also gives every fact table the same month, quarter, and year attributes, so visuals from different tables line up.

## How to fix it

Add a calendar with one row per day covering every date the model holds, then mark it. The first-choice route is the source: load a calendar view or table in Transform data, so the fiscal periods and holidays live where the rest of the business already agrees on them. Failing that, build one in Power Query from a list of dates, or in Power BI Desktop under Modeling, New table with DAX such as `Date = CALENDAR(DATE(2020, 1, 1), DATE(2030, 12, 31))`; New table needs a table in import storage mode, so a model whose tables are all DirectQuery has to take the calendar from the source. Then select the table, open Table tools, choose Mark as date table, and pick the date column, which writes `dataCategory: Time` on the table and `isKey` on that column in the file. Finish by relating each fact table's date column to it in the model view and turning off Auto date/time under File, Options and settings, Options, Data Load, so the hidden per-column calendars stop being built.

## When to ignore it

A model with no dates in it is the clean exception: a reference list, a product catalogue published for other models to join to, a survey result set. There is no time intelligence to do and no calendar would have anything to cover. A model that answers only current-state questions, such as a stock-on-hand report with no period comparison anywhere, is the same judgment made deliberately rather than by omission. Everything else that shows a trend, a year-to-date figure, or a comparison with last year needs the table, and the reason the rule is at warning is that the alternative, Auto date/time, works well enough in a demo to hide the problem until someone asks for a fiscal year.

## Quirks

- Both properties are needed on one table: `dataCategory: Time` and `isKey` on one of its DateTime columns. A table with only one of them does not satisfy the rule.
- The data category comparison is exact and case-sensitive, so `dataCategory: time` leaves the model reported.
- Nothing else about the table is tested. It is not checked for contiguity, for covering the model's date range, or for being related to anything, so a one-row table marked as a date table clears the finding without helping any measure.
- Any table can satisfy it, of any kind. A calculated calendar counts the same as a loaded one.

## Related rules

- `DATE/CALENDAR_TABLES_SHOULD_BE_MARKED_AS_A_DATE_TABLE` names the table to mark when a calendar is already in the model under a name containing date or calendar. Marking it clears both rules at once.
- `REMOVE_AUTO-DATE_TABLE` reports the calculated tables the Auto date/time option generates, whose names start with DateTableTemplate_ or LocalDateTable_, which is what a model without its own calendar falls back to.
- `REDUCE_USAGE_OF_CALCULATED_TABLES` lists every calculated table, so a calendar built with CALENDAR satisfies this rule and creates a finding there.
