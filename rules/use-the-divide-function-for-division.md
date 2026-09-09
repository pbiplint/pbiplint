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
  - https://docs.microsoft.com/power-bi/guidance/dax-divide-function-operator
---

# Use the DIVIDE function for division

## What it checks

Expressions that use the division operator right after a closing bracket or parenthesis, such as `[Sales] / [Cost]` or `SUM(...) / SUM(...)`. A slash that starts a comment is ignored.

## Why it matters

Dividing by a zero or blank denominator with `/` produces an error, and an error in one cell takes down the whole visual with a generic message. DIVIDE returns blank in that case, or an alternate result you choose, so the visual shows a gap where the data has one instead of failing.

## How to fix it

Write `DIVIDE([Sales], [Cost])`, with a third argument when you want something other than blank for a zero denominator.

## Quirks

- A slash after a number or a variable name is not matched: `1 / [Sales]` and `total / count` pass.
- Division by a constant, `[Sales] / 100`, is flagged even though it cannot fail.

## Links

- https://github.com/microsoft/Analysis-Services/blob/master/BestPracticeRules/BPARules.json
- https://docs.microsoft.com/power-bi/guidance/dax-divide-function-operator
