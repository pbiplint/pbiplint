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

Tables with no relationships.

## Why it matters

This rule highlights tables which are not connected to any other table in the model with a relationship.

## How to fix it

Relate the table, or confirm it is an intentional disconnected table (parameters, security).

## Links

- https://github.com/microsoft/Analysis-Services/blob/master/BestPracticeRules/BPARules.json
