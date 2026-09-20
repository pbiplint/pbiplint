---
id: INTEGER_FORMATTING
name: "Whole numbers should be formatted with thousands separators and no decimals"
category: Formatting
severity: warning
scope: [Measure]
status: ported
video:
sources:
  - https://github.com/microsoft/Analysis-Services/blob/master/BestPracticeRules/BPARules.json
---

# Whole numbers should be formatted with thousands separators and no decimals

## What it checks

Measures whose static format string is not a recognized whole-number, currency, or percentage format. The only format strings the rule accepts are `#,0`, `#,0.0`, and any string containing `$` or `%`. A measure with no format string at all fires too, and that is the common case: the rule reads only the format string, so it cannot tell an unformatted currency or ratio from an unformatted count.

Each finding names the measure, as `[Order Count]`, and says what the rule saw: `no format string`, `format string "0.00"`, or `dynamic format string only`.

## Example

```tmdl fires
table Sales
	column Amount
		dataType: decimal
		isHidden
		summarizeBy: none
		sourceColumn: Amount

	measure 'Order Count' = COUNTROWS('Sales')
		formatString: 0

	measure 'Total Sales' = SUM('Sales'[Amount])
		formatString: #,0
```

```tmdl fixed
table Sales
	column Amount
		dataType: decimal
		isHidden
		summarizeBy: none
		sourceColumn: Amount

	measure 'Order Count' = COUNTROWS('Sales')
		formatString: #,0

	measure 'Total Sales' = SUM('Sales'[Amount])
		formatString: #,0
```

## Why it matters

An unformatted whole number is rendered with whatever default the client picks, so a measure that should read 1,234,567 can appear as 1234567 and leave the reader counting digits. Thousands separators are the single biggest readability win on a card or in a table column, and setting the format on the measure means every visual inherits it instead of each report author fixing it by hand and getting it slightly different. Currency and percentage measures follow their own conventions, which is why a format string containing $ or % is left alone by this rule.

## How to fix it

Set a format string that matches what the measure represents: `#,0` for counts and other whole numbers, a currency format such as `$#,0.00` for money, or `#,0.0%;-#,0.0%;#,0.0%` for percentages, which is the exact string `PERCENTAGE_FORMATTING` expects. In Power BI Desktop, select the measure in the Data pane and type the string into the Format box under Measure tools. In the TMDL file the property is `formatString: #,0` under the measure.

## When to ignore it

A measure already formatted the way its number deserves is the usual false alarm. Only two plain number formats pass, so an average carrying two decimals as `#,0.00`, a rate written `0.000`, and a price in a currency whose symbol is not the dollar sign are all reported although each is formatted on purpose. Look at the detail on the finding before deciding: `no format string` is always worth fixing, while a format string the rule merely does not recognize is a question of house style. A measure that returns text rather than a number has no format to set at all.

## Quirks

- The currency and percentage escape hatches are substring tests over the whole format string, so any string containing `$` or `%` anywhere passes, whatever else it says.
- Currency formats that do not use the `$` character, for example `€#,0.00`, are reported as though they were unformatted numbers, because the source rule looks for `$` only.
- A measure with a dynamic format string but no static format string is reported, because the source rule reads only the static format string.
- There is no visibility test. A hidden measure, and a measure on a hidden table, are reported on the same terms as a visible one.

## Related rules

- `PROVIDE_FORMAT_STRING_FOR_MEASURES` reports a visible measure that has neither a static nor a dynamic format string, so a measure with no format string at all is reported by both rules and one format string clears both.
- `PERCENTAGE_FORMATTING` reads one of the two sets this rule lets through, the format strings containing `%`, so no measure is reported by both. The three-part percentage string recommended above is the one that rule requires.
