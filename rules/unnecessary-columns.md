---
id: UNNECESSARY_COLUMNS
name: "Remove unnecessary columns"
category: Maintenance
severity: warning
scope: [Column, CalculatedColumn, CalculatedTableColumn]
status: ported
video:
sources:
  - https://github.com/microsoft/Analysis-Services/blob/master/BestPracticeRules/BPARules.json
---

# Remove unnecessary columns

## What it checks

Hidden columns, or columns in hidden tables, that nothing references: no DAX expression, relationship, hierarchy, sort-by column, row-level security filter, or object-level security rule.

## Why it matters

A hidden column that nothing uses is loaded, compressed, and refreshed for no reader. Key columns and helper columns pile up this way as a model evolves, and each one costs memory and refresh time in proportion to its cardinality. Removing them is the cheapest model diet there is.

## How to fix it

Remove the column in Power Query with Choose Columns or Remove Columns, so it is never loaded.

## Quirks

- DAX references are approximated by pattern matching: references inside strings or comments count, and a bare [Column] reference resolves measure-first, then the expression's own table, then the first table with that column.
- Report usage is not visible to this rule. A hidden column used only by a visual, a slicer, or a report-level filter is still flagged.

## Links

- https://github.com/microsoft/Analysis-Services/blob/master/BestPracticeRules/BPARules.json
