---
id: AVOID_BI-DIRECTIONAL_RELATIONSHIPS_AGAINST_HIGH-CARDINALITY_COLUMNS
name: "Avoid bi-directional relationships against high-cardinality columns"
category: Performance
severity: warning
scope: [Column, CalculatedColumn, CalculatedTableColumn]
status: needsLiveModel
layer: model
video:
sources:
  - https://github.com/microsoft/Analysis-Services/blob/master/BestPracticeRules/BPARules.json
---

# Avoid bi-directional relationships against high-cardinality columns

## What it checks

Columns in a bi-directional relationship that have more than 100,000 distinct values. Cardinality is a statistic of the loaded data, not of the model files, so pbiplint lists this rule but does not run it: it needs column statistics that only a live model carries.

## Why it matters

A bi-directional relationship makes the engine propagate filters both ways on every query that touches either table. On a key with a few hundred values that is cheap. On a key with hundreds of thousands of values, the expanded filter list is built and applied on every evaluation, and the cost shows up as slow visuals that look innocent in the model view.

## How to fix it

Find the cardinality first. In Power BI Desktop's DAX query view, run a query such as `EVALUATE ROW("n", DISTINCTCOUNT('Sales'[Order ID]))` for each column in a bi-directional relationship. Then set the relationship back to single direction in the model view, or remove `crossFilteringBehavior: bothDirections` from it in the TMDL file, and where one report needs the reverse filter, get it from a measure with CROSSFILTER or TREATAS. DAX Studio's VertiPaq Analyzer shows every column's cardinality at once, and if you already use Tabular Editor, the walkthrough under Links loads the same statistics into its Best Practice Analyzer, which can then run this rule directly.

## Related rules

- `AVOID_EXCESSIVE_BI-DIRECTIONAL_OR_MANY-TO-MANY_RELATIONSHIPS` counts bi-directional and many-to-many relationships without needing statistics, and fires when they are more than 30 percent of the model's relationships.
- `CHECK_IF_BI-DIRECTIONAL_AND_MANY-TO-MANY_RELATIONSHIPS_ARE_VALID` lists every bi-directional and many-to-many relationship for review, whatever the column's distinct count.

## Links

- [Loading VertiPaq statistics into Tabular Editor's Best Practice Analyzer](https://www.elegantbi.com/post/vertipaqintabulareditor)
