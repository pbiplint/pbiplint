---
id: HIDDEN_VISUAL_WITH_FIELDS
name: "Hidden visual with fields bound"
category: Maintenance
severity: info
scope: [Visual]
status: builtin
layer: report
video:
sources:
---

# Hidden visual with fields bound

## What it checks

Visuals hidden with the eye icon in the Selection pane, saved as `isHidden` in visual.json, that still have fields in their wells.

Each finding names the visual, as `"Sales by product" on "Overview"`, or as `tableEx (8b2e41) on "Overview"` when it has no title, at its `isHidden` line, and its detail counts the fields in its wells, as `2 fields bound`.

## Example

```pbir fires tree.json
{
  "definition/pages/p1/visuals/3d9c80144abca427957c/visual.json": {
    "$schema": "https://developer.microsoft.com/json-schemas/fabric/item/report/definition/visualContainer/2.8.0/schema.json",
    "name": "3d9c80144abca427957c",
    "position": { "x": 40, "y": 90, "z": 1000, "height": 105, "width": 150, "tabOrder": 1000 },
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
  "definition/pages/p1/visuals/8b2e41c07d95a3f6e210/visual.json": {
    "$schema": "https://developer.microsoft.com/json-schemas/fabric/item/report/definition/visualContainer/2.8.0/schema.json",
    "name": "8b2e41c07d95a3f6e210",
    "position": { "x": 40, "y": 220, "z": 2000, "height": 300, "width": 500, "tabOrder": 2000 },
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
    },
    "isHidden": true
  }
}
```

```pbir fixed tree.json
{
  "definition/pages/p1/visuals/3d9c80144abca427957c/visual.json": {
    "$schema": "https://developer.microsoft.com/json-schemas/fabric/item/report/definition/visualContainer/2.8.0/schema.json",
    "name": "3d9c80144abca427957c",
    "position": { "x": 40, "y": 90, "z": 1000, "height": 105, "width": 150, "tabOrder": 1000 },
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
  }
}
```

The page holds a card and a hidden table of sales by region, built to check the card's figure, which no bookmark or button ever shows again. The finding reads `tableEx (8b2e41) on "Overview"` with `2 fields bound`. The fix deletes the table, so its folder is gone from the second tree.

## Why it matters

Power BI does not run a hidden visual's query until a bookmark or the Selection pane shows it, so a hidden visual adds no query when the page loads. With fields bound, it is one of two things. It is either a visual that a bookmark or a button reveals, which is a design, or work left behind: a table built to check the numbers, a chart replaced by a better one, a draft someone meant to finish. Left-behind visuals still travel in the report file, still break when a field they name is renamed or removed, and leave the next author wondering whether something depends on them. The finding asks which of the two each hidden visual is.

## How to fix it

Find out first whether anything shows the visual. In Power BI Desktop, open the Bookmarks pane from the View tab and select each bookmark in turn, watching whether the visual appears, and, for each button on the page, check the Action section of its Format pane for the bookmark it applies. If one of them shows the visual, it is working as built; leave it.

If nothing does, delete it. Open the Selection pane from the View tab, select the eye icon beside the visual to show it, confirm it is the one you mean, and delete it from the page. In the report folder, the visual is the folder under the page's `visuals` folder that carries its `name`, as in the example, and deleting that folder removes it.

## When to ignore it

A visual that a bookmark or a button reveals is hidden on purpose, such as a detail table that a button shows on demand; ignore the finding on it. So is a hidden slicer kept to filter the page, since a slicer goes on filtering whether or not it is visible.

## Quirks

- The count is of the entries in the visual's wells, so one field in two wells counts twice, and a visual calculation counts though it names no model field.
- A visual group has no wells, so a hidden group is never reported. Each visual inside it is judged by its own `isHidden`.
- The rule reads the visual as the page is saved. A visual that a bookmark hides but that is visible on the saved page is not reported.

## Related rules

- `REDUCE_VISUALS_ON_PAGE` does not count hidden visuals, so a page can stay under that rule's limit while carrying hidden visuals this rule reports.
- `BROKEN_FIELD_REFERENCE` reads a hidden visual's fields as it reads a visible one's, so a left-behind visual whose field was renamed is reported there too.

## Links

- [Use bookmarks to lazy-load Power BI visuals, Phil Seamark's post on why a hidden visual runs no query until it is shown](https://dax.tips/2019/12/24/use-bookmarks-to-lazyload-visuals/)
- [Create report bookmarks in Power BI, including the Selection pane and how bookmarks show and hide visuals](https://learn.microsoft.com/power-bi/create-reports/desktop-bookmarks)
