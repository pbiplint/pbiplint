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

Calculated columns do not compress as well as data columns and may cause longer processing times. As such, calculated columns should be avoided if possible. One scenario where they may be easier to avoid is if they use the RELATED function.

## How to fix it

Move the lookup into Power Query (a merge) or into the source, so the column arrives as a data column.

## Quirks

- RELATEDTABLE( does not match; the pattern requires a parenthesis right after RELATED.

## Links

- https://github.com/microsoft/Analysis-Services/blob/master/BestPracticeRules/BPARules.json
- https://www.sqlbi.com/articles/storage-differences-between-calculated-columns-and-calculated-tables/
