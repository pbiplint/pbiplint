---
id: HARDCODED_SERVER_NAME
name: "Server name written into the query"
category: Maintenance
severity: info
scope: [Partition, NamedExpression, Table]
status: builtin
layer: powerquery
video:
sources:
---

# Server name written into the query

## What it checks

Power Query queries that name a database server as text in a connector such as `Sql.Database`, rather than reading it from a parameter, reported once per query.

Each finding names the partition, the shared expression, or, for an incremental refresh policy's own query, the table. Its detail names the query and the step of the first such call, then the connector, and how many calls the query makes this way when there are more than one, as `query 'Sales', step 'Source': Sql.Database names its server as text (2 calls in this query); a parameter would hold it`. The server's name is not shown, since an internal host name need not travel with an exported report. The location is the line and column of the first such call in the TMDL file.

## Example

```tmdl fires
table Sales
	column OrderID
		dataType: int64
		summarizeBy: none
		sourceColumn: OrderID

	partition Sales = m
		mode: import
		source =
				let
					Source = Sql.Database("finance-sql.example", "Warehouse"),
					Orders = Source{[Schema = "dbo", Item = "Orders"]}[Data]
				in
					Orders
```

```tmdl fixed
expression ServerName = "finance-sql.example" meta [IsParameterQuery = true, Type = "Text", IsParameterQueryRequired = true]

table Sales
	column OrderID
		dataType: int64
		summarizeBy: none
		sourceColumn: OrderID

	partition Sales = m
		mode: import
		source =
				let
					Source = Sql.Database(ServerName, "Warehouse"),
					Orders = Source{[Schema = "dbo", Item = "Orders"]}[Data]
				in
					Orders
```

## Why it matters

A model usually outlives its server: the database moves to a new host, or the model moves from a test server to production. With the server written into each query, that move means finding and editing every query that names it, and missing one leaves a table reading the old server with no error until that server goes away. Microsoft's best practices suggest a parameter for exactly this: "You can even use parameters in some of the arguments of the data connectors. For example, you could create a parameter for your server name when connecting to your SQL Server database." And: "If you change your server location, all you need to do is update the parameter for your server name, and your queries are updated." ([Best practices, Use parameters](https://learn.microsoft.com/power-query/best-practices#use-parameters)).

## How to fix it

In Power BI Desktop, choose Transform data, then Home, Manage Parameters, New Parameter. Give it a name such as ServerName, the type Text, and the server as its current value. Then select the query, select its Source step in Applied steps, open the step's settings with the gear beside it, and choose Parameter, then the new parameter, for Server. Do the same in each query the finding names. In the TMDL file, the parameter is an `expression` with `IsParameterQuery = true`, and the connector's first argument becomes the parameter's name, as the fixed example shows.

## When to ignore it

A model with one query on one server that will never move gains little from a parameter, though the second query that names the server is where it starts to pay. A server name that is itself a placeholder, such as `localhost` in a model built only on one machine, is not worth a parameter either.

## Quirks

- Read: the first argument of `Sql.Database`, `Sql.Databases`, `PostgreSQL.Database`, `MySQL.Database`, `Oracle.Database`, `Snowflake.Databases`, `AnalysisServices.Database`, `AnalysisServices.Databases`, `DB2.Database`, and `Teradata.Database`, written as text in the call or in a step the call reads. The database name, the second argument, is not read.
- One finding per query, on its first such call, with the number of calls in the detail, since most models name their server in every query.
- A server from a parameter is the fix, and is left alone. So is a server from anything else the rule cannot read as text, such as a call or another query.
- A query whose M does not parse is not read; it gets a `PARSE_ISSUE` finding instead.

## Related rules

- `LOCAL_DRIVE_PATH` reports a file path written into a query, which a parameter holds in the same way.
- `DYNAMIC_DATA_SOURCE` reports a server built at run time, which the service cannot refresh; a parameter is the fix for both rules.

## Links

- [Using parameters](https://learn.microsoft.com/power-query/power-query-query-parameters)
- [SQL Server database connector](https://learn.microsoft.com/power-query/connectors/sql-server)
