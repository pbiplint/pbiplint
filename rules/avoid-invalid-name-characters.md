---
id: AVOID_INVALID_NAME_CHARACTERS
name: "Avoid invalid characters in names"
category: Error Prevention
severity: error
scope: [Table, Measure, Hierarchy, Level, Perspective, Partition, Column, CalculatedColumn, CalculatedTable, CalculatedTableColumn, Role, CalculationGroupTable, CalculationItem]
status: ported
video:
sources:
  - https://github.com/microsoft/Analysis-Services/blob/master/BestPracticeRules/BPARules.json
---

# Avoid invalid characters in names

## What it checks

Object names containing control characters.

## Why it matters

This rule identifies if a name for a given object in your model (i.e. table/column/measure) which contains an invalid character. Invalid characters will cause an error when deploying the model (and failure to deploy). This rule has a fix expression which converts the invalid character into a space, resolving the issue.

## How to fix it

Replace the control character with a space.

Tabular Editor fix expression: `Name = string.Concat( it.Name.ToCharArray().Select( c => (char.IsControl(c) && !char.IsWhiteSpace(c)) ? ' ': c ))`

## Links

- https://github.com/microsoft/Analysis-Services/blob/master/BestPracticeRules/BPARules.json
