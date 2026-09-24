---
id: DEFAULT_PAGE_NAME
name: "Page keeps its default name"
category: Report Design
severity: warning
scope: [Page]
status: builtin
layer: report
video:
sources:
---

# Page keeps its default name

## What it checks

Pages whose display name in page.json has the shape `Page <n>`, `Duplicate of <name>`, or `<name> (copy)`: the names English Power BI Desktop gives a new page and a duplicated one, and a name marked as a copy. The rule also matches the names Desktop gives a new page in German, Spanish, Italian, and Japanese, and a duplicated page in German, Spanish, French, Portuguese, and Norwegian.

Desktop names pages in the language it runs in, and Microsoft publishes no list of those names, so the rule knows the ones that page.json files saved by Desktop show: `Seite <n>` (German), `Página <n>` (Spanish), `Pagina <n>` (Italian), and `ページ <n>` (Japanese) for a new page, and `Duplikat von "<name>"` (German, with the name in straight double quotes), `Duplicado de <name>` (Spanish), `Doublon de <name>` (French), `Duplicata de <name>` (Portuguese), and `Duplikat av <name>` (Norwegian) for a duplicated one. A name Desktop gives in another language is reported only when it has one of these forms.

Each finding names the page, as `Page "Page 2"`, at the `displayName` line of its page.json, and its detail says which kind of name it matched: `"Page 2" is the name Power BI Desktop gives a new page`, `"Duplicate of Overview" is the name Power BI Desktop gives a duplicated page`, or `"Overview (copy)" is named as a copy`. A name in another language reads the same way, as `"Seite 2" is the name Power BI Desktop gives a new page`.

## Example

```pbir fires page.json
{
  "$schema": "https://developer.microsoft.com/json-schemas/fabric/item/report/definition/page/2.1.0/schema.json",
  "name": "8f3c2a1d6b4e5f7a9c0d",
  "displayName": "Page 2",
  "displayOption": "FitToPage",
  "height": 720,
  "width": 1280
}
```

```pbir fixed page.json
{
  "$schema": "https://developer.microsoft.com/json-schemas/fabric/item/report/definition/page/2.1.0/schema.json",
  "name": "8f3c2a1d6b4e5f7a9c0d",
  "displayName": "Overview",
  "displayOption": "FitToPage",
  "height": 720,
  "width": 1280
}
```

The page still carries the name it was added under, so the finding reads `Page "Page 2"` with `"Page 2" is the name Power BI Desktop gives a new page`. The fix names it for what it shows. Only `displayName` changes: the page's `name`, the id that pages.json lists it by, stays the same.

## Why it matters

A page's name is how readers find their way around a report. It labels the page's tab, it is the label of the page's button in a page navigator, and for a drillthrough page it is the entry readers pick from the Drillthrough menu. `Page 2` says nothing about what the page holds, and `Duplicate of Overview` says only where the page came from, so readers have to open each page to learn what is on it. The next author learns as little: a page that kept the name it was added under may be a draft nobody finished, and a duplicate that kept its name may be an experiment nobody removed, and nothing in the name says which.

## How to fix it

In Power BI Desktop, right-click the page's tab at the bottom of the report, select Rename Page, and type the new name. Or, with nothing selected on the page, select the Page information card in the Format pane and type the name into Name. In page.json the name is `displayName`, as in the example; leave `name` as it is, since pages.json and the page's folder use it.

A page navigator's buttons take the new name on their own. A button that picks its destination from a table of page names, through conditional formatting, does not: Power BI matches those values to the page names exactly, so change the name in that table too.

## When to ignore it

A page whose real name has one of these shapes is named on purpose. A report that reproduces a printed document page for page, with pages called `Page 1` and `Page 2` to match the original, is the usual case; ignore the finding on those pages.

## Quirks

- The whole name has to match, with the capitals as shown: `Page 2` and `Seite 2` are reported, while `Page 2 sales`, `page 2`, and `Seite 02` are not. The German duplicate needs its quotes: `Duplikat von "Overview"` is reported, and `Duplikat von Overview` is not.
- A duplicate of a duplicate, `Duplicate of Duplicate of Overview`, is one finding, like any other page. In German the quotes nest, as `Duplikat von "Duplikat von "Overview""`, and that is one finding too.
- A name that ends with a space and `(copy)` is reported whoever typed it, and its detail says only that it is named as a copy. `Overview(copy)`, with no space, is not.
- A page whose page.json records no display name is not checked, and neither is a page with no page.json in the input. pbiplint labels such a page by its folder id, which is not a name anyone chose.

## Related rules

- `REDUCE_PAGES` counts every page, hidden or not, so a leftover duplicate this rule reports also counts toward that rule's limit.

## Links

- [Create a drillthrough page in Power BI Desktop, including renaming it from its tab](https://learn.microsoft.com/power-bi/create-reports/desktop-drillthrough)
- [Create page and bookmark navigators, whose buttons are labelled with the page names](https://learn.microsoft.com/power-bi/create-reports/button-navigators)
- [Create tooltips based on report pages, including naming a page in the Page information card](https://learn.microsoft.com/power-bi/create-reports/desktop-tooltips)
