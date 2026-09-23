---
id: TAB_ORDER_FOLLOWS_LAYOUT
name: "Tab order disagrees with the layout"
category: Accessibility
severity: warning
scope: [Page]
status: builtin
layer: report
video:
sources:
---

# Tab order disagrees with the layout

## What it checks

Pages whose tab order, the order keyboard users move through the visuals in, disagrees with the order the layout reads in: rows from top to bottom, and left to right within a row.

A visual joins the current row when its top edge is no further from the top edge of the row's first visual than half the median height of the visuals being compared; otherwise it starts the next row. A tab order that sorts the visuals strictly by their top edges, then by their left edges, also agrees. Groups are compared one level at a time, because Power BI Desktop's saved files record a grouped visual's position and tab order relative to its group: first the visuals and groups that sit directly on the page, each group taking one place at its own position, then the visuals inside each group among themselves. Hidden visuals, the visuals of a hidden group, visuals hidden from the tab order, and visuals with no tab order value are left out, and so is a page set up as a tooltip, whether its page.json marks it by its `type` or by its `pageBinding`.

Each finding names the page, as `Page "Overview"`, at line 1 of its page.json, and its detail names the first place where the two orders part: `tab order starts at cardVisual (c4e8a2) but the layout reads cardVisual (3d9c80) first`, or `tab order visits "Order count" where the layout reads "Average sale"`. When that place is inside a group, the detail begins with the group, as in `in Group "Filters", tab order starts at slicer (5bfdd0) but the layout reads slicer (30ea5a) first`.

## Example

```pbir fires tree.json
{
  "definition/pages/p1/visuals/3d9c80144abca427957c/visual.json": {
    "$schema": "https://developer.microsoft.com/json-schemas/fabric/item/report/definition/visualContainer/2.8.0/schema.json",
    "name": "3d9c80144abca427957c",
    "position": { "x": 40, "y": 40, "z": 1000, "height": 120, "width": 280, "tabOrder": 1000 },
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
    "position": { "x": 360, "y": 40, "z": 2000, "height": 120, "width": 280, "tabOrder": 2000 },
    "visual": {
      "visualType": "cardVisual",
      "query": {
        "queryState": {
          "Data": {
            "projections": [
              {
                "field": { "Measure": { "Expression": { "SourceRef": { "Entity": "Sales" } }, "Property": "Order Count" } },
                "queryRef": "Sales.Order Count"
              }
            ]
          }
        }
      }
    }
  },
  "definition/pages/p1/visuals/c4e8a2f61b9d3057e7a1/visual.json": {
    "$schema": "https://developer.microsoft.com/json-schemas/fabric/item/report/definition/visualContainer/2.8.0/schema.json",
    "name": "c4e8a2f61b9d3057e7a1",
    "position": { "x": 40, "y": 200, "z": 0, "height": 120, "width": 600, "tabOrder": 0 },
    "visual": {
      "visualType": "cardVisual",
      "query": {
        "queryState": {
          "Data": {
            "projections": [
              {
                "field": { "Measure": { "Expression": { "SourceRef": { "Entity": "Sales" } }, "Property": "Average Sale" } },
                "queryRef": "Sales.Average Sale"
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
    "position": { "x": 40, "y": 40, "z": 1000, "height": 120, "width": 280, "tabOrder": 0 },
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
    "position": { "x": 360, "y": 40, "z": 2000, "height": 120, "width": 280, "tabOrder": 1000 },
    "visual": {
      "visualType": "cardVisual",
      "query": {
        "queryState": {
          "Data": {
            "projections": [
              {
                "field": { "Measure": { "Expression": { "SourceRef": { "Entity": "Sales" } }, "Property": "Order Count" } },
                "queryRef": "Sales.Order Count"
              }
            ]
          }
        }
      }
    }
  },
  "definition/pages/p1/visuals/c4e8a2f61b9d3057e7a1/visual.json": {
    "$schema": "https://developer.microsoft.com/json-schemas/fabric/item/report/definition/visualContainer/2.8.0/schema.json",
    "name": "c4e8a2f61b9d3057e7a1",
    "position": { "x": 40, "y": 200, "z": 0, "height": 120, "width": 600, "tabOrder": 2000 },
    "visual": {
      "visualType": "cardVisual",
      "query": {
        "queryState": {
          "Data": {
            "projections": [
              {
                "field": { "Measure": { "Expression": { "SourceRef": { "Entity": "Sales" } }, "Property": "Average Sale" } },
                "queryRef": "Sales.Average Sale"
              }
            ]
          }
        }
      }
    }
  }
}
```

Overview holds two cards side by side along the top and a wide card below them. The tab order starts at the wide card and only then goes back up to the two above it, so the finding reads `Page "Overview"` with `tab order starts at cardVisual (c4e8a2) but the layout reads cardVisual (3d9c80) first`. The fix renumbers `tabOrder` to run across the top row from left to right, then down to the wide card. Only `tabOrder` changes; `z`, the stacking order, is left as it was.

