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

Relationships where the many side holds key values that do not exist on the one side. Row data is not in the model files, so pbiplint lists this rule but cannot run it.

## Why it matters

Every orphan key is grouped under a single blank row of the dimension, so slicers grow a blank entry, totals include amounts that no category explains, and a filter on any dimension attribute silently drops those rows. The blank row is also added to the dimension in memory on every refresh.

## How to fix it

Find the orphans with a query in Power BI Desktop's DAX query view, such as `EVALUATE EXCEPT(VALUES(Sales[Product Key]), VALUES(Product[Product Key]))`, or read the violation count per relationship in DAX Studio's VertiPaq Analyzer. Then fix the source: add the missing dimension rows, or add an Unknown row and map the orphans to it.

pbiplint cannot evaluate this rule from files; it appears in `pbiplint rules` as needing a live model.

## Links

- https://github.com/microsoft/Analysis-Services/blob/master/BestPracticeRules/BPARules.json
- https://blog.enterprisedna.co/vertipaq-analyzer-tutorial-relationships-referential-integrity/
