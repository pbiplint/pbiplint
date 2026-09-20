---
id: MONTH_(AS_A_STRING)_MUST_BE_SORTED
name: "Month (as a string) must be sorted"
category: Formatting
severity: warning
scope: [Column, CalculatedColumn, CalculatedTableColumn]
status: ported
video:
sources:
  - https://github.com/microsoft/Analysis-Services/blob/master/BestPracticeRules/BPARules.json
---

# Month (as a string) must be sorted

## What it checks

Text columns with month in the name, but not months, that have no sort-by column.

Each finding names the column, as `'Date'[Month Name]`.

## Example

```tmdl fires
table Date
	column 'Month Name'
		dataType: string
		summarizeBy: none
		sourceColumn: Month Name

	column 'Month Number'
		dataType: int64
		isHidden
		summarizeBy: none
		sourceColumn: Month Number
```

```tmdl fixed
table Date
	column 'Month Name'
		dataType: string
		summarizeBy: none
		sortByColumn: 'Month Number'
		sourceColumn: Month Name

	column 'Month Number'
		dataType: int64
		isHidden
		summarizeBy: none
		sourceColumn: Month Number
```

## Why it matters

A text month sorts alphabetically: April, August, December. Every axis and slicer that uses the column shows that order until someone notices, and the fix has to be repeated in each visual unless it is made once on the column.

## How to fix it

Add a month number column to the table, hide it, then in Power BI Desktop select the month name column and pick the number under Sort by column in Column tools. In the TMDL file the property is `sortByColumn: 'Month Number'` under the month name column. Each month name has to map to exactly one number, so a name like January that appears in several years needs a number column at the same grain, 1 through 12, not a year-month key; Power BI rejects the sort otherwise. Where the axis runs across years, sort a Month Year column by a year-month number instead and leave the plain month name for the within-year views.

## When to ignore it

A text column the name test catches that is not a list of month names is noise: a Monthly Target note, a Month Comment, anything where alphabetical order is as good as any other. A month column whose values already sort correctly is the other case, such as one holding 2026-01 and 2026-02, where a sort-by column would only add a second column to maintain. Where the values are month names, there is no reason to leave the sort alphabetical.

## Quirks

- The name test is a substring of the upper-cased name, so Month Name is reported and so is a text column called Monthly Target.
- The exclusion is the substring MONTHS, not the word, so Months Elapsed passes and so do MonthStart and MonthSort, whose upper-cased names contain MONTHS. Written with a space, Month Start is reported.
- Only text columns are read. A month held as a whole number, or as a DateTime, is not reported here.
- Any sort-by column clears the finding. The rule checks that the property is set, not that it points at a month number.
- Hidden columns, and columns in hidden tables, are in scope.

## Related rules

- `SET_ISAVAILABLEINMDX_TO_TRUE_ON_NECESSARY_COLUMNS` reads the column this fix names. Once the month name sorts by the month number, the number is used through its attribute hierarchy, and that rule reports it if something has set its IsAvailableInMdx property to false.
- `ISAVAILABLEINMDX_FALSE_NONATTRIBUTE_COLUMNS` is the rule the sort-by takes the number column out of: a hidden column used to sort another column is no longer a candidate for setting the property to false.
- `UNNECESSARY_COLUMNS` reports a hidden month number column that nothing reads, which is what the number looks like until the month name names it in `sortByColumn`.
