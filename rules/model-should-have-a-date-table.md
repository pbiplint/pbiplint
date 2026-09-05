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

Models with no table marked as a date table (data category Time with a DateTime key column).

## Why it matters

Generally speaking, models should generally have a date table. Models that do not have a date table generally are not taking advantage of features such as time intelligence or may not have a properly structured architecture.

## How to fix it

Add a date table and mark it as a date table in Power BI Desktop.

## Links

- https://github.com/microsoft/Analysis-Services/blob/master/BestPracticeRules/BPARules.json
