---
id: REMOVE_DATA_SOURCES_NOT_REFERENCED_BY_ANY_PARTITIONS
name: "Remove data sources not referenced by any partitions"
category: Maintenance
severity: info
scope: [DataSource]
status: ported
video:
sources:
  - https://github.com/microsoft/Analysis-Services/blob/master/BestPracticeRules/BPARules.json
---

# Remove data sources not referenced by any partitions

## What it checks

Data sources that no partition names and that appear nowhere in any partition's query text.

## Why it matters

An unused data source is a connection string, and usually a credential, that the model still asks to have configured on every deployment, so the service keeps prompting for credentials to a source nothing reads. It is a leftover from a migration or a source that was replaced.

## How to fix it

Delete the data source's file from the `dataSources` folder of the project.

## Quirks

- Tabular Editor 3 CLI 0.5.2 did not report this rule when loading from TMDL, although it did from .bim; pbiplint follows the rule text.
- Power BI Desktop never writes data sources, so this rule matters only for hand-built or migrated models.

## Links

- https://github.com/microsoft/Analysis-Services/blob/master/BestPracticeRules/BPARules.json
