---
id: AVOID_THE_USERELATIONSHIP_FUNCTION_AND_RLS_AGAINST_THE_SAME_TABLE
name: "Avoid the USERELATIONSHIP function and RLS against the same table"
category: Error Prevention
severity: error
scope: [Table, CalculatedTable]
status: ported
video:
sources:
  - https://github.com/microsoft/Analysis-Services/blob/master/BestPracticeRules/BPARules.json
  - https://blog.crossjoin.co.uk/2013/05/10/userelationship-and-tabular-row-security/
---

# Avoid the USERELATIONSHIP function and RLS against the same table

## What it checks

Tables that have row-level security and are the target of USERELATIONSHIP in a measure.

## Why it matters

The USERELATIONSHIP function may not be used against a table which also leverages row-level security (RLS). This will generate an error when using the particular measure in a visual. This rule will highlight the table which is used in a measure's USERELATIONSHIP function as well as RLS.

## How to fix it

Remove the row-level security from that table, or avoid USERELATIONSHIP against it.

## Links

- https://github.com/microsoft/Analysis-Services/blob/master/BestPracticeRules/BPARules.json
- https://blog.crossjoin.co.uk/2013/05/10/userelationship-and-tabular-row-security/
