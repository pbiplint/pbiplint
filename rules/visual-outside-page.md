---
id: VISUAL_OUTSIDE_PAGE
name: "Visual extends past the page"
category: Report Design
severity: warning
scope: [Visual]
status: builtin
layer: report
video:
sources:
---

# Visual extends past the page

## What it checks

Visuals whose box runs past the right or bottom edge of their page by a pixel or more: `x` plus `width` beyond the page's width, or `y` plus `height` beyond its height.

Each finding names the visual, as `cardVisual (3d9c80) on "Overview"`, or as `"Sales by region" on "Overview"` when it has a title, at the `position` line of its visual.json, and its detail gives the overhang past each edge in whole pixels, rounded: `120 px past the right edge`, or `70 px past the right edge, 30 px past the bottom edge`.

## Example

```pbir fires visual.json
{
  "$schema": "https://developer.microsoft.com/json-schemas/fabric/item/report/definition/visualContainer/2.8.0/schema.json",
  "name": "3d9c80144abca427957c",
  "position": { "x": 1200, "y": 90, "z": 1000, "height": 105, "width": 200, "tabOrder": 1000 },
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
```

```pbir fixed visual.json
{
  "$schema": "https://developer.microsoft.com/json-schemas/fabric/item/report/definition/visualContainer/2.8.0/schema.json",
  "name": "3d9c80144abca427957c",
  "position": { "x": 1080, "y": 90, "z": 1000, "height": 105, "width": 200, "tabOrder": 1000 },
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
```

The page is 1280 pixels wide. The card starts at 1200 and is 200 wide, so it ends at 1400, and the finding reads `cardVisual (3d9c80) on "Overview"` with `120 px past the right edge`. The fix moves it to 1080, where its right edge meets the page's.

## Why it matters

A report page has the width and height its canvas settings give it, and Microsoft's schema for visual.json describes every visual's box as lying within its page. A visual that runs past the right or bottom edge has part of its box off the page, and whatever it draws there, the last column of a table, the end of an axis, the figure on a card, is off the page with it, outside the area the report was laid out to show.

## How to fix it

In Power BI Desktop, select the visual, open the Format pane, select the General tab, and under Properties change its Position, the horizontal and vertical position in pixels from the top-left corner of the canvas, or its Size, the height and width in pixels, until it ends inside the page. If the page should be larger instead, change its size: with nothing selected on the page, the Visualizations pane shows Format page options, and under Canvas settings you can choose a larger Size, or the Custom type to set the height and width in pixels yourself.

In visual.json the box is `position`: bring `x` or `y` back, or shrink `width` or `height`, as the example does with `x`. For a visual inside a group, move or resize the group.

## When to ignore it

A decorative shape or image sized to run past the edge on purpose, such as a background band meant to reach the page's border, loses nothing a reader needs; ignore the finding on it. For a visual that shows data there is no legitimate exception.

## Quirks

- The position visual.json records for a visual inside a group is relative to the group, not to the page, so it can differ from the Position the Format pane shows, which is measured from the top-left corner of the canvas. pbiplint therefore checks the visuals that sit directly on the page and the top-level groups. A group past the edge is one finding, on the group. The visuals inside it are not checked, nor is a group inside another group.
- An edge counts once the box passes it by a whole pixel. A box that ends a fraction of a pixel past the edge, as a position stored with decimals can, is not reported, and the detail rounds the overhang to whole pixels.
- Only the right and bottom edges are checked. A visual that starts left of or above the page, at a negative `x` or `y`, is not reported.
- A page whose page.json records no width or height is not checked, and neither is a page with no page.json in the input.
- A hidden visual is checked like any other.

## Related rules

- `ENSURE_PAGES_DO_NOT_SCROLL_VERTICALLY` reports a visible page taller than its limit, 720 pixels by default, so making a page taller to fit a visual past its bottom edge can trip it.

## Links

- [Format pane General tab overview, including a visual's Size and Position settings](https://learn.microsoft.com/power-bi/visuals/power-bi-visualization-format-pane-overview)
- [Apply page size and settings in a Power BI report, including Canvas settings](https://learn.microsoft.com/power-bi/create-reports/power-bi-report-display-settings)
