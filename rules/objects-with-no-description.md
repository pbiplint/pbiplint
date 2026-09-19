---
id: OBJECTS_WITH_NO_DESCRIPTION
name: "Visible objects with no description"
category: Maintenance
severity: info
scope: [Table, Measure, Column, CalculatedColumn, CalculatedTable, CalculatedTableColumn, CalculationGroupTable]
status: ported
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
- Hierarchies, hierarchy levels, partitions, roles, perspectives, data sources, and named expressions are outside the scope, so an undescribed hierarchy is never reported here.

## Related rules

- `AVOID_INVALID_DESCRIPTION_CHARACTERS` reads the description you add and reports control characters in it.
- `PARSE_ISSUE` reports a `///` description with a blank line between it and its declaration. The object is then read as having none, so the same edit produces a finding from both rules.
- `UNNECESSARY_COLUMNS` reports hidden columns that nothing references, which are exactly the columns this rule passes over.

## Links

- [Building a data dictionary from model descriptions](https://www.elegantbi.com/post/datadictionary)
