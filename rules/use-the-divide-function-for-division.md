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

Expressions that divide with the / operator right after a ] or ).

## Why it matters

Use the DIVIDE  function instead of using "/". The DIVIDE function resolves divide-by-zero cases. As such, it is recommended to use to avoid errors.

## How to fix it

Use `DIVIDE(numerator, denominator)` so divide-by-zero returns blank.

## Links

- https://github.com/microsoft/Analysis-Services/blob/master/BestPracticeRules/BPARules.json
- https://docs.microsoft.com/power-bi/guidance/dax-divide-function-operator
