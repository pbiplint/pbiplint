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

Bookmarks whose active page, or another page they capture, is not in the report, which capture a visual that is not on its page, or which apply only to selected visuals and name one that is not on their active page, matched against the `name` in each page.json and visual.json.

Each finding names the bookmark by the display name its file gives it, as `Bookmark "Reset"`, at the line in its bookmark file that names what is missing, and its detail says what that is: `active page "a91c3e5f7d2b4086e1c9" does not exist`, `captured page "a91c3e5f7d2b4086e1c9" does not exist`, `captured visual "8b2e41c07d95a3f6e210" is not on page "Overview"`, or `target visual "8b2e41c07d95a3f6e210" is not on page "Overview"`. A target visual is a name in `options.targetVisualNames`, the list of visuals a bookmark with its Selected visuals option on applies to. A bookmark's stale target visuals are one finding, at the line of the first; its detail names up to three and counts the rest: `target visuals "8b2e41c07d95a3f6e210", "c4d17a9e0b3f5826e1a7", "f05b92e8a1d3c7460b9e", and 2 more are not on page "Overview"`.

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

With Selected visuals on, Microsoft says the bookmark "Applies the bookmark settings only to the visuals you select before creating or updating the bookmark" ([Create report bookmarks](https://learn.microsoft.com/power-bi/create-reports/desktop-bookmarks#create-report-bookmarks)), and the file keeps those visuals by `name`. A name in that list that no visual on the page has is a visual the bookmark was made to act on and can no longer reach. A visual put in its place since has a `name` of its own, which the list does not hold, so the bookmark leaves it alone.

Microsoft's PBIR documentation, in its answer about a bookmark file copied from another report, says that Power BI Desktop removes invalid visuals from a bookmark's configuration when it saves. So a captured visual that names nothing usually means a bookmark file edited, copied, or merged outside Desktop and not saved in Desktop since. The documentation says nothing of the same for a missing page, and Power BI Desktop's saved files do keep bookmarks whose active page is gone. Power BI Desktop's saved files also keep names in the list of visuals a bookmark applies to after their visual is gone, even from a save that removed the same visual from the bookmark's captured visuals.

## How to fix it

In Power BI Desktop, on the View tab, select Bookmarks to open the Bookmarks pane. Go to the page the bookmark should show, arrange its visuals as the bookmark should leave them, then select More options (...) next to the bookmark's name and choose Update. If nobody needs the bookmark any more, choose Delete from the same menu. Deleting it and adding a new one from the right page also works, but a button keeps pointing at the bookmark it was set to, not at its display name, so point any button that used the old one at the new one; `BROKEN_ACTION_TARGET` reports any that still name it. For a captured visual that is no longer on the page, opening the report in Desktop and saving it is enough, since Desktop removes such visuals from the bookmark when it saves. For a target visual, saving is not enough: select the visuals the bookmark should apply to, on the page or in the Selection pane (hold Ctrl to select more than one), then choose Update from the bookmark's More options (...) menu.

## When to ignore it

There is no legitimate case. A bookmark that names a page or visual the report lacks keeps state for, or applies to, something that is not there, so recapture it or delete it; a bookmark nobody uses is better deleted than ignored.

## Quirks

- A bookmark captures one page. Power BI Desktop's saved files write one key in `sections`, the active page's, so a missing page is reported once, at `activeSection`. A `sections` key that names a different missing page is reported on its own line.
- The rule reports a missing active page whether or not the bookmark's Current page option is on. With it off, Microsoft says the bookmark applies its settings to whichever page is being viewed, but the visuals it captured are still those of the page that is gone.
- A captured visual is checked against the page it is captured under, and a target visual against the active page, whose visuals and groups the list names; each only when that page exists, since a missing page is reported in place of the visuals under it.
- The list of target visuals is checked only when Selected visuals is on, which the file records as `applyOnlyToTargetVisuals` set to `true` beside the list. Power BI Desktop's saved files write the list in every bookmark whether or not the option is on, and with All visuals, Microsoft says, the bookmark applies to every visual on the page ([Create report bookmarks](https://learn.microsoft.com/power-bi/create-reports/desktop-bookmarks#create-report-bookmarks)), so a name left in the list then is not reported.
- A bookmark's stale target visuals are one finding together, while each stale captured visual is a finding of its own: one Update with the right visuals selected replaces the whole list.
- A group the list names, which is a container on the page with no visual of its own, is found as a visual is. Groups that a bookmark keeps apart from visuals under `visualContainerGroups`, and the visuals listed as each group's `children`, are not checked.
- Pages and visuals are matched by `name`, never by display name, and never by folder name, except when their own file cannot be read, as the next point says. Microsoft says renaming a `name` is supported, and that Power BI Desktop keeps the original folder names when it saves.
- A page or a visual whose own file cannot be read, such as a page.json or a visual.json holding merge-conflict markers or one pbiplint could not open at all, is not reported missing, because pbiplint does not guess what a file it could not read says. It is known by its folder name instead, which Microsoft's PBIR documentation says is a page's or a visual's `name` by default, so a bookmark that captures it is not reported. Nor is a page or a visual that a folder under the definition folder, which pbiplint could not list, could hold, such as any visual on a page whose visuals folder could not be listed. The file's own `PARSE_ISSUE` finding names it, or a notice does for a file pbiplint could not open or a folder it could not list.
- bookmarks.json, which holds the bookmarks' order and groups, is not checked: a name it lists with no bookmark file, or a bookmark file it does not list, is not reported.

## Related rules

- `BROKEN_ACTION_TARGET` clears with the same fix when a button's page navigation or drillthrough names the page a bookmark lost: putting that page back under its `name` clears the bookmark's missing active page here and the action there.
- `BROKEN_FIELD_REFERENCE` fires on the same object, a bookmark, when its captured filters or visual state name a field the model does not have.

## Links

- [Create report bookmarks in Power BI, including what a bookmark captures, how to update one, and which visuals its Selected visuals option applies to](https://learn.microsoft.com/power-bi/create-reports/desktop-bookmarks)
- [Power BI Desktop project report folder, including the bookmark files and why Desktop removes invalid visuals from a copied bookmark](https://learn.microsoft.com/power-bi/developer/projects/projects-report#common-pbir-errors)
- [The PBIR naming convention, how pages and visuals get their folder names and what renaming one keeps](https://learn.microsoft.com/power-bi/developer/projects/projects-report#pbir-naming-convention)
