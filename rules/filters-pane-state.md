---
id: FILTERS_PANE_STATE
name: "Filters pane state differs from policy"
category: Report Design
severity: warning
scope: [Report]
status: builtin
layer: report
video:
sources:
---

# Filters pane state differs from policy

## What it checks

A report whose Filters pane, as saved in report.json, is not in the state the project's policy expects, open or closed. Without a policy the rule reports nothing.

The finding is on the report, as `Report`, at the report.json property that decides the pane's state, and its detail gives the saved state beside the expected one, as `saved open; the policy expects closed` or `saved hidden from readers; the policy expects open`. When report.json does not record the state, the finding sits on line 1 of report.json and its detail says the pane is read as open: `not recorded, read as open; the policy expects closed`.

## Example

The policy is set in `pbiplint.config.json`, and the config below applies to both documents: it asks for every report to open with the Filters pane closed.

```json pbiplint.config.json
{
  "rules": {
    "FILTERS_PANE_STATE": { "expect": "closed" }
  }
}
```

```pbir fires report.json
{
  "$schema": "https://developer.microsoft.com/json-schemas/fabric/item/report/definition/report/3.2.0/schema.json",
  "themeCollection": {
    "baseTheme": { "name": "Fluent2-CY26SU04", "type": "SharedResources" }
  },
  "objects": {
    "outspacePane": [
      {
        "properties": {
          "expanded": { "expr": { "Literal": { "Value": "true" } } }
        }
      }
    ]
  }
}
```

```pbir fixed report.json
{
  "$schema": "https://developer.microsoft.com/json-schemas/fabric/item/report/definition/report/3.2.0/schema.json",
  "themeCollection": {
    "baseTheme": { "name": "Fluent2-CY26SU04", "type": "SharedResources" }
  },
  "objects": {
    "outspacePane": [
      {
        "properties": {
          "expanded": { "expr": { "Literal": { "Value": "false" } } }
        }
      }
    ]
  }
}
```

The report was saved with the pane expanded, so the finding reads `saved open; the policy expects closed`. The fix collapses the pane before saving, which report.json records as `expanded` set to `false`.

## Why it matters

Power BI leaves it to the report's author whether the Filters pane is open or collapsed when a reader opens the report, and the choice is saved in the report file, so a save made with the pane in the other state changes it. An open pane puts the filters in front of readers; a collapsed one keeps them a click away. Either is a fair design, but a set of reports that open some one way and some the other looks unfinished, and the drift happens without anyone deciding it. A team that has settled on one state sets the policy, and the rule holds every report to it.

## How to fix it

In Power BI Desktop, collapse the Filters pane, or expand it for a policy of open, and save the report in that state. To keep the pane from readers altogether, select the eye icon next to Filters in the pane; that is a third state, which neither policy accepts.

In report.json, the state is `expanded` under `objects.outspacePane[0].properties`, as in the example: `false` saves the pane collapsed and `true` saves it open.

## When to ignore it

Only when the project has no single state its reports should open with, and then the right move is to set no policy, which leaves the rule silent, rather than to ignore findings one report at a time.

## Quirks

- The rule is silent until the policy is set.
- A report.json that does not record the pane's state is read as open, and the finding says so, `not recorded, read as open`, rather than claiming a saved state.
- The rule reads report.json. Without one in the input, or with one that cannot be read, it reports nothing under either policy, since nothing then says what state the pane is in.
- A pane hidden from readers, with the eye icon beside Filters, is a state of its own, so it satisfies neither `open` nor `closed`. pbiplint reads it from `visible` set to `false` under `objects.outspacePane`, and that decides the state whatever `expanded` says.
- A bookmark can carry its own Filters pane state, since the pane's open, closed, and visible states are all bookmarkable. The rule reads only the state saved in report.json.
- Hiding the Filters pane while you edit, with Filters on the View tab, changes only what Power BI Desktop shows you, not what readers see, so the rule does not read it.

## Related rules

- `SLICER_SELECTION_SAVED` is the other policy rule about the state a report opens in, a slicer saved with a selection.

## Links

- [Format filters in Power BI reports, including how to hide the Filters pane from readers](https://learn.microsoft.com/power-bi/create-reports/power-bi-report-filter)
