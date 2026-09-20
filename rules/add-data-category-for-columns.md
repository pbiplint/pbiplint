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
---

# Add data category for columns

## What it checks

Columns with no data category whose name contains country, continent, or city and whose type is text, or whose name is exactly latitude or longitude and whose type is decimal or double.

Each finding names the column, as `'Customer'[City]`.

## Example

```tmdl fires
table Customer
	column 'Customer ID'
		dataType: int64
		isKey
		summarizeBy: none
		sourceColumn: Customer ID

	column City
		dataType: string
		summarizeBy: none
		sourceColumn: City
```

```tmdl fixed
table Customer
	column 'Customer ID'
		dataType: int64
		isKey
		summarizeBy: none
		sourceColumn: Customer ID

	column City
		dataType: string
		dataCategory: City
		summarizeBy: none
		sourceColumn: City
```

## Why it matters

Map visuals bind a field by its data category, not by its name. Without one, a City column is geocoded by guesswork and can land in the wrong country when names repeat, and Latitude and Longitude are treated as ordinary numbers, so they are summed by default and the map draws a single point in the ocean. The category lives on the model, so every report inherits it once it is set, and it costs nothing at refresh or query time.

## How to fix it

In Power BI Desktop, select the column in the Data pane, open Column tools, and pick the Data category. In the TMDL file, add the property under the column: `dataCategory: City`, `dataCategory: Country`, `dataCategory: Continent`, `dataCategory: Latitude`, or `dataCategory: Longitude`. The property is metadata only, so setting it changes nothing about what the refresh loads or how the column compresses.

## When to ignore it

A column the name test catches that holds no geography is the case to look for first: Country Manager is a person, City Code is an internal code nobody plots, and giving either a data category would be wrong rather than merely unnecessary. A latitude and longitude pair that only ever feeds a distance calculation is in the same position, since nothing binds it to a map. Where the column really is a place name and a report shows it on a map, there is no reason to leave the category off.

## Quirks

- The country, continent, and city tests are substrings, matched without regard to letter case, so a text column called City Code or Country Manager is reported. Latitude and longitude must be the whole name, also without regard to case.
- The type gate goes with the name. A Country column stored as a whole number is not reported, and neither is a Latitude column stored as text, because the rule wants text for the first group and decimal or double for the second.
- Only the presence of a category is tested, not which one it is, so any value clears the finding. A City column given a Web URL category passes.

## Related rules

- `NUMERIC_COLUMN_SUMMARIZE_BY` reports a visible Latitude or Longitude column as well, because a decimal column with the default summarization is what it reads. The data category does not clear it; setting the summarization to none does.

## Links

- [Data categorization in Power BI Desktop](https://docs.microsoft.com/power-bi/transform-model/desktop-data-categorization)
