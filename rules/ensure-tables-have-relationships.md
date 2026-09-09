---
id: ENSURE_TABLES_HAVE_RELATIONSHIPS
name: "Ensure tables have relationships"
category: Maintenance
severity: info
scope: [Table, CalculatedTable]
status: ported
video:
sources:
  - https://github.com/microsoft/Analysis-Services/blob/master/BestPracticeRules/BPARules.json
---

# Ensure tables have relationships

## What it checks

Tables with no relationship to any other table. Calculation groups are not checked.

## Why it matters

A table that relates to nothing filters nothing and is filtered by nothing, so a visual that mixes its columns with another table's shows the same value repeated on every row. Sometimes that is the point: a parameter table, a measure table, or a security lookup that is read from DAX. More often it is a table that was loaded and never wired up, or a relationship that was deleted by accident.

## How to fix it

Add the relationship in the model view, or confirm the table is disconnected on purpose and leave it. Hiding the table does not clear the finding, and a measure table with a single hidden column is reported like any other.

## Links

- https://github.com/microsoft/Analysis-Services/blob/master/BestPracticeRules/BPARules.json
