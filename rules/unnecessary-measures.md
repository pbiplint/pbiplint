---
id: UNNECESSARY_MEASURES
name: "Remove unnecessary measures"
category: Maintenance
severity: warning
scope: [Measure]
status: ported
video:
sources:
  - https://github.com/microsoft/Analysis-Services/blob/master/BestPracticeRules/BPARules.json
---

# Remove unnecessary measures

## What it checks

Hidden measures, or measures on hidden tables, that no DAX expression references.

## Why it matters

A hidden measure that no other measure uses can only be reached by a report that already had it, so it is either dead or a hidden dependency that breaks the day someone deletes it as dead. Either way it belongs in the open or in the bin.

## How to fix it

Delete the measure, or unhide it if reports still use it.

## Quirks

- References from calculation items and from other hidden measures count as usage.
- Report usage is not visible to this rule. A hidden measure used only by a visual is still flagged.

## Links

- https://github.com/microsoft/Analysis-Services/blob/master/BestPracticeRules/BPARules.json
