---
id: EXCEL_USE_HEADERS
name: "Excel headers promoted by the workbook reader"
category: Error Prevention
severity: info
scope: [Partition, NamedExpression, Table]
status: builtin
layer: powerquery
video:
sources:
---

# Excel headers promoted by the workbook reader

## What it checks

Excel.Workbook calls that ask the workbook reader to promote headers: `true` as the second argument, or `UseHeaders = true` in its options record.

Each finding names the partition, the shared expression, or, for an incremental refresh policy's own query, the table. Its detail names the query and the step, as `query 'Budget', step 'Source': Excel.Workbook promotes headers in the refreshing machine's culture`. The location is the line and column of the call in the TMDL file.

## Example

```tmdl fires
table Budget
	column Amount
		dataType: double
		summarizeBy: sum
		sourceColumn: Amount

	partition Budget = m
		mode: import
		source =
				let
					Source = Excel.Workbook(Web.Contents("https://example.sharepoint.com/sites/finance/Shared%20Documents/Budget.xlsx"), true),
					Budget = Source{[Item = "Budget", Kind = "Sheet"]}[Data]
				in
					Budget
```

```tmdl fixed
table Budget
	column Amount
		dataType: double
		summarizeBy: sum
		sourceColumn: Amount

	partition Budget = m
		mode: import
		source =
				let
					Source = Excel.Workbook(Web.Contents("https://example.sharepoint.com/sites/finance/Shared%20Documents/Budget.xlsx"), null, true),
					Budget = Source{[Item = "Budget", Kind = "Sheet"]}[Data],
					#"Promoted Headers" = Table.PromoteHeaders(Budget, [PromoteAllScalars = true])
				in
					#"Promoted Headers"
```

## Why it matters

When the workbook reader promotes headers, a header cell that holds a number or a date becomes a column name written in the culture of whatever machine runs the refresh. Microsoft's connector page warns about exactly this: "The Excel.Workbook `useHeaders` option converts numbers and dates to text using the current culture, and thus behaves differently when run in environments with different operating system cultures set. We recommend using Table.PromoteHeaders instead." ([Excel connector, Limitations and considerations](https://learn.microsoft.com/power-query/connectors/excel#limitations-and-considerations)). A month column headed with the date January 31, 2025 can be named `1/31/2025` on the laptop that built the report and `31/01/2025` on a gateway set to another culture, and every later step that names the column by its text then fails to find it.

## How to fix it

In Power BI Desktop, choose Transform data, select the query, and select its Source step in Applied steps. In the formula bar, change Excel.Workbook's second argument to `null`, which leaves headers to a later step. Then select the step that picks the sheet or table and choose Home, Use First Row as Headers, which writes Table.PromoteHeaders. Check that the steps after it still find their columns. In the TMDL file, the call is in the partition's `source` block.

## When to ignore it

When every header in the sheet is plain text, there is nothing for the culture to change, and the finding is a note about style rather than a risk. It is still worth fixing when the sheet is edited by hand, since one person typing a date or a number into a header row is enough to bring the problem back.

## Quirks

- Power BI Desktop's own call, `Excel.Workbook(File.Contents(...), null, true)`, is left alone: it leaves `useHeaders` unset and sets `delayTypes`.
- Only a value written in the call counts: `true`, `(true)`, or a record with `UseHeaders = true`. A value held by a step or a parameter is not followed.
- Each call is its own finding.
- A query whose M does not parse is not read; it gets a `PARSE_ISSUE` finding instead.

## Related rules

- `LOCAL_DRIVE_PATH` reports the workbook's path when it is on a local drive, as a workbook read with File.Contents often is.
- `LEGACY_EXCEL_FILE` reports a workbook in the legacy format, whose reading also depends on the machine that refreshes it.

## Links

- [Excel connector](https://learn.microsoft.com/power-query/connectors/excel)
- [Promote or demote column headers](https://learn.microsoft.com/power-query/table-promote-demote-headers)
