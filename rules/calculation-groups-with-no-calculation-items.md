---
id: CALCULATION_GROUPS_WITH_NO_CALCULATION_ITEMS
name: "Calculation groups with no calculation items"
category: Maintenance
severity: warning
scope: [CalculationGroupTable]
status: ported
video:
sources:
  - https://github.com/microsoft/Analysis-Services/blob/master/BestPracticeRules/BPARules.json
---

# Calculation groups with no calculation items

## What it checks

Calculation groups that contain no calculation items.

Each finding names the group's table, as `'Time Intelligence'`, because a calculation group is a table in the model files and pbiplint reports it as one.

## Example

```tmdl fires
table 'Time Intelligence'

	calculationGroup

	column 'Time Calculation'
		dataType: string
		summarizeBy: none
		sourceColumn: Name

	partition 'Time Intelligence' = calculationGroup
		mode: import

table Date
	column Date
		dataType: dateTime
		sourceColumn: Date
```

```tmdl fixed
table 'Time Intelligence'

	calculationGroup

		calculationItem YTD = CALCULATE(SELECTEDMEASURE(), DATESYTD('Date'[Date]))

	column 'Time Calculation'
		dataType: string
		summarizeBy: none
		sourceColumn: Name

	partition 'Time Intelligence' = calculationGroup
		mode: import

table Date
	column Date
		dataType: dateTime
		sourceColumn: Date
```

## Why it matters

A calculation group with no items still appears in the field list as a table with one column, and dropping that column on a visual does nothing. It is usually a group that was started and abandoned, and it puzzles whoever finds it later.

## How to fix it

In Power BI Desktop, open Model view, find the group under Calculation groups in the Model explorer pane, choose New calculation item, and write its DAX in the formula bar. In the TMDL file the group is a `calculationGroup` block under the table, and each item is a `calculationItem` inside it with its DAX after the `=`. If the group is not wanted, delete the table: in Desktop, right-click it in the Data pane and choose Delete from model; in the project, remove its file from the `tables` folder.

## When to ignore it

The one moment the finding is noise is while you are building the group, between creating it and writing the first item, when it tells you something you already know. There is no reason to ship one: an empty group is a field in the list that does nothing when a report author uses it.

## Quirks

- The rule counts items, not what they do. A group with one item whose expression is empty leaves this rule's condition, and `EXPRESSION_RELIANT_OBJECTS_MUST_HAVE_AN_EXPRESSION` picks it up instead.
- pbiplint reads a table as a calculation group when the table carries a `calculationGroup` block, whatever its partition says, and rules scoped to tables or calculated tables then pass over it.

## Related rules

- `EXPRESSION_RELIANT_OBJECTS_MUST_HAVE_AN_EXPRESSION` reports a calculation item whose expression is empty, which is the state of the item you add to clear this finding until you write its DAX.
- `OBJECTS_WITH_NO_DESCRIPTION` reads the same calculation group table and reports it when it is visible and carries no description.
