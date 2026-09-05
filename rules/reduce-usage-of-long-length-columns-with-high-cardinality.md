---
id: REDUCE_USAGE_OF_LONG-LENGTH_COLUMNS_WITH_HIGH_CARDINALITY
name: "Reduce usage of long-length columns with high cardinality"
category: Performance
severity: warning
scope: [Column, CalculatedColumn, CalculatedTableColumn]
status: needsLiveModel
video:
sources:
  - https://github.com/microsoft/Analysis-Services/blob/master/BestPracticeRules/BPARules.json
---

# Reduce usage of long-length columns with high cardinality

## What it checks

Text columns longer than 100 characters in more than 500,000 rows. Needs VertiPaq statistics.

## Why it matters

It is best to avoid lengthy text columns. This is especially true if the column has many unique values. These types of columns can cause longer processing times, bloated model sizes, as well as slower user queries. Long length is defined as more than 100 characters.

## How to fix it

Shorten or split long text columns upstream, or remove them from the model.

pbiplint cannot evaluate this rule from files; it appears in `pbiplint rules` as needing a live model.

## Links

- https://github.com/microsoft/Analysis-Services/blob/master/BestPracticeRules/BPARules.json
