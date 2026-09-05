---
id: SPLIT_DATE_AND_TIME
name: "Split date and time"
category: Performance
severity: warning
scope: [Column, CalculatedColumn, CalculatedTableColumn]
status: needsLiveModel
video:
sources:
  - https://github.com/microsoft/Analysis-Services/blob/master/BestPracticeRules/BPARules.json
  - https://www.sqlbi.com/articles/separate-date-and-time-in-powerpivot-and-bism-tabular/
---

# Split date and time

## What it checks

DateTime columns with values not at midnight. Needs VertiPaq statistics.

## Why it matters

This rule finds datetime columns that have values not at midnight. To maximize performance, the time element should be split from date element (or the time component should be rounded to midnight as this will reduce column cardinality).

## How to fix it

Split the column into a date column and a time column, or round it to midnight.

pbiplint cannot evaluate this rule from files; it appears in `pbiplint rules` as needing a live model.

## Links

- https://github.com/microsoft/Analysis-Services/blob/master/BestPracticeRules/BPARules.json
- https://www.sqlbi.com/articles/separate-date-and-time-in-powerpivot-and-bism-tabular/
