---
id: PERCENTAGE_FORMATTING
name: "Percentages should be formatted with thousands separators and 1 decimal"
category: Formatting
severity: warning
scope: [Measure]
status: ported
layer: model
video:
sources:
  - https://github.com/microsoft/Analysis-Services/blob/master/BestPracticeRules/BPARules.json
---

# Percentages should be formatted with thousands separators and 1 decimal

## What it checks

Measures with a percent format string other than `#,0.0%;-#,0.0%;#,0.0%`.

Each finding names the measure, as `[Margin %]`. The format string the rule found is not in the line, so open the measure to see how far from the expected string it is.

## Example

```tmdl fires
table Sales
	column Amount
		dataType: decimal
		isHidden
		summarizeBy: none
		sourceColumn: Amount

	column Cost
		dataType: decimal
		isHidden
		summarizeBy: none
		sourceColumn: Cost

	measure 'Margin %' = DIVIDE(SUM('Sales'[Amount]) - SUM('Sales'[Cost]), SUM('Sales'[Amount]))
		formatString: 0.0%
```

```tmdl fixed
table Sales
	column Amount
		dataType: decimal
		isHidden
		summarizeBy: none
		sourceColumn: Amount

	column Cost
		dataType: decimal
		isHidden
		summarizeBy: none
		sourceColumn: Cost

	measure 'Margin %' = DIVIDE(SUM('Sales'[Amount]) - SUM('Sales'[Cost]), SUM('Sales'[Amount]))
		formatString: #,0.0%;-#,0.0%;#,0.0%
```

## Why it matters

Percentages formatted inconsistently end up side by side in the same report, so one card reads 12.3% while the next reads 12.34% or 12%, and the reader is left wondering whether the numbers disagree or only the formatting does. The three-part string this rule expects sets the positive, negative, and zero cases together, so a negative percentage keeps its sign and a thousands separator appears once values pass 1000%. Setting it on the measure fixes the presentation for every report that uses the model, rather than leaving each report author to format the visual by hand. This is house style rather than correctness: the rule enforces one convention, not the only workable one.

## How to fix it

Use the format string `#,0.0%;-#,0.0%;#,0.0%`. In Power BI Desktop, select the measure in the Data pane and paste the string into the Format box under Measure tools. In the TMDL file, set `formatString: #,0.0%;-#,0.0%;#,0.0%` under the measure. The three parts are the positive, negative, and zero cases in that order, which is why the string repeats itself: it says how each of the three is rendered rather than leaving two of them to a default.

## When to ignore it

A percentage that needs a different precision is the honest exception: a conversion rate people read to two decimals, or a completion figure that reads better as a whole number on a card. If that is the house standard, every percentage measure in the model fires and the rule is measuring the wrong convention, which is worth settling once for the whole model rather than card by card. What is not an exception is a single measure left at the client default because nobody chose a format for it.

## Quirks

- The rule reads any static format string containing `%` anywhere, so a custom format that carries an escaped percent sign is treated as a percentage format and reported.
- Only the exact three-part string passes. `#,0.0%` alone is reported, and so is the same string written with different spacing.
- There is no visibility test. A hidden measure, and a measure on a hidden table, are reported on the same terms as a visible one.
- Only the static format string is read, so a measure with a dynamic format string and no static one is never reported here.

## Related rules

- `INTEGER_FORMATTING` reads the same static format string and skips every string containing `%`, which is exactly the set this rule reads, so no measure is reported by both. The percentage string it recommends for a ratio measure is the one this rule requires.
