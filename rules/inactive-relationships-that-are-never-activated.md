---
id: INACTIVE_RELATIONSHIPS_THAT_ARE_NEVER_ACTIVATED
name: "Inactive relationships that are never activated"
category: DAX Expressions
severity: warning
scope: [Relationship]
status: ported
video:
sources:
  - https://github.com/microsoft/Analysis-Services/blob/master/BestPracticeRules/BPARules.json
  - https://docs.microsoft.com/power-bi/guidance/relationships-active-inactive
  - https://dax.guide/userelationship/
---

# Inactive relationships that are never activated

## What it checks

Inactive relationships that no measure or calculation item activates with USERELATIONSHIP.

## Why it matters

Inactive relationships are activated using the USERELATIONSHIP function. If an inactive relationship is not referenced in any measure via this function, the relationship will not be used. It should be determined whether the relationship is not necessary or to activate the relationship via this method.

## How to fix it

Delete the relationship, or use it with USERELATIONSHIP in a measure.

## Quirks

- Only `USERELATIONSHIP(from column, to column)` counts as activation; the reversed argument order does not.
- pbiplint escapes table and column names before building the pattern, which the Microsoft rule does not, so names with parentheses cannot break the check.

## Links

- https://github.com/microsoft/Analysis-Services/blob/master/BestPracticeRules/BPARules.json
- https://docs.microsoft.com/power-bi/guidance/relationships-active-inactive
- https://dax.guide/userelationship/
