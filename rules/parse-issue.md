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

Lines the TMDL parser did not understand: space indentation, an unterminated ``` fence, or a line at an impossible indentation.

## Why it matters

The parser skipped the line, so whatever it declared, a column, a property, a measure, is missing from the model the rules see. Findings on that object and on anything that references it may be missing or wrong, and a result that looks clean may not be.

## How to fix it

Open the file at the reported line. TMDL is indented with tabs, and expression blocks open and close with ``` on their own lines. Power BI Desktop writes valid TMDL, so a parse issue usually means a hand edit or a merge conflict marker.

## Links

- https://learn.microsoft.com/analysis-services/tmdl/tmdl-overview
