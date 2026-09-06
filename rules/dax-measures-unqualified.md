---
id: DAX_MEASURES_UNQUALIFIED
name: "Measure references should be unqualified"
category: DAX Expressions
severity: error
scope: [Measure, CalculatedColumn, CalculatedTable, CalculationItem]
status: ported
video:
sources:
  - https://github.com/microsoft/Analysis-Services/blob/master/BestPracticeRules/BPARules.json
  - https://www.elegantbi.com/post/top10bestpractices
---

# Measure references should be unqualified

## What it checks

Expressions that reference a measure with a table prefix.

## Why it matters

Using unqualified measure references makes it easier to distinguish between column and measure references, and also helps avoid certain errors. When referencing a measure using DAX, do not specify the table name. Use only the measure name in square brackets.

## How to fix it

Write `[Measure]` instead of `'Table'[Measure]`.

## Quirks

- KPI expressions are not checked in v1.

## Links

- https://github.com/microsoft/Analysis-Services/blob/master/BestPracticeRules/BPARules.json
- https://www.elegantbi.com/post/top10bestpractices
