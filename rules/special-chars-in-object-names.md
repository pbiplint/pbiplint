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

Tabs and line breaks inside a name are invisible in most of the interface, so the object looks correct in the field list while every DAX reference, report binding, and deployment script has to reproduce the hidden character exactly. When one of them does not, you get a broken reference between two names that look identical on screen, which is one of the slowest kinds of model bug to track down. The same characters break CSV and Excel exports, where a line feed inside a column header splits the header across rows. Names should contain printable characters and ordinary spaces only.

## How to fix it

Remove the character from the name.

## Links

- https://github.com/microsoft/Analysis-Services/blob/master/BestPracticeRules/BPARules.json
