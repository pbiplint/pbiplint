---
id: REDUCE_NUMBER_OF_CALCULATED_COLUMNS
name: "Reduce number of calculated columns"
category: Performance
severity: warning
scope: [Model]
status: ported
video:
sources:
  - https://github.com/microsoft/Analysis-Services/blob/master/BestPracticeRules/BPARules.json
  - https://www.elegantbi.com/post/top10bestpractices
---

# Reduce number of calculated columns

## What it checks

Models with more than five calculated columns across all tables. Columns of calculated tables do not count, and the finding is on the model.

## Why it matters

A calculated column is computed after load, one row at a time, and stored without the compression the engine gets for a column it loaded from the source, so each one costs refresh time and memory out of proportion to its size. Five is a budget rather than a limit: past it, the model is usually doing in DAX what Power Query or the source would do once and better.

## How to fix it

Move the logic into Power Query as a custom column, or into the source as a view. Keep DAX calculated columns for the few cases that need the model, such as a value that depends on a measure.

## Links

- https://github.com/microsoft/Analysis-Services/blob/master/BestPracticeRules/BPARules.json
- https://www.elegantbi.com/post/top10bestpractices
