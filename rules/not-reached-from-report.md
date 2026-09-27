---
id: NOT_REACHED_FROM_REPORT
name: "Not reached from the report"
category: Maintenance
severity: info
scope: [Column, CalculatedColumn, CalculatedTableColumn, Measure]
status: builtin
layer: project
video:
sources:
---

# Not reached from the report

## What it checks

Columns and measures that nothing in the report reaches, directly or through the model. The walk starts from every field the report names, both columns of every relationship except one to an auto date/time table, the columns that row-level and object-level security name, the default column of every variation, the columns of an aggregation table (the ones with an `alternateOf` mapping), and the fields the report's own measures reference, and it follows DAX references, sort-by and group-by columns, the detail column or table each mapping names, and calculated tables until nothing new is reached.

A field the report names in a visual, a filter at any level, a drillthrough or tooltip page's fields, or a bookmark counts as reached, and a visual's wells, formatting, and sort are all read, so a measure shown only in a card's reference label or used only in conditional formatting is reached. The walk does not read a visual's mobile layout, so a field named only in its formatting is not. From a reached measure or calculated column, the walk reaches what its DAX references. From a reached column, it reaches the column's sort-by column, any column its `relatedColumnDetails` names in `groupByColumn`, the detail column or table its `alternateOf` mapping names in `baseColumn` or `baseTable`, and its table; a calculated table, once reached, adds what its expression references, and a calculation group adds what its items reference. A hierarchy level the report uses reaches the column behind it. A level of the date hierarchy that Power BI Desktop builds with Auto date/time is reached through the date column's variation, so it reaches the date column as well as the hidden table's column behind the level.

Each finding names the column or measure, as `'Sales'[Amount]` or `[Total Sales]`, with the measures first and then the columns, each in model order, so a dead chain reads from the measure nothing uses down to what only it used. The detail says why: `nothing in the report reaches it, and no measure or column references it`, or, for a field that only unreached fields use, `referenced only by [Total Sales], which nothing reaches either`. When a level of a user hierarchy is based on the column, so that removing the column changes that hierarchy, the detail goes on to name each such level, whether or not the report uses the hierarchy's other levels: `nothing in the report reaches it, and no measure or column references it; level "Quarter" of hierarchy "Calendar Hierarchy" uses it`.

## Example

The example runs against a model with one table, Sales, holding Amount and Region and the measure Total Sales.

```pbir fires visual.json
{
  "$schema": "https://developer.microsoft.com/json-schemas/fabric/item/report/definition/visualContainer/2.8.0/schema.json",
  "name": "c897ed0802274ab55e2d",
  "position": { "x": 580, "y": 520, "z": 3000, "height": 190, "width": 650, "tabOrder": 3000 },
  "visual": {
    "visualType": "tableEx",
    "query": {
      "queryState": {
        "Values": {
          "projections": [
            {
              "field": { "Column": { "Expression": { "SourceRef": { "Entity": "Sales" } }, "Property": "Region" } },
              "queryRef": "Sales.Region",
              "nativeQueryRef": "Region"
            }
          ]
        }
      }
    }
  }
}
```

```pbir fixed visual.json
{
  "$schema": "https://developer.microsoft.com/json-schemas/fabric/item/report/definition/visualContainer/2.8.0/schema.json",
  "name": "c897ed0802274ab55e2d",
  "position": { "x": 580, "y": 520, "z": 3000, "height": 190, "width": 650, "tabOrder": 3000 },
  "visual": {
    "visualType": "tableEx",
    "query": {
      "queryState": {
        "Values": {
          "projections": [
            {
              "field": { "Column": { "Expression": { "SourceRef": { "Entity": "Sales" } }, "Property": "Region" } },
              "queryRef": "Sales.Region",
              "nativeQueryRef": "Region"
            },
            {
              "field": { "Measure": { "Expression": { "SourceRef": { "Entity": "Sales" } }, "Property": "Total Sales" } },
              "queryRef": "Sales.Total Sales",
              "nativeQueryRef": "Total Sales"
            }
          ]
        }
      }
    }
  }
}
```

