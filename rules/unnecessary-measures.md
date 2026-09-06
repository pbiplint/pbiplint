---
id: UNNECESSARY_MEASURES
name: "Remove unnecessary measures"
category: Maintenance
severity: warning
scope: [Measure]
status: ported
video:
sources:
  - https://github.com/microsoft/Analysis-Services/blob/master/BestPracticeRules/BPARules.json
---

# Remove unnecessary measures

## What it checks

Hidden measures that no DAX expression references.

## Why it matters

Hidden measures that are not referenced by any DAX expressions should be removed for maintainability

## How to fix it

Delete the measure.

Tabular Editor fix expression: `Delete()`

## Quirks

- References from calculation items and from other hidden measures count as usage.

## Links

- https://github.com/microsoft/Analysis-Services/blob/master/BestPracticeRules/BPARules.json
