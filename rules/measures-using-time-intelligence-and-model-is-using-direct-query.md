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

Measures and calculation items that call a time intelligence function, in a model where at least one table is in DirectQuery mode.

## Why it matters

Time intelligence functions build sets of dates and evaluate the measure over each set. In Import mode that is in-memory work. In DirectQuery each set becomes a query, or a long list of dates inside one, sent to the source on every visual refresh, and sources are rarely fast at it. The functions work, but a page of year-to-date and prior-year cards can take many seconds to render.

## How to fix it

If the fact table can be imported, import it and keep DirectQuery for the tables that need it. If it cannot, add prior-period columns to the fact table in the source, such as the same day's amount one year earlier on each row, so the measure becomes a plain SUM.

## Quirks

- Function names are matched case-sensitively, in upper case only, as in the source rule.

## Links

- https://github.com/microsoft/Analysis-Services/blob/master/BestPracticeRules/BPARules.json
