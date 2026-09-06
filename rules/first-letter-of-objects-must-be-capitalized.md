---
id: FIRST_LETTER_OF_OBJECTS_MUST_BE_CAPITALIZED
name: "First letter of objects must be capitalized"
category: Formatting
severity: info
scope: [Table, Measure, Hierarchy, CalculatedColumn, CalculatedTable, CalculatedTableColumn, CalculationGroupTable]
status: ported
video:
sources:
  - https://github.com/microsoft/Analysis-Services/blob/master/BestPracticeRules/BPARules.json
---

# First letter of objects must be capitalized

## What it checks

Tables, measures, hierarchies, calculated columns, calculated tables, and calculation groups whose first character is not upper case.

## Why it matters

Object names are the model's user interface: they appear in the field list, on axis labels, in tooltips, and in every export, and nothing capitalizes them for you. A field list that mixes "Sales Amount" with "total cost" reads as unfinished, and it tells a report author that the two fields came from different places and may not be equally trustworthy. Capitalizing the first letter costs nothing, survives every refresh, and is the convention nearly every published model follows. A name starting with a digit or a symbol is not flagged, because those characters have no upper case form.

## How to fix it

Capitalize the first letter.

## Quirks

- Data columns are not in scope; only calculated and calculated-table columns are checked.

## Links

- https://github.com/microsoft/Analysis-Services/blob/master/BestPracticeRules/BPARules.json
