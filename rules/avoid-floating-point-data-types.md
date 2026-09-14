---
id: AVOID_FLOATING_POINT_DATA_TYPES
name: "Do not use floating point data types"
category: Performance
severity: warning
scope: [Column, CalculatedColumn, CalculatedTableColumn]
status: ported
video:
sources:
  - https://github.com/microsoft/Analysis-Services/blob/master/BestPracticeRules/BPARules.json
---

# Do not use floating point data types

## What it checks

Columns of any kind whose data type is Double, which Power BI Desktop calls Decimal Number.

## Why it matters

Double is binary floating point, so values like 0.1 have no exact representation and sums drift in the last digits. Two totals that should match can differ by a fraction of a cent, and a money column stored as Double compresses worse than the same values as Fixed Decimal Number, so it costs memory as well. Fixed Decimal Number stores four decimal places exactly, and Whole Number compresses best of all.

## How to fix it

In Power Query, change the column type to Fixed Decimal Number or Whole Number so the conversion happens before load. Changing it in the model view works too. In the TMDL file the property is `dataType: decimal` or `dataType: int64`. Keep Double only for values that need more than four decimal places, such as scientific measurements.

## Links

- https://github.com/microsoft/Analysis-Services/blob/master/BestPracticeRules/BPARules.json
