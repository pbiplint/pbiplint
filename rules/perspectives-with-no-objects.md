---
id: PERSPECTIVES_WITH_NO_OBJECTS
name: "Perspectives with no objects"
category: Maintenance
severity: info
scope: [Perspective]
status: ported
video:
sources:
  - https://github.com/microsoft/Analysis-Services/blob/master/BestPracticeRules/BPARules.json
---

# Perspectives with no objects

## What it checks

Perspectives that contain no tables. Adding any column, measure, or hierarchy to a perspective adds its table, so a perspective with no tables is empty.

Each finding names the perspective on its own, as `Sales View`, with no table and no quotes around it, because a perspective belongs to the model rather than to a table.

## Example

```tmdl fires
table Sales
	column Amount
		dataType: decimal
		sourceColumn: Amount

	measure 'Total Sales' = SUM('Sales'[Amount])
		formatString: #,0

perspective 'Sales View'
```

```tmdl fixed
table Sales
	column Amount
		dataType: decimal
		sourceColumn: Amount

	measure 'Total Sales' = SUM('Sales'[Amount])
		formatString: #,0

perspective 'Sales View'

	perspectiveTable Sales

		perspectiveMeasure 'Total Sales'
```

## Why it matters

An empty perspective still shows up in clients that offer perspectives, such as Excel, as a named view of the model that contains nothing. It is either an abandoned start or the remains of objects that were removed, and it leaves the next person asking what it was for.

## How to fix it

Power BI Desktop has no perspective editor, so the fix is in the file. A perspective is a `perspective` block of its own, and the objects it shows are `perspectiveTable` entries under it, with the columns, measures, and hierarchies it shows listed beneath each one. Add the tables the perspective should show, or delete its file from the `perspectives` folder and drop the matching `ref perspective` line from `model.tmdl`. Tabular Editor edits perspectives in a UI if you would rather tick boxes than edit the file.

## When to ignore it

There is no case for it. A perspective you have created and not yet filled is the one you want reported, because nothing else will tell you it is still empty, and an empty perspective in a published model offers a report author a view of the model with no fields in it.

## Quirks

- The rule counts the `perspectiveTable` entries the perspective carries, not the objects they resolve to. A perspective that lists a table which was deleted is not empty and is not reported.
- Power BI Desktop never writes perspectives, so this rule fires only on models built or edited somewhere else.

## Related rules

- `TRIM_OBJECT_NAMES` reads perspective names and reports one that starts or ends with a space.
- `SPECIAL_CHARS_IN_OBJECT_NAMES` reads the same names for a tab, a line feed, or a carriage return.
