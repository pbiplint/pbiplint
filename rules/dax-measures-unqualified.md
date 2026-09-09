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

Measures, calculated columns, calculated tables, and calculation items that refer to a measure with a table prefix, `'Table'[Measure]`.

## Why it matters

A measure belongs to the model, not to the table it sits in; the table is only its home in the field list. Writing `'Sales'[Total Sales]` makes it look like a column, which changes what the next reader expects it to do, and it breaks the moment someone moves the measure to a measure table, which is a routine tidy-up.

## How to fix it

Write `[Measure]` with no table name.

## Quirks

- Row-level security filters are not checked.
- References are found by pattern matching, so a qualified measure reference inside a string or a comment counts.

## Links

- https://github.com/microsoft/Analysis-Services/blob/master/BestPracticeRules/BPARules.json
- https://www.elegantbi.com/post/top10bestpractices
