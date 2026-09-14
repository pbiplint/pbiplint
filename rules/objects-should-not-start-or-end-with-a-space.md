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

Names that start or end with a space, for the model, tables, measures, hierarchies, perspectives, partitions, data columns, and calculated columns.

## Why it matters

A leading or trailing space is invisible on screen but is part of the name, so "Sales " and "Sales" are two different objects to the engine. That is enough to break a DAX reference, a report visual binding, or a deployment that expects the trimmed name, and the error you get back will name an object that looks perfectly correct. Stray spaces almost always arrive by accident, pasted in or inherited from a source column name, so trimming them is safe and rarely breaks anything downstream. `TRIM_OBJECT_NAMES` makes the same check across more object types at a lower severity, so every finding here appears there as well.

## How to fix it

Rename the object without the space in Power BI Desktop, which updates the visuals and DAX that reference it, or edit the name in the TMDL file.

## Quirks

- Narrower scope than `TRIM_OBJECT_NAMES`: levels, roles, expressions, calculation items, calculated tables, and calculated table columns are not checked here.

## Links

- https://github.com/microsoft/Analysis-Services/blob/master/BestPracticeRules/BPARules.json
