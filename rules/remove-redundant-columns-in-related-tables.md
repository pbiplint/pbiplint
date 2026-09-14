---
id: REMOVE_REDUNDANT_COLUMNS_IN_RELATED_TABLES
name: "Remove redundant columns in related tables"
category: Performance
severity: warning
scope: [Column, CalculatedColumn, CalculatedTableColumn]
status: ported
video:
sources:
  - https://github.com/microsoft/Analysis-Services/blob/master/BestPracticeRules/BPARules.json
---

# Remove redundant columns in related tables

## What it checks

Columns that take part in no relationship and share a name with a column on a table that this table relates to from the many side. In practice, a fact table column that duplicates a dimension attribute.

## Why it matters

A fact table row that carries the product name as well as the product key stores the name once per sale instead of once per product, and offers the report author two Product Name fields that behave differently: the fact table's version cannot filter other fact tables and shows only the names that have sales. The dimension's copy is the one that should exist.

## How to fix it

Remove the column from the fact table's query in Power Query and use the dimension's column in reports. If a measure needs the value, RELATED reaches it through the relationship.

## Quirks

- Matching is by column name only, so two unrelated columns that happen to share a name fire too.

## Links

- https://github.com/microsoft/Analysis-Services/blob/master/BestPracticeRules/BPARules.json
