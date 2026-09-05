---
id: ADD_DATA_CATEGORY_FOR_COLUMNS
name: "Add data category for columns"
category: Formatting
severity: info
scope: [Column, CalculatedColumn, CalculatedTableColumn]
status: ported
video:
sources:
  - https://github.com/microsoft/Analysis-Services/blob/master/BestPracticeRules/BPARules.json
  - https://docs.microsoft.com/power-bi/transform-model/desktop-data-categorization
---

# Add data category for columns

## What it checks

Text columns named with country, continent, or city, and decimal or double columns named latitude or longitude, that have no data category.

## Why it matters

Add Data Category property for appropriate columns.

## How to fix it

Set the data category so maps and the service recognize the column.

## Links

- https://github.com/microsoft/Analysis-Services/blob/master/BestPracticeRules/BPARules.json
- https://docs.microsoft.com/power-bi/transform-model/desktop-data-categorization
