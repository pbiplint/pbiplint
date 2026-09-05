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

The TREATAS function is more efficient and provides better performance than the INTERSECT function when used in virutal relationships.

## How to fix it

Use TREATAS to propagate the filter.

## Links

- https://github.com/microsoft/Analysis-Services/blob/master/BestPracticeRules/BPARules.json
- https://www.sqlbi.com/articles/propagate-filters-using-treatas-in-dax/
