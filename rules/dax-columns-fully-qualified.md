---
id: DAX_COLUMNS_FULLY_QUALIFIED
name: "Column references should be fully qualified"
category: DAX Expressions
severity: error
scope: [Measure, TablePermission, CalculationItem]
status: ported
video:
sources:
  - https://github.com/microsoft/Analysis-Services/blob/master/BestPracticeRules/BPARules.json
  - https://www.elegantbi.com/post/top10bestpractices
---

# Column references should be fully qualified

## What it checks

Measures and row-level security filters that refer to a column by its bare name, `[Column]`, instead of `'Table'[Column]`.

## Why it matters

In DAX a bare `[Name]` is the convention for a measure. A column written the same way reads as a measure to everyone who maintains the model, and the two behave differently in a row context, so the expression is misread before it is ever debugged. The bare form also breaks when the column moves to another table, or when a measure with the same name is added and the engine binds to that instead.

## How to fix it

Write `'Table'[Column]` for every column reference. The formula bar in Power BI Desktop completes the qualified form when you start typing the table name.

## Quirks

- Calculation items are in the rule's scope but never fire, because Tabular Editor does not resolve bare column references inside calculation items and pbiplint matches that.
- A bare name that matches any measure in the model is treated as a measure reference, so a column that shares its name with a measure is never flagged.
- References are found by pattern matching, so a `[Column]` inside a string or a comment counts.

## Links

- https://github.com/microsoft/Analysis-Services/blob/master/BestPracticeRules/BPARules.json
- https://www.elegantbi.com/post/top10bestpractices
