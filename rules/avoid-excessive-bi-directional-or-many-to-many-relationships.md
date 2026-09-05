---
id: AVOID_EXCESSIVE_BI-DIRECTIONAL_OR_MANY-TO-MANY_RELATIONSHIPS
name: "Avoid excessive bi-directional or many-to-many relationships"
category: Performance
severity: warning
scope: [Model]
status: ported
video:
sources:
  - https://github.com/microsoft/Analysis-Services/blob/master/BestPracticeRules/BPARules.json
  - https://www.sqlbi.com/articles/bidirectional-relationships-and-ambiguity-in-dax/
---

# Avoid excessive bi-directional or many-to-many relationships

## What it checks

Models where bi-directional plus many-to-many relationships exceed 30 percent of all relationships.

## Why it matters

Limit use of b-di and many-to-many relationships. This rule flags the model if more than 30% of relationships are bi-di or many-to-many.

## How to fix it

Change relationships to single direction and replace many-to-many relationships with bridge tables or measures.

## Quirks

- A relationship that is both bi-directional and many-to-many counts twice.

## Links

- https://github.com/microsoft/Analysis-Services/blob/master/BestPracticeRules/BPARules.json
- https://www.sqlbi.com/articles/bidirectional-relationships-and-ambiguity-in-dax/
