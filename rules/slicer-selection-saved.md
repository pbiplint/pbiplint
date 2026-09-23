---
id: SLICER_SELECTION_SAVED
name: "Slicer saved with a selection"
category: Report Design
severity: info
scope: [Visual]
status: builtin
layer: report
video:
sources:
---

# Slicer saved with a selection

## What it checks

Slicers saved with a selection, so that the report opens with it applied: a slicer, button slicer, list slicer, input slicer, or `filterSlicer` whose visual.json holds a `filter` with a condition under `objects.general`, where Power BI Desktop saves the selection. It is info without a policy, and a warning when the project's policy expects no saved selections.

Each finding names the slicer, as `slicer (096193) on "Overview"`, or as `"Region" on "Overview"` when it has a title, at the line of the selection's `filter` in its visual.json, and its detail reads `opens with this selection applied`.

## Example

Without a policy the finding is info. The config below applies to both documents and sets the policy, `expect` set to `none`, which raises the finding to a warning.

```json pbiplint.config.json
{
  "rules": {
    "SLICER_SELECTION_SAVED": { "expect": "none" }
  }
}
```

```pbir fires visual.json
{
  "$schema": "https://developer.microsoft.com/json-schemas/fabric/item/report/definition/visualContainer/2.8.0/schema.json",
  "name": "096193a525ec376a0147",
  "position": { "x": 432, "y": 222, "z": 10000, "height": 62, "width": 416, "tabOrder": 10000 },
  "visual": {
    "visualType": "slicer",
    "query": {
      "queryState": {
        "Values": {
          "projections": [
            {
              "field": { "Column": { "Expression": { "SourceRef": { "Entity": "Sales" } }, "Property": "Region" } },
              "queryRef": "Sales.Region",
              "nativeQueryRef": "Region",
              "active": true
            }
          ]
        }
      }
    },
    "objects": {
      "data": [
        { "properties": { "mode": { "expr": { "Literal": { "Value": "'Basic'" } } } } }
      ],
      "general": [
        {
          "properties": {
            "orientation": { "expr": { "Literal": { "Value": "1D" } } },
            "filter": {
              "filter": {
                "Version": 2,
                "From": [{ "Name": "s", "Entity": "Sales", "Type": 0 }],
                "Where": [
                  {
                    "Condition": {
                      "In": {
                        "Expressions": [
                          { "Column": { "Expression": { "SourceRef": { "Source": "s" } }, "Property": "Region" } }
                        ],
                        "Values": [[{ "Literal": { "Value": "'West'" } }]]
                      }
                    }
                  }
                ]
              }
            }
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
  "name": "096193a525ec376a0147",
  "position": { "x": 432, "y": 222, "z": 10000, "height": 62, "width": 416, "tabOrder": 10000 },
  "visual": {
    "visualType": "slicer",
    "query": {
      "queryState": {
        "Values": {
          "projections": [
            {
              "field": { "Column": { "Expression": { "SourceRef": { "Entity": "Sales" } }, "Property": "Region" } },
              "queryRef": "Sales.Region",
              "nativeQueryRef": "Region",
              "active": true
            }
          ]
        }
      }
    },
    "objects": {
      "data": [
        { "properties": { "mode": { "expr": { "Literal": { "Value": "'Basic'" } } } } }
      ],
      "general": [
        {
          "properties": {
            "orientation": { "expr": { "Literal": { "Value": "1D" } } }
          }
        }
      ]
    }
  }
}
```

The Region slicer was saved with West selected, so every reader starts with the page filtered to the West region, and the finding reads `slicer (096193) on "Overview"` with `opens with this selection applied`. The fix clears the selection, which takes the `filter` out of `objects.general` and leaves the slicer's other settings as they were.

## Why it matters

A slicer narrows what the other visuals show, and its selection is saved with the report: "The slicer saves the selected values," in the words of Microsoft's troubleshooting guidance, which goes on to warn: "Report authors should avoid saving and publishing reports with selected items that might be inappropriate for certain users, particularly in environments that use row-level security (RLS)." It recommends clearing any selection that shouldn't apply to everyone before saving and distributing a report, and points out that a saved selection can stop being relevant or appropriate when the data or a user's permissions change.

A saved selection is also what readers come back to. Microsoft says readers can always return to the state the author published with the Reset to default button, so a value left selected while the author checked one region becomes every reader's starting point, and the state Reset to default restores.

## How to fix it

In Power BI Desktop, clear the slicer and save the report in that state, as Microsoft recommends before publishing: select the slicer's Clear button, an eraser icon, then save. On the original slicer the Clear button sits in the Slicer header and shows when you hover over it; on the Slicer (new) visuals it sits in the Visual container header, and it is not there while that header is turned off, so turn the header on first. Check any bookmark that captures the slicer as well, since a bookmark saves slicer state of its own.

In visual.json, the selection is the `filter` property under `objects.general[0].properties`: remove it, as the example does, and leave the rest of `general` as it is.

## When to ignore it

A default selection readers are meant to start from, which Microsoft endorses: "you might intentionally save a default selection so that report consumers start with a specific set of filters." Examples are a relative date slicer set to this month, a button slicer or list slicer with Force selection on, which Microsoft says keeps one item selected at all times, and a field parameter slicer saved on the field the visuals should open with. Microsoft singles out range slicers, and date range slicers above all, as best saved cleared, so a saved date range deserves a second look. Without a policy the finding is info, a prompt to check each selection; with `expect` set to `none`, ignore it on the slicers whose default is deliberate.

## Quirks

- A filter on the slicer in the Filters pane, which visual.json keeps in the slicer's `filterConfig`, is a visual-level filter, not the slicer's selection, and is not reported.
- Select all saves no selection. Microsoft says it produces the same filtering result as clearing the slicer, and that Power BI does not store each item as a selection. Clearing items after Select all is a selection, though: Power BI applies an is not filter holding the cleared items, and that is reported.
- In Power BI Desktop's saved files, a range or relative date slicer saves its value the same way as a list of picked items, so it is reported the same way.
- Each synced copy of a slicer is reported on its own page, since Power BI Desktop's saved files write the selection into every copy.
- A hidden slicer is reported like a visible one. Microsoft notes that slicers continue to filter a report page whether or not they are visible.
- A slicer from AppSource is a custom visual, not one of Microsoft's slicers, and is not recognised.
- Only the slicer as saved in visual.json is read. A bookmark that captures a different selection is not.

## Related rules

- `FILTERS_PANE_STATE` is the other policy rule about the state a report opens in, the Filters pane open or closed.

## Links

- [Slicers overview in Power BI, including Select all and synced slicers](https://learn.microsoft.com/power-bi/visuals/power-bi-visualization-slicers)
- [Troubleshoot visualizations in Power BI, including the Clear button and saved slicer selections](https://learn.microsoft.com/power-bi/visuals/power-bi-visualization-troubleshoot#slicers-and-filters)
- [Create and use a button slicer, including Force selection](https://learn.microsoft.com/power-bi/visuals/power-bi-visualization-button-slicer)
- [Use field parameters to let report readers change visuals](https://learn.microsoft.com/power-bi/create-reports/power-bi-field-parameters)
