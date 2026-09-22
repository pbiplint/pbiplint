---
id: USE_THE_TREATAS_FUNCTION_INSTEAD_OF_INTERSECT
name: "Use the TREATAS function instead of INTERSECT for virtual relationships"
category: DAX Expressions
severity: warning
scope: [Measure, CalculationItem]
status: ported
layer: model
video:
sources:
  - https://github.com/microsoft/Analysis-Services/blob/master/BestPracticeRules/BPARules.json
---

# Use the TREATAS function instead of INTERSECT for virtual relationships

## What it checks

Measures and calculation items that call INTERSECT.

Each finding names the object: a measure as `[Budgeted Product Sales]`, a calculation item by its name with its calculation group in the detail.

## Example

```tmdl fires
table Sales
	column 'Product ID'
		dataType: int64
		sourceColumn: ProductID
	column Amount
		dataType: decimal
		sourceColumn: Amount
	measure 'Total Sales' = SUM(Sales[Amount])
		formatString: #,0
	measure 'Budgeted Product Sales' = CALCULATE([Total Sales], INTERSECT(VALUES(Sales[Product ID]), VALUES(Budget[Product ID])))
		formatString: #,0

table Budget
	column 'Product ID'
		dataType: int64
		sourceColumn: ProductID
	column Target
		dataType: decimal
		sourceColumn: Target
```

```tmdl fixed
table Sales
	column 'Product ID'
		dataType: int64
		sourceColumn: ProductID
	column Amount
		dataType: decimal
		sourceColumn: Amount
	measure 'Total Sales' = SUM(Sales[Amount])
		formatString: #,0
	measure 'Budgeted Product Sales' = CALCULATE([Total Sales], TREATAS(VALUES(Budget[Product ID]), Sales[Product ID]))
		formatString: #,0

table Budget
	column 'Product ID'
		dataType: int64
		sourceColumn: ProductID
	column Target
		dataType: decimal
		sourceColumn: Target
```

## Why it matters

INTERSECT is used to push a filter from one table to another when no relationship exists: take the values on one side and intersect them with the other. TREATAS does the same job by treating the first table's values as a filter on the second table's columns, and the engine applies it as a filter, which is much cheaper than materializing both sets and intersecting them.

## How to fix it

Pass the values you are filtering by first and the column you are filtering second, and drop the VALUES call on the target side:

```
Budgeted Product Sales = CALCULATE ( [Total Sales], TREATAS ( VALUES ( Budget[Product ID] ), Sales[Product ID] ) )
```

The argument order is the reverse of what INTERSECT reads most naturally, so check which side is the filter before you swap the call. In Power BI Desktop, select the measure in the Data pane and edit it in the formula bar; a calculation item is edited the same way from the model view. In the TMDL file, edit the expression after `measure 'Budgeted Product Sales' =`, or after `calculationItem Name =` in the calculation group.

## When to ignore it

INTERSECT used as set logic rather than as a virtual relationship has no TREATAS equivalent. Counting the products that appear in both Sales and Budget, `COUNTROWS(INTERSECT(VALUES(Sales[Product ID]), VALUES(Budget[Product ID])))`, is asking for the overlap itself, not for a filter, and rewriting it with TREATAS would change what it answers. What to check is whether the result of the call is being counted or read, in which case leave it, or handed to CALCULATE as a filter, in which case the rule is right.

## Quirks

- The test is for the text `INTERSECT(`, in any letter case and with any spacing before the parenthesis, anywhere in the expression. A mention inside a string literal or a comment counts.
- Calculated columns are out of scope, so an INTERSECT inside a calculated column is not reported.
- Only the object's own expression is read. A call inside a measure's dynamic format string is not reported.

## Links

- [Propagate filters using TREATAS in DAX](https://www.sqlbi.com/articles/propagate-filters-using-treatas-in-dax/)
