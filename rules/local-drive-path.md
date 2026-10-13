---
id: LOCAL_DRIVE_PATH
name: "Path on a local drive"
category: Error Prevention
severity: warning
scope: [Partition, NamedExpression, Table]
status: builtin
layer: powerquery
video:
sources:
---

# Path on a local drive

## What it checks

Text in a Power Query query or parameter that starts with a path on a drive letter, such as `C:\Demo\Data\Sales.csv` or `D:/Exports/`.

Each finding names the partition, the shared expression, or, for an incremental refresh policy's own query, the table. Its detail names the query and the step as Power Query's editor shows them, then the drive, as `query 'Sales', step 'Source': the path is on a local drive (C:)`. The rest of the path is left out, since a folder under `C:\Users\` carries an account name. The location is the line and column of the text in the TMDL file.

## Example

```tmdl fires
table Sales
	column Amount
		dataType: decimal
		summarizeBy: sum
		sourceColumn: Amount

	partition Sales = m
		mode: import
		source =
				let
					Source = Csv.Document(File.Contents("C:\Demo\Data\Sales.csv"), [Delimiter = ",", Encoding = 65001]),
					#"Promoted Headers" = Table.PromoteHeaders(Source, [PromoteAllScalars = true])
				in
					#"Promoted Headers"
```

```tmdl fixed
table Sales
	column Amount
		dataType: decimal
		summarizeBy: sum
		sourceColumn: Amount

	partition Sales = m
		mode: import
		source =
				let
					Source = Csv.Document(Web.Contents("https://example.sharepoint.com/sites/finance/Shared%20Documents/Sales.csv"), [Delimiter = ",", Encoding = 65001]),
					#"Promoted Headers" = Table.PromoteHeaders(Source, [PromoteAllScalars = true])
				in
					#"Promoted Headers"
```

## Why it matters

Once the model is published, refresh runs in the Power BI service, which cannot see a drive on the machine that built the report. Microsoft states the rule plainly: "If your semantic model uses a data source that Power BI can't access over a direct network connection, you must configure a gateway connection for this semantic model before you can enable a refresh schedule or perform an on-demand data refresh" ([Connecting to on-premises data sources](https://learn.microsoft.com/power-bi/connect-data/refresh-data#connecting-to-on-premises-data-sources)). A file on `C:` is such a source, and for it "A gateway must be installed and running for Power BI to connect to on-premises data sources and refresh the semantic model" ([Refresh semantic models created from local Power BI Desktop files](https://learn.microsoft.com/power-bi/connect-data/refresh-desktop-file-local-drive#on-premises-data-gateway)). Without a gateway on that machine the scheduled refresh fails, and the report goes on showing the data it was published with. The path also ties the model to one person's folders: a colleague who opens the project on another machine gets an error on every query that reads it.

## How to fix it

In Power BI Desktop, choose Transform data, select the query, and select the step the finding names in Applied steps. Put the file in SharePoint or OneDrive for work or school and connect to it there: Get data, then SharePoint folder for a folder of files, or Web with the file's address for one file. Point the query's Source step at the new connection, so the steps after it carry on as before. If the file has to stay where it is, keep the path and refresh through a gateway installed on that machine. Either way, keep the folder in a parameter (Home, Manage Parameters) and build each path from it, so a move changes one value; as Microsoft puts it, "Parameters make queries easier to update because you can change a value in one location instead of editing each query that uses it" ([Use parameters](https://learn.microsoft.com/power-query/best-practices#use-parameters)). A parameter that still holds a local path is still a finding, on the parameter. In the TMDL file, the text is in the partition's `source` block, or in the expression's value for a parameter.

## When to ignore it

A model that is never published needs no refresh in the service, and one refreshed through a gateway on the machine that holds the files can keep its paths; the finding then says only that refresh depends on that machine staying on. Network paths such as `\\fileserver\share\Sales.csv` are not reported, since a gateway in the organization is the usual route for them. For those, Microsoft adds: "When connecting to an Excel workbook on a network share, use the fully qualified domain name (FQDN) path (for example, `\\ServerName.domain.com\FolderName\File.xlsx`) instead of a short server name. Using a short name can cause refresh failures after publishing to the Power BI service." ([Excel connector, Limitations and considerations](https://learn.microsoft.com/power-query/connectors/excel#limitations-and-considerations)). pbiplint does not check that.

## Quirks

- Only text written out in a query is read. A path joined at refresh time, such as `DataFolder & "Sales.csv"`, is reported where its drive letter is written, on the `DataFolder` parameter, and not on the query that joins it.
- A path in a comment is not read, and neither is a `file:` address or a web address.
- Each piece of text is its own finding, so a query that reads three files from `C:` has three.
- Text that starts with a drive path is reported wherever it stands, including where a step compares it rather than reads it, such as a filter on a folder's `Folder Path` column. Moving the files changes that text too.
- A query whose M does not parse is not read; it gets a `PARSE_ISSUE` finding instead.

## Related rules

- `MINIMIZE_POWER_QUERY_TRANSFORMATIONS` reads the same queries; a file source has no upstream to move its steps to, which that rule's page names as a reason to leave its finding.
- `SCRIPT_IN_QUERY` reports Python and R scripts, which also refresh only through a gateway on one machine.
- `EXCEL_USE_HEADERS` reports a workbook read with its headers promoted by the reader, often one read from a local path.
- `DYNAMIC_DATA_SOURCE` reports a path built at run time, from the rows or by a function call, which the service cannot refresh at all.
- `HARDCODED_SERVER_NAME` reports a database server written into a query, which a parameter holds in the same way.
- `LEGACY_EXCEL_FILE` reports an `.xls` or `.xlsb` workbook, often one read from a local path.

## Links

- [What is an on-premises data gateway?](https://learn.microsoft.com/power-bi/connect-data/service-gateway-onprem)
- [SharePoint folder connector](https://learn.microsoft.com/power-query/connectors/sharepoint-folder)
