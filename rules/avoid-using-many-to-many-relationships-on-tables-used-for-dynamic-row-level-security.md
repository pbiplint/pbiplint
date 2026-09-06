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

Tables that carry a row-level security filter and take part in a many-to-many relationship.

## Why it matters

Using many-to-many relationships on tables which use dynamic row level security can cause serious query performance degradation. This pattern's performance problems compound when snowflaking multiple many-to-many relationships against a table which contains row level security. Instead, use one of the patterns shown in the article below where a single dimension table relates many-to-one to a security table.

## How to fix it

Relate the security table many-to-one to a single dimension instead.

## Links

- https://github.com/microsoft/Analysis-Services/blob/master/BestPracticeRules/BPARules.json
- https://www.elegantbi.com/post/dynamicrlspatterns
