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

Visible measures should have their format string property assigned. Without one, the value is rendered with the client's default, which usually means no thousands separator and a decimal count that varies with the data, so the same measure can look different in two visuals on the same page. Setting the format on the measure fixes the presentation once for every report that will ever use the model, instead of leaving each report author to set it per visual and get it slightly wrong. Hidden measures and measures on hidden tables are not checked, because nothing displays them directly; a measure that has only a dynamic format string is also left alone.

## How to fix it

Set a format string on the measure.

## Links

- https://github.com/microsoft/Analysis-Services/blob/master/BestPracticeRules/BPARules.json
