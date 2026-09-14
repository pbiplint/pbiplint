---
id: DATE/CALENDAR_TABLES_SHOULD_BE_MARKED_AS_A_DATE_TABLE
name: "Date/calendar tables should be marked as a date table"
category: Performance
severity: warning
scope: [Table, CalculatedTable]
status: ported
video:
sources:
  - https://github.com/microsoft/Analysis-Services/blob/master/BestPracticeRules/BPARules.json
  - https://docs.microsoft.com/power-bi/transform-model/desktop-date-tables
---

# Date/calendar tables should be marked as a date table

## What it checks

Tables with date or calendar in the name that are not marked as a date table, meaning the data category is not Time or no DateTime column is marked as the key.

## Why it matters

Marking the date table tells the engine which column is the calendar key, and every time intelligence function relies on it: DATESYTD, SAMEPERIODLASTYEAR, and the rest return wrong or blank results over an unmarked table without raising any error. Marking it also lets you turn off Auto date/time, which otherwise adds a hidden date table for every date column in the model.

## How to fix it

In Power BI Desktop, select the table, open Table tools, choose Mark as date table, and pick the date column. In the TMDL file the result is `dataCategory: Time` on the table and `isKey` on the date column.

## Quirks

- The name test is a substring, so a table called Updates or Candidates fires too.

## Links

- https://github.com/microsoft/Analysis-Services/blob/master/BestPracticeRules/BPARules.json
- https://docs.microsoft.com/power-bi/transform-model/desktop-date-tables
