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

Set the Key property to true for primary key columns in the column properties. The flag declares that the column is unique, which lets the engine and client tools treat it as the identifier of the row rather than one more attribute to aggregate. It also documents intent: the next person reading the model can see at a glance which column defines the grain of the dimension, without tracing every relationship to work it out. Tables marked as date tables are skipped, because marking a table as a date table already declares its key column.

## How to fix it

Set `isKey` on the column.

Tabular Editor fix expression: `IsKey = true`

## Links

- https://github.com/microsoft/Analysis-Services/blob/master/BestPracticeRules/BPARules.json
