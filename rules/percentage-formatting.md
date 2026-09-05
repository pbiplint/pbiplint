---
id: PERCENTAGE_FORMATTING
name: "Percentages should be formatted with thousands separators and 1 decimal"
category: Formatting
severity: warning
scope: [Measure]
status: ported
video:
sources:
  - https://github.com/microsoft/Analysis-Services/blob/master/BestPracticeRules/BPARules.json
---

# Percentages should be formatted with thousands separators and 1 decimal

## What it checks

Measures with a percent format string other than #,0.0%;-#,0.0%;#,0.0%.

## Why it matters

Microsoft's Best Practice Analyzer includes this rule under Formatting.

## How to fix it

Use the format string `#,0.0%;-#,0.0%;#,0.0%`.

Tabular Editor fix expression: `FormatString = "#,0.0%\u003B-#,0.0%\u003B#,0.0%"`

## Links

- https://github.com/microsoft/Analysis-Services/blob/master/BestPracticeRules/BPARules.json
