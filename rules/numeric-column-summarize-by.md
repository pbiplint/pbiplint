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

Visible whole number, decimal, or double columns whose default summarization is anything other than None.

## Why it matters

With a default summarization, dragging the column onto a visual produces an implicit sum, and it is easy to sum something that should never be summed: a year, a unit price, a percentage, a key. The implicit measure also bypasses the format string and the logic of the real measures, so two visuals of the same thing disagree. With summarization off, the column lands on a visual as a category and the author reaches for a measure.

## How to fix it

In Power BI Desktop, select the column and set Summarization to Don't summarize under Column tools. In the TMDL file the property is `summarizeBy: none`. Create explicit measures for the aggregations reports need.

## Quirks

- A column with no summarizeBy property is treated as Default, which is not None, so it is flagged.

## Links

- https://github.com/microsoft/Analysis-Services/blob/master/BestPracticeRules/BPARules.json
