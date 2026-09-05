---
id: AVOID_BI-DIRECTIONAL_RELATIONSHIPS_AGAINST_HIGH-CARDINALITY_COLUMNS
name: "Avoid bi-directional relationships against high-cardinality columns"
category: Performance
severity: warning
scope: [Column, CalculatedColumn, CalculatedTableColumn]
status: needsLiveModel
video:
sources:
  - https://github.com/microsoft/Analysis-Services/blob/master/BestPracticeRules/BPARules.json
  - https://www.elegantbi.com/post/vertipaqintabulareditor
---

# Avoid bi-directional relationships against high-cardinality columns

## What it checks

Columns in bi-directional relationships with more than 100,000 distinct values. This needs VertiPaq statistics, so pbiplint lists it but cannot run it from files.

## Why it matters

For best performance, it is recommended to avoid using bi-directional relationships against high-cardinality columns. In order to run this rule, you must first run the script shown here: https://www.elegantbi.com/post/vertipaqintabulareditor

## How to fix it

Run Best Practice Analyzer against the deployed model with VertiPaq Analyzer statistics loaded, then replace the bi-directional filter with a measure-based pattern.

pbiplint cannot evaluate this rule from files; it appears in `pbiplint rules` as needing a live model.

## Links

- https://github.com/microsoft/Analysis-Services/blob/master/BestPracticeRules/BPARules.json
- https://www.elegantbi.com/post/vertipaqintabulareditor
