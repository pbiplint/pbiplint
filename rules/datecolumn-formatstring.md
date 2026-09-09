---
id: DATECOLUMN_FORMATSTRING
name: "Provide format string for \"Date\" columns"
category: Formatting
severity: info
scope: [Column, CalculatedColumn, CalculatedTableColumn]
status: ported
video:
sources:
  - https://github.com/microsoft/Analysis-Services/blob/master/BestPracticeRules/BPARules.json
---

# Provide format string for "Date" columns

## What it checks

DateTime columns with date in the name whose format string is not exactly `mm/dd/yyyy`.

## Why it matters

A date column with no format string is shown however the viewer's locale and the visual decide, so the same column can read 3/4/2026 in one visual and 4 March 2026 in another. A format string on the column fixes the presentation once for every report. The source ruleset picked the US short date as its convention.

## How to fix it

In Power BI Desktop, select the column and set the Format under Column tools. In the TMDL file, add `formatString: mm/dd/yyyy` under the column. The expected format is US-centric; if your convention differs, set the format you want and turn this rule off in `pbiplint.config.json`, because only the exact string passes.

## Quirks

- The name test is a substring, so any column containing the letters date, such as Update Time, is matched.
- Any other format fires, including `dd/mm/yyyy` and `yyyy-mm-dd`.

## Links

- https://github.com/microsoft/Analysis-Services/blob/master/BestPracticeRules/BPARules.json
