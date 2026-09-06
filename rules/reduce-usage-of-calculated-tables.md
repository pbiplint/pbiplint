---
id: REDUCE_USAGE_OF_CALCULATED_TABLES
name: "Reduce usage of calculated tables"
category: Performance
severity: warning
scope: [CalculatedTable]
status: ported
video:
sources:
  - https://github.com/microsoft/Analysis-Services/blob/master/BestPracticeRules/BPARules.json
---

# Reduce usage of calculated tables

## What it checks

Every calculated table.

## Why it matters

Migrate calculated table logic to your data warehouse. Reliance on calculated tables will lead to technical debt and potential misalignments if you have multiple models on your platform.

## How to fix it

Build the table in the source or in Power Query so it is loaded as data.

## Links

- https://github.com/microsoft/Analysis-Services/blob/master/BestPracticeRules/BPARules.json
