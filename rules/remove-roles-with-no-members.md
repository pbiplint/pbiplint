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

In a Power BI project the role definitions live in the files and the membership lives in the service, so a role in the files never has members and this rule fires for every role. pbiplint keeps that behavior to match the source ruleset. On models where membership is in the file, such as ones built for Analysis Services, a role with no members grants nothing and leaves the next reviewer guessing whether membership was never assigned, was removed on purpose, or was dropped by a failed deployment, which is exactly the question a security review needs answered.

## How to fix it

On a Power BI project, turn the rule off with `"REMOVE_ROLES_WITH_NO_MEMBERS": "off"` in `pbiplint.config.json`, or annotate the roles that are meant to be empty. Elsewhere, assign the members or delete the role.

## Quirks

- Power BI Desktop never writes role members, so every role in a Desktop-authored project is flagged.

## Links

- https://github.com/microsoft/Analysis-Services/blob/master/BestPracticeRules/BPARules.json
