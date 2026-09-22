---
id: FILTER_COLUMN_VALUES
name: "Filter column values with proper syntax"
category: DAX Expressions
severity: warning
scope: [Measure, CalculatedColumn, CalculationItem]
status: ported
layer: model
video:
sources:
  - https://github.com/microsoft/Analysis-Services/blob/master/BestPracticeRules/BPARules.json
---

# Filter column values with proper syntax

## What it checks

CALCULATE or CALCULATETABLE whose first filter argument is `FILTER('Table', 'Table'[Column] ...)`.

Each finding names the object that holds the expression: a measure as `[Bike Sales]`, a calculated column as `'Sales'[Bike Amount]`, a calculation item by its name with its calculation group in the detail.

## Example

```tmdl fires
table Sales
	column Amount
		dataType: decimal
		sourceColumn: Amount
	column 'Product ID'
		dataType: int64
		sourceColumn: ProductID
	measure 'Total Sales' = SUM(Sales[Amount])
		formatString: #,0
	measure 'Bike Sales' = CALCULATE([Total Sales], FILTER('Product', 'Product'[Category] = "Bikes"))
		formatString: #,0

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

```tmdl fixed
table Sales
	column Amount
		dataType: decimal
		sourceColumn: Amount
	column 'Product ID'
		dataType: int64
		sourceColumn: ProductID
	measure 'Total Sales' = SUM(Sales[Amount])
		formatString: #,0
	measure 'Bike Sales' = CALCULATE([Total Sales], KEEPFILTERS('Product'[Category] = "Bikes"))
		formatString: #,0

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

FILTER over a whole table walks every row, keeps the ones that pass, and hands that row set to CALCULATE. A plain column predicate, `'Table'[Column] = "Value"`, is applied to the column's distinct values before any row is touched, which is far cheaper on a fact table and lets the storage engine do the work. The two forms also differ in meaning: FILTER over the table respects a filter already on the column, which the plain predicate replaces, so KEEPFILTERS is the exact equivalent.

## How to fix it

Drop the FILTER and pass the predicate itself. Wrap it in KEEPFILTERS to keep whatever filter the visual already puts on the column, which is what the FILTER form was doing:

```
Bike Sales = CALCULATE ( [Total Sales], KEEPFILTERS ( 'Product'[Category] = "Bikes" ) )
```

Leave KEEPFILTERS off to replace that filter instead, which is what a bare predicate inside CALCULATE means. The SQLBI article under Links covers which one you want. In Power BI Desktop, select the measure in the Data pane and edit it in the formula bar; a calculated column and a calculation item are edited the same way. In the TMDL file, edit the expression after `measure 'Bike Sales' =`, after `column Name =` for a calculated column, or after `calculationItem Name =` in the calculation group.

## When to ignore it

A predicate that reads two columns of the same table row by row has no column equivalent: `FILTER('Sales', 'Sales'[Amount] > 'Sales'[Budget])` needs the row context that FILTER supplies, and there is nothing to rewrite. The finding is also worth less on a small dimension table, where the table has a few hundred rows and the column a few dozen distinct values, than on a fact table with millions. What to check before deciding is which table the FILTER is over, not which table the measure lives on.

## Quirks

- The pattern accepts a space as the table name, so a predicate that starts with a bracketed name, `FILTER('Product', [Total Sales] > 1000)`, is flagged by this rule as well as by `FILTER_MEASURE_VALUES_BY_COLUMNS`. The space after the comma is what makes that match, so the same predicate written as `FILTER('Product',[Total Sales] > 1000)` is reported only by the other rule.
- Only the first filter argument is checked, and only when the expression before it contains no comma. `CALCULATE(DIVIDE([A], [B]), FILTER(...))` passes, and so does a FILTER that comes after another filter argument.
- Table and column names must contain only letters, digits, spaces, and underscores. A column called `Category-Name` puts the expression out of the pattern's reach.
- CALCULATETABLE is matched by a second pattern of its own, with the same shape.
- Function names are matched in any letter case and with any spacing before the parenthesis.
- The expression is read as raw text, so a CALCULATE and FILTER shape written inside a string literal or a comment counts.

## Related rules

- `FILTER_MEASURE_VALUES_BY_COLUMNS` reads the same CALCULATE and FILTER shape for a predicate that starts with a measure reference. Because of the quirk above, an expression it reports fires here too whenever a space separates the comma from the predicate, and one rewrite clears both.

## Links

- [Avoid using FILTER as a filter argument](https://docs.microsoft.com/power-bi/guidance/dax-avoid-avoid-filter-as-filter-argument)
- [Using KEEPFILTERS in DAX](https://www.sqlbi.com/articles/using-keepfilters-in-dax/)
