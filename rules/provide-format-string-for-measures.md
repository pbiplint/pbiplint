---
id: PROVIDE_FORMAT_STRING_FOR_MEASURES
name: "Provide format string for measures"
category: Formatting
severity: error
scope: [Measure]
status: ported
video:
sources:
  - https://github.com/microsoft/Analysis-Services/blob/master/BestPracticeRules/BPARules.json
---

# Provide format string for measures

## What it checks

Visible measures with no format string and no dynamic format string.

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

A measure with no format string is rendered with the client's default, which usually means no thousands separator and a decimal count that varies with the data, so the same measure can look different in two visuals on the same page. Setting the format on the measure fixes the presentation once for every report that will ever use the model, instead of leaving each report author to set it per visual and get it slightly wrong. Hidden measures and measures on hidden tables are not checked, because nothing displays them directly; a measure that has only a dynamic format string is also left alone.

## How to fix it

In Power BI Desktop, select the measure in the Data pane and set Format under Measure tools. In the TMDL file, add `formatString` under the measure: `#,0` for whole numbers, `#,0.00` for decimals, a currency format such as `$#,0.00`, or `#,0.0%;-#,0.0%;#,0.0%` for percentages. Where the format depends on what the measure returns, a dynamic format string satisfies the rule as well: pick Dynamic in the Format list under Measure tools and write the expression in the formula bar, which the file records as a `formatStringDefinition` block under the measure.

## When to ignore it

A measure that returns text has nothing to format. A label measure that builds a title, and a measure that returns a hex color for conditional formatting, are both reported here and neither has a number behind it. Everything else the rule reports is a visible number a reader will see, so the finding is usually worth the ten seconds it takes to clear.

## Quirks

- A format string of nothing but spaces counts as no format string, so `formatString: " "` is reported.
- A measure with only a dynamic format string passes here but fires `INTEGER_FORMATTING`, which reads the static format string alone.
- Hidden measures, and measures on hidden tables, are skipped. `INTEGER_FORMATTING` skips neither.

## Related rules

- `INTEGER_FORMATTING` reports the same measure whenever it has no static format string, whether or not it is visible, so one format string clears both findings on a visible measure.
