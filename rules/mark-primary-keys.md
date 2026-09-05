---
id: MARK_PRIMARY_KEYS
name: "Mark primary keys"
category: Formatting
severity: info
scope: [Column, CalculatedColumn, CalculatedTableColumn]
status: ported
video:
sources:
  - https://github.com/microsoft/Analysis-Services/blob/master/BestPracticeRules/BPARules.json
---

# Mark primary keys

## What it checks

Columns on the one side of a relationship, outside date tables, that are not marked as key.

## Why it matters

Set the 'Key' property to 'True' for primary key columns within the column properties.

## How to fix it

Set `isKey` on the column.

Tabular Editor fix expression: `IsKey = true`

## Links

- https://github.com/microsoft/Analysis-Services/blob/master/BestPracticeRules/BPARules.json
