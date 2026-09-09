---
id: TRIM_OBJECT_NAMES
name: "Trim object names"
category: Naming Conventions
severity: info
scope: [Model, Table, Measure, Hierarchy, Level, Perspective, Partition, DataSource, Column, CalculatedColumn, CalculatedTable, CalculatedTableColumn, NamedExpression, Role, CalculationGroupTable, CalculationItem]
status: ported
video:
sources:
  - https://github.com/microsoft/Analysis-Services/blob/master/BestPracticeRules/BPARules.json
---

# Trim object names

## What it checks

Names that start or end with a space, across every named object type in the model.

## Why it matters

A leading or trailing space is invisible in the field list but part of the name, so "Sales " and "Sales" are two objects to the engine, and a DAX reference, a visual binding, or a deployment script that uses the trimmed name fails against something that looks correct. The space usually arrives with a source column name or a paste. `OBJECTS_SHOULD_NOT_START_OR_END_WITH_A_SPACE` reports the same names at error severity for a narrower set of object types.

## How to fix it

Rename the object without the space in Power BI Desktop, or edit the name in the TMDL file. Trim column names in Power Query so they arrive clean.

## Links

- https://github.com/microsoft/Analysis-Services/blob/master/BestPracticeRules/BPARules.json
