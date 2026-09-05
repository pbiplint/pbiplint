---
id: MONTHCOLUMN_FORMATSTRING
name: "Provide format string for \"Month\" columns"
category: Formatting
severity: info
scope: [Column, CalculatedColumn, CalculatedTableColumn]
status: ported
video:
sources:
  - https://github.com/microsoft/Analysis-Services/blob/master/BestPracticeRules/BPARules.json
---

# Provide format string for "Month" columns

## What it checks

DateTime columns with Month in the name whose format string is not MMMM yyyy.

## Why it matters

Columns of type "DateTime" that have "Month" in their names should be formatted as "MMMM yyyy".

## How to fix it

Set the format string to MMMM yyyy.

Tabular Editor fix expression: `FormatString = "MMMM yyyy"`

## Links

- https://github.com/microsoft/Analysis-Services/blob/master/BestPracticeRules/BPARules.json
