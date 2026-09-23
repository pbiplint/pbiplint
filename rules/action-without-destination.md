---
id: ACTION_WITHOUT_DESTINATION
name: "Action has no destination"
category: Report Design
severity: warning
scope: [Visual]
status: builtin
layer: report
video:
sources:
---

# Action has no destination

## What it checks

Buttons, shapes, and images whose page navigation, drillthrough, or bookmark action is switched on but has no destination: the property that holds the destination for the action's type is missing from visual.json or empty.

Each finding names the visual, as `actionButton (e4b7a1) on "Overview"`, or as `"Go to detail" on "Overview"` when it has a title. It sits at the line of the empty destination property in its visual.json, or, when there is no such property, at the line where the action's `properties` open, and its detail names the action: `Page navigation action has no destination`, `Drillthrough action has no destination`, or `Bookmark action has no destination`.

## Example

```pbir fires tree.json
{
  "definition/pages/pages.json": {
    "$schema": "https://developer.microsoft.com/json-schemas/fabric/item/report/definition/pagesMetadata/1.0.0/schema.json",
    "pageOrder": ["p1", "7c41d9e0a2b35f18c6d4"],
    "activePageName": "p1"
  },
  "definition/pages/7c41d9e0a2b35f18c6d4/page.json": {
    "$schema": "https://developer.microsoft.com/json-schemas/fabric/item/report/definition/page/2.1.0/schema.json",
    "name": "7c41d9e0a2b35f18c6d4",
    "displayName": "Detail",
    "displayOption": "FitToPage",
    "height": 720,
    "width": 1280
  },
  "definition/pages/p1/visuals/e4b7a1c9d3f2068b5a17/visual.json": {
    "$schema": "https://developer.microsoft.com/json-schemas/fabric/item/report/definition/visualContainer/2.8.0/schema.json",
    "name": "e4b7a1c9d3f2068b5a17",
    "position": { "x": 1100, "y": 20, "z": 1000, "height": 40, "width": 140, "tabOrder": 1000 },
    "visual": {
      "visualType": "actionButton",
      "visualContainerObjects": {
        "visualLink": [
          {
            "properties": {
              "show": { "expr": { "Literal": { "Value": "true" } } },
              "type": { "expr": { "Literal": { "Value": "'PageNavigation'" } } }
            }
          }
        ]
      }
    }
  }
}
```

```pbir fixed tree.json
{
  "definition/pages/pages.json": {
    "$schema": "https://developer.microsoft.com/json-schemas/fabric/item/report/definition/pagesMetadata/1.0.0/schema.json",
    "pageOrder": ["p1", "7c41d9e0a2b35f18c6d4"],
    "activePageName": "p1"
  },
  "definition/pages/7c41d9e0a2b35f18c6d4/page.json": {
    "$schema": "https://developer.microsoft.com/json-schemas/fabric/item/report/definition/page/2.1.0/schema.json",
    "name": "7c41d9e0a2b35f18c6d4",
    "displayName": "Detail",
    "displayOption": "FitToPage",
    "height": 720,
    "width": 1280
  },
  "definition/pages/p1/visuals/e4b7a1c9d3f2068b5a17/visual.json": {
    "$schema": "https://developer.microsoft.com/json-schemas/fabric/item/report/definition/visualContainer/2.8.0/schema.json",
    "name": "e4b7a1c9d3f2068b5a17",
    "position": { "x": 1100, "y": 20, "z": 1000, "height": 40, "width": 140, "tabOrder": 1000 },
    "visual": {
      "visualType": "actionButton",
      "visualContainerObjects": {
        "visualLink": [
          {
            "properties": {
              "show": { "expr": { "Literal": { "Value": "true" } } },
              "type": { "expr": { "Literal": { "Value": "'PageNavigation'" } } },
              "navigationSection": { "expr": { "Literal": { "Value": "'7c41d9e0a2b35f18c6d4'" } } }
            }
          }
        ]
      }
    }
  }
}
```

