---
id: REDUCE_VISUALS_ON_PAGE
name: "Reduce the number of visible visuals on the page"
category: Performance
severity: warning
scope: [Page]
status: ported
layer: report
video:
sources:
  - https://github.com/NatVanG/fab-inspector/blob/main/Rules/Base-rules.json
---

# Reduce the number of visible visuals on the page

## What it checks

Pages with more visible visuals than the threshold, 20 by default, not counting shapes, slicers, buttons, and text boxes.

Each finding names the page, as `Page "Overview"`, and its detail gives the count, as `23 visible visuals, more than 20`.

## Example

The example lowers the threshold to 2 so that it stays short; the default is 20.

```json pbiplint.config.json
{
  "rules": {
    "REDUCE_VISUALS_ON_PAGE": { "max": 2 }
  }
}
```

```pbir fires tree.json
{
  "definition/pages/p1/visuals/3d9c80144abca427957c/visual.json": {
    "$schema": "https://developer.microsoft.com/json-schemas/fabric/item/report/definition/visualContainer/2.8.0/schema.json",
    "name": "3d9c80144abca427957c",
    "position": { "x": 40, "y": 40, "z": 1000, "height": 105, "width": 150, "tabOrder": 1000 },
    "visual": {
      "visualType": "cardVisual",
      "query": {
        "queryState": {
          "Data": {
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
  },
  "definition/pages/p1/visuals/81e55f42a5a0e75a0007/visual.json": {
    "$schema": "https://developer.microsoft.com/json-schemas/fabric/item/report/definition/visualContainer/2.8.0/schema.json",
    "name": "81e55f42a5a0e75a0007",
    "position": { "x": 210, "y": 40, "z": 2000, "height": 105, "width": 150, "tabOrder": 2000 },
    "visual": {
      "visualType": "cardVisual",
      "query": {
        "queryState": {
          "Data": {
            "projections": [
              {
                "field": { "Measure": { "Expression": { "SourceRef": { "Entity": "Sales" } }, "Property": "Total Quantity" } },
                "queryRef": "Sales.Total Quantity"
              }
            ]
          }
        }
      }
    }
  },
  "definition/pages/p1/visuals/21c6fe685817de69aa28/visual.json": {
    "$schema": "https://developer.microsoft.com/json-schemas/fabric/item/report/definition/visualContainer/2.8.0/schema.json",
    "name": "21c6fe685817de69aa28",
    "position": { "x": 380, "y": 40, "z": 3000, "height": 105, "width": 150, "tabOrder": 3000 },
    "visual": {
      "visualType": "cardVisual",
      "query": {
        "queryState": {
          "Data": {
            "projections": [
              {
                "field": { "Measure": { "Expression": { "SourceRef": { "Entity": "Sales" } }, "Property": "Total Margin" } },
                "queryRef": "Sales.Total Margin"
              }
            ]
          }
        }
      }
    }
  }
}
```

```pbir fixed tree.json
{
  "definition/pages/p1/visuals/3d9c80144abca427957c/visual.json": {
    "$schema": "https://developer.microsoft.com/json-schemas/fabric/item/report/definition/visualContainer/2.8.0/schema.json",
    "name": "3d9c80144abca427957c",
    "position": { "x": 40, "y": 40, "z": 1000, "height": 105, "width": 320, "tabOrder": 1000 },
    "visual": {
      "visualType": "cardVisual",
      "query": {
        "queryState": {
          "Data": {
            "projections": [
              {
                "field": { "Measure": { "Expression": { "SourceRef": { "Entity": "Sales" } }, "Property": "Total Sales" } },
                "queryRef": "Sales.Total Sales"
              },
              {
                "field": { "Measure": { "Expression": { "SourceRef": { "Entity": "Sales" } }, "Property": "Total Quantity" } },
                "queryRef": "Sales.Total Quantity"
              }
            ]
          }
        }
      }
    }
  },
  "definition/pages/p1/visuals/21c6fe685817de69aa28/visual.json": {
    "$schema": "https://developer.microsoft.com/json-schemas/fabric/item/report/definition/visualContainer/2.8.0/schema.json",
    "name": "21c6fe685817de69aa28",
    "position": { "x": 380, "y": 40, "z": 3000, "height": 105, "width": 150, "tabOrder": 3000 },
    "visual": {
      "visualType": "cardVisual",
      "query": {
        "queryState": {
          "Data": {
            "projections": [
              {
                "field": { "Measure": { "Expression": { "SourceRef": { "Entity": "Sales" } }, "Property": "Total Margin" } },
                "queryRef": "Sales.Total Margin"
              }
            ]
          }
        }
      }
    }
  }
}
```

The fix moves Total Quantity into the first card, which now shows two values, and deletes the card that held it.

## Why it matters

Every visual that shows data sends its own query when the page opens, and again whenever a reader changes a slicer, a filter, or a selection that cross-filters it. Only so many of those queries run at once, so on a crowded page they wait their turn, the page fills in piece by piece, and the slowest visual decides when the reader can start. A crowded page is also harder to read: with twenty or more visuals competing for attention, the one the page was built around is easy to miss.

## How to fix it

Decide what the page is for and move the rest somewhere a reader goes on purpose. Detail about one item belongs on a drillthrough page, and context for a single data point on a report page tooltip; neither runs a query until a reader asks for it. Cards that each show one measure can become one card visual that shows them all: in Power BI Desktop, drag the other measures into the first card's Values well in the Visualizations pane and delete the cards they came from. Delete visuals that repeat what another visual on the page already shows. In the files, each visual is its own folder under the page's visuals folder, and deleting a visual in Desktop removes that folder.

## When to ignore it

A page of light visuals can carry more than the default without keeping anyone waiting: on an Import model, a grid of cards that each read one measure can open faster than a page with four large matrices. Open the page with Performance Analyzer in Power BI Desktop (on the Optimize ribbon, then Start recording and Refresh visuals). If every visual comes back quickly and readers still find what the page is about, the count is not the problem on that page.

## Quirks

- Hidden visuals are not counted, and neither are shapes, slicers, buttons, and text boxes, which is how the source counts. A slicer runs a query of its own, so a page crowded with slicers can be slow without being reported.
- The exclusions go by visual type, so only a slicer of the type `slicer` is left out. The newer list slicer and button slicer are written as `listSlicer` and `advancedSlicerVisual`, and they are counted.
- A visual group counts as one visual, and each visual inside it counts as well.
- Every page is checked, hidden tooltip and drillthrough pages included.

## Related rules

- `REDUCE_OBJECTS_WITHIN_VISUALS` is the same budget one level down: folding several visuals into one clears this finding and can push the visual that remains over that rule's limit.
- `REDUCE_PAGES` pulls the other way: moving visuals onto a new page clears this finding and adds to that rule's count.

## Links

- [Optimization guide for Power BI](https://learn.microsoft.com/power-bi/guidance/power-bi-optimization)
- [Use Performance Analyzer to examine report performance](https://learn.microsoft.com/power-bi/create-reports/performance-analyzer)
- [Create a card visual in Power BI](https://learn.microsoft.com/power-bi/visuals/power-bi-visualization-card)
