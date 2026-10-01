---
id: UNNECESSARY_COLUMNS
name: "Remove unnecessary columns"
category: Maintenance
severity: warning
scope: [Column, CalculatedColumn, CalculatedTableColumn]
status: ported
layer: model
video:
sources:
  - https://github.com/microsoft/Analysis-Services/blob/master/BestPracticeRules/BPARules.json
---

# Remove unnecessary columns

## What it checks

Hidden columns, or columns in hidden tables, that nothing references: no DAX expression, relationship, hierarchy, sort-by column, group-by column, calendar, row-level security filter, or object-level security rule.

Each finding names the column, as `'Sales'[Legacy Region Code]`.

## Example

```tmdl fires
table Sales
	column 'Order ID'
		dataType: int64
		sourceColumn: OrderID

	column Amount
		dataType: decimal
		sourceColumn: Amount

	column 'Legacy Region Code'
		dataType: string
		isHidden
		sourceColumn: LegacyRegionCode

	measure 'Total Sales' = SUM('Sales'[Amount])
		formatString: #,0
```

```tmdl fixed
table Sales
	column 'Order ID'
		dataType: int64
		sourceColumn: OrderID

	column Amount
		dataType: decimal
		sourceColumn: Amount

	measure 'Total Sales' = SUM('Sales'[Amount])
		formatString: #,0
```

## Why it matters

A hidden column that nothing uses is loaded, compressed, and refreshed for no reader. Key columns and helper columns pile up this way as a model evolves, and each one costs memory and refresh time in proportion to its cardinality. Removing them is the cheapest model diet there is.

## How to fix it

For a data column, stop loading it: in Power BI Desktop, Transform data, select the query, and use Choose Columns or Remove Columns, so the column never reaches the model. Where the query reads a view or a stored procedure, drop it from the select list there instead and the refresh gets shorter too. For a calculated column, right-click it in the Data pane and choose Delete from model, or remove its `column` block from the table's TMDL file. If the column turns out to be needed after all, clear Is hidden in the Properties pane, or remove `isHidden` from under the column in the file, and the finding goes with it.

## When to ignore it

Report usage is the case to check first. A hidden column that a visual, a slicer, or a report-level filter binds to is in use, but this rule reads the model only, as the source rule does, so it reports that column all the same. When the report is in the input, `NOT_REACHED_FROM_REPORT` says which fields that report never reaches; other reports on the same model are still yours to open before you delete anything. A column named as the default column of a variation is in the same position: the rule does not read variations, so it reports one that Power BI Desktop is quietly relying on. A staging column you are about to reference is a fair thing to leave for a week. A hidden key that no relationship uses is not: that one is what the rule is for.

## Quirks

- DAX is read token by token, so a column named only inside a string or a comment of a DAX expression is not a use (a row-level security filter's text test, below, still counts it), and in extended column syntax, `'Date'[Date].[Year]`, only `'Date'[Date]` is. A bare `[Column]` reference resolves measure-first, then the expression's own table, then the first table with that column.
- A bare name for a column the same DAX creates with ADDCOLUMNS, SELECTCOLUMNS, SUMMARIZE, SUMMARIZECOLUMNS, ROW, or DATATABLE is not a use of a model column of that name: a hidden `'Archive'[DueDate]` that DAX names only as `[DueDate]` outside `SUMMARIZE ( 'Invoices', 'Invoices'[Key], "DueDate", MAX ( 'Invoices'[DueDate] ) )` is reported, as Tabular Editor reports it. Inside a call that creates the name, the name counts as any other bare name does, since a call cannot read a column it is creating. Outside those calls pbiplint does not work out which table a row context walks, so in DAX that also creates a column Qty, the `[Qty]` in `SUMX ( 'Sales', [Qty] )` is not a use of `'Sales'[Qty]` either.
- A column that a user-defined function names with its table counts as used, even when nothing calls the function, as Tabular Editor counts it.
- A column that a user-defined function names without its table counts as used, on every table with a column of that name, since the caller can hand the function any table. In pbiplint's parity check, Tabular Editor counted such a name inside `SUMX ( 'Sales', [Handling Fee] )` but reported the column a function names in `MAX ( [Tax Rate] )`, though deleting it would break the function.
- A column that another column in its table groups by counts as used, as a field parameter's hidden Fields column is: the parameter's display column names it as its `groupByColumn` under `relatedColumnDetails`, and the parameter stops working without it. The source rule does not test `groupByColumn`, so Tabular Editor reports that column.
- A column a calendar names, as a primary, associated, or time-related column, counts as used: the calendar needs it for time intelligence. The source rule does not read calendars, so Tabular Editor reports such a column when it is hidden and nothing else uses it.
- Report usage is not visible to this rule. A hidden column used only by a visual, a slicer, or a report-level filter is still flagged.
- Variations are not tested, here or in the source rule, so a hidden column that a variation names as its default column is reported. `SET_ISAVAILABLEINMDX_TO_TRUE_ON_NECESSARY_COLUMNS` does read variations.
- Row-level security filters are also matched as text, ignoring letter case, the way the source rule matches them: `Table[Column]` or `'Table'[Column]` in any role's filter, or `[Column]` in a filter on the column's own table, counts as a use even inside a comment or a string there.
- While a model file has a parse issue that can take a declaration out of the model, such as a line indented with spaces, or pbiplint could not open a model file or folder at all, the rule reports nothing, because a measure, a relationship, or a security filter that uses the column could be in what pbiplint missed, and pbiplint does not guess what a file it could not read says. The skipped line gives the reason, `a model file could not be fully read`, and the file's own `PARSE_ISSUE` finding names it, or a notice does for a file or folder pbiplint could not open.

## Related rules

- `UNNECESSARY_MEASURES` makes the same test on hidden measures that no expression references.
- `ISAVAILABLEINMDX_FALSE_NONATTRIBUTE_COLUMNS` reads the same hidden columns and reports the ones that still have IsAvailableInMdx set to true and are not used to sort, in a hierarchy, in a variation, or in a calendar, whether or not any expression references them. Deleting the column clears both; setting `isAvailableInMdx: false` clears only that one.
- `HIDE_FOREIGN_KEYS` asks you to hide a column on the many side of a relationship. A column in a relationship is never reported here, so taking that advice does not bring the column into this rule.
- `UDF_NOT_CALLED` reports a user-defined function nothing calls. A column that such a function names counts as used here, so deleting the function can bring the column into this rule.
