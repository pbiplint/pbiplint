---
id: BROKEN_ACTION_TARGET
name: "Action points at nothing"
category: Error Prevention
severity: error
scope: [Visual]
status: builtin
layer: report
video:
sources:
---

# Action points at nothing

## What it checks

Buttons, shapes, and images whose page navigation, drillthrough, or bookmark action names a page or a bookmark the report does not have, matched against the `name` in each page.json and bookmark file.

Each finding names the visual, as `actionButton (e4b7a1) on "Overview"`, or as `"Go to detail" on "Overview"` when it has a title, at the line of the action's destination in its visual.json, and its detail names the action and the destination it could not find: `Page navigation action points at page "a91c3e5f7d2b4086e1c9", which does not exist`, `Drillthrough action points at page "a91c3e5f7d2b4086e1c9", which does not exist`, or `Bookmark action points at bookmark "Bookmark067aa4e496527c92a256", which does not exist`.

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
              "type": { "expr": { "Literal": { "Value": "'PageNavigation'" } } },
              "navigationSection": { "expr": { "Literal": { "Value": "'a91c3e5f7d2b4086e1c9'" } } }
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

The report has two pages, Overview and Detail. The button on Overview navigates to a page named `a91c3e5f7d2b4086e1c9`, which neither page is, as a visual.json copied in from another report can still name that report's page, so the finding reads `actionButton (e4b7a1) on "Overview"` with `Page navigation action points at page "a91c3e5f7d2b4086e1c9", which does not exist`. The fix points it at Detail by the `name` in Detail's page.json.

## Why it matters

An action is what a button is for. Microsoft describes page navigation as taking the reader to a different page in the report, drillthrough as taking them to a drillthrough page filtered to their selection, and a bookmark action as presenting the report page associated with a bookmark defined for the report. When the page or bookmark the action names is not in the report, the button offers readers a destination the report does not have: the detail page, the next step of a guided story, or the entry in a menu of pages it was placed there to lead to is not there to reach.

Destinations are stored by `name`, a page's or bookmark's identifier, rather than by the name readers see, so they break when identifiers change underneath them. Microsoft lists copying pages, visuals, and bookmarks between reports among the scenarios the PBIR format makes possible, and a copied visual.json keeps the destination it had in the report it came from. Microsoft also warns that renaming the `name` property in a PBIR file might break references inside the report, and a button's destination is one of them.

## How to fix it

In Power BI Desktop, select the button, and on the Button tab of the Format button pane, expand Action. Check that Type is the action you meant, then pick the page under Destination, the target drillthrough page for a drillthrough action, or, for a bookmark action, the bookmark under Bookmarks. Shapes and images carry actions too; select the one the finding names. To test the button while you edit, hold Ctrl and select it. If the button should not do anything any more, turn Action off or delete the button.

In visual.json, the action is an entry of `visualLink` under `visual.visualContainerObjects`, and its destination is the property that belongs to its `type`: `navigationSection` for `'PageNavigation'`, `drillthroughSection` for `'Drillthrough'`, and `bookmark` for `'Bookmark'`. Set it to the `name` of the page or bookmark, in single quotes inside `expr.Literal.Value` as the example shows. That is the identifier in its page.json or bookmark file, not its display name. Microsoft's PBIR documentation says pages and bookmarks are named with a 20-character identifier by default, used as their folder or file name as well, and that Power BI Desktop can copy an object's name to the clipboard once Copy object names when right clicking on report objects is turned on in its report settings.

## When to ignore it

There is no legitimate case. An action whose destination is not in the report has nowhere in it to take readers, so point it at a page or bookmark that exists, or turn the action off if the button is meant to do nothing.

## Quirks

- Only the destination that belongs to the action's type is read. Power BI Desktop's saved files keep the destination of an earlier type when the type is changed, so a page navigation action can still carry a `bookmark` from when it was a bookmark action, often one that names nothing the report has. That leftover is not what the button does, and it is not reported.
- An action that is turned off, saved with `show` set to `false`, is not checked.
- A destination set with conditional formatting, the fx button beside Destination, is not checked. Microsoft documents a page navigation destination based on a measure, or on a column of page names picked in a slicer, and pbiplint does not evaluate either, so it cannot know which pages the button reaches.
- An action with no destination set, empty or absent, is not reported here: `ACTION_WITHOUT_DESTINATION` reports it.
- Back, Web URL, Q&A, Apply all slicers, Clear all slicers, and Data function actions are not checked.
- The page navigator and the bookmark navigator are not checked, and neither are the page and bookmark names they keep in their settings, which in Power BI Desktop's saved files sometimes name pages and bookmarks the report does not have. The report page a visual uses as its tooltip is not checked either.
- A drillthrough action is checked only for whether the page it names exists, not for whether that page is set up as a drillthrough page.
- Every visual that carries an action is checked, hidden or not, and the action's type is read without regard to case.
- A page or a bookmark whose own file cannot be read, such as a page.json or a bookmark file holding merge-conflict markers, is not reported missing, because pbiplint does not guess what a file it could not read says. The page is known by its folder name and the bookmark by its file name, `<name>.bookmark.json`, which Microsoft's PBIR documentation says are a page's and a bookmark's `name` by default, so an action whose destination names one of them is not reported. The file's own `PARSE_ISSUE` finding names it.

## Related rules

- `ACTION_WITHOUT_DESTINATION` fires on the same object, a button's action, when the action names no destination at all rather than one the report does not have.
- `BROKEN_BOOKMARK_REFERENCE` clears with the same fix when a bookmark's active page is the page an action names: putting that page back under its `name` clears the action here and the bookmark's missing active page there.

## Links

- [Create and configure buttons in Power BI reports, including the actions a button can take](https://learn.microsoft.com/power-bi/create-reports/desktop-buttons)
- [Create page and bookmark navigators, including how to set a page navigation destination conditionally](https://learn.microsoft.com/power-bi/create-reports/button-navigators)
- [Create report bookmarks in Power BI, including how to assign a bookmark to a button](https://learn.microsoft.com/power-bi/create-reports/desktop-bookmarks)
- [Drillthrough in Power BI reports, including drillthrough buttons](https://learn.microsoft.com/power-bi/create-reports/desktop-drillthrough)
- [The PBIR naming convention, how pages and bookmarks get their names and what renaming one can break](https://learn.microsoft.com/power-bi/developer/projects/projects-report#pbir-naming-convention)
