---
id: PARSE_ISSUE
name: "File could not be fully parsed"
category: Error Prevention
severity: error
scope: [File]
status: builtin
layer: project
video:
sources:
---

# File could not be fully parsed

## What it checks

Lines the TMDL parser could not use: space indentation, an unterminated code fence, a line at an impossible indentation, a line in no form the parser recognizes, a line at the root of a file that TMDL does not allow there (a misspelt `table`, a `column` or a property that lost its tabs, or an annotation with lines under it, for example), and a `///` description with a blank line between it and its declaration; a report JSON file that is not valid JSON or carries a merge conflict marker; and a report file Microsoft publishes a schema for, such as report.json or a page.json, whose content is not a JSON object.

Each finding names the file and the line and says what was wrong with it, as `space indentation (TMDL requires tabs): column Amount` or `"tabel" is not a type TMDL declares at the root of a file: tabel Sales`.

## Example

```tmdl fires
table Sales
    column Amount
        dataType: decimal
```

```tmdl fixed
table Sales
	column Amount
		dataType: decimal
```

The first snippet is indented with spaces, so both lines under the table are reported, and the model pbiplint checks has a Sales table with no columns.

```pbir fires page.json
{
  "$schema": "https://developer.microsoft.com/json-schemas/fabric/item/report/definition/page/2.1.0/schema.json",
  "name": "d3583278a4fc59eaa0d6",
<<<<<<< HEAD
  "displayName": "Sales overview",
=======
  "displayName": "Overview",
>>>>>>> rename-pages
  "displayOption": "FitToPage",
  "height": 720,
  "width": 1280
}
```

```pbir fixed page.json
{
  "$schema": "https://developer.microsoft.com/json-schemas/fabric/item/report/definition/page/2.1.0/schema.json",
  "name": "d3583278a4fc59eaa0d6",
  "displayName": "Sales overview",
  "displayOption": "FitToPage",
  "height": 720,
  "width": 1280
}
```

The second pair is a page.json saved in the middle of a merge, with both branches' names for the page still in it. Each of the three marker lines is reported, and nothing in the file is read until it is valid JSON again.

## Why it matters

pbiplint could not read the line, so whatever it declared, a column, a property, a measure, is missing from the model the rules see. Findings on that object and on anything that references it may be missing or wrong, and a result that looks clean may not be. A line at the root that TMDL does not allow there takes everything under it out of the model: a misspelt `table` takes the table's columns, measures, and partitions with it, and a column's property or annotation that lost its tabs takes the columns, measures, and partitions after it. The orphaned description is the mild case: no declaration is lost, only the description, which stops at the blank line instead of reaching the object below it, so that object is read as having none. Tabular Editor's TMDL reader is stricter and refuses to open a file that puts a blank line after a `///` line at all.

In a report, a JSON file that is not valid JSON, or that carries a conflict marker, is not read at all, and neither is a file Microsoft publishes a schema for, such as report.json, when its content is not a JSON object, so nothing in it reaches the rules. A visual whose visual.json fails is left out of every rule. A page whose page.json fails has no display name, size, visibility, or filters as far as the rules know, and nothing to say it is a tooltip or drillthrough page, so the rules that read those say nothing about it; its visuals sit in files of their own and are still checked, and an ignore annotation in the page.json no longer applies. A report.json that fails takes the report's theme, custom visuals, filters, and filter pane settings with it. None of those rules says what it could not read, so here too a result that looks clean may not be.

## How to fix it

Open the file at the reported line. TMDL is indented with tabs, and a fenced expression opens with three backticks (```) after the `=` and closes with three backticks on a line of its own. Only a few types sit at the root of a TMDL file, such as `table`, `relationship`, and `role`: correct the word the finding names, or, when it names something that belongs inside another object, such as a `column`, indent it one tab deeper than that object's line. A property or child object sits one tab deeper than the object it belongs to, and a multi-line expression one tab deeper than that object's properties, so check the lines under it by the same rule. A `///` description must sit directly above its declaration, with no blank line between them. Power BI Desktop writes valid TMDL, so a parse issue usually means a hand edit or a merge conflict marker. In a report JSON file, the finding names the file and the line where the JSON stops being valid, where a conflict marker sits, or where a document that is not a JSON object starts. Resolve the conflict or restore the JSON at that line. A file whose content is not an object needs its object restored, for example from version control: Microsoft's schema for each file it defines in a report's definition folder puts a JSON object at its root. Then reopen the report in Power BI Desktop to confirm that it loads.

## When to ignore it

Not on purpose. A parse issue means the model pbiplint checked is not the model in the file, or, in a report JSON file, that nothing the file defines was checked, so every other result on that file is in doubt until the line is fixed. The one exception is a line that Power BI Desktop wrote and opens without complaint and pbiplint still reports, in a TMDL file or a report JSON file: that is a gap in pbiplint's parser. Report it with the line. Until it is fixed, only the project-wide switch quiets it, and that also hides real parse issues, so weigh the two.

## Links

- [TMDL overview on Microsoft Learn](https://learn.microsoft.com/analysis-services/tmdl/tmdl-overview)
- [Microsoft's JSON schemas for the files in a report's definition folder](https://github.com/microsoft/json-schemas/tree/main/fabric/item/report/definition)
