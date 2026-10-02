---
id: OBJECTS_WITH_NO_DESCRIPTION
name: "Visible objects with no description"
category: Maintenance
severity: info
scope: [Table, Measure, Column, CalculatedColumn, CalculatedTable, CalculatedTableColumn, CalculationGroupTable]
status: ported
layer: model
video:
sources:
  - https://github.com/microsoft/Analysis-Services/blob/master/BestPracticeRules/BPARules.json
---

# Visible objects with no description

## What it checks

Visible tables, columns, measures, and calculation groups with no description. Visibility is the object's own flag.

Each finding names the object the way the rest of the tool does: a table as `'Sales'`, a column as `'Sales'[Amount]`, and a measure as `[Total Sales]`. On a model nobody has documented, that is one finding for almost every object in it.

## Example

```tmdl fires
table Sales
	column Amount
		dataType: decimal
		sourceColumn: Amount

	measure 'Total Sales' = SUM('Sales'[Amount])
		formatString: #,0
```

```tmdl fixed
/// One row per order line, loaded nightly from the sales warehouse.
table Sales

	/// Line amount in US dollars, net of discount and before tax.
	column Amount
		dataType: decimal
		sourceColumn: Amount

	/// Sum of line amount over whatever the visual is filtered to.
	measure 'Total Sales' = SUM('Sales'[Amount])
		formatString: #,0
```

## Why it matters

The description is the tooltip a report author sees when hovering a field in the field list, and it is the only place in the model to say what a measure counts, which currency a column is in, or which of two similar fields to use. Without it, every author works that out from the name, and gets it wrong at about the same rate. Descriptions also feed documentation tools, so the same sentence pays off twice.

## How to fix it

In Power BI Desktop, open Model view, select the object, and type the Description in the Properties pane. In the TMDL file a description is one or more `///` lines directly above the object's declaration, with no blank line between the last `///` line and the declaration: a blank line ends the description, and the object below it is read as having none. With hundreds of objects, Tabular Editor can paste descriptions into many at once from a list.

## When to ignore it

A name that already says the whole thing needs nothing added: `'Date'[Year]` gains nothing from a sentence reading "the year". Spend the descriptions on measures, on any column whose unit, currency, grain, or filter behavior is not in its name, and on the two fields a reader has to choose between. A table or column you are about to hide is better hidden than described, because hiding it also clears this finding.

## Quirks

- Visibility is the object's own isHidden flag: a visible column inside a hidden table is still reported.
- A calculation group table is reported once, as a calculation group.
- A description of only spaces or tabs counts as none, so padding a description to quiet the rule does not work.
- Hierarchies, hierarchy levels, calculation items, partitions, roles, perspectives, data sources, and named expressions are outside the scope, so an undescribed hierarchy is never reported here.
- The rule also needs every part of a table's declaration, which TMDL lets sit in more than one file (Power BI Desktop writes each table in one). While pbiplint could not open a model file or folder, or a parse issue took a line that could be a `table` line, such as a misspelt `table`, the rule reports nothing, because a part of the table in what pbiplint missed could describe or hide the table, and pbiplint does not guess what a file it could not read says. A parse issue inside a declaration, such as a property indented with spaces, does not stop the rule. The skipped line gives the reason, `a model file could not be fully read`, and a notice names what pbiplint could not open, or the file's own `PARSE_ISSUE` finding names the line.

## Related rules

- `AVOID_INVALID_DESCRIPTION_CHARACTERS` reads the description you add and reports control characters in it.
- `PARSE_ISSUE` reports a `///` description with a blank line between it and its declaration. The object is then read as having none, so the same edit produces a finding from both rules.
- `UNNECESSARY_COLUMNS` reports hidden columns that nothing references, which are exactly the columns this rule passes over.
- `UDF_WITHOUT_DESCRIPTION` asks the same of user-defined functions, which are outside this rule's scope.
- `NAME_WITHOUT_TRANSLATION` reports visible objects that a translated culture gives no caption, the other text a reader sees about an object: its name in that culture's language. It reads hierarchies and levels as well, and passes over a column or measure in a hidden table, which this rule reports.

## Links

- [Building a data dictionary from model descriptions](https://www.elegantbi.com/post/datadictionary)
