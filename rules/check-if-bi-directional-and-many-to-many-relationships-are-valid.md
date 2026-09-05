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

Every bi-directional or many-to-many relationship.

## Why it matters

Bi-directional and many-to-many relationships may cause performance degradation or even have unintended consequences. Make sure to check these specific relationships to ensure they are working as designed and are actually necessary.

## How to fix it

Confirm each one is intentional; otherwise make it single direction or many-to-one.

## Links

- https://github.com/microsoft/Analysis-Services/blob/master/BestPracticeRules/BPARules.json
- https://www.sqlbi.com/articles/bidirectional-relationships-and-ambiguity-in-dax/
