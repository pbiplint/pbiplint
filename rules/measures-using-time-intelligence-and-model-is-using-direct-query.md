---
id: MEASURES_USING_TIME_INTELLIGENCE_AND_MODEL_IS_USING_DIRECT_QUERY
name: "Measures using time intelligence and model is using Direct Query"
category: Performance
severity: warning
scope: [Measure, CalculationItem]
status: ported
video:
sources:
  - https://github.com/microsoft/Analysis-Services/blob/master/BestPracticeRules/BPARules.json
---

# Measures using time intelligence and model is using Direct Query

## What it checks

Measures and calculation items that use time intelligence functions in a model with a DirectQuery table.

## Why it matters

At present, time intelligence functions are known to not perform as well when using Direct Query. If you are having performance issues, you may want to try alternative solutions such as adding columns in the fact table that show previous year or previous month data.

## How to fix it

Add prior-period columns to the fact table, or move the table to Import.

## Quirks

- Function names are matched case-sensitively (upper case only), as in the Microsoft rule.

## Links

- https://github.com/microsoft/Analysis-Services/blob/master/BestPracticeRules/BPARules.json
