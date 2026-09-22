---
id: DATA_COLUMNS_MUST_HAVE_A_SOURCE_COLUMN
name: "Data columns must have a source column"
category: Error Prevention
severity: error
scope: [Column]
status: ported
layer: model
video:
sources:
  - https://github.com/microsoft/Analysis-Services/blob/master/BestPracticeRules/BPARules.json
---

# Data columns must have a source column

## What it checks

Data columns with no source column. Calculated columns are not checked.

Each finding names the column, as `'Sales'[Amount]`. The partition whose query should have produced the value is not in the line, so read the table's partitions to see what the column was meant to come from.

## Example

```tmdl fires
table Sales
	column 'Order ID'
		dataType: int64
		sourceColumn: OrderID

	column Amount
		dataType: decimal

	partition Sales = m
		mode: import
		source =
				let
					Source = Sql.Database("localhost", "Sales"),
					Sales = Source{[Schema="dbo",Item="Sales"]}[Data]
				in
					Sales
```

```tmdl fixed
table Sales
	column 'Order ID'
		dataType: int64
		sourceColumn: OrderID

	column Amount
		dataType: decimal
		sourceColumn: Amount

	partition Sales = m
		mode: import
		source =
				let
					Source = Sql.Database("localhost", "Sales"),
					Sales = Source{[Schema="dbo",Item="Sales"]}[Data]
				in
					Sales
```

## Why it matters

A data column is filled from a column in the partition query, and the source column name is how the engine finds it. Without it, processing fails for the whole table, with an error that names the column but not the cause.

## How to fix it

Power BI Desktop writes `sourceColumn` whenever it adds a column to a table, so a finding here means the column was written or edited by hand, or arrived in a migration. In the TMDL file, add a `sourceColumn:` line under the column, naming the field the partition's query produces and spelling it the way the query spells it. Where the query no longer produces it, the fix runs the other way: add the column back in Power Query, under Transform data, so the next refresh delivers it, or take the column out of the model, in Desktop by right-clicking it in the Data pane and choosing Delete from model, or by removing its `column` block from the table's TMDL file.

## When to ignore it

There is none. A data column with no source column stops the whole table from loading, so the finding is a refresh failure reported before the refresh. The one thing worth checking is whether the column was meant to be a calculated column: if it was, give it a DAX expression instead, and the column leaves this rule for `EXPRESSION_RELIANT_OBJECTS_MUST_HAVE_AN_EXPRESSION`, which asks the same question of the expression.

## Quirks

- Only data columns are read. pbiplint treats a column as calculated when its declaration carries an expression, and as a calculated table column when the table's partition is a calculated one, so neither is reported here.
- Only the presence of the property is tested, never what it names. A `sourceColumn` that names a column the query does not produce passes the rule and fails the refresh.
- A `sourceColumn:` line with nothing after it counts as missing, the same as no line at all.

## Related rules

- `EXPRESSION_RELIANT_OBJECTS_MUST_HAVE_AN_EXPRESSION` makes the matching test on the objects that live on a DAX expression instead of a source column: measures, calculated columns, and calculation items.
- `UNNECESSARY_COLUMNS` reports a hidden column that nothing in the model references, which is the other reason to delete a column rather than repair it. Where the column is hidden and unused, one deletion clears both.
