---
id: REPORT_LEVEL_MEASURES
name: "Measure defined in the report"
category: Maintenance
severity: warning
scope: [ReportMeasure]
status: builtin
layer: report
video:
sources:
---

# Measure defined in the report

## What it checks

Measures defined in the report's reportExtensions.json rather than in the model, reported when the model the report reads is in the input, so that each can move into it.

Each finding names the measure, as `[Sales per Region] (report)`, at the line where its entry opens in reportExtensions.json, and its detail names the table it is defined on: `defined in the report on table "Sales"`.

## Example

The example runs against a model with one table, Sales, holding Amount and Region and the measure Total Sales.

```pbir fires reportExtensions.json
{
  "$schema": "https://developer.microsoft.com/json-schemas/fabric/item/report/definition/reportExtension/1.0.0/schema.json",
  "name": "extension",
  "entities": [
    {
      "name": "Sales",
      "measures": [
        {
          "name": "Sales per Region",
          "dataType": "Double",
          "expression": "DIVIDE([Total Sales], DISTINCTCOUNT('Sales'[Region]))"
        }
      ]
    }
  ]
}
```

```pbir fixed tree.json
{
  "definition/report.json": {
    "$schema": "https://developer.microsoft.com/json-schemas/fabric/item/report/definition/report/3.2.0/schema.json",
    "themeCollection": { "baseTheme": { "name": "Fluent2-CY26SU04", "type": "SharedResources" } }
  }
}
```

The report defines Sales per Region for itself, on the Sales table, so the finding reads `[Sales per Region] (report)` with `defined in the report on table "Sales"`. The fixed report shows its side of the move: once the measure is in the model's Sales table, as How to fix it describes, the report defines none, and its definition folder holds no reportExtensions.json, since Power BI Desktop does not open a project whose reportExtensions.json has an empty `entities` list.

## Why it matters

A report measure is a calculation created directly within a report, without altering the semantic model, so the model never carries it and only the report that defines it can use it. Another report on the same model does not have it. When the model is in your hands, as it is when the report reads it by path from the same project, a calculation kept in one report splits the model's logic in two: the next author looking for it in the model does not find it, and a second report that needs it gets a copy of its own, free to drift from the first.

pbiplint checks such a measure less well too. Its DAX rules read the model's measures only, so none of them looks at a report measure's expression, and `BROKEN_FIELD_REFERENCE` does not report a field that a report measure's DAX names and the model lacks.

## How to fix it

Move the measure into the model with the same name, on the same table, with the same DAX, then point the report at it. How depends on how the report reads its model.

**If the project opens its model by path,** as the sample does, the fix edits one report file, which only `PARSE_ISSUE`'s page also asks for among the report pages. Power BI Desktop shows the report measures in such a project, but its menu fails on them, so it cannot rename or remove them (checked in Power BI Desktop 2.158, September 2026).

