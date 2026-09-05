---
id: OBJECTS_SHOULD_NOT_START_OR_END_WITH_A_SPACE
name: "Objects should not start or end with a space"
category: Formatting
severity: error
scope: [Model, Table, Measure, Hierarchy, Perspective, Partition, Column, CalculatedColumn]
status: ported
video:
sources:
  - https://github.com/microsoft/Analysis-Services/blob/master/BestPracticeRules/BPARules.json
---

# Objects should not start or end with a space

## What it checks

Names that start or end with a space, for the model, tables, measures, hierarchies, perspectives, partitions, and columns.

## Why it matters

Objects should not start or end with a space

## How to fix it

Trim the name.

## Quirks

- Narrower scope than TRIM_OBJECT_NAMES: levels, roles, expressions, calculation items, and calculated tables are not checked here.

## Links

- https://github.com/microsoft/Analysis-Services/blob/master/BestPracticeRules/BPARules.json
