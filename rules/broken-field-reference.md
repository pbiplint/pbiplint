---
id: BROKEN_FIELD_REFERENCE
name: "Field the model does not have"
category: Error Prevention
severity: error
scope: [Visual, Page, Report, Bookmark]
status: builtin
layer: project
video:
sources:
---

# Field the model does not have

## What it checks

References in the report to a table, column, measure, hierarchy, or hierarchy level that the model does not have, wherever the report names a field: a visual's wells, formatting, and sort, a filter on a visual, a page, or the whole report, a drillthrough or tooltip page's fields, and a bookmark.

Each finding names the object that carries the reference: a visual as `"Sales by region" on "Overview"`, or as `clusteredBarChart (5a1c3e) on "Overview"` when it has no title; a page's filter as `Page filter on "Overview"`; the report's filter as `Report filter`; a drillthrough or tooltip page's field as `Page "Product detail"`; and a bookmark as `Bookmark "Reset"`. Its detail names the field and says why it does not resolve, as `[Profit]: no measure named "Profit" on "Sales"`, `'Sales'[Colour]: no column named "Colour" on "Sales"`, or `'Store'[City]: no table named "Store"`, and the finding sits on the reference's own line in the file.

## Example

The example runs against a model with one table, Sales, holding Amount and Region and the measure Total Sales.

