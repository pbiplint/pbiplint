---
id: SET_ISAVAILABLEINMDX_TO_TRUE_ON_NECESSARY_COLUMNS
name: "Set IsAvailableInMdx to true on necessary columns"
category: Error Prevention
severity: error
scope: [Column, CalculatedColumn, CalculatedTableColumn]
status: ported
video:
sources:
  - https://github.com/microsoft/Analysis-Services/blob/master/BestPracticeRules/BPARules.json
---

# Set IsAvailableInMdx to true on necessary columns

## What it checks

Columns with IsAvailableInMdx false that are used for sorting, in a hierarchy, in a variation, or that sort by another column.

## Why it matters

In order to avoid errors, ensure that attribute hierarchies are enabled if a column is used for sorting another column, used in a hierarchy, used in variations, or is sorted by another column.

## How to fix it

Set `isAvailableInMdx` back to true.

Tabular Editor fix expression: `IsAvailableInMDX = true`

## Links

- https://github.com/microsoft/Analysis-Services/blob/master/BestPracticeRules/BPARules.json
