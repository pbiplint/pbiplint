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

DateTime columns holding values that are not at midnight. Row data is not in the model files, so pbiplint lists this rule but cannot run it.

## Why it matters

A timestamp column has nearly as many distinct values as rows, so it does not compress and it cannot relate to a date table. Split into a date and a time, each column has a few thousand distinct values, compresses well, relates to a date table and a time table, and supports the questions people actually ask, which are by day and by hour rather than by second.

## How to fix it

In Power Query, add a Date column and a Time column from the timestamp and remove the original, or round the timestamp to midnight if the time is never used. Check cardinality with DAX Studio's VertiPaq Analyzer or with DISTINCTCOUNT in DAX query view.

pbiplint cannot evaluate this rule from files; it appears in `pbiplint rules` as needing a live model.

## Links

- https://github.com/microsoft/Analysis-Services/blob/master/BestPracticeRules/BPARules.json
- https://www.sqlbi.com/articles/separate-date-and-time-in-powerpivot-and-bism-tabular/
