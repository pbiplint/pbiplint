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

Measures, table permissions, and calculation items that reference a column without its table name.

## Why it matters

Using fully qualified column references makes it easier to distinguish between column and measure references, and also helps avoid certain errors. When referencing a column in DAX, first specify the table name, then specify the column name in square brackets.

## How to fix it

Write `'Table'[Column]` instead of `[Column]`.

## Quirks

- Calculation items never fire this rule: Tabular Editor does not resolve bare column references inside calculation items, and pbiplint matches that.
- KPI expressions are not checked in v1.

## Links

- https://github.com/microsoft/Analysis-Services/blob/master/BestPracticeRules/BPARules.json
- https://www.elegantbi.com/post/top10bestpractices
