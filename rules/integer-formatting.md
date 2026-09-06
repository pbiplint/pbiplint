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

Measures whose format string is neither #,0 nor #,0.0 and is not a format string containing $ or %, including measures with no format string.

## Why it matters

An unformatted whole number is rendered with whatever default the client picks, so a measure that should read 1,234,567 can appear as 1234567 and leave the reader counting digits. Thousands separators are the single biggest readability win on a card or in a table column, and setting the format on the measure means every visual inherits it instead of each report author fixing it by hand and getting it slightly different. Currency and percentage measures follow their own conventions, which is why a format string containing $ or % is left alone by this rule.

## How to fix it

Use `#,0` for whole numbers.

Tabular Editor fix expression: `FormatString = "#,0"`

## Quirks

- A measure with no format string at all is flagged by this rule as well as by PROVIDE_FORMAT_STRING_FOR_MEASURES.

## Links

- https://github.com/microsoft/Analysis-Services/blob/master/BestPracticeRules/BPARules.json
