---
id: DATA_COLUMNS_MUST_HAVE_A_SOURCE_COLUMN
name: "Data columns must have a source column"
category: Error Prevention
severity: error
scope: [Column]
status: ported
video:
sources:
  - https://github.com/microsoft/Analysis-Services/blob/master/BestPracticeRules/BPARules.json
---

# Data columns must have a source column

## What it checks

Data columns with no sourceColumn.

## Why it matters

Data columns must have a source column. A data column without a source column will cause an error when processing the model.

## How to fix it

Set the source column, or delete the column.

## Links

- https://github.com/microsoft/Analysis-Services/blob/master/BestPracticeRules/BPARules.json
