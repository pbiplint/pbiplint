---
id: SET_ISAVAILABLEINMDX_TO_TRUE_ON_NECESSARY_COLUMNS
name: "Set IsAvailableInMdx to true on necessary columns"
category: Error Prevention
severity: error
scope: [Column, CalculatedColumn, CalculatedTableColumn]
status: ported
video:
sources:
  - https://github.com/microsoft/Analysis-Services/blob/master/BestPracticeRules/BPARules.json
---

# Set IsAvailableInMdx to true on necessary columns

## What it checks

Columns with IsAvailableInMdx set to false that are used to sort another column, appear in a hierarchy or a variation, or sort by another column.

Each finding names the column, as `'Date'[Month Number]`. What the column is needed for is not in the line, so look for the column that sorts by it, the hierarchy level that names it, or the variation that makes it a default.

## Example

```tmdl fires
table Date
	column Date
		dataType: dateTime
		isKey
		sourceColumn: Date

	column 'Month Name'
		dataType: string
		sortByColumn: 'Month Number'
		sourceColumn: MonthName

	column 'Month Number'
		dataType: int64
		isHidden
		isAvailableInMdx: false
		sourceColumn: MonthNumber
```

```tmdl fixed
table Date
	column Date
		dataType: dateTime
		isKey
		sourceColumn: Date

	column 'Month Name'
		dataType: string
		sortByColumn: 'Month Number'
		sourceColumn: MonthName

	column 'Month Number'
		dataType: int64
		isHidden
		sourceColumn: MonthNumber
```

## Why it matters

A column that sorts another column, or sits in a hierarchy, is used through its attribute hierarchy, and that is exactly what setting IsAvailableInMdx to false removes. The result is a processing error, or a hierarchy that fails in Excel and other MDX clients, usually after someone set the property to false in bulk to save memory.

## How to fix it

Power BI Desktop has no setting for this property and never writes it, so the repair is in the TMDL file: delete the `isAvailableInMdx: false` line from under the column and the property goes back to its default of true. The other way to clear the same finding is to remove the need for the attribute hierarchy: take the column out of the hierarchy in Desktop's model view, or clear Sort by column under Column tools on the column that names it, and the rule stops reporting it. Tabular Editor shows the property in its property grid, which is a quicker way to clear it across the batch of columns a single bulk edit set.

## When to ignore it

There is no case for leaving it. A column reported here is one the engine needs an attribute hierarchy for, and the memory the property saves on it is small next to a model that fails to process. What is worth working out is why the property is there at all: it is almost always one bulk edit made across every hidden column, and the columns that needed the attribute hierarchy are the ones this rule lists. Clear those and leave the rest alone, so the saving stays where it does no harm.

## Quirks

- The property is true unless the file says otherwise. TMDL only ever writes `isAvailableInMdx: false`, so this rule fires only on a property somebody set deliberately.
- Variations are matched on the default column alone. pbiplint reads a variation's `defaultColumn`, so a column a variation reaches only through its default hierarchy is not protected here.
- Both ends of a sort-by pair are covered. The column that does the sorting is reported, and so is the column that names it in `sortByColumn`, whenever the property is false on either.

## Related rules

- `ISAVAILABLEINMDX_FALSE_NONATTRIBUTE_COLUMNS` is the mirror of this rule: it reads hidden columns whose property is still true and that are used in none of these ways, and reports them as candidates for false. No column can be reported by both.
- `MONTH_(AS_A_STRING)_MUST_BE_SORTED` asks for the `sortByColumn` that brings a column into this rule's reach: the month number a month name sorts by is the column this rule then protects.
- `UNNECESSARY_COLUMNS` reads the same hidden columns and reports the ones nothing references. A column this rule lists for a sort-by or a hierarchy is not reported there; one it lists only for a variation can be, because that rule does not read variations.
