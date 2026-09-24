---
id: AVOID_FLOATING_POINT_DATA_TYPES
name: "Do not use floating point data types"
category: Performance
severity: warning
scope: [Column, CalculatedColumn, CalculatedTableColumn]
status: ported
layer: model
video:
sources:
  - https://github.com/microsoft/Analysis-Services/blob/master/BestPracticeRules/BPARules.json
---

# Do not use floating point data types

## What it checks

Columns of any kind whose data type is Double, which Power BI Desktop calls Decimal Number.

Each finding names the column, as `'Sales'[Amount]`.

## Example

```tmdl fires
table Sales
	column 'Order ID'
		dataType: int64
		sourceColumn: OrderID

	column Amount
		dataType: double
		summarizeBy: sum
		sourceColumn: Amount
```

```tmdl fixed
table Sales
	column 'Order ID'
		dataType: int64
		sourceColumn: OrderID

	column Amount
		dataType: decimal
		summarizeBy: sum
		sourceColumn: Amount
```

## Why it matters

Double is binary floating point, so values like 0.1 have no exact representation and sums drift in the last digits. Two totals that should match can differ by a fraction of a cent, and a money column stored as Double compresses worse than the same values as Fixed Decimal Number, so it costs memory as well. Fixed Decimal Number stores four decimal places exactly, and Whole Number compresses best of all.

## How to fix it

Change the type where the data is loaded. In Power BI Desktop, choose Transform data, select the column, and pick Fixed decimal number or Whole number from Data Type on the Transform tab; on an import table that converts the values before they reach the model, and on a DirectQuery table the step folds into the query the source runs. You can also set the type in Table view or Report view: select the column, then pick the type from Data type on the Column tools tab. In the TMDL file the property is `dataType: decimal` for Fixed Decimal Number and `dataType: int64` for Whole Number. For a calculated column the type follows the expression, so convert it there: `Unit Price = CURRENCY(DIVIDE('Sales'[Amount], 'Sales'[Quantity]))` returns a fixed decimal whatever the division produced on its own. Best of all, fix the type in the view or the table the query reads, so every model that loads the column starts right.

## When to ignore it

A value that genuinely needs more than four decimal places has to stay Double, and the rule has no way to know which those are. Latitude and longitude are the everyday case: four decimal places is about eleven metres, which is fine for a country map and wrong for a site plan, so a geography column is usually left alone. Scientific readings, unit conversion factors, and exchange rates quoted to six places are the same. Values above the Fixed Decimal Number range are the other case, since it tops out at about 922 trillion. Money is never the exception: if the column holds an amount someone will add up and reconcile, the rounding errors the rule warns about are exactly the ones that end up in a support ticket.

## Quirks

- The type name is compared in lower case, so `dataType: Double` and `dataType: double` are both reported.
- Every kind of column is in scope, including calculated columns and the columns of a calculated table, whose type comes from the expression rather than from a load step.
- Only the declared type is read. A column whose values happen to be whole numbers is reported all the same while the type says Double.

## Related rules

- `RELATIONSHIP_COLUMNS_SHOULD_BE_OF_INTEGER_DATA_TYPE` reports the same column when it is also on either side of a relationship, so a Double key fires both. Changing it to `int64` clears both; changing it to `decimal` clears only this one.
- `NUMERIC_COLUMN_SUMMARIZE_BY` counts Double among its numeric types, so a visible Double column is reported there too until its summarize-by is set to none.
- `ADD_DATA_CATEGORY_FOR_COLUMNS` accepts either Double or Decimal on a column named Latitude or Longitude, so setting the data category it asks for does not take the column out of this rule, and the two findings sit on the same column.
