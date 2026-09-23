---
id: REMOVE_REDUNDANT_COLUMNS_IN_RELATED_TABLES
name: "Remove redundant columns in related tables"
category: Performance
severity: warning
scope: [Column, CalculatedColumn, CalculatedTableColumn]
status: ported
layer: model
video:
sources:
  - https://github.com/microsoft/Analysis-Services/blob/master/BestPracticeRules/BPARules.json
---

# Remove redundant columns in related tables

## What it checks

Columns that take part in no relationship and share a name with a column on a table at the to side of a relationship from their own table.

Each finding names the column, as `'Sales'[Product Name]`, and it is always the copy on the from side that is named, never the dimension's original.

## Example

```tmdl fires
table Sales
	column 'Product ID'
		dataType: int64
		isHidden
		sourceColumn: ProductID

	column 'Product Name'
		dataType: string
		sourceColumn: ProductName

	column Amount
		dataType: decimal
		summarizeBy: sum
		sourceColumn: Amount

table Product
	column 'Product ID'
		dataType: int64
		isKey
		sourceColumn: ProductID

	column 'Product Name'
		dataType: string
		sourceColumn: ProductName

relationship Sales_Product
	fromColumn: Sales.'Product ID'
	toColumn: Product.'Product ID'
```

```tmdl fixed
table Sales
	column 'Product ID'
		dataType: int64
		isHidden
		sourceColumn: ProductID

	column Amount
		dataType: decimal
		summarizeBy: sum
		sourceColumn: Amount

table Product
	column 'Product ID'
		dataType: int64
		isKey
		sourceColumn: ProductID

	column 'Product Name'
		dataType: string
		sourceColumn: ProductName

relationship Sales_Product
	fromColumn: Sales.'Product ID'
	toColumn: Product.'Product ID'
```

## Why it matters

A fact table row that carries the product name as well as the product key stores the name once per sale instead of once per product, and offers the report author two Product Name fields that behave differently: the fact table's version cannot filter other fact tables and shows only the names that have sales. The dimension's copy is the one that should exist.

## How to fix it

Stop loading the column on the fact table. In Power BI Desktop choose Transform data, select the fact table's query, and use Choose Columns or Remove Columns so the column never reaches the model; where the query reads a view or a stored procedure, drop it from the select list there instead and the refresh gets shorter too. A duplicate that is a DAX calculated column goes instead by right-clicking it in the Data pane and choosing Delete from model, or by removing its `column Name = expression` block from the table's TMDL file. Then point the visuals that used it at the dimension's column, which filters the way a report author expects, and where a measure needs the value at row grain, reach it with RELATED inside the measure rather than storing it again. Hiding the column is not a fix here: the rule never reads a column's visibility, so a hidden copy is reported exactly as a visible one is, and it still costs the same memory.

## When to ignore it

Coincidence is the common false alarm. The test is the column's name and nothing else, so `'Sales'[Description]` and `'Product'[Description]` are reported as duplicates when one is a line note and the other a catalogue blurb. Read both columns before removing either. A copy kept on purpose is the other legitimate case: a fact table that carries a snapshot of the attribute as it was on the order date is not the dimension's current value and must not be replaced by it, and a column the source system denormalized for a composite key can be cheaper to keep than to rebuild. Check whether the two columns hold the same values for the same key, which a quick visual of both will answer, and ignore the finding where they do not. A plain copy of a slowly changing dimension's current name on a large fact table is what the rule is for.

## Quirks

- Matching is by column name only, exactly and with letter case respected, so two unrelated columns that happen to share a name fire too, and renaming the copy clears the finding without removing anything.
- The direction matters. Only a column on the from side's table is reported, so the dimension's own copy is never named, and a column on the to side that duplicates a fact table column is not reported either.
- A column that takes part in any relationship, on either side, is never reported. A foreign key whose name matches the dimension's key is therefore out of scope.
- Any column on the related table counts as the duplicate, the relationship key and hidden columns included.
- Cardinality is not tested, only the from and to sides of the relationship, so a one-to-one relationship counts the same as a many-to-one.
- All three column kinds are in scope, so a loaded column, a DAX calculated column, and a calculated table's column are read alike.

## Related rules

- `REDUCE_USAGE_OF_CALCULATED_COLUMNS_THAT_USE_THE_RELATED_FUNCTION` reports the calculated columns that create this duplication with RELATED. A column written that way and named after the dimension's column fires both, and deleting it clears both.
- `UNNECESSARY_COLUMNS` reports hidden columns that no expression, relationship, or security filter references. A hidden duplicate is reported by both, and removing it from the query clears both.
