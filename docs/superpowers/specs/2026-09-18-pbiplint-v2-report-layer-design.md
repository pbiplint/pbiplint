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
  `mobile.json` beside it is the mobile layout.
- `definition/bookmarks/bookmarks.json`: `items[]` (`name`, optional
  `children`). `<name>.bookmark.json`: `name`, `displayName`, `options`,
  `explorationState` with `activeSection` (page name) and
  `sections[<page>].visualContainers[<visual>]`.
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
  entry; a slicer with no selection has no `filter`.
- Desktop names a duplicated page "Duplicate of <name>" in current
  builds; older copy could read "<name> (copy)". Both are matched.

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

## 5. PBIR parser and report object model

**Parser.** Plain JSON, read tolerantly: unknown properties ignored;
every schema version seen (1.0.0 in the fab-inspector fixtures through
visual 2.8.0 and report 3.3.0) parsed the same way; a `$schema` newer
than the parser knows is a `schema-newer-than-known` diagnostic, not a
failure. A file that is not valid JSON, or that carries merge-conflict
markers (`<<<<<<<`, `=======`, `>>>>>>>` at line start), produces a
`PARSE_ISSUE` finding with file and line. Every part keeps its file
path and raw text.

**Object model.**

- `Report`: file, schema version, theme name, `publicCustomVisuals`,
  registered custom visual packages, Filters pane state (`expanded`,
  `visible`, `hiddenInViewMode`), report-level filters, extension
  measures.
- `PagesHeader`: `pageOrder`, `activePageName`, `landingPageName`.
- `Page`: id (`name`), display name, width, height, display option,
  visibility, binding type (tooltip, drillthrough) and parameters,
  filters, visuals, file, `annotations`.
- `Visual`: id, page, position (x, y, z, width, height, tabOrder),
  type, `isHidden`, group membership, filters, fields bound per role,
  title text, alt text, actions (type and target), `annotations`, raw
  text, file. Mobile layout presence.
- `Bookmark`: id, display name, active page, pages and visuals it
  captures, filters, file. `BookmarksHeader`: the ordered items and
  groups.
- `ReportMeasure`: table, name, DAX, hidden, file, line.

**Field references** are found by one walker over any JSON node,
yielding `{ kind: column | measure | hierarchyLevel | aggregation,
table, name, owner, jsonPointer }`, resolving `From` aliases within the
filter that declares them. The same walker serves visuals, every
filter level, bookmarks, and, through the existing DAX extractor,
extension measures. New visual properties are covered without a code
change.

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

**Facts.** Structured list, `{ layer, label, value, detail?, ruleId? }`:

| Label | Value | Rule id when it applies |
|---|---|---|
| Opens on | landing page display name, or the active page with "the page open when it was saved; no landing page set" | `LANDING_PAGE_NOT_SET` |
| Filters pane | open / closed / hidden from readers | `FILTERS_PANE_STATE` |
| Pages | count; hidden; tooltip; drillthrough | `HIDE_TOOLTIP_DRILLTROUGH_PAGES` |
| Visuals | count; hidden; custom visual types registered and used | `HIDDEN_VISUAL_WITH_FIELDS`, `REMOVE_UNUSED_CUSTOM_VISUALS` |
| Report measures | count | `REPORT_LEVEL_MEASURES` |
| Slicers | count; with a saved selection | `SLICER_SELECTION_SAVED` |
| Mobile layouts | pages with one, of total | |
| Schema versions | report, page, visual (highest seen) | |
| Model | tables, columns, measures; with both parts, columns and measures not reached from this report | `NOT_REACHED_FROM_REPORT` |

Amended 2026-09-20: the facts are built only when the report layer is
present, so a model-only run produces none and no surface shows the
block or its heading.

