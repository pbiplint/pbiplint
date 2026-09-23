---
id: AVOID_STRUCTURED_DATA_SOURCES_WITH_PROVIDER_PARTITIONS
name: "Avoid structured data sources with provider partitions"
category: Error Prevention
severity: warning
scope: [Partition]
status: ported
layer: model
video:
sources:
  - https://github.com/microsoft/Analysis-Services/blob/master/BestPracticeRules/BPARules.json
---

# Avoid structured data sources with provider partitions

## What it checks

Partitions whose source is a legacy query, a provider partition, that points at a structured data source.

Each finding names the partition and, beside it, the table the partition belongs to, as `Sales` and `table 'Sales'`. A table with several provider partitions on the same data source gives one finding per partition.

## Example

```tmdl fires
dataSource SQL/localhost;Sales
	connectionDetails =
				{
				  "protocol": "tds",
				  "address": {
				    "server": "localhost",
				    "database": "Sales"
				  }
				}
		authenticationKind: ServiceAccount

table Sales
	column Amount
		dataType: decimal
		sourceColumn: Amount

	partition Sales = query
		mode: import
		source
			query = SELECT Amount FROM dbo.Sales
			dataSource: SQL/localhost;Sales
```

```tmdl fixed
table Sales
	column Amount
		dataType: decimal
		sourceColumn: Amount

	partition Sales = m
		mode: import
		source =
				let
					Source = Sql.Database("localhost", "Sales"),
					Sales = Source{[Schema="dbo",Item="Sales"]}[Data]
				in
					Sales
```

The data source goes with the partition: a Power Query partition carries its connection in the M expression, so once the last provider partition is rewritten there is nothing left for the `dataSource` declaration to serve.

## Why it matters

Power BI supports two combinations: a Power Query partition against any data source, or a legacy provider partition against a legacy provider data source. A provider partition against a structured data source is a mix the service refuses, so the model fails to deploy or refresh. Power BI Desktop never produces the combination; it appears in models migrated from Analysis Services or assembled by hand.

## How to fix it

Rewrite the partition as Power Query, which is what Power BI Desktop writes. In Desktop, choose Transform data, build the query against the source, and load it; Desktop writes an `m` partition every time and has no way to write a provider one. In the TMDL file, change `partition Sales = query` to `partition Sales = m`, replace the `source` block and its `query` and `dataSource` lines with a `source =` block holding the M expression, and delete the `dataSource` declaration from the file that holds it once no partition names it.

The other route keeps the provider partition and changes the data source instead, so both halves are legacy: replace the structured declaration with one that reads `dataSource 'Sales SQL' = provider` and carries a `connectionString`. The walkthrough in the links does that conversion with Tabular Editor.

## When to ignore it

There is no case for keeping the pairing. Power BI rejects it, so the finding is the deployment failure arriving before the deployment. What is worth deciding first is which half to change: if the rest of the model's partitions are Power Query, the provider partition is the leftover and rewriting it is the smaller change; if the model came over from Analysis Services and every partition is a provider one, converting the single data source touches one object instead of many.

## Quirks

- The partition has to name the data source on its `dataSource` line for the rule to see the pairing. A provider partition that names no data source, or names one the model does not declare, is not reported.
- A data source counts as structured unless its declaration says `provider`, so `dataSource 'Sales SQL'` with nothing after the name is read as structured, the same as one with a `connectionDetails` block.
- The finding is on the partition, not on the data source, so one structured data source shared by five provider partitions gives five findings and one edit clears them all.

## Related rules

- `REMOVE_DATA_SOURCES_NOT_REFERENCED_BY_ANY_PARTITIONS` reads the same data sources and reports one that no partition names and no partition's query text mentions, which is what a data source left behind by the rewrite above becomes.
- `MINIMIZE_POWER_QUERY_TRANSFORMATIONS` reads the `m` partitions the rewrite produces and reports one whose M joins, groups, pivots, or adds columns, which is work the source could do instead.

## Links

- [Data source declaration for models served through the XMLA endpoint](https://docs.microsoft.com/power-bi/admin/service-premium-connect-tools#data-source-declaration)
- [Converting a structured data source into a provider data source](https://www.elegantbi.com/post/convertdatasources)
