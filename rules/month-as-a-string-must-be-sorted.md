---
id: MONTH_(AS_A_STRING)_MUST_BE_SORTED
name: "Month (as a string) must be sorted"
category: Formatting
severity: warning
scope: [Column, CalculatedColumn, CalculatedTableColumn]
status: ported
video:
sources:
  - https://github.com/microsoft/Analysis-Services/blob/master/BestPracticeRules/BPARules.json
---

# Month (as a string) must be sorted

## What it checks

Text columns with Month in the name (but not Months) that have no sort-by column.

## Why it matters

This rule highlights month columns which are strings and are not sorted. If left unsorted, they will sort alphabetically (i.e. April, August...). Make sure to sort such columns so that they sort properly (January, February, March...).

## How to fix it

Add a month number column and set it as the sort-by column.

## Links

- https://github.com/microsoft/Analysis-Services/blob/master/BestPracticeRules/BPARules.json
