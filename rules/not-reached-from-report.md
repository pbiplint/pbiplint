---
id: NOT_REACHED_FROM_REPORT
name: "Not reached from the report"
category: Maintenance
severity: info
scope: [Column, CalculatedColumn, CalculatedTableColumn, Measure]
status: builtin
layer: project
video:
sources:
---

# Not reached from the report

## What it checks

Columns and measures that nothing in the report reaches, directly or through the model. The walk starts from every field the report names, both columns of every relationship, the columns that row-level and object-level security name, the default column of every variation, and the fields the report's own measures reference, and it follows DAX references, sort-by and group-by columns, and calculated tables until nothing new is reached.

A field the report names anywhere counts as reached: a visual's wells, its formatting, and its sort, so a measure shown only in a card's reference label or used only in conditional formatting is reached, and so is a field named in a filter at any level, in a drillthrough or tooltip page's fields, or in a bookmark. From a reached measure or calculated column, the walk reaches what its DAX references. From a reached column, it reaches the column's sort-by column, any column its `relatedColumnDetails` names in `groupByColumn`, and its table; a calculated table, once reached, adds what its expression references, and a calculation group adds what its items reference. A hierarchy level the report uses reaches the column behind it. A level of the date hierarchy that Power BI Desktop builds with Auto date/time is reached through the date column's variation, so it reaches the date column as well as the hidden table's column behind the level.

Each finding names the column or measure, as `'Sales'[Amount]` or `[Total Sales]`, with the measures first and then the columns, each in model order, so a dead chain reads from the measure nothing uses down to what only it used. The detail says why: `nothing in the report reaches it, and no measure or column references it`, or, for a field that only unreached fields use, `referenced only by [Total Sales], which nothing reaches either`.

## Example

The example runs against a model with one table, Sales, holding Amount and Region and the measure Total Sales.

```pbir fires visual.json
{
  "$schema": "https://developer.microsoft.com/json-schemas/fabric/item/report/definition/visualContainer/2.8.0/schema.json",
  "name": "c897ed0802274ab55e2d",
  "position": { "x": 580, "y": 520, "z": 3000, "height": 190, "width": 650, "tabOrder": 3000 },
  "visual": {
    "visualType": "tableEx",
    "query": {
      "queryState": {
        "Values": {
          "projections": [
            {
              "field": { "Column": { "Expression": { "SourceRef": { "Entity": "Sales" } }, "Property": "Region" } },
              "queryRef": "Sales.Region",
              "nativeQueryRef": "Region"
            }
          ]
        }
      }
    }
  }
}
```

```pbir fixed visual.json
{
  "$schema": "https://developer.microsoft.com/json-schemas/fabric/item/report/definition/visualContainer/2.8.0/schema.json",
  "name": "c897ed0802274ab55e2d",
  "position": { "x": 580, "y": 520, "z": 3000, "height": 190, "width": 650, "tabOrder": 3000 },
  "visual": {
    "visualType": "tableEx",
    "query": {
      "queryState": {
        "Values": {
          "projections": [
            {
              "field": { "Column": { "Expression": { "SourceRef": { "Entity": "Sales" } }, "Property": "Region" } },
              "queryRef": "Sales.Region",
              "nativeQueryRef": "Region"
            },
            {
              "field": { "Measure": { "Expression": { "SourceRef": { "Entity": "Sales" } }, "Property": "Total Sales" } },
              "queryRef": "Sales.Total Sales",
              "nativeQueryRef": "Total Sales"
            }
          ]
        }
      }
    }
  }
}
```

With only Region in the table, two findings come back: `[Total Sales]`, which nothing uses, and `'Sales'[Amount]`, which only Total Sales uses. Here the measure was meant to be in the table, so the fix adds it, and that reaches Amount through the measure's DAX. When a field really is unused, the fix is to delete it from the model, as How to fix it describes.

## Why it matters

A column earns its place in a model in one of two ways, Microsoft's modeling guidance says: a report filters, groups, or summarizes by it, or the model's structure needs it, for a relationship, a calculation, a security role, or formatting. A column that does neither can usually be removed, and an imported one is still loaded on every refresh and held in memory, where a smaller model refreshes faster and competes less for capacity. A measure nothing reaches adds no data to the model, but it sits in the Data pane beside the measures that matter, and the next author has to read it, keep it working through model changes, and guess whether something depends on it. The findings list what this report never touches, so that clean-up can start from evidence instead of a guess.

## How to fix it

Check first that nothing outside this report needs the field: another report built on the same model, a paginated report, or an Excel workbook that reads the model. Removing a column that something else uses breaks that thing, and pbiplint sees only the report in front of it.

Then remove the field from the model. In Power BI Desktop, right-click the measure or calculated column in the Data pane, or select it in Model view, and choose Delete from model. For a column that Power Query loads, open Power Query Editor, select the column in the table's query, and choose Remove Columns, so it is no longer loaded at all. In the TMDL files, delete the `measure` or `column` block from the table's file, and, for a column Power Query loads, remove it from the table's query as well. A dead chain is listed from the top, the measure first and then the fields only it used, so one pass down the list removes all of it.

## When to ignore it

A measure kept for another report on the same model, or for people who analyze the model in Excel, is not dead because this report does not use it, and neither is a column that a paginated report or a workbook reads. When several reports share the model, a finding here says only that this report does not reach the field; weigh it against the others before deleting anything, and ignore it on the fields they need.

## Quirks

- The rule reads one report at a time. A model that several reports share lists, for each report, what that report does not reach, even when another report uses it.
- Both columns of a relationship, the columns that row-level and object-level security name, and the default column of a variation are reached whether or not the report uses them, because the model needs them. A column that a reached column sorts by or groups by is reached too.
- `UNNECESSARY_MEASURES` and `UNNECESSARY_COLUMNS` keep the one-hop test of the ruleset they are ported from, so their results match Tabular Editor: they look only at hidden fields and at the model's own references. This rule reads the report and follows the chain as far as it goes, so it reports visible fields too, and a measure that only another unused measure references.
- DAX references are found by pattern, the way the model rules find them, so a field named inside a string or a comment of a reached measure counts as reached.
- A table that nothing reaches has no finding of its own. Each of its columns and measures is reported instead.
- The rule compares the report with its model, so it runs only when both are in the input.

## Related rules

- `UNNECESSARY_MEASURES` reports hidden measures that no DAX expression references, without reading the report, so it can flag a measure a visual uses, which this rule counts as reached.
- `UNNECESSARY_COLUMNS` makes the same one-hop test on hidden columns, and it too flags a hidden column that only a visual or a report filter uses.
- `BROKEN_FIELD_REFERENCE` looks the other way, at fields the report names that the model does not have.

## Links

- [Data reduction techniques for Import modeling, including removing unnecessary columns](https://learn.microsoft.com/power-bi/guidance/import-modeling-data-reduction)
- [Auto date/time in Power BI Desktop, including the hidden table and its Date Hierarchy](https://learn.microsoft.com/power-bi/transform-model/desktop-auto-date-time)
