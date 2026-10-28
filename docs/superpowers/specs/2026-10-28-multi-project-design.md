# Lint every project in a folder in one run

Issue [#237](https://github.com/pbiplint/pbiplint/issues/237), released with 0.3.0 (moved there by Michael on October 28, 2026). Written October 28, 2026, by pb-v3-multi-project, for pb-coord's review. Nothing is built until [#238](https://github.com/pbiplint/pbiplint/issues/238) merges into `release/0.3.0`.

Each choice below is marked **Michael's** (a user would notice it in the output's shape or in what pbiplint accepts) or **technical** (pb-coord can settle it). Section 11 lists the Michael's choices in one place, with a recommendation for each.

## 1. Sources

- **The issue.** [#237](https://github.com/pbiplint/pbiplint/issues/237): one run lints every project in a folder, "instead of refusing a folder that holds more than one". Its spec questions are sections 3 to 9 here.
- **#174** ([the issue](https://github.com/pbiplint/pbiplint/issues/174), merged in #185). It added the search for projects below a plain folder (`foundBelow` in `packages/cli/src/walk.ts`, `projectsBelow` in `packages/core/src/project/below.ts`) and chose to refuse several. Its [section "Why not lint every project in one run"](https://github.com/pbiplint/pbiplint/issues/174) is the cost list this spec answers: "the JSON document would need a project level and a new `version`, SARIF and Markdown would need a section per project, Report at a glance would be per project, config would be resolved per project, and a model shared by several thin reports would have to be linted once rather than once per report".
- **#236, item 9** ([the PR body](https://github.com/pbiplint/pbiplint/pull/236)): a reference is followed only inside the folder you name or the project folder. Its known limit, "a model several projects share", is the layout this issue unblocks, and its notice "pbiplint does not yet lint a model that several projects share" goes away (section 5.4).
- **#238** ([the issue](https://github.com/pbiplint/pbiplint/issues/238)): a rule that cannot finish becomes an error finding, and SARIF's `executionSuccessful` goes false. This design only aggregates findings, so #238's finding and its SARIF flag carry through per project with no special case (sections 6.5 and 6.6).
- **The corpus** (the #104 research clones, 484 repositories): 154 hold more than one semantic model; 16 hold more than 10, 5 more than 20, 2 more than 50, and 1 holds 173. Measured on October 28, 2026, on the Mac, with core built from `release/0.3.0` (06012fb): linting all 173 models of that repository one after another took 23.0 s (slowest model 818 ms, heap 94 MB); the 61-model repository took 2.7 s. The clones hold model folders only, so these are model counts.
- **Michael's bar** (September 30, 2026): the smallest change that meets the boxes; complexity is a cost.

## 2. What changes, in one paragraph

A folder that holds several projects, below it or side by side, is linted whole: each project is linted exactly as `pbiplint <that project>` lints it today (its own walk, config, and result), under the folder you named as the #236 boundary, and the outputs show the projects one after another under one combined summary, with one exit code. A model that several projects share is read once and linted with each report that uses it, and its own findings are listed once. Every input that lints today keeps its code path and its output byte for byte: the new route starts only where today's run exits 2 with "contains N projects", "N semantic models", "N reports", or "N .pbip files".

## 3. Discovery

### 3.1 Which inputs lint several projects (Michael's)

**Recommended:** a folder you name lints every project when it holds more than one, by the walk #174 added, whether they sit below it or side by side:

- **Below:** the folder is not a project itself (no `.pbip`, model, or report at its top) and `projectsBelow` finds two or more. Today: exit 2 with the list.
- **Side by side:** the folder holds several `.pbip` files, models, or reports at its top, the layout Power BI Desktop writes when two projects are saved into one folder. Today: exit 2 ("contains 2 semantic models; point at one of them"). The same `projectsBelow` search runs over the folder, so each `.pbip` lints its report and model as it does when named.

Unchanged:

- A folder that is itself one project lints that project only, even when more projects sit deeper, as today. Changing that would change output for an input that lints today.
- A `.pbip`, a part folder, a `definition` folder, or a `.tmdl` file names one project, as today. A `.pbip` naming several reports stays refused.
- A folder with one project below it lints that project with the notice #174 added, byte for byte.
- Loose `.tmdl` files with no project below still read as one model.

Side by side without `.pbip` files, `projectsBelow` already gives a report folder and its model separately when they cannot be one folder's project (#174's rule), so the report lints without its model there, as it does when named. Desktop always writes the `.pbip`, so this is rare; no change.

### 3.2 The boundary (technical)

Each project is resolved as the one-project route resolves the one project below a folder today (`resolveAt(at(project), w.named)`): the folder you named stays the #236 boundary for every project. So `pbiplint .` in a repository with `reports/Sales`, `reports/Finance`, and `models/Shared` follows each report's `../../models/Shared.SemanticModel`, which sits inside the folder named. Nothing in a file widens it.

### 3.3 A project that cannot be read (Michael's)

**Recommended:** the whole run is refused (exit 2, nothing on stdout) and the message names the project and its reason, then lists the command that lints each of the others, as #174's list does. A partial run would either print a report with exit 2, breaking the contract ("`2`, with nothing on stdout"), or pass a gate with a project unlinted, which #175 rules out. Alternative: lint the rest and turn the unreadable project into an error finding. It is kinder to a repository with one legacy `report.json` project in it, and it is more code, more contract, and a new built-in finding; not recommended for 0.3.0.

### 3.4 The cap (Michael's: the number)

**Recommended: 200 projects per run.** Above it the run is refused (exit 2) with the count and "point at a folder that holds fewer", plus the first-level folders that hold projects and how many each holds, so a person or an assistant can split the run. Every corpus repository fits (the largest holds 173 and lints in 23 s). The cap bounds the worst case with #236's budgets: each project keeps its own per-model work budget (section 4.4), so a run's work is at most 200 projects' budgets.

### 3.5 The shared model is read once (technical)

The walk keeps one read of each model folder per run, keyed by its real path, so a model several projects reach is read from disk once and every project lints the same files. It is linted once per report that uses it: `lint()` takes one model and one report, and changing that is a larger change to core than this issue needs. Section 5 says how its findings are shown once.

## 4. Linting each project

### 4.1 Config (technical, by the rule already written)

- **Without `--config`:** each project's nearest `pbiplint.config.json`, searched from the project's root up, as when it is named alone. A repository with one config at its root applies it to every project.
- **With `--config`:** that file applies to every project.
- **Unknown rule ids in a config** are named once per config file, not once per project.
- **`--fail-on`** overrides every project's config, as today.

### 4.2 `pbiplint.ignore` (technical)

Unchanged. An annotation sits on an object in the model's or the report's files, so it applies to every run that reads those files, a shared model's included.

### 4.3 `--rule` (technical)

Applied to each project's result (`showOnly`), and the combined summary adds up the `shown` counts. A rule id is checked once, before the walk, as today.

### 4.4 Gating and the work budget (technical)

- **One exit code:** `1` when any project has a finding at or above its `failOn`, after section 5's step; else `0`; `2` as in sections 3.3 and 3.4.
- **#236's budgets** (4,000,000 units per model, 2,000,000 per query) apply per `lint()` call, so per project. A shared model linted with three reports gets its budget three times; the cap bounds the total.

## 5. The shared model (technical, with one Michael's choice in 5.2)

### 5.1 Which model is shared

A model the walk reads, by real path, in two or more of the run's projects. On the site, the same model path in the drop.

### 5.2 Its findings are listed once (Michael's)

**Recommended:** the model's own findings (every finding whose `layer` is `model`, the file family, which takes in the Power Query rules and the model's `PARSE_ISSUE`s) are listed under the first project in name order that uses it. Each other project that uses it drops them and carries a notice: "the model at `models/Shared.SemanticModel` is shared with `reports/Finance/Finance.pbip`; its findings are listed there". The first carries the matching notice naming the others. Report findings and the cross-layer `BROKEN_FIELD_REFERENCE` and `REPORT_LEVEL_MEASURES` are each report's own and stay with it.

