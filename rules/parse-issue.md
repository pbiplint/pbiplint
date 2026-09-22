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

Lines the TMDL parser could not use: space indentation, an unterminated code fence, a line at an impossible indentation, a line in no form the parser recognizes, and a `///` description with a blank line between it and its declaration; and a report JSON file that is not valid JSON or carries a merge conflict marker.

Each finding names the file and the line and says what was wrong with it, as `space indentation (TMDL requires tabs): column Amount`.

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

## Why it matters

The parser skipped the line, so whatever it declared, a column, a property, a measure, is missing from the model the rules see. Findings on that object and on anything that references it may be missing or wrong, and a result that looks clean may not be. The orphaned description is the mild case: no declaration is lost, only the description, which stops at the blank line instead of reaching the object below it, so that object is read as having none. Tabular Editor's TMDL reader is stricter and refuses to open a file that puts a blank line after a `///` line at all.

## How to fix it

Open the file at the reported line. TMDL is indented with tabs, and expression blocks open and close with ``` on their own lines. A `///` description must sit directly above its declaration, with no blank line between them. Power BI Desktop writes valid TMDL, so a parse issue usually means a hand edit or a merge conflict marker.

## When to ignore it

Not on purpose. A parse issue means the model pbiplint checked is not the model in the file, so every other result on that file is in doubt until the line is fixed. The one exception is a line that Power BI Desktop wrote and opens without complaint and pbiplint still reports: that is a gap in pbiplint's parser. Report it with the line. Until it is fixed, only the project-wide switch quiets it, and that also hides real parse issues, so weigh the two.

## Links

- [TMDL overview on Microsoft Learn](https://learn.microsoft.com/analysis-services/tmdl/tmdl-overview)
