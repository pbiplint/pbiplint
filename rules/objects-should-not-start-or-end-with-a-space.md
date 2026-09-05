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

A leading or trailing space is invisible on screen but is part of the name, so "Sales " and "Sales" are two different objects to the engine. That is enough to break a DAX reference, a report visual binding, or a deployment that expects the trimmed name, and the error you get back will name an object that looks perfectly correct. Stray spaces almost always arrive by accident, pasted in or inherited from a source column name, so trimming them is safe and rarely breaks anything downstream. This rule is an error rather than a warning because the failure stays silent until something else breaks.

## How to fix it

Trim the name.

## Quirks

- Narrower scope than TRIM_OBJECT_NAMES: levels, roles, expressions, calculation items, and calculated tables are not checked here.

## Links

- https://github.com/microsoft/Analysis-Services/blob/master/BestPracticeRules/BPARules.json
