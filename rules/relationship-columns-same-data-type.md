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

The engine relates columns by value, and when the types differ it converts one side for every query. A text key on one side and a whole number on the other works until a value like 007 meets 7, at which point rows quietly fall into the blank member. Matching types remove both the conversion cost and the surprise.

## How to fix it

Change both columns to the same type in Power Query, and prefer whole numbers for keys. In the TMDL file the property is `dataType` on each column.

## Links

- https://github.com/microsoft/Analysis-Services/blob/master/BestPracticeRules/BPARules.json
