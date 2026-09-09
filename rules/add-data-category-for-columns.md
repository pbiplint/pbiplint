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

Columns with no data category whose name contains country, continent, or city and whose type is text, or whose name is exactly latitude or longitude and whose type is decimal or double.

## Why it matters

Map visuals bind a field by its data category, not by its name. Without one, a City column is geocoded by guesswork and can land in the wrong country when names repeat, and Latitude and Longitude are treated as ordinary numbers, so they are summed by default and the map draws a single point in the ocean. The category lives on the model, so every report inherits it once it is set, and it costs nothing at refresh or query time.

## How to fix it

In Power BI Desktop, select the column, open Column tools, and choose the Data category. In the TMDL file, add `dataCategory: City`, `dataCategory: Country`, `dataCategory: Continent`, `dataCategory: Latitude`, or `dataCategory: Longitude` under the column.

## Quirks

- The name test is a substring, so a text column called City Code or Country Manager fires too. Latitude and Longitude must match the whole name.

## Links

- https://github.com/microsoft/Analysis-Services/blob/master/BestPracticeRules/BPARules.json
- https://docs.microsoft.com/power-bi/transform-model/desktop-data-categorization
