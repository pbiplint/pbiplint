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

Columns on the one side of a relationship, outside date tables, that are not marked as the table's key.

## Why it matters

The key flag declares that the column is unique, which lets the engine and client tools treat it as the identifier of the row rather than one more attribute to aggregate, and the engine enforces the uniqueness at refresh, so a duplicate key fails loudly instead of quietly doubling a total. It also documents intent: the next person reading the model can see at a glance which column defines the grain of the dimension, without tracing every relationship to work it out. Tables marked as date tables are skipped, because marking a table as a date table already sets the key on its date column.

## How to fix it

Add `isKey` under the column in the TMDL file. Power BI Desktop has no setting for it on ordinary tables but keeps the value once it is in the file. Make sure the column really is unique first, because refresh fails if it is not.

## Links

- https://github.com/microsoft/Analysis-Services/blob/master/BestPracticeRules/BPARules.json
