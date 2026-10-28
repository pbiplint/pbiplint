---
id: SCRIPT_IN_QUERY
name: "Python or R script in a query"
category: Error Prevention
severity: warning
scope: [Partition, NamedExpression, Table]
status: builtin
layer: powerquery
video:
sources:
---

# Python or R script in a query

## What it checks

Power Query queries that run a Python or R script: a `Python.Execute` or `R.Execute` call, which the Run Python script and Run R script steps write.

Each finding names the partition, the shared expression, or, for an incremental refresh policy's own query, the table. Its detail names the query, the step, and the function, as `query 'Scores', step 'Run Python script': Python.Execute refreshes only through a personal gateway on a machine with Python installed`. The location is the line and column of the call in the TMDL file.

## Example

```tmdl fires
table Scores
	column Score
		dataType: double
		summarizeBy: none
		sourceColumn: Score

	partition Scores = m
		mode: import
		source =
				let
					Source = #table(type table [Score = number], {{1}, {2}}),
					#"Run Python script" = Python.Execute("dataset['Score'] = dataset['Score'] * 2", [dataset = Source]),
					Scores = #"Run Python script"{[Name = "dataset"]}[Value]
				in
					Scores
```

```tmdl fixed
table Scores
	column Score
		dataType: double
		summarizeBy: none
		sourceColumn: Score

	partition Scores = m
		mode: import
		source =
				let
					Source = #table(type table [Score = number], {{1}, {2}}),
					#"Doubled Score" = Table.TransformColumns(Source, {{"Score", each _ * 2, type number}})
				in
					#"Doubled Score"
```

## Why it matters

A script step runs on the machine that refreshes the model, so that machine needs Python or R and every package the script imports. The service has neither, and the gateways most organizations run cannot take its place: "You can't use an enterprise gateway to refresh semantic models containing R scripts in Power Query" ([Use R in Power Query Editor, Considerations and limitations](https://learn.microsoft.com/power-bi/transform-model/desktop-r-in-query-editor#considerations-and-limitations)), and for Python, "You need a Personal Gateway installed on the machine where the file is located, and where Python is installed" ([Use Python in Power BI Power Query Editor, Create visuals from Python script data](https://learn.microsoft.com/power-bi/transform-model/desktop-python-in-query-editor#create-visuals-from-python-script-data)). A personal gateway belongs to one person on one machine. When that machine is off, asleep, or missing a package after an update, the refresh fails, and nobody else can fix it from the service.

## How to fix it

In Power BI Desktop, choose Transform data, select the query, and find the Run Python script or Run R script step in Applied steps. Move what the script does upstream, into a view in the database or a notebook in Fabric that writes a table the query reads, or rebuild it with Power Query's own steps: most column arithmetic is Add Column or Transform, and most reshaping is Group By, Pivot Column, or Unpivot Columns. Then right-click the script step and choose Delete. Where the script has to stay, say so plainly to whoever owns the refresh: it then depends on a [personal gateway](https://learn.microsoft.com/power-bi/connect-data/service-gateway-personal-mode) on one machine with the same Python or R and the same packages. In the TMDL file, the step is a line of the partition's `source` block.

## When to ignore it

A model refreshed only in Power BI Desktop, such as a prototype or a personal analysis, never meets the gateway limit, so the finding is noise there. A team that has chosen a personal gateway on a managed machine, knows who owns it, and accepts that refresh stops when it does can leave the script; the finding then records the dependency. Python and R visuals are not reported: they live in the report and do not affect refresh.

## Quirks

- Only a call is read. `Python.Execute` passed as a function value, or named inside text, is not reported.
- Each call is its own finding, so a query with a Python step and an R step has two.
- A query whose M does not parse is not read; it gets a `PARSE_ISSUE` finding instead.

## Related rules

- `LOCAL_DRIVE_PATH` reports a file on a local drive, the other source that refreshes only through a gateway on one machine.

## Links

- [Run Python scripts in Power BI Desktop](https://learn.microsoft.com/power-bi/connect-data/desktop-python-scripts)
- [Run R scripts in Power BI Desktop](https://learn.microsoft.com/power-bi/connect-data/desktop-r-scripts)
