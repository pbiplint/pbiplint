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

Measures, calculated columns, and calculation items with an empty expression.

## Why it matters

Calculated columns, calculation items and measures must have an expression. Without an expression, these objects will not show any values.

## How to fix it

Add the DAX expression or delete the object.

## Quirks

- Cannot fire on a TMDL file: the TMDL reader takes the next indented line as the expression, so an empty expression never survives loading.

## Links

- https://github.com/microsoft/Analysis-Services/blob/master/BestPracticeRules/BPARules.json
