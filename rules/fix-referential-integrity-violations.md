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
---

# Fix referential integrity violations

## What it checks

Relationships where the many side holds key values that do not exist on the one side. The count of offending rows is a statistic of the loaded data, not of the model files, so pbiplint lists this rule but does not run it: it needs statistics that only a live model carries.

## Why it matters

Every orphan key is grouped under a single blank row of the dimension, so slicers grow a blank entry, totals include amounts that no category explains, and a filter on any dimension attribute silently drops those rows. The blank row is also added to the dimension in memory on every refresh.

## How to fix it

Find the orphans first. In Power BI Desktop's DAX query view, run a query such as `EVALUATE EXCEPT(VALUES('Sales'[Product Key]), VALUES('Product'[Product Key]))` for each relationship you suspect, which lists the keys the dimension is missing. Then fix the data where it is loaded: add the missing rows to the dimension query, or add an Unknown row to the dimension and map the orphan keys to it in Power Query or in the warehouse view behind it. Where the orphans are legitimate and the dimension cannot grow, filter the fact rows out in Power Query instead, so the blank member never appears. DAX Studio's VertiPaq Analyzer reads the violation count for every relationship at once if you would rather start from a list than a query per relationship.

## Quirks

- The source rule reads a `Vertipaq_RIViolationInvalidRows` annotation that a Tabular Editor script writes onto the model after loading VertiPaq statistics. A project's files never carry that annotation, which is why pbiplint lists the rule rather than running it.

## Related rules

- `RELATIONSHIP_COLUMNS_SAME_DATA_TYPE` reads the same relationships out of the files and reports the ones whose two columns have different data types, which pbiplint can check without any data.
- `MARK_PRIMARY_KEYS` reports the column on the one side of a relationship when it is not marked as the table's key, which is the column this rule's condition is about.

## Links

- [Reading referential integrity violations in VertiPaq Analyzer](https://blog.enterprisedna.co/vertipaq-analyzer-tutorial-relationships-referential-integrity/)
