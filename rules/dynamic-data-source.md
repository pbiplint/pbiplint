---
id: DYNAMIC_DATA_SOURCE
name: "Data source the service can't refresh"
category: Error Prevention
severity: error
scope: [Partition, NamedExpression, Table]
status: builtin
layer: powerquery
video:
sources:
---

# Data source the service can't refresh

## What it checks

Data sources whose address the Power BI service cannot know before the query runs: a call such as `Web.Contents`, `File.Contents`, or `Sql.Database` whose first argument is read from a table's rows, built by a function call, chosen with `if ... then ... else`, or a custom function's parameter.

Each finding names the partition, the shared expression, or, for an incremental refresh policy's own query, the table. Its detail names the query and the step, then the function and where its address comes from, as `query 'Orders', step 'Added Custom': Web.Contents's address is read from the rows`. The other endings, in the order the detail prefers them when more than one applies, are `is built by a function call`, `is a custom function's parameter`, and `is chosen with if ... then ... else`. The location is the line and column of the call in the TMDL file.

## Example

```tmdl fires
table Orders
	column Body
		dataType: binary
		summarizeBy: none
		sourceColumn: Body

	partition Orders = m
		mode: import
		source =
				let
					Source = #table(type table [url = text], {{"https://api.example.com/v1/orders/1"}, {"https://api.example.com/v1/orders/2"}}),
					#"Added Custom" = Table.AddColumn(Source, "Body", each Web.Contents([url]))
				in
					#"Added Custom"
```

```tmdl fixed
table Orders
	column Body
		dataType: binary
		summarizeBy: none
		sourceColumn: Body

	partition Orders = m
		mode: import
		source =
				let
					Source = #table(type table [id = number], {{1}, {2}}),
					#"Added Custom" = Table.AddColumn(Source, "Body", each Web.Contents("https://api.example.com", [RelativePath = "v1/orders/" & Text.From([id])]))
				in
					#"Added Custom"
```

## Why it matters

Microsoft defines the term: "A *dynamic data source* is a data source in which some or all of the information required to connect can't be determined until Power Query runs its query, because the data is generated in code or returned from another data source." And it says what follows: "In most cases, Power BI semantic models that use dynamic data sources can't be refreshed in the Power BI service. There are a few exceptions in which dynamic data sources can be refreshed in the Power BI service, such as when using the RelativePath and Query options with the Web.Contents M function. Queries that reference Power Query parameters can also be refreshed." ([Refresh and dynamic data sources](https://learn.microsoft.com/power-bi/connect-data/refresh-data#refresh-and-dynamic-data-sources)). The query works in Power BI Desktop, so the problem shows only after publishing, when the model's refresh in the service fails and its reports go on showing old data.

## How to fix it

In Power BI Desktop, choose Transform data, then Data source settings, and select Data sources in current file. Microsoft's own check is to "look for the warning message" there ([Refresh and dynamic data sources](https://learn.microsoft.com/power-bi/connect-data/refresh-data#refresh-and-dynamic-data-sources)). Then select the query, and the step the finding names in Applied steps.

- For a web source, keep the first argument of `Web.Contents` a fixed address or a parameter, and move the part that changes into its `RelativePath` and `Query` options in the formula bar, as the fixed example does. Microsoft's reference says of them: "These options can be used to dynamically query a static base URL." ([Web.Contents, Example 1](https://learn.microsoft.com/powerquery-m/web-contents#example-1)).
- For files and folders, point the source at a parameter (Home, Manage Parameters) holding the path, or read the whole folder once with the Folder or SharePoint folder connector and combine its files, rather than opening one path per row.
- For a database, read the server and database from parameters rather than from another query's data.
- For an address chosen with `if ... then ... else`, hold the address in a parameter and change the parameter's current value (Home, Manage Parameters) instead of choosing in the query. For a custom function, keep the address a fixed text or a parameter inside the function, and pass in only what goes into `RelativePath` and `Query`.

In the TMDL file, the call is in the partition's `source` block.

## When to ignore it

A model that is never published, or never refreshed in the service, can build its addresses however it likes. If Data source settings shows no warning for the source, the service can work it out after all, and you can ignore the finding.

## Quirks

- Only the first argument, the address, is read. `Web.Contents`' `RelativePath` and `Query` options are left alone whatever they hold, since they are Microsoft's route for a request that changes.
- An address held by a parameter, a fixed text, a step that holds one, or text joined with `&` from those, is left alone, however deeply the steps nest.
- An address chosen with `if ... then ... else` is reported whatever its branches hold, because Power BI Desktop reports it: in [a check on October 13, 2026](https://github.com/pbiplint/pbiplint/issues/78#issuecomment-6158143617), Data source settings showed its dynamic source warning for a web address chosen between two fixed texts by a parameter. It counts even when one branch raises an `error`, since Desktop does not evaluate the condition.
- An address that is a custom function's own parameter, or a field of one, is reported, as Desktop reported it in the same check, even when every call passes fixed text.
- A name nothing in the model defines is left alone.
- Each call is its own finding.
- A query whose M does not parse is not read; it gets a `PARSE_ISSUE` finding instead.

## Related rules

- `LOCAL_DRIVE_PATH` reports a fixed path on a local drive; this rule reports an address read from the rows or built at run time.
- `HARDCODED_SERVER_NAME` reports a server written as text; a parameter is the fix for both rules.
- `HARDCODED_SECRET_IN_QUERY` reads the same `Web.Contents` calls for a credential; a key moved into the `Query` record keeps the address static but is still written into the query.

## Links

- [Web.Contents](https://learn.microsoft.com/powerquery-m/web-contents)
- [Using parameters](https://learn.microsoft.com/power-query/power-query-query-parameters)
