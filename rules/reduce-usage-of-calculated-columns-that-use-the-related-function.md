---
id: REDUCE_USAGE_OF_CALCULATED_COLUMNS_THAT_USE_THE_RELATED_FUNCTION
name: "Reduce usage of calculated columns that use the RELATED function"
category: Performance
severity: warning
scope: [CalculatedColumn]
status: ported
video:
sources:
  - https://github.com/microsoft/Analysis-Services/blob/master/BestPracticeRules/BPARules.json
  - https://www.sqlbi.com/articles/storage-differences-between-calculated-columns-and-calculated-tables/
---

# Reduce usage of calculated columns that use the RELATED function

## What it checks

Calculated columns whose DAX calls RELATED.

## Why it matters

RELATED in a calculated column copies a value from the one side of a relationship onto every row of the many side. That is a lookup the source can do with a join, or Power Query with a merge, at load time and often folded to the source. Done in DAX it is computed row by row after load and stored without full compression, and the copied column then duplicates a dimension attribute, which `REMOVE_REDUNDANT_COLUMNS_IN_RELATED_TABLES` also flags.

## How to fix it

Add the column in Power Query with Merge Queries, or join it in the source view. If the value is only needed inside a measure, use RELATED in the measure instead of storing a column.

## Quirks

- RELATEDTABLE( does not match; the pattern requires a parenthesis right after RELATED.

## Links

- https://github.com/microsoft/Analysis-Services/blob/master/BestPracticeRules/BPARules.json
- https://www.sqlbi.com/articles/storage-differences-between-calculated-columns-and-calculated-tables/
