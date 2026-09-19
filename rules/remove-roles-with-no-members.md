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

Each finding names the role on its own, as `West Region`, because a role belongs to the model rather than to a table.

## Example

```tmdl fires
table Sales
	column Region
		dataType: string
		sourceColumn: Region

	column Amount
		dataType: decimal
		sourceColumn: Amount

role 'West Region'
	modelPermission: read

	tablePermission Sales = 'Sales'[Region] = "West"
```

```tmdl fixed
table Sales
	column Region
		dataType: string
		sourceColumn: Region

	column Amount
		dataType: decimal
		sourceColumn: Amount

role 'West Region'
	modelPermission: read

	member 'west.sales@contoso.com'
		memberType: user
		identityProvider: AzureAD

	tablePermission Sales = 'Sales'[Region] = "West"
```

## Why it matters

Where a model carries its own membership, a role with no members filters nobody. An empty role leaves the next reviewer guessing whether it was never assigned, was removed on purpose, or was dropped by a failed deployment, which is exactly the question a security review has to answer. In the meantime the role still has to be read and understood by everyone who reviews the model, and it appears in every list of roles as though somebody were behind it.

## How to fix it

Assign the members where the model keeps them. For a semantic model published to the Power BI service, the roles are written in Power BI Desktop under Modeling, Manage roles, and the people are added after publishing: open the workspace, choose Security on the semantic model, pick the role, and add the users or the security groups. For a model whose membership lives in the files, add a `member` block under the role in its TMDL file, with the member's name on the declaration line and `memberType` and `identityProvider` beneath it. If the role is not used at all, delete it, in Desktop under Manage roles or by removing its file from the `roles` folder and its `ref role` line from `model.tmdl`.

## When to ignore it

On a Power BI semantic model, role membership is held in the service and is never written into the project files, so every role in the project is reported and every one of those findings is noise. The rule earns its place on a model whose roles carry their own members: an Analysis Services model, or one a deployment pipeline writes membership into.

## Quirks

- Power BI Desktop never writes role members, so every role in a Desktop-authored project is flagged.
- Only the member declarations under the role are counted. `modelPermission` and the role's table permissions make no difference, so a role that filters every table in the model reads exactly like one that does nothing.

## Related rules

- `LIMIT_ROW_LEVEL_SECURITY_(RLS)_LOGIC` reads the filters inside the same roles and reports the table whose filter calls RIGHT, LEFT, UPPER, LOWER, or FIND.
- `CHECK_IF_DYNAMIC_ROW_LEVEL_SECURITY_(RLS)_IS_NECESSARY` reports a filter in those roles that calls USERNAME or USERPRINCIPALNAME, which is the pattern that assigns access by the signed-in user instead of by membership.
- `TRIM_OBJECT_NAMES` reads role names and reports one that starts or ends with a space.
