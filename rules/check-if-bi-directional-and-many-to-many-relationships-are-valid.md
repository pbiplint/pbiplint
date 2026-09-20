---
id: CHECK_IF_BI-DIRECTIONAL_AND_MANY-TO-MANY_RELATIONSHIPS_ARE_VALID
name: "Check if bi-directional and many-to-many relationships are valid"
category: Performance
severity: info
scope: [Relationship]
status: ported
video:
sources:
  - https://github.com/microsoft/Analysis-Services/blob/master/BestPracticeRules/BPARules.json
---

# Check if bi-directional and many-to-many relationships are valid

## What it checks

Every relationship that is bi-directional, many-to-many, or both. This is a review list at info severity, not a defect.

Each finding names the relationship by its two columns and its shape, as `'Sales'[Customer ID] ∞↔1 'Customer'[Customer ID]`. The arrow is `↔` when the relationship filters both ways and `←` when it does not, and `∞` on a side means that side is many.

## Example

```tmdl fires
table Sales
	column 'Customer ID'
		dataType: int64
		isHidden
		sourceColumn: CustomerID

	column Amount
		dataType: decimal
		sourceColumn: Amount

table Customer
	column 'Customer ID'
		dataType: int64
		isKey
		sourceColumn: CustomerID

	column Region
		dataType: string
		sourceColumn: Region

relationship Sales_Customer
	crossFilteringBehavior: bothDirections
	fromColumn: Sales.'Customer ID'
	toColumn: Customer.'Customer ID'
```

```tmdl fixed
table Sales
	column 'Customer ID'
		dataType: int64
		isHidden
		sourceColumn: CustomerID

	column Amount
		dataType: decimal
		sourceColumn: Amount

table Customer
	column 'Customer ID'
		dataType: int64
		isKey
		sourceColumn: CustomerID

	column Region
		dataType: string
		sourceColumn: Region

relationship Sales_Customer
	fromColumn: Sales.'Customer ID'
	toColumn: Customer.'Customer ID'
```

## Why it matters

Both kinds have real uses, and both are easy to create by accident: Desktop offers bi-directional filtering as a dropdown, and it falls back to many-to-many when it finds duplicates on both sides of a key. An accidental one costs query time on every visual that touches the tables and can open a second filter path, which is where totals stop adding up without any error.

## How to fix it

Look at each one and decide whether it was meant. In Power BI Desktop, open the model view, double-click the relationship, and read the Cardinality and Cross filter direction dropdowns in the Edit relationship dialog; in the TMDL file the same three facts are `fromCardinality`, `toCardinality`, and `crossFilteringBehavior` under the relationship. Where the direction is not wanted, set Cross filter direction to Single, which is the `crossFilteringBehavior: bothDirections` line deleted, and move the reverse filter into the measures that need it with CROSSFILTER. Where the cardinality is many-to-many because the key column has duplicates, that is a data problem: remove the duplicates in Power Query with Remove Duplicates, or in the source view the query reads, then set Cardinality back to Many to one. Both dropdowns behave the same on an import model and a DirectQuery one.

## When to ignore it

Ignoring is the ordinary outcome for a relationship you meant to create, and this rule exists to make you say so once. A bridge table between two dimensions, a security table that has to filter upward, a slicer that has to narrow to the values a fact table actually holds: each is a deliberate design and each stays. The check worth making before you ignore one is for a second filter path between the same two tables, which the model view shows as two routes; one route is a design, two is where the totals start disagreeing. Review the list again whenever relationships are added, because a path that was unique when you approved it may not be now.

## Quirks

- A relationship counts if it is bi-directional or many-to-many, so a many-to-one relationship that filters both ways is listed and so is a many-to-many relationship that filters one way.
- Inactive relationships are listed. A relationship that only ever comes alive inside USERELATIONSHIP is reported the same as an active one.
- A relationship that names no cardinality is many-to-one, which is Power BI's default, and one that names no cross filter direction is single, so a plain block with only `fromColumn` and `toColumn` is never listed.

## Related rules

- `MANY-TO-MANY_RELATIONSHIPS_SHOULD_BE_SINGLE-DIRECTION` is the stricter form on the relationships that are both at once: it reports the same relationship, at warning severity, and clears when the cross filter direction goes back to single.
- `AVOID_EXCESSIVE_BI-DIRECTIONAL_OR_MANY-TO-MANY_RELATIONSHIPS` counts the relationships this rule lists and reports the model once when they pass 30 percent of all relationships. The example above fires both.
- `AVOID_USING_MANY-TO-MANY_RELATIONSHIPS_ON_TABLES_USED_FOR_DYNAMIC_ROW_LEVEL_SECURITY` reports the table on either end of a many-to-many relationship listed here when that table also carries a row-level security filter.
- `AVOID_BI-DIRECTIONAL_RELATIONSHIPS_AGAINST_HIGH-CARDINALITY_COLUMNS` reads the columns in the bi-directional relationships listed here and reports the ones with more than 100,000 distinct values. pbiplint lists that rule without running it, because a distinct count is not in the files.

## Links

- [Bidirectional relationships and ambiguity in DAX](https://www.sqlbi.com/articles/bidirectional-relationships-and-ambiguity-in-dax/)
