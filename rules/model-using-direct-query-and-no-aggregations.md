---
id: MODEL_USING_DIRECT_QUERY_AND_NO_AGGREGATIONS
name: "Consider using aggregations if using Direct Query in Power BI"
category: Performance
severity: info
scope: [Model]
status: ported
layer: model
video:
sources:
  - https://github.com/microsoft/Analysis-Services/blob/master/BestPracticeRules/BPARules.json
---

# Consider using aggregations if using Direct Query in Power BI

## What it checks

Models that have at least one DirectQuery table, no aggregation table (no column has an alternateOf mapping), and the PowerBI_V3 data source version, which is every project Desktop writes today.

Each finding names the model, as `Model`, and there is one per model however many DirectQuery tables it holds.

## Example

```tmdl fires
model Model
	culture: en-US
	defaultPowerBIDataSourceVersion: powerBI_V3

table Sales
	column 'Order Date'
		dataType: dateTime
		formatString: mm/dd/yyyy
		sourceColumn: OrderDate

	column Amount
		dataType: decimal
		summarizeBy: sum
		sourceColumn: Amount

	partition Sales = m
		mode: directQuery
		source = let Source = Sql.Database("finance", "Warehouse"), Sales = Source{[Item = "Sales"]}[Data] in Sales
```

```tmdl fixed
model Model
	culture: en-US
	defaultPowerBIDataSourceVersion: powerBI_V3

table Sales
	column 'Order Date'
		dataType: dateTime
		formatString: mm/dd/yyyy
		sourceColumn: OrderDate

	column Amount
		dataType: decimal
		summarizeBy: sum
		sourceColumn: Amount

	partition Sales = m
		mode: directQuery
		source = let Source = Sql.Database("finance", "Warehouse"), Sales = Source{[Item = "Sales"]}[Data] in Sales

table 'Sales by Day'
	isHidden

	column 'Order Date'
		dataType: dateTime
		formatString: mm/dd/yyyy
		sourceColumn: OrderDate
		alternateOf
			summarization: groupBy
			baseColumn: Order Date
			baseTable: Sales

	column Amount
		dataType: decimal
		summarizeBy: sum
		sourceColumn: Amount
		alternateOf
			summarization: sum
			baseColumn: Amount
			baseTable: Sales

	partition 'Sales by Day' = m
		mode: import
		source = let Source = Sql.Database("finance", "Warehouse"), Agg = Source{[Item = "vwSalesByDay"]}[Data] in Agg
```

## Why it matters

In DirectQuery every visual sends a query to the source. Aggregation tables let the engine answer the common high-level questions, totals by month or by region, from a small imported table and send only the detail queries through. Without them, the summary page of a dashboard pays the full round trip to the source on every interaction. This is an info-level prompt to consider the feature, not a defect.

## How to fix it

Build a summary table at the grain the reports use most, one row per day and region rather than one per transaction, and load it from a view in the source so the two tables stay consistent. Import it, keep the detail table in DirectQuery, and in Power BI Desktop right-click the summary table in the model view, choose Manage aggregations, and map each of its columns to the detail column it summarizes and the function that summarizes it. In the TMDL file that mapping is an `alternateOf` block under each aggregation column, which is the only thing the rule looks for, naming `baseTable`, `baseColumn`, and a `summarization` such as sum or groupBy. Hide the summary table afterwards: report authors write their measures against the detail table, and the engine redirects the query when it can. Any one aggregation mapping anywhere in the model clears this finding, so treat the rule as a prompt to start rather than a measure of how far you got.

## When to ignore it

The question is whether there is a summary worth precomputing. A DirectQuery table kept for a handful of live status tiles has none: the whole point is that the numbers are current to the second, and a cached summary would be wrong. A report that only ever reads detail rows, such as a lookup of one order by number, has none either, because there is no total for an aggregation to answer. A source that already serves a summarized view at the grain the report asks for is the third case, and there the aggregation exists, it is just on the other side of the connector. Where the report opens on a page of totals by month over a large DirectQuery fact table, the finding is worth acting on, and at info severity it will not fail a build while you decide.

## Quirks

- The data source version has to be present and read as powerBI_V3, compared without regard to letter case. A model file that does not carry `defaultPowerBIDataSourceVersion` at all is never reported, whatever its tables say.
- One column with an `alternateOf` block anywhere in the model clears the finding, whatever it maps to. A single half-finished aggregation table counts as much as a complete set.
- A table counts as DirectQuery when its first partition says `mode: directQuery`, letter case aside. No other mode counts, so a table set to Dual storage mode is not a DirectQuery table here.

## Related rules

- `MEASURES_USING_TIME_INTELLIGENCE_AND_MODEL_IS_USING_DIRECT_QUERY` makes the same test for a DirectQuery table and reports the measures that call a time intelligence function. Importing every table clears both.

## Links

- [Use aggregations in Power BI Desktop](https://docs.microsoft.com/power-bi/transform-model/desktop-aggregations)
