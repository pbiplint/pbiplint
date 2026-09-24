---
id: OPENING_PAGE_INVALID
name: "Opening page missing or hidden"
category: Error Prevention
severity: error
scope: [Report]
status: builtin
layer: report
video:
sources:
---

# Opening page missing or hidden

## What it checks

A pages.json whose landing page names a page the report does not have, or, when no landing page is set, whose active page names a page the report does not have or a page hidden from readers.

The finding is on the report, as `Report`, at the line of pages.json that names the page, and its detail says which page and what is wrong with it: `active page "Product detail" is hidden from readers`, or, for a page that is not there, the name pages.json gives it, as `landing page "7c41d9e0a2b35f18c6d4" does not exist` or `active page "7c41d9e0a2b35f18c6d4" does not exist`.

## Example

```pbir fires tree.json
{
  "definition/pages/pages.json": {
    "$schema": "https://developer.microsoft.com/json-schemas/fabric/item/report/definition/pagesMetadata/1.0.0/schema.json",
    "pageOrder": ["p1", "p2"],
    "activePageName": "p2"
  },
  "definition/pages/p1/page.json": {
    "$schema": "https://developer.microsoft.com/json-schemas/fabric/item/report/definition/page/2.1.0/schema.json",
    "name": "p1",
    "displayName": "Overview",
    "displayOption": "FitToPage",
    "height": 720,
    "width": 1280
  },
  "definition/pages/p2/page.json": {
    "$schema": "https://developer.microsoft.com/json-schemas/fabric/item/report/definition/page/2.1.0/schema.json",
    "name": "p2",
    "displayName": "Product detail",
    "displayOption": "FitToPage",
    "height": 720,
    "width": 1280,
    "visibility": "HiddenInViewMode"
  }
}
```

```pbir fixed tree.json
{
  "definition/pages/pages.json": {
    "$schema": "https://developer.microsoft.com/json-schemas/fabric/item/report/definition/pagesMetadata/1.1.0/schema.json",
    "pageOrder": ["p1", "p2"],
    "activePageName": "p2",
    "landingPageName": "p1"
  },
  "definition/pages/p1/page.json": {
    "$schema": "https://developer.microsoft.com/json-schemas/fabric/item/report/definition/page/2.1.0/schema.json",
    "name": "p1",
    "displayName": "Overview",
    "displayOption": "FitToPage",
    "height": 720,
    "width": 1280
  },
  "definition/pages/p2/page.json": {
    "$schema": "https://developer.microsoft.com/json-schemas/fabric/item/report/definition/page/2.1.0/schema.json",
    "name": "p2",
    "displayName": "Product detail",
    "displayOption": "FitToPage",
    "height": 720,
    "width": 1280,
    "visibility": "HiddenInViewMode"
  }
}
```

The report was saved while Product detail, a hidden page, was on screen, so the finding reads `active page "Product detail" is hidden from readers`. The fix sets Overview as the landing page, so the report opens there whatever page is active when it is next saved.

## Why it matters

With no landing page, Power BI opens a report on the page that was active when it was saved or published. When that page is hidden, readers start on it: Microsoft's documentation says a report saved while looking at a hidden page shows that page first. A hidden page is usually a tooltip, a drillthrough target, or a page that a button leads to, built to be reached from somewhere else, and in reading view it is not in the page list, so a reader who leaves it cannot find the way back.

A page name that matches no page usually comes from a hand edit or a merge: a page deleted or renamed in one branch while pages.json in another still names it. Renaming a page's `name` can break the references to it, as Microsoft's PBIR documentation warns. Power BI Desktop repairs an active page that names nothing when it opens the report, with a warning, but the file stays wrong until someone saves it, and nothing in the file says which page was meant.

## How to fix it

In Power BI Desktop, set a visible landing page: right-click the tab of the page readers should start on and select Set as landing page, or, with nothing selected on the page, open the Format pane, expand Page information, and turn on Landing page. The report then opens there whatever page is active when it is saved. Without a landing page, open a visible page before you save, so that page becomes the active one.

In pages.json, point `landingPageName` or `activePageName` at the `name` of a page that exists and is visible, one whose page.json does not set `"visibility": "HiddenInViewMode"`. `landingPageName` needs the pagesMetadata 1.1.0 schema in `$schema`, as the fixed example shows.

## When to ignore it

When readers are meant to start on a hidden page, make it the landing page: Power BI supports a hidden landing page, and this rule does not report one. Short of that, there is no case for keeping the finding, because a report that opens on a missing page, or on a helper page by accident, starts every reader in the wrong place.

## Quirks

- A hidden landing page is not reported, because Power BI opens on it for every reader by design. Microsoft's documentation says so: "Hidden pages can be set as the landing page. Report consumers always see the hidden page when they open the report."
- When a landing page is set, the active page is not checked, since the landing page overrides it.
- When pages.json names neither a landing page nor an active page, the report opens on the first page in its page order, which exists by definition, so nothing is reported. Nothing is reported when that first page is hidden either, because Microsoft does not document what Power BI shows readers in that case.
- A page is matched by its `name`, exactly as pages.json writes it, not by its display name.
- A landing page or an active page whose page.json cannot be read, such as one holding merge-conflict markers, is not reported, because pbiplint does not guess what a file it could not read says: the page is there under its folder name, which Microsoft's PBIR documentation says is a page's `name` by default, and whether it is hidden is in the file that could not be read. The file's own `PARSE_ISSUE` finding names it.
- The rule reads pages.json. Without one in the input, or with one that cannot be read, it reports nothing.

## Related rules

- `LANDING_PAGE_NOT_SET` fires beside this rule whenever the active page decides where the report opens. One visible landing page clears both.
- `HIDE_TOOLTIP_DRILLTROUGH_PAGES` asks for tooltip and drillthrough pages to be hidden, which makes them pages this rule reports when the report is saved while one of them is open and no landing page is set.

## Links

- [Set the landing page for a Power BI report](https://learn.microsoft.com/power-bi/create-reports/power-bi-set-landing-page)
- [Report view in Power BI Desktop, including how hidden pages behave](https://learn.microsoft.com/power-bi/create-reports/desktop-report-view)
- [External changes to PBIR files, and the errors Power BI Desktop fixes when it opens them](https://learn.microsoft.com/power-bi/developer/projects/projects-report#external-changes-to-pbir-files)
- [The PBIR naming convention, how a page gets its folder name](https://learn.microsoft.com/power-bi/developer/projects/projects-report#pbir-naming-convention)
