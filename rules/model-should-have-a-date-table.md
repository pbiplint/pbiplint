---
id: MODEL_SHOULD_HAVE_A_DATE_TABLE
name: "Model should have a date table"
category: Performance
severity: warning
scope: [Model]
status: ported
video:
sources:
  - https://github.com/microsoft/Analysis-Services/blob/master/BestPracticeRules/BPARules.json
---

# Model should have a date table

## What it checks

Models with no table that has the data category Time and a DateTime column marked as the key, which is what Mark as date table sets.

## Why it matters

Every time intelligence function needs a contiguous date column to work over, and the marked date table is where it finds one. Without it, the model either leans on Auto date/time, which adds a hidden date table per date column and cannot be extended with fiscal periods or holidays, or does no time intelligence at all. A single shared date table also gives every fact table the same month, quarter, and year attributes, so visuals from different tables line up.

## How to fix it

Add a date table with one row per day covering every date in the model, from the source, from Power Query, or with CALENDAR in DAX. Mark it as a date table under Table tools and relate each fact table's date column to it. A date table built in DAX satisfies this rule, though `REDUCE_USAGE_OF_CALCULATED_TABLES` will list it.

## Links

- https://github.com/microsoft/Analysis-Services/blob/master/BestPracticeRules/BPARules.json
