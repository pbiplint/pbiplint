---
id: HIDE_FACT_TABLE_COLUMNS
name: "Hide fact table columns"
category: Formatting
severity: warning
scope: [Column, CalculatedColumn, CalculatedTableColumn]
status: ported
video:
sources:
  - https://github.com/microsoft/Analysis-Services/blob/master/BestPracticeRules/BPARules.json
---

# Hide fact table columns

## What it checks

Visible numeric columns that a measure aggregates with SUM, COUNT, AVERAGE, MIN, MAX, DISTINCTCOUNT, or similar.

## Why it matters

It is a best practice to hide fact table columns that are used for aggregation in measures.

## How to fix it

Hide the column and expose the measure instead.

Tabular Editor fix expression: `IsHidden = true`

## Links

- https://github.com/microsoft/Analysis-Services/blob/master/BestPracticeRules/BPARules.json
