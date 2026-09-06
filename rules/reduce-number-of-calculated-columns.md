---
id: REDUCE_NUMBER_OF_CALCULATED_COLUMNS
name: "Reduce number of calculated columns"
category: Performance
severity: warning
scope: [Model]
status: ported
video:
sources:
  - https://github.com/microsoft/Analysis-Services/blob/master/BestPracticeRules/BPARules.json
  - https://www.elegantbi.com/post/top10bestpractices
---

# Reduce number of calculated columns

## What it checks

Models with more than five calculated columns.

## Why it matters

Calculated columns do not compress as well as data columns so they take up more memory. They also slow down processing times for both the table as well as process recalc. Offload calculated column logic to your data warehouse and turn these calculated columns into data columns.

## How to fix it

Move calculated column logic into Power Query or the source.

## Links

- https://github.com/microsoft/Analysis-Services/blob/master/BestPracticeRules/BPARules.json
- https://www.elegantbi.com/post/top10bestpractices
