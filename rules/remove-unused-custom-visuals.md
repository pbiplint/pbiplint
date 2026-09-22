---
id: REMOVE_UNUSED_CUSTOM_VISUALS
name: "Remove custom visuals which are not used in the report"
category: Performance
severity: warning
scope: [Report]
status: ported
layer: report
video:
sources:
  - https://github.com/NatVanG/fab-inspector/blob/main/Rules/Base-rules.json
---

# Remove custom visuals which are not used in the report

## What it checks

Custom visuals from AppSource that the report registers in report.json and that no visual on any page uses.

Each finding is on the report, as `Report`, one for each unused visual, and its detail names the visual by the type name the report registers it under, as `ChicletSlicer1448559807354 is registered but no visual uses it`.

## Example

The report registers the Chiclet Slicer from AppSource, and no visual on its one page is a Chiclet Slicer.

```pbir fires report.json
{
  "$schema": "https://developer.microsoft.com/json-schemas/fabric/item/report/definition/report/3.2.0/schema.json",
  "themeCollection": {
    "baseTheme": {
      "name": "Fluent2-CY26SU04",
      "reportVersionAtImport": { "visual": "2.8.0", "report": "3.2.0", "page": "2.3.1" },
      "type": "SharedResources"
    }
  },
  "resourcePackages": [
    {
      "name": "SharedResources",
      "type": "SharedResources",
      "items": [
        { "name": "Fluent2-CY26SU04", "path": "BaseThemes/Fluent2-CY26SU04.json", "type": "BaseTheme" }
      ]
    }
  ],
  "publicCustomVisuals": ["ChicletSlicer1448559807354"]
}
```

```pbir fixed report.json
{
  "$schema": "https://developer.microsoft.com/json-schemas/fabric/item/report/definition/report/3.2.0/schema.json",
  "themeCollection": {
    "baseTheme": {
      "name": "Fluent2-CY26SU04",
      "reportVersionAtImport": { "visual": "2.8.0", "report": "3.2.0", "page": "2.3.1" },
      "type": "SharedResources"
    }
  },
  "resourcePackages": [
    {
      "name": "SharedResources",
      "type": "SharedResources",
      "items": [
        { "name": "Fluent2-CY26SU04", "path": "BaseThemes/Fluent2-CY26SU04.json", "type": "BaseTheme" }
      ]
    }
  ],
  "publicCustomVisuals": []
}
```

## Why it matters

Importing a visual from AppSource registers it with the report, and deleting the last visual that drew with it leaves the registration behind. The report then declares a dependency on third-party code it no longer uses: the visual sits in the Visualizations pane for everyone who edits the report, and whoever reviews which custom visuals a report relies on, or checks a report against the visuals the organization allows, has to account for one that draws nothing. Over time the pane stops being a reliable list of what the report needs, and nobody tidying it can tell which entries are safe to remove.

## How to fix it

In Power BI Desktop, right-click the visual's icon among the imported visuals in the Visualizations pane and remove it, confirming when Desktop asks. In report.json, delete the name from `publicCustomVisuals`; when it was the only one, the list is left empty, as in the example. If a page needs the visual again later, import it again from AppSource.

## When to ignore it

A report kept as a starting point for other reports, which registers the visuals its authors are expected to use before any page uses them, is the one case where an unused registration is deliberate. A report that readers open is not that case: if a page is about to need the visual, importing it again when that page is built costs a minute.

## Quirks

- Only the AppSource visuals listed in `publicCustomVisuals` are checked. A visual imported from a .pbiviz file is stored in the report's CustomVisuals folder instead, and pbiplint does not read that folder, so an unused visual imported from a file is not reported.
- A visual counts as used when any visual in the report has its type name, on any page, hidden pages and hidden visuals included.
- The finding is on the report rather than on a page or visual, because an unused visual has neither, so it cannot be ignored for one visual alone.

## Links

- [Import Power BI visuals from AppSource or from a file](https://learn.microsoft.com/power-bi/developer/visuals/import-visual)
- [The Power BI Desktop project report folder and its CustomVisuals folder](https://learn.microsoft.com/power-bi/developer/projects/projects-report)
