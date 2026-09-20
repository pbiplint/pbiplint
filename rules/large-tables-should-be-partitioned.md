---
id: LARGE_TABLES_SHOULD_BE_PARTITIONED
name: "Large tables should be partitioned"
category: Performance
severity: warning
scope: [Table]
status: needsLiveModel
video:
sources:
  - https://github.com/microsoft/Analysis-Services/blob/master/BestPracticeRules/BPARules.json
---

# Large tables should be partitioned

## What it checks

Tables with more than 25 million rows and a single partition. The row count is a statistic of the loaded data, not of the model files, so pbiplint lists this rule but does not run it: it needs statistics that only a live model carries.

## Why it matters

A single partition means every refresh reloads the whole table, and a 25-million-row table reloaded nightly is the usual reason a refresh runs for hours or times out. With partitions, only the ones whose data changed are processed, and a failed refresh costs one partition rather than the table. In Power BI that is what incremental refresh sets up for you.

## How to fix it

Find the row count first. In Power BI Desktop's DAX query view, run a query such as `EVALUATE ROW("rows", COUNTROWS('Sales'))` for each table you suspect. Then set up incremental refresh on the ones that are large: define the RangeStart and RangeEnd date parameters in Transform data, filter the table's date column between them, and close and apply; back in the report view, right-click the table in the Data pane, choose Incremental refresh, and set how much history to keep and how much of it to reload each time. In the TMDL file the result is a `refreshPolicy` block under the table beside its one partition, and the dated partitions themselves are created by the service when the model is refreshed after publishing, so a project's files keep showing a single partition. A table that is large but has no date column to range over is partitioned by hand instead, by writing one `partition` block per slice with its own filtered `source`. DAX Studio's VertiPaq Analyzer reads the row count of every table at once if you would rather start from a list than a query per table, and if you already use Tabular Editor, the walkthrough under Links loads the same statistics into its Best Practice Analyzer, which can then run this rule directly.

## Quirks

- The source rule reads a `Vertipaq_RowCount` annotation that a Tabular Editor script writes onto the model after loading VertiPaq statistics. A project's files never carry that annotation, which is why pbiplint lists the rule rather than running it.
- The partition test is for exactly one partition, so a 100-million-row table already split in two is not reported however unbalanced the split is.
- The threshold is a flat 25 million rows. Nothing about the table's width, its column cardinality, or how long its refresh actually takes enters into it.

## Related rules

- `PARTITION_NAME_SHOULD_MATCH_TABLE_NAME_FOR_SINGLE_PARTITION_TABLES` reads the single-partition tables that are half of this rule's condition, and stops applying to a table as soon as it has more than one partition.
- `MINIMIZE_POWER_QUERY_TRANSFORMATIONS` reads the M inside the same partition and reports that partition when its steps are the ones making a refresh slow for the other reason.
- `REDUCE_USAGE_OF_LONG-LENGTH_COLUMNS_WITH_HIGH_CARDINALITY` is the other rule about what a large table costs, and pbiplint lists it without running it for the same reason: the numbers it needs are statistics of the loaded data.

## Links

- [Loading VertiPaq statistics into Tabular Editor's Best Practice Analyzer](https://www.elegantbi.com/post/vertipaqintabulareditor)
