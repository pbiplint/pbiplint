---
id: HIDE_FOREIGN_KEYS
name: "Hide foreign keys"
category: Formatting
severity: warning
scope: [Column, CalculatedColumn, CalculatedTableColumn]
status: ported
video:
sources:
  - https://github.com/microsoft/Analysis-Services/blob/master/BestPracticeRules/BPARules.json
---

# Hide foreign keys

## What it checks

Visible columns whose name matches the from column of a relationship whose from side is many. Only the from cardinality is tested, so a many-to-many relationship counts here too, not just many-to-one.

Each finding names the column, as `'Sales'[Product Key]`.

## Example

```tmdl fires
table Sales
	column 'Product Key'
		dataType: int64
		sourceColumn: ProductKey

table Product
	column 'Product ID'
		dataType: int64
		isKey
		sourceColumn: ProductID

relationship Sales_Product
	fromColumn: Sales.'Product Key'
	toColumn: Product.'Product ID'
```

```tmdl fixed
table Sales
	column 'Product Key'
		dataType: int64
		isHidden
		sourceColumn: ProductKey

table Product
	column 'Product ID'
		dataType: int64
		isKey
		sourceColumn: ProductID

relationship Sales_Product
	fromColumn: Sales.'Product Key'
	toColumn: Product.'Product ID'
```

## Why it matters

A key column on the many side of a relationship carries no meaning for a report author: the values are surrogate integers, and grouping by the fact table's key gives one row per key value labeled with a number nobody recognizes. Leaving it visible also puts two versions of the same field in the field list, one on the fact table and one on the dimension, and only the dimension's version filters the way people expect. Hiding the key removes the wrong choice from the field list without changing anything about how the model behaves.

## How to fix it

In Power BI Desktop, open the model view, select the column, and turn on Is hidden in the Properties pane, or right-click the column in the Data pane and choose Hide in report view. In the TMDL file, add `isHidden` under the column. A hidden column still takes part in the relationship and still filters. It only leaves the field list.

## When to ignore it

A key that people search or filter by in its own right can stay visible, for example an order number that is both the key to an Orders dimension and a value a reader types into a slicer. Ignore the finding on that column and leave the rule on for the rest of the model. A bare surrogate key is never something a report author needs to see.

## Quirks

- The source rule compares from-column names only, not table plus column, so a dimension's key that shares a name with the fact table's foreign key is flagged too. pbiplint keeps this to match Tabular Editor. The example above names the two columns differently for that reason.

## Related rules

- `MARK_PRIMARY_KEYS` covers the other side of the same relationship: the column on the one side should be marked as a key.
- `RELATIONSHIP_COLUMNS_SHOULD_BE_OF_INTEGER_DATA_TYPE` fires on the same columns when they are not integers.
