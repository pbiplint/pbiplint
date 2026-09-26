# pbiplint v2: the report layer

Design spec, approved by Michael on 2026-09-18 in the session that wrote
it. Issue #9 ordered this work; the v1 spec
(`2026-09-04-pbiplint-v1-design.md`, section 12) reserved it. The plan
that implements it is written from this document and nothing else, so
everything a fresh session needs is here, including the facts gathered
while designing.

## 1. What v2 is for

v1 lints the semantic model. v2 reads the whole Power BI project and
adds the report layer, framed as **correctness and readiness** rather
than design critique. A linter cannot judge chart choice, layout, or
narrative; that is taste, and the channel's job. It can catch what is
**broken** (a visual naming a field the model no longer has, a button
pointing at a deleted page), what is **unfinished** (no alt text, a
page still called "Page 2", a hidden visual left behind), and what is
**expensive** (hidden visuals still running queries, filter patterns
that cost more than they give). It can also state plainly what the
report will do when someone opens it: which page, whether the Filters
pane is open, what is saved with it. Those are the things a senior
reviewer flags every time and resents spending review time on.

Amended 2026-09-23: a hidden visual does not run its query until
something shows it, so a hidden visual with fields bound is unfinished
work, not an expense (section 8.2).

Two things make the report layer worth building beyond that list.
Teams on PBIP commit report changes far more often than model changes,
so a linter that only reads the model is silent on most pull requests.
And once both parts are in one tool, the model can be judged by what
the report actually uses: columns and measures nothing reaches, which
is the largest single lever on model size, and only the report knows.

The PBI Inspector base rules are ported because they are cheap, well
known, and MIT licensed, but they are the floor, not the deliverable.
The native rules and the facts block are where the value is.

## 2. Goals and non-goals

Goals:

- Read a whole PBIP (model and report), a lone `.Report`, or a lone
  `.SemanticModel`, in the browser and the CLI, with one code path.
- Port fab-inspector's 11 base report rules with parity pinned by
  committed fixtures and every deliberate deviation written down.
- Ship pbiplint's own report rules in three tiers (section 8), each
  objective, mechanical to fix, and quiet on well-made reports.
- Show facts beside findings: what the report will do, always, whether
  or not there are findings.
- Give the input walk a diagnostics channel, so nothing that was not
  read is mistaken for clean.
- Keep every v1 constraint: browser-pure core, nothing uploaded, rule
  pages in pbiplint's own words with a fix route that needs no third
  party tool, parity by committed fixtures, Tabular Editor never
  required.

Non-goals for v2 (listed as next in section 15): several reports per
run, theme-file rules, cross-report unused analysis, Power Query (v3),
fix patches, custom rules, the GitHub Action (its own initiative,
section 14).

## 3. Ground truth captured while designing

Facts checked against real files and tools on 2026-09-18. The plan
relies on them; re-verify anything marked "moving".

### 3.1 The port source

- `NatVanG/PBI-Inspector` (the repository the v1 spec named) does not
  support PBIR. Its base rules are JSONPath over the old single
  `report.json`. Its README points to the successor. MIT, copyright
  2023 Nat Van Gulck.
- `NatVanG/fab-inspector` (formerly PBI-InspectorV2) is the PBIR-aware
  successor. MIT, copyright 2024 Nat Van Gulck; the CLI folder carries
  the same licence. Release v3.4.0 (2026-06-29) ships `osx-arm64-CLI.zip`
  (needs .NET 8). Moving: pin by commit.
- `Rules/Base-rules.json` at commit
  `cdaaeec3cca8e97b0fd493e080dfa264f9cd44f8`, sha256
  `22868be9acd696c96e62f214dbe0efc72fd1bfffda1736b3b9a4d7fba21f883c`.
  A flat `rules` array of 12 entries: 11 rules and a disabled
  `template`. Rule keys: `id, name, description, disabled, part, test,
  logType` (`logType` only on the template; the CLI treats the rest as
  warnings). `part` is `"Report"`, `"Pages"`, or absent (report level).
  Inside `test`, `{"part": "Visuals"}` and `{"part": "Pages"}` navigate
  to the visual and page files. Operators used beyond JSON Logic:
  `part`, `path` (JSONPath `$..projections[*]`), `diff` (set
  difference), `strcontains` (regex), `tostring`, `count`.
- Thresholds in the JSON (the README disagrees; the JSON wins):
  visuals per page 20, fields per visual 6, TopN filters per page 4,
  advanced filters per page 4, pages per report 10, page height 720.
  `ENSURE_ALTTEXT` ships `disabled: true`.
- Rule ids, verbatim, including the source's spelling:
  `REMOVE_UNUSED_CUSTOM_VISUALS`, `REDUCE_VISUALS_ON_PAGE`,
  `REDUCE_OBJECTS_WITHIN_VISUALS`, `REDUCE_TOPN_FILTERS`,
  `REDUCE_ADVANCED_FILTERS`, `REDUCE_PAGES`,
  `AVOID_SHOW_ITEMS_WITH_NO_DATA`, `HIDE_TOOLTIP_DRILLTROUGH_PAGES`,
  `ENSURE_THEME_COLOURS`, `ENSURE_PAGES_DO_NOT_SCROLL_VERTICALLY`,
  `ENSURE_ALTTEXT`.

### 3.2 The oracle

fab-inspector's macOS CLI runs on this Mac under the Homebrew .NET 10:

```
export DOTNET_ROOT=/opt/homebrew/Cellar/dotnet/10.0.400/libexec
export DOTNET_ROLL_FORWARD=Major
./PBIRInspectorCLI -fabricitem <X.Report> -rules Base-rules.json \
  -formats Console,JSON -output <dir>
```

The JSON file (`TestRun_<id>.json`, written with a UTF-8 BOM) holds
`Results[]` with `RuleId`, `ItemPath` (`/definition/pages/<id>/page.json`
for page-level rules, `root` or `/definition/report.json` for report
level), `ParentName`, `ParentDisplayName`, `Pass`, `Expected`, `Actual`
(the failing visual or page names), `LogType`, `Message`. Verified
results: `Base-rules-fails.Report` 10 failures, matching the
repository's own test expectations; `Base-rules-passes.Report` 1
failure (`REDUCE_PAGES`, 13 pages); Michael's PBIP and GitHub Demo
report 2 failures (`REDUCE_OBJECTS_WITHIN_VISUALS`,
`REDUCE_ADVANCED_FILTERS`, the latter because five visuals on the page
carry a filter entry typed `Advanced` with nothing applied: a date
slicer and four data visuals whose per-field entries Desktop writes)
(amended 2026-09-22 after the oracle run).

### 3.3 Fixtures available

- fab-inspector `FabInspector.Tests/Files/pbip/` (MIT):
  `Base-rules-fails` (18 pages, 96 visuals, 2 bookmarks, 716 KB) and
  `Base-rules-passes` (13 pages, 74 visuals), each a whole PBIP with a
  TMDL `.SemanticModel` (`definition/` folder) and a `.pbip` file.
  Every schema in them is 1.0.0. The `Example-rules-*` and
  `Inventory-sample-fails` fixtures carry `model.bim` models and are not
  usable as TMDL fixtures.
- Michael's `PBIP and GitHub Demo.Report` (OneDrive, read-only; copy
  and sanitise): 1 page, 19 visuals, current schemas (report 3.2.0,
  page 2.1.0, visual 2.8.0, pagesMetadata 1.0.0), Filters pane saved
  `expanded: true`, one registered PNG and the stock Fluent theme.
- Michael's `ShelfMart Foot Traffic and Weather` project (OneDrive,
  read-only; copy): a whole PBIP with a `.pbip` file, a TMDL model (20
  `.tmdl` files, no local paths in partition sources) and a report with
  1 page, 9 visuals each with `mobile.json`, theme CY24SU10, and a
  registered PNG and theme JSON under `StaticResources`. ShelfMart is a
  fictional company with generated data; Michael has cleared every part
  of it for use as a fixture, so it needs no sanitising beyond the
  standard script. `StaticResources` may be left out of the copy only
  because nothing reads them.
- `examples/messy-sales` has no report. The OneDrive `Sales Demo.Report`
  beside the demo model is one empty page.

### 3.4 PBIR shapes

- `.pbip`: `{ version, artifacts: [{ report: { path } }], settings }`.
- `.platform` (each part): `metadata.type` (`Report` |
  `SemanticModel`), `metadata.displayName`, `config.logicalId`.
- `definition.pbir`: `version`, `datasetReference.byPath.path`
  (relative, `../X.SemanticModel`) or `datasetReference.byConnection`.
- `definition/version.json`: `version` (2.0.0 seen).
- `definition/report.json` (schema 3.2.0, 3.3.0 exist; 3.4.0 does not):
  `themeCollection`, `objects.outspacePane[0].properties.expanded` and
  `.visible` (literal `"true"`/`"false"` inside `expr.Literal.Value`),
  `settings.filterPaneHiddenInEditMode`, `publicCustomVisuals[]`,
  `resourcePackages[]`, `filterConfig`.
- `definition/pages/pages.json` (pagesMetadata): 1.0.0 has `pageOrder`,
  `activePageName`; 1.1.0 adds `landingPageName` ("the report will
  always open on this page for all users, overriding
  activePageName"). No local Desktop-written report carries it yet.
- `definition/pages/<id>/page.json` (page 2.1.0): `name`, `displayName`,
  `displayOption`, `height`, `width`, `filterConfig`, `pageBinding`
  (`type` Tooltip | Drillthrough with parameters), `objects`, `type`,
  `visibility` (`AlwaysVisible` | `HiddenInViewMode`),
  `visualInteractions`, `annotations`, `howCreated`.
- `definition/pages/<id>/visuals/<id>/visual.json` (visualContainer
  2.8.0): `name`, `position` (`x`, `y`, `z`, `height`, `width`,
  `tabOrder`), `visual`, `visualGroup`, `parentGroupName`,
  `filterConfig`, `isHidden`, `annotations`, `howCreated`. Inside
  `visual` (visualConfiguration 2.3.0): `visualType`,
  `query.queryState.<role>.projections[].field`, `objects` (formatting),
  `visualContainerObjects` including `general[].properties.altText` and
  `title`, and `visualLink[]` with `type`, `bookmark`,
  `navigationSection`, `drillthroughSection`, `webUrl`, `qna`.
  `mobile.json` beside it is the mobile layout. Amended 2026-09-23
  with pull request 4: a grouped visual's `position` is relative to
  its parent group (Desktop-saved files; the schema speaks only of the
  page). Amended 2026-09-23 with pull request 5, reading the
  conditions rather than changing them: `position.tabOrder` may be
  absent (the visualContainer schema does not require it, and 511 of
  13,026 Desktop-saved visual.json files lack it), is negative for a
  visual hidden from the tab order (Desktop-saved files; Learn says
  only that clicking the number next to an object hides it from the
  tab order), and restarts at 0 inside each group, as `x` and `y` are
  relative to it (Desktop-saved files); and a `visualLink` entry keeps
  the previous type's target property when its `type` changes (891
  Desktop-saved entries carry another type's target, 700 of them
  naming nothing), so only the property that belongs to the entry's
  type is its destination.
