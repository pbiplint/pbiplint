---
id: AVOID_INVALID_DESCRIPTION_CHARACTERS
name: "Avoid invalid characters in descriptions"
category: Error Prevention
severity: error
scope: [Table, Measure, Hierarchy, Level, Perspective, Partition, Column, CalculatedColumn, CalculatedTable, CalculatedTableColumn, Role, CalculationGroupTable, CalculationItem]
status: ported
video:
sources:
  - https://github.com/microsoft/Analysis-Services/blob/master/BestPracticeRules/BPARules.json
---

# Avoid invalid characters in descriptions

## What it checks

Descriptions containing a control character other than whitespace. Tabs and line breaks are allowed.

Each finding names the object the description belongs to, a measure as `[Total Sales]` and a column as `'Sales'[Amount]`, not the description. Nothing in the line shows which character is wrong or where in the text it sits, so open the object to find it.

## Example

The description in the first snippet has a start of heading character, U+0001, between `sales` and `after` where the second has a space.

```tmdl fires
table Sales
	column Amount
		dataType: decimal
		sourceColumn: Amount

	/// Net salesafter returns and discounts.
	measure 'Total Sales' = SUM(Sales[Amount])
		formatString: #,0
```

```tmdl fixed
table Sales
	column Amount
		dataType: decimal
		sourceColumn: Amount

	/// Net sales after returns and discounts.
	measure 'Total Sales' = SUM(Sales[Amount])
		formatString: #,0
```

## Why it matters

A control character in a description is invisible in Power BI Desktop and fails the deployment: the service rejects the metadata and the publish stops with an error that names no object. Finding the character by eye is close to impossible.

## How to fix it

In Power BI Desktop, select the object in the Data pane or in model view and retype Description in the Properties pane, rather than editing around the character you cannot see. In the TMDL file the description is the run of `///` lines directly above the declaration, so retype those lines; an editor that shows control characters, or a search by code point, finds where the character is. Descriptions usually arrive pasted from a data dictionary, a ticket, or a spreadsheet cell, so if the same text is about to be pasted onto twenty more objects, clean it at the source first.

## When to ignore it

There is no case for it. A control character in a description tells a reader nothing, and it stops the model from deploying at all.

## Quirks

- A `///` line carries whatever that line holds. pbiplint takes each `///` line above a declaration as one line of the object's description, so a control character on one of those lines reaches the model and the rule reports it. Only the line feed and the carriage return cannot arrive inside one of those lines; a description built from several `///` lines carries a line feed between them, which the rule does not test for either.
- The test follows .NET's definition of a control character that is not whitespace, so a tab, a vertical tab, a form feed, or a next line character in a description is not reported. No rule reads a description for those: `SPECIAL_CHARS_IN_OBJECT_NAMES` reads names only.
- The `///` lines have to sit directly above the declaration they describe. A run of them followed by a blank line describes nothing, and pbiplint reports that as a `PARSE_ISSUE` instead of carrying the text into the model, so a character in a stranded comment never reaches this rule.
- The scope covers hierarchy levels and roles, and leaves out the model itself, named expressions, and data sources, so a control character in one of those descriptions is not reported.

## Related rules

- `AVOID_INVALID_NAME_CHARACTERS` makes the same test on names instead of descriptions, and one pasted string can put both rules on the same object.
- `OBJECTS_WITH_NO_DESCRIPTION` reads the same descriptions and reports the visible tables, columns, and measures that have none.
- `PARSE_ISSUE` is the finding a `///` run produces when a blank line separates it from its declaration, the one case where a description never reaches this rule at all.