Rejected: listing the model's findings under every project. Counts, annotations, and SARIF results would double for one set of files, and a gate would count one problem several times. Also rejected: an entry of its own for the shared model. It would be a result no `lint()` call produced, with no layers line, facts, or skipped line of its own, which is more code in every format.

### 5.3 `NOT_REACHED_FROM_REPORT` across reports (technical)

Run against one report, the rule calls a field "not reached" when another report sharing the model reaches it, which is wrong: a field any report needs counts as used (Michael, October 1, 2026: for an "unused" rule, anything the model or a feature needs counts as used). So a finding of this rule on a shared model stands only when every project sharing the model reports it (matched by object type, name, file, and line), which is exactly "no report reaches it", since what a set of reports reaches is the union of what each reaches. Its detail is the first project's. No rule code changes.

### 5.4 Counts and the #236 notice (technical)

- After the step above, each project's counts, `failed`, and groups are recounted, as `showOnly` recounts.
- The combined summary counts a shared model's files once.
- The #236 hint for an outside reference loses its shared-model branch: naming one `.pbip` whose model sits beside other projects now says "lint the folder that holds both (../.. from the project folder) to include it", since that folder now lints every project in it. The hint's other branch, for a folder whose search ran out of budget, says the same, so `oneProjectAt` in `walk.ts` goes.
- If the projects sharing a model resolve different config files, the model's findings follow the first project's config, and its notice says which config that was. Rare, and the notice keeps it honest.

