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

Columns whose data type is Double (floating point).

## Why it matters

The "Double" floating point data type should be avoided, as it can result in unpredictable roundoff errors and decreased performance in certain scenarios. Use "Int64" or "Decimal" where appropriate (but note that "Decimal" is limited to 4 digits after the decimal sign).

## How to fix it

Change the column's data type to Decimal (fixed decimal) or Int64 in Power Query or the model. Decimal keeps four decimal places.

Tabular Editor fix expression: `DataType = DataType.Decimal`

## Links

- https://github.com/microsoft/Analysis-Services/blob/master/BestPracticeRules/BPARules.json
