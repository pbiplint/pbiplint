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

Hidden columns, or columns in hidden tables, that are not used for sorting, in hierarchies, or in variations, and still have IsAvailableInMdx set to true.

## Why it matters

To speed up processing time and conserve memory after processing, attribute hierarchies should not be built for columns that are never used for slicing by MDX clients. In other words, all hidden columns that are not used as a Sort By Column or referenced in user hierarchies should have their IsAvailableInMdx property set to false.

## How to fix it

Set `isAvailableInMdx: false` on the column so no attribute hierarchy is built for it.

Tabular Editor fix expression: `IsAvailableInMDX = false`

## Links

- https://github.com/microsoft/Analysis-Services/blob/master/BestPracticeRules/BPARules.json
- https://blog.crossjoin.co.uk/2018/07/02/isavailableinmdx-ssas-tabular/
