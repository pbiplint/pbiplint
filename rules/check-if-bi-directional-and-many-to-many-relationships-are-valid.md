---
id: CHECK_IF_BI-DIRECTIONAL_AND_MANY-TO-MANY_RELATIONSHIPS_ARE_VALID
name: "Check if bi-directional and many-to-many relationships are valid"
category: Performance
severity: info
scope: [Relationship]
status: ported
video:
sources:
  - https://github.com/microsoft/Analysis-Services/blob/master/BestPracticeRules/BPARules.json
  - https://www.sqlbi.com/articles/bidirectional-relationships-and-ambiguity-in-dax/
---

# Check if bi-directional and many-to-many relationships are valid

## What it checks

Every relationship that is bi-directional, many-to-many, or both. This is a review list at info severity, not a defect.

## Why it matters

Both kinds have real uses, and both are easy to create by accident: Desktop offers bi-directional filtering as a dropdown, and it falls back to many-to-many when it finds duplicates on both sides of a key. An accidental one costs query time on every visual that touches the tables and can open a second filter path, which is where totals stop adding up without any error.

## How to fix it

Confirm each one is deliberate. If a bi-directional relationship exists only so one slicer narrows another, replace it with a measure-based visual filter or CROSSFILTER in the measures that need it. If a many-to-many relationship was created because a key column has duplicates, fix the duplicates in the source and go back to many-to-one.

## Links

- https://github.com/microsoft/Analysis-Services/blob/master/BestPracticeRules/BPARules.json
- https://www.sqlbi.com/articles/bidirectional-relationships-and-ambiguity-in-dax/
