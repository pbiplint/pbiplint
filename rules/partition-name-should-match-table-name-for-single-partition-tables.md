---
id: PARTITION_NAME_SHOULD_MATCH_TABLE_NAME_FOR_SINGLE_PARTITION_TABLES
name: "Partition name should match table name for single partition tables"
category: Naming Conventions
severity: info
scope: [Table]
status: ported
layer: model
video:
sources:
  - https://github.com/microsoft/Analysis-Services/blob/master/BestPracticeRules/BPARules.json
---

# Partition name should match table name for single partition tables

## What it checks

Regular tables with exactly one partition whose name differs from the table name. Calculated tables and calculation groups are not checked.

Each finding names the table, as `'Sales'`, not the partition whose name differs, so open the table in the TMDL file to see the name the partition is carrying.

## Example

```tmdl fires
table Sales
	column 'Order ID'
		dataType: int64
		sourceColumn: OrderID
	column Amount
		dataType: decimal
		sourceColumn: Amount
	partition SalesData = m
		mode: import
		source = Sql.Database("contoso", "Sales")
```

```tmdl fixed
table Sales
	column 'Order ID'
		dataType: int64
		sourceColumn: OrderID
	column Amount
		dataType: decimal
		sourceColumn: Amount
	partition Sales = m
		mode: import
		source = Sql.Database("contoso", "Sales")
```

## Why it matters

A single-partition table has no reason for its partition to carry a different name, and when it does it is usually the table's old name from before a rename. Refresh logs, error messages, and the TMDL file all name the partition, so a mismatch sends the reader looking for a table that no longer exists.

## How to fix it

The partition's name sits on its declaration line, so `partition SalesData = m` under `table Sales` becomes `partition Sales = m`. Nothing else in the TMDL file refers to a partition by name, so on a single-partition table the rename changes nothing but the label in the refresh log. Power BI Desktop has no partition list and no field for a partition name: it names the partition when it creates the table and leaves the name alone afterwards, so a mismatch on a Desktop project points at a hand edit, a table renamed outside Desktop, or a model migrated from another tool. If a whole model needs correcting, Tabular Editor's partition editor renames partitions without opening each file.

## When to ignore it

A partition that the people who run the refresh already know by another name can keep it, for example one named after the stored procedure that fills it, because that is the name they will look for when the refresh fails. Outside that, a single partition named anything but its table is a leftover, and the rename costs nothing.

## Quirks

- The condition tests tables with exactly one partition. A table with none, and a table with several, is never reported, whatever its partitions are called.

## Related rules

- `LARGE_TABLES_SHOULD_BE_PARTITIONED` asks a large table for more than one partition, and a table that takes its advice leaves this rule's condition.
- `TRIM_OBJECT_NAMES` reads partition names too, so a partition renamed with a stray space is reported by both rules: the names still do not match.
