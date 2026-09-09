---
id: USE_THE_TREATAS_FUNCTION_INSTEAD_OF_INTERSECT
name: "Use the TREATAS function instead of INTERSECT for virtual relationships"
category: DAX Expressions
severity: warning
scope: [Measure, CalculationItem]
status: ported
video:
sources:
  - https://github.com/microsoft/Analysis-Services/blob/master/BestPracticeRules/BPARules.json
  - https://www.sqlbi.com/articles/propagate-filters-using-treatas-in-dax/
---

# Use the TREATAS function instead of INTERSECT for virtual relationships

## What it checks

Measures and calculation items that call INTERSECT.

## Why it matters

INTERSECT is used to push a filter from one table to another when no relationship exists: take the values on one side and intersect them with the other. TREATAS does the same job by treating the first table's values as a filter on the second table's columns, and the engine applies it as a filter, which is much cheaper than materializing both sets and intersecting them.

## How to fix it

Replace `CALCULATE([Measure], INTERSECT(VALUES(Table2[Key]), VALUES(Table1[Key])))` with `CALCULATE([Measure], TREATAS(VALUES(Table1[Key]), Table2[Key]))`. The SQLBI article in the links covers the pattern.

## Quirks

- INTERSECT used for anything other than a virtual relationship, such as set logic inside a measure, is flagged too.

## Links

- https://github.com/microsoft/Analysis-Services/blob/master/BestPracticeRules/BPARules.json
- https://www.sqlbi.com/articles/propagate-filters-using-treatas-in-dax/
