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

A visual that names a field the model does not have cannot show its data. Power BI Desktop draws an error on the visual, with a warning naming the fields that do not exist, and conditional formatting that names a missing field puts a warning on the visual and in the Format pane. The error sits on that visual alone, so nothing points at the break until someone looks at it. The cause is usually on the model side: a column or measure renamed or deleted after the report was built, the two causes Microsoft's documentation gives for a field error, or a measure moved to another table. Catching it before the report is published spares readers a visual that shows an error where its numbers should be.

## How to fix it

In Power BI Desktop, select the visual that the finding names; it shows an error that names the fields it cannot find. In the Visualizations pane, remove the broken field from its well and add the field you meant from the Data pane. For a field used in conditional formatting, open the formatting option's fx dialog and pick a valid field, or remove the formatting and apply it again with the right one. For a filter, remove the broken card from the Filters pane and add the field again. For a bookmark, fix the page it shows first, then select the bookmark and choose Update from its More options menu, so it captures the page again.

In the report's JSON, a field reference names its table in `Entity` and its column or measure in `Property`, as in the example: correct the name, or, for a measure that moved, the table, and change the `queryRef` beside it to match. When the model is what changed and the report is right, renaming the field back in the model fixes every reference to it at once.

## When to ignore it

There is no legitimate exception, because a reference the model cannot resolve is broken for every reader of the report.

## Quirks

- Names are matched without regard to case, so `'sales'[region]` finds the Region column on Sales.
- A reference names the measure's table as well as the measure, so a measure that lives on another table is reported with the table it is on, as `[Total Sales]: [Total Sales] is on "Sales", not "Product"`, rather than as missing.
- A measure defined in the report itself, in reportExtensions.json, resolves like a model measure, so a visual bound to one is not reported. A reference inside such a measure's own DAX is not reported by this rule at all.
- Each object reports a missing field once, however many times it names it. A filter that names the field in its `field` and again in its condition is one finding, and so is a visual that binds a field and also filters or sorts by it. The finding sits on the binding's line, or, for a field no well holds, on the first filter, formatting property, or sort entry that names it.
- A field a visual names anywhere in its file counts, not only the fields in its wells: conditional formatting, a title bound to a measure, a card's reference label, and the sort all name fields, and a missing one breaks the visual just the same.
- A filter condition that reaches its table through an alias the filter never declares is reported by the field's name alone, as `[Region]: a filter alias that no From list declares`.
- The rule compares the report with its model, so it runs only when both are in the input.

## Related rules

- `NOT_REACHED_FROM_REPORT` looks the other way, at the model's fields that nothing in the report reaches. A reference this rule reports reaches nothing, so pointing it at the right field can also take that field off the other rule's list.

## Links

- [Report view in Power BI Desktop, including the error a visual shows for fields the model does not have](https://learn.microsoft.com/power-bi/create-reports/desktop-report-view)
- [Troubleshoot field errors in conditional formatting](https://learn.microsoft.com/power-bi/visuals/power-bi-visualization-conditional-formatting#troubleshoot-field-errors-in-conditional-formatting)
