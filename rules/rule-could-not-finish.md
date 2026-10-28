---
id: RULE_COULD_NOT_FINISH
name: "Rule could not finish"
category: Error Prevention
severity: error
scope: [Model, Table, Partition, NamedExpression, Report]
status: builtin
layer: project
video:
sources:
---

# Rule could not finish

## What it checks

A rule that stopped partway through an object or query, because pbiplint met input it could not handle. Each finding names the rule, the object or query, and the kind of error. This is a bug in pbiplint, not a fault in the model, and the rule's findings on that object or query are missing.

The finding's detail reads `<RULE_ID> could not finish on <where>: <kind of error>`, as in `LOCAL_DRIVE_PATH could not finish on query 'Sales': TypeError`. The error's own message is left out, since it can carry text from the model, such as a value in a query, so only its kind is shown: `TypeError`, `RangeError`, or `RangeError (out of stack space)` when the rule ran out of stack space, as deeply nested M can make it. The object is the query's partition, its shared expression, or, for an incremental refresh policy's query, its table. A rule that stopped outside any one query names the model, or the report for a report rule. A rule that fails on several objects has a finding on each.

## Why it matters

The named rule did not finish on that object, so its findings there are missing, and a clean result for that rule on that object means nothing. The finding is an error so that a gated run, in CI or in a pull request, fails instead of passing with a rule incomplete.

## How to fix it

The fix is a pbiplint release. Until it ships, there are three ways to let a gated run pass:

- Lower this rule's severity in `pbiplint.config.json`, with `"RULE_COULD_NOT_FINISH": "warning"` under `rules`. Every finding still shows, and the default gate, which fails on errors, passes.
- Turn off the rule the finding names, as in `"LOCAL_DRIVE_PATH": "off"` under `rules`. A rule that is off never runs, so it cannot fail, and its findings are gone from every object until you turn it back on.
- Add `annotation pbiplint.ignore = RULE_COULD_NOT_FINISH` under the object the finding names, in its TMDL file. Naming the failed rule's id instead, as in `annotation pbiplint.ignore = LOCAL_DRIVE_PATH`, drops this finding there too, along with that rule's other findings on the object. A finding on the report has nowhere to carry an annotation, so use one of the other two there.

With the severity lowered or the object annotated, the rule still runs and still fails, so the run's summary and notices still name it.

To get it fixed, open an issue with the template linked below. Name the rule, the object or query, and pbiplint's version (`pbiplint --version`), and attach the smallest file that shows it, with every name, value, and address that is not yours to share replaced first. The finding's detail holds only the rule, the object's name, and the kind of error, never a query's M or a value from the model, so the object's name is the one thing in it to check before posting.

## When to ignore it

While a fix ships, on a project whose gate must pass. Never silence it for good: the named rule stays incomplete on that object for as long as the finding is hidden, so take the way out off again once a release fixes it.

## Links

- [Report a rule that could not finish](https://github.com/pbiplint/pbiplint/issues/new?template=rule-could-not-finish.md)