Amended 2026-09-23: Opens on names the first page in `pageOrder` when
`pages.json` sets neither a landing page nor an active page, and says
unknown when `pages.json` was not read (absent, or unreadable) or the
report has no pages. The fact links `OPENING_PAGE_INVALID` when that
rule fires, else `LANDING_PAGE_NOT_SET` when it fires.
Filters pane reads a `report.json` that does not record `expanded` as
open, the state a new report opens with; Desktop writes `false` whenever
the pane was collapsed.

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
noModel | noReport`; the skipped line says "14 rules skipped: no
report in the input".

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
| REDUCE_VISUALS_ON_PAGE | Page | Performance | `max` 20 | Hidden visuals and shapes, slicers, buttons, text boxes excluded, as the source does |
| REDUCE_OBJECTS_WITHIN_VISUALS | Visual | Performance | `max` 6 | **Deviation:** count the fields bound to the visual's roles once, not every `projections` array in the file |
| REDUCE_TOPN_FILTERS | Page | Performance | `max` 4 | |
| REDUCE_ADVANCED_FILTERS | Page | Performance | `max` 4 | **Deviation:** count only filters with a condition applied; the source also counts an Advanced filter with nothing set, such as a slicer's or one Desktop writes for a visual's own fields (amended 2026-09-22 after the oracle run) |
| REDUCE_PAGES | Report | Performance | `max` 10 | |
| AVOID_SHOW_ITEMS_WITH_NO_DATA | Visual | Performance | | `query.queryState.<role>.showAll` true |
| HIDE_TOOLTIP_DRILLTROUGH_PAGES | Page | Report Design | | Binding type tooltip or drillthrough and visibility not `HiddenInViewMode` |
| ENSURE_THEME_COLOURS | Visual | Report Design | | **Deviation:** hex literals in colour properties only, not in any string |
| ENSURE_PAGES_DO_NOT_SCROLL_VERTICALLY | Page | Report Design | `maxHeight` 720 | Visible pages only |
| ENSURE_ALTTEXT | Visual | Accessibility | | Source ships it off; pbiplint ships it on. Shapes excluded, as the source does |

### 8.2 Native, tier 1

| Id | Scope | Layer | Category | Severity | What it catches |
|---|---|---|---|---|---|
| BROKEN_FIELD_REFERENCE | Visual, Page, Report, Bookmark | project | Error Prevention | error | A visual, filter, or bookmark names a table, column, or measure the model does not have; detail says which and why |
| NOT_REACHED_FROM_REPORT | Column, Measure | project | Maintenance | info | Not reached by the walk in section 6; detail gives the dead chain |
| LANDING_PAGE_NOT_SET | Report | report | Report Design | info | No `landingPageName`; the report opens wherever it was saved |
| OPENING_PAGE_INVALID | Report | report | Error Prevention | error | The landing page names a page that does not exist; or, with no landing page, the active page names a page that does not exist or is hidden |
| FILTERS_PANE_STATE | Report | report | Report Design | warning | Policy `expect: open \| closed`; fires when the saved state disagrees |
| HIDDEN_VISUAL_WITH_FIELDS | Visual | report | Maintenance | info | `isHidden` with fields bound; it runs its query only when a bookmark or the Selection pane shows it, so one nothing shows is left behind |

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

Malformed JSON and conflict markers use `PARSE_ISSUE`; legacy formats
are diagnostics.

### 8.3 Native, tier 2

| Id | Scope | Category | Severity | What it catches |
|---|---|---|---|---|
| DEFAULT_PAGE_NAME | Page | Report Design | warning | Display name matches `Page <n>`, `Duplicate of <name>`, or `<name> (copy)` |
| VISUAL_WITHOUT_FIELDS | Visual | Report Design | warning | A data visual with nothing bound; shapes, text boxes, images, buttons, and groups excluded |
| VISUAL_OUTSIDE_PAGE | Visual | Report Design | warning | `x + width` past the page width or `y + height` past the page height |
| REPORT_LEVEL_MEASURES | ReportMeasure | Maintenance | warning | Any measure in `reportExtensions.json`; the fix is to move it into the model |

### 8.4 Native, tier 3

| Id | Scope | Category | Severity | What it catches |
|---|---|---|---|---|
| BROKEN_ACTION_TARGET | Visual | Error Prevention | error | A button's `navigationSection`, `bookmark`, or `drillthroughSection` names nothing that exists |
| BROKEN_BOOKMARK_REFERENCE | Bookmark | Error Prevention | warning | A bookmark's active page, or a page or visual it captures, does not exist |
| TAB_ORDER_FOLLOWS_LAYOUT | Page | Accessibility | warning | Tab order disagrees with reading order (top to bottom, left to right, with a row tolerance of half the median visual height). Desktop always writes `tabOrder`, so "not set" is not detectable; disagreement with the layout is. The page documents the heuristic |
| SLICER_SELECTION_SAVED | Visual | Report Design | info | A slicer carries a saved selection; policy `expect: none` raises it to warning |

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
exists); a test checks that the three agree. Three are known
now (section 8.1).

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
a bookmark capturing a deleted visual; a page whose tab order runs
backwards; a slicer with a saved selection; one registered custom
visual no visual uses; a tooltip page left visible; a page taller than
720; one page with more than 20 visuals. Amended 2026-09-20 with the
plan: the seven ported rules that list leaves out are planted too (a
visual with seven fields, a page with five TopN and five applied
Advanced filters, eleven pages, a visual with Show items with no data,
a hex colour, a visual without alt text), so the sample fires every
report rule. Everything else is clean.

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
