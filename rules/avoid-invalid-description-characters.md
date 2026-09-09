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

Descriptions containing a control character other than whitespace. Tabs and line breaks are allowed.

## Why it matters

A control character in a description is invisible in Power BI Desktop and fails the deployment: the service rejects the metadata and the publish stops with an error that names no object. Finding the character by eye is close to impossible.

## How to fix it

Retype the description in Desktop, or remove the character from the `///` comment lines above the object in the TMDL file. A text editor that shows invisible characters makes it easy to spot.

## Quirks

- In practice this rule cannot fire on a project loaded from TMDL files, because the format does not carry these characters. It is kept so that models built by other means are covered.

## Links

- https://github.com/microsoft/Analysis-Services/blob/master/BestPracticeRules/BPARules.json
