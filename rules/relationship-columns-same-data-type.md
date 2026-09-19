---
id: RELATIONSHIP_COLUMNS_SAME_DATA_TYPE
name: "Relationship columns should be of the same data type"
category: Error Prevention
severity: error
scope: [Relationship]
status: ported
video:
sources:
  - https://github.com/microsoft/Analysis-Services/blob/master/BestPracticeRules/BPARules.json
---

# Relationship columns should be of the same data type

## What it checks

Relationships whose two columns have different data types.

Each finding names the relationship the way Tabular Editor does, `'Sales'[Product ID] ∞←1 'Product'[Product ID]`, with the two cardinalities either side of an arrow that points the way the filter travels. The types themselves are not in the line, so read the two columns to see which one to change.

## Example

```tmdl fires
table Sales
	column 'Product ID'
		dataType: string
		sourceColumn: ProductID

	column Amount
		dataType: decimal
		sourceColumn: Amount

table Product
	column 'Product ID'
		dataType: int64
		isKey
		sourceColumn: ProductID

	column 'Product Name'
		dataType: string
		sourceColumn: ProductName

relationship Sales_Product
	fromColumn: Sales.'Product ID'
	toColumn: Product.'Product ID'
```

```tmdl fixed
table Sales
	column 'Product ID'
		dataType: int64
		sourceColumn: ProductID

	column Amount
		dataType: decimal
		sourceColumn: Amount

table Product
	column 'Product ID'
		dataType: int64
		isKey
		sourceColumn: ProductID

	column 'Product Name'
		dataType: string
		sourceColumn: ProductName

relationship Sales_Product
	fromColumn: Sales.'Product ID'
	toColumn: Product.'Product ID'
```

## Why it matters

The engine relates columns by value, and when the types differ it converts one side for every query. A text key on one side and a whole number on the other works until a value like 007 meets 7, at which point rows quietly fall into the blank member. Matching types remove both the conversion cost and the surprise.

## How to fix it

Set the two columns to the same type, and prefer a whole number for a key. In Power BI Desktop there are two places to do it: Column tools, Data type on the selected column, which changes the type on the model, or Transform data, where a Changed Type step in Power Query gets the type right before the data is loaded and keeps it right on every refresh. Power Query is the better of the two when the source is the reason the types differ. In the TMDL file the property is `dataType` on each column. Converting a text key to a whole number fails at refresh on any value that is not a number, so look for padded keys such as `007` first and strip the padding in the same Power Query step.

## When to ignore it

A column whose declaration carries no `dataType` at all compares as having none, so a relationship onto a calculated column that was written without the property is reported although both sides may hold the same type once the model is loaded. That is the one finding here worth reading twice, and the answer to it is to write the property rather than to change a type. Where both types are written and they differ, there is nothing to ignore.

## Quirks

- Both sides have to resolve to a column the model declares. A relationship naming a table or a column that does not exist is skipped, so a typo in `fromColumn` or `toColumn` hides the relationship from this rule.
- The comparison is on the declared `dataType`, ignoring letter case. A column with no `dataType` line compares as having none, and so differs from any column that has one.
- Only the declared type is compared, never the values. Two text keys that will never match, one padded and one not, pass the rule.

## Related rules

- `RELATIONSHIP_COLUMNS_SHOULD_BE_OF_INTEGER_DATA_TYPE` reads the same relationships from the column side and reports every column in a relationship whose type is not a whole number. Setting both sides to `int64` clears both rules at once.
- `FIX_REFERENTIAL_INTEGRITY_VIOLATIONS` covers what a mismatch does to the data, the fact rows whose key finds nothing on the one side. pbiplint lists that rule but does not run it, because it needs statistics only a live model carries.
- `MARK_PRIMARY_KEYS` reports the column on the one side of the same relationship when it is not marked as the table's key.
