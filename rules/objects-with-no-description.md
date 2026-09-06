---
id: OBJECTS_WITH_NO_DESCRIPTION
name: "Visible objects with no description"
category: Maintenance
severity: info
scope: [Table, Measure, Column, CalculatedColumn, CalculatedTable, CalculatedTableColumn, CalculationGroupTable]
status: ported
video:
sources:
  - https://github.com/microsoft/Analysis-Services/blob/master/BestPracticeRules/BPARules.json
  - https://www.elegantbi.com/post/datadictionary
---

# Visible objects with no description

## What it checks

Visible tables, columns, measures, and calculation groups without a description.

## Why it matters

Add descriptions to objects. These descriptions are shown on hover within the Field List in Power BI Desktop. Additionally, you can leverage these descriptions to create an automated data dictionary (see link below).

## How to fix it

Add a description; it shows on hover in the field list.

## Quirks

- Visibility is the object's own isHidden flag: a visible column inside a hidden table is still reported.
- A calculation group table is reported once, as a calculation group.

## Links

- https://github.com/microsoft/Analysis-Services/blob/master/BestPracticeRules/BPARules.json
- https://www.elegantbi.com/post/datadictionary
