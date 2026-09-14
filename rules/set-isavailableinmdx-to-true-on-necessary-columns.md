---
id: SET_ISAVAILABLEINMDX_TO_TRUE_ON_NECESSARY_COLUMNS
name: "Set IsAvailableInMdx to true on necessary columns"
category: Error Prevention
severity: error
scope: [Column, CalculatedColumn, CalculatedTableColumn]
status: ported
video:
sources:
  - https://github.com/microsoft/Analysis-Services/blob/master/BestPracticeRules/BPARules.json
---

# Set IsAvailableInMdx to true on necessary columns

## What it checks

Columns with IsAvailableInMdx set to false that are used to sort another column, appear in a hierarchy or a variation, or sort by another column.

## Why it matters

A column that sorts another column, or sits in a hierarchy, is used through its attribute hierarchy, and that is exactly what setting IsAvailableInMdx to false removes. The result is a processing error, or a hierarchy that fails in Excel and other MDX clients, usually after someone set the property to false in bulk to save memory.

## How to fix it

Remove the `isAvailableInMdx: false` line from the column in the TMDL file, so the property returns to its default of true.

## Links

- https://github.com/microsoft/Analysis-Services/blob/master/BestPracticeRules/BPARules.json
