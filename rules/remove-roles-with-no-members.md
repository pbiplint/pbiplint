---
id: REMOVE_ROLES_WITH_NO_MEMBERS
name: "Remove roles with no members"
category: Maintenance
severity: info
scope: [Role]
status: ported
video:
sources:
  - https://github.com/microsoft/Analysis-Services/blob/master/BestPracticeRules/BPARules.json
---

# Remove roles with no members

## What it checks

Roles with no members.

## Why it matters

May remove roles with no members.

## How to fix it

Assign members in the service, or delete roles that are not used.

Tabular Editor fix expression: `Delete()`

## Quirks

- Power BI projects never contain role members, so every role in a PBIP is flagged. Disable the rule in pbiplint.config.json if this is noise for you.

## Links

- https://github.com/microsoft/Analysis-Services/blob/master/BestPracticeRules/BPARules.json
