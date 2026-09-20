---
id: FILTER_MEASURE_VALUES_BY_COLUMNS
name: "Filter measure values by columns, not tables"
category: DAX Expressions
severity: warning
scope: [Measure, CalculatedColumn, CalculationItem]
status: ported
video:
sources:
  - https://github.com/microsoft/Analysis-Services/blob/master/BestPracticeRules/BPARules.json
---

# Filter measure values by columns, not tables

## What it checks

CALCULATE or CALCULATETABLE whose first filter argument is `FILTER('Table', [Measure] ...)`.

Each finding names the object that holds the expression: a measure as `[Best Seller Sales]`, a calculated column as `'Sales'[Best Seller Amount]`, a calculation item by its name with its calculation group in the detail.

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
	measure 'Best Seller Sales' = CALCULATE([Total Sales], FILTER('Product', [Total Sales] > 1000))
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
	measure 'Best Seller Sales' = CALCULATE([Total Sales], FILTER(VALUES('Product'[Product ID]), [Total Sales] > 1000))
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

FILTER over a whole table evaluates the measure once per row of the table. Over a fact table that is millions of measure evaluations to keep a few rows. Filtering the distinct values of one column instead evaluates the measure once per value, usually thousands of times fewer, and produces the same rows.

## How to fix it

Iterate the column the answer actually varies by, not the table:

```
Best Seller Sales = CALCULATE ( [Total Sales], FILTER ( VALUES ( 'Product'[Product ID] ), [Total Sales] > 1000 ) )
```

VALUES respects the filter already on the column; swap in ALL to ignore it. Pick the column with the fewest distinct values that still gives the right answer. In Power BI Desktop, select the measure in the Data pane and edit it in the formula bar; a calculated column and a calculation item are edited the same way. In the TMDL file, edit the expression after `measure 'Best Seller Sales' =`.

## When to ignore it

Where the measure's value depends on more than one column of the table, no single column's distinct values reproduce the row set, and iterating the table is the honest form. Sales per product and store is the usual shape: iterate both columns together rather than the table if you can, and leave the finding alone if you cannot. The finding is also worth less over a small dimension, where the table has a few hundred rows and the column a few dozen distinct values, than over a fact table.

## Quirks

- Only the first filter argument is checked, and only when the expression before it contains no comma. `CALCULATE(DIVIDE([A], [B]), FILTER(...))` passes, and so does a FILTER that comes after another filter argument.
- The predicate only has to start with a bracketed name, so a bare column reference, `FILTER('Product', [Category] = "Bikes")`, is reported here as well.
- Table names must contain only letters, digits, spaces, and underscores.
- CALCULATETABLE is matched by a second pattern of its own, with the same shape.
- Function names are matched in any letter case and with any spacing before the parenthesis.

## Related rules

- `FILTER_COLUMN_VALUES` reads the same CALCULATE and FILTER shape for a predicate that starts with a column reference. Its pattern accepts a space as the table name, so an expression this rule reports is reported there too whenever a space separates the comma from the predicate, which is how it is usually written. One rewrite clears both.
- `DAX_COLUMNS_FULLY_QUALIFIED` fires on the same measure when the predicate is a bare column name rather than a measure, because a bare name that resolves to a column is what that rule looks for.

## Links

- [Avoid using FILTER as a filter argument](https://docs.microsoft.com/power-bi/guidance/dax-avoid-avoid-filter-as-filter-argument)