## 6. Output

Several projects are always shown one after another in name order (the order `projectsBelow` gives), each as the one-project format shows it today, under a combined summary. A one-project run takes none of this code (section 2).

### 6.1 Text (Michael's: the look)

```
pbiplint: 3 projects, 41 findings (3 errors, 30 warnings, 8 info) in 212 files
  models/Standalone.SemanticModel   4 findings (0 errors, 3 warnings, 1 info)
  reports/Finance/Finance.pbip     12 findings (1 error, 9 warnings, 2 info)
  reports/Sales/Sales.pbip         25 findings (2 errors, 18 warnings, 5 info)

Project 1 of 3: models/Standalone.SemanticModel
pbiplint: 4 findings (0 errors, 3 warnings, 1 info) in 31 files
...that project's text report, as today...

Project 2 of 3: reports/Finance/Finance.pbip
...

Run pbiplint explain <RULE_ID> for a rule's guidance, offline.
```

The combined line takes #238's wording for rules that could not finish, summed. The explain line appears once, at the end. Alternative: one flat list with the project on each finding. It mixes projects inside a rule group and reuses none of today's per-project layout; not recommended.

### 6.2 `--quiet` (Michael's, with the text)

```
pbiplint: 3 projects, 41 findings (3 errors, 30 warnings, 8 info) in 212 files
project models/Standalone.SemanticModel: 4 findings (0 errors, 3 warnings, 1 info) in 31 files
Read: ...
warning ISAVAILABLEINMDX_FALSE_NONATTRIBUTE_COLUMNS 3
info ... 1
project reports/Finance/Finance.pbip: 12 findings (...) in 70 files
...
Next: pbiplint <path> --rule <RULE_ID> for a rule's findings, pbiplint explain <RULE_ID> for how to fix it.
```

Contract addition, from 0.3.0: a line that starts `project ` opens a project, and the rule lines after it are that project's. A one-project run has no such line, so today's contract holds unchanged.

### 6.3 stderr (technical)

Each notice and each "rule X failed" line names its project first (`pbiplint: notice: reports/Sales/Sales.pbip: ...`), since its path is relative to that project. With `--output`, the one stderr line is the combined summary.

### 6.4 Markdown (Michael's, with the text)

`# pbiplint report`, the combined summary sentence, a table of the projects (Project, Findings, Errors, Warnings, Info), then each project as `## Project 2 of 3: reports/Finance/Finance.pbip` with today's body one heading level down. That needs one option on `formatMarkdown`, the heading level, so the body is not rewritten. The Action's and the Azure task's job summaries are this document (section 8).

### 6.5 JSON (Michael's)

**Recommended:** a one-project run keeps today's document, `version` `1`, byte for byte. A several-project run prints `version` `2`:

```json
{
  "version": 2,
  "tool": { "name": "pbiplint", "version": "0.3.0" },
  "summary": { "projects": 3, "files": 212, "findings": 41, "errors": 3, "warnings": 30, "infos": 8, "ignored": 0 },
  "projects": [
    { "path": "models/Standalone.SemanticModel", "summary": {}, "layers": {}, "facts": [], "diagnostics": [], "groups": [] }
  ]
}
```

Abridged above: each `projects` entry is today's document without `version` and `tool`, plus `path` (relative to the folder named, forward slashes). Under `--rule`, the top `summary` gains `shown` as each project's does.

