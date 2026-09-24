---
id: LANDING_PAGE_NOT_SET
name: "No landing page set"
category: Report Design
severity: info
scope: [Report]
status: builtin
layer: report
video:
sources:
---

# No landing page set

## What it checks

A report whose pages.json sets no landing page, so it opens on the page that was active when it was last saved, or, when pages.json records no active page either, on the first page.

The finding is on the report, as `Report`, at the `activePageName` line of pages.json, or on line 1 when pages.json records no active page, and its detail names the page the report opens on now, as `opens on "Products", the page open when it was saved` or `opens on "Overview", the first page`. When the active page names a page the report does not have, the detail says so rather than naming one: `no landing page set; the active page "5f1e2a0c9b7d43e6a8f1" does not exist`.

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
    "displayName": "Products",
    "displayOption": "FitToPage",
    "height": 720,
    "width": 1280
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
    "displayName": "Products",
    "displayOption": "FitToPage",
    "height": 720,
    "width": 1280
  }
}
```

The report was last saved while Products was open, so that is where it opens: `opens on "Products", the page open when it was saved`. The fix makes Overview the landing page, which takes the 1.1.0 schema in pages.json, and the page that was active when the report was saved no longer decides.

## Why it matters

Without a landing page, the page a reader starts on is whichever page the last author happened to have open when they saved or published. Check a detail page, save, and publish, and every reader now opens the report on that detail page instead of the overview it was built to start from. A landing page takes the accident out: Power BI opens the report on it for every reader, whatever page was active when the report was last saved.

## How to fix it

In Power BI Desktop, right-click the tab of the page readers should start on and select Set as landing page; an icon on the tab marks it. Or, with nothing selected on the page, open the Format pane, expand Page information, and turn on Landing page. Only one page can be the landing page, so setting another moves it.

In pages.json, set `landingPageName` to the page's `name` from its page.json, not its display name, as in the example. The property needs the pagesMetadata 1.1.0 schema, so update `$schema` to that version when you add it by hand.

## When to ignore it

A report with a single page opens on that page whatever pages.json says, so a landing page adds nothing there. Ignore the finding on a one-page report you do not expect to grow.

## Quirks

- The rule reads pages.json. Without one in the input, or with one that cannot be read, it reports nothing, since nothing then says which page opens. A report with no pages is not reported either.
- When the active page names a page the report does not have, the finding does not name a page to open on. `OPENING_PAGE_INVALID` reports that page.
- When the page the report opens on has a page.json that cannot be read, such as one holding merge-conflict markers, the finding names the page by its `name`, as pages.json does, since its display name is in the file pbiplint could not read. The file's own `PARSE_ISSUE` finding names it.

## Related rules

- `OPENING_PAGE_INVALID` checks that the page the report opens on exists and, when no landing page is set, that it is not hidden. Setting a visible landing page clears both rules.

## Links

- [Set the landing page for a Power BI report](https://learn.microsoft.com/power-bi/create-reports/power-bi-set-landing-page)
