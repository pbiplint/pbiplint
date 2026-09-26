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

In Power BI Desktop, a visual that names a missing field shows an error where its data should be. A text box whose field value names one shows "Something's wrong with one or more fields." in place of its text, with a See details link and a Fix this button. If conditional formatting names a missing field, a warning icon appears in the visual's header and in the Format pane while you edit the visual. The break can come from a field deleted or renamed in the model after the report was built. It can also come from a visual copied from a report on another model, which adds a warning about which fields do not exist. Nothing points at the break until someone looks at that visual, so catching it before you publish spares your readers the error.

## How to fix it

In Power BI Desktop, select the visual the finding names, remove the broken field from its well in the Visualizations pane, and add the field you meant from the Data pane. Other kinds of reference have their own routes:

- For conditional formatting, open the formatting option's fx dialog and pick a valid field, or remove the formatting and apply it again with the right field.
- For a filter, remove the broken card from the Filters pane and add the field again.
- For a bookmark, fix the page it shows first. Then select the bookmark and choose Update from its More options menu, so it captures the page again.
- For a text box's field value, delete the text box and add it again with the field you meant.
- When the model is what changed, put the field back in the model under the name the report uses. If the field was renamed, renaming it back fixes every reference to it at once.

In the report's JSON, a field reference names its table in `Entity` and its column or measure in `Property`, as in the example. Correct the name (or, for a measure that moved, the table), then make the `queryRef` and `nativeQueryRef` beside it match. A reference to a measure defined in the report also carries `"Schema": "extension"`. If that measure has moved into the model, remove the key, as `REPORT_LEVEL_MEASURES`'s page describes.

## When to ignore it

There is no legitimate exception, because a reference the model cannot resolve is broken for every reader of the report.

## Quirks

- Names are matched without regard to case, so `'sales'[region]` finds the Region column on Sales.
- A reference names a measure's table as well as the measure. A measure that lives on another table is reported with the table it is on, rather than as missing, as `[Total Sales]: [Total Sales] is on "Sales", not "Product"`.
- A measure defined in the report itself, in reportExtensions.json, resolves like a model measure, so a visual bound to one is not reported. A reference marked `"Schema": "extension"` is looked up among the report's own measures only, so one left behind after its measure moved into the model is reported, as `[Net Margin]: no measure named "Net Margin" on "Sales" in the report's extension`. This rule does not check the DAX inside a report measure; `REPORT_LEVEL_MEASURES` reports the measure itself so it can move into the model.
- While pbiplint cannot read reportExtensions.json (for example, while it holds merge-conflict markers), a reference marked `"Schema": "extension"` is not reported, since pbiplint cannot tell what the file defines. The file's `PARSE_ISSUE` finding says why, or a notice does if pbiplint could not open the file. With no reportExtensions.json in the input at all, the reference is reported, as `[Net Margin]: no measure named "Net Margin" on "Sales": the report defines no extension measures`.
- A model file with a parse issue that can drop a declaration, or a file or folder pbiplint could not open, may hold a name pbiplint could not read. While there is one, pbiplint does not report a missing table, or a missing field on a table that file may declare. The file's `PARSE_ISSUE` finding, or a notice, says why. A `///` description with a blank line after it takes no declaration out, so it quiets nothing. A column reference that names a measure on its table is still reported, since a column cannot share a name with a measure on its table.
- Each object reports a missing field once, however many times it names it. A filter that names the field in its `field` entry and again in its condition gives one finding, as does a visual that binds a field and also filters or sorts by it. That finding sits on the line of the well that binds the field, else of the first filter that names it, else of the first formatting property or sort entry that does.
- A missing field is reported wherever a visual names it: its wells, conditional formatting, a title bound to a measure, a card's reference label, a text box's field value, and the sort. A text box's field value is reported with the field its query reads, as `'Dates'[Last Update]: no column named "Last Update" on "Dates"`. It is reported once, on the line of the query's `Select` item, even when the query's `OrderBy` or `Where` names it again.
- A filter condition that reaches its table through an alias the filter never declares is reported by the field's name alone, as `[Region]: a filter alias that no From list declares`. A reference whose alias stands for a subquery, or whose source names no table, is labelled the same way, with `an alias whose From entry names no model table` or `a source that names no model table`.
- With Auto date/time on, Power BI Desktop gives a date column a hidden table of its own, with a hierarchy named Date Hierarchy. The report reaches that hierarchy through the date column's variation (`PropertyVariationSource` in the JSON), not by a table name, and the rule follows the same path. A break is labelled with the date column and the hierarchy, as `'Sales'[OrderDate].[Date Hierarchy].[Week]: no level named "Week" in hierarchy "Date Hierarchy" on "LocalDateTable_…"`.
- The rule compares the report with its model, so it runs only when both are in the input.

## Related rules

- `NOT_REACHED_FROM_REPORT` looks the other way, at the model's fields that nothing in the report reaches. A reference this rule reports reaches nothing, so pointing it at the right field can also take that field off the other rule's list.
- `REPORT_LEVEL_MEASURES` reports a measure defined in the report, which resolves for this rule like a model measure.
- `BROKEN_BOOKMARK_REFERENCE` fires on the same object, a bookmark, when it captures a page or visual the report does not have.

## Links

- [Report view in Power BI Desktop, including the error a pasted visual shows for fields the model does not have](https://learn.microsoft.com/power-bi/create-reports/desktop-report-view#copy-and-paste-visuals-between-reports)
- [Troubleshoot field errors in conditional formatting](https://learn.microsoft.com/power-bi/visuals/power-bi-visualization-conditional-formatting#troubleshoot-field-errors-in-conditional-formatting)
- [Auto date/time in Power BI Desktop, including the hidden table and its Date Hierarchy](https://learn.microsoft.com/power-bi/transform-model/desktop-auto-date-time)
- [TMDL overview on Microsoft Learn, including a table declared across more than one file](https://learn.microsoft.com/analysis-services/tmdl/tmdl-overview#partial-declaration)
