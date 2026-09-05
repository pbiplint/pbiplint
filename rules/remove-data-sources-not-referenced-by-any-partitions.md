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

Data sources that no partition uses or mentions.

## Why it matters

Data sources which are not referenced by any partitions may be removed.

## How to fix it

Delete the data source.

Tabular Editor fix expression: `Delete()`

## Quirks

- Tabular Editor 3 CLI 0.5.2 did not report this rule when loading from TMDL, although it did from .bim; pbiplint follows the rule text.
- Power BI Desktop never writes data sources, so this rule matters only for hand-built or migrated models.

## Links

- https://github.com/microsoft/Analysis-Services/blob/master/BestPracticeRules/BPARules.json