1. Note each report measure's DAX and any format it sets. A report measure that another one uses moves with it: in the sample, Margin % (report) uses Net Margin.
2. With Power BI Desktop closed, delete their entries from reportExtensions.json, and an entity when it holds no measure any more. When no measure is left, delete the file itself: Desktop does not open a project whose reportExtensions.json has an empty `entities` list (checked in Power BI Desktop 2.158, September 2026).
3. Open the project in Power BI Desktop and create each measure with New measure on its table, with the same name and DAX: right-click the table in the Data pane, or hover over it and select More options (...), choose New measure, and type the name and the DAX into the formula bar ([Create a measure](https://learn.microsoft.com/power-bi/transform-model/desktop-tutorial-create-measures#create-a-measure)). In such a project the measure is saved in the model's TMDL (checked in Power BI Desktop 2.158, September 2026).
4. Put the model's measure in each visual, filter, and bookmark that used the report measure, as step 4 of the route below describes. A visual stays broken until the measure is added again, and a sort on the measure follows it back (checked in Power BI Desktop 2.158, September 2026).
5. Save the project and lint again: `BROKEN_FIELD_REFERENCE` names any reference left.

**If the report connects live to a published model** and you can change the model, in Power BI Desktop:

1. Open the report so that it connects live to the published model, through the .pbir file When to ignore it describes. Note the measure's DAX and any format it sets, then rename it so the model's measure can take its name: right-click it in the Data pane and select Rename. Checked in Power BI Desktop (version 2.158, September 2026), a report measure's menu in a report connected live to a published model has Rename and Delete from model. Microsoft's schema for report measures asks that a report measure's name be unique across the model, so the two should not exist side by side under one name.
2. Open the model itself in Power BI Desktop, from its own project or file: in a report that connects live to a model, "left navigation and modeling are disabled" ([Connect to semantic models in Power BI](https://learn.microsoft.com/power-bi/connect-data/desktop-report-lifecycle-datasets#considerations-and-limitations)). Right-click the table in the Data pane, or hover over it and select More options (...), choose New measure, and type the name and the DAX into the formula bar. Microsoft notes that this "saves your new measure in the Sales table" for its example ([Create a measure](https://learn.microsoft.com/power-bi/transform-model/desktop-tutorial-create-measures#create-a-measure)), so a measure created from a table's menu is saved in that table.
3. Publish the model. Republishing replaces the semantic model in the service ([Republish or replace a semantic model](https://learn.microsoft.com/power-bi/create-reports/desktop-upload-desktop-files#republish-or-replace-a-semantic-model-published-from-power-bi-desktop)), and "any changes to the semantic model reflect in the report" ([Connect to semantic models in Power BI](https://learn.microsoft.com/power-bi/connect-data/desktop-report-lifecycle-datasets#considerations-and-limitations)).
4. Back in the report, put the model's measure wherever the report measure was: drag it from the Data pane into each well in place of the renamed one ([Create your first visualizations](https://learn.microsoft.com/power-bi/fundamentals/desktop-getting-started#create-your-first-visualizations)), into the Filters pane in place of each filter on it ([Add a filter to a report](https://learn.microsoft.com/power-bi/create-reports/power-bi-report-add-filter#filter-with-a-field-thats-not-in-the-visual)), and, for a visual sorted by it, choose it under More options (...), then Sort axis ([Change the visualization type](https://learn.microsoft.com/power-bi/visuals/power-bi-report-add-visualizations-i#change-the-visualization-type)). For each bookmark that captured it, select More options (...) next to the bookmark's name and choose Update ([Create report bookmarks](https://learn.microsoft.com/power-bi/create-reports/desktop-bookmarks#create-report-bookmarks)).
5. Delete the renamed report measure: right-click it in the Data pane and select Delete from model, the item step 1's check found on the same menu.

Lint again when you are done. A well, filter, sort, or bookmark that still names the report measure after step 5 is reported by `BROKEN_FIELD_REFERENCE`.

**If you cannot change the model,** keep the report measure: it is the supported route for an author who cannot change the model, as When to ignore it says.

## When to ignore it

A report measure is the supported route for an author who cannot change the model, and such a report can still reach pbiplint beside the model. When the model and the report share a workspace, Fabric Git integration always exports the report with a reference by path to the model. Microsoft describes keeping a second .pbir file that connects to the published model, so that the report opens in live connect to work with report-level measures, while definition.pbir, the file pbiplint reads, keeps its reference by path. If that is how the report is built and the model belongs to someone else, ignore the finding. When the model is yours to change, a measure rarely has a reason to stay in one report.

## Quirks

- The rule reports only when the model the report reads is in the input. A report whose definition.pbir connects to a published model is left alone on purpose: Microsoft presents report measures as the way an author who builds on a shared semantic model through a live connection, which cannot change the model itself, adds calculations of their own. Such a report is linted without a model, as is a report given on its own, and the skipped line gives the reason, such as `this report reads a published model` or `this report reads ../Sales.SemanticModel, which this run did not include`.
- pbiplint reads no annotation on a measure in reportExtensions.json, so the rule is turned off for a whole project rather than for one measure.
- A measure with an empty expression is reported like any other.
- As of Power BI Desktop 2.158 (September 2026), a report measure in a project that opens its model by path shows in the Data pane, but right-clicking it shows an error rather than its menu, so How to fix it removes it from reportExtensions.json for such a project. Once Desktop's menu works there, the Desktop route for a report connected live to a published model applies to such a project too, and the file step can go.

## Related rules

- `BROKEN_FIELD_REFERENCE` resolves a reference to a report measure while the report defines it, and reports one still naming the report's extension after the measure has moved.
- `NOT_REACHED_FROM_REPORT` counts the fields a report measure's DAX names as reached, so moving a measure that no visual shows into the model can put the measure on that rule's list.

## Links

- [Power BI Desktop project report folder, where reportExtensions.json holds report-level measures](https://learn.microsoft.com/power-bi/developer/projects/projects-report)
- [Measures in Power BI Desktop, including report-level measures](https://learn.microsoft.com/power-bi/transform-model/desktop-measures)
- [Tutorial: create your own measures in Power BI Desktop, including New measure on a table](https://learn.microsoft.com/power-bi/transform-model/desktop-tutorial-create-measures)
- [Managed self-service BI, the usage scenario where report creators build on a shared semantic model and create report-level measures](https://learn.microsoft.com/power-bi/guidance/powerbi-implementation-planning-usage-scenario-managed-self-service-bi)
- [Connect to semantic models in Power BI, including what a live connection lets a report author create](https://learn.microsoft.com/power-bi/connect-data/desktop-report-lifecycle-datasets)
- [Microsoft's reportExtension schema, the shape of reportExtensions.json and of a report measure's references](https://developer.microsoft.com/json-schemas/fabric/item/report/definition/reportExtension/1.0.0/schema.json)
- [Microsoft's semanticQuery schema, where a SourceRef names its schema and entity](https://developer.microsoft.com/json-schemas/fabric/item/report/definition/semanticQuery/1.4.0/schema.json)
