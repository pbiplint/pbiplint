---
id: SNOWFLAKE_SCHEMA_ARCHITECTURE
name: "Consider a star-schema instead of a snowflake architecture"
category: Performance
severity: warning
scope: [Table, CalculatedTable]
status: ported
video:
sources:
  - https://github.com/microsoft/Analysis-Services/blob/master/BestPracticeRules/BPARules.json
  - https://docs.microsoft.com/power-bi/guidance/star-schema
---

# Consider a star-schema instead of a snowflake architecture

## What it checks

Tables that are on the from side of one relationship and the to side of another, which is what a dimension related to a sub-dimension looks like.

## Why it matters

In a star schema every dimension relates directly to the fact table, so a filter on Category reaches Sales in one hop. When Category hangs off Product, which hangs off Sales, the filter travels two hops, the model view is harder to read, and any bi-directional relationship along the chain doubles the chance of ambiguity. The engine handles a snowflake, but it handles a star faster, and a report author understands a star at a glance.

## How to fix it

Flatten the sub-dimension into its parent with a merge in Power Query, so Product carries Category Name and the Category table goes away. Keep a snowflake only where the sub-dimension is shared by several dimensions or is very large.

## Quirks

- The test is the from side and the to side of a relationship, not the many side and the one side, so a table with a one-to-one relationship can count.

## Links

- https://github.com/microsoft/Analysis-Services/blob/master/BestPracticeRules/BPARules.json
- https://docs.microsoft.com/power-bi/guidance/star-schema
