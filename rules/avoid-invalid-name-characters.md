---
id: AVOID_INVALID_NAME_CHARACTERS
name: "Avoid invalid characters in names"
category: Error Prevention
severity: error
scope: [Table, Measure, Hierarchy, Level, Perspective, Partition, Column, CalculatedColumn, CalculatedTable, CalculatedTableColumn, Role, CalculationGroupTable, CalculationItem]
status: ported
layer: model
video:
sources:
  - https://github.com/microsoft/Analysis-Services/blob/master/BestPracticeRules/BPARules.json
---

# Avoid invalid characters in names

## What it checks

Object names containing a control character that is not whitespace. The whitespace control characters are left out of the test; `SPECIAL_CHARS_IN_OBJECT_NAMES` reads names for a tab, a line feed, and a carriage return.

Each finding names the object the way the rest of the tool does, a column as `'Sales'[Order ID]` and a measure as `[Total Sales]`, and because the character does not print, the line reads as an ordinary name.

## Example

The column in the first snippet has a start of heading character, U+0001, between `Order` and `ID` where the second has a space, which is why the two look almost the same.

```tmdl fires
table Sales
	column 'OrderID'
		dataType: int64
		sourceColumn: OrderID

	column Amount
		dataType: decimal
		sourceColumn: Amount
```

```tmdl fixed
table Sales
	column 'Order ID'
		dataType: int64
		sourceColumn: OrderID

	column Amount
		dataType: decimal
		sourceColumn: Amount
```

## Why it matters

A control character in a name is invisible in Power BI Desktop and fails the deployment: the service rejects the metadata and the publish stops with an error that names no object. Every DAX reference and report binding also has to reproduce the hidden character exactly, so the object is fragile even before it is deployed.

## How to fix it

In Power BI Desktop, double-click the field in the Data pane and retype the whole name rather than trying to select the character, or select the object and retype Name in the Properties pane. In the TMDL file the name is on the declaration line between single quotes, so `column 'Order ID'` is what the line should read once the character is gone; an editor that shows control characters, or a search by code point, finds where it was. Renaming in Desktop updates the visuals bound to the field; a hand edit in the TMDL file does not, so open the report and check its visuals after one. Where the character arrives with a source column name, rename the column in Power Query as well, so the next column you add from that query comes in clean.

## When to ignore it

There is no case for it. The character shows a reader nothing, nobody can type it to reach the object, and it stops the model from deploying at all.

## Quirks

- Every character this rule tests for reaches a name through a TMDL file. pbiplint splits a file into lines before it reads any declaration, so a line feed or a carriage return could never land inside a name, and the rule leaves those two out of its test; any other control character inside a quoted name survives the parse and is reported.
- The test follows .NET's definition of a control character that is not whitespace, so it passes over the tab, the line feed, the vertical tab, the form feed, the carriage return, and the next line character. `SPECIAL_CHARS_IN_OBJECT_NAMES` picks up the tab, the line feed, and the carriage return. A vertical tab, a form feed, or a next line character inside a name is reported by neither rule.
- The scope covers hierarchy levels and roles, which `SPECIAL_CHARS_IN_OBJECT_NAMES` leaves out, and leaves out the model itself, named expressions, and data sources, so a control character in one of those names is not reported here.

## Related rules

- `SPECIAL_CHARS_IN_OBJECT_NAMES` reads the same names for the whitespace this rule passes over, a tab or a line break.
- `AVOID_INVALID_DESCRIPTION_CHARACTERS` makes the same test on descriptions instead of names.
- `TRIM_OBJECT_NAMES` reads a wider set of object names for the other invisible whitespace that survives a TMDL file, a leading or trailing space.
