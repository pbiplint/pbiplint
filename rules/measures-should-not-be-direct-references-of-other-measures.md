---
id: MEASURES_SHOULD_NOT_BE_DIRECT_REFERENCES_OF_OTHER_MEASURES
name: "Measures should not be direct references of other measures"
category: DAX Expressions
severity: warning
scope: [Measure]
status: ported
video:
sources:
  - https://github.com/microsoft/Analysis-Services/blob/master/BestPracticeRules/BPARules.json
---

# Measures should not be direct references of other measures

## What it checks

Measures whose whole expression is a reference to another measure, such as `[Total Sales]`.

## Why it matters

An alias measure is a second name for the same number. Reports pick one or the other, the two drift apart the first time someone edits the alias instead of the original, and anyone reading the model has to follow the reference to learn what it means.

## How to fix it

Point the reports at the original and delete the alias. If the alias exists only for a friendlier name, rename the original instead; Power BI Desktop updates the visuals that use it.

## Quirks

- Only the exact form matches: `[Measure]` and nothing else. A table prefix, a comment, or a surrounding function passes.

## Links

- https://github.com/microsoft/Analysis-Services/blob/master/BestPracticeRules/BPARules.json
