---
id: REDUCE_PAGES
name: "Reduce number of pages per report"
category: Performance
severity: warning
scope: [Report]
status: ported
layer: report
video:
sources:
  - https://github.com/NatVanG/fab-inspector/blob/main/Rules/Base-rules.json
---

# Reduce number of pages per report

## What it checks

Reports with more pages than the threshold, 10 by default, hidden pages included.

Each finding is on the report, as `Report`, and its detail gives the count, as `18 pages, more than 10`.

## Example

The example lowers the threshold to 2 so that it stays short; the default is 10.

```json pbiplint.config.json
{
  "rules": {
    "REDUCE_PAGES": { "max": 2 }
  }
}
```

```pbir fires tree.json
{
  "definition/pages/pages.json": {
    "$schema": "https://developer.microsoft.com/json-schemas/fabric/item/report/definition/pagesMetadata/1.0.0/schema.json",
    "pageOrder": ["p1", "p2", "p3"],
    "activePageName": "p1"
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
    "displayName": "Products",
    "displayOption": "FitToPage",
    "height": 720,
    "width": 1280
  },
  "definition/pages/p3/page.json": {
    "$schema": "https://developer.microsoft.com/json-schemas/fabric/item/report/definition/page/2.1.0/schema.json",
    "name": "p3",
    "displayName": "Products by region",
    "displayOption": "FitToPage",
    "height": 720,
    "width": 1280
  }
}
```

```pbir fixed tree.json
{
  "definition/pages/pages.json": {
    "$schema": "https://developer.microsoft.com/json-schemas/fabric/item/report/definition/pagesMetadata/1.0.0/schema.json",
    "pageOrder": ["p1", "p2"],
    "activePageName": "p1"
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
    "displayName": "Products",
    "displayOption": "FitToPage",
    "height": 720,
    "width": 1280
  }
}
```

The fix folds Products by region into Products, where a slicer on Region shows the same visuals for one region at a time, and deletes the page.

## Why it matters

Every page is another tab a reader has to scan, and once there are more than fit, the page they need is one they have to scroll or page through to find. A long report is usually several reports' worth of questions for different readers kept in one file, and every page of it has to be kept in step when the model, the theme, or a shared slicer changes, so each one adds to what has to be checked before a release. Every page's definition also loads when the report opens, whichever page the reader lands on.

## How to fix it

Start with the pages nobody opens: the usage metrics report in the Power BI service counts views per page, and a page with none in the last month is a candidate for deletion. Pages that show the same visuals for different slices of the data, a region or a year each, can become one page with a slicer, or with bookmarks that switch between views. A report that serves separate audiences can split into one report per audience, each reading the same semantic model. In Power BI Desktop, delete a page by right-clicking its tab and choosing Delete page. In the files, a page is its folder under `definition/pages` and an entry in the `pageOrder` of pages.json, and Desktop removes both.

## When to ignore it

A report whose count is high because of tooltip and drillthrough pages can show readers only a few tabs: those pages count here although readers never see them in the page list. If the visible pages are few and each answers its own question, the count is not a problem. An app-style report that readers move through with buttons rather than tabs is the other case, as long as every page is reachable and in use.

## Quirks

- Hidden pages count, as the source counts them, so every tooltip and drillthrough page adds to the total.
- The finding is on the report, so it cannot be ignored for one page.

## Related rules

- `REDUCE_VISUALS_ON_PAGE` pulls the other way: moving visuals onto a new page clears that rule's finding and adds to this count.
- `HIDE_TOOLTIP_DRILLTROUGH_PAGES` asks for tooltip and drillthrough pages to be hidden, and hiding them does not lower this count.

## Links

- [Monitor usage metrics in Power BI workspaces, including views per report page](https://learn.microsoft.com/power-bi/collaborate-share/service-modern-usage-metrics)
- [Create page and bookmark navigators](https://learn.microsoft.com/power-bi/create-reports/button-navigators)
