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

Names that start or end with a space.

## Why it matters

Unintentionally leaving a trailing space in an object name is a common occurrence when copying/duplicating objects in Tabular Editor.

## How to fix it

Trim the name.

## Links

- https://github.com/microsoft/Analysis-Services/blob/master/BestPracticeRules/BPARules.json
