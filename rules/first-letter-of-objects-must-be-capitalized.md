---
id: FIRST_LETTER_OF_OBJECTS_MUST_BE_CAPITALIZED
name: "First letter of objects must be capitalized"
category: Formatting
severity: info
scope: [Table, Measure, Hierarchy, CalculatedColumn, CalculatedTable, CalculatedTableColumn, CalculationGroupTable]
status: ported
video:
sources:
  - https://github.com/microsoft/Analysis-Services/blob/master/BestPracticeRules/BPARules.json
---

# First letter of objects must be capitalized

## What it checks

Tables, measures, hierarchies, calculated columns, calculated tables, and calculation groups whose first character has an upper case form and is not upper case.

Each finding names the object the way the rest of the tool does: a measure as `[total sales]`, a table or a calculation group as `'sales'`, a calculated column as `'sales'[unit price]`, and a hierarchy by its name alone with its table in the detail.

## Example

```tmdl fires
table Sales
	column Amount
		dataType: decimal
		isHidden
		summarizeBy: none
		sourceColumn: Amount

	measure 'total sales' = SUM('Sales'[Amount])
		formatString: #,0
```

```tmdl fixed
table Sales
	column Amount
		dataType: decimal
		isHidden
		summarizeBy: none
		sourceColumn: Amount

	measure 'Total Sales' = SUM('Sales'[Amount])
		formatString: #,0
```

## Why it matters

Object names are the model's user interface: they appear in the field list, on axis labels, in tooltips, and in every export, and nothing capitalizes them for you. A field list that mixes "Sales Amount" with "total cost" reads as unfinished, and it tells a report author that the two fields came from different places and may not be equally trustworthy. Capitalizing the first letter costs nothing, survives every refresh, and is the convention nearly every published model follows. A name starting with a digit or a symbol is not flagged, because those characters have no upper case form.

## How to fix it

In Power BI Desktop, double-click the object in the Data pane and retype the name, or select it and edit Name in the Properties pane of the model view. In the TMDL file the name is on the declaration line, so `measure 'total sales' =` becomes `measure 'Total Sales' =`. Renaming in Desktop carries the new name into the visuals bound to the object and into the DAX that references it; a hand edit in the file does not, so open the report and check its visuals after one.

## When to ignore it

A name that is lower case on purpose is the exception worth keeping: eCommerce Orders, iPhone Sales, and anything else whose spelling belongs to a brand rather than to your style guide. Capitalizing those makes them wrong rather than tidy. Outside that, a lower case first letter is a slip, and the rule is reporting it before a reader does.

## Quirks

- Data columns are not in scope; of the column kinds only calculated columns and calculated table columns are checked. Levels, partitions, perspectives, roles, named expressions, and calculation items are not checked either, so a lower case calculation item is not reported even when its calculation group is.
- The first character is compared with its own upper case form, so a name that starts with a space is not reported here. `OBJECTS_SHOULD_NOT_START_OR_END_WITH_A_SPACE` and `TRIM_OBJECT_NAMES` are the rules that read that one.

## Related rules

- `TRIM_OBJECT_NAMES` reads the same names for a leading or trailing space. A measure called `total sales ` fires both rules, and the single rename that capitalizes it and drops the space clears both.