## Why it matters

A reader who uses a keyboard moves through a page with the Tab key, which Microsoft describes as shifting focus to each object on the page, text boxes, images, shapes, and charts included, and a screen reader reads out each visual's title, its type, and any alt text as focus reaches it. The tab order is therefore the order in which those readers meet the page. Microsoft's guidance is that setting the tab order "helps keyboard users navigate your report in an order that matches the way users visually process the report visuals." When the two orders disagree, a reader who cannot see the layout can hear a total before the figures it sums up, or a chart before the slicer that filters it, and a sighted keyboard user watches focus jump back and forth across the page. Microsoft tells readers who can't tab through a report in a logical manner to contact its author.

## How to fix it

In Power BI Desktop, select the View tab in the ribbon, and under Show panes, select Selection. In the Selection pane, select Tab order to see the page's current tab order. Select an object and use the up and down arrow buttons to move it, or drag it to its place in the list. Select the number next to a decorative object, such as a background shape or an image, to hide it from the tab order, as Microsoft advises for decorative shapes and images.

Meagan Longoria describes a button in the Tab order view, Have tab order match visual order, that reorders the whole page at once, sorting the visuals by their Y and then their X coordinates. By her account of it, the order it writes is one this rule accepts.

In visual.json, the order is `position.tabOrder`, lowest first, as in the example. A visual inside a group is ordered by its own `tabOrder` among the group's visuals, and the group's `tabOrder` places the whole group among its neighbours; in Power BI Desktop's saved files, each group's numbering starts again at 0.

## When to ignore it

A page laid out to be read in columns, such as a column of slicers down the left side that readers should work through before the charts beside it: rows cut across the columns, so the rule reads the top chart before the lower slicers. Grouping the column, by selecting its visuals and choosing Group on the Format menu, lets the rule read it as one place in the order, with its slicers ordered among themselves; put the group where it belongs in the Tab order list, and the finding usually clears without ignoring it. An order that departs from the layout on purpose, such as buttons along the top that readers should reach after the page's content, is a choice the rule cannot see; ignore the finding on that page.

## Quirks

- A tab order nobody set cannot be told apart from one somebody did. Nearly every visual in Power BI Desktop's saved files carries a `tabOrder`, whether or not anyone set one, and by the North Carolina Department of Information Technology's account the tab order is set by the order in which visuals are added, so a page nobody ordered is compared like any other. Most pages in Power BI Desktop's saved files have a tab order that disagrees with their layout, so expect a report whose tab order was never set to be reported on most of its pages.
- Power BI Desktop's saved files show a negative `tabOrder` on some visuals, such as the image and shape of a decorative header, and pbiplint reads a negative value as hidden from the tab order, which Microsoft does not document. Some files leave `tabOrder` out altogether. Both are left out of the comparison. A group with no place in the tab order still has its own visuals compared among themselves.
- A decorative shape, line, image, or text box takes part in the reading order like any visual unless it is hidden from the tab order, which Microsoft advises for decorative objects. A background shape at the top left of the page reads first. A divider line across the page starts a row that the visuals just below it join, when their top edges are as close to its own as a row allows, and since the line starts furthest left, it reads first in that row, ahead of the visuals beneath it.
- A page set up as a tooltip is not checked, whether its page.json marks it by its `type` or by its `pageBinding`. Microsoft describes report tooltips as appearing when readers hover over a visual, and says readers can't tab through a tooltip's content. Drillthrough pages and hidden pages are checked.
- Two visuals with the same tab order value, or at the same position, are no disagreement in whichever order they come.
- A page gets one finding, on the first place where the orders part, taking groups in tab order. Once that is fixed, lint again: the page may part from its layout further on.

## Links

- [Design Power BI reports for accessibility, including how to set the tab order in the Selection pane](https://learn.microsoft.com/power-bi/create-reports/desktop-accessibility-creating-reports#tab-order)
- [Consume Power BI reports by using accessibility features, including how keyboard users move through a page](https://learn.microsoft.com/power-bi/create-reports/desktop-accessibility-consuming-tools)
- [Group visuals in Power BI Desktop reports](https://learn.microsoft.com/power-bi/create-reports/desktop-grouping-visuals)
- [Create report tooltips in Power BI, including why readers can't tab through a tooltip page](https://learn.microsoft.com/power-bi/create-reports/desktop-tooltips#considerations-and-limitations)
- [What are those new buttons under tab order in Power BI?, Meagan Longoria's post on the Tab order view's buttons, including Have tab order match visual order](https://datasavvy.me/2021/11/28/what-are-those-new-buttons-under-tab-order-in-power-bi/)
- [Power BI: How to Fix Tab Order, the North Carolina Department of Information Technology's guidance on how Power BI sets a default tab order](https://it.nc.gov/digital-accessibility/web-content-accessibility/power-bi-how-fix-tab-order)
