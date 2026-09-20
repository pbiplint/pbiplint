---
id: FORMAT_FLAG_COLUMNS_AS_YES/NO_VALUE_STRINGS
name: "Format flag columns as Yes/No value strings"
category: Formatting
severity: info
scope: [Column, CalculatedColumn, CalculatedTableColumn]
status: ported
video:
sources:
  - https://github.com/microsoft/Analysis-Services/blob/master/BestPracticeRules/BPARules.json
---

# Format flag columns as Yes/No value strings

## What it checks

Visible columns whose name starts with Is and whose type is whole number, and visible columns whose name ends with the word Flag after a space and whose type is not text.

Each finding names the column, as `'Sales'[IsReturned]`. The line does not say which half of the test matched, so read the name: a column that starts with Is matched on its type being a whole number, and one that ends with Flag matched on its type not being text.

## Example

```tmdl fires
table Sales
	column IsReturned
		dataType: int64
		summarizeBy: none
		sourceColumn: IsReturned

	column 'Priority Flag'
		dataType: int64
		summarizeBy: none
		sourceColumn: Priority Flag
```

```tmdl fixed
table Sales
	column IsReturned
		dataType: string
		summarizeBy: none
		sourceColumn: IsReturned

	column 'Priority Flag'
		dataType: string
		summarizeBy: none
		sourceColumn: Priority Flag
```

## Why it matters

A 0 or 1 in a slicer, a legend, or a table column tells the reader nothing without a lookup, and a whole-number flag is summed by default, so a card labeled Is Active shows a count of true rows that looks like something else. Yes and No read correctly everywhere and cannot be aggregated by accident.

## How to fix it

The values have to change, not just the type, so the fix lives upstream of the model. In Power BI Desktop, choose Transform data, select the query, and either add a conditional column that returns Yes or No or use Replace Values on the column itself, then set the column's type to Text in Power Query. Where the query reads a view or a stored procedure, do the same in the select list and the model gets the text column already formed. The Data type box under Column tools changes the type in place on an import model but leaves the values as 0 and 1, so it is not the fix on its own. If a measure counts the flag, keep the numeric column and hide it, which also takes it out of this rule's reach.

## When to ignore it

A column whose type is already boolean is the common false alarm: Power BI shows it as True and False, which reads as well as Yes and No, and the rule reports it only because it tests for text. The name tests catch words that are not flags at all, so a whole-number Issue Count or Isotope Number is noise on the Is side. The case worth acting on is the one the rule was written for: a visible 0 and 1 column that a report author has to decode.

## Quirks

- Both name tests are case-sensitive. The prefix is the two characters Is, so a whole-number column called Island or Issue Count is reported, and one called isActive is not.
- The suffix is a space followed by Flag, so Priority Flag is reported and PriorityFlag is not.
- Hidden columns, and columns in hidden tables, are skipped by both halves.
- The Is half needs the type to be exactly whole number, so a decimal IsActive is not reported. The Flag half fires on every type that is not text, boolean and DateTime included.

## Related rules

- `NUMERIC_COLUMN_SUMMARIZE_BY` reports the same visible whole-number column whenever its summarization is not none, which is the aggregation this page warns about. Converting the column to text clears both findings at once, because that rule reads only numeric columns.
