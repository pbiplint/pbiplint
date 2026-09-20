---
id: LIMIT_ROW_LEVEL_SECURITY_(RLS)_LOGIC
name: "Limit row level security (RLS) logic"
category: Performance
severity: warning
scope: [Table, CalculatedTable]
status: ported
video:
sources:
  - https://github.com/microsoft/Analysis-Services/blob/master/BestPracticeRules/BPARules.json
---

# Limit row level security (RLS) logic

## What it checks

Tables whose row-level security filter, in any role, calls RIGHT, LEFT, UPPER, LOWER, or FIND.

Each finding names the table, as `'Employee'`. The role is not in the line and neither is the filter, so open Manage roles and read the filter on that table in each role.

## Example

```tmdl fires
table Employee
	column Email
		dataType: string
		sourceColumn: Email

	column Region
		dataType: string
		sourceColumn: Region

role 'Regional Users'
	modelPermission: read

	tablePermission Employee = UPPER('Employee'[Email]) = UPPER(USERPRINCIPALNAME())
```

```tmdl fixed
table Employee
	column Email
		dataType: string
		sourceColumn: EmailNormalized

	column Region
		dataType: string
		sourceColumn: Region

role 'Regional Users'
	modelPermission: read

	tablePermission Employee = 'Employee'[Email] = USERPRINCIPALNAME()
```

## Why it matters

A security filter runs on every query from every user in the role, and string functions in it are evaluated row by row on the secured table. A filter that compares a precomputed key column with equals is applied as a lookup instead. The string logic usually exists to derive a key from an email address or a code, which the source can produce once at load.

## How to fix it

Precompute the value the filter is deriving, then compare it with equals. In Power BI Desktop, choose Transform data, select the query behind the secured table, and add the derived column there with Add Column, Custom Column, or better still add it to the view the query reads so every model gets it. Then, under Modeling, Manage roles, rewrite the filter as a plain comparison such as `'Employee'[Email] = USERPRINCIPALNAME()`; in the TMDL file that is the text after the `=` on the role's `tablePermission` line. The example above is the common one: DAX compares text without regard to letter case, so the two UPPER calls were doing nothing the equals sign did not already do, and the fix is to delete them. Where the string work is real, for example taking the domain off an address, do it in the query and leave the filter as one comparison. The route is the same for an import table and a DirectQuery one, though on DirectQuery the derived column has to fold, so the source view is the safer place for it.

## When to ignore it

Where the function is applied to the user's name rather than to a column, the finding is noise. An expression such as `'Employee'[Domain] = RIGHT(USERPRINCIPALNAME(), LEN(USERPRINCIPALNAME()) - FIND("@", USERPRINCIPALNAME()))` evaluates the string work once per query, not once per row, which is the cost the rule is about. A small secured table is the second case: a few hundred rows of a security table cost little however the filter is written, so measure with the role applied before you rebuild a query. What is not worth ignoring is a string function applied to a column of a large fact or dimension table, because that is the row-by-row evaluation the rule was written for, and the table only gets bigger.

## Quirks

- Spaces are removed before matching and the match is a substring, so `BRIGHT(` or `L E F T(` also match.
- The five names are matched without regard to letter case, so `upper(` counts.
- Only those five functions are matched. SUBSTITUTE, SEARCH, CONCATENATE, PATHCONTAINS, and the rest pass, however heavy the filter they sit in.
- The finding is on the table, so a table filtered by three roles with string logic in each is reported once.
- Calculated tables are in scope; calculation groups are not.

## Related rules

- `CHECK_IF_DYNAMIC_ROW_LEVEL_SECURITY_(RLS)_IS_NECESSARY` reads the same filters and reports the table permission when one calls USERNAME or USERPRINCIPALNAME. The example above fires both, on the same filter.
- `AVOID_USING_MANY-TO-MANY_RELATIONSHIPS_ON_TABLES_USED_FOR_DYNAMIC_ROW_LEVEL_SECURITY` reports the same table when it also takes part in a many-to-many relationship.
- `AVOID_THE_USERELATIONSHIP_FUNCTION_AND_RLS_AGAINST_THE_SAME_TABLE` reports the same table when a measure activates a relationship into it, which the engine refuses once a role is applied.
- `REMOVE_ROLES_WITH_NO_MEMBERS` reads the roles these filters live in and reports the ones the project files carry no members for.
