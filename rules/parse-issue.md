---
id: PARSE_ISSUE
name: "TMDL could not be fully parsed"
category: Error Prevention
severity: error
scope: [File]
status: builtin
video:
sources:
  - https://learn.microsoft.com/analysis-services/tmdl/tmdl-overview
---

# TMDL could not be fully parsed

## What it checks

Lines the TMDL parser could not use: space indentation, an unterminated code fence, a line at an impossible indentation, a line in no form the parser recognizes, and a `///` description with a blank line between it and its declaration.

## Why it matters

The parser skipped the line, so whatever it declared, a column, a property, a measure, is missing from the model the rules see. Findings on that object and on anything that references it may be missing or wrong, and a result that looks clean may not be. The orphaned description is the mild case: no declaration is lost, only the description, which stops at the blank line instead of reaching the object below it, so that object is read as having none. Tabular Editor's TMDL reader is stricter and refuses to open a file that puts a blank line after a `///` line at all.

## How to fix it

Open the file at the reported line. TMDL is indented with tabs, and expression blocks open and close with ``` on their own lines. A `///` description must sit directly above its declaration, with no blank line between them. Power BI Desktop writes valid TMDL, so a parse issue usually means a hand edit or a merge conflict marker.

## Links

- https://learn.microsoft.com/analysis-services/tmdl/tmdl-overview
