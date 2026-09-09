---
id: ISAVAILABLEINMDX_FALSE_NONATTRIBUTE_COLUMNS
name: "Set IsAvailableInMdx to false on non-attribute columns"
category: Performance
severity: warning
scope: [Column, CalculatedColumn, CalculatedTableColumn]
status: ported
video:
sources:
  - https://github.com/microsoft/Analysis-Services/blob/master/BestPracticeRules/BPARules.json
  - https://blog.crossjoin.co.uk/2018/07/02/isavailableinmdx-ssas-tabular/
---

# Set IsAvailableInMdx to false on non-attribute columns

## What it checks

Hidden columns, or columns in hidden tables, that still have IsAvailableInMdx set to true and are not used to sort another column, in a hierarchy, or in a variation, and do not themselves sort by another column.

## Why it matters

When IsAvailableInMdx is true the engine builds an attribute hierarchy for the column at every refresh: a sorted structure that lets Excel and other MDX clients browse the column's values. A hidden column is never browsed, so the structure is built, stored, and rebuilt for nothing. On wide tables with many hidden keys and helper columns that is measurable refresh time and memory.

## How to fix it

Add `isAvailableInMdx: false` under the column in the TMDL file. Power BI Desktop has no setting for this property but keeps the value once it is in the file. With many columns to change, Tabular Editor can set the property on every selected column in one edit; the TMDL edit needs no other tool.

## Quirks

- Power BI Desktop never writes this property, so a Desktop-authored model gets one finding per hidden column until they are set.

## Links

- https://github.com/microsoft/Analysis-Services/blob/master/BestPracticeRules/BPARules.json
- https://blog.crossjoin.co.uk/2018/07/02/isavailableinmdx-ssas-tabular/
