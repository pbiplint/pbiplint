---
id: REMOVE_REDUNDANT_COLUMNS_IN_RELATED_TABLES
name: "Remove redundant columns in related tables"
category: Performance
severity: warning
scope: [Column, CalculatedColumn, CalculatedTableColumn]
status: ported
video:
sources:
  - https://github.com/microsoft/Analysis-Services/blob/master/BestPracticeRules/BPARules.json
---

# Remove redundant columns in related tables

## What it checks

Columns not used in any relationship whose name also exists on a table this table relates to.

## Why it matters

Removing unnecessary columns reduces model size and speeds up data loading.

## How to fix it

Remove the duplicate from the fact table and use the dimension's column.

## Links

- https://github.com/microsoft/Analysis-Services/blob/master/BestPracticeRules/BPARules.json
