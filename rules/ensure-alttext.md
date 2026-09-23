---
id: ENSURE_ALTTEXT
name: "Ensure alternativeText has been defined for all visuals"
category: Accessibility
severity: warning
scope: [Visual]
status: ported
layer: report
video:
sources:
  - https://github.com/NatVanG/fab-inspector/blob/main/Rules/Base-rules.json
---

# Ensure alternativeText has been defined for all visuals

## What it checks

Visuals other than shapes whose alt text is missing or empty. A visual group is checked by its own alt text, the one set on the group rather than on the visuals inside it.

Each finding names the visual, as `"Total Sales" on "Overview"` when it has a title and `cardVisual (3d9c80) on "Overview"` when it has none, and a group as `visualGroup (4e1a7b) on "Overview"`; its detail reads `no alt text`. When the visual or group has an empty alt text, the line is that property.

## Example

```pbir fires visual.json
{
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
```

```pbir fixed visual.json
{
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
    },
    "visualContainerObjects": {
      "general": [
        {
          "properties": {
            "altText": { "expr": { "Literal": { "Value": "'Total sales for the period and stores selected on this page'" } } }
          }
        }
      ]
    }
  }
}
```

## Why it matters

A screen reader announces a visual by its title and its type, then reads the alt text. With none, a reader who cannot see the page learns that there is a card or a bar chart and nothing about what it shows, so the insight the visual was built for never reaches them. Alt text also travels with the report: when a report is exported to PowerPoint, a visual without it gets the alt text "No alt text provided". The accessibility standards many organizations follow ask for a text alternative for every visual that carries information.

## How to fix it

In Power BI Desktop, select the visual, open the Format pane, expand General, and fill in Alt text at the bottom of the card; it takes up to 250 characters. Describe what a reader should take away rather than how the visual looks, since the screen reader already announces the title and type. For a figure that changes with the filters, the fx button beside Alt text binds it to a measure that writes the sentence. For a visual group, select the group itself, in the Selection pane for example, and fill in Alt text under General in its Format pane the same way. In visual.json, alt text is `altText` under `visualContainerObjects.general[0].properties` in the `visual` object, as in the example; a group's file has a `visualGroup` object in place of `visual`, and its alt text is `altText` under `objects.general[0].properties` there.

## When to ignore it

A purely decorative element, such as a background image, carries nothing for a screen reader to say. Take it out of the tab order in the Selection pane so screen readers skip it, and ignore the finding on it.

## Quirks

- Shapes are not checked, as the source leaves them out. Images, text boxes, and buttons are checked; Microsoft's accessibility checklist asks for a text box's contents to go in its alt text too, so screen readers can read them.
- The source ships this rule turned off, and pbiplint ships it on.
- Alt text bound to a measure counts as present. pbiplint does not evaluate the measure, so one that returns blank still counts.
- Alt text that is set but empty counts as missing.
- A visual group's own alt text counts: pbiplint reads it under `visualGroup`, where a group keeps it, and reports a group only when that alt text is missing or empty. PBI Inspector looks for a group's alt text where a visual keeps it, so it reports every group, with or without alt text of its own.

## Links

- [Design Power BI reports for accessibility](https://learn.microsoft.com/power-bi/create-reports/desktop-accessibility-creating-reports)
