---
id: UNPIVOT_PIVOTED_(MONTH)_DATA
name: "Unpivot pivoted (month) data"
category: Performance
severity: warning
scope: [Table, CalculatedTable]
status: ported
video:
sources:
  - https://github.com/microsoft/Analysis-Services/blob/master/BestPracticeRules/BPARules.json
---

# Unpivot pivoted (month) data

## What it checks

Tables that have a numeric column for each of Jan, Feb, Mar, Apr, May, and Jun, matched as substrings of the column names.

Each finding names the table, as `'Budget'`, and names none of the columns that matched.

## Example

```tmdl fires
table Budget
	column Department
		dataType: string
		summarizeBy: none
		sourceColumn: Department

	column Jan
		dataType: decimal
		summarizeBy: sum
		sourceColumn: Jan

	column Feb
		dataType: decimal
		summarizeBy: sum
		sourceColumn: Feb

	column Mar
		dataType: decimal
		summarizeBy: sum
		sourceColumn: Mar

	column Apr
		dataType: decimal
		summarizeBy: sum
		sourceColumn: Apr

	column May
		dataType: decimal
		summarizeBy: sum
		sourceColumn: May

	column Jun
		dataType: decimal
		summarizeBy: sum
		sourceColumn: Jun
```

```tmdl fixed
table Budget
	column Department
		dataType: string
		summarizeBy: none
		sourceColumn: Department

	column 'Month Name'
		dataType: string
		summarizeBy: none
		sourceColumn: MonthName
		sortByColumn: 'Month Number'

	column 'Month Number'
		dataType: int64
		isHidden
		summarizeBy: none
		sourceColumn: MonthNumber

	column Amount
		dataType: decimal
		summarizeBy: sum
		sourceColumn: Amount
```

## Why it matters

A column per month is a spreadsheet layout. In a model it means a measure per month, no way to filter by date, no relationship to the date table, and a schema change every year. Unpivoted into one Month column and one Value column, the same data relates to the date table and every measure and time intelligence function works over it.

## How to fix it

Reshape the table where it is loaded. In Power BI Desktop choose Transform data, select the query, select the month columns, and use Unpivot Columns on the Transform tab, or select the columns that are not months and use Unpivot Other Columns so next year's column is picked up without an edit; then rename the Attribute and Value columns to something a report author will recognize, such as Month Name and Amount. Where the source is a warehouse, the same reshape belongs in a view there, and the refresh gets the finished shape for nothing. Back in the model, give the month column a Month Number column to sort by, which is Sort by column on the Column tools tab and `sortByColumn` in the TMDL file, and relate the month to the date table so time intelligence works over it. The rule reads the model's columns, so the finding clears as soon as the reshaped query is applied.

## When to ignore it

A coincidence is the case to check for first, though it takes six of them at once. The month names are matched as substrings of the column names, so Janitorial Cost satisfies Jan, Margin satisfies Mar, Apron Sales satisfies Apr, and Junior Rate satisfies Jun; a table of numeric metrics carrying one such name for each of the six months is reported with no month in it anywhere. Read the column names before reshaping anything. A genuinely pivoted table can also be deliberate: a small budget entry table that a person maintains by hand in a spreadsheet is easier to fill in wide, and where it is a handful of rows, unpivoting it on the way in costs nothing and unpivoting it at the source costs an argument. What is not a legitimate exception is a wide fact table of months feeding visuals through twelve near-identical measures, which is the pattern the rule exists to catch.

## Quirks

- Only the first six months are tested, so a table with July through December and nothing else is never reported, and one with January through June is reported whether or not the rest of the year is there.
- The names are matched as substrings of the upper-cased column name, so full names count and so do unrelated words: Margin matches MAR, January Budget matches JAN, and a table needs one match for each of the six months before it is reported.
- The column that matches has to be numeric, meaning int64, decimal, or double. A month column loaded as text does not count, so a table of twelve text columns passes.
- Tables and calculated tables are in scope; calculation groups are not.

## Related rules

- `MINIMIZE_POWER_QUERY_TRANSFORMATIONS` matches `Table.UnpivotOtherColumns(` and `Table.Unpivot(` in a partition's M, so doing this rule's fix in Power Query rather than in the source creates a finding there on the reshaped query.
- `MONTH_(AS_A_STRING)_MUST_BE_SORTED` reports a text column whose name contains month and that has no sort-by column, which is what an unpivot produces by default. The fixed example above gives the new column a Month Number to sort by for that reason.

## Links

- [Top 10 Power BI mistakes and their best practice solutions](https://www.elegantbi.com/post/top10bestpractices)
