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

CALCULATE or CALCULATETABLE with `FILTER('Table', [Measure] ...)` as a filter argument.

## Why it matters

Instead of using this pattern FILTER('Table',[Measure]>Value) for the filter parameters of a CALCULATE or CALCULATETABLE function, use one of the options below (if possible). Filtering on a specific column will produce a smaller table for the engine to process, thereby enabling faster performance. Using the VALUES function or the ALL function depends on the desired measure result.

Option 1: FILTER(VALUES('Table'[Column]),[Measure] > Value)

Option 2: FILTER(ALL('Table'[Column]),[Measure] > Value)

## How to fix it

Filter a column instead: `FILTER(VALUES('Table'[Column]), [Measure] > value)` or `FILTER(ALL('Table'[Column]), ...)`.

## Links

- https://github.com/microsoft/Analysis-Services/blob/master/BestPracticeRules/BPARules.json
- https://docs.microsoft.com/power-bi/guidance/dax-avoid-avoid-filter-as-filter-argument
