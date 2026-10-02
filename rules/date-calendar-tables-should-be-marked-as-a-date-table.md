---
id: DATE/CALENDAR_TABLES_SHOULD_BE_MARKED_AS_A_DATE_TABLE
name: "Date/calendar tables should be marked as a date table"
category: Performance
severity: warning
scope: [Table, CalculatedTable]
status: ported
layer: model
video:
sources:
  - https://github.com/microsoft/Analysis-Services/blob/master/BestPracticeRules/BPARules.json
---

# Date/calendar tables should be marked as a date table

## What it checks

Tables with date or calendar in the name that define no calendar and are not marked as a date table, meaning the data category is not Time or no DateTime column is marked as the key.

Each finding names the table, as `'Date'`. Which half of the condition failed is not in the line, so check both: the table needs `dataCategory: Time` and a DateTime column with `isKey`. Defining a calendar on the table also clears the finding.

## Example

```tmdl fires
table Date
	column Date
		dataType: dateTime
		formatString: mm/dd/yyyy
		sourceColumn: Date

	column Year
		dataType: int64
		summarizeBy: none
		sourceColumn: Year
```

```tmdl fixed
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

Marking the date table tells the engine which column is the calendar key, and classic time intelligence relies on it ([Classic time intelligence](https://learn.microsoft.com/power-bi/transform-model/desktop-time-intelligence#classic-time-intelligence)). Where the date table is related to the other tables on a column that is not a date, such as a whole-number date key like 20241231, Microsoft asks for the marking for the time intelligence functions to work: "you need to set your own date table in order use the time intelligence capabilities" ([When you must mark your date table](https://learn.microsoft.com/power-bi/transform-model/desktop-date-tables#when-you-must-mark-your-date-table)). Marking it also lets you turn off Auto date/time, which otherwise adds a hidden date table for every date column in the model.

## How to fix it

In Power BI Desktop, select the table in the Data pane, open Table tools, choose Mark as date table, and pick the column that holds the dates. Desktop checks the column before it accepts it: the values must be unique, have no blanks, carry the same time of day throughout, and run without a gap from the first day to the last. In the TMDL file the result is `dataCategory: Time` on the table and `isKey` on that column, and both have to be present before the finding clears. Where the column fails the check, fix it where it is loaded: in Transform data, remove the time part with Date under the Transform tab, drop the duplicate rows, and fill the gaps by generating the date table rather than deriving it from a fact table. Where the model uses calendar-based time intelligence, a preview in Power BI Desktop, defining a calendar on the table under Calendar options in Table tools clears the finding instead, since its functions need the marking only in the cases Microsoft lists ([When you must mark your date table](https://learn.microsoft.com/power-bi/transform-model/desktop-date-tables#when-you-must-mark-your-date-table)). Calendar options appears only once the Enhanced DAX Time Intelligence preview is turned on, under File, Options and settings, Options, Preview features ([Enable the enhanced DAX Time Intelligence preview](https://learn.microsoft.com/power-bi/transform-model/desktop-time-intelligence#enable-the-enhanced-dax-time-intelligence-preview)). Where the table is not a date table at all and only the name caught it, rename it or ignore the finding on it.

## When to ignore it

The name test is a plain substring, so Updates, Candidates, and Mandates are all reported with no date in them anywhere. Those findings are noise and the rule has no way to see it. A table that holds dates without being a date table is the more interesting case: an Event Calendar of scheduled events, or a Date Changes audit log. Marking either one would be wrong, because it is a fact table and the marking declares a calendar key. A date table at a grain other than the day is the third case, for example a Fiscal Calendar of one row per period; Mark as date table requires one contiguous row per day, so the table cannot be marked; a calendar defined on it, which needs no row for every day, clears the finding, and without one the finding stays for as long as the table exists. What is not a legitimate exception is the model's real day-grain date table left unmarked where Microsoft asks for the marking: when the model uses the classic time intelligence functions, relates the date table to other tables on a column that is not a date, or is read with advanced date filters in Excel PivotTables ([When you must mark your date table](https://learn.microsoft.com/power-bi/transform-model/desktop-date-tables#when-you-must-mark-your-date-table)).

## Quirks

- The table name is upper-cased before the test and the match is a substring, so `Date`, `date`, and `DATE_DIM` all count, and so do Updates and Candidates.
- The data category comparison is exact and case-sensitive. A file that says `dataCategory: time` does not count as marked, so a table without a calendar is still reported.
- Without a calendar, the key has to be a DateTime column, and a table keyed on an integer date key is reported however it is categorized.
- A table marked as a date table whose key column has no `dataType` line, as Power BI Desktop saves a `CALENDAR` table's `Date` column, counts as having its date key, since pbiplint does not know the column's type and a marked date table's key is meant to be a date: "you need to make sure the data type is properly set. You want to set the Data type to Date/Time or Date" ([Mark your date table as the appropriate data type](https://learn.microsoft.com/power-bi/transform-model/desktop-date-tables#mark-your-date-table-as-the-appropriate-data-type)). Tabular Editor reads the type from the column's DAX.
- Calculated tables are in scope and calculation groups are not, so a date table built with CALENDAR is checked and a calculation group called Date Intelligence is left alone.
- A table that defines a calendar is not reported, since calendar-based time intelligence works without the table being marked as a date table. The source rule does not read calendars, and Tabular Editor 3 has no version of this rule. The cases where Microsoft still asks for the marking, among them a relationship to the table on a column that is not DateTime, such as an integer date key, are not read here, so a table that defines a calendar is left out even in those cases ([When you must mark your date table](https://learn.microsoft.com/power-bi/transform-model/desktop-date-tables#when-you-must-mark-your-date-table)).
- The rule also needs every part of a table's declaration, which TMDL lets sit in more than one file (Power BI Desktop writes each table in one). While pbiplint could not open a model file or folder, or a parse issue took a line that could be a `table` line, such as a misspelt `table`, the rule reports nothing, because a part of the table in what pbiplint missed could mark the table, hold its key column, define a calendar on it, or make it a calculation group, which the rule leaves out, and pbiplint does not guess what a file it could not read says. A parse issue inside a declaration, such as a property indented with spaces, does not stop the rule. The skipped line gives the reason, `a model file could not be fully read`, and a notice names what pbiplint could not open, or the file's own `PARSE_ISSUE` finding names the line.

## Related rules

- `MODEL_SHOULD_HAVE_A_DATE_TABLE` reports the model when no table defines a calendar and none carries `dataCategory: Time` with a DateTime key. Where the table this rule names is the model's only date table, marking it, or defining a calendar on it, clears both, as marking does in the example above.
- `MARK_PRIMARY_KEYS` skips every column on a table whose data category is Time, so marking the table takes all of its columns out of that rule, not only the date column you marked.
- `REMOVE_AUTO-DATE_TABLE` reports the calculated tables the Auto date/time option generates, whose names start with DateTableTemplate_ or LocalDateTable_. Those names contain Date, so one that carries neither `dataCategory: Time` nor a DateTime key is reported by both rules, and deleting it clears both.

## Links

- [Set and use date tables in Power BI Desktop](https://docs.microsoft.com/power-bi/transform-model/desktop-date-tables)
