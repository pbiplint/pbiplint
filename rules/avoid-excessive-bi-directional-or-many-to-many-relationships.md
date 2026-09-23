---
id: AVOID_EXCESSIVE_BI-DIRECTIONAL_OR_MANY-TO-MANY_RELATIONSHIPS
name: "Avoid excessive bi-directional or many-to-many relationships"
category: Performance
severity: warning
scope: [Model]
status: ported
layer: model
video:
sources:
  - https://github.com/microsoft/Analysis-Services/blob/master/BestPracticeRules/BPARules.json
---

# Avoid excessive bi-directional or many-to-many relationships

## What it checks

Models where bi-directional relationships plus many-to-many relationships make up more than 30 percent of all relationships. The finding is on the model, not on any one relationship.

Each finding names the model, as `Model`. Which relationships were counted is not in the line, so open the model view and read the relationship list to see them.

## Example

One bi-directional relationship out of two is half the model, well past the threshold.

```tmdl fires
table Sales
	column 'Product ID'
		dataType: int64
		sourceColumn: ProductID

	column 'Customer ID'
		dataType: int64
		sourceColumn: CustomerID

table Product
	column 'Product ID'
		dataType: int64
		isKey
		sourceColumn: ProductID

table Customer
	column 'Customer ID'
		dataType: int64
		isKey
		sourceColumn: CustomerID

relationship Sales_Product
	fromColumn: Sales.'Product ID'
	toColumn: Product.'Product ID'

relationship Sales_Customer
	crossFilteringBehavior: bothDirections
	fromColumn: Sales.'Customer ID'
	toColumn: Customer.'Customer ID'
```

```tmdl fixed
table Sales
	column 'Product ID'
		dataType: int64
		sourceColumn: ProductID

	column 'Customer ID'
		dataType: int64
		sourceColumn: CustomerID

table Product
	column 'Product ID'
		dataType: int64
		isKey
		sourceColumn: ProductID

table Customer
	column 'Customer ID'
		dataType: int64
		isKey
		sourceColumn: CustomerID

relationship Sales_Product
	fromColumn: Sales.'Product ID'
	toColumn: Product.'Product ID'

relationship Sales_Customer
	fromColumn: Sales.'Customer ID'
	toColumn: Customer.'Customer ID'
```

## Why it matters

Each bi-directional or many-to-many relationship adds a filter path the engine has to consider on every query. A few in the right places are fine. When they are a third of the model, most queries pay for filter propagation they do not need, and the model starts to show ambiguity: two routes between the same tables, the engine picking one, and totals that stop adding up.

## How to fix it

Take the direction off the relationships that do not need it. In Power BI Desktop, open the model view, double-click a relationship, and set Cross filter direction to Single in the Edit relationship dialog; in the TMDL file the same change is the `crossFilteringBehavior: bothDirections` line, deleted, since single direction is the default. Where one report genuinely needs the reverse filter, leave the relationship single and ask for the filter inside the measure that needs it, as in `Products Sold = CALCULATE(DISTINCTCOUNT('Product'[Product ID]), CROSSFILTER('Sales'[Product ID], 'Product'[Product ID], BOTH))`, so the cost falls on one visual instead of every query. For a many-to-many relationship, load a bridge table holding the distinct key values and relate both tables to it, which makes each hop many-to-one: in the dialog that is the Cardinality dropdown, and in the file it is `fromCardinality` and `toCardinality` on each relationship. The dialog and the properties read the same on an import model and a DirectQuery one.

## When to ignore it

A small model is the usual false alarm. Three relationships with one deliberate bi-directional relationship among them is 33 percent and fires, and there is nothing excessive about one. Count the relationships before you read the finding as a verdict: the rule is a ratio, and a ratio over four relationships says almost nothing. A model built on a bridge table by design is the other case, for example one that maps accounts to account groups or budgets to regions, where the many-to-many relationships are the architecture rather than an accident. What is not a legitimate exception is a large model whose bi-directional relationships nobody can account for one by one; that is the finding doing its job.

## Quirks

- A relationship that is both bi-directional and many-to-many counts twice, once in each tally, so the ratio can exceed 1. A model of nothing but such relationships scores 2.0.
- The denominator is every relationship in the model, and a model with no relationships at all is never reported.
- Inactive relationships are counted on both sides of the ratio. A bi-directional relationship that no measure ever activates still pushes the model over the threshold.

## Related rules

- `CHECK_IF_BI-DIRECTIONAL_AND_MANY-TO-MANY_RELATIONSHIPS_ARE_VALID` reports each relationship this rule counts, one finding per relationship, whatever share of the model they are. The example above fires both.
- `MANY-TO-MANY_RELATIONSHIPS_SHOULD_BE_SINGLE-DIRECTION` reports the relationships this rule counts twice: the ones that are many-to-many and bi-directional together.
- `AVOID_BI-DIRECTIONAL_RELATIONSHIPS_AGAINST_HIGH-CARDINALITY_COLUMNS` reports the columns inside the bi-directional relationships counted here, the ones with more than 100,000 distinct values. pbiplint lists that rule without running it, because a distinct count is not in the files.

## Links

- [Bidirectional relationships and ambiguity in DAX](https://www.sqlbi.com/articles/bidirectional-relationships-and-ambiguity-in-dax/)
