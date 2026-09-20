---
id: REDUCE_USAGE_OF_CALCULATED_TABLES
name: "Reduce usage of calculated tables"
category: Performance
severity: warning
scope: [CalculatedTable]
status: ported
video:
sources:
  - https://github.com/microsoft/Analysis-Services/blob/master/BestPracticeRules/BPARules.json
---

# Reduce usage of calculated tables

## What it checks

Every calculated table. Calculation groups are not included.

Each finding names the table, as `'Product Category'`.

## Example

```tmdl fires
table 'Product Category'
	column Category
		dataType: string
		summarizeBy: none
		sourceColumn: [Category]

	partition 'Product Category' = calculated
		mode: import
		source = DISTINCT('Product'[Category])
```

```tmdl fixed
table 'Product Category'
	column Category
		dataType: string
		summarizeBy: none
		sourceColumn: Category

	partition 'Product Category' = m
		mode: import
		source = let Source = Sql.Database("finance", "Warehouse"), Category = Source{[Item = "vwProductCategory"]}[Data] in Category
```

## Why it matters

A calculated table is rebuilt from DAX after every refresh, holds a copy of data that exists somewhere else, and is invisible to the source's lineage and to every other model. When two models need the same table, each rebuilds it its own way and they drift. A date table is the usual exception, and even there a shared table in the source or in a dataflow serves every model the same way.

## How to fix it

Load the table instead of computing it. In Power BI Desktop, choose Transform data and build the query there, or better, point it at a view in the source so every model that needs the table gets the same one; then right-click the calculated table in the Data pane and choose Delete from model. In the TMDL file the difference is in the partition's declaration: `partition Name = calculated` with a DAX expression becomes `partition Name = m` with a Power Query expression, and that declaration is the only thing the rule reads. Where the calculated table came from Auto date/time rather than from you, the way to remove it is to clear that option under Options, Current file, Data Load, not to delete the table. Where a calculated table stays, keep it small and put the reason in the table's description, which is the Description box in the Properties pane.

## When to ignore it

Several of these tables are features rather than choices. A field parameter and a what-if parameter are both calculated tables that Power BI Desktop writes for you when you use New parameter, and deleting either one breaks the report that uses it. A disconnected table of thresholds or scenario labels, small and static, is in the same position: there is nothing upstream to load it from and nothing to gain by inventing one. A bridge table built with DISTINCT over two fact tables is the judgment call worth making deliberately, because building it in the source is usually better but is not always worth the round trip through another team. What is not a legitimate exception is a large table built with DAX because the source was inconvenient, which is the case the rule is for, and the hidden tables Auto date/time generates, which should be turned off rather than ignored.

## Quirks

- A table counts as calculated when any of its partitions declares a `calculated` source, whatever its `mode` line says. One calculated partition beside several Power Query ones is enough.
- Calculation groups are classified as calculation group tables rather than calculated tables, so they are never reported here even though they hold DAX.
- There is no threshold despite the name. One calculated table is reported exactly as twenty are, and the rule has no way to tell a two-row parameter table from a copy of a fact table.
- With Auto date/time on, each hidden LocalDateTable is a calculated table and fires here as well as `REMOVE_AUTO-DATE_TABLE`. Turning the option off clears both.

## Related rules

- `REMOVE_AUTO-DATE_TABLE` reports the subset of these tables that Auto date/time generated, whose names start with DateTableTemplate_ or LocalDateTable_. Every table it reports is reported here too.
- `DATE/CALENDAR_TABLES_SHOULD_BE_MARKED_AS_A_DATE_TABLE` reads calculated tables as well as loaded ones, so a calendar built with CALENDAR is reported by both until it is marked, and marking it clears only that one.
- `MODEL_SHOULD_HAVE_A_DATE_TABLE` is satisfied by a calculated calendar, so the cheapest way to clear that finding creates one here.
