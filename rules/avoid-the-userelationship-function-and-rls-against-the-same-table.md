---
id: AVOID_THE_USERELATIONSHIP_FUNCTION_AND_RLS_AGAINST_THE_SAME_TABLE
name: "Avoid the USERELATIONSHIP function and RLS against the same table"
category: Error Prevention
severity: error
scope: [Table, CalculatedTable]
status: ported
layer: model
video:
sources:
  - https://github.com/microsoft/Analysis-Services/blob/master/BestPracticeRules/BPARules.json
---

# Avoid the USERELATIONSHIP function and RLS against the same table

## What it checks

Tables that have a row-level security filter in any role and are named as the second argument of USERELATIONSHIP in a measure.

Each finding names the table, as `'Customer'`. Neither the measure nor the role appears in the line, so from a finding you look two ways: for the USERELATIONSHIP calls that name the table second, and for the roles whose filters are on it.

## Example

```tmdl fires
table Sales
	column Amount
		dataType: decimal
		sourceColumn: Amount

	column 'Customer ID'
		dataType: int64
		sourceColumn: CustomerID

	column 'Ship To Customer ID'
		dataType: int64
		sourceColumn: ShipToCustomerID

	measure 'Shipped Amount' = CALCULATE(SUM(Sales[Amount]), USERELATIONSHIP(Sales[Ship To Customer ID], Customer[Customer ID]))
		formatString: #,0

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

relationship Sales_ShipToCustomer
	isActive: false
	fromColumn: Sales.'Ship To Customer ID'
	toColumn: Customer.'Customer ID'

role 'West Region'
	modelPermission: read

	tablePermission Customer = 'Customer'[Region] = "West"
```

```tmdl fixed
table Sales
	column Amount
		dataType: decimal
		sourceColumn: Amount

	column 'Customer ID'
		dataType: int64
		sourceColumn: CustomerID

	column 'Ship To Customer ID'
		dataType: int64
		sourceColumn: ShipToCustomerID

	measure 'Shipped Amount' = SUM(Sales[Amount])
		formatString: #,0

table Customer
	column 'Customer ID'
		dataType: int64
		isKey
		sourceColumn: CustomerID

	column Region
		dataType: string
		sourceColumn: Region

table 'Ship To Customer'
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

relationship Sales_ShipToCustomer
	fromColumn: Sales.'Ship To Customer ID'
	toColumn: 'Ship To Customer'.'Customer ID'

role 'West Region'
	modelPermission: read

	tablePermission Customer = 'Customer'[Region] = "West"

	tablePermission 'Ship To Customer' = 'Ship To Customer'[Region] = "West"
```

The second snippet gives the ship-to relationship a table of its own, so the relationship is active, the measure is the plain aggregation again, and the copy carries the same filter the original does.

## Why it matters

When a role filters a table, the engine has to apply that filter through the active relationship, and USERELATIONSHIP asks it to swap in an inactive one. The two instructions conflict, so the measure fails for every user in the role while it works for the model owner, who tests without roles. That is a bug you find after publishing.

## How to fix it

Give the second relationship a table of its own, so no measure needs USERELATIONSHIP. In Power BI Desktop, choose Transform data, right-click the dimension's query, choose Reference, name the copy for the part it plays, Ship To Customer beside Customer, and load it. In model view, drag the fact table's second key onto the copy's key, which creates an active relationship, and delete the inactive one. Edit the measure in the formula bar so it is the plain aggregation again, and give the copy the same filter the original has, under Modeling, Manage roles. In the TMDL file that is a new `table` block with its own `ref table` line in `model.tmdl`, a `relationship` block with no `isActive: false` line, the expression after `measure 'Shipped Amount' =`, and a second `tablePermission` under the role.

The other route leaves the relationships alone and moves the row-level security instead: put the filter on a table that no measure re-points, and the pairing is gone. Work out what that changes for the reader before you do it, because filtering a dimension and filtering the fact table are not the same restriction.

## When to ignore it

A role nobody is assigned to still counts. The rule pairs any role's filter with any measure, so on a Power BI semantic model, where membership lives in the service and never in the files, an abandoned role produces the finding although no reader ever meets the error. Check the workspace's security settings for the role before you restructure anything. Where the role is real and the measure is one a reader will use, the finding is the error they will see, and there is nothing here to ignore.

## Quirks

- Only the second argument of USERELATIONSHIP is compared, and only measures are scanned. A calculation item that calls USERELATIONSHIP is not checked, and a measure that names the secured table as the first argument passes.
- The comparison is made on the text of the expression, so a USERELATIONSHIP inside a comment or a quoted string counts the same as one the engine will run.
- Only the presence of a filter on the table is tested, never what the filter says. A role whose filter is `TRUE()` puts the table in scope exactly as a real restriction does.
- pbiplint escapes the table name before it builds the pattern, so a table called `Date (Order)` is matched literally. The source rule builds its pattern from the raw name, where the parentheses would be read as a group.

## Related rules

- `INACTIVE_RELATIONSHIPS_THAT_ARE_NEVER_ACTIVATED` reads the same USERELATIONSHIP calls from the other end and reports an inactive relationship that no measure or calculation item activates. Dropping the call without dropping the relationship clears this rule and starts that one; removing the relationship as well clears both.
- `AVOID_USING_MANY-TO-MANY_RELATIONSHIPS_ON_TABLES_USED_FOR_DYNAMIC_ROW_LEVEL_SECURITY` reports a table that carries a row-level security filter and sits in a many-to-many relationship, the same shape of finding built from a role filter and a relationship the engine has to resolve around it.
- `LIMIT_ROW_LEVEL_SECURITY_(RLS)_LOGIC` reads the filters on the same tables and reports the table whose filter calls RIGHT, LEFT, UPPER, LOWER, or FIND.

## Links

- [Chris Webb on USERELATIONSHIP and tabular row security](https://blog.crossjoin.co.uk/2013/05/10/userelationship-and-tabular-row-security/)
