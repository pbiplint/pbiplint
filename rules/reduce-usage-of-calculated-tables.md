---
id: REDUCE_USAGE_OF_CALCULATED_TABLES
name: "Reduce usage of calculated tables"
category: Performance
severity: warning
scope: [CalculatedTable]
status: ported
video:
sources:
  - https://github.com/microsoft/Analysis-Services/blob/master/BestPracticeRules/BPARules.json
---

# Reduce usage of calculated tables

## What it checks

Every calculated table. Calculation groups are not included.

## Why it matters

A calculated table is rebuilt from DAX after every refresh, holds a copy of data that exists somewhere else, and is invisible to the source's lineage and to every other model. When two models need the same table, each rebuilds it its own way and they drift. A date table is the usual exception, and even there a shared table in the source or in a dataflow serves every model the same way.

## How to fix it

Build the table in the source or in Power Query so it loads as data. Where a calculated table stays, keep it small and give it a description that says why.

## Quirks

- With Auto date/time on, each hidden LocalDateTable is a calculated table and fires here as well as `REMOVE_AUTO-DATE_TABLE`. Turning the option off clears both.

## Links

- https://github.com/microsoft/Analysis-Services/blob/master/BestPracticeRules/BPARules.json
