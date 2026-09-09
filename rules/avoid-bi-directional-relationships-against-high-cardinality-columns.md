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

Columns in a bi-directional relationship that have more than 100,000 distinct values. Cardinality is not stored in the model files, so pbiplint lists this rule but cannot run it.

## Why it matters

A bi-directional relationship makes the engine propagate filters both ways on every query that touches either table. On a key with a few hundred values that is cheap. On a key with hundreds of thousands of values, the expanded filter list is built and applied on every evaluation, and the cost shows up as slow visuals that look innocent in the model view.

## How to fix it

Find the cardinality with DAX Studio's VertiPaq Analyzer, or with a query such as `EVALUATE ROW("n", DISTINCTCOUNT('Sales'[Order ID]))` in Power BI Desktop's DAX query view. Then set the relationship back to single direction and, where one report needs the reverse filter, get it from a measure with CROSSFILTER or TREATAS. If you already use Tabular Editor, the script in the links loads the same statistics into its Best Practice Analyzer, which can then run this rule directly.

pbiplint cannot evaluate this rule from files; it appears in `pbiplint rules` as needing a live model.

## Links

- https://github.com/microsoft/Analysis-Services/blob/master/BestPracticeRules/BPARules.json
- https://www.elegantbi.com/post/vertipaqintabulareditor
