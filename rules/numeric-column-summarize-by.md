---
id: NUMERIC_COLUMN_SUMMARIZE_BY
name: "Do not summarize numeric columns"
category: Formatting
severity: error
scope: [Column, CalculatedColumn, CalculatedTableColumn]
status: ported
video:
sources:
  - https://github.com/microsoft/Analysis-Services/blob/master/BestPracticeRules/BPARules.json
---

# Do not summarize numeric columns

## What it checks

Visible numeric columns whose default summarization is not None.

## Why it matters

Numeric columns (integer, decimal, double) should have their SummarizeBy property set to "None" to avoid accidental summation in Power BI (create measures instead).

## How to fix it

Set `summarizeBy: none` and create explicit measures.

Tabular Editor fix expression: `SummarizeBy = AggregateFunction.None`

## Quirks

- A column with no summarizeBy property is treated as Default, which is not None, so it is flagged.

## Links

- https://github.com/microsoft/Analysis-Services/blob/master/BestPracticeRules/BPARules.json
