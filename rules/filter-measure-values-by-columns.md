---
id: FILTER_MEASURE_VALUES_BY_COLUMNS
name: "Filter measure values by columns, not tables"
category: DAX Expressions
severity: warning
scope: [Measure, CalculatedColumn, CalculationItem]
status: ported
video:
sources:
  - https://github.com/microsoft/Analysis-Services/blob/master/BestPracticeRules/BPARules.json
  - https://docs.microsoft.com/power-bi/guidance/dax-avoid-avoid-filter-as-filter-argument
---

# Filter measure values by columns, not tables

## What it checks

CALCULATE or CALCULATETABLE whose first filter argument is `FILTER('Table', [Measure] ...)`.

## Why it matters

FILTER over a whole table evaluates the measure once per row of the table. Over a fact table that is millions of measure evaluations to keep a few rows. Filtering the distinct values of one column instead evaluates the measure once per value, usually thousands of times fewer, and produces the same rows.

## How to fix it

Replace `FILTER('Table', [Measure] > 0)` with `FILTER(VALUES('Table'[Column]), [Measure] > 0)` to respect the current filter on the column, or `FILTER(ALL('Table'[Column]), [Measure] > 0)` to ignore it. Pick the column with the fewest distinct values that still gives the right answer.

## Quirks

- Only the first filter argument is checked, and only when the expression before it contains no comma.
- Table names must contain only letters, digits, spaces, and underscores.

## Links

- https://github.com/microsoft/Analysis-Services/blob/master/BestPracticeRules/BPARules.json
- https://docs.microsoft.com/power-bi/guidance/dax-avoid-avoid-filter-as-filter-argument
