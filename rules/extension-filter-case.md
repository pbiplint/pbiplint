---
id: EXTENSION_FILTER_CASE
name: "File extension filter misses other cases"
category: Error Prevention
severity: warning
scope: [Partition, NamedExpression, Table]
status: builtin
layer: powerquery
video:
sources:
---

# File extension filter misses other cases

## What it checks

Power Query filters on a folder's files that compare the `Extension` column with text such as `".csv"` as written, so a file whose extension is in other capitals, such as `.CSV`, is left out.

Each finding names the partition, the shared expression, or, for an incremental refresh policy's own query, the table. Its detail names the query and the step, then the text and the case it misses, as `query 'Sales Files', step 'Filtered Rows': the extension test matches ".csv" but not ".CSV"`. The location is the line and column of the comparison in the TMDL file.

## Example

```tmdl fires
table 'Sales Files'
	column Name
		dataType: string
		summarizeBy: none
		sourceColumn: Name

	partition 'Sales Files' = m
		mode: import
		source =
				let
					Source = Folder.Files("C:\Demo\Data\Sales"),
					#"Filtered Rows" = Table.SelectRows(Source, each [Extension] = ".csv")
				in
					#"Filtered Rows"
```

```tmdl fixed
table 'Sales Files'
	column Name
		dataType: string
		summarizeBy: none
		sourceColumn: Name

	partition 'Sales Files' = m
		mode: import
		source =
				let
					Source = Folder.Files("C:\Demo\Data\Sales"),
					#"Filtered Rows" = Table.SelectRows(Source, each Comparer.OrdinalIgnoreCase([Extension], ".csv") = 0)
				in
					#"Filtered Rows"
```

## Why it matters

The Folder and SharePoint folder connectors list each file's extension as the file system or the site has it, and `=` compares text exactly, capitals included. A folder that collects files from several people or systems sooner or later holds a `Sales.CSV` beside the `sales.csv` files, and the filter drops it without an error, so its rows are missing from every total. Microsoft's own example for SharePoint folders compares the extension without regard to case, and says why: "The extension comparison is case-insensitive, so it also matches `.XLSX`." ([SharePoint.Files, Example 2](https://learn.microsoft.com/powerquery-m/sharepoint-files#example-2)).

## How to fix it

In Power BI Desktop, choose Transform data, select the query, and select the filter step in Applied steps. In the formula bar, change `[Extension] = ".csv"` to `Comparer.OrdinalIgnoreCase([Extension], ".csv") = 0`, as the fixed example and Microsoft's example write it. Without editing the formula, insert a step before the filter instead: select the Extension column and choose Transform, Format, lowercase, so every extension is in lower case by the time the filter reads it. In the TMDL file, the filter is a `Table.SelectRows` line in the partition's `source` block.

## When to ignore it

When the files come from one system that always writes the extension in the same case, the filter cannot miss one. A comparison that ignores case also tells the next reader that case does not matter.

## Quirks

- Read: `[Extension] = "<text>"` or `<>`, either way round, inside a `Table.SelectRows` whose table is a `Folder.Files`, `Folder.Contents`, `SharePoint.Files`, or `SharePoint.Contents` listing, followed back through the steps before it.
- A comparison through `Text.Lower`, `Text.Upper`, or `Comparer.OrdinalIgnoreCase` is left alone. So is a listing with a `Table.TransformColumns` step on its Extension column before the filter, whatever that step does, since lowercasing the column there is one of the fixes above.
- A listing the rule cannot follow back to one of the four functions, such as a lakehouse's or a storage account's, is not read.
- A listing held in another query, such as `Source = #"Files"`, is not followed, so a filter on it is not read.
- A comparison with `<>` is read the same way as one with `=`.
- Text with no letter in it, such as `".7"`, cannot miss a case and is left alone.
- A filter on `".log"`, in any case, is left alone: the programs that write log files, such as a gateway, keep one case for them.
- Each comparison is its own finding.
- A query whose M does not parse is not read; it gets a `PARSE_ISSUE` finding instead.

## Related rules

- `LOCAL_DRIVE_PATH` reports the folder's path when it is on a local drive, as a folder of files often is.

## Links

- [Folder connector](https://learn.microsoft.com/power-query/connectors/folder)
- [Comparer.OrdinalIgnoreCase](https://learn.microsoft.com/powerquery-m/comparer-ordinalignorecase)
