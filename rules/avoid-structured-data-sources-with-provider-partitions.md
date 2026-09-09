---
id: AVOID_STRUCTURED_DATA_SOURCES_WITH_PROVIDER_PARTITIONS
name: "Avoid structured data sources with provider partitions"
category: Error Prevention
severity: warning
scope: [Partition]
status: ported
video:
sources:
  - https://github.com/microsoft/Analysis-Services/blob/master/BestPracticeRules/BPARules.json
  - https://docs.microsoft.com/power-bi/admin/service-premium-connect-tools#data-source-declaration
  - https://www.elegantbi.com/post/convertdatasources
---

# Avoid structured data sources with provider partitions

## What it checks

Partitions whose source is a legacy query, a provider partition, that points at a structured data source.

## Why it matters

Power BI supports two combinations: a Power Query partition against any data source, or a legacy provider partition against a legacy provider data source. A provider partition against a structured data source is a mix the service refuses, so the model fails to deploy or refresh. Power BI Desktop never produces the combination; it appears in models migrated from Analysis Services or assembled by hand.

## How to fix it

Rewrite the partition as Power Query, which is what Desktop would write: in the TMDL file, change `partition Sales = query` to `partition Sales = m` and replace the query text with an M expression such as `let Source = Sql.Database("server", "db") in Source{[Schema="dbo",Item="Sales"]}[Data]`. The other option is to change the data source itself to a provider data source so both halves are legacy; the elegantbi post in the links shows that conversion with Tabular Editor.

## Links

- https://github.com/microsoft/Analysis-Services/blob/master/BestPracticeRules/BPARules.json
- https://docs.microsoft.com/power-bi/admin/service-premium-connect-tools#data-source-declaration
- https://www.elegantbi.com/post/convertdatasources
