---
id: TRIM_OBJECT_NAMES
name: "Trim object names"
category: Naming Conventions
severity: info
scope: [Model, Table, Measure, Hierarchy, Level, Perspective, Partition, DataSource, Column, CalculatedColumn, CalculatedTable, CalculatedTableColumn, NamedExpression, Role, CalculationGroupTable, CalculationItem]
status: ported
layer: model
video:
sources:
  - https://github.com/microsoft/Analysis-Services/blob/master/BestPracticeRules/BPARules.json
---

# Trim object names

## What it checks

Names that start or end with a space, across every named object type in the model.

Each finding names the object the way the rest of the tool does: a column as `'Sales'[Order ID ]`, a measure as `[Total Sales ]`, a table as `'Sales '`, and a partition, role, hierarchy level, or calculation item by its name alone. The space is inside the name, so the line reads as though nothing were wrong with it.

## Example

```tmdl fires
table Sales
	column 'Order ID '
		dataType: int64
		sourceColumn: OrderID
	column Amount
		dataType: decimal
		sourceColumn: Amount
	measure 'Total Sales' = SUM(Sales[Amount])
```

```tmdl fixed
table Sales
	column 'Order ID'
		dataType: int64
		sourceColumn: OrderID
	column Amount
		dataType: decimal
		sourceColumn: Amount
	measure 'Total Sales' = SUM(Sales[Amount])
```

## Why it matters

A leading or trailing space is invisible in the field list but part of the name, so "Sales " and "Sales" are two objects to the engine, and a DAX reference, a visual binding, or a deployment script that uses the trimmed name fails against something that looks correct. The space usually arrives with a source column name or a paste. `OBJECTS_SHOULD_NOT_START_OR_END_WITH_A_SPACE` reports the same names at error severity for a narrower set of object types.

## How to fix it

In Power BI Desktop, double-click the field in the Data pane and retype the name without the space, or select the object and clear the space from Name in the Properties pane. In the TMDL file the name is on the declaration line, so `column 'Order ID '` becomes `column 'Order ID'`. A data column carries its own `sourceColumn`, so the model name and the source column name are independent and trimming the model name does not change what the refresh loads. Renaming in Desktop updates the visuals bound to the field; a hand edit in the TMDL file does not, so open the report and check its visuals after one. Where the space arrives with a source column name, trim it in Power Query as well, so the next column you add from that query comes in clean.

## When to ignore it

No name should start or end with a space. A leading space is sometimes used to push a measure to the top of the field list; a display folder gathers the measure with the ones it belongs beside, and it does that without hiding a character in the name.

## Quirks

- The test is for a space character at the start or the end of the name. A name padded with a tab is not reported here; `SPECIAL_CHARS_IN_OBJECT_NAMES` covers that one.
- The model object is in scope, and a finding on the model is always named `Model` whatever the model is called, so a stray space in the model's own name gives a finding with nothing in the line to show it. The model's name is on the `model` line in the TMDL file.

## Related rules

- `OBJECTS_SHOULD_NOT_START_OR_END_WITH_A_SPACE` makes the same test at error severity over a narrower set of object types, and one rename clears both.
- `SPECIAL_CHARS_IN_OBJECT_NAMES` reads the same names for the other invisible whitespace, a tab or a line break.
- `AVOID_INVALID_NAME_CHARACTERS` reads them for the control characters that are neither whitespace nor a tab or line break.