With only Region in the table, two findings come back: `[Total Sales]`, which nothing uses, and `'Sales'[Amount]`, which only Total Sales uses. Here the measure was meant to be in the table, so the fix adds it, and that reaches Amount through the measure's DAX. When a field really is unused, the fix is to delete it from the model, as How to fix it describes.

## Why it matters

A column earns its place in a model in one of two ways, Microsoft's modeling guidance says: a report filters, groups, or summarizes by it, or the model's structure needs it, for a relationship, a calculation, a security role, or formatting. A column that does neither can usually be removed, and an imported one is still loaded on every refresh and held in memory, where a smaller model refreshes faster and competes less for capacity. A measure nothing reaches adds no data to the model, but it sits in the Data pane beside the measures that matter, and the next author has to read it, keep it working through model changes, and guess whether something depends on it. The findings list what this report never touches, so that clean-up can start from evidence instead of a guess.

## How to fix it

Check first that nothing outside this report needs the field: another report built on the same model, a paginated report, or an Excel workbook that reads the model. Removing a column that something else uses breaks that thing, and pbiplint sees only the report in front of it.

Then remove the field from the model. In Power BI Desktop, right-click the measure or calculated column in the Data pane, or select it in Model view, and choose Delete from model. For a column that Power Query loads, open Power Query Editor, select the column in the table's query, and choose Remove Columns, so it is no longer loaded at all. If a hierarchy level uses the column, first select the hierarchy in Model view and, in the Properties pane, set its levels without that column, then select Apply Level Changes. In the TMDL files, delete the `measure` or `column` block from the table's file, and, for a column Power Query loads, remove it from the table's query as well. When the finding names a level of a user hierarchy, also delete that `level` block, which sits under its `hierarchy` block in the same file and names the column on its `column:` line, or point that `column:` at another column of the same table. A dead chain is listed from the top, the measure first and then the fields only it used, so one pass down the list removes all of it.

## When to ignore it

A measure kept for another report on the same model, or for people who analyze the model in Excel, is not dead because this report does not use it, and neither is a column that a paginated report or a workbook reads. When several reports share the model, a finding here says only that this report does not reach the field; weigh it against the others before deleting anything, and ignore it on the fields they need.

## Quirks

