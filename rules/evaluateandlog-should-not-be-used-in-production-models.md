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

The EVALUATEANDLOG function is meant to be used only in development/test environments and should not be used in production models.

## How to fix it

Remove EVALUATEANDLOG before deploying.

## Links

- https://github.com/microsoft/Analysis-Services/blob/master/BestPracticeRules/BPARules.json
- https://pbidax.wordpress.com/2022/08/16/introduce-the-dax-evaluateandlog-function/
