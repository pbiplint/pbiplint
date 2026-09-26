---
id: SLICER_SEARCH_SAVED
name: "Slicer saved with a search term"
category: Report Design
severity: warning
scope: [Visual]
status: builtin
layer: report
video:
sources:
---

# Slicer saved with a search term

## What it checks

Slicers saved with a term in their search box: any visual whose visual.json holds a `selfFilter` with a condition under `objects.general`, which is where Power BI Desktop's saved files keep the text typed in a slicer's search box.

Each finding names the slicer, as `slicer (5d2e8c) on "Overview"`, or as `"City" on "Overview"` when it has a title, at the line of the `selfFilter` in its visual.json. Its detail quotes the term, as `opens with the search term "spring" saved`, when the search is one piece of text pbiplint can read, and reads `opens with a search term saved` otherwise. It names no column, since the term can sit on a column the slicer does not show.

## Example

```pbir fires visual.json
{
  "$schema": "https://developer.microsoft.com/json-schemas/fabric/item/report/definition/visualContainer/2.8.0/schema.json",
  "name": "5d2e8c41b07a9f36e1c4",
  "position": { "x": 40, "y": 40, "z": 1000, "height": 72, "width": 260, "tabOrder": 1000 },
  "visual": {
    "visualType": "slicer",
    "query": {
      "queryState": {
        "Values": {
          "projections": [
            {
              "field": { "Column": { "Expression": { "SourceRef": { "Entity": "Customer" } }, "Property": "City" } },
              "queryRef": "Customer.City",
              "nativeQueryRef": "City",
              "active": true
            }
          ]
        }
      }
    },
    "objects": {
      "data": [
        { "properties": { "mode": { "expr": { "Literal": { "Value": "'Dropdown'" } } } } }
      ],
      "general": [
        {
          "properties": {
            "selfFilterEnabled": { "expr": { "Literal": { "Value": "true" } } },
            "selfFilter": {
              "filter": {
                "Version": 2,
                "From": [{ "Name": "c", "Entity": "Customer", "Type": 0 }],
                "Where": [
                  {
                    "Condition": {
                      "Contains": {
                        "Left": { "Column": { "Expression": { "SourceRef": { "Source": "c" } }, "Property": "City" } },
                        "Right": { "Literal": { "Value": "'spring'" } }
                      }
                    },
                    "Annotations": { "PowerBI.MParameterBehavior": 1 }
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
  "name": "5d2e8c41b07a9f36e1c4",
  "position": { "x": 40, "y": 40, "z": 1000, "height": 72, "width": 260, "tabOrder": 1000 },
  "visual": {
    "visualType": "slicer",
    "query": {
      "queryState": {
        "Values": {
          "projections": [
            {
              "field": { "Column": { "Expression": { "SourceRef": { "Entity": "Customer" } }, "Property": "City" } },
              "queryRef": "Customer.City",
              "nativeQueryRef": "City",
              "active": true
            }
          ]
        }
      }
    },
    "objects": {
      "data": [
        { "properties": { "mode": { "expr": { "Literal": { "Value": "'Dropdown'" } } } } }
      ],
      "general": [
        {
          "properties": {
            "selfFilterEnabled": { "expr": { "Literal": { "Value": "true" } } }
          }
        }
      ]
    }
  }
}
```

The City slicer was saved with spring typed in its search box, and the finding reads `slicer (5d2e8c) on "Overview"` with `opens with the search term "spring" saved`. The fix takes the `selfFilter` out of `objects.general` and leaves the slicer's other settings as they were.

## Why it matters

A slicer's search is there to find values in a long list. You open it with the ellipsis (...) at the slicer's top right and then Search, or by selecting the slicer and pressing Ctrl+F, and as you type, the slicer "instantly filters to show only matching entries," in Microsoft's words. Saved with the report, the term stays: checked in Power BI Desktop and the Power BI service, it is in the slicer's search box when the report is reopened in Power BI Desktop and when a reader opens it in the service, and in both the slicer's list is narrowed to the values that match it. Whoever reads the report in the service, or opens it next in Power BI Desktop, sees a slicer listing only some of its values, under a term they did not type, and can take that list for all there is.

The term narrows only the slicer's own list; whether the other visuals are filtered depends on what is selected in the slicer. Even so, this rule is a warning and `SLICER_SELECTION_SAVED`, which reports a saved selection, is info, because a saved selection is usually easy to spot, while a leftover term, often a partial one, is harder to spot and so more likely to slip by.

Most saved terms stand alone. Of the 41 slicers found saved with a search term in public Power BI projects saved by Power BI Desktop, 30 had nothing selected, only the term.

## How to fix it

In Power BI Desktop, select the slicer and delete the text in its search box, or select the slicer's eraser, which clears the box, then save the report. Checked in Power BI Desktop and the Power BI service, the box then stays empty when the report is reopened. Reset to default in the service returns a reader to the report as it was published, saved term included, so the fix belongs in the saved report.

In visual.json, the term is the `selfFilter` property in the slicer's `general` entry under `objects`: remove it, as the example does, and leave the rest of the entry as it is. That is an edit to the saved file, and `selfFilter` is the only property this rule reads.

## When to ignore it

A report meant to open with a long list already narrowed to a starting term, where that is a deliberate choice and whoever opens it knows the list is narrowed. Otherwise there is rarely a reason to keep a saved term.

## Quirks

- The term can sit on a column the slicer does not show: 9 of the 41 slicers found saved with a term had it on a column other than the one they show. The finding is the same either way, which is why its detail names no column.
- A term is read by where it sits, not by the visual's type, as a selection is for `SLICER_SELECTION_SAVED`, so a custom slicer from AppSource that keeps a search term in the same `selfFilter` is reported the same way as the slicers built into Power BI.
- A hidden slicer is reported like a visible one.

## Related rules

- `SLICER_SELECTION_SAVED` reports a selection saved on the slicer. A slicer saved with both is reported by both rules, and one saved with a term alone by this rule only.

## Links

- [Slicer visual in Power BI, including how to search in a slicer](https://learn.microsoft.com/power-bi/visuals/power-bi-visualization-slicer-visual#search-in-slicers)
