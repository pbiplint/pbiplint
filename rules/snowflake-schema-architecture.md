---
id: SNOWFLAKE_SCHEMA_ARCHITECTURE
name: "Consider a star-schema instead of a snowflake architecture"
category: Performance
severity: warning
scope: [Table, CalculatedTable]
status: ported
video:
sources:
  - https://github.com/microsoft/Analysis-Services/blob/master/BestPracticeRules/BPARules.json
---

# Consider a star-schema instead of a snowflake architecture

## What it checks

Tables that are on the from side of one relationship and the to side of another, which is what a dimension related to a sub-dimension looks like.

Each finding names the table, as `'Product'`, so it is the table in the middle of the chain that is reported, not the fact table and not the leaf.

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

table Product
	column 'Product ID'
		dataType: int64
		isKey
		sourceColumn: ProductID

	column 'Product Name'
		dataType: string
		sourceColumn: ProductName

	column 'Category ID'
		dataType: int64
		isHidden
		sourceColumn: CategoryID

table Category
	column 'Category ID'
		dataType: int64
		isKey
		sourceColumn: CategoryID

	column 'Category Name'
		dataType: string
		sourceColumn: CategoryName

relationship Sales_Product
	fromColumn: Sales.'Product ID'
	toColumn: Product.'Product ID'

relationship Product_Category
	fromColumn: Product.'Category ID'
	toColumn: Category.'Category ID'
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

	column 'Product Name'
		dataType: string
		sourceColumn: ProductName

	column 'Category Name'
		dataType: string
		sourceColumn: CategoryName

relationship Sales_Product
	fromColumn: Sales.'Product ID'
	toColumn: Product.'Product ID'
```

## Why it matters

In a star schema every dimension relates directly to the fact table, so a filter on Category reaches Sales in one hop. When Category hangs off Product, which hangs off Sales, the filter travels two hops, the model view is harder to read, and any bi-directional relationship along the chain doubles the chance of ambiguity. The engine handles a snowflake, but it handles a star faster, and a report author understands a star at a glance.

## How to fix it

Fold the sub-dimension into its parent so the parent carries the attributes directly. The best place is the source: have the view the Product query reads join Category and return Category Name as a column, and the refresh does the join once with indexes. Failing that, do it in Power BI Desktop: choose Transform data, select the Product query, use Merge Queries against the Category query on the key, expand the columns you want, then right-click the Category query and choose Delete, which removes the table and the relationship with it. Where the sub-dimension's query has to stay for another reason, delete only the relationship, which is the right-click menu on its line in the model view; in the TMDL file the same change is the sub-dimension's `table` block and its `relationship` block both going, and the parent gaining a plain column. Keep the sub-dimension where the chain has a reason to exist, which the next section describes, and where you do, prefer a single-direction relationship along it.

## When to ignore it

Several shapes are reported that are not snowflakes at all. A bridge table sits between two dimensions by design, so it is the from side of one relationship and the to side of another and always will be. A sub-dimension shared by several parents, such as one Geography table that both Customer and Store point at, costs less as its own table than as a copy inside each parent. A very large sub-dimension is the third case: folding a million-row attribute table into its parent widens every row of the parent, and the two hops are cheaper than that. A chain of fact tables, such as a line table related to an order header that is itself related to Customer, reports the header for the same structural reason and is a perfectly ordinary design. What is worth acting on is a small lookup table that exists only because the source normalized it and nobody merged it back, which is most of what this rule finds.

## Quirks

- The test is the from side and the to side of a relationship, not the many side and the one side, so a table in a one-to-one relationship can count.
- Inactive relationships count. A table whose second relationship never comes alive outside USERELATIONSHIP is reported the same as one whose relationships are all active.
- The two relationships need not form a chain through the same key or the same neighbour, so any table that is a parent of something and a child of something else is reported, whatever the shape around it.
- Calculated tables are in scope and calculation groups are not, so a sub-dimension built with DISTINCT is checked and a calculation group is left alone.

## Related rules

- `ENSURE_TABLES_HAVE_RELATIONSHIPS` reports a table with no relationship at all, so a table leaves that rule's condition with its first relationship and can enter this one's with its second.
- `CHECK_IF_BI-DIRECTIONAL_AND_MANY-TO-MANY_RELATIONSHIPS_ARE_VALID` lists every relationship that filters both ways or is many-to-many, which is the kind of relationship that turns a chain like this into an ambiguous filter path.

## Links

- [Understand star schema and the importance for Power BI](https://docs.microsoft.com/power-bi/guidance/star-schema)