```pbir fires visual.json
{
  "$schema": "https://developer.microsoft.com/json-schemas/fabric/item/report/definition/visualContainer/2.8.0/schema.json",
  "name": "5a1c3e9b27d84f06a2c1",
  "position": { "x": 40, "y": 220, "z": 2000, "height": 300, "width": 500, "tabOrder": 2000 },
  "visual": {
    "visualType": "clusteredBarChart",
    "query": {
      "queryState": {
        "Category": {
          "projections": [
            {
              "field": { "Column": { "Expression": { "SourceRef": { "Entity": "Sales" } }, "Property": "Region" } },
              "queryRef": "Sales.Region",
              "nativeQueryRef": "Region",
              "active": true
            }
          ]
        },
        "Y": {
          "projections": [
            {
              "field": { "Measure": { "Expression": { "SourceRef": { "Entity": "Sales" } }, "Property": "Profit" } },
              "queryRef": "Sales.Profit",
              "nativeQueryRef": "Profit"
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
  "name": "5a1c3e9b27d84f06a2c1",
  "position": { "x": 40, "y": 220, "z": 2000, "height": 300, "width": 500, "tabOrder": 2000 },
  "visual": {
    "visualType": "clusteredBarChart",
    "query": {
      "queryState": {
        "Category": {
          "projections": [
            {
              "field": { "Column": { "Expression": { "SourceRef": { "Entity": "Sales" } }, "Property": "Region" } },
              "queryRef": "Sales.Region",
              "nativeQueryRef": "Region",
              "active": true
            }
          ]
        },
        "Y": {
          "projections": [
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

The chart asks the Sales table for a Profit measure it does not have, so the finding reads `[Profit]: no measure named "Profit" on "Sales"`. The fix binds Total Sales, which the model does have, in its place.

## Why it matters

A visual that names a field the model does not have cannot show its data. Power BI Desktop draws an error on the visual, with a warning naming the fields that do not exist, and conditional formatting that names a missing field puts a warning on the visual and in the Format pane. The error sits on that visual alone, so nothing points at the break until someone looks at it. The cause can be on the model side, a field deleted from the model or renamed after the report was built, as Microsoft's documentation describes, and a visual pasted from a report built on a different model breaks the same way. Catching it before the report is published spares readers a visual that shows an error where its numbers should be.

## How to fix it

In Power BI Desktop, select the visual that the finding names; it shows an error that names the fields it cannot find. In the Visualizations pane, remove the broken field from its well and add the field you meant from the Data pane. For a field used in conditional formatting, open the formatting option's fx dialog and pick a valid field, or remove the formatting and apply it again with the right one. For a filter, remove the broken card from the Filters pane and add the field again. For a bookmark, fix the page it shows first, then select the bookmark and choose Update from its More options menu, so it captures the page again.

In the report's JSON, a field reference names its table in `Entity` and its column or measure in `Property`, as in the example: correct the name, or, for a measure that moved, the table, and change the `queryRef` and `nativeQueryRef` beside it to match. A reference to a measure in the report's extension also carries `"Schema": "extension"`, on its `SourceRef` or, in a filter's condition, on the `From` entry its alias names, and when that measure has moved into the model, remove the key, as `REPORT_LEVEL_MEASURES`'s page describes. When the model is what changed and the report is right, renaming the field back in the model fixes every reference to it at once.

## When to ignore it

There is no legitimate exception, because a reference the model cannot resolve is broken for every reader of the report.

## Quirks

- Names are matched without regard to case, so `'sales'[region]` finds the Region column on Sales.
- A reference names the measure's table as well as the measure, so a measure that lives on another table is reported with the table it is on, as `[Total Sales]: [Total Sales] is on "Sales", not "Product"`, rather than as missing.
- A measure defined in the report itself, in reportExtensions.json, resolves like a model measure, so a visual bound to one is not reported. A reference that names the report's extension, as Power BI Desktop's references to a report measure do with `"Schema": "extension"`, is looked up among the report's own measures only, so one left behind after its measure moved into the model is reported, as `[Net Margin]: no measure named "Net Margin" on "Sales" in the report's extension`. A reference inside such a measure's own DAX is not reported by this rule at all; `REPORT_LEVEL_MEASURES` reports the measure itself, so it can move into the model.
- While reportExtensions.json cannot be read, such as while it holds merge-conflict markers, a reference that names the report's extension is not reported, since pbiplint cannot tell what the file defines; the file's own `PARSE_ISSUE` finding says why. When the input holds no reportExtensions.json at all, the reference is reported, as `[Net Margin]: no measure named "Net Margin" on "Sales": the report defines no extension measures`.
- Each object reports a missing field once, however many times it names it. A filter that names the field in its `field` and again in its condition is one finding, and so is a visual that binds a field and also filters or sorts by it. The finding keeps one line, chosen in this order rather than by position in the file: the well that binds the field, else the first filter that names it, else the first formatting property or sort entry that does.
- A field a visual names anywhere in its file counts, not only the fields in its wells: conditional formatting, a title bound to a measure, a card's reference label, and the sort all name fields, so a missing field in any of them is reported.
- A filter condition that reaches its table through an alias the filter never declares is reported by the field's name alone, as `[Region]: a filter alias that no From list declares`. A reference whose alias stands for a subquery rather than a table, or whose source names no table at all, is labelled the same way, with `an alias whose From entry names no model table` or `a source that names no model table`.
- With Auto date/time on, Power BI Desktop gives a date column a hidden table of its own, with a hierarchy named Date Hierarchy, and the report reaches that hierarchy through the date column's variation (`PropertyVariationSource` in the JSON) rather than by a table name. The rule follows the same path, from the date column through its variation to the hierarchy and its level, and labels a break with the date column and the hierarchy, as `'Sales'[OrderDate].[Date Hierarchy].[Week]: no level named "Week" in hierarchy "Date Hierarchy" on "LocalDateTable_…"`.
- The rule compares the report with its model, so it runs only when both are in the input.

## Related rules

- `NOT_REACHED_FROM_REPORT` looks the other way, at the model's fields that nothing in the report reaches. A reference this rule reports reaches nothing, so pointing it at the right field can also take that field off the other rule's list.
- `REPORT_LEVEL_MEASURES` reports a measure defined in the report, which resolves for this rule like a model measure.
- `BROKEN_BOOKMARK_REFERENCE` also reports a bookmark's broken references: a page or visual it captures that the report does not have, where this rule reports a field.

## Links

- [Report view in Power BI Desktop, including the error a visual shows for fields the model does not have](https://learn.microsoft.com/power-bi/create-reports/desktop-report-view)
- [Troubleshoot field errors in conditional formatting](https://learn.microsoft.com/power-bi/visuals/power-bi-visualization-conditional-formatting#troubleshoot-field-errors-in-conditional-formatting)
- [Auto date/time in Power BI Desktop, including the hidden table and its Date Hierarchy](https://learn.microsoft.com/power-bi/transform-model/desktop-auto-date-time)
