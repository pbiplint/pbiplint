---
id: MODEL_USING_DIRECT_QUERY_AND_NO_AGGREGATIONS
name: "Consider using aggregations if using Direct Query in Power BI"
category: Performance
severity: info
scope: [Model]
status: ported
video:
sources:
  - https://github.com/microsoft/Analysis-Services/blob/master/BestPracticeRules/BPARules.json
  - https://docs.microsoft.com/power-bi/transform-model/desktop-aggregations
---

# Consider using aggregations if using Direct Query in Power BI

## What it checks

Models with a DirectQuery table, no aggregation tables (no column has alternateOf), and the PowerBI_V3 data source version.

## Why it matters

If using Direct Query in Power BI Premium, you may want to consider using aggregations in order to boost performance.

## How to fix it

Consider adding aggregation tables for the DirectQuery fact table.

## Links

- https://github.com/microsoft/Analysis-Services/blob/master/BestPracticeRules/BPARules.json
- https://docs.microsoft.com/power-bi/transform-model/desktop-aggregations
