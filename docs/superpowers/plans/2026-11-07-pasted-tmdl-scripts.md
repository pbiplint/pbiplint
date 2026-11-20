# Pasted TMDL scripts (#274) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The home page's Paste TMDL box, and a single `.tmdl` file named on the command line, lint a script copied from Power BI Desktop's TMDL view as the model it describes, lint a partial paste correctly, and never drop a line without a `PARSE_ISSUE`.

**Issue:** #274. Its table of shapes, its "Why", and its boxes are the spec.

**Architecture:** Three small changes in core, one in the site. The parser treats a root `createOrReplace` as a holder of the model's own declarations, as it treats a root `model`, except in a file under a `TMDLScripts/` folder. `modelDeclarations` reads what such a holder holds, and a `ref table X` line with lines under it merges into table X or creates it. The engine skips the rules that need the whole model when the input declares no `model`, with a reason of its own on the skipped line, and reports nothing on a table the input knows only from `ref table` lines.

**Tech stack:** TypeScript (core, browser-pure), Vitest, Playwright.

## What Microsoft says

- A TMDL script is a command followed by "One or more *semantic model objects* using TMDL language definition or reference" ([TMDL scripts](https://learn.microsoft.com/analysis-services/tmdl/tmdl-scripts)). `createOrReplace` is the only command the page documents ([CreateOrReplace command](https://learn.microsoft.com/analysis-services/tmdl/tmdl-scripts#createorreplace-command)), and "The semantics of TMDL language are applied to objects within the *createOrReplace* command. For example, it's possible to split the object definition into multiple segments" (same section). Its example puts a measure under `ref table Sales` beside a full `table Product`.
- TMDL view scripts a dragged object "as a [*createOrReplace*] TMDL script of the selected objects", and Script TMDL writes the same "to new tab or to the clipboard" ([Script to TMDL](https://learn.microsoft.com/power-bi/transform-model/desktop-tmdl-view#script-to-tmdl)).
- "each script tab is saved as a .tmdl file in the *\TMDLScripts* folder" of a project ([TMDL script tabs](https://learn.microsoft.com/power-bi/transform-model/desktop-tmdl-view#tmdl-script-tabs)). Neither the CLI's walk nor the site's folder reader reads that folder for a project; both read the definition folder.
- Microsoft's TMDL reader reads a declaration under `ref table X` as part of table X, and creates X when the model has none (#139).

## The shapes TMDL view writes

Survey of the 125 `.tmdl` files in `TMDLScripts/` folders in the local corpora: every script opens with `createOrReplace`, and the lines directly under it are `function` (139), `ref table` (33), `table` (31), `model` (17, the whole model scripted, with its tables under it), `relationship` (12), `role` (4), `perspective` (1), and one indented `createOrReplace`. No `ref` of any other type has lines under it.

## Decisions taken here (recorded in the working folder's decisions file)

1. **Where a script is the model.** In every file except one under a `TMDLScripts/` folder (matched as a path segment). A paste is `pasted.tmdl`; a single file named on the command line is its base name, so both read their scripts. A project's own script tabs never reach core today, and a loose-file walk that meets a `TMDLScripts/` folder keeps them out, as today. Rejected: "a script is the model when the input is one file", which drops a folder of scripts silently.
2. **What counts as a partial input.** No file of the model input declares a `model` (at the root, under a `database`, or under a script's `createOrReplace`). Power BI Desktop always writes `model.tmdl`, so a saved project is never partial; a paste of a table, a few measures, or a TMDL view script of some objects is. A hand-made definition folder with no `model.tmdl` is partial too, which is the honest reading: pbiplint cannot tell what such a folder leaves out.
3. **Which rules a partial input skips.** Exactly the rules whose `skipWhenModelUnread` is `modelPartlyRead`: the rules whose finding asserts that something is absent from the whole model, or reads a share of all of it (helpers.ts). Every other rule reports something present in the paste, which stays true whatever the rest of the model holds. The 15, with the reason each needs the whole model:

   | Rule | Needs the whole model because |
   | --- | --- |
   | `MODEL_SHOULD_HAVE_A_DATE_TABLE` | The date table may be outside the paste. |
   | `ISAVAILABLEINMDX_FALSE_NONATTRIBUTE_COLUMNS` | A use of the column (sort by, hierarchy, variation) may be outside the paste. |
   | `AVOID_EXCESSIVE_BI-DIRECTIONAL_OR_MANY-TO-MANY_RELATIONSHIPS` | A share of all relationships. |
   | `MODEL_USING_DIRECT_QUERY_AND_NO_AGGREGATIONS` | The aggregations may be outside the paste. |
   | `REMOVE_REDUNDANT_COLUMNS_IN_RELATED_TABLES` | The related tables may be outside the paste. |
   | `MEASURES_USING_TIME_INTELLIGENCE_AND_MODEL_IS_USING_DIRECT_QUERY` | The model's storage mode is a property of all its tables. |
   | `DAX_COLUMNS_FULLY_QUALIFIED` | Which table holds a column may be outside the paste. |
   | `INACTIVE_RELATIONSHIPS_THAT_ARE_NEVER_ACTIVATED` | The `USERELATIONSHIP` call may be outside the paste. |
   | `UNNECESSARY_COLUMNS` | A use may be outside the paste. |
   | `UNNECESSARY_MEASURES` | A use may be outside the paste. |
   | `REMOVE_DATA_SOURCES_NOT_REFERENCED_BY_ANY_PARTITIONS` | The partition may be outside the paste. |
   | `ENSURE_TABLES_HAVE_RELATIONSHIPS` | The relationships may be outside the paste. |
   | `NOT_REACHED_FROM_REPORT` | A use may be outside the paste. |
   | `UDF_NOT_CALLED` | The call may be outside the paste. |
   | `NAME_WITHOUT_TRANSLATION` | The cultures may be outside the paste. |

   Each is counted on the skipped line as `N rules skipped (the input is part of a model)`, beside `rules skipped (no report in the input)`, with the reason `partOfModel` in `rulesSkipped`. A model that is also partly read gives that reason instead, `modelFileUnread`, as today.
4. **Rule pages stay as written.** Their examples show a table or two; the rule-page test reads each beside a `model.tmdl`. Pasted alone, such an example skips a whole-model rule, and the skipped line says why. Editing the pages would change the help text in the SARIF output the CLI's contract goldens hold.
5. **A table known only from `ref table` lines.** Its declaration is elsewhere, so nothing is reported on the table itself (its description, its partitions, its name); everything under it is linted, as the user pasted it. The rules gated by `tablesPartlyRead` are not skipped for it: that would skip `PROVIDE_FORMAT_STRING_FOR_MEASURES` and `NUMERIC_COLUMN_SUMMARIZE_BY` on the one-measure paste TMDL view writes, which is the miss #274 reports.
6. **The skipped line's text lives in `packages/core/src/format/text.ts`,** one of the held files: four added lines in `skippedLine`, nothing else there. Recorded under "For the held PRs" in the decisions file before it is committed.

## Files

- `packages/core/src/tmdl/script.ts` (new): `readsScript(path)`, the `TMDLScripts/` rule, shared by the parser and the model.
- `packages/core/src/tmdl/parse.ts`: a root `createOrReplace` in such a file is a holder (`"script"`), a `model` under it is a model holder; the checks that run on the root and under a model run under it; the child-type check (#144) runs under a script and under `ref table`; a table's object with no `table` line gets the new message; a `ref` of another type with lines under it, and a property under a script, are issues.
- `packages/core/src/messages/en.ts`: `parse.tmdl.needsTable`, `parse.tmdl.refLinesUnder`.
- `packages/core/src/model/build.ts`: `modelDeclarations` reads a script holder's declarations; `readDeclaration` reads `ref table` with lines under it; `Model.partial`, `Table.refOnly`.
- `packages/core/src/model/types.ts`: the two fields.
- `packages/core/src/engine/run.ts`: the `partOfModel` reason; no finding on a `refOnly` table.
- `packages/core/src/format/text.ts` (held file, four lines): the skipped line.
- `packages/core/test/rule-pages.test.ts`: each TMDL example is linted beside a `model.tmdl`, as one file of a whole model. The pages themselves stay as they are: a page's help text reaches the SARIF output that the CLI's one-project goldens hold byte for byte, and those are never re-recorded.
- `rules/parse-issue.md`: the two new messages, if the page lists messages.
- `packages/web/index.html`: a line under the Paste TMDL label saying a script copied from TMDL view works.
- Tests: `packages/core/test/pasted-scripts.test.ts` (new), `packages/cli/test/tmdl-scripts.test.ts` (new), `packages/web/e2e/paste-scripts.spec.ts` (new); `home.spec.ts` and `site.spec.ts` are held.

## Tasks

### Task 1: Failing tests through `lint()`

The paste box calls `lint([{ path: "pasted.tmdl", text }])`; the CLI calls it with `[{ path: "<name>.tmdl", text }]` for one file. Every test goes through `lint`.

- [x] Write `packages/core/test/pasted-scripts.test.ts` with:
  - **Row 1:** a table under `createOrReplace` (a measure with no format string, a `double` column summarized by sum, an M partition reading a `C:\` path) gives the same findings as the same table with no wrapper, among them `NUMERIC_COLUMN_SUMMARIZE_BY`, `PROVIDE_FORMAT_STRING_FOR_MEASURES`, `LOCAL_DRIVE_PATH`, and not `MODEL_SHOULD_HAVE_A_DATE_TABLE`; both give `partOfModel` skips for the 15 rules.
  - **The Customer pair:** `examples/messy-sales/Messy Sales Demo.SemanticModel/definition/tables/Customer.tmdl` as written, and as TMDL view writes it (`createOrReplace`, a blank line, every line one tab deeper), give the same findings.
  - **Row 2:** one measure under `createOrReplace` and `ref table Sales` gives `PROVIDE_FORMAT_STRING_FOR_MEASURES` on `[X]`, and no finding on the table Sales.
  - **Row 3:** a root `ref table Sales` with a measure under it gives the same as row 2.
  - **Merge:** `table Sales` and, in the same paste, `createOrReplace` / `ref table Sales` / a measure, give one table Sales with both, and findings on the table itself.
  - **Row 4:** a measure alone, a column alone, and a measure directly under `createOrReplace` each give a `PARSE_ISSUE` with the new message, which names the `table` line and TMDL view.
  - **Row 5:** two complete tables read as today.
  - **Whole model scripted:** `createOrReplace` / `model Model` / tables under it is not partial: `MODEL_SHOULD_HAVE_A_DATE_TABLE` runs.
  - **Nothing silent:** under `createOrReplace`, a property line, a misspelt `tabel X`, a `ref role X` with lines under it, and a misspelt `measur` under `ref table Sales` each give a `PARSE_ISSUE`.
  - **TMDLScripts:** the same script at `TMDLScripts/Script 1.tmdl` beside a `model.tmdl` adds nothing to the model and no issue.
  - **The skipped line** says `rules skipped (the input is part of a model)`.
- [x] Run them; each fails for the reason in #274.

### Task 2: The parser

- [x] `tmdl/script.ts`: `readsScript(path)` is false for a path with a `TMDLScripts` segment.
- [x] In `parseTmdl`, when `readsScript(file)`: a root `createOrReplace` declaration is a holder `"script"`; a `model` directly under it is a holder `"model"`; `KEEPS_READING` holds `createOrReplace` only in a file that does not read scripts.
- [x] Under a script holder: a declaration of a type a table holds (`allowsChild("table", word)`) gets `parse.tmdl.needsTable`; any other declaration that is neither a model child type nor `model` gets `parse.tmdl.notChildType` with `under: "createOrReplace"`; a property or an expression with no name gets `parse.tmdl.propertyAtRoot`'s sibling wording if the existing text fits, else reuse it; `noName` applies as at the root.
- [x] At the root, a declaration of a type a table holds gets `parse.tmdl.needsTable` in place of `notRootType`.
- [x] The child-type check (#144) runs under a `ref table` line as under a `table` line.
- [x] In the closing loop, a `ref` line of a type other than `table` with lines under it, at the root, under a model, or under a script, gets `parse.tmdl.refLinesUnder`.
- [x] `npx vitest run packages/core/test/parse.test.ts` stays green; the parse rows of Task 1 pass.

### Task 3: The model

- [x] `modelDeclarations`: a script holder's children follow it, and a `model` among them is read as a root model is.
- [x] `readDeclaration`: a `ref table` with lines under it goes through `buildTable`, which records whether a table has any `table` declaration; one with none is `refOnly`.
- [x] `buildModel` sets `Model.partial` when no declaration it read is a `model`.
- [x] The build test "reads no model under a culture's translations or a TMDL script" keeps its `TMDLScripts/` path and passes unchanged.

### Task 4: The engine and the skipped line

- [x] `run.ts`: a rule whose `skipWhenModelUnread` holds is skipped as today; else a rule whose `skipWhenModelUnread` is `modelPartlyRead` on a `partial` model is skipped with `partOfModel`.
- [x] `keep`: a finding whose object is a `refOnly` table is not kept and not counted as ignored.
- [x] `text.ts`: `skippedLine` adds `N rules skipped (the input is part of a model)`.
- [x] All of Task 1 passes.

### Task 5: Existing tests and rule pages

- [x] Run the whole suite. For each failing whole-model test with no `model` line, add a `model.tmdl` to its input; never weaken an assertion. The rule-page test reads each example beside a `model.tmdl`.
- [x] `node scripts/sync-rule-pages.mjs`; commit the regenerated data files.
- [x] `rules/parse-issue.md`: name the two new cases if the page lists cases.

### Task 6: TMDLScripts in a project, pinned

- [x] `packages/cli/test/tmdl-scripts.test.ts`: a temporary `.SemanticModel` folder with `definition/model.tmdl`, `definition/tables/Sales.tmdl`, and `TMDLScripts/Script 1.tmdl` holding a script that declares `table Extra`; the CLI's JSON output names no `Extra` and no `PARSE_ISSUE`.

### Task 7: The paste box

- [x] `packages/web/index.html`: under the Paste TMDL heading, a short line tied to the textarea with `aria-describedby`: any complete TMDL works, a table's file or a script copied from TMDL view (Script TMDL). Update `packages/web/test/home.test.ts` only where it pins the panel's text.
- [x] `packages/web/e2e/paste-scripts.spec.ts`: paste the Customer table as TMDL view writes it and see the same summary line as the plain file; paste one measure under `ref table` and see `PROVIDE_FORMAT_STRING_FOR_MEASURES`.

### Task 8: Checks, review, PR

- [x] `npm run build`, `npm run typecheck`, `npm run lint`, `npm test`, `npm run check:browser`, `npm run test:e2e`.
- [x] One whole-branch review; fix what it finds that meets the bar.
- [ ] PR body: "For #274.", the release note line for "What can change in your results", no closing keyword next to an issue number.

## Release note line

What can change in your results: a TMDL script copied from Power BI Desktop's TMDL view, pasted into pbiplint.com or named on the command line, now gives the findings of the objects it holds; a paste or single file that declares no `model` skips the rules that need the whole model, and says so on the skipped line.

## Left out

- `ref` lines of other types with declarations under them are reported, not merged: no real script has one.
- A project's `TMDLScripts/` tabs are not linted: they are scratch work, not the model.
