---
id: REDUCE_TOPN_FILTERS
name: "Reduce usage of TopN filtering visuals by page"
category: Performance
severity: warning
scope: [Page]
status: ported
layer: report
video:
sources:
  - https://github.com/NatVanG/fab-inspector/blob/main/Rules/Base-rules.json
---

# Reduce usage of TopN filtering visuals by page

## What it checks

Pages with more visuals carrying a Top N filter than the threshold, 4 by default.

Each finding names the page, as `Page "Overview"`, and its detail gives the count, as `5 visuals with a TopN filter, more than 4`.

## Example

The example lowers the threshold to 2 so that it stays short; the default is 4. Each filter is shown without the ranking it applies, which the rule does not need (see Quirks).

```json pbiplint.config.json
{
  "rules": {
    "REDUCE_TOPN_FILTERS": { "max": 2 }
  }
}
```

```pbir fires tree.json
{
  "definition/pages/p1/visuals/99a57e01807b781d6d23/visual.json": {
    "$schema": "https://developer.microsoft.com/json-schemas/fabric/item/report/definition/visualContainer/2.8.0/schema.json",
    "name": "99a57e01807b781d6d23",
    "position": { "x": 40, "y": 40, "z": 1000, "height": 300, "width": 400, "tabOrder": 1000 },
    "visual": { "visualType": "clusteredBarChart" },
    "filterConfig": {
      "filters": [
        {
          "name": "d782fdb581064cdcace2",
          "field": { "Column": { "Expression": { "SourceRef": { "Entity": "Product" } }, "Property": "Product Name" } },
          "type": "TopN"
        }
      ]
    }
  },
  "definition/pages/p1/visuals/aa7c0395b9dc27606d6d/visual.json": {
    "$schema": "https://developer.microsoft.com/json-schemas/fabric/item/report/definition/visualContainer/2.8.0/schema.json",
    "name": "aa7c0395b9dc27606d6d",
    "position": { "x": 460, "y": 40, "z": 2000, "height": 300, "width": 300, "tabOrder": 2000 },
    "visual": { "visualType": "donutChart" },
    "filterConfig": {
      "filters": [
        {
          "name": "6c1f0e2b9a4d83e57b10",
          "field": { "Column": { "Expression": { "SourceRef": { "Entity": "Product" } }, "Property": "Category" } },
          "type": "TopN"
        }
      ]
    }
  },
  "definition/pages/p1/visuals/c897ed0802274ab55e2d/visual.json": {
    "$schema": "https://developer.microsoft.com/json-schemas/fabric/item/report/definition/visualContainer/2.8.0/schema.json",
    "name": "c897ed0802274ab55e2d",
    "position": { "x": 40, "y": 360, "z": 3000, "height": 300, "width": 720, "tabOrder": 3000 },
    "visual": { "visualType": "tableEx" },
    "filterConfig": {
      "filters": [
        {
          "name": "013d040cc3e0a9bb767d",
          "field": { "Column": { "Expression": { "SourceRef": { "Entity": "Product" } }, "Property": "Product Name" } },
          "type": "TopN"
        }
      ]
    }
  }
}
```

```pbir fixed tree.json
{
  "definition/pages/p1/visuals/99a57e01807b781d6d23/visual.json": {
    "$schema": "https://developer.microsoft.com/json-schemas/fabric/item/report/definition/visualContainer/2.8.0/schema.json",
    "name": "99a57e01807b781d6d23",
    "position": { "x": 40, "y": 40, "z": 1000, "height": 300, "width": 400, "tabOrder": 1000 },
    "visual": { "visualType": "clusteredBarChart" },
    "filterConfig": {
      "filters": [
        {
          "name": "d782fdb581064cdcace2",
          "field": { "Column": { "Expression": { "SourceRef": { "Entity": "Product" } }, "Property": "Product Name" } },
          "type": "TopN"
        }
      ]
    }
  },
  "definition/pages/p1/visuals/aa7c0395b9dc27606d6d/visual.json": {
    "$schema": "https://developer.microsoft.com/json-schemas/fabric/item/report/definition/visualContainer/2.8.0/schema.json",
    "name": "aa7c0395b9dc27606d6d",
    "position": { "x": 460, "y": 40, "z": 2000, "height": 300, "width": 300, "tabOrder": 2000 },
    "visual": { "visualType": "donutChart" },
    "filterConfig": {
      "filters": [
        {
          "name": "6c1f0e2b9a4d83e57b10",
          "field": { "Column": { "Expression": { "SourceRef": { "Entity": "Product" } }, "Property": "Category" } },
          "type": "TopN"
        }
      ]
    }
  },
  "definition/pages/p1/visuals/c897ed0802274ab55e2d/visual.json": {
    "$schema": "https://developer.microsoft.com/json-schemas/fabric/item/report/definition/visualContainer/2.8.0/schema.json",
    "name": "c897ed0802274ab55e2d",
    "position": { "x": 40, "y": 360, "z": 3000, "height": 300, "width": 720, "tabOrder": 3000 },
    "visual": { "visualType": "tableEx" }
  }
}
```

The fix takes the Top N filter off the table, where it filtered Product Name, the same field as the bar chart's Top N filter. That leaves two visuals with a Top N filter, which a threshold of 2 allows.

## Why it matters

A Top N filter has to rank every item before it can keep the first few: to show the ten best-selling products, the model evaluates the measure for every product, sorts them, and only then computes the visual for the ten that made the cut. On a DirectQuery model the ranking is a query of its own, which brings every item back from the source first. Every visual with a Top N filter repeats that work each time the page opens and each time a slicer or a selection changes, so a page with several of them ranks the same data over and over while the reader waits.

## How to fix it

Keep Top N where the ranking is the point of the visual and take it off where it is not. In Power BI Desktop, select the visual, find its card under Filters on this visual in the Filters pane, and remove it with the X on the card, or set its Filter type back to Basic filtering. A visual that only needs its largest items first can sort by the measure instead (More options on the visual, then Sort axis) and let the reader scroll. Two Top N filters on the same field, as in the example, can become one when they rank by the same measure and keep the same number of items. In visual.json, a Top N filter is an entry with `"type": "TopN"` in `filterConfig.filters`, and deleting the entry removes it.

## When to ignore it

A Top N filter that caps a table which would otherwise list every row of a large table saves more than it costs: Microsoft's optimization guide recommends exactly that, so that a reader who wants a few dozen rows does not load millions. On an Import model with a few hundred items the ranking is cheap as well. Check the page with Performance Analyzer in Power BI Desktop, and ignore the finding when the ranked visuals come back quickly.

## Quirks

- A filter counts as soon as its type is Top N, whether or not a ranking is applied, which is how the source counts.
- The count is of visuals, not filters: a visual with two Top N filters counts once. Filters on the page or on the whole report are not counted.

## Related rules

- `REDUCE_ADVANCED_FILTERS` is the same count for Advanced filters, and one visual can count toward both.

## Links

- [Optimization guide for Power BI](https://learn.microsoft.com/power-bi/guidance/power-bi-optimization)
- [DirectQuery model guidance in Power BI Desktop, including what a Top N filter sends to the source](https://learn.microsoft.com/power-bi/guidance/directquery-model-guidance)
