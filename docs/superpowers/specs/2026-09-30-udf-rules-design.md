# DAX user-defined functions: what #115 builds

Issue #115, milestone 0.2.2. Written September 30, 2026. Phase 1: the design, for the orchestrator's rulings and Michael's decisions. Section 10 lists what is still open.

## 1. Sources and decisions

- **The issue.** #115 lists its items as written on September 27, 2026, from the UDF research (`.superpowers/research/2026-09-27-dax-udf-linting/reports/DAX UDF linting.md`, git-ignored). #152 names what the release must explain.
- **Michael's steering for 0.2.2.** Every item is weighed against the bar he set on September 30, 2026: a DAX shape gets code only when real files show it (the corpus or a user report) or Power BI Desktop writes it, and a check with no real-file evidence and no clear user value is dropped. Nothing dropped here becomes a follow-up issue.
- **Michael's decision of September 30, 2026** (the #115 comment of that day): the check for a column an expression creates is built once, in this issue, for every kind of DAX (section 3).
- **#108** (PR #155) gives the tokenizer reader this builds on: `refsInTokens`, `functionCallReader`, and the index that tokenizes each owner once.
- **The measurements.** The #104 research corpus (1,317 models, 17 of them with functions: 13 saved by Desktop and 4 written by agents, in 12 repositories, 386 functions, 265 of them from DAX Lib packages); the corpus repositories' reports fetched for #108 (324 projects with a model and a PBIR report); the DAX Lib registry as of its September 24, 2026 commit (133 package files, 2,064 function declarations, all hand-written TMDL); and Tabular Editor CLI 0.7.1.2, both its BPA with Microsoft's rules and its built-in rules, and its TMDL reader. The ledger at `.superpowers/sdd/2026-09-30-udf-rules/progress.md` (git-ignored) keeps every count and ruling.

## 2. What gets built, by pull request

| Pull request | What it holds | Deviations recorded | Copy |
|---|---|---|---|
| 1. Columns an expression creates | Section 3: the reader tells a bare name for a column the same DAX creates from a model column, for every kind of DAX | None: every finding it moves moves toward Tabular Editor | None; the deviation count stays at five |
| 2. User-defined function rules | Section 4: the `Function` object kind; sections 5 and 6: UDF_NOT_CALLED, UDF_USE_COMPOUND_NAMES, UDF_WITHOUT_DESCRIPTION, with their pages | None: all three are pbiplint's own rules | The READMEs' What it checks and the About page name the new own rules; the rules index counts 21 built into pbiplint |

Each is reviewable alone and leaves main releasable. The first changes how existing rules read DAX and touches no function code; the second adds rules and touches no reference reading. Nothing in the second depends on the first.

Dropped or trimmed (section 7): the DAX rules inside function bodies, UDF_INVALID_DEFINITION, the chain-following part of UDF_NOT_CALLED, and the name boundary for USE_THE_TREATAS_FUNCTION_INSTEAD_OF_INTERSECT on measures.

## 3. Columns an expression creates (pull request 1)

### 3.1 The reading

In `refsInTokens` (`packages/core/src/index/references.ts`), a bare `[X]` reads a column the expression creates when a call to ADDCOLUMNS, SELECTCOLUMNS, SUMMARIZE, SUMMARIZECOLUMNS, ROW, or DATATABLE in the same text has the string `"X"`, compared without regard to case, among its arguments, and the `[X]` sits outside every call that creates `X`. Such a reference carries `created: true`.

