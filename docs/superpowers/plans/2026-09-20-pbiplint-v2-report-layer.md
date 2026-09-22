# pbiplint v2: the report layer, implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Read a whole Power BI project (model and report), port fab-inspector's 11 base report rules with parity pinned by committed fixtures, ship pbiplint's 14 native report rules in three tiers with a page each, show a facts block beside the findings, give the input walk a diagnostics channel, and release 0.2.0, landed as eight pull requests in the order the spec sequences them.

**Architecture:** One `lint(files)` call reads both parts: `.tmdl` files route to the TMDL parser and model builder that v1 has, everything else routes to a new tolerant PBIR reader (`packages/core/src/pbir/`) that builds a report object model. A `Project = { model?, report? }` plus three model indexes, a report reference index, and a reachability index feed every rule through one `check(project, ctx)` signature; the 72 model rules keep their bodies behind `bpaRule`, the 11 ports sit behind `inspectorRule`, the native rules behind `pbiplintRule`. Facts and diagnostics ride on the result into every formatter, the CLI, and the site. Parity with fab-inspector is a committed JSON expectation per fixture, with a `deviations` map for the three documented differences.

**Tech Stack:** TypeScript strict ESM, vitest 5, esbuild, Vite 8 static site, marked 18, Playwright (Chromium, Firefox, WebKit), Node 20/22 in CI (Node 26 locally). Development-time oracles only: fab-inspector CLI 3.4.0 under Homebrew .NET 10, `@microsoft/powerbi-report-authoring-cli` 0.1.4 for validating the sample report.

**Spec:** `docs/superpowers/specs/2026-09-18-pbiplint-v2-report-layer-design.md` (binding; issue #9 ordered the work), with `docs/superpowers/specs/2026-09-18-pbiplint-v2-mockups.html` (the approved surfaces, section 9) and `docs/superpowers/specs/2026-09-19-rule-pages-template-design.md` (the template every new rule page follows). The plan argues from the three; executors read all of them.

## Global Constraints

- The core package stays browser-pure: no `node:` imports, no `fetch`, no telemetry; `packages/core/scripts/check-browser-bundle.mjs` enforces it and, from Task 11, also fails a bundle over 200 KB minified. Nothing a user lints leaves the browser.
- Tabular Editor and fab-inspector are development-time parity oracles only; users, the CLI, and CI never need them. Expectations are committed JSON files under `tests/expectations/`. Fixtures are sanitised before commit with `scripts/sanitize-fixture.mjs` (Task 13 gives it a report mode).
- Rule pages are pbiplint's own words: no ruleset text, no third-party tool as the fix route, a Power BI Desktop route or a JSON edit Desktop preserves first. The phrase "fix expression" never appears. Every new page meets the complete template (`2026-09-19-rule-pages-template-design.md` sections 4 to 7) and its `pbir` example is proven through the engine by the rule-pages test hook Task 18 adds.
- No em dashes (U+2014) anywhere: code, comments, docs, pages, commit messages, pull request bodies. Restructure the sentence instead.
- Never a closing keyword (`closes`, `fixes`, `resolves`) next to an issue number in a commit message or pull request body, even in a sentence about one. Write "tracked in #9".
- Main cannot be rewound (ruleset 23615692, no bypass). Every change lands through a pull request from a branch off main. Each pull request in this plan starts from main after the previous one merges. Commit messages end with the two trailers the harness provides (`Co-Authored-By` and `Claude-Session`).
- `gh` has three accounts; the global active account is `michaelmckinleyconsulting` and must stay that way. Any command that needs the pbiplint org runs after `gh auth switch --user TheDataPractitioner` and is followed by `gh auth switch --user michaelmckinleyconsulting`. The repo-local git config already commits as TheDataPractitioner.
- Subagents run only on Fable 5.1 or Opus 5, never Sonnet or Haiku: implementers and task reviewers on Opus, the final whole-branch review of each pull request on Fable.
- The site build (`packages/web/src/build/*.ts`) imports nothing from `@pbiplint/core`; its copies (`CATEGORY_ORDER`, `ignoreHelp`) are held equal to core's by `packages/web/test/generate.test.ts`.
- Ported rule ids stay verbatim from `Base-rules.json`, including `HIDE_TOOLTIP_DRILLTROUGH_PAGES`, because parity compares on ids. All ported report rules are severity `warning`. Thresholds default to the source's values (20, 6, 4, 4, 10, 720).
- Work from `~/Projects/pbiplint` on a branch, never inside a git worktree (the isolation guard fights the tooling). Never edit anything under OneDrive; copy from it.
- After any rule page edit: `npm run build -w @pbiplint/core && node scripts/sync-rule-pages.mjs`, and commit the regenerated `packages/core/src/rules/rule-summaries.data.ts` and `packages/cli/src/rule-help.data.ts` with the page.
- A run's findings, facts, and diagnostics are pure functions of the files given to `lint`; no formatter, the CLI, or the site computes anything the core did not.

---

## How this plan lands: eight pull requests

Spec section 14 fixes the order. Each pull request is a branch off main, cut after the previous one merges; each is independently reviewable and leaves main releasable (tests green, site building, nothing half-wired in output). Michael reviews each one and says merge; the next starts only then.

| Pull request | Branch | Tasks | What it delivers |
|---|---|---|---|
| 1. Plumbing | `v2-plumbing` | 1 to 11 | Types, config options, PBIR reader, report object model, indexes, facts, engine wiring, formatters, CLI input shapes, bundle budget |
| 2. Ported rules with parity | `v2-ported-rules` | 12 to 20 | Vendored ruleset, four fixtures, oracle script and expectations, 11 ports, page tooling for report rules, 11 pages |
| 3. Native rules, tier 1 | `v2-native-tier-1` | 21 to 25 | `pbiplintRule`, 6 rules, quiet checks, 6 pages |
| 4. Native rules, tier 2 | `v2-native-tier-2` | 26 to 28 | 4 rules, 4 pages |
| 5. Native rules, tier 3 | `v2-native-tier-3` | 29 to 31 | 4 rules, 4 pages |
| 6. The sample project | `v2-sample-report` | 32 to 35 | `examples/messy-sales` becomes a PBIP with a report that plants every violation, hand expectations, updated pins |
| 7. The browser | `v2-browser` | 36 to 41 | Walkers, `selectProject`, results page with facts and layer tags, diagnostics as notices, browser tests, performance budget |
| 8. Docs and release | `v2-release` | 42 to 43 | README, CONTRIBUTING, RELEASING, About, 0.2.0 |

Every pull request ends with the same closing task shape: run everything CI runs, check the branch for closing keywords and em dashes, dispatch the Fable whole-branch review, apply its fixes, push, open the pull request as TheDataPractitioner, switch back, report the URL, stop.

## Facts every task relies on (verified 2026-09-20 on main at 47fc70e)

- Baseline: 40 test files, 1394 tests passing and 10 skipped; core browser bundle 97.7 KB minified, 27.4 KB gzipped; 72 rules and 72 pages; the sample lints to `161 findings (16 errors, 39 warnings, 106 info) in 11 files`. Those numbers are pinned in `packages/core/test/pack.test.ts` (72), `packages/web/test/generate.test.ts` (72, and the index sentence `72 rules: 66 ported`), `packages/cli/test/cli.test.ts`, `packages/web/test/sample.test.ts`, `export.test.ts`, `home.test.ts`, `render.test.ts`, and `packages/web/e2e/home.spec.ts` (161). Each pull request that changes them updates them and says so in the pull request body.
- `lint(files, options)` in `packages/core/src/engine/lint.ts` takes `{ path, text }[]` with paths relative to the model root, forward slashes. `Rule.check(model, ctx)` today; `runRules(model, indexes, rules, config)`; `rank(findings, rules, config)`; `RuleSummary` has `id, name, category, severity, slug, url, status`. `Finding` has `ruleId, objectType, objectName, location?, detail?`. `RuleFinding.object` is the object the ignore check reads (`annotations: Record<string, string>`).
- `ResolvedConfig` is `{ disabled: Set, severity: Map, failOn }`; `bindConfig` maps ids without regard to case and lists unknown ones; `resolveConfig` throws `ConfigError` with messages that start `pbiplint.config.json:`.
- `Indexes` is `{ relationships, usage, references }`; `ReferenceIndex` has `owners`, `refsOf`, `columnReferencedBy`, `measureReferencedBy`; `extractRefs(expression)` is the regex DAX reference extractor; `DaxRef` is `{ kind: "column" | "measure" | "unresolved", table?, name, qualified }`.
- Model object types are in `packages/core/src/model/types.ts`. `Column` has `table`, `kind`, `isHidden`, `sortByColumn`, `variations`; `Table` has `kind` (`table | calculated | calculationGroup`), `columns`, `measures`, `partitions`, `hierarchies`, `calculationGroup?.items`; `Measure` has `expression`, `formatStringDefinition?`; `Role.tablePermissions[].filter`, `columnPermissions`; `Level.column`.
- `finding.*` factories and `namedObjects` live in `packages/core/src/rules/helpers.ts`; names come from `packages/core/src/model/names.ts` (`tableRef`, `columnRef`, `measureRef`, `slug`, `ruleUrl`, `RULE_URL_BASE`).
- `PARSE_ISSUE` (`packages/core/src/rules/parse-issue.ts`) is `builtin`, scope `[File]`, reads `model.files[].issues` (`ParseIssue = { file, line, text, reason }`).
- The formatters are `packages/core/src/format/{text,markdown,json,sarif}.ts`; `text.ts` exports `plural`, `summaryLine`, `skippedLine`, `topGroups`, `locationOf`, `FormatOptions { toolVersion?, help?, rules?, pathPrefix? }`. The JSON document is `{ version: 1, tool, summary, groups[] }`; SARIF is 2.1.0 with `runs[0].tool.driver.rules` and `results`.
- CLI: `packages/cli/src/walk.ts` exports `resolveModel(input): { root, files }`; `args.ts` exports `parseArgs`, `HELP`, `UsageError`; `main.ts` wires them, passes `pathPrefix = relative(cwd, root)` to SARIF, and prints `listRules()` for `pbiplint rules`. `packages/cli/test/readme.test.ts` parses the `<path>` line of `HELP` by splitting on `, ` and `or ` and expects a fixed list, and requires every option and every path kind to appear in `packages/cli/README.md`.
- Web input: `packages/web/src/input/model-files.ts` exports `InputEntry`, `InputTree { entries, modelFolders }`, `SelectedModel { root, files, config?, notes, read }`, `InputError`, `CONFIG_FILE`, `isModelFolder`, `relativeToRoot`, `selectModel(entries, modelFolders)`; `read-drop.ts` exports `wanted(name)`, `SKIP_DIRS`, `MAX_DEPTH` (64), `readDataTransfer`, `walkEntry(entry, tree, depth)`; `pick-folder.ts` exports `directoryPicker`, `readPickedDirectory`, `readDirectoryInput`. `main.ts` calls `selectModel` in `runEntries` and `renderResults(results, result, { source, files, notes })`.
- Web results: `packages/web/src/results/render.ts` exports `h`, `renderResults`, `applyFilters`; groups are `<details class="group" id="rule-<slug>" data-severity data-category>`; filters are `input[data-filter="severity"|"category"]`; notices are `<p class="notice">` after `.summary`. `packages/web/test/styles.test.ts` fails on any class in the rendered markup with no CSS rule.
- Site build: `packages/web/src/build/pages.ts` holds `CATEGORY_ORDER` (copy), `SOURCE_NAMES`, `EXAMPLE_CAPTION`, `ignoreHelp` (copy), `withIgnoreHelp`, `ruleLinks`, `attribution`, `parseFrontmatter`, `siteMarkdown` with `code` and `codespan` overrides (`/^tmdl (fires|fixed)$/`), `rulePage`, `rulesIndex` (throws on a category outside `CATEGORY_ORDER`; prints `N rules: X ported ..., Y listed but not run ..., and Z built into pbiplint`), `contentPage`, `sitemap`. `generate.ts` reads every page's frontmatter first for the link map.
- Rule-pages test: `packages/core/test/rule-pages.test.ts` requires frontmatter `id, severity, status, category, scope`; section order; `sources` exactly `[RULESET_URL]` for ported and needsLiveModel, `[]` for builtin; exactly one `tmdl fires` and one `tmdl fixed` fence, linted through `lint([{ path: "example.tmdl", text }])`; When to ignore it without mechanics; Related rules ids real and not self. `scripts/sync-rule-pages.mjs` (`sections`, `firstParagraph`, `exampleMarkdown`, `helpMarkdown`, `helpText`) writes the two data files and imports `ignoreHelp` from the built core. `scripts/generate-rule-pages.mjs` scaffolds missing pages.
- Parity today: `packages/core/test/parity.test.ts` runs every `tests/expectations/*.json` (shape `{ fixture, oracle, captured, skipRules, findings: { RULE: [objectName] } }`) against the model rules; `packages/core/test/helpers.ts` has `modelFrom`, `objectNames(rule, tmdl)`, `readModelFiles(root)`, `fixturesDir`, `examplesDir`.
- `examples/messy-sales/` is today a bare `.SemanticModel` layout: `.platform` (displayName "Sales Demo"), `definition.pbism`, `definition/**/*.tmdl` (11 files), `.pbi/editorSettings.json`. Consumers: `packages/cli/src/sample.ts` (finds a `definition` folder), `packages/cli/build.mjs` (copies it to `packages/cli/sample`), `scripts/check-pack.mjs` (requires `sample/definition/model.tmdl` and `sample/definition/tables/Sales.tmdl`), `packages/web/src/sample.ts` (Vite glob of `definition/**/*.tmdl`), `tests/expectations/messy-sales.json` (`fixture: "examples/messy-sales"`), `packages/core/test/version.test.ts`, `packages/web/test/sample.test.ts`, `packages/cli/test/cli.test.ts`, CONTRIBUTING. The `pbiplint/action` repository sparse-checks-out `examples/messy-sales` at main commit `cb3a5812`, so it is unaffected until its pin moves (Task 43 notes the follow-up).
- The sample model's measures: `Total Sales`, `Total Quantity`, `Average Unit Price`, `Total Cost`, `Total Discount`, `Net Sales` (= Total Sales - Total Discount), `Total Margin` (= Total Sales - Total Cost), `Margin %`, `Order Count`, `Average Order Value`, `Distinct Customers`, `Sales YTD`, `Sales LY` (references `Total Sales`), `Sales YoY %` (references `Sales LY`). Tables: Customer, Date, Employee, Product, Promotion, Sales, Store. `Sales` has no `Region` column; Customer, Employee, and Store do.
- PBIR shapes seen in real files (the demo report: report 3.2.0, page 2.1.0, visual 2.8.0, pagesMetadata 1.0.0, `definition.pbir` version "4.0"; ShelfMart: report 1.2.0, page 1.3.0, a report-level `filterConfig`, `customTheme` of type `RegisteredResources`, `layoutOptimization: "PhonePortrait"`, a `mobile.json` beside each visual with schema `visualContainerMobileState/1.4.0`):
  - `.pbip`: `{ "$schema"?, "version": "1.0", "artifacts": [{ "report": { "path": "X.Report" } }], "settings": {...} }`. The `$schema` line is absent in ShelfMart's.
  - `.platform`: `{ "metadata": { "type": "Report", "displayName": "..." }, "config": { "version": "2.0", "logicalId": "..." } }`.
  - `definition.pbir`: `{ "version": "4.0", "datasetReference": { "byPath": { "path": "../X.SemanticModel" } } }` or `{ "byConnection": {...} }`.
  - `definition/report.json`: `themeCollection.baseTheme.name`, `themeCollection.customTheme?`, `objects.outspacePane[0].properties.expanded.expr.Literal.Value` = `"true"` or `"false"`, `publicCustomVisuals?: string[]`, `resourcePackages[]`, `filterConfig?`, `settings`.
  - `definition/pages/pages.json`: `pageOrder: string[]`, `activePageName`, `landingPageName?` (1.1.0).
  - `page.json`: `name`, `displayName`, `displayOption`, `height`, `width`, `visibility?` (`HiddenInViewMode`), `pageBinding?: { type: "Tooltip" | "Drillthrough", parameters? }`, `filterConfig?`, `objects?`, `annotations?: [{ name, value }]`.
  - `visual.json`: `name`, `position: { x, y, z, height, width, tabOrder }`, `isHidden?`, `parentGroupName?`, `visualGroup?`, `filterConfig?`, `annotations?`, `visual: { visualType, query?: { queryState: { <Role>: { projections: [{ field, queryRef, nativeQueryRef, active? }], showAll? } } }, objects?, visualContainerObjects?: { title?: [{ properties: { text: { expr: { Literal: { Value: "'Total Sales'" } } } } }], general?: [{ properties: { altText?: { expr: { Literal: { Value: "'...'" } } | { Aggregation | Measure } } } }], visualLink?: [{ properties: { type: { expr: { Literal: { Value: "'PageNavigation'" } } }, navigationSection?, bookmark?, drillthroughSection?, webUrl? } }] }, drillFilterOtherVisuals? }`. A Literal string value is wrapped in single quotes inside the JSON string: `"'Total Sales'"`; booleans are `"true"`/`"false"`; numbers carry a suffix, `"18D"`.
  - Field references: `{ "Column": { "Expression": { "SourceRef": { "Entity": "Product" } }, "Property": "Category" } }`, likewise `Measure`; `{ "Aggregation": { "Expression": { "Column": {...} }, "Function": 0 } }`; `{ "HierarchyLevel": { "Expression": { "Hierarchy": { "Expression": { "SourceRef": {...} }, "Hierarchy": "Date Hierarchy" } }, "Level": "Year" } }`. Filters declare aliases `"From": [{ "Name": "d", "Entity": "Date", "Type": 0 }]` and refer to them with `"SourceRef": { "Source": "d" }`.
  - `filterConfig.filters[]`: `{ name, field, type: "Categorical" | "Advanced" | "TopN" | ..., filter?: { Version, From, Where } }`; `filter` is present only when a condition is applied.
  - `definition/bookmarks/bookmarks.json`: `{ items: [{ name, children?: [{ name }] }] }`; `<name>.bookmark.json`: `{ name, displayName, explorationState: { activeSection, sections: { <page>: { visualContainers: { <visual>: {...} } } } } }`.
  - `definition/reportExtensions.json`: `{ name, entities: [{ name, measures: [{ name, dataType, expression, hidden?, formatString? }] }] }`.
- fab-inspector `Rules/Base-rules.json` at commit `cdaaeec3cca8e97b0fd493e080dfa264f9cd44f8`, sha256 `22868be9acd696c96e62f214dbe0efc72fd1bfffda1736b3b9a4d7fba21f883c`: `{ "rules": [...] }`, 12 entries, keys `id, name, description, disabled, part, test, logType?`. The `test` bodies, which the ports below reproduce:
  - `REMOVE_UNUSED_CUSTOM_VISUALS` (part Report): `publicCustomVisuals` minus the set of every visual's `visualType`; each remaining name fails.
  - `REDUCE_VISUALS_ON_PAGE` (Pages): count of visuals with `!isHidden` and `visualType` not in `[shape, slicer, actionButton, textbox]` must be `<= 20`.
  - `REDUCE_OBJECTS_WITHIN_VISUALS` (Pages): visuals where the count of every `projections[*]` anywhere in the file (JSONPath `$..projections[*]`) `> 6`; the 6 is a literal, not a parameter.
  - `REDUCE_TOPN_FILTERS` (Pages): count of visuals with some `filterConfig.filters[].type == "TopN"` must be `<= 4`. `REDUCE_ADVANCED_FILTERS`: same with `"Advanced"`, `<= 4`.
  - `REDUCE_PAGES` (report): page count `<= 10`.
  - `AVOID_SHOW_ITEMS_WITH_NO_DATA` (Pages): visuals where `visual.query.queryState.Category.showAll == true` (the Category role only).
  - `HIDE_TOOLTIP_DRILLTROUGH_PAGES` (report): pages with `pageBinding.type` in `[Tooltip, Drillthrough]` and `visibility != "HiddenInViewMode"`, reported by `displayName`.
  - `ENSURE_THEME_COLOURS` (Pages): visuals whose `visualType` is not `textbox` and whose whole JSON, as a string, matches `#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})`.
  - `ENSURE_PAGES_DO_NOT_SCROLL_VERTICALLY` (report): pages with `height > 720` and `visibility != "HiddenInViewMode"`, by `displayName`.
  - `ENSURE_ALTTEXT` (Pages, `disabled: true` in the source): visuals whose `visualType` is not `shape` and for which none of `visual.visualContainerObjects.general[]` has `properties.altText.expr.Aggregation` truthy or `properties.altText.expr.Literal.Value != "''"`.
- The oracle's JSON (`TestRun_<id>.json`, UTF-8 BOM) holds `Results[]` with `RuleId`, `ItemPath` (`/definition/pages/<id>/page.json` for page-level rules, `root` or `/definition/report.json` for report level), `ParentName`, `ParentDisplayName`, `Pass`, `Expected`, `Actual` (a list of names for the list rules, a number for the count rules), `LogType`, `Message`.
- fab-inspector v3.4.0 (2026-06-29) ships `osx-arm64-CLI.zip` (13.6 MB). Homebrew .NET is at `/opt/homebrew/Cellar/dotnet/10.0.400`. The sparse clone that yields the fixtures and the ruleset: `git clone --filter=blob:none --sparse --no-checkout https://github.com/NatVanG/fab-inspector.git && cd fab-inspector && git sparse-checkout set FabInspector.Tests/Files/pbip Rules && git checkout cdaaeec3cca8e97b0fd493e080dfa264f9cd44f8`. The fixture folder holds `Base-rules-fails.Report`, `Base-rules-fails.SemanticModel`, `Base-rules-fails.pbip`, and the same three for `Base-rules-passes`. fab-inspector's LICENSE is MIT, "Copyright (c) 2024 Nat Van Gulck".
- OneDrive sources (read-only; copy, never edit): `~/Library/CloudStorage/OneDrive-McKinleyConsulting/Documents/McKinley Consulting/Business Development/PowerBIDemos/PBIP and GitHub Demo/` (`PBIP and GitHub Demo.Report`, `.SemanticModel`, `.pbip`; the report has 1 page named "Page 1", 19 visuals of which 3 slicers, 6 cards, 4 text boxes, 1 shape, 1 image, no `visualLink`, no `altText`, no hidden visual; the Filters pane saved `expanded: true`; a registered PNG) and `.../Training/Dashboard in a Day/Archived/Power BI Project Files/` (`ShelfMart Foot Traffic and Weather.Report`, `.SemanticModel`, `.pbip`; 1 page, 9 visuals each with `mobile.json`, a report-level filter, roles Midwest/Northeast/Southeast/Southwest/West, a registered logo PNG and theme JSON, `cache.abf` and `diagramLayout.json` beside the model).
- marked 18: a renderer override that returns `false` falls back to the default; the default fence renders `<pre><code class="language-xxx">…\n</code></pre>\n`; the `code` override receives `{ text, lang, escaped }`.
- Vitest aliases `@pbiplint/core` to `packages/core/src/index.ts`; `node scripts/*.mjs` resolves it to `packages/core/dist`, so build core first for the scripts. `.prettierignore` lists `*.md`. ESLint forbids `localeCompare` without a locale.

## Decisions this plan makes where the spec left room

Recorded so a reviewer can see them as decisions rather than drift. None reopens the design.

1. **`Rule.needs`.** Beside `layer`, a rule declares `needs: ("model" | "report")[]`, the layers it cannot run without. `bpaRule` sets `["model"]`, `inspectorRule` `["report"]`, `pbiplintRule` derives it from `layer` (`project` means both), and `PARSE_ISSUE` declares `[]` so it reports JSON and TMDL parse issues on any run. The skip reasons `noModel` and `noReport` come from `needs`.
2. **A finding's `layer` is the layer of the object it names** (Report, Page, Visual, Bookmark, ReportMeasure are report objects; everything else is model). A group's tag is the rule's layer, or, for a `project` rule, the layer of its findings, so `NOT_REACHED_FROM_REPORT` is tagged `model` (its fix is in the model) and `BROKEN_FIELD_REFERENCE` is tagged `report`. The mockup's counts and tags are illustrative.
3. **`objectId` of a report-level finding** is `report`, except `REMOVE_UNUSED_CUSTOM_VISUALS`, where it is the unused visual's type name, because that is what the oracle lists and parity compares.
4. **Pairing happens in the resolvers**, not in `lint`, because paths inside `lint` are part-relative and cannot say which folder sits beside which. Core exports `datasetReference(pbirText)` and `pairingDecision(ref, siblingModelFolder)` so the CLI and the browser make the same call; `lint` takes `options.absent` with the reason for a layer the resolver left out.
5. **`lint` file paths stay part-relative** (`definition/tables/Sales.tmdl`, `definition/pages/<id>/page.json`), as the mockup shows; `.tmdl` routes to the model and everything else to the report. SARIF gains `reportPathPrefix` beside `pathPrefix`; the model's `.platform` is never passed.
6. **`LintResult.model` stays** (`project.model`, or the empty model `buildModel([])` when the layer is absent) so the API is additive; `project`, `layers`, `facts`, `diagnostics` are added.
7. **The skipped line uses parentheses**, `14 rules skipped (no report in the input)`, matching v1's `(need a live model)`.
8. **The directory-input route applies the depth cap by path depth**, so all three browser routes report `depth-cap` the same way and the browser test can drive it with a real deep folder.
9. **The sample ships a `pbiplint.config.json`** setting `FILTERS_PANE_STATE` to `expect: "closed"`, because a policy rule fires only under a policy and the definition of done wants every native rule to fire on the sample. `OPENING_PAGE_INVALID`, native and not on the spec's planted list, is planted as a hidden active page. The seven ported rules the spec's list left out (objects within visuals, TopN filters, Advanced filters, page count, Show items with no data, theme colours, alt text) are planted too, approved by Michael on 2026-09-20 and written into spec section 11, so the sample fires all 25 report rules.
10. **A visual's `mobile.json` marks the visual**; a page "has a mobile layout" when any of its visuals does. That is the fact the spec asks for.
11. **`AVOID_SHOW_ITEMS_WITH_NO_DATA` reads `showAll` on any role**, as the spec's table says, while the source reads the Category role only. Parity on both oracle fixtures decides whether that is a difference: if it is, Task 16 stops and reports it to Michael as a fourth deviation candidate rather than deciding.
12. **Report-level measures resolve field references.** A visual bound to a measure from `reportExtensions.json` is not a broken reference; `BROKEN_FIELD_REFERENCE` fires only on names neither the model nor the report defines.
13. **A `pbir` figure's caption names the file the document stands for**: "Fires the rule in visual.json", "After the fix in visual.json". Approved by Michael on 2026-09-20 and written into spec section 7. A `tree.json` document names its files itself, so its caption is the bare "Fires the rule" or "After the fix". The SARIF help block's bold captions say the same.
14. **A run given one part prints no section for the part it was not given.** `buildFacts` returns no facts without a report, so no surface shows "Report at a glance" on a model-only run; the layers line names present layers only, and the skipped line's `noModel` and `noReport` clauses print the absent layer's reason from `LintResult.layers`, which is where an overridden reason such as "this report reads a published model" now reaches the reader. `lint`'s default reason for an absent model layer becomes `no model in the input`, because the layers line no longer names it and its only human surface is the skipped line, where it has to read as a skip reason beside `no report in the input`. The JSON document keeps `layers` in full, absent layers and their reasons included, so structured output stays complete. Task 38 (the browser results page, pull request 7) inherits the rule: no facts panel and no heading when the report layer is absent, and the results heading's file counts name present layers only. Spec sections 6 and 9 amended 2026-09-20; tracked in #60.
15. **The site publishes only the layers `SITE_LAYERS` names.** `packages/web/src/build/pages.ts` holds the list, initially `["model"]`, and `generateSite` filters its sources through it once: a page whose `layer` is not published is not rendered, not in the rules index, not in the sitemap, and not in the rule-id link map, so its id stays plain code on the pages that mention it, and a page with no `layer` key counts as `model` while a key that is present and empty is an error. `layer: project` is valid frontmatter and is never a member of `SITE_LAYERS`, which names file families: a `project` page publishes as soon as either family does. `PARSE_ISSUE` is the reason. It declares `needs: []`, so it fires on a model-only run, and holding its page back until both families publish would take a page off the live site for four pull requests. The other two `project` rules, `BROKEN_FIELD_REFERENCE` and `NOT_REACHED_FROM_REPORT`, need both layers, so from pull request 3 their pages publish for rules the site's browser always skips, taking the site's pinned page count from 72 to 74 in Task 24. That is a known exception, accepted rather than missed: gating on `needs` would take a frontmatter key nobody plans to add, so the lever, if the exception is ever unwanted, is scheduling those two pages into pull request 7 instead of Task 24, not a change to the gate. The gate is there because the site deploys from main on every push while the ported report rules land on main several pull requests before the browser can lint a report, so without it pbiplint.com would carry pages for rules no published tool runs. Pull request 7 (Task 38 or 41) sets `SITE_LAYERS` to both families and moves everything `generate.test.ts` pins with it: the value of `SITE_LAYERS`, which that test asserts by value and not only through the counts, as well as the page count, the index sentence, and the sitemap. Until then the browser app also lints only the rules that do not need the report, through `packages/web/src/browser-rules.ts`, so a model drop on the live site reads as it did before the report rules landed; the same module drops a config entry for a rule it leaves out, so a config written for the CLI raises no unknown-rule notice there. Task 37, where the browser starts reading reports, deletes that module and passes the default rules again. The attribution the ported report set adds holds by construction and needs no flag of its own: `attribution` renders for a page, and no report page is published, so there is nothing to credit. The layer column does not hold by construction. It renders a badge on every row, so with one family published it would read `model` on all 72 of them, a column that distinguishes nothing. Pull request 2, which adds the column (Task 18), is the session that has to render it only when more than one layer is published. The CLI's help data, `scripts/sync-rule-pages.mjs`, and the rule pages themselves are not gated; only what the site publishes. Tracked in #61.

## File map for the whole of v2

| File | Change | Pull request |
|---|---|---|
| `packages/core/src/rules/types.ts` | 8 categories, 5 report object types, `Layer`, `RuleOption`, `needs`, `check(project, ctx)`, `Finding.layer` and `objectId` | 1 |
| `packages/core/src/project/types.ts` | new: `Project`, `Diagnostic`, `Layers`, `Fact` | 1 |
| `packages/core/src/project/route.ts` | new: `routeFiles`, `datasetReference`, `pairingDecision` | 1 |
| `packages/core/src/project/facts.ts` | new: `buildFacts` | 1 |
| `packages/core/src/pbir/types.ts` | new: the report object model | 1 |
| `packages/core/src/pbir/json.ts` | new: `readJson`, `lineOfPointer`, `schemaVersionOf`, conflict markers | 1 |
| `packages/core/src/pbir/refs.ts` | new: `collectFieldRefs` | 1 |
| `packages/core/src/pbir/build.ts` | new: `buildReport` | 1 |
| `packages/core/src/pbir/names.ts` | new: finding labels for report objects | 1 |
| `packages/core/src/index/report-refs.ts`, `reachability.ts`, `build.ts` | new indexes; `buildIndexes(project)` | 1 |
| `packages/core/src/engine/config.ts`, `run.ts`, `lint.ts`, `rank.ts`, `ignore.ts` | options, skips, wiring, layer on summaries, `Ignorable` | 1 (ignore text for report scopes in 2) |
| `packages/core/src/rules/microsoft-bpa/define.ts`, `parse-issue.ts`, `helpers.ts` | adapters, `needs`, report finding factories | 1 |
| `packages/core/src/format/*.ts` | layers line, facts, diagnostics, tags, `reportPathPrefix`, notifications | 1 |
| `packages/core/scripts/check-browser-bundle.mjs` | 200 KB assertion | 1 |
| `packages/web/public/schema/pbiplint.config.schema.json` | object rule values | 1 |
| `packages/web/src/build/pages.ts` | `CATEGORY_ORDER` copy (1); `SITE_LAYERS` and the layer gate (#61, before 2); `SOURCE_NAMES`, `pbir` fences, layer column behind `SITE_LAYERS`, `ignoreHelp` copy (2); `SITE_LAYERS` gains `report`, which turns the column on (7) | 1, 2, 7 |
| `packages/cli/src/walk.ts`, `args.ts`, `main.ts`, `README.md` | `resolveProject`, help, layer column, notices | 1 |
| `scripts/vendor-inspector-rules.mjs`, `packages/core/src/rules/pbi-inspector/*` | vendored ruleset, `inspectorRule`, 11 ports | 2 |
| `tests/fixtures/{base-rules-fails,base-rules-passes,pbip-and-github-demo,shelfmart}/` | whole PBIPs, sanitised | 2 |
| `scripts/sanitize-fixture.mjs`, `scripts/fab-expectations.mjs`, `tests/expectations/*.report.json` | report mode, oracle converter, expectations | 2 |
| `packages/core/test/report-parity.test.ts`, `fixtures.test.ts`, `helpers.ts` | parity harness, fixture smoke, `readProjectFiles` | 2 |
| `packages/core/test/rule-pages.test.ts`, `scripts/sync-rule-pages.mjs`, `scripts/generate-rule-pages.mjs` | `pbir` hook and stock model, captions, `layer`, per-layer sources | 2 |
| `rules/*.md` (25 new pages) | the report rule pages | 2, 3, 4, 5 |
| `packages/core/src/rules/pbiplint/*` | `pbiplintRule`, 14 native rules | 3, 4, 5 |
| `examples/messy-sales/**` | PBIP layout, the report, the config | 6 |
| `packages/cli/src/sample.ts`, `build.mjs`, `scripts/check-pack.mjs`, `packages/web/src/sample.ts` | the sample as a project | 6 |
| `packages/web/src/input/*.ts`, `main.ts`, `results/render.ts`, `styles.css`, `index.html`, `content/about.md` | the browser | 7 |
| `packages/web/e2e/*.spec.ts`, `scripts/make-big-report.mjs` | browser tests, performance budget | 7 |
| `README.md`, `CONTRIBUTING.md`, `docs/RELEASING.md`, `NOTICE`, versions | docs and release | 2 (NOTICE, oracle steps), 8 |

---

## Pull request 1: plumbing (branch `v2-plumbing`)

Cut the branch first:

```bash
cd ~/Projects/pbiplint && git switch main && git pull --ff-only && git switch -c v2-plumbing
```

### Task 1: Types for v2: rule interface, report object model, project

**Files:**
- Modify: `packages/core/src/rules/types.ts`
- Create: `packages/core/src/project/types.ts`
- Create: `packages/core/src/pbir/types.ts`
- Modify: `packages/core/src/engine/ignore.ts` (the `isIgnored` parameter type)
- Modify: `packages/core/src/engine/run.ts`, `packages/core/src/engine/rank.ts`, `packages/core/src/engine/lint.ts` (minimal: `runRules(project, …)`, `RuleSummary.layer`, `Finding.layer`)
- Modify: `packages/core/src/rules/microsoft-bpa/define.ts`, `packages/core/src/rules/parse-issue.ts`, `packages/core/src/index.ts`
- Modify: `packages/web/src/build/pages.ts` (the `CATEGORY_ORDER` copy)
- Test: `packages/core/test/define.test.ts`, `packages/core/test/pack.test.ts`, `packages/core/test/engine.test.ts`, `packages/core/test/helpers.ts`, `packages/core/test/format.test.ts`, `packages/web/test/render.test.ts`, `packages/web/test/generate.test.ts`

**Interfaces:**
- Produces, in `packages/core/src/rules/types.ts`:

```ts
export type Category =
  | "Performance" | "Error Prevention" | "Accessibility" | "DAX Expressions"
  | "Maintenance" | "Report Design" | "Formatting" | "Naming Conventions";
export const CATEGORY_ORDER: readonly Category[]; // the eight above, in that order
export type ObjectType = /* the 19 v1 types */ | "Report" | "Page" | "Visual" | "Bookmark" | "ReportMeasure";
export type Layer = "model" | "report" | "project";
export type LayerName = "model" | "report";
export const REPORT_OBJECT_TYPES: ReadonlySet<ObjectType>;
export const layerOf: (t: ObjectType) => LayerName;
export interface RuleOption { name: string; type: "number" | "string"; default?: number | string; values?: readonly string[] }
export type RuleOptions = Readonly<Record<string, number | string>>;
export interface RuleContext { indexes: Indexes; options: RuleOptions }
export interface Ignorable { annotations: Record<string, string> }
export interface RuleFinding { objectType: ObjectType; objectName: string; objectId?: string; layer?: LayerName; location?: SourceLocation; detail?: string; object?: Ignorable }
export interface Finding { ruleId: string; layer: LayerName; objectType: ObjectType; objectName: string; objectId?: string; location?: SourceLocation; detail?: string }
export interface Rule { id; name; category: Category; severity; scope: ObjectType[]; layer: Layer; needs: readonly LayerName[]; options?: readonly RuleOption[]; description; fixExpression?; references; status; check(project: Project, ctx: RuleContext): RuleFinding[] }
```

- Produces, in `packages/core/src/project/types.ts`:

```ts
export interface Project { model?: Model; report?: Report }
export type DiagnosticKind = "depth-cap" | "unread-file" | "legacy-report-format" | "legacy-model-format" | "model-reference-mismatch" | "schema-newer-than-known";
export interface Diagnostic { kind: DiagnosticKind; message: string; path?: string }
export type LayerStatus = { present: true; files: number } | { present: false; reason: string };
export interface Layers { model: LayerStatus; report: LayerStatus }
export interface Fact { layer: LayerName; label: string; value: string; detail?: string; ruleId?: string }
```

- Produces, in `packages/core/src/pbir/types.ts` (types only; Task 5 builds them):

```ts
export interface FieldRef { kind: "column" | "measure" | "hierarchyLevel" | "aggregation"; table: string; name: string; level?: string; pointer: string }
export interface ReportFilter { name: string; type?: string; field?: FieldRef; refs: FieldRef[]; applied: boolean; file: string; pointer: string }
export interface VisualAction { type: string; target?: string; pointer: string }
export interface VisualField { role: string; ref: FieldRef }
export interface Visual { id: string; page: Page; file: string; text: string; json: unknown; type: string; position: { x: number; y: number; z: number; width: number; height: number; tabOrder?: number }; isHidden: boolean; isGroup: boolean; groupId?: string; title?: string; altText?: string; fields: VisualField[]; showAllRoles: string[]; filters: ReportFilter[]; actions: VisualAction[]; hasMobileLayout: boolean; annotations: Record<string, string>; schemaVersion?: string }
export interface Page { id: string; displayName: string; file: string; text: string; json: unknown; width?: number; height?: number; displayOption?: string; visibility?: string; bindingType?: string; bindingRefs: FieldRef[]; filters: ReportFilter[]; visuals: Visual[]; annotations: Record<string, string>; schemaVersion?: string }
export interface PagesHeader { file?: string; pageOrder: string[]; activePageName?: string; landingPageName?: string }
export interface Bookmark { id: string; displayName: string; file: string; text: string; activePage?: string; pages: string[]; visuals: { page: string; visual: string }[]; refs: FieldRef[]; annotations: Record<string, string> }
export interface BookmarksHeader { file?: string; items: { name: string; children: string[] }[] }
export interface ReportMeasure { table: string; name: string; expression: string; hidden: boolean; file: string; line: number; annotations: Record<string, string> }
export type DatasetReference = { kind: "byPath"; path: string } | { kind: "byConnection" } | { kind: "none" };
export interface Report { file?: string; displayName?: string; schemaVersion?: string; themeName?: string; publicCustomVisuals: string[]; filtersPane: { expanded?: boolean; visible?: boolean; hiddenInEditMode?: boolean }; filters: ReportFilter[]; pagesHeader: PagesHeader; pages: Page[]; bookmarksHeader: BookmarksHeader; bookmarks: Bookmark[]; measures: ReportMeasure[]; datasetReference: DatasetReference; files: string[]; issues: ParseIssue[]; schemaVersions: { report?: string; page?: string; visual?: string }; annotations: Record<string, string> }
```

- Consumers in later tasks: every rule file, `runRules`, `rank`, the formatters, the site (`CATEGORY_ORDER` copy).

- [ ] **Step 1: Write the failing tests**

In `packages/core/test/pack.test.ts`, replace the category list assertion with the exported order and add the report types check:

```ts
import { CATEGORY_ORDER, REPORT_OBJECT_TYPES, layerOf } from "../src/rules/types.js";
// ...inside "gives every rule a scope, a name without the category prefix, and a category from the fixed list":
      expect(CATEGORY_ORDER).toContain(r.category);
      expect(r.layer, r.id).toBe("model");
      expect(r.needs, r.id).toEqual(["model"]);
// ...new tests in the describe:
  it("orders the eight categories as the spec ranks them", () => {
    expect(CATEGORY_ORDER).toEqual([
      "Performance",
      "Error Prevention",
      "Accessibility",
      "DAX Expressions",
      "Maintenance",
      "Report Design",
      "Formatting",
      "Naming Conventions",
    ]);
  });
  it("knows which object types belong to the report layer", () => {
    expect([...REPORT_OBJECT_TYPES].sort()).toEqual(["Bookmark", "Page", "Report", "ReportMeasure", "Visual"]);
    expect(layerOf("Visual")).toBe("report");
    expect(layerOf("Column")).toBe("model");
  });
```

In `packages/core/test/define.test.ts`, inside `describe("bpaRule")`:

```ts
  it("runs the model body against the project's model and declares the model layer", () => {
    const r = bpaRule("HIDE_FOREIGN_KEYS", (m) => [{ objectType: "Model", objectName: m.name }]);
    expect(r.layer).toBe("model");
    expect(r.needs).toEqual(["model"]);
    const model = modelFrom("model Demo\n");
    expect(r.check({ model }, { indexes: buildIndexes({ model }), options: {} })).toEqual([
      { objectType: "Model", objectName: "Demo" },
    ]);
    expect(r.check({}, { indexes: buildIndexes({}), options: {} })).toEqual([]);
  });
```

with `import { modelFrom } from "./helpers.js";` and `import { buildIndexes } from "../src/index/build.js";` added.

In `packages/core/test/engine.test.ts`, change every test rule so it carries `layer: "model" as const, needs: ["model"] as const` in `base` and reads the model from the project, for example `check: ({ model }) => model!.tables.map((t) => finding.table(t))`. Add, inside `describe("runRules")`:

```ts
  it("skips a rule whose layer is not in the project and tags every finding with its object's layer", () => {
    const reportOnly: Rule = { ...base, id: "REPORT_ONLY", name: "Report only", category: "Report Design", severity: 2, layer: "report", needs: ["report"], check: () => [] };
    const m = modelFrom("table A\n\tcolumn X\n\t\tdataType: string\n");
    const r = runRules({ model: m }, buildIndexes({ model: m }), [reportOnly, everyColumn], resolveConfig());
    expect(r.rulesSkipped).toEqual([{ id: "REPORT_ONLY", reason: "noReport" }]);
    expect(r.rulesRun).toEqual(["EVERY_COLUMN"]);
    expect(r.findings.map((f) => f.layer)).toEqual(["model"]);
  });
```

In `packages/core/test/helpers.ts`, change `objectNames` to the new call:

```ts
export function objectNames(rule: Rule, tmdl: string): string[] {
  const model = modelFrom(tmdl);
  return rule
    .check({ model }, { indexes: buildIndexes({ model }), options: {} })
    .map((f) => f.objectName);
}
```

In `packages/core/test/format.test.ts` and `packages/web/test/render.test.ts`, give the inline rules `layer: "model"`, `needs: ["model"]`, and project-shaped `check` bodies the same way. In `packages/web/test/generate.test.ts`, the existing tie `expect(CATEGORY_ORDER).toEqual(CORE_CATEGORY_ORDER)` stays and now requires the copy to change.

- [ ] **Step 2: Run them to see them fail**

Run: `npm run typecheck; npx vitest run packages/core/test/pack.test.ts packages/core/test/define.test.ts packages/core/test/engine.test.ts packages/web/test/generate.test.ts`
Expected: typecheck errors on `layer`, `needs`, `buildIndexes({ model })`; the category and layer tests FAIL.

- [ ] **Step 3: Implement the types**

Replace `packages/core/src/rules/types.ts` with:

```ts
import type { Indexes } from "../index/build.js";
import type { SourceLocation } from "../model/types.js";
import type { Project } from "../project/types.js";

export type Category =
  | "Performance"
  | "Error Prevention"
  | "Accessibility"
  | "DAX Expressions"
  | "Maintenance"
  | "Report Design"
  | "Formatting"
  | "Naming Conventions";

/** Ranking order of categories (v2 spec section 7). The site build carries a copy a test holds equal. */
export const CATEGORY_ORDER: readonly Category[] = [
  "Performance",
  "Error Prevention",
  "Accessibility",
  "DAX Expressions",
  "Maintenance",
  "Report Design",
  "Formatting",
  "Naming Conventions",
];

/** 1 info, 2 warning, 3 error, as in BPARules.json. */
export type Severity = 1 | 2 | 3;

export const SEVERITY_LABEL: Record<Severity, "info" | "warning" | "error"> = {
  1: "info",
  2: "warning",
  3: "error",
};

export type ObjectType =
  | "Model"
  | "Table"
  | "CalculatedTable"
  | "CalculationGroupTable"
  | "Column"
  | "CalculatedColumn"
  | "CalculatedTableColumn"
  | "Measure"
  | "Partition"
  | "Relationship"
  | "Role"
  | "TablePermission"
  | "Perspective"
  | "Hierarchy"
  | "Level"
  | "CalculationItem"
  | "NamedExpression"
  | "DataSource"
  | "File"
  | "Report"
  | "Page"
  | "Visual"
  | "Bookmark"
  | "ReportMeasure";

/** Which part of a project a rule reads: one layer, or both (`project`). */
export type Layer = "model" | "report" | "project";
/** The two parts a project can hold. */
export type LayerName = "model" | "report";

export const REPORT_OBJECT_TYPES: ReadonlySet<ObjectType> = new Set<ObjectType>([
  "Report",
  "Page",
  "Visual",
  "Bookmark",
  "ReportMeasure",
]);

/** The layer a finding belongs to, from the object it names: the file family a reader opens to fix it. */
export const layerOf = (t: ObjectType): LayerName => (REPORT_OBJECT_TYPES.has(t) ? "report" : "model");

export type RuleStatus = "ported" | "needsLiveModel" | "builtin";

/** An option a rule accepts from pbiplint.config.json, with its default. */
export interface RuleOption {
  name: string;
  type: "number" | "string";
  default?: number | string;
  /** For a string option, the values it accepts. */
  values?: readonly string[];
}

export type RuleOptions = Readonly<Record<string, number | string>>;

export interface RuleContext {
  indexes: Indexes;
  /** The rule's options after config: every declared default, overridden by the config file. */
  options: RuleOptions;
}

/** Anything that can carry a pbiplint.ignore annotation: every model object and every page and visual. */
export interface Ignorable {
  annotations: Record<string, string>;
}

/** What a rule returns. `object` is used for ignore annotations and stripped before output. */
export interface RuleFinding {
  objectType: ObjectType;
  objectName: string;
  /** The report object's `name` (page, visual, bookmark id), or `report`; parity compares on it. Model findings carry none. */
  objectId?: string;
  /** Which part the finding belongs to, when the object type alone cannot say: a File is in either. Defaults to layerOf(objectType). */
  layer?: LayerName;
  location?: SourceLocation;
  detail?: string;
  object?: Ignorable;
}

export interface Finding {
  ruleId: string;
  layer: LayerName;
  objectType: ObjectType;
  objectName: string;
  objectId?: string;
  location?: SourceLocation;
  detail?: string;
}

export interface Rule {
  id: string;
  name: string;
  category: Category;
  severity: Severity;
  scope: ObjectType[];
  layer: Layer;
  /** The layers the rule cannot run without; it is skipped with `noModel` or `noReport` when one is absent. */
  needs: readonly LayerName[];
  /** Options the config may set for this rule; an option the rule does not declare is a ConfigError. */
  options?: readonly RuleOption[];
  /** What the rule checks, one paragraph from the rule page in pbiplint's own words. */
  description: string;
  fixExpression?: string;
  references: string[];
  status: RuleStatus;
  check(project: Project, ctx: RuleContext): RuleFinding[];
}
```

Create `packages/core/src/project/types.ts`:

```ts
import type { Model } from "../model/types.js";
import type { Report } from "../pbir/types.js";
import type { LayerName } from "../rules/types.js";

/** What one run reads: a model, a report, or both. Either part may be absent. */
export interface Project {
  model?: Model;
  report?: Report;
}

export type DiagnosticKind =
  | "depth-cap"
  | "unread-file"
  | "legacy-report-format"
  | "legacy-model-format"
  | "model-reference-mismatch"
  | "schema-newer-than-known";

/** Something about the input that a reader must know so nothing unread is mistaken for clean. */
export interface Diagnostic {
  kind: DiagnosticKind;
  message: string;
  path?: string;
}

export type LayerStatus = { present: true; files: number } | { present: false; reason: string };

export interface Layers {
  model: LayerStatus;
  report: LayerStatus;
}

/** One line of "Report at a glance": what the report will do, always shown, whether or not anything fired. */
export interface Fact {
  layer: LayerName;
  label: string;
  value: string;
  detail?: string;
  /** The rule that checks this fact, when the run has that rule; the site links the fact to it. */
  ruleId?: string;
}
```

Create `packages/core/src/pbir/types.ts` with exactly the interfaces in the Interfaces block above, each with a one-line doc comment, plus these two doc comments verbatim: on `Visual.altText`, `/** The alt text literal, or "(expression)" when it is bound to a measure or aggregation. */`; on `ReportFilter.applied`, `/** True when the entry carries a `filter` object, that is, a condition is set; a slicer with no selection has none. */`.

In `packages/core/src/engine/ignore.ts` change `isIgnored`'s parameter to `object: Ignorable | undefined` (import `Ignorable` from `../rules/types.js`; drop the `Named` import).

In `packages/core/src/engine/run.ts`, take a project and skip by `needs`:

```ts
import type { Indexes } from "../index/build.js";
import type { Project } from "../project/types.js";
import { layerOf, type Finding, type Rule, type RuleOptions } from "../rules/types.js";
import type { ResolvedConfig } from "./config.js";
import { isIgnored } from "./ignore.js";

export interface SkippedRule {
  id: string;
  reason: "disabled" | "needsLiveModel" | "noModel" | "noReport";
}
// RuleError and RunResult unchanged.

/** The rule's declared defaults; Task 2 lays the config's values over them. */
export function optionsFor(rule: Rule, _config: ResolvedConfig): RuleOptions {
  const out: Record<string, number | string> = {};
  for (const o of rule.options ?? []) if (o.default !== undefined) out[o.name] = o.default;
  return out;
}

export function runRules(project: Project, indexes: Indexes, rules: Rule[], config: ResolvedConfig): RunResult {
  const result: RunResult = { findings: [], rulesRun: [], rulesSkipped: [], ruleErrors: [], ignored: 0 };
  for (const rule of rules) {
    if (config.disabled.has(rule.id)) {
      result.rulesSkipped.push({ id: rule.id, reason: "disabled" });
      continue;
    }
    if (rule.status === "needsLiveModel") {
      result.rulesSkipped.push({ id: rule.id, reason: "needsLiveModel" });
      continue;
    }
    const missing = rule.needs.find((layer) => project[layer] === undefined);
    if (missing !== undefined) {
      result.rulesSkipped.push({ id: rule.id, reason: missing === "model" ? "noModel" : "noReport" });
      continue;
    }
    result.rulesRun.push(rule.id);
    let raw;
    try {
      raw = rule.check(project, { indexes, options: optionsFor(rule, config) });
    } catch (e) {
      result.ruleErrors.push({ id: rule.id, message: e instanceof Error ? e.message : String(e) });
      continue;
    }
    for (const f of raw) {
      if (isIgnored(f.object, rule.id)) {
        result.ignored++;
        continue;
      }
      const out: Finding = {
        ruleId: rule.id,
        layer: f.layer ?? layerOf(f.objectType),
        objectType: f.objectType,
        objectName: f.objectName,
      };
      if (f.objectId !== undefined) out.objectId = f.objectId;
      if (f.location) out.location = f.location;
      if (f.detail !== undefined) out.detail = f.detail;
      result.findings.push(out);
    }
  }
  return result;
}
```

In `packages/core/src/engine/rank.ts`, add `layer: Layer` to `RuleSummary` and let `rank` set it from the findings for a project rule:

```ts
export interface RuleSummary {
  id: string;
  name: string;
  category: Category;
  severity: Severity;
  /** The rule's layer; for a `project` rule, the layer of the objects its findings name. */
  layer: Layer;
  slug: string;
  url: string;
  status: RuleStatus;
}

export function summarizeRule(rule: Rule, config: ResolvedConfig, findings: Finding[] = []): RuleSummary {
  const layer = rule.layer === "project" && findings[0] ? findings[0].layer : rule.layer;
  return { id: rule.id, name: rule.name, category: rule.category, severity: effectiveSeverity(rule, config), layer, slug: slug(rule.id), url: ruleUrl(rule.id), status: rule.status };
}
```

and in `rank`, build each group's summary after its findings are collected: gather findings per rule id into a `Map<string, Finding[]>` first, then `groups = [...byRule].map(([id, fs]) => ({ rule: summarizeRule(byId.get(id)!, config, fs), findings: fs }))`, keeping the throw for an unknown rule and the same sort.

In `packages/core/src/engine/lint.ts`, the smallest change that compiles: build `const project: Project = { model };` and call `runRules(project, indexes, rules, config)`; `buildIndexes(model)` stays until Task 6. Import `Project`.

In `packages/core/src/rules/microsoft-bpa/define.ts`:

```ts
export function bpaRule(id: string, check: (model: Model, ctx: RuleContext) => RuleFinding[]): Rule {
  const meta = metaOf(id);
  return {
    id,
    name: stripCategory(meta.name),
    category: meta.category as Category,
    severity: meta.severity as Severity,
    scope: mapScope(meta.scope),
    layer: "model",
    needs: ["model"],
    description: RULE_SUMMARIES[id] ?? stripCategory(meta.name),
    fixExpression: meta.fixExpression,
    references: extractUrls(meta.description),
    status: "ported",
    // The 72 model bodies keep their (model, ctx) shape; the project is unwrapped here once.
    check: (project, ctx) => (project.model ? check(project.model, ctx) : []),
  };
}
```

In `packages/core/src/rules/parse-issue.ts`, declare `layer: "project"`, `needs: []`, and read both parts:

```ts
  check: ({ model, report }) => {
    const issue = (layer: "model" | "report") => (i: ParseIssue): RuleFinding => ({
      objectType: "File",
      objectName: i.file,
      layer,
      location: { file: i.file, line: i.line },
      detail: `${i.reason}: ${i.text.trim()}`,
    });
    return [
      ...(model?.files.flatMap((f) => f.issues) ?? []).map(issue("model")),
      ...(report?.issues ?? []).map(issue("report")),
    ];
  },
```

with `import type { ParseIssue } from "../tmdl/types.js";` and `RuleFinding` added to the import from `./types.js`.

```ts
```

In `packages/core/src/index.ts` add `export type { Project, Diagnostic, DiagnosticKind, Layers, LayerStatus, Fact } from "./project/types.js";` and `export type * from "./pbir/types.js";`. `export * from "./rules/types.js"` already carries the new values.

In `packages/web/src/build/pages.ts`, set the `CATEGORY_ORDER` copy to the eight entries in the same order.

- [ ] **Step 4: Run the whole suite**

Run: `npm run typecheck && npx vitest run`
Expected: PASS. The 72 rule files do not change: `bpaRule` unwraps the project for them. `rulesIndex` accepts the new categories; no page uses them yet.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src packages/core/test packages/web/src/build/pages.ts packages/web/test
git commit -m "feat(core): rule interface for two layers, report object types, project types"
```

---

### Task 2: Config options: an object value with severity and declared options

**Files:**
- Modify: `packages/core/src/engine/config.ts`
- Modify: `packages/core/src/engine/run.ts` (`optionsFor` reads the config)
- Modify: `packages/web/public/schema/pbiplint.config.schema.json`
- Test: `packages/core/test/engine.test.ts`

**Interfaces:**
- Produces:

```ts
export interface RuleConfigObject { severity?: SeverityName; [option: string]: unknown }
export interface PbiplintConfig { $schema?: string; rules?: Record<string, "off" | SeverityName | RuleConfigObject>; failOn?: SeverityName | "none" }
export interface ResolvedConfig { disabled: Set<string>; severity: Map<string, Severity>; options: Map<string, Record<string, unknown>>; failOn: Severity | null }
export function bindConfig(config: ResolvedConfig, rules: Rule[]): BoundConfig // now validates options against each rule's declaration and throws ConfigError
```

- Consumes: `RuleOption` from Task 1.

- [ ] **Step 1: Write the failing tests**

Append to `describe("resolveConfig")` in `packages/core/test/engine.test.ts`:

```ts
  it("accepts an object per rule with a severity and options, and keeps a v1 file valid", () => {
    const c = resolveConfig({
      rules: { A: { severity: "error", max: 15 }, B: { expect: "closed" }, C: "off", D: "warning" },
    });
    expect(c.severity.get("A")).toBe(3);
    expect(c.options.get("A")).toEqual({ max: 15 });
    expect(c.options.get("B")).toEqual({ expect: "closed" });
    expect(c.severity.has("B")).toBe(false);
    expect(c.disabled.has("C")).toBe(true);
    expect(c.options.has("D")).toBe(false);
    expect(() => resolveConfig({ rules: { A: { severity: "loud" } } })).toThrow(/rules\["A"\]\.severity/);
    expect(() => resolveConfig({ rules: { A: [] } })).toThrow(ConfigError);
  });
```

Append a new describe:

```ts
describe("bindConfig with options", () => {
  const withMax: Rule = {
    ...base,
    id: "WITH_MAX",
    name: "With max",
    category: "Performance",
    severity: 2,
    options: [{ name: "max", type: "number", default: 20 }],
    check: () => [],
  };
  const policy: Rule = {
    ...base,
    id: "POLICY",
    name: "Policy",
    category: "Report Design",
    severity: 2,
    options: [{ name: "expect", type: "string", values: ["open", "closed"] }],
    check: () => [],
  };
  it("lays the config's values over the declared defaults, by id without regard to case", () => {
    const { config } = bindConfig(resolveConfig({ rules: { with_max: { max: 5 } } }), [withMax, policy]);
    expect(optionsFor(withMax, config)).toEqual({ max: 5 });
    expect(optionsFor(policy, config)).toEqual({});
    expect(optionsFor(withMax, resolveConfig())).toEqual({ max: 20 });
  });
  it("rejects an option the rule does not declare, a wrong type, and a value outside the list", () => {
    expect(() => bindConfig(resolveConfig({ rules: { WITH_MAX: { maxx: 5 } } }), [withMax])).toThrow(
      'pbiplint.config.json: rules["WITH_MAX"] has no option "maxx" (options: max)',
    );
    expect(() => bindConfig(resolveConfig({ rules: { WITH_MAX: { max: "5" } } }), [withMax])).toThrow(
      'pbiplint.config.json: rules["WITH_MAX"].max must be a number',
    );
    expect(() => bindConfig(resolveConfig({ rules: { POLICY: { expect: "shut" } } }), [policy])).toThrow(
      'pbiplint.config.json: rules["POLICY"].expect must be one of open, closed',
    );
    expect(() => bindConfig(resolveConfig({ rules: { EVERY_TABLE: { max: 1 } } }), [everyTable])).toThrow(
      'pbiplint.config.json: rules["EVERY_TABLE"] takes no options',
    );
  });
});
```

Import `bindConfig` from `../src/engine/config.js` and `optionsFor` from `../src/engine/run.js`.

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run packages/core/test/engine.test.ts`
Expected: FAIL, `options` is not on `ResolvedConfig`, `optionsFor` is not exported.

- [ ] **Step 3: Implement**

In `packages/core/src/engine/config.ts`:

```ts
/** A rule's value as an object: an optional severity plus the options the rule declares. */
export interface RuleConfigObject {
  severity?: SeverityName;
  [option: string]: unknown;
}

export interface PbiplintConfig {
  $schema?: string;
  /** Per rule: "off" disables it; a severity name overrides its severity; an object may carry both a severity and the rule's options. */
  rules?: Record<string, "off" | SeverityName | RuleConfigObject>;
  failOn?: SeverityName | "none";
}

export interface ResolvedConfig {
  disabled: Set<string>;
  severity: Map<string, Severity>;
  /** Options per rule id as written, validated against the rule's declaration by bindConfig. */
  options: Map<string, Record<string, unknown>>;
  failOn: Severity | null;
}
```

`isResolvedConfig` also requires `v.options instanceof Map`. In `resolveConfig`, initialise `options: new Map()` and extend the rules loop:

```ts
    for (const [id, v] of Object.entries(raw.rules)) {
      if (v === "off") out.disabled.add(id);
      else if (v === "info" || v === "warning" || v === "error") out.severity.set(id, SEVERITY_BY_NAME[v]);
      else if (isRecord(v)) {
        const { severity, ...options } = v;
        if (severity !== undefined) {
          if (severity !== "info" && severity !== "warning" && severity !== "error")
            throw new ConfigError(`pbiplint.config.json: rules["${id}"].severity must be "info", "warning", or "error"`);
          out.severity.set(id, SEVERITY_BY_NAME[severity]);
        }
        if (Object.keys(options).length > 0) out.options.set(id, options);
      } else
        throw new ConfigError(
          `pbiplint.config.json: rules["${id}"] must be "off", "info", "warning", "error", or an object with a severity and options`,
        );
    }
```

In `bindConfig`, after binding severities, bind and validate options:

```ts
  for (const [id, options] of config.options) {
    const real = idByUpper.get(id.toUpperCase());
    if (real === undefined) {
      unknownRules.push(id);
      continue;
    }
    const rule = rules.find((r) => r.id === real)!;
    const declared = rule.options ?? [];
    if (declared.length === 0) throw new ConfigError(`pbiplint.config.json: rules["${real}"] takes no options`);
    for (const [name, value] of Object.entries(options)) {
      const decl = declared.find((o) => o.name === name);
      if (!decl)
        throw new ConfigError(
          `pbiplint.config.json: rules["${real}"] has no option "${name}" (options: ${declared.map((o) => o.name).join(", ")})`,
        );
      if (typeof value !== decl.type)
        throw new ConfigError(`pbiplint.config.json: rules["${real}"].${name} must be a ${decl.type}`);
      if (decl.values && !decl.values.includes(value as string))
        throw new ConfigError(`pbiplint.config.json: rules["${real}"].${name} must be one of ${decl.values.join(", ")}`);
    }
    bound.options.set(real, options);
  }
```

(`bound` gets `options: new Map()` in its initialiser.) In `packages/core/src/engine/run.ts`, `optionsFor` lays the config over the defaults:

```ts
export function optionsFor(rule: Rule, config: ResolvedConfig): RuleOptions {
  const out: Record<string, number | string> = {};
  for (const o of rule.options ?? []) if (o.default !== undefined) out[o.name] = o.default;
  for (const [name, value] of Object.entries(config.options.get(rule.id) ?? {}))
    out[name] = value as number | string;
  return out;
}
```

In `packages/web/public/schema/pbiplint.config.schema.json`, replace the `rules.additionalProperties` value with:

```json
      "additionalProperties": {
        "oneOf": [
          { "enum": ["off", "info", "warning", "error"] },
          {
            "type": "object",
            "description": "A severity override and the options the rule declares (see its page).",
            "properties": { "severity": { "enum": ["info", "warning", "error"] } },
            "additionalProperties": true
          }
        ]
      }
```

and change the `rules.description` to `"Rule id to \"off\", to a severity that replaces the rule's own, or to an object with a severity and the rule's options. Ids match regardless of case."`.

- [ ] **Step 4: Run the tests**

Run: `npx vitest run packages/core/test/engine.test.ts packages/web/test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/engine packages/core/test/engine.test.ts packages/web/public/schema/pbiplint.config.schema.json
git commit -m "feat(core): rule options in pbiplint.config.json, validated against each rule's declaration"
```

---
### Task 3: Reading a PBIR JSON file: tolerance, conflict markers, schema version, line of a pointer

**Files:**
- Create: `packages/core/src/pbir/json.ts`
- Test: `packages/core/test/pbir-json.test.ts`

**Interfaces:**
- Produces:

```ts
export interface JsonRead { json: unknown; issues: ParseIssue[]; schema?: string; schemaVersion?: string }
export function readJson(file: string, text: string): JsonRead
export function schemaVersionOf(schema: string | undefined): string | undefined   // "3.2.0" from ".../report/3.2.0/schema.json"
export function schemaFamilyOf(schema: string | undefined): string | undefined    // "report" from the same
export function newerThan(a: string, b: string): boolean                           // "3.3.0" newer than "3.2.0"
export function lineOfPointer(text: string, pointer: string): number               // 1-based; 1 when not found
```

- Consumers: Task 5 (`buildReport`), the report finding factories, `REPORT_LEVEL_MEASURES`.

- [ ] **Step 1: Write the failing tests**

Create `packages/core/test/pbir-json.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  lineOfPointer,
  newerThan,
  readJson,
  schemaFamilyOf,
  schemaVersionOf,
} from "../src/pbir/json.js";

const doc = [
  "{",
  '  "name": "v1",',
  '  "position": {',
  '    "x": 1,',
  '    "height": 20',
  "  },",
  '  "items": [',
  '    "a",',
  '    { "k": "b" }',
  "  ]",
  "}",
].join("\n");

describe("readJson", () => {
  it("parses a document, drops a BOM, and reads the schema family and version", () => {
    const r = readJson("definition/report.json", '﻿{"$schema":"https://x/report/definition/report/3.2.0/schema.json","a":1}');
    expect(r.issues).toEqual([]);
    expect(r.json).toEqual({ $schema: "https://x/report/definition/report/3.2.0/schema.json", a: 1 });
    expect(r.schema).toBe("https://x/report/definition/report/3.2.0/schema.json");
    expect(r.schemaVersion).toBe("3.2.0");
    expect(schemaFamilyOf(r.schema)).toBe("report");
    expect(schemaVersionOf(undefined)).toBeUndefined();
  });
  it("reports every merge conflict marker with its line and reads nothing else from the file", () => {
    const text = '{\n  "a": 1,\n<<<<<<< HEAD\n  "b": 2,\n=======\n  "b": 3,\n>>>>>>> theirs\n}\n';
    const r = readJson("definition/pages/p/page.json", text);
    expect(r.json).toBeUndefined();
    expect(r.issues.map((i) => [i.line, i.reason])).toEqual([
      [3, "merge conflict marker"],
      [5, "merge conflict marker"],
      [7, "merge conflict marker"],
    ]);
    expect(r.issues[0]!.file).toBe("definition/pages/p/page.json");
  });
  it("reports invalid JSON with the line the parser stopped on", () => {
    const r = readJson("x.json", '{\n  "a": 1,\n  "b": }\n');
    expect(r.json).toBeUndefined();
    expect(r.issues).toHaveLength(1);
    expect(r.issues[0]!.reason).toMatch(/^not valid JSON/);
    expect(r.issues[0]!.line).toBe(3);
  });
});

describe("newerThan", () => {
  it("compares numeric segments", () => {
    expect(newerThan("3.3.0", "3.2.0")).toBe(true);
    expect(newerThan("2.10.0", "2.9.0")).toBe(true);
    expect(newerThan("3.2.0", "3.2.0")).toBe(false);
    expect(newerThan("1.0.0", "3.2.0")).toBe(false);
  });
});

describe("lineOfPointer", () => {
  it("gives the line of an object member's key and of an array element's value", () => {
    expect(lineOfPointer(doc, "/position/height")).toBe(5);
    expect(lineOfPointer(doc, "/position")).toBe(3);
    expect(lineOfPointer(doc, "/items/0")).toBe(8);
    expect(lineOfPointer(doc, "/items/1/k")).toBe(9);
  });
  it("is 1 for the root, a missing pointer, and a key that only appears inside a string", () => {
    expect(lineOfPointer(doc, "")).toBe(1);
    expect(lineOfPointer(doc, "/nope")).toBe(1);
    expect(lineOfPointer('{\n  "a": "\\"height\\": 1",\n  "height": 2\n}', "/height")).toBe(3);
  });
  it("unescapes ~1 and ~0 in a pointer segment", () => {
    expect(lineOfPointer('{\n  "a/b": 1,\n  "c~d": 2\n}', "/a~1b")).toBe(2);
    expect(lineOfPointer('{\n  "a/b": 1,\n  "c~d": 2\n}', "/c~0d")).toBe(3);
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run packages/core/test/pbir-json.test.ts`
Expected: FAIL, the module does not exist.

- [ ] **Step 3: Implement**

Create `packages/core/src/pbir/json.ts`:

```ts
import type { ParseIssue } from "../tmdl/types.js";

export interface JsonRead {
  /** The parsed document, or undefined when the text could not be read. */
  json: unknown;
  issues: ParseIssue[];
  /** The document's `$schema` URL, when it has one. */
  schema?: string;
  /** The version segment of that URL: `3.2.0` for `.../report/3.2.0/schema.json`. */
  schemaVersion?: string;
}

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

/** A git conflict marker at the start of a line: the file was saved mid-merge. */
const CONFLICT_MARKER = /^(?:<{7}|={7}|>{7})(?:\s|$)/;

/**
 * Reads one PBIR JSON file tolerantly. Conflict markers and invalid JSON become parse issues with
 * a line, in the same shape the TMDL parser reports, so PARSE_ISSUE lists them beside everything
 * else; the document is then undefined and the caller reads nothing from it.
 */
export function readJson(file: string, text: string): JsonRead {
  // Desktop writes JSON with a BOM at times; it is not part of the document.
  const body = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  const lines = body.split(/\r\n?|\n/);
  const issues: ParseIssue[] = lines.flatMap((line, i) =>
    CONFLICT_MARKER.test(line) ? [{ file, line: i + 1, text: line, reason: "merge conflict marker" }] : [],
  );
  if (issues.length > 0) return { json: undefined, issues };
  try {
    const json: unknown = JSON.parse(body);
    const schema = isRecord(json) && typeof json.$schema === "string" ? json.$schema : undefined;
    return { json, issues, schema, schemaVersion: schemaVersionOf(schema) };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    // V8 names the offset in most of its messages; the line is counted up to it. Without one,
    // line 1 is the honest answer.
    const at = /position (\d+)/.exec(message);
    const line = at ? body.slice(0, Number(at[1])).split("\n").length : 1;
    return {
      json: undefined,
      issues: [{ file, line, text: lines[line - 1] ?? "", reason: `not valid JSON (${message})` }],
    };
  }
}

const SCHEMA_TAIL = /\/([^/]+)\/(\d+\.\d+\.\d+)\/schema\.json$/;

export const schemaVersionOf = (schema: string | undefined): string | undefined =>
  schema === undefined ? undefined : SCHEMA_TAIL.exec(schema)?.[2];

/** The family segment before the version: `report`, `page`, `visualContainer`, `pagesMetadata`. */
export const schemaFamilyOf = (schema: string | undefined): string | undefined =>
  schema === undefined ? undefined : SCHEMA_TAIL.exec(schema)?.[1];

/** True when `a` is a newer version than `b`, comparing each numeric segment. */
export function newerThan(a: string, b: string): boolean {
  const pa = a.split(".").map(Number);
  const pb = b.split(".").map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const x = pa[i] ?? 0;
    const y = pb[i] ?? 0;
    if (x !== y) return x > y;
  }
  return false;
}

/**
 * The 1-based line of what a JSON pointer names, for a finding's location: the line of the key
 * for an object member, the line the value starts on for an array element. 1 for the root or for
 * a pointer that names nothing. A token scanner rather than a parse, because JSON.parse keeps no
 * positions; it tracks the path as it walks and stops at the first match.
 */
export function lineOfPointer(text: string, pointer: string): number {
  if (pointer === "") return 1;
  const want = pointer
    .split("/")
    .slice(1)
    .map((s) => s.replace(/~1/g, "/").replace(/~0/g, "~"));
  const path: string[] = [];
  const kinds: ("object" | "array")[] = [];
  const parent = (): "object" | "array" | undefined => kinds[kinds.length - 1];
  const matches = (): boolean =>
    path.length === want.length && path.every((p, i) => p === want[i]);
  let line = 1;
  let expectKey = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!;
    if (ch === "\n") {
      line++;
      continue;
    }
    if (ch === " " || ch === "\t" || ch === "\r" || ch === ":") continue;
    if (ch === '"') {
      let j = i + 1;
      while (j < text.length && text[j] !== '"') {
        if (text[j] === "\\") j++;
        j++;
      }
      const value = JSON.parse(text.slice(i, j + 1)) as string;
      if (parent() === "object" && expectKey) {
        path[path.length - 1] = value;
        expectKey = false;
        if (matches()) return line;
      } else if (parent() === "array" && matches()) return line;
      for (let k = i; k <= j; k++) if (text[k] === "\n") line++;
      i = j;
      continue;
    }
    if (ch === "{" || ch === "[") {
      if (parent() === "array" && matches()) return line;
      kinds.push(ch === "{" ? "object" : "array");
      path.push(ch === "{" ? "" : "0");
      expectKey = ch === "{";
      continue;
    }
    if (ch === "}" || ch === "]") {
      kinds.pop();
      path.pop();
      expectKey = false;
      continue;
    }
    if (ch === ",") {
      if (parent() === "array") path[path.length - 1] = String(Number(path[path.length - 1]) + 1);
      else expectKey = true;
      continue;
    }
    // A number, true, false, or null.
    if (parent() === "array" && matches()) return line;
    let j = i;
    while (j < text.length && !/[\s,\]}]/.test(text[j]!)) j++;
    i = j - 1;
  }
  return 1;
}
```

- [ ] **Step 4: Run the tests**

Run: `npx vitest run packages/core/test/pbir-json.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/pbir/json.ts packages/core/test/pbir-json.test.ts
git commit -m "feat(core): tolerant PBIR JSON reading with conflict markers, schema versions, and pointer lines"
```

---

### Task 4: The field-reference walker

**Files:**
- Create: `packages/core/src/pbir/refs.ts`
- Test: `packages/core/test/pbir-refs.test.ts`

**Interfaces:**
- Produces: `collectFieldRefs(node: unknown, pointer?: string, aliases?: ReadonlyMap<string, string>): FieldRef[]` and `escapePointer(segment: string): string`. `FieldRef` is from Task 1.
- Consumers: Task 5 (visual fields, filters, bookmarks, page bindings), Task 6 (report reference index).

- [ ] **Step 1: Write the failing tests**

Create `packages/core/test/pbir-refs.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { collectFieldRefs } from "../src/pbir/refs.js";

const column = (entity: string, property: string) => ({
  Column: { Expression: { SourceRef: { Entity: entity } }, Property: property },
});

describe("collectFieldRefs", () => {
  it("finds a column, a measure, an aggregation, and a hierarchy level, each with its pointer", () => {
    const projections = [
      { field: column("Product", "Category") },
      { field: { Measure: { Expression: { SourceRef: { Entity: "Sales" } }, Property: "Total Sales" } } },
      { field: { Aggregation: { Expression: column("Sales", "Amount"), Function: 0 } } },
      {
        field: {
          HierarchyLevel: {
            Expression: { Hierarchy: { Expression: { SourceRef: { Entity: "Date" } }, Hierarchy: "Calendar" } },
            Level: "Year",
          },
        },
      },
    ];
    expect(collectFieldRefs(projections, "/projections")).toEqual([
      { kind: "column", table: "Product", name: "Category", pointer: "/projections/0/field" },
      { kind: "measure", table: "Sales", name: "Total Sales", pointer: "/projections/1/field" },
      { kind: "aggregation", table: "Sales", name: "Amount", pointer: "/projections/2/field" },
      { kind: "hierarchyLevel", table: "Date", name: "Calendar", level: "Year", pointer: "/projections/3/field" },
    ]);
  });
  it("resolves a filter's From alias and keeps it scoped to the filter that declares it", () => {
    const filters = [
      {
        name: "f1",
        field: column("Date", "Year"),
        filter: {
          Version: 2,
          From: [{ Name: "d", Entity: "Date", Type: 0 }],
          Where: [{ Condition: { In: { Expressions: [{ Column: { Expression: { SourceRef: { Source: "d" } }, Property: "Year" } }] } } }],
        },
      },
      { name: "f2", filter: { Where: [{ Condition: { Column: { Expression: { SourceRef: { Source: "d" } }, Property: "Year" } } }] } },
    ];
    const refs = collectFieldRefs(filters, "/filters");
    expect(refs.map((r) => [r.table, r.name, r.pointer])).toEqual([
      ["Date", "Year", "/filters/0/field"],
      ["Date", "Year", "/filters/0/filter/Where/0/Condition/In/Expressions/0"],
      ["", "Year", "/filters/1/filter/Where/0/Condition"],
    ]);
  });
  it("escapes a key with a slash in the pointer and ignores nodes that only look like references", () => {
    const refs = collectFieldRefs({ "a/b": [column("T", "C")], Column: "not a ref" }, "");
    expect(refs).toEqual([{ kind: "column", table: "T", name: "C", pointer: "/a~1b/0" }]);
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run packages/core/test/pbir-refs.test.ts`
Expected: FAIL, module not found.

- [ ] **Step 3: Implement**

Create `packages/core/src/pbir/refs.ts`:

```ts
import type { FieldRef } from "./types.js";

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

/** A JSON pointer segment, with `~` and `/` escaped as RFC 6901 says. */
export const escapePointer = (s: string): string => s.replace(/~/g, "~0").replace(/\//g, "~1");

/** The table a SourceRef names: its Entity, or the alias its Source points at within the enclosing filter. */
function entityOf(expression: unknown, aliases: ReadonlyMap<string, string>): string {
  const ref = isRecord(expression) ? expression.SourceRef : undefined;
  if (!isRecord(ref)) return "";
  if (typeof ref.Entity === "string") return ref.Entity;
  if (typeof ref.Source === "string") return aliases.get(ref.Source) ?? "";
  return "";
}

/**
 * Every field reference under a JSON node: a visual's projections, a filter's field and its
 * condition, a bookmark's state, a page binding's parameters. Column, Measure, Aggregation, and
 * HierarchyLevel are recognised wherever they sit, so a property the schema adds later is covered
 * without a change here. A `From` list declares aliases for the object that carries it and
 * everything beneath it, which is how a filter's Where refers to its own table; an alias with no
 * From in scope yields a reference with an empty table, which the index reports as unresolved.
 */
export function collectFieldRefs(
  node: unknown,
  pointer = "",
  aliases: ReadonlyMap<string, string> = new Map(),
): FieldRef[] {
  const out: FieldRef[] = [];
  const walk = (n: unknown, p: string, scope: ReadonlyMap<string, string>): void => {
    if (Array.isArray(n)) {
      n.forEach((item, i) => walk(item, `${p}/${i}`, scope));
      return;
    }
    if (!isRecord(n)) return;
    if (Array.isArray(n.From)) {
      const next = new Map(scope);
      for (const f of n.From)
        if (isRecord(f) && typeof f.Name === "string" && typeof f.Entity === "string")
          next.set(f.Name, f.Entity);
      scope = next;
    }
    if (isRecord(n.Column) && typeof n.Column.Property === "string") {
      out.push({ kind: "column", table: entityOf(n.Column.Expression, scope), name: n.Column.Property, pointer: p });
      return;
    }
    if (isRecord(n.Measure) && typeof n.Measure.Property === "string") {
      out.push({ kind: "measure", table: entityOf(n.Measure.Expression, scope), name: n.Measure.Property, pointer: p });
      return;
    }
    if (isRecord(n.Aggregation) && isRecord(n.Aggregation.Expression)) {
      const inner = n.Aggregation.Expression.Column;
      if (isRecord(inner) && typeof inner.Property === "string") {
        out.push({ kind: "aggregation", table: entityOf(inner.Expression, scope), name: inner.Property, pointer: p });
        return;
      }
    }
    const level = isRecord(n.HierarchyLevel) ? n.HierarchyLevel : undefined;
    const hierarchy = level ? (isRecord(level.Expression) ? level.Expression.Hierarchy : undefined) : n.Hierarchy;
    if (isRecord(hierarchy) && typeof hierarchy.Hierarchy === "string") {
      out.push({
        kind: "hierarchyLevel",
        table: entityOf(hierarchy.Expression, scope),
        name: hierarchy.Hierarchy,
        ...(typeof level?.Level === "string" ? { level: level.Level } : {}),
        pointer: p,
      });
      return;
    }
    for (const [key, value] of Object.entries(n)) walk(value, `${p}/${escapePointer(key)}`, scope);
  };
  walk(node, pointer, aliases);
  return out;
}
```

- [ ] **Step 4: Run the tests**

Run: `npx vitest run packages/core/test/pbir-refs.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/pbir/refs.ts packages/core/test/pbir-refs.test.ts
git commit -m "feat(core): one walker finds every field reference in report JSON, aliases resolved in scope"
```

---

### Task 5: The report object model builder and report finding names

**Files:**
- Create: `packages/core/src/pbir/build.ts`
- Create: `packages/core/src/pbir/names.ts`
- Create: `packages/core/src/rules/report-helpers.ts`
- Modify: `packages/core/src/index.ts`
- Test: `packages/core/test/pbir-build.test.ts`, `packages/core/test/pbir-names.test.ts`

**Interfaces:**
- Produces, `packages/core/src/pbir/build.ts`:

```ts
export const KNOWN_SCHEMAS: Readonly<Record<string, string>>;   // family to newest version this reader knows
export function literal(prop: unknown): string | undefined;      // `{ expr: { Literal: { Value: "'x'" } } }` gives "x"; "true" gives "true"
export function buildReport(files: LintFile[]): { report: Report; diagnostics: Diagnostic[] }
```

- Produces, `packages/core/src/pbir/names.ts`: `shortId`, `pageLabel(p)`, `visualLabel(v)`, `bookmarkLabel(b)`, `reportMeasureLabel(m)`, `pageFilterLabel(p)`, `REPORT_LABEL = "Report"`, `REPORT_FILTER_LABEL = "Report filter"`.
- Produces, `packages/core/src/rules/report-helpers.ts`, the finding factories every report rule uses (`RuleFinding` with `objectId`, `location` from a pointer, and `object` for the ignore check): `reportFinding.report(r, detail?, objectId?)`, `.page(p, pointer?, detail?)`, `.visual(v, pointer?, detail?)`, `.pageFilter(p, pointer, detail?)`, `.reportFilter(r, pointer, detail?)`, `.bookmark(b, detail?)`, `.reportMeasure(m, detail?)`; plus `allVisuals(report)` and `visiblePages(report)`.
- Consumes: Tasks 3 and 4.

- [ ] **Step 1: Write the failing tests**

Create `packages/core/test/pbir-build.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { buildReport, KNOWN_SCHEMAS, literal } from "../src/pbir/build.js";

const schema = (family: string, version: string) =>
  `https://developer.microsoft.com/json-schemas/fabric/item/report/definition/${family}/${version}/schema.json`;
const j = (v: unknown) => JSON.stringify(v, null, 2);
const column = (entity: string, property: string) => ({
  Column: { Expression: { SourceRef: { Entity: entity } }, Property: property },
});
const lit = (value: string) => ({ expr: { Literal: { Value: value } } });

const reportJson = j({
  $schema: schema("report", "3.2.0"),
  themeCollection: { baseTheme: { name: "Fluent2-CY26SU04", type: "SharedResources" } },
  objects: { outspacePane: [{ properties: { expanded: lit("true") } }] },
  publicCustomVisuals: ["ChicletSlicer1448559807354"],
  filterConfig: { filters: [{ name: "rf", field: column("Date", "Year"), type: "Categorical" }] },
  settings: { filterPaneHiddenInEditMode: true },
});
const pagesJson = j({ $schema: schema("pagesMetadata", "1.1.0"), pageOrder: ["p2", "p1"], activePageName: "p1", landingPageName: "p2" });
const page = (name: string, extra: Record<string, unknown> = {}) =>
  j({ $schema: schema("page", "2.1.0"), name, displayName: `Page ${name}`, displayOption: "FitToPage", height: 720, width: 1280, ...extra });
const visual = (name: string, extra: Record<string, unknown> = {}, inner: Record<string, unknown> = {}) =>
  j({
    $schema: schema("visualContainer", "2.8.0"),
    name,
    position: { x: 10, y: 20, z: 1000, height: 100, width: 200, tabOrder: 1000 },
    ...extra,
    visual: {
      visualType: "clusteredBarChart",
      query: { queryState: { Category: { projections: [{ field: column("Product", "Category") }], showAll: true }, Y: { projections: [{ field: { Measure: { Expression: { SourceRef: { Entity: "Sales" } }, Property: "Total Sales" } } }] } } },
      visualContainerObjects: {
        title: [{ properties: { text: lit("'Sales by category'") } }],
        general: [{ properties: { altText: lit("'Bar chart of sales by category'") } }],
        visualLink: [{ properties: { type: lit("'PageNavigation'"), navigationSection: lit("'p2'") } }],
      },
      ...inner,
    },
  });

const files = [
  { path: "definition.pbir", text: j({ version: "4.0", datasetReference: { byPath: { path: "../Demo.SemanticModel" } } }) },
  { path: ".platform", text: j({ metadata: { type: "Report", displayName: "Demo" }, config: { version: "2.0" } }) },
  { path: "definition/report.json", text: reportJson },
  { path: "definition/pages/pages.json", text: pagesJson },
  { path: "definition/pages/p1/page.json", text: page("p1", { visibility: "HiddenInViewMode", pageBinding: { type: "Tooltip", parameters: [{ field: column("Product", "Category") }] }, filterConfig: { filters: [{ name: "pf", field: column("Customer", "Segment"), type: "Advanced", filter: { From: [{ Name: "c", Entity: "Customer" }], Where: [] } }] }, annotations: [{ name: "pbiplint.ignore", value: "X" }] }) },
  { path: "definition/pages/p2/page.json", text: page("p2") },
  { path: "definition/pages/p1/visuals/v1/visual.json", text: visual("v1", { isHidden: true, filterConfig: { filters: [{ name: "vf", field: column("Product", "Brand"), type: "Categorical" }] } }) },
  { path: "definition/pages/p1/visuals/v1/mobile.json", text: j({ $schema: schema("visualContainerMobileState", "1.4.0"), position: { x: 0, y: 0, z: 0, height: 1, width: 1 } }) },
  { path: "definition/pages/p2/visuals/v2/visual.json", text: visual("v2", { parentGroupName: "g1" }, { visualContainerObjects: { general: [{ properties: { altText: { expr: { Measure: { Expression: { SourceRef: { Entity: "Sales" } }, Property: "Alt" } } } } }] } }) },
  { path: "definition/pages/p2/visuals/g1/visual.json", text: j({ $schema: schema("visualContainer", "2.8.0"), name: "g1", position: { x: 0, y: 0, z: 0, height: 1, width: 1, tabOrder: 0 }, visualGroup: { displayName: "Group", groupMode: "ScaleMode" } }) },
  { path: "definition/bookmarks/bookmarks.json", text: j({ items: [{ name: "b1", children: [{ name: "b2" }] }] }) },
  { path: "definition/bookmarks/b1.bookmark.json", text: j({ name: "b1", displayName: "Reset", explorationState: { activeSection: "p1", sections: { p1: { visualContainers: { v1: {}, gone: {} } } } } }) },
  { path: "definition/reportExtensions.json", text: '{\n  "name": "extension",\n  "entities": [\n    {\n      "name": "Sales",\n      "measures": [\n        { "name": "Net Margin", "expression": "[Total Sales] - [Total Cost]", "hidden": false },\n        { "name": "Margin %", "expression": "DIVIDE([Net Margin], [Total Sales])" }\n      ]\n    }\n  ]\n}' },
];

describe("buildReport", () => {
  const { report, diagnostics } = buildReport(files);
  it("reads the report file, the pane state, custom visuals, filters, and the dataset reference", () => {
    expect(report.displayName).toBe("Demo");
    expect(report.file).toBe("definition/report.json");
    expect(report.schemaVersion).toBe("3.2.0");
    expect(report.themeName).toBe("Fluent2-CY26SU04");
    expect(report.publicCustomVisuals).toEqual(["ChicletSlicer1448559807354"]);
    expect(report.filtersPane).toEqual({ expanded: true, visible: undefined, hiddenInEditMode: true });
    expect(report.filters.map((f) => [f.name, f.type, f.applied, f.field?.name])).toEqual([["rf", "Categorical", false, "Year"]]);
    expect(report.datasetReference).toEqual({ kind: "byPath", path: "../Demo.SemanticModel" });
    expect(report.files).toHaveLength(files.length);
    expect(report.issues).toEqual([]);
    expect(diagnostics).toEqual([]);
  });
  it("orders pages by pageOrder and reads their header, binding, filters, and annotations", () => {
    expect(report.pagesHeader).toEqual({ file: "definition/pages/pages.json", pageOrder: ["p2", "p1"], activePageName: "p1", landingPageName: "p2" });
    expect(report.pages.map((p) => p.id)).toEqual(["p2", "p1"]);
    const p1 = report.pages[1]!;
    expect(p1.displayName).toBe("Page p1");
    expect(p1.visibility).toBe("HiddenInViewMode");
    expect(p1.bindingType).toBe("Tooltip");
    expect(p1.bindingRefs.map((r) => r.name)).toEqual(["Category"]);
    expect(p1.filters.map((f) => [f.type, f.applied])).toEqual([["Advanced", true]]);
    expect(p1.annotations).toEqual({ "pbiplint.ignore": "X" });
    expect(p1.file).toBe("definition/pages/p1/page.json");
    expect(report.schemaVersions).toEqual({ report: "3.2.0", page: "2.1.0", visual: "2.8.0" });
  });
  it("reads a visual's type, position, fields per role, showAll, title, alt text, actions, filters, and mobile layout", () => {
    const v1 = report.pages[1]!.visuals[0]!;
    expect(v1.id).toBe("v1");
    expect(v1.page.id).toBe("p1");
    expect(v1.type).toBe("clusteredBarChart");
    expect(v1.position).toEqual({ x: 10, y: 20, z: 1000, height: 100, width: 200, tabOrder: 1000 });
    expect(v1.isHidden).toBe(true);
    expect(v1.fields.map((f) => [f.role, f.ref.kind, f.ref.table, f.ref.name])).toEqual([
      ["Category", "column", "Product", "Category"],
      ["Y", "measure", "Sales", "Total Sales"],
    ]);
    expect(v1.fields[0]!.ref.pointer).toBe("/visual/query/queryState/Category/projections/0/field");
    expect(v1.showAllRoles).toEqual(["Category"]);
    expect(v1.title).toBe("Sales by category");
    expect(v1.altText).toBe("Bar chart of sales by category");
    expect(v1.actions).toEqual([{ type: "PageNavigation", target: "p2", pointer: "/visual/visualContainerObjects/visualLink/0/properties" }]);
    expect(v1.filters.map((f) => f.name)).toEqual(["vf"]);
    expect(v1.hasMobileLayout).toBe(true);
    expect(v1.file).toBe("definition/pages/p1/visuals/v1/visual.json");
  });
  it("marks a group, a member of a group, and an alt text bound to an expression", () => {
    const [g1, v2] = report.pages[0]!.visuals;
    expect(g1!.isGroup).toBe(true);
    expect(g1!.type).toBe("visualGroup");
    expect(v2!.groupId).toBe("g1");
    expect(v2!.altText).toBe("(expression)");
    expect(v2!.hasMobileLayout).toBe(false);
    expect(v2!.isHidden).toBe(false);
  });
  it("reads bookmarks and their header, and report-level measures with their lines", () => {
    expect(report.bookmarksHeader.items).toEqual([{ name: "b1", children: ["b2"] }]);
    const b = report.bookmarks[0]!;
    expect([b.id, b.displayName, b.activePage, b.pages]).toEqual(["b1", "Reset", "p1", ["p1"]]);
    expect(b.visuals).toEqual([{ page: "p1", visual: "v1" }, { page: "p1", visual: "gone" }]);
    expect(report.measures.map((m) => [m.table, m.name, m.hidden, m.line])).toEqual([
      ["Sales", "Net Margin", false, 7],
      ["Sales", "Margin %", false, 8],
    ]);
  });
});

describe("buildReport tolerance", () => {
  it("reports a schema newer than it knows once per family and ignores families it does not know", () => {
    const { diagnostics } = buildReport([
      { path: "definition/pages/a/page.json", text: page("a").replace("page/2.1.0", "page/9.0.0") },
      { path: "definition/pages/b/page.json", text: page("b").replace("page/2.1.0", "page/9.1.0") },
      { path: "definition/other.json", text: j({ $schema: "https://x/thing/9.9.9/schema.json" }) },
    ]);
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]).toMatchObject({ kind: "schema-newer-than-known", path: "definition/pages/a/page.json" });
    expect(diagnostics[0]!.message).toContain(`newer than the ${KNOWN_SCHEMAS.page} this version of pbiplint knows`);
  });
  it("keeps a file with a conflict marker as an issue and still builds everything else", () => {
    const { report } = buildReport([
      { path: "definition/pages/a/page.json", text: "<<<<<<< HEAD\n" + page("a") },
      { path: "definition/pages/a/visuals/v/visual.json", text: visual("v") },
    ]);
    expect(report.issues.map((i) => [i.file, i.line])).toEqual([["definition/pages/a/page.json", 1]]);
    // The page file could not be read, so the visual's page is a stub named by its folder.
    expect(report.pages.map((p) => [p.id, p.displayName])).toEqual([["a", "a"]]);
    expect(report.pages[0]!.visuals.map((v) => v.id)).toEqual(["v"]);
  });
  it("ignores a .platform of another part and a definition.pbir with a connection", () => {
    const { report } = buildReport([
      { path: ".platform", text: j({ metadata: { type: "SemanticModel", displayName: "Model" } }) },
      { path: "definition.pbir", text: j({ datasetReference: { byConnection: { connectionString: "x" } } }) },
    ]);
    expect(report.displayName).toBeUndefined();
    expect(report.datasetReference).toEqual({ kind: "byConnection" });
  });
  it("reads literals with and without quotes", () => {
    expect(literal(lit("'It''s'"))).toBe("It's");
    expect(literal(lit("true"))).toBe("true");
    expect(literal(lit("18D"))).toBe("18D");
    expect(literal({ expr: { Measure: {} } })).toBeUndefined();
    expect(literal(undefined)).toBeUndefined();
  });
});
```

Create `packages/core/test/pbir-names.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { buildReport } from "../src/pbir/build.js";
import { bookmarkLabel, pageFilterLabel, pageLabel, reportMeasureLabel, visualLabel } from "../src/pbir/names.js";
import { reportFinding } from "../src/rules/report-helpers.js";

const j = (v: unknown) => JSON.stringify(v, null, 2);
const { report } = buildReport([
  { path: "definition/pages/p1/page.json", text: j({ name: "p1", displayName: "Overview" }) },
  { path: "definition/pages/p1/visuals/9f2e4c1a0000/visual.json", text: j({ name: "9f2e4c1a0000", position: { x: 1, y: 2 }, visual: { visualType: "tableEx", visualContainerObjects: { title: [{ properties: { text: { expr: { Literal: { Value: "'Top products'" } } } } }] } } }) },
  { path: "definition/pages/p1/visuals/b07d00000000/visual.json", text: j({ name: "b07d00000000", position: {}, visual: { visualType: "cardVisual" } }) },
  { path: "definition/bookmarks/b1.bookmark.json", text: j({ name: "b1", displayName: "Reset" }) },
  { path: "definition/reportExtensions.json", text: j({ entities: [{ name: "Sales", measures: [{ name: "Net Margin", expression: "1" }] }] }) },
]);

describe("report finding names", () => {
  it("follow the spec's shapes", () => {
    const page = report.pages[0]!;
    const [titled, untitled] = page.visuals;
    expect(pageLabel(page)).toBe('Page "Overview"');
    expect(visualLabel(titled!)).toBe('"Top products" on "Overview"');
    expect(visualLabel(untitled!)).toBe('cardVisual (b07d00) on "Overview"');
    expect(bookmarkLabel(report.bookmarks[0]!)).toBe('Bookmark "Reset"');
    expect(reportMeasureLabel(report.measures[0]!)).toBe("[Net Margin] (report)");
    expect(pageFilterLabel(page)).toBe('Page filter on "Overview"');
  });
  it("build findings with the object id, a line from the pointer, and the object for the ignore check", () => {
    const page = report.pages[0]!;
    const v = page.visuals[0]!;
    expect(reportFinding.visual(v, "/position/y", "why")).toEqual({
      objectType: "Visual",
      objectName: '"Top products" on "Overview"',
      objectId: "9f2e4c1a0000",
      location: { file: "definition/pages/p1/visuals/9f2e4c1a0000/visual.json", line: 5 },
      detail: "why",
      object: v,
    });
    expect(reportFinding.page(page)).toMatchObject({ objectType: "Page", objectId: "p1", location: { file: "definition/pages/p1/page.json", line: 1 } });
    expect(reportFinding.report(report)).toMatchObject({ objectType: "Report", objectName: "Report", objectId: "report" });
    expect(reportFinding.report(report, "unused", "ChicletSlicer")).toMatchObject({ objectId: "ChicletSlicer", detail: "unused" });
    expect(reportFinding.bookmark(report.bookmarks[0]!)).toMatchObject({ objectType: "Bookmark", objectId: "b1" });
    expect(reportFinding.reportMeasure(report.measures[0]!)).toMatchObject({ objectType: "ReportMeasure", objectId: "Sales.Net Margin", location: { file: "definition/reportExtensions.json" } });
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run packages/core/test/pbir-build.test.ts packages/core/test/pbir-names.test.ts`
Expected: FAIL, modules not found.

- [ ] **Step 3: Implement the builder**

Create `packages/core/src/pbir/build.ts`:

```ts
import type { LintFile } from "../engine/lint.js";
import type { Diagnostic } from "../project/types.js";
import { lineOfPointer, newerThan, readJson, schemaFamilyOf } from "./json.js";
import { collectFieldRefs, escapePointer } from "./refs.js";
import type {
  Bookmark,
  DatasetReference,
  Page,
  Report,
  ReportFilter,
  ReportMeasure,
  Visual,
  VisualAction,
  VisualField,
} from "./types.js";

/**
 * The newest schema version of each family this reader was written against. A file on a newer
 * one still parses (unknown properties are ignored); it is a diagnostic so nobody mistakes what
 * pbiplint could not know for clean.
 */
export const KNOWN_SCHEMAS: Readonly<Record<string, string>> = {
  report: "3.3.0",
  page: "2.3.1",
  visualContainer: "2.8.0",
  pagesMetadata: "1.1.0",
  bookmark: "1.0.0",
  reportExtension: "1.0.0",
  visualContainerMobileState: "1.4.0",
};

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);
const str = (v: unknown): string | undefined => (typeof v === "string" ? v : undefined);
const num = (v: unknown): number | undefined => (typeof v === "number" ? v : undefined);

/**
 * A formatting property's literal value with its quotes removed: `'Total Sales'` is `Total Sales`
 * (a doubled quote inside is one quote), `true` stays `true`, `18D` stays `18D`. Undefined when
 * the property is missing or is bound to an expression rather than a literal.
 */
export function literal(prop: unknown): string | undefined {
  if (!isRecord(prop) || !isRecord(prop.expr) || !isRecord(prop.expr.Literal)) return undefined;
  const v = prop.expr.Literal.Value;
  if (typeof v !== "string") return undefined;
  return v.length >= 2 && v.startsWith("'") && v.endsWith("'") ? v.slice(1, -1).replace(/''/g, "'") : v;
}

/** True when the property is an expression that is not a literal, such as a measure binding. */
const isBoundExpression = (prop: unknown): boolean =>
  isRecord(prop) && isRecord(prop.expr) && !("Literal" in prop.expr);

/** `annotations: [{ name, value }]` as the record every Ignorable carries. */
function annotationsOf(v: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  if (!Array.isArray(v)) return out;
  for (const a of v)
    if (isRecord(a) && typeof a.name === "string")
      out[a.name] = typeof a.value === "string" ? a.value : JSON.stringify(a.value ?? "");
  return out;
}

function filtersOf(filterConfig: unknown, file: string, pointer: string): ReportFilter[] {
  if (!isRecord(filterConfig) || !Array.isArray(filterConfig.filters)) return [];
  return filterConfig.filters.flatMap((f, i): ReportFilter[] => {
    if (!isRecord(f)) return [];
    const p = `${pointer}/filters/${i}`;
    const field = collectFieldRefs(f.field, `${p}/field`)[0];
    return [
      {
        name: str(f.name) ?? String(i),
        type: str(f.type),
        ...(field ? { field } : {}),
        refs: collectFieldRefs(f, p),
        applied: isRecord(f.filter),
        file,
        pointer: p,
      },
    ];
  });
}

function datasetReferenceOf(json: unknown): DatasetReference {
  const ref = isRecord(json) && isRecord(json.datasetReference) ? json.datasetReference : undefined;
  if (!ref) return { kind: "none" };
  if (isRecord(ref.byPath) && typeof ref.byPath.path === "string") return { kind: "byPath", path: ref.byPath.path };
  if (isRecord(ref.byConnection)) return { kind: "byConnection" };
  return { kind: "none" };
}

function readReportJson(report: Report, file: string, json: Record<string, unknown>, version?: string): void {
  report.file = file;
  report.schemaVersion = version;
  report.schemaVersions.report = version;
  const themes = isRecord(json.themeCollection) ? json.themeCollection : {};
  const custom = isRecord(themes.customTheme) ? str(themes.customTheme.name) : undefined;
  const base = isRecord(themes.baseTheme) ? str(themes.baseTheme.name) : undefined;
  report.themeName = custom ?? base;
  report.publicCustomVisuals = Array.isArray(json.publicCustomVisuals)
    ? json.publicCustomVisuals.filter((v): v is string => typeof v === "string")
    : [];
  const pane =
    isRecord(json.objects) &&
    Array.isArray(json.objects.outspacePane) &&
    isRecord(json.objects.outspacePane[0]) &&
    isRecord(json.objects.outspacePane[0].properties)
      ? json.objects.outspacePane[0].properties
      : {};
  const bool = (v: string | undefined): boolean | undefined =>
    v === "true" ? true : v === "false" ? false : undefined;
  report.filtersPane = {
    expanded: bool(literal(pane.expanded)),
    visible: bool(literal(pane.visible)),
    hiddenInEditMode:
      isRecord(json.settings) && typeof json.settings.filterPaneHiddenInEditMode === "boolean"
        ? json.settings.filterPaneHiddenInEditMode
        : undefined,
  };
  report.filters = filtersOf(json.filterConfig, file, "/filterConfig");
  report.annotations = annotationsOf(json.annotations);
}

function buildPage(id: string, file: string, text: string, json: Record<string, unknown>, version?: string): Page {
  const binding = isRecord(json.pageBinding) ? json.pageBinding : undefined;
  return {
    id: str(json.name) ?? id,
    displayName: str(json.displayName) ?? id,
    file,
    text,
    json,
    width: num(json.width),
    height: num(json.height),
    displayOption: str(json.displayOption),
    visibility: str(json.visibility),
    bindingType: binding ? str(binding.type) : undefined,
    bindingRefs: binding ? collectFieldRefs(binding.parameters, "/pageBinding/parameters") : [],
    filters: filtersOf(json.filterConfig, file, "/filterConfig"),
    visuals: [],
    annotations: annotationsOf(json.annotations),
    schemaVersion: version,
  };
}

/** A page whose page.json is missing or unreadable, so its visuals still have a page to name. */
const stubPage = (id: string): Page => ({
  id,
  displayName: id,
  file: `definition/pages/${id}/page.json`,
  text: "",
  json: undefined,
  bindingRefs: [],
  filters: [],
  visuals: [],
  annotations: {},
});

function buildVisual(
  page: Page,
  id: string,
  file: string,
  text: string,
  json: Record<string, unknown>,
  version: string | undefined,
  hasMobileLayout: boolean,
): Visual {
  const pos = isRecord(json.position) ? json.position : {};
  const visual = isRecord(json.visual) ? json.visual : {};
  const query = isRecord(visual.query) && isRecord(visual.query.queryState) ? visual.query.queryState : {};
  const fields: VisualField[] = [];
  const showAllRoles: string[] = [];
  for (const [role, state] of Object.entries(query)) {
    if (!isRecord(state)) continue;
    if (state.showAll === true) showAllRoles.push(role);
    if (!Array.isArray(state.projections)) continue;
    state.projections.forEach((proj, i) => {
      if (!isRecord(proj)) return;
      const pointer = `/visual/query/queryState/${escapePointer(role)}/projections/${i}/field`;
      for (const ref of collectFieldRefs(proj.field, pointer)) fields.push({ role, ref });
    });
  }
  const vco = isRecord(visual.visualContainerObjects) ? visual.visualContainerObjects : {};
  const properties = (entry: unknown): Record<string, unknown> | undefined =>
    isRecord(entry) && isRecord(entry.properties) ? entry.properties : undefined;
  let altText: string | undefined;
  if (Array.isArray(vco.general))
    for (const entry of vco.general) {
      const props = properties(entry);
      if (!props || !("altText" in props)) continue;
      const value = literal(props.altText);
      if (value !== undefined && value !== "") altText = value;
      else if (isBoundExpression(props.altText)) altText = "(expression)";
    }
  const actions: VisualAction[] = [];
  if (Array.isArray(vco.visualLink))
    vco.visualLink.forEach((entry, i) => {
      const props = properties(entry);
      const type = props ? literal(props.type) : undefined;
      if (!props || type === undefined) return;
      const target =
        literal(props.navigationSection) ?? literal(props.bookmark) ?? literal(props.drillthroughSection) ?? literal(props.webUrl);
      actions.push({
        type,
        ...(target !== undefined ? { target } : {}),
        pointer: `/visual/visualContainerObjects/visualLink/${i}/properties`,
      });
    });
  const title = Array.isArray(vco.title) ? literal(properties(vco.title[0])?.text) : undefined;
  return {
    id: str(json.name) ?? id,
    page,
    file,
    text,
    json,
    type: str(visual.visualType) ?? (isRecord(json.visualGroup) ? "visualGroup" : "unknown"),
    position: {
      x: num(pos.x) ?? 0,
      y: num(pos.y) ?? 0,
      z: num(pos.z) ?? 0,
      width: num(pos.width) ?? 0,
      height: num(pos.height) ?? 0,
      ...(num(pos.tabOrder) !== undefined ? { tabOrder: num(pos.tabOrder) } : {}),
    },
    isHidden: json.isHidden === true,
    isGroup: isRecord(json.visualGroup),
    ...(str(json.parentGroupName) !== undefined ? { groupId: str(json.parentGroupName) } : {}),
    ...(title !== undefined ? { title } : {}),
    ...(altText !== undefined ? { altText } : {}),
    fields,
    showAllRoles,
    filters: filtersOf(json.filterConfig, file, "/filterConfig"),
    actions,
    hasMobileLayout,
    annotations: annotationsOf(json.annotations),
    schemaVersion: version,
  };
}

function buildBookmark(id: string, file: string, text: string, json: Record<string, unknown>): Bookmark {
  const state = isRecord(json.explorationState) ? json.explorationState : {};
  const sections = isRecord(state.sections) ? state.sections : {};
  const visuals: { page: string; visual: string }[] = [];
  for (const [page, section] of Object.entries(sections))
    if (isRecord(section) && isRecord(section.visualContainers))
      for (const visual of Object.keys(section.visualContainers)) visuals.push({ page, visual });
  return {
    id: str(json.name) ?? id,
    displayName: str(json.displayName) ?? id,
    file,
    text,
    ...(str(state.activeSection) !== undefined ? { activePage: str(state.activeSection) } : {}),
    pages: Object.keys(sections),
    visuals,
    refs: collectFieldRefs(state, "/explorationState"),
    annotations: {},
  };
}

function readExtensions(file: string, text: string, json: Record<string, unknown>): ReportMeasure[] {
  const out: ReportMeasure[] = [];
  if (!Array.isArray(json.entities)) return out;
  json.entities.forEach((entity, ei) => {
    if (!isRecord(entity) || typeof entity.name !== "string" || !Array.isArray(entity.measures)) return;
    entity.measures.forEach((m, mi) => {
      if (!isRecord(m) || typeof m.name !== "string") return;
      out.push({
        table: entity.name,
        name: m.name,
        expression: str(m.expression) ?? "",
        hidden: m.hidden === true,
        file,
        line: lineOfPointer(text, `/entities/${ei}/measures/${mi}`),
        annotations: {},
      });
    });
  });
  return out;
}

const PAGE_FILE = /^definition\/pages\/([^/]+)\/page\.json$/;
const VISUAL_FILE = /^definition\/pages\/([^/]+)\/visuals\/([^/]+)\/visual\.json$/;
const MOBILE_FILE = /^definition\/pages\/([^/]+)\/visuals\/([^/]+)\/mobile\.json$/;
const BOOKMARK_FILE = /^definition\/bookmarks\/([^/]+)\.bookmark\.json$/;

/**
 * Builds the report object model from the report's files (paths relative to the .Report folder).
 * Unknown properties are ignored, every schema version seen is read the same way, a file that
 * cannot be read is an issue and the rest still builds. Pages come out in pageOrder, then any page
 * the header does not list; visuals in file order within a page.
 */
export function buildReport(files: LintFile[]): { report: Report; diagnostics: Diagnostic[] } {
  const report: Report = {
    publicCustomVisuals: [],
    filtersPane: {},
    filters: [],
    pagesHeader: { pageOrder: [] },
    pages: [],
    bookmarksHeader: { items: [] },
    bookmarks: [],
    measures: [],
    datasetReference: { kind: "none" },
    files: [],
    issues: [],
    schemaVersions: {},
    annotations: {},
  };
  const diagnostics: Diagnostic[] = [];
  const reportedFamilies = new Set<string>();
  const pagesById = new Map<string, Page>();
  const visuals: { pageId: string; id: string; file: string; text: string; json: Record<string, unknown>; version?: string }[] = [];
  const mobile = new Set<string>();
  const highest = (current: string | undefined, seen: string | undefined): string | undefined =>
    seen === undefined ? current : current === undefined || newerThan(seen, current) ? seen : current;

  for (const f of [...files].sort((a, b) => a.path.localeCompare(b.path, "en"))) {
    report.files.push(f.path);
    const read = readJson(f.path, f.text);
    report.issues.push(...read.issues);
    if (read.json === undefined) continue;
    const family = schemaFamilyOf(read.schema);
    const version = read.schemaVersion;
    if (family && version && KNOWN_SCHEMAS[family] && newerThan(version, KNOWN_SCHEMAS[family]!) && !reportedFamilies.has(family)) {
      reportedFamilies.add(family);
      diagnostics.push({
        kind: "schema-newer-than-known",
        path: f.path,
        message: `${f.path} uses ${family} schema ${version}, newer than the ${KNOWN_SCHEMAS[family]} this version of pbiplint knows; properties it does not know are ignored`,
      });
    }
    const json = read.json;
    if (f.path.endsWith("definition.pbir")) {
      report.datasetReference = datasetReferenceOf(json);
      continue;
    }
    if (!isRecord(json)) continue;
    let m: RegExpExecArray | null;
    if (f.path.endsWith(".platform")) {
      if (isRecord(json.metadata) && json.metadata.type === "Report") report.displayName = str(json.metadata.displayName);
    } else if (f.path === "definition/report.json") {
      readReportJson(report, f.path, json, version);
    } else if (f.path === "definition/pages/pages.json") {
      report.pagesHeader = {
        file: f.path,
        pageOrder: Array.isArray(json.pageOrder) ? json.pageOrder.filter((p): p is string => typeof p === "string") : [],
        ...(str(json.activePageName) !== undefined ? { activePageName: str(json.activePageName) } : {}),
        ...(str(json.landingPageName) !== undefined ? { landingPageName: str(json.landingPageName) } : {}),
      };
    } else if ((m = PAGE_FILE.exec(f.path))) {
      const page = buildPage(m[1]!, f.path, f.text, json, version);
      pagesById.set(m[1]!, page);
      report.schemaVersions.page = highest(report.schemaVersions.page, version);
    } else if ((m = VISUAL_FILE.exec(f.path))) {
      visuals.push({ pageId: m[1]!, id: m[2]!, file: f.path, text: f.text, json, version });
      report.schemaVersions.visual = highest(report.schemaVersions.visual, version);
    } else if ((m = MOBILE_FILE.exec(f.path))) {
      mobile.add(`${m[1]}/${m[2]}`);
    } else if (f.path === "definition/bookmarks/bookmarks.json") {
      report.bookmarksHeader = {
        file: f.path,
        items: Array.isArray(json.items)
          ? json.items.flatMap((item) =>
              isRecord(item) && typeof item.name === "string"
                ? [{ name: item.name, children: Array.isArray(item.children) ? item.children.flatMap((c) => (isRecord(c) && typeof c.name === "string" ? [c.name] : [])) : [] }]
                : [],
            )
          : [],
      };
    } else if ((m = BOOKMARK_FILE.exec(f.path))) {
      report.bookmarks.push(buildBookmark(m[1]!, f.path, f.text, json));
    } else if (f.path === "definition/reportExtensions.json") {
      report.measures.push(...readExtensions(f.path, f.text, json));
    }
  }
  for (const v of visuals) {
    let page = pagesById.get(v.pageId);
    if (!page) {
      page = stubPage(v.pageId);
      pagesById.set(v.pageId, page);
    }
    page.visuals.push(buildVisual(page, v.id, v.file, v.text, v.json, v.version, mobile.has(`${v.pageId}/${v.id}`)));
  }
  const ordered = report.pagesHeader.pageOrder.flatMap((id) => (pagesById.has(id) ? [pagesById.get(id)!] : []));
  const rest = [...pagesById.keys()].filter((id) => !report.pagesHeader.pageOrder.includes(id)).sort((a, b) => a.localeCompare(b, "en"));
  report.pages = [...ordered, ...rest.map((id) => pagesById.get(id)!)];
  return { report, diagnostics };
}
```

Create `packages/core/src/pbir/names.ts`:

```ts
import type { Bookmark, Page, ReportMeasure, Visual } from "./types.js";

/** The first six characters of a report object's id, enough to find its folder. */
export const shortId = (id: string): string => id.slice(0, 6);
export const pageLabel = (p: Page): string => `Page "${p.displayName}"`;
/** `"<title>" on "<page>"` when the visual has a title, else `<type> (<id6>) on "<page>"`. */
export const visualLabel = (v: Visual): string =>
  v.title !== undefined && v.title !== ""
    ? `"${v.title}" on "${v.page.displayName}"`
    : `${v.type} (${shortId(v.id)}) on "${v.page.displayName}"`;
export const bookmarkLabel = (b: Bookmark): string => `Bookmark "${b.displayName}"`;
export const reportMeasureLabel = (m: ReportMeasure): string => `[${m.name}] (report)`;
export const pageFilterLabel = (p: Page): string => `Page filter on "${p.displayName}"`;
export const REPORT_LABEL = "Report";
export const REPORT_FILTER_LABEL = "Report filter";
```

Create `packages/core/src/rules/report-helpers.ts`:

```ts
import { lineOfPointer } from "../pbir/json.js";
import {
  bookmarkLabel,
  pageFilterLabel,
  pageLabel,
  REPORT_FILTER_LABEL,
  REPORT_LABEL,
  reportMeasureLabel,
  visualLabel,
} from "../pbir/names.js";
import type { Bookmark, Page, Report, ReportMeasure, Visual } from "../pbir/types.js";
import type { RuleFinding } from "./types.js";

const at = (file: string, text: string, pointer?: string) => ({
  file,
  line: pointer ? lineOfPointer(text, pointer) : 1,
});
const withDetail = (f: RuleFinding, detail?: string): RuleFinding =>
  detail === undefined ? f : { ...f, detail };

/** Finding factories for report objects. `objectId` is what parity compares; `object` is what the ignore check reads. */
export const reportFinding = {
  report: (r: Report, detail?: string, objectId = "report"): RuleFinding =>
    withDetail(
      {
        objectType: "Report",
        objectName: REPORT_LABEL,
        objectId,
        ...(r.file ? { location: { file: r.file, line: 1 } } : {}),
        object: r,
      },
      detail,
    ),
  page: (p: Page, pointer?: string, detail?: string): RuleFinding =>
    withDetail({ objectType: "Page", objectName: pageLabel(p), objectId: p.id, location: at(p.file, p.text, pointer), object: p }, detail),
  visual: (v: Visual, pointer?: string, detail?: string): RuleFinding =>
    withDetail({ objectType: "Visual", objectName: visualLabel(v), objectId: v.id, location: at(v.file, v.text, pointer), object: v }, detail),
  pageFilter: (p: Page, pointer: string, detail?: string): RuleFinding =>
    withDetail({ objectType: "Page", objectName: pageFilterLabel(p), objectId: p.id, location: at(p.file, p.text, pointer), object: p }, detail),
  reportFilter: (r: Report, pointer: string, detail?: string): RuleFinding =>
    withDetail({ objectType: "Report", objectName: REPORT_FILTER_LABEL, objectId: "report", location: at(r.file ?? "definition/report.json", r.text ?? "", pointer), object: r }, detail),
  bookmark: (b: Bookmark, detail?: string): RuleFinding =>
    withDetail({ objectType: "Bookmark", objectName: bookmarkLabel(b), objectId: b.id, location: { file: b.file, line: 1 }, object: b }, detail),
  reportMeasure: (m: ReportMeasure, detail?: string): RuleFinding =>
    withDetail({ objectType: "ReportMeasure", objectName: reportMeasureLabel(m), objectId: `${m.table}.${m.name}`, location: { file: m.file, line: m.line }, object: m }, detail),
};

export const allVisuals = (r: Report): Visual[] => r.pages.flatMap((p) => p.visuals);
export const isHiddenPage = (p: Page): boolean => p.visibility === "HiddenInViewMode";
export const visiblePages = (r: Report): Page[] => r.pages.filter((p) => !isHiddenPage(p));
```

`Report` gains `text?: string`: add it to the interface in `pbir/types.ts` and set `report.text = f.text` where `buildReport` reads `definition/report.json` (pass `f.text` into `readReportJson`). `reportFilter` reads it for the line.

In `packages/core/src/index.ts` add:

```ts
export { buildReport, KNOWN_SCHEMAS, literal } from "./pbir/build.js";
export { lineOfPointer, newerThan, readJson, schemaFamilyOf, schemaVersionOf } from "./pbir/json.js";
export { collectFieldRefs, escapePointer } from "./pbir/refs.js";
export { bookmarkLabel, pageFilterLabel, pageLabel, REPORT_FILTER_LABEL, REPORT_LABEL, reportMeasureLabel, shortId, visualLabel } from "./pbir/names.js";
export { allVisuals, isHiddenPage, reportFinding, visiblePages } from "./rules/report-helpers.js";
```

- [ ] **Step 4: Run the tests**

Run: `npx vitest run packages/core/test/pbir-build.test.ts packages/core/test/pbir-names.test.ts && npm run typecheck`
Expected: PASS. If the `reportExtensions.json` line assertions fail, check that the fixture text in the test keeps one measure per line exactly as written (lines 7 and 8).

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/pbir packages/core/src/rules/report-helpers.ts packages/core/src/index.ts packages/core/test/pbir-build.test.ts packages/core/test/pbir-names.test.ts
git commit -m "feat(core): report object model from PBIR files, with finding names and factories"
```

---
### Task 6: The report reference index and the reachability index

**Files:**
- Create: `packages/core/src/index/report-refs.ts`
- Create: `packages/core/src/index/reachability.ts`
- Modify: `packages/core/src/index/build.ts`
- Modify: `packages/core/src/index.ts`
- Test: `packages/core/test/report-refs.test.ts`, `packages/core/test/reachability.test.ts`, `packages/core/test/indexes.test.ts` (one assertion on the new shape)

**Interfaces:**
- Produces, `packages/core/src/index/report-refs.ts`:

```ts
export type ReportRefOwnerKind = "visualField" | "visualFilter" | "pageFilter" | "pageBinding" | "reportFilter" | "bookmark" | "reportMeasure";
export interface ReportRefOwner { kind: ReportRefOwnerKind; object: Visual | Page | Report | Bookmark | ReportMeasure; role?: string }
export type Resolution =
  | { kind: "column"; column: Column }
  | { kind: "measure"; measure: Measure }
  | { kind: "reportMeasure"; measure: ReportMeasure }
  | { kind: "hierarchy"; hierarchy: Hierarchy; level?: Level }
  | { kind: "unresolved"; reason: string };
export interface ReportRef { ref: FieldRef; owner: ReportRefOwner; file: string; resolution: Resolution }
export interface ReportReferenceIndex {
  refs: ReportRef[];
  referencedBy(target: Column | Measure): ReportRef[];
  unresolved(): ReportRef[];
  fieldsOf(v: Visual): ReportRef[];
}
export function buildReportReferenceIndex(report: Report, model: Model | undefined): ReportReferenceIndex
```

- Produces, `packages/core/src/index/reachability.ts`:

```ts
export interface ReachabilityIndex {
  reached(object: Table | Column | Measure): boolean;
  /** Names from a root to the object, root first; empty when unreached. */
  pathTo(object: Table | Column | Measure): string[];
  /** Unreached objects in model order; a table is listed when every column and measure on it is unreached. */
  unreached(): { tables: Table[]; columns: Column[]; measures: Measure[] };
  /** Why an unreached column or measure is unreached, as the finding's detail. */
  reasonFor(object: Column | Measure): string;
}
export function buildReachabilityIndex(model: Model, references: ReferenceIndex, reportRefs: ReportReferenceIndex): ReachabilityIndex
```

- Produces, `packages/core/src/index/build.ts`: `Indexes { relationships; usage; references; reportRefs?: ReportReferenceIndex; reachability?: ReachabilityIndex }` and `buildIndexes(project: Project): Indexes` (model indexes are built from the empty model when the model is absent; `reportRefs` exists when a report is present; `reachability` when both are).
- Consumes: `extractRefs`, `ReferenceIndex` (v1), `Report` (Task 5), `Project` (Task 1).

- [ ] **Step 1: Write the failing tests**

Create `packages/core/test/report-refs.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { buildReportReferenceIndex } from "../src/index/report-refs.js";
import { buildReport } from "../src/pbir/build.js";
import { modelFrom } from "./helpers.js";

const j = (v: unknown) => JSON.stringify(v);
const column = (entity: string, property: string) => ({ Column: { Expression: { SourceRef: { Entity: entity } }, Property: property } });
const measure = (entity: string, property: string) => ({ Measure: { Expression: { SourceRef: { Entity: entity } }, Property: property } });

const model = modelFrom(`table Sales
	column Amount
		dataType: decimal
	column Region
		dataType: string
	measure 'Total Sales' = SUM('Sales'[Amount])
	hierarchy Geography
		level Region
			column: Region

table Product
	column Category
		dataType: string
	measure 'Product Count' = COUNTROWS(Product)
`);

const { report } = buildReport([
  { path: "definition/report.json", text: j({ filterConfig: { filters: [{ name: "rf", field: column("Product", "Category"), type: "Categorical" }] } }) },
  { path: "definition/pages/p1/page.json", text: j({ name: "p1", displayName: "Overview", filterConfig: { filters: [{ name: "pf", field: column("Customer", "Segment"), type: "Categorical" }] } }) },
  {
    path: "definition/pages/p1/visuals/v1/visual.json",
    text: j({
      name: "v1",
      position: {},
      filterConfig: { filters: [{ name: "vf", field: column("Sales", "Nope"), type: "Categorical" }] },
      visual: {
        visualType: "clusteredBarChart",
        query: {
          queryState: {
            Category: { projections: [{ field: column("Sales", "Region") }, { field: { HierarchyLevel: { Expression: { Hierarchy: { Expression: { SourceRef: { Entity: "Sales" } }, Hierarchy: "Geography" } }, Level: "Region" } } }] },
            Y: { projections: [{ field: measure("Sales", "Total Sales") }, { field: measure("Sales", "Net Margin") }, { field: measure("Product", "Total Sales") }, { field: measure("Sales", "Profit") }] },
          },
        },
      },
    }),
  },
  { path: "definition/bookmarks/b1.bookmark.json", text: j({ name: "b1", displayName: "B", explorationState: { activeSection: "p1", sections: { p1: { visualContainers: { v1: { filters: { byExpr: [{ expression: column("Sales", "Amount") }] } } } } } } }) },
  { path: "definition/reportExtensions.json", text: j({ entities: [{ name: "Sales", measures: [{ name: "Net Margin", expression: "[Total Sales] - SUM('Sales'[Amount]) + [Missing]" }] }] }) },
]);

describe("buildReportReferenceIndex", () => {
  const index = buildReportReferenceIndex(report, model);
  it("resolves visual fields, filters, bookmarks, and report measures against the model", () => {
    const v1 = report.pages[0]!.visuals[0]!;
    expect(index.fieldsOf(v1).map((r) => [r.owner.role, r.resolution.kind])).toEqual([
      ["Category", "column"],
      ["Category", "hierarchy"],
      ["Y", "measure"],
      ["Y", "reportMeasure"],
      ["Y", "unresolved"],
      ["Y", "unresolved"],
    ]);
    const amount = model.tables[0]!.columns[0]!;
    expect(index.referencedBy(amount).map((r) => r.owner.kind)).toEqual(["bookmark", "reportMeasure"]);
    const total = model.tables[0]!.measures[0]!;
    expect(index.referencedBy(total).map((r) => r.owner.kind)).toEqual(["visualField", "reportMeasure"]);
  });
  it("says why each unresolved reference is unresolved", () => {
    expect(index.unresolved().map((r) => [r.owner.kind, r.resolution.kind === "unresolved" ? r.resolution.reason : ""])).toEqual([
      ["pageFilter", 'no table named "Customer"'],
      ["visualField", '[Total Sales] is on "Sales", not "Product"'],
      ["visualField", 'no measure named "Profit" on "Sales"'],
      ["visualFilter", 'no column named "Nope" on "Sales"'],
      ["reportMeasure", 'no measure or column named "Missing"'],
    ]);
  });
  it("marks everything unresolved with one reason when there is no model, except report measures", () => {
    const without = buildReportReferenceIndex(report, undefined);
    const kinds = new Set(without.refs.map((r) => r.resolution.kind));
    expect([...kinds].sort()).toEqual(["reportMeasure", "unresolved"]);
    expect(without.unresolved()[0]!.resolution).toEqual({ kind: "unresolved", reason: "no model in the input" });
  });
});
```

Create `packages/core/test/reachability.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { buildIndexes } from "../src/index/build.js";
import { buildReport } from "../src/pbir/build.js";
import type { Column, Measure } from "../src/model/types.js";
import { modelFrom } from "./helpers.js";

const j = (v: unknown) => JSON.stringify(v);
const column = (entity: string, property: string) => ({ Column: { Expression: { SourceRef: { Entity: entity } }, Property: property } });
const measure = (entity: string, property: string) => ({ Measure: { Expression: { SourceRef: { Entity: entity } }, Property: property } });
const visualBinding = (...fields: unknown[]) => [
  { path: "definition/pages/p1/page.json", text: j({ name: "p1", displayName: "P" }) },
  { path: "definition/pages/p1/visuals/v1/visual.json", text: j({ name: "v1", position: {}, visual: { visualType: "tableEx", query: { queryState: { Values: { projections: fields.map((field) => ({ field })) } } } } }) },
];
const tmdl = `table Sales
	column Amount
		dataType: decimal
	column 'Product ID'
		dataType: int64
	column 'Month Name'
		dataType: string
		sortByColumn: 'Month Number'
	column 'Month Number'
		dataType: int64
	column Lonely
		dataType: string
	measure 'Total Sales' = SUM('Sales'[Amount])
	measure 'Sales LY' = CALCULATE([Total Sales], SAMEPERIODLASTYEAR('Date'[Date]))
	measure 'Sales YoY %' = ([Total Sales] - [Sales LY]) / [Sales LY]
	measure 'Loop A' = [Loop B] + 1
	measure 'Loop B' = [Loop A] + 1

table Product
	column 'Product ID'
		dataType: int64
	column Category
		dataType: string

table Date
	column Date
		dataType: dateTime

table Region
	column Name
		dataType: string

relationship Sales-Product
	fromColumn: Sales.'Product ID'
	toColumn: Product.'Product ID'

role Readers
	tablePermission Region = Region[Name] = "West"
`;
const model = modelFrom(tmdl);
const col = (table: string, name: string): Column => model.tables.find((t) => t.name === table)!.columns.find((c) => c.name === name)!;
const meas = (name: string): Measure => model.tables[0]!.measures.find((m) => m.name === name)!;

describe("buildReachabilityIndex", () => {
  it("walks from the report's fields through DAX, sort-by, relationships, and RLS to a fixed point", () => {
    const { report } = buildReport(visualBinding(column("Sales", "Month Name"), measure("Sales", "Total Sales")));
    const reach = buildIndexes({ model, report }).reachability!;
    expect(reach.reached(col("Sales", "Month Name"))).toBe(true);
    expect(reach.reached(col("Sales", "Month Number"))).toBe(true);
    expect(reach.pathTo(col("Sales", "Month Number"))).toEqual(["'Sales'[Month Name]", "'Sales'[Month Number]"]);
    expect(reach.reached(col("Sales", "Amount"))).toBe(true);
    expect(reach.pathTo(col("Sales", "Amount"))).toEqual(["[Total Sales]", "'Sales'[Amount]"]);
    expect(reach.reached(col("Sales", "Product ID"))).toBe(true);
    expect(reach.reached(col("Product", "Product ID"))).toBe(true);
    expect(reach.reached(col("Region", "Name"))).toBe(true);
    expect(reach.reached(model.tables.find((t) => t.name === "Region")!)).toBe(true);
    expect(reach.reached(col("Sales", "Lonely"))).toBe(false);
    expect(reach.reached(meas("Sales LY"))).toBe(false);
    expect(reach.reached(col("Date", "Date"))).toBe(false);
  });
  it("lists the unreached set with a reason that reads the dead chain top-down, and survives a cycle", () => {
    const { report } = buildReport(visualBinding(measure("Sales", "Total Sales")));
    const reach = buildIndexes({ model, report }).reachability!;
    const u = reach.unreached();
    expect(u.measures.map((m) => m.name)).toEqual(["Sales LY", "Sales YoY %", "Loop A", "Loop B"]);
    expect(u.columns.map((c) => `${c.table.name}.${c.name}`)).toEqual(["Sales.Month Name", "Sales.Month Number", "Sales.Lonely", "Product.Category", "Date.Date"]);
    expect(u.tables.map((t) => t.name)).toEqual(["Date"]);
    expect(reach.reasonFor(meas("Sales YoY %"))).toBe("nothing in the report reaches it, and no measure or column references it");
    expect(reach.reasonFor(meas("Sales LY"))).toBe("referenced only by [Sales YoY %], which nothing reaches either");
    expect(reach.reasonFor(meas("Loop A"))).toBe("referenced only by [Loop B], which nothing reaches either");
    expect(reach.reasonFor(col("Sales", "Month Number"))).toBe("referenced only by 'Sales'[Month Name], which nothing reaches either");
  });
  it("is absent in a report-only or model-only project", () => {
    const { report } = buildReport(visualBinding(column("Sales", "Amount")));
    expect(buildIndexes({ report }).reachability).toBeUndefined();
    expect(buildIndexes({ report }).reportRefs).toBeDefined();
    expect(buildIndexes({ model }).reachability).toBeUndefined();
    expect(buildIndexes({ model }).reportRefs).toBeUndefined();
  });
});
```

In `packages/core/test/indexes.test.ts`, change every `buildIndexes(zoo)` call to `buildIndexes({ model: zoo })` (and any other model argument the same way).

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run packages/core/test/report-refs.test.ts packages/core/test/reachability.test.ts packages/core/test/indexes.test.ts`
Expected: FAIL, modules and the new `buildIndexes` shape missing.

- [ ] **Step 3: Implement the report reference index**

Create `packages/core/src/index/report-refs.ts`:

```ts
import type { Column, Hierarchy, Level, Measure, Model, Table } from "../model/types.js";
import type { Bookmark, FieldRef, Page, Report, ReportMeasure, Visual } from "../pbir/types.js";
import { extractRefs } from "./references.js";

export type ReportRefOwnerKind =
  | "visualField"
  | "visualFilter"
  | "pageFilter"
  | "pageBinding"
  | "reportFilter"
  | "bookmark"
  | "reportMeasure";

export interface ReportRefOwner {
  kind: ReportRefOwnerKind;
  object: Visual | Page | Report | Bookmark | ReportMeasure;
  /** The visual role for a `visualField` owner. */
  role?: string;
}

export type Resolution =
  | { kind: "column"; column: Column }
  | { kind: "measure"; measure: Measure }
  | { kind: "reportMeasure"; measure: ReportMeasure }
  | { kind: "hierarchy"; hierarchy: Hierarchy; level?: Level }
  | { kind: "unresolved"; reason: string };

export interface ReportRef {
  ref: FieldRef;
  owner: ReportRefOwner;
  file: string;
  resolution: Resolution;
}

export interface ReportReferenceIndex {
  refs: ReportRef[];
  /** Report references that resolve to this model column or measure. */
  referencedBy(target: Column | Measure): ReportRef[];
  unresolved(): ReportRef[];
  /** The references a visual's roles bind, in role order. */
  fieldsOf(v: Visual): ReportRef[];
}

const lower = (s: string): string => s.toLowerCase();
const q = (s: string): string => `"${s}"`;

/**
 * Every field reference in the report with what it resolves to. Resolution is by name without
 * regard to case, the way the model's own reference index resolves DAX. A measure is looked up on
 * the table the reference names, then among the report's own measures, and a measure that lives
 * on another table is reported as such, since Desktop breaks the visual the same way when a
 * measure moves. Without a model, everything but a report measure is unresolved with one reason.
 */
export function buildReportReferenceIndex(report: Report, model: Model | undefined): ReportReferenceIndex {
  const tables = new Map<string, Table>((model?.tables ?? []).map((t) => [lower(t.name), t]));
  const measuresByName = new Map<string, Measure>();
  for (const t of model?.tables ?? []) for (const m of t.measures) measuresByName.set(lower(m.name), m);
  const reportMeasures = new Map<string, ReportMeasure>(report.measures.map((m) => [`${lower(m.table)}\u0000${lower(m.name)}`, m]));
  const reportMeasuresByName = new Map<string, ReportMeasure>(report.measures.map((m) => [lower(m.name), m]));
  const columnOf = (t: Table, name: string): Column | undefined => t.columns.find((c) => lower(c.name) === lower(name));
  const measureOf = (t: Table, name: string): Measure | undefined => t.measures.find((m) => lower(m.name) === lower(name));

  const resolve = (ref: FieldRef): Resolution => {
    const extension = reportMeasures.get(`${lower(ref.table)}\u0000${lower(ref.name)}`);
    if (ref.kind === "measure" && extension) return { kind: "reportMeasure", measure: extension };
    if (!model) return { kind: "unresolved", reason: "no model in the input" };
    if (ref.table === "") return { kind: "unresolved", reason: "a filter alias that no From list declares" };
    const t = tables.get(lower(ref.table));
    if (!t) return { kind: "unresolved", reason: `no table named ${q(ref.table)}` };
    if (ref.kind === "column" || ref.kind === "aggregation") {
      const c = columnOf(t, ref.name);
      if (c) return { kind: "column", column: c };
      if (measureOf(t, ref.name)) return { kind: "unresolved", reason: `${q(ref.name)} is a measure on ${q(t.name)}, not a column` };
      return { kind: "unresolved", reason: `no column named ${q(ref.name)} on ${q(t.name)}` };
    }
    if (ref.kind === "measure") {
      const m = measureOf(t, ref.name);
      if (m) return { kind: "measure", measure: m };
      const elsewhere = measuresByName.get(lower(ref.name));
      if (elsewhere) return { kind: "unresolved", reason: `[${elsewhere.name}] is on ${q(elsewhere.table.name)}, not ${q(t.name)}` };
      return { kind: "unresolved", reason: `no measure named ${q(ref.name)} on ${q(t.name)}` };
    }
    const h = t.hierarchies.find((x) => lower(x.name) === lower(ref.name));
    if (!h) return { kind: "unresolved", reason: `no hierarchy named ${q(ref.name)} on ${q(t.name)}` };
    if (ref.level === undefined) return { kind: "hierarchy", hierarchy: h };
    const level = h.levels.find((l) => lower(l.name) === lower(ref.level!));
    if (!level) return { kind: "unresolved", reason: `no level named ${q(ref.level)} in hierarchy ${q(h.name)} on ${q(t.name)}` };
    return { kind: "hierarchy", hierarchy: h, level };
  };

  const refs: ReportRef[] = [];
  const add = (owner: ReportRefOwner, file: string, list: FieldRef[]): void => {
    for (const ref of list) refs.push({ ref, owner, file, resolution: resolve(ref) });
  };
  add({ kind: "reportFilter", object: report }, report.file ?? "definition/report.json", report.filters.flatMap((f) => f.refs));
  for (const page of report.pages) {
    add({ kind: "pageFilter", object: page }, page.file, page.filters.flatMap((f) => f.refs));
    add({ kind: "pageBinding", object: page }, page.file, page.bindingRefs);
    for (const v of page.visuals) {
      for (const field of v.fields) add({ kind: "visualField", object: v, role: field.role }, v.file, [field.ref]);
      add({ kind: "visualFilter", object: v }, v.file, v.filters.flatMap((f) => f.refs));
    }
  }
  for (const b of report.bookmarks) add({ kind: "bookmark", object: b }, b.file, b.refs);
  // A report measure's DAX is read the way a model measure's is: a bare [X] is a measure anywhere
  // in the model or the report, else a column on the measure's own table.
  for (const m of report.measures) {
    const owner: ReportRefOwner = { kind: "reportMeasure", object: m };
    for (const raw of extractRefs(m.expression)) {
      if (raw.qualified) {
        const t = tables.get(lower(raw.table!));
        const kind = t && measureOf(t, raw.name) ? "measure" : "column";
        add(owner, m.file, [{ kind, table: raw.table!, name: raw.name, pointer: "" }]);
        continue;
      }
      const modelMeasure = measuresByName.get(lower(raw.name));
      const extension = reportMeasuresByName.get(lower(raw.name));
      if (modelMeasure) add(owner, m.file, [{ kind: "measure", table: modelMeasure.table.name, name: modelMeasure.name, pointer: "" }]);
      else if (extension) add(owner, m.file, [{ kind: "measure", table: extension.table, name: extension.name, pointer: "" }]);
      else {
        const own = tables.get(lower(m.table));
        if (own && columnOf(own, raw.name)) add(owner, m.file, [{ kind: "column", table: own.name, name: raw.name, pointer: "" }]);
        else refs.push({ ref: { kind: "measure", table: m.table, name: raw.name, pointer: "" }, owner, file: m.file, resolution: { kind: "unresolved", reason: `no measure or column named ${q(raw.name)}` } });
      }
    }
  }

  const byTarget = new Map<object, ReportRef[]>();
  for (const r of refs) {
    const target = r.resolution.kind === "column" ? r.resolution.column : r.resolution.kind === "measure" ? r.resolution.measure : undefined;
    if (!target) continue;
    const arr = byTarget.get(target) ?? [];
    arr.push(r);
    byTarget.set(target, arr);
  }
  return {
    refs,
    referencedBy: (target) => byTarget.get(target) ?? [],
    unresolved: () => refs.filter((r) => r.resolution.kind === "unresolved"),
    fieldsOf: (v) => refs.filter((r) => r.owner.kind === "visualField" && r.owner.object === v),
  };
}
```

Create `packages/core/src/index/reachability.ts`:

```ts
import { columnRef, measureRef, tableRef } from "../model/names.js";
import type { Column, Measure, Model, Table } from "../model/types.js";
import type { ReferenceIndex } from "./references.js";
import type { ReportReferenceIndex } from "./report-refs.js";

type Node = Table | Column | Measure;

export interface ReachabilityIndex {
  reached(object: Node): boolean;
  pathTo(object: Node): string[];
  unreached(): { tables: Table[]; columns: Column[]; measures: Measure[] };
  reasonFor(object: Column | Measure): string;
}

const isTable = (n: Node): n is Table => "columns" in n;
const isMeasure = (n: Node): n is Measure => "expression" in n && !("kind" in n);
const nameOf = (n: Node): string =>
  isTable(n) ? tableRef(n.name) : isMeasure(n) ? measureRef(n.name) : columnRef(n.table.name, n.name);

/**
 * What the report reaches in the model, to a fixed point (spec section 6). Roots: every resolved
 * report reference, both columns of every relationship, columns named in RLS and OLS, variation
 * default columns, and the references of the report's own measures. From a reached object: a
 * measure reaches what its DAX references; a calculated column likewise; a column reaches its
 * table, its sort-by column, and, on a calculated table, the table's expression references; a
 * calculation group table reaches its items' references. The path kept for each object is the
 * shortest, so a finding's detail can say what reached it or why nothing did.
 */
export function buildReachabilityIndex(
  model: Model,
  references: ReferenceIndex,
  reportRefs: ReportReferenceIndex,
): ReachabilityIndex {
  const tables = new Map(model.tables.map((t) => [t.name.toLowerCase(), t]));
  const columnOf = (table: string, name: string): Column | undefined =>
    tables.get(table.toLowerCase())?.columns.find((c) => c.name.toLowerCase() === name.toLowerCase());
  const measureOf = (table: string, name: string): Measure | undefined =>
    tables.get(table.toLowerCase())?.measures.find((m) => m.name.toLowerCase() === name.toLowerCase());
  const parent = new Map<Node, Node | null>();
  const queue: Node[] = [];
  const reach = (n: Node | undefined, from: Node | null): void => {
    if (!n || parent.has(n)) return;
    parent.set(n, from);
    queue.push(n);
  };
  const reachDax = (owner: object, from: Node): void => {
    for (const r of references.refsOf(owner)) {
      if (r.kind === "column") reach(columnOf(r.table!, r.name), from);
      else if (r.kind === "measure") reach(measureOf(r.table!, r.name), from);
    }
  };

  for (const r of reportRefs.refs) {
    const res = r.resolution;
    if (res.kind === "column") reach(res.column, null);
    else if (res.kind === "measure") reach(res.measure, null);
    else if (res.kind === "hierarchy")
      for (const level of res.level ? [res.level] : res.hierarchy.levels)
        if (level.column !== undefined) reach(columnOf(res.hierarchy.table.name, level.column), null);
  }
  for (const rel of model.relationships) {
    reach(columnOf(rel.fromTable, rel.fromColumn), null);
    reach(columnOf(rel.toTable, rel.toColumn), null);
  }
  for (const role of model.roles)
    for (const tp of role.tablePermissions) {
      for (const r of references.refsOf(tp)) if (r.kind === "column") reach(columnOf(r.table!, r.name), null);
      for (const cp of tp.columnPermissions) reach(columnOf(tp.table, cp.column), null);
    }
  for (const t of model.tables)
    for (const c of t.columns)
      for (const v of c.variations) if (v.defaultColumn) reach(columnOf(v.defaultColumn.table, v.defaultColumn.column), null);

  while (queue.length) {
    const n = queue.shift()!;
    if (isTable(n)) {
      if (n.kind === "calculated") reachDax(n, n);
      for (const item of n.calculationGroup?.items ?? []) reachDax(item, n);
      continue;
    }
    if (isMeasure(n)) {
      reach(n.table, n);
      reachDax(n, n);
      continue;
    }
    reach(n.table, n);
    if (n.kind === "calculated") reachDax(n, n);
    if (n.sortByColumn !== undefined) reach(columnOf(n.table.name, n.sortByColumn), n);
  }

  const referrersOf = (n: Column | Measure): Node[] =>
    (isMeasure(n) ? references.measureReferencedBy(n) : references.columnReferencedBy(n)).map((o) => o.object as Node);
  return {
    reached: (n) => parent.has(n),
    pathTo: (n) => {
      if (!parent.has(n)) return [];
      const path: string[] = [];
      for (let cur: Node | null = n; cur; cur = parent.get(cur) ?? null) path.unshift(nameOf(cur));
      return path;
    },
    unreached: () => {
      const columns = model.tables.flatMap((t) => t.columns.filter((c) => !parent.has(c)));
      const measures = model.tables.flatMap((t) => t.measures.filter((m) => !parent.has(m)));
      const tables = model.tables.filter(
        (t) => (t.columns.length > 0 || t.measures.length > 0) && !parent.has(t),
      );
      return { tables, columns, measures };
    },
    reasonFor: (n) => {
      const referrers = referrersOf(n).filter((r) => r !== n);
      if (referrers.length === 0) return "nothing in the report reaches it, and no measure or column references it";
      return `referenced only by ${referrers.map(nameOf).join(", ")}, which nothing reaches either`;
    },
  };
}
```

Replace `packages/core/src/index/build.ts`:

```ts
import { buildModel } from "../model/build.js";
import type { Project } from "../project/types.js";
import { buildReachabilityIndex, type ReachabilityIndex } from "./reachability.js";
import { buildReferenceIndex, type ReferenceIndex } from "./references.js";
import { buildRelationshipIndex, type RelationshipIndex } from "./relationships.js";
import { buildReportReferenceIndex, type ReportReferenceIndex } from "./report-refs.js";
import { buildUsageIndex, type UsageIndex } from "./usage.js";

export interface Indexes {
  relationships: RelationshipIndex;
  usage: UsageIndex;
  references: ReferenceIndex;
  /** Present when the project has a report. */
  reportRefs?: ReportReferenceIndex;
  /** Present when the project has both parts. */
  reachability?: ReachabilityIndex;
}

/** Built once per run. The model indexes come from the empty model when the layer is absent, so a model rule can always read them (it is skipped anyway). */
export function buildIndexes(project: Project): Indexes {
  const model = project.model ?? buildModel([]);
  const references = buildReferenceIndex(model);
  const indexes: Indexes = {
    relationships: buildRelationshipIndex(model),
    usage: buildUsageIndex(model),
    references,
  };
  if (project.report) {
    indexes.reportRefs = buildReportReferenceIndex(project.report, project.model);
    if (project.model) indexes.reachability = buildReachabilityIndex(project.model, references, indexes.reportRefs);
  }
  return indexes;
}
```

Add to `packages/core/src/index.ts`: `export { buildReportReferenceIndex, type ReportRef, type ReportRefOwner, type ReportRefOwnerKind, type ReportReferenceIndex, type Resolution } from "./index/report-refs.js";` and `export { buildReachabilityIndex, type ReachabilityIndex } from "./index/reachability.js";`. In `packages/core/src/engine/lint.ts`, `buildIndexes(project)`.

- [ ] **Step 4: Run the tests**

Run: `npx vitest run packages/core/test/report-refs.test.ts packages/core/test/reachability.test.ts packages/core/test/indexes.test.ts && npm run typecheck`
Expected: PASS. If `isMeasure` misclassifies a calculated column (both have `expression`), the `kind` test above is what tells them apart: a `Column` always has `kind`, a `Measure` never does.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/index packages/core/src/index.ts packages/core/src/engine/lint.ts packages/core/test/report-refs.test.ts packages/core/test/reachability.test.ts packages/core/test/indexes.test.ts
git commit -m "feat(core): report reference index and reachability index over both layers"
```

---

### Task 7: Facts: what the report will do

**Files:**
- Create: `packages/core/src/project/facts.ts`
- Modify: `packages/core/src/index.ts`
- Test: `packages/core/test/facts.test.ts`

**Interfaces:**
- Produces: `buildFacts(project: Project, indexes: Indexes, knownRules: ReadonlySet<string>): Fact[]`. A fact's `ruleId` is set only when the rule id is in `knownRules`, so a run with a rule set that lacks the rule shows the fact without a link.
- Consumes: `Report`, `Indexes` (Task 6), `Fact` (Task 1).

- [ ] **Step 1: Write the failing test**

Create `packages/core/test/facts.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { buildIndexes } from "../src/index/build.js";
import { buildReport } from "../src/pbir/build.js";
import { buildFacts } from "../src/project/facts.js";
import { modelFrom } from "./helpers.js";

const j = (v: unknown) => JSON.stringify(v);
const column = (entity: string, property: string) => ({ Column: { Expression: { SourceRef: { Entity: entity } }, Property: property } });
const lit = (value: string) => ({ expr: { Literal: { Value: value } } });
const page = (name: string, displayName: string, extra: Record<string, unknown> = {}) => ({ path: `definition/pages/${name}/page.json`, text: j({ $schema: "https://x/page/2.1.0/schema.json", name, displayName, width: 1280, height: 720, ...extra }) });
const visual = (pageId: string, name: string, type: string, extra: Record<string, unknown> = {}, fields: unknown[] = []) => ({
  path: `definition/pages/${pageId}/visuals/${name}/visual.json`,
  text: j({ $schema: "https://x/visualContainer/2.8.0/schema.json", name, position: {}, ...extra, visual: { visualType: type, query: { queryState: { Values: { projections: fields.map((field) => ({ field })) } } } } }),
});
const ALL = new Set(["LANDING_PAGE_NOT_SET", "OPENING_PAGE_INVALID", "FILTERS_PANE_STATE", "HIDE_TOOLTIP_DRILLTROUGH_PAGES", "HIDDEN_VISUALS_STILL_QUERY", "REMOVE_UNUSED_CUSTOM_VISUALS", "REPORT_LEVEL_MEASURES", "SLICER_SELECTION_SAVED", "NOT_REACHED_FROM_REPORT"]);
const model = modelFrom("table Sales\n\tcolumn Amount\n\t\tdataType: decimal\n\tcolumn Region\n\t\tdataType: string\n\tmeasure Total = SUM('Sales'[Amount])\n\tmeasure Other = 1\n");

const files = [
  { path: "definition/report.json", text: j({ $schema: "https://x/report/3.2.0/schema.json", objects: { outspacePane: [{ properties: { expanded: lit("true") } }] }, publicCustomVisuals: ["ChicletSlicer1448559807354", "Used123"] }) },
  { path: "definition/pages/pages.json", text: j({ pageOrder: ["p1", "p2", "p3"], activePageName: "p1" }) },
  page("p1", "Overview"),
  page("p2", "Tips", { pageBinding: { type: "Tooltip" } }),
  page("p3", "Scratch", { visibility: "HiddenInViewMode" }),
  visual("p1", "v1", "slicer", { filterConfig: { filters: [{ name: "f", field: column("Sales", "Region"), type: "Categorical", filter: { Where: [] } }] } }, [column("Sales", "Region")]),
  visual("p1", "v2", "slicer", {}, [column("Sales", "Region")]),
  visual("p1", "v3", "cardVisual", { isHidden: true }, [{ Measure: { Expression: { SourceRef: { Entity: "Sales" } }, Property: "Total" } }]),
  visual("p1", "v4", "Used123"),
  { path: "definition/pages/p1/visuals/v4/mobile.json", text: j({ position: {} }) },
  { path: "definition/reportExtensions.json", text: j({ entities: [{ name: "Sales", measures: [{ name: "M1", expression: "1" }, { name: "M2", expression: "2" }] }] }) },
];

describe("buildFacts", () => {
  it("states what the report will do, with a rule id where a known rule checks the fact", () => {
    const { report } = buildReport(files);
    const project = { model, report };
    expect(buildFacts(project, buildIndexes(project), ALL)).toEqual([
      { layer: "report", label: "Opens on", value: "Overview", detail: "the page open when it was saved; no landing page set", ruleId: "LANDING_PAGE_NOT_SET" },
      { layer: "report", label: "Filters pane", value: "open", ruleId: "FILTERS_PANE_STATE" },
      { layer: "report", label: "Pages", value: "3", detail: "1 hidden, 1 tooltip", ruleId: "HIDE_TOOLTIP_DRILLTROUGH_PAGES" },
      { layer: "report", label: "Visuals", value: "4", detail: "1 hidden; 2 custom visual types registered, 1 used", ruleId: "HIDDEN_VISUALS_STILL_QUERY" },
      { layer: "report", label: "Report measures", value: "2", detail: "defined in the report, not the model", ruleId: "REPORT_LEVEL_MEASURES" },
      { layer: "report", label: "Slicers", value: "2", detail: "1 with a saved selection", ruleId: "SLICER_SELECTION_SAVED" },
      { layer: "report", label: "Mobile layouts", value: "1 of 3 pages" },
      { layer: "report", label: "Schema versions", value: "report 3.2.0, page 2.1.0, visual 2.8.0" },
      { layer: "model", label: "Model", value: "1 table, 2 columns, 2 measures", detail: "0 columns and 1 measure not reached from this report", ruleId: "NOT_REACHED_FROM_REPORT" },
    ]);
  });
  it("names a landing page, a hidden or missing opening page, a closed or hidden pane, and drops rule ids the run lacks", () => {
    const { report } = buildReport([
      { path: "definition/report.json", text: j({ objects: { outspacePane: [{ properties: { visible: lit("false") } }] } }) },
      { path: "definition/pages/pages.json", text: j({ pageOrder: ["p3"], activePageName: "p3", landingPageName: "gone" }) },
      page("p3", "Scratch", { visibility: "HiddenInViewMode" }),
    ]);
    const facts = buildFacts({ report }, buildIndexes({ report }), new Set());
    expect(facts[0]).toEqual({ layer: "report", label: "Opens on", value: '"gone" (no such page)', detail: "landing page" });
    expect(facts[1]).toEqual({ layer: "report", label: "Filters pane", value: "hidden from readers" });
    expect(facts.find((f) => f.label === "Model")).toBeUndefined();
    const closed = buildReport([{ path: "definition/report.json", text: j({}) }, { path: "definition/pages/pages.json", text: j({ pageOrder: ["p3"], activePageName: "p3" }) }, page("p3", "Scratch", { visibility: "HiddenInViewMode" })]).report;
    const f2 = buildFacts({ report: closed }, buildIndexes({ report: closed }), ALL);
    expect(f2[0]).toEqual({ layer: "report", label: "Opens on", value: "Scratch (hidden)", detail: "the page open when it was saved; no landing page set", ruleId: "OPENING_PAGE_INVALID" });
    expect(f2[1]).toEqual({ layer: "report", label: "Filters pane", value: "closed", ruleId: "FILTERS_PANE_STATE" });
    expect(f2.find((f) => f.label === "Slicers")).toEqual({ layer: "report", label: "Slicers", value: "none" });
    expect(f2.find((f) => f.label === "Mobile layouts")).toEqual({ layer: "report", label: "Mobile layouts", value: "none" });
  });
  it("gives a model-only run the model fact alone, without the reach detail", () => {
    expect(buildFacts({ model }, buildIndexes({ model }), ALL)).toEqual([
      { layer: "model", label: "Model", value: "1 table, 2 columns, 2 measures" },
    ]);
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `npx vitest run packages/core/test/facts.test.ts`
Expected: FAIL, module not found.

- [ ] **Step 3: Implement**

Create `packages/core/src/project/facts.ts`:

```ts
import { plural } from "../format/text.js";
import type { Indexes } from "../index/build.js";
import type { Report } from "../pbir/types.js";
import { allVisuals, isHiddenPage } from "../rules/report-helpers.js";
import type { Fact, Project } from "./types.js";

/** `n info`-style nouns are the caller's business; these take an s. */
const n = plural;

function reportFacts(report: Report, known: ReadonlySet<string>): Fact[] {
  const facts: Fact[] = [];
  const withRule = (fact: Fact, ruleId: string | undefined): Fact =>
    ruleId !== undefined && known.has(ruleId) ? { ...fact, ruleId } : fact;
  const pages = report.pages;
  const byId = new Map(pages.map((p) => [p.id, p]));
  const header = report.pagesHeader;

  // Opens on.
  const target = header.landingPageName ?? header.activePageName;
  const opened = target === undefined ? undefined : byId.get(target);
  const invalid = target !== undefined && (opened === undefined || isHiddenPage(opened));
  const value =
    target === undefined ? "unknown" : opened === undefined ? `"${target}" (no such page)` : isHiddenPage(opened) ? `${opened.displayName} (hidden)` : opened.displayName;
  facts.push(
    withRule(
      {
        layer: "report",
        label: "Opens on",
        value,
        detail: header.landingPageName !== undefined ? "landing page" : "the page open when it was saved; no landing page set",
      },
      invalid ? "OPENING_PAGE_INVALID" : header.landingPageName === undefined ? "LANDING_PAGE_NOT_SET" : undefined,
    ),
  );

  // Filters pane. Desktop collapses the pane unless the file says expanded.
  const pane = report.filtersPane;
  facts.push(
    withRule(
      { layer: "report", label: "Filters pane", value: pane.visible === false ? "hidden from readers" : pane.expanded === true ? "open" : "closed" },
      "FILTERS_PANE_STATE",
    ),
  );

  // Pages.
  const hidden = pages.filter(isHiddenPage).length;
  const tooltip = pages.filter((p) => p.bindingType === "Tooltip").length;
  const drill = pages.filter((p) => p.bindingType === "Drillthrough").length;
  const pageParts = [hidden && `${hidden} hidden`, tooltip && `${tooltip} tooltip`, drill && `${drill} drillthrough`].filter(Boolean) as string[];
  facts.push(
    withRule(
      { layer: "report", label: "Pages", value: String(pages.length), ...(pageParts.length ? { detail: pageParts.join(", ") } : {}) },
      tooltip + drill > 0 ? "HIDE_TOOLTIP_DRILLTROUGH_PAGES" : undefined,
    ),
  );

  // Visuals.
  const visuals = allVisuals(report).filter((v) => !v.isGroup);
  const hiddenVisuals = visuals.filter((v) => v.isHidden);
  const hiddenWithFields = hiddenVisuals.filter((v) => v.fields.length > 0).length;
  const registered = report.publicCustomVisuals;
  const usedTypes = new Set(visuals.map((v) => v.type));
  const used = registered.filter((t) => usedTypes.has(t)).length;
  const visualParts = [
    hiddenVisuals.length ? `${hiddenVisuals.length} hidden` : "",
    registered.length ? `${n(registered.length, "custom visual type")} registered, ${used} used` : "",
  ].filter(Boolean);
  facts.push(
    withRule(
      { layer: "report", label: "Visuals", value: String(visuals.length), ...(visualParts.length ? { detail: visualParts.join("; ") } : {}) },
      hiddenWithFields > 0 ? "HIDDEN_VISUALS_STILL_QUERY" : registered.length > used ? "REMOVE_UNUSED_CUSTOM_VISUALS" : undefined,
    ),
  );

  // Report measures.
  const measures = report.measures.length;
  facts.push(
    withRule(
      measures ? { layer: "report", label: "Report measures", value: String(measures), detail: "defined in the report, not the model" } : { layer: "report", label: "Report measures", value: "none" },
      measures ? "REPORT_LEVEL_MEASURES" : undefined,
    ),
  );

  // Slicers.
  const slicers = visuals.filter((v) => v.type === "slicer");
  const saved = slicers.filter((v) => v.filters.some((f) => f.applied)).length;
  facts.push(
    withRule(
      slicers.length ? { layer: "report", label: "Slicers", value: String(slicers.length), detail: `${saved} with a saved selection` } : { layer: "report", label: "Slicers", value: "none" },
      saved > 0 ? "SLICER_SELECTION_SAVED" : undefined,
    ),
  );

  // Mobile layouts and schema versions.
  const mobilePages = pages.filter((p) => p.visuals.some((v) => v.hasMobileLayout)).length;
  facts.push({ layer: "report", label: "Mobile layouts", value: mobilePages ? `${mobilePages} of ${n(pages.length, "page")}` : "none" });
  const sv = report.schemaVersions;
  const versions = [sv.report && `report ${sv.report}`, sv.page && `page ${sv.page}`, sv.visual && `visual ${sv.visual}`].filter(Boolean) as string[];
  if (versions.length) facts.push({ layer: "report", label: "Schema versions", value: versions.join(", ") });
  return facts;
}

/**
 * The "Report at a glance" block: structured, always produced, in the order the spec's table
 * lists. A fact links to a rule only when that rule is in the run's rule set.
 */
export function buildFacts(project: Project, indexes: Indexes, knownRules: ReadonlySet<string>): Fact[] {
  const facts: Fact[] = project.report ? reportFacts(project.report, knownRules) : [];
  const model = project.model;
  if (model) {
    const columns = model.tables.reduce((s, t) => s + t.columns.length, 0);
    const measures = model.tables.reduce((s, t) => s + t.measures.length, 0);
    const fact: Fact = {
      layer: "model",
      label: "Model",
      value: `${n(model.tables.length, "table")}, ${n(columns, "column")}, ${n(measures, "measure")}`,
    };
    const reach = indexes.reachability;
    if (reach) {
      const u = reach.unreached();
      fact.detail = `${n(u.columns.length, "column")} and ${n(u.measures.length, "measure")} not reached from this report`;
      if (u.columns.length + u.measures.length > 0 && knownRules.has("NOT_REACHED_FROM_REPORT")) fact.ruleId = "NOT_REACHED_FROM_REPORT";
    }
    facts.push(fact);
  }
  return facts;
}
```

Export from `packages/core/src/index.ts`: `export { buildFacts } from "./project/facts.js";`. `plural` is imported from `format/text.js`; that module imports nothing from the project layer, so no cycle.

- [ ] **Step 4: Run the tests**

Run: `npx vitest run packages/core/test/facts.test.ts && npm run typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/project/facts.ts packages/core/src/index.ts packages/core/test/facts.test.ts
git commit -m "feat(core): facts, what the report will do, beside the findings"
```

---

### Task 8: Routing, pairing, and `lint()` over a whole project

**Files:**
- Create: `packages/core/src/project/route.ts`
- Modify: `packages/core/src/engine/lint.ts`
- Modify: `packages/core/src/index.ts`
- Test: `packages/core/test/route.test.ts`, `packages/core/test/engine.test.ts`

**Interfaces:**
- Produces, `packages/core/src/project/route.ts`:

```ts
export const isModelFile: (path: string) => boolean;   // ends with .tmdl
export const isReportFile: (path: string) => boolean;  // definition.pbir, .platform, .pbip, or .json under a definition/ folder
export function routeFiles(files: LintFile[]): { model: LintFile[]; report: LintFile[] }
export function datasetReference(pbirText: string): DatasetReference
export interface PairingDecision { useModel: boolean; reason?: string; diagnostic?: Diagnostic }
export function pairingDecision(ref: DatasetReference, siblingModelFolder: string | undefined, reportFolder: string): PairingDecision
```

- Produces, `packages/core/src/engine/lint.ts`:

```ts
export interface LintOptions { config?; rules?; /** Diagnostics the input reader found; they ride on the result. */ diagnostics?: Diagnostic[]; /** Why a layer the reader left out is absent, per layer. */ absent?: Partial<Record<LayerName, string>> }
export interface LintResult { project: Project; model: Model; layers: Layers; facts: Fact[]; diagnostics: Diagnostic[]; findings: Finding[]; groups: RankedGroup[]; summary: LintSummary; failed: boolean }
```

`LintSummary.files` counts the files that routed to a layer. `lint(files)` keeps its signature.

- Consumes: everything from Tasks 1 to 7.

- [ ] **Step 1: Write the failing tests**

Create `packages/core/test/route.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { datasetReference, isReportFile, pairingDecision, routeFiles } from "../src/project/route.js";

describe("routeFiles", () => {
  it("sends .tmdl to the model and report files to the report, and drops the rest", () => {
    const { model, report } = routeFiles([
      { path: "definition/tables/Sales.tmdl", text: "" },
      { path: "definition/pages/p/page.json", text: "" },
      { path: "definition.pbir", text: "" },
      { path: ".platform", text: "" },
      { path: "Demo.pbip", text: "" },
      { path: "README.md", text: "" },
      { path: "StaticResources/x.json", text: "" },
    ]);
    expect(model.map((f) => f.path)).toEqual(["definition/tables/Sales.tmdl"]);
    expect(report.map((f) => f.path)).toEqual(["definition/pages/p/page.json", "definition.pbir", ".platform", "Demo.pbip"]);
    expect(isReportFile("definition/report.json")).toBe(true);
    expect(isReportFile("definition/tables/x.tmdl")).toBe(false);
  });
});

describe("pairingDecision", () => {
  it("pairs a report with the model its byPath names, and only that one", () => {
    expect(pairingDecision({ kind: "byPath", path: "../Demo.SemanticModel" }, "Demo.SemanticModel", "Demo.Report")).toEqual({ useModel: true });
    expect(pairingDecision({ kind: "none" }, "Demo.SemanticModel", "Demo.Report")).toEqual({ useModel: true });
    expect(pairingDecision({ kind: "byConnection" }, "Demo.SemanticModel", "Demo.Report")).toEqual({ useModel: false, reason: "this report reads a published model" });
    expect(pairingDecision({ kind: "byPath", path: "../Demo.SemanticModel" }, undefined, "Demo.Report")).toEqual({ useModel: false });
    expect(pairingDecision({ kind: "byPath", path: "../Other.SemanticModel" }, "Demo.SemanticModel", "Demo.Report")).toEqual({
      useModel: false,
      reason: "this report reads a model outside the input (../Other.SemanticModel)",
      diagnostic: {
        kind: "model-reference-mismatch",
        path: "Demo.Report/definition.pbir",
        message: "Demo.Report/definition.pbir points at ../Other.SemanticModel, not at Demo.SemanticModel beside it, so the model was not paired with this report",
      },
    });
  });
  it("reads the dataset reference out of definition.pbir text", () => {
    expect(datasetReference('{"datasetReference":{"byPath":{"path":"../M.SemanticModel"}}}')).toEqual({ kind: "byPath", path: "../M.SemanticModel" });
    expect(datasetReference("not json")).toEqual({ kind: "none" });
  });
});
```

Append to `packages/core/test/engine.test.ts`, a new describe:

```ts
describe("lint over a project", () => {
  const j = (v: unknown) => JSON.stringify(v);
  const modelFiles = [{ path: "definition/tables/Sales.tmdl", text: "table Sales\n\tcolumn Amount\n\t\tdataType: decimal\n" }];
  const reportFiles = [
    { path: "definition/report.json", text: j({}) },
    { path: "definition/pages/pages.json", text: j({ pageOrder: ["p"], activePageName: "p" }) },
    { path: "definition/pages/p/page.json", text: j({ name: "p", displayName: "P" }) },
  ];
  it("reports which layers ran and why one is absent, and counts routed files", () => {
    const both = lint([...modelFiles, ...reportFiles, { path: "README.md", text: "" }]);
    expect(both.layers).toEqual({ model: { present: true, files: 1 }, report: { present: true, files: 3 } });
    expect(both.summary.files).toBe(4);
    expect(both.project.model).toBeDefined();
    expect(both.project.report).toBeDefined();
    expect(both.facts.map((f) => f.label)).toContain("Opens on");
    const modelOnly = lint(modelFiles);
    expect(modelOnly.layers.report).toEqual({ present: false, reason: "no report in the input" });
    expect(modelOnly.facts.map((f) => f.label)).toEqual(["Model"]);
    const reportOnly = lint(reportFiles, { absent: { model: "this report reads a published model" } });
    expect(reportOnly.layers.model).toEqual({ present: false, reason: "this report reads a published model" });
    expect(reportOnly.model.tables).toEqual([]);
    expect(reportOnly.project.model).toBeUndefined();
  });
  it("carries the reader's diagnostics and adds the builder's", () => {
    const r = lint(
      [...reportFiles, { path: "definition/pages/q/page.json", text: j({ $schema: "https://x/page/9.0.0/schema.json", name: "q", displayName: "Q" }) }],
      { diagnostics: [{ kind: "depth-cap", message: "stopped" }] },
    );
    expect(r.diagnostics.map((d) => d.kind)).toEqual(["depth-cap", "schema-newer-than-known"]);
  });
  it("skips model rules on a report-only run and says so", () => {
    const r = lint(reportFiles);
    expect(r.summary.rulesSkipped.filter((s) => s.reason === "noModel").length).toBeGreaterThan(60);
    expect(r.findings.filter((f) => f.ruleId === "PARSE_ISSUE")).toEqual([]);
  });
  it("reports a JSON parse issue through PARSE_ISSUE with the file and line", () => {
    const r = lint([{ path: "definition/pages/p/page.json", text: '{\n  "name": "p",\n<<<<<<< HEAD\n}\n' }]);
    expect(r.findings.filter((f) => f.ruleId === "PARSE_ISSUE").map((f) => [f.layer, f.objectName, f.location?.line, f.detail])).toEqual([
      ["report", "definition/pages/p/page.json", 3, "merge conflict marker: <<<<<<< HEAD"],
    ]);
  });
});
```

(`PARSE_ISSUE` names a `File`, which sits in either part, so it sets the finding's `layer` itself from the list the issue came from; `runRules` honours a finding's own `layer` before falling back to `layerOf(objectType)`. The tag on a `project` rule's group follows its findings.)

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run packages/core/test/route.test.ts packages/core/test/engine.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement**

Create `packages/core/src/project/route.ts`:

```ts
import type { LintFile } from "../engine/lint.js";
import { readJson } from "../pbir/json.js";
import type { DatasetReference } from "../pbir/types.js";
import type { Diagnostic } from "./types.js";

export const isModelFile = (path: string): boolean => path.endsWith(".tmdl");

/** definition.pbir, .platform, a .pbip, or any JSON under a definition folder: the files a report is made of. */
export const isReportFile = (path: string): boolean =>
  path.endsWith("definition.pbir") ||
  path.endsWith(".platform") ||
  path.endsWith(".pbip") ||
  /(^|\/)definition\/.*\.json$/.test(path);

/** Files route by path: TMDL to the model, report JSON to the report, anything else nowhere. */
export function routeFiles(files: LintFile[]): { model: LintFile[]; report: LintFile[] } {
  return {
    model: files.filter((f) => isModelFile(f.path)),
    report: files.filter((f) => !isModelFile(f.path) && isReportFile(f.path)),
  };
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

/** The dataset reference in a definition.pbir, read without the rest of the report. */
export function datasetReference(pbirText: string): DatasetReference {
  const { json } = readJson("definition.pbir", pbirText);
  const ref = isRecord(json) && isRecord(json.datasetReference) ? json.datasetReference : undefined;
  if (!ref) return { kind: "none" };
  if (isRecord(ref.byPath) && typeof ref.byPath.path === "string") return { kind: "byPath", path: ref.byPath.path };
  if (isRecord(ref.byConnection)) return { kind: "byConnection" };
  return { kind: "none" };
}

export interface PairingDecision {
  useModel: boolean;
  /** Why the model layer is left out, for the layers line. */
  reason?: string;
  diagnostic?: Diagnostic;
}

/**
 * Whether the model beside a report is the one the report reads (spec section 4). The CLI and
 * the browser both call this, so the two surfaces decide alike: byPath naming the sibling pairs
 * them; byConnection, or byPath naming something else, makes it a report-only run with the reason
 * on the layers line, and the mismatch is a diagnostic besides.
 */
export function pairingDecision(ref: DatasetReference, siblingModelFolder: string | undefined, reportFolder: string): PairingDecision {
  if (siblingModelFolder === undefined) return { useModel: false };
  if (ref.kind === "byConnection") return { useModel: false, reason: "this report reads a published model" };
  if (ref.kind === "none") return { useModel: true };
  const named = ref.path.replace(/\\/g, "/").replace(/\/+$/, "").split("/").pop() ?? "";
  if (named === siblingModelFolder) return { useModel: true };
  return {
    useModel: false,
    reason: `this report reads a model outside the input (${ref.path})`,
    diagnostic: {
      kind: "model-reference-mismatch",
      path: `${reportFolder}/definition.pbir`,
      message: `${reportFolder}/definition.pbir points at ${ref.path}, not at ${siblingModelFolder} beside it, so the model was not paired with this report`,
    },
  };
}
```

Replace the body of `packages/core/src/engine/lint.ts`:

```ts
import { buildIndexes } from "../index/build.js";
import { buildModel } from "../model/build.js";
import type { Model } from "../model/types.js";
import { buildReport } from "../pbir/build.js";
import { buildFacts } from "../project/facts.js";
import { routeFiles } from "../project/route.js";
import type { Diagnostic, Fact, Layers, Project } from "../project/types.js";
import { defaultRules } from "../rules/index.js";
import type { Finding, LayerName, Rule } from "../rules/types.js";
import { parseTmdl } from "../tmdl/parse.js";
import { bindConfig, isResolvedConfig, resolveConfig, type PbiplintConfig, type ResolvedConfig } from "./config.js";
import { rank, type RankedGroup } from "./rank.js";
import { runRules, type RuleError, type SkippedRule } from "./run.js";

export interface LintFile {
  /** Path relative to the part's root, forward slashes: `definition/tables/Sales.tmdl`, `definition/pages/<id>/page.json`. */
  path: string;
  text: string;
}

export interface LintOptions {
  config?: PbiplintConfig | ResolvedConfig;
  rules?: Rule[];
  /** What the input reader found that a reader of the results must know; carried onto the result. */
  diagnostics?: Diagnostic[];
  /** Why the reader left a layer out, per layer, for the layers line. */
  absent?: Partial<Record<LayerName, string>>;
}

export interface LintSummary {
  /** Files that routed to a layer. */
  files: number;
  findings: number;
  errors: number;
  warnings: number;
  infos: number;
  rulesRun: number;
  rulesSkipped: SkippedRule[];
  ruleErrors: RuleError[];
  ignored: number;
  unknownRules: string[];
}

export interface LintResult {
  project: Project;
  /** The model layer, or the empty model when it is absent, so a v1 reader keeps working. */
  model: Model;
  layers: Layers;
  facts: Fact[];
  diagnostics: Diagnostic[];
  findings: Finding[];
  groups: RankedGroup[];
  summary: LintSummary;
  failed: boolean;
}

/** The one call the web app and the CLI both make. Pure: no I/O, no network. */
export function lint(files: LintFile[], options: LintOptions = {}): LintResult {
  const rules = options.rules ?? defaultRules;
  const { config, unknownRules } = bindConfig(
    isResolvedConfig(options.config) ? options.config : resolveConfig(options.config),
    rules,
  );
  const routed = routeFiles(files);
  const model = routed.model.length ? buildModel(routed.model.map((f) => parseTmdl(f.path, f.text))) : undefined;
  const built = routed.report.length ? buildReport(routed.report) : undefined;
  const project: Project = { ...(model ? { model } : {}), ...(built ? { report: built.report } : {}) };
  const layers: Layers = {
    model: model ? { present: true, files: routed.model.length } : { present: false, reason: options.absent?.model ?? "no .tmdl files in the input" },
    report: built ? { present: true, files: routed.report.length } : { present: false, reason: options.absent?.report ?? "no report in the input" },
  };
  const diagnostics = [...(options.diagnostics ?? []), ...(built?.diagnostics ?? [])];
  const indexes = buildIndexes(project);
  const run = runRules(project, indexes, rules, config);
  const groups = rank(run.findings, rules, config);
  const facts = buildFacts(project, indexes, new Set(rules.map((r) => r.id)));
  const count = (severity: number) =>
    groups.filter((g) => g.rule.severity === severity).reduce((n, g) => n + g.findings.length, 0);
  const summary: LintSummary = {
    files: routed.model.length + routed.report.length,
    findings: run.findings.length,
    errors: count(3),
    warnings: count(2),
    infos: count(1),
    rulesRun: run.rulesRun.length,
    rulesSkipped: run.rulesSkipped,
    ruleErrors: run.ruleErrors,
    ignored: run.ignored,
    unknownRules,
  };
  const failed = config.failOn !== null && groups.some((g) => g.rule.severity >= config.failOn!);
  return { project, model: model ?? buildModel([]), layers, facts, diagnostics, findings: run.findings, groups, summary, failed };
}
```

Export from `packages/core/src/index.ts`: `export { datasetReference, isModelFile, isReportFile, pairingDecision, routeFiles, type PairingDecision } from "./project/route.js";`.

The parse rule now reports both layers, so its name stops naming one: in `packages/core/src/rules/parse-issue.ts` set `name: "File could not be fully parsed"` (and the fallback description string to match); in `rules/parse-issue.md` set the frontmatter `name` and the `# ` title to the same, and make the first paragraph of What it checks:

> Lines the TMDL parser could not use: space indentation, an unterminated code fence, a line at an impossible indentation, a line in no form the parser recognizes, and a `///` description with a blank line between it and its declaration; and a report JSON file that is not valid JSON or carries a merge conflict marker.

Its example stays TMDL (the report case is covered by the engine tests). Then `npm run build -w @pbiplint/core && node scripts/sync-rule-pages.mjs`.

- [ ] **Step 4: Run the whole suite**

Run: `npm run typecheck && npx vitest run`
Expected: PASS. A v1 test that linted an empty list still gets the empty model on `result.model`. If `packages/web/test/home.test.ts` or `render.test.ts` reads `summary.files` for the sample, it is still 11.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/project/route.ts packages/core/src/engine/lint.ts packages/core/src/index.ts packages/core/src/rules/parse-issue.ts packages/core/src/rules/rule-summaries.data.ts packages/cli/src/rule-help.data.ts rules/parse-issue.md packages/core/test/route.test.ts packages/core/test/engine.test.ts
git commit -m "feat(core): lint routes files to both layers and reports layers, facts, and diagnostics"
```

---
### Task 9: Formatters: layers, facts, diagnostics, layer tags, per-layer SARIF paths

**Files:**
- Modify: `packages/core/src/format/text.ts`, `markdown.ts`, `json.ts`, `sarif.ts`, `index.ts`
- Modify: `packages/core/src/index.ts` (export the new text helpers)
- Test: `packages/core/test/format.test.ts`

**Interfaces:**
- Produces, in `text.ts`: `layersLine(result)`, `factsLines(result): string[]`, `noticeLines(result): string[]`, `layerTag(layer)`; `skippedLine` gains the two new reasons; `FormatOptions.reportPathPrefix?: string`.
- JSON gains top-level `layers`, `facts`, `diagnostics`; each finding gains `layer` and, when present, `objectId`. SARIF rules gain `properties.layer`; report findings' URIs use `reportPathPrefix`; `runs[0].invocations[0].toolExecutionNotifications` lists `depth-cap` and `unread-file` diagnostics and is present only then.
- Consumes: `LintResult` from Task 8.

- [ ] **Step 1: Write the failing tests**

Append to `packages/core/test/format.test.ts`:

```ts
describe("a whole-project report", () => {
  const j = (v: unknown) => JSON.stringify(v);
  const project = lint(
    [
      ...files,
      { path: "definition/report.json", text: j({ $schema: "https://x/report/3.2.0/schema.json" }) },
      { path: "definition/pages/pages.json", text: j({ pageOrder: ["p"], activePageName: "p" }) },
      { path: "definition/pages/p/page.json", text: j({ name: "p", displayName: "Overview" }) },
      { path: "definition/pages/p/visuals/v/visual.json", text: '{\n  "name": "v",\n<<<<<<< HEAD\n}\n' },
    ],
    { diagnostics: [{ kind: "depth-cap", message: "the walk stopped 64 folders deep inside Deep", path: "Deep" }] },
  );
  it("prints the layers line, notices, the facts block, and a layer tag on every group in text", () => {
    const text = formatText(project);
    const lines = text.split("\n");
    expect(lines[1]).toMatch(/^Model: 2 files\. Report: 4 files\. \d+ rules run, 5 rules skipped \(need a live model\)$/);
    expect(lines[2]).toBe("Notice: the walk stopped 64 folders deep inside Deep");
    expect(text).toContain("\nReport at a glance\n");
    expect(text).toMatch(/\n  Opens on {9}Overview \(the page open when it was saved; no landing page set\)\n/);
    expect(text).toMatch(/\n  Model {12}1 table, 1 column, 1 measure \(1 column and 1 measure not reached from this report\)\n/);
    // PARSE_ISSUE is an Error Prevention error, so it ranks first; the model's DAX error follows.
    expect(text).toMatch(/\n  1\. File could not be fully parsed  \(1 error\) {3}\[report\]\n/);
    expect(text).toMatch(/\n  \d\. .+ {3}\[model\]\n/);
    expect(text).toMatch(/\nERROR {2}\[report\] {2}File could not be fully parsed {2}PARSE_ISSUE {2}\(1\)\n/);
    expect(text).toMatch(/\nERROR {2}\[model\] {3}Column references should be fully qualified/);
  });
  it("says which layer is absent and why", () => {
    const text = formatText(lint(files, { absent: { report: "this report reads a published model" } }));
    expect(text.split("\n")[1]).toMatch(/^Model: 2 files\. Report: absent \(no report in the input\)\./);
    const reportOnly = formatText(lint([{ path: "definition/pages/p/page.json", text: j({ name: "p", displayName: "P" }) }], { absent: { model: "this report reads a published model" } }));
    expect(reportOnly.split("\n")[1]).toMatch(/^Model: absent \(this report reads a published model\)\. Report: 1 file\. \d+ rules run, \d+ rules skipped \(no model in the input\)$/);
  });
  it("mirrors the same in markdown, with the facts as a table", () => {
    const md = formatMarkdown(project);
    expect(md).toContain("Model: 2 files. Report: 4 files.");
    expect(md).toContain("> Notice: the walk stopped 64 folders deep inside Deep");
    expect(md).toContain("## Report at a glance\n\n| Fact | Value | Rule |\n|---|---|---|\n| Opens on | Overview (the page open when it was saved; no landing page set) |  |");
    expect(md).toMatch(/## ERROR: File could not be fully parsed \(1\) · report/);
  });
  it("adds layers, facts, and diagnostics to JSON and a layer to every finding without changing what was there", () => {
    const doc = JSON.parse(formatJson(project));
    expect(Object.keys(doc)).toEqual(["version", "tool", "summary", "layers", "facts", "diagnostics", "groups"]);
    expect(doc.layers).toEqual({ model: { present: true, files: 2 }, report: { present: true, files: 4 } });
    expect(doc.facts[0]).toMatchObject({ layer: "report", label: "Opens on" });
    expect(doc.diagnostics).toEqual([{ kind: "depth-cap", message: "the walk stopped 64 folders deep inside Deep", path: "Deep" }]);
    const parse = doc.groups.find((g: { rule: { id: string } }) => g.rule.id === "PARSE_ISSUE");
    expect(parse.rule.layer).toBe("report");
    expect(parse.findings[0]).toMatchObject({ layer: "report", objectType: "File", file: "definition/pages/p/visuals/v/visual.json", line: 3 });
  });
  it("prefixes report paths separately in SARIF, tags rules with their layer, and notes an incomplete read", () => {
    const sarif = JSON.parse(formatSarif(project, { pathPrefix: "proj/Demo.SemanticModel", reportPathPrefix: "proj/Demo.Report" }));
    const run = sarif.runs[0];
    const uris = run.results.map((r: { locations?: [{ physicalLocation: { artifactLocation: { uri: string } } }] }) => r.locations?.[0]?.physicalLocation.artifactLocation.uri ?? "");
    expect(uris).toContain("proj/Demo.Report/definition/pages/p/visuals/v/visual.json");
    expect(uris).toContain("proj/Demo.SemanticModel/definition/tables/Sales.tmdl");
    expect(run.tool.driver.rules.map((r: { id: string; properties: { layer: string } }) => [r.id, r.properties.layer])).toContainEqual(["PARSE_ISSUE", "report"]);
    expect(run.invocations).toEqual([
      { executionSuccessful: true, toolExecutionNotifications: [{ level: "warning", descriptor: { id: "depth-cap" }, message: { text: "the walk stopped 64 folders deep inside Deep" } }] },
    ]);
    expect(JSON.parse(formatSarif(lint(files))).runs[0].invocations).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run packages/core/test/format.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement**

In `packages/core/src/format/text.ts`:

```ts
export interface FormatOptions {
  toolVersion?: string;
  help?: Readonly<Record<string, RuleHelp>>;
  rules?: import("../rules/types.js").Rule[];
  /** Joined in front of each model finding's path in SARIF artifact URIs. Ignored by the other formats. */
  pathPrefix?: string;
  /** The same for report findings; falls back to pathPrefix. */
  reportPathPrefix?: string;
}

export function skippedLine(result: LintResult): string {
  const s = result.summary;
  const by = (reason: SkippedRule["reason"]): number => s.rulesSkipped.filter((r) => r.reason === reason).length;
  const parts = [`${plural(s.rulesRun, "rule")} run`];
  if (by("needsLiveModel")) parts.push(`${plural(by("needsLiveModel"), "rule")} skipped (need a live model)`);
  if (by("noModel")) parts.push(`${plural(by("noModel"), "rule")} skipped (no model in the input)`);
  if (by("noReport")) parts.push(`${plural(by("noReport"), "rule")} skipped (no report in the input)`);
  if (by("disabled")) parts.push(`${plural(by("disabled"), "rule")} disabled by config`);
  if (s.ignored) parts.push(`${plural(s.ignored, "finding")} ignored by annotation`);
  return parts.join(", ");
}

/** "Model: 11 files. Report: 27 files." naming the reason for an absent layer. */
export function layersLine(result: LintResult): string {
  const part = (name: string, s: LayerStatus): string =>
    s.present ? `${name}: ${plural(s.files, "file")}.` : `${name}: absent (${s.reason}).`;
  return `${part("Model", result.layers.model)} ${part("Report", result.layers.report)}`;
}

export const layerTag = (layer: Layer): string => `[${layer}]`;

/** The facts as aligned lines under a heading, with rule ids in the right margin; nothing when there are no facts. */
export function factsLines(result: LintResult): string[] {
  if (result.facts.length === 0) return [];
  const rows = result.facts.map((f) => ({
    label: f.label,
    value: f.detail ? `${f.value} (${f.detail})` : f.value,
    rule: f.ruleId ?? "",
  }));
  const labelWidth = Math.max(...rows.map((r) => r.label.length));
  const valueWidth = Math.max(...rows.map((r) => r.value.length));
  return [
    "Report at a glance",
    ...rows.map((r) => `  ${r.label.padEnd(labelWidth)}  ${r.value.padEnd(valueWidth)}   ${r.rule}`.trimEnd()),
    "",
  ];
}

export const noticeLines = (result: LintResult): string[] =>
  result.diagnostics.map((d) => `Notice: ${d.message}`);

export function formatText(result: LintResult, _options: FormatOptions = {}): string {
  const out: string[] = [
    `pbiplint: ${summaryLine(result)}`,
    `${layersLine(result)} ${skippedLine(result)}`,
    ...noticeLines(result),
    "",
    ...factsLines(result),
  ];
  if (result.groups.length === 0) {
    out.push("No findings.", "");
  } else {
    out.push("Fix these first:");
    topGroups(result).forEach((g, i) =>
      out.push(
        `  ${i + 1}. ${g.rule.name}  (${plural(g.findings.length, SEVERITY_LABEL[g.rule.severity])})   ${layerTag(g.rule.layer)}`,
      ),
    );
    out.push("");
    for (const g of result.groups) {
      out.push(
        `${SEVERITY_TAG[g.rule.severity]}  ${layerTag(g.rule.layer).padEnd(8)}  ${g.rule.name}  ${g.rule.id}  (${g.findings.length})`,
      );
      // the URL line and the finding rows are unchanged
```

Import `Layer`, `LayerStatus`, `SkippedRule` types as needed. In `markdown.ts`:

```ts
export function formatMarkdown(result: LintResult, _options: FormatOptions = {}): string {
  const out: string[] = ["# pbiplint report", "", `${summaryLine(result)}. ${layersLine(result)} ${skippedLine(result)}.`, ""];
  for (const d of result.diagnostics) out.push(`> Notice: ${cell(d.message)}`, "");
  if (result.facts.length) {
    out.push("## Report at a glance", "", "| Fact | Value | Rule |", "|---|---|---|");
    for (const f of result.facts)
      out.push(`| ${cell(f.label)} | ${cell(f.detail ? `${f.value} (${f.detail})` : f.value)} | ${f.ruleId ? `[${f.ruleId}](${ruleUrl(f.ruleId)})` : ""} |`);
    out.push("");
  }
  if (result.groups.length === 0) { out.push("No findings.", ""); return out.join("\n"); }
  out.push("## Fix these first", "");
  topGroups(result).forEach((g, i) =>
    out.push(`${i + 1}. **${g.rule.name}** (${g.findings.length}) [${g.rule.id}](${g.rule.url}) · ${g.rule.layer}`),
  );
  out.push("");
  for (const g of result.groups) {
    out.push(`## ${SEVERITY_LABEL[g.rule.severity].toUpperCase()}: ${g.rule.name} (${g.findings.length}) · ${g.rule.layer}`, "");
    // the rest unchanged
```

In `json.ts`, the document becomes `{ version: 1, tool, summary, layers: result.layers, facts: result.facts, diagnostics: result.diagnostics, groups }` and each finding is `{ layer: f.layer, objectType, objectName, ...(f.objectId !== undefined ? { objectId: f.objectId } : {}), ...file/line, ...detail }`.

In `sarif.ts`:

```ts
  const prefixFor = (layer: "model" | "report"): string =>
    (layer === "report" ? (options.reportPathPrefix ?? options.pathPrefix) : options.pathPrefix) ?? "";
  const uri = (file: string, layer: "model" | "report"): string => {
    const prefix = prefixFor(layer);
    return encodePath(prefix ? `${prefix}/${file}` : file);
  };
  // rules[]: properties: { category: g.rule.category, layer: g.rule.layer }
  // results[]: artifactLocation: { uri: uri(f.location.file, f.layer) }
  const incomplete = result.diagnostics.filter((d) => d.kind === "depth-cap" || d.kind === "unread-file");
  const run = {
    tool: { driver: { name: "pbiplint", version: options.toolVersion ?? VERSION, informationUri: "https://pbiplint.com", rules } },
    ...(incomplete.length
      ? {
          invocations: [
            {
              executionSuccessful: true,
              toolExecutionNotifications: incomplete.map((d) => ({ level: "warning", descriptor: { id: d.kind }, message: { text: d.message } })),
            },
          ],
        }
      : {}),
    results,
  };
```

Export `factsLines`, `layersLine`, `layerTag`, `noticeLines` through `format/index.ts` and `packages/core/src/index.ts`.

- [ ] **Step 4: Run the tests**

Run: `npx vitest run packages/core/test/format.test.ts packages/core/test/version.test.ts packages/cli/test packages/web/test`
Expected: PASS. `packages/web/test/export.test.ts` reads the JSON export's `summary.findings`, which is unchanged.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/format packages/core/src/index.ts packages/core/test/format.test.ts
git commit -m "feat(core): formats carry layers, facts, notices, layer tags, and per-layer SARIF paths"
```

---

### Task 10: The CLI reads every input shape

**Files:**
- Modify: `packages/cli/src/walk.ts` (`resolveModel` becomes `resolveProject`)
- Modify: `packages/cli/src/main.ts`, `packages/cli/src/args.ts`, `packages/cli/README.md`
- Test: `packages/cli/test/walk.test.ts`, `packages/cli/test/cli.test.ts`, `packages/cli/test/readme.test.ts`

**Interfaces:**
- Produces:

```ts
export interface ResolvedPart { root: string; files: LintFile[] }
export interface ResolvedProject { root: string; model?: ResolvedPart; report?: ResolvedPart; absent: Partial<Record<LayerName, string>>; diagnostics: Diagnostic[] }
export function resolveProject(input: string): ResolvedProject
```

Every input shape of spec section 4: a PBIP folder, a `.pbip` file (its folder), a lone `.Report`, a lone `.SemanticModel`, a `definition` folder (a model's, paths relative to it as v1 did; a report's, root is its parent), one `.tmdl` file, and v1's loose `.tmdl` files under a plain folder. Two reports or two models are refused by name. Legacy formats are diagnostics with the layer reported absent. Never read: `StaticResources`, `CustomVisuals`, `.pbi`, `.git`, `node_modules`, JSON outside `definition`.

- Consumes: `datasetReference`, `pairingDecision` (Task 8); `LintOptions.diagnostics`, `absent`; `reportPathPrefix` (Task 9).

- [ ] **Step 1: Write the failing tests**

Replace `packages/cli/test/walk.test.ts`:

```ts
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { resolveProject } from "../src/walk.js";

const repo = new URL("../../../", import.meta.url).pathname;
const j = (v: unknown) => JSON.stringify(v);

/** A PBIP folder in a temp dir with the parts asked for. */
function pbip(parts: { model?: boolean; report?: boolean; pbir?: unknown; legacyReport?: boolean; legacyModel?: boolean; secondReport?: boolean }) {
  const root = mkdtempSync(join(tmpdir(), "pbiplint-"));
  writeFileSync(join(root, "Demo.pbip"), j({ version: "1.0", artifacts: [{ report: { path: "Demo.Report" } }] }));
  if (parts.model) {
    mkdirSync(join(root, "Demo.SemanticModel", "definition", "tables"), { recursive: true });
    writeFileSync(join(root, "Demo.SemanticModel", ".platform"), j({ metadata: { type: "SemanticModel" } }));
    writeFileSync(join(root, "Demo.SemanticModel", "definition", "model.tmdl"), "model Model\n");
    writeFileSync(join(root, "Demo.SemanticModel", "definition", "tables", "T.tmdl"), "table T\n");
  }
  if (parts.legacyModel) {
    mkdirSync(join(root, "Demo.SemanticModel"), { recursive: true });
    writeFileSync(join(root, "Demo.SemanticModel", "model.bim"), "{}");
  }
  if (parts.report) {
    mkdirSync(join(root, "Demo.Report", "definition", "pages", "p", "visuals", "v"), { recursive: true });
    mkdirSync(join(root, "Demo.Report", "StaticResources", "RegisteredResources"), { recursive: true });
    mkdirSync(join(root, "Demo.Report", ".pbi"), { recursive: true });
    writeFileSync(join(root, "Demo.Report", ".platform"), j({ metadata: { type: "Report", displayName: "Demo" } }));
    writeFileSync(join(root, "Demo.Report", "definition.pbir"), j({ datasetReference: parts.pbir ?? { byPath: { path: "../Demo.SemanticModel" } } }));
    writeFileSync(join(root, "Demo.Report", "definition", "report.json"), "{}");
    writeFileSync(join(root, "Demo.Report", "definition", "pages", "pages.json"), j({ pageOrder: ["p"] }));
    writeFileSync(join(root, "Demo.Report", "definition", "pages", "p", "page.json"), j({ name: "p", displayName: "P" }));
    writeFileSync(join(root, "Demo.Report", "definition", "pages", "p", "visuals", "v", "visual.json"), j({ name: "v" }));
    writeFileSync(join(root, "Demo.Report", "StaticResources", "RegisteredResources", "theme.json"), "{}");
    writeFileSync(join(root, "Demo.Report", ".pbi", "localSettings.json"), "{}");
  }
  if (parts.legacyReport) {
    mkdirSync(join(root, "Demo.Report"), { recursive: true });
    writeFileSync(join(root, "Demo.Report", "report.json"), "{}");
  }
  if (parts.secondReport) {
    mkdirSync(join(root, "Other.Report", "definition"), { recursive: true });
    writeFileSync(join(root, "Other.Report", "definition", "report.json"), "{}");
  }
  return root;
}

describe("resolveProject", () => {
  it("reads a .SemanticModel folder as v1 did, paths relative to it with forward slashes", () => {
    const p = resolveProject(join(repo, "tests/fixtures/rule-zoo.SemanticModel"));
    expect(p.model!.root.endsWith("rule-zoo.SemanticModel")).toBe(true);
    expect(p.model!.files.map((f) => f.path)).toContain("definition/tables/Sales.tmdl");
    expect(p.model!.files.every((f) => !f.path.includes("\\"))).toBe(true);
    expect(p.model!.files.length).toBe(17);
    expect(p.report).toBeUndefined();
    expect(p.absent).toEqual({});
  });
  it("reads a whole PBIP folder, its .pbip file, and both parts with part-relative paths, never StaticResources or .pbi", () => {
    const root = pbip({ model: true, report: true });
    for (const input of [root, join(root, "Demo.pbip")]) {
      const p = resolveProject(input);
      expect(p.root).toBe(root);
      expect(p.model!.files.map((f) => f.path).sort()).toEqual(["definition/model.tmdl", "definition/tables/T.tmdl"]);
      expect(p.report!.files.map((f) => f.path).sort()).toEqual([
        ".platform",
        "Demo.pbip",
        "definition.pbir",
        "definition/pages/p/page.json",
        "definition/pages/p/visuals/v/visual.json",
        "definition/pages/pages.json",
        "definition/report.json",
      ]);
      expect(p.model!.root).toBe(join(root, "Demo.SemanticModel"));
      expect(p.report!.root).toBe(join(root, "Demo.Report"));
      expect(p.diagnostics).toEqual([]);
    }
  });
  it("reads a lone .Report, a lone report definition folder, a model definition folder, and one .tmdl file", () => {
    const root = pbip({ report: true });
    const lone = resolveProject(join(root, "Demo.Report"));
    expect(lone.model).toBeUndefined();
    expect(lone.report!.files.map((f) => f.path)).toContain("definition/pages/p/page.json");
    expect(lone.report!.files.map((f) => f.path)).not.toContain("Demo.pbip");
    expect(lone.absent).toEqual({});
    const def = resolveProject(join(root, "Demo.Report", "definition"));
    expect(def.report!.root).toBe(join(root, "Demo.Report"));
    expect(def.report!.files.map((f) => f.path)).toContain("definition/report.json");
    const modelRoot = pbip({ model: true });
    expect(resolveProject(join(modelRoot, "Demo.SemanticModel", "definition")).model!.files.map((f) => f.path).sort()).toEqual(["model.tmdl", "tables/T.tmdl"]);
    expect(resolveProject(join(modelRoot, "Demo.SemanticModel", "definition", "tables", "T.tmdl")).model!.files).toEqual([{ path: "T.tmdl", text: "table T\n" }]);
  });
  it("leaves the model out when the report reads a published model or another model, and says why", () => {
    const published = resolveProject(pbip({ model: true, report: true, pbir: { byConnection: { connectionString: "x" } } }));
    expect(published.model).toBeUndefined();
    expect(published.absent).toEqual({ model: "this report reads a published model" });
    expect(published.diagnostics).toEqual([]);
    const elsewhere = resolveProject(pbip({ model: true, report: true, pbir: { byPath: { path: "../Other.SemanticModel" } } }));
    expect(elsewhere.model).toBeUndefined();
    expect(elsewhere.absent.model).toBe("this report reads a model outside the input (../Other.SemanticModel)");
    expect(elsewhere.diagnostics.map((d) => d.kind)).toEqual(["model-reference-mismatch"]);
  });
  it("turns the two legacy formats into diagnostics with the layer absent", () => {
    const legacy = resolveProject(pbip({ model: true, legacyReport: true }));
    expect(legacy.model).toBeDefined();
    expect(legacy.report).toBeUndefined();
    expect(legacy.absent.report).toBe("saved in the legacy report.json format");
    expect(legacy.diagnostics).toEqual([
      { kind: "legacy-report-format", path: "Demo.Report", message: "Demo.Report is stored as a single report.json, which pbiplint cannot read; save it in the PBIR format from Power BI Desktop" },
    ]);
    const bim = resolveProject(pbip({ legacyModel: true, report: true }));
    expect(bim.model).toBeUndefined();
    expect(bim.absent.model).toBe("saved in the legacy model.bim format");
    expect(bim.diagnostics.map((d) => d.kind)).toEqual(["legacy-model-format"]);
    const only = resolveProject(join(pbip({ legacyModel: true }), "Demo.SemanticModel"));
    expect(only.model).toBeUndefined();
    expect(only.diagnostics.map((d) => d.kind)).toEqual(["legacy-model-format"]);
  });
  it("refuses two reports or two models by name and explains what it could not find", () => {
    expect(() => resolveProject(pbip({ report: true, secondReport: true }))).toThrow(/contains 2 reports; point at one of them: Demo\.Report, Other\.Report/);
    const empty = mkdtempSync(join(tmpdir(), "pbiplint-empty-"));
    expect(() => resolveProject(empty)).toThrow(/No semantic model or report found/);
    expect(() => resolveProject(join(empty, "missing"))).toThrow(/does not exist/);
    writeFileSync(join(empty, "x.txt"), "");
    expect(() => resolveProject(join(empty, "x.txt"))).toThrow(/is not a \.tmdl file, a \.pbip file, or a folder/);
  });
});
```

In `packages/cli/test/readme.test.ts`, the expected path list becomes:

```ts
    expect(paths).toEqual(["PBIP folder", ".pbip file", ".SemanticModel folder", ".Report folder", "definition folder", ".tmdl file"]);
```

Append to `packages/cli/test/cli.test.ts` (inside the describe; `mkdirSync` is already importable from `node:fs`):

```ts
  it("lints a whole project, prints layers in JSON, and puts notices on stderr", async () => {
    const root = mkdtempSync(join(tmpdir(), "pbiplint-proj-"));
    mkdirSync(join(root, "Demo.SemanticModel", "definition"), { recursive: true });
    writeFileSync(join(root, "Demo.SemanticModel", "definition", "model.tmdl"), "model Model\n");
    mkdirSync(join(root, "Demo.Report"), { recursive: true });
    writeFileSync(join(root, "Demo.Report", "report.json"), "{}");
    const r = await run([root, "--format", "json", "--fail-on", "none"]);
    expect(r.code).toBe(0);
    const doc = JSON.parse(r.out);
    expect(doc.layers.model).toEqual({ present: true, files: 1 });
    expect(doc.layers.report).toEqual({ present: false, reason: "saved in the legacy report.json format" });
    expect(r.err).toBe("pbiplint: notice: Demo.Report is stored as a single report.json, which pbiplint cannot read; save it in the PBIR format from Power BI Desktop\n");
  });
  it("lists the layer of every rule", async () => {
    const r = await run(["rules"]);
    expect(r.out).toMatch(/^PARSE_ISSUE\s+project\s+builtin/m);
    expect(r.out).toMatch(/^HIDE_FOREIGN_KEYS\s+model\s+ported/m);
  });
```

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run packages/cli/test`
Expected: FAIL, `resolveProject` not exported; the README path list differs.

- [ ] **Step 3: Implement**

Replace `packages/cli/src/walk.ts`:

```ts
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { basename, dirname, join, relative, resolve } from "node:path";
import {
  datasetReference,
  pairingDecision,
  type Diagnostic,
  type LayerName,
  type LintFile,
} from "@pbiplint/core";
import { UsageError } from "./args.js";

export interface ResolvedPart {
  /** Absolute path the part's finding locations are relative to. */
  root: string;
  files: LintFile[];
}

export interface ResolvedProject {
  /** The folder the config search starts from: the project folder, or the one part given. */
  root: string;
  model?: ResolvedPart;
  report?: ResolvedPart;
  /** Why a layer was left out, per layer. */
  absent: Partial<Record<LayerName, string>>;
  diagnostics: Diagnostic[];
}

export const EXPECTED_INPUT =
  "a PBIP folder, a .pbip file, a .SemanticModel folder, a .Report folder, a definition folder, or one .tmdl file";

/** Folders never read: Desktop's caches, git, packages, and a report's resources and custom visuals. */
const SKIP_DIRS = new Set([".git", ".pbi", "node_modules", "StaticResources", "CustomVisuals"]);

const toPosix = (p: string): string => p.split("\\").join("/");
const isDir = (p: string): boolean => existsSync(p) && statSync(p).isDirectory();
const isFile = (p: string): boolean => existsSync(p) && statSync(p).isFile();
const byName = (a: string, b: string): number => a.localeCompare(b, "en");

function readTree(root: string, dir: string, keep: (name: string) => boolean, out: LintFile[]): void {
  for (const entry of readdirSync(dir, { withFileTypes: true }).sort((a, b) => byName(a.name, b.name))) {
    const p = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name)) readTree(root, p, keep, out);
    } else if (keep(entry.name)) out.push({ path: toPosix(relative(root, p)), text: readFileSync(p, "utf8") });
  }
}

/** The model part at `folder`: its definition folder's .tmdl files, or nothing. */
function modelPart(folder: string): ResolvedPart | undefined {
  const def = join(folder, "definition");
  if (!isDir(def)) return undefined;
  const files: LintFile[] = [];
  readTree(folder, def, (n) => n.endsWith(".tmdl"), files);
  return files.length ? { root: folder, files } : undefined;
}

/** The report part at `folder`: definition.pbir, .platform, and every JSON under definition, or nothing. */
function reportPart(folder: string): ResolvedPart | undefined {
  const def = join(folder, "definition");
  if (!isDir(def)) return undefined;
  const files: LintFile[] = [];
  for (const name of ["definition.pbir", ".platform"])
    if (isFile(join(folder, name))) files.push({ path: name, text: readFileSync(join(folder, name), "utf8") });
  readTree(folder, def, (n) => n.endsWith(".json"), files);
  return files.some((f) => f.path.startsWith("definition/")) ? { root: folder, files } : undefined;
}

const legacyReport = (folder: string, name: string): Diagnostic => ({
  kind: "legacy-report-format",
  path: name,
  message: `${name} is stored as a single report.json, which pbiplint cannot read; save it in the PBIR format from Power BI Desktop`,
});
const legacyModel = (folder: string, name: string): Diagnostic => ({
  kind: "legacy-model-format",
  path: name,
  message: `${name} is stored as model.bim, which pbiplint cannot read; save it in the TMDL format from Power BI Desktop`,
});
const LEGACY_REPORT_REASON = "saved in the legacy report.json format";
const LEGACY_MODEL_REASON = "saved in the legacy model.bim format";

/** Find the project at or under `input` and read its parts (spec section 4). */
export function resolveProject(input: string): ResolvedProject {
  const path = resolve(input);
  if (!existsSync(path)) throw new UsageError(`${input} does not exist`);
  if (statSync(path).isFile()) {
    if (path.endsWith(".tmdl"))
      return {
        root: dirname(path),
        model: { root: dirname(path), files: [{ path: basename(path), text: readFileSync(path, "utf8") }] },
        absent: {},
        diagnostics: [],
      };
    if (path.endsWith(".pbip")) return resolveProject(dirname(path));
    throw new UsageError(`${input} is not a .tmdl file, a .pbip file, or a folder`);
  }
  const out: ResolvedProject = { root: path, absent: {}, diagnostics: [] };
  const name = basename(path);

  // The folder is itself one part.
  if (isDir(join(path, "definition"))) {
    const model = modelPart(path);
    if (model) return { ...out, model };
    const report = reportPart(path);
    if (report) return { ...out, report };
  }
  // A definition folder given directly: a model's is read as v1 did, a report's from its parent.
  if (name === "definition") {
    const tmdl: LintFile[] = [];
    readTree(path, path, (n) => n.endsWith(".tmdl"), tmdl);
    if (tmdl.length) return { ...out, model: { root: path, files: tmdl } };
    const report = reportPart(dirname(path));
    if (report) return { root: dirname(path), report, absent: {}, diagnostics: [] };
  }
  // A part folder in the legacy format.
  if (name.endsWith(".Report") && isFile(join(path, "report.json"))) {
    out.diagnostics.push(legacyReport(path, name));
    out.absent.report = LEGACY_REPORT_REASON;
    return out;
  }
  if (name.endsWith(".SemanticModel") && isFile(join(path, "model.bim"))) {
    out.diagnostics.push(legacyModel(path, name));
    out.absent.model = LEGACY_MODEL_REASON;
    return out;
  }

  // A PBIP folder: the parts sit beside each other.
  const dirs = readdirSync(path, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name);
  const models = dirs.filter((d) => d.endsWith(".SemanticModel")).sort(byName);
  const reports = dirs.filter((d) => d.endsWith(".Report")).sort(byName);
  if (models.length > 1)
    throw new UsageError(`${input} contains ${models.length} semantic models; point at one of them: ${models.join(", ")}`);
  if (reports.length > 1)
    throw new UsageError(`${input} contains ${reports.length} reports; point at one of them: ${reports.join(", ")}`);
  let model = models[0] ? modelPart(join(path, models[0])) : undefined;
  if (models[0] && !model && isFile(join(path, models[0], "model.bim"))) {
    out.diagnostics.push(legacyModel(path, models[0]));
    out.absent.model = LEGACY_MODEL_REASON;
  }
  const report = reports[0] ? reportPart(join(path, reports[0])) : undefined;
  if (reports[0] && !report && isFile(join(path, reports[0], "report.json"))) {
    out.diagnostics.push(legacyReport(path, reports[0]));
    out.absent.report = LEGACY_REPORT_REASON;
  }
  if (report) {
    const pbip = readdirSync(path).filter((n) => n.endsWith(".pbip")).sort(byName)[0];
    if (pbip) report.files.push({ path: pbip, text: readFileSync(join(path, pbip), "utf8") });
    const pbir = report.files.find((f) => f.path === "definition.pbir");
    const decision = pairingDecision(pbir ? datasetReference(pbir.text) : { kind: "none" }, model ? models[0] : undefined, reports[0]!);
    if (!decision.useModel && model) {
      model = undefined;
      if (decision.reason) out.absent.model = decision.reason;
    }
    if (decision.diagnostic) out.diagnostics.push(decision.diagnostic);
  }
  if (model) out.model = model;
  if (report) out.report = report;
  if (model || report) return out;

  // Loose .tmdl files anywhere under a plain folder, as v1 accepted.
  const direct: LintFile[] = [];
  readTree(path, path, (n) => n.endsWith(".tmdl"), direct);
  if (direct.length) return { ...out, model: { root: path, files: direct } };
  // Nothing to lint but something to say: a legacy part alone.
  if (out.diagnostics.length) return out;
  throw new UsageError(`No semantic model or report found at ${input} (expected ${EXPECTED_INPUT})`);
}
```

In `packages/cli/src/main.ts`:

```ts
import { resolveProject } from "./walk.js";
// ...
function listRules(): string {
  const width = Math.max(...defaultRules.map((r) => r.id.length));
  return defaultRules
    .map(
      (r) =>
        `${r.id.padEnd(width)}  ${r.layer.padEnd(7)}  ${(r.status === "needsLiveModel" ? "needs live model" : r.status).padEnd(16)}  ${SEVERITY_LABEL[r.severity].padEnd(7)}  ${r.category.padEnd(18)}  ${r.name}`,
    )
    .join("\n");
}
// ...in main, replacing the resolveModel block:
    const project = resolveProject(target);
    const found = findConfig(project.root, opts.config ? resolve(io.cwd(), opts.config) : undefined);
    const config = resolveConfig({ ...found.config, ...(opts.failOn ? { failOn: opts.failOn } : {}) });
    const files = [...(project.model?.files ?? []), ...(project.report?.files ?? [])];
    const result = lint(files, { config, diagnostics: project.diagnostics, absent: project.absent });
    // SARIF artifact URIs are resolved from where the tool ran, so each part's root, relative to
    // the cwd, goes in front of that part's finding paths.
    const prefix = (root: string | undefined): string | undefined =>
      root === undefined ? undefined : relative(io.cwd(), root).split("\\").join("/");
    const report = formatResult(opts.format, result, {
      toolVersion: VERSION,
      pathPrefix: prefix(project.model?.root) ?? prefix(project.report?.root) ?? "",
      reportPathPrefix: prefix(project.report?.root),
      help: RULE_HELP,
    });
    // ...after the report is written and the rule errors:
    for (const d of result.diagnostics) io.stderr(`pbiplint: notice: ${d.message}\n`);
```

In `packages/cli/src/args.ts`, `HELP` becomes:

```ts
export const HELP = `Usage: pbiplint <path> [options]
       pbiplint --sample [options]
       pbiplint rules

Lint a Power BI project, its semantic model (TMDL) and its report (PBIR), for best-practice
violations. Either part alone is fine. Nothing is uploaded.

<path>              a PBIP folder, a .pbip file, a .SemanticModel folder, a .Report folder, a definition folder, or one .tmdl file
--sample            lint the bundled sample project instead of a path
--format <name>     text (default), json, sarif, markdown
--fail-on <level>   error (default), warning, info, none: lowest severity that exits 1
--config <file>     pbiplint.config.json to use (default: nearest one above the project)
--output <file>     write the report to a file instead of stdout (a one-line summary goes to stderr)
--help, --version

Exit codes: 0 no findings at or above --fail-on, 1 findings, 2 usage or input error.
Rule pages: https://pbiplint.com/rules/
`;
```

In `packages/cli/README.md`, change the opening paragraph to:

> Best-practice linter for Power BI projects. Point it at a PBIP folder, a .pbip file, a .SemanticModel folder, a .Report folder, a definition folder, or one .tmdl file and get ranked findings with a link to a fix page for each rule, plus a "Report at a glance" block that says what the report will do when someone opens it. Nothing is uploaded: it reads the files you name and writes to your terminal. Node 20 or later.

and in its "What it checks" section add, before the last paragraph:

> The report layer (PBIR): 11 rules ported from PBI Inspector's base rules and pbiplint's own rules for broken field references, model objects the report never reaches, the opening page, the Filters pane, hidden visuals that still query, default page names, empty visuals, visuals past the page edge, report-level measures, broken button and bookmark targets, tab order, and saved slicer selections. A `.Report` folder alone is valid input; with the model beside it, the two are checked against each other.

- [ ] **Step 4: Run the tests**

Run: `npx vitest run packages/cli/test && npm run typecheck && npm run lint`
Expected: PASS. The existing cli tests that lint the sample still see 11 model files and 161 findings: the sample has no report until pull request 6.

- [ ] **Step 5: Commit**

```bash
git add packages/cli
git commit -m "feat(cli): resolve every project shape, pair the report with its model, print notices"
```

---

### Task 11: The bundle budget, full verification, and pull request 1

**Files:**
- Modify: `packages/core/scripts/check-browser-bundle.mjs`

- [ ] **Step 1: Add the size assertion**

In `packages/core/scripts/check-browser-bundle.mjs`, after the `console.log` of the sizes and before the forbidden-API exit:

```js
// The site loads the core on every visit; 200 KB minified is the budget the v2 spec sets.
const LIMIT_KB = 200;
if (code.length > LIMIT_KB * 1024) {
  console.error(`core bundle is ${kb(code.length)} KB minified, over the ${LIMIT_KB} KB budget`);
  process.exit(1);
}
```

Run: `npm run check:browser`
Expected: prints the size (about 120 KB), "core bundle is browser-pure", exit 0.

- [ ] **Step 2: Run everything CI runs**

```bash
npm run lint && npm run typecheck && npm test && npm run check:browser && npm run build && npm run check:pack && npm run test:bundle -w pbiplint && npm run test:e2e
```

Expected: all green. The e2e suite still sees the sample as a model-only run.

- [ ] **Step 3: Check the branch for closing keywords and em dashes**

```bash
git log --format=%B main..HEAD | grep -inE '\b(close[sd]?|fix(e[sd])?|resolve[sd]?)\b[[:space:]]*#[0-9]+' ; git diff main..HEAD | grep -c $'\u2014'
```

Expected: no keyword lines; em dash count 0.

- [ ] **Step 4: Whole-branch review**

Dispatch the final review of `main..HEAD` to a Fable subagent with the spec, sections 4 to 7 and 9 and 13, and this plan's Global Constraints and Decisions. Apply its Important findings in a fix wave, re-run Step 2, and record the rulings in `.superpowers/sdd/2026-09-20-pbiplint-v2-report-layer/progress.md`.

- [ ] **Step 5: Commit the SDD ledger pointer, push, open the pull request, stop**

```bash
git push -u origin v2-plumbing
gh auth switch --user TheDataPractitioner
gh pr create --repo pbiplint/pbiplint --base main --head v2-plumbing --title "v2 plumbing: read a whole project, report layers, facts, and diagnostics" --body-file - <<'EOF'
Pull request 1 of 8 for the report layer, tracked in #9. Plumbing only: no report rule ships yet, so every result on today's inputs is unchanged apart from two new lines (the layers line and the facts block).

- `Rule.check(project, ctx)` with `layer` and `needs`; the 72 model rules are untouched behind `bpaRule`. Two new categories and five report object types.
- `pbiplint.config.json` accepts an object per rule with a severity and the rule's declared options; unknown or mistyped options are a `ConfigError`. The JSON schema follows.
- A tolerant PBIR reader: every schema version read the same way, unknown properties ignored, conflict markers and invalid JSON as `PARSE_ISSUE` findings with a line, a schema newer than known as a diagnostic.
- The report object model, a report reference index resolved against the model, a reachability index to a fixed point, and the facts block.
- `lint(files)` routes `.tmdl` to the model and report JSON to the report; the result gains `project`, `layers`, `facts`, `diagnostics`.
- Text, Markdown, JSON, and SARIF carry layers, facts, notices, and layer tags; SARIF takes `reportPathPrefix` and notes an incomplete read.
- The CLI reads every input shape in spec section 4, pairs a report with the model beside it through `definition.pbir`, and prints notices on stderr. `pbiplint rules` shows the layer.
- The browser bundle check fails over 200 KB.

Manual check for Michael: none needed; the site is unchanged apart from the category order copy.

Next: pull request 2, the 11 ported rules with parity fixtures and expectations.

🤖 Generated with [Claude Code](https://claude.com/claude-code)

https://claude.ai/code/session_01NkR2xcGDMmG1T73cTgjBH3
EOF
gh auth switch --user michaelmckinleyconsulting
```

Report the pull request URL and stop. Michael reviews and merges.

---

## Pull request 2: the ported rules with parity (branch `v2-ported-rules`)

Cut the branch after pull request 1 merges:

```bash
cd ~/Projects/pbiplint && git switch main && git pull --ff-only && git switch -c v2-ported-rules
```

Shared facts for this pull request:

- `INSPECTOR_URL = "https://github.com/NatVanG/fab-inspector/blob/main/Rules/Base-rules.json"` is the attribution URL every ported report page carries alone in `sources`; `SOURCE_NAMES` names it "PBI Inspector's base rules by Nat Van Gulck".
- The three deviation sentences, verbatim in the expectation files' `deviations` map and in each page's Quirks section:
  - `REDUCE_OBJECTS_WITHIN_VISUALS`: "pbiplint counts the fields bound to the visual's roles once, where PBI Inspector counts every projections array in the file and can count a field twice."
  - `REDUCE_ADVANCED_FILTERS`: "pbiplint counts only Advanced filters with a condition applied, where PBI Inspector also counts an Advanced filter with nothing set, such as a slicer's or one Power BI Desktop writes for a visual's own fields."
  - `ENSURE_THEME_COLOURS`: "pbiplint looks for hex literals in colour properties only, where PBI Inspector matches a hex-looking pattern anywhere in the visual's JSON, including titles and text."
- Escalation rule for a parity difference the three sentences do not cover: do not narrow the rule to match and do not add a fourth deviation; stop the task, write what differs (rule, fixture, the two lists) in the SDD ledger, and report it to Michael. Two known candidates: `AVOID_SHOW_ITEMS_WITH_NO_DATA` reads every role while the source reads Category only; `ENSURE_ALTTEXT` reads the alt text property while the source's `none` test treats a `general` entry with no `altText` as having one and treats a visual group as a visual.

### Task 12: Vendor the fab-inspector ruleset and define `inspectorRule`

**Files:**
- Create: `scripts/vendor-inspector-rules.mjs`
- Create: `packages/core/src/rules/pbi-inspector/inspector-rules.data.ts` (generated)
- Create: `packages/core/src/rules/pbi-inspector/define.ts`, `packages/core/src/rules/pbi-inspector/index.ts`
- Modify: `packages/core/src/rules/index.ts`, `packages/core/src/index.ts`, `NOTICE`
- Test: `packages/core/test/define-inspector.test.ts`

**Interfaces:**
- Produces: `INSPECTOR_RULES: readonly InspectorRuleMeta[]` with `{ id, name, description, part?: "Report" | "Pages", disabled: boolean }`, generated with the source commit and sha in its header; `inspectorRule(id, meta: { category: Category; scope: ObjectType[]; options?: RuleOption[] }, check: (report: Report, ctx: RuleContext) => RuleFinding[]): Rule` with `layer: "report"`, `needs: ["report"]`, `severity: 2`, `status: "ported"`, the name from the ruleset with a trailing period dropped, the description from `RULE_SUMMARIES`; `pbiInspectorRules: Rule[]` in ruleset order; `defaultRules` becomes `[PARSE_ISSUE, ...microsoftBpaRules, ...pbiInspectorRules]`.

- [ ] **Step 1: Fetch the ruleset and write the failing test**

```bash
SCRATCH=$(mktemp -d)
git clone --filter=blob:none --sparse --no-checkout https://github.com/NatVanG/fab-inspector.git "$SCRATCH/fab-inspector"
cd "$SCRATCH/fab-inspector" && git sparse-checkout set FabInspector.Tests/Files/pbip Rules && git checkout cdaaeec3cca8e97b0fd493e080dfa264f9cd44f8 && cd -
shasum -a 256 "$SCRATCH/fab-inspector/Rules/Base-rules.json"
```

Expected sha256: `22868be9acd696c96e62f214dbe0efc72fd1bfffda1736b3b9a4d7fba21f883c`. Keep `$SCRATCH` for Tasks 13 and 14.

Create `packages/core/test/define-inspector.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { inspectorRule } from "../src/rules/pbi-inspector/define.js";
import { INSPECTOR_RULES } from "../src/rules/pbi-inspector/inspector-rules.data.js";
import { pbiInspectorRules } from "../src/rules/pbi-inspector/index.js";
import { defaultRules } from "../src/rules/index.js";

const IDS = [
  "REMOVE_UNUSED_CUSTOM_VISUALS",
  "REDUCE_VISUALS_ON_PAGE",
  "REDUCE_OBJECTS_WITHIN_VISUALS",
  "REDUCE_TOPN_FILTERS",
  "REDUCE_ADVANCED_FILTERS",
  "REDUCE_PAGES",
  "AVOID_SHOW_ITEMS_WITH_NO_DATA",
  "HIDE_TOOLTIP_DRILLTROUGH_PAGES",
  "ENSURE_THEME_COLOURS",
  "ENSURE_PAGES_DO_NOT_SCROLL_VERTICALLY",
  "ENSURE_ALTTEXT",
];

describe("vendored fab-inspector ruleset", () => {
  it("holds the 11 base rules in source order, without the template", () => {
    expect(INSPECTOR_RULES.map((r) => r.id)).toEqual(IDS);
    expect(INSPECTOR_RULES.find((r) => r.id === "ENSURE_ALTTEXT")!.disabled).toBe(true);
    expect(INSPECTOR_RULES.filter((r) => r.id !== "ENSURE_ALTTEXT").every((r) => !r.disabled)).toBe(true);
  });
});

describe("inspectorRule", () => {
  it("fills the metadata from the ruleset and the arguments, and runs against the project's report", () => {
    const r = inspectorRule("REMOVE_UNUSED_CUSTOM_VISUALS", { category: "Performance", scope: ["Report"] }, (report) => [
      { objectType: "Report", objectName: "Report", objectId: String(report.pages.length) },
    ]);
    expect(r).toMatchObject({
      id: "REMOVE_UNUSED_CUSTOM_VISUALS",
      name: "Remove custom visuals which are not used in the report",
      category: "Performance",
      severity: 2,
      scope: ["Report"],
      layer: "report",
      needs: ["report"],
      status: "ported",
      references: [],
    });
    expect(r.check({}, { indexes: {} as never, options: {} })).toEqual([]);
  });
  it("rejects an id the ruleset does not have", () => {
    expect(() => inspectorRule("NOPE", { category: "Performance", scope: ["Report"] }, () => [])).toThrow(/NOPE/);
  });
  it("is in the default rule set after the model rules", () => {
    expect(defaultRules.slice(-pbiInspectorRules.length).map((r) => r.id)).toEqual(pbiInspectorRules.map((r) => r.id));
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `npx vitest run packages/core/test/define-inspector.test.ts`
Expected: FAIL, modules missing.

- [ ] **Step 3: Implement the vendoring script and the helper**

Create `scripts/vendor-inspector-rules.mjs`:

```js
#!/usr/bin/env node
// Usage: node scripts/vendor-inspector-rules.mjs <Base-rules.json> <commit>
// Writes packages/core/src/rules/pbi-inspector/inspector-rules.data.ts from fab-inspector's base
// ruleset (MIT, Nat Van Gulck). Only the metadata is vendored: the JSON Logic bodies are ported by
// hand as TypeScript, and each port is pinned to the oracle by tests/expectations/*.report.json.
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";

const [src, commit] = process.argv.slice(2);
if (!src || !commit) {
  console.error("usage: node scripts/vendor-inspector-rules.mjs <Base-rules.json> <commit>");
  process.exit(2);
}
const text = readFileSync(src, "utf8");
const sha = createHash("sha256").update(text).digest("hex");
const rules = JSON.parse(text)
  .rules.filter((r) => r.id !== "template")
  .map((r) => ({
    id: r.id,
    name: r.name.replace(/\.$/, ""),
    description: r.description ?? "",
    ...(r.part ? { part: r.part } : {}),
    disabled: r.disabled === true,
  }));
const out = `// Generated by scripts/vendor-inspector-rules.mjs. Do not edit by hand.
// Source: Rules/Base-rules.json from https://github.com/NatVanG/fab-inspector at commit ${commit}
// (MIT License, see NOTICE). Source sha256: ${sha}

export interface InspectorRuleMeta {
  id: string;
  name: string;
  description: string;
  /** "Report" or "Pages" in the source; absent for a report-level rule. */
  part?: string;
  /** Shipped off in the source; pbiplint ships every rule on. */
  disabled: boolean;
}

export const INSPECTOR_RULES: readonly InspectorRuleMeta[] = ${JSON.stringify(rules, null, 2)};
`;
writeFileSync("packages/core/src/rules/pbi-inspector/inspector-rules.data.ts", out);
console.log(`wrote ${rules.length} rules (sha256 ${sha})`);
```

Run: `mkdir -p packages/core/src/rules/pbi-inspector && node scripts/vendor-inspector-rules.mjs "$SCRATCH/fab-inspector/Rules/Base-rules.json" cdaaeec3cca8e97b0fd493e080dfa264f9cd44f8 && npx prettier --write packages/core/src/rules/pbi-inspector/inspector-rules.data.ts`
Expected: `wrote 11 rules (sha256 22868be9…)`.

Create `packages/core/src/rules/pbi-inspector/define.ts`:

```ts
import type { Report } from "../../pbir/types.js";
import { RULE_SUMMARIES } from "../rule-summaries.data.js";
import type { Category, ObjectType, Rule, RuleContext, RuleFinding, RuleOption } from "../types.js";
import { INSPECTOR_RULES, type InspectorRuleMeta } from "./inspector-rules.data.js";

const byId = new Map(INSPECTOR_RULES.map((r) => [r.id, r]));

export const inspectorMetaOf = (id: string): InspectorRuleMeta => {
  const meta = byId.get(id);
  if (!meta) throw new Error(`Unknown PBI Inspector rule id: ${id}`);
  return meta;
};

export interface InspectorRuleSpec {
  /** The source has no categories; the v2 spec (section 8.5) assigns them. */
  category: Category;
  scope: ObjectType[];
  options?: RuleOption[];
}

/**
 * A port of one fab-inspector base rule: the id and name from the vendored ruleset, the category,
 * scope, and options from the spec, the description from the rule page, the behaviour from
 * `check`. Every port is a warning, as the source's CLI reports them. The three deviations from
 * the source are pinned by `ours` in the expectation files and named on the pages.
 */
export function inspectorRule(
  id: string,
  { category, scope, options }: InspectorRuleSpec,
  check: (report: Report, ctx: RuleContext) => RuleFinding[],
): Rule {
  const meta = inspectorMetaOf(id);
  return {
    id,
    name: meta.name,
    category,
    severity: 2,
    scope,
    layer: "report",
    needs: ["report"],
    ...(options ? { options } : {}),
    description: RULE_SUMMARIES[id] ?? meta.name,
    references: [],
    status: "ported",
    check: (project, ctx) => (project.report ? check(project.report, ctx) : []),
  };
}
```

Create `packages/core/src/rules/pbi-inspector/index.ts`, which Tasks 15 to 17 grow:

```ts
import type { Rule } from "../types.js";
import { INSPECTOR_RULES } from "./inspector-rules.data.js";

const order = new Map(INSPECTOR_RULES.map((r, i) => [r.id, i]));

/** The pbi-inspector pack: every base rule, in ruleset order. Tasks 15 to 17 add the rule files. */
export const pbiInspectorRules: Rule[] = [].sort((a: Rule, b: Rule) => order.get(a.id)! - order.get(b.id)!);
```

In `packages/core/src/rules/index.ts`: `export const defaultRules: Rule[] = [PARSE_ISSUE, ...microsoftBpaRules, ...pbiInspectorRules];`. In `packages/core/src/index.ts`: `export { INSPECTOR_RULES, type InspectorRuleMeta } from "./rules/pbi-inspector/inspector-rules.data.js"; export { inspectorRule, inspectorMetaOf, type InspectorRuleSpec } from "./rules/pbi-inspector/define.js"; export { pbiInspectorRules } from "./rules/pbi-inspector/index.js";`.

Append to `NOTICE`, after the Microsoft block:

```
pbiplint also bundles rule metadata derived from Rules/Base-rules.json and
test fixtures derived from FabInspector.Tests/Files/pbip in the
NatVanG/fab-inspector repository (https://github.com/NatVanG/fab-inspector),
which is licensed under the MIT License:

MIT License

Copyright (c) 2024 Nat Van Gulck

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

Change the NOTICE's second sentence to "The MIT license text below applies only to the third-party material described here, not to pbiplint." (already there) and its opening line of the Microsoft block stays.

- [ ] **Step 4: Run the tests**

Run: `npx vitest run packages/core/test/define-inspector.test.ts packages/core/test/pack.test.ts && npm run typecheck`
Expected: PASS (the pack still counts 72 rules, since no port is registered yet).

- [ ] **Step 5: Commit**

```bash
git add scripts/vendor-inspector-rules.mjs packages/core/src/rules/pbi-inspector packages/core/src/rules/index.ts packages/core/src/index.ts NOTICE packages/core/test/define-inspector.test.ts
git commit -m "feat(core): vendor fab-inspector's base ruleset metadata and define inspectorRule"
```

---

### Task 13: Four project fixtures, sanitised, with a smoke test

**Files:**
- Create: `tests/fixtures/base-rules-fails/`, `tests/fixtures/base-rules-passes/`, `tests/fixtures/pbip-and-github-demo/`, `tests/fixtures/shelfmart/` (each a whole PBIP: `X.Report`, `X.SemanticModel`, `X.pbip`)
- Modify: `scripts/sanitize-fixture.mjs` (a project mode)
- Modify: `packages/core/test/helpers.ts` (`readProjectFiles`)
- Test: `scripts/test/sanitize-fixture.test.mjs`, `packages/core/test/fixtures.test.ts`

**Interfaces:**
- Produces: `sanitizeProject(dir): { rewritten: number; removed: number; edited: number }` exported from `scripts/sanitize-fixture.mjs` (the script calls it on `argv[2]` when run directly, like `check-pack.mjs`); `readProjectFiles(root): { model: LintFile[]; report: LintFile[]; modelFolder?: string; reportFolder?: string }` in `packages/core/test/helpers.ts`, mirroring the CLI's reading of a PBIP folder for tests that cannot import the CLI.

- [ ] **Step 1: Write the failing tests**

Create `scripts/test/sanitize-fixture.test.mjs`:

```js
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { sanitizeProject } from "../sanitize-fixture.mjs";

describe("sanitizeProject", () => {
  it("rewrites data paths in TMDL, drops junk, drops resources, and edits report.json to match", () => {
    const root = mkdtempSync(join(tmpdir(), "sanitize-"));
    mkdirSync(join(root, "X.SemanticModel", "definition", "tables"), { recursive: true });
    mkdirSync(join(root, "X.SemanticModel", ".pbi"), { recursive: true });
    mkdirSync(join(root, "X.Report", "StaticResources", "RegisteredResources"), { recursive: true });
    mkdirSync(join(root, "X.Report", "CustomVisuals"), { recursive: true });
    mkdirSync(join(root, "X.Report", "definition"), { recursive: true });
    writeFileSync(join(root, "X.SemanticModel", "definition", "tables", "T.tmdl"), 'partition T = m\n\t\tsource = Csv.Document(File.Contents("C:\\Users\\me\\Secret\\t.csv"))\n');
    writeFileSync(join(root, "X.SemanticModel", ".pbi", "cache.abf"), "");
    writeFileSync(join(root, "X.SemanticModel", "diagramLayout.json"), "{}");
    writeFileSync(join(root, "X.Report", "StaticResources", "RegisteredResources", "logo.png"), "");
    writeFileSync(join(root, "X.Report", "CustomVisuals", "x.pbiviz"), "");
    writeFileSync(join(root, "X.pbix"), "");
    writeFileSync(
      join(root, "X.Report", "definition", "report.json"),
      JSON.stringify({
        themeCollection: { baseTheme: { name: "CY24SU10", type: "SharedResources" }, customTheme: { name: "theme.json", type: "RegisteredResources" } },
        resourcePackages: [
          { name: "SharedResources", type: "SharedResources", items: [] },
          { name: "RegisteredResources", type: "RegisteredResources", items: [{ name: "logo.png" }] },
        ],
      }),
    );
    const counts = sanitizeProject(root);
    expect(counts).toEqual({ rewritten: 1, removed: 5, edited: 1 });
    expect(readFileSync(join(root, "X.SemanticModel", "definition", "tables", "T.tmdl"), "utf8")).toContain('File.Contents("C:\\Demo\\Data\\t.csv")');
    for (const gone of ["X.SemanticModel/.pbi", "X.SemanticModel/diagramLayout.json", "X.Report/StaticResources", "X.Report/CustomVisuals", "X.pbix"])
      expect(existsSync(join(root, gone)), gone).toBe(false);
    const report = JSON.parse(readFileSync(join(root, "X.Report", "definition", "report.json"), "utf8"));
    expect(report.themeCollection).toEqual({ baseTheme: { name: "CY24SU10", type: "SharedResources" } });
    expect(report.resourcePackages).toEqual([{ name: "SharedResources", type: "SharedResources", items: [] }]);
  });
});
```

Create `packages/core/test/fixtures.test.ts`:

```ts
import { existsSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { lint } from "../src/engine/lint.js";
import { fixturesDir, readProjectFiles } from "./helpers.js";

/** The committed project fixtures and the shape each one has (spec section 3.3). */
const PROJECTS = [
  { name: "base-rules-fails", pages: 18, visuals: 96, bookmarks: 2 },
  { name: "base-rules-passes", pages: 13, visuals: 74, bookmarks: 0 },
  { name: "pbip-and-github-demo", pages: 1, visuals: 19, bookmarks: 0 },
  { name: "shelfmart", pages: 1, visuals: 9, bookmarks: 0 },
];

describe.each(PROJECTS)("project fixture $name", ({ name, pages, visuals, bookmarks }) => {
  const root = `${fixturesDir}${name}`;
  const files = readProjectFiles(root);
  const result = lint([...files.model, ...files.report]);
  it("is a whole PBIP with both parts, read without parse issues, rule errors, or diagnostics", () => {
    expect(existsSync(root)).toBe(true);
    expect(files.modelFolder).toMatch(/\.SemanticModel$/);
    expect(files.reportFolder).toMatch(/\.Report$/);
    expect(result.layers.model.present && result.layers.report.present).toBe(true);
    expect(result.findings.filter((f) => f.ruleId === "PARSE_ISSUE")).toEqual([]);
    expect(result.summary.ruleErrors).toEqual([]);
    expect(result.diagnostics).toEqual([]);
  });
  it("has the pages, visuals, and bookmarks the spec counted", () => {
    const report = result.project.report!;
    expect(report.pages.length).toBe(pages);
    expect(report.pages.reduce((n, p) => n + p.visuals.length, 0)).toBe(visuals);
    expect(report.bookmarks.length).toBe(bookmarks);
  });
  it("carries no registered resources, caches, or local paths", () => {
    expect(existsSync(`${root}/${files.reportFolder}/StaticResources`)).toBe(false);
    expect(existsSync(`${root}/${files.modelFolder}/.pbi`)).toBe(false);
    expect(files.model.some((f) => /File\.Contents\("(?!C:\\Demo\\Data\\)/.test(f.text))).toBe(false);
  });
});
```

Add to `packages/core/test/helpers.ts`:

```ts
/** A PBIP folder's two parts as the CLI would read them, for tests that cannot import the CLI. */
export function readProjectFiles(root: string): {
  model: { path: string; text: string }[];
  report: { path: string; text: string }[];
  modelFolder?: string;
  reportFolder?: string;
} {
  const dirs = readdirSync(root, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name);
  const modelFolder = dirs.find((d) => d.endsWith(".SemanticModel"));
  const reportFolder = dirs.find((d) => d.endsWith(".Report"));
  const model = modelFolder ? readModelFiles(join(root, modelFolder)) : [];
  const report: { path: string; text: string }[] = [];
  if (reportFolder) {
    const base = join(root, reportFolder);
    for (const name of ["definition.pbir", ".platform"])
      if (existsSync(join(base, name))) report.push({ path: name, text: readFileSync(join(base, name), "utf8") });
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name, "en"))) {
        const p = join(dir, entry.name);
        if (entry.isDirectory()) walk(p);
        else if (entry.name.endsWith(".json"))
          report.push({ path: relative(base, p).split("\\").join("/"), text: readFileSync(p, "utf8") });
      }
    };
    walk(join(base, "definition"));
    const pbip = readdirSync(root).find((n) => n.endsWith(".pbip"));
    if (pbip) report.push({ path: pbip, text: readFileSync(join(root, pbip), "utf8") });
  }
  return { model, report, modelFolder, reportFolder };
}
```

(add `existsSync` to the `node:fs` import.)

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run scripts/test/sanitize-fixture.test.mjs packages/core/test/fixtures.test.ts`
Expected: FAIL: no `sanitizeProject` export, no fixtures.

- [ ] **Step 3: Extend the sanitiser**

Replace `scripts/sanitize-fixture.mjs`:

```js
#!/usr/bin/env node
// Usage: node scripts/sanitize-fixture.mjs <modelDir | projectDir>
// Rewrites every File.Contents("<path>") in .tmdl files to C:\Demo\Data\<basename>, deletes files
// and folders that do not belong in a fixture (Desktop caches, layouts, registered resources,
// custom visual packages, .pbix), and edits report.json so it no longer names the resources that
// were removed. TMDL carries no data; paths reveal folder names, and resources are binaries
// nothing here reads.
import { readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import { realpathSync } from "node:fs";
import { pathToFileURL } from "node:url";

const JUNK_FILES = new Set([".DS_Store", "cache.abf", "localSettings.json", "diagramLayout.json"]);
const JUNK_DIRS = new Set([".pbi", "StaticResources", "CustomVisuals"]);
const JUNK_SUFFIXES = [".pbix"];

export function sanitizeProject(root) {
  const counts = { rewritten: 0, removed: 0, edited: 0 };
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, entry.name);
      if (entry.isDirectory()) {
        if (JUNK_DIRS.has(entry.name)) {
          rmSync(p, { recursive: true, force: true });
          counts.removed++;
        } else walk(p);
        continue;
      }
      if (JUNK_FILES.has(entry.name) || JUNK_SUFFIXES.some((s) => entry.name.endsWith(s))) {
        rmSync(p);
        counts.removed++;
        continue;
      }
      if (entry.name.endsWith(".tmdl")) {
        const text = readFileSync(p, "utf8");
        const out = text.replace(/File\.Contents\("([^"]+)"\)/g, (_, path) => `File.Contents("C:\\Demo\\Data\\${path.split(/[\\/]/).pop()}")`);
        if (out !== text) {
          writeFileSync(p, out);
          counts.rewritten++;
        }
      } else if (entry.name === "report.json" && basename(dir) === "definition") {
        const json = JSON.parse(readFileSync(p, "utf8"));
        let changed = false;
        if (Array.isArray(json.resourcePackages)) {
          const kept = json.resourcePackages.filter((r) => r.type !== "RegisteredResources");
          if (kept.length !== json.resourcePackages.length) {
            json.resourcePackages = kept;
            changed = true;
          }
        }
        if (json.themeCollection?.customTheme?.type === "RegisteredResources") {
          delete json.themeCollection.customTheme;
          changed = true;
        }
        if (changed) {
          writeFileSync(p, JSON.stringify(json, null, 2) + "\n");
          counts.edited++;
        }
      }
    }
  };
  if (!statSync(root).isDirectory()) throw new Error(`${root} is not a folder`);
  walk(root);
  return counts;
}

function main() {
  const root = process.argv[2];
  if (!root) {
    console.error("usage: node scripts/sanitize-fixture.mjs <modelDir | projectDir>");
    process.exit(2);
  }
  const c = sanitizeProject(root);
  console.log(`${root}: rewrote ${c.rewritten} file(s), removed ${c.removed} item(s), edited ${c.edited} report file(s)`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) main();
```

- [ ] **Step 4: Copy the fixtures in and sanitise them**

```bash
FIX=tests/fixtures
mkdir -p "$FIX/base-rules-fails" "$FIX/base-rules-passes" "$FIX/pbip-and-github-demo" "$FIX/shelfmart"
P="$SCRATCH/fab-inspector/FabInspector.Tests/Files/pbip"
cp -R "$P/Base-rules-fails.Report" "$P/Base-rules-fails.SemanticModel" "$P/Base-rules-fails.pbip" "$FIX/base-rules-fails/"
cp -R "$P/Base-rules-passes.Report" "$P/Base-rules-passes.SemanticModel" "$P/Base-rules-passes.pbip" "$FIX/base-rules-passes/"
D="$HOME/Library/CloudStorage/OneDrive-McKinleyConsulting/Documents/McKinley Consulting/Business Development/PowerBIDemos/PBIP and GitHub Demo"
cp -R "$D/PBIP and GitHub Demo.Report" "$D/PBIP and GitHub Demo.SemanticModel" "$D/PBIP and GitHub Demo.pbip" "$FIX/pbip-and-github-demo/"
S="$HOME/Library/CloudStorage/OneDrive-McKinleyConsulting/Documents/McKinley Consulting/Training/Dashboard in a Day/Archived/Power BI Project Files"
cp -R "$S/ShelfMart Foot Traffic and Weather.Report" "$S/ShelfMart Foot Traffic and Weather.SemanticModel" "$S/ShelfMart Foot Traffic and Weather.pbip" "$FIX/shelfmart/"
for d in base-rules-fails base-rules-passes pbip-and-github-demo shelfmart; do node scripts/sanitize-fixture.mjs "$FIX/$d"; done
du -sh $FIX/*/ && find $FIX -name '.DS_Store' -o -name '*.pbix' -o -name 'cache.abf' | wc -l
```

Expected: four folders, none over 2 MB, the last count 0. Then look at every `report.json` the sanitiser edited and every `visual.json` that names an image resource (`grep -rl RegisteredResources tests/fixtures/*/*.Report/definition`), and confirm nothing under `StaticResources` remains.

- [ ] **Step 5: Run the tests**

Run: `npx vitest run scripts/test/sanitize-fixture.test.mjs packages/core/test/fixtures.test.ts`
Expected: PASS. If `fixtures.test.ts` reports a `schema-newer-than-known` diagnostic, a fixture uses a schema family version above `KNOWN_SCHEMAS`; raise that entry in `packages/core/src/pbir/build.ts` to the version seen (the fab-inspector fixtures are 1.0.0 throughout; ShelfMart's page is 1.3.0 and report 1.2.0; the demo's are 3.2.0, 2.1.0, 2.8.0) and say which in the commit message. If a visual or bookmark count differs from the spec's, count the folders yourself (`find … -name visual.json | wc -l`) and correct the table in the test, noting the spec's number was approximate.

- [ ] **Step 6: Commit**

```bash
git add tests/fixtures scripts/sanitize-fixture.mjs scripts/test/sanitize-fixture.test.mjs packages/core/test/helpers.ts packages/core/test/fixtures.test.ts
git commit -m "test: four whole-PBIP fixtures, sanitised, with a smoke test over both layers"
```

---

### Task 14: The oracle: `scripts/fab-expectations.mjs` and four expectation files

**Files:**
- Create: `scripts/fab-expectations.mjs`
- Create: `tests/expectations/base-rules-fails.report.json`, `base-rules-passes.report.json`, `pbip-and-github-demo.report.json`, `shelfmart.report.json`
- Modify: `docs/RELEASING.md` (a "Report parity expectations" section)
- Test: `scripts/test/fab-expectations.test.mjs`

**Interfaces:**
- Produces: `convertResults(results, pageIdByDisplayName): Record<ruleId, Record<pageIdOrReport, { pass: boolean; actual: unknown }>>` and `enabledRuleset(text): string` exported from the script. The expectation file shape:

```json
{
  "fixture": "tests/fixtures/base-rules-fails",
  "report": "Base-rules-fails.Report",
  "oracle": "fab-inspector CLI 3.4.0 with Base-rules.json sha256 22868be9acd696c96e62f214dbe0efc72fd1bfffda1736b3b9a4d7fba21f883c, every rule enabled",
  "captured": "2026-09-21",
  "deviations": { "RULE_ID": "one sentence" },
  "ours": { "RULE_ID": ["objectId"] },
  "native": { "RULE_ID": ["objectId"] },
  "results": { "RULE_ID": { "<pageId or report>": { "pass": false, "actual": ["visualId"] } } }
}
```

`deviations`, `ours`, and `native` are kept across rewrites; `results` is the oracle's. For `HIDE_TOOLTIP_DRILLTROUGH_PAGES` and `ENSURE_PAGES_DO_NOT_SCROLL_VERTICALLY` the oracle lists page display names; the script translates them to page ids by reading the fixture's `page.json` files and refuses an ambiguous display name.

- [ ] **Step 1: Write the failing test**

Create `scripts/test/fab-expectations.test.mjs`:

```js
import { describe, expect, it } from "vitest";
import { convertResults, enabledRuleset } from "../fab-expectations.mjs";

describe("convertResults", () => {
  it("keys the oracle's results by rule and page, translating display names for the two page-name rules", () => {
    const results = [
      { RuleId: "REDUCE_VISUALS_ON_PAGE", ItemPath: "/definition/pages/abc/page.json", Pass: false, Actual: 25 },
      { RuleId: "REDUCE_VISUALS_ON_PAGE", ItemPath: "/definition/pages/def/page.json", Pass: true, Actual: 3 },
      { RuleId: "ENSURE_ALTTEXT", ItemPath: "/definition/pages/abc/page.json", Pass: false, Actual: ["v1", "v2"] },
      { RuleId: "REDUCE_PAGES", ItemPath: "root", Pass: false, Actual: 13 },
      { RuleId: "HIDE_TOOLTIP_DRILLTROUGH_PAGES", ItemPath: "/definition/report.json", Pass: false, Actual: ["Tips"] },
      { RuleId: "template", ItemPath: "root", Pass: true, Actual: null },
    ];
    expect(convertResults(results, new Map([["Tips", "abc"]]))).toEqual({
      REDUCE_VISUALS_ON_PAGE: { abc: { pass: false, actual: 25 }, def: { pass: true, actual: 3 } },
      ENSURE_ALTTEXT: { abc: { pass: false, actual: ["v1", "v2"] } },
      REDUCE_PAGES: { report: { pass: false, actual: 13 } },
      HIDE_TOOLTIP_DRILLTROUGH_PAGES: { report: { pass: false, actual: ["abc"] } },
    });
    expect(() => convertResults([results[4]], new Map())).toThrow(/no page named "Tips"/);
  });
  it("enables every rule in a copy of the ruleset except the template", () => {
    const enabled = JSON.parse(enabledRuleset(JSON.stringify({ rules: [{ id: "ENSURE_ALTTEXT", disabled: true }, { id: "template", disabled: true }] })));
    expect(enabled.rules).toEqual([{ id: "ENSURE_ALTTEXT", disabled: false }, { id: "template", disabled: true }]);
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `npx vitest run scripts/test/fab-expectations.test.mjs`
Expected: FAIL, module missing.

- [ ] **Step 3: Implement the script**

Create `scripts/fab-expectations.mjs`:

```js
#!/usr/bin/env node
// Convert fab-inspector CLI output into a pbiplint report-parity expectation file.
//
//   node scripts/fab-expectations.mjs <fixtureDir> <out.report.json> --from <TestRun.json>
//   node scripts/fab-expectations.mjs <fixtureDir> <out.report.json> --cli <PBIRInspectorCLI> --rules <Base-rules.json>
//
// With --cli the oracle runs over the fixture's .Report with every rule enabled (the source ships
// ENSURE_ALTTEXT off; pbiplint ships it on). Keeps deviations, ours, and native from an existing
// file. fab-inspector is a development-time oracle only; see docs/RELEASING.md for the macOS
// invocation. Never run in CI.
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdtempSync, readdirSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { pathToFileURL } from "node:url";

/** Rules whose Actual lists page display names rather than ids. */
const DISPLAY_NAME_RULES = new Set(["HIDE_TOOLTIP_DRILLTROUGH_PAGES", "ENSURE_PAGES_DO_NOT_SCROLL_VERTICALLY"]);

export const enabledRuleset = (text) => {
  const json = JSON.parse(text);
  json.rules = json.rules.map((r) => (r.id === "template" ? r : { ...r, disabled: false }));
  return JSON.stringify(json, null, 2);
};

/** `Results[]` keyed by rule id, then by page id or `report`. */
export function convertResults(results, pageIdByDisplayName) {
  const out = {};
  for (const r of results) {
    if (r.RuleId === "template") continue;
    const page = /^\/definition\/pages\/([^/]+)\/page\.json$/.exec(r.ItemPath ?? "")?.[1] ?? "report";
    let actual = r.Actual;
    if (DISPLAY_NAME_RULES.has(r.RuleId) && Array.isArray(actual))
      actual = actual.map((name) => {
        const id = pageIdByDisplayName.get(name);
        if (id === undefined) throw new Error(`${r.RuleId}: no page named "${name}" in the fixture`);
        return id;
      });
    (out[r.RuleId] ??= {})[page] = { pass: r.Pass === true, actual };
  }
  return Object.fromEntries(Object.keys(out).sort().map((id) => [id, out[id]]));
}

function pageIds(reportDir) {
  const map = new Map();
  const pages = join(reportDir, "definition", "pages");
  for (const entry of readdirSync(pages, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const page = JSON.parse(readFileSync(join(pages, entry.name, "page.json"), "utf8"));
    if (map.has(page.displayName) && map.get(page.displayName) !== page.name)
      throw new Error(`two pages are called "${page.displayName}"; the oracle's names cannot be translated`);
    map.set(page.displayName, page.name);
  }
  return map;
}

function main() {
  const [fixtureDir, outPath, ...rest] = process.argv.slice(2);
  const opt = (name) => {
    const i = rest.indexOf(name);
    return i >= 0 ? rest[i + 1] : undefined;
  };
  if (!fixtureDir || !outPath || (!opt("--from") && !(opt("--cli") && opt("--rules")))) {
    console.error("usage: fab-expectations <fixtureDir> <out.report.json> (--from <TestRun.json> | --cli <PBIRInspectorCLI> --rules <Base-rules.json>)");
    process.exit(2);
  }
  const reportFolder = readdirSync(fixtureDir).find((n) => n.endsWith(".Report"));
  if (!reportFolder) throw new Error(`${fixtureDir} holds no .Report folder`);
  const reportDir = join(fixtureDir, reportFolder);
  let raw;
  let oracle;
  if (opt("--from")) {
    raw = readFileSync(opt("--from"), "utf8");
    oracle = opt("--oracle");
  } else {
    const rulesText = readFileSync(opt("--rules"), "utf8");
    const sha = createHash("sha256").update(rulesText).digest("hex");
    const tmp = mkdtempSync(join(tmpdir(), "fab-"));
    const enabled = join(tmp, "Base-rules.enabled.json");
    writeFileSync(enabled, enabledRuleset(rulesText));
    const run = spawnSync(opt("--cli"), ["-fabricitem", reportDir, "-rules", enabled, "-formats", "JSON", "-output", tmp], { encoding: "utf8" });
    if (run.error) throw run.error;
    const file = readdirSync(tmp).find((n) => /^TestRun_.*\.json$/.test(n));
    if (!file) throw new Error(`the oracle wrote no TestRun_*.json to ${tmp}\n${run.stdout}\n${run.stderr}`);
    raw = readFileSync(join(tmp, file), "utf8");
    oracle = `fab-inspector CLI 3.4.0 with Base-rules.json sha256 ${sha}, every rule enabled`;
  }
  const json = JSON.parse(raw.replace(/^\ufeff/, ""));
  const results = convertResults(json.Results, pageIds(reportDir));
  const previous = existsSync(outPath) ? JSON.parse(readFileSync(outPath, "utf8")) : {};
  const out = {
    fixture: relative(process.cwd(), fixtureDir).split("\\").join("/"),
    report: reportFolder,
    oracle: oracle ?? previous.oracle,
    captured: new Date().toISOString().slice(0, 10),
    deviations: previous.deviations ?? {},
    ours: previous.ours ?? {},
    native: previous.native ?? {},
    results,
  };
  writeFileSync(outPath, JSON.stringify(out, null, 2) + "\n");
  const failing = Object.values(results).flatMap((pages) => Object.values(pages)).filter((r) => !r.pass).length;
  console.log(`${outPath}: ${Object.keys(results).length} rules, ${failing} failing results`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) main();
```

- [ ] **Step 4: Fetch the oracle and capture the four expectation files**

```bash
curl -L -o "$SCRATCH/fab-cli.zip" https://github.com/NatVanG/fab-inspector/releases/download/v3.4.0/osx-arm64-CLI.zip
mkdir -p "$SCRATCH/fab-cli" && unzip -q "$SCRATCH/fab-cli.zip" -d "$SCRATCH/fab-cli"
CLI=$(find "$SCRATCH/fab-cli" -name PBIRInspectorCLI -type f | head -1); chmod +x "$CLI"; xattr -dr com.apple.quarantine "$SCRATCH/fab-cli" 2>/dev/null
export DOTNET_ROOT=/opt/homebrew/Cellar/dotnet/10.0.400/libexec DOTNET_ROLL_FORWARD=Major
for f in base-rules-fails base-rules-passes pbip-and-github-demo shelfmart; do
  node scripts/fab-expectations.mjs "tests/fixtures/$f" "tests/expectations/$f.report.json" --cli "$CLI" --rules "$SCRATCH/fab-inspector/Rules/Base-rules.json"
done
```

Expected: four files. Sanity checks against spec section 3.2 (captured with ENSURE_ALTTEXT off there, so alt-text failures are extra here): `base-rules-fails` fails on the rules the fab-inspector repository's own tests expect (10 results plus alt text); `base-rules-passes` fails `REDUCE_PAGES` (13 pages) plus any alt text; the demo fails `REDUCE_OBJECTS_WITHIN_VISUALS` and `REDUCE_ADVANCED_FILTERS` plus alt text on every non-shape visual. If `DOTNET_ROOT` is wrong, `ls /opt/homebrew/Cellar/dotnet/` shows the version to use.

Add to `docs/RELEASING.md`, before "The hyphenated name, settled":

```markdown
## Report parity expectations

The report rules are pinned to fab-inspector, a development-time oracle only. Refresh the
expectation files when a fixture changes or when the port source moves to a new commit:

1. Clone the ruleset and fixtures at the pinned commit (see `packages/core/src/rules/pbi-inspector/inspector-rules.data.ts` for the commit and sha):
   `git clone --filter=blob:none --sparse --no-checkout https://github.com/NatVanG/fab-inspector.git && cd fab-inspector && git sparse-checkout set FabInspector.Tests/Files/pbip Rules && git checkout <commit>`
2. Download `osx-arm64-CLI.zip` from the fab-inspector release the expectation files name, unzip it, and clear the quarantine flag. It needs the Homebrew .NET:
   `export DOTNET_ROOT=/opt/homebrew/Cellar/dotnet/<version>/libexec DOTNET_ROLL_FORWARD=Major`
3. For each fixture: `node scripts/fab-expectations.mjs tests/fixtures/<name> tests/expectations/<name>.report.json --cli <path to PBIRInspectorCLI> --rules <path to Base-rules.json>`. The script runs the oracle with every rule enabled and keeps `deviations`, `ours`, and `native` from the existing file.
4. `npm test`. A difference that is not one of the documented deviations is a bug in a port or a change in the source; do not add a deviation without the procedure in CONTRIBUTING.
```

- [ ] **Step 5: Run the tests and commit**

Run: `npx vitest run scripts/test/fab-expectations.test.mjs packages/core/test/parity.test.ts`
Expected: the script test passes; `parity.test.ts` still passes because Task 15 filters `.report.json` out of it, so do Task 15's first step now if it fails on the new files' shape, then commit both together there. Otherwise:

```bash
git add scripts/fab-expectations.mjs scripts/test/fab-expectations.test.mjs tests/expectations/*.report.json docs/RELEASING.md
git commit -m "test: fab-inspector oracle expectations for the four project fixtures"
```

---

### Task 15: The report parity harness and the five count rules

**Files:**
- Create: `packages/core/test/report-parity.test.ts`, `packages/core/test/report-helpers.ts`, `packages/core/test/rules-report-counts.test.ts`
- Create: `packages/core/src/rules/pbi-inspector/counts.ts`
- Modify: `packages/core/src/rules/pbi-inspector/index.ts`, `packages/core/test/parity.test.ts`, `packages/core/test/pack.test.ts`; not `packages/web/test/generate.test.ts`, whose pins hold at 72 (decision 15)

**Interfaces:**
- Produces: `REDUCE_VISUALS_ON_PAGE` (option `max` 20), `REDUCE_OBJECTS_WITHIN_VISUALS` (`max` 6, deviation), `REDUCE_TOPN_FILTERS` (`max` 4), `REDUCE_ADVANCED_FILTERS` (`max` 4, deviation), `REDUCE_PAGES` (`max` 10); test helpers `projectFrom(reportFiles, tmdl?)` and `reportObjectIds(rule, reportFiles, tmdl?, options?)`; the parity test's `NOT_YET_PORTED` set holding the six ids Tasks 16 and 17 port.

- [ ] **Step 1: Write the parity harness and the unit tests**

Create `packages/core/test/report-helpers.ts`:

```ts
import { buildIndexes } from "../src/index/build.js";
import type { LintFile } from "../src/engine/lint.js";
import { optionsFor } from "../src/engine/run.js";
import { resolveConfig } from "../src/engine/config.js";
import { buildReport } from "../src/pbir/build.js";
import type { Project } from "../src/project/types.js";
import type { Rule } from "../src/rules/types.js";
import { modelFrom } from "./helpers.js";

export const j = (v: unknown): string => JSON.stringify(v);
export const column = (entity: string, property: string) => ({ Column: { Expression: { SourceRef: { Entity: entity } }, Property: property } });
export const measure = (entity: string, property: string) => ({ Measure: { Expression: { SourceRef: { Entity: entity } }, Property: property } });
export const lit = (value: string) => ({ expr: { Literal: { Value: value } } });

/** A page file with defaults a Desktop page has. */
export const page = (name: string, extra: Record<string, unknown> = {}): LintFile => ({
  path: `definition/pages/${name}/page.json`,
  text: j({ name, displayName: `Page ${name}`, displayOption: "FitToPage", height: 720, width: 1280, ...extra }),
});
/** A visual file on a page; `container` goes beside `visual`, `inner` inside it. */
export const visual = (pageId: string, name: string, type: string, container: Record<string, unknown> = {}, inner: Record<string, unknown> = {}): LintFile => ({
  path: `definition/pages/${pageId}/visuals/${name}/visual.json`,
  text: j({ name, position: { x: 0, y: 0, z: 0, height: 100, width: 100, tabOrder: 0 }, ...container, visual: { visualType: type, ...inner } }),
});
/** A visual whose roles bind the given fields. */
export const bound = (pageId: string, name: string, type: string, fields: unknown[], container: Record<string, unknown> = {}): LintFile =>
  visual(pageId, name, type, container, { query: { queryState: { Values: { projections: fields.map((field) => ({ field })) } } } });

export function projectFrom(reportFiles: LintFile[], tmdl?: string): Project {
  const { report } = buildReport(reportFiles);
  return tmdl === undefined ? { report } : { report, model: modelFrom(tmdl) };
}

/** Run one rule and return the object ids it flags, in emission order. */
export function reportObjectIds(rule: Rule, reportFiles: LintFile[], tmdl?: string, options: Record<string, unknown> = {}): string[] {
  const project = projectFrom(reportFiles, tmdl);
  // optionsFor reads the config's options by the rule's own id, so the map is set directly.
  const config = resolveConfig();
  if (Object.keys(options).length) config.options.set(rule.id, options);
  return rule
    .check(project, { indexes: buildIndexes(project), options: optionsFor(rule, config) })
    .map((f) => f.objectId ?? f.objectName);
}
```

Create `packages/core/test/report-parity.test.ts`:

```ts
import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { lint } from "../src/engine/lint.js";
import { INSPECTOR_RULES } from "../src/rules/pbi-inspector/inspector-rules.data.js";
import { defaultRules } from "../src/rules/index.js";
import { readProjectFiles } from "./helpers.js";

interface OracleResult { pass: boolean; actual: unknown }
interface Expectation {
  name: string;
  fixture: string;
  report: string;
  deviations: Record<string, string>;
  ours: Record<string, string[]>;
  native: Record<string, string[]>;
  results: Record<string, Record<string, OracleResult>>;
}

/** Rules the ruleset has that no task has ported yet; Tasks 16 and 17 empty it and Task 17 deletes it. */
const NOT_YET_PORTED = new Set([
  "REMOVE_UNUSED_CUSTOM_VISUALS",
  "AVOID_SHOW_ITEMS_WITH_NO_DATA",
  "HIDE_TOOLTIP_DRILLTROUGH_PAGES",
  "ENSURE_THEME_COLOURS",
  "ENSURE_PAGES_DO_NOT_SCROLL_VERTICALLY",
  "ENSURE_ALTTEXT",
]);

const repoRoot = new URL("../../../", import.meta.url).pathname;
const expectationsDir = repoRoot + "tests/expectations/";
const expectations: Expectation[] = readdirSync(expectationsDir)
  .filter((f) => f.endsWith(".report.json"))
  .map((f) => ({ name: f.replace(/\.report\.json$/, ""), ...(JSON.parse(readFileSync(expectationsDir + f, "utf8")) as Omit<Expectation, "name">) }));

const ported = defaultRules.filter((r) => r.status === "ported" && r.layer === "report");

/** What the oracle says fails, as object ids: a list rule's names, a count rule's page (or `report`). */
export function oracleIds(pages: Record<string, OracleResult> | undefined): string[] {
  if (!pages) return [];
  return Object.entries(pages)
    .filter(([, r]) => !r.pass)
    .flatMap(([page, r]) => (Array.isArray(r.actual) ? (r.actual as string[]) : [page]))
    .sort();
}

describe.each(expectations)("parity with fab-inspector: $name", (exp) => {
  const files = readProjectFiles(repoRoot + exp.fixture);
  const result = lint([...files.model, ...files.report], { config: { failOn: "none" } });
  const ours: Record<string, string[]> = {};
  for (const f of result.findings) (ours[f.ruleId] ??= []).push(f.objectId ?? f.objectName);

  it("reads both parts without parse issues or rule errors", () => {
    expect(files.report.length).toBeGreaterThan(0);
    expect(result.findings.filter((f) => f.ruleId === "PARSE_ISSUE")).toEqual([]);
    expect(result.summary.ruleErrors).toEqual([]);
  });
  it.each(ported.map((r) => [r.id] as const))("%s", (id) => {
    const expected = exp.deviations[id] !== undefined ? [...(exp.ours[id] ?? [])].sort() : oracleIds(exp.results[id]);
    expect([...(ours[id] ?? [])].sort()).toEqual(expected);
  });
  it("has every rule the oracle failed ported, or listed as not yet ported", () => {
    const failed = Object.entries(exp.results).filter(([, pages]) => Object.values(pages).some((r) => !r.pass)).map(([id]) => id);
    const missing = failed.filter((id) => !ported.some((r) => r.id === id) && !NOT_YET_PORTED.has(id));
    expect(missing).toEqual([]);
  });
  it("shows the difference each deviation names, and names only ported rules", () => {
    for (const id of Object.keys(exp.deviations)) {
      expect(INSPECTOR_RULES.some((r) => r.id === id), id).toBe(true);
      expect(exp.ours[id], `${id}: ours`).toBeDefined();
      // A deviation with no visible difference on this fixture is either unneeded here or wrong.
      expect([...exp.ours[id]!].sort(), `${id}: ours must differ from the oracle on ${exp.name}`).not.toEqual(oracleIds(exp.results[id]));
    }
  });
});

describe("report parity coverage", () => {
  it("fires every ported report rule on at least one fixture", () => {
    const fired = new Set<string>();
    for (const exp of expectations)
      for (const id of Object.keys(exp.results)) if (oracleIds(exp.results[id]).length || (exp.ours[id] ?? []).length) fired.add(id);
    const silent = ported.map((r) => r.id).filter((id) => !fired.has(id));
    expect(silent).toEqual([]);
  });
});
```

Add to `packages/core/test/parity.test.ts`'s file filter: `.filter((f) => f.endsWith(".json") && !f.endsWith(".report.json"))`.

Create `packages/core/test/rules-report-counts.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import * as rules from "../src/rules/pbi-inspector/counts.js";
import { bound, column, j, page, reportObjectIds, visual } from "./report-helpers.js";

const pages = (n: number) => Array.from({ length: n }, (_, i) => page(`p${i}`));
const many = (pageId: string, n: number, type = "cardVisual", container = {}) => Array.from({ length: n }, (_, i) => visual(pageId, `${type}${i}`, type, container));

describe("REDUCE_VISUALS_ON_PAGE", () => {
  it("counts visible visuals that are not shapes, slicers, buttons, or text boxes, against max", () => {
    const over = [page("p"), ...many("p", 21)];
    expect(reportObjectIds(rules.REDUCE_VISUALS_ON_PAGE, over)).toEqual(["p"]);
    const excluded = [page("p"), ...many("p", 20), ...many("p", 3, "slicer"), ...many("p", 3, "shape"), ...many("p", 3, "actionButton"), ...many("p", 3, "textbox"), visual("p", "hidden", "cardVisual", { isHidden: true })];
    expect(reportObjectIds(rules.REDUCE_VISUALS_ON_PAGE, excluded)).toEqual([]);
    expect(reportObjectIds(rules.REDUCE_VISUALS_ON_PAGE, over, undefined, { max: 25 })).toEqual([]);
    expect(reportObjectIds(rules.REDUCE_VISUALS_ON_PAGE, [page("p"), ...many("p", 3)], undefined, { max: 2 })).toEqual(["p"]);
  });
});

describe("REDUCE_OBJECTS_WITHIN_VISUALS", () => {
  it("counts the fields bound to a visual's roles once, against max", () => {
    const seven = Array.from({ length: 7 }, (_, i) => column("T", `C${i}`));
    const files = [page("p"), bound("p", "seven", "tableEx", seven), bound("p", "six", "tableEx", seven.slice(0, 6))];
    expect(reportObjectIds(rules.REDUCE_OBJECTS_WITHIN_VISUALS, files)).toEqual(["seven"]);
    expect(reportObjectIds(rules.REDUCE_OBJECTS_WITHIN_VISUALS, files, undefined, { max: 7 })).toEqual([]);
  });
});

describe("REDUCE_TOPN_FILTERS and REDUCE_ADVANCED_FILTERS", () => {
  const filtered = (pageId: string, n: number, type: string, applied: boolean) =>
    Array.from({ length: n }, (_, i) =>
      visual(pageId, `${type}${i}`, "cardVisual", { filterConfig: { filters: [{ name: "f", field: column("T", "C"), type, ...(applied ? { filter: { Where: [] } } : {}) }] } }),
    );
  it("counts visuals with a TopN filter, applied or not, against max", () => {
    expect(reportObjectIds(rules.REDUCE_TOPN_FILTERS, [page("p"), ...filtered("p", 5, "TopN", false)])).toEqual(["p"]);
    expect(reportObjectIds(rules.REDUCE_TOPN_FILTERS, [page("p"), ...filtered("p", 4, "TopN", true)])).toEqual([]);
  });
  it("counts only Advanced filters with a condition applied, which is the documented deviation", () => {
    expect(reportObjectIds(rules.REDUCE_ADVANCED_FILTERS, [page("p"), ...filtered("p", 5, "Advanced", true)])).toEqual(["p"]);
    expect(reportObjectIds(rules.REDUCE_ADVANCED_FILTERS, [page("p"), ...filtered("p", 5, "Advanced", false)])).toEqual([]);
  });
});

describe("REDUCE_PAGES", () => {
  it("fires on the report when there are more pages than max", () => {
    expect(reportObjectIds(rules.REDUCE_PAGES, [{ path: "definition/report.json", text: j({}) }, ...pages(11)])).toEqual(["report"]);
    expect(reportObjectIds(rules.REDUCE_PAGES, pages(10))).toEqual([]);
    expect(reportObjectIds(rules.REDUCE_PAGES, pages(3), undefined, { max: 2 })).toEqual(["report"]);
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run packages/core/test/rules-report-counts.test.ts packages/core/test/report-parity.test.ts`
Expected: FAIL, `counts.js` missing; parity's "every rule the oracle failed" fails for the five count rules.

- [ ] **Step 3: Implement the five rules**

Create `packages/core/src/rules/pbi-inspector/counts.ts`:

```ts
import type { Report } from "../../pbir/types.js";
import { allVisuals, reportFinding } from "../report-helpers.js";
import type { RuleContext } from "../types.js";
import { inspectorRule } from "./define.js";

/** The source leaves these out of the per-page count: they cost no query. */
const NOT_COUNTED = new Set(["shape", "slicer", "actionButton", "textbox"]);
const max = (ctx: RuleContext, name = "max"): number => Number(ctx.options[name]);

export const REDUCE_VISUALS_ON_PAGE = inspectorRule(
  "REDUCE_VISUALS_ON_PAGE",
  { category: "Performance", scope: ["Page"], options: [{ name: "max", type: "number", default: 20 }] },
  (report, ctx) =>
    report.pages.flatMap((p) => {
      // A visual group container is counted, as the source counts everything with no excluded type.
      const n = p.visuals.filter((v) => !v.isHidden && !NOT_COUNTED.has(v.type)).length;
      return n > max(ctx) ? [reportFinding.page(p, undefined, `${n} visible visuals, more than ${max(ctx)}`)] : [];
    }),
);

/** Deviation: the fields bound to the visual's roles, once each, not every `projections` array in the file. */
export const REDUCE_OBJECTS_WITHIN_VISUALS = inspectorRule(
  "REDUCE_OBJECTS_WITHIN_VISUALS",
  { category: "Performance", scope: ["Visual"], options: [{ name: "max", type: "number", default: 6 }] },
  (report, ctx) =>
    allVisuals(report).flatMap((v) =>
      v.fields.length > max(ctx) ? [reportFinding.visual(v, "/visual/query", `${v.fields.length} fields bound, more than ${max(ctx)}`)] : [],
    ),
);

const pagesWithFilteredVisuals = (report: Report, ctx: RuleContext, keep: (type: string | undefined, applied: boolean) => boolean, what: string) =>
  report.pages.flatMap((p) => {
    const n = p.visuals.filter((v) => v.filters.some((f) => keep(f.type, f.applied))).length;
    return n > max(ctx) ? [reportFinding.page(p, undefined, `${n} visuals with ${what}, more than ${max(ctx)}`)] : [];
  });

export const REDUCE_TOPN_FILTERS = inspectorRule(
  "REDUCE_TOPN_FILTERS",
  { category: "Performance", scope: ["Page"], options: [{ name: "max", type: "number", default: 4 }] },
  (report, ctx) => pagesWithFilteredVisuals(report, ctx, (type) => type === "TopN", "a TopN filter"),
);

/** Deviation: only Advanced filters with a condition applied; one with nothing set, such as a slicer's or one Desktop writes for a visual's own fields, is not counted. */
export const REDUCE_ADVANCED_FILTERS = inspectorRule(
  "REDUCE_ADVANCED_FILTERS",
  { category: "Performance", scope: ["Page"], options: [{ name: "max", type: "number", default: 4 }] },
  (report, ctx) => pagesWithFilteredVisuals(report, ctx, (type, applied) => type === "Advanced" && applied, "an Advanced filter applied"),
);

export const REDUCE_PAGES = inspectorRule(
  "REDUCE_PAGES",
  { category: "Performance", scope: ["Report"], options: [{ name: "max", type: "number", default: 10 }] },
  (report, ctx) =>
    report.pages.length > max(ctx) ? [reportFinding.report(report, `${report.pages.length} pages, more than ${max(ctx)}`)] : [],
);

export const countRules = [REDUCE_VISUALS_ON_PAGE, REDUCE_OBJECTS_WITHIN_VISUALS, REDUCE_TOPN_FILTERS, REDUCE_ADVANCED_FILTERS, REDUCE_PAGES];
```

In `pbi-inspector/index.ts`: `export const pbiInspectorRules: Rule[] = [...countRules].sort(...)`. In `packages/core/test/pack.test.ts` set the count to `77`. `packages/web/test/generate.test.ts` does not move: the site's page count and index sentence hold at 72 through pull requests 2 to 6, because the site publishes the model layer only (decision 15). (the pages come in Task 18; until then the rule-pages test will report five missing pages, which is expected and is why Tasks 15 to 19 are one pull request; run the parity and unit files, not the rule-pages file, until Task 18).

- [ ] **Step 4: Run the tests and record the two deviations**

Run: `npx vitest run packages/core/test/rules-report-counts.test.ts packages/core/test/report-parity.test.ts`
Expected: the unit tests PASS. Parity for `REDUCE_OBJECTS_WITHIN_VISUALS` and `REDUCE_ADVANCED_FILTERS` FAILS where the oracle counts differently (for the latter, the demo report's page, whose Advanced filters with nothing set are a date slicer's and four data visuals' own per-field entries, per spec 3.2). For each failing rule and fixture: read the two lists; confirm every difference is exactly the deviation sentence (a visual counted twice through a second `projections` array; an Advanced filter with no `filter`, a slicer's or a visual's own per-field entry); then add the sentence under `deviations` and pbiplint's sorted ids under `ours` in that fixture's `.report.json`. Where the lists agree on a fixture, add nothing for that fixture. A difference the sentence does not explain is a port bug: fix the port. Re-run: PASS. The parity test still reports the six `NOT_YET_PORTED` rules as tolerated.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/rules/pbi-inspector packages/core/test tests/expectations
git commit -m "feat(rules): port the five fab-inspector count rules with parity, two deviations recorded"
```

---

### Task 16: Ports: unused custom visuals, tooltip and drillthrough pages, tall pages

**Files:**
- Create: `packages/core/src/rules/pbi-inspector/report.ts`, `packages/core/src/rules/pbi-inspector/pages.ts`
- Modify: `packages/core/src/rules/pbi-inspector/index.ts`, `packages/core/test/report-parity.test.ts` (`NOT_YET_PORTED` shrinks by three), `packages/core/test/pack.test.ts` (80); not `packages/web/test/generate.test.ts`, whose pins hold at 72 (decision 15)
- Test: `packages/core/test/rules-report-pages.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `packages/core/test/rules-report-pages.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { HIDE_TOOLTIP_DRILLTROUGH_PAGES, ENSURE_PAGES_DO_NOT_SCROLL_VERTICALLY } from "../src/rules/pbi-inspector/pages.js";
import { REMOVE_UNUSED_CUSTOM_VISUALS } from "../src/rules/pbi-inspector/report.js";
import { j, page, reportObjectIds, visual } from "./report-helpers.js";

describe("REMOVE_UNUSED_CUSTOM_VISUALS", () => {
  it("names each registered custom visual no visual uses", () => {
    const files = [
      { path: "definition/report.json", text: j({ publicCustomVisuals: ["ChicletSlicer1448559807354", "Used123"] }) },
      page("p"),
      visual("p", "v", "Used123"),
    ];
    expect(reportObjectIds(REMOVE_UNUSED_CUSTOM_VISUALS, files)).toEqual(["ChicletSlicer1448559807354"]);
    expect(reportObjectIds(REMOVE_UNUSED_CUSTOM_VISUALS, [{ path: "definition/report.json", text: j({}) }, page("p")])).toEqual([]);
  });
});

describe("HIDE_TOOLTIP_DRILLTROUGH_PAGES", () => {
  it("fires on a tooltip or drillthrough page that readers can see", () => {
    const files = [
      page("tip", { pageBinding: { type: "Tooltip" } }),
      page("drill", { pageBinding: { type: "Drillthrough" }, visibility: "AlwaysVisible" }),
      page("hiddenTip", { pageBinding: { type: "Tooltip" }, visibility: "HiddenInViewMode" }),
      page("plain"),
    ];
    expect(reportObjectIds(HIDE_TOOLTIP_DRILLTROUGH_PAGES, files)).toEqual(["tip", "drill"]);
  });
});

describe("ENSURE_PAGES_DO_NOT_SCROLL_VERTICALLY", () => {
  it("fires on a visible page taller than maxHeight", () => {
    const files = [page("tall", { height: 721 }), page("ok", { height: 720 }), page("hiddenTall", { height: 2000, visibility: "HiddenInViewMode" })];
    expect(reportObjectIds(ENSURE_PAGES_DO_NOT_SCROLL_VERTICALLY, files)).toEqual(["tall"]);
    expect(reportObjectIds(ENSURE_PAGES_DO_NOT_SCROLL_VERTICALLY, files, undefined, { maxHeight: 1080 })).toEqual([]);
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run packages/core/test/rules-report-pages.test.ts`
Expected: FAIL, modules missing.

- [ ] **Step 3: Implement**

Create `packages/core/src/rules/pbi-inspector/report.ts`:

```ts
import { allVisuals, reportFinding } from "../report-helpers.js";
import { inspectorRule } from "./define.js";

export const REMOVE_UNUSED_CUSTOM_VISUALS = inspectorRule(
  "REMOVE_UNUSED_CUSTOM_VISUALS",
  { category: "Performance", scope: ["Report"] },
  (report) => {
    const used = new Set(allVisuals(report).map((v) => v.type));
    // One finding per unused visual, with its type name as the object id, which is what the oracle lists.
    return report.publicCustomVisuals.filter((name) => !used.has(name)).map((name) => reportFinding.report(report, `${name} is registered but no visual uses it`, name));
  },
);

export const reportRules = [REMOVE_UNUSED_CUSTOM_VISUALS];
```

Create `packages/core/src/rules/pbi-inspector/pages.ts`:

```ts
import { isHiddenPage, reportFinding, visiblePages } from "../report-helpers.js";
import { inspectorRule } from "./define.js";

const BOUND_TYPES = new Set(["Tooltip", "Drillthrough"]);

export const HIDE_TOOLTIP_DRILLTROUGH_PAGES = inspectorRule(
  "HIDE_TOOLTIP_DRILLTROUGH_PAGES",
  { category: "Report Design", scope: ["Page"] },
  (report) =>
    report.pages
      .filter((p) => p.bindingType !== undefined && BOUND_TYPES.has(p.bindingType) && !isHiddenPage(p))
      .map((p) => reportFinding.page(p, "/pageBinding", `${p.bindingType!.toLowerCase()} page is visible to readers`)),
);

export const ENSURE_PAGES_DO_NOT_SCROLL_VERTICALLY = inspectorRule(
  "ENSURE_PAGES_DO_NOT_SCROLL_VERTICALLY",
  { category: "Report Design", scope: ["Page"], options: [{ name: "maxHeight", type: "number", default: 720 }] },
  (report, ctx) =>
    visiblePages(report)
      .filter((p) => (p.height ?? 0) > Number(ctx.options.maxHeight))
      .map((p) => reportFinding.page(p, "/height", `height ${p.height}, more than ${ctx.options.maxHeight}`)),
);

export const pageRules = [HIDE_TOOLTIP_DRILLTROUGH_PAGES, ENSURE_PAGES_DO_NOT_SCROLL_VERTICALLY];
```

Register both lists in `pbi-inspector/index.ts`; remove the three ids from `NOT_YET_PORTED`; set the pack count to 80.

- [ ] **Step 4: Run the tests**

Run: `npx vitest run packages/core/test/rules-report-pages.test.ts packages/core/test/report-parity.test.ts packages/core/test/pack.test.ts`
Expected: PASS with no new deviation. If parity differs for any of the three, apply the escalation rule at the top of this pull request.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/rules/pbi-inspector packages/core/test
git commit -m "feat(rules): port unused custom visuals, visible tooltip pages, and tall pages"
```

---

### Task 17: Ports: show items with no data, theme colours, alt text

**Files:**
- Create: `packages/core/src/rules/pbi-inspector/visuals.ts`
- Modify: `packages/core/src/rules/pbi-inspector/index.ts`, `packages/core/test/report-parity.test.ts` (delete `NOT_YET_PORTED` and its use), `packages/core/test/pack.test.ts` (83); not `packages/web/test/generate.test.ts`, whose pins hold at 72 (decision 15); the expectation files (`deviations`/`ours` for `ENSURE_THEME_COLOURS`)
- Test: `packages/core/test/rules-report-visuals.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `packages/core/test/rules-report-visuals.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { AVOID_SHOW_ITEMS_WITH_NO_DATA, ENSURE_ALTTEXT, ENSURE_THEME_COLOURS } from "../src/rules/pbi-inspector/visuals.js";
import { column, lit, page, reportObjectIds, visual } from "./report-helpers.js";

const solid = (value: string) => ({ solid: { color: lit(value) } });

describe("AVOID_SHOW_ITEMS_WITH_NO_DATA", () => {
  it("fires on a visual with showAll on any role", () => {
    const files = [
      page("p"),
      visual("p", "cat", "clusteredBarChart", {}, { query: { queryState: { Category: { projections: [{ field: column("T", "C") }], showAll: true } } } }),
      visual("p", "rows", "pivotTable", {}, { query: { queryState: { Rows: { projections: [{ field: column("T", "C") }], showAll: true } } } }),
      visual("p", "off", "clusteredBarChart", {}, { query: { queryState: { Category: { projections: [{ field: column("T", "C") }], showAll: false } } } }),
    ];
    expect(reportObjectIds(AVOID_SHOW_ITEMS_WITH_NO_DATA, files)).toEqual(["cat", "rows"]);
  });
});

describe("ENSURE_THEME_COLOURS", () => {
  it("fires on a hex literal in a colour property, not on hex-looking text, and never on a text box", () => {
    const files = [
      page("p"),
      visual("p", "hex", "cardVisual", {}, { objects: { dataPoint: [{ properties: { fill: solid("'#1F77B4'") } }] } }),
      visual("p", "short", "cardVisual", {}, { visualContainerObjects: { background: [{ properties: { color: solid("'#FFF'") } }] } }),
      visual("p", "theme", "cardVisual", {}, { objects: { dataPoint: [{ properties: { fill: { solid: { color: { expr: { ThemeDataColor: { ColorId: 1, Percent: 0 } } } } } } }] } }),
      visual("p", "text", "cardVisual", {}, { visualContainerObjects: { title: [{ properties: { text: lit("'Ref #ABCDEF'") } }] } }),
      visual("p", "textbox", "textbox", {}, { objects: { general: [{ properties: { paragraphs: [{ textRuns: [{ value: "x", textStyle: { color: "#FF0000" } }] }] } }] } }),
    ];
    expect(reportObjectIds(ENSURE_THEME_COLOURS, files)).toEqual(["hex", "short"]);
  });
});

describe("ENSURE_ALTTEXT", () => {
  it("fires on a visual with no alt text or empty alt text, and not on a shape or a bound expression", () => {
    const files = [
      page("p"),
      visual("p", "none", "cardVisual"),
      visual("p", "empty", "cardVisual", {}, { visualContainerObjects: { general: [{ properties: { altText: lit("''") } }] } }),
      visual("p", "text", "cardVisual", {}, { visualContainerObjects: { general: [{ properties: { altText: lit("'Total sales as a card'") } }] } }),
      visual("p", "bound", "cardVisual", {}, { visualContainerObjects: { general: [{ properties: { altText: { expr: { Aggregation: { Expression: column("T", "C"), Function: 0 } } } } }] } }),
      visual("p", "shape", "shape"),
    ];
    expect(reportObjectIds(ENSURE_ALTTEXT, files)).toEqual(["none", "empty"]);
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run packages/core/test/rules-report-visuals.test.ts`
Expected: FAIL, module missing.

- [ ] **Step 3: Implement**

Create `packages/core/src/rules/pbi-inspector/visuals.ts`:

```ts
import { escapePointer } from "../../pbir/refs.js";
import { literal } from "../../pbir/build.js";
import { allVisuals, reportFinding } from "../report-helpers.js";
import { inspectorRule } from "./define.js";

export const AVOID_SHOW_ITEMS_WITH_NO_DATA = inspectorRule(
  "AVOID_SHOW_ITEMS_WITH_NO_DATA",
  { category: "Performance", scope: ["Visual"] },
  (report) =>
    allVisuals(report)
      .filter((v) => v.showAllRoles.length > 0)
      .map((v) =>
        reportFinding.visual(v, `/visual/query/queryState/${escapePointer(v.showAllRoles[0]!)}/showAll`, `Show items with no data is on for ${v.showAllRoles.join(", ")}`),
      ),
);

const HEX = /^#(?:[A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/;
const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

/** JSON pointers of every `solid.color` literal that is a hex value, which is how PBIR writes a colour set by hand. */
function hexColourPointers(node: unknown, pointer = ""): string[] {
  if (Array.isArray(node)) return node.flatMap((item, i) => hexColourPointers(item, `${pointer}/${i}`));
  if (!isRecord(node)) return [];
  const out: string[] = [];
  if (isRecord(node.solid)) {
    const value = literal(node.solid.color);
    if (value !== undefined && HEX.test(value)) out.push(`${pointer}/solid/color`);
  }
  for (const [key, value] of Object.entries(node)) out.push(...hexColourPointers(value, `${pointer}/${escapePointer(key)}`));
  return out;
}

/** Deviation: hex literals in colour properties only, where the source matches the pattern anywhere in the visual's text. */
export const ENSURE_THEME_COLOURS = inspectorRule(
  "ENSURE_THEME_COLOURS",
  { category: "Report Design", scope: ["Visual"] },
  (report) =>
    allVisuals(report)
      .filter((v) => v.type !== "textbox")
      .flatMap((v) => {
        const pointers = hexColourPointers(v.json);
        return pointers.length ? [reportFinding.visual(v, pointers[0], `${pointers.length} colour${pointers.length === 1 ? "" : "s"} set to a hex value instead of a theme colour`)] : [];
      }),
);

export const ENSURE_ALTTEXT = inspectorRule(
  "ENSURE_ALTTEXT",
  { category: "Accessibility", scope: ["Visual"] },
  (report) =>
    allVisuals(report)
      .filter((v) => v.type !== "shape" && v.altText === undefined)
      .map((v) => reportFinding.visual(v, "/visual/visualContainerObjects", "no alt text")),
);

export const visualRules = [AVOID_SHOW_ITEMS_WITH_NO_DATA, ENSURE_THEME_COLOURS, ENSURE_ALTTEXT];
```

Register `visualRules` in `pbi-inspector/index.ts`; delete `NOT_YET_PORTED` and the clause that reads it from `report-parity.test.ts`; set both counts to 83.

- [ ] **Step 4: Run the tests and record the theme-colour deviation**

Run: `npx vitest run packages/core/test/rules-report-visuals.test.ts packages/core/test/report-parity.test.ts packages/core/test/pack.test.ts`
Expected: unit tests PASS. Parity for `ENSURE_THEME_COLOURS` FAILS where the oracle matched a hex pattern outside a colour property; confirm each difference is that, then record the sentence and `ours` as in Task 15. `AVOID_SHOW_ITEMS_WITH_NO_DATA` and `ENSURE_ALTTEXT` must agree with the oracle on every fixture; a difference is the escalation case named at the top of this pull request (the visual-group and the `general`-entry cases for alt text, a non-Category `showAll` for the other): stop and report.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/rules/pbi-inspector packages/core/test tests/expectations
git commit -m "feat(rules): port show items with no data, theme colours, and alt text, one deviation recorded"
```

---
### Task 18: Rule-page tooling for report rules: the `pbir` example hook, layer, sources, ignore mechanics, renderer, scaffold

**Files:**
- Modify: `packages/core/test/rule-pages.test.ts`
- Modify: `packages/core/src/engine/ignore.ts`, `packages/web/src/build/pages.ts`, `packages/web/src/styles.css`
- Modify: `scripts/sync-rule-pages.mjs`, `scripts/generate-rule-pages.mjs`
- Modify: `rules/*.md` (72 existing pages gain `layer: model` in frontmatter)
- Create: 11 scaffolded pages under `rules/` (TODO placeholders, filled in Task 19)
- Test: `packages/core/test/engine.test.ts`, `packages/web/test/generate.test.ts`, `scripts/test/sync-rule-pages.test.mjs`

**Interfaces:**
- The example convention for a report rule page (spec section 7): exactly one fence with the info string `pbir fires <file>` and one with `pbir fixed <file>`, each holding one JSON document. `<file>` is what the document stands for: `visual.json`, `page.json`, `report.json`, `pages.json`, `bookmarks.json`, `<name>.bookmark.json`, `reportExtensions.json`, `definition.pbir`, or `tree.json`. A `tree.json` document is an object mapping report-relative paths to documents, for a rule whose condition spans several files (the count rules); the test writes each entry as its own file. An optional fence with the info string `json pbiplint.config.json` holds a config applied to both runs, so a policy rule's page and a count rule's page can show a short example. The hook places the document in a minimal report tree (one page `p1` named "Overview" and a 3.2.0 report file) and lints it; a `project` rule's example also gets the stock model (one table, Sales, with Amount and Region and the measure Total Sales). The same assertions as the `tmdl` hook apply.
- `ignoreHelp(ruleId, scope)` gains two report forms, in core and in the site build's copy:
  - a scope holding `Page` or `Visual` (and only report types): "To ignore this rule on one page or visual, add `{ "name": "pbiplint.ignore", "value": "RULE_ID" }` to the `annotations` array of its page.json or visual.json. Power BI Desktop keeps the annotation. To turn the rule off for a whole project, set `"RULE_ID": "off"` under `rules` in `pbiplint.config.json`."
  - a scope of only `Report`, `Bookmark`, or `ReportMeasure`: "This rule reports on the report itself, so there is no object to annotate. To turn the rule off for a whole project, …"
- Frontmatter gains `layer: model | report | project`; the test requires it to equal `rule.layer`. `sources` is `[RULESET_URL]` for a ported model rule, `[INSPECTOR_URL]` for a ported report rule, `[]` for builtin.
- `SOURCE_NAMES[INSPECTOR_URL] = "PBI Inspector's base rules by Nat Van Gulck"`; the site renders `pbir` fences as captioned figures with `language-json`, the caption naming the file the document stands for ("Fires the rule in visual.json", "After the fix in visual.json"; a `tree.json` fence keeps the bare caption because its keys name the files), and the SARIF help block's bold captions say the same (decision 13); the rules index shows counts per source and a layer badge per rule once `SITE_LAYERS` names more than one family (decision 15); `RuleMeta.layer`.
- `PENDING_PAGES`, a set of slugs whose page is a scaffold, skips every check but existence; Task 19 deletes it.

- [ ] **Step 1: Write the failing tests**

In `packages/core/test/engine.test.ts`, inside `describe("ignoreHelp")`:

```ts
  it("tells a page or visual rule to annotate the JSON, and a report-level rule that there is nothing to annotate", () => {
    expect(ignoreHelp("ENSURE_ALTTEXT", ["Visual"])).toBe(
      'To ignore this rule on one page or visual, add `{ "name": "pbiplint.ignore", "value": "ENSURE_ALTTEXT" }` to the `annotations` array of its page.json or visual.json. Power BI Desktop keeps the annotation. To turn the rule off for a whole project, set `"ENSURE_ALTTEXT": "off"` under `rules` in `pbiplint.config.json`.',
    );
    expect(ignoreHelp("X", ["Visual", "Page", "Report", "Bookmark"])).toMatch(/^To ignore this rule on one page or visual/);
    expect(ignoreHelp("REDUCE_PAGES", ["Report"])).toBe(
      'This rule reports on the report itself, so there is no object to annotate. To turn the rule off for a whole project, set `"REDUCE_PAGES": "off"` under `rules` in `pbiplint.config.json`.',
    );
    expect(ignoreHelp("X", ["ReportMeasure"])).toMatch(/^This rule reports on the report itself/);
    // A rule that spans both layers keeps the TMDL form: its objects are model objects.
    expect(ignoreHelp("NOT_REACHED_FROM_REPORT", ["Column", "Measure"])).toMatch(/^To ignore this rule on one object, add `annotation/);
  });
```

In `packages/web/test/generate.test.ts`: extend the tie test with `["Visual"]`, `["Report"]`, `["Page", "Visual", "Report"]`, and `["ReportMeasure"]`; add inside `describe("rulePage")`:

```ts
  it("renders a pbir fence as a captioned JSON figure that names its file, bare for a tree", () => {
    const page = read("hide-foreign-keys").replace(
      "## Why it matters",
      '## Example\n\n```pbir fires visual.json\n{ "name": "v" }\n```\n\n```pbir fixed tree.json\n{ "definition/pages/p/page.json": {} }\n```\n\n## Why it matters',
    );
    const { html } = rulePage(page, "hide-foreign-keys");
    expect(html).toContain('<figure class="example fires">\n<figcaption>Fires the rule in visual.json</figcaption>\n<pre><code class="language-json">{ &quot;name&quot;: &quot;v&quot; }\n</code></pre>\n</figure>');
    expect(html).toContain('<figure class="example fixed">\n<figcaption>After the fix</figcaption>\n<pre><code class="language-json">');
    const escaped = rulePage(page.replace("pbir fires visual.json", "pbir fires a<b.json"), "hide-foreign-keys").html;
    expect(escaped).toContain("<figcaption>Fires the rule in a&lt;b.json</figcaption>");
  });
  it("credits PBI Inspector for a page whose source is its ruleset", () => {
    const page = read("hide-foreign-keys").replace(/sources:\n( {2}- .*\n)+/, "sources:\n  - https://github.com/NatVanG/fab-inspector/blob/main/Rules/Base-rules.json\n");
    expect(rulePage(page, "x").html).toContain(`<p class="sources">Ported from <a href="https://github.com/NatVanG/fab-inspector/blob/main/Rules/Base-rules.json">PBI Inspector's base rules by Nat Van Gulck</a>.</p>`);
  });
```

and leave the `generateSite`/`rulesIndex` count assertions at 72: the site publishes the model layer only until pull request 7, so the 11 new pages are on disk and not on the site (decision 15). The sentence does change shape here even though the counts do not, because Step 3 rewrites the paragraph into per-source clauses and drops any clause whose count is zero, so the report clause is absent while the gate holds. Replace the existing `expect(index).toContain("72 rules: 66 ported")` with this string, rather than deriving it:

```
72 rules: 66 model rules ported from Microsoft's Best Practice Analyzer ruleset so the results match Tabular Editor, 5 listed but not run because they need statistics only a live model has, and 1 built into pbiplint.
```

Once pull request 7 flips `SITE_LAYERS`, every clause has a count and the same sentence reads with all four, at whatever counts the rule set then holds. At this task's 83 pages that shape is `"83 rules: 66 model rules ported from Microsoft's Best Practice Analyzer ruleset so the results match Tabular Editor, 5 listed but not run because they need statistics only a live model has, 11 report rules ported from PBI Inspector's base rules, and 1 built into pbiplint."`

The layer badge is the one part of this task the gate does not hold by construction: rendered on every row, it would read `model` on all 72 published rows, a column that distinguishes nothing. Render it only when more than one layer is published, in `rulesIndex` beside the constant that decides it, and assert it where both families are published rather than against the real rule set, which publishes one. The assertions `<span class="layer report">report</span>` and `<span class="layer model">model</span>` belong to that case, and to pull request 7's index once the flip lands.

In `scripts/test/sync-rule-pages.test.mjs`, inside `describe("exampleMarkdown")`:

```js
  it("captions pbir fences with their file, bare for a tree, and reduces their info strings to json", () => {
    expect(exampleMarkdown("```pbir fires visual.json\n{}\n```\n\n```pbir fixed tree.json\n{}\n```")).toBe(
      "**Fires the rule in visual.json**\n\n```json\n{}\n```\n\n**After the fix**\n\n```json\n{}\n```",
    );
  });
```

In `packages/core/test/rule-pages.test.ts`, make these changes:

1. Constants and imports:

```ts
import { INSPECTOR_RULES } from "../src/rules/pbi-inspector/inspector-rules.data.js";
import type { LintFile } from "../src/engine/lint.js";
import { resolveConfig } from "../src/engine/config.js";
const INSPECTOR_URL = "https://github.com/NatVanG/fab-inspector/blob/main/Rules/Base-rules.json";
const inspectorDescription = new Map(INSPECTOR_RULES.map((r) => [r.id, r.description]));
/** Pages that exist as scaffolds only; Task 19 fills them and deletes this set. */
const PENDING_PAGES = new Set([
  "remove-unused-custom-visuals",
  "reduce-visuals-on-page",
  "reduce-objects-within-visuals",
  "reduce-topn-filters",
  "reduce-advanced-filters",
  "reduce-pages",
  "avoid-show-items-with-no-data",
  "hide-tooltip-drilltrough-pages",
  "ensure-theme-colours",
  "ensure-pages-do-not-scroll-vertically",
  "ensure-alttext",
]);
```

2. The `pbir` hook, after `run` and `hits`:

```ts
const PBIR_FENCE = /^pbir (fires|fixed) (\S+)$/;
/** The pbir fences of a section: which kind, and the file each document stands for. */
const pbirFences = (s: string, kind: "fires" | "fixed"): { file: string; text: string }[] =>
  [...s.matchAll(/^```([^\n]*)\n([\s\S]*?)\n```$/gm)]
    .map((m) => ({ info: PBIR_FENCE.exec(m[1]!.trim()), text: m[2]! }))
    .filter((m) => m.info?.[1] === kind)
    .map((m) => ({ file: m.info![2]!, text: m.text }));
/** The optional config fence of a section, applied to both runs. */
const configFence = (s: string): unknown => {
  const [text] = fences(s, "json pbiplint.config.json");
  return text === undefined ? undefined : JSON.parse(text);
};

const STOCK_PAGE = "p1";
const stockReport = (): LintFile[] => [
  {
    path: "definition/report.json",
    text: JSON.stringify({ $schema: "https://developer.microsoft.com/json-schemas/fabric/item/report/definition/report/3.2.0/schema.json", themeCollection: { baseTheme: { name: "Fluent2-CY26SU04", type: "SharedResources" } } }),
  },
  { path: "definition/pages/pages.json", text: JSON.stringify({ pageOrder: [STOCK_PAGE], activePageName: STOCK_PAGE }) },
  { path: `definition/pages/${STOCK_PAGE}/page.json`, text: JSON.stringify({ name: STOCK_PAGE, displayName: "Overview", displayOption: "FitToPage", height: 720, width: 1280 }) },
];
/** The model a project rule's example runs against: Sales with Amount and Region, and the measure Total Sales. */
const STOCK_MODEL: LintFile = {
  path: "definition/tables/Sales.tmdl",
  text: "table Sales\n\tcolumn Amount\n\t\tdataType: decimal\n\t\tsourceColumn: Amount\n\tcolumn Region\n\t\tdataType: string\n\t\tsourceColumn: Region\n\tmeasure 'Total Sales' = SUM('Sales'[Amount])\n\tpartition Sales = m\n\t\tmode: import\n\t\tsource = 1\n",
};

/** The files a pbir example stands for, placed in the stock tree. */
function pbirFiles(doc: { file: string; text: string }): LintFile[] {
  const json = JSON.parse(doc.text) as Record<string, unknown>;
  if (doc.file === "tree.json")
    return [
      ...stockReport().filter((f) => !(f.path in json)),
      ...Object.entries(json).map(([path, value]) => ({ path, text: JSON.stringify(value, null, 2) })),
    ];
  const id = typeof json.name === "string" ? json.name : "x";
  const place: Record<string, string> = {
    "visual.json": `definition/pages/${STOCK_PAGE}/visuals/${id}/visual.json`,
    "page.json": `definition/pages/${id}/page.json`,
    "report.json": "definition/report.json",
    "pages.json": "definition/pages/pages.json",
    "bookmarks.json": "definition/bookmarks/bookmarks.json",
    "reportExtensions.json": "definition/reportExtensions.json",
    "definition.pbir": "definition.pbir",
  };
  const path = doc.file.endsWith(".bookmark.json") ? `definition/bookmarks/${doc.file}` : place[doc.file];
  if (path === undefined) throw new Error(`${doc.file} is not a file a pbir example can stand for`);
  let files = stockReport().filter((f) => f.path !== path);
  if (doc.file === "page.json" && id !== STOCK_PAGE)
    files = files
      .filter((f) => !f.path.startsWith(`definition/pages/${STOCK_PAGE}/`))
      .map((f) => (f.path === "definition/pages/pages.json" ? { ...f, text: JSON.stringify({ pageOrder: [id], activePageName: id }) } : f));
  if (doc.file.endsWith(".bookmark.json")) files.push({ path: "definition/bookmarks/bookmarks.json", text: JSON.stringify({ items: [{ name: id }] }) });
  return [...files, { path, text: doc.text }];
}

const runPbir = (doc: { file: string; text: string }, withModel: boolean, config: unknown): Finding[] =>
  lint([...pbirFiles(doc), ...(withModel ? [STOCK_MODEL] : [])], { config: resolveConfig(config) }).findings;
```

3. At the top of the `describe.each` body, before the first `it`:

```ts
  if (PENDING_PAGES.has(slug(rule.id))) {
    it("exists as a scaffold, to be written in Task 19", () => {
      expect(existsSync(path), path).toBe(true);
    });
    return;
  }
```

4. In the frontmatter test add `expect(frontmatter).toContain(`layer: ${rule.layer}`);`. In the own-words test, read the source description from `rule.layer === "report" ? inspectorDescription : rulesetDescription`. In the sources test:

```ts
      const expectedSources = rule.status === "builtin" ? [] : [rule.layer === "report" ? INSPECTOR_URL : RULESET_URL];
      expect(sources).toEqual(expectedSources);
```

5. Replace the example test with one that branches on the layer:

```ts
    it.runIf(rule.status !== "needsLiveModel")("shows an example the engine flags and a fix it accepts", () => {
      const example = section(readFileSync(path, "utf8"), "Example");
      const check = (before: Finding[], after: Finding[]): void => {
        expect(hits(before, rule.id).length, "the fires snippet produces a finding").toBeGreaterThan(0);
        if (rule.id !== "PARSE_ISSUE") expect(hits(before, "PARSE_ISSUE").map((f) => f.detail)).toEqual([]);
        expect(hits(after, rule.id).map((f) => f.objectName), "the fixed snippet is clean for this rule").toEqual([]);
        expect(hits(after, "PARSE_ISSUE").map((f) => f.detail)).toEqual([]);
      };
      // PARSE_ISSUE spans both layers; its example stays TMDL and keeps the inverted parse check.
      if (rule.layer === "model" || rule.id === "PARSE_ISSUE") {
        const [fires, ...moreFires] = fences(example, "tmdl fires");
        const [fixed, ...moreFixed] = fences(example, "tmdl fixed");
        expect(fires, "one `tmdl fires` fence").toBeDefined();
        expect(fixed, "one `tmdl fixed` fence").toBeDefined();
        expect(moreFires).toEqual([]);
        expect(moreFixed).toEqual([]);
        expect(`${fires}${fixed}`).not.toContain("pbiplint.ignore");
        check(run(fires!), run(fixed!));
        return;
      }
      const [fires, ...moreFires] = pbirFences(example, "fires");
      const [fixed, ...moreFixed] = pbirFences(example, "fixed");
      expect(fires, "one `pbir fires <file>` fence").toBeDefined();
      expect(fixed, "one `pbir fixed <file>` fence").toBeDefined();
      expect(moreFires).toEqual([]);
      expect(moreFixed).toEqual([]);
      expect(`${fires!.text}${fixed!.text}`).not.toContain("pbiplint.ignore");
      const config = configFence(example);
      check(runPbir(fires!, rule.layer === "project", config), runPbir(fixed!, rule.layer === "project", config));
    });
```

6. A new top-level describe, after the `describe.each`:

```ts
describe("documented deviations", () => {
  const expectationsDir = new URL("../../../tests/expectations/", import.meta.url).pathname;
  const deviations = readdirSync(expectationsDir)
    .filter((f) => f.endsWith(".report.json"))
    .flatMap((f) => Object.entries((JSON.parse(readFileSync(expectationsDir + f, "utf8")) as { deviations: Record<string, string> }).deviations));
  it.each(deviations)("%s is named, in the same words, in the page's Quirks section", (id, sentence) => {
    const text = readFileSync(`${rulesDir}${slug(id)}.md`, "utf8");
    expect(section(text, "Quirks")).toContain(sentence);
  });
});
```

(`readdirSync` joins the `node:fs` import.)

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run packages/core/test/engine.test.ts packages/web/test/generate.test.ts scripts/test/sync-rule-pages.test.mjs`
Expected: FAIL on the new ignore forms, the pbir figure, the attribution, the index sentence, and the sync captions.

- [ ] **Step 3: Implement**

In `packages/core/src/engine/ignore.ts` and, identically, the copy in `packages/web/src/build/pages.ts`:

```ts
const REPORT_ANNOTATED = new Set(["Page", "Visual"]);
const REPORT_ONLY = new Set(["Report", "Bookmark", "ReportMeasure"]);

export function ignoreHelp(ruleId: string, scope: readonly string[] = []): string {
  const project = `To turn the rule off for a whole project, set \`"${ruleId}": "off"\` under \`rules\` in \`pbiplint.config.json\`.`;
  if (scope.length > 0 && scope.every((s) => s === "File"))
    return `This rule reports on files, so there is no object to annotate. ${project}`;
  const reportScoped = scope.length > 0 && scope.every((s) => REPORT_ANNOTATED.has(s) || REPORT_ONLY.has(s));
  if (reportScoped && scope.some((s) => REPORT_ANNOTATED.has(s)))
    return (
      `To ignore this rule on one page or visual, add \`{ "name": "pbiplint.ignore", "value": "${ruleId}" }\` to the ` +
      `\`annotations\` array of its page.json or visual.json. Power BI Desktop keeps the annotation. ${project}`
    );
  if (reportScoped) return `This rule reports on the report itself, so there is no object to annotate. ${project}`;
  return (
    `To ignore this rule on one object, add \`annotation ${IGNORE_ANNOTATION} = ${ruleId}\` under ` +
    `the object in its TMDL file. Power BI Desktop keeps the annotation. ${project}`
  );
}
```

(In the site copy, `IGNORE_ANNOTATION` is the literal `pbiplint.ignore`, as today.)

In `packages/web/src/build/pages.ts`:

- `SOURCE_NAMES` gains `"https://github.com/NatVanG/fab-inspector/blob/main/Rules/Base-rules.json": "PBI Inspector's base rules by Nat Van Gulck"`.
- The `code` override: `const example = /^(tmdl|pbir) (fires|fixed)(?: (\S+))?$/.exec(lang ?? ""); if (!example) return false; const language = example[1] === "pbir" ? "json" : "tmdl"; const kind = example[2]!; const file = example[3]; const caption = file !== undefined && file !== "tree.json" ? `${EXAMPLE_CAPTION[kind]} in ${escapeHtml(file)}` : EXAMPLE_CAPTION[kind]!;`, then `<figcaption>${caption}</figcaption>` and `<code class="language-${language}">`.
- `RuleMeta` gains `layer: string` (from `str(data.layer)`), and the meta line on a page gains `` · ${escapeHtml(meta.layer)} layer `` after the status.
- `rulesIndex`: each `<li>` gets `` <span class="layer ${escapeHtml(m.layer)}">${escapeHtml(m.layer)}</span> `` right after the severity badge, rendered only when `SITE_LAYERS` names more than one family, as Step 1 says: with one family every published row carries the same word, a column that distinguishes nothing. The count paragraph becomes:

```ts
  const count = (status: string, layer?: string): number => metas.filter((m) => m.status === status && (layer === undefined || m.layer === layer)).length;
  // A clause whose count is zero is left out. Until pull request 7 the site publishes no report
  // page (decision 15), and "0 report rules ported from PBI Inspector's base rules" on the live
  // index advertises a source the page below lists nothing from, which is the promise this gate
  // exists to avoid making. Written as a rule rather than a fixed string, so it stays right as the
  // counts move and when the gate opens.
  const clauses: [number, string][] = [
    [count("ported", "model"), "model rules ported from Microsoft's Best Practice Analyzer ruleset so the results match Tabular Editor"],
    [count("needsLiveModel"), "listed but not run because they need statistics only a live model has"],
    [count("ported", "report"), "report rules ported from PBI Inspector's base rules"],
    [count("builtin"), "built into pbiplint"],
  ];
  const parts = clauses.filter(([n]) => n > 0).map(([n, text]) => `${n} ${text}`);
  const sources = parts.length > 1 ? `${parts.slice(0, -1).join(", ")}, and ${parts.at(-1)}` : (parts[0] ?? "");
  // ...
  <p>${metas.length} rules: ${sources}. Ranked by severity, then category, then how many objects they hit.</p>
```

In `packages/web/src/styles.css`, after `.badge.muted`:

```css
/* Which layer a rule or a group belongs to: an outlined tag beside the severity badge. */
.layer {
  display: inline-block;
  font-size: 10px;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  border: 1px solid var(--line-2);
  border-radius: 4px;
  padding: 1px 6px;
  color: var(--fg-2);
}
.layer.report {
  border-color: var(--brand-teal);
  color: var(--brand-teal-soft);
}
```

In `scripts/sync-rule-pages.mjs`, `exampleMarkdown` gains the two `pbir` replacements:

```js
    .replace(/^```pbir fires (\S+)[ \t]*$/gm, (_line, file) => `**Fires the rule${file === "tree.json" ? "" : ` in ${file}`}**\n\n\`\`\`json`)
    .replace(/^```pbir fixed (\S+)[ \t]*$/gm, (_line, file) => `**After the fix${file === "tree.json" ? "" : ` in ${file}`}**\n\n\`\`\`json`);
```

In `scripts/generate-rule-pages.mjs`: write `layer: ${rule.layer}` after `status`; `sources` is `[]` for builtin, `[INSPECTOR_URL]` when `rule.layer === "report"`, else `[RULESET_URL]` (add the constant); the example fences are `tmdl` for a model rule and, for a report or project rule, `` ```pbir fires visual.json `` and `` ```pbir fixed visual.json `` around `{ "TODO": "the smallest report JSON that fires the rule" }` and `{ "TODO": "the same JSON with the fix applied" }`. Then add `layer: model` to the 72 existing pages after their `status:` line:

```bash
for f in rules/*.md; do grep -q '^layer:' "$f" || sed -i '' 's/^status: \(.*\)$/status: \1\nlayer: model/' "$f"; done
sed -i '' 's/^layer: model$/layer: project/' rules/parse-issue.md
grep -L '^layer: ' rules/*.md | wc -l
```

Expected: 0 (parse-issue reads `layer: project`, the rest `layer: model`). Then scaffold the eleven:

```bash
npm run build -w @pbiplint/core && node scripts/generate-rule-pages.mjs && ls rules | wc -l
```

Expected: `wrote 11 rule page(s)`, 83 files.

- [ ] **Step 4: Run the tests**

Run: `npx vitest run packages/core/test/engine.test.ts packages/core/test/rule-pages.test.ts packages/web/test scripts/test && npm run typecheck && npm run lint`
Expected: PASS. The eleven pending pages pass on existence only; every other page passes with `layer: model`. `npm run build` also passes: the index has 83 pages.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/engine/ignore.ts packages/core/test packages/web scripts rules
git commit -m "feat(pages): report rule pages get pbir example fences, a layer, PBI Inspector attribution, and JSON ignore mechanics"
```

---

### Task 19: The eleven ported pages

**Files:**
- Modify: the 11 scaffolds under `rules/`
- Modify: `packages/core/test/rule-pages.test.ts` (delete `PENDING_PAGES`)
- Regenerate: `packages/core/src/rules/rule-summaries.data.ts`, `packages/cli/src/rule-help.data.ts`

- [ ] **Step 1: Dispatch the drafting subagent**

One Opus subagent gets this brief verbatim, plus the per-page notes below:

> Write these eleven rule pages under `rules/`, replacing the TODO scaffolds. Read `docs/superpowers/specs/2026-09-19-rule-pages-template-design.md` sections 4, 5, 6, 7, and 13, then `rules/hide-foreign-keys.md` and `rules/parse-issue.md` as the models to match, then `docs/superpowers/specs/2026-09-18-pbiplint-v2-report-layer-design.md` sections 5, 7, and 8, and the rule's implementation under `packages/core/src/rules/pbi-inspector/`. For each page: What it checks is the condition in one or two sentences as the tool tests it (this paragraph becomes the rule's description in every output), then a second paragraph with the finding's shape, for example `"Sales by region" on "Overview"` for a visual, `Page "Detail"` for a page; Example holds one `pbir fires <file>` fence and one `pbir fixed <file>` fence, each one JSON document for the file it stands for, minimal and realistic (Sales, Product, Date; Desktop's property shapes, copied from `tests/fixtures/pbip-and-github-demo`), and, for a count rule, a `tree.json` document with two or three files plus a fence with the info string `json pbiplint.config.json` that lowers the rule's threshold so the example stays short, with a sentence saying so and naming the default; prove each pair with `npx vitest run packages/core/test/rule-pages.test.ts -t "<RULE_ID>"` after removing the slug from `PENDING_PAGES` in `packages/core/test/rule-pages.test.ts`; Why it matters says what a reader or the report will suffer; How to fix it names the Power BI Desktop route first (the Format pane, the Selection pane, the page settings, the Filters pane) and, where a JSON edit is the clearest, the property in the file, and never a third-party tool; When to ignore it is the judgment only, never the annotation or config lines; Quirks names every quirk the port keeps from the source and, for the three deviating rules, the exact deviation sentence from the fixture expectation files' `deviations` map; Related rules only where a real relation exists among today's rules (`grep -h '^id:' rules/*.md`), one clause each; `sources` is exactly the PBI Inspector URL; Links is further reading with descriptive text, Microsoft Learn where it fits. No em dashes. No ruleset text. No "fix expression". Write in the voice of the two model pages.

Per-page notes:

| Page | Example shape | Quirks to state |
|---|---|---|
| remove-unused-custom-visuals | `report.json` with `publicCustomVisuals: ["ChicletSlicer1448559807354"]`; fixed empties the list | Only visuals registered under `publicCustomVisuals` are checked; a visual package under `CustomVisuals` is not read |
| reduce-visuals-on-page | `tree.json` with three card visuals on `p1`; config `max: 2`; fixed drops one | Shapes, slicers, buttons, and text boxes are not counted, as the source counts; a visual group container is counted |
| reduce-objects-within-visuals | `visual.json` table with seven fields; fixed six | The deviation sentence |
| reduce-topn-filters | `tree.json` with three visuals carrying a TopN filter; config `max: 2`; fixed two | A TopN filter counts whether or not a value is set, as the source counts |
| reduce-advanced-filters | `tree.json` with three visuals carrying an applied Advanced filter; config `max: 2`; fixed removes one filter's `filter` object | The deviation sentence |
| reduce-pages | `tree.json` with `pages.json` and three pages; config `max: 2`; fixed two pages | Hidden pages count |
| avoid-show-items-with-no-data | `visual.json` with `showAll: true` on Category; fixed without it | Any role is checked (the source checks Category only, so this is stricter on a matrix's Rows or Columns) |
| hide-tooltip-drilltrough-pages | `page.json` with `pageBinding.type: "Tooltip"`; fixed adds `visibility: "HiddenInViewMode"` | The id keeps the source's spelling, DRILLTROUGH, because parity compares on ids |
| ensure-theme-colours | `visual.json` with a data point fill `solid.color` hex literal; fixed uses `ThemeDataColor` | The deviation sentence; text boxes are not checked |
| ensure-pages-do-not-scroll-vertically | `page.json` with `height: 1080`; fixed 720 | Hidden pages are not checked; the option is `maxHeight` |
| ensure-alttext | `visual.json` card with no `altText`; fixed adds it under `visualContainerObjects.general[0].properties` | Shapes are not checked, as the source does; the source ships this rule off and pbiplint ships it on; an alt text bound to a measure counts as present |

- [ ] **Step 2: Review every page**

Read each page whole against the Global Constraints and the template spec's section 13; run its fences yourself through the test; fix what is wrong. Delete `PENDING_PAGES` and its early return from the test.

- [ ] **Step 3: Regenerate and test**

```bash
npm run build -w @pbiplint/core && node scripts/sync-rule-pages.mjs && npm run lint && npm run typecheck && npm test && npm run build
```

Expected: all green; `packages/core/test/define-inspector.test.ts` now sees each rule's description from its page. A failing example names the page and the fence.

- [ ] **Step 4: Commit**

```bash
git add rules packages/core/test/rule-pages.test.ts packages/core/src/rules/rule-summaries.data.ts packages/cli/src/rule-help.data.ts
git commit -m "docs(rules): the eleven PBI Inspector pages on the complete template"
```

---

### Task 20: Full verification and pull request 2

- [ ] **Step 1: Run everything CI runs**

```bash
npm run lint && npm run typecheck && npm test && npm run check:browser && npm run build && npm run check:pack && npm run test:bundle -w pbiplint && npm run test:e2e
```

Expected: all green. The e2e suite's sample run is unchanged (no report in the sample yet); `/rules/` now lists 83 pages and the axe scan covers a report page only if `site.spec.ts` is pointed at one: add `/rules/ensure-alttext/` to its `PAGES` list in this task so the new figure markup is scanned.

- [ ] **Step 2: Check the branch**

```bash
git log --format=%B main..HEAD | grep -inE '\b(close[sd]?|fix(e[sd])?|resolve[sd]?)\b[[:space:]]*#[0-9]+' ; git diff main..HEAD -- . ':!tests/fixtures' | grep -c $'\u2014'
```

Expected: nothing; 0. (The fixtures are excluded from the em-dash count because fab-inspector's own text is not ours to edit; if a fixture carries one, leave it.)

- [ ] **Step 3: Whole-branch review, fix wave, push, pull request**

Dispatch the Fable review of `main..HEAD` with spec sections 3.1, 3.2, 7, 8.1, 8.5, 10, and this pull request's shared facts; apply its Important findings; re-run Step 1; then:

```bash
git push -u origin v2-ported-rules
gh auth switch --user TheDataPractitioner
gh pr create --repo pbiplint/pbiplint --base main --head v2-ported-rules --title "v2 ported rules: the 11 PBI Inspector base rules with parity" --body-file - <<'EOF'
Pull request 2 of 8 for the report layer, tracked in #9.

- fab-inspector's base ruleset metadata is vendored at commit cdaaeec3 (MIT; NOTICE updated); `inspectorRule` defines the 11 ports with the spec's categories, scopes, and options.
- Four whole-PBIP fixtures under `tests/fixtures/`, sanitised by the extended script (no registered resources, caches, or local paths): the two fab-inspector fixtures, the PBIP and GitHub Demo, and ShelfMart.
- `scripts/fab-expectations.mjs` converts the oracle's JSON into `tests/expectations/<fixture>.report.json`; the four files are captured with every rule enabled. `docs/RELEASING.md` has the macOS invocation.
- The parity test compares pbiplint's object ids with the oracle's per rule and fixture; the three documented deviations are recorded as `deviations` and `ours` and must differ from the oracle on the fixture that shows them; a test ties each sentence to the page's Quirks.
- Rule pages: `layer` in frontmatter, `pbir fires` and `pbir fixed` example fences, captioned with the file they stand for, proven through the engine by the rule-pages test (with a `tree.json` form for the count rules and an optional config fence), JSON ignore mechanics for page and visual rules, PBI Inspector attribution, a layer badge on the index. Eleven new pages.

Counts: 83 rules and 83 pages on disk, of which the site publishes 72: `pack.test.ts` pins 83, `generate.test.ts` holds at 72, which it does until Task 24 (decision 15).

Manual check for Michael: open pbiplint.com/rules/ once the deploy lands and confirm it still lists 72 rules, with no report page and no layer badge. That is the gate working (decision 15). The 11 new pages are in the repo and reach the site in pull request 7, and until then neither the deployed site nor `vite dev` renders them, because the gate sits in `generateSite` itself; their JSON figures are held by this task's `rulePage` tests and read in the Markdown under `rules/`.

Next: pull request 3, native rules tier 1.

🤖 Generated with [Claude Code](https://claude.com/claude-code)

https://claude.ai/code/session_01NkR2xcGDMmG1T73cTgjBH3
EOF
gh auth switch --user michaelmckinleyconsulting
```

Report the URL and stop.

---

## Pull request 3: native rules, tier 1 (branch `v2-native-tier-1`)

```bash
cd ~/Projects/pbiplint && git switch main && git pull --ff-only && git switch -c v2-native-tier-1
```

Shared facts for the three native pull requests:

- Native rules are `builtin`, live under `packages/core/src/rules/pbiplint/`, and are defined with `pbiplintRule`. Their names, categories, severities, and scopes are the spec's tables in section 8.2 to 8.4; the names in tool output are:

| Id | Name |
|---|---|
| BROKEN_FIELD_REFERENCE | Field the model does not have |
| NOT_REACHED_FROM_REPORT | Not reached from the report |
| LANDING_PAGE_NOT_SET | No landing page set |
| OPENING_PAGE_INVALID | Opening page missing or hidden |
| FILTERS_PANE_STATE | Filters pane state differs from policy |
| HIDDEN_VISUALS_STILL_QUERY | Hidden visuals still run their queries |
| DEFAULT_PAGE_NAME | Page keeps its default name |
| VISUAL_WITHOUT_FIELDS | Data visual with no fields |
| VISUAL_OUTSIDE_PAGE | Visual extends past the page |
| REPORT_LEVEL_MEASURES | Measure defined in the report |
| BROKEN_ACTION_TARGET | Action points at nothing |
| BROKEN_BOOKMARK_REFERENCE | Bookmark refers to a missing page or visual |
| TAB_ORDER_FOLLOWS_LAYOUT | Tab order disagrees with the layout |
| SLICER_SELECTION_SAVED | Slicer saved with a selection |

- Every native rule is pinned two ways (spec section 10): a unit test on inline JSON, and the `native` map in the expectation files. The quiet check: `base-rules-passes.report.json` and `shelfmart.report.json` list by name every native finding they produce, and the test fails on any other. `LANDING_PAGE_NOT_SET` fires on every fixture (none has a `landingPageName`) and `NOT_REACHED_FROM_REPORT` fires wherever the model holds more than the report uses; both are listed by name, however long the list.
- Each tier's pages follow Task 19's brief with the notes in that tier's page task; `sources` is empty (builtin); a `project` rule's example runs against the stock model, and its page says so in one sentence before the fences ("The example runs against a model with one table, Sales, holding Amount and Region and the measure Total Sales.").
- Pack and page counts: 89 after tier 1, 93 after tier 2, 97 after tier 3; the index sentence's "built into pbiplint" count follows.

### Task 21: `pbiplintRule`, BROKEN_FIELD_REFERENCE, NOT_REACHED_FROM_REPORT

**Files:**
- Create: `packages/core/src/rules/pbiplint/define.ts`, `packages/core/src/rules/pbiplint/references.ts`, `packages/core/src/rules/pbiplint/index.ts`
- Modify: `packages/core/src/rules/index.ts`, `packages/core/src/index.ts`, `packages/core/src/engine/rank.ts` (`policySeverity`), `packages/core/src/rules/types.ts` (`policySeverity?`)
- Test: `packages/core/test/rules-native-references.test.ts`, `packages/core/test/define-native.test.ts`

**Interfaces:**
- `pbiplintRule(spec: { id; name; category; severity; scope; layer; options?; references?; policySeverity?; check }): Rule` sets `status: "builtin"`, `needs` from `layer` (`project` means both), `description` from `RULE_SUMMARIES`. `Rule.policySeverity?(options: RuleOptions): Severity | undefined` lets a policy rule raise its severity under a policy; `effectiveSeverity` reads the config's override first, then `policySeverity`, then `rule.severity`.
- `pbiplintRules: Rule[]`; `defaultRules = [PARSE_ISSUE, ...microsoftBpaRules, ...pbiInspectorRules, ...pbiplintRules]`.
- `BROKEN_FIELD_REFERENCE`: every unresolved report reference except those inside a report measure's DAX, on the object that carries it, with the detail `<field>: <reason>` where `<field>` is `'Sales'[Region]`, `[Net Margin]`, or `'Date'[Calendar].[Year]`.
- `NOT_REACHED_FROM_REPORT`: every unreached measure, then every unreached column, in model order, with `reasonFor` as the detail.

- [ ] **Step 1: Write the failing tests**

Create `packages/core/test/define-native.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { resolveConfig } from "../src/engine/config.js";
import { effectiveSeverity } from "../src/engine/rank.js";
import { pbiplintRule } from "../src/rules/pbiplint/define.js";
import { pbiplintRules } from "../src/rules/pbiplint/index.js";
import { defaultRules } from "../src/rules/index.js";

describe("pbiplintRule", () => {
  const rule = pbiplintRule({
    id: "X_RULE",
    name: "X",
    category: "Report Design",
    severity: 1,
    scope: ["Visual"],
    layer: "project",
    options: [{ name: "expect", type: "string", values: ["none"] }],
    policySeverity: (o) => (o.expect === "none" ? 2 : undefined),
    check: () => [],
  });
  it("derives needs from the layer and marks the rule built in", () => {
    expect(rule).toMatchObject({ status: "builtin", needs: ["model", "report"], references: [], description: "X" });
    expect(pbiplintRule({ ...rule, layer: "report" }).needs).toEqual(["report"]);
  });
  it("lets a policy raise the severity unless the config overrides it", () => {
    expect(effectiveSeverity(rule, resolveConfig())).toBe(1);
    expect(effectiveSeverity(rule, resolveConfig({ rules: { X_RULE: { expect: "none" } } }))).toBe(2);
    expect(effectiveSeverity(rule, resolveConfig({ rules: { X_RULE: { expect: "none", severity: "error" } } }))).toBe(3);
  });
  it("is in the default rule set after the ported rules", () => {
    expect(defaultRules.slice(-pbiplintRules.length).map((r) => r.id)).toEqual(pbiplintRules.map((r) => r.id));
  });
});
```

Create `packages/core/test/rules-native-references.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { buildIndexes } from "../src/index/build.js";
import { BROKEN_FIELD_REFERENCE, NOT_REACHED_FROM_REPORT } from "../src/rules/pbiplint/references.js";
import { bound, column, j, measure, page, projectFrom, reportObjectIds } from "./report-helpers.js";

const tmdl = `table Sales
	column Amount
		dataType: decimal
	column Region
		dataType: string
	measure 'Total Sales' = SUM('Sales'[Amount])
	measure 'Sales LY' = CALCULATE([Total Sales])
	measure 'Sales YoY %' = [Total Sales] - [Sales LY]
`;

describe("BROKEN_FIELD_REFERENCE", () => {
  it("names the object carrying each unresolved reference, with the field and the reason", () => {
    const files = [
      { path: "definition/report.json", text: j({ filterConfig: { filters: [{ name: "rf", field: column("Nowhere", "X"), type: "Categorical" }] } }) },
      page("p", { filterConfig: { filters: [{ name: "pf", field: column("Sales", "Nope"), type: "Categorical" }] } }),
      bound("p", "v", "tableEx", [column("Sales", "Region"), measure("Sales", "Profit"), measure("Sales", "Net Margin")]),
      { path: "definition/bookmarks/b.bookmark.json", text: j({ name: "b", displayName: "B", explorationState: { sections: { p: { filters: { byExpr: [{ expression: column("Sales", "Gone") }] } } } } }) },
      { path: "definition/reportExtensions.json", text: j({ entities: [{ name: "Sales", measures: [{ name: "Net Margin", expression: "[Total Sales] - [Missing]" }] }] }) },
    ];
    const project = projectFrom(files, tmdl);
    const findings = BROKEN_FIELD_REFERENCE.check(project, { indexes: buildIndexes(project), options: {} });
    expect(findings.map((f) => [f.objectName, f.objectId, f.detail])).toEqual([
      ["Report filter", "report", `'Nowhere'[X]: no table named "Nowhere"`],
      ['Page filter on "Page p"', "p", `'Sales'[Nope]: no column named "Nope" on "Sales"`],
      ['tableEx (v) on "Page p"', "v", `[Profit]: no measure named "Profit" on "Sales"`],
      ['Bookmark "B"', "b", `'Sales'[Gone]: no column named "Gone" on "Sales"`],
    ]);
    expect(findings[2]!.location).toEqual({ file: "definition/pages/p/visuals/v/visual.json", line: 1 });
  });
  it("is quiet when everything resolves, including a report measure", () => {
    const files = [page("p"), bound("p", "v", "cardVisual", [measure("Sales", "Total Sales")])];
    expect(reportObjectIds(BROKEN_FIELD_REFERENCE, files, tmdl)).toEqual([]);
  });
});

describe("NOT_REACHED_FROM_REPORT", () => {
  it("lists unreached measures then columns, each with why", () => {
    const files = [page("p"), bound("p", "v", "cardVisual", [measure("Sales", "Total Sales")])];
    const project = projectFrom(files, tmdl);
    const findings = NOT_REACHED_FROM_REPORT.check(project, { indexes: buildIndexes(project), options: {} });
    expect(findings.map((f) => [f.objectName, f.detail])).toEqual([
      ["[Sales LY]", "referenced only by [Sales YoY %], which nothing reaches either"],
      ["[Sales YoY %]", "nothing in the report reaches it, and no measure or column references it"],
      ["'Sales'[Region]", "nothing in the report reaches it, and no measure or column references it"],
    ]);
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run packages/core/test/define-native.test.ts packages/core/test/rules-native-references.test.ts`
Expected: FAIL, modules missing.

- [ ] **Step 3: Implement**

In `packages/core/src/rules/types.ts` add to `Rule`:

```ts
  /** A policy rule's severity under its options, read when the config sets no severity for it. */
  policySeverity?(options: RuleOptions): Severity | undefined;
```

In `packages/core/src/engine/rank.ts`:

```ts
import { optionsFor } from "./run.js";
export const effectiveSeverity = (rule: Rule, config: ResolvedConfig): Severity =>
  config.severity.get(rule.id) ?? rule.policySeverity?.(optionsFor(rule, config)) ?? rule.severity;
```

Create `packages/core/src/rules/pbiplint/define.ts`:

```ts
import { RULE_SUMMARIES } from "../rule-summaries.data.js";
import type { Category, Layer, ObjectType, Rule, RuleContext, RuleFinding, RuleOption, RuleOptions, Severity } from "../types.js";
import type { Project } from "../../project/types.js";

export interface PbiplintRuleSpec {
  id: string;
  name: string;
  category: Category;
  severity: Severity;
  scope: ObjectType[];
  layer: Layer;
  options?: RuleOption[];
  references?: string[];
  policySeverity?(options: RuleOptions): Severity | undefined;
  check(project: Project, ctx: RuleContext): RuleFinding[];
}

/** One of pbiplint's own rules: built in, needing the layers its `layer` names, described by its page. */
export function pbiplintRule(spec: PbiplintRuleSpec): Rule {
  const { options, references, policySeverity, ...rest } = spec;
  return {
    ...rest,
    needs: spec.layer === "project" ? ["model", "report"] : [spec.layer],
    ...(options ? { options } : {}),
    ...(policySeverity ? { policySeverity } : {}),
    description: RULE_SUMMARIES[spec.id] ?? spec.name,
    references: references ?? [],
    status: "builtin",
  };
}
```

Create `packages/core/src/rules/pbiplint/references.ts`:

```ts
import { columnRef, measureRef } from "../../model/names.js";
import type { FieldRef, Page, Report, Visual, Bookmark } from "../../pbir/types.js";
import { finding } from "../helpers.js";
import { reportFinding } from "../report-helpers.js";
import type { RuleFinding } from "../types.js";
import { pbiplintRule } from "./define.js";

/** `'Sales'[Region]`, `[Net Margin]`, `'Date'[Calendar].[Year]`. */
const fieldLabel = (ref: FieldRef): string =>
  ref.kind === "measure"
    ? measureRef(ref.name)
    : ref.kind === "hierarchyLevel"
      ? `${columnRef(ref.table, ref.name)}${ref.level ? `.[${ref.level}]` : ""}`
      : columnRef(ref.table, ref.name);

export const BROKEN_FIELD_REFERENCE = pbiplintRule({
  id: "BROKEN_FIELD_REFERENCE",
  name: "Field the model does not have",
  category: "Error Prevention",
  severity: 3,
  scope: ["Visual", "Page", "Report", "Bookmark"],
  layer: "project",
  check: (_project, ctx) =>
    ctx.indexes.reportRefs!.unresolved().flatMap((r): RuleFinding[] => {
      if (r.resolution.kind !== "unresolved") return [];
      const detail = `${fieldLabel(r.ref)}: ${r.resolution.reason}`;
      const o = r.owner;
      switch (o.kind) {
        case "visualField":
        case "visualFilter":
          return [reportFinding.visual(o.object as Visual, r.ref.pointer, detail)];
        case "pageFilter":
          return [reportFinding.pageFilter(o.object as Page, r.ref.pointer, detail)];
        case "pageBinding":
          return [reportFinding.page(o.object as Page, r.ref.pointer, detail)];
        case "reportFilter":
          return [reportFinding.reportFilter(o.object as Report, r.ref.pointer, detail)];
        case "bookmark":
          return [reportFinding.bookmark(o.object as Bookmark, detail)];
        // A report measure's DAX is the measure's own problem; REPORT_LEVEL_MEASURES sends it to the model, where the DAX rules read it.
        case "reportMeasure":
          return [];
      }
    }),
});

export const NOT_REACHED_FROM_REPORT = pbiplintRule({
  id: "NOT_REACHED_FROM_REPORT",
  name: "Not reached from the report",
  category: "Maintenance",
  severity: 1,
  scope: ["Column", "CalculatedColumn", "CalculatedTableColumn", "Measure"],
  layer: "project",
  check: (_project, ctx) => {
    const reach = ctx.indexes.reachability!;
    const { columns, measures } = reach.unreached();
    // Measures first, so a dead chain reads top-down: the measure nothing uses, then what only it used.
    return [
      ...measures.map((m) => ({ ...finding.measure(m), detail: reach.reasonFor(m) })),
      ...columns.map((c) => ({ ...finding.column(c), detail: reach.reasonFor(c) })),
    ];
  },
});

export const referenceRules = [BROKEN_FIELD_REFERENCE, NOT_REACHED_FROM_REPORT];
```

Create `packages/core/src/rules/pbiplint/index.ts` with `export const pbiplintRules: Rule[] = [...referenceRules];` (later tasks append their lists in spec order: references, opening, visuals, pages, measures, actions). Register in `rules/index.ts` and export `pbiplintRule`, `type PbiplintRuleSpec`, `pbiplintRules` from `packages/core/src/index.ts`. Set the pack count to 85.

- [ ] **Step 4: Run the tests**

Run: `npx vitest run packages/core/test/define-native.test.ts packages/core/test/rules-native-references.test.ts packages/core/test/pack.test.ts packages/core/test/fixtures.test.ts && npm run typecheck`
Expected: PASS, apart from the two page tests for the new rules (Task 24) and the fixture smoke test, which now sees `BROKEN_FIELD_REFERENCE` errors on any fixture whose report names a field the model lacks: read them; a real broken reference in a fixture stays and is pinned in Task 23's `native` map; a false one is a resolver bug to fix in `report-refs.ts`.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src packages/core/test
git commit -m "feat(rules): pbiplintRule, broken field references, and objects the report never reaches"
```

---

### Task 22: LANDING_PAGE_NOT_SET, OPENING_PAGE_INVALID, FILTERS_PANE_STATE

**Files:**
- Create: `packages/core/src/rules/pbiplint/opening.ts`
- Modify: `packages/core/src/pbir/types.ts` and `build.ts` (`PagesHeader.text?`), `packages/core/src/rules/pbiplint/index.ts`, `packages/core/test/pack.test.ts` (88)
- Test: `packages/core/test/rules-native-opening.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest";
import { FILTERS_PANE_STATE, LANDING_PAGE_NOT_SET, OPENING_PAGE_INVALID } from "../src/rules/pbiplint/opening.js";
import { j, lit, page, reportObjectIds } from "./report-helpers.js";

const pages = (header: Record<string, unknown>) => [
  { path: "definition/pages/pages.json", text: j({ pageOrder: ["p", "h"], ...header }) },
  page("p"),
  page("h", { visibility: "HiddenInViewMode" }),
];

describe("LANDING_PAGE_NOT_SET", () => {
  it("fires once on the report when pages.json names no landing page", () => {
    expect(reportObjectIds(LANDING_PAGE_NOT_SET, pages({ activePageName: "p" }))).toEqual(["report"]);
    expect(reportObjectIds(LANDING_PAGE_NOT_SET, pages({ activePageName: "p", landingPageName: "p" }))).toEqual([]);
  });
});

describe("OPENING_PAGE_INVALID", () => {
  it("fires when the landing page, or the active page without one, is missing or hidden", () => {
    expect(reportObjectIds(OPENING_PAGE_INVALID, pages({ activePageName: "h" }))).toEqual(["report"]);
    expect(reportObjectIds(OPENING_PAGE_INVALID, pages({ activePageName: "p", landingPageName: "gone" }))).toEqual(["report"]);
    expect(reportObjectIds(OPENING_PAGE_INVALID, pages({ activePageName: "h", landingPageName: "p" }))).toEqual([]);
    expect(reportObjectIds(OPENING_PAGE_INVALID, pages({ activePageName: "p" }))).toEqual([]);
  });
});

describe("FILTERS_PANE_STATE", () => {
  const report = (pane: Record<string, unknown>) => [{ path: "definition/report.json", text: j({ objects: { outspacePane: [{ properties: pane }] } }) }];
  it("says nothing without a policy, and fires when the saved state disagrees with one", () => {
    expect(reportObjectIds(FILTERS_PANE_STATE, report({ expanded: lit("true") }))).toEqual([]);
    expect(reportObjectIds(FILTERS_PANE_STATE, report({ expanded: lit("true") }), undefined, { expect: "closed" })).toEqual(["report"]);
    expect(reportObjectIds(FILTERS_PANE_STATE, report({ expanded: lit("true") }), undefined, { expect: "open" })).toEqual([]);
    expect(reportObjectIds(FILTERS_PANE_STATE, report({}), undefined, { expect: "open" })).toEqual(["report"]);
    expect(reportObjectIds(FILTERS_PANE_STATE, report({ visible: lit("false") }), undefined, { expect: "closed" })).toEqual(["report"]);
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `npx vitest run packages/core/test/rules-native-opening.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement**

Add `text?: string` to `PagesHeader` in `pbir/types.ts` and set `text: f.text` where `buildReport` reads `pages.json`. Create `packages/core/src/rules/pbiplint/opening.ts`:

```ts
import { lineOfPointer } from "../../pbir/json.js";
import type { Report } from "../../pbir/types.js";
import { REPORT_LABEL } from "../../pbir/names.js";
import { isHiddenPage, reportFinding } from "../report-helpers.js";
import type { RuleFinding } from "../types.js";
import { pbiplintRule } from "./define.js";

/** A finding on the report located in pages.json, where the opening page is set. */
const atPagesHeader = (r: Report, pointer: string, detail: string): RuleFinding => ({
  objectType: "Report",
  objectName: REPORT_LABEL,
  objectId: "report",
  location: { file: r.pagesHeader.file ?? "definition/pages/pages.json", line: lineOfPointer(r.pagesHeader.text ?? "", pointer) },
  detail,
  object: r,
});

export const LANDING_PAGE_NOT_SET = pbiplintRule({
  id: "LANDING_PAGE_NOT_SET",
  name: "No landing page set",
  category: "Report Design",
  severity: 1,
  scope: ["Report"],
  layer: "report",
  check: ({ report }) => {
    if (!report || report.pagesHeader.landingPageName !== undefined) return [];
    const active = report.pages.find((p) => p.id === report.pagesHeader.activePageName);
    return [atPagesHeader(report, "/activePageName", `opens on "${active?.displayName ?? report.pagesHeader.activePageName ?? "?"}", the page open when it was saved`)];
  },
});

export const OPENING_PAGE_INVALID = pbiplintRule({
  id: "OPENING_PAGE_INVALID",
  name: "Opening page missing or hidden",
  category: "Error Prevention",
  severity: 3,
  scope: ["Report"],
  layer: "report",
  check: ({ report }) => {
    if (!report) return [];
    const { landingPageName, activePageName } = report.pagesHeader;
    const which = landingPageName !== undefined ? "landing" : "active";
    const target = landingPageName ?? activePageName;
    if (target === undefined) return [];
    const page = report.pages.find((p) => p.id === target);
    const pointer = which === "landing" ? "/landingPageName" : "/activePageName";
    if (!page) return [atPagesHeader(report, pointer, `${which} page "${target}" does not exist`)];
    if (isHiddenPage(page)) return [atPagesHeader(report, pointer, `${which} page "${page.displayName}" is hidden from readers`)];
    return [];
  },
});

export const FILTERS_PANE_STATE = pbiplintRule({
  id: "FILTERS_PANE_STATE",
  name: "Filters pane state differs from policy",
  category: "Report Design",
  severity: 2,
  scope: ["Report"],
  layer: "report",
  options: [{ name: "expect", type: "string", values: ["open", "closed"] }],
  check: ({ report }, ctx) => {
    const expect = ctx.options.expect;
    if (!report || expect === undefined) return [];
    const pane = report.filtersPane;
    const state = pane.visible === false ? "hidden from readers" : pane.expanded === true ? "open" : "closed";
    if (state === expect) return [];
    return [reportFinding.report(report, `saved ${state}; the policy expects ${expect}`)];
  },
});

export const openingRules = [LANDING_PAGE_NOT_SET, OPENING_PAGE_INVALID, FILTERS_PANE_STATE];
```

Append `...openingRules` to `pbiplintRules`; pack count 88.

- [ ] **Step 4: Run the tests and commit**

Run: `npx vitest run packages/core/test/rules-native-opening.test.ts packages/core/test/pack.test.ts && npm run typecheck`
Expected: PASS.

```bash
git add packages/core/src packages/core/test
git commit -m "feat(rules): landing page, opening page validity, and the Filters pane policy"
```

---

### Task 23: HIDDEN_VISUALS_STILL_QUERY and the native quiet check

**Files:**
- Create: `packages/core/src/rules/pbiplint/visuals.ts`
- Modify: `packages/core/src/rules/pbiplint/index.ts`, `packages/core/test/pack.test.ts` (89); not `packages/web/test/generate.test.ts`, whose pins hold at 72 (decision 15), so the sentence's "and 7 built into pbiplint" arrives with pull request 7, the site reaching 3 built in at Task 24 when the two `project` pages publish
- Modify: `packages/core/test/report-parity.test.ts` (the native check), `tests/expectations/base-rules-passes.report.json`, `shelfmart.report.json`, `pbip-and-github-demo.report.json`, `base-rules-fails.report.json` (`native` maps)
- Test: `packages/core/test/rules-native-visuals.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `packages/core/test/rules-native-visuals.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { HIDDEN_VISUALS_STILL_QUERY } from "../src/rules/pbiplint/visuals.js";
import { bound, column, page, reportObjectIds, visual } from "./report-helpers.js";

describe("HIDDEN_VISUALS_STILL_QUERY", () => {
  it("fires on a hidden visual with fields bound and not on an empty one", () => {
    const files = [
      page("p"),
      bound("p", "hiddenBound", "cardVisual", [column("Sales", "Amount")], { isHidden: true }),
      visual("p", "hiddenEmpty", "textbox", { isHidden: true }),
      bound("p", "shown", "cardVisual", [column("Sales", "Amount")]),
    ];
    expect(reportObjectIds(HIDDEN_VISUALS_STILL_QUERY, files)).toEqual(["hiddenBound"]);
  });
});
```

Append to `packages/core/test/report-parity.test.ts` a describe that pins the native rules:

```ts
const native = defaultRules.filter((r) => r.status === "builtin" && r.id !== "PARSE_ISSUE");
/** The two fixtures the spec calls quiet: no native finding unless listed by name. */
const QUIET = new Set(["base-rules-passes", "shelfmart"]);

describe.each(expectations)("native rules on $name", (exp) => {
  const files = readProjectFiles(repoRoot + exp.fixture);
  const result = lint([...files.model, ...files.report], { config: { failOn: "none" } });
  const ours: Record<string, string[]> = {};
  for (const f of result.findings) (ours[f.ruleId] ??= []).push(f.objectId ?? f.objectName);
  it.runIf(QUIET.has(exp.name) || exp.native !== undefined).each(native.map((r) => [r.id] as const))("%s", (id) => {
    expect([...(ours[id] ?? [])].sort()).toEqual([...(exp.native?.[id] ?? [])].sort());
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run packages/core/test/rules-native-visuals.test.ts packages/core/test/report-parity.test.ts`
Expected: FAIL: the module is missing; the native check fails wherever a fixture fires a native rule that its `native` map does not list.

- [ ] **Step 3: Implement and pin**

Create `packages/core/src/rules/pbiplint/visuals.ts`:

```ts
import { plural } from "../../format/text.js";
import { allVisuals, reportFinding } from "../report-helpers.js";
import { pbiplintRule } from "./define.js";

export const HIDDEN_VISUALS_STILL_QUERY = pbiplintRule({
  id: "HIDDEN_VISUALS_STILL_QUERY",
  name: "Hidden visuals still run their queries",
  category: "Performance",
  severity: 2,
  scope: ["Visual"],
  layer: "report",
  check: ({ report }) =>
    report
      ? allVisuals(report)
          .filter((v) => v.isHidden && v.fields.length > 0)
          .map((v) => reportFinding.visual(v, "/isHidden", `${plural(v.fields.length, "field")} bound`))
      : [],
});

export const visualRules = [HIDDEN_VISUALS_STILL_QUERY];
```

Append `...visualRules` to `pbiplintRules`; counts 89. Then pin: run the failing native checks, read every finding they report on `base-rules-passes` and `shelfmart` (and, for the two other fixtures, add a `native` map too so every fixture pins the tier-1 rules), and judge each one: a real broken reference, a real hidden visual with fields, a real missing landing page goes into `native` by name; a finding that is wrong is a rule bug to fix before pinning. Write the maps as sorted lists of object ids (report findings) or object names (model findings, for `NOT_REACHED_FROM_REPORT`). Record in the SDD ledger what each fixture fires and why it is right.

- [ ] **Step 4: Run the tests and commit**

Run: `npx vitest run packages/core/test && npm run typecheck`
Expected: PASS apart from the six pending pages.

```bash
git add packages/core/src packages/core/test tests/expectations
git commit -m "feat(rules): hidden visuals that still query, and the native quiet check on every fixture"
```

---

### Task 24: The six tier-1 pages

Scaffold, then draft with Task 19's brief and these notes, review, delete the pending set, regenerate, test, commit. Add the six slugs to a `PENDING_PAGES` set again for the scaffold step (`broken-field-reference`, `not-reached-from-report`, `landing-page-not-set`, `opening-page-invalid`, `filters-pane-state`, `hidden-visuals-still-query`) and delete the set once the pages are written, exactly as Tasks 18 and 19 did.

Two of these pages publish to the site before the rule behind them can run: `broken-field-reference` and `not-reached-from-report` are layer `project` and need both layers, and a `project` page publishes as soon as either family does, so from this pull request the site carries them while its browser always skips the rules (decision 15). That is accepted. If it is ever not, move those two pages to pull request 7 rather than change the gate.

Because those two publish, this is the one task in pull requests 2 to 6 where the site's pins move. In `packages/web/test/generate.test.ts` take the page count from 72 to 74 and the index sentence to `"74 rules: 66 model rules ported from Microsoft's Best Practice Analyzer ruleset so the results match Tabular Editor, 5 listed but not run because they need statistics only a live model has, and 3 built into pbiplint."`: both new pages are `builtin`, and the report clause is still left out because its count is zero (Task 18, Step 3). The other four pages here are layer `report` and publish in pull request 7.

| Page | Example shape | Notes |
|---|---|---|
| broken-field-reference | `visual.json` bound to `'Sales'[Region]` and `'Sales'[Profit]` (measure); fixed binds `'Sales'[Region]` and `[Total Sales]` | Runs against the stock model; say so. How to fix: open the visual in Desktop, the field shows with an error, re-pick it from the Data pane; or edit the `Entity`/`Property` in the JSON. When to ignore: never; a report measure that the model lacks is fine (it resolves). Quirks: matching is by name without regard to case; a measure on another table is reported as such. Related: `NOT_REACHED_FROM_REPORT` (the other direction), `REPORT_LEVEL_MEASURES` |
| not-reached-from-report | `visual.json` binding only `'Sales'[Region]` (Amount and Total Sales unreached); fixed adds `[Total Sales]` | Stock model. What it checks names every root (section 6). When to ignore: measures kept for other reports, columns used by a paginated report, a model shared by several reports (v2 reads one). Quirks: one report per run; relationship, RLS, OLS, variation, and sort-by columns count as reached; `UNNECESSARY_*` keep their one-hop logic for Tabular Editor parity. Related: `UNNECESSARY_MEASURES`, `UNNECESSARY_COLUMNS`, `BROKEN_FIELD_REFERENCE` |
| landing-page-not-set | `pages.json` without `landingPageName`; fixed with it | Desktop route: page settings, set as landing page (pagesMetadata 1.1.0). When to ignore: a one-page report. Related: `OPENING_PAGE_INVALID` |
| opening-page-invalid | `pages.json` whose `activePageName` is a hidden page (`tree.json` with the hidden page); fixed names the visible one | Related: `LANDING_PAGE_NOT_SET`, `HIDE_TOOLTIP_DRILLTROUGH_PAGES` |
| filters-pane-state | `report.json` with `expanded: true` plus the config fence `{ "rules": { "FILTERS_PANE_STATE": { "expect": "closed" } } }`; fixed `expanded: false` | Says the rule is silent without the policy and shows the config. When to ignore: none beyond not setting a policy |
| hidden-visuals-still-query | `visual.json` with `isHidden: true` and a field; fixed removes the visual's fields or, better, the visual (show it as an empty text box) | How to fix: delete it, or move it off the page; a bookmark that shows it is the legitimate case. Related: `REDUCE_VISUALS_ON_PAGE` (hidden visuals are not counted there), `VISUAL_WITHOUT_FIELDS` |

Commit message: `docs(rules): six tier-1 native pages`.

### Task 25: Verification and pull request 3

As Task 20 Steps 1 to 3 (add `/rules/broken-field-reference/` to the e2e `PAGES` list), branch `v2-native-tier-1`, title "v2 native rules, tier 1: broken references, unreached objects, opening page, Filters pane, hidden visuals", body:

```
Pull request 3 of 8 for the report layer, tracked in #9.

- `pbiplintRule` and the first six native rules: BROKEN_FIELD_REFERENCE and NOT_REACHED_FROM_REPORT read both layers; LANDING_PAGE_NOT_SET, OPENING_PAGE_INVALID, FILTERS_PANE_STATE (a policy rule, silent without `expect`), and HIDDEN_VISUALS_STILL_QUERY read the report.
- A policy rule can raise its severity under its policy (`policySeverity`), unless the config sets one.
- Every fixture's expectation file gains a `native` map; the two quiet fixtures list by name every native finding they produce, and the test fails on any other.
- Six pages, each proven through the engine; the two project-rule pages run against a stock model the test supplies.

Counts: 89 rules and pages.

Next: pull request 4, tier 2.
```

---

## Pull request 4: native rules, tier 2 (branch `v2-native-tier-2`)

### Task 26: DEFAULT_PAGE_NAME, VISUAL_WITHOUT_FIELDS, VISUAL_OUTSIDE_PAGE, REPORT_LEVEL_MEASURES

**Files:**
- Create: `packages/core/src/rules/pbiplint/pages.ts`, `packages/core/src/rules/pbiplint/measures.ts`
- Modify: `packages/core/src/rules/pbiplint/visuals.ts`, `index.ts`; counts to 93; the four `native` maps
- Test: `packages/core/test/rules-native-tier2.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest";
import { REPORT_LEVEL_MEASURES } from "../src/rules/pbiplint/measures.js";
import { DEFAULT_PAGE_NAME } from "../src/rules/pbiplint/pages.js";
import { VISUAL_OUTSIDE_PAGE, VISUAL_WITHOUT_FIELDS } from "../src/rules/pbiplint/visuals.js";
import { bound, column, j, page, reportObjectIds, visual } from "./report-helpers.js";

describe("DEFAULT_PAGE_NAME", () => {
  it("fires on Page <n>, Duplicate of <name>, and <name> (copy)", () => {
    const files = [
      page("a", { displayName: "Page 2" }),
      page("b", { displayName: "Duplicate of Overview" }),
      page("c", { displayName: "Overview (copy)" }),
      page("d", { displayName: "Page 2 sales" }),
      page("e", { displayName: "Overview" }),
    ];
    expect(reportObjectIds(DEFAULT_PAGE_NAME, files)).toEqual(["a", "b", "c"]);
  });
});

describe("VISUAL_WITHOUT_FIELDS", () => {
  it("fires on a data visual with nothing bound, never on decoration, navigation, or a group", () => {
    const files = [
      page("p"),
      visual("p", "emptyCard", "cardVisual"),
      visual("p", "emptyTable", "tableEx", {}, { query: { queryState: {} } }),
      bound("p", "card", "cardVisual", [column("Sales", "Amount")]),
      ...["shape", "basicShape", "textbox", "image", "actionButton", "pageNavigator", "bookmarkNavigator"].map((t) => visual("p", t, t)),
      { path: "definition/pages/p/visuals/g/visual.json", text: j({ name: "g", position: {}, visualGroup: { displayName: "G" } }) },
    ];
    expect(reportObjectIds(VISUAL_WITHOUT_FIELDS, files)).toEqual(["emptyCard", "emptyTable"]);
  });
});

describe("VISUAL_OUTSIDE_PAGE", () => {
  it("fires when a visual's box passes the page's right or bottom edge", () => {
    const at = (name: string, x: number, y: number, w: number, h: number) =>
      visual("p", name, "cardVisual", { position: { x, y, z: 0, width: w, height: h, tabOrder: 0 } });
    const files = [page("p", { width: 1280, height: 720 }), at("right", 1200, 0, 100, 50), at("bottom", 0, 700, 100, 50), at("inside", 0, 0, 1280, 720)];
    expect(reportObjectIds(VISUAL_OUTSIDE_PAGE, files)).toEqual(["right", "bottom"]);
    // A page whose file carries no width or height is not checked, whatever a visual's position.
    const noSize = [page("q", { width: undefined, height: undefined }), visual("q", "noPageSize", "cardVisual", { position: { x: 5000, y: 0, z: 0, width: 10, height: 10, tabOrder: 0 } })];
    expect(reportObjectIds(VISUAL_OUTSIDE_PAGE, noSize)).toEqual([]);
  });
});

describe("REPORT_LEVEL_MEASURES", () => {
  it("fires once per measure in reportExtensions.json", () => {
    const files = [{ path: "definition/reportExtensions.json", text: j({ entities: [{ name: "Sales", measures: [{ name: "Net Margin", expression: "1" }, { name: "Margin %", expression: "2" }] }] }) }];
    expect(reportObjectIds(REPORT_LEVEL_MEASURES, files)).toEqual(["Sales.Net Margin", "Sales.Margin %"]);
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `npx vitest run packages/core/test/rules-native-tier2.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement**

Create `packages/core/src/rules/pbiplint/pages.ts`:

```ts
import { reportFinding } from "../report-helpers.js";
import { pbiplintRule } from "./define.js";

/** The names Desktop gives a new or duplicated page, in current and older builds. */
const DEFAULT_NAMES = [/^Page \d+$/, /^Duplicate of .+$/, /^.+ \(copy\)$/];

export const DEFAULT_PAGE_NAME = pbiplintRule({
  id: "DEFAULT_PAGE_NAME",
  name: "Page keeps its default name",
  category: "Report Design",
  severity: 2,
  scope: ["Page"],
  layer: "report",
  check: ({ report }) =>
    report
      ? report.pages
          .filter((p) => DEFAULT_NAMES.some((re) => re.test(p.displayName)))
          .map((p) => reportFinding.page(p, "/displayName", `"${p.displayName}" is the name Desktop gave it`))
      : [],
});

export const pageRules = [DEFAULT_PAGE_NAME];
```

Add to `packages/core/src/rules/pbiplint/visuals.ts`:

```ts
/** Visual types that bind no fields by design: decoration, text, navigation, and group containers. */
const NON_DATA = new Set(["shape", "basicShape", "textbox", "image", "actionButton", "pageNavigator", "bookmarkNavigator", "visualGroup"]);

export const VISUAL_WITHOUT_FIELDS = pbiplintRule({
  id: "VISUAL_WITHOUT_FIELDS",
  name: "Data visual with no fields",
  category: "Report Design",
  severity: 2,
  scope: ["Visual"],
  layer: "report",
  check: ({ report }) =>
    report
      ? allVisuals(report)
          .filter((v) => !v.isGroup && !NON_DATA.has(v.type) && v.fields.length === 0)
          .map((v) => reportFinding.visual(v, "/visual/visualType", "no fields bound"))
      : [],
});

export const VISUAL_OUTSIDE_PAGE = pbiplintRule({
  id: "VISUAL_OUTSIDE_PAGE",
  name: "Visual extends past the page",
  category: "Report Design",
  severity: 2,
  scope: ["Visual"],
  layer: "report",
  check: ({ report }) =>
    report
      ? allVisuals(report).flatMap((v) => {
          const { width, height } = v.page;
          if (width === undefined || height === undefined) return [];
          const right = v.position.x + v.position.width - width;
          const bottom = v.position.y + v.position.height - height;
          const parts = [right > 0 && `${Math.round(right)} px past the right edge`, bottom > 0 && `${Math.round(bottom)} px past the bottom edge`].filter(Boolean) as string[];
          return parts.length ? [reportFinding.visual(v, "/position", parts.join(", "))] : [];
        })
      : [],
});

export const visualRules = [HIDDEN_VISUALS_STILL_QUERY, VISUAL_WITHOUT_FIELDS, VISUAL_OUTSIDE_PAGE];
```

Create `packages/core/src/rules/pbiplint/measures.ts`:

```ts
import { reportFinding } from "../report-helpers.js";
import { pbiplintRule } from "./define.js";

export const REPORT_LEVEL_MEASURES = pbiplintRule({
  id: "REPORT_LEVEL_MEASURES",
  name: "Measure defined in the report",
  category: "Maintenance",
  severity: 2,
  scope: ["ReportMeasure"],
  layer: "report",
  check: ({ report }) => (report ? report.measures.map((m) => reportFinding.reportMeasure(m, `defined in reportExtensions.json on table "${m.table}"; move it into the model`)) : []),
});

export const measureRules = [REPORT_LEVEL_MEASURES];
```

Register `pageRules` and `measureRules`; counts 93; pin the four `native` maps as in Task 23 (the demo fixture's page is called "Page 1", so `DEFAULT_PAGE_NAME` fires there by name).

- [ ] **Step 4: Run the tests and commit**

Run: `npx vitest run packages/core/test && npm run typecheck`
Expected: PASS apart from the four pending pages.

```bash
git add packages/core/src packages/core/test tests/expectations
git commit -m "feat(rules): default page names, empty visuals, visuals past the page, report-level measures"
```

### Task 27: The four tier-2 pages

As Task 24, slugs `default-page-name`, `visual-without-fields`, `visual-outside-page`, `report-level-measures`.

| Page | Example shape | Notes |
|---|---|---|
| default-page-name | `page.json` named "Page 2"; fixed "Overview" | Both Desktop spellings are matched; a page whose real name happens to match ("Page 2 of the deck") is the ignore case |
| visual-without-fields | `visual.json` card with no query; fixed binds `[Total Sales]` | Lists the excluded types; a custom visual that takes no fields is the ignore case |
| visual-outside-page | `visual.json` at x 1200 width 200 on the 1280-wide stock page; fixed x 1080 | Rounded pixels in the detail; Desktop's canvas settings route; a page with no size in its file is not checked |
| report-level-measures | `reportExtensions.json` with one measure; fixed has none (empty `entities`) | How to fix: recreate the measure in the model (Desktop, model view) and delete the report one; the DAX rules only read model measures; Related: `BROKEN_FIELD_REFERENCE` |

### Task 28: Verification and pull request 4

As Task 25, branch `v2-native-tier-2`, title "v2 native rules, tier 2: page names, empty visuals, page edges, report measures", counts 93.

---

## Pull request 5: native rules, tier 3 (branch `v2-native-tier-3`)

### Task 29: BROKEN_ACTION_TARGET, BROKEN_BOOKMARK_REFERENCE, TAB_ORDER_FOLLOWS_LAYOUT, SLICER_SELECTION_SAVED

**Files:**
- Create: `packages/core/src/rules/pbiplint/actions.ts`, `packages/core/src/rules/pbiplint/tab-order.ts`
- Modify: `packages/core/src/rules/pbiplint/visuals.ts`, `index.ts`; counts to 97; the four `native` maps
- Test: `packages/core/test/rules-native-tier3.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest";
import { BROKEN_ACTION_TARGET, BROKEN_BOOKMARK_REFERENCE } from "../src/rules/pbiplint/actions.js";
import { TAB_ORDER_FOLLOWS_LAYOUT } from "../src/rules/pbiplint/tab-order.js";
import { SLICER_SELECTION_SAVED } from "../src/rules/pbiplint/visuals.js";
import { buildIndexes } from "../src/index/build.js";
import { bound, column, j, lit, page, projectFrom, reportObjectIds, visual } from "./report-helpers.js";

const link = (props: Record<string, unknown>) => ({ visualContainerObjects: { visualLink: [{ properties: props }] } });
const bookmarks = [
  { path: "definition/bookmarks/bookmarks.json", text: j({ items: [{ name: "b1" }] }) },
  { path: "definition/bookmarks/b1.bookmark.json", text: j({ name: "b1", displayName: "Reset", explorationState: { activeSection: "p", sections: { p: { visualContainers: { v: {} } } } } }) },
];

describe("BROKEN_ACTION_TARGET", () => {
  it("fires on a page navigation, bookmark, or drillthrough action whose target does not exist", () => {
    const files = [
      page("p"),
      ...bookmarks,
      visual("p", "toGone", "actionButton", {}, link({ type: lit("'PageNavigation'"), navigationSection: lit("'gone'") })),
      visual("p", "toP", "actionButton", {}, link({ type: lit("'PageNavigation'"), navigationSection: lit("'p'") })),
      visual("p", "toBookmark", "actionButton", {}, link({ type: lit("'Bookmark'"), bookmark: lit("'b1'") })),
      visual("p", "toNoBookmark", "actionButton", {}, link({ type: lit("'Bookmark'"), bookmark: lit("'b9'") })),
      visual("p", "drill", "actionButton", {}, link({ type: lit("'DrillThrough'"), drillthroughSection: lit("'nowhere'") })),
      visual("p", "web", "actionButton", {}, link({ type: lit("'WebUrl'"), webUrl: lit("'https://example.com'") })),
      visual("p", "back", "actionButton", {}, link({ type: lit("'Back'") })),
    ];
    expect(reportObjectIds(BROKEN_ACTION_TARGET, files)).toEqual(["toGone", "toNoBookmark", "drill"]);
  });
});

describe("BROKEN_BOOKMARK_REFERENCE", () => {
  it("fires on a bookmark whose active page, captured page, or captured visual does not exist", () => {
    const files = [page("p"), visual("p", "v", "cardVisual"), ...bookmarks];
    expect(reportObjectIds(BROKEN_BOOKMARK_REFERENCE, files)).toEqual([]);
    const broken = [
      page("p"),
      { path: "definition/bookmarks/b2.bookmark.json", text: j({ name: "b2", displayName: "Broken", explorationState: { activeSection: "gone", sections: { p: { visualContainers: { missing: {} } }, other: {} } } }) },
    ];
    const project = projectFrom(broken);
    const findings = BROKEN_BOOKMARK_REFERENCE.check(project, { indexes: buildIndexes(project), options: {} });
    expect(findings.map((f) => f.detail)).toEqual([
      'active page "gone" does not exist',
      'captured page "other" does not exist',
      'captured visual "missing" is not on page "Page p"',
    ]);
  });
});

describe("TAB_ORDER_FOLLOWS_LAYOUT", () => {
  const at = (name: string, x: number, y: number, tabOrder: number) =>
    visual("p", name, "cardVisual", { position: { x, y, z: 0, width: 100, height: 50, tabOrder } });
  it("fires when the tab order disagrees with top-to-bottom, left-to-right reading order", () => {
    expect(reportObjectIds(TAB_ORDER_FOLLOWS_LAYOUT, [page("p"), at("a", 0, 0, 3000), at("b", 200, 5, 2000), at("c", 0, 200, 1000)])).toEqual(["p"]);
    expect(reportObjectIds(TAB_ORDER_FOLLOWS_LAYOUT, [page("p"), at("a", 0, 0, 1000), at("b", 200, 5, 2000), at("c", 0, 200, 3000)])).toEqual([]);
    // Within half the median height, a row is a row: b sits a little lower than a and still reads after it.
    expect(reportObjectIds(TAB_ORDER_FOLLOWS_LAYOUT, [page("p"), at("a", 0, 0, 1000), at("b", 200, 20, 2000)])).toEqual([]);
    expect(reportObjectIds(TAB_ORDER_FOLLOWS_LAYOUT, [page("p"), at("only", 0, 0, 1000)])).toEqual([]);
  });
  it("says which two visuals disagree first", () => {
    const project = projectFrom([page("p"), at("a", 0, 0, 3000), at("b", 200, 5, 2000), at("c", 0, 200, 1000)]);
    const [f] = TAB_ORDER_FOLLOWS_LAYOUT.check(project, { indexes: buildIndexes(project), options: {} });
    expect(f!.detail).toBe('tab order starts at cardVisual (c) but the layout reads cardVisual (a) first');
  });
});

describe("SLICER_SELECTION_SAVED", () => {
  const slicer = (name: string, applied: boolean) =>
    bound("p", name, "slicer", [column("Product", "Category")], { filterConfig: { filters: [{ name: "f", field: column("Product", "Category"), type: "Categorical", ...(applied ? { filter: { Where: [] } } : {}) }] } });
  it("fires on a slicer with a saved selection, as info, and as a warning under the policy", () => {
    expect(reportObjectIds(SLICER_SELECTION_SAVED, [page("p"), slicer("saved", true), slicer("clear", false)])).toEqual(["saved"]);
    expect(SLICER_SELECTION_SAVED.severity).toBe(1);
    expect(SLICER_SELECTION_SAVED.policySeverity!({ expect: "none" })).toBe(2);
    expect(SLICER_SELECTION_SAVED.policySeverity!({})).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `npx vitest run packages/core/test/rules-native-tier3.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement**

Create `packages/core/src/rules/pbiplint/actions.ts`:

```ts
import { allVisuals, reportFinding } from "../report-helpers.js";
import type { RuleFinding } from "../types.js";
import { pbiplintRule } from "./define.js";

export const BROKEN_ACTION_TARGET = pbiplintRule({
  id: "BROKEN_ACTION_TARGET",
  name: "Action points at nothing",
  category: "Error Prevention",
  severity: 3,
  scope: ["Visual"],
  layer: "report",
  check: ({ report }) => {
    if (!report) return [];
    const pages = new Set(report.pages.map((p) => p.id));
    const bookmarks = new Set(report.bookmarks.map((b) => b.id));
    return allVisuals(report).flatMap((v) =>
      v.actions.flatMap((a): RuleFinding[] => {
        if (a.type === "PageNavigation" || a.type === "DrillThrough") {
          if (a.target === undefined) return [reportFinding.visual(v, a.pointer, `${a.type} action names no page`)];
          return pages.has(a.target) ? [] : [reportFinding.visual(v, a.pointer, `${a.type} action points at page "${a.target}", which does not exist`)];
        }
        if (a.type === "Bookmark") {
          if (a.target === undefined) return [reportFinding.visual(v, a.pointer, "Bookmark action names no bookmark")];
          return bookmarks.has(a.target) ? [] : [reportFinding.visual(v, a.pointer, `Bookmark action points at bookmark "${a.target}", which does not exist`)];
        }
        return [];
      }),
    );
  },
});

export const BROKEN_BOOKMARK_REFERENCE = pbiplintRule({
  id: "BROKEN_BOOKMARK_REFERENCE",
  name: "Bookmark refers to a missing page or visual",
  category: "Error Prevention",
  severity: 2,
  scope: ["Bookmark"],
  layer: "report",
  check: ({ report }) => {
    if (!report) return [];
    const pages = new Map(report.pages.map((p) => [p.id, p]));
    return report.bookmarks.flatMap((b): RuleFinding[] => {
      const out: RuleFinding[] = [];
      if (b.activePage !== undefined && !pages.has(b.activePage)) out.push(reportFinding.bookmark(b, `active page "${b.activePage}" does not exist`));
      for (const id of b.pages) if (!pages.has(id)) out.push(reportFinding.bookmark(b, `captured page "${id}" does not exist`));
      for (const { page, visual } of b.visuals) {
        const p = pages.get(page);
        if (p && !p.visuals.some((v) => v.id === visual)) out.push(reportFinding.bookmark(b, `captured visual "${visual}" is not on page "${p.displayName}"`));
      }
      return out;
    });
  },
});

export const actionRules = [BROKEN_ACTION_TARGET, BROKEN_BOOKMARK_REFERENCE];
```

Create `packages/core/src/rules/pbiplint/tab-order.ts`:

```ts
import { visualLabel } from "../../pbir/names.js";
import type { Visual } from "../../pbir/types.js";
import { reportFinding } from "../report-helpers.js";
import { pbiplintRule } from "./define.js";

const median = (xs: number[]): number => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length % 2 ? s[(s.length - 1) / 2]! : (s[s.length / 2 - 1]! + s[s.length / 2]!) / 2;
};

/**
 * Reading order: rows top to bottom, left to right within a row. A visual joins the current row
 * when its top is within half the median visual height of the row's first top; otherwise it
 * starts a new row. The tolerance is what keeps two visuals a few pixels apart on one row.
 */
export function readingOrder(visuals: Visual[]): Visual[] {
  const tolerance = median(visuals.map((v) => v.position.height)) / 2;
  const byTop = [...visuals].sort((a, b) => a.position.y - b.position.y || a.position.x - b.position.x);
  const rows: Visual[][] = [];
  for (const v of byTop) {
    const row = rows[rows.length - 1];
    if (row && Math.abs(v.position.y - row[0]!.position.y) <= tolerance) row.push(v);
    else rows.push([v]);
  }
  return rows.flatMap((row) => row.sort((a, b) => a.position.x - b.position.x || a.position.y - b.position.y));
}

export const TAB_ORDER_FOLLOWS_LAYOUT = pbiplintRule({
  id: "TAB_ORDER_FOLLOWS_LAYOUT",
  name: "Tab order disagrees with the layout",
  category: "Accessibility",
  severity: 2,
  scope: ["Page"],
  layer: "report",
  check: ({ report }) =>
    (report?.pages ?? []).flatMap((p) => {
      const visuals = p.visuals.filter((v) => !v.isHidden && !v.isGroup && v.position.tabOrder !== undefined);
      if (visuals.length < 2) return [];
      const layout = readingOrder(visuals);
      const tabs = [...visuals].sort((a, b) => a.position.tabOrder! - b.position.tabOrder!);
      const i = layout.findIndex((v, k) => v !== tabs[k]);
      if (i === -1) return [];
      const detail = i === 0
        ? `tab order starts at ${visualLabel(tabs[0]!).replace(/ on ".*"$/, "")} but the layout reads ${visualLabel(layout[0]!).replace(/ on ".*"$/, "")} first`
        : `tab order visits ${visualLabel(tabs[i]!).replace(/ on ".*"$/, "")} where the layout reads ${visualLabel(layout[i]!).replace(/ on ".*"$/, "")}`;
      return [reportFinding.page(p, undefined, detail)];
    }),
});

export const tabOrderRules = [TAB_ORDER_FOLLOWS_LAYOUT];
```

Add to `packages/core/src/rules/pbiplint/visuals.ts`:

```ts
export const SLICER_SELECTION_SAVED = pbiplintRule({
  id: "SLICER_SELECTION_SAVED",
  name: "Slicer saved with a selection",
  category: "Report Design",
  severity: 1,
  scope: ["Visual"],
  layer: "report",
  options: [{ name: "expect", type: "string", values: ["none"] }],
  policySeverity: (o) => (o.expect === "none" ? 2 : undefined),
  check: ({ report }) =>
    report
      ? allVisuals(report)
          .filter((v) => v.type === "slicer" && v.filters.some((f) => f.applied))
          .map((v) => reportFinding.visual(v, v.filters.find((f) => f.applied)!.pointer, "opens with this selection applied"))
      : [],
});
```

and append it to `visualRules`. Register `actionRules` and `tabOrderRules`; counts 97; pin the `native` maps.

- [ ] **Step 4: Run the tests and commit**

Run: `npx vitest run packages/core/test && npm run typecheck`
Expected: PASS apart from the four pending pages.

```bash
git add packages/core/src packages/core/test tests/expectations
git commit -m "feat(rules): broken action targets, broken bookmarks, tab order against layout, saved slicer selections"
```

### Task 30: The four tier-3 pages

As Task 24, slugs `broken-action-target`, `broken-bookmark-reference`, `tab-order-follows-layout`, `slicer-selection-saved`.

| Page | Example shape | Notes |
|---|---|---|
| broken-action-target | `visual.json` button with `navigationSection` naming a missing page; fixed names `p1` (the stock page) | Web URL, Back, and Q&A actions are not checked; Related: `BROKEN_BOOKMARK_REFERENCE` |
| broken-bookmark-reference | `Reset.bookmark.json` capturing visual `gone` on `p1`; fixed captures nothing | Related: `BROKEN_ACTION_TARGET` |
| tab-order-follows-layout | `tree.json` with three visuals whose `tabOrder` runs against their positions; fixed reorders `tabOrder` | Documents the heuristic (rows, half the median height) and that "not set" is not detectable because Desktop always writes `tabOrder`; Desktop route is the Selection pane's Tab order tab; hidden visuals and groups are left out |
| slicer-selection-saved | `visual.json` slicer with a `filter` on its filterConfig entry; fixed drops the `filter` object; a config fence with `expect: "none"` shows the policy | Says the rule is info without a policy and a warning with `expect: "none"`; When to ignore: a default selection readers expect |

### Task 31: Verification and pull request 5

As Task 25, branch `v2-native-tier-3`, title "v2 native rules, tier 3: actions, bookmarks, tab order, slicer selections", counts 97. The pull request body adds one sentence: "Every rule in spec section 8 now exists with a page; the sample that fires them all is pull request 6."

---

## Pull request 6: the sample project (branch `v2-sample-report`)

```bash
cd ~/Projects/pbiplint && git switch main && git pull --ff-only && git switch -c v2-sample-report
```

Shared facts for this pull request:

- `examples/messy-sales/` becomes a PBIP: `Messy Sales Demo.SemanticModel/` (today's files, moved with `git mv`), `Messy Sales Demo.Report/`, `Messy Sales Demo.pbip`, and `pbiplint.config.json`. Both `.platform` files say `displayName: "Messy Sales Demo"`. The model's TMDL does not change, so `tests/expectations/messy-sales.json` keeps its findings and only its `fixture` path moves.
- The report ships no `StaticResources`, no `.pbi`, no registered resources; `report.json` names the stock base theme `Fluent2-CY26SU04` under `themeCollection.baseTheme` with `type: "SharedResources"`, as the demo fixture does. Schema versions: report 3.2.0, page 2.1.0, visual 2.8.0, pagesMetadata 1.0.0 (a landing page is deliberately absent, and 1.0.0 has no such property).
- Every visual is written by copying the shape of a visual of the same type from `tests/fixtures/pbip-and-github-demo` and changing names, positions, and fields; nothing is written from memory. Ids are 20 lowercase hex characters, generated once (`node -e 'console.log(require("crypto").randomBytes(10).toString("hex"))'`) and then fixed in the files; the expectation file names them, so they never change afterwards.
- Validation after every batch of files: `npx --yes @microsoft/powerbi-report-authoring-cli@0.1.4 validate "examples/messy-sales/Messy Sales Demo.Report"` (Node 20 or later; the package is a development-time tool and is not added to the repository). If the `powerbi-authoring` plugin from `microsoft/skills-for-fabric` is installed in the executing session, its authoring mode may write the files; the validate step is required either way.
- The planted violations: every report rule, that is the spec's section 11 list plus, approved on 2026-09-20, the seven ported rules it left out and a hidden active page for `OPENING_PAGE_INVALID` (decision 9). Everything else is clean: every visual but the one planting alt text has alt text, one visual carries a hex colour, one has more than six fields, one has `showAll`, one page carries the TopN and Advanced filter overflow, every other page is named, every other visual is inside its page, every action and bookmark target but the two planted is real, and tab order follows layout except on the one page that plants it.

### Task 32: `examples/messy-sales` becomes a PBIP folder

**Files:**
- Move: `examples/messy-sales/{.platform,definition.pbism,definition,.pbi}` to `examples/messy-sales/Messy Sales Demo.SemanticModel/`
- Create: `examples/messy-sales/Messy Sales Demo.pbip`
- Modify: `examples/messy-sales/Messy Sales Demo.SemanticModel/.platform` (displayName)
- Modify: `packages/cli/src/sample.ts`, `packages/cli/build.mjs`, `scripts/check-pack.mjs`, `packages/web/src/sample.ts`, `tests/expectations/messy-sales.json`, `packages/core/test/version.test.ts`, `packages/core/test/helpers.ts` (`examplesDir` stays), `CONTRIBUTING.md` (the layout line)
- Test: `packages/web/test/sample.test.ts`, `packages/cli/test/cli.test.ts`, `scripts/test/check-pack.test.mjs`

**Interfaces:**
- `sampleDir()` in the CLI returns the PBIP folder (it looks for a folder holding a `.SemanticModel` child or a `definition` child, in that order of candidates).
- `packages/web/src/sample.ts` exports `SAMPLE_FILES: LintFile[]` with part-relative paths for both parts (the model's `definition/...`, the report's `definition/...`, `definition.pbir`, `.platform`, and `Messy Sales Demo.pbip`), `SAMPLE_CONFIG: string | undefined` (the config file's text), `SAMPLE_NAME = "the sample project"`, and `sampleLayers(files): { model: number; report: number }` for the results heading. Until Task 33 adds the report, the report glob matches nothing and the sample stays model-only, so every pinned count holds.

- [ ] **Step 1: Move the model and write the project file**

```bash
cd examples/messy-sales
mkdir "Messy Sales Demo.SemanticModel"
git mv .platform definition.pbism definition .pbi "Messy Sales Demo.SemanticModel/"
cd ../..
```

Write `examples/messy-sales/Messy Sales Demo.pbip`:

```json
{
  "$schema": "https://developer.microsoft.com/json-schemas/fabric/pbip/pbipProperties/1.0.0/schema.json",
  "version": "1.0",
  "artifacts": [
    {
      "report": {
        "path": "Messy Sales Demo.Report"
      }
    }
  ],
  "settings": {
    "enableAutoRecovery": true
  }
}
```

Set `metadata.displayName` in the moved `.platform` to `"Messy Sales Demo"`. In `tests/expectations/messy-sales.json` change `fixture` to `"examples/messy-sales/Messy Sales Demo.SemanticModel"`. In `packages/core/test/version.test.ts` read the model from `join(examplesDir, "messy-sales/Messy Sales Demo.SemanticModel")`.

- [ ] **Step 2: Write the failing tests**

In `packages/web/test/sample.test.ts`, the expected path list keeps the eleven model paths (the report joins in Task 33), and two new tests:

```ts
  it("exposes the sample's config and its layer counts", () => {
    expect(SAMPLE_CONFIG).toBeUndefined();
    expect(sampleLayers(SAMPLE_FILES)).toEqual({ model: 11, report: 0 });
  });
  it("gives each part its own relative paths, and refuses a file outside both parts", () => {
    const files = sampleFiles({
      "/x/examples/messy-sales/Messy Sales Demo.SemanticModel/definition/tables/B.tmdl": "table B\n",
      "/x/examples/messy-sales/Messy Sales Demo.Report/definition/report.json": "{}",
      "/x/examples/messy-sales/Messy Sales Demo.Report/definition.pbir": "{}",
      "/x/examples/messy-sales/Messy Sales Demo.pbip": "{}",
    });
    expect(files.map((f) => f.path).sort()).toEqual(["Messy Sales Demo.pbip", "definition.pbir", "definition/report.json", "definition/tables/B.tmdl"].sort());
    expect(() => sampleFiles({ "/x/examples/messy-sales/README.md": "" })).toThrow(/outside the sample project/);
  });
```

In `scripts/test/check-pack.test.mjs`, the required CLI files become `sample/Messy Sales Demo.SemanticModel/definition/model.tmdl`, `sample/Messy Sales Demo.SemanticModel/definition/tables/Sales.tmdl`, and `sample/Messy Sales Demo.pbip`; Task 33 adds `sample/Messy Sales Demo.Report/definition/report.json` and `sample/pbiplint.config.json`.

- [ ] **Step 3: Run them to see them fail, then implement**

Run: `npx vitest run packages/web/test/sample.test.ts scripts/test/check-pack.test.mjs packages/cli/test packages/core/test/version.test.ts packages/core/test/parity.test.ts`
Expected: FAIL on the sample module's exports and the CLI's `sampleDir`.

`packages/cli/src/sample.ts`:

```ts
import { existsSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/** True for a PBIP folder (a .SemanticModel or .Report child) or a bare model (a definition child). */
const looksLikeProject = (dir: string): boolean =>
  existsSync(dir) &&
  (readdirSync(dir).some((n) => n.endsWith(".SemanticModel") || n.endsWith(".Report")) || existsSync(join(dir, "definition")));

/** The bundled sample (packages/cli/sample after build) or the repo copy (examples/messy-sales) in development. */
export function sampleDir(): string {
  const here = dirname(fileURLToPath(import.meta.url));
  for (const candidate of [join(here, "..", "sample"), join(here, "..", "..", "sample"), join(here, "..", "..", "..", "examples", "messy-sales")])
    if (looksLikeProject(candidate)) return candidate;
  throw new Error("Bundled sample project not found");
}
```

`packages/cli/build.mjs` is unchanged (it copies the whole folder). `scripts/check-pack.mjs` `REQUIRED.pbiplint` lists the three paths above. `packages/web/src/sample.ts`:

```ts
/// <reference types="vite/client" />
import type { LintFile } from "@pbiplint/core";

// Vite inlines the sample into the bundle at build time; the page never fetches it. The model's
// TMDL, the report's JSON, and the project file are all globbed; the report glob matches nothing
// until the report exists.
const raw = import.meta.glob(
  [
    "../../../examples/messy-sales/*.SemanticModel/definition/**/*.tmdl",
    "../../../examples/messy-sales/*.Report/definition/**/*.json",
    "../../../examples/messy-sales/*.Report/definition.pbir",
    "../../../examples/messy-sales/*.Report/.platform",
    "../../../examples/messy-sales/*.pbip",
  ],
  { query: "?raw", import: "default", eager: true },
) as Record<string, string>;
const config = import.meta.glob("../../../examples/messy-sales/pbiplint.config.json", { query: "?raw", import: "default", eager: true }) as Record<string, string>;

const SAMPLE_ROOT = "examples/messy-sales/";

/** A globbed key as the path lint expects: relative to its part, or the bare .pbip name. */
export function sampleFiles(raw: Record<string, string>): LintFile[] {
  return Object.entries(raw)
    .map(([key, text]) => {
      const at = key.indexOf(SAMPLE_ROOT);
      if (at === -1) throw new Error(`Sample file outside the sample project: ${key}`);
      const rel = key.slice(at + SAMPLE_ROOT.length);
      const part = /^[^/]+\.(SemanticModel|Report)\/(.+)$/.exec(rel);
      if (part) return { path: part[2]!, text };
      if (rel.endsWith(".pbip") && !rel.includes("/")) return { path: rel, text };
      throw new Error(`Sample file outside the sample project: ${key}`);
    })
    .sort((a, b) => a.path.localeCompare(b.path, "en"));
}

export const SAMPLE_FILES: LintFile[] = sampleFiles(raw);
export const SAMPLE_CONFIG: string | undefined = Object.values(config)[0];
export const SAMPLE_NAME = "the sample project";

/** How many files each part contributes, for the results heading. */
export const sampleLayers = (files: LintFile[]): { model: number; report: number } => ({
  model: files.filter((f) => f.path.endsWith(".tmdl")).length,
  report: files.filter((f) => !f.path.endsWith(".tmdl")).length,
});
```

In `packages/web/src/main.ts`, the sample click passes the config: `run({ files: SAMPLE_FILES, source: …, config: SAMPLE_CONFIG === undefined ? undefined : { path: "pbiplint.config.json", text: SAMPLE_CONFIG }, read: … })`; the heading stays `the sample project (11 files)` until Task 38 changes the heading format.

- [ ] **Step 4: Run the suite and commit**

Run: `npm run lint && npm run typecheck && npm test && npm run build && npm run check:pack && npm run test:bundle -w pbiplint`
Expected: PASS; 161 findings everywhere still, `--sample` prints `Model: 11 files.`

```bash
git add -A examples packages scripts tests/expectations/messy-sales.json CONTRIBUTING.md
git commit -m "chore(sample): examples/messy-sales becomes a PBIP folder with the model as its first part"
```

---

### Task 33: Author the sample report

**Files:**
- Create: `examples/messy-sales/Messy Sales Demo.Report/.platform`, `definition.pbir`, `definition/version.json`, `definition/report.json`, `definition/pages/pages.json`, seven `page.json` files, the visual files, `definition/bookmarks/bookmarks.json`, `definition/bookmarks/<id>.bookmark.json`, `definition/reportExtensions.json`
- Create: `examples/messy-sales/pbiplint.config.json`

The report, page by page. Visual ids are chosen once; the table names the visuals by title so the expectation file can be written from a run.

| Page (display name) | Settings | Visuals | Plants |
|---|---|---|---|
| Overview | 1280 by 720, visible, the active page is not this one | "Sales by region": clusteredBarChart bound to `'Sales'[Region]` (Category) and `[Total Sales]` (Y); "Total Sales", "Order Count", "Average Order Value": cardVisual each bound to that measure; "Sales by category": donutChart bound to `'Product'[Category]` and `[Total Sales]`; "Category" slicer bound to `'Product'[Category]` with a saved selection (`filterConfig` entry of type Categorical carrying a `filter` with a `Where` selecting "Bikes"); "Go to detail": actionButton with `visualLink` type PageNavigation whose `navigationSection` is `deadpage00000000000000` (no such page); "Sales trend (old)": lineChart, `isHidden: true`, bound to `'Date'[Month]` and `[Total Sales]`; "Debug table": tableEx, `isHidden: true`, bound to six Sales columns; "Placeholder": cardVisual with no query; "Notes": textbox at x 1200 width 200 (past the right edge) | BROKEN_FIELD_REFERENCE (Sales has no Region), SLICER_SELECTION_SAVED, BROKEN_ACTION_TARGET, HIDDEN_VISUALS_STILL_QUERY (two), VISUAL_WITHOUT_FIELDS, VISUAL_OUTSIDE_PAGE |
| Page 2 | visible | "Total Quantity" card bound to `[Total Quantity]`, its value colour a hex literal (a `solid.color` whose Literal is `'#1F77B4'` under the card's formatting objects, the property shape copied from a fixture visual that sets a colour) | DEFAULT_PAGE_NAME, ENSURE_THEME_COLOURS |
| Duplicate of Overview | visible | "Sales by brand": clusteredBarChart bound to `'Product'[Brand]` (Category) and `[Total Sales]` (Y), with `showAll: true` on the Category role | DEFAULT_PAGE_NAME, AVOID_SHOW_ITEMS_WITH_NO_DATA |
| Product tooltip | `pageBinding.type: "Tooltip"`, visibility AlwaysVisible (absent), 320 by 240 | "Product name" card bound to `'Product'[Product Name]` | HIDE_TOOLTIP_DRILLTROUGH_PAGES |
| Detail | height 1080, width 1280, visible | three cards in one row, "Net Sales", "Total Cost", "Total Margin", with `tabOrder` descending left to right (3000, 2000, 1000); below them "Sales detail": tableEx, `tabOrder` 4000, bound to seven Sales columns (Sale ID, Sale Date, Product ID, Customer ID, Quantity, Unit Price, Total Amount) | ENSURE_PAGES_DO_NOT_SCROLL_VERTICALLY, TAB_ORDER_FOLLOWS_LAYOUT, REDUCE_OBJECTS_WITHIN_VISUALS |
| Scratch | visibility HiddenInViewMode; `activePageName` names this page | "Scratch note" textbox with no alt text | OPENING_PAGE_INVALID (with no landing page, so LANDING_PAGE_NOT_SET fires too), ENSURE_ALTTEXT |
| Crowded | visible | 21 cardVisuals bound to `[Total Sales]`, laid out in a grid of 7 by 3, tab order following the grid; five of them carry a TopN filter (a `filterConfig` entry of type TopN on `'Product'[Product Name]`, top 5 by `[Total Sales]`), five others an applied Advanced filter (type Advanced on `'Sales'[Quantity]` with a `filter` whose `Where` requires a value above 0) | REDUCE_VISUALS_ON_PAGE, REDUCE_TOPN_FILTERS, REDUCE_ADVANCED_FILTERS |
| Customers | visible | "Distinct Customers" card bound to `[Distinct Customers]` | with the three pages below, eleven pages: REDUCE_PAGES |
| Stores | visible | "Average Unit Price" card bound to `[Average Unit Price]` | counted in REDUCE_PAGES |
| Employees | visible | "Total Cost" card bound to `[Total Cost]` | counted in REDUCE_PAGES |
| Promotions | visible | "Total Discount" card bound to `[Total Discount]` | counted in REDUCE_PAGES |

Report-level files:

- `report.json`: schema 3.2.0; `themeCollection.baseTheme` Fluent2-CY26SU04 SharedResources; `objects.outspacePane[0].properties.expanded` literal `"true"` (FILTERS_PANE_STATE under the config's policy); `publicCustomVisuals: ["ChicletSlicer1448559807354"]` (REMOVE_UNUSED_CUSTOM_VISUALS); `resourcePackages` with the SharedResources entry only; `settings` as the demo fixture's.
- `pages.json`: pagesMetadata 1.0.0, `pageOrder` in the table's order, `activePageName` the Scratch page, no `landingPageName` (LANDING_PAGE_NOT_SET).
- `bookmarks.json` with one item; `<id>.bookmark.json` "Reset" whose `explorationState.activeSection` is Overview and whose `sections.<overview>.visualContainers` names the id `deadvisual0000000000` (BROKEN_BOOKMARK_REFERENCE).
- `reportExtensions.json`: entity Sales with measures `Net Margin` (`[Total Sales] - [Total Cost]`) and `Margin % (report)` (`DIVIDE([Net Margin], [Total Sales])`) (REPORT_LEVEL_MEASURES, two).
- NOT_REACHED_FROM_REPORT fires without any model change: `Sales LY` and `Sales YoY %` are bound nowhere, and `Sales YoY %` references `Sales LY`, so the finding on `Sales LY` reads "referenced only by [Sales YoY %], which nothing reaches either".
- `pbiplint.config.json`:

```json
{
  "$schema": "https://pbiplint.com/schema/pbiplint.config.schema.json",
  "rules": {
    "FILTERS_PANE_STATE": { "expect": "closed" }
  }
}
```

Every visual but the Scratch note carries `visualContainerObjects.general[0].properties.altText` with a literal describing it, and a `title` where the table names one. The Crowded page's 21 cards are stamped from one template by a throwaway script in the scratchpad (not committed): read one card file, write 21 copies with fresh ids, positions on the grid, and `tabOrder` 1000 to 21000, then add the TopN filter to the first five and the applied Advanced filter to the next five (the filter shapes copied from a fixture visual that carries one of each: `grep -l '"TopN"' tests/fixtures/*/*.Report/definition/pages/*/visuals/*/visual.json` finds them).

- [ ] **Step 1: Write the files, validating after each page**

Write `.platform`, `definition.pbir` (`byPath: "../Messy Sales Demo.SemanticModel"`), `version.json`, `report.json`, `pages.json`, then each page with its visuals, then the bookmark and extensions, running the validator after each page:

```bash
npx --yes @microsoft/powerbi-report-authoring-cli@0.1.4 validate "examples/messy-sales/Messy Sales Demo.Report"
```

Expected: no errors. A schema error names the file and property; fix it against the demo fixture's shape.

- [ ] **Step 2: Sanitise and run**

```bash
node scripts/sanitize-fixture.mjs examples/messy-sales
node packages/cli/dist/pbiplint.mjs examples/messy-sales --fail-on none
```

(build the CLI first with `npm run build -w pbiplint`). Expected: the facts block reads, in substance, `Opens on Scratch (hidden) (the page open when it was saved; no landing page set)`, `Filters pane open`, `Pages 11 (1 hidden, 1 tooltip)`, `Visuals 43 (2 hidden; 1 custom visual type registered, 0 used)`, `Report measures 2`, `Slicers 1 (1 with a saved selection)`, `Mobile layouts none`, `Schema versions report 3.2.0, page 2.1.0, visual 2.8.0`, `Model 7 tables, 74 columns, 14 measures; N columns and 2 measures not reached`; and every one of the 25 report rules appears in the groups, each with the count the table implies; nothing else appears apart from `NOT_REACHED_FROM_REPORT` and the model rules. Fix the JSON until that is so.

- [ ] **Step 3: Commit**

```bash
git add examples/messy-sales
git commit -m "feat(sample): Messy Sales Demo.Report, one planted violation per report rule"
```

---

### Task 34: Expectations for the sample and the pinned counts

**Files:**
- Create: `tests/expectations/messy-sales.report.json` (hand-written: `native` for every native rule and `ours` for the planted ported rules, no `results`)
- Modify: `packages/core/test/report-parity.test.ts` (an expectation without `results` is checked on `native` and `ours` only, and every ported and native rule listed must fire)
- Modify: the count pins: `packages/web/test/sample.test.ts`, `packages/cli/test/cli.test.ts`, `packages/web/test/export.test.ts`, `packages/web/test/home.test.ts`, `packages/web/test/render.test.ts`, `packages/web/e2e/home.spec.ts`, `packages/core/test/version.test.ts` (`topGroups` order), `scripts/test/check-pack.test.mjs`, `scripts/check-pack.mjs`

- [ ] **Step 1: Write the expectation and the test change**

`tests/expectations/messy-sales.report.json`:

```json
{
  "fixture": "examples/messy-sales",
  "report": "Messy Sales Demo.Report",
  "oracle": "hand-written; the sample plants every report rule (spec section 11, amended 2026-09-20)",
  "captured": "2026-09-2x",
  "deviations": {},
  "ours": {
    "REMOVE_UNUSED_CUSTOM_VISUALS": ["ChicletSlicer1448559807354"],
    "REDUCE_VISUALS_ON_PAGE": ["<crowded page id>"],
    "REDUCE_OBJECTS_WITHIN_VISUALS": ["<sales detail id>"],
    "REDUCE_TOPN_FILTERS": ["<crowded page id>"],
    "REDUCE_ADVANCED_FILTERS": ["<crowded page id>"],
    "REDUCE_PAGES": ["report"],
    "AVOID_SHOW_ITEMS_WITH_NO_DATA": ["<sales by brand id>"],
    "HIDE_TOOLTIP_DRILLTROUGH_PAGES": ["<tooltip page id>"],
    "ENSURE_THEME_COLOURS": ["<total quantity card id>"],
    "ENSURE_PAGES_DO_NOT_SCROLL_VERTICALLY": ["<detail page id>"],
    "ENSURE_ALTTEXT": ["<scratch note id>"]
  },
  "native": {
    "BROKEN_FIELD_REFERENCE": ["<sales by region visual id>"],
    "NOT_REACHED_FROM_REPORT": ["[Sales LY]", "[Sales YoY %]", "'Customer'[City]", "..."],
    "LANDING_PAGE_NOT_SET": ["report"],
    "OPENING_PAGE_INVALID": ["report"],
    "FILTERS_PANE_STATE": ["report"],
    "HIDDEN_VISUALS_STILL_QUERY": ["<sales trend (old) id>", "<debug table id>"],
    "DEFAULT_PAGE_NAME": ["<page 2 id>", "<duplicate page id>"],
    "VISUAL_WITHOUT_FIELDS": ["<placeholder id>"],
    "VISUAL_OUTSIDE_PAGE": ["<notes id>"],
    "REPORT_LEVEL_MEASURES": ["Sales.Net Margin", "Sales.Margin % (report)"],
    "BROKEN_ACTION_TARGET": ["<go to detail id>"],
    "BROKEN_BOOKMARK_REFERENCE": ["<bookmark id>"],
    "TAB_ORDER_FOLLOWS_LAYOUT": ["<detail page id>"],
    "SLICER_SELECTION_SAVED": ["<category slicer id>"]
  }
}
```

with every placeholder replaced by the real id from the files, and the `NOT_REACHED_FROM_REPORT` list written out in full from the run (it is long; that is the pin). In `report-parity.test.ts`: when `exp.results` is undefined, skip the oracle `it.each` and the two oracle-shaped tests, and add for such a file `it.each(Object.keys(exp.ours))("%s fires as planted", (id) => expect([...(ours[id] ?? [])].sort()).toEqual([...exp.ours[id]!].sort()))`; and a test that every native rule and every ported report rule fires on the sample: `for (const r of native) expect(exp.native[r.id], r.id).toBeDefined(); for (const r of ported) expect(exp.ours[r.id], r.id).toBeDefined();` when `exp.name === "messy-sales"`.

Run the sample through the CLI in JSON and copy the totals into the pins:

```bash
node packages/cli/dist/pbiplint.mjs examples/messy-sales --format json --fail-on none | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const d=JSON.parse(s);console.log(d.summary, d.layers);})'
```

Update every pinned `161 findings (16 errors, 39 warnings, 106 info) in 11 files` to the new sentence, `Results for the sample project (11 files)` to the new heading Task 38 will produce (until then the heading is `the sample project (N files)` with N the total; write that now and let Task 38 change it again), `topGroups` in `version.test.ts` to the new top five (BROKEN_FIELD_REFERENCE and OPENING_PAGE_INVALID are errors in Error Prevention and rank above the model errors), and `check-pack` to require the report's `definition/report.json` and `pbiplint.config.json` under `sample/`.

- [ ] **Step 2: Run everything and commit**

Run: `npm run lint && npm run typecheck && npm test && npm run build && npm run check:pack && npm run test:bundle -w pbiplint && npm run test:e2e`
Expected: PASS.

```bash
git add tests/expectations/messy-sales.report.json packages scripts
git commit -m "test(sample): pin every planted violation and the new totals"
```

### Task 35: Verification and pull request 6

As Task 20 Steps 1 to 3, branch `v2-sample-report`, title "v2 sample: Messy Sales Demo becomes a PBIP with a report that plants every report rule", body:

```
Pull request 6 of 8 for the report layer, tracked in #9.

- `examples/messy-sales` is now a PBIP folder: the model moved (unchanged) into `Messy Sales Demo.SemanticModel`, a hand-authored `Messy Sales Demo.Report` beside it, a `.pbip`, and a `pbiplint.config.json` that sets the Filters pane policy so that rule can fire.
- The report plants one violation per report rule, all 25: the spec's list, the seven ported rules it left out (approved 2026-09-20, spec section 11 amended), and a hidden active page. Every other visual carries alt text and nothing else fires. Validated with `powerbi-report-author validate` after every page.
- `--sample`, the site bundle, and `check:pack` carry the whole project. `tests/expectations/messy-sales.report.json` pins every planted finding by id.
- Totals move from 161 findings in 11 files to <new totals>; every pin is updated.

Manual check for Michael: `npx pbiplint@<branch build> --sample` reads well top to bottom; optionally open the sample in Power BI Desktop, save, and hand the Desktop-written version back for a follow-up that refreshes the ids and expectations.

Follow-up outside this repository: the pbiplint/action workflows sparse-check-out `examples/messy-sales` at a pinned main commit; when the pin moves past this merge, the action lints the whole project and its fixture SARIF must be regenerated.

Next: pull request 7, the browser.
```

---

## Pull request 7: the browser (branch `v2-browser`)

```bash
cd ~/Projects/pbiplint && git switch main && git pull --ff-only && git switch -c v2-browser
```

Shared facts:

- The mockup (spec section 9, `2026-09-18-pbiplint-v2-mockups.html`, section 1) is the layout: heading with file counts naming present layers only; summary sentence; notices; "Report at a glance" as an always-open panel, rendered only when the report layer is present (`<section class="facts">` with `<h3>` and a `<dl>`, both left out when `result.facts` is empty, decision 14), a fact with a `ruleId` linking to `#rule-<slug>` when the run has that group (class `fact flag`) else to `/rules/<slug>/` (class `fact`), plain counts not linked; "Fix these first" with a layer tag per item; export bar; the Show filter with a Model / Report pair between severity and category; every group summary row carries `<span class="layer <layer>">`; groups carry `data-layer`.
- `wanted(path)` takes the drop-relative path: `.tmdl`, `pbiplint.config.json`, `definition.pbir`, `.platform`, `.pbip`, and `.json` whose path has a `.Report` segment followed later by a `definition` segment. `report.json` directly under a `.Report` folder and `model.bim` directly under a `.SemanticModel` folder are recorded as markers by name and never opened.
- `InputTree` becomes `{ entries, modelFolders, reportFolders, markers: { path: string; kind: "legacy-report" | "legacy-model" }[], diagnostics: Diagnostic[] }`; the three readers fill it; a read failure is an `unread-file` diagnostic; the cap is a `depth-cap` diagnostic naming the folder, on all three routes (decision 8).
- `selectProject(tree): SelectedProject { root, files, absent, config?, notes, read, diagnostics }` in `packages/web/src/input/project-files.ts` (the renamed `model-files.ts`), mirroring `resolveProject` on paths, including the two-reports refusal, the pairing through `definition.pbir` with `pairingDecision`, and the legacy markers as diagnostics.
- `main.ts` records `performance.now()` around `lint()` and writes the elapsed milliseconds to `results.dataset.lintMs`; the performance test reads it.

### Task 36: The walkers: what is wanted, markers, diagnostics on every route

**Files:**
- Modify: `packages/web/src/input/read-drop.ts`, `pick-folder.ts`, and the `InputTree` type (moved to `project-files.ts` in Task 37; in this task it stays in `model-files.ts` and gains the fields)
- Test: `packages/web/test/read-drop.test.ts`, `packages/web/test/pick-folder.test.ts`

- [ ] **Step 1: Write the failing tests**

In `read-drop.test.ts`, `describe("wanted")` becomes:

```ts
describe("wanted", () => {
  it("reads TMDL, the config, the project files, and report JSON under a .Report's definition, and nothing else", () => {
    for (const p of ["Sales.tmdl", "a/b/pbiplint.config.json", "X.Report/definition.pbir", "X.Report/.platform", "Demo.pbip", "X.Report/definition/report.json", "P/X.Report/definition/pages/p/visuals/v/visual.json", "X.Report/definition/pages/p/visuals/v/mobile.json"])
      expect(wanted(p), p).toBe(true);
    for (const p of ["X.Report/report.json", "X.Report/StaticResources/x.json", "X.SemanticModel/definition/x.json", "notes.json", "X.Report/definition/x.png", "cache.abf"])
      expect(wanted(p), p).toBe(false);
  });
});
```

Add to `describe("walkEntry")`:

```ts
  it("records a .Report folder, a legacy report.json and model.bim by name without opening them, and a depth-cap diagnostic", async () => {
    const tree: InputTree = { entries: [], modelFolders: [], reportFolders: [], markers: [], diagnostics: [] };
    await walkEntry(
      dir("Proj", "/Proj", [
        dir("Old.Report", "/Proj/Old.Report", [file("report.json", "/Proj/Old.Report/report.json", "{}")]),
        dir("Old.SemanticModel", "/Proj/Old.SemanticModel", [file("model.bim", "/Proj/Old.SemanticModel/model.bim", "{}")]),
        dir("New.Report", "/Proj/New.Report", [dir("definition", "/Proj/New.Report/definition", [file("report.json", "/Proj/New.Report/definition/report.json", "{}")])]),
      ]),
      tree,
    );
    expect(tree.reportFolders).toEqual(["Proj/Old.Report", "Proj/New.Report"]);
    expect(tree.markers).toEqual([
      { path: "Proj/Old.Report/report.json", kind: "legacy-report" },
      { path: "Proj/Old.SemanticModel/model.bim", kind: "legacy-model" },
    ]);
    expect(tree.entries.map((e) => e.path)).toEqual(["Proj/New.Report/definition/report.json"]);
    expect(tree.diagnostics).toEqual([]);
    // A chain deeper than the cap stops with a diagnostic naming the folder it stopped in.
    let deep = dir("bottom", "/bottom", [file("x.tmdl", "/bottom/x.tmdl", "table X\n")]);
    for (let i = MAX_DEPTH; i >= 0; i--) deep = dir(`d${i}`, `/d${i}`, [deep]);
    const capped: InputTree = { entries: [], modelFolders: [], reportFolders: [], markers: [], diagnostics: [] };
    await walkEntry(deep, capped);
    expect(capped.entries).toEqual([]);
    expect(capped.diagnostics).toEqual([{ kind: "depth-cap", path: `d${MAX_DEPTH}`, message: `the walk stopped ${MAX_DEPTH} folders deep at d${MAX_DEPTH}, so files below it were not read` }]);
  });
  it("records a file that could not be read as a diagnostic and goes on", async () => {
    const bad = { ...file("Sales.tmdl", "/M/Sales.tmdl", ""), file: (_ok: unknown, fail: (e: Error) => void) => fail(new Error("locked")) } as unknown as FileSystemFileEntry;
    const tree: InputTree = { entries: [], modelFolders: [], reportFolders: [], markers: [], diagnostics: [] };
    await walkEntry(dir("M", "/M", [bad, file("Date.tmdl", "/M/Date.tmdl", "table Date\n")]), tree);
    expect(tree.entries.map((e) => e.path)).toEqual(["M/Date.tmdl"]);
    expect(tree.diagnostics).toEqual([{ kind: "unread-file", path: "M/Sales.tmdl", message: "M/Sales.tmdl could not be read (locked), so it was not linted" }]);
  });
```

In `pick-folder.test.ts`, the same three cases for `readPickedDirectory` (a handle whose `getFile` rejects; a `.Report` folder with `report.json` at its root; a chain past the cap) and, for `readDirectoryInput`, a file whose reported path has more than `MAX_DEPTH` segments is skipped with a `depth-cap` diagnostic naming the segment at the cap, and paths with `.Report/definition/…json` are read. Adjust the existing `walkEntry` and picker tests that construct `InputTree` literals to the new shape (`reportFolders: [], markers: [], diagnostics: []`).

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run packages/web/test/read-drop.test.ts packages/web/test/pick-folder.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement**

In `model-files.ts` (renamed next task) extend the tree:

```ts
export interface InputMarker {
  path: string;
  kind: "legacy-report" | "legacy-model";
}
export interface InputTree {
  entries: InputEntry[];
  modelFolders: string[];
  /** Drop-relative paths of the .Report folders seen, read or not. */
  reportFolders: string[];
  /** A report.json directly under a .Report, or a model.bim directly under a .SemanticModel: seen by name, never opened. */
  markers: InputMarker[];
  /** What the walk could not do: a folder past the depth cap, a file that failed to read. */
  diagnostics: Diagnostic[];
}
export const isReportFolder = (name: string): boolean => name.endsWith(".Report");
export const emptyTree = (): InputTree => ({ entries: [], modelFolders: [], reportFolders: [], markers: [], diagnostics: [] });
```

In `read-drop.ts`:

```ts
const REPORT_JSON = /(^|\/)[^/]+\.Report\/(?:.*\/)?definition\/.*\.json$/;
/** Only these are ever read; everything else in a dropped folder stays unopened. */
export const wanted = (path: string): boolean => {
  const name = path.split("/").pop() ?? path;
  return (
    name.endsWith(".tmdl") ||
    name === CONFIG_FILE ||
    name === "definition.pbir" ||
    name === ".platform" ||
    name.endsWith(".pbip") ||
    (name.endsWith(".json") && REPORT_JSON.test(path))
  );
};

const depthCap = (folder: string): Diagnostic => ({
  kind: "depth-cap",
  path: folder,
  message: `the walk stopped ${MAX_DEPTH} folders deep at ${folder}, so files below it were not read`,
});
const unread = (path: string, e: unknown): Diagnostic => ({
  kind: "unread-file",
  path,
  message: `${path} could not be read (${e instanceof Error ? e.message : String(e)}), so it was not linted`,
});
/** A legacy part's marker file, matched by the folder it sits in. */
export const markerOf = (path: string): InputMarker | undefined => {
  const m = /(^|\/)([^/]+\.(Report|SemanticModel))\/(report\.json|model\.bim)$/.exec(path);
  if (!m) return undefined;
  if (m[3] === "Report" && m[4] === "report.json") return { path, kind: "legacy-report" };
  if (m[3] === "SemanticModel" && m[4] === "model.bim") return { path, kind: "legacy-model" };
  return undefined;
};
```

`walkEntry`: on a file, first `const marker = markerOf(path); if (marker) { tree.markers.push(marker); return; }`, then the `wanted(path)` test, and the read wrapped in try/catch pushing `unread(path, e)`. On a directory: `if (depth >= MAX_DEPTH) { tree.diagnostics.push(depthCap(path)); return; }` before the skip; `if (isReportFolder(entry.name)) tree.reportFolders.push(path);`. `readDataTransfer`'s flat-file branches use `wanted(file.name)` (a lone dropped file has no folder, so a report JSON cannot qualify, which is right: a lone `visual.json` is not a report). `pick-folder.ts` mirrors all of it in `walkHandle` (the cap diagnostic names `prefix`) and, in `readDirectoryInput`, `const segments = path.split("/"); if (segments.length - 1 > MAX_DEPTH) { if (!tree.diagnostics.some((d) => d.path === segments.slice(0, MAX_DEPTH + 1).join("/"))) tree.diagnostics.push(depthCap(segments.slice(0, MAX_DEPTH + 1).join("/"))); continue; }` plus markers and `reportFolders` from the segments as `modelFoldersIn` does.

- [ ] **Step 4: Run the tests and commit**

Run: `npx vitest run packages/web/test && npm run typecheck`
Expected: PASS.

```bash
git add packages/web
git commit -m "feat(web): the walkers read report files, record legacy markers, and report what they could not read"
```

---

### Task 37: `selectProject`

**Files:**
- Rename: `packages/web/src/input/model-files.ts` to `project-files.ts` (`git mv`); update every import
- Modify: `packages/web/src/main.ts` (`runEntries`)
- Delete: `packages/web/src/browser-rules.ts` and `packages/web/test/browser-rules.test.ts` (the browser lints every rule once it reads reports; decision 15)
- Test: `packages/web/test/model-files.test.ts` renamed to `project-files.test.ts`

**Interfaces:**

```ts
export interface SelectedProject {
  root: string;
  files: LintFile[];
  absent: Partial<Record<"model" | "report", string>>;
  config?: { path: string; text: string };
  notes: string[];
  read: string[];
  diagnostics: Diagnostic[];
}
export function selectProject(tree: InputTree): SelectedProject
```

Decisions, in order, on the tree of paths: the drop's base folder as today; the model as `selectModel` chose it (a `definition` with `.tmdl`, or exactly one `.SemanticModel`); the report the same way on `reportFolders` and entries under a `.Report`'s `definition` (exactly one, else `InputError` "contains 2 reports; drop one of them: A.Report, B.Report"); a lone `.Report` drop is the report itself; markers become `legacy-report-format` / `legacy-model-format` diagnostics with the layer absent and its reason, and a legacy model beside a lintable one stays a note as today; pairing through the report's `definition.pbir` entry and `pairingDecision(datasetReference(text), modelFolderName, reportFolderName)`; `files` carry part-relative paths (the model's from its root, the report's from its root, the `.pbip` by name); `read` lists every entry relative to the drop root with the labels used today plus `(report)`; `InputError` when neither part has anything to lint and no diagnostic explains why.

- [ ] **Step 1: Write the failing tests**

Rename the test file and keep every existing case, calling `selectProject({ ...emptyTree(), entries, modelFolders })` where it called `selectModel(entries, modelFolders)`. Add:

```ts
describe("selectProject", () => {
  const proj = [
    e("Proj/Demo.pbip"),
    e("Proj/Demo.SemanticModel/definition/model.tmdl"),
    e("Proj/Demo.SemanticModel/definition/tables/T.tmdl"),
    e("Proj/Demo.Report/definition.pbir", JSON.stringify({ datasetReference: { byPath: { path: "../Demo.SemanticModel" } } })),
    e("Proj/Demo.Report/.platform"),
    e("Proj/Demo.Report/definition/report.json"),
    e("Proj/Demo.Report/definition/pages/p/page.json"),
  ];
  const tree = (entries: InputEntry[], extra: Partial<InputTree> = {}): InputTree => ({ ...emptyTree(), entries, modelFolders: ["Proj/Demo.SemanticModel"], reportFolders: ["Proj/Demo.Report"], ...extra });
  it("reads a whole PBIP with part-relative paths and lists what it read", () => {
    const p = selectProject(tree(proj));
    expect(p.root).toBe("Proj");
    expect(p.files.map((f) => f.path).sort()).toEqual([".platform", "Demo.pbip", "definition.pbir", "definition/model.tmdl", "definition/pages/p/page.json", "definition/report.json", "definition/tables/T.tmdl"].sort());
    expect(p.absent).toEqual({});
    expect([...p.read].sort()).toEqual(["Demo.Report/.platform (report)", "Demo.Report/definition.pbir (report)", "Demo.Report/definition/pages/p/page.json (report)", "Demo.Report/definition/report.json (report)", "Demo.SemanticModel/definition/model.tmdl", "Demo.SemanticModel/definition/tables/T.tmdl", "Demo.pbip (report)"].sort());
  });
  it("reads a lone .Report, and a report whose model is published, with the model absent and why", () => {
    const lone = selectProject(tree(proj.filter((x) => x.path.includes(".Report")), { modelFolders: [] }));
    expect(lone.absent).toEqual({});
    expect(lone.files.every((f) => !f.path.endsWith(".tmdl"))).toBe(true);
    const published = selectProject(tree(proj.map((x) => (x.path.endsWith("definition.pbir") ? e(x.path, JSON.stringify({ datasetReference: { byConnection: {} } })) : x))));
    expect(published.files.some((f) => f.path.endsWith(".tmdl"))).toBe(false);
    expect(published.absent).toEqual({ model: "this report reads a published model" });
  });
  it("refuses two reports, and turns the legacy markers into diagnostics", () => {
    expect(() => selectProject(tree([...proj, e("Proj/Other.Report/definition/report.json")], { reportFolders: ["Proj/Demo.Report", "Proj/Other.Report"] }))).toThrow(/contains 2 reports; drop one of them: Demo\.Report, Other\.Report/);
    const legacy = selectProject(tree(proj.filter((x) => !x.path.includes(".Report")), { markers: [{ path: "Proj/Demo.Report/report.json", kind: "legacy-report" }] }));
    expect(legacy.absent).toEqual({ report: "the report is saved in the legacy report.json format" });
    expect(legacy.diagnostics.map((d) => d.kind)).toEqual(["legacy-report-format"]);
  });
  it("passes the walk's diagnostics through", () => {
    const p = selectProject(tree(proj, { diagnostics: [{ kind: "depth-cap", message: "stopped", path: "x" }] }));
    expect(p.diagnostics[0]).toEqual({ kind: "depth-cap", message: "stopped", path: "x" });
  });
});
```

- [ ] **Step 2: Run them to see them fail, then implement**

Implement `selectProject` in `project-files.ts` around the existing helpers (`resolveRoot`, `findConfig`, `relativeToRoot`, `listOf`, `within`, `relativeTo`, `join`), with `resolveReportRoot(entries, reportFolders, base)` as the twin of `resolveRoot` over `.Report` folders and entries under `<folder>/definition/`, then the pairing, then the file lists. Keep `selectModel` as a thin wrapper for one release only if any caller needs it; otherwise delete it and its export. In `main.ts`, `runEntries` calls `selectProject(tree)` and passes `absent`, `diagnostics`, `read`, and `notes` into `run`, and `run` passes `diagnostics` and `absent` to `lint`. Also in `main.ts`, time the lint:

```ts
    const started = performance.now();
    const result = lint(files, { config: resolveConfig(raw), diagnostics, absent });
    results.dataset.lintMs = String(Math.round(performance.now() - started));
```

- [ ] **Step 3: Run the tests and commit**

Run: `npx vitest run packages/web/test && npm run typecheck && npm run lint`
Expected: PASS.

```bash
git add -A packages/web
git commit -m "feat(web): selectProject mirrors the CLI on a tree of paths, with pairing and diagnostics"
```

---

### Task 38: The results page: heading, facts panel, layer tags, filters, notices; home and About copy

**Files:**
- Modify: `packages/web/src/results/render.ts`, `packages/web/src/main.ts`, `packages/web/src/styles.css`, `packages/web/index.html`, `packages/web/content/about.md`, `packages/web/src/build/pages.ts` (`SITE_LAYERS` gains `report`, and the layer column's condition turns true with it: until this flip the browser would link to report rule pages the site does not publish, and no static check catches a 404 behind a link built at runtime)
- Test: `packages/web/test/render.test.ts`, `packages/web/test/home.test.ts`, `packages/web/test/styles.test.ts`, `packages/web/test/generate.test.ts` (the pinned `SITE_LAYERS` value, the page count, the index sentence, and the sitemap all move to the full count here; its layer tests go red until they do, which is the forcing function in this direction)

**Interfaces:**
- `RenderOptions.source` becomes the project label without counts; `renderResults` builds the heading from `result.layers`: `Results for <source> (model, 11 files · report, 46 files)`, or `(report, 46 files)` / `(model, 11 files)` for one layer; `SAMPLE_NAME` stays "the sample project".
- New markup, from the mockup: `<section class="facts"><h3>Report at a glance</h3><dl>…</dl></section>` between the notices and "Fix these first"; each `<dd>` holds the value and, in a `<span class="detail">`, the detail; a fact with a `ruleId` wraps its value in `<a class="fact flag" href="#rule-<slug>">` when the run has that group, else `<a class="fact" href="/rules/<slug>/">`. Diagnostics render as `<p class="notice">` after the input notes. Fix-first items end with `<span class="layer <l>">`. `renderFilters` adds `box("layer", "model", "Model")` and `box("layer", "report", "Report")` when both layers have groups, between the severity boxes and the categories, with a `gap` span each side. Groups carry `data-layer` and a `<span class="layer <l>">` after the name; `applyFilters` reads `layer` too.

- [ ] **Step 1: Write the failing tests**

In `render.test.ts`, with a project result built from `SAMPLE_FILES` (which now holds the report) and `SAMPLE_CONFIG`:

```ts
  it("names both layers with their file counts in the heading", () => {
    renderResults(container, result, { source: "the sample project" });
    expect(container.querySelector("h2")!.textContent).toBe(`Results for the sample project (model, ${result.layers.model.present ? result.layers.model.files : 0} files · report, ${result.layers.report.present ? result.layers.report.files : 0} files)`);
    const modelOnly = lint(SAMPLE_FILES.filter((f) => f.path.endsWith(".tmdl")));
    renderResults(container, modelOnly, { source: "x" });
    expect(container.querySelector("h2")!.textContent).toBe("Results for x (model, 11 files)");
  });
  it("shows the facts panel under the summary with links to a group on the page or to the rule page", () => {
    renderResults(container, result, { source: "x" });
    const facts = container.querySelector("section.facts")!;
    expect(facts.previousElementSibling!.classList.contains("files")).toBe(true);
    expect(facts.querySelector("h3")!.textContent).toBe("Report at a glance");
    const rows = [...facts.querySelectorAll("dt")].map((dt) => dt.textContent);
    expect(rows).toEqual(["Opens on", "Filters pane", "Pages", "Visuals", "Report measures", "Slicers", "Mobile layouts", "Schema versions", "Model"]);
    const opens = facts.querySelector("dd a.fact.flag")!;
    expect(opens.getAttribute("href")).toBe("#rule-opening-page-invalid");
    const plain = [...facts.querySelectorAll("dd")].find((dd) => dd.textContent!.startsWith("none") || /^\d+ of \d+ pages$/.test(dd.textContent ?? ""))!;
    expect(plain.querySelector("a")).toBeNull();
    // A fact whose rule produced no finding this run links to the rule page.
    const quiet = lint(SAMPLE_FILES, { config: resolveConfig({ rules: { FILTERS_PANE_STATE: "off" } }) });
    renderResults(container, quiet, { source: "x" });
    expect(container.querySelector("section.facts dd a[href='/rules/filters-pane-state/']")).not.toBeNull();
  });
  it("tags fix-first items and groups with their layer, offers a layer filter, and hides a layer when unchecked", () => {
    renderResults(container, result, { source: "x" });
    expect(container.querySelector(".fix-first li .layer")).not.toBeNull();
    const tags = [...container.querySelectorAll(".group summary .layer")].map((t) => t.textContent);
    expect(tags).toContain("report");
    expect(tags).toContain("model");
    const boxes = [...container.querySelectorAll<HTMLInputElement>('input[data-filter="layer"]')];
    expect(boxes.map((b) => b.value)).toEqual(["model", "report"]);
    boxes[1]!.checked = false;
    applyFilters(container);
    for (const g of container.querySelectorAll<HTMLElement>(".group")) expect(g.hidden).toBe(g.dataset.layer === "report");
  });
  it("renders diagnostics as notices after the input notes", () => {
    const withNotice = lint(SAMPLE_FILES, { diagnostics: [{ kind: "depth-cap", message: "the walk stopped 64 folders deep at Deep, so files below it were not read", path: "Deep" }] });
    renderResults(container, withNotice, { source: "x", notes: ["Old.SemanticModel holds no .tmdl files."] });
    expect([...container.querySelectorAll(".notice")].map((n) => n.textContent)).toEqual([
      "Old.SemanticModel holds no .tmdl files.",
      "the walk stopped 64 folders deep at Deep, so files below it were not read",
    ]);
  });
```

Update the existing render, home, and export tests for the new heading (`Results for the sample project (model, 11 files · report, N files)`), the announcement (`Results for the sample project (model, 11 files · report, N files): <summary>.`), and the sample totals. `styles.test.ts` needs no change: it renders the sample, so `.facts`, `.fact`, `.flag`, `.detail`, and `.layer` are checked for CSS rules.

- [ ] **Step 2: Run them to see them fail, then implement**

In `render.ts`: `heading(result, source)`, `renderFacts(result)`, the layer boxes, tags, `data-layer`, and the diagnostics notices, following the mockup's structure; every href is built from pbiplint's own strings (`slug` from the finding's rule id via `result.groups` and `ruleUrl`/`pagePath`). In `styles.css`, after `.files`:

```css
/* Report at a glance: what the report will do, under the summary when the input has a report. */
.facts {
  border: 1px solid rgba(0, 169, 165, 0.35);
  background: rgba(0, 169, 165, 0.06);
  border-radius: var(--radius);
  padding: 12px 16px;
  margin: 16px 0 8px;
}
.facts h3 {
  margin: 0 0 8px;
  font-size: 12px;
  color: var(--brand-teal-soft);
  text-transform: uppercase;
  letter-spacing: 0.06em;
}
.facts dl {
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 4px 16px;
  margin: 0;
}
.facts dt {
  color: var(--fg-2);
}
.facts dd {
  margin: 0;
}
.facts .detail {
  color: var(--fg-2);
}
.facts a.fact {
  color: var(--fg-1);
  text-decoration: underline;
  text-decoration-color: var(--brand-teal);
  text-underline-offset: 3px;
}
.facts a.fact.flag {
  color: var(--warning);
  text-decoration-color: var(--warning);
}
@media (max-width: 600px) {
  .facts dl {
    grid-template-columns: 1fr;
    gap: 2px 0;
  }
  .facts dt {
    margin-top: 6px;
  }
}
```

Home page copy (`index.html`): the `<h1>` becomes "Lint your Power BI project in the browser"; the lede: "Paste TMDL, or drop a PBIP folder, a `.SemanticModel` folder, or a `.Report` folder. pbiplint checks the semantic model against the Microsoft best-practice rules and the report against PBI Inspector's rules and its own, ranks what it finds, and tells you how to fix each one. Nothing is uploaded: the analysis runs in this tab."; the drop zone text: "Drop a PBIP folder, a `.SemanticModel` or `.Report` folder, or a single `.tmdl` file here."; the hint: "Only .tmdl files, the report's JSON under its definition folder, .platform, definition.pbir, the .pbip file, and pbiplint.config.json are read. Nothing else in the folder is opened. …"; the sample hint: "A small sales project, model and report, with planted violations, the same one `npx pbiplint --sample` lints." The About page's "What it checks" says version 2 reads both parts, that a report alone is valid input, that with both the model is judged by what the report uses, and that the report rules are PBI Inspector's base rules ported plus pbiplint's own; its "Known limits" gains one line: one model and one report per run.

- [ ] **Step 3: Run the tests and commit**

Run: `npx vitest run packages/web/test && npm run typecheck && npm run lint && npm run build`
Expected: PASS; the site check passes (no inline styles, no new ids).

```bash
git add packages/web
git commit -m "feat(web): results for a whole project, the facts panel, layer tags and filter, notices, new copy"
```

---

### Task 39: Browser tests and the performance budget

**Files:**
- Create: `scripts/make-big-report.mjs`
- Modify: `packages/web/e2e/home.spec.ts`, `packages/web/e2e/site.spec.ts`, `.gitignore` (`tests/generated/`)

- [ ] **Step 1: The generator**

`scripts/make-big-report.mjs <out>`: copies `tests/fixtures/base-rules-fails` to `<out>` (a whole PBIP), then on the first page stamps card visuals from that page's first `visual.json` until the report holds 300 visuals, with fresh 20-hex ids, positions in a grid, and `tabOrder` in sequence; prints the count. Output goes to `tests/generated/big-report/`, which `.gitignore` lists. Unit test in `scripts/test/make-big-report.test.mjs`: the exported `stampVisuals(dir, total)` produces `total` visual folders with unique names.

- [ ] **Step 2: The browser tests**

In `home.spec.ts`, using the folder input (`#folder-input` with `setInputFiles` on a directory), which every engine supports:

```ts
const shelfmart = fileURLToPath(new URL("../../../tests/fixtures/shelfmart", import.meta.url));
const demo = fileURLToPath(new URL("../../../tests/fixtures/pbip-and-github-demo", import.meta.url));

test("lints a whole PBIP from the folder input: both layers, the facts panel, and the layer filter", async ({ page }) => {
  await page.locator("#folder-input").setInputFiles(shelfmart);
  const results = page.locator("#results");
  await expect(results.locator("h2")).toHaveText(/^Results for shelfmart \(model, \d+ files · report, \d+ files\)$/);
  await expect(results.locator("section.facts h3")).toHaveText("Report at a glance");
  await expect(results.locator("section.facts dt").first()).toHaveText("Opens on");
  await expect(results.locator('input[data-filter="layer"]')).toHaveCount(2);
  await results.locator('input[data-filter="layer"][value="model"]').uncheck();
  await expect(results.locator(".group:not([hidden]) summary .layer.report").first()).toBeVisible();
  await expect(results.locator('.group[data-layer="model"]:not([hidden])')).toHaveCount(0);
});

test("lints a report alone and says the model is absent", async ({ page }) => {
  await page.locator("#folder-input").setInputFiles(join(demo, "PBIP and GitHub Demo.Report"));
  await expect(page.locator("#results h2")).toHaveText(/^Results for PBIP and GitHub Demo\.Report \(report, \d+ files\)$/);
  await expect(page.locator("#results .summary")).toContainText("skipped (no model in the input)");
});

test("refuses a folder with two reports and names them", async ({ page }) => {
  const dir = mkdtempSync(join(tmpdir(), "two-reports-"));
  for (const name of ["A.Report", "B.Report"]) {
    mkdirSync(join(dir, name, "definition"), { recursive: true });
    writeFileSync(join(dir, name, "definition", "report.json"), "{}");
  }
  await page.locator("#folder-input").setInputFiles(dir);
  await expect(page.locator("#status")).toHaveText(/contains 2 reports; drop one of them: A\.Report, B\.Report/);
  await expect(page.locator("#results")).toBeHidden();
});

test("a folder deeper than the cap produces a notice, not silence", async ({ page }) => {
  const root = mkdtempSync(join(tmpdir(), "deep-"));
  let dir = join(root, "Demo.SemanticModel", "definition");
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "model.tmdl"), "model Model\n");
  for (let i = 0; i < 66; i++) dir = join(dir, `d${i}`);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "Deep.tmdl"), "table Deep\n");
  await page.locator("#folder-input").setInputFiles(root);
  await expect(page.locator("#results .notice")).toContainText(/the walk stopped 64 folders deep at .*, so files below it were not read/);
});

test("lints a 300-visual report in under two seconds", async ({ page }) => {
  const big = fileURLToPath(new URL("../../../tests/generated/big-report", import.meta.url));
  await page.locator("#folder-input").setInputFiles(big);
  await expect(page.locator("#results h2")).toHaveText(/report, \d+ files/);
  const ms = Number(await page.locator("#results").getAttribute("data-lint-ms"));
  expect(ms).toBeGreaterThan(0);
  expect(ms).toBeLessThan(2000);
});
```

The generated report must exist before the suite runs: `playwright.config.ts`'s `webServer.command` becomes `node scripts/make-big-report.mjs tests/generated/big-report && npm run build -w @pbiplint/web && npm run preview …`. In `site.spec.ts`, add `/rules/broken-field-reference/` to `PAGES` if Task 25 did not, and a test that the home page after a whole-PBIP run (the sample, which now has a report) has no accessibility violation with the facts panel present: extend the existing "after a run with a group open" test to also assert `section.facts` is visible.

- [ ] **Step 3: Run and commit**

Run: `npm run test:e2e`
Expected: PASS in all three engines. If WebKit's directory upload rejects the 66-deep folder, keep the test and mark it `test.skip(browserName === "webkit", "...")` with the reason observed, and say so in the pull request body.

```bash
git add scripts packages/web .gitignore
git commit -m "test(web): whole-PBIP and report-only drops, two reports, the depth cap, and the two-second budget in three browsers"
```

### Task 40: Home-guards and manual-check notes

Run `npx vitest run packages/web/test/home-guards.test.ts packages/web/test/home.test.ts`; if the guards test pins the drop-zone or hint text, update the pins to the new copy. Add to CONTRIBUTING's manual-check table a row: "The facts panel or the layer filter: drop the sample PBIP from Finder into Chrome and check the panel's links jump to the right group." Commit as `docs(web): manual check for the facts panel`.

### Task 41: Verification and pull request 7

As Task 20 Steps 1 to 3, branch `v2-browser`, title "v2 browser: drop a whole project, Report at a glance, layer tags, notices", body:

```
Pull request 7 of 8 for the report layer, tracked in #9.

- The walkers read report JSON under a .Report's definition folder, definition.pbir, .platform, and .pbip, record legacy report.json and model.bim by name without opening them, and report a depth cap or an unreadable file as a diagnostic on all three routes.
- `selectProject` mirrors the CLI's `resolveProject` on a tree of paths, including pairing through definition.pbir and the two-reports refusal.
- The results page follows the approved mockup: both layers in the heading, "Report at a glance" under the summary with facts linking to their group or rule page, layer tags on "Fix these first" and every group, a Model / Report filter, and diagnostics as notices.
- Home and About copy say a PBIP folder lints both parts and a report alone is valid input.
- Browser tests in Chromium, Firefox, and WebKit: a whole-PBIP drop, a report-only drop, two reports, the depth cap, and a 300-visual report linting in under two seconds (generated by scripts/make-big-report.mjs, not committed).

Manual checks for Michael (CONTRIBUTING's table): "Choose a folder" in Chrome on the sample PBIP; a real folder dragged from Finder; the facts panel's links; the page at phone width.

Next: pull request 8, docs and the 0.2.0 release.
```

---

## Pull request 8: docs and release (branch `v2-release`)

```bash
cd ~/Projects/pbiplint && git switch main && git pull --ff-only && git switch -c v2-release
```

### Task 42: README, CONTRIBUTING, core README

**Files:**
- Modify: `README.md`, `CONTRIBUTING.md`, `packages/core/README.md`
- Test: `packages/core/test/version.test.ts` (the Status line), `packages/cli/test/readme.test.ts` (unchanged, the CLI README was done in Task 10)

- [ ] **Step 1: README**

Replace the opening paragraph and Status section of `README.md`:

```markdown
Best-practice linter for Power BI projects. Browser and CLI. Nothing leaves your machine.

Paste TMDL, or drop a PBIP folder, a `.SemanticModel` folder, or a `.Report` folder, and get
ranked best-practice findings with guidance on how to fix each one, and, when the input has a
report, a "Report at a glance" block that says what the report will do when someone opens it. The
analysis runs entirely in your browser or on your own machine from the command line. Nothing is
uploaded, ever.

## Status

Version 0.2.0, released on <the release date, long form>. It covers the semantic model layer
(TMDL): every rule from the Microsoft best-practice ruleset, ported and verified against Tabular
Editor; and the report layer (PBIR): the 11 base rules of PBI Inspector, ported and verified
against it, plus pbiplint's own rules for what is broken, unfinished, or expensive in a report,
and for what the model holds that the report never reaches. Power Query rules follow.
```

In "Use it", the first command line becomes `npx pbiplint path/to/Project        # a PBIP folder, a .pbip file, a .SemanticModel or .Report folder, or one .tmdl file` and the browser sentence names the three folder kinds. In "Configure it", after the config example, add:

```markdown
A rule that takes options is set with an object. The thresholds of the ported report rules and
the two policy rules are examples; each rule's page lists its options:

```json
{
  "rules": {
    "REDUCE_VISUALS_ON_PAGE": { "severity": "error", "max": 15 },
    "FILTERS_PANE_STATE": { "expect": "closed" },
    "SLICER_SELECTION_SAVED": { "expect": "none" }
  }
}
```

To ignore a report rule on one page or visual, add an annotation to its JSON; Desktop keeps it:

```json
"annotations": [{ "name": "pbiplint.ignore", "value": "ENSURE_ALTTEXT" }]
```
```

In "What it checks", after the first paragraph:

```markdown
The report layer: the 11 base rules of [PBI Inspector](https://github.com/NatVanG/fab-inspector)
by Nat Van Gulck, ported so the results match its command line on the same report, with three
documented deviations where the source is noisier than it means to be; and pbiplint's own rules
for a report's correctness and readiness: fields the model does not have, model objects the report
never reaches, the opening page, the Filters pane, hidden visuals that still query, default page
names, empty visuals, visuals past the page edge, report-level measures, broken button and
bookmark targets, tab order against layout, and saved slicer selections. "Report at a glance"
states what the report will do whether or not anything fired.
```

- [ ] **Step 2: CONTRIBUTING**

In "Layout", the `packages/core` line becomes "parser (TMDL and PBIR), object models, indexes, rules, ranking, formatters" and the fixtures line names `tests/fixtures` (model fixtures and whole-PBIP project fixtures), `tests/expectations` (`<name>.json` from Tabular Editor, `<name>.report.json` from fab-inspector or by hand). After "Adding or changing a rule", add:

```markdown
## Adding a report rule

1. A port of a PBI Inspector base rule goes under `packages/core/src/rules/pbi-inspector/` with `inspectorRule(id, { category, scope, options }, check)`; its id, name, and description come from the vendored `inspector-rules.data.ts` (regenerate with `node scripts/vendor-inspector-rules.mjs <Base-rules.json> <commit>`). A rule of pbiplint's own goes under `packages/core/src/rules/pbiplint/` with `pbiplintRule({ ... })`. Both read the report object model (`packages/core/src/pbir/types.ts`) and the indexes; a rule that needs both layers declares `layer: "project"`.
2. Write a failing unit test on inline JSON with the helpers in `packages/core/test/report-helpers.ts`.
3. Pin it. A port must match the oracle on every fixture in `tests/expectations/*.report.json` (`npm test -- report-parity`); a native rule is listed by name in each fixture's `native` map and must fire on the sample (`tests/expectations/messy-sales.report.json`).
4. Scaffold the page with `node scripts/generate-rule-pages.mjs` and write it (see Rule pages). A report rule's example is two `pbir fires <file>` and `pbir fixed <file>` fences, each one JSON document for the file it names (`visual.json`, `page.json`, `report.json`, `pages.json`, a bookmark, `reportExtensions.json`, or `tree.json` mapping several paths to documents); an optional fence with the info string `json pbiplint.config.json` sets options for both runs. The rule-pages test lints them the way it lints TMDL examples.

## Deviating from a ported rule

A port matches its source unless the source is wrong in a way that would make pbiplint noisy on real reports. Adding a deviation needs three things that a test holds together: one sentence in the `deviations` map of an expectation file whose fixture shows the difference, pbiplint's own result for that rule under `ours` in the same file, and the same sentence under Quirks on the rule's page. A deviation that shows no difference on its fixture fails the test. Refreshing the oracle's results is in `docs/RELEASING.md`.
```

Under "Refreshing parity expectations", add one line: "The report rules are pinned to fab-inspector the same way; the steps are in docs/RELEASING.md under Report parity expectations."

- [ ] **Step 3: Core README**

In `packages/core/README.md`, after the first paragraph, add:

```markdown
`lint(files)` takes both parts of a Power BI project, `.tmdl` files for the model and the report's
JSON (paths relative to each part's root), and returns findings for both, `layers` saying which
part ran, `facts` for "Report at a glance", and `diagnostics` for anything the input reader could
not read. A report alone is valid input; with both parts, the model is judged by what the report
uses.
```

- [ ] **Step 4: Test and commit**

Run: `npx vitest run packages/core/test/version.test.ts packages/cli/test/readme.test.ts`
Expected: the version test FAILS on the Status line until Task 43 sets 0.2.0; run it again after Task 43. The README test passes.

```bash
git add README.md CONTRIBUTING.md packages/core/README.md
git commit -m "docs: the report layer in the README, CONTRIBUTING, and the core README"
```

### Task 43: Version 0.2.0 and pull request 8

- [ ] **Step 1: Bump, following docs/RELEASING.md step 1**

```bash
npm version 0.2.0 -w @pbiplint/core -w pbiplint --no-git-tag-version
npm install
npm run version:sync
```

Set the Status line in `README.md` to `Version 0.2.0, released on <today, long form>.` Then:

```bash
npm run lint && npm run typecheck && npm test && npm run check:browser && npm run build && npm run check:pack && npm run test:bundle -w pbiplint && npm run test:e2e
```

Expected: all green.

- [ ] **Step 2: Commit, check the branch, review, push, pull request**

```bash
git add -A
git commit -m "chore: release v0.2.0"
git log --format=%B main..HEAD | grep -inE '\b(close[sd]?|fix(e[sd])?|resolve[sd]?)\b[[:space:]]*#[0-9]+' ; git diff main..HEAD | grep -c $'\u2014'
```

Dispatch the Fable whole-branch review (docs only; it reads for accuracy against the code on main). Then:

```bash
git push -u origin v2-release
gh auth switch --user TheDataPractitioner
gh pr create --repo pbiplint/pbiplint --base main --head v2-release --title "v2 release: docs and version 0.2.0" --body-file - <<'EOF'
Pull request 8 of 8 for the report layer, tracked in #9.

- README, CONTRIBUTING (adding a report rule; deviating from a ported rule), and the core README describe the report layer, the config options, and the JSON ignore annotation.
- Version 0.2.0 in both packages, the README status line, and the lockfile.

After the merge, Michael tags per docs/RELEASING.md step 3 (`git fetch origin main && git tag v0.2.0 origin/main && git push origin v0.2.0`); the Release workflow publishes both packages through trusted publishing (this is the first real exercise of that path since v0.1.2). Then step 6: bump the pbiplint-version default in pbiplint/action and release it, and move the action's sample checkout pin past the sample pull request so its fixture SARIF is regenerated against the whole project.

Once the site is live with the new pages, the index column, and the attribution, issue #9's checklist can be ticked by hand and the issue closed.

🤖 Generated with [Claude Code](https://claude.com/claude-code)

https://claude.ai/code/session_01NkR2xcGDMmG1T73cTgjBH3
EOF
gh auth switch --user michaelmckinleyconsulting
```

Report the URL and stop. Michael merges, tags, watches the release, and does the action bump.

---

## Definition of done (spec section 16), mapped to tasks

| Done when | Where it is done | Where it is checked |
|---|---|---|
| Every rule in section 8 exists with a page, a fixture that fires it, and, for the ported set, parity with the oracle or a documented deviation | Tasks 15 to 19 (ported), 21 to 31 (native), 33 to 34 (the sample fires them) | `report-parity.test.ts` (parity, deviations, coverage, native), `rule-pages.test.ts` (every rule has a page whose example fires), `pack.test.ts` (97) |
| `base-rules-passes` and ShelfMart are quiet under the native rules except as listed by name | Tasks 23, 26, 29 (the `native` maps) | `report-parity.test.ts`, "native rules on $name" |
| A whole-PBIP drop, a report-only drop, and a model-only drop render correctly in three browsers; the CLI accepts every input shape in section 4 | Tasks 36 to 39 (browser), Task 10 (CLI) | `home.spec.ts` (the three drops plus the existing model-only tests), `walk.test.ts` |
| The depth cap and both legacy formats surface as diagnostics | Tasks 8, 10, 36, 37 | `route.test.ts`, `walk.test.ts`, `cli.test.ts`, `read-drop.test.ts`, `pick-folder.test.ts`, `project-files.test.ts`, `home.spec.ts` |
| The sample fires every native rule and every planted ported rule (every report rule, after the amendment to section 11) | Tasks 33, 34 | `report-parity.test.ts` on `messy-sales.report.json` |
| The browser purity check and the performance budget pass | Task 11 (200 KB), Task 39 (two seconds) | `npm run check:browser`, `home.spec.ts` |
| 0.2.0 is on npm and the site is live with the new pages, index column, and attribution | Task 43 and Michael's tag | The Release workflow; the deploy verify job; a look at pbiplint.com/rules/ |

Spec sections and the tasks that carry them: 4 (Tasks 8, 10, 36, 37), 5 (Tasks 3, 4, 5), 6 (Tasks 6, 7), 7 (Tasks 1, 2, 18), 8.1 (Tasks 12 to 17), 8.2 (Tasks 21 to 23), 8.3 (Task 26), 8.4 (Task 29), 8.5 (Task 12's `inspectorRule` arguments), 9 (Tasks 9, 18, 38), 10 (Tasks 13 to 15, 23, 34, 39), 11 (Tasks 32 to 34), 12 (Tasks 36 to 38), 13 (Task 10), 14 (the eight pull requests; Task 43), 16 (this table).

## Execution notes

- Execution is subagent-driven (`superpowers:subagent-driven-development`), one pull request at a time: implementers and task reviewers on Opus 5, the whole-branch review on Fable 5.1. The ledger lives at `.superpowers/sdd/2026-09-20-pbiplint-v2-report-layer/progress.md` (git-ignored) in the shape of `.superpowers/sdd/2026-09-19-rule-pages-template/`: a pre-flight scan of produces-versus-consumes across the pull request's tasks, one line per task event, and rulings written as "Ruling: what. Why: why. Cost if wrong: cost." Each pull request's tasks are one execution unit; the session stops after opening the pull request and resumes from the ledger when Michael says merge.
- A task's implementer sees only its own task text plus the Global Constraints, the Decisions, the shared facts of its pull request, and the Interfaces blocks of the tasks it consumes; the ledger records what each brief contained.
- The escalation rule for parity (pull request 2's shared facts) and the manual checks named in each pull request body are the only places the session stops for Michael inside a pull request.
- Where a task says "counts to N", the numbers are 72 (today), 77 and 80 (inside pull request 2), 83 (after it), 85 and 88 (inside pull request 3), 89, 93, 97; `pack.test.ts` and `generate.test.ts` pin them and the index sentence.
- The site's pins move on a different clock: `generate.test.ts` holds the page count, the rules index sentence, and the sitemap at 72 through pull requests 2 to 6, apart from Task 24, where the two `project` pages publish and take it to 74, while `pack.test.ts` moves as the line above says, because `SITE_LAYERS` publishes the model layer only until pull request 7 (decision 15).
- Nothing in this plan runs Tabular Editor or fab-inspector in CI; the oracle runs once, by hand, in Task 14, and again only when `docs/RELEASING.md` says to.