The report has two pages, Overview and Detail. The button on Overview has its action switched on and set to page navigation, but no page was ever picked, so its action has no `navigationSection`, and the finding reads `actionButton (e4b7a1) on "Overview"` with `Page navigation action has no destination`. The fix picks Detail, which adds `navigationSection` holding the `name` in Detail's page.json.

## Why it matters

An action switched on with a type says the button takes readers somewhere. Microsoft describes page navigation as taking the reader to a different page in the report, drillthrough as taking them to a drillthrough page filtered to their selection, and a bookmark action as presenting the report page associated with a bookmark. With no destination, the button is set up to do one of those things and names nowhere to do it, and Microsoft does not document what such a button does when a reader selects it. Unless the button is there only for its tooltip, it is work left half done: a button whose page, drillthrough page, or bookmark was never picked, or was cleared, while the action that promises one stayed on.

## How to fix it

In Power BI Desktop, select the button, and on the Button tab of the Format button pane, expand Action. With Type set to the action you meant, pick the page under Destination, the target drillthrough page for a drillthrough action, or, for a bookmark action, the bookmark under Bookmarks. Shapes and images carry actions too; select the one the finding names. To test the button while you edit, hold Ctrl and select it. If the button should not take readers anywhere, turn Action off.

In visual.json, the action is an entry of `visualLink` under `visual.visualContainerObjects`. Add the destination property that belongs to its `type` beside it: `navigationSection` for `'PageNavigation'`, `drillthroughSection` for `'Drillthrough'`, or `bookmark` for `'Bookmark'`, holding the page's or bookmark's `name` in single quotes inside `expr.Literal.Value`, as the example does. That is the identifier in its page.json or bookmark file, not its display name. To switch the action off instead, set `show` to `false`, the way Power BI Desktop's saved files record an action that is turned off.

## When to ignore it

A button kept for its tooltip. Microsoft places a button's Tooltip under Action, among the same settings as the destination, and does not say whether the tooltip still shows once Action is turned off, so a button made only to show a tooltip may need its action left on. Among Power BI Desktop's saved files, Microsoft's own FinOps report has page navigation buttons with an empty destination and a tooltip each. Before ignoring the finding on such a button, turn Action off in Power BI Desktop and hover over the button: if the tooltip still shows, leave the action off and the finding clears. Any other button whose action names no destination is unfinished, so pick its destination or turn the action off.

## Quirks

- Only page navigation, drillthrough, and bookmark actions are checked. Back, Web URL, Q&A, Apply all slicers, Clear all slicers, and Data function actions are not, even with nothing set.
- An action that is turned off, saved with `show` set to `false`, is not checked.
- A destination set with conditional formatting, the fx button beside Destination, counts as a destination, and pbiplint does not evaluate the measure or column behind it.
- Only the destination property that belongs to the action's type counts. Power BI Desktop's saved files keep the destination of an earlier type when the type is changed, so a page navigation action that still carries a `bookmark` from when it was a bookmark action, and no `navigationSection`, is reported here.
- An action entry with no type, which Power BI Desktop's saved files sometimes hold, is not checked.
- A destination that names a page or bookmark the report does not have is not reported here; `BROKEN_ACTION_TARGET` reports it.
- Every visual that carries an action is checked, hidden or not, and the action's type is read without regard to case.

## Related rules

- `BROKEN_ACTION_TARGET` fires on the same object, a button's action, when its destination names a page or bookmark the report does not have rather than nothing.

## Links

- [Create and configure buttons in Power BI reports, including the actions a button can take and where its Tooltip sits](https://learn.microsoft.com/power-bi/create-reports/desktop-buttons)
- [Create report bookmarks in Power BI, including how to assign a bookmark to a button](https://learn.microsoft.com/power-bi/create-reports/desktop-bookmarks)
- [Drillthrough in Power BI reports, including drillthrough buttons](https://learn.microsoft.com/power-bi/create-reports/desktop-drillthrough)
