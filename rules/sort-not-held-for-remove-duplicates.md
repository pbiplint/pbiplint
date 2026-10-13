---
id: SORT_NOT_HELD_FOR_REMOVE_DUPLICATES
name: "Sort may not decide which duplicate is kept"
category: Error Prevention
severity: warning
scope: [Partition, NamedExpression, Table]
status: builtin
layer: powerquery
video:
sources:
---

# Sort may not decide which duplicate is kept

## What it checks

Power Query queries that remove duplicates by some of their columns straight after a sort, with nothing holding the sort's order: a `Table.Distinct` call with a list of columns whose table is a `Table.Sort`, written in place or as the step it reads. Power BI Desktop writes this shape as a Sorted Rows step followed by Removed Duplicates.

Each finding names the partition, the shared expression, or, for an incremental refresh policy's own query, the table. Its detail names the query and the step that removes duplicates, then the sort, as `query 'Customers', step 'Removed Duplicates': nothing holds the order of step 'Sorted Rows', so the sort may not decide which duplicate is kept`. The location is the line and column of the `Table.Distinct` call in the TMDL file.

## Example

```tmdl fires
table Customers
	column 'Customer ID'
		dataType: string
		summarizeBy: none
		sourceColumn: Customer ID

	partition Customers = m
		mode: import
		source =
				let
					Source = #table(type table [#"Customer ID" = text, Updated = date], {{"C1", #date(2025, 1, 1)}, {"C1", #date(2025, 2, 1)}}),
					#"Sorted Rows" = Table.Sort(Source, {{"Updated", Order.Descending}}),
					#"Removed Duplicates" = Table.Distinct(#"Sorted Rows", {"Customer ID"})
				in
					#"Removed Duplicates"
```

```tmdl fixed
table Customers
	column 'Customer ID'
		dataType: string
		summarizeBy: none
		sourceColumn: Customer ID

	partition Customers = m
		mode: import
		source =
				let
					Source = #table(type table [#"Customer ID" = text, Updated = date], {{"C1", #date(2025, 1, 1)}, {"C1", #date(2025, 2, 1)}}),
					#"Sorted Rows" = Table.Buffer(Table.Sort(Source, {{"Updated", Order.Descending}})),
					#"Removed Duplicates" = Table.Distinct(#"Sorted Rows", {"Customer ID"})
				in
					#"Removed Duplicates"
```

## Why it matters

Sorting first is the usual way to choose which row survives: newest first, so that removing duplicates keeps each customer's latest record. The trouble is that Power Query does not promise to keep the order the sort made. Microsoft describes exactly this case: "if you sort a sales table so that each store's largest sale is shown first, you might expect that doing a "Remove duplicates" operation returns only the top sale for each store. And this operation might, in fact, appear to work. However, this behavior isn't guaranteed." ([Common authoring issues, Preserving sort](https://learn.microsoft.com/power-query/common-issues#preserving-sort)). The same page says "sort order isn't guaranteed to be preserved through aggregations (such as `Table.Group`), merges (such as `Table.NestedJoin`), or duplicate removal (such as `Table.Distinct`)", and the page on duplicates repeats it: "Power Query doesn't guarantee that it keeps the first instance in a set of duplicates when it removes duplicates." ([Working with duplicate values, Remove duplicate rows in Power Query](https://learn.microsoft.com/power-query/working-with-duplicates#remove-duplicate-rows-in-power-query)).

So the query can keep the latest row in Power BI Desktop and an older one after a refresh in the service, or after the source changes how it returns rows, with no error either time. The report then shows an out-of-date address, price, or status for some keys, and nothing points at why.

## How to fix it

Keep the sort, and hold its order. In Power BI Desktop, choose Transform data, select the query, and in Applied steps select the Sorted Rows step. In the formula bar, wrap the step's formula in `Table.Buffer( ... )`, as the fixed example does. This is Microsoft's own suggestion: "Buffer the data (using `Table.Buffer`) before applying the downstream operation. In some cases, this operation causes the downstream operation to preserve the buffered sort order." ([Preserving sort](https://learn.microsoft.com/power-query/common-issues#preserving-sort)). Two things to know: a buffer holds the whole table in memory during refresh, so it costs more on a large table, and Microsoft hedges it ("In some cases"). In the TMDL file, the sort is a line of the partition's `source` block, and the same wrap goes around its formula there. It is also the fix the guides on keeping the latest record lead with: "[wrap your sort step in Table.Buffer()](https://www.xelplus.com/power-query-keep-latest-record/#h-the-one-line-fix-table-buffer)".

For a result that does not depend on order at all, replace the two steps. Either Group By the columns that decide what is a duplicate and keep the row with the latest date from each group, as the same guide puts it: "[Group By the columns that define your group, then pull the row with the latest timestamp from each.](https://www.xelplus.com/power-query-keep-latest-record/#h-the-sturdier-fix-group-by-to-keep-the-latest-record)"; or rank the rows, as Microsoft suggests: "order by the column(s) containing the duplicate values, rank based on a tie-breaker column (such as `modified_date`), and then filter to keep just the rank 1 rows" ([Preserving sort](https://learn.microsoft.com/power-query/common-issues#preserving-sort)). In the TMDL file, both steps are lines of the partition's `source` block.

## When to ignore it

When every row that shares the listed columns is the same in every column the query keeps afterwards, which row survives makes no difference, and the sort is only tidying the output. A finding on a query like that is noise: keep the sort, and ignore the finding for that query.

## Quirks

- Only the sort that the `Table.Distinct` reads is checked: one written in place, or the step it names, followed through steps that only give that step another name. A sort several steps earlier, with other steps between, is not reported, though those steps can lose the order as well.
- A `Table.Buffer` around the sort, or a buffered step between the two, holds the order, and the query is not reported.
- A `Table.Distinct` with no list of columns, or with `null` in its place, compares whole rows, so the rows it chooses between are identical and the query is not reported.
- A `Table.Distinct` over another query, even one that ends in a sort, is not reported: only sorts in the same query are read.
- Only duplicate removal is read. A `Table.Group` after a sort can lose the order too, as Microsoft's page says, but it is not reported.
- Each `Table.Distinct` call is its own finding.
- A query whose M does not parse is not read; it gets a `PARSE_ISSUE` finding instead.

## Related rules

- `MINIMIZE_POWER_QUERY_TRANSFORMATIONS` counts `Table.Sort` and `Table.Distinct` among the steps it would rather see in the source, where a database's own `ORDER BY` and `DISTINCT`, or a window function, decide the surviving row with no doubt about order.

## Links

- [Table.Buffer](https://learn.microsoft.com/powerquery-m/table-buffer)
- [Table.Distinct](https://learn.microsoft.com/powerquery-m/table-distinct)
- [Group rows or summarize values](https://learn.microsoft.com/power-query/group-by)
