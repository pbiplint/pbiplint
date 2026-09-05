---
id: AVOID_INVALID_DESCRIPTION_CHARACTERS
name: "Avoid invalid characters in descriptions"
category: Error Prevention
severity: error
scope: [Table, Measure, Hierarchy, Level, Perspective, Partition, Column, CalculatedColumn, CalculatedTable, CalculatedTableColumn, Role, CalculationGroupTable, CalculationItem]
status: ported
video:
sources:
  - https://github.com/microsoft/Analysis-Services/blob/master/BestPracticeRules/BPARules.json
---

# Avoid invalid characters in descriptions

## What it checks

Descriptions containing control characters.

## Why it matters

This rule identifies if a description for a given object in your model (i.e. table/column/measure) which contains an invalid character. Invalid characters will cause an error when deploying the model (and failure to deploy). This rule has a fix expression which converts the invalid character into a space, resolving the issue.

## How to fix it

Replace the control character with a space.

Tabular Editor fix expression: `Description = string.Concat( it.Description.ToCharArray().Select( c => (char.IsControl(c) && !char.IsWhiteSpace(c)) ? ' ': c ))`

## Links

- https://github.com/microsoft/Analysis-Services/blob/master/BestPracticeRules/BPARules.json
