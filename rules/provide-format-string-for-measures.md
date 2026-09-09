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

## Why it matters

A measure with no format string is rendered with the client's default, which usually means no thousands separator and a decimal count that varies with the data, so the same measure can look different in two visuals on the same page. Setting the format on the measure fixes the presentation once for every report that will ever use the model, instead of leaving each report author to set it per visual and get it slightly wrong. Hidden measures and measures on hidden tables are not checked, because nothing displays them directly; a measure that has only a dynamic format string is also left alone.

## How to fix it

Set the Format under Measure tools in Power BI Desktop, or add `formatString` under the measure in the TMDL file: `#,0` for whole numbers, `#,0.00` for decimals, a currency format such as `$#,0.00`, or `#,0.0%;-#,0.0%;#,0.0%` for percentages.

## Quirks

- A measure with only a dynamic format string passes here but fires `INTEGER_FORMATTING`, which reads the static format string alone.

## Links

- https://github.com/microsoft/Analysis-Services/blob/master/BestPracticeRules/BPARules.json
