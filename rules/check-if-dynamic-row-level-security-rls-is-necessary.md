---
id: CHECK_IF_DYNAMIC_ROW_LEVEL_SECURITY_(RLS)_IS_NECESSARY
name: "Check if dynamic row level security (RLS) is necessary"
category: Performance
severity: info
scope: [TablePermission]
status: ported
video:
sources:
  - https://github.com/microsoft/Analysis-Services/blob/master/BestPracticeRules/BPARules.json
  - https://docs.microsoft.com/power-bi/admin/service-admin-rls
---

# Check if dynamic row level security (RLS) is necessary

## What it checks

Row-level security filters that call USERNAME() or USERPRINCIPALNAME().

## Why it matters

Usage of dynamic row level security (RLS) can add memory and performance overhead. Please research the pros/cons of using it.

## How to fix it

Use static roles when the audience is small and fixed.

## Quirks

- A space before the parenthesis, as DAX formatters produce (`USERPRINCIPALNAME ()`), is not matched.

## Links

- https://github.com/microsoft/Analysis-Services/blob/master/BestPracticeRules/BPARules.json
- https://docs.microsoft.com/power-bi/admin/service-admin-rls
