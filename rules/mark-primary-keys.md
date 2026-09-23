---
id: MARK_PRIMARY_KEYS
name: "Mark primary keys"
category: Formatting
severity: info
scope: [Column, CalculatedColumn, CalculatedTableColumn]
status: ported
layer: model
video:
sources:
  - https://github.com/microsoft/Analysis-Services/blob/master/BestPracticeRules/BPARules.json
---

# Mark primary keys

## What it checks

Columns on the one side of a relationship, outside date tables, that are not marked as the table's key.

Each finding names the column, as `'Product'[Product ID]`. The relationship that puts it on the one side is not in the line, so look at the model view to see which fact table points at it.

## Example

```tmdl fires
table Sales
	column 'Product Key'
		dataType: int64
		isHidden
		summarizeBy: none
		sourceColumn: Product Key

table Product
	column 'Product ID'
		dataType: int64
		summarizeBy: none
		sourceColumn: Product ID

relationship Sales_Product
	fromColumn: Sales.'Product Key'
	toColumn: Product.'Product ID'
```

```tmdl fixed
table Sales
	column 'Product Key'
		dataType: int64
		isHidden
		summarizeBy: none
		sourceColumn: Product Key

table Product
	column 'Product ID'
		dataType: int64
		isKey
		summarizeBy: none
		sourceColumn: Product ID

relationship Sales_Product
	fromColumn: Sales.'Product Key'
	toColumn: Product.'Product ID'
```

## Why it matters

The key flag declares that the column is unique, which lets the engine and client tools treat it as the identifier of the row rather than one more attribute to aggregate, and on an import model the engine enforces the uniqueness at refresh, so a duplicate key fails loudly instead of quietly doubling a total. It also documents intent: the next person reading the model can see at a glance which column defines the grain of the dimension, without tracing every relationship to work it out. Tables marked as date tables are skipped, because marking a table as a date table already sets the key on its date column.

## How to fix it

Add `isKey` under the column in the TMDL file. Power BI Desktop has no box for the property on an ordinary table, and it keeps the value once it is in the file; the one place Desktop sets a key itself is Mark as date table, which sets it on the date column of the table you mark and takes that table out of this rule at the same time. Check that the column really is unique before you set it, because the engine takes the property at its word. Tabular Editor exposes the property in its property grid, which is a quicker way to set it across the dimensions of a large model than editing each file.

## When to ignore it

A dimension you cannot yet guarantee is unique is the case to leave alone. If the table is loaded from a feed that occasionally repeats a row, the key property turns a silent double-count into a loud failure, which is the right trade once the source is under control and the wrong one while you are still chasing it. Check the distinct count against the row count before you set the property, not after. A calendar table is the other case: mark it as a date table instead, which sets the key on its date column and takes the table out of the rule.

## Quirks

- A table is skipped only when its data category is exactly `Time`, and the comparison is case-sensitive, so a file that says `dataCategory: time` does not count as a date table here.
- A relationship that names no cardinality counts as many-to-one, which is Power BI's default, so an ordinary relationship block with only `fromColumn` and `toColumn` puts its to column in scope.
- Inactive relationships count. A column that is only ever the one side of a relationship no measure activates is still reported.
- The column is reported once however many relationships point at it.

## Related rules

- `HIDE_FOREIGN_KEYS` covers the other end of the same relationship: the column on the many side should be hidden, while this one should be marked as the key.
- `RELATIONSHIP_COLUMNS_SHOULD_BE_OF_INTEGER_DATA_TYPE` reports the same column whenever the key is not a whole number, so a text dimension key is reported by both rules.
- `DATE/CALENDAR_TABLES_SHOULD_BE_MARKED_AS_A_DATE_TABLE` asks for the marking that takes a calendar table out of this rule. Setting the data category to Time takes every column on that table out of it, not only the date column.
