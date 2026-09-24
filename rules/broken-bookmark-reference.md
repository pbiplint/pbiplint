---
id: BROKEN_BOOKMARK_REFERENCE
name: "Bookmark refers to a missing page or visual"
category: Error Prevention
severity: warning
scope: [Bookmark]
status: builtin
layer: report
video:
sources:
---

# Bookmark refers to a missing page or visual

## What it checks

Bookmarks whose active page, or another page they capture, is not in the report, or which capture a visual that is not on its page, matched against the `name` in each page.json and visual.json.

Each finding names the bookmark by the display name its file gives it, as `Bookmark "Reset"`, at the line in its bookmark file that names what is missing, and its detail says what that is: `active page "a91c3e5f7d2b4086e1c9" does not exist`, `captured page "a91c3e5f7d2b4086e1c9" does not exist`, or `captured visual "8b2e41c07d95a3f6e210" is not on page "Overview"`.

## Example

```pbir fires Reset.bookmark.json
{
  "$schema": "https://developer.microsoft.com/json-schemas/fabric/item/report/definition/bookmark/1.0.0/schema.json",
  "name": "Reset",
  "displayName": "Reset",
  "explorationState": {
    "version": "1.3",
    "activeSection": "p1",
    "sections": {
      "p1": {
        "visualContainers": {
          "8b2e41c07d95a3f6e210": {
            "singleVisual": {
              "visualType": "tableEx",
              "objects": {}
            }
          }
        }
      }
    }
  },
  "options": {
    "targetVisualNames": []
  }
}
```

```pbir fixed Reset.bookmark.json
{
  "$schema": "https://developer.microsoft.com/json-schemas/fabric/item/report/definition/bookmark/1.0.0/schema.json",
  "name": "Reset",
  "displayName": "Reset",
  "explorationState": {
    "version": "1.3",
    "activeSection": "p1",
    "sections": {
      "p1": {
        "visualContainers": {}
      }
    }
  },
  "options": {
    "targetVisualNames": []
  }
}
```

The Reset bookmark captures the Overview page with the state of a table, `8b2e41c07d95a3f6e210`, that is not on the page, as a bookmark file copied in from another report or merged by hand can, so the finding reads `Bookmark "Reset"` with `captured visual "8b2e41c07d95a3f6e210" is not on page "Overview"`. The fix removes the table's entry from `visualContainers`.

## Why it matters

A bookmark captures the state of a report page: Microsoft lists the current page among what a bookmark saves, with its filters and slicers, sort order, and which objects the Selection pane shows or hides. With its Current page option on, which Microsoft describes as navigating to the page that was active when the bookmark was created, a bookmark whose active page is not in the report has no page to take readers to, whether they select it in the Bookmarks pane or through a button or bookmark navigator that applies it. A captured visual that is not on its page is state kept for a visual the page does not have: whatever the bookmark was made to do to it, show it, hide it, or sort it, has nothing to act on.

Microsoft's PBIR documentation, in its answer about a bookmark file copied from another report, says that Power BI Desktop removes invalid visuals from a bookmark's configuration when it saves. So a captured visual that names nothing usually means a bookmark file edited, copied, or merged outside Desktop and not saved in Desktop since. The documentation says nothing of the same for a missing page, and Power BI Desktop's saved files do keep bookmarks whose active page is gone.

## How to fix it

In Power BI Desktop, on the View tab, select Bookmarks to open the Bookmarks pane. Go to the page the bookmark should show, arrange its visuals as the bookmark should leave them, then select More options (...) next to the bookmark's name and choose Update. If nobody needs the bookmark any more, choose Delete from the same menu. Deleting it and adding a new one from the right page also works, but the new bookmark gets a new `name`, so point any button that used the old one at the new one; `BROKEN_ACTION_TARGET` reports any that still name it. For a captured visual that is no longer on the page, opening the report in Desktop and saving it is enough, since Desktop removes such visuals from the bookmark when it saves.

In the bookmark file, a captured visual is a key under `explorationState.sections.<page>.visualContainers`, named by the visual's `name`: remove the key that names nothing, as the example does. A missing page is `activeSection` and the matching key of `sections`. Pointing both at the `name` of a page that exists leaves the bookmark holding state for the old page's visuals, which that page does not have, so for a missing page, recapture the bookmark in Desktop instead.

## When to ignore it

There is no legitimate case. A bookmark that names a page or visual the report lacks keeps state for something that is not there, so recapture it or delete it; a bookmark nobody uses is better deleted than ignored.

## Quirks

- A bookmark captures one page. Power BI Desktop's saved files write one key in `sections`, the active page's, so a missing page is reported once, at `activeSection`. A `sections` key that names a different missing page is reported on its own line.
- The rule reports a missing active page whether or not the bookmark's Current page option is on. With it off, Microsoft says the bookmark applies its settings to whichever page is being viewed, but the visuals it captured are still those of the page that is gone.
- A captured visual is checked against the page it is captured under, and only when that page exists: a missing page is reported in place of the visuals captured under it.
- Groups, which a bookmark keeps apart from visuals under `visualContainerGroups`, are not checked, nor is the list of visuals the Selected visuals option applies to, `options.targetVisualNames`. Power BI Desktop's saved files write that list in every bookmark, whether or not Selected visuals is on.
- Pages and visuals are matched by `name`, never by display name, and never by folder name, except when their own file cannot be read, as the next point says. Microsoft says renaming a `name` is supported, and that Power BI Desktop keeps the original folder names when it saves.
- A page or a visual whose own file cannot be read, such as a page.json or a visual.json holding merge-conflict markers, is not reported missing, because pbiplint does not guess what a file it could not read says. It is known by its folder name instead, which Microsoft's PBIR documentation says is a page's or a visual's `name` by default, so a bookmark that captures it is not reported. The file's own `PARSE_ISSUE` finding names it.
- bookmarks.json, which holds the bookmarks' order and groups, is not checked: a name it lists with no bookmark file, or a bookmark file it does not list, is not reported.

## Related rules

- `BROKEN_ACTION_TARGET` clears with the same fix when a button's page navigation or drillthrough names the page a bookmark lost: putting that page back under its `name` clears the bookmark's missing active page here and the action there.
- `BROKEN_FIELD_REFERENCE` fires on the same object, a bookmark, when its captured filters or visual state name a field the model does not have.

## Links

- [Create report bookmarks in Power BI, including what a bookmark captures and how to update one](https://learn.microsoft.com/power-bi/create-reports/desktop-bookmarks)
- [Power BI Desktop project report folder, including the bookmark files and why Desktop removes invalid visuals from a copied bookmark](https://learn.microsoft.com/power-bi/developer/projects/projects-report#common-pbir-errors)
- [The PBIR naming convention, how pages and visuals get their folder names and what renaming one keeps](https://learn.microsoft.com/power-bi/developer/projects/projects-report#pbir-naming-convention)
