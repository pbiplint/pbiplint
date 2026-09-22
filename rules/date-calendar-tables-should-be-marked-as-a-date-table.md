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

Tables with date or calendar in the name that are not marked as a date table, meaning the data category is not Time or no DateTime column is marked as the key.

Each finding names the table, as `'Date'`. Which half of the condition failed is not in the line, so check both: the table needs `dataCategory: Time` and a DateTime column with `isKey`.

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

Marking the date table tells the engine which column is the calendar key, and every time intelligence function relies on it: DATESYTD, SAMEPERIODLASTYEAR, and the rest return wrong or blank results over an unmarked table without raising any error. Marking it also lets you turn off Auto date/time, which otherwise adds a hidden date table for every date column in the model.

## How to fix it

In Power BI Desktop, select the table in the Data pane, open Table tools, choose Mark as date table, and pick the column that holds the dates. Desktop checks the column before it accepts it: the values must be unique, have no blanks, carry the same time of day throughout, and run without a gap from the first day to the last. In the TMDL file the result is `dataCategory: Time` on the table and `isKey` on that column, and both have to be present before the finding clears. Where the column fails the check, fix it where it is loaded: in Transform data, remove the time part with Date under the Transform tab, drop the duplicate rows, and fill the gaps by generating the calendar rather than deriving it from a fact table. Where the table is not a calendar at all and only the name caught it, rename it or ignore the finding on it.

## When to ignore it

The name test is a plain substring, so Updates, Candidates, and Mandates are all reported with no date in them anywhere. Those findings are noise and the rule has no way to see it. A table that holds dates without being a calendar is the more interesting case: an Event Calendar of scheduled events, or a Date Changes audit log. Marking either one would be wrong, because it is a fact table and the marking declares a calendar key. A calendar at a grain other than the day is the third case, for example a Fiscal Calendar of one row per period; Mark as date table requires one contiguous row per day, so the table cannot be marked and the finding stays for as long as the table exists. What is not a legitimate exception is the model's real day-grain calendar left unmarked because time intelligence appears to work in a quick test; it fails quietly at the edges of the range.

## Quirks

- The table name is upper-cased before the test and the match is a substring, so `Date`, `date`, and `DATE_DIM` all count, and so do Updates and Candidates.
- The data category comparison is exact and case-sensitive. A file that says `dataCategory: time` does not count as marked.
- The key has to be a DateTime column. A calendar keyed on an integer date key is reported however it is categorized.
- Calculated tables are in scope and calculation groups are not, so a calendar built with CALENDAR is checked and a calculation group called Date Intelligence is left alone.

## Related rules

- `MODEL_SHOULD_HAVE_A_DATE_TABLE` reports the model when nothing anywhere carries `dataCategory: Time` with a DateTime key. Where the table this rule names is the model's only calendar, marking it clears both, as it does in the example above.
- `MARK_PRIMARY_KEYS` skips every column on a table whose data category is Time, so marking the table takes all of its columns out of that rule, not only the date column you marked.
- `REMOVE_AUTO-DATE_TABLE` reports the calculated tables the Auto date/time option generates, whose names start with DateTableTemplate_ or LocalDateTable_. Those names contain Date, so one that carries neither `dataCategory: Time` nor a DateTime key is reported by both rules, and deleting it clears both.

## Links

- [Set and use date tables in Power BI Desktop](https://docs.microsoft.com/power-bi/transform-model/desktop-date-tables)