Why a version change and not an additive field: the contract says "A field removed or renamed, or one whose meaning changes, raises `version`" ([the CLI page](https://pbiplint.com/cli/#contract)). Keeping `version` `1` would mean top-level `layers`, `facts`, and `groups` that describe no one project, or a top-level field removed. No reader breaks: every input that prints a version `1` document today still does, and every input that would print `2` exits 2 today. A reader checks `version`, as the page already asks. Alternative: version `2` for every run, one project included. One shape for readers, but every one-project document changes, which the brief rules out where avoidable.

### 6.6 SARIF (technical)

One run, as today, because the Action and the Azure task read `runs[0]` only (`annotate.mjs` and `report.mjs`). Its `rules` are the union, its `results` every project's, each URI prefixed with its own project's part roots relative to the working directory (today's `pathPrefix` and `reportPathPrefix`, per project), and its notifications every project's. `executionSuccessful` is false when any project's would be (#238). A shared model's results appear once, after section 5. Code scanning sees one upload with every project's alerts at real paths, so one category per repository is enough.

## 7. The site (Michael's)

**Recommended:** yes, a dropped or chosen folder holding several projects is linted whole, as the CLI lints it: the same `projectsBelow`, the same shared-model step (core's, section 9), the same cap. The results show the combined summary line and a list of the projects, each linking to its section, then each project's results as today's page shows one project, export bar included, so "Copy for an AI assistant" and the downloads stay one project each. The refusal "drop one of them" goes, except above the cap. Alternative: one export bar for the whole run. It needs the multi-project formatters in core, about 2 KB more there (section 9); not recommended for 0.3.0.

The Privacy Promise is unchanged: the page still reads only what was dropped, and only after the drop.

## 8. The pipelines and the MCP server (technical)

- **GitHub Action and Azure Pipelines task: no code change.** Both run the CLI with `--format sarif` and `--format markdown` and read `runs[0]`, so annotations, counts, the code scanning upload, and the job summary work as they are. The 1 MiB job summary truncation already covers a long report.
- **Their docs change:** each README's "Several projects" section (one step per project, each with its own category) becomes "one step lints every project in the folder; separate steps still work, each with its own category". Each repository's change goes through its own PR with CI green, as every change there does, with that repository's bump of its default `pbiplint-version` to 0.3.0, so the docs never describe a version the step does not run.
- **`pbiplint mcp`: no code change beyond words.** Its lint tool returns what the CLI prints: the version `2` document, or the quiet text with `project ` lines. Its description and instructions gain one sentence each saying so.
- **`pbiplint skill`:** the skill's text says a repository's root lints every project and how the quiet output names them. The Claude plugin stays on 0.2.5 while #218 is in review, so `pbiplint/claude-plugin` does not change now.

## 9. The size budget (technical; needs one raise)

Measured on `release/0.3.0` (06012fb): core's own code 238.2 KB of 240 KB, 1.8 KB left, before #238.

To spend the least there, only what the site and the CLI must share goes into core: the shared-model step (section 5), the combined summary line, and `formatMarkdown`'s heading level. Comparable code measures 433 bytes minified for `showOnly` and 685 for `formatJson`, so these come to about 1.5 KB. The multi-project text, quiet, Markdown, JSON, and SARIF wrappers live in the CLI, which has no budget, and call core's one-project formatters.

That alone fits in 1.8 KB, but #238 adds a built-in rule and its page summary first, so this PR likely crosses 240 KB. **Ask:** pb-coord raises the tripwire to 245 KB in this PR, with the measured number in the PR body and the script's comment, as its authorization allows. Moving the wrappers into core instead (needed only for a whole-run export on the site, section 7) would cost about 2 KB more.

## 10. Docs, tests, and release notes

- **The CLI page:** the exit 2 list loses "a folder that holds several projects or parts" and gains "a folder that holds more than 200 projects" and "a project in a folder you named that cannot be read"; the JSON section gains version `2`; the quiet section gains the `project ` line.
- **The pipelines page:** its two "For several projects in one repository, add a step for each" sentences say one step lints them all, and separate steps still work, each with its own category.
- **The Privacy Promise:** unchanged; #236's wording ("inside the folder you name, or the project folder") already covers it.
- **The release notes** (#233), "What can change in your results": a folder holding several projects is linted whole where it exited 2; a `.pbip` whose model is shared now points at the folder holding both.
- **Tests:** the CLI's walk, main, contract, and quiet tests; core's shared-model step; the site's `project-files` and results tests; a test that holds the CLI and the site to the same project list, as #174's does; and a byte-identity test that a one-project folder's output in every format matches today's.
- **No new fixture:** the tests build their monorepos from copies of `examples/messy-sales` in a temporary folder, as #174's tests do, so `examples/` does not change.

## 11. The choices, in one place

**Michael's** (each a recommendation; the work can start on all of them and adjust):

1. **Lint several projects whole, below and side by side** (3.1): yes, both.
2. **The output's shape** (6.1, 6.2, 6.4): projects one after another, each as today, under one combined summary; quiet output gains `project ` lines.
3. **JSON** (6.5): version `2` only for a several-project run; one-project documents unchanged.
4. **A shared model's findings** (5.2): once, under the first project in name order, with a notice on the others.
5. **A project that cannot be read** (3.3): refuse the whole run, naming it.
6. **The cap** (3.4): 200 projects.
7. **The site** (7): lint whole; per-project sections and exports.

Items 1 to 3 shape everything else; 4 to 7 can go in one batch.

**Technical** (pb-coord): the boundary (3.2), reading a shared model once (3.5), config, ignore, `--rule`, and gating (4), `NOT_REACHED_FROM_REPORT` across reports and the counts (5.3, 5.4), stderr (6.3), SARIF as one run (6.6), no code change in the pipelines or the MCP server (8), where the code lives and the 245 KB raise (9).

## 12. Not in this issue

- Linting a model once with all its reports in one `lint()` call (section 3.5).
- A folder that is itself a project also linting projects deeper down (section 3.1).
- Running projects in parallel. Sequential runs measured 23 s for the corpus's largest repository.
- A whole-run export on the site (section 7).
