---
id: ENSURE_TABLES_HAVE_RELATIONSHIPS
name: "Ensure tables have relationships"
category: Maintenance
severity: info
scope: [Table, CalculatedTable]
status: ported
video:
sources:
  - https://github.com/microsoft/Analysis-Services/blob/master/BestPracticeRules/BPARules.json
---

# Ensure tables have relationships

## What it checks

Tables with no relationship to any other table. Calculation groups are not checked.

Each finding names the table, as `'Product'`. A model with no relationships at all reports every table in it, one finding each.

## Example

```tmdl fires
table Sales
	column 'Product ID'
		dataType: int64
		sourceColumn: ProductID
	column Amount
		dataType: decimal
		sourceColumn: Amount

table Product
	column 'Product ID'
		dataType: int64
		isKey
		sourceColumn: ProductID
	column Category
		dataType: string
		sourceColumn: Category
```

```tmdl fixed
table Sales
	column 'Product ID'
		dataType: int64
		sourceColumn: ProductID
	column Amount
		dataType: decimal
		sourceColumn: Amount

table Product
	column 'Product ID'
		dataType: int64
		isKey
		sourceColumn: ProductID
	column Category
		dataType: string
		sourceColumn: Category

relationship Sales_Product
	fromColumn: Sales.'Product ID'
	toColumn: Product.'Product ID'
```

## Why it matters

A table that relates to nothing filters nothing and is filtered by nothing, so a visual that mixes its columns with another table's shows the same value repeated on every row. Sometimes that is the point: a parameter table, a measure table, or a security lookup that is read from DAX. More often it is a table that was loaded and never wired up, or a relationship that was deleted by accident.

## How to fix it

In Power BI Desktop, open Model view and drag the key column of the fact table onto the matching column of the dimension, or use Manage relationships, New, and pick the two columns. Check the cardinality and the cross filter direction that Desktop proposes before you accept them. In the TMDL file a relationship is a `relationship` block of its own, with `fromColumn` on the many side and `toColumn` on the one side, each written as `Table.Column`. If the table really does stand alone, leave it as it is.

## When to ignore it

A table that is meant to stand alone is the case to ignore: a what-if parameter table, a field parameter table, a table of slicer labels that a measure reads with SELECTEDVALUE, a list of thresholds compared against measures, or a lookup table read only by a row-level security filter. Check that the table is one of those before you ignore the finding, because the same line appears when a relationship was dropped in a merge or when a rename left the relationship pointing at a table name that no longer exists.

## Quirks

- The rule reads relationships by the table names written in them, matched exactly. A relationship that spells the table differently, in letter case or after a rename, counts for the name it carries and not for the table, so the table is still reported.
- Visibility is not read. A hidden measures table with a single hidden column is reported like any other table.
- A table with no partitions, such as one whose file was only partly written, is a table to this rule and is reported when nothing relates to it.

## Related rules

- `SNOWFLAKE_SCHEMA_ARCHITECTURE` reports a table that is on the from side of one relationship and the to side of another, so a table leaves this rule's condition with its first relationship and can enter that one's with its second.
- `RELATIONSHIP_COLUMNS_SAME_DATA_TYPE` reads the relationship you add and reports it when its two columns have different data types.
- `MARK_PRIMARY_KEYS` reports the column on the one side of the new relationship when it is not marked as the table's key.
