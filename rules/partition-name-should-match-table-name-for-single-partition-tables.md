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

Tables with a single partition whose name differs from the table name.

## Why it matters

Tables with just one partition should match their table and partition names.Tables with more than one partition should have each partition name starting with the table name.

## How to fix it

Rename the partition to the table name.

Tabular Editor fix expression: `Partitions[0].Name = it.Name`

## Links

- https://github.com/microsoft/Analysis-Services/blob/master/BestPracticeRules/BPARules.json
