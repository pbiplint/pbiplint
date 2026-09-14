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

Models that have at least one DirectQuery table, no aggregation table (no column has an alternateOf mapping), and the PowerBI_V3 data source version, which is every project Desktop writes today.

## Why it matters

In DirectQuery every visual sends a query to the source. Aggregation tables let the engine answer the common high-level questions, totals by month or by region, from a small imported table and send only the detail queries through. Without them, the summary page of a dashboard pays the full round trip to the source on every interaction. This is an info-level prompt to consider the feature, not a defect.

## How to fix it

Create a summary table at the grain the reports use most, import it, and set it up under Manage aggregations in Power BI Desktop. The guide in the links covers the setup and the rules the engine uses to match queries to the aggregation.

## Links

- https://github.com/microsoft/Analysis-Services/blob/master/BestPracticeRules/BPARules.json
- https://docs.microsoft.com/power-bi/transform-model/desktop-aggregations
