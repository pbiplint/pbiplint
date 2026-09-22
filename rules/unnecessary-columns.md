---
id: UNNECESSARY_COLUMNS
name: "Remove unnecessary columns"
category: Maintenance
severity: warning
scope: [Column, CalculatedColumn, CalculatedTableColumn]
status: ported
layer: model
video:
sources:
  - https://github.com/microsoft/Analysis-Services/blob/master/BestPracticeRules/BPARules.json
---

# Remove unnecessary columns

## What it checks

Hidden columns, or columns in hidden tables, that nothing references: no DAX expression, relationship, hierarchy, sort-by column, row-level security filter, or object-level security rule.

Each finding names the column, as `'Sales'[Legacy Region Code]`.

## Example

```tmdl fires
table Sales
	column 'Order ID'
		dataType: int64
		sourceColumn: OrderID

	column Amount
		dataType: decimal
		sourceColumn: Amount

	column 'Legacy Region Code'
		dataType: string
		isHidden
		sourceColumn: LegacyRegionCode

	measure 'Total Sales' = SUM('Sales'[Amount])
		formatString: #,0
```

```tmdl fixed
table Sales
	column 'Order ID'
		dataType: int64
		sourceColumn: OrderID

	column Amount
		dataType: decimal
		sourceColumn: Amount

	measure 'Total Sales' = SUM('Sales'[Amount])
		formatString: #,0
```

## Why it matters

A hidden column that nothing uses is loaded, compressed, and refreshed for no reader. Key columns and helper columns pile up this way as a model evolves, and each one costs memory and refresh time in proportion to its cardinality. Removing them is the cheapest model diet there is.

## How to fix it

For a data column, stop loading it: in Power BI Desktop, Transform data, select the query, and use Choose Columns or Remove Columns, so the column never reaches the model. Where the query reads a view or a stored procedure, drop it from the select list there instead and the refresh gets shorter too. For a calculated column, right-click it in the Data pane and choose Delete from model, or remove its `column` block from the table's TMDL file. If the column turns out to be needed after all, clear Is hidden in the Properties pane, or remove `isHidden` from under the column in the file, and the finding goes with it.

## When to ignore it

Report usage is the case to check first. A hidden column that a visual, a slicer, or a report-level filter binds to is in use, and pbiplint reads the model, not the report, so open the reports before you delete anything. A column named as the default column of a variation is in the same position: the rule does not read variations, so it reports one that Power BI Desktop is quietly relying on. A staging column you are about to reference is a fair thing to leave for a week. A hidden key that no relationship uses is not: that one is what the rule is for.

## Quirks

- DAX references are approximated by pattern matching: references inside strings or comments count, and a bare `[Column]` reference resolves measure-first, then the expression's own table, then the first table with that column.
- Report usage is not visible to this rule. A hidden column used only by a visual, a slicer, or a report-level filter is still flagged.
- Variations are not tested, here or in the source rule, so a hidden column that a variation names as its default column is reported. `SET_ISAVAILABLEINMDX_TO_TRUE_ON_NECESSARY_COLUMNS` does read variations.
- Row-level security is matched as text, ignoring letter case, the way the source rule matches it. A bare `[Column]` in any role's filter already counts as a DAX reference (see above), so the text test only adds the qualified forms `Table[Column]` and `'Table'[Column]`.

## Related rules

- `UNNECESSARY_MEASURES` makes the same test on hidden measures that no expression references.
- `ISAVAILABLEINMDX_FALSE_NONATTRIBUTE_COLUMNS` reads the same hidden columns and reports the ones that still have IsAvailableInMdx set to true and are not used to sort, in a hierarchy, or in a variation, whether or not any expression references them. Deleting the column clears both; setting `isAvailableInMdx: false` clears only that one.
- `HIDE_FOREIGN_KEYS` asks you to hide a column on the many side of a relationship. A column in a relationship is never reported here, so taking that advice does not bring the column into this rule.
