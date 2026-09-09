---
id: FILTER_COLUMN_VALUES
name: "Filter column values with proper syntax"
category: DAX Expressions
severity: warning
scope: [Measure, CalculatedColumn, CalculationItem]
status: ported
video:
sources:
  - https://github.com/microsoft/Analysis-Services/blob/master/BestPracticeRules/BPARules.json
  - https://docs.microsoft.com/power-bi/guidance/dax-avoid-avoid-filter-as-filter-argument
  - https://www.sqlbi.com/articles/using-keepfilters-in-dax/
---

# Filter column values with proper syntax

## What it checks

CALCULATE or CALCULATETABLE whose first filter argument is `FILTER('Table', 'Table'[Column] ...)`.

## Why it matters

FILTER over a whole table walks every row, keeps the ones that pass, and hands that row set to CALCULATE. A plain column predicate, `'Table'[Column] = "Value"`, is applied to the column's distinct values before any row is touched, which is far cheaper on a fact table and lets the storage engine do the work. The two forms also differ in meaning: FILTER over the table respects a filter already on the column, which the plain predicate replaces, so KEEPFILTERS is the exact equivalent.

## How to fix it

Replace `FILTER('Table', 'Table'[Column] = "Value")` with `KEEPFILTERS('Table'[Column] = "Value")` to keep whatever filter is already on the column, or with `'Table'[Column] = "Value"` to replace it. The SQLBI article in the links covers which one you want.

## Quirks

- The pattern accepts a space as the table name, so `FILTER('Table', [Measure] > 1)` is also flagged by this rule and by `FILTER_MEASURE_VALUES_BY_COLUMNS`.
- Only the first filter argument is checked, and only when the expression before it contains no comma. `CALCULATE(DIVIDE([A], [B]), FILTER(...))` passes.
- Table and column names must contain only letters, digits, spaces, and underscores.

## Links

- https://github.com/microsoft/Analysis-Services/blob/master/BestPracticeRules/BPARules.json
- https://docs.microsoft.com/power-bi/guidance/dax-avoid-avoid-filter-as-filter-argument
- https://www.sqlbi.com/articles/using-keepfilters-in-dax/
