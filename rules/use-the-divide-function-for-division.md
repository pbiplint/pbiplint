---
id: USE_THE_DIVIDE_FUNCTION_FOR_DIVISION
name: "Use the DIVIDE function for division"
category: DAX Expressions
severity: warning
scope: [Measure, CalculatedColumn, CalculationItem]
status: ported
video:
sources:
  - https://github.com/microsoft/Analysis-Services/blob/master/BestPracticeRules/BPARules.json
---

# Use the DIVIDE function for division

## What it checks

Expressions that use the division operator right after a closing bracket or parenthesis, such as `[Sales] / [Cost]` or `SUM(...) / SUM(...)`. A slash that starts a comment is ignored.

Each finding names the object that holds the expression: a measure as `[Average Price]`, a calculated column as `'Sales'[Unit Price]`, a calculation item by its name with its calculation group in the detail.

## Example

```tmdl fires
table Sales
	column Amount
		dataType: decimal
		sourceColumn: Amount
	column Quantity
		dataType: int64
		sourceColumn: Quantity
	measure 'Average Price' = SUM(Sales[Amount]) / SUM(Sales[Quantity])
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
	measure 'Average Price' = DIVIDE(SUM(Sales[Amount]), SUM(Sales[Quantity]))
		formatString: #,0.00
```

## Why it matters

Dividing by a zero or blank denominator with `/` produces an error, and an error in one cell takes down the whole visual with a generic message. DIVIDE returns blank in that case, or an alternate result you choose, so the visual shows a gap where the data has one instead of failing.

## How to fix it

Pass the numerator and the denominator as the first two arguments, and add a third where blank is the wrong answer for an empty denominator:

```
Average Price = DIVIDE ( SUM ( Sales[Amount] ), SUM ( Sales[Quantity] ) )
```

In Power BI Desktop, select the measure in the Data pane and edit it in the formula bar; a calculated column and a calculation item are edited the same way. In the TMDL file, edit the expression after `measure 'Average Price' =`, after `column Name =` for a calculated column, or after `calculationItem Name =` in the calculation group.

## When to ignore it

A denominator that cannot be zero makes the guard dead weight. Dividing by a literal, `[Total Sales] / 12` for a monthly average, is the clearest case: there is no blank to protect against, and the operator says what it means. The same goes for a denominator the source constrains to be positive, as long as you can point at the constraint rather than at the data you happen to have today. Everywhere else, check what the visual should show when the denominator is empty and put that in DIVIDE's third argument.

## Quirks

- A slash after a number or a variable name is not matched: `1 / [Sales]` and `total / count` pass. The pattern needs a closing bracket or parenthesis in front of the slash.
- Division by a constant, `[Sales] / 100`, is flagged even though it cannot fail.
- A slash that opens a comment is excluded, so `SUM(Sales[Amount]) // note` and `SUM(Sales[Amount]) /* note */ + 1` pass.
- The expression is read as raw text, so a bracket or a parenthesis before a slash inside a string literal counts.

## Related rules

- `AVOID_USING_'1-(X/Y)'_SYNTAX` fires on the same expression when the division sits under a subtraction from one, as in `1 - SUM(Sales[Cost]) / SUM(Sales[Amount])`, and rewriting it as a single DIVIDE over the difference clears both.
- `AVOID_USING_THE_IFERROR_FUNCTION` fires on the same expression when the division is wrapped in IFERROR, and DIVIDE's third argument replaces the guard, so one rewrite clears both.

## Links

- [DIVIDE function versus the divide operator](https://docs.microsoft.com/power-bi/guidance/dax-divide-function-operator)
