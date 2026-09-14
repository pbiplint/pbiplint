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
  - https://www.elegantbi.com/post/top10bestpractices
---

# Avoid using the IFERROR function

## What it checks

Measures and calculated columns that call IFERROR.

## Why it matters

IFERROR makes the engine evaluate the expression row by row so it can catch a failure, which switches off the bulk evaluation that makes DAX fast. Most uses guard a division, and DIVIDE handles that case without the penalty. The rest usually hide a data problem, such as text in a numeric column, that is better fixed in Power Query where the failure cannot happen.

## How to fix it

Replace `IFERROR([A] / [B], 0)` with `DIVIDE([A], [B], 0)`. For type conversions, clean the column in Power Query so the conversion cannot fail. If a guard is unavoidable, test the condition with IF instead of catching the error.

## Links

- https://github.com/microsoft/Analysis-Services/blob/master/BestPracticeRules/BPARules.json
- https://www.elegantbi.com/post/top10bestpractices
