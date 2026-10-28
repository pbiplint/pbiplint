# Lint every project in a folder in one run: implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** a folder holding several projects is linted whole in one run, by the CLI, the MCP server, and the site, with one exit code; every input that lints today prints exactly what it prints today.

**Architecture:** the CLI's walk gains a several-project route that resolves each project as the one-project route resolves the project below a folder. Core gains one step that lists a shared model's findings once and decides `NOT_REACHED_FROM_REPORT` across its reports, plus a combined summary. The several-project text, quiet, Markdown, JSON, and SARIF wrappers live in the CLI and call core's one-project formatters; the site renders one section per project.

**Tech Stack:** TypeScript, Node 20.19+, vitest, Playwright, esbuild.

**Spec:** `docs/superpowers/specs/2026-10-28-multi-project-design.md` (section numbers below are the spec's). Builds on #238's merge into `release/0.3.0`; rebase onto it before Task 1.

## Global constraints

- Branch `v3/multi-project`, PR into `release/0.3.0`. No releases, tags, or publishing.
- A one-project run's output, every format, stdout and stderr, stays byte for byte what `release/0.3.0` prints (spec 2). The several-project route starts only where today's run exits 2 with "contains N projects", "N semantic models", "N reports", or "N .pbip files".
- Cap: `MAX_PROJECTS = 200` (spec 3.4). JSON `version: 2` only for a several-project run (6.5). SARIF stays one run (6.6).
- Core stays browser-pure; `npm run check:browser` passes. Raise `OWN_LIMIT_KB` in `packages/core/scripts/check-browser-bundle.mjs` only to 245, with the measured size in its comment (spec 9).
- House style in code comments, docs, and messages: no em dashes, long-form dates, every quote linked.
- Commands: scratch only in `$CLAUDE_JOB_DIR/tmp`, `mktemp -d` per experiment, no `rm -rf` with a glob or variable path, no sudo, `git clean`, or `reset --hard`, nothing that prompts; never wait on a prompt. Copy these into every subagent dispatch. Every subagent on Opus 5.5.
- Tests build monorepos from copies of `examples/messy-sales` in `tempDir(...)` (`tests/support/temp-dir.ts`), as #174's tests do. `examples/` does not change.

## Review focus

1. **A one-project folder in every format:** byte-identical to `release/0.3.0`. Owned by Task 3 (a golden test over text, quiet, json, markdown, sarif, `--output`, `--rule`).
2. **The monorepo of #236's known limit** (`reports/Sales/Sales.pbip`, `reports/Finance/Finance.pbip`, both reading `models/Shared.SemanticModel` by path): the model is linted, its findings appear once, and a measure only Finance uses is not reported by `NOT_REACHED_FROM_REPORT`. Owned by Tasks 1 and 3.
3. **Desktop's side-by-side layout** (`Sales.pbip`, `Sales.Report`, `Sales.SemanticModel`, `Finance.*` in one folder): two projects, each with its report and model. Owned by Task 2.
4. **A path with a space or a control character** in a project's name: quoted in commands, shown with `showControls` in every line it reaches (headers, `project ` lines, stderr prefixes). Owned by Tasks 2 and 3.
5. **The same project reached twice** (a `.pbip` and its folder both listed, or a symlink to a project): `projectsBelow` already lists each once; the model cache keys by real path, so a linked model is read once and named by the path that reached it first. Owned by Task 2.

---

### Task 0: Record the one-project goldens

Before any code changes, on the branch rebased onto #238's merge: build (`npm run build`), then write `packages/cli/test/fixtures/one-project/<case>.{out,err,code}` for each case Task 3's contract test lists (`examples/messy-sales` and a temp folder holding one copy of it below, in each format and option), with temp paths replaced by a placeholder the test fills in. Commit: `test(cli): one-project goldens before #237`.

### Task 1: Core: the shared-model step and the combined summary

**Files:**
- Create: `packages/core/src/engine/projects.ts`
- Modify: `packages/core/src/index.ts` (exports), `packages/core/src/project/types.ts` (`DiagnosticKind` gains `"shared-model"`), `packages/core/src/format/markdown.ts` and `packages/core/src/format/text.ts` (`FormatOptions.headingLevel`), `packages/core/src/format/index.ts`
- Test: `packages/core/test/projects.test.ts`, `packages/core/test/format.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export interface ProjectRun {
    /** The project's path relative to the folder named, forward slashes, as projectsBelow gives it. */
    path: string;
    result: LintResult;
    config: ResolvedConfig;
    /** Identifies the model the run read (the CLI: its real path; the site: its path in the drop). */
    modelKey?: string;
    /** The config file the run used, as the caller names it, for the shared-model notice. */
    configPath?: string;
  }
  export function shareModels(runs: ProjectRun[]): ProjectRun[];
  export interface RunSummary extends ShownCounts { projects: number; files: number; ignored: number; ruleErrors: number; shown?: ShownSummary }
  export function runSummary(runs: ProjectRun[]): RunSummary;
  export function runSummaryLine(summary: RunSummary): string;
  export function escapeJsonControls(text: string): string; // re-exported from format/controls.ts
  // FormatOptions gains: headingLevel?: number (Markdown only; default 1)
  ```
  (`ShownCounts` here means the `findings`, `errors`, `warnings`, `infos` fields `LintSummary` has; reuse the existing types rather than a new one if they fit.)

- [ ] **Step 1: Write the failing tests** in `projects.test.ts`, building `LintResult`s with `lint()` from small TMDL and PBIR fixtures (the helpers in `test/helpers.ts` and `test/report-helpers.ts`):
  - `shareModels leaves runs that share no model unchanged`: `expect(shareModels(runs)).toEqual(runs)` for two runs with different `modelKey`s and for runs without one.
  - `lists a shared model's findings once, under the first run`: two runs, `modelKey: "m"`, paths `reports/Finance/Finance.pbip` and `reports/Sales/Sales.pbip`; the second run's findings with `layer === "model"` are gone, its report findings stay, its `summary.findings`/`errors`/`warnings`/`infos`, `groups`, and `failed` are recounted (as `showOnly` recounts), and each run's diagnostics end with a `shared-model` notice: first `the model is shared with reports/Sales/Sales.pbip; NOT_REACHED_FROM_REPORT counts a field as reached when any of these reports reaches it`, second `the model is shared with reports/Finance/Finance.pbip; its findings are listed there`.
  - `keeps NOT_REACHED_FROM_REPORT only where no sharing report reaches the field`: measure `A` used by report 1 only, `B` by neither; the first run keeps the finding on `B` only.
  - `says which config a shared model's findings follow when the configs differ`: `configPath` `a/pbiplint.config.json` and `b/pbiplint.config.json`; the first run's notice ends `; its findings follow a/pbiplint.config.json`.
  - `runSummary adds up the runs and counts a shared model's files once`: two runs sharing a model of 10 files with reports of 5 and 7 files gives `files: 22`, `projects: 2`.
  - `runSummaryLine`: `3 projects, 41 findings (3 errors, 30 warnings, 8 info) in 212 files`; with rule errors, the same suffix `summaryLine` gives after #238 (copy its wording, summed); with `shown`, `5 of 41 findings shown, ...` in `summaryLine`'s shape with `N projects, ` in front.
  - In `format.test.ts`: `formatMarkdown with headingLevel 2 moves every heading down one level` (`# pbiplint report` becomes `## pbiplint report`, `## Fix these first` becomes `### Fix these first`), and the default output is unchanged.

- [ ] **Step 2: Run them and see them fail.** `npx vitest run packages/core/test/projects.test.ts packages/core/test/format.test.ts`. Expected: FAIL, `shareModels` is not exported.

- [ ] **Step 3: Implement `projects.ts`.** Findings are matched for the intersection by `[objectType, objectName, location?.file, location?.line]`; the kept detail is the first run's. Recount with the same code `showOnly` uses (pull a shared `recount(result, groups, config)` out of `show-only.ts` rather than copying it). Notices name projects by `path` through `showControls` only where the formats already do; build messages as plain strings. `headingLevel` prefixes `"#".repeat(level - 1)` onto each heading `formatMarkdown` writes.

- [ ] **Step 4: Run the tests and the core suite.** `npx vitest run packages/core` passes; `npm run build -w @pbiplint/core && npm run check:browser` prints core's own size. Record it in the commit message.

- [ ] **Step 5: Commit.** `git commit -m "feat(core): list a shared model's findings once (#237)"`

### Task 2: The CLI walk: resolve several projects

**Files:**
- Modify: `packages/cli/src/walk.ts`
- Test: `packages/cli/test/walk.test.ts`

**Interfaces:**
- Consumes: `projectsBelow`, `foundBelow`, `resolveAt` (existing).
- Produces:
  ```ts
  export const MAX_PROJECTS = 200;
  export interface NamedProject { path: string; project: ResolvedProject; modelKey?: string }
  export type ResolvedInput = { kind: "one"; project: ResolvedProject } | { kind: "several"; projects: NamedProject[] };
  export function resolveInput(input: string): ResolvedInput;
  // resolveProject(input) stays, and returns the project when resolveInput gives one, else throws the old "contains N projects" UsageError (kept for callers and tests that want one project).
  ```

- [ ] **Step 1: Write the failing tests** in `walk.test.ts` (rewrite the three tests that expect "contains 2 projects", at lines 581, 1117, and 1563 today, to expect `kind: "several"`):
  - `two projects below a folder resolve as several, in name order`: `a/messy-sales`, `b/messy-sales` gives paths `["a/messy-sales", "b/messy-sales"]`, each `project` deep-equal to `resolveProject(join(root, path))` except that its diagnostics do not start with the `project-below-input` notice.
  - `Desktop's side-by-side layout resolves as several`: `Sales.pbip`, `Sales.Report`, `Sales.SemanticModel`, `Finance.*` in one folder gives `["Finance.pbip", "Sales.pbip"]`, each with a model and a report.
  - `a model two .pbip files reach by path is read once`: the #236 monorepo; both projects' `model` are the same object (`toBe`), and both `modelKey`s are its real path.
  - `the folder named is the boundary for every project`: the same monorepo has no `outside` notice; a model outside the folder named still gets #236's notice.
  - `one project below a folder is still one`: `kind: "one"`, byte-equal to today's `resolveProject` (the `project-below-input` notice first).
  - `a folder that is itself a project stays one, whatever lies deeper`.
  - `more than 200 projects is refused`: 201 empty-ish model folders (`m000.SemanticModel/definition/model.tmdl` holding `model Model`) under `x/` and `y/`; `UsageError` message `${root} contains 201 projects, more than the 200 one run lints; point at a folder that holds fewer:` with lines `  x: 101 projects: pbiplint ${root}/x` and `  y: 100 projects: pbiplint ${root}/y`.
  - `a project that cannot be read refuses the whole run`: one project's model folder holds no `.tmdl` files; `UsageError` message `${root}/b/messy-sales could not be linted: <that project's own refusal>`, lines listing each other project's command as #174's list does (`  a/messy-sales: pbiplint ${root}/a/messy-sales`). (Spec 3.3 as written. Task 2a replaces this test if Michael picks the alternative pb-coord recommends.)
  - `the outside-reference hint points at the folder that holds both`: naming `reports/Sales/Sales.pbip` of the monorepo gives the hint `lint the folder that holds both (../.. from the project folder) to include it`; the `SHARED` constant and its tests go.
  - A project path with a space and one with `\n` in it: the refusal's command lines quote and show them as #174's do.

- [ ] **Step 2: Run them and see them fail.** `npx vitest run packages/cli/test/walk.test.ts`.

- [ ] **Step 3: Implement.** In `readFolder`, where the folder is not a part and not `definition`, compute `projectsBelow(foundBelow(w, path))` before the side-by-side refusals (`models.length > 1`, `reports.length > 1`, `pbipIn`'s `found.length > 1`) and in the plain-folder branch; two or more, at the top-level walk only, raise an internal `SeveralProjects` (paths) that `resolveInput` catches. One or none falls through to today's code unchanged. `resolveInput` resolves each path with `resolveAt(join(input, path), named)`, where `named` is the folder named, and a `Walk` field `models: Map<string, ResolvedPart>` (shared by every project's walk, keyed by `realpathSync.native` of the model folder) that `modelPart` consults first. Count before resolving: over `MAX_PROJECTS`, refuse, grouping paths by first segment. Delete `oneProjectAt` and the shared-model hint branch.

- [ ] **Step 4: Run the walk tests and the CLI suite.** `npx vitest run packages/cli` passes, except main's tests for "contains 2 projects", fixed in Task 3.

- [ ] **Step 5: Commit.** `git commit -m "feat(cli): find and read every project in a folder (#237)"`

### Task 2a (option, pending Michael on item 5): an unreadable project is a `PARSE_ISSUE`, not a refusal

pb-coord recommends this to Michael: in the corpus, refusing the whole run would refuse 10 of 148 multi-project repositories (6.8%) and leave 22 readable projects unlinted, every cause a legacy `model.bim`. Build this task only if Michael picks it; otherwise Task 2's refusal stands.

**Why `PARSE_ISSUE` and no new rule:** it is already the built-in, error-severity finding for a file pbiplint could not read, a config can lower it, and it already has a page, an `explain` entry, and SARIF help. A new rule would add a page, a summary in core's bundle, help text, and a parity entry. One caveat: its name is "File could not be fully parsed", and a `model.bim` is not parsed at all; the detail says why, and the page gains a section, so the name can stay. A `lint()` cannot produce this finding itself, since the walk reads nothing from such a project, so core gains a small constructor.

**Files:** `packages/core/src/engine/projects.ts`, `packages/cli/src/walk.ts`, `packages/web/src/input/project-files.ts`, the `PARSE_ISSUE` page `rules/parse-issue.md`, and its `rule-help` and `rule-guidance` data, regenerated with `scripts/generate-rule-pages.mjs`. Tests: `packages/core/test/projects.test.ts`, `packages/cli/test/walk.test.ts`, `packages/cli/test/several.test.ts`, `packages/web/test/project-files.test.ts`.

**Interfaces:**

- Produces:
  ```ts
  // core, projects.ts
  export interface Unreadable { message: string; layer: LayerName; root?: string; file?: string }
  export function unreadProject(unreadable: Unreadable, config: ResolvedConfig): LintResult;
  // walk.ts: NamedProject gains `unreadable?: Unreadable` in place of `project` for a project whose own resolution threw a UsageError.
  ```

- [ ] **Step 1: Write the failing tests.**
  - core: `unreadProject` on `{ message: "Sales.SemanticModel is stored as model.bim, which pbiplint cannot read; save it in the TMDL format from Power BI Desktop", layer: "model", file: "model.bim" }` gives one `PARSE_ISSUE` group with one finding (`objectType: "File"`, `objectName: "model.bim"`, `layer: "model"`, `location: { file: "model.bim", line: 1 }`, `detail` the message), both layers `present: false` with the model's reason `LEGACY_MODEL_REASON`, `summary.files` 0, and `failed: true` under the default config; with `resolveConfig({ rules: { PARSE_ISSUE: "warning" } })` it is a warning and `failed` is false.
  - walk: the two-project folder with one project's model replaced by a `model.bim` gives `kind: "several"`, the readable project resolved, and the other `unreadable` with the legacy message, `layer: "model"`, `root` its model folder, `file: "model.bim"`; a `report.json` report likewise with `LEGACY_REPORT_REASON` and `file: "report.json"`; a project refused for another reason (a model folder with no `.tmdl` files) carries the refusal message and no `file`.
  - CLI: that folder exits `1`, lints the readable project in full, and shows the unreadable one as its own project with the one `PARSE_ISSUE` finding; the SARIF result for it points at `<prefix>/model.bim`, line 1; with `--fail-on none` it exits `0`. A folder where every project is unreadable is still refused (exit 2), as #175 asks for a run that reads nothing.
  - site: the same layouts give the same projects and findings.
- [ ] **Step 2: Run them and see them fail.**
- [ ] **Step 3: Implement.** `resolveInput` catches `UsageError` per project and records the refusal; the legacy cases are recognized where `legacyPart` records them (`w.legacy`), which already has the layer and the folder. `unreadProject` builds the finding and passes it through `rank` with the config, so severity overrides and `failed` work as for any finding. The page's new section, "A project pbiplint cannot read", says what the finding means and how to save the project in TMDL and PBIR from Power BI Desktop, in the words the legacy notices already use.
- [ ] **Step 4: Run the core, CLI, and web suites, and measure core.** Expected growth about 0.4 KB.
- [ ] **Step 5: Commit.** `feat: an unreadable project in a several-project run is a PARSE_ISSUE (#237)`

### Task 3: The CLI run and its outputs

**Files:**
- Create: `packages/cli/src/several.ts`
- Modify: `packages/cli/src/main.ts`
- Test: `packages/cli/test/several.test.ts`, `packages/cli/test/cli.test.ts`, `packages/cli/test/contract.test.ts`

**Interfaces:**
- Consumes: `resolveInput` (Task 2); `shareModels`, `runSummary`, `runSummaryLine`, `escapeJsonControls`, `headingLevel` (Task 1).
- Produces (in `several.ts`):
  ```ts
  export interface SeveralRun { runs: ProjectRun[]; prefixes: { model?: string; report?: string }[] }
  export function severalText(run: SeveralRun): string;
  export function severalQuiet(run: SeveralRun): string;
  export function severalMarkdown(run: SeveralRun): string;
  export function severalJson(run: SeveralRun, toolVersion: string): string;
  export function severalSarif(run: SeveralRun, options: { toolVersion: string; help: Readonly<Record<string, RuleHelp>> }): string;
  ```

- [ ] **Step 1: Write the failing tests.**
  - `several.test.ts`, on the #236 monorepo plus one model of its own (`models/Standalone.SemanticModel` alone in its folder, so `projectsBelow` lists it), through `main`:
    - text: first line `pbiplint: 3 projects, ...`; one line per project, two spaces in, path padded to the longest, then `summaryLine`'s counts; a blank line; each project as `Project 2 of 3: reports/Finance/Finance.pbip` followed by exactly what `formatText` gives for that run (compare with core's output for the same `ProjectRun`); `EXPLAIN_HINT` once, last.
    - quiet: first line combined; each project opens with `project <path>: <summaryLine>`, then `quietText`'s lines for that run minus its first line and its `Next:` line; `QUIET_NEXT` once, last.
    - markdown: `# pbiplint report`, the combined line and a period, the table `| Project | Findings | Errors | Warnings | Info |`, then each project as `## Project N of M: <path>` and its `formatMarkdown(result, { headingLevel: 2 })` without the first heading line.
    - json: `version: 2`; `summary` equals `runSummary`; `projects[i]` equals today's document for that run without `version` and `tool`, plus `path` first.
    - sarif: one run; `rules` the union by id, first seen; each result's `ruleIndex` points at its rule in the union; URIs carry each project's prefixes; the shared model's results appear once; `invocations` merges every project's notifications, and `executionSuccessful` is false when any project's is.
    - stderr: each notice and rule-failure line names its project, `pbiplint: notice: reports/Sales/Sales.pbip: ...`; `--output` prints the combined line, `pbiplint: 3 projects, ..., wrote out.md`; an unknown rule id in one config file is named once.
    - exit code: `1` when only the second project has an error; `0` with `--fail-on none`; `--rule BROKEN_FIELD_REFERENCE` gives each project's `shown` and the combined `N of M findings shown`.
    - config: a `pbiplint.config.json` in `reports/Sales/` that turns a rule off applies to Sales only; `--config x.json` applies to all.
  - `cli.test.ts`: rewrite the "exits 2 on a folder with two projects" test to expect a several-project run (exit 1, both projects linted); keep its control-character case on the text header.
  - `contract.test.ts`: the byte-identity golden: for `examples/messy-sales` and for a folder with one project below it, each of text, `--quiet`, json, markdown, sarif, `--output`, and `--rule DUPLICATE_MEASURE_DEFINITIONS` (or any id the sample fires), stdout, stderr, and the exit code equal the goldens Task 0 recorded.

- [ ] **Step 2: Run the tests and see them fail.** `npx vitest run packages/cli`.

- [ ] **Step 3: Implement.** `main` calls `resolveInput`; `kind: "one"` runs today's code untouched. `kind: "several"` builds a `ProjectRun` per project with today's per-project steps (config, `lint`, `showOnly`), applies `shareModels`, formats with `several.ts`, writes stdout or `--output` as today, then stderr lines, and returns `1` when any run's `failed`. Keep shared steps in one function both branches call, so the one-project branch's statements stay as they are. `severalJson` parses each project's `formatJson`, drops `version` and `tool`, and stringifies with `escapeJsonControls`; `severalSarif` merges each project's `formatSarif` the same way.

- [ ] **Step 4: Run the CLI suite and the e2e-free checks.** `npx vitest run packages/cli && npm run typecheck && npm run lint`.

- [ ] **Step 5: Commit.** `git commit -m "feat(cli): lint every project in a folder in one run (#237)"`

### Task 4: The site

**Files:**
- Modify: `packages/web/src/input/project-files.ts`, `packages/web/src/main.ts`, `packages/web/src/results/render.ts`
- Test: `packages/web/test/project-files.test.ts`, `packages/web/test/projects-below.test.ts`, `packages/web/test/render.test.ts`, `packages/web/e2e/` (one new spec)

**Interfaces:**
- Consumes: `shareModels`, `runSummary`, `runSummaryLine` (Task 1).
- Produces:
  ```ts
  export type Selected = { kind: "one"; project: SelectedProject } | { kind: "several"; projects: (SelectedProject & { path: string; modelKey?: string })[] };
  export function selectProjects(tree: InputTree): Selected; // selectProject stays, for one
  export function renderSeveral(container: HTMLElement, runs: ProjectRun[], sources: { files: string[]; notes: string[] }[]): void;
  ```

- [ ] **Step 1: Write the failing tests.**
  - `project-files.test.ts`: the CLI's three layouts from Task 2 (two below, side by side, the monorepo) give `kind: "several"` with the same paths; the refusal "contains N projects; drop one of them" is gone; over 200 is refused as `${base} contains 201 projects, more than the 200 one run lints; drop a folder that holds fewer`.
  - `projects-below.test.ts`: the test that holds the CLI and the site to the same answer covers the several case (same paths).
  - The monorepo on the site lints as the CLI lints it: each report with the shared model (Task 4a's route), the model's findings once, and `projects-below.test.ts` holds the two to the same project list and, for this layout, the same finding counts per project.
  - `render.test.ts`: `renderSeveral` writes the combined summary line, a list of links to `#project-1` ... `#project-N`, then a `<section id="project-N">` per project with an `h2` `Project N of M: <path>` and that project's results as `renderResults` renders them, export bar included; the announcer reads `<N> projects: <runSummaryLine>.`
  - e2e: dropping the monorepo shows three sections; "Copy for an AI assistant" in the second copies that project's Markdown.

- [ ] **Step 2: Run them and see them fail.** `npx vitest run packages/web`.

- [ ] **Step 3: Implement.** `selectProjects` reuses `selectProject` on each path (each as a sub-drop rooted at that path, the way the one project below is read today). A `.pbip` path goes through Task 4a's route. `runEntries` lints each project in turn, with the same frame wait before the first, then `shareModels` and `renderSeveral`.

- [ ] **Step 4: Run the web suite and e2e.** `npx vitest run packages/web && npm run test:e2e`.

- [ ] **Step 5: Commit.** `git commit -m "feat(web): lint every project in a dropped folder (#237)"`

### Task 4a: The site follows `.pbip` and `byPath` references inside the drop

pb-coord's call (October 28, 2026): the site and the CLI must agree on the shared-model monorepo. Today the site reads a `.pbip` as its folder and pairs a report only with a model beside it (`pairingDecision`'s sibling check), so a report reading `../../models/Shared.SemanticModel` lints without it. This task gives the site the CLI's `.pbip` route, with the drop as the boundary where the CLI has the folder named. It is web code only, so core's budget is untouched. Build it before Task 4, which uses it.

**Size estimate:** about 80 to 120 lines in `project-files.ts` and 150 to 200 lines of tests. The browser has no links and no real paths, so none of the CLI's `realpath` checks carry over: a reference is followed when it resolves, `.` and `..` taken, to a folder inside the drop, and otherwise gets the CLI's outside notice in the CLI's words.

**What changes for an input the site lints today:** a drop with one project below it whose report reads a model elsewhere in the drop now lints that model with the report, as the CLI already does. The site's output for that drop changes, toward the CLI's; the release notes line in spec 10 covers it. The CLI's output does not change.

**Files:** `packages/web/src/input/project-files.ts`. Tests: `packages/web/test/project-files.test.ts`, `packages/web/test/projects-below.test.ts`.

**Interfaces:**

- Produces: `readFolder`'s result for a project given as a `.pbip` path (from `projectsBelow`) or as a folder holding one `.pbip`: the report its `artifacts` name, resolved inside the drop, and the model that report's `definition.pbir` names `byPath`, resolved inside the drop, read with the same `tmdlRead` and `readPart` as a model beside it. `SelectedProject.root` stays the `.pbip`'s folder; the model's files stay relative to the model's root, as the CLI gives them.

- [ ] **Step 1: Write the failing tests.**
  - `project-files.test.ts`: the monorepo dropped whole (after Task 4, as several projects; before it, test through a drop holding one report and the shared model, which lints as one project below) gives each report with the model: `absent` has no model reason, `files` hold the model's `.tmdl` files, and `read` lists them as `../../models/Shared.SemanticModel/...`.
  - A `.pbip` whose `artifacts` name `../Other/Sales.Report` inside the drop reads that report.
  - A reference that climbs out of the drop (`../../../elsewhere.SemanticModel` from a report at depth 2) is not followed, and the notice is the CLI's `outside` notice in its words.
  - `projects-below.test.ts`: for the monorepo, the CLI (`resolveInput`) and the site (`selectProjects`) give the same project paths and, per project, the same set of model files and report files.
- [ ] **Step 2: Run them and see them fail.**
- [ ] **Step 3: Implement.** Port the shape of `resolvePbip` and `readNamed` from `packages/cli/src/walk.ts` onto the drop's `dirs` and `entries`, with `resolveIn`'s rule (`packages/core/src/project/below.ts`) for paths. Keep the PBIP-folder route for a folder whose parts sit beside each other, so Desktop's own layout reads exactly as today.
- [ ] **Step 4: Run the web suite.** `npx vitest run packages/web`.
- [ ] **Step 5: Commit.** `feat(web): follow .pbip and byPath references inside the drop (#237)`

### Task 5: The MCP server, the skill, the docs, and the budget

**Files:**
- Modify: `packages/cli/src/mcp.ts` (the lint tool's description and `INSTRUCTIONS`, one sentence each), `packages/cli/skill/SKILL.md` (line 23's "It lints one project per run..." becomes "Given a folder that holds several projects, it lints each in one run; the quiet output opens each with a `project ` line."), `packages/web/content/cli.md` (exit 2 list, the JSON section's version 2, the quiet section's `project ` line), `packages/web/content/pipelines.md` (lines 57 and 111), `packages/core/scripts/check-browser-bundle.mjs` (245 KB, only if over 240)
- Test: `packages/cli/test/mcp.test.ts`, `packages/cli/test/skill.test.ts`, `packages/cli/test/readme.test.ts`, `packages/web/test/generate.test.ts` (whatever pins the pages)

- [ ] **Step 1: Write the failing tests.** `mcp.test.ts`: the lint tool on the monorepo returns a document with `version: 2` and three `projects`. The skill and page tests that pin wording are updated to the new sentences.
- [ ] **Step 2: Run them and see them fail.** `npx vitest run packages/cli/test/mcp.test.ts packages/cli/test/skill.test.ts`.
- [ ] **Step 3: Implement** the wording. The CLI page's JSON section: "A run over a folder that holds several projects prints `version` `2` (from 0.3.0): `tool`; `summary` with `projects`, `files`, `findings`, `errors`, `warnings`, `infos`, and `ignored`, and `shown` under `--rule`; and `projects`, each the version 1 document's fields without `version` and `tool`, plus `path`, relative to the folder named." Measure core with `npm run check:browser`; if over 240 KB, set `OWN_LIMIT_KB = 245` and extend the comment with the date and the size measured.
- [ ] **Step 4: Run everything.** `npm run build && npm run typecheck && npm run lint && npm test && npm run check:browser && npm run test:e2e`.
- [ ] **Step 5: Commit.** `git commit -m "docs: one run lints every project in a folder (#237)"`

### After the tasks

- One Opus review of the whole branch, then the PR into `release/0.3.0`, with the measured core size, the release-notes line for #233 (spec 10), and the side repositories' README changes listed as follow-ups that ride with their 0.3.0 bumps (spec 8). CI and e2e green with no retries; message pb-coord.
