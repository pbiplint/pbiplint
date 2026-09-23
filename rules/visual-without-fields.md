---
id: VISUAL_WITHOUT_FIELDS
name: "Data visual with no fields"
category: Report Design
severity: warning
scope: [Visual]
status: builtin
layer: report
video:
sources:
---

# Data visual with no fields

## What it checks

Data visuals with no field in any of their wells. Every visual type counts as a data visual, custom visuals included, except visual groups and the types that take no fields by design, such as shapes, text boxes, images, and buttons.

Each finding names the visual, as `cardVisual (3d9c80) on "Overview"`, or as `"Sales by region" on "Overview"` when it has a title, at the `visualType` line of its visual.json, and its detail reads `no fields bound`.

The types that are never reported are shapes (`shape`, and the older `basicShape`), text boxes (`textbox`), images (`image`), buttons (`actionButton`), the page and bookmark navigators (`pageNavigator`, `bookmarkNavigator`), the Q&A visual (`qnaVisual`), the narrative visual (`aiNarratives`), the metrics scorecard visual (`scorecard`), and the animated number visual (`animatedNumber`), none of which has a well to fill. Two more have wells whose fields are optional, so they are not reported either: the paginated report visual (`rdlVisual`), which can use the paginated report's default parameters in place of fields, and the Power Automate visual (`FlowVisual_C29F1DCC_81F5_4973_94AD_0517D44CC06A`), whose fields serve only as optional inputs to its flow.

## Example

```pbir fires visual.json
{
  "$schema": "https://developer.microsoft.com/json-schemas/fabric/item/report/definition/visualContainer/2.8.0/schema.json",
  "name": "3d9c80144abca427957c",
  "position": { "x": 40, "y": 90, "z": 1000, "height": 105, "width": 150, "tabOrder": 1000 },
  "visual": {
    "visualType": "cardVisual"
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
    }
  }
}
```

The card was placed on the page and never given a field, so its file has no `query` at all and the finding reads `cardVisual (3d9c80) on "Overview"` with `no fields bound`. The fix puts Total Sales in the card's Data well.

## Why it matters

Microsoft's guidance divides what sits on a report page into visuals, which are visualizations of the model's data, and elements, which provide visual interest but don't use that data: text boxes, buttons, shapes, and images. A visual shows the fields in its wells, so a chart, card, table, or slicer with none has no data to show. Readers get a space on the page that shows nothing, perhaps under a title or a border that suggests it should, and the next author gets a visual whose purpose nobody wrote down. Usually it is a visual that was added and never finished, or one left in place after its fields were removed.

## How to fix it

Decide what the visual was meant to show. In Power BI Desktop, select it and drag those fields from the Data pane into its wells in the Visualizations pane; the wells depend on the visual's type, such as Axis, Legend, and Values for a bar chart. If the page does not need the visual, delete it.

In visual.json, a visual's fields are the `projections` under `query.queryState`, one entry per field, grouped under the name of the well that holds it, as the card's `Data` well does in the example. The well names differ from one visual type to the next, so adding fields in Desktop is the surer route.

## When to ignore it

A custom visual that takes no fields, such as one that only draws a logo or a menu, is not a data visual, but pbiplint cannot tell that from the file and counts it as one. Check the Visualizations pane with the visual selected: if it offers no wells to fill, ignore the finding on it.

## Quirks

- It counts the entries in the visual's wells. A field the visual names only in its formatting, such as a title bound to a measure or a conditional format, or only in its sort, does not count, so such a visual is still reported.
- A visual calculation in a well counts as a field, though it names nothing in the model.
- Slicers are data visuals here, so a slicer with no field is reported.
- A hidden visual is checked like a visible one.
- A visual.json with neither a `visual` nor a `visualGroup` holds no visual to judge, and is not checked.

## Related rules

- `HIDDEN_VISUAL_WITH_FIELDS` reports the opposite case, a hidden visual with fields that nothing shows.
- `REDUCE_VISUALS_ON_PAGE` counts a visible chart, card, or table whether or not it has fields, so an empty one still counts toward that rule's limit.

## Links

- [Tour the Power BI report editor, including the buckets, or wells, that hold a visual's fields](https://learn.microsoft.com/power-bi/create-reports/service-the-report-editor-take-a-tour)
- [Add visualizations to a Power BI report by selecting fields or dragging them into the Visualizations pane](https://learn.microsoft.com/power-bi/visuals/power-bi-report-add-visualizations-i)
- [Design Power BI reports, the training module that tells a report's visuals from its elements](https://learn.microsoft.com/training/modules/power-bi-effective-reports/1-introduction)
- [Create and use the paginated report visual, including its default parameters](https://learn.microsoft.com/power-bi/visuals/paginated-report-visual)
- [Create a Power Automate visual for Power BI, with its optional data fields](https://learn.microsoft.com/power-bi/create-reports/power-bi-automate-visual)
