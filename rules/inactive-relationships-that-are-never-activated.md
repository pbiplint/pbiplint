---
id: INACTIVE_RELATIONSHIPS_THAT_ARE_NEVER_ACTIVATED
name: "Inactive relationships that are never activated"
category: DAX Expressions
severity: warning
scope: [Relationship]
status: ported
video:
sources:
  - https://github.com/microsoft/Analysis-Services/blob/master/BestPracticeRules/BPARules.json
---

# Inactive relationships that are never activated

## What it checks

Inactive relationships that no measure or calculation item activates with USERELATIONSHIP.

Each finding names the relationship the way the rest of the tool does, from column to column with the cardinality between them: `'Sales'[Ship Date] ∞←1 'Date'[Date]`.

## Example

```tmdl fires
table Sales
	column 'Order Date'
		dataType: dateTime
		sourceColumn: OrderDate
	column 'Ship Date'
		dataType: dateTime
		sourceColumn: ShipDate
	column Amount
		dataType: decimal
		sourceColumn: Amount
	measure 'Total Sales' = SUM(Sales[Amount])
		formatString: #,0

table Date
	column Date
		dataType: dateTime
		isKey
		sourceColumn: Date

relationship Sales_Date_Order
	fromColumn: Sales.'Order Date'
	toColumn: Date.Date

relationship Sales_Date_Ship
	isActive: false
	fromColumn: Sales.'Ship Date'
	toColumn: Date.Date
```

```tmdl fixed
table Sales
	column 'Order Date'
		dataType: dateTime
		sourceColumn: OrderDate
	column 'Ship Date'
		dataType: dateTime
		sourceColumn: ShipDate
	column Amount
		dataType: decimal
		sourceColumn: Amount
	measure 'Total Sales' = SUM(Sales[Amount])
		formatString: #,0
	measure 'Shipped Sales' = CALCULATE([Total Sales], USERELATIONSHIP(Sales[Ship Date], 'Date'[Date]))
		formatString: #,0

table Date
	column Date
		dataType: dateTime
		isKey
		sourceColumn: Date

relationship Sales_Date_Order
	fromColumn: Sales.'Order Date'
	toColumn: Date.Date

relationship Sales_Date_Ship
	isActive: false
	fromColumn: Sales.'Ship Date'
	toColumn: Date.Date
```

## Why it matters

An inactive relationship does nothing on its own. It exists so a measure can switch it on with USERELATIONSHIP, typically for a second date on a fact table. If no measure does, the relationship is either a leftover from a design that changed or a plan that was never finished, and a report author who sees the dotted line in the model view will assume the filter works.

## How to fix it

Write the measure the relationship was put there for, so the second date has something that reads it:

```
Shipped Sales = CALCULATE ( [Total Sales], USERELATIONSHIP ( Sales[Ship Date], 'Date'[Date] ) )
```

In Power BI Desktop, choose New measure on the Home ribbon and type the expression in the formula bar. In the TMDL file, add the `measure` block to the fact table. Name the columns in the order the relationship declares them, its from column first. DAX takes them either way round, but only that order counts as activation here.

Where nothing needs the relationship, delete it instead: open the model view, right-click the dotted line, and choose Delete, or remove its `relationship` block from the TMDL file.

## When to ignore it

pbiplint reads the semantic model, not the reports built on it. A report-level measure in a live-connected report can call USERELATIONSHIP, and this rule cannot see it, so check the reports before deleting a relationship that looks unused. The same goes for a relationship activated from a calculated column, a calculated table, or a row-level security filter: none of those is scanned here, and a finding on one of them is noise. A relationship added this week for measures that are still being written is a fair thing to leave alone for a sprint.

## Quirks

- Only `USERELATIONSHIP(from column, to column)` counts as activation; the reversed argument order does not, even though DAX accepts it.
- Only measures and calculation items are scanned. A USERELATIONSHIP call in a calculated column, a calculated table, or a row-level security filter does not count as activation.
- The call is matched as text, in any letter case, so a USERELATIONSHIP written inside a string literal or a comment counts as activating the relationship.
- Either table name may be written bare or in single quotes, and any spacing around the comma is accepted.
- pbiplint escapes table and column names before building the pattern, which the source rule does not, so names with parentheses cannot break the check.

## Related rules

- `AVOID_THE_USERELATIONSHIP_FUNCTION_AND_RLS_AGAINST_THE_SAME_TABLE` reports the table named second in the call when that table also carries a row-level security filter, so writing the measure this rule asks for can raise a finding there.
- `ENSURE_TABLES_HAVE_RELATIONSHIPS` counts an inactive relationship as a relationship, so deleting the one reported here can leave its tables with none and move the finding to that rule.

## Links

- [Active and inactive relationships in Power BI](https://docs.microsoft.com/power-bi/guidance/relationships-active-inactive)
- [USERELATIONSHIP on DAX Guide](https://dax.guide/userelationship/)
