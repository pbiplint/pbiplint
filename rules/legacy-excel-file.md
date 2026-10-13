---
id: LEGACY_EXCEL_FILE
name: "Legacy Excel workbook"
category: Error Prevention
severity: info
scope: [Partition, NamedExpression, Table]
status: builtin
layer: powerquery
video:
sources:
---

# Legacy Excel workbook

## What it checks

Power Query queries that read an `.xls` or `.xlsb` workbook, which Power Query opens through the Access Database Engine rather than reading the file itself.

Each finding names the partition, the shared expression, or, for an incremental refresh policy's own query, the table that holds the path. Its detail names the query and the step, then the file type, as `query 'Budget', step 'Source': the workbook is a legacy .xls file, read through the Access Database Engine`. The location is the line and column of the path in the TMDL file, once however many queries read it.

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
					Source = Excel.Workbook(File.Contents("C:\Demo\Data\Budget.xls"), null, true),
					Sheet = Source{[Item = "Budget", Kind = "Sheet"]}[Data]
				in
					Sheet
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
					Source = Excel.Workbook(File.Contents("C:\Demo\Data\Budget.xlsx"), null, true),
					Sheet = Source{[Item = "Budget", Kind = "Sheet"]}[Data]
				in
					Sheet
```

## Why it matters

Power Query reads an `.xlsx` workbook itself, but not an older one. Microsoft explains: "Power Query reads legacy workbooks (such as .xls or .xlsb) using the Access Database Engine (or ACE) OLEDB provider. Because of this dependency, you might come across unexpected behaviors when importing legacy workbooks that don't occur when importing OpenXML workbooks (such as .xlsx)." ([Excel connector, Legacy ACE connector](https://learn.microsoft.com/power-query/connectors/excel#legacy-ace-connector)). The same section lists them: numbers that arrive as their formatted text, columns typed from the first eight rows with nulls for anything that does not match, and results that change between refreshes. The engine also has to be installed wherever the refresh runs, and "ACE can't be installed in cloud service environments." ([Excel connector, Prerequisites](https://learn.microsoft.com/power-query/connectors/excel#prerequisites)), so a refresh in the cloud needs a gateway on a machine that has it.

## How to fix it

Open the workbook in Excel and save it as an Excel Workbook (`.xlsx`) with File, Save As. Then in Power BI Desktop, choose Transform data, select the query, select its Source step in Applied steps, open the step's settings with the gear beside it, and choose the new file. In the TMDL file, the path is in the partition's `source` block, or in the expression's value when a parameter holds it; change its extension to `.xlsx`, as the fixed example does.

## When to ignore it

When the workbook is produced by a system that can only write the legacy format, and its data is simple enough that the engine reads it right, a gateway with the engine installed keeps it refreshing.

## Quirks

- Only a path given to `File.Contents` inside `Excel.Workbook` is read, written as text in the call, in a step it reads, or in a parameter. A path built at run time, or a workbook read from the web or SharePoint, is not read.
- The extension is read in any case, so `.XLS` counts. `.xlsx` and `.xlsm` are left alone.
- A path that several queries read is one finding, on the path.
- A query whose M does not parse is not read; it gets a `PARSE_ISSUE` finding instead.

## Related rules

- `EXCEL_USE_HEADERS` reports another way a workbook's reading can depend on the machine that refreshes it.
- `LOCAL_DRIVE_PATH` reports the same path when it is on a local drive, as a workbook's often is.

## Links

- [Excel connector](https://learn.microsoft.com/power-query/connectors/excel)
- [Excel.Workbook](https://learn.microsoft.com/powerquery-m/excel-workbook)
