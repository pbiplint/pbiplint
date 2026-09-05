---
id: HIDE_FOREIGN_KEYS
name: "Hide foreign keys"
category: Formatting
severity: warning
scope: [Column, CalculatedColumn, CalculatedTableColumn]
status: ported
video:
sources:
  - https://github.com/microsoft/Analysis-Services/blob/master/BestPracticeRules/BPARules.json
---

# Hide foreign keys

## What it checks

Visible columns whose name is the from-side of a many-to-one relationship.

## Why it matters

Foreign keys should always be hidden.

## How to fix it

Hide the column.

Tabular Editor fix expression: `IsHidden = true`

## Quirks

- The Microsoft rule compares from-column names only, not table plus column, so a dimension's key that shares a name with the fact table's foreign key is flagged too. pbiplint keeps this to match Tabular Editor.

## Links

- https://github.com/microsoft/Analysis-Services/blob/master/BestPracticeRules/BPARules.json
