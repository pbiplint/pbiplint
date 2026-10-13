---
id: MINIMIZE_POWER_QUERY_TRANSFORMATIONS
name: "Minimize Power Query transformations"
category: Performance
severity: warning
scope: [Partition]
status: ported
layer: powerquery
video:
sources:
  - https://github.com/microsoft/Analysis-Services/blob/master/BestPracticeRules/BPARules.json
---

# Minimize Power Query transformations

## What it checks

Power Query partitions whose M names Table.Combine, Table.Join, Table.NestedJoin, Table.AddColumn, Table.Group, Table.Sort, Table.Pivot, Table.Unpivot, Table.UnpivotOtherColumns, Table.Distinct, Value.NativeQuery, OleDb.Query, or Odbc.Query, or gives a database connector a native SQL query in its `Query` option.

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

- Only partitions whose source type is M are read. A calculated table's expression is never checked, even where it contains one of these names.
- pbiplint reads the partition's M with Microsoft's Power Query parser, so a native SQL query in a database connector's `Query` option counts however it is written (in lower case, after a comment or a line break, as `WITH`, `DECLARE`, or `EXEC`, or with spaces around the equals sign), and a function name counts only where the M names it, never inside a comment or a text literal. Tabular Editor matches the M text, so it misses such a native query and reports a partition whose only match is in a comment. A transformation also counts where Tabular Editor's text match, which looks for the name and its opening parenthesis together, does not see it: written with a space before the parenthesis, as `Table.Group (`, or passed as a function value, as in `List.Transform(tables, Table.Distinct)`, so pbiplint reports some partitions that Tabular Editor does not.
- The connectors whose `Query` option counts are `Sql.Database`, `Sql.Databases`, `Oracle.Database`, `PostgreSQL.Database`, `MySQL.Database`, `Snowflake.Databases`, `DB2.Database`, `Teradata.Database`, `SapHana.Database`, and `GoogleBigQuery.Database`. `Web.Contents` has a `Query` option of its own, which holds a web request's parameters, and `AnalysisServices.Database`'s holds DAX, MDX, or a DMV query; neither counts. The options record can be written in the call or named, as a `let` step or a shared query that holds it, and a name is followed to the record it stands for; a function's parameter is not followed, since its value is known only when the function is called. A `Query` field given to any other connector, such as a DMV query like `SELECT * FROM $System.TMSCHEMA_TABLES` given to `AnalysisServices.Database`, or a query given to `AmazonRedshift.Database` or `Odbc.DataSource`, does not count, while Tabular Editor's text match reports it when it is written as `[Query="SELECT`, so Tabular Editor reports some partitions that pbiplint does not.
- A partition whose M does not parse is not read, so this rule does not report it; it gets a `PARSE_ISSUE` finding instead, where Tabular Editor's text match may still report it.

## Related rules

- `UNPIVOT_PIVOTED_(MONTH)_DATA` asks for an unpivot, and `Table.UnpivotOtherColumns` is one of the names this rule reads, so doing what that rule asks in Power Query creates a finding here.
- `PARTITION_NAME_SHOULD_MATCH_TABLE_NAME_FOR_SINGLE_PARTITION_TABLES` reads the same partitions and reports the table when a single partition's name is not the table's name.

## Links

- [Query folding in Power Query](https://docs.microsoft.com/power-query/power-query-folding)
