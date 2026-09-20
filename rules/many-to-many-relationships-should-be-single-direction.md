---
id: MANY-TO-MANY_RELATIONSHIPS_SHOULD_BE_SINGLE-DIRECTION
name: "Many-to-many relationships should be single-direction"
category: Performance
severity: warning
scope: [Relationship]
status: ported
video:
sources:
  - https://github.com/microsoft/Analysis-Services/blob/master/BestPracticeRules/BPARules.json
---

# Many-to-many relationships should be single-direction

## What it checks

Many-to-many relationships with bi-directional cross filtering.

Each finding names the relationship, as `'Customer'[Region] ∞↔∞ 'Regional Budget'[Region]`. The `∞` on both sides is the many-to-many cardinality and the `↔` is the bi-directional filter, so both halves of the condition are visible in the line.

## Example

```tmdl fires
table Customer
	column Region
		dataType: string
		sourceColumn: Region

	column 'Customer ID'
		dataType: int64
		isKey
		sourceColumn: CustomerID

table 'Regional Budget'
	column Region
		dataType: string
		sourceColumn: Region

	column Budget
		dataType: decimal
		summarizeBy: sum
		sourceColumn: Budget

relationship Customer_RegionalBudget
	fromCardinality: many
	toCardinality: many
	crossFilteringBehavior: bothDirections
	fromColumn: Customer.Region
	toColumn: 'Regional Budget'.Region
```

```tmdl fixed
table Customer
	column Region
		dataType: string
		sourceColumn: Region

	column 'Customer ID'
		dataType: int64
		isKey
		sourceColumn: CustomerID

table 'Regional Budget'
	column Region
		dataType: string
		sourceColumn: Region

	column Budget
		dataType: decimal
		summarizeBy: sum
		sourceColumn: Budget

relationship Customer_RegionalBudget
	fromCardinality: many
	toCardinality: many
	fromColumn: Customer.Region
	toColumn: 'Regional Budget'.Region
```

## Why it matters

A many-to-many relationship has no unique key on either side, so the engine resolves it through a set of distinct values rather than a direct lookup. Making that relationship bi-directional as well lets filters travel back through the same expansion, and that is where filter ambiguity begins: as soon as two paths reach the same table, the result depends on which path the engine chooses, and totals stop agreeing with the sum of their parts. The extra direction also costs at query time, because every filter has to be expanded across the distinct values on both sides instead of one. Single direction keeps one predictable filter path and is the accepted default; add the reverse direction only where a specific report needs it and you have confirmed the model has no second path.

## How to fix it

In Power BI Desktop, open the model view, double-click the relationship, and set Cross filter direction to Single in the Edit relationship dialog. In the TMDL file that is the `crossFilteringBehavior: bothDirections` line under the relationship, deleted; single direction is the default and needs no line of its own. Check which way the one direction then runs: with single direction the filter travels from the relationship's to column toward its from column, which are the `toColumn` and `fromColumn` lines in the file and the two ends of the arrow in the model view. Where a report needed the reverse filter, put it in the measure instead of the model, as in `Budget In Scope = CALCULATE(SUM('Regional Budget'[Budget]), CROSSFILTER('Customer'[Region], 'Regional Budget'[Region], BOTH))`, so one visual pays for it rather than every query. Better again, load a region table with one row per region and relate both tables to it many-to-one, which removes the many-to-many relationship and the question with it.

## When to ignore it

A bridge that has to filter upward is the legitimate case: a security table that must narrow a dimension, or a mapping table between two dimensions that a slicer has to reach through. Both are designs where the reverse direction is the whole point, and neither is fixed by the rule's advice. Before you ignore one, trace the model view for a second path between the same two tables, because the ambiguity this rule guards against only exists when there are two, and one bridge with one path is safe. Ignore the finding on that relationship and leave the rule on: the next bi-directional many-to-many relationship someone adds is the one you want to hear about.

## Quirks

- Both halves are read from the relationship alone. Nothing about the columns, their distinct counts, or whether any report uses the filter enters into it.
- Inactive relationships are reported. A relationship that only comes alive inside USERELATIONSHIP is treated the same as an active one.
- The from side is many by default and the to side is one, so a relationship counts as many-to-many only where `toCardinality: many` was written, whether or not `fromCardinality: many` is there beside it.

## Related rules

- `CHECK_IF_BI-DIRECTIONAL_AND_MANY-TO-MANY_RELATIONSHIPS_ARE_VALID` reports every relationship this rule reports, and also the ones that are only bi-directional or only many-to-many. The example above fires both.
- `AVOID_EXCESSIVE_BI-DIRECTIONAL_OR_MANY-TO-MANY_RELATIONSHIPS` counts a relationship reported here twice, once as bi-directional and once as many-to-many, so a model with a few of them reaches that rule's threshold quickly.
- `AVOID_USING_MANY-TO-MANY_RELATIONSHIPS_ON_TABLES_USED_FOR_DYNAMIC_ROW_LEVEL_SECURITY` reports the table at either end of this relationship when that table also carries a row-level security filter, and taking the direction off does not clear it, because the many-to-many cardinality is what that rule reads.