- `definition/bookmarks/bookmarks.json`: `items[]` (`name`, optional
  `children`). `<name>.bookmark.json`: `name`, `displayName`, `options`,
  `explorationState` with `activeSection` (page name) and
  `sections[<page>].visualContainers[<visual>]`. Amended 2026-09-23
  with pull request 5, reading the conditions rather than changing
  them: a bookmark captures one page, so `sections` has one key, equal
  to `activeSection` (576 of 576 Desktop-saved bookmarks; Learn: a
  bookmark captures the current state of a report page), and it keeps
  groups apart from visuals, under
  `sections[<page>].visualContainerGroups` (Microsoft's bookmark
  schema: `visualContainers` "Does not include state of groups").
- `definition/reportExtensions.json` (reportExtension 1.0.0): `name`,
  `entities[]` with `name` and `measures[]` (`name`, `dataType`,
  `expression`, `hidden`, `formatString`, `displayFolder`, ...). These
  are report-level measures.
- Field references, anywhere in the JSON: `{"Column": {"Expression":
  {"SourceRef": {"Entity": "Sales"}}, "Property": "Amount"}}`, likewise
  `Measure`, `Aggregation` (wrapping a Column), `HierarchyLevel`.
  Filters declare aliases: `"From": [{"Name": "d", "Entity": "Date"}]`
  and refer to them with `"SourceRef": {"Source": "d"}`; the alias is
  scoped to the filter object that declares it.
- Filters: `filterConfig.filters[]` with `name`, `field`, `type`
  (`Categorical`, `Advanced`, `TopN`, ...), and, only when a condition
  is applied, `filter: { Version, From, Where }`. A slicer's saved
  selection is a `filter` with a `Where` on its own `filterConfig`
  entry; a slicer with no selection has no `filter`. Amended 2026-09-23
  with pull request 5, reading the conditions rather than changing
  them, a correction to the sentence on slicers: a slicer's saved
  selection is the `filter` under
  `visual.objects.general[].properties.filter`, for every slicer type
  in Microsoft's visual catalog (Microsoft's capability data gives each
  of them that property, and Desktop-saved files keep the selection
  there); a `filterConfig` entry on a slicer holds a visual-level
  filter of the Filters pane, never the selection. Amended 2026-09-24
  with Michael (release triage, DQ5): a saved selection is read in that
  place on any visual type, so custom slicers from AppSource, which keep
  theirs there too, are covered; in Desktop-saved files every visual
  type that carries `general.filter` is a filtering visual.
- Desktop names a duplicated page "Duplicate of <name>" in current
  builds; older copy could read "<name> (copy)". Both are matched.
  Amended 2026-09-23 with pull request 4: English Desktop writes
  `Page <n>` for a new page and `Duplicate of <name>` for a duplicate
  (nested when a duplicate is duplicated), on tooltip and drillthrough
  pages too; Desktop localises both names; no source shows a Desktop
  build writing `<name> (copy)`.

### 3.5 Authoring toolchain for the sample report

- `microsoft/skills-for-fabric` (MIT, commit
  `65bfb5eb2c488cd03183df88f76ac3de65dcb910`; moving). Marketplace
  `fabric-collection`, plugin `powerbi-authoring` with skills
  `powerbi-report-cli` and `semantic-model-authoring`. Install in
  Claude Code: `/plugin marketplace add microsoft/skills-for-fabric`,
  `/plugin install powerbi-authoring@fabric-collection`. Not installed
  on this Mac at the time of writing; Michael's own `/pbi-report`
  command exists but is not the chosen tool.
- `@microsoft/powerbi-report-authoring-cli` on npm (0.1.4, Node 20 or
  later, no OS restriction) provides `powerbi-report-author` with
  `catalog`, `formatting`, `expr encode`, `validate <.Report>`,
  `preview-visuals`, `preview-pages`, `preview-filters`. The skill
  forbids writing PBIR from memory and requires `validate` after every
  batch. `@microsoft/powerbi-desktop-bridge-cli` (reload Desktop, take
  screenshots) needs Desktop and stays on Windows; not required.

### 3.6 Code seams in v1 that v2 changes

- `packages/core/src/engine/lint.ts`: `lint(files)` parses every file
  as TMDL.
- `packages/core/src/rules/types.ts`: `Rule.check(model, ctx)`,
  `ObjectType`, `Category`, `CATEGORY_ORDER`.
- `packages/core/src/engine/config.ts`: a rule's config value is
  `"off"` or a severity name.
- `packages/web/src/input/model-files.ts` (`InputTree`, `selectModel`),
  `read-drop.ts` (`wanted`, `SKIP_DIRS`, `MAX_DEPTH` 64, silent return
  at the cap), `pick-folder.ts`.
- `packages/cli/src/walk.ts` (`resolveModel`), `main.ts`, `args.ts`.
- `packages/core/src/format/*.ts` and `packages/web/src/results/render.ts`.
- `scripts/vendor-bpa-rules.mjs`, `scripts/te-expectations.mjs`,
  `scripts/sanitize-fixture.mjs`, `packages/core/test/parity.test.ts`,
  `packages/core/test/rule-pages.test.ts`.

## 4. Input and project shape

**What counts as input**, same rule in the CLI and the browser: a PBIP
folder holding a `.SemanticModel` and/or a `.Report`; a lone `.Report`
folder; a lone `.SemanticModel` folder; a `definition` folder; a single
`.tmdl` file; and, CLI only, a `.pbip` file, which resolves to its
folder. Whatever parts are present get linted. The result names which
layers ran and which were absent and why.

**One model and one report per run.** A folder holding more than one
`.Report` (or more than one `.SemanticModel`) is refused with the names
and "point at one of them", as v1 does for models. Finding names, the
facts block, and "not reached from the report" all assume one report.

