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

Visuals hidden in the Selection pane, with their own eye icon or with that of a group they sit in, that still have fields in their wells.

Hiding a group hides every visual in it, including the visuals of a group inside it. So a visual counts as hidden when its own visual.json saves `isHidden`, or when the visual.json of any group above it does. Power BI Desktop's saved files do not always write `isHidden` on the visuals of a hidden group themselves, so the rule follows each visual's groups up to the page.

Each finding names the visual, as `"Sales by product" on "Overview"`, or as `tableEx (8b2e41) on "Overview"` when it has no title, and its detail counts the fields in its wells, as `2 fields bound`. A visual with `isHidden` of its own is reported at that line. A visual hidden only through a group has no such line, so its finding sits on line 1 of its visual.json, and its detail names the outermost hidden group too, as `2 fields bound, hidden with Group "Filters"`.

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

Find out first whether anything shows the visual. In Power BI Desktop, open the Bookmarks pane from the View tab and select each bookmark in turn, watching whether the visual appears. A bookmark can be linked to a button, a shape, or an image, on this page or another, so check the Action section in the Format pane of each one that has an action for the bookmark it applies. If a bookmark shows the visual, it is working as built; leave it.

If nothing does, delete it. Open the Selection pane from the View tab, select the eye icon beside the visual to show it, confirm it is the one you mean, and delete it from the page. In the report folder, the visual is the folder under the page's `visuals` folder that carries its `name`, as in the example, and deleting that folder removes it.

A visual whose finding names a group is hidden because that group is. In the Selection pane, expand the group with the caret beside its name: while the group is hidden, the eye icons of the visuals in it are grayed out, so the visual cannot be shown on its own. Check the bookmarks for the group: a bookmark that shows the group usually shows the visual with it, but a bookmark saves each visual's own visibility too and can keep one visual in the group hidden, so select each bookmark that shows the group and watch whether the visual appears. If nothing shows the visual, select the group's eye icon to show the group, confirm the visual is the one you mean, delete it, and select the group's eye icon again to hide what is left. If a bookmark does show the visual, it is working as built. If the visual is meant to be seen while the group stays hidden, drag it out of the group in the Selection pane, so that it sits on the page on its own.

## When to ignore it

A visual that a bookmark or a button reveals, by itself or with its group, is hidden on purpose, such as a detail table that a button shows on demand; ignore the finding on it. So is a hidden slicer kept to filter the page, since a slicer goes on filtering whether or not it is visible.

## Quirks

- The count is of the entries in the visual's wells, so one field in two wells counts twice, and a visual calculation counts though it names no model field.
- A visual group has no wells, so a hidden group is not reported itself; the visuals in it that have fields bound are, one finding each.
- A visual hidden both by its own `isHidden` and by its group is reported at its own `isHidden` line, and its detail does not name the group.
- The rule reads the visual as the page is saved. A visual that a bookmark hides but that is visible on the saved page is not reported.

## Related rules

- `REDUCE_VISUALS_ON_PAGE` does not count a visual with `isHidden` of its own, so a page can stay under that rule's limit while carrying hidden visuals this rule reports. It does count a visual hidden only through its group, as its source does.
- `BROKEN_FIELD_REFERENCE` reads a hidden visual's fields as it reads a visible one's, so a left-behind visual whose field was renamed is reported there too.
- `VISUAL_WITHOUT_FIELDS` reports the opposite case, a data visual with nothing in its wells.

## Links

- [Use bookmarks to lazy-load Power BI visuals, Phil Seamark's post on why a hidden visual runs no query until it is shown](https://dax.tips/2019/12/24/use-bookmarks-to-lazyload-visuals/)
- [Create report bookmarks in Power BI, including the Selection pane and how bookmarks show and hide visuals](https://learn.microsoft.com/power-bi/create-reports/desktop-bookmarks)
- [Group visuals in Power BI Desktop reports, including hiding a group and moving a visual out of one in the Selection pane](https://learn.microsoft.com/power-bi/create-reports/desktop-grouping-visuals)
