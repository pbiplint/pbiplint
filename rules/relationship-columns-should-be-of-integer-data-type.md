---
id: RELATIONSHIP_COLUMNS_SHOULD_BE_OF_INTEGER_DATA_TYPE
name: "Relationship columns should be of integer data type"
category: Formatting
severity: info
scope: [Column, CalculatedColumn, CalculatedTableColumn]
status: ported
video:
sources:
  - https://github.com/microsoft/Analysis-Services/blob/master/BestPracticeRules/BPARules.json
---

# Relationship columns should be of integer data type

## What it checks

Any column that takes part in a relationship and is not a whole number.

## Why it matters

A relationship is evaluated by matching values, and whole numbers match fastest and compress smallest. Text keys carry their dictionary into every join, and DateTime keys work but store more than an integer date key would. On the largest fact tables the key columns are often the biggest, so the choice shows up in memory as much as in query time.

## How to fix it

Use integer surrogate keys from the source where they exist. Where the natural key is text, add a numeric key in the source or with a merge in Power Query. Date relationships on a DateTime column are common and work; an integer date key such as 20260904 is the stricter option.

## Quirks

- Every date relationship on a DateTime column fires this rule. That is what the source rule does; disable it in `pbiplint.config.json` if date keys are your standard.

## Links

- https://github.com/microsoft/Analysis-Services/blob/master/BestPracticeRules/BPARules.json
