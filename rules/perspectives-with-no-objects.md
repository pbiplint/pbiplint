---
id: PERSPECTIVES_WITH_NO_OBJECTS
name: "Perspectives with no objects"
category: Maintenance
severity: info
scope: [Perspective]
status: ported
video:
sources:
  - https://github.com/microsoft/Analysis-Services/blob/master/BestPracticeRules/BPARules.json
---

# Perspectives with no objects

## What it checks

Perspectives containing no tables.

## Why it matters

Perspectives that contain no objects (tables) are most likely not necessary. In this rule, it is only necessary to check tables as adding a column/measure/hierarchy to a perspective also adds the table to the perspective. Additionally, tables in general covers calculated tables and calculation groups as well.

## How to fix it

Add objects to the perspective or delete it.

Tabular Editor fix expression: `Delete()`

## Links

- https://github.com/microsoft/Analysis-Services/blob/master/BestPracticeRules/BPARules.json
