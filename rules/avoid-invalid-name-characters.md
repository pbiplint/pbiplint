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

Object names containing a control character other than whitespace. Tabs and line breaks are allowed here and are covered by `SPECIAL_CHARS_IN_OBJECT_NAMES`.

## Why it matters

A control character in a name is invisible in Power BI Desktop and fails the deployment: the service rejects the metadata and the publish stops with an error that names no object. Every DAX reference and report binding also has to reproduce the hidden character exactly, so the object is fragile even before it is deployed.

## How to fix it

Rename the object in Desktop, or edit the name in the TMDL file. A text editor that shows invisible characters makes it easy to spot.

## Quirks

- In practice this rule cannot fire on a project loaded from TMDL files, because the format does not carry these characters. It is kept so that models built by other means are covered.

## Links

- https://github.com/microsoft/Analysis-Services/blob/master/BestPracticeRules/BPARules.json
