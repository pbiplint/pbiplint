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

Add the Data Category property for geographic columns. Without it, the mapping visuals have to guess what a text column means, and they guess wrong often enough to matter: a City column with ambiguous names can plot in the wrong country, and Latitude and Longitude are treated as ordinary numbers, so they get summed by default and place a single point in the middle of the ocean. Setting the category tells the visuals how to bind the column and how to geocode it, and it travels with the model, so every report inherits it. It is a one-time property change with no cost to refresh or query performance.

## How to fix it

Set the data category so maps and the service recognize the column.

## Links

- https://github.com/microsoft/Analysis-Services/blob/master/BestPracticeRules/BPARules.json
- https://docs.microsoft.com/power-bi/transform-model/desktop-data-categorization
