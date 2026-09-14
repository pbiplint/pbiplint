---
id: MINIMIZE_POWER_QUERY_TRANSFORMATIONS
name: "Minimize Power Query transformations"
category: Performance
severity: warning
scope: [Partition]
status: ported
video:
sources:
  - https://github.com/microsoft/Analysis-Services/blob/master/BestPracticeRules/BPARules.json
  - https://docs.microsoft.com/power-query/power-query-folding
---

# Minimize Power Query transformations

## What it checks

Power Query partitions whose M text contains Table.Combine, Table.Join, Table.NestedJoin, Table.AddColumn, Table.Group, Table.Sort, Table.Pivot, Table.Unpivot, Table.UnpivotOtherColumns, Table.Distinct, a native SQL query, or an OLE DB or ODBC query.

## Why it matters

These are the steps most likely to stop query folding. When folding stops, Power Query pulls the raw rows and does the work itself on the refresh machine, on every refresh, instead of asking the source for the finished result. On a large table that is the difference between a five-minute refresh and an hour, and the same logic in a view or the warehouse runs once, with indexes.

## How to fix it

Move the join, grouping, or pivot into the source as a view or a table and point the query at that. Where a step has to stay in Power Query, check that the steps before it still fold by right-clicking the step and looking for View Native Query. A native query folds nothing after it, so put it first or replace it with a view.

## Quirks

- The check is a case-sensitive substring match on the M text, so a function name inside a comment counts too.

## Links

- https://github.com/microsoft/Analysis-Services/blob/master/BestPracticeRules/BPARules.json
- https://docs.microsoft.com/power-query/power-query-folding
