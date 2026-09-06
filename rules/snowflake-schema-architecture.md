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

Tables that are on the many side of one relationship and the one side of another.

## Why it matters

Generally speaking, a star-schema is the optimal architecture for tabular models. That being the case, there are valid cases to use a snowflake approach. Please check your model and consider moving to a star-schema architecture.

## How to fix it

Flatten the snowflaked dimension into a single dimension table where practical.

## Links

- https://github.com/microsoft/Analysis-Services/blob/master/BestPracticeRules/BPARules.json
- https://docs.microsoft.com/power-bi/guidance/star-schema
