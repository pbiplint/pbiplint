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

A many-to-many relationship has no unique key on either side, so the engine resolves it through an implicit set of distinct values rather than a direct lookup. Making that relationship bi-directional as well lets filters travel back through the same expansion, and that is where filter ambiguity begins: as soon as two paths reach the same table, the result depends on which path the engine chooses, and totals stop agreeing with the sum of their parts. The extra direction also costs at query time, because every filter has to be expanded across the distinct values on both sides instead of one. Single direction keeps one predictable filter path and is the accepted default; add the reverse direction only where a specific report needs it and you have confirmed the model has no second path.

## How to fix it

Set the cross filter direction to single.

## Links

- https://github.com/microsoft/Analysis-Services/blob/master/BestPracticeRules/BPARules.json
