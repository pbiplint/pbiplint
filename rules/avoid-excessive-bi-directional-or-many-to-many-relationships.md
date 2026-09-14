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

Models where bi-directional relationships plus many-to-many relationships make up more than 30 percent of all relationships. The finding is on the model, not on any one relationship.

## Why it matters

Each bi-directional or many-to-many relationship adds a filter path the engine has to consider on every query. A few in the right places are fine. When they are a third of the model, most queries pay for filter propagation they do not need, and the model starts to show ambiguity: two routes between the same tables, the engine picking one, and totals that stop adding up.

## How to fix it

In the model view, set each bi-directional relationship back to single direction unless a report needs the reverse filter; where one does, get it from a measure with CROSSFILTER instead. Replace many-to-many relationships with a bridge table that relates many-to-one to both sides. In the relationships TMDL file the properties are `crossFilteringBehavior: bothDirections` and the two cardinality lines.

## Quirks

- A relationship that is both bi-directional and many-to-many counts twice.

## Links

- https://github.com/microsoft/Analysis-Services/blob/master/BestPracticeRules/BPARules.json
- https://www.sqlbi.com/articles/bidirectional-relationships-and-ambiguity-in-dax/
