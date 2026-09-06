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

Hidden columns that nothing references: no DAX, relationship, hierarchy, sort-by, row-level security, or object-level security.

## Why it matters

Hidden columns that are not referenced by any DAX expressions, relationships, hierarchy levels or Sort By-properties should be removed.

## How to fix it

Remove the column from the query.

Tabular Editor fix expression: `Delete()`

## Quirks

- DAX references are approximated by pattern matching: references inside strings or comments count, and a bare [Column] reference resolves measure-first, then the expression's own table, then the first table with that column.

## Links

- https://github.com/microsoft/Analysis-Services/blob/master/BestPracticeRules/BPARules.json
