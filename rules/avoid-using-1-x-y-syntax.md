---
id: AVOID_USING_'1-(X/Y)'_SYNTAX
name: "Avoid using '1-(x/y)' syntax"
category: DAX Expressions
severity: warning
scope: [Measure, CalculatedColumn, CalculationItem]
status: ported
video:
sources:
  - https://github.com/microsoft/Analysis-Services/blob/master/BestPracticeRules/BPARules.json
---

# Avoid using '1-(x/y)' syntax

## What it checks

Expressions with a number, then plus or minus, then either `SUM('Table'[Column])` followed by a division operator, or a call to DIVIDE. The common shape is `1 - SUM(Sales[Cost]) / SUM(Sales[Amount])`.

## Why it matters

Written that way the measure always returns a value. When there are no rows, the division is blank, one minus blank is one, and every empty cell in the matrix shows 100 percent. The visual fills with rows that should not be there, and the query does extra work to produce them. Written as a single DIVIDE over the difference, the measure is blank when the data is blank and the engine skips those rows.

## How to fix it

Rewrite `1 - x / y` as `DIVIDE(y - x, y)`, and hold the shared denominator in a variable when it is used twice:

```
Margin % =
VAR Sales = SUM ( Sales[Amount] )
RETURN DIVIDE ( Sales - SUM ( Sales[Cost] ), Sales )
```

## Quirks

- The pattern needs SUM as the numerator, or DIVIDE right after the number. `1 - [Cost] / [Sales]` and `1 - AVERAGE(...) / ...` are not matched.
- Table and column names must contain only letters, digits, spaces, and underscores for the SUM form to match.

## Links

- https://github.com/microsoft/Analysis-Services/blob/master/BestPracticeRules/BPARules.json
