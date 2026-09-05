---
id: FORMAT_FLAG_COLUMNS_AS_YES/NO_VALUE_STRINGS
name: "Format flag columns as Yes/No value strings"
category: Formatting
severity: info
scope: [Column, CalculatedColumn, CalculatedTableColumn]
status: ported
video:
sources:
  - https://github.com/microsoft/Analysis-Services/blob/master/BestPracticeRules/BPARules.json
---

# Format flag columns as Yes/No value strings

## What it checks

Visible integer columns named Is... and visible non-text columns named ... Flag.

## Why it matters

Flags must be properly formatted as Yes/No as this is easier to read than using 0/1 integer values.

## How to fix it

Convert the flag to Yes/No text in Power Query.

## Links

- https://github.com/microsoft/Analysis-Services/blob/master/BestPracticeRules/BPARules.json
