---
id: REDUCE_OBJECTS_WITHIN_VISUALS
name: "Reduce the number of objects within visuals"
category: Performance
severity: warning
scope: [Visual]
status: ported
layer: report
video:
sources:
  - https://github.com/NatVanG/fab-inspector/blob/main/Rules/Base-rules.json
---

# Reduce the number of objects within visuals

## What it checks

Visuals with more fields in their field wells than the threshold, 6 by default, counting every column and measure bound to any of the visual's wells.

Each finding names the visual, as `"Sales by product" on "Overview"` when it has a title and `tableEx (c897ed) on "Overview"` when it has none, and its detail gives the count, as `7 fields bound, more than 6`.

## Example

The table shows two columns from Product and five measures from Sales.

```pbir fires visual.json
{
  "$schema": "https://developer.microsoft.com/json-schemas/fabric/item/report/definition/visualContainer/2.8.0/schema.json",
  "name": "c897ed0802274ab55e2d",
  "position": { "x": 575, "y": 518, "z": 11007, "height": 190, "width": 651, "tabOrder": 11007 },
  "visual": {
    "visualType": "tableEx",
    "query": {
      "queryState": {
        "Values": {
          "projections": [
            {
              "field": { "Column": { "Expression": { "SourceRef": { "Entity": "Product" } }, "Property": "Category" } },
              "queryRef": "Product.Category"
            },
            {
              "field": { "Column": { "Expression": { "SourceRef": { "Entity": "Product" } }, "Property": "Product Name" } },
              "queryRef": "Product.Product Name"
            },
            {
              "field": { "Measure": { "Expression": { "SourceRef": { "Entity": "Sales" } }, "Property": "Total Sales" } },
              "queryRef": "Sales.Total Sales"
            },
            {
              "field": { "Measure": { "Expression": { "SourceRef": { "Entity": "Sales" } }, "Property": "Total Quantity" } },
              "queryRef": "Sales.Total Quantity"
            },
            {
              "field": { "Measure": { "Expression": { "SourceRef": { "Entity": "Sales" } }, "Property": "Average Unit Price" } },
              "queryRef": "Sales.Average Unit Price"
            },
            {
              "field": { "Measure": { "Expression": { "SourceRef": { "Entity": "Sales" } }, "Property": "Total Cost" } },
              "queryRef": "Sales.Total Cost"
            },
            {
              "field": { "Measure": { "Expression": { "SourceRef": { "Entity": "Sales" } }, "Property": "Margin %" } },
              "queryRef": "Sales.Margin %"
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
  "position": { "x": 575, "y": 518, "z": 11007, "height": 190, "width": 651, "tabOrder": 11007 },
  "visual": {
    "visualType": "tableEx",
    "query": {
      "queryState": {
        "Values": {
          "projections": [
            {
              "field": { "Column": { "Expression": { "SourceRef": { "Entity": "Product" } }, "Property": "Category" } },
              "queryRef": "Product.Category"
            },
            {
              "field": { "Column": { "Expression": { "SourceRef": { "Entity": "Product" } }, "Property": "Product Name" } },
              "queryRef": "Product.Product Name"
            },
            {
              "field": { "Measure": { "Expression": { "SourceRef": { "Entity": "Sales" } }, "Property": "Total Sales" } },
              "queryRef": "Sales.Total Sales"
            },
            {
              "field": { "Measure": { "Expression": { "SourceRef": { "Entity": "Sales" } }, "Property": "Total Quantity" } },
              "queryRef": "Sales.Total Quantity"
            },
            {
              "field": { "Measure": { "Expression": { "SourceRef": { "Entity": "Sales" } }, "Property": "Average Unit Price" } },
              "queryRef": "Sales.Average Unit Price"
            },
            {
              "field": { "Measure": { "Expression": { "SourceRef": { "Entity": "Sales" } }, "Property": "Margin %" } },
              "queryRef": "Sales.Margin %"
            }
          ]
        }
      }
    }
  }
}
```

The fix removes Total Cost, which the table's Total Sales and Margin % already imply.

## Why it matters

A visual sends one query for everything in its wells, so every field makes that query bigger. Each column is another level the rows are grouped by, which multiplies the rows the model has to produce, and each measure is another calculation for every one of those rows. One wide table can ask the model for more work than the rest of the page together, and a reader has to scan across all of it to find the number they came for.

## How to fix it

Keep the fields the visual is about and move the rest to where a reader asks for them: secondary measures to a report page tooltip that shows them for the row under the pointer, and detail columns to a drillthrough page. In Power BI Desktop, remove a field by selecting the X beside it in the field well on the Visualizations pane. Where readers do want to choose among many measures or columns, a field parameter (Modeling, then New parameter, then Fields) puts the choice in a slicer, and the visual shows only the fields a reader has picked. In visual.json, each field is one entry in a well's `projections` array under `visual.query.queryState`, and deleting the entry removes the field.

## When to ignore it

A table or matrix whose job is to show many columns side by side, such as the detail table on a drillthrough page or a table readers export to Excel, is doing what it is for. Six is also a strict budget: Microsoft's own guidance recommends limiting a visual to 10 to 20 fields. Check the visual with Performance Analyzer in Power BI Desktop before splitting it, and ignore the finding where it loads quickly and the width is what readers came for.

## Quirks

- pbiplint counts the fields bound to the visual's roles once, where PBI Inspector counts every projections array in the file and can count a field twice.
- Only the fields in the wells count. A field in the visual's filters that is not also in a well is not counted.

## Related rules

- `REDUCE_VISUALS_ON_PAGE` is the same budget one level up: splitting a wide visual in two clears this finding and adds to that rule's count.
- `AVOID_SHOW_ITEMS_WITH_NO_DATA` makes each extra grouping field costlier, because the visual then lists groups with no data beside those with data, and every grouping field multiplies them.

## Links

- [Customize the Visualizations pane, and how many fields a visual should hold](https://learn.microsoft.com/power-bi/visuals/power-bi-report-visualizations)
- [Use field parameters in Power BI reports](https://learn.microsoft.com/power-bi/create-reports/power-bi-field-parameters)
