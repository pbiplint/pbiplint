---
id: REDUCE_ADVANCED_FILTERS
name: "Reduce usage of Advanced filtering visuals by page"
category: Performance
severity: warning
scope: [Page]
status: ported
layer: report
video:
sources:
  - https://github.com/NatVanG/fab-inspector/blob/main/Rules/Base-rules.json
---

# Reduce usage of Advanced filtering visuals by page

## What it checks

Pages with more visuals carrying an Advanced filter with a condition applied than the threshold, 4 by default.

Each finding names the page, as `Page "Overview"`, and its detail gives the count, as `5 visuals with an Advanced filter applied, more than 4`.

## Example

The example lowers the threshold to 2 so that it stays short; the default is 4. Each visual filters Product Name on a text condition.

```json pbiplint.config.json
{
  "rules": {
    "REDUCE_ADVANCED_FILTERS": { "max": 2 }
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
          "name": "558e01743e8493038752",
          "field": { "Column": { "Expression": { "SourceRef": { "Entity": "Product" } }, "Property": "Product Name" } },
          "filter": {
            "Version": 2,
            "From": [{ "Name": "p", "Entity": "Product", "Type": 0 }],
            "Where": [
              {
                "Condition": {
                  "Contains": {
                    "Left": { "Column": { "Expression": { "SourceRef": { "Source": "p" } }, "Property": "Product Name" } },
                    "Right": { "Literal": { "Value": "'Bike'" } }
                  }
                }
              }
            ]
          },
          "type": "Advanced"
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
          "name": "c431003a4cd9ee1f8267",
          "field": { "Column": { "Expression": { "SourceRef": { "Entity": "Product" } }, "Property": "Product Name" } },
          "filter": {
            "Version": 2,
            "From": [{ "Name": "p", "Entity": "Product", "Type": 0 }],
            "Where": [
              {
                "Condition": {
                  "Contains": {
                    "Left": { "Column": { "Expression": { "SourceRef": { "Source": "p" } }, "Property": "Product Name" } },
                    "Right": { "Literal": { "Value": "'Helmet'" } }
                  }
                }
              }
            ]
          },
          "type": "Advanced"
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
          "name": "3c2ff552ab82859355b8",
          "field": { "Column": { "Expression": { "SourceRef": { "Entity": "Product" } }, "Property": "Product Name" } },
          "filter": {
            "Version": 2,
            "From": [{ "Name": "p", "Entity": "Product", "Type": 0 }],
            "Where": [
              {
                "Condition": {
                  "Contains": {
                    "Left": { "Column": { "Expression": { "SourceRef": { "Source": "p" } }, "Property": "Product Name" } },
                    "Right": { "Literal": { "Value": "'Bike'" } }
                  }
                }
              }
            ]
          },
          "type": "Advanced"
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
          "name": "558e01743e8493038752",
          "field": { "Column": { "Expression": { "SourceRef": { "Entity": "Product" } }, "Property": "Product Name" } },
          "filter": {
            "Version": 2,
            "From": [{ "Name": "p", "Entity": "Product", "Type": 0 }],
            "Where": [
              {
                "Condition": {
                  "Contains": {
                    "Left": { "Column": { "Expression": { "SourceRef": { "Source": "p" } }, "Property": "Product Name" } },
                    "Right": { "Literal": { "Value": "'Bike'" } }
                  }
                }
              }
            ]
          },
          "type": "Advanced"
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
          "name": "c431003a4cd9ee1f8267",
          "field": { "Column": { "Expression": { "SourceRef": { "Entity": "Product" } }, "Property": "Product Name" } },
          "filter": {
            "Version": 2,
            "From": [{ "Name": "p", "Entity": "Product", "Type": 0 }],
            "Where": [
              {
                "Condition": {
                  "Contains": {
                    "Left": { "Column": { "Expression": { "SourceRef": { "Source": "p" } }, "Property": "Product Name" } },
                    "Right": { "Literal": { "Value": "'Helmet'" } }
                  }
                }
              }
            ]
          },
          "type": "Advanced"
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
          "name": "3c2ff552ab82859355b8",
          "field": { "Column": { "Expression": { "SourceRef": { "Entity": "Product" } }, "Property": "Product Name" } },
          "type": "Advanced"
        }
      ]
    }
  }
}
```

The fix clears the table's filter: its card stays under Filters on this visual with nothing set, which the rule does not count (see Quirks).

## Why it matters

An Advanced filter is a condition rather than a list of values a reader picked, and a condition costs more to apply. A text condition such as contains or starts with is matched against every value in the column, and on a DirectQuery model it travels to the source inside each visual's query. A condition on a measure, such as showing only products whose sales are greater than 1,000, makes the visual work out which items pass before it can compute anything else. Each visual carrying its own condition repeats that work whenever the page opens or a slicer changes, and the conditions sit out of sight in each visual's filter card, so a reader comparing two visuals on the page cannot see why their totals disagree.

## How to fix it

Where a condition picks out a group the report keeps coming back to, such as bikes, put the group in the model: add a column in Power Query (Transform data, then Add Column) that names the group for each product, and filter that column with Basic filtering, which picks values instead of matching text. Where several visuals share one condition, state it once in the Filters pane under Filters on this page, where a reader can see it, and remove it from each visual. A condition nobody needs any more can be cleared with the eraser on its filter card. In visual.json, an applied Advanced filter is an entry with `"type": "Advanced"` in `filterConfig.filters` that carries a `filter` object; without the `filter` object, as in the fixed example, the entry is a card with nothing set.

## When to ignore it

A condition on a short column of an Import model, such as a category name, is cheap to apply, and so is a measure condition over a few dozen items. A page built to compare one measure under different conditions, visual by visual, needs its filters where they are. Check the page with Performance Analyzer in Power BI Desktop, and ignore the finding when the filtered visuals come back quickly.

## Quirks

- pbiplint counts only Advanced filters with a condition applied, where PBI Inspector also counts an Advanced filter with nothing set, such as a slicer's or one Power BI Desktop writes for a visual's own fields.
- The count is of visuals, not filters: a visual with two Advanced filters counts once. Filters on the page or on the whole report are not counted.

## Related rules

- `REDUCE_TOPN_FILTERS` is the same count for Top N filters, and one visual can count toward both.

## Links

- [Add a filter to a report in Power BI](https://learn.microsoft.com/power-bi/create-reports/power-bi-report-add-filter)
- [Types of filters in Power BI reports, including the automatic filters Desktop adds for a visual's fields](https://learn.microsoft.com/power-bi/create-reports/power-bi-report-filter-types)
- [DirectQuery model guidance in Power BI Desktop, including what a measure filter sends to the source](https://learn.microsoft.com/power-bi/guidance/directquery-model-guidance)
