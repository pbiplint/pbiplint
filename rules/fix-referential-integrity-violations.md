---
id: FIX_REFERENTIAL_INTEGRITY_VIOLATIONS
name: "Fix referential integrity violations"
category: Maintenance
severity: warning
scope: [Relationship]
status: needsLiveModel
video:
sources:
  - https://github.com/microsoft/Analysis-Services/blob/master/BestPracticeRules/BPARules.json
  - https://blog.enterprisedna.co/vertipaq-analyzer-tutorial-relationships-referential-integrity/
---

# Fix referential integrity violations

## What it checks

Relationships with foreign key values missing from the dimension. Needs VertiPaq statistics.

## Why it matters

This rule highlights relationships which have referential integrity violations. This indicates that there are values in the table on the 'from' side of the relationship which do not exist in the table on the 'to' side of the relationship. Referential integrity violations will also produce the 'blank' member value in slicers. It is recommended to fix these issues by ensuring that the 'to' table's primary key column has all the values in the 'from' table's foreign key column.

## How to fix it

Add the missing dimension rows or fix the fact data.

pbiplint cannot evaluate this rule from files; it appears in `pbiplint rules` as needing a live model.

## Links

- https://github.com/microsoft/Analysis-Services/blob/master/BestPracticeRules/BPARules.json
- https://blog.enterprisedna.co/vertipaq-analyzer-tutorial-relationships-referential-integrity/
