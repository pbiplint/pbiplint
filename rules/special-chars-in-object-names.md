---
id: SPECIAL_CHARS_IN_OBJECT_NAMES
name: "Object names must not contain special characters"
category: Naming Conventions
severity: warning
scope: [Model, Table, Measure, Hierarchy, Perspective, Partition, Column, CalculatedColumn, CalculatedTable, CalculatedTableColumn, CalculationGroupTable, CalculationItem]
status: ported
video:
sources:
  - https://github.com/microsoft/Analysis-Services/blob/master/BestPracticeRules/BPARules.json
---

# Object names must not contain special characters

## What it checks

Names containing a tab, line feed, or carriage return.

Each finding names the object the way the rest of the tool does, a column as `'Sales'[Order ID]` and a table as `'Sales'`, and because the character is invisible the line reads as an ordinary name.

## Example

The column in the first snippet has a tab between `Order` and `ID` where the second has a space, which is why the two look almost the same.

```tmdl fires
table Sales
	column 'Order	ID'
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

Tabs and line breaks inside a name are invisible in most of the interface, so the object looks correct in the field list while every DAX reference, report binding, and deployment script has to reproduce the hidden character exactly. When one of them does not, you get a broken reference between two names that look identical on screen, which is one of the slowest kinds of model bug to track down. The same characters break CSV and Excel exports, where a line feed inside a column header splits the header across rows. Names should contain printable characters and ordinary spaces only.

## How to fix it

In Power BI Desktop, double-click the field in the Data pane and retype the whole name, a space where the tab is, rather than trying to select the character. In the TMDL file the name is on the declaration line between single quotes: replace the tab with a space so the line reads `column 'Order ID'`, and turn on your editor's whitespace display to see where the tab was. Renaming in Desktop updates the visuals bound to the field; a hand edit in the TMDL file does not, so open the report and check its visuals after one. Where the character arrives with a source column name, rename the column in Power Query as well, so the next column you add from that query comes in clean.

## When to ignore it

There is no case for it. A tab or a line break in a name buys nothing an ordinary space does not, and it costs every reference to the object an exact match on a character nobody can see.

## Quirks

- Only the tab reaches a name through a TMDL file. pbiplint splits a file into lines before it reads any declaration, so a line feed or a carriage return can never land inside a name it parses. The rule still tests for all three, so that a model built by other means is covered the way the source rule covers it.
- The scope leaves out hierarchy levels, roles, named expressions, and data sources, so a tab in one of those names is not reported here.

## Related rules

- `AVOID_INVALID_NAME_CHARACTERS` reads names for the control characters that are not whitespace, and leaves the tab, the line feed, and the carriage return to this rule.
- `AVOID_INVALID_DESCRIPTION_CHARACTERS` makes that test on descriptions instead of names; no rule reads a description for a tab.
- `TRIM_OBJECT_NAMES` fires on a wider set of objects for the other invisible whitespace, a leading or trailing space.