- **Outside every call that creates the name.** A column is not visible inside the call that creates it: in `SELECTCOLUMNS(t, "Id", [Id])` the `[Id]` is the input table's column (E-W-Indicator-Analytics EQ-19 has this rename-through shape). And a bare name inside any call that creates it keeps today's reading, since what it reads there depends on the table the call walks. One-Gloucestershire's models repeat `SELECTCOLUMNS(ADDCOLUMNS(seq, "OffsetIndex", [YearMonthIndex] - 5), "YearMonthIndex", [OffsetIndex])` inside a UNION, where `[YearMonthIndex]` is a column that came from SUMMARIZE over the model's date column; only following a column's lineage through variables could tell it from the output of the sibling calls, and #108 declined that machinery. Reading it as today keeps every finding Tabular Editor reports (3.2).
- **A string argument** is a string token whose innermost enclosing parenthesis is the call's. Whether the string fills the whole argument made no difference on the corpus, so the reading does not test it.
- **The six functions** are those the corpus uses to create a column that a bare name then reads where a model column has the same name: SELECTCOLUMNS (405 references in 20 models), SUMMARIZE (71 in 12), ADDCOLUMNS (64 in 14), DATATABLE (40 in 5), ROW (31 in 4), SUMMARIZECOLUMNS (2 in 1). GROUPBY has none and is left out.
- **Measure first, as today.** `resolveBareName` still tries a measure first; a created reference that names no measure then resolves to nothing (`kind: "none"`, an `unresolved` DaxRef), where today it takes a model column of that name. 97 corpus references name a created column that is also a measure's name; they stay measure references.
- **Every kind of DAX.** The index's owners (measures with their format strings and KPIs, calculated columns and tables, calculation items, row-level security filters, functions) and the report's own measures all read through `refsInTokens` and `resolveBareName`, so both call sites pass the flag: `resolveBareName` takes the raw reference (its name and flag) in place of the name alone. No rule reports an unresolved model reference, so a created reference makes no finding of its own.

About 20 lines in `references.ts` and one in `report-refs.ts`. `resolveBareName`'s comment, which says a created column is not worked out, is rewritten.

### 3.2 What moves

No fixture, committed expectation, report parity pin, or sample pin moves; no existing unit test moves, since `extractRefs`'s elements gain the optional `created` field only when it is true. So no Tabular Editor recapture.

On the corpus:

| Rule | Models (1,317) | Projects (324 with both parts) | Against Tabular Editor 0.7.1.2 |
|---|---|---|---|
| DAX_COLUMNS_FULLY_QUALIFIED (error) | 93 fewer, 17 models | 63 fewer, 13 projects | Closer on every one: TE reports none of the 86 on the models run through it; the other 7 are on copies of those models |
| UNNECESSARY_COLUMNS (warning) | 6 more, 6 models (copies of one Woojek1 model: `'gold v_bc_posted_sales_credit_memo_invoices'[DueDate]`) | 4 more, 4 projects | Closer: TE reports it |
| NOT_REACHED_FROM_REPORT (info) | | 7 more in 4 projects; 4 details name fewer referrers | pbiplint's own rule. Read by hand: the key columns of the DAX Lib SVG sample's generated tables, which only the generator functions' own created columns name; Mbean21's `FACT_DWELLING[ExpirationDate]`; Woojek1's `DueDate` |

No ported rule moves away from Tabular Editor, so pull request 1 records no deviation and the copy's count stays at five.

