---
id: REDUCE_USAGE_OF_LONG-LENGTH_COLUMNS_WITH_HIGH_CARDINALITY
name: "Reduce usage of long-length columns with high cardinality"
category: Performance
severity: warning
scope: [Column, CalculatedColumn, CalculatedTableColumn]
status: needsLiveModel
video:
sources:
  - https://github.com/microsoft/Analysis-Services/blob/master/BestPracticeRules/BPARules.json
---

# Reduce usage of long-length columns with high cardinality

## What it checks

Text columns where more than 500,000 rows hold values longer than 100 characters. Row data is not in the model files, so pbiplint lists this rule but cannot run it.

## Why it matters

The engine stores each distinct text value once in a dictionary and encodes the rows against it. Long unique strings, such as comments, descriptions, or URLs with query strings, defeat that: the dictionary grows as large as the data, memory and refresh time follow, and every visual that touches the column pays to decode it. Such a column is usually never shown in a visual anyway.

## How to fix it

Leave the column out of the model unless a report shows it. If it is needed, shorten it in Power Query, keep only the rows that matter, or move it to a detail table reached by drillthrough. Check column sizes with DAX Studio's VertiPaq Analyzer.

pbiplint cannot evaluate this rule from files; it appears in `pbiplint rules` as needing a live model.

## Links

- https://github.com/microsoft/Analysis-Services/blob/master/BestPracticeRules/BPARules.json
