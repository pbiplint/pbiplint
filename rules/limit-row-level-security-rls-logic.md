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

Tables whose row-level security filters use RIGHT, LEFT, UPPER, LOWER, or FIND.

## Why it matters

Try to simplify the DAX used for row level security. Usage of the functions within this rule can likely be offloaded to the upstream systems (data warehouse).

## How to fix it

Precompute the security key upstream so the filter is a simple equality.

## Quirks

- Spaces are removed before matching and the match is a substring, so `BRIGHT(` or `L E F T(` also match.

## Links

- https://github.com/microsoft/Analysis-Services/blob/master/BestPracticeRules/BPARules.json
