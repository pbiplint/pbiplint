---
id: UNPIVOT_PIVOTED_(MONTH)_DATA
name: "Unpivot pivoted (month) data"
category: Performance
severity: warning
scope: [Table, CalculatedTable]
status: ported
video:
sources:
  - https://github.com/microsoft/Analysis-Services/blob/master/BestPracticeRules/BPARules.json
  - https://www.elegantbi.com/post/top10bestpractices
---

# Unpivot pivoted (month) data

## What it checks

Tables that have a numeric column for each of Jan, Feb, Mar, Apr, May, and Jun, matched as substrings of the column names.

## Why it matters

A column per month is a spreadsheet layout. In a model it means a measure per month, no way to filter by date, no relationship to the date table, and a schema change every year. Unpivoted into one Month column and one Value column, the same data relates to the date table and every measure and time intelligence function works over it.

## How to fix it

In Power Query, select the month columns, choose Unpivot Columns, and rename the Attribute and Value columns. Then relate the month to the date table.

## Quirks

- Only the first six months are tested, and full names count, so a table with January through June fires and one with only Jul through Dec does not.

## Links

- https://github.com/microsoft/Analysis-Services/blob/master/BestPracticeRules/BPARules.json
- https://www.elegantbi.com/post/top10bestpractices
