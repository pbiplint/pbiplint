---
id: DATECOLUMN_FORMATSTRING
name: "Provide format string for \"Date\" columns"
category: Formatting
severity: info
scope: [Column, CalculatedColumn, CalculatedTableColumn]
status: ported
video:
sources:
  - https://github.com/microsoft/Analysis-Services/blob/master/BestPracticeRules/BPARules.json
---

# Provide format string for "Date" columns

## What it checks

DateTime columns with Date in the name whose format string is not mm/dd/yyyy.

## Why it matters

Columns of type "DateTime" that have "Month" in their names should be formatted as "mm/dd/yyyy".

## How to fix it

Set the format string to mm/dd/yyyy. The rule is US-centric; if your standard differs, disable it in pbiplint.config.json.

Tabular Editor fix expression: `FormatString = "mm/dd/yyyy"`

## Quirks

- The Microsoft description says Month; the rule matches Date in the column name. Any name containing the letters date, such as Update, is matched.

## Links

- https://github.com/microsoft/Analysis-Services/blob/master/BestPracticeRules/BPARules.json
