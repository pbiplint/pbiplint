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

An inactive relationship does nothing on its own. It exists so a measure can switch it on with USERELATIONSHIP, typically for a second date on a fact table. If no measure does, the relationship is either a leftover from a design that changed or a plan that was never finished, and a report author who sees the dotted line in the model view will assume the filter works.

## How to fix it

Write the measure that uses it, `CALCULATE([Total Sales], USERELATIONSHIP(Sales[Ship Date], 'Date'[Date]))`, or delete the relationship in the model view.

## Quirks

- Only `USERELATIONSHIP(from column, to column)` counts as activation; the reversed argument order does not.
- pbiplint escapes table and column names before building the pattern, which the source rule does not, so names with parentheses cannot break the check.

## Links

- https://github.com/microsoft/Analysis-Services/blob/master/BestPracticeRules/BPARules.json
- https://docs.microsoft.com/power-bi/guidance/relationships-active-inactive
- https://dax.guide/userelationship/
