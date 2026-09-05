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

Microsoft's Best Practice Analyzer includes this rule under Formatting.

## How to fix it

Capitalize the first letter.

## Quirks

- Data columns are not in scope; only calculated and calculated-table columns are checked.

## Links

- https://github.com/microsoft/Analysis-Services/blob/master/BestPracticeRules/BPARules.json
