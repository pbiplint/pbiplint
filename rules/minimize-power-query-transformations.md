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
---

# Minimize Power Query transformations

## What it checks

Power Query partitions whose M text contains Table.Combine, Table.Join, Table.NestedJoin, Table.AddColumn, Table.Group, Table.Sort, Table.Pivot, Table.Unpivot, Table.UnpivotOtherColumns, Table.Distinct, a native SQL query, or an OLE DB or ODBC query.

Each finding names the partition, as `Sales`, and carries its table beside it, as `table 'Sales'`. Which of the names matched is not in the line, so search the query's M for them.

## Example

```tmdl fires
table Sales
	column 'Order ID'
		dataType: int64
		summarizeBy: none
		sourceColumn: OrderID

	column Amount
		dataType: decimal
		summarizeBy: sum
		sourceColumn: Amount

	partition Sales = m
		mode: import
		source = let Source = Sql.Database("finance", "Warehouse"), Orders = Source{[Item = "Orders"]}[Data], Totals = Table.Group(Orders, {"OrderID"}, {{"Amount", each List.Sum([LineAmount])}}) in Totals
```

```tmdl fixed
table Sales
	column 'Order ID'
		dataType: int64
		summarizeBy: none
		sourceColumn: OrderID

	column Amount
		dataType: decimal
		summarizeBy: sum
		sourceColumn: Amount

	partition Sales = m
		mode: import
		source = let Source = Sql.Database("finance", "Warehouse"), Totals = Source{[Item = "vwOrderTotals"]}[Data] in Totals
```

## Why it matters

These are the steps most likely to stop query folding. When folding stops, Power Query pulls the raw rows and does the work itself on the refresh machine, on every refresh, instead of asking the source for the finished result. On a large table that is the difference between a five-minute refresh and an hour, and the same logic in a view or the warehouse runs once, with indexes.

## How to fix it

Move the work to the source. Create a view that does the join, the grouping, or the pivot, then in Power BI Desktop choose Transform data, point the query at the view, and delete the steps the view now does, so the Applied steps list is Source and little else. In the TMDL file the same text is the partition's `source` block, which is what Transform data edits. Where a step has to stay in Power Query, check that it still folds: right-click the last step in Applied steps and look at View native query, which is greyed out once folding has stopped at or before that step, and move everything after that point upstream. A native SQL query is its own case, because what folds after one depends on the connector; the safer shape is a view the query simply reads, which folds like any other table. Where the source is a file or a folder and there is nowhere upstream to move anything, leave the steps and read the finding as a note about why the refresh takes what it takes.

## When to ignore it

Where there is no upstream to move to, the finding is noise. A folder of CSV exports combined with Table.Combine, a SharePoint list, a workbook someone maintains by hand, an API that returns records to expand: none of these has a view behind it, and Power Query is the only place the work can happen. A step that folds is the second case: Table.Group over a SQL source turns into GROUP BY and costs the refresh nothing, so check View native query before rewriting anything. Size is the third judgment: on a dimension of a few thousand rows the whole question is worth less than the time spent on it. The case to act on is a large fact table whose query folds up to a point and then stops, which is where the rule pays for itself.

## Quirks

- The check is a case-sensitive substring match on the M text, so a function name inside a comment counts too, and a lower-case `table.group(` does not.
- Each of the Table function patterns includes the opening parenthesis, so `Table.Group (` written with a space is not matched. The native-query names carry no parenthesis and match wherever they appear.
- Only partitions whose source type is M are read. A calculated table's expression is never checked, even where it contains one of these names.
- The native-query patterns are `[Query="SELECT`, `Value.NativeQuery`, `OleDb.Query`, and `Odbc.Query`. The first is matched literally, so `[Query = "SELECT` with spaces around the equals sign passes, and so does a lower-case `select`.

## Related rules

- `UNPIVOT_PIVOTED_(MONTH)_DATA` asks for an unpivot, and `Table.UnpivotOtherColumns(` is one of the names this rule matches, so doing what that rule asks in Power Query creates a finding here.
- `PARTITION_NAME_SHOULD_MATCH_TABLE_NAME_FOR_SINGLE_PARTITION_TABLES` reads the same partitions and reports the table when a single partition's name is not the table's name.

## Links

- [Query folding in Power Query](https://docs.microsoft.com/power-query/power-query-folding)
