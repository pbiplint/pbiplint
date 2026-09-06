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

Tables with Date or Calendar in the name that are not marked as a date table.

## Why it matters

This rule looks for tables that contain the words 'date' or 'calendar' as they should likely be marked as a date table.

## How to fix it

Mark the table as a date table (Table tools, Mark as date table) using a DateTime key column.

## Links

- https://github.com/microsoft/Analysis-Services/blob/master/BestPracticeRules/BPARules.json
- https://docs.microsoft.com/power-bi/transform-model/desktop-date-tables
