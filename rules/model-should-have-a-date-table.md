---
id: MODEL_SHOULD_HAVE_A_DATE_TABLE
name: "Model should have a date table"
category: Performance
severity: warning
scope: [Model]
status: ported
layer: model
video:
sources:
  - https://github.com/microsoft/Analysis-Services/blob/master/BestPracticeRules/BPARules.json
---

# Model should have a date table

## What it checks

Models with no table that defines a calendar, and none that has the data category Time and a DateTime column marked as the key, which is what Mark as date table sets.

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

Classic time intelligence, where DATESYTD and the rest are given a date column, needs that column to run without a gap, and the marked date table is where it comes from ([Classic time intelligence](https://learn.microsoft.com/power-bi/transform-model/desktop-time-intelligence#classic-time-intelligence)); calendar-based time intelligence, a preview, is given a calendar defined on the date table instead. Without a date table that time intelligence can use, the model either leans on Auto date/time, which adds a hidden date table per date column and cannot be extended with fiscal periods or holidays, or does no time intelligence at all. A single shared date table also gives every fact table the same month, quarter, and year attributes, so visuals from different tables line up.

## How to fix it

Add a date table with one row per day covering every date the model holds, then mark it. The first-choice route is the source: load a date view or table in Transform data, so the fiscal periods and holidays live where the rest of the business already agrees on them. Failing that, build one in Power Query from a list of dates, or in Power BI Desktop under Modeling, New table with DAX such as `Date = CALENDAR(DATE(2020, 1, 1), DATE(2030, 12, 31))`; New table needs a table in import storage mode, so a model whose tables are all DirectQuery has to take the date table from the source. Then select the table, open Table tools, choose Mark as date table, and pick the date column, which writes `dataCategory: Time` on the table and `isKey` on that column in the file. Finish by relating each fact table's date column to it in the model view and turning off Auto date/time under File, Options and settings, Options, Data Load, so the hidden per-column date tables stop being built. Where the model uses calendar-based time intelligence, a preview in Power BI Desktop, define a calendar on the date table instead, under Calendar options in Table tools, which writes a `calendar` block under the table in its file ([Calendar-based time intelligence](https://learn.microsoft.com/power-bi/transform-model/desktop-time-intelligence#calendar-based-time-intelligence-preview)). Calendar options appears only once the Enhanced DAX Time Intelligence preview is turned on, under File, Options and settings, Options, Preview features ([Enable the enhanced DAX Time Intelligence preview](https://learn.microsoft.com/power-bi/transform-model/desktop-time-intelligence#enable-the-enhanced-dax-time-intelligence-preview)).

## When to ignore it

A model with no dates in it is the clean exception: a reference list, a product catalogue published for other models to join to, a survey result set. There is no time intelligence to do and no date table would have anything to cover. A model that answers only current-state questions, such as a stock-on-hand report with no period comparison anywhere, is the same judgment made deliberately rather than by omission. Everything else that shows a trend, a year-to-date figure, or a comparison with last year needs the table, and the reason the rule is at warning is that the alternative, Auto date/time, works well enough in a demo to hide the problem until someone asks for a fiscal year.

## Quirks

- A table that defines a calendar satisfies the rule, as it satisfies Tabular Editor 3's built-in version, since calendar-based time intelligence works without a table marked as a date table. The source rule does not read calendars, so Tabular Editor reports a model whose only calendar table is not marked. Microsoft: "You don't need to identify your own date table with the Mark as Date table option if you use the recommended Calendar-based time intelligence in Power BI unless in specific circumstances" ([Set and use date tables in Power BI Desktop](https://learn.microsoft.com/power-bi/transform-model/desktop-date-tables)). Those circumstances are not read here, so a calendar satisfies the rule even where Microsoft still asks for the marking ([When you must mark your date table](https://learn.microsoft.com/power-bi/transform-model/desktop-date-tables#when-you-must-mark-your-date-table)).
- Without a calendar, both properties are needed on one table: `dataCategory: Time` and `isKey` on one of its DateTime columns. A table with only one of them does not satisfy the rule.
- The data category comparison is exact and case-sensitive, so `dataCategory: time` leaves the model reported.
- Nothing else about the table is tested. It is not checked for contiguity, for covering the model's date range, or for being related to anything, so a one-row table marked as a date table clears the finding without helping any measure.
- Any table can satisfy it, of any kind. A calculated date table counts the same as a loaded one.
- While a model file has a parse issue that can take a declaration out of the model, such as a line indented with spaces, or pbiplint could not open a model file or folder at all, the rule reports nothing, because the date table could be in what pbiplint missed, and pbiplint does not guess what a file it could not read says. The skipped line gives the reason, `a model file could not be fully read`, and the file's own `PARSE_ISSUE` finding names it, or a notice does for a file or folder pbiplint could not open.

## Related rules

- `DATE/CALENDAR_TABLES_SHOULD_BE_MARKED_AS_A_DATE_TABLE` names the table to mark when a date table is already in the model under a name containing date or calendar. Marking it, or defining a calendar on it, clears both rules at once.
- `REMOVE_AUTO-DATE_TABLE` reports the calculated tables the Auto date/time option generates, whose names start with DateTableTemplate_ or LocalDateTable_, which is what a model without its own date table falls back to.
- `REDUCE_USAGE_OF_CALCULATED_TABLES` lists every calculated table, so a date table built with CALENDAR satisfies this rule once it is marked or defines a calendar, and creates a finding there.
