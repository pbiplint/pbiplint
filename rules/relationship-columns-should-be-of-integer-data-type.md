---
id: RELATIONSHIP_COLUMNS_SHOULD_BE_OF_INTEGER_DATA_TYPE
name: "Relationship columns should be of integer data type"
category: Formatting
severity: info
scope: [Column, CalculatedColumn, CalculatedTableColumn]
status: ported
video:
sources:
  - https://github.com/microsoft/Analysis-Services/blob/master/BestPracticeRules/BPARules.json
---

# Relationship columns should be of integer data type

## What it checks

Any column that takes part in a relationship and is not a whole number.

Each finding names the column, as `'Sales'[Customer Code]`. The rule reads columns rather than relationships, so a text key joined to a text key gives two findings, one for each end.

## Example

```tmdl fires
table Sales
	column 'Customer Code'
		dataType: string
		isHidden
		summarizeBy: none
		sourceColumn: Customer Code

table Customer
	column 'Customer Code'
		dataType: string
		isKey
		summarizeBy: none
		sourceColumn: Customer Code

relationship Sales_Customer
	fromColumn: Sales.'Customer Code'
	toColumn: Customer.'Customer Code'
```

```tmdl fixed
table Sales
	column 'Customer Key'
		dataType: int64
		isHidden
		summarizeBy: none
		sourceColumn: Customer Key

table Customer
	column 'Customer Key'
		dataType: int64
		isKey
		summarizeBy: none
		sourceColumn: Customer Key

relationship Sales_Customer
	fromColumn: Sales.'Customer Key'
	toColumn: Customer.'Customer Key'
```

## Why it matters

A relationship is evaluated by matching values, and whole numbers match fastest and compress smallest. Text keys carry their dictionary into every join, and DateTime keys work but store more than an integer date key would. On the largest fact tables the key columns are often the biggest, so the choice shows up in memory as much as in query time.

## How to fix it

The type has to change on both ends, so the fix belongs upstream of the model. Where the source already has an integer surrogate key, load it instead of the natural key: in Power BI Desktop, choose Transform data, add the key column to the query, and drop the text one. Where there is no integer key, add one in the source view or build it with a merge in Power Query against the dimension. The Data type box under Column tools changes a column's type in place on an import model, which is worth using only when the values are already digits held as text. Change both ends in the same edit, because a relationship whose two columns end up with different types is a finding of its own.

## When to ignore it

A date relationship on a DateTime column is the common one to leave: it is what Power BI Desktop builds when you connect a fact table to a date table, it works, and moving the model to an integer date key such as 20260904 is a project rather than a fix. A small dimension is the second: a few thousand rows keyed on a short text code cost almost nothing, and a surrogate key adds a column to build and maintain for a saving nobody will measure. The finding earns its keep on the fact tables, where the key column is one of the widest things in the model.

## Quirks

- Every date relationship on a DateTime column is reported. That is what the source rule does, and it is why a model whose date table is keyed on a DateTime column collects a finding for each end of every date relationship.
- Decimal and double columns are reported too. The test is for the whole number type alone, not for numeric types in general.
- Both ends of a relationship are read, so converting one end and leaving the other clears half the findings.
- Inactive relationships count, and so do relationships whose cross-filter direction is both.

## Related rules

- `RELATIONSHIP_COLUMNS_SAME_DATA_TYPE` reads the relationship rather than the column and reports it when the two ends differ, so converting one end of a text-to-text pair to a whole number clears one finding here and creates one there.
- `HIDE_FOREIGN_KEYS` reports the visible column on the many side of the same relationship, which is usually the same column this rule wants converted.
- `MARK_PRIMARY_KEYS` reports the column on the one side of the same relationship when it is not marked as the table's key.
