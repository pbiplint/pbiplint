---
id: AVOID_DUPLICATE_MEASURES
name: "No two measures should have the same definition"
category: DAX Expressions
severity: warning
scope: [Measure]
status: ported
video:
sources:
  - https://github.com/microsoft/Analysis-Services/blob/master/BestPracticeRules/BPARules.json
---

# No two measures should have the same definition

## What it checks

Two or more measures with the same DAX after removing whitespace.

## Why it matters

Two measures with different names and defined by the same DAX expression should be avoided to reduce redundancy.

## How to fix it

Keep one measure and reference it from the other, or delete the duplicate.

## Links

- https://github.com/microsoft/Analysis-Services/blob/master/BestPracticeRules/BPARules.json
