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

Text columns with month in the name, but not months, that have no sort-by column.

## Why it matters

A text month sorts alphabetically: April, August, December. Every axis and slicer that uses the column shows that order until someone notices, and the fix has to be repeated in each visual unless it is made once on the column.

## How to fix it

Add a month number column, then in Power BI Desktop select the month name column and set Sort by column under Column tools to the number. In the TMDL file the property is `sortByColumn: 'Month Number'` under the column.

## Quirks

- The name test is a substring, so Month Name fires and so does a text column called Monthly Target. Months is excluded, so Months Elapsed passes.

## Links

- https://github.com/microsoft/Analysis-Services/blob/master/BestPracticeRules/BPARules.json
