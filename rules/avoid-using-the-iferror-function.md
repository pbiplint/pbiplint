---
id: AVOID_USING_THE_IFERROR_FUNCTION
name: "Avoid using the IFERROR function"
category: DAX Expressions
severity: warning
scope: [Measure, CalculatedColumn]
status: ported
video:
sources:
  - https://github.com/microsoft/Analysis-Services/blob/master/BestPracticeRules/BPARules.json
---

# Avoid using the IFERROR function

## What it checks

Measures and calculated columns that call IFERROR.

Each finding names the object: a measure as `[Average Price]`, a calculated column as `'Sales'[Average Price]`. The line does not say where in the expression the call is, so read the whole expression.

## Example

```tmdl fires
table Sales
	column Amount
		dataType: decimal
		sourceColumn: Amount
	column Quantity
		dataType: int64
		sourceColumn: Quantity
	measure 'Average Price' = IFERROR(SUM(Sales[Amount]) / SUM(Sales[Quantity]), 0)
		formatString: #,0.00
```

```tmdl fixed
table Sales
	column Amount
		dataType: decimal
		sourceColumn: Amount
	column Quantity
		dataType: int64
		sourceColumn: Quantity
	measure 'Average Price' = DIVIDE(SUM(Sales[Amount]), SUM(Sales[Quantity]), 0)
		formatString: #,0.00
```

## Why it matters

IFERROR makes the engine evaluate the expression row by row so it can catch a failure, which switches off the bulk evaluation that makes DAX fast. Most uses guard a division, and DIVIDE handles that case without the penalty. The rest usually hide a data problem, such as text in a numeric column, that is better fixed in Power Query where the failure cannot happen.

## How to fix it

Where IFERROR guards a division, DIVIDE does the same job with the same fallback, and its third argument is what IFERROR was returning:

```
Average Price = DIVIDE ( SUM ( Sales[Amount] ), SUM ( Sales[Quantity] ), 0 )
```

In Power BI Desktop, select the measure in the Data pane and edit it in the formula bar; a calculated column is edited the same way with the column selected. In the TMDL file, edit the expression after `measure 'Average Price' =`, or after `column Name =` for a calculated column. Where the call is guarding a type conversion rather than a division, change the column's type in Power Query so the conversion cannot fail, and drop the guard. Where a guard is genuinely needed, test the condition with IF, which leaves the engine free to evaluate in bulk.

## When to ignore it

A calculated column is materialized once per refresh and never again at query time, so the cost of the guard is paid by the refresh, not by every visual. IFERROR in a calculated column over a small table is a fair trade while the underlying data problem is being sorted out upstream. A measure is the opposite case: it runs on every query, so the guard is worth removing even when the model is small today.

## Quirks

- The test is for the text `IFERROR(`, in any letter case and with any spacing before the parenthesis, anywhere in the expression. A mention inside a string literal or a comment counts.
- Calculation items are out of scope, so an IFERROR inside a calculation item is not reported even though it costs the same.
- Only the object's own expression is read. A call inside a measure's dynamic format string is not reported.

## Related rules

- `USE_THE_DIVIDE_FUNCTION_FOR_DIVISION` fires on the `/` inside the usual `IFERROR(x / y, 0)`, and the DIVIDE rewrite clears both.

## Links

- [Michael Kovalsky's top ten modeling best practices](https://www.elegantbi.com/post/top10bestpractices)
