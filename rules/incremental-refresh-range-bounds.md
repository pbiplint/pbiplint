---
id: INCREMENTAL_REFRESH_RANGE_BOUNDS
name: "Incremental refresh filter counts a boundary row twice or never"
category: Error Prevention
severity: error
scope: [Partition, NamedExpression, Table]
status: builtin
layer: powerquery
video:
sources:
---

# Incremental refresh filter counts a boundary row twice or never

## What it checks

Power Query queries that filter on both of the model's incremental refresh parameters, `RangeStart` and `RangeEnd`, and either include the boundary on both (`>= RangeStart` and `<= RangeEnd`) or on neither (`> RangeStart` and `< RangeEnd`).

Each finding names the partition, the shared expression, or, for an incremental refresh policy's own query, the table. Its detail names the query and the step, then which way the filter is wrong, as `query 'Sales', step 'Filtered Rows': both RangeStart and RangeEnd include the boundary, so a row on it lands in two partitions`, or `neither RangeStart nor RangeEnd includes the boundary, so a row on it lands in none`. The location is the line and column of the `RangeEnd` comparison when both include the boundary, and of the `RangeStart` comparison when neither does.

## Example

```tmdl fires
expression RangeStart = #datetime(2024, 1, 1, 0, 0, 0) meta [IsParameterQuery = true, Type = "DateTime", IsParameterQueryRequired = true]

expression RangeEnd = #datetime(2025, 1, 1, 0, 0, 0) meta [IsParameterQuery = true, Type = "DateTime", IsParameterQueryRequired = true]

table Sales
	column OrderDate
		dataType: dateTime
		summarizeBy: none
		sourceColumn: OrderDate

	partition Sales = m
		mode: import
		source =
				let
					Source = #table(type table [OrderDate = datetime], {{#datetime(2024, 6, 1, 0, 0, 0)}}),
					#"Filtered Rows" = Table.SelectRows(Source, each [OrderDate] >= RangeStart and [OrderDate] <= RangeEnd)
				in
					#"Filtered Rows"
```

```tmdl fixed
expression RangeStart = #datetime(2024, 1, 1, 0, 0, 0) meta [IsParameterQuery = true, Type = "DateTime", IsParameterQueryRequired = true]

expression RangeEnd = #datetime(2025, 1, 1, 0, 0, 0) meta [IsParameterQuery = true, Type = "DateTime", IsParameterQueryRequired = true]

table Sales
	column OrderDate
		dataType: dateTime
		summarizeBy: none
		sourceColumn: OrderDate

	partition Sales = m
		mode: import
		source =
				let
					Source = #table(type table [OrderDate = datetime], {{#datetime(2024, 6, 1, 0, 0, 0)}}),
					#"Filtered Rows" = Table.SelectRows(Source, each [OrderDate] >= RangeStart and [OrderDate] < RangeEnd)
				in
					#"Filtered Rows"
```

## Why it matters

Incremental refresh splits a table into partitions by date, and the service fills each one by running the query with `RangeStart` and `RangeEnd` set to that partition's first moment and the next partition's first moment. The end of one partition is the start of the next, so a row stamped exactly on that moment must pass one filter and fail the other. Microsoft's instruction is plain: "Verify queries have an equal to (=) on either RangeStart or RangeEnd, but not both. If the equal to (=) exists on both parameters, a row could satisfy the conditions for two partitions, which could lead to duplicate data in the model." ([Configure incremental refresh, Filter data](https://learn.microsoft.com/power-bi/connect-data/incremental-refresh-configure#filter-data)). With the equals sign on neither, the same row passes no filter at all and never loads. Dates without a time of day sit on the boundary at midnight, so on a date column the rows of the first day of every partition are counted twice or lost. Either way the totals are wrong, nothing fails, and the error grows with every partition.

## How to fix it

In Power BI Desktop, choose Transform data, select the query, and in Applied steps select the gear beside the filter step (usually Filtered Rows) to open Filter Rows. Make the first condition **is after or equal to** `RangeStart` and the second **is before** `RangeEnd`, as Microsoft's [Filter data](https://learn.microsoft.com/power-bi/connect-data/incremental-refresh-configure#filter-data) walkthrough shows. Any pair with exactly one equals sign works; that one is the most common. In the TMDL file, change `<=` to `<` (or `>` to `>=`) in the partition's `source` block. When the table has a `refreshPolicy`, Desktop writes the same query as its `sourceExpression`; change it there too, or open the query in Desktop, which keeps the two in step.

## When to ignore it

A column that can never hold a value equal to a boundary, such as a timestamp that always carries seconds past midnight, cannot double or lose a row today. The fix still costs one character and keeps holding if the data changes, so there is rarely a reason to keep the finding.

## Quirks

- Comparisons are read anywhere in the query, in either order (`RangeStart <= [OrderDate]` reads as `[OrderDate] >= RangeStart`), and with the parameter inside a call, as in `DateKey(RangeStart)` for an integer date key, or held by a step.
- Only the model's own parameters count: shared expressions named `RangeStart` and `RangeEnd` that are Power Query parameters. A step or a function parameter with the same name hides the model's parameter, and its comparison is not read.
- A query that compares one parameter both ways, with and without the equals sign, is left alone, since which comparison filters cannot be told from the text.
- A query that compares with only one of the two parameters, or that uses `=` or `<>` with them, is not reported.
- The refresh policy's own query is read only when it differs from the partition's, so a table where Desktop writes the same query in both places has one finding, on the partition.
- A query whose M does not parse is not read; it gets a `PARSE_ISSUE` finding instead.

## Related rules

- `LARGE_TABLES_SHOULD_BE_PARTITIONED` asks for incremental refresh on a large table; this rule checks the filter that incremental refresh depends on.

## Links

- [Incremental refresh and real-time data for semantic models](https://learn.microsoft.com/power-bi/connect-data/incremental-refresh-overview)
- [Configure incremental refresh, Create parameters](https://learn.microsoft.com/power-bi/connect-data/incremental-refresh-configure#create-parameters)
