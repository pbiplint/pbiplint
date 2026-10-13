---
id: KEEP_FIRST_ROWS_LEFT_IN
name: "Keep First Rows left in a loaded query"
category: Error Prevention
severity: warning
scope: [Partition, NamedExpression, Table]
status: builtin
layer: powerquery
video:
sources:
---

# Keep First Rows left in a loaded query

## What it checks

Power Query queries that load into the model and keep only their first rows: a `Table.FirstN` call with a number greater than 1, the Keep First Rows step, whose table is not sorted first.

Each finding names the partition or, for an incremental refresh policy's own query, the table. Its detail names the query, the step, and the number of rows, as `query 'Orders', step 'Kept First Rows': only the first 1000 rows load`. The location is the line and column of the `Table.FirstN` call in the TMDL file.

## Example

```tmdl fires
table Orders
	column OrderID
		dataType: int64
		summarizeBy: none
		sourceColumn: OrderID

	partition Orders = m
		mode: import
		source =
				let
					Source = #table(type table [OrderID = number], {{1}, {2}, {3}}),
					#"Kept First Rows" = Table.FirstN(Source, 1000)
				in
					#"Kept First Rows"
```

```tmdl fixed
table Orders
	column OrderID
		dataType: int64
		summarizeBy: none
		sourceColumn: OrderID

	partition Orders = m
		mode: import
		source =
				let
					Source = #table(type table [OrderID = number], {{1}, {2}, {3}})
				in
					Source
```

## Why it matters

Keep First Rows is a good way to work on a large source: the editor previews and applies each step against a few hundred rows instead of millions. Microsoft recommends it while a query is being built, and says what to do after: "After you add all the required steps, remove the **Keep First Rows** step so the completed query processes the full data set." ([Best practices, Use a data subset while developing a query](https://learn.microsoft.com/power-query/best-practices#use-a-data-subset-while-developing-a-query)). Left in, the step goes on cutting the table at every refresh. Totals, counts, and averages are then computed over a slice of the data, the report shows them with no error or warning, and once the source grows past the limit the numbers stop changing.

## How to fix it

In Power BI Desktop, choose Transform data, select the query, and in Applied steps delete the Kept First Rows step with the X beside it ([Applied steps, Delete step](https://learn.microsoft.com/power-query/applied-steps#delete-step)). If the first rows are what the table should hold, such as the ten largest orders, sort first: add a Sort step before Keep First Rows, so the step reads as a top N and keeps the same rows at every refresh. In the TMDL file, remove the `Table.FirstN` line from the partition's `source` block and point the line after `in` at the step before it, as the fixed example does.

## When to ignore it

When the table is meant to hold a sample, such as a preview table beside the full one or a model that only ever runs in Desktop for development. When the source already returns its rows in a meaningful order, such as an API that lists the newest first, the first rows may be the ones you want; a sort in the query says so to the next reader, and the rule then leaves it alone.

## Quirks

- A count of 0 or 1 is not reported: an empty table that keeps a query's columns, and a single row of settings, are both common and deliberate.
- A `Table.FirstN` whose table is sorted, by a `Table.Sort` or a `Table.Buffer` of one, written in place or as the step it reads, is a top N and is not reported.
- A sort with other steps between it and Keep First Rows is not read as a top N.
- Only a count written as a number is read. A count from a parameter, or a condition such as `each [Amount] > 0` in place of a count, is not reported.
- A `Table.FirstN` inside an `each` or a function, such as a top three per group in `Table.Group`, runs once per group or per call and is not reported.
- Shared expressions do not load on their own, so they are not read. A table that reads a shared expression holding a Keep First Rows step is not reported either.
- Each call is its own finding.
- A query whose M does not parse is not read; it gets a `PARSE_ISSUE` finding instead.

## Related rules

- `SORT_NOT_HELD_FOR_REMOVE_DUPLICATES` reads the same thing from the other side: a sort meant to decide which rows are kept, before a step that may not keep its order.

## Links

- [Table.FirstN](https://learn.microsoft.com/powerquery-m/table-firstn)
