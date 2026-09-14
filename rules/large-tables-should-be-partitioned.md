---
id: LARGE_TABLES_SHOULD_BE_PARTITIONED
name: "Large tables should be partitioned"
category: Performance
severity: warning
scope: [Table]
status: needsLiveModel
video:
sources:
  - https://github.com/microsoft/Analysis-Services/blob/master/BestPracticeRules/BPARules.json
  - https://www.elegantbi.com/post/vertipaqintabulareditor
---

# Large tables should be partitioned

## What it checks

Tables with more than 25 million rows and a single partition. Row counts are not in the model files, so pbiplint lists this rule but cannot run it.

## Why it matters

A single partition means every refresh reloads the whole table, and a 25-million-row table reloaded nightly is the usual reason a refresh runs for hours or times out. With partitions, only the ones whose data changed are processed. In Power BI that is what incremental refresh sets up for you.

## How to fix it

Configure incremental refresh on the table in Power BI Desktop, which creates date-based partitions when the model is published. Check the row count with DAX Studio's VertiPaq Analyzer or with `EVALUATE ROW("rows", COUNTROWS(Sales))` in DAX query view.

pbiplint cannot evaluate this rule from files; it appears in `pbiplint rules` as needing a live model.

## Links

- https://github.com/microsoft/Analysis-Services/blob/master/BestPracticeRules/BPARules.json
- https://www.elegantbi.com/post/vertipaqintabulareditor
