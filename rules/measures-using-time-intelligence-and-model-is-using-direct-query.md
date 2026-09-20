---
id: MEASURES_USING_TIME_INTELLIGENCE_AND_MODEL_IS_USING_DIRECT_QUERY
name: "Measures using time intelligence and model is using Direct Query"
category: Performance
severity: warning
scope: [Measure, CalculationItem]
status: ported
video:
sources:
  - https://github.com/microsoft/Analysis-Services/blob/master/BestPracticeRules/BPARules.json
---

# Measures using time intelligence and model is using Direct Query

## What it checks

Measures and calculation items that call a time intelligence function, in a model where at least one table is in DirectQuery mode.

Each finding names the measure, as `[Sales Last Year]`. A calculation item is named on its own, as `Prior Year`, with its group beside it, as `calculation group 'Time Intelligence'`.

## Example

```tmdl fires
table Sales
	column 'Order Date'
		dataType: dateTime
		formatString: mm/dd/yyyy
		sourceColumn: OrderDate

	column Amount
		dataType: decimal
		summarizeBy: sum
		sourceColumn: Amount

	measure 'Sales Last Year' = CALCULATE(SUM('Sales'[Amount]), SAMEPERIODLASTYEAR('Date'[Date]))
		formatString: #,0

	partition Sales = m
		mode: directQuery
		source = let Source = Sql.Database("finance", "Warehouse"), Sales = Source{[Item = "Sales"]}[Data] in Sales

table Date
	dataCategory: Time

	column Date
		dataType: dateTime
		isKey
		formatString: mm/dd/yyyy
		sourceColumn: Date
```

```tmdl fixed
table Sales
	column 'Order Date'
		dataType: dateTime
		formatString: mm/dd/yyyy
		sourceColumn: OrderDate

	column Amount
		dataType: decimal
		summarizeBy: sum
		sourceColumn: Amount

	column 'Amount Prior Year'
		dataType: decimal
		summarizeBy: sum
		sourceColumn: AmountPriorYear

	measure 'Sales Last Year' = SUM('Sales'[Amount Prior Year])
		formatString: #,0

	partition Sales = m
		mode: directQuery
		source = let Source = Sql.Database("finance", "Warehouse"), Sales = Source{[Item = "vwSalesWithPriorYear"]}[Data] in Sales

table Date
	dataCategory: Time

	column Date
		dataType: dateTime
		isKey
		formatString: mm/dd/yyyy
		sourceColumn: Date
```

## Why it matters

Time intelligence functions build sets of dates and evaluate the measure over each set. In Import mode that is in-memory work. In DirectQuery each set becomes a query, or a long list of dates inside one, sent to the source on every visual refresh, and sources are rarely fast at it. The functions work, but a page of year-to-date and prior-year cards can take many seconds to render.

## How to fix it

Either take the model out of DirectQuery or take the time intelligence out of the measure. For the first, select the table in Power BI Desktop's model view and set Storage mode to Import in the Properties pane, which is the partition's `mode: import` line in the TMDL file; the finding clears only once no table in the model is left in DirectQuery, because the condition is about the model and not about the tables the measure happens to read. For the second, move the comparison into the data: add the prior period's value to each row in the source view or the warehouse, load it as an ordinary column, and write the measure as a SUM over it, which is what the example above does. Where neither is possible, keep the number of time intelligence measures on one page small and cache what you can in the source, because every one of them is another round trip.

## When to ignore it

The common false alarm is a measure that has nothing to do with the DirectQuery table. The rule reads the model, not the query path, so one small DirectQuery table kept for real-time status will report every time intelligence measure in the model, including the ones that run entirely over imported tables. Check which tables the measure actually touches before you act on it. A source that answers quickly is the second case: a well-indexed warehouse over a few million rows returns a year-to-date query in well under a second, and a page that renders fast is not a problem whatever the rule says. Time the visual before rewriting anything. What is not a legitimate exception is a large DirectQuery fact table over a source you do not control, where the finding is naming the reason the report is slow.

## Quirks

- Function names are matched case-sensitively, in upper case only, as in the source rule, so `totalytd(` is not reported.
- The names are matched anywhere in the expression, with no word boundary in front, so a measure or function whose name ends in one of them, such as `MYDATEADD(`, counts as a match. Whitespace between the name and the parenthesis is allowed.
- The list is the source's thirty-seven functions, and it includes FIRSTNONBLANK, LASTNONBLANK, FIRSTNONBLANKVALUE, and LASTNONBLANKVALUE, which are regularly used over columns that hold no dates, so a measure with no date in it anywhere can be reported.
- A table counts as DirectQuery when its first partition says `mode: directQuery`, letter case aside. No other mode counts, so a table set to Dual storage mode is not a DirectQuery table here, and a calculated table or a calculation group never is.

## Related rules

- `MODEL_USING_DIRECT_QUERY_AND_NO_AGGREGATIONS` reads the same DirectQuery tables and reports the model once when no column carries an aggregation mapping. Importing every table clears both.