**Pairing.** With both parts present, the report's `definition.pbir`
is read. `byPath` pointing at the model beside it is the normal case.
`byPath` pointing elsewhere, or `byConnection`, makes it a report-only
run; the model layer is reported as absent with the reason ("this
report reads a published model"), not as an error. A `byPath` that
names a different folder than the one beside it is a diagnostic.

Amended 2026-09-23 with Michael (release triage, A6): the folder
`byPath` names is compared with the one beside the report without
regard to case, as Windows and macOS file systems compare names by
default.

**What is read.** `.tmdl` under the model's `definition`;
`definition.pbir`, `.platform`, and every `.json` under the report's
`definition` (pages, visuals, mobile layouts, bookmarks, extensions);
`.pbip` when present; the nearest `pbiplint.config.json` at or above
the project root. Never read: `StaticResources`, `CustomVisuals`,
`.pbi`, `.git`, `node_modules`, and any JSON outside `definition`.
Themes are out of scope. The browser walker's `wanted()` grows to
match; a `report.json` at a `.Report` root is recorded by presence
(never opened) so the legacy format can be named.

**Engine entry.** `lint(files)` keeps its signature. Files route by
path: `.tmdl` to the model; `definition.pbir`, `.platform`, and JSON
under `definition/` to the report. The result is `project = { model?,
report? }` plus the indexes. The CLI's `resolveModel` becomes
`resolveProject` and covers every input shape above; the browser's
`selectModel` becomes `selectProject` with the same decisions on a
tree of paths. Nothing about the two surfaces diverges.

**Diagnostics channel.** A structured list on the result,
`diagnostics: { kind, message, path? }[]`, with kinds:
`depth-cap` (the walk stopped at `MAX_DEPTH` inside folder X, so files
below it were not read), `unread-file` (a wanted file failed to read),
`legacy-report-format` (a `.Report` with `report.json` at its root and
no `definition`; "save it in the PBIR format from Power BI Desktop"),
`legacy-model-format` (a `.SemanticModel` with `model.bim`; the v1
message), `model-reference-mismatch`, `schema-newer-than-known`.
Rendered as notices under the summary on the site, in the text and
Markdown formats, in JSON, and on stderr in the CLI. The two legacy
kinds make the layer count as absent. This closes the carry-over from
issue #22.

Amended 2026-09-23 with Michael (release triage, A7): `unread-file`
also covers a folder under the input that cannot be entered or listed,
and the walk goes on with the rest. A part folder (a `.Report` or
`.SemanticModel`) that cannot be read, or none of whose files could be
read, makes that layer absent with the reason "the report folder could
not be read" or "the model folder could not be read". The input
itself, when it cannot be read at all, is refused with
`Could not read <input>: <reason>`, as an input that does not exist is.
So is an input none of whose files could be read, since a run over it
would report no findings with nothing linted. The input itself was
read then, and a refused run prints no notices, so the message names
the path that refused first, with its reason: the input (or, for a
`.pbip`, its folder) joined with that path relative to it, as in
`Could not read Demo/Demo.Report/definition: EACCES: permission denied`
for the input `Demo`. A notice does not change the exit code, which
follows the findings as it does for the legacy formats. The browser's
resolver in pull request 7 makes the same decisions.

Amended 2026-09-25 with Michael (pull request 7, #81): what the input
reader could not read reaches the engine, not only the notices, so no
finding or fact states what pbiplint did not read. `lint` takes
`unreadPaths`, per layer like `absent`: the paths the reader could not
read, each relative to that part's root in forward slashes as every
file path is, a folder written with a trailing `/`
(`definition/tables/`). It is per layer because a folder's name cannot
route it: both parts have a `definition` folder. The CLI's walk
collects each part's list as it reads that part, from that read rather
than from the notices, which name a path once however many reads meet
it; the browser's resolver in pull request 7 fills the same option. A
model path, a `.tmdl` file or a folder, is recorded on the model and
makes it one pbiplint could not fully read (sections 6 and 8.2). A
report file the PBIR format defines under the definition folder joins
the report's unread definition files as one that failed to parse does,
through the same code, and a folder there counts, for every question a
rule or fact asks about unread files, as every definition file it could
hold: a visual's folder its visual.json and mobile.json, a page's
folder its page.json and everything under it, the pages or bookmarks
folder any file of its kind, and `definition/` anything. The page or
visual such a folder names is recorded as its own file would record it.
An unread definition.pbir, `.platform`, or `.pbip` changes nothing,
since none names a field. No unread path is a `PARSE_ISSUE` finding:
the `unread-file` notice names it, and the notice is unchanged. Amended
2026-09-25 with Michael (release triage, batch F): a path written
without its trailing `/` is read as a folder when it is not a file the
layer reads (a `.tmdl` file for the model, a report file for the
report), so the model's `.platform` given to the model layer counts as
a folder there. A caller passes only such files and folders, as the CLI
and the browser do.

Amended 2026-09-25 with Michael (pull request 7, #86): a `.pbip` given
to the CLI resolves to the one report its `artifacts` entry names,
that `path` taken relative to the `.pbip`'s folder, and to the model
that report's `definition.pbir` names by path, taken relative to the
report folder, wherever each sits, instead of to its whole folder.
Nothing else in the `.pbip`'s folder is read or refused, so a project
that sits beside others in one folder lints with both parts
(`PBIWorkspace/Cost.pbip` in mewancegeka/PBIWorkspace was refused as a
folder holding two semantic models). The `.pbip`'s folder stays the
project root: the config search starts there, notices name paths
relative to it, and a run of which nothing could be read is refused
naming the path joined to it, as above. Microsoft's pbipProperties
1.0.0 schema gives `artifacts` as an array of report entries only,
`{ "report": { "path" } }`, with no limit on their number and no model
entry, so a `.pbip` reaches its model only through the report's
`definition.pbir`; all 71 of the 71 `.pbip` files in the local corpora
name exactly one report. A `.pbip` naming more than one report (each
report folder counted once by the path it resolves to, however often
it is named) is refused with the names and "point at one of them", as a
folder holding more than one is (`Both.pbip names 2 reports; point at
one of them: Cost.Report, Sales.Report`), and one naming a report
folder that is not there is refused as an input that does not exist is
(`Cost.pbip names Cost.Report, which does not exist`, the path as the
`.pbip` writes it). Two refusals go beyond the rulings, so that no run
reads as clean with nothing linted: a report path that is a file is
refused as `Cost.pbip names Cost.Report, which is not a folder`, and a
named report folder holding nothing to lint as `No semantic model or
report found in Cost.Report, which Cost.pbip names`. On this route
`byConnection` leaves the model out with the reason "this report reads
a published model"; a `byPath` naming a folder that is not there
leaves it out with the reason "this report reads a model that is not
there (<path>)"; a `definition.pbir` that could not be read (when the
report was read) leaves it out with the reason "the report's
definition.pbir could not be read" (ruling L27), beside the
`unread-file` notice naming the file, since which model the report
reads is then not known; a report with no `definition.pbir`, or one
naming no model, is read alone. The two
legacy formats give their notices and reasons as the folder route
does, and a legacy report's `definition.pbir` still names its model.
`model-reference-mismatch` does not arise, since the path is followed
rather than compared with a folder beside the report. A `.pbip` that
names no report (one that is not valid JSON, is not an object, or
whose `artifacts` holds no report entry) is read as its folder, as
before, and core still reports one that is not valid JSON. Folder
input, and a `.pbip` found inside a folder given as input, are
unchanged, refusals included.

## 5. PBIR parser and report object model

**Parser.** Plain JSON, read tolerantly: unknown properties ignored;
every schema version seen (1.0.0 in the fab-inspector fixtures through
visual 2.8.0 and report 3.3.0) parsed the same way; a `$schema` newer
than the parser knows is a `schema-newer-than-known` diagnostic, not a
failure. A file that is not valid JSON, or that carries merge-conflict
markers (`<<<<<<<`, `=======`, `>>>>>>>` at line start), produces a
`PARSE_ISSUE` finding with file and line. Every part keeps its file
path and raw text.

Amended 2026-09-23 with Michael (release triage, DQ8): the parser
knows the newest version Microsoft publishes of the schema family of
each report file it reads a property from: the definition folder's
files (Microsoft's `fabric/item/report/definition` schemas),
definition.pbir (`fabric/item/report/definitionProperties`), and the
report's `.platform` (`fabric/gitIntegration/platformProperties`). The
diagnostic is given only for a newer major version.
Power BI Desktop saves files on minor versions Microsoft has not
published (visualContainer 2.10.0 to 2.12.0 in Desktop-saved reports),
which the parser reads as the family's known shape.

Amended 2026-09-23 with Michael (release triage, A2): a file whose
document parses but is not a JSON object also produces a `PARSE_ISSUE`
finding, since Microsoft's schemas give every file the PBIR format
defines an object root; nothing in it is read. Those files are
definition.pbir, the report's `.platform`, the project's `.pbip`, and,
under `definition/`, the files Learn's PBIR folder table names. Any
other JSON file under `definition/` is the author's own, with no schema,
and keeps the reading above: invalid JSON or a conflict marker there is
a `PARSE_ISSUE` finding, and a document that is not an object is not.

**Object model.**

- `Report`: file, schema version, theme name, `publicCustomVisuals`,
  registered custom visual packages, Filters pane state (`expanded`,
  `visible`, `hiddenInViewMode`), report-level filters, extension
  measures.
- `PagesHeader`: `pageOrder`, `activePageName`, `landingPageName`.
- `Page`: id (`name`), display name, width, height, display option,
  visibility, the page's own `type` (tooltip, drillthrough), binding
  type (tooltip, drillthrough) and parameters, filters, visuals, file,
  `annotations`.
- `Visual`: id, page, position (x, y, z, width, height, tabOrder),
  type, `isHidden`, group membership, filters, fields bound per role,
  title text, alt text, actions (type and target), `annotations`, raw
  text, file. Mobile layout presence.
- `Bookmark`: id, display name, active page, pages and visuals it
  captures, filters, file. `BookmarksHeader`: the ordered items and
  groups.
- `ReportMeasure`: table, name, DAX, hidden, file, line.

Amended 2026-09-24 with Michael (release triage): the model records
what a definition file that could not be read would have defined, by
the folder or file name Power BI Desktop gives it, which Learn's PBIR
naming convention says is the object's `name` by default: `Report`
gains the pages whose page.json could not be read (by folder; 713 of
714 Desktop-saved pages keep their `name` as their folder) and the
bookmarks whose `<name>.bookmark.json` could not be read (576 of 576),
and `Page` gains the visuals in its folder whose visual.json could not
be read (13,026 of 13,026). The unread visuals sit on the page because
a visual.json is joined to its page by folder, and a page's `name` can
differ from its folder after a rename. A page whose page.json could not
be read and one of whose visuals was read is, as before, a page named
by its folder.

**Field references** are found by one walker over any JSON node,
yielding `{ kind: column | measure | hierarchyLevel | aggregation,
table, name, owner, jsonPointer }`, resolving `From` aliases within the
filter that declares them. The same walker serves visuals, every
filter level, bookmarks, and, through the existing DAX extractor,
extension measures. New visual properties are covered without a code
change.

Amended 2026-09-25 with Michael (release triage, batch E): a `Column`
whose source is a `Subquery`, Power BI Desktop's form for a text box's
field value (under a `Min` or an `Aggregation` in the visual's
`objects.values`), names a column of the subquery's result, by the
`Name` of one of the query's `Select` items, rather than a model
field, and is not itself a reference. That name can differ from the
field the query reads (46 of the 269 such values in the Desktop-saved
reports surveyed), so it is a label, not a model field. The walker
reads the subquery's own query as it reads a TopN filter's subquery,
with the enclosing aliases in scope and the query's own `From` adding
and shadowing them, so the fields the query reads (in its `Select`,
`Where`, `OrderBy`, a `Transform`'s input, and a subquery in its own
`From`) are resolved against the model and reached,
including those the text box does not display. The Model fact's
not-reached clause (section 6) counts what the reachability index
does not reach, so it follows. A `Measure` or `Hierarchy` whose source
is a `Subquery`, which none of the Desktop-saved reports surveyed
writes, remains a reference whose source names no model table.

**Finding names and ids.** Page: `Page "Overview"`. Visual: `"<title>"
on "<page>"` when the visual has a title, else `<visualType> (<first
six characters of the id>) on "<page>"`. Bookmark: `Bookmark "Reset"`.
Report: `Report`. Report measure: `[Net Margin] (report)`. Page filter:
`Page filter on "Detail"`; report filter: `Report filter`. Every
report finding also carries `objectId` (the page, visual, or bookmark
`name`; `report` for the report), which parity compares. Every report
finding has a file; the line is the property's line when the rule
points at one (`altText`, `height`, a reference), resolved from a JSON
pointer by a small position scanner over the raw text, else 1.

Amended 2026-09-23 with pull request 5, reading the conditions rather
than changing them: a group has no `visualType` and no title
(Microsoft's visualContainer schema makes `visual` and `visualGroup`
exclusive), so a group whose `visualGroup` records a `displayName` is
named `Group "<displayName>"`, labelled `Group "Filters" on
"Overview"`, and a group without one keeps `visualGroup (<first six
characters of the id>)`.

**Ignores.** `annotations` on visuals and pages carry
`{ "name": "pbiplint.ignore", "value": "RULE_ID_1, RULE_ID_2" }` or
`"*"`, matched as the TMDL annotation is. Report-level findings are
switched off in config.

## 6. Project indexes

Built once per run beside the three model indexes.

**Report reference index.** Every field reference with its owner (a
visual's role, a visual filter, a page filter, the report filter, a
bookmark, an extension measure) and its resolution against the model
when present: a column, a measure, or unresolved with the reason (no
such table; no such column on that table; no such measure). Offers
`referencedBy(column | measure)` for the report side, `unresolved()`,
and the fields used per visual. Built in a report-only run too, with
everything unresolved; the rules that need resolution are skipped with
reason `noModel`.

Amended 2026-09-23 with pull request 4: a reference that names a
schema, in its `SourceRef` or in the `From` entry of its alias,
resolves among the report's own measures only (Power BI Desktop writes
`"Schema": "extension"` in every reference to a report measure, and
Microsoft's reportExtension schema says to leave the schema empty for a
model measure), so a reference left naming the extension after its
measure moved into the model is unresolved, whatever the model holds.
While reportExtensions.json cannot be read (merge-conflict markers,
invalid JSON, or a document that is not a JSON object, which section 5
makes a `PARSE_ISSUE` finding), such a reference resolves to `unread`,
which no rule reports, because pbiplint cannot say what the file
defines; with no reportExtensions.json in the input, it stays
unresolved, with a reason saying the report defines no extension
measures.

**Reachability index.** Roots: every resolved report reference; both
columns of every relationship; columns named in RLS and OLS filters;
variation default columns; the extension measures' DAX references.
Walk to a fixed point: a reached measure adds what its DAX references;
a reached calculated column adds what it references; a reached column
on a calculated table reaches the table, whose expression adds what it
references; a reached column adds its sort-by column; a reached
hierarchy level adds its column; a reached calculation-group table
adds its items' references. Output: for every table, column, and
measure, `reached` and the shortest path that reached it; the
unreached set grouped so a dead chain reads top-down. The existing
`UNNECESSARY_*` rules keep their one-hop logic for Tabular Editor
parity; `NOT_REACHED_FROM_REPORT` reads this index.

Amended 2026-09-23 with pull request 3: a report reference through a
date column's variation (Desktop's auto date/time hierarchy, a
`PropertyVariationSource` in the JSON) resolves to the level on the
local date table the variation names and reaches the date column too;
a reached column adds its group-by columns (`relatedColumnDetails`,
such as a field parameter's hidden Fields column); and a relationship
to a Desktop-managed date table roots neither end (section 8.2).

Amended 2026-09-23 with Michael (release triage, A10): every column
with an `alternateOf` mapping, an aggregation table's column, is a
root, and a reached one reaches the base column or table its mapping
names; no report names an aggregation column, since report queries
refer to the detail table and Power BI redirects them to the
aggregation table when it covers the query.

**Facts.** Structured list, `{ layer, label, value, detail?, ruleId? }`:

| Label | Value | Rule id when it applies |
|---|---|---|
| Opens on | landing page display name, or the active page with "the page open when it was saved; no landing page set" | `LANDING_PAGE_NOT_SET` |
| Filters pane | open / closed / hidden from readers | `FILTERS_PANE_STATE` |
| Pages | count; hidden; tooltip; drillthrough | `HIDE_TOOLTIP_DRILLTROUGH_PAGES` |
| Visuals | count; hidden; custom visual types registered and used (the used count unknown while a visual.json could not be read and a registered type is used by no visual that was read, amended 2026-09-24 with Michael) | `HIDDEN_VISUAL_WITH_FIELDS`, `REMOVE_UNUSED_CUSTOM_VISUALS` |
| Report measures | count | `REPORT_LEVEL_MEASURES` |
| Slicers | count of the catalog slicers; saved selections, those on custom slicers named; unknown in place of none while a visual.json could not be read (amended 2026-09-24 with Michael) | `SLICER_SELECTION_SAVED` |
| Mobile layouts | pages with one, counted by the mobile.json files read in their folders, of total; unknown in place of none while a mobile.json, or the page of one, could not be read (amended 2026-09-24 with Michael) | |
| Schema versions | report, page, visual (highest seen) | |
| Model | tables, columns, measures, leaving out Desktop's hidden auto date/time tables (amended 2026-09-25 with Michael); with both parts, columns and measures not reached from this report | `NOT_REACHED_FROM_REPORT` |

Amended 2026-09-20: the facts are built only when the report layer is
present, so a model-only run produces none and no surface shows the
block or its heading.

Amended 2026-09-23: Opens on names the first page in `pageOrder` when
`pages.json` sets neither a landing page nor an active page, and says
unknown when `pages.json` was not read (absent, or unreadable) or names
neither page in a report with no pages. The fact links `OPENING_PAGE_INVALID` when that
rule fires, else `LANDING_PAGE_NOT_SET` when it fires.
Filters pane reads a `report.json` that does not record `expanded` as
open; Desktop writes `false` whenever the pane was collapsed. Filters pane
says unknown, and `FILTERS_PANE_STATE` reports nothing under any policy,
when `report.json` was not read (absent, or unreadable). That unknown
Filters pane fact links no rule, because the rule cannot fire then.

Amended 2026-09-23 with Michael: Report measures shows its count
whenever the report defines measures, and links `REPORT_LEVEL_MEASURES`
only when that rule fires, that is, with the model the report reads in
the run (section 8.3).

Amended 2026-09-23 with pull request 5, reading the conditions rather
than changing them: Slicers counts the five slicer types in Microsoft's
visual catalog (`slicer`, `advancedSlicerVisual`, `listSlicer`,
`textSlicer`, `filterSlicer`), and a slicer with a saved selection is
one whose `visual.objects.general[].properties.filter` holds a `filter`
with a non-empty `Where` (Microsoft's capability data and Desktop-saved
files, section 3.4), which is the condition `SLICER_SELECTION_SAVED`
reports.

Amended 2026-09-23 with Michael (release triage, A3 to A5): Report
measures says unknown, with "reportExtensions.json was not read", when
that file is in the input but could not be read, and then links no
rule. Pages counts a tooltip page by either marking Microsoft's page
schema gives it, page.json's own `type` or its `pageBinding.type`
(Desktop-saved reports mark most tooltip pages by `type` alone). A fact
links a rule only when that rule ran in the run, so a rule turned off
in config or skipped links nothing.

Amended 2026-09-24 with Michael (release triage, DQ6, narrowed by
ruling H68): Pages counts a drillthrough page by its `pageBinding.type`
alone, as it did before, and a tooltip page by either marking, the
readings `HIDE_TOOLTIP_DRILLTROUGH_PAGES` shares from this amendment on
(section 8.1). page.json's own `type` of `Drillthrough` alone does not
make a page a drillthrough page, because in the research corpus it
marks pages that are no drillthrough target (section 8.1).

Amended 2026-09-24 with Michael (release triage, DQ4): Visuals counts a
visual hidden through an ancestor group as hidden, as well as one with
its own `isHidden`, the reading `HIDDEN_VISUAL_WITH_FIELDS` shares from
this amendment on (section 8.2).

Amended 2026-09-24 with Michael (release triage, DQ5): a saved
selection is read on any visual type, so custom slicers from AppSource
are covered; in Desktop-saved files every visual type that carries
`general.filter` is a filtering visual. Slicers counts a visual as a
slicer when it is one of the five catalog types, with a selection or
without, or carries a saved selection, and its "with a saved selection"
count covers every visual that carries one, so it never exceeds the
slicer count; this is the reading `SLICER_SELECTION_SAVED` shares
(section 8.4). Amended 2026-09-24 with Michael (release triage, ruling
H72), replacing the count above: counting a custom slicer by its
selection made clearing the selection lower the count, which read as a
deleted slicer. The value now counts the five catalog types only, with
a selection or without, so clearing a selection never changes it, and
reads `none` when there is none of them. The detail counts every saved
selection, the ones `SLICER_SELECTION_SAVED` reports, and names those
on a visual that is not a catalog slicer: `2 saved selections, 1 on a
custom slicer`, `1 saved selection` when none is on a custom slicer, or
`no saved selection` beside catalog slicers that open clear. With no
catalog slicer and a custom slicer's selection the value reads `none`
and the detail names the selection, so the row says there is no
catalog slicer and a custom one carries a selection, and it keeps
reading `none` when that selection is cleared. The fact links
`SLICER_SELECTION_SAVED` whenever a selection is saved.

Amended 2026-09-24 with Michael (release triage, DQ3): when a report
file under the definition folder could not be read, that is, a file
the PBIR format defines there (section 5) whose read raised a
`PARSE_ISSUE` (invalid JSON, merge-conflict markers, or a document that
is not a JSON object), `NOT_REACHED_FROM_REPORT` is skipped, with the
reason on the skipped line (section 7), because pbiplint cannot say
what an unread file reaches. The Model fact then keeps its table,
column, and measure counts, its not-reached clause says unknown ("not
reached from this report: unknown, a report file could not be read"),
and it links no rule. The report's `.platform`, definition.pbir, and
the project's `.pbip` name no field, and a JSON file under the
definition folder that the format does not define is not part of the
report, so none of them counts. Amended 2026-09-24 with Michael
(release triage, E8, ruling H70): of those files, only one the
reachability walk reads field references from skips the rule and makes
the not-reached clause unknown: report.json (the report's filters),
reportExtensions.json (its measures' DAX), a page.json (the page's
filters and binding), a visual.json, and a bookmark file, the owners
the report reference index reads (`holdsFieldReferences` in
pbir/build.ts, the predicate `fieldFileUnread`). version.json,
pages.json, bookmarks.json, and a visual's mobile.json name no field
the walk reads, so one of them unread, a merge conflict in pages.json
included, leaves the rule running and the fact counting.

Amended 2026-09-24 with Michael (release triage, ruling H71): a fact
that states absence or non-use says nothing about what an unread file
could hold, and says unknown only where the unread file could change
what it would say (narrowed by ruling H74). While a visual.json could
not be read and a registered custom visual type is used by no visual
that was read, the Visuals fact's custom visual clause reads `2 custom
visual types registered, used: unknown, a visual.json could not be
read` and links no rule for it, since the unread visual could be of
that type (`REMOVE_UNUSED_CUSTOM_VISUALS` is skipped on the same
condition, section 8.1); with every registered type used by a visual
that was read, it keeps its count. While a visual.json could not be
read, the Slicers fact says unknown where it would say none, since the
unread visual could be a catalog slicer or carry a selection: its value
reads `unknown` in place of `none`, and its detail reads `saved
selections: unknown, a visual.json could not be read` in place of `no
saved selection`, or ends `; a visual.json could not be read` after the
selections it counted when the value is unknown. Mobile layouts counts
a page by the mobile.json files read in its folder, so a mobile layout
pbiplint read counts even when its visual.json could not be read
(ruling H75). While a mobile.json could not be read, it reads
`unknown`, with `a mobile.json could not be read`, in place of `none`,
and while a mobile.json that was read has no page to count and a
page.json or a visual.json in its folder could not be read, it reads
`unknown`, with `a page with a mobile layout could not be read`. A stray
mobile.json in a folder where nothing failed to read marks no page, and
`none` stays (ruling H76). A count that is not none, such
as Pages, the Visuals count and its hidden count, or `1 of 3 pages`, is
a lower bound and stays as it is. Opens on
names a landing or active page whose page.json could not be read by
the name pages.json gives it, as it names a page known only by its
folder, and never calls it "(no such page)"; `OPENING_PAGE_INVALID`
does not fire on it (section 8.2).

Amended 2026-09-25 with Michael (release triage, batch E): the Model
fact's table, column, and measure counts leave out Power BI Desktop's
auto date/time tables (calculated tables whose names start with
`LocalDateTable_` or `DateTableTemplate_`, as `NOT_REACHED_FROM_REPORT`
and `REMOVE_AUTO-DATE_TABLE` recognise them) and their columns.
Microsoft Learn's "Auto date/time in Power BI Desktop" says Desktop
keeps those tables hidden, even from modelers, so the fact counts the
tables Desktop shows, and its not-reached clause already left them
out.

Amended 2026-09-25 with Michael (pull request 7, #81): the reachability
walk reads the model as parsed, so while a model file has a parse issue
that can take an object out of the model (any issue but an orphaned
`///` description, section 8.2) or the model has a path the input
reader could not read (section 4), anything reached only through a
missing object would read as not reached. On that condition the Model
fact's not-reached clause reads `not reached from this report: unknown,
a model file could not be fully read` and links no rule; when a report
file the walk reads field references from could not be read as well,
the report file's unknown is the one given. The table, column, and
measure counts stay as they are, a lower bound. A report file the input
reader could not read counts for every fact as a file that failed to
parse does, and a folder as every file it could hold (section 4). While
the model has an unread path, the report reference index resolves a
reference to a table the model does not have, or to a field missing
from any table, to `unread`, since that path could declare any table
and anything under one, and the reason names the first unread path, as
`no table named "Store", and definition/tables/Store.tmdl could not be
read`, except that for a field missing from a table, a model file that
declares the table and has a parse issue that can drop an object is
named ahead of it.

Amended 2026-09-25 with Michael (pull request 7, #86): Filters pane
links `FILTERS_PANE_STATE` only when that rule ran and its resolved
options carry an `expect` policy, however the config writes it, whether
the saved state meets the policy or breaks it. The fact reads the
options the rule is checked with, so the two cannot disagree. Under a
policy the rule checks the pane, so the fact links it, and on the web
results page the link leads to the rule's page when the state meets
the policy and to its finding group when it does not (section 9).
Without a policy the rule runs but can never fire, so the fact links
no rule, for the reason the unknown Filters pane fact links none: a
fact links its rule only when that rule can fire. The value, the
detail, and the unknown case are unchanged, and the sample sets a
policy, so its facts do not move. This supersedes the mockup's Filters
pane, which linked the rule page with a hint to set a policy: without
one the fact links nothing and adds no detail.

Amended 2026-09-25 with Michael (release triage, batch F): a count of
0 states that nothing is there, which pbiplint must not say about what
it did not read, so three counts read unknown in place of 0 while what
they count could not be read. Pages reads `unknown`, with `a page.json
could not be read`, while a page.json could not be read or a folder
that could hold one could not be (definition/, the pages folder, or a
page's folder), so a report whose pages folder could not be listed no
longer reads 0 pages beside an Opens on that names a page. Visuals
reads `unknown` while a visual.json, or a folder that could hold one,
could not be read, the condition the Slicers fact reads, and its
detail names the reason once: `a visual.json could not be read`, or,
with a custom visual type registered, the custom visual clause, which
already ends with it (`1 custom visual type registered, used: unknown,
a visual.json could not be read`). Each of the Model fact's table,
column, and measure counts that would read 0 reads `tables: unknown`,
`columns: unknown`, or `measures: unknown` while the model could not
be fully read, the condition of the #81 note above; its not-reached
clause gives that reason, and when the clause gives the report file's
reason instead, the detail adds the model's after it: `not reached
from this report: unknown, a report file could not be read; a model
file could not be fully read`. A report file that could not be read
makes no model count unknown, since it declares no model object. A
count above 0 stays as it is, a lower bound (ruling H71), and the
hidden counts, shown only above 0, are unchanged. This narrows two
earlier readings to counts above 0: the H71 note's, which kept Pages
and the Visuals count as they were, and the #81 note's, which kept the
Model fact's table, column, and measure counts.

**Cost.** Linear in the JSON. The demo report's largest visual is
61 KB, most under 5 KB; a 300-visual report is a few megabytes and
lints well under a second in the browser. No new dependency.

## 7. Rule engine changes

**Rule interface.** `Rule` gains `layer: "model" | "report" |
"project"`; `check(project, ctx)` receives `{ model?, report? }` and a
context holding all indexes. `bpaRule` adapts the existing 72
`check(model, ctx)` bodies, which do not change. New helpers:
`inspectorRule(id, check)` for the 11 ports (metadata from the
vendored ruleset, description from the page) and
`pbiplintRule({ ... })` for native rules. `status` stays `ported |
needsLiveModel | builtin`; native rules are `builtin`.

**Skips.** `rulesSkipped` reasons: `disabled | needsLiveModel |
noModel | noReport | reportFileUnread`; the skipped line says "14 rules
skipped: no report in the input". Amended 2026-09-24 with Michael
(release triage, DQ3): a rule that declares `needsEveryReportFileRead`
beside `needs`, which only `NOT_REACHED_FROM_REPORT` does, is skipped
with `reportFileUnread` when a report file under the definition folder
could not be read (section 6), and the skipped line says "1 rule
skipped (a report file could not be read)"; a missing layer's reason
comes first. The JSON document carries the reason in
`summary.rulesSkipped`; SARIF, which lists no skipped rule, gains
nothing. Amended 2026-09-24 with Michael (release triage, E8 and ruling
H71): the field is now `skipWhenUnread`, a predicate over the report
that names which unread files stop the rule, one exported per condition
from report-helpers.ts. `NOT_REACHED_FROM_REPORT` sets
`fieldFileUnread`, a file the report's field references are read from
(section 6), and `REMOVE_UNUSED_CUSTOM_VISUALS` sets
`customVisualUseUnknown`, a visual.json while a registered custom
visual type is used by no visual that was read (section 8.1, narrowed
by ruling H74); no other rule sets one. run.ts stays the one place that
skips, with the same reason and the same words, and the facts call the
same predicates.

Amended 2026-09-25 with Michael (pull request 7, #81): the skip widens
to the model. A rule may declare `skipWhenModelUnread`, a predicate
over the model beside `skipWhenUnread`; only `NOT_REACHED_FROM_REPORT`
does, with `modelPartlyRead` in rules/helpers.ts, which holds while a
model file has a parse issue that can take an object out of the model
or the model has a path the input reader could not read (section 4).
The rule is then skipped with the reason `modelFileUnread`, and the
skipped line says "1 rule skipped (a model file could not be fully
read)". The report's predicate is checked first, so a rule both stop is
skipped with `reportFileUnread`. run.ts stays the one place that skips,
and the Model fact calls the same predicate (section 6). The JSON
document carries the reason in `summary.rulesSkipped`; SARIF gains
nothing.

**Object types.** `Report`, `Page`, `Visual`, `Bookmark`,
`ReportMeasure` join `ObjectType`.

**Categories.** Two new: **Accessibility** and **Report Design**.
`CATEGORY_ORDER` becomes Performance, Error Prevention, Accessibility,
DAX Expressions, Maintenance, Report Design, Formatting, Naming
Conventions.

**Config.** A rule's value grows from `"off" | severity` to also
accept an object with `severity` and the rule's declared options:

```json
{
  "rules": {
    "REDUCE_VISUALS_ON_PAGE": { "severity": "error", "max": 15 },
    "FILTERS_PANE_STATE": { "expect": "closed" },
    "NOT_REACHED_FROM_REPORT": "warning",
    "ENSURE_ALTTEXT": "off"
  },
  "failOn": "warning"
}
```

Each rule with options declares them (name, type, default). The config
is validated against the declaration; an unknown or mistyped option is
a `ConfigError` as an unknown key is today. Thresholds default to the
source's values. Policy rules use the same mechanism (`expect`); a
policy rule emits nothing until its option is set and its page says
so; the fact is shown regardless. A v1 config file stays valid.

**Ranking** is unchanged; facts are not ranked. **Rule pages** follow
the complete template of `2026-09-19-rule-pages-template-design.md`:
eight sections, every example proven through the engine by the
rule-pages test, the ignore mechanics generated onto the page, and
attribution printed from `sources`. Frontmatter gains `layer`. A
report rule's Example uses two fences with the info strings `pbir
fires` and `pbir fixed`, each holding one report JSON document and,
after the info string, the file it stands for (`pbir fires
visual.json`), so the test can place it in a minimal report tree; the
rule-pages test gains a hook that runs the report linter over a `pbir`
fence the way it runs the model linter over a `tmdl` fence, and the
same assertions apply (the fires fence produces a finding for the
page's rule and no diagnostic, the fixed fence neither). The site
renderer captions a `pbir` fence as it captions a `tmdl` one, naming
the file the document stands for ("Fires the rule in visual.json"); a
`tree.json` document names its files itself, so its caption carries
none (amended 2026-09-20 with the plan).
Fix routes are Desktop's report view or a JSON edit Desktop preserves,
never a third-party tool.

## 8. The rule set

Ported ids stay verbatim, including `DRILLTROUGH`, because parity
compares on ids. All ported rules are `warning`.

### 8.1 Ported from fab-inspector (11)

| Id | Scope | Category | Options | Notes |
|---|---|---|---|---|
| REMOVE_UNUSED_CUSTOM_VISUALS | Report | Performance | | One finding per unused custom visual |
| REDUCE_VISUALS_ON_PAGE | Page | Performance | `max` 20 | Visuals with their own `isHidden` and shapes, slicers, buttons, text boxes excluded, as the source does (amended 2026-09-24 with Michael) |
| REDUCE_OBJECTS_WITHIN_VISUALS | Visual | Performance | `max` 6 | **Deviation:** count the fields bound to the visual's roles once, not every `projections` array in the file |
| REDUCE_TOPN_FILTERS | Page | Performance | `max` 4 | |
| REDUCE_ADVANCED_FILTERS | Page | Performance | `max` 4 | **Deviation:** count only filters with a condition applied; the source also counts an Advanced filter with nothing set, such as a slicer's or one Desktop writes for a visual's own fields (amended 2026-09-22 after the oracle run) |
| REDUCE_PAGES | Report | Performance | `max` 10 | |
| AVOID_SHOW_ITEMS_WITH_NO_DATA | Visual | Performance | | `query.queryState.<role>.showAll` true. **Deviation:** every well is read, where the source reads the Category well only (amended 2026-09-24 with Michael) |
| HIDE_TOOLTIP_DRILLTROUGH_PAGES | Page | Report Design | | Tooltip or drillthrough page and visibility not `HiddenInViewMode`. **Deviation:** reads a tooltip page from page.json's own `type` as well as `pageBinding.type`; a drillthrough page from `pageBinding.type` alone, as the source does (amended 2026-09-24 with Michael) |
| ENSURE_THEME_COLOURS | Visual | Report Design | | **Deviation:** hex literals in colour properties only, not in any string |
| ENSURE_PAGES_DO_NOT_SCROLL_VERTICALLY | Page | Report Design | `maxHeight` 720 | Visible pages only |
| ENSURE_ALTTEXT | Visual | Accessibility | | Source ships it off; pbiplint ships it on. Shapes excluded, as the source does. **Deviation:** a visual group's own alt text counts, where the source reports every group (amended 2026-09-24 with Michael) |

Amended 2026-09-24 with Michael (release triage, DQ6, narrowed by
ruling H68): `HIDE_TOOLTIP_DRILLTROUGH_PAGES` reads a tooltip page from
either marking Microsoft's page schema gives it, page.json's own `type`
or `pageBinding.type`, where the source reads only `pageBinding.type`,
so it also reports the tooltip pages Power BI Desktop marks by `type`
alone (78 of the 83 tooltip pages in the research corpus of
Desktop-saved reports). It is the fourth documented deviation. It reads
a drillthrough page from `pageBinding.type` alone, as the source does:
in the research corpus of Desktop-saved reports the three pages marked
`Drillthrough` by page.json's own `type` alone carry no drillthrough
fields (a visible ordinary page in one report, two hidden pages whose
`pageBinding.type` is `Default` in another), while all 88 pages whose
`pageBinding.type` is `Drillthrough` carry them. The finding points at
`pageBinding` when that marks the page, else at `type`. The Pages fact
counts tooltip and drillthrough pages the same way (section 6).

Amended 2026-09-24 with Michael (release triage, DQ4):
`REDUCE_VISUALS_ON_PAGE` leaves out a visual by its own `isHidden`
only, as the source's test does, so a visual hidden only through its
group is counted and the hidden group itself is not. This is not a
deviation: the row now names what its "hidden visuals" always meant,
because `HIDDEN_VISUAL_WITH_FIELDS` and the Visuals fact now also count
a visual hidden through an ancestor group as hidden (sections 6 and
8.2). The ported rules keep reading the visual's own `isHidden`.

Amended 2026-09-24 with Michael (release triage, ruling H71):
`REMOVE_UNUSED_CUSTOM_VISUALS` is skipped, with "a report file could
not be read" on the skipped line (section 7), while a visual.json could
not be read and a registered type is used by no visual that was read,
because the unread visual could be of that type and the registration
would be reported as unused. With no custom visual registered, or
every registered type used by a visual that was read, the unread file
cannot change its answer and it runs (narrowed by ruling H74). This is
what it does on a file neither tool can read, not a deviation: the
oracle fixtures all parse, so parity cannot show it. The Visuals fact's
used count says unknown on the same condition (section 6).

Amended 2026-09-24 with Michael (pull request 6, E9): the sample
report shows two differences from the source that no oracle fixture
showed before. Its matrix has Show items with no data on Rows, which
`AVOID_SHOW_ITEMS_WITH_NO_DATA` reports because it reads every well,
where the source reads the Category well only. Its two visual groups
carry alt text of their own, which `ENSURE_ALTTEXT` counts, where the
source reports every group. They are the fifth and sixth documented
deviations, and the sample's expectation, now captured from the
oracle, records them.

### 8.2 Native, tier 1

| Id | Scope | Layer | Category | Severity | What it catches |
|---|---|---|---|---|---|
| BROKEN_FIELD_REFERENCE | Visual, Page, Report, Bookmark | project | Error Prevention | error | A visual, filter, or bookmark names a table, column, or measure the model does not have; detail says which and why |
| NOT_REACHED_FROM_REPORT | Column, Measure | project | Maintenance | info | Not reached by the walk in section 6; detail gives the dead chain |
| LANDING_PAGE_NOT_SET | Report | report | Report Design | info | No `landingPageName`; the report opens wherever it was saved |
| OPENING_PAGE_INVALID | Report | report | Error Prevention | error | The landing page names a page that does not exist; or, with no landing page, the active page names a page that does not exist or is hidden |
| FILTERS_PANE_STATE | Report | report | Report Design | warning | Policy `expect: open \| closed`; fires when the saved state disagrees |
| HIDDEN_VISUAL_WITH_FIELDS | Visual | report | Maintenance | info | `isHidden`, its own or an ancestor group's (amended 2026-09-24 with Michael), with fields bound; it runs its query only when a bookmark or the Selection pane shows it, so one nothing shows is left behind |

Amended 2026-09-23 with Michael, after checking the two rows against
Microsoft's own account. `OPENING_PAGE_INVALID` no longer flags a hidden
landing page: Microsoft Learn documents it as supported ("Hidden pages
can be set as the landing page. Report consumers always see the hidden
page when they open the report."); a hidden active page with no landing
page is still the slip it catches. `HIDDEN_VISUALS_STILL_QUERY` became
`HIDDEN_VISUAL_WITH_FIELDS`, Maintenance, info, with the same condition:
Phil Seamark (Microsoft) writes that hidden visuals do not fire a query
until they are made visible, so the old name and category claimed a cost
the report does not pay.

Amended 2026-09-23 with Michael: `NOT_REACHED_FROM_REPORT` leaves
Desktop's auto date/time tables (calculated tables whose names start
with `LocalDateTable_` or `DateTableTemplate_`, as
`REMOVE_AUTO-DATE_TABLE` recognises them) out of its findings, and a
relationship to one of them roots neither of its columns, which narrows
section 6's relationship roots, so a date column the report never uses
is reported; `REMOVE_AUTO-DATE_TABLE` covers the tables themselves.

Amended 2026-09-24 with Michael (release triage, DQ4):
`HIDDEN_VISUAL_WITH_FIELDS` counts a visual hidden through an ancestor
group as hidden (in the research corpus's Desktop-saved reports, only
452 of the 1,911 visuals directly inside the 216 hidden groups carry
`isHidden` themselves), and so does the Visuals fact's hidden count
(section 6). The groups above a visual are followed through
`parentGroupName` on the visual's own page, each at most once, so a
group that names itself or a cycle of groups ends the walk. A visual
with its own `isHidden` is reported at that line as before; one hidden
only through a group is reported at line 1 of its visual.json, and its
detail names the outermost hidden group, as `3 fields bound, hidden with
Group "Filters"`. The ported rules still read the visual's own
`isHidden`, as their source does.

Amended 2026-09-24 with Michael (release triage, DQ3):
`NOT_REACHED_FROM_REPORT` is skipped, with the reason "a report file
could not be read" on the skipped line (section 7), when a report file
under the definition folder could not be read, since the unread file
may reach any field and pbiplint cannot say what it reaches; the Model
fact's not-reached clause then says unknown (section 6).
`BROKEN_FIELD_REFERENCE` keeps running, because a broken reference in a
file that was read is broken whatever another file says. Amended
2026-09-24 with Michael (release triage, E8, ruling H70): the skip is
narrowed to an unread file the reachability walk reads field references
from, report.json, reportExtensions.json, a page.json, a visual.json,
or a bookmark file; version.json, pages.json, bookmarks.json, and a
visual's mobile.json name no field the walk reads, so one of them
unread no longer silences the rule, whose count would be right (section
6).

Amended 2026-09-24 with Michael (release triage, ruling H71): a rule
that reports a page as missing says nothing about a page whose
page.json could not be read, which is known by its folder name
(section 5). `OPENING_PAGE_INVALID` does not report a landing or active
page whose page.json could not be read, since it is neither missing nor
known to be hidden, and `LANDING_PAGE_NOT_SET` names such a page as
pages.json does, where it would have said the active page does not
exist. With a visual of the page read, the page was already one named
by its folder, and the rules already read it so.

Malformed JSON and conflict markers use `PARSE_ISSUE`; legacy formats
are diagnostics.

Amended 2026-09-24 with Michael (release triage, batch D): a line at
the root of a TMDL file that TMDL does not allow there (a misspelt
`table`, a `column` or a property that lost its tabs, or an annotation
with lines under it, for example) is also a `PARSE_ISSUE` finding on
that line, and nothing under it reaches the model, as before. Only the
root is checked. An object or a flag is checked against a list of the
words TMDL allows there that sits beside the parser with its sources; a
property or an expression with no name is a finding whatever its word;
and an annotation or an extended property is one when lines sit under
it, since TMDL gives neither a child line.

Amended 2026-09-24 with Michael (release triage, batch D, ruling H82):
while a TMDL file has a parse issue that can take an object out of the
model, which is any but an orphaned `///` description, a reference to a
table the model does not have, or to a field missing from a table whose
own file has such an issue, resolves to `unread` (section 6) and
`BROKEN_FIELD_REFERENCE` does not report it, since the object could be
declared in the part pbiplint could not read. So does a reference to a
field missing from any table while another file has an issue that could
have taken a `table` line with it: a line at the root of the file that
pbiplint could not read or whose type TMDL does not declare there, a
`table` line indented with spaces, or a code fence left open above a
line at the root. TMDL lets a table's declaration sit in more than one
file, so that line could have declared the table again. A measure found
on another table, and a column name a measure on the table holds, are
still reported, since a measure's name is unique in the model and a
column cannot share a name with a measure on its table.

Amended 2026-09-25 with Michael (pull request 7, #81):
`NOT_REACHED_FROM_REPORT` is skipped, with "a model file could not be
fully read" on the skipped line (section 7), while a model file has a
parse issue that can take an object out of the model or a model path
could not be read at all (section 4): a measure used only by a dropped
measure's DAX would otherwise be reported as not reached. The Model
fact's not-reached clause then says unknown (section 6). A report file
the input reader could not read stops the rule as one that failed to
parse does, and a notice, not a `PARSE_ISSUE` finding, names it.
`BROKEN_FIELD_REFERENCE` reads a model path the input reader could not
read, a `.tmdl` file or a folder, as a file whose parse issue can take
an object and a `table` line out of the model, the strongest reading
above: a reference to a table the model does not have, or to a field
missing from any table, resolves to `unread` and is not reported. A
measure found on another table, and a column name a measure on the
table holds, are still reported, as ruling H82 keeps them. With the
shelfmart fixture's Store.tmdl unreadable, the CLI's notice names the
file and no `BROKEN_FIELD_REFERENCE` finding is reported, where 13
findings of `no table named "Store"` were reported before.

### 8.3 Native, tier 2

| Id | Scope | Category | Severity | What it catches |
|---|---|---|---|---|
| DEFAULT_PAGE_NAME | Page | Report Design | warning | Display name matches `Page <n>`, `Duplicate of <name>`, or `<name> (copy)` |
| VISUAL_WITHOUT_FIELDS | Visual | Report Design | warning | A data visual with nothing bound; shapes, text boxes, images, buttons, and groups excluded |
| VISUAL_OUTSIDE_PAGE | Visual | Report Design | warning | `x + width` past the page width or `y + height` past the page height |
| REPORT_LEVEL_MEASURES | ReportMeasure | Maintenance | warning | Any measure in `reportExtensions.json`; the fix is to move it into the model |

Amended 2026-09-23 with pull request 4, reading the conditions rather
than changing them: `VISUAL_WITHOUT_FIELDS` counts a visual's well
entries, and takes every visual type for a data visual except the
thirteen that bind nothing by design (those without data roles in
Microsoft's visual catalog, the paginated report visual, and the Power
Automate visual, whose fields Learn makes optional), so a custom visual
counts as a data visual; `VISUAL_OUTSIDE_PAGE` checks ungrouped
visuals and top-level groups, whose positions are page-relative, and
reports an edge passed by at least 1 px; `DEFAULT_PAGE_NAME` reads a
display name its page.json records, and matches the English names
Desktop gives and the `<name> (copy)` form.

Amended 2026-09-23 with Michael: `REPORT_LEVEL_MEASURES` reports a
measure only when the run holds the model the report reads; a report
that reads a published model is left alone, because Learn presents
report measures as the supported route for an author who cannot change
a shared model. The rule needs both layers, so a run without the model
skips it.

Amended 2026-09-24 with Michael (release triage, DQ1):
`DEFAULT_PAGE_NAME` also matches the names Power BI Desktop gives a
new or duplicated page in other languages, exactly as Desktop-saved
files show them (`Seite <n>`, `Página <n>`, `Pagina <n>`, `ページ <n>`;
`Duplikat von "<name>"`, `Duplicado de <name>`, `Doublon de <name>`,
`Duplicata de <name>`, `Duplikat av <name>`); Microsoft publishes no
list.

### 8.4 Native, tier 3

| Id | Scope | Category | Severity | What it catches |
|---|---|---|---|---|
| BROKEN_ACTION_TARGET | Visual | Error Prevention | error | A button's `navigationSection`, `bookmark`, or `drillthroughSection` names nothing that exists |
| ACTION_WITHOUT_DESTINATION | Visual | Report Design | warning | A button's page navigation, drillthrough, or bookmark action is on but names no destination |
| BROKEN_BOOKMARK_REFERENCE | Bookmark | Error Prevention | warning | A bookmark's active page, or a page or visual it captures, does not exist |
| TAB_ORDER_FOLLOWS_LAYOUT | Page | Accessibility | warning | Tab order disagrees with reading order (top to bottom, left to right, with a row tolerance of half the median visual height). Desktop always writes `tabOrder`, so "not set" is not detectable; disagreement with the layout is. The page documents the heuristic; policy `expect: layout`, silent without it |
| SLICER_SELECTION_SAVED | Visual | Report Design | info | A slicer carries a saved selection (any visual that saves one, amended 2026-09-24 with Michael); policy `expect: none` raises it to warning |

Amended 2026-09-23 with pull request 5, reading the conditions rather
than changing them, against Microsoft's schemas and capability data,
Learn, and 13,026 Desktop-saved visual.json files.
`BROKEN_ACTION_TARGET` reads every `visualLink` entry, on any visual
that carries one (Learn: buttons, shapes, and images carry actions),
hidden or not. It checks the types `PageNavigation`, `Drillthrough`,
and `Bookmark` (Microsoft's capability data spells them so; the type is
compared without regard to case), reads the destination only from the
property that belongs to the entry's type, never from one an earlier
type left behind, and takes it only as a literal, resolved against
page.json `name` or the bookmark's `name`. An entry whose `show` is
false is switched off and is not checked, and a destination set by
conditional formatting is an expression pbiplint cannot evaluate. Nor
does it check the page navigator's pages, the bookmark navigator's
group and bookmarks, a visual's report-page tooltip, or a drillthrough
action that names a page that is not a drillthrough page.
`BROKEN_BOOKMARK_REFERENCE` reports a missing active page once, a
`sections` key that names no page only when it differs from
`activeSection` (Desktop writes one key, equal to it), and a captured
visual that is not on a page that exists; it reads neither
`visualContainerGroups` nor `options.targetVisualNames`.
`TAB_ORDER_FOLLOWS_LAYOUT` compares scope by scope, the page's own
visuals and groups and then each group's children, because Desktop
writes a grouped visual's `x`, `y`, and `tabOrder` relative to its
group, and it leaves out a hidden visual, a negative `tabOrder` (a
visual hidden from the tab order), and a missing one. It leaves out a
page set up as a tooltip, whether page.json marks it by its `type` or
by its `pageBinding`, since a tooltip shows on hover rather than being
a page a reader tabs through; drillthrough and hidden pages are
checked. "Desktop always writes `tabOrder`" does not hold for every
visual (511 of 13,026 lack it); a tab order the author never touched
is still what cannot be detected.
`SLICER_SELECTION_SAVED` reads the five slicer types in Microsoft's
catalog and the selection under
`visual.objects.general[].properties.filter` with a non-empty `Where`
(section 3.4), never a `filterConfig` entry; Select all writes no
filter and is no selection, a hidden slicer counts, and each synced
copy reports the selection it carries.

Amended 2026-09-24 with Michael (release triage, DQ5): a saved
selection is read on any visual type, so custom slicers from AppSource
are covered; in Desktop-saved files every visual type that carries
`general.filter` is a filtering visual. In the 26 Desktop-saved
repositories of the pull request 5 research corpus, the visuals with a
selection there are `slicer` 510, `advancedSlicerVisual` 26,
`listSlicer` 14, and four AppSource visuals the reports register in
`publicCustomVisuals`: `advancedtoggleswitch` 13,
`ChicletSlicer1448559807354` 6,
`textFilter25A4896A83E0487089E2B90C9AE57C8A` (the Text Filter) 2, and
`HierarchySlicer1458836712039` 2. `SLICER_SELECTION_SAVED` reports each
with the label, detail, and line it gives a catalog slicer, and no
list of visual types is kept.

Amended 2026-09-23 with Michael, three changes to the conditions
above. An action switched on whose own destination property is absent
or an empty literal is `ACTION_WITHOUT_DESTINATION`'s, at warning,
since a button that goes nowhere is unfinished work and
`BROKEN_ACTION_TARGET` is an error; Microsoft's own FinOps report uses
such buttons for their tooltips, and the rule still reports them. For
`TAB_ORDER_FOLLOWS_LAYOUT`, a tab order that sorts strictly top to
bottom, then left to right, also agrees, so the order Desktop's "match
visual order" button writes (by a third party's account) clears the
finding. `TAB_ORDER_FOLLOWS_LAYOUT` is a policy rule, silent until
`expect: "layout"` is set, because it reports most pages of a report
nobody ordered (under the policy, 559 of the 659 eligible
Desktop-saved pages in a corpus of public reports, about 85%) and a
check that fires everywhere is tuned out.

Amended 2026-09-24 with Michael (release triage, ruling H71): a rule
that reports a page, a visual, or a bookmark as missing says nothing
about one whose own file could not be read, which the report model
knows by its folder or file name (section 5).
`BROKEN_BOOKMARK_REFERENCE` does not report an active page or a
captured page whose page.json could not be read, nor a captured visual
whose folder is on the bookmark's page and whose visual.json could not
be read. `BROKEN_ACTION_TARGET` does not report a bookmark target whose
`<name>.bookmark.json` exists but could not be read, nor a page target
whose page.json could not be read; with a visual of that page read, the
page was already one named by its folder, and a page with none read is
now covered too. Amended 2026-09-25 with Michael (pull request 7, #81):
a folder under the definition folder that could not be listed quiets a
target or a capture it could hold, as an unread file does (section 4).

Mobile layouts and themes are facts only in v2.

### 8.5 Categories for the ported set

The source has no categories. Performance: the six REDUCE and REMOVE
rules and AVOID_SHOW_ITEMS_WITH_NO_DATA. Report Design:
HIDE_TOOLTIP_DRILLTROUGH_PAGES, ENSURE_THEME_COLOURS,
ENSURE_PAGES_DO_NOT_SCROLL_VERTICALLY. Accessibility: ENSURE_ALTTEXT.

## 9. Output surfaces

Mockups approved on 2026-09-18 are saved beside this spec as
`2026-09-18-pbiplint-v2-mockups.html`.

**Web results page.** Heading names both layers with file counts
("Results for Messy Sales Demo (model, 11 files · report, 27 files)").
Summary sentence as today; the skipped line names layer skips in
words. **Report at a glance** is an always-open panel under the
summary and above "Fix these first": a label/value grid; a fact with a
rule id links to that rule's group on the page when the run produced
one, else to the rule page; plain counts do not link. "Fix these
first" ranks across both layers with a layer tag per item. The Show
filter gains Model / Report. Every group carries the layer tag on its
summary row. Diagnostics render as notices under the summary. Amended
2026-09-20: the panel and its heading appear only when the report
layer is present, and the heading's file counts name present layers
only.

**Text format.** Summary line; a layer line ("Model: 11 files.
Report: 27 files. 92 rules run, 5 rules skipped (need a live model)");
the facts block with rule ids in the right margin; "Fix these first"
with tags; groups ranked together with `[report]` or `[model]` before
the rule name. Column alignment as today. Amended 2026-09-20: the
layer line names present layers only, and an absent layer's reason
rides on the skipped line that explains why its rules did not run.

**Markdown.** Mirrors the text format; the facts as a table with the
same links the page has. Amended 2026-09-20: it mirrors the layer line
and the absent facts block too, so a model-only run has no "Report at
a glance" table.

**JSON.** Adds `layers` (which ran; absent ones with the reason),
`facts`, and `diagnostics`. Findings gain `layer` and `objectId`.
Nothing existing changes shape.

**SARIF.** Unchanged in shape: more rules, report file paths, and the
layer in each rule's `properties`. Diagnostics that mean an incomplete
read go to `run.invocations[].toolExecutionNotifications`; facts are
not emitted.

**Rules index and pages.** A layer column. Attribution comes from
`sources` through the site renderer's map of known source URLs to
names (`SOURCE_NAMES` in `packages/web/src/build/pages.ts`, which
prints only sources it can name): the ported set adds one entry naming
PBI Inspector and Nat Van Gulck, and each ported report page carries
that URL alone in `sources`, with any further reading under Links.
Each report rule page follows the complete template (section 7),
including the `pbir` example fences.

## 10. Parity and testing

**Fixtures** in `tests/fixtures/`, sanitised: `base-rules-fails` and
`base-rules-passes` from fab-inspector (whole PBIPs, section 3.3);
Michael's PBIP and GitHub Demo (current PBIR, registered PNG and theme
removed) with its model; ShelfMart, whole PBIP (report and model), the
one fixture with mobile layouts and the second Desktop-written one for
the cross-layer rules; the sample project with its new report.

**Oracle expectations.** `scripts/fab-expectations.mjs` mirrors
`te-expectations.mjs`: runs the fab-inspector CLI or converts a saved
JSON (strip the BOM) into `tests/expectations/<fixture>.report.json`,
keyed by rule id, holding per page the oracle's `Actual` ids and the
pass flag, with the oracle version and the ruleset sha. RELEASING
documents the macOS invocation (section 3.2). Never run in CI.

**Deviations.** The expectation file has a `deviations` map, rule id
to one sentence. For a deviating rule the parity test asserts
pbiplint's own committed expectation (`ours` in the same file) instead
of the oracle's. Adding a deviation requires the sentence, a fixture
that shows the difference, and the same sentence in the rule page's
Quirks section (a required part of the template whenever a quirk
exists); a test checks that the three agree. Six are known
now (section 8.1). Amended 2026-09-24 with Michael (pull request 6,
E9): the sample report shows the fifth and sixth,
`AVOID_SHOW_ITEMS_WITH_NO_DATA` and `ENSURE_ALTTEXT`, and its
expectation records them.

Amended 2026-09-24 with Michael (release triage, DQ6, narrowed by
ruling H68): the fourth, `HIDE_TOOLTIP_DRILLTROUGH_PAGES` reading a
tooltip page from page.json's own `type`, is latent on the fixtures,
whose tooltip pages all carry `pageBinding`, so no fixture shows the
difference. It is handled as the `REDUCE_OBJECTS_WITHIN_VISUALS`
deviation is (pull request 2, ruling C29): no expectation file records
it, since the parity test rejects a deviation with no visible
difference; the sentence is on the rule's page under Quirks and in the
rule's doc comment; and unit tests pin pbiplint's behaviour. A fixture
that shows it later records it there.

**Native rules** have no oracle. Each is pinned two ways: a
hand-written expectation on a fixture that fires it (the sample report
fires every native rule), and a quiet check: the two `passes`-style
fixtures (`base-rules-passes`, ShelfMart) produce no native findings
except those listed by name in their expectation files.

**Unit tests** cover the parser (each file type, each schema version
seen, tolerance, conflict markers, line resolution from a JSON
pointer), the reference walker (every shape in section 3.4, aliases,
nested filters), the reachability closure (chains, cycles, structural
roots, report-only), the config extension, and the facts.

**Browser tests** (Playwright, Chromium, Firefox, WebKit) add a
whole-PBIP drop, a report-only drop, a folder with two reports, and a
depth-cap diagnostic rendered as a notice. `check:browser` is unchanged.

**Performance budget.** A 300-visual fixture generated by a script from
`base-rules-fails` (not committed) lints in under two seconds in the
browser test; the core bundle stays under 200 KB minified. Both are
asserted.

## 11. The sample project

`examples/messy-sales/` gains `Messy Sales Demo.Report` beside the
model and becomes a proper PBIP (a `.pbip` file, `.platform` in each
part, `definition.pbir` pointing at the model by relative path). It
ships in the repo, the CLI package (`--sample`), and the site bundle.

**Authoring** with the toolchain in section 3.5, `authoring` mode,
`powerbi-report-author validate` after every batch. If Michael later
opens it in Desktop and saves, the Desktop-written version replaces
the hand-written one and the expectations are refreshed.

**Planted violations**, one per report rule where the model allows: a
visual bound to a column the model lacks; a measure used only by an
unused measure; no landing page; the Filters pane saved open; two
hidden visuals with fields bound; a page called "Page 2" and a
duplicated page; a data visual with no fields; a visual past the right
edge; two report-level measures; a button pointing at a deleted page;
a button whose page navigation has no destination; a bookmark
capturing a deleted visual; a page whose tab order runs backwards; a
slicer with a saved selection; one registered custom visual no visual
uses; a tooltip page left visible; a page taller than 720; one page
with more than 20 visuals. Amended 2026-09-20 with the
plan: the seven ported rules that list leaves out are planted too (a
visual with seven fields, a page with five TopN and five applied
Advanced filters, eleven pages, a visual with Show items with no data,
a hex colour, a visual without alt text), so the sample fires every
report rule. Amended 2026-09-23 with Michael:
`ACTION_WITHOUT_DESTINATION` is planted, and the sample's config sets
`TAB_ORDER_FOLLOWS_LAYOUT`'s policy so that rule fires. Everything else
is clean.

**Sanitising.** No registered resources, the stock Fluent theme, no
`.pbi`, no `cache.abf`. `scripts/sanitize-fixture.mjs` gains a report
mode that enforces this on every fixture copied in.

## 12. Browser input changes

`InputTree` gains `diagnostics`; `walkEntry` and `walkHandle` record a
`depth-cap` diagnostic naming the folder instead of returning
silently. `wanted()` accepts `.tmdl`, `pbiplint.config.json`,
`definition.pbir`, `.platform`, `.pbip`, and `.json` files whose path
has a `.Report` segment followed by `definition`. `selectProject`
mirrors the CLI's `resolveProject` on paths: pick the model as today,
pick the report the same way, pair them through `definition.pbir`,
and produce `files`, `config`, `notes`, `read`, and `diagnostics`. The
home page copy, the drop hint, and the About page say a PBIP folder
now lints both parts and that a report alone is valid input.

Amended 2026-09-25 with pull request 7: the browser still differs from
the CLI in three places. A `.SemanticModel` folder holding no TMDL
beside one that does is linted around with a note in the browser, as
it has been since v1, where the CLI refuses a folder with two semantic
models. A report's `definition` folder dropped alone reads nothing in
the browser, which cannot see the parent's `definition.pbir`, where the
CLI reads the report, that file included, from the parent. And the
`.pbip` input, resolving to its report and that report's model, is the
CLI's alone (section 4's #86 note), since the browser takes folders.
Beyond those three, `selectProject` gives `lint` the files and the
unread paths the CLI would, with the same notices, except in three
smaller ways. The notices come in another order, the walk's in walk
order and then the browser's own, where the CLI gives them in its read
order. Only the browser has a depth cap (`depth-cap`, 64 folders),
since the CLI's walk has none, and a folder whose listing fails
partway is linted as far as it was listed, with a notice, in the
browser, where the CLI reads none of it, its listing of a folder being
all or nothing.

Amended 2026-09-25 with Michael (release triage, batch F): when two
paths inside one read refuse and nothing else was read, the refusal
the browser gives now names the path the CLI's walk meets first,
whatever order the drop listed them in: each folder's entries in name
order, a folder's contents before its next sibling, and a report's
`definition.pbir`, then its `.platform`, before its `definition`
folder, as the CLI's `reportPart` reads them. The two name the same
path.

## 13. CLI changes

`resolveProject(path)` handles every input shape in section 4,
including `.pbip`. `--help` and the README describe them. `pbiplint
rules` lists the layer. `--sample` lints the new sample. Exit codes
unchanged. SARIF `pathPrefix` logic unchanged, applied to report paths
too.

## 14. Release and sequencing

**Order of work.** This spec; then the GitHub Action as its own
bounded design and release (a `pbiplint/action` repository, plain
workflow annotations everywhere and SARIF upload where the repository
can take it, dogfooded against the sample project); then the v2 plan.
The Action pins a CLI version and bumps it when v2 ships; the v2
announcement shows it annotating a report file.

**Version.** v2 ships as 0.2.0 of both packages. Additive for
consumers; the minor bump signals the new layer.

**One plan, shippable in stages**, each landing on main through PRs:
plumbing (parser, project, indexes, engine changes, formatters, CLI);
ported rules with parity; native rules by tier; the sample report; the
browser drop and results page; docs and release. The plan is executed
in its own context window, as Michael asked; this spec and the mockup
file are its whole input.

**Documentation and attribution.** README, home, About, and rules
index updated; NOTICE gains fab-inspector's MIT notice; the rules index
names PBI Inspector and Nat Van Gulck; `docs/RELEASING.md` gains the
oracle refresh steps; CONTRIBUTING gains "adding a report rule" and
the deviation procedure.

## 15. Later

Several reports per run; theme-file rules (contrast, theme adherence
by reading the theme); cross-report unused analysis; slicer default
policies beyond presence; Power Query (v3); TMDL and PBIR fix patches;
custom rules.

## 16. Definition of done

- Every rule in section 8 exists with a page, a fixture that fires it,
  and, for the ported set, parity with the oracle or a documented
  deviation.
- `base-rules-passes` and ShelfMart are quiet under the native rules
  except as listed by name.
- A whole-PBIP drop, a report-only drop, and a model-only drop render
  correctly in three browsers; the CLI accepts every input shape in
  section 4.
- The depth cap and both legacy formats surface as diagnostics.
- The sample fires every native rule and every planted ported rule.
- The browser purity check and the performance budget pass.
- 0.2.0 is on npm and the site is live with the new pages, index
  column, and attribution.
