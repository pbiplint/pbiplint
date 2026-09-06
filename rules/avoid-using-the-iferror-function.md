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

Avoid using the IFERROR function as it may cause performance degradation. If you are concerned about a divide-by-zero error, use the DIVIDE function as it naturally resolves such errors as blank (or you can customize what should be shown in case of such an error).

## How to fix it

Handle the specific error case, for example with DIVIDE, instead of IFERROR.

## Links

- https://github.com/microsoft/Analysis-Services/blob/master/BestPracticeRules/BPARules.json
- https://www.elegantbi.com/post/top10bestpractices
