---
id: AVOID_USING_'1-(X/Y)'_SYNTAX
name: "Avoid using '1-(x/y)' syntax"
category: DAX Expressions
severity: warning
scope: [Measure, CalculatedColumn, CalculationItem]
status: ported
video:
sources:
  - https://github.com/microsoft/Analysis-Services/blob/master/BestPracticeRules/BPARules.json
---

# Avoid using '1-(x/y)' syntax

## What it checks

Expressions with a number, then plus or minus, then either `SUM('Table'[Column])` followed by a division operator, or a call to DIVIDE. The common shape is `1 - SUM(Sales[Cost]) / SUM(Sales[Amount])`.

Each finding names the object: a measure as `[Margin %]`, a calculated column as `'Sales'[Margin %]`, a calculation item by its name.

## Example

```tmdl fires
table Sales
	column Amount
		dataType: decimal
		sourceColumn: Amount
	column Cost
		dataType: decimal
		sourceColumn: Cost
	measure 'Margin %' = 1 - SUM(Sales[Cost]) / SUM(Sales[Amount])
		formatString: 0.0%
```

```tmdl fixed
table Sales
	column Amount
		dataType: decimal
		sourceColumn: Amount
	column Cost
		dataType: decimal
		sourceColumn: Cost
	measure 'Margin %' = DIVIDE(SUM(Sales[Amount]) - SUM(Sales[Cost]), SUM(Sales[Amount]))
		formatString: 0.0%
```

## Why it matters

Written that way the measure always returns a value. When there are no rows, the division is blank, one minus blank is one, and every empty cell in the matrix shows 100 percent. The visual fills with rows that should not be there, and the query does extra work to produce them. Written as a single DIVIDE over the difference, the measure is blank when the data is blank and the engine skips those rows.

## How to fix it

Rewrite `1 - x / y` as `DIVIDE(y - x, y)`, and hold the shared denominator in a variable when it is used twice:

```
Margin % =
VAR TotalAmount = SUM ( Sales[Amount] )
RETURN DIVIDE ( TotalAmount - SUM ( Sales[Cost] ), TotalAmount )
```

In Power BI Desktop, select the measure and edit it in the formula bar. In the TMDL file, edit the expression after `measure 'Margin %' =`.

## When to ignore it

There is no case where the original shape is the better one. If a visual relies on the measure showing 100 percent where there is no data, that is a display decision, and it belongs in a measure that returns the value on purpose, not in a subtraction that happens to produce it.

## Quirks

- The pattern needs SUM as the numerator, or DIVIDE right after the number. `1 - [Cost] / [Sales]` and `1 - AVERAGE(...) / ...` are not matched.
- Table and column names must contain only letters, digits, spaces, and underscores for the SUM form to match.

## Related rules

- `USE_THE_DIVIDE_FUNCTION_FOR_DIVISION` fires on the `/` in the same expression, and the rewrite clears both.
