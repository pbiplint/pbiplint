---
id: PARTITION_NAME_SHOULD_MATCH_TABLE_NAME_FOR_SINGLE_PARTITION_TABLES
name: "Partition name should match table name for single partition tables"
category: Naming Conventions
severity: info
scope: [Table]
status: ported
video:
sources:
  - https://github.com/microsoft/Analysis-Services/blob/master/BestPracticeRules/BPARules.json
---

# Partition name should match table name for single partition tables

## What it checks

Regular tables with exactly one partition whose name differs from the table name. Calculated tables and calculation groups are not checked.

## Why it matters

A single-partition table has no reason for its partition to carry a different name, and when it does it is usually the table's old name from before a rename. Refresh logs, error messages, and the TMDL file all name the partition, so a mismatch sends the reader looking for a table that no longer exists.

## How to fix it

Rename the partition in the TMDL file: the line `partition 'Old Name' = m` becomes `partition 'Table Name' = m`. Power BI Desktop names the partition after the table when it creates it, so on a Desktop project this usually points at a hand edit or a migrated model.

## Links

- https://github.com/microsoft/Analysis-Services/blob/master/BestPracticeRules/BPARules.json
