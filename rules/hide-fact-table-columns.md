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

Visible numeric columns that a measure aggregates directly with a fully qualified reference, such as `SUM('Sales'[Amount])`. COUNT, SUM, AVERAGE, MIN, MAX, DISTINCTCOUNT, VALUES, DISTINCT, and their A-suffixed variants count as aggregations.

## Why it matters

Once a measure exists for a column, the column itself is the wrong thing to drag onto a visual: it produces an implicit sum that may not match the measure, ignores whatever logic the measure adds, and sits in the field list right next to the measure under a similar name. Hiding the column leaves one correct choice.

## How to fix it

Hide the column in the model view, or add `isHidden` under the column in the TMDL file.

## Quirks

- Only fully qualified references count. `SUM([Amount])` inside a measure on the same table does not fire.
- A visible column in a hidden table is still reported.

## Links

- https://github.com/microsoft/Analysis-Services/blob/master/BestPracticeRules/BPARules.json
