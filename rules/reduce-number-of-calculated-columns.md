---
id: REDUCE_NUMBER_OF_CALCULATED_COLUMNS
name: "Reduce number of calculated columns"
category: Performance
severity: warning
scope: [Model]
status: ported
video:
sources:
  - https://github.com/microsoft/Analysis-Services/blob/master/BestPracticeRules/BPARules.json
---

# Reduce number of calculated columns

## What it checks

Models with more than five calculated columns across all tables. Columns of calculated tables do not count, and the finding is on the model.

Each finding names the model, as `Model`, and names no column, so the count is the whole message.

## Example

```tmdl fires
table Sales
	column 'Order Date'
		dataType: dateTime
		formatString: mm/dd/yyyy
		sourceColumn: OrderDate

	column Quantity
		dataType: int64
		summarizeBy: sum
		sourceColumn: Quantity

	column 'Unit Price'
		dataType: decimal
		summarizeBy: sum
		sourceColumn: UnitPrice

	column 'Line Total' = 'Sales'[Quantity] * 'Sales'[Unit Price]
		dataType: decimal

	column 'Line Total Rounded' = ROUND('Sales'[Line Total], 0)
		dataType: decimal

	column 'Order Year' = YEAR('Sales'[Order Date])
		dataType: int64

	column 'Order Week' = WEEKNUM('Sales'[Order Date])
		dataType: int64

	column 'Order Month Name' = FORMAT('Sales'[Order Date], "MMMM")
		dataType: string

	column 'Quantity Band' = IF('Sales'[Quantity] > 10, "Bulk", "Single")
		dataType: string

	partition Sales = m
		mode: import
		source = let Source = Sql.Database("finance", "Warehouse"), Sales = Source{[Item = "Sales"]}[Data] in Sales
```

```tmdl fixed
table Sales
	column 'Order Date'
		dataType: dateTime
		formatString: mm/dd/yyyy
		sourceColumn: OrderDate

	column Quantity
		dataType: int64
		summarizeBy: sum
		sourceColumn: Quantity

	column 'Unit Price'
		dataType: decimal
		summarizeBy: sum
		sourceColumn: UnitPrice

	column 'Line Total'
		dataType: decimal
		summarizeBy: sum
		sourceColumn: LineTotal

	column 'Line Total Rounded'
		dataType: decimal
		summarizeBy: sum
		sourceColumn: LineTotalRounded

	column 'Order Year'
		dataType: int64
		summarizeBy: none
		sourceColumn: OrderYear

	column 'Order Week'
		dataType: int64
		summarizeBy: none
		sourceColumn: OrderWeek

	column 'Order Month Name'
		dataType: string
		summarizeBy: none
		sourceColumn: OrderMonthName

	column 'Quantity Band'
		dataType: string
		summarizeBy: none
		sourceColumn: QuantityBand

	partition Sales = m
		mode: import
		source = let Source = Sql.Database("finance", "Warehouse"), Sales = Source{[Item = "vwSalesEnriched"]}[Data] in Sales
```

## Why it matters

A calculated column is computed after load, one row at a time, and stored without the compression the engine gets for a column it loaded from the source, so each one costs refresh time and memory out of proportion to its size. Five is a budget rather than a limit: past it, the model is usually doing in DAX what Power Query or the source would do once and better.

## How to fix it

Move the work upstream. In Power BI Desktop choose Transform data, select the query, and use Add Column, Custom Column, or one of the ready-made transforms such as Extract or Round, then delete the DAX column: right-click it in the Data pane and choose Delete from model, or remove its `column Name = expression` block from the table's TMDL file. Better still, add the expression to the view the query reads, where it computes once for every model that reads the view and folds into the refresh rather than running after it. Date parts are the common case and have a third home: year, month, and week belong on the date table, related to the fact table, rather than repeated on every fact row. Keep DAX calculated columns for the few cases that need the model, such as a value that depends on a measure or on a relationship.

## When to ignore it

Five is somebody's round number, not a law, and a model can be perfectly healthy at eight. The judgment is what the columns cost, which the rule cannot see: six columns on a two-thousand-row dimension are free, and one on a hundred-million-row fact table is the thing to look at first. A column that genuinely needs the model is the other legitimate case: a value derived from a measure, or a flag that depends on a relationship, cannot be computed in Power Query at all, because the model does not exist yet when the query runs. Count how many of the columns are on large tables before deciding, and ignore the finding once the answer is none.

## Quirks

- The threshold is strictly more than five, counted across every table in the model at once. Five columns is silent and the sixth reports the whole model.
- A column counts as calculated when it carries a DAX expression of its own. The columns a calculated table produces carry none, so a model built from calculated tables can hold hundreds of columns without being reported here, although each of those tables is reported by `REDUCE_USAGE_OF_CALCULATED_TABLES`.
- Nothing about the columns is weighed: not the table's size, not the column's cardinality, and not whether the expression is cheap. Six trivial flags on a lookup table read exactly as six expensive strings on a fact table.
- The finding names the model and no column, so it cannot be ignored per column. In the files the columns are the lines that read `column Name = `; in Power BI Desktop they carry the calculated-column icon in the Data pane.

## Related rules

- `REDUCE_USAGE_OF_CALCULATED_COLUMNS_THAT_USE_THE_RELATED_FUNCTION` names the individual calculated columns that copy a value across a relationship, which are counted here as well. It is the rule that points at a column when this one can only point at the model.
- `UNNECESSARY_COLUMNS` reports hidden columns that nothing references, calculated ones included, and deleting one of those lowers the count this rule makes.
- `REDUCE_USAGE_OF_CALCULATED_TABLES` is the same argument about tables, and its findings are the ones whose columns this rule does not count.

## Links

- [Top 10 Power BI mistakes and their best practice solutions](https://www.elegantbi.com/post/top10bestpractices)
