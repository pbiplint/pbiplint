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

M partitions that call heavy transformations: Table.Combine, Table.Join, Table.NestedJoin, Table.AddColumn, Table.Group, Table.Sort, Table.Pivot, Table.Unpivot, Table.UnpivotOtherColumns, Table.Distinct, or native queries.

## Why it matters

Minimize Power Query transformations in order to improve model processing performance. It is a best practice to offload these transformations to the data warehouse if possible. Also, please check whether query folding is occurring within your model. Please reference the article below for more information on query folding.

## How to fix it

Push the transformation into the source system or a view, and check that query folding still occurs.

## Links

- https://github.com/microsoft/Analysis-Services/blob/master/BestPracticeRules/BPARules.json
- https://docs.microsoft.com/power-query/power-query-folding
