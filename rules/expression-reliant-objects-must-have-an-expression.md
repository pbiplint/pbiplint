---
id: EXPRESSION_RELIANT_OBJECTS_MUST_HAVE_AN_EXPRESSION
name: "Expression-reliant objects must have an expression"
category: Error Prevention
severity: error
scope: [Measure, CalculatedColumn, CalculationItem]
status: ported
layer: model
video:
sources:
  - https://github.com/microsoft/Analysis-Services/blob/master/BestPracticeRules/BPARules.json
---

# Expression-reliant objects must have an expression

## What it checks

Measures, calculated columns, and calculation items whose expression is empty.

Each finding names the object: a measure as `[Total Margin]`, a calculated column as `'Sales'[Margin]`, and a calculation item by its own name with its calculation group beside it.

## Example

`Total Margin` in the first snippet has nothing after its `=`. That is what an empty expression looks like in a TMDL file: the declaration is followed by another declaration at the same indentation, so nothing beneath it becomes the expression.

```tmdl fires
table Sales
	column Amount
		dataType: decimal
		sourceColumn: Amount

	column Cost
		dataType: decimal
		sourceColumn: Cost

	measure 'Total Margin' =

	measure 'Total Sales' = SUM(Sales[Amount])
		formatString: #,0
```

```tmdl fixed
table Sales
	column Amount
		dataType: decimal
		sourceColumn: Amount

	column Cost
		dataType: decimal
		sourceColumn: Cost

	measure 'Total Margin' = SUM(Sales[Amount]) - SUM(Sales[Cost])

	measure 'Total Sales' = SUM(Sales[Amount])
		formatString: #,0
```

## Why it matters

Without an expression the object cannot be evaluated: a measure returns nothing, a calculated column is empty, and a calculation item does nothing. Depending on the engine version the deployment fails outright, and the error points at the object without saying why.

## How to fix it

Write the DAX, or delete the object. In Power BI Desktop, select the measure in the Data pane and type the expression in the formula bar, or right-click it and choose Delete from model; a calculated column takes the same two routes from the same pane, and a calculation item is edited in the calculation group's own view. In the TMDL file the expression is whatever follows the `=`, either on the declaration line or in the block indented beneath it, so `measure 'Total Margin' = SUM(Sales[Amount]) - SUM(Sales[Cost])` is the whole repair. Where the object is not wanted, remove its `measure`, `column`, or `calculationItem` block instead.

## When to ignore it

There is no case for keeping one. An object with no expression returns nothing wherever a report puts it, and the deployment may refuse it outright. A measure left blank as a placeholder while the work is unfinished is the closest thing to an exception, and giving it a body of `BLANK()` costs nothing and keeps the model valid in the meantime.

## Quirks

- An expression of only whitespace counts the same as no expression at all.
- The block that follows a `=` is taken whole, before any property beneath the declaration is read. A `formatString` line written directly under a declaration whose `=` has nothing after it becomes that object's expression rather than its format string, so the rule stays quiet and `PROVIDE_FORMAT_STRING_FOR_MEASURES` reports the measure instead. An expression is empty only when the declaration is followed by a line indented no further than the declaration itself.

## Related rules

- `DATA_COLUMNS_MUST_HAVE_A_SOURCE_COLUMN` makes the matching test on a data column, which takes its values from the partition query instead of an expression.
- `PROVIDE_FORMAT_STRING_FOR_MEASURES` is the rule that reports the measure when a property beneath an empty declaration is swallowed into the expression, as the quirks above describe.
- `UNNECESSARY_MEASURES` reports a hidden measure that no expression references, so deleting an empty measure that is also hidden clears both.
