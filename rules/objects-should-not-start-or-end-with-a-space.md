---
id: OBJECTS_SHOULD_NOT_START_OR_END_WITH_A_SPACE
name: "Objects should not start or end with a space"
category: Formatting
severity: error
scope: [Model, Table, Measure, Hierarchy, Perspective, Partition, Column, CalculatedColumn]
status: ported
layer: model
video:
sources:
  - https://github.com/microsoft/Analysis-Services/blob/master/BestPracticeRules/BPARules.json
---

# Objects should not start or end with a space

## What it checks

Names that start or end with a space, for the model, tables, measures, hierarchies, perspectives, partitions, data columns, and calculated columns.

Each finding names the object the way the rest of the tool does: a column as `'Sales'[Order ID ]`, a measure as `[Total Sales ]`, a table as `'Sales '`, a hierarchy or a partition by its name with its table in the detail, and a perspective by its name alone. The space is inside the name, so the line reads as though nothing were wrong with it.

## Example

```tmdl fires
table Sales
	column 'Order ID '
		dataType: int64
		summarizeBy: none
		sourceColumn: OrderID

	column Amount
		dataType: decimal
		summarizeBy: none
		sourceColumn: Amount
```

```tmdl fixed
table Sales
	column 'Order ID'
		dataType: int64
		summarizeBy: none
		sourceColumn: OrderID

	column Amount
		dataType: decimal
		summarizeBy: none
		sourceColumn: Amount
```

## Why it matters

A leading or trailing space is invisible on screen but is part of the name, so "Sales " and "Sales" are two different objects to the engine. That is enough to break a DAX reference, a report visual binding, or a deployment that expects the trimmed name, and the error you get back will name an object that looks perfectly correct. Stray spaces almost always arrive by accident, pasted in or inherited from a source column name, so trimming them is safe and rarely breaks anything downstream. `TRIM_OBJECT_NAMES` makes the same check across more object types at a lower severity, so every finding here appears there as well.

## How to fix it

In Power BI Desktop, double-click the field in the Data pane and retype the name without the space, or select the object and clear the space from Name in the Properties pane. In the TMDL file the name is on the declaration line, so `column 'Order ID '` becomes `column 'Order ID'`. A data column carries its own `sourceColumn`, so trimming the model name does not change what the refresh loads. Renaming in Desktop updates the visuals bound to the field; a hand edit in the file does not, so open the report and check its visuals after one. Where the space arrives with a source column name, trim it in Power Query too, so the next column you add from that query comes in clean.

## When to ignore it

No name should start or end with a space, and this rule reports at error severity because a name that reads as correct and is not costs more to diagnose than to fix. A leading space is sometimes used to push a measure to the top of the field list; a display folder puts the measure where it belongs without hiding a character in its name.

## Quirks

- Narrower scope than `TRIM_OBJECT_NAMES`: levels, roles, named expressions, calculation items, calculation group tables, data sources, calculated tables, and calculated table columns are not checked here.
- The test is for the space character at the start or the end of the name. A name padded with a tab is not reported here; `SPECIAL_CHARS_IN_OBJECT_NAMES` covers that one.
- The model object is in scope, and a finding on the model is always named `Model` whatever the model is called, so a stray space in the model's own name gives a finding with nothing in the line to show it. The model's name is on the `model` line in the TMDL file.
- In the browser, the "Choose a folder" button in Chrome and Edge does not list a file whose name begins or ends with a space, so a table file named that way is never read on that route and its findings are missing. Drag the folder onto the page, or use the command line, to read it.

## Related rules

- `TRIM_OBJECT_NAMES` makes the same test at info severity over a wider set of object types, so every finding here is a finding there and one rename clears both.
- `SPECIAL_CHARS_IN_OBJECT_NAMES` reads the same names for the other invisible whitespace, a tab or a line break.
