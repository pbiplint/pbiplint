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

Measures whose format string is not currency, percent, #,0, or #,0.0, including measures with no format string.

## Why it matters

Microsoft's Best Practice Analyzer includes this rule under Formatting.

## How to fix it

Use `#,0` for whole numbers.

Tabular Editor fix expression: `FormatString = "#,0"`

## Quirks

- A measure with no format string at all is flagged by this rule as well as by PROVIDE_FORMAT_STRING_FOR_MEASURES.

## Links

- https://github.com/microsoft/Analysis-Services/blob/master/BestPracticeRules/BPARules.json
