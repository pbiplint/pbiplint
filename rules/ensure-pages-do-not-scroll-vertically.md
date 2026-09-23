---
id: ENSURE_PAGES_DO_NOT_SCROLL_VERTICALLY
name: "Ensure pages do not scroll vertically"
category: Report Design
severity: warning
scope: [Page]
status: ported
layer: report
video:
sources:
  - https://github.com/NatVanG/fab-inspector/blob/main/Rules/Base-rules.json
---

# Ensure pages do not scroll vertically

## What it checks

Visible pages taller than the threshold, 720 pixels by default.

Each finding names the page, as `Page "Store detail"`, and its detail gives the height, as `height 1080, more than 720`. The line is the page's `height`.

## Example

```pbir fires page.json
{
  "$schema": "https://developer.microsoft.com/json-schemas/fabric/item/report/definition/page/2.1.0/schema.json",
  "name": "4c2d9e8f1a7b3065d2e4",
  "displayName": "Store detail",
  "displayOption": "FitToWidth",
  "height": 1080,
  "width": 1280
}
```

```pbir fixed page.json
{
  "$schema": "https://developer.microsoft.com/json-schemas/fabric/item/report/definition/page/2.1.0/schema.json",
  "name": "4c2d9e8f1a7b3065d2e4",
  "displayName": "Store detail",
  "displayOption": "FitToWidth",
  "height": 720,
  "width": 1280
}
```

## Why it matters

A page taller than the screen it is read on no longer fits in one view. Under Fit to width the reader has to scroll to reach its lower half, and under Fit to page the whole page shrinks until it fits, text and all. Either way, a visual below the first screen is one a reader may never see, and a slicer at the top of the page changes numbers further down that the reader cannot see change.

## How to fix it

Split the page: move the lower half to a page of its own, or to a drillthrough page if it holds detail about one item. Where the content has to stay together, tighten it, with fewer or smaller visuals, or with bookmarks that switch between two views in the same space. Then set the height back: in Power BI Desktop, click an empty part of the canvas so the Format pane shows the page, open Canvas settings, and choose the 16:9 type, or set the Height under the Custom type. In page.json, the page's size is its `height` and `width`.

## When to ignore it

A page designed to be scrolled, laid out as one long column for Fit to width and read that way, is a deliberate choice, and so is a page sized for printing. Before deciding, open the page the way readers do, in the Power BI service or on the device they use, and check that nothing important sits below the first screen.

## Quirks

- Hidden pages are not checked, so a tall drillthrough or tooltip page that is hidden is not reported.
- Only the height is compared, not the width or the page view, as the source compares it. A 1920 by 1080 page has the same 16:9 shape as the default 1280 by 720 and, under Fit to page, scales down rather than scrolling, but it is reported all the same. For a report built at that size throughout, raise the threshold with the rule's `maxHeight` option.

## Related rules

- `HIDE_TOOLTIP_DRILLTROUGH_PAGES` hides pages this rule then no longer checks.
- `REDUCE_VISUALS_ON_PAGE` often fires on the same page, since a tall page usually carries more visuals, and splitting the page can clear both.

## Links

- [Apply page size and settings in a Power BI report](https://learn.microsoft.com/power-bi/create-reports/power-bi-report-display-settings)
