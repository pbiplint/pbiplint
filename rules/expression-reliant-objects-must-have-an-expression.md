---
id: EXPRESSION_RELIANT_OBJECTS_MUST_HAVE_AN_EXPRESSION
name: "Expression-reliant objects must have an expression"
category: Error Prevention
severity: error
scope: [Measure, CalculatedColumn, CalculationItem]
status: ported
video:
sources:
  - https://github.com/microsoft/Analysis-Services/blob/master/BestPracticeRules/BPARules.json
---

# Expression-reliant objects must have an expression

## What it checks

Measures, calculated columns, and calculation items whose expression is empty.

## Why it matters

Without an expression the object cannot be evaluated: a measure returns nothing, a calculated column is empty, and a calculation item does nothing. Depending on the engine version the deployment fails outright, and the error points at the object without saying why.

## How to fix it

Add the DAX, or delete the object.

## Quirks

- Cannot fire on a TMDL file: the TMDL reader takes the next indented line as the expression, so an empty expression never survives loading.

## Links

- https://github.com/microsoft/Analysis-Services/blob/master/BestPracticeRules/BPARules.json
