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

CALCULATE or CALCULATETABLE with `FILTER('Table', 'Table'[Column] ...)` as a filter argument.

## Why it matters

Instead of using this pattern FILTER('Table','Table'[Column]="Value") for the filter parameters of a CALCULATE or CALCULATETABLE function, use one of the options below. As far as whether to use the KEEPFILTERS function, see the second reference link below.

Option 1: KEEPFILTERS('Table'[Column]="Value")

Option 2: 'Table'[Column]="Value"

## How to fix it

Filter the column directly, `'Table'[Column] = value`, or wrap it in KEEPFILTERS.

## Quirks

- The pattern accepts a space as the table name, so `FILTER('Table', [Measure] > 1)` is also flagged by this rule (and by FILTER_MEASURE_VALUES_BY_COLUMNS).

## Links

- https://github.com/microsoft/Analysis-Services/blob/master/BestPracticeRules/BPARules.json
- https://docs.microsoft.com/power-bi/guidance/dax-avoid-avoid-filter-as-filter-argument
- https://www.sqlbi.com/articles/using-keepfilters-in-dax/
