---
id: REDUCE_USAGE_OF_CALCULATED_COLUMNS_THAT_USE_THE_RELATED_FUNCTION
name: "Reduce usage of calculated columns that use the RELATED function"
category: Performance
severity: warning
scope: [CalculatedColumn]
status: ported
layer: model
video:
sources:
  - https://github.com/microsoft/Analysis-Services/blob/master/BestPracticeRules/BPARules.json
---

# Reduce usage of calculated columns that use the RELATED function

## What it checks

Calculated columns whose DAX calls RELATED.

Each finding names the column, as `'Sales'[Category]`.

## Example

```tmdl fires
table Sales
	column 'Product ID'
		dataType: int64
		isHidden
		sourceColumn: ProductID

	column Amount
		dataType: decimal
		summarizeBy: sum
		sourceColumn: Amount

	column Category = RELATED('Product'[Category])
		dataType: string

table Product
	column 'Product ID'
		dataType: int64
		isKey
		sourceColumn: ProductID

	column Category
		dataType: string
		sourceColumn: Category

relationship Sales_Product
	fromColumn: Sales.'Product ID'
	toColumn: Product.'Product ID'
```

```tmdl fixed
table Sales
	column 'Product ID'
		dataType: int64
		isHidden
		sourceColumn: ProductID

	column Amount
		dataType: decimal
		summarizeBy: sum
		sourceColumn: Amount

table Product
	column 'Product ID'
		dataType: int64
		isKey
		sourceColumn: ProductID

	column Category
		dataType: string
		sourceColumn: Category

relationship Sales_Product
	fromColumn: Sales.'Product ID'
	toColumn: Product.'Product ID'
```

## Why it matters

RELATED in a calculated column copies a value from the one side of a relationship onto every row of the many side. That is a lookup the source can do with a join, or Power Query with a merge, at load time and often folded to the source. Done in DAX it is computed row by row after load and stored without full compression, and the copied column then duplicates a dimension attribute, which `REMOVE_REDUNDANT_COLUMNS_IN_RELATED_TABLES` also flags.

## How to fix it

Most of the time the column does not need to exist. The value is already on the dimension and the relationship already reaches it, so build the visual on the dimension's column and delete the copy: right-click it in Power BI Desktop's Data pane and choose Delete from model, or remove its `column Name = expression` block from the table's TMDL file, which is what the example above does. Where the value genuinely has to sit on the fact table, because a measure filters by it at row grain or a composite key needs it, bring it in where the rows are loaded rather than after: in Transform data use Merge Queries against the dimension query and expand the one column you want, or add the join to the view the query reads, and the column arrives compressed like any other loaded column. Where the value is only wanted inside one measure, call RELATED there instead, since a measure computes at query time and stores nothing.

## When to ignore it

A small table is the clean exception. The cost is per row, so RELATED on a dimension of a few thousand rows is not worth an edit, while the same expression on a fact table of fifty million is the reason the model is large. A column that cannot be merged upstream is the other case: where the fact table and the dimension come from different sources and the merge would break query folding, doing the lookup in DAX after load can be the cheaper of the two. Check the row count and check whether the merge folds before rewriting anything. What is not a legitimate exception is a copy of a dimension attribute on a large fact table that exists because the field list was easier to browse that way.

## Quirks

- The match is case-insensitive and allows whitespace before the parenthesis, so `related (` counts as much as `RELATED(`.
- `RELATEDTABLE(` is not matched, because only whitespace may stand between the name and the parenthesis.
- Only calculated columns are in scope. The same call in a measure, a calculation item, or a calculated table's expression is not reported here.
- The test reads the expression as text, so a RELATED call inside a comment or a quoted string counts, and a lookup written with LOOKUPVALUE instead does not.

## Related rules

- `REMOVE_REDUNDANT_COLUMNS_IN_RELATED_TABLES` reports a fact table column that shares its name with a column on the related dimension, which is what a RELATED copy usually is. Both rules fire on `'Sales'[Category]` in the example above, and deleting the column clears both.
- `REDUCE_NUMBER_OF_CALCULATED_COLUMNS` counts every calculated column in the model, these included, and reports the model once past five of them.

## Links

- [Storage differences between calculated columns and calculated tables](https://www.sqlbi.com/articles/storage-differences-between-calculated-columns-and-calculated-tables/)
