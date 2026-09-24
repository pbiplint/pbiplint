---
id: HIDE_TOOLTIP_DRILLTROUGH_PAGES
name: "Tooltip and Drillthrough pages should be hidden"
category: Report Design
severity: warning
scope: [Page]
status: ported
layer: report
video:
sources:
  - https://github.com/NatVanG/fab-inspector/blob/main/Rules/Base-rules.json
---

# Tooltip and Drillthrough pages should be hidden

## What it checks

Tooltip pages and drillthrough pages that are not hidden.

The rule reads both places Microsoft's page schema gives for marking a page as a tooltip or drillthrough page: the page's own `type` in page.json, and the `type` inside its `pageBinding`. Either one set to `Tooltip` or `Drillthrough` is enough.

Each finding names the page, as `Page "Product tooltip"`, and its detail says which kind it is, as `tooltip page is visible to readers`. Its line in page.json is the `pageBinding` when that marks the page, and otherwise the page's own `type`.

## Example

```pbir fires page.json
{
  "$schema": "https://developer.microsoft.com/json-schemas/fabric/item/report/definition/page/2.1.0/schema.json",
  "name": "5b2e7c1d9a4f60e83c17",
  "displayName": "Product tooltip",
  "displayOption": "ActualSize",
  "height": 240,
  "width": 320,
  "pageBinding": {
    "name": "8f3d2a61-5c4e-4b7a-9e0d-1f6b2c8a4d93",
    "type": "Tooltip"
  }
}
```

```pbir fixed page.json
{
  "$schema": "https://developer.microsoft.com/json-schemas/fabric/item/report/definition/page/2.1.0/schema.json",
  "name": "5b2e7c1d9a4f60e83c17",
  "displayName": "Product tooltip",
  "displayOption": "ActualSize",
  "height": 240,
  "width": 320,
  "visibility": "HiddenInViewMode",
  "pageBinding": {
    "name": "8f3d2a61-5c4e-4b7a-9e0d-1f6b2c8a4d93",
    "type": "Tooltip"
  }
}
```

## Why it matters

A tooltip page is built to appear small, over a data point, already filtered to whatever the pointer rests on, and a drillthrough page is built to open filtered to the item a reader drilled from. Left visible, each is also a tab a reader can open on its own, with no data point or item behind it. A tooltip page's visuals then show totals for everything, and a drillthrough page's show whatever the page was last filtered to, both under a heading that promises one product or one customer, with nothing on the page to tell the reader so. The extra tabs also crowd the page list with pages that make sense only in context.

## How to fix it

In Power BI Desktop, right-click the page's tab and choose Hide Page. A hidden tooltip page still appears over the visuals it serves, and a hidden drillthrough page is still reached with Drill through on a data point; readers just cannot open either one directly. In page.json, add `"visibility": "HiddenInViewMode"`.

## When to ignore it

A drillthrough page that also works as a page in its own right, with a slicer of its own for choosing the item, can stay visible if it gives readers a way to clear the drillthrough filter it was last opened with, such as a button tied to a bookmark that removes the filters. Microsoft's drillthrough guidance describes that arrangement. A tooltip page has no such case, because it is never meant to be read on its own.

## Quirks

- pbiplint reads a tooltip or drillthrough page from page.json's own `type` as well as its `pageBinding`, where PBI Inspector reads only `pageBinding.type`, so it also reports the tooltip pages Power BI Desktop marks by `type` alone.
- The id keeps the source's spelling, DRILLTROUGH, because pbiplint's results are compared with the source's rule by rule on the id. Use that spelling wherever the id is written, in `pbiplint.config.json` and in an annotation alike.

## Related rules

- `REDUCE_PAGES` counts these pages whether they are hidden or not, so hiding them does not lower that count.
- `ENSURE_PAGES_DO_NOT_SCROLL_VERTICALLY` checks visible pages only, so hiding a tall drillthrough page also takes it out of that rule's reach.

## Links

- [Create report tooltips in Power BI](https://learn.microsoft.com/power-bi/create-reports/desktop-tooltips)
- [Extend visuals with report page tooltips](https://learn.microsoft.com/power-bi/guidance/report-page-tooltips)
- [Use report page drillthrough](https://learn.microsoft.com/power-bi/guidance/report-drillthrough)
- [Microsoft's page schema, where a page's own type or its page binding marks it as a tooltip or drillthrough page](https://github.com/microsoft/json-schemas/tree/main/fabric/item/report/definition/page)
