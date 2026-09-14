---
id: FORMAT_FLAG_COLUMNS_AS_YES/NO_VALUE_STRINGS
name: "Format flag columns as Yes/No value strings"
category: Formatting
severity: info
scope: [Column, CalculatedColumn, CalculatedTableColumn]
status: ported
video:
sources:
  - https://github.com/microsoft/Analysis-Services/blob/master/BestPracticeRules/BPARules.json
---

# Format flag columns as Yes/No value strings

## What it checks

Visible columns whose name starts with Is and whose type is whole number, and visible columns whose name ends with Flag and whose type is not text.

## Why it matters

A 0 or 1 in a slicer, a legend, or a table column tells the reader nothing without a lookup, and a whole-number flag is summed by default, so a card labeled Is Active shows a count of true rows that looks like something else. Yes and No read correctly everywhere and cannot be aggregated by accident.

## How to fix it

In Power Query, add a conditional column or use Replace Values so the column holds Yes and No, and set its type to Text. Keep the numeric version hidden if a measure needs it for counting.

## Quirks

- The name tests are case-sensitive prefix and suffix checks, so a whole-number column called Island or Issue Count fires, and the Flag suffix needs a space before it.

## Links

- https://github.com/microsoft/Analysis-Services/blob/master/BestPracticeRules/BPARules.json
