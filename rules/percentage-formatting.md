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

Percentages formatted inconsistently end up side by side in the same report, so one card reads 12.3% while the next reads 12.34% or 12%, and the reader is left wondering whether the numbers disagree or only the formatting does. The three-part string this rule expects sets the positive, negative, and zero cases together, so a negative percentage keeps its sign and a thousands separator appears once values pass 1000%. Setting it on the measure fixes the presentation for every report that uses the model, rather than leaving each report author to format the visual by hand. This is house style rather than correctness: if your standard uses a different number of decimals, disable the rule in pbiplint.config.json instead of working around it.

## How to fix it

Use the format string `#,0.0%;-#,0.0%;#,0.0%`.

Tabular Editor fix expression: `FormatString = "#,0.0%\u003B-#,0.0%\u003B#,0.0%"`

## Links

- https://github.com/microsoft/Analysis-Services/blob/master/BestPracticeRules/BPARules.json
