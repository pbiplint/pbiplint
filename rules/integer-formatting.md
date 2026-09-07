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

Measures whose static format string is not a recognized whole-number, currency, or percentage format. The only format strings the rule accepts are `#,0`, `#,0.0`, and any string containing `$` or `%`. A measure with no format string at all fires too, and that is the common case: the rule reads only the format string, so it cannot tell an unformatted currency or ratio from an unformatted count. Each finding says what the rule saw: `no format string`, `format string "0.00"`, or `dynamic format string only`.

## Why it matters

An unformatted whole number is rendered with whatever default the client picks, so a measure that should read 1,234,567 can appear as 1234567 and leave the reader counting digits. Thousands separators are the single biggest readability win on a card or in a table column, and setting the format on the measure means every visual inherits it instead of each report author fixing it by hand and getting it slightly different. Currency and percentage measures follow their own conventions, which is why a format string containing $ or % is left alone by this rule.

## How to fix it

Set a format string that matches what the measure represents: `#,0` for counts and other whole numbers, a currency format such as `$#,0.00` for money, or `#,0.0%;-#,0.0%;#,0.0%` for percentages (the exact string PERCENTAGE_FORMATTING expects). The Tabular Editor fix expression below sets `#,0`, which is right only for whole numbers.

Tabular Editor fix expression: `FormatString = "#,0"`

## Quirks

- A measure with no format string at all is flagged by this rule as well as by PROVIDE_FORMAT_STRING_FOR_MEASURES. Setting the format string once clears both findings.
- A measure with a dynamic format string (a formatStringDefinition) but no static format string is flagged, because the source rule reads only the static FormatString property.
- Currency formats that do not use the `$` character, for example `€#,0.00`, are flagged as though they were unformatted numbers, because the source rule looks for `$` only.

## Links

- https://github.com/microsoft/Analysis-Services/blob/master/BestPracticeRules/BPARules.json
