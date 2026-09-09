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

Tables that have a row-level security filter in any role and are named as the second argument of USERELATIONSHIP in a measure.

## Why it matters

When a role filters a table, the engine has to apply that filter through the active relationship, and USERELATIONSHIP asks it to swap in an inactive one. The two instructions conflict, so the measure fails for every user in the role while it works for the model owner, who tests without roles. That is a bug you find after publishing.

## How to fix it

Keep row-level security and USERELATIONSHIP on different tables. Either move the filter to another table in the same role, or replace USERELATIONSHIP with a second copy of the dimension that has an active relationship of its own, which is the usual answer for an order date and a ship date.

## Quirks

- Only the second argument of USERELATIONSHIP is compared, and only measures are scanned. A calculation item that calls USERELATIONSHIP is not checked, and a measure that names the secured table as the first argument passes.

## Links

- https://github.com/microsoft/Analysis-Services/blob/master/BestPracticeRules/BPARules.json
- https://blog.crossjoin.co.uk/2013/05/10/userelationship-and-tabular-row-security/
