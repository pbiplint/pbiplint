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

Data columns with no source column. Calculated columns are not checked.

## Why it matters

A data column is filled from a column in the partition query, and the source column name is how the engine finds it. Without it, processing fails for the whole table, with an error that names the column but not the cause.

## How to fix it

Set `sourceColumn` on the column in the TMDL file to the name the query produces, or delete the column. Power BI Desktop always writes the property, so this appears only in hand-built or migrated files.

## Links

- https://github.com/microsoft/Analysis-Services/blob/master/BestPracticeRules/BPARules.json
