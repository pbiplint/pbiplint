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

Two or more measures whose DAX is identical once spaces, tabs, and line breaks are removed. Every copy is reported.

## Why it matters

Two names for one calculation split the reader's trust: nobody can tell which is the real one, reports end up using both, and the next change gets made to one copy only. When both appear in the same visual the engine also evaluates them separately, so the duplicate costs query time as well as confusion.

## How to fix it

Keep one measure and delete the other. If existing reports depend on both names, keep the second one for now as a plain reference to the first, `Sales Amount = [Total Sales]`, and retire it once the reports are moved.

## Quirks

- The comparison is exact apart from whitespace. Two measures that differ only in a comment or in letter case are not duplicates to this rule.

## Links

- https://github.com/microsoft/Analysis-Services/blob/master/BestPracticeRules/BPARules.json
