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

A role with no members grants nothing, so it is dead weight that still has to be read and understood every time someone audits the model's security. It is also ambiguous in the worst way: the next person cannot tell whether membership was never assigned, was removed deliberately, or was dropped by a failed deployment, and that is exactly the question a security review needs answered. Either assign the members or delete the role, so the roles in the model match the access that is actually in force. In a Power BI project the membership is held in the service rather than in the files, so read the Quirks note below before acting on this rule.

## How to fix it

Assign members in the service, or delete roles that are not used.

Tabular Editor fix expression: `Delete()`

## Quirks

- Power BI projects never contain role members, so every role in a PBIP is flagged. Disable the rule in pbiplint.config.json if this is noise for you.

## Links

- https://github.com/microsoft/Analysis-Services/blob/master/BestPracticeRules/BPARules.json
