---
id: ISAVAILABLEINMDX_FALSE_NONATTRIBUTE_COLUMNS
name: "Set IsAvailableInMdx to false on non-attribute columns"
category: Performance
severity: warning
scope: [Column, CalculatedColumn, CalculatedTableColumn]
status: ported
layer: model
video:
sources:
  - https://github.com/microsoft/Analysis-Services/blob/master/BestPracticeRules/BPARules.json
---

# Set IsAvailableInMdx to false on non-attribute columns

## What it checks

Hidden columns, or columns in hidden tables, that still have IsAvailableInMdx set to true and are not used to sort another column, in a hierarchy, or in a variation, and do not themselves sort by another column.

Each finding names the column, as `'Sales'[Product Key]`.

## Example

```tmdl fires
table Sales
	column 'Order ID'
		dataType: int64
		summarizeBy: none
		sourceColumn: OrderID

	column 'Product Key'
		dataType: int64
		isHidden
		summarizeBy: none
		sourceColumn: ProductKey
```

```tmdl fixed
table Sales
	column 'Order ID'
		dataType: int64
		summarizeBy: none
		sourceColumn: OrderID

	column 'Product Key'
		dataType: int64
		isHidden
		isAvailableInMdx: false
		summarizeBy: none
		sourceColumn: ProductKey
```

## Why it matters

When IsAvailableInMdx is true the engine builds an attribute hierarchy for the column at every refresh: a sorted structure that lets Excel and other MDX clients browse the column's values. A hidden column is never browsed, so the structure is built, stored, and rebuilt for nothing. On wide tables with many hidden keys and helper columns that is measurable refresh time and memory.

## How to fix it

Add `isAvailableInMdx: false` under the column in its table's TMDL file. Power BI Desktop has no setting for the property and never writes it, but it keeps the value once it is in the file, and it keeps it the same way on an import table and a DirectQuery one. The other way to clear a finding is to decide the column should not be hidden after all: clear Is hidden in the Properties pane, or remove `isHidden` from under the column, and the rule stops reading it, as long as its table is visible too. Where a table has dozens of hidden keys, Tabular Editor's property grid sets the property on every selected column in one edit, which is quicker than the same change repeated down a file.

## When to ignore it

Size is the first judgment. The saving is roughly proportional to the column's distinct count, so a hidden flag with two values is not worth an edit and a hidden key with a million is. Work down the list by cardinality and stop where the numbers get small. A variation is the one case where acting on the finding can break something: pbiplint reads a variation's default column only, so a hidden column a variation reaches through its default hierarchy is reported here, and setting the property to false on it takes away the attribute hierarchy the variation needs. Check the date table's hidden columns against its variations before you touch them. A column you are about to unhide is a fair thing to leave, since unhiding it clears the finding anyway, as long as its table is visible.

## Quirks

- A column with no `isAvailableInMdx` line counts as true, because that is the default pbiplint applies wherever the property is absent. Power BI Desktop never writes the property, so a Desktop-authored model gets a finding for every hidden column the rest of the condition does not excuse, until they are set by hand.
- Visibility is the column's own `isHidden` or its table's. A visible column in a hidden table is reported.
- Both ends of a sort-by pair are out of scope: the column another column sorts by, and the column that names one in `sortByColumn`.
- Variations are matched on the default column alone, so a column a variation reaches only through its default hierarchy is not protected here.
- Relationships are not read. A hidden foreign key, which is exactly what `HIDE_FOREIGN_KEYS` asks you to create, is reported here.

## Related rules

- `SET_ISAVAILABLEINMDX_TO_TRUE_ON_NECESSARY_COLUMNS` is the mirror of this rule: it reads the columns whose property is already false and reports the ones used to sort another column, in a hierarchy or a variation, or sorting by another column. No column can be reported by both.
- `UNNECESSARY_COLUMNS` reads the same hidden columns and reports the ones no expression, relationship, or security filter references. Deleting the column clears both; setting `isAvailableInMdx: false` clears only this one.
- `HIDE_FOREIGN_KEYS` asks you to hide a column on the many side of a relationship, and a hidden column with nothing sorting by it lands here, so taking that advice creates a finding on this rule.

## Links

- [What the IsAvailableInMdx property does in a Tabular model](https://blog.crossjoin.co.uk/2018/07/02/isavailableinmdx-ssas-tabular/)
