---
id: SPECIAL_CHARS_IN_OBJECT_NAMES
name: "Object names must not contain special characters"
category: Naming Conventions
severity: warning
scope: [Model, Table, Measure, Hierarchy, Perspective, Partition, Column, CalculatedColumn, CalculatedTable, CalculatedTableColumn, CalculationGroupTable, CalculationItem]
status: ported
video:
sources:
  - https://github.com/microsoft/Analysis-Services/blob/master/BestPracticeRules/BPARules.json
---

# Object names must not contain special characters

## What it checks

Names containing a tab, line feed, or carriage return.

## Why it matters

Tabs, line breaks, etc.

## How to fix it

Remove the character from the name.

## Links

- https://github.com/microsoft/Analysis-Services/blob/master/BestPracticeRules/BPARules.json
