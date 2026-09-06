---
id: RELATIONSHIP_COLUMNS_SAME_DATA_TYPE
name: "Relationship columns should be of the same data type"
category: Error Prevention
severity: error
scope: [Relationship]
status: ported
video:
sources:
  - https://github.com/microsoft/Analysis-Services/blob/master/BestPracticeRules/BPARules.json
---

# Relationship columns should be of the same data type

## What it checks

Relationships whose two columns have different data types.

## Why it matters

Columns used in a relationship should be of the same data type. Ideally, they will be of integer data type (see the related rule '[Formatting] Relationship columns should be of integer data type'). Having columns within a relationship which are of different data types may lead to various issues.

## How to fix it

Convert both columns to the same type, ideally whole number.

## Links

- https://github.com/microsoft/Analysis-Services/blob/master/BestPracticeRules/BPARules.json
