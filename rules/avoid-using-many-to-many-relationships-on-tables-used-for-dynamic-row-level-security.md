---
id: AVOID_USING_MANY-TO-MANY_RELATIONSHIPS_ON_TABLES_USED_FOR_DYNAMIC_ROW_LEVEL_SECURITY
name: "Avoid using many-to-many relationships on tables used for dynamic row level security"
category: Performance
severity: error
scope: [Table]
status: ported
video:
sources:
  - https://github.com/microsoft/Analysis-Services/blob/master/BestPracticeRules/BPARules.json
  - https://www.elegantbi.com/post/dynamicrlspatterns
---

# Avoid using many-to-many relationships on tables used for dynamic row level security

## What it checks

Regular tables that carry a row-level security filter in any role and take part in a many-to-many relationship.

## Why it matters

A security filter is pushed through every relationship leading away from the secured table, on every query, for every user in the role. Through a many-to-many relationship that push is an expansion over the distinct values on both sides rather than a lookup, and it runs before the query proper. The slowdown grows with every such hop, and the model owner never sees it, because Desktop tests without roles.

## How to fix it

Put the security filter on a small security table that relates many-to-one to a single dimension, and let the dimension filter the facts through ordinary one-to-many relationships. The elegantbi post in the links walks through the patterns.

## Quirks

- Any row-level security filter counts, not only dynamic filters that call USERNAME or USERPRINCIPALNAME.
- Calculated tables are out of scope.

## Links

- https://github.com/microsoft/Analysis-Services/blob/master/BestPracticeRules/BPARules.json
- https://www.elegantbi.com/post/dynamicrlspatterns
