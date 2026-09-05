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

A line in a TMDL file was not understood. The rest of the file was still analyzed, but findings in and around this line may be missing or wrong.

## How to fix it

Fix the line (TMDL uses tabs; close every ``` fence). The rest of the file is still analyzed.

## Links

- https://learn.microsoft.com/analysis-services/tmdl/tmdl-overview
