---
id: ODBC_WHERE_CONNECTOR_EXISTS
name: "ODBC or OLE DB where Power BI has a connector"
category: Performance
severity: info
scope: [Partition, NamedExpression, Table]
status: builtin
layer: powerquery
video:
sources:
---

# ODBC or OLE DB where Power BI has a connector

## What it checks

ODBC and OLE DB sources whose connection string names the driver or provider of a database Power BI has its own connector for: Amazon Redshift, PostgreSQL, SQL Server, MySQL, Oracle, or Snowflake.

Each finding names the partition, the shared expression, or, for an incremental refresh policy's own query, the table. Its detail names the query, the step, and the connector, as `query 'Orders', step 'Source': the ODBC connection names the Amazon Redshift driver; Power BI has an Amazon Redshift connector`. The connection string itself is not repeated, since it can hold a server's name or a password. The location is the line and column of the call in the TMDL file.

## Example

```tmdl fires
table Orders
	column OrderID
		dataType: int64
		summarizeBy: none
		sourceColumn: order_id

	partition Orders = m
		mode: import
		source =
				let
					Source = Odbc.DataSource("Driver={Amazon Redshift (x64)};Server=redshift.example.com;Database=dev", [HierarchicalNavigation = true]),
					Orders = Source{[Name = "dev", Kind = "Database"]}[Data]{[Name = "public", Kind = "Schema"]}[Data]{[Name = "orders", Kind = "Table"]}[Data]
				in
					Orders
```

```tmdl fixed
table Orders
	column OrderID
		dataType: int64
		summarizeBy: none
		sourceColumn: order_id

	partition Orders = m
		mode: import
		source =
				let
					Source = AmazonRedshift.Database("redshift.example.com", "dev"),
					Orders = Source{[Name = "public"]}[Data]{[Name = "orders"]}[Data]
				in
					Orders
```

## Why it matters

A generic ODBC or OLE DB source knows little about the database behind it, so Power Query can push less of the query's work to that database. Microsoft's advice is to "Choose the purpose-built connector for your data source when one is available. For example, the SQL Server connector provides a better **Get Data** experience than the generic ODBC connector when you connect to a SQL Server database. The SQL Server connector also supports performance features such as query folding." ([Best practices, Choose the right connector](https://learn.microsoft.com/power-query/best-practices#choose-the-right-connector)). With the purpose-built connector, filters and joins run in the database rather than on the refresh machine, and the refresh moves fewer rows. The driver also has to be installed, at the same version, on every machine and gateway that refreshes the model, which the built-in connector does not need. Microsoft's [connector list](https://learn.microsoft.com/power-query/connectors/) shows which connector each database has.

## How to fix it

In Power BI Desktop, choose Get data and the connector the finding names (for example, Amazon Redshift), and connect to the same database to see the navigation it offers. Then choose Transform data, select the original query, select its Source step in Applied steps, and in the formula bar replace the `Odbc.DataSource` or `OleDb.DataSource` call with the connector's function, as the fixed example shows for Amazon Redshift. The navigation steps after it usually change too, since each connector names its databases, schemas, and tables its own way; check that every later step still finds its columns before you delete the query you built to compare. In the TMDL file, the call is in the partition's `source` block.

## When to ignore it

When the connector cannot reach the database the way the driver does: an authentication method, a network setup, or a driver setting the connector does not support, or a driver your organization requires for its own reasons. Check the connector's own page for what it supports before switching. A small table read once a day gains little from folding, so there the finding is a note rather than a task.

## Quirks

- A connection string that names only a DSN, such as `dsn=Sales`, is not reported. The DSN's driver is set on each machine, not in the query; open ODBC Data Sources on the machine that refreshes to see which driver it uses.
- Only the `Driver=` or `Provider=` part is read, its key in any case. SQL Server counts under `SQL Server`, `ODBC Driver 18 for SQL Server`, `SQLNCLI`, `SQLOLEDB`, and `MSOLEDBSQL`.
- The connection string is read where the call writes it, or where a step or a parameter holds it as text. One built at refresh time, or given as a record, is not read.
- A driver named inside `Extended Properties` behind `Provider=MSDASQL`, the OLE DB bridge to ODBC, is not read; only the provider is, and it names no database.
- Each call is its own finding.
- A query whose M does not parse is not read; it gets a `PARSE_ISSUE` finding instead.

## Related rules

- `MINIMIZE_POWER_QUERY_TRANSFORMATIONS` reports `Odbc.Query` and `OleDb.Query`, the native query functions of the same two sources.
- `HARDCODED_SECRET_IN_QUERY` reports a password written into the same connection strings.

## Links

- [ODBC connector](https://learn.microsoft.com/power-query/connectors/odbc)
- [Amazon Redshift connector](https://learn.microsoft.com/power-query/connectors/amazon-redshift)
- [Query folding in Power Query](https://learn.microsoft.com/power-query/power-query-folding)
