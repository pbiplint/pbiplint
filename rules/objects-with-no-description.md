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

Visible tables, columns, measures, and calculation groups with no description. Visibility is the object's own flag.

## Why it matters

The description is the tooltip a report author sees when hovering a field in the field list, and it is the only place in the model to say what a measure counts, which currency a column is in, or which of two similar fields to use. Without it, every author works that out from the name, and gets it wrong at about the same rate. Descriptions also feed documentation tools, so the same sentence pays off twice.

## How to fix it

In Power BI Desktop, open Model view, select the object, and type the Description in the Properties pane. In the TMDL file a description is one or more `///` lines directly above the object. With hundreds of objects, Tabular Editor can paste descriptions into many objects at once; the TMDL comment lines need no other tool.

## Quirks

- Visibility is the object's own isHidden flag: a visible column inside a hidden table is still reported.
- A calculation group table is reported once, as a calculation group.

## Links

- https://github.com/microsoft/Analysis-Services/blob/master/BestPracticeRules/BPARules.json
- https://www.elegantbi.com/post/datadictionary
