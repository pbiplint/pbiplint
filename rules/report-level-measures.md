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

Move the measure into the model, with the same name, on the same table, with the same DAX. Take its `name` and `expression` from its entry in reportExtensions.json, with any other property it sets, such as `formatString`, `displayFolder`, `description`, `hidden`, or `dataCategory`. A report that reads its model by path opens that model for editing in Power BI Desktop: right-click the table in the Data pane, or hover over it and select More options (...), choose New measure, and type the name and the DAX into the formula bar. A measure created from a table's menu is saved in that table. In the model's TMDL, the same measure is a `measure` under the table in its file, as `measure 'Sales per Region' = DIVIDE([Total Sales], DISTINCTCOUNT('Sales'[Region]))`, with its other properties set to match.

Then point the report at the model's measure. A reference to a report measure names the report's extension: its `SourceRef` carries `"Schema": "extension"` beside the `Entity`, where a reference to a model measure has no `Schema`. Microsoft's schemas describe the key: in a query, `Schema` is "the name of the schema containing the referenced entity" and can be left out, and where a report measure lists the measures its DAX uses, the schema is left empty for a model measure and set to the extension's name for one of the extension's own. So every visual, filter, sort, and bookmark that used the measure still names it in the extension after the move. In Power BI Desktop, rebind each of them to the model's measure from the Data pane. In the report's JSON, remove the `"Schema": "extension"` key from every reference to the measure: the projections, filters, and sort in each visual.json, and the bookmarks.

Then delete the measure's entry from reportExtensions.json, and the entity with it when it holds no other measure, as in the example. The schema for reportExtensions.json asks that a report measure's name be unique across the model, so the report's copy should go as soon as the model has the measure.

Lint again when you are done. `BROKEN_FIELD_REFERENCE` reports every reference still naming the extension, as `[Sales per Region]: no measure named "Sales per Region" on "Sales" in the report's extension`.

## When to ignore it

A report measure is the supported route for an author who cannot change the model, and such a report can still reach pbiplint beside the model. When the model and the report share a workspace, Fabric Git integration always exports the report with a reference by path to the model. Microsoft describes keeping a second .pbir file that connects to the published model, so that the report opens in live connect to work with report-level measures, while definition.pbir, the file pbiplint reads, keeps its reference by path. If that is how the report is built and the model belongs to someone else, ignore the finding. When the model is yours to change, a measure rarely has a reason to stay in one report.

## Quirks

- The rule reports only when the model the report reads is in the input. A report whose definition.pbir connects to a published model is left alone on purpose: Microsoft presents report measures as the way an author who builds on a shared semantic model through a live connection, which cannot change the model itself, adds calculations of their own. Such a report is linted without a model, as is a report given on its own, and the skipped line gives the reason, such as `this report reads a published model` or `no model in the input`.
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
