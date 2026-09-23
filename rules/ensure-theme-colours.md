---
id: ENSURE_THEME_COLOURS
name: "Ensure charts use theme colours"
category: Report Design
severity: warning
scope: [Visual]
status: ported
layer: report
video:
sources:
  - https://github.com/NatVanG/fab-inspector/blob/main/Rules/Base-rules.json
---

# Ensure charts use theme colours

## What it checks

Visuals other than text boxes with a colour property set to a hex value instead of a theme colour, including a hex value inside a conditional formatting rule or a gradient.

Each finding names the visual, as `"Sales by category" on "Overview"` when it has a title and `clusteredBarChart (99a57e) on "Overview"` when it has none, and its detail counts the hex values, as `2 colours set to a hex value instead of a theme colour`. The line is the first of them.

## Example

The bars are set to a colour typed in by hand.

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
    },
    "objects": {
      "dataPoint": [
        {
          "properties": {
            "fill": { "solid": { "color": { "expr": { "Literal": { "Value": "'#1F4E79'" } } } } }
          }
        }
      ]
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
    },
    "objects": {
      "dataPoint": [
        {
          "properties": {
            "fill": { "solid": { "color": { "expr": { "ThemeDataColor": { "ColorId": 1, "Percent": 0 } } } } }
          }
        }
      ]
    }
  }
}
```

## Why it matters

A colour picked from the theme is stored as a position in the theme's palette, so when the report's theme changes, for a rebrand, a dark variant, or an organizational theme, the visual changes with it. A colour typed in or picked under More colors is stored as a fixed hex value and stays where it is. After a theme change the report shows some visuals in the new palette and some in the old, and every hand-set colour has to be found and changed one visual at a time. A palette chosen for contrast, or for readers with colour vision deficiency, also protects only the visuals that use it.

## How to fix it

In Power BI Desktop, select the visual, open the Format pane, find the colour (for this chart's bars, Bars, then Color), and pick a swatch from Theme colors at the top of the colour picker instead of More colors. To return a whole section of the Format pane to the theme, use Reset to default at the bottom of that section. If the report needs a colour its theme does not have, add it to the theme (View, then Themes, then Customize current theme) so that every visual can pick it from the palette. In visual.json, a theme colour is written as `ThemeDataColor`, with a `ColorId` for the swatch and a `Percent` for its shade, in place of the `Literal` hex value, as in the example.

## When to ignore it

A colour that must not change with the theme is set by hand on purpose: a partner's brand colour on their own logo card, say, or party colours on an election map. Before ignoring the finding on those visuals, consider whether the colour belongs in the theme instead, where every visual can use it and a later rebrand can still reach it.

## Quirks

- pbiplint looks for hex literals in colour properties only, where PBI Inspector matches a hex-looking pattern anywhere in the visual's JSON, including titles and text. A card titled "Store #102 sales", for example, holds `#102`, which reads as a three-digit hex colour, so PBI Inspector reports the card and pbiplint does not.
- Text boxes are not checked, as the source leaves them out, so a hex colour on a text box's text is not reported.
- Only visuals are read. A hex colour on a page's background or wallpaper, which page.json holds, is not reported.

## Links

- [Use report themes in Power BI](https://learn.microsoft.com/power-bi/create-reports/desktop-report-themes)
