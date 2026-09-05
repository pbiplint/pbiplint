---
id: RELATIONSHIP_COLUMNS_SHOULD_BE_OF_INTEGER_DATA_TYPE
name: "Relationship columns should be of integer data type"
category: Formatting
severity: info
scope: [Column, CalculatedColumn, CalculatedTableColumn]
status: ported
video:
sources:
  - https://github.com/microsoft/Analysis-Services/blob/master/BestPracticeRules/BPARules.json
---

# Relationship columns should be of integer data type

## What it checks

Relationship columns that are not Int64.

## Why it matters

It is a best practice for relationship columns to be of integer data type. This applies not only to data warehousing but data modeling as well.

## How to fix it

Use whole-number surrogate keys on both sides.

## Links

- https://github.com/microsoft/Analysis-Services/blob/master/BestPracticeRules/BPARules.json
