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

Calculation groups with no calculation items.

## Why it matters

Calculation groups have no function unless they have calculation items.

## How to fix it

Add calculation items or delete the group.

## Links

- https://github.com/microsoft/Analysis-Services/blob/master/BestPracticeRules/BPARules.json
