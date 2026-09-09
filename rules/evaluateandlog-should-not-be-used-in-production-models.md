---
id: EVALUATEANDLOG_SHOULD_NOT_BE_USED_IN_PRODUCTION_MODELS
name: "The EVALUATEANDLOG function should not be used in production models"
category: DAX Expressions
severity: info
scope: [Measure]
status: ported
video:
sources:
  - https://github.com/microsoft/Analysis-Services/blob/master/BestPracticeRules/BPARules.json
  - https://pbidax.wordpress.com/2022/08/16/introduce-the-dax-evaluateandlog-function/
---

# The EVALUATEANDLOG function should not be used in production models

## What it checks

Measures that call EVALUATEANDLOG.

## Why it matters

EVALUATEANDLOG is a debugging aid: in Power BI Desktop it emits a trace event with its argument on every evaluation so you can watch intermediate values. The service ignores it. Leaving it in a published model ships debug scaffolding that every reader has to look past, and anyone who opens the file in Desktop gets trace output they did not ask for.

## How to fix it

Remove the EVALUATEANDLOG wrapper and keep the expression inside it.

## Links

- https://github.com/microsoft/Analysis-Services/blob/master/BestPracticeRules/BPARules.json
- https://pbidax.wordpress.com/2022/08/16/introduce-the-dax-evaluateandlog-function/