- The rule reads one report at a time. A model that several reports share lists, for each report, what that report does not reach, even when another report uses it.
- Both columns of a relationship, the columns that row-level and object-level security name, the default column of a variation, and the columns of an aggregation table that carry an `alternateOf` mapping are reached whether or not the report uses them, because the model needs them. A column that a reached column sorts by or groups by is reached too, and so is the detail column or table that an aggregation column's mapping names. Report queries name the detail table, and Power BI answers them from the aggregation table when that table covers the query, so a report can use the mapped columns without naming them. A column of an aggregation table with no mapping is treated like any other column.
- Calculated tables whose names start with `LocalDateTable_` or `DateTableTemplate_`, which pbiplint reads as Power BI Desktop's auto date/time tables the way `REMOVE_AUTO-DATE_TABLE` does, are left out of the findings, reached or not. Desktop manages these tables and keeps them hidden even from modelers, so there is nothing here to delete; turning Auto date/time off removes them, and `REMOVE_AUTO-DATE_TABLE` reports them. The relationship Desktop adds from a date column to its auto date/time table does not count as a use of the date column, so a date column the report never shows is still reported.
- `UNNECESSARY_MEASURES` and `UNNECESSARY_COLUMNS` keep the one-hop test of the ruleset they are ported from, so their results match Tabular Editor: they look only at hidden fields and at the model's own references. This rule reads the report and follows the chain as far as it goes, so it reports visible fields too, and a measure that only another unused measure references.
- DAX references are found by pattern, the way the model rules find them, so a field named inside a string or a comment of a reached measure counts as reached.
- A table that nothing reaches has no finding of its own. Each of its columns and measures is reported instead.
- The rule compares the report with its model, so it runs only when both are in the input.
- The rule also needs every file it reads the report's fields from: report.json (the report's filters), reportExtensions.json (the report's own measures), each page.json (a page's filters and its drillthrough or tooltip fields), each visual.json, and each bookmark file. While one of them cannot be read, such as a visual.json holding merge-conflict markers, a reportExtensions.json that is not valid JSON, or a file pbiplint could not open at all, the rule reports nothing, because that file may use any field in the model and pbiplint does not guess what a file it could not read says. A folder under the definition folder that pbiplint could not open counts as every file it could hold. The skipped line gives the reason, `a report file could not be read`, the file's own `PARSE_ISSUE` finding names it, or a notice does for a file or folder pbiplint could not open, and the Model line of Report at a glance says the count is unknown. pbiplint reads no field from version.json, pages.json, bookmarks.json, or a visual's mobile.json, which hold the report's format version, the order of its pages, the order and groups of its bookmarks, and a visual's mobile layout, so one of them that cannot be read, a merge conflict in pages.json included, does not stop the rule. Nor does a .platform or definition.pbir that cannot be read, or a JSON file of your own in the definition folder.
- The rule also needs the whole model. While a model file has a parse issue that can take a declaration out of the model, such as a line indented with spaces or a misspelt `table`, or pbiplint could not open a model file or folder at all, the rule reports nothing, because whatever only the missing declaration reaches, such as a measure that only its DAX uses, would read as reached by nothing. The skipped line gives the reason, `a model file could not be fully read`, the file's own `PARSE_ISSUE` finding names it, or a notice does for a file or folder pbiplint could not open, and the Model line of Report at a glance says the count is unknown. A `///` description with a blank line after it takes no declaration out, so it does not stop the rule. When a report file could not be read as well, the skipped line gives that reason instead.

## Related rules

- `UNNECESSARY_MEASURES` reports hidden measures that no DAX expression references, without reading the report, so it can flag a measure a visual uses, which this rule counts as reached.
- `UNNECESSARY_COLUMNS` makes the same one-hop test on hidden columns, and it too flags a hidden column that only a visual or a report filter uses.
- `BROKEN_FIELD_REFERENCE` looks the other way, at fields the report names that the model does not have.

## Links

- [Data reduction techniques for Import modeling, including removing unnecessary columns](https://learn.microsoft.com/power-bi/guidance/import-modeling-data-reduction)
- [Auto date/time in Power BI Desktop, including the hidden table and its Date Hierarchy](https://learn.microsoft.com/power-bi/transform-model/desktop-auto-date-time)
- [User-defined aggregations in Power BI, including how queries to the detail table are answered from the aggregation table](https://learn.microsoft.com/power-bi/transform-model/aggregations-advanced)
- [Power BI Desktop project report folder, which lists the files of a report's definition folder](https://learn.microsoft.com/power-bi/developer/projects/projects-report)
- [The Level class in the Tabular Object Model, a hierarchy level based on the values in a column](https://learn.microsoft.com/dotnet/api/microsoft.analysisservices.tabular.level)
- [TMDL overview on Microsoft Learn, including a hierarchy level's reference to its column](https://learn.microsoft.com/analysis-services/tmdl/tmdl-overview#named-object-references)
- [Configure hierarchies, the training unit that bases a hierarchy's levels on columns from its own table](https://learn.microsoft.com/training/modules/configure-semantic-model-power-bi/5-hierarchies)
- [Power BI Desktop tutorial that sets a hierarchy's levels in the Properties pane](https://learn.microsoft.com/power-bi/create-reports/desktop-dimensional-model-report#create-hierarchies)
