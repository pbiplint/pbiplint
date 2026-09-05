---
id: MANY-TO-MANY_RELATIONSHIPS_SHOULD_BE_SINGLE-DIRECTION
name: "Many-to-many relationships should be single-direction"
category: Performance
severity: warning
scope: [Relationship]
status: ported
video:
sources:
  - https://github.com/microsoft/Analysis-Services/blob/master/BestPracticeRules/BPARules.json
---

# Many-to-many relationships should be single-direction

## What it checks

Many-to-many relationships with bi-directional cross filtering.

## Why it matters

Microsoft's Best Practice Analyzer includes this rule under Performance.

## How to fix it

Set the cross filter direction to single.

## Links

- https://github.com/microsoft/Analysis-Services/blob/master/BestPracticeRules/BPARules.json
