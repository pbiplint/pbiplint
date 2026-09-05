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

Visible columns whose name matches the from column of a relationship whose from side is many. Only the from cardinality is tested, so a many-to-many relationship counts here too, not just many-to-one.

## Why it matters

Foreign keys should always be hidden. A key column on the many side of a relationship carries no meaning for a report author: the values are usually surrogate integers, and grouping by the fact table's key gives one row per fact instead of the dimension attribute the author wanted. Leaving it visible also puts two versions of the same field in the field list, one on the fact table and one on the dimension, and only the dimension's version filters the way people expect. Hiding the key removes the wrong choice from the field list without changing anything about how the model behaves.

## How to fix it

Hide the column.

Tabular Editor fix expression: `IsHidden = true`

## Quirks

- The Microsoft rule compares from-column names only, not table plus column, so a dimension's key that shares a name with the fact table's foreign key is flagged too. pbiplint keeps this to match Tabular Editor.

## Links

- https://github.com/microsoft/Analysis-Services/blob/master/BestPracticeRules/BPARules.json
