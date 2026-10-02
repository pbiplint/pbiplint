---
id: DECIMAL_COLUMN_WITHOUT_FORMAT_STRING
name: "Visible decimal column with no format string"
category: Formatting
severity: info
scope: [Column, CalculatedColumn, CalculatedTableColumn]
status: builtin
layer: model
video:
sources:
---

# Visible decimal column with no format string

## What it checks

Visible Decimal number and Fixed decimal number columns with no format string.

Each finding names the column, as `'Sales'[Discount Rate]`. A column counts as visible when it and its table are not hidden.

## Example

```tmdl fires
table Sales
	column 'Discount Rate'
		dataType: double
		summarizeBy: none
		sourceColumn: Discount Rate
```

```tmdl fixed
table Sales
	column 'Discount Rate'
		dataType: double
		formatString: 0.0%
		summarizeBy: none
		sourceColumn: Discount Rate
```

## Why it matters

A format string says what a column's numbers are. Without one, a share, an amount, and a plain measurement look alike, or as Tabular Editor's guidance for its version of this rule puts it, "Users can't tell if values are currency, percentages, or plain numbers" ([Provide format string for numeric and date columns](https://docs.tabulareditor.com/en/kb/bpa-format-string-columns.html#why-this-matters)). Left at General, Power BI Desktop shows the column's values as plain numbers: in a table visual, a discount amount reads `20.30` with no currency symbol, and a share of 0.25 reads `0.25`, not 25%. A format set on the column in the model applies wherever the column is used, "unless a visual or element level format string overrides it" ([Use custom format strings in Power BI Desktop](https://learn.microsoft.com/power-bi/create-reports/desktop-custom-format-strings)), so setting it once spares every report author setting it visual by visual.

## How to fix it

In Power BI Desktop, select the column in the Data pane and set Format under Column tools, or select it in Model view and set Format in the Properties pane ([Add a model level format string](https://learn.microsoft.com/power-bi/create-reports/desktop-custom-format-strings#add-a-model-level-format-string)). In the column's TMDL file, add a `formatString:` line under the column, such as `formatString: 0.0%` for a ratio or `formatString: #,0.00` for an amount.

## When to ignore it

When no reader sees the column as a number: a decimal kept for a relationship or read only by measures is better hidden than formatted, which clears the finding too. Coordinates are the other case: a latitude or longitude column is there to place points on a map, not to be read as a number, so leaving it at General is fine. Otherwise a visible decimal column is one a report author can drop into a visual, where it shows with no format of its own.

## Quirks

- Whole-number and date columns are left out, since Power BI Desktop gives each of them a format string by default. The source rule, Tabular Editor 3's built-in, reports them as well.
- A column whose TMDL has no `dataType` line is not read, since pbiplint does not know its type. Power BI Desktop leaves the line out of most calculated columns it saves.
- A format string of only spaces counts as none, as it does in `PROVIDE_FORMAT_STRING_FOR_MEASURES`.
- The rule also needs every part of a table's declaration, which TMDL lets sit in more than one file (Power BI Desktop writes each table in one). While pbiplint could not open a model file or folder, or a parse issue took a line that could be a `table` line, such as a misspelt `table`, the rule reports nothing, because a part of the table in what pbiplint missed could hide the column's table, and pbiplint does not guess what a file it could not read says. A parse issue inside a declaration, such as a property indented with spaces, does not stop the rule. The skipped line gives the reason, `a model file could not be fully read`, and a notice names what pbiplint could not open, or the file's own `PARSE_ISSUE` finding names the line.

## Related rules

- `AVOID_FLOATING_POINT_DATA_TYPES` reports every Decimal number column, for how its values are stored; this rule is about what readers see, and reads Fixed decimal number columns too. Changing a column to Fixed decimal number clears that rule and leaves this one until the column has a format string.
- `PROVIDE_FORMAT_STRING_FOR_MEASURES` asks the same of visible measures.

## Links

- [Data types in Power BI, Number types](https://learn.microsoft.com/power-bi/connect-data/desktop-data-types#number-types)
- [Tabular Editor's rule, Provide format string for numeric and date columns](https://docs.tabulareditor.com/en/kb/bpa-format-string-columns.html)
