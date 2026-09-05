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

Query (provider) partitions that reference a structured data source.

## Why it matters

Power BI does not support provider (a.k.a. 'legacy') partitions which reference structured data sources. Partitions which reference structured data sources must use the M-language. Otherwise, 'provider' partitions must reference a 'provider' data source. This can be resolved by converting the structured data source into a provider data source (see 2nd reference link below).

## How to fix it

Convert the partition to M, or convert the data source to a provider data source.

## Links

- https://github.com/microsoft/Analysis-Services/blob/master/BestPracticeRules/BPARules.json
- https://docs.microsoft.com/power-bi/admin/service-premium-connect-tools#data-source-declaration
- https://www.elegantbi.com/post/convertdatasources
