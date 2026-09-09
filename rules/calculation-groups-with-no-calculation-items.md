---
id: CALCULATION_GROUPS_WITH_NO_CALCULATION_ITEMS
name: "Calculation groups with no calculation items"
category: Maintenance
severity: warning
scope: [CalculationGroupTable]
status: ported
video:
sources:
  - https://github.com/microsoft/Analysis-Services/blob/master/BestPracticeRules/BPARules.json
---

# Calculation groups with no calculation items

## What it checks

Calculation groups that contain no calculation items.

## Why it matters

A calculation group with no items still appears in the field list as a table with one column, and dropping that column on a visual does nothing. It is usually a group that was started and abandoned, and it puzzles whoever finds it later.

## How to fix it

Add the calculation items, or delete the table. In the TMDL file a calculation group is a table with a `calculationGroup` block, and each item is a `calculationItem` inside it.

## Links

- https://github.com/microsoft/Analysis-Services/blob/master/BestPracticeRules/BPARules.json
