---
id: REMOVE_DATA_SOURCES_NOT_REFERENCED_BY_ANY_PARTITIONS
name: "Remove data sources not referenced by any partitions"
category: Maintenance
severity: info
scope: [DataSource]
status: ported
layer: model
video:
sources:
  - https://github.com/microsoft/Analysis-Services/blob/master/BestPracticeRules/BPARules.json
---

# Remove data sources not referenced by any partitions

## What it checks

Data sources that no partition names and that appear nowhere in any partition's query or M text.

Each finding names the data source on its own, as `Legacy SQL`, because a data source belongs to the model rather than to a table.

## Example

```tmdl fires
dataSource 'Legacy SQL' = provider
	connectionString: Data Source=contoso;Initial Catalog=Warehouse
	impersonationMode: impersonateServiceAccount

table Sales
	column Amount
		dataType: decimal
		sourceColumn: Amount

	partition Sales = m
		mode: import
		source = let Source = Sql.Database("contoso", "Sales") in Source
```

```tmdl fixed
table Sales
	column Amount
		dataType: decimal
		sourceColumn: Amount

	partition Sales = m
		mode: import
		source = let Source = Sql.Database("contoso", "Sales") in Source
```

## Why it matters

An unused data source is a connection string, and usually a credential, that the model still asks to have configured on every deployment, so the service keeps prompting for credentials to a source nothing reads. It is a leftover from a migration or a source that was replaced.

## How to fix it

Delete the data source. In the project it is a `dataSource` block, usually in a file of its own under the `dataSources` folder: remove the file and the matching `ref` line in `model.tmdl`, or delete the block where it sits. Power BI Desktop does not show data sources, and Transform data, Data source settings lists the sources the queries name rather than these declarations, so the file is the place to do it. If the source is still wanted, point a partition at it instead, with `dataSource:` under the partition's `source` block.

## When to ignore it

A model whose partitions are created after it is deployed, by a pipeline or a script that binds them to a source the files do not yet name, keeps the declaration on purpose, and the finding on it is noise. So is a source you have just added and are about to wire up. Outside those, a data source nothing reads is a leftover, and the credential prompt it produces on every deployment is the cost of keeping it.

## Quirks

- Tabular Editor 3 CLI 0.5.2 did not report this rule when loading from TMDL, although it did from .bim; pbiplint follows the rule text.
- Power BI Desktop never writes data sources, so this rule matters only for hand-built or migrated models.
- The text test is a plain substring match on each partition's query or M text, and letter case has to agree. A data source whose name happens to appear in that text, even inside a comment or inside a longer name, counts as referenced, and a name the partition spells with different capitalization does not match at all.
- The source rule searches each table's source expression as well as every partition's query. pbiplint reads the partitions for both, since that is where a TMDL file keeps the text.

## Related rules

- `AVOID_STRUCTURED_DATA_SOURCES_WITH_PROVIDER_PARTITIONS` reads the same data sources from the other end, reporting a query partition that names a structured data source.
- `TRIM_OBJECT_NAMES` reads data source names and reports one that starts or ends with a space.
