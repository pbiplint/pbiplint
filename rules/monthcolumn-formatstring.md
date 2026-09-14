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

DateTime columns with month in the name whose format string is not exactly `MMMM yyyy`.

## Why it matters

A DateTime column named Month usually holds the first day of each month, and with a default date format it reads as March 1, 2026 rather than March 2026. The `MMMM yyyy` format shows the month and year, and setting it on the column fixes every visual at once.

## How to fix it

Set the Format under Column tools in Power BI Desktop, or add `formatString: MMMM yyyy` under the column in the TMDL file. If you prefer a shorter form such as `MMM yyyy`, set it and turn this rule off in `pbiplint.config.json`, because only the exact string passes.

## Quirks

- The name test is a substring, so any DateTime column with month in its name is checked.

## Links

- https://github.com/microsoft/Analysis-Services/blob/master/BestPracticeRules/BPARules.json
