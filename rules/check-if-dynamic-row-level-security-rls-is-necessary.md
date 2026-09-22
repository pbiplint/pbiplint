---
id: CHECK_IF_DYNAMIC_ROW_LEVEL_SECURITY_(RLS)_IS_NECESSARY
name: "Check if dynamic row level security (RLS) is necessary"
category: Performance
severity: info
scope: [TablePermission]
status: ported
layer: model
video:
sources:
  - https://github.com/microsoft/Analysis-Services/blob/master/BestPracticeRules/BPARules.json
---

# Check if dynamic row level security (RLS) is necessary

## What it checks

Row-level security filters that call USERNAME or USERPRINCIPALNAME. Reported per table permission, at info severity.

Each finding names the table the permission filters, as `User Region`, and carries the role beside it, as `role Regional Users`. The table name has no quotes around it here, because the object reported is the permission rather than the table.

## Example

```tmdl fires
table Sales
	column Region
		dataType: string
		sourceColumn: Region

	column Amount
		dataType: decimal
		summarizeBy: sum
		sourceColumn: Amount

table 'User Region'
	column 'User Email'
		dataType: string
		sourceColumn: UserEmail

	column Region
		dataType: string
		sourceColumn: Region

role 'Regional Users'
	modelPermission: read

	tablePermission 'User Region' = 'User Region'[User Email] = USERPRINCIPALNAME()
```

```tmdl fixed
table Sales
	column Region
		dataType: string
		sourceColumn: Region

	column Amount
		dataType: decimal
		summarizeBy: sum
		sourceColumn: Amount

role East
	modelPermission: read

	tablePermission Sales = 'Sales'[Region] = "East"

role West
	modelPermission: read

	tablePermission Sales = 'Sales'[Region] = "West"
```

## Why it matters

A dynamic filter is evaluated for each user separately, so the engine cannot share a cached result between two people with the same access, and every query carries the lookup that maps the user to their rows. That is the right trade when the audience is large or changes often. When a handful of fixed groups each see a fixed slice, static roles with a plain filter are faster and simpler to audit.

## How to fix it

Decide whether the mapping has to be dynamic, then act on the decision. Keep the dynamic filter where the user-to-rows mapping lives in a table that changes without a redeploy, or where there are more audiences than anyone would maintain by hand. Otherwise replace it: in Power BI Desktop, under Modeling, Manage roles, create one role per audience with a plain filter such as `[Region] = "East"`, then delete the dynamic role in the same dialog. In the TMDL file each role is a `role` block in the roles folder, and each filter is the expression after the `=` on a `tablePermission` line under it, so a static filter is the same line with the USERPRINCIPALNAME call gone. Members are assigned after publishing, in the workspace under Security on the semantic model; Power BI Desktop writes roles but never members. Where the dynamic filter stays, the thing worth shortening is the lookup behind it: hold the user-to-key mapping in a small table with the key already computed, so the filter is one comparison instead of a search.

## When to ignore it

Dynamic row-level security is a design, not a defect, and this rule is a prompt to confirm the design once rather than a queue to clear. Ignore it wherever the mapping table is the point: a model whose audience is every salesperson in the company, a hierarchy where a manager sees their reports' rows, anything where a new user should get access by appearing in a table rather than by someone editing the model. The finding is worth a second look in two places. One is a model with two or three fixed audiences, where static roles are simpler to explain to whoever audits access. The other is a dynamic filter over a large secured table, where the per-user lookup runs on every query and the fix is to precompute the key rather than to drop the pattern.

## Quirks

- The two names are matched case-insensitively and as plain substrings ending in an opening parenthesis, so a call inside a comment or a string literal counts, and so does a function whose name ends in `USERNAME(`.
- A space before the parenthesis, as some DAX formatters write, is not matched: `USERPRINCIPALNAME ()` passes.
- The finding is per table permission, so a role that filters three tables with the same call produces three findings, and two roles that filter the same table produce two.

## Related rules

- `LIMIT_ROW_LEVEL_SECURITY_(RLS)_LOGIC` reads the same filters and reports the table when one calls RIGHT, LEFT, UPPER, LOWER, or FIND. A filter that wraps USERPRINCIPALNAME in UPPER fires both.
- `AVOID_USING_MANY-TO-MANY_RELATIONSHIPS_ON_TABLES_USED_FOR_DYNAMIC_ROW_LEVEL_SECURITY` reports the table this permission filters when that table is also in a many-to-many relationship, which is the shape that makes the per-user cost worst.
- `REMOVE_ROLES_WITH_NO_MEMBERS` reports the role this permission sits in whenever the project files carry no members for it, which is every role Power BI Desktop writes.
- `AVOID_THE_USERELATIONSHIP_FUNCTION_AND_RLS_AGAINST_THE_SAME_TABLE` reports the table this permission filters when a measure activates a relationship into it, a combination the engine refuses at query time.

## Links

- [Row-level security with Power BI](https://docs.microsoft.com/power-bi/admin/service-admin-rls)
