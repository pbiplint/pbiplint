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

Expressions of the form `1 - x / y`, `1 + x / y`, or a number plus or minus `DIVIDE(...)`.

## Why it matters

Instead of using the '1-(x/y)' or '1+(x/y)' syntax to achieve a percentage calculation, use the basic DAX functions (as shown below). Using the improved syntax will generally improve the performance. The '1+/-...' syntax always returns a value whereas the solution without the '1+/-...' does not (as the value may be 'blank'). Therefore the '1+/-...' syntax may return more rows/columns which may result in a slower query speed.

Let's clarify with an example:

Avoid this: 1 - SUM ( 'Sales'[CostAmount] ) / SUM( 'Sales'[SalesAmount] )

Better: DIVIDE ( SUM ( 'Sales'[SalesAmount] ) - SUM ( 'Sales'[CostAmount] ), SUM ( 'Sales'[SalesAmount] ) )

Best: VAR x = SUM ( 'Sales'[SalesAmount] ) RETURN DIVIDE ( x - SUM ( 'Sales'[CostAmount] ), x )

## How to fix it

Rewrite as `DIVIDE(y - x, y)` so the measure returns blank rather than a constant when there is no data.

## Links

- https://github.com/microsoft/Analysis-Services/blob/master/BestPracticeRules/BPARules.json
