---
id: UNPIVOT_PIVOTED_(MONTH)_DATA
name: "Unpivot pivoted (month) data"
category: Performance
severity: warning
scope: [Table, CalculatedTable]
status: ported
video:
sources:
  - https://github.com/microsoft/Analysis-Services/blob/master/BestPracticeRules/BPARules.json
  - https://www.elegantbi.com/post/top10bestpractices
---

# Unpivot pivoted (month) data

## What it checks

Tables with numeric columns named after the months Jan through Jun.

## Why it matters

Avoid using pivoted data in your tables. This rule checks specifically for pivoted data by month.

## How to fix it

Unpivot the month columns into rows in Power Query.

## Links

- https://github.com/microsoft/Analysis-Services/blob/master/BestPracticeRules/BPARules.json
- https://www.elegantbi.com/post/top10bestpractices
