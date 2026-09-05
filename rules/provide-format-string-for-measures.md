---
id: PROVIDE_FORMAT_STRING_FOR_MEASURES
name: "Provide format string for measures"
category: Formatting
severity: error
scope: [Measure]
status: ported
video:
sources:
  - https://github.com/microsoft/Analysis-Services/blob/master/BestPracticeRules/BPARules.json
---

# Provide format string for measures

## What it checks

Visible measures with no format string and no dynamic format string.

## Why it matters

Visible measures should have their format string property assigned

## How to fix it

Set a format string on the measure.

## Links

- https://github.com/microsoft/Analysis-Services/blob/master/BestPracticeRules/BPARules.json
