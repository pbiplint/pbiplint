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

Row-level security filters that call USERNAME or USERPRINCIPALNAME. Reported per table permission, at info severity.

## Why it matters

A dynamic filter is evaluated for each user separately, so the engine cannot share a cached result between two people with the same access, and every query carries the lookup that maps the user to their rows. That is the right trade when the audience is large or changes often. When a handful of fixed groups each see a fixed slice, static roles with a plain filter are faster and simpler to audit.

## How to fix it

Keep the dynamic filter when the user-to-data mapping lives in a table and changes without a redeploy. Otherwise create one role per audience with a static filter such as `[Region] = "East"` and assign members in the service.

## Quirks

- A space before the parenthesis, as some DAX formatters write, is not matched: `USERPRINCIPALNAME ()` passes.

## Links

- https://github.com/microsoft/Analysis-Services/blob/master/BestPracticeRules/BPARules.json
- https://docs.microsoft.com/power-bi/admin/service-admin-rls
