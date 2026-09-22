---
id: AVOID_SHOW_ITEMS_WITH_NO_DATA
name: "Avoid setting ‘Show items with no data’ on columns"
category: Performance
severity: warning
scope: [Visual]
status: ported
layer: report
video:
sources:
  - https://github.com/NatVanG/fab-inspector/blob/main/Rules/Base-rules.json
---

# Avoid setting ‘Show items with no data’ on columns

## What it checks

Visuals with Show items with no data turned on for any of their field wells.

Each finding names the visual, as `"Sales by category" on "Overview"` when it has a title and `clusteredBarChart (99a57e) on "Overview"` when it has none, and its detail names the wells, as `Show items with no data is on for Category`.

## Example

```pbir fires visual.json
{
  "$schema": "https://developer.microsoft.com/json-schemas/fabric/item/report/definition/visualContainer/2.8.0/schema.json",
  "name": "99a57e01807b781d6d23",
  "position": { "x": 55, "y": 518, "z": 11006, "height": 190, "width": 505, "tabOrder": 11006 },
  "visual": {
    "visualType": "clusteredBarChart",
    "query": {
      "queryState": {
        "Category": {
          "projections": [
            {
              "field": { "Column": { "Expression": { "SourceRef": { "Entity": "Product" } }, "Property": "Category" } },
              "queryRef": "Product.Category",
              "active": true
            }
          ],
          "showAll": true
        },
        "Y": {
          "projections": [
            {
              "field": { "Measure": { "Expression": { "SourceRef": { "Entity": "Sales" } }, "Property": "Total Sales" } },
              "queryRef": "Sales.Total Sales"
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
  "name": "99a57e01807b781d6d23",
  "position": { "x": 55, "y": 518, "z": 11006, "height": 190, "width": 505, "tabOrder": 11006 },
  "visual": {
    "visualType": "clusteredBarChart",
    "query": {
      "queryState": {
        "Category": {
          "projections": [
            {
              "field": { "Column": { "Expression": { "SourceRef": { "Entity": "Product" } }, "Property": "Category" } },
              "queryRef": "Product.Category",
              "active": true
            }
          ]
        },
        "Y": {
          "projections": [
            {
              "field": { "Measure": { "Expression": { "SourceRef": { "Entity": "Sales" } }, "Property": "Total Sales" } },
              "queryRef": "Sales.Total Sales"
            }
          ]
        }
      }
    }
  }
}
```

## Why it matters

A visual normally leaves out any group whose measures are all blank. With Show items with no data on, the model has to produce every group the field's table holds, with data or without, and when a well holds fields from related tables, every combination the relationships allow. The query does more work to return rows that are mostly empty, and Microsoft's documentation warns that the option can slow a visual down and make data exports time out. A reader, meanwhile, has to look past the empty rows to find the ones with values.

## How to fix it

In Power BI Desktop, select the visual, open the Build visual tab of the Visualizations pane, and in the well that holds the field select the arrow beside the field (or right-click it) and clear Show items with no data. Desktop sets the option for every field in the same well at once, so clearing it once clears the well. In visual.json, delete `"showAll": true` from the well under `visual.query.queryState`.

## When to ignore it

Some visuals exist to show gaps: a column chart of sales by month in which a month without sales has to appear as an empty column instead of vanishing from the axis, or a list of stores in which a store with no sales is itself what the reader is looking for. Keep the option on for those, grouped by a column from a small table, and ignore the finding on that visual.

## Quirks

- Every well is checked, where the source checks the Category well only, so pbiplint also reports the option on a matrix's Rows or Columns and on any other well a visual has.
- A visual gets one finding however many of its wells have the option on. The detail lists them all, and the line points at the first.

## Related rules

- `REDUCE_OBJECTS_WITHIN_VISUALS` counts the fields this option multiplies: with the option on, every grouping field added to the well multiplies the empty groups the visual lists.

## Links

- [Show items with no data in Power BI](https://learn.microsoft.com/power-bi/create-reports/desktop-show-items-no-data)
