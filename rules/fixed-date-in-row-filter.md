---
id: FIXED_DATE_IN_ROW_FILTER
name: "Fixed date in a row filter"
category: Maintenance
severity: info
scope: [Partition, NamedExpression, Table]
status: builtin
layer: powerquery
video:
sources:
---

# Fixed date in a row filter

## What it checks

Power Query row filters that end at, or match, a date written into the query: a `Table.SelectRows` condition that compares a column with `<`, `<=`, or `=` to a `#date`, `#datetime`, or `#datetimezone` of fixed numbers.

Each finding names the partition, the shared expression, or, for an incremental refresh policy's own query, the table. Its detail names the query and the step, then the date in long form, as `query 'Sales', step 'Filtered Rows': rows end at a fixed date, December 31, 2025`, or, for `=`, `rows match a fixed date, March 1, 2026`. The location is the line and column of the date in the TMDL file.

## Example

```tmdl fires
table Sales
	column 'Order Date'
		dataType: dateTime
		summarizeBy: none
		sourceColumn: Order Date

	partition Sales = m
		mode: import
		source =
				let
					Source = #table(type table [#"Order Date" = date], {{#date(2025, 6, 1)}}),
					#"Filtered Rows" = Table.SelectRows(Source, each [Order Date] <= #date(2025, 12, 31))
				in
					#"Filtered Rows"
```

```tmdl fixed
table Sales
	column 'Order Date'
		dataType: dateTime
		summarizeBy: none
		sourceColumn: Order Date

	partition Sales = m
		mode: import
		source =
				let
					Source = #table(type table [#"Order Date" = date], {{#date(2025, 6, 1)}}),
					#"Filtered Rows" = Table.SelectRows(Source, each Date.IsInPreviousNYears([Order Date], 3))
				in
					#"Filtered Rows"
```

## Why it matters

A filter that ends on a fixed date is right on the day it was written and quietly wrong after it. A query that keeps rows up to December 31, 2025 goes on refreshing through 2026 without an error, and every visual built on it stops at the end of 2025 while the source fills up with rows the model never loads. Nobody looking at the report can tell. The same goes for `HARDCODED_PERIOD_IN_DAX`, the same mistake in DAX. Microsoft's guidance is to make such filters move with time: "You can implement time-based Power Query filters with parameters, and even set them to use relative time periods" ([Data reduction techniques for Import modeling, Remove unnecessary rows](https://learn.microsoft.com/power-bi/guidance/import-modeling-data-reduction#remove-unnecessary-rows)), and "You can also take advantage of the type-specific filters such as **In the previous** for a date, datetime, or even date timezone column." ([Best practices, Filter data early to improve performance](https://learn.microsoft.com/power-query/best-practices#filter-data-early-to-improve-performance)).

## How to fix it

In Power BI Desktop, choose Transform data, select the query, and in Applied steps select the gear beside the filter step to open Filter Rows. Replace the fixed date with a relative one: on the column's filter menu, choose Date Filters, then **In the Previous**, and set how many days, months, or years to keep, which writes a condition such as `Date.IsInPreviousNYears([Order Date], 3)`, as the fixed example shows. Where the end should stay fixed but be easy to move, put it in a parameter instead: Home, Manage Parameters, New Parameter, of type Date, and compare the column with the parameter. In the TMDL file, the condition is in the partition's `source` block.

## When to ignore it

When the fixed end is the point: an archive table that holds a closed period, a fiscal year that has ended, data before a change of system that a newer table carries on from, or sample data that never changes. A parameter still says so more clearly than a date in a step, but the finding is then a note rather than a task.

## Quirks

- A fixed start (`>` or `>=`) is not reported: history that starts on a fixed date is normal, as a date table that starts on a fixed date is in DAX.
- A date left out with `<>` is not reported either: leaving out a placeholder such as January 1, 1900, or a holiday, does not go stale.
- A table with more than one M partition, each filtered to its own range, is partitioned by hand, and its fixed ranges are the point, so its partitions are not reported.
- A filter whose condition also reads the model's `RangeStart` or `RangeEnd` parameter is incremental refresh's own, and is not reported.
- Only a date of fixed numbers counts. A date built from a parameter, from `DateTime.LocalNow()`, or from another column is not reported.
- A date held in another step, such as `Cutoff = #date(2025, 12, 31)` then `[Date] <= Cutoff`, is not read.
- Only `Table.SelectRows` conditions are read. A fixed date compared elsewhere, such as in a custom column, is not.
- The date is named in long form, without the time of a `#datetime` or the offset of a `#datetimezone`.
- Each date is its own finding, so a filter with a fixed end on two columns has two.
- A query whose M does not parse is not read; it gets a `PARSE_ISSUE` finding instead.

## Related rules

- `HARDCODED_PERIOD_IN_DAX` reports the same problem in DAX: a year or a date fixed in a measure, a calculated column, or a date table.
- `HARDCODED_YEAR_IN_FILTER` reports it in the report: a Filters pane filter held to a fixed year.
- `INCREMENTAL_REFRESH_RANGE_BOUNDS` reads the filters on the incremental refresh range, which this rule leaves alone.

## Links

- [Filter by values in a column, Type-specific filters](https://learn.microsoft.com/power-query/filter-values#type-specific-filters)
- [Using parameters](https://learn.microsoft.com/power-query/power-query-query-parameters)
