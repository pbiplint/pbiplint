---
id: LIMIT_ROW_LEVEL_SECURITY_(RLS)_LOGIC
name: "Limit row level security (RLS) logic"
category: Performance
severity: warning
scope: [Table, CalculatedTable]
status: ported
video:
sources:
  - https://github.com/microsoft/Analysis-Services/blob/master/BestPracticeRules/BPARules.json
---

# Limit row level security (RLS) logic

## What it checks

Tables whose row-level security filter, in any role, calls RIGHT, LEFT, UPPER, LOWER, or FIND.

## Why it matters

A security filter runs on every query from every user in the role, and string functions in it are evaluated row by row on the secured table. A filter that compares a precomputed key column with equals is applied as a lookup instead. The string logic usually exists to derive a key from an email address or a code, which the source can produce once at load.

## How to fix it

Add the derived key as a column in Power Query or in the source, and write the filter as a plain comparison such as `[Email] = USERPRINCIPALNAME()` or `[Region Key] = LOOKUPVALUE(...)`.

## Quirks

- Spaces are removed before matching and the match is a substring, so `BRIGHT(` or `L E F T(` also match.

## Links

- https://github.com/microsoft/Analysis-Services/blob/master/BestPracticeRules/BPARules.json
