---
id: PROVIDE_FORMAT_STRING_FOR_MEASURES
name: "Provide format string for measures"
category: Formatting
severity: error
scope: [Measure]
status: ported
layer: model
video:
sources:
  - https://github.com/microsoft/Analysis-Services/blob/master/BestPracticeRules/BPARules.json
---

# Provide format string for measures

## What it checks

Visible measures with no format string and no dynamic format string, other than those whose DAX plainly returns text.

Each finding names the measure, as `[Total Sales]`.

## Example

```tmdl fires
table Sales
	column Amount
		dataType: decimal
		isHidden
		summarizeBy: none
		sourceColumn: Amount

	measure 'Total Sales' = SUM('Sales'[Amount])
```

```tmdl fixed
table Sales
	column Amount
		dataType: decimal
		isHidden
		summarizeBy: none
		sourceColumn: Amount

	measure 'Total Sales' = SUM('Sales'[Amount])
		formatString: #,0
```

## Why it matters

A measure with no format string is rendered with the client's default, which usually means no thousands separator and a decimal count that varies with the data, so the same measure can look different in two visuals on the same page. Setting the format on the measure fixes the presentation once for every report that will ever use the model, instead of leaving each report author to set it per visual and get it slightly wrong. Hidden measures and measures on hidden tables are not checked, because nothing displays them directly; a measure that has only a dynamic format string is also left alone, and so is one whose DAX plainly returns text, which has nothing to format.

## How to fix it

In Power BI Desktop, select the measure in the Data pane and set Format under Measure tools. In the TMDL file, add `formatString` under the measure: `#,0` for whole numbers, `#,0.00` for decimals, a currency format such as `$#,0.00`, or `#,0.0%;-#,0.0%;#,0.0%` for percentages. Where the format depends on what the measure returns, a dynamic format string satisfies the rule as well: pick Dynamic in the Format list under Measure tools and write the expression in the formula bar, which the file records as a `formatStringDefinition` block under the measure.

## When to ignore it

A measure that returns text has nothing to format. pbiplint leaves out the ones whose DAX shows it plainly (see Quirks), but a label that comes from a column, such as `MAXX` over a text column, and a measure that picks a hex color for conditional formatting with `SWITCH` or `IF`, are still reported, and neither has a number behind it. Everything else the rule reports is a visible number a reader will see, so the finding is usually worth the ten seconds it takes to clear.

## Quirks

- A measure that plainly returns text is not reported: one whose result, after its last top-level `RETURN`, is a lone string, joins values with `&`, or starts with a function that returns text, such as `FORMAT` or `CONCATENATEX`. The source rule does not read what a measure returns, so Tabular Editor reports such a measure. Power BI has no format string for text: "You can't set a custom format string for fields that are of type string or Boolean" ([Use custom format strings in Power BI Desktop](https://learn.microsoft.com/power-bi/create-reports/desktop-custom-format-strings#considerations-and-limitations)).
- Text returned any other way is still reported: `MAXX` over a text column, a variable holding text returned by its name, or an `IF` or `SWITCH` whose every branch is a string. pbiplint does not work out what type a DAX expression returns, and reads only what the tokens show, so a string or `&` inside a comment, inside a call or parentheses, or before the last `RETURN`, does not count. The functions that count, when the result starts with a call to one, are `FORMAT`, `CONCATENATE`, `CONCATENATEX`, `UNICHAR`, `COMBINEVALUES`, `LEFT`, `RIGHT`, `MID`, `UPPER`, `LOWER`, `SUBSTITUTE`, `REPT`, `TRIM`, `FIXED`, `REPLACE`, `USERPRINCIPALNAME`, `USERNAME`, `USEROBJECTID`, `USERCULTURE`, `CUSTOMDATA`, `SELECTEDMEASURENAME`, `NAMEOF`, `TOJSON`, and `TOCSV`.
- A format string of nothing but spaces counts as no format string, so `formatString: " "` is reported.
- A measure with only a dynamic format string passes here but fires `INTEGER_FORMATTING`, which reads the static format string alone.
- Hidden measures, and measures on hidden tables, are skipped. `INTEGER_FORMATTING` skips neither.
- The rule also needs every part of a table's declaration, which TMDL lets sit in more than one file (Power BI Desktop writes each table in one). While pbiplint could not open a model file or folder, or a parse issue took a line that could be a `table` line, such as a misspelt `table`, the rule reports nothing, because a part of the table in what pbiplint missed could hide the measure's table, and pbiplint does not guess what a file it could not read says. A parse issue inside a declaration, such as a property indented with spaces, does not stop the rule. The skipped line gives the reason, `a model file could not be fully read`, and a notice names what pbiplint could not open, or the file's own `PARSE_ISSUE` finding names the line.

## Related rules

- `INTEGER_FORMATTING` reports the same measure whenever it has no static format string, whether or not it is visible, so one format string it accepts clears both findings on a visible measure.
- `DECIMAL_COLUMN_WITHOUT_FORMAT_STRING` asks the same of visible Decimal number and Fixed decimal number columns, and reads visibility the same way, so a column on a hidden table is not reported.
