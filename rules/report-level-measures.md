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

```pbir fixed reportExtensions.json
{
  "$schema": "https://developer.microsoft.com/json-schemas/fabric/item/report/definition/reportExtension/1.0.0/schema.json",
  "name": "extension",
  "entities": []
}
```

The report defines Sales per Region for itself, on the Sales table, so the finding reads `[Sales per Region] (report)` with `defined in the report on table "Sales"`. The fixed file shows the report's side of the move: once the measure is in the model's Sales table, as How to fix it describes, the report defines none.

## Why it matters

A report measure is a calculation created directly within a report, without altering the semantic model, so the model never carries it and only the report that defines it can use it. Another report on the same model does not have it. When the model is in your hands, as it is when the report reads it by path from the same project, a calculation kept in one report splits the model's logic in two: the next author looking for it in the model does not find it, and a second report that needs it gets a copy of its own, free to drift from the first.

pbiplint checks such a measure less well too. Its DAX rules read the model's measures only, so none of them looks at a report measure's expression, and `BROKEN_FIELD_REFERENCE` does not report a field that a report measure's DAX names and the model lacks.

## How to fix it

What to do depends on whether you can change the model.

**If you can change the model,** move the measure into it with the same name, on the same table, with the same DAX, then point the report at it. In Power BI Desktop:

1. In the report, note the measure's DAX and any format it sets, then rename it so the model's measure can take its name: right-click it in the Data pane and select Rename ([Learn DAX by using quick measures](https://learn.microsoft.com/power-bi/transform-model/desktop-quick-measures#learn-dax-by-using-quick-measures) shows Rename on a measure's menu). Microsoft's schema for report measures asks that a report measure's name be unique across the model, so the two should not exist side by side under one name.
2. Open the model itself in Power BI Desktop, from its own project or file: in a report that connects live to a model, "left navigation and modeling are disabled" ([Connect to semantic models in Power BI](https://learn.microsoft.com/power-bi/connect-data/desktop-report-lifecycle-datasets#considerations-and-limitations)). Right-click the table in the Data pane, or hover over it and select More options (...), choose New measure, and type the name and the DAX into the formula bar. Microsoft notes that this "saves your new measure in the Sales table" for its example ([Create a measure](https://learn.microsoft.com/power-bi/transform-model/desktop-tutorial-create-measures#create-a-measure)), so a measure created from a table's menu is saved in that table.
3. Publish the model. Republishing replaces the semantic model in the service ([Republish or replace a semantic model](https://learn.microsoft.com/power-bi/create-reports/desktop-upload-desktop-files#republish-or-replace-a-semantic-model-published-from-power-bi-desktop)), and "any changes to the semantic model reflect in the report" ([Connect to semantic models in Power BI](https://learn.microsoft.com/power-bi/connect-data/desktop-report-lifecycle-datasets#considerations-and-limitations)).
4. Back in the report, put the model's measure wherever the report measure was: drag it from the Data pane into each well that held the renamed one ([Create your first visualizations](https://learn.microsoft.com/power-bi/fundamentals/desktop-getting-started#create-your-first-visualizations)), into the Filters pane in place of each filter on it ([Add a filter to a report](https://learn.microsoft.com/power-bi/create-reports/power-bi-report-add-filter#filter-with-a-field-thats-not-in-the-visual)), and, for a visual sorted by it, choose it under More options (...), then Sort axis ([Change the visualization type](https://learn.microsoft.com/power-bi/visuals/power-bi-report-add-visualizations-i#change-the-visualization-type)). For each bookmark that captured it, select More options (...) next to the bookmark's name and choose Update ([Create report bookmarks](https://learn.microsoft.com/power-bi/create-reports/desktop-bookmarks#power-bi-service)).
5. Delete the renamed report measure: right-click it in the Data pane and select Delete from model ([Learn DAX by using quick measures](https://learn.microsoft.com/power-bi/transform-model/desktop-quick-measures#learn-dax-by-using-quick-measures) shows Delete from model on a measure's menu).

Lint again when you are done. A well, filter, sort, or bookmark that still names the report measure after step 5 is reported by `BROKEN_FIELD_REFERENCE`.

**If you cannot change the model,** keep the report measure: it is the supported route for an author who cannot change the model, as When to ignore it says.

## When to ignore it

A report measure is the supported route for an author who cannot change the model, and such a report can still reach pbiplint beside the model. When the model and the report share a workspace, Fabric Git integration always exports the report with a reference by path to the model. Microsoft describes keeping a second .pbir file that connects to the published model, so that the report opens in live connect to work with report-level measures, while definition.pbir, the file pbiplint reads, keeps its reference by path. If that is how the report is built and the model belongs to someone else, ignore the finding. When the model is yours to change, a measure rarely has a reason to stay in one report.

## Quirks

- The rule reports only when the model the report reads is in the input. A report whose definition.pbir connects to a published model is left alone on purpose: Microsoft presents report measures as the way an author who builds on a shared semantic model through a live connection, which cannot change the model itself, adds calculations of their own. Such a report is linted without a model, as is a report given on its own, and the skipped line gives the reason, such as `this report reads a published model` or `this report reads ../Sales.SemanticModel, which this run did not include`.
- pbiplint reads no annotation on a measure in reportExtensions.json, so the rule is turned off for a whole project rather than for one measure.
- A measure with an empty expression is reported like any other.

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
