---
id: AVOID_USING_MANY-TO-MANY_RELATIONSHIPS_ON_TABLES_USED_FOR_DYNAMIC_ROW_LEVEL_SECURITY
name: "Avoid using many-to-many relationships on tables used for dynamic row level security"
category: Performance
severity: error
scope: [Table]
status: ported
layer: model
video:
sources:
  - https://github.com/microsoft/Analysis-Services/blob/master/BestPracticeRules/BPARules.json
---

# Avoid using many-to-many relationships on tables used for dynamic row level security

## What it checks

Regular tables that carry a row-level security filter in any role and take part in a many-to-many relationship.

Each finding names the table, as `'User Region'`. Neither the relationship nor the role is in the line, so open the model view for the relationship and Manage roles for the filter.

## Example

```tmdl fires
table Customer
	column 'Customer ID'
		dataType: int64
		isKey
		sourceColumn: CustomerID

	column Region
		dataType: string
		sourceColumn: Region

table 'User Region'
	column 'User Email'
		dataType: string
		sourceColumn: UserEmail

	column Region
		dataType: string
		sourceColumn: Region

relationship UserRegion_Customer
	fromCardinality: many
	toCardinality: many
	crossFilteringBehavior: bothDirections
	fromColumn: 'User Region'.Region
	toColumn: Customer.Region

role 'Regional Users'
	modelPermission: read

	tablePermission 'User Region' = 'User Region'[User Email] = USERPRINCIPALNAME()
```

```tmdl fixed
table Customer
	column 'Customer ID'
		dataType: int64
		isKey
		sourceColumn: CustomerID

	column Region
		dataType: string
		sourceColumn: Region

table Region
	column Region
		dataType: string
		isKey
		sourceColumn: Region

table 'User Region'
	column 'User Email'
		dataType: string
		sourceColumn: UserEmail

	column Region
		dataType: string
		sourceColumn: Region

relationship UserRegion_Region
	crossFilteringBehavior: bothDirections
	fromColumn: 'User Region'.Region
	toColumn: Region.Region

relationship Customer_Region
	fromColumn: Customer.Region
	toColumn: Region.Region

role 'Regional Users'
	modelPermission: read

	tablePermission 'User Region' = 'User Region'[User Email] = USERPRINCIPALNAME()
```

## Why it matters

A security filter is pushed through every relationship leading away from the secured table, on every query, for every user in the role. Through a many-to-many relationship that push is an expansion over the distinct values on both sides rather than a lookup, and it runs before the query proper. The slowdown grows with every such hop, and the model owner never sees it, because Desktop tests without roles.

## How to fix it

Give the two tables a dimension to meet on, so every hop is many-to-one. Load a small table of the distinct key values, one row per region in the example above, and in Power BI Desktop's model view drag both the security table's key and the fact or dimension key onto it; each new relationship is many-to-one because the new table's key is unique. In the TMDL file that is `fromCardinality: many` with `toCardinality: one`, which is what a relationship block with neither line already means, and marking the new table's key column with `isKey`. The security filter itself does not move: it stays where Modeling, Manage roles wrote it, as a `tablePermission` line under the role. Leave one bi-directional hop, from the security table up to the shared dimension, so the filter still reaches the facts, and make it that one hop rather than a many-to-many expansion. The patterns under Links set out the variants in full.

## When to ignore it

The filter is the thing to look at first. This rule counts any row-level security filter, so a table filtered by a static expression such as `[Region] = "East"` is reported exactly like one filtered by a lookup on the signed-in user. A static filter resolves to the same rows for everyone in the role, so the expansion is cached and shared instead of repeated per user. The direction of the relationship is the second check: the finding only asks whether a many-to-many relationship touches the table, not whether the security filter travels through it, so a many-to-many relationship pointing away from the secured path costs nothing here. Size is the third: a security table of a few hundred rows expands cheaply, and the trade the rule assumes is one worth measuring in the service with the role applied before you rebuild anything. A large secured table reached through more than one many-to-many hop is the case the rule was written for, and there ignoring it is not defensible.

## Quirks

- Any row-level security filter counts, not only dynamic filters that call USERNAME or USERPRINCIPALNAME.
- Calculated tables are out of scope, and so are calculation groups. Only a plain table is reported, even where a calculated table carries the filter.
- The relationship only has to touch the table. Direction is not tested, so a many-to-many relationship the security filter never travels through is reported the same as one it does.
- A table permission with no filter expression does not count. An entry that only sets `metadataPermission` or a column permission, which is object-level security rather than row-level, leaves the table out of this rule.

## Related rules

- `CHECK_IF_BI-DIRECTIONAL_AND_MANY-TO-MANY_RELATIONSHIPS_ARE_VALID` reports the relationship itself, which this rule only names a table for. The example above fires both.
- `MANY-TO-MANY_RELATIONSHIPS_SHOULD_BE_SINGLE-DIRECTION` reports the same relationship again when it filters both ways, as the one in the example does.
- `CHECK_IF_DYNAMIC_ROW_LEVEL_SECURITY_(RLS)_IS_NECESSARY` reads the same filter and reports the table permission when it calls USERNAME or USERPRINCIPALNAME, which is the dynamic half of this rule's name.
- `LIMIT_ROW_LEVEL_SECURITY_(RLS)_LOGIC` reports the same table when that filter calls RIGHT, LEFT, UPPER, LOWER, or FIND.

## Links

- [Dynamic row-level security patterns](https://www.elegantbi.com/post/dynamicrlspatterns)
