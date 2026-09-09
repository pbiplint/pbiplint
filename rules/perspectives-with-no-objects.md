---
id: PERSPECTIVES_WITH_NO_OBJECTS
name: "Perspectives with no objects"
category: Maintenance
severity: info
scope: [Perspective]
status: ported
video:
sources:
  - https://github.com/microsoft/Analysis-Services/blob/master/BestPracticeRules/BPARules.json
---

# Perspectives with no objects

## What it checks

Perspectives that contain no tables. Adding any column, measure, or hierarchy to a perspective adds its table, so a perspective with no tables is empty.

## Why it matters

An empty perspective still shows up in clients that offer perspectives, such as Excel, as a named view of the model that contains nothing. It is either an abandoned start or the remains of objects that were removed, and it leaves the next person asking what it was for.

## How to fix it

Add the objects the perspective should show, or delete its file from the `perspectives` folder. Power BI Desktop does not manage perspectives, so they appear only in models built or edited with other tools.

## Links

- https://github.com/microsoft/Analysis-Services/blob/master/BestPracticeRules/BPARules.json
