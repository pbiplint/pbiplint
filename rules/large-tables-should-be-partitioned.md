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

Tables over 25 million rows with a single partition. Needs VertiPaq statistics.

## Why it matters

Large tables should be partitioned in order to optimize processing. In order for this rule to run properly, you must run the script shown here: https://www.elegantbi.com/post/vertipaqintabulareditor

## How to fix it

Add partitions (for example by year) or configure incremental refresh.

pbiplint cannot evaluate this rule from files; it appears in `pbiplint rules` as needing a live model.

## Links

- https://github.com/microsoft/Analysis-Services/blob/master/BestPracticeRules/BPARules.json
- https://www.elegantbi.com/post/vertipaqintabulareditor