**The readings measured** (models; Tabular Editor run on one model per copy group, 14 models, 5 of them already run for #108):

| Reading | DAX_COLUMNS_FULLY_QUALIFIED | UNNECESSARY_COLUMNS | Findings that move away from Tabular Editor |
|---|---|---|---|
| Anywhere in the expression (the #115 comment's estimate) | 112 fewer, 20 models | 8 more | 11 (9 where Tabular Editor is right) |
| Outside the call that creates it | 111 fewer, 19 models | 6 more | 10 (8 where Tabular Editor is right) |
| **Outside every call that creates it (chosen)** | **93 fewer, 17 models** | **6 more** | **0** |
| Only when the expression names no model column of that name with its table | 37 fewer, 5 models | 2 more | 0 |

The chosen reading leaves 8 findings that Tabular Editor does not report, each a bare name inside a call that creates it, which it reads as today. The "anywhere" reading's two extra UNNECESSARY_COLUMNS findings (erlendoeien's hidden `'MeasuresTable'[Value]`, which Tabular Editor reports) come from a date table template's DAX, where GENERATESERIES's `[Value]` reads that model column today; under the chosen reading they stay unreported, as today.

### 3.3 The pages, the tests, the release notes

- **Quirks bullets**, added or reworded: `dax-columns-fully-qualified`, `unnecessary-columns`, and `not-reached-from-report` each say that a bare name for a column the same expression creates, outside the call that creates it, reads that column and not a model column of the same name, and that inside such a call it reads as before. Then `scripts/sync-rule-pages.mjs`.
- **Tests.** `indexes.test.ts`: created by each of the six functions; not created inside its own call, nor inside a sibling call that creates the same name; a measure of that name still wins; the report's own measures read it the same way; `extractRefs` shows the flag. One rule test each for DAX_COLUMNS_FULLY_QUALIFIED (silent on a created name), UNNECESSARY_COLUMNS (the Woojek1 shape), and NOT_REACHED_FROM_REPORT (a column only a created name spells).
- **Release notes (#152).** What can change in your results: the three rows above; fewer findings at error cannot trip a gated workflow, and the new ones are at warning and info. For code that uses `@pbiplint/core` directly: `extractRefs` marks such a reference `created: true`, an added optional field.

## 4. The `Function` object kind (pull request 2)

- **`ObjectType`** (`packages/core/src/rules/types.ts`) gains `"Function"`. It is an exported union, so a consumer's exhaustive switch over it stops compiling: the release notes' third heading.
- **`finding.function(f)`** in `rules/helpers.ts`: `objectType: "Function"`, `objectName` the function's bare name (`Local.AddTax`), as Tabular Editor 0.7.1.2 names it (checked: its built-in UDF rules report `AddTax`, object type Function), `location` the `function` header line in `definition/functions.tmdl`, `object` the function. `finding` is exported, so this is an addition.
- **`define.ts`** maps the scope token `UserDefinedFunction` to `"Function"`, so `mapScope` no longer throws if Microsoft's ruleset gains that scope. `mapScope` is exported.
- **Ignore annotations** work with no new code: `annotation pbiplint.ignore = UDF_NOT_CALLED` under the function, since a function's annotations are already read and the finding carries the function as its object. `ignoreHelp`'s TMDL wording ("Power BI Desktop keeps the annotation") holds: Desktop keeps annotations on functions, as the DAX Lib SVG sample's 64 functions show. A unit test pins it.

## 5. UDF_NOT_CALLED (pull request 2)

| Field | Value |
|---|---|
| id | `UDF_NOT_CALLED` |
| name | User-defined function nothing calls |
| category | Maintenance |
| severity | 1 (info) |
| scope | `Function` |
| layer | `model` |
| skipWhenModelUnread | `modelPartlyRead` (a caller may sit in a file pbiplint could not read) |
| status | `builtin` |

- **What it reads.** `references.functionCalledBy(f)`, which covers every DAX owner the index reads, other functions included. The report's own measures are not read: none of the 126 in the fetched projects calls a function, and reading them would also need a guard for an unread `reportExtensions.json`. The page names them among the callers the rule does not see.
- **A function of your own** with no caller is reported. No detail.
- **A DAX Lib package** (functions sharing a `DAXLIB_PackageId` annotation) is reported once, on its first function in model order, when none of its functions is called from outside the package. Its members are never reported alone, since a package installs all its functions. Detail: `package DaxPatterns.AbcClassification: none of its 2 functions is called`.
- **Chains are not followed.** A function called only by a function nothing calls is not reported until its caller is removed. No real file has such a chain (section 7).
- **How to fix**, with no third-party tool: in Power BI Desktop, Model view, Model explorer, Functions, right-click the function and choose Delete from model (Learn lists the command on the function's menu: [Using Model explorer](https://learn.microsoft.com/dax/best-practices/dax-user-defined-functions#using-model-explorer)); or remove its `function` block from `definition/functions.tmdl`. For a package, remove each of its functions.
- **When to ignore it**: a function called from where the rule does not look: a DAX query (a test harness such as PQL.Assert runs its tests this way), a report's own measures, a live-connected report's measures ([Considerations and limitations](https://learn.microsoft.com/dax/best-practices/dax-user-defined-functions#considerations-and-limitations)), or a visual calculation; or a function kept as a library on purpose.
- **Quirks**: calls are matched by the whole name, dots included, in any letter case; a call inside a string or a comment is not a call; chains; the package test reads only the `DAXLIB_PackageId` annotation that Desktop keeps when it installs a DAX Lib package, so a package installed another way is reported function by function (semantic-link-labs writes its own annotation, the package name as the key: [`_functions.py`](https://github.com/microsoft/semantic-link-labs/blob/main/src/sempy_labs/daxlib/_functions.py)).
- **Evidence.** 28 findings in 9 models, 4 repositories: 27 functions (FHSQLMonitor 1, czech_crime 8, Business-Accelerators P&L 7 across three copies and 1 more in the basic model, PQL.Assert's own test functions 10) and 1 package (DaxPatterns.AbcClassification). Without the package roll-up, package members with no caller would add 171 findings in 4 models (82 and 78 in PQL.Assert's two test models, 10 in the DAX Lib SVG sample, 1 more for DaxPatterns.AbcClassification), every one from a package the model installed whole.
- **Related pages.** UNNECESSARY_MEASURES and UNNECESSARY_COLUMNS already say an uncalled function's references count; each gains a Related rules bullet for UDF_NOT_CALLED. NOT_REACHED_FROM_REPORT's page says an unreached function has no finding of its own there; it names this rule.

## 6. UDF_USE_COMPOUND_NAMES and UDF_WITHOUT_DESCRIPTION (pull request 2)

Tabular Editor 3's two built-in UDF rules (`TE3_BUILT_IN_UDF_USE_COMPOUND_NAMES`, `TE3_BUILT_IN_VISIBLE_UDF_NO_DESCRIPTION`), as pbiplint's own rules: its BPA oracle, Microsoft's ruleset, has neither, so they are not ports and record no deviation. Both are info, as pbiplint maps a Tabular Editor severity of 1.

| | UDF_USE_COMPOUND_NAMES | UDF_WITHOUT_DESCRIPTION |
|---|---|---|
| name | User-defined function with a one-word name | User-defined function with no description |
| category | Error Prevention (Tabular Editor's) | Maintenance (Tabular Editor's) |
| condition | The name holds neither `.` nor `_`, Tabular Editor's test | The `///` description is empty or only whitespace |
| packages | Not skipped, as Tabular Editor does; no DAX Lib name fails it (0 of 2,064) | Skipped: a published package version cannot be edited |
| evidence | 3 functions in 3 models (`fnImagemVariacao`, `TierBucket`, `FormatAmounts`) | 97 of 121 own functions in 12 models, 9 repositories |
| How to fix, Desktop | Rename the function in Model explorer (right-click, Rename), if Desktop updates its callers (question 1 in section 8) | In DAX query view, write `///` lines above the `FUNCTION` and choose Update model with changes ([Add measure descriptions](https://learn.microsoft.com/power-bi/transform-model/dax-query-view#add-measure-descriptions) says the syntax serves "both measure and function descriptions") |
| How to fix, TMDL | Rename it on its `function` line (quoted when it holds a dot) and at every call under `definition/` | Add a `///` line directly above `function` |

- **Hidden functions.** Tabular Editor's description rule, despite its name, reports a function with `isHidden` (checked on a scratch copy: its reader reads `isHidden: true` and the rule still fires), and no real function carries `isHidden`. So neither rule reads it.
- **No `@param` or `@returns`.** Learn says parameter descriptions are not supported ([Considerations and limitations](https://learn.microsoft.com/dax/best-practices/dax-user-defined-functions#considerations-and-limitations)), so a plain description passes.
- **Quirks for the names rule**: the test is Tabular Editor's, so `_toggleButton` passes, and a dot is no guarantee against a future built-in ([`INFO.USERDEFINEDFUNCTIONS`](https://learn.microsoft.com/dax/info-userdefinedfunctions-function-dax) is a dotted built-in).

## 7. Dropped or trimmed, and why

| Item | Real-file evidence | Cost | Call |
|---|---|---|---|
| USERELATIONSHIP and RLS in function bodies (issue item 1) | No function body in the corpus or DAX Lib calls USERELATIONSHIP | Body reading, a deviation, tests, a Quirks sentence | Drop |
| EVALUATEANDLOG, IFERROR, TREATAS, `1-(x/y)` in bodies (item 2) | EVALUATEANDLOG: none anywhere (Learn's `ConvertToCurrency` example, in [Advanced example: Flexible currency conversion](https://learn.microsoft.com/dax/best-practices/dax-user-defined-functions#advanced-example-flexible-currency-conversion), is documentation, not a file); IFERROR and TREATAS: only PQL.Assert's package functions, which the style rules skip; `1-(x/y)`: none | As above, four deviations | Drop |
| DIVIDE in bodies (item 2) | 3 own functions in 2 models, every one dividing by the literal 2, which cannot fail; a fourth `/` sits in a comment | As above, one deviation | Drop: no user value |
| DAX_MEASURES_UNQUALIFIED and DAX_COLUMNS_FULLY_QUALIFIED in bodies (item 3) | No own function qualifies a measure or names a model column bare. The 39 package functions it would fire on (scalar parameters only) each read a name that is not a model column: INFO.* result columns (`[Name]`, `[ID]`) and GENERATESERIES's `[Value]` | A parameter-list reader, the table-parameter test, two deviations | Drop: every finding on real files would be false |
| HIDE_FACT_TABLE_COLUMNS in bodies (item 4) | One repository (Business-Accelerators P&L, three copies): five layout and account columns, which are configuration rather than facts | One line, a deviation, a test | Drop; the one candidate for a trim if Michael wants one (section 10) |
| MEASURES_USING_TIME_INTELLIGENCE_AND_MODEL_IS_USING_DIRECT_QUERY, FILTER_COLUMN_VALUES, FILTER_MEASURE_VALUES_BY_COLUMNS, HARDCODED_PERIOD_IN_DAX in bodies (item 4) | Time intelligence in 4 own functions, none in a DirectQuery model; the FILTER shapes: none; periods: 3 functions of a sample-data package | As above | Drop |
| UDF_INVALID_DEFINITION | 0 of 386 corpus functions and 0 of 2,064 DAX Lib declarations break any of its checks | A parameter-list reader, the compatibility level read from `database.tmdl`, a cycle walk, about a dozen tests, a page | Drop (below) |
| Following chains in UDF_NOT_CALLED | No own function in the corpus is called only by functions nothing calls | A walk and a chain detail | Trim to direct calls, with the package roll-up |
| TREATAS's name boundary on measures (`Set.Intersect(` read as INTERSECT) | No corpus measure calls a dotted function ending in INTERSECT | A deviation and a test | Drop; the `BRIGHT(` and `MYDATEADD(` quirks stay a separate call, as the issue says |
| A `functions.tmdl` case for #82 item 4 | Already done in #121 (`parse.test.ts`) | | Nothing to do |

**UDF_INVALID_DEFINITION, check by check.** Microsoft's TMDL reader (Tabular Editor 0.7.1.2's `te list`, on a copy of the udf-sales fixture with one line changed) refuses exactly two: two functions with the same name, even differing only in letter case ("Item 'TIME.ytd' already exists in the collection"), and functions in a model below compatibility level 1702 ("The database compatibility level of 1701 is below the minimal compatability level of 1702 needed for [model Model].[function Sales.ApplyTax]"). Power BI reports those itself. Every other check loads: the reader stores a function's expression as text. Tabular Editor's own analyzer (`te validate`) flags a missing parameter list or `=>`, an unknown type hint, `val` on a reference type, a subtype on TABLE, a duplicate parameter, recursion, and a reserved word as a parameter name; nothing flags a dot in a parameter name, an odd function name, or more than 256 parameters. Those are DAX errors, the same class as a DAX error in a measure, which pbiplint does not check anywhere; building them for function headers alone would be the first DAX validity check, one shape at a time, where #144 guards hand-written and AI-written TMDL with one general mechanism. The full table is in the ledger's scratch folder (`115/te-invalid/results.md`).

## 8. The questions to settle in Power BI Desktop

What Learn says, and what only Desktop can settle. Development proceeds on the assumed answers.

1. **Does renaming a function update its callers?** Learn does not say. It says "Formula fix-up and dependency calculation are supported" for functions ([Considerations and limitations](https://learn.microsoft.com/dax/best-practices/dax-user-defined-functions#considerations-and-limitations)) and lists Rename on a function's menu ([Using Model explorer](https://learn.microsoft.com/dax/best-practices/dax-user-defined-functions#using-model-explorer)), but its one statement about renames keeping DAX in sync names "tables, columns, or measures" ([March 2026 update](https://learn.microsoft.com/power-bi/fundamentals/desktop-latest-update-archive#modeling-4)). Decides UDF_USE_COMPOUND_NAMES's Desktop fix route. The test for Michael:
   1. Open a copy of any PBIP in Power BI Desktop. In DAX query view, run `DEFINE FUNCTION AddTax = ( amount : NUMERIC ) => amount * 1.1 FUNCTION Wrap = () => AddTax ( 1 ) EVALUATE { Wrap () }` and choose Update model with changes.
   2. Add a measure to any table: `Taxed = AddTax ( 10 )`.
   3. In Model view, Model explorer, Functions, right-click AddTax, choose Rename, and enter `Local.AddTax`.
   4. Save, then open `definition/functions.tmdl` and the measure's table file.

   Look for: Wrap's body and Taxed both read `Local.AddTax (`. Assumed: yes. If not, the page gives the TMDL route alone and says Desktop's Rename leaves the callers calling a name that no longer exists.
2. **Case, a leading digit, reserved words.** Case: Learn says "All object names are case-insensitive" ([DAX syntax, naming requirements](https://learn.microsoft.com/dax/dax-syntax-reference#naming-requirements)), and Microsoft's reader refuses two functions differing only in case. A leading digit and the reserved-word list: Learn does not say; it gives examples only ("measure, function, define", [Define and manage user-defined functions](https://learn.microsoft.com/dax/best-practices/dax-user-defined-functions#define-and-manage-user-defined-functions)). With UDF_INVALID_DEFINITION dropped, nothing depends on them: no test needed.
3. **`isHidden` on functions.** Learn contradicts itself: "Cannot hide/unhide a UDF in the model" ([Considerations and limitations](https://learn.microsoft.com/dax/best-practices/dax-user-defined-functions#considerations-and-limitations)), yet the function menu it shows lists "Hide in report view" and "Unhide all" ([Using Model explorer](https://learn.microsoft.com/dax/best-practices/dax-user-defined-functions#using-model-explorer)), and TOM has `IsHidden` ([Function properties](https://learn.microsoft.com/dotnet/api/microsoft.analysisservices.tabular.function#properties)). No real function carries it and no rule here reads it: no test needed.
4. **Below compatibility level 1702.** Learn: "This metadata object is only supported when the compatibility level of the database is at 1702 or above" ([Function remarks](https://learn.microsoft.com/dotnet/api/microsoft.analysisservices.tabular.function#remarks)); whether Desktop upgrades such a model, it does not say. Microsoft's reader refuses the file, so Power BI reports it itself, and nothing here depends on the answer: no test needed.

## 9. Rulings taken in Phase 1

Each is also in the ledger as "Ruling: ... Why: ... Cost if wrong: ...".

- UDF_NOT_CALLED reads the model only. None of the 126 report measures in the fetched projects calls a function, and reading them would need a guard for an unread `reportExtensions.json`.
- UDF_NOT_CALLED counts a package as called when any of its functions has a caller outside the package; chains are not followed.
- UDF_USE_COMPOUND_NAMES does not skip package functions, as the issue says; no DAX Lib name fails it.
- Neither new metadata rule reads `isHidden`, matching Tabular Editor's rule as it runs.
- `resolveBareName` keeps a measure first, before a created column.
- The created-column check leaves out GROUPBY, which no corpus file uses that way.
- No committed expectation changes and no Tabular Editor recapture: pull request 1 moves no fixture, and pull request 2's rules are pbiplint's own, which model expectation files do not hold. `scripts/te-expectations.mjs` keeps its 0.5.2 shape until a recapture needs it.

## 10. Needs a ruling

- **Michael (product scope):** drop the DAX rules inside function bodies (section 7), or trim to HIDE_FACT_TABLE_COLUMNS alone. Recommended: drop. Assumed without an answer: drop.
- **Michael (product scope):** drop UDF_INVALID_DEFINITION. Recommended: drop. Assumed: drop.
- **Michael (what users see):** the three new rule names and the package detail's wording, reviewed on the pages in pull request 2.
- **Orchestrator (technical):** which reading of a created column (section 3.2's table). Recommended: outside every call that creates it, the only one that removes most of the false findings and moves none away from Tabular Editor. Assumed: that one.
- **Orchestrator (technical):** where the `created` flag lives: on `extractRefs`'s elements (the design above, an added optional field) or kept internal with a stripped copy. Recommended: on the elements. Assumed: on the elements.

## 11. Left out on the real-files bar

- Following a column's lineage through table variables, and resolving a bare name by the table an iterator walks: the 8 findings in 3.2 that the chosen reading leaves are the only real cost measured.
- Columns created with no string: GENERATESERIES's `[Value]` and a table constructor's `[Value1]`.
- A caller in a visual calculation, a report measure, or a DAX query, for UDF_NOT_CALLED.
- `isHidden` on a function; a function's description or properties split across two declarations (Microsoft's reader merges a property-only second declaration).
- An unquoted dotted function name (`function Time.YTD = ...`), which Microsoft's reader loads as a function named `YTD`: no corpus or DAX Lib file has one.

## 12. Amendment, September 30, 2026: the orchestrator's rulings on Phase 1

- **The created-column reading** is the one chosen in 3.1: a name counts only outside every call that creates it.
- **The `created` flag** goes on `extractRefs`'s elements. An added optional field cannot break a build, so the release notes list it under New, as a core addition, as #108 listed `Measure.kpiExpressions`. `ObjectType` gaining `"Function"` can break an exhaustive switch, so it goes under the third heading.
- **Michael's items are parked** with the recommendations of section 10, and the work proceeds on them: the DAX rules inside function bodies are dropped, the HIDE_FACT_TABLE_COLUMNS trim with them; UDF_INVALID_DEFINITION is dropped; UDF_NOT_CALLED reads direct calls, with the package roll-up and without the report's own measures; the three names and the package detail are as drafted; and the Desktop Rename test is assumed to answer yes. UDF_USE_COMPOUND_NAMES's page gives the Desktop Rename route in a sentence of its own, so a "no" from the test changes that one sentence.
- **The Model fact counting functions** is not part of #115.
- **Pull requests** as section 2 has them, each on its own branch from main, neither stacked on the other.

Michael approved four of the parked decisions the same day: the DAX rules inside function bodies are dropped, the HIDE_FACT_TABLE_COLUMNS trim with them; UDF_INVALID_DEFINITION is dropped; UDF_NOT_CALLED reads direct calls, with the package roll-up and without the report's own measures; and the names and the package detail are as drafted. He runs the Desktop Rename test later; until then the work assumes yes.
