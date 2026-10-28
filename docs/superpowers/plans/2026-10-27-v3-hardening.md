# v3 Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Pull request 9 of v3 ([#78](https://github.com/pbiplint/pbiplint/issues/78)): the hardening items from the pre-release security review (pb-coord with Michael, October 27, 2026). M is read within a deterministic work budget, the name resolver stays near linear, a deep tree no longer turns a rule off for the whole model, `PARSE_ISSUE` hides a multi-line literal's middle lines and a comment's text, SECURITY.md says what core depends on, and the command line follows a reference only inside the project folder.

**Architecture:** A linear scan of each query's text (`packages/core/src/m/budget.ts`) runs before Microsoft's lexer and parser and decides whether `readM` parses the query; a query over budget is a `PARSE_ISSUE`. The resolver (`packages/core/src/m/resolve.ts`) indexes each scope's names in a `Map`, remembers `origin` and `boundValue` per node, and caps `origin`'s depth; the M rules run per query through one helper that records a thrown error as a rule error naming the query. Masking (`packages/core/src/m/mask.ts`) becomes "which code units are hidden" plus a renderer, so a TMDL line can be hidden wherever the whole file's masking or the line's own would hide it. The CLI's walk (`packages/cli/src/walk.ts`) compares each reference's real path with the project folder's.

**Tech Stack:** TypeScript, `@microsoft/powerquery-parser` 2.0.0 (pinned), Vitest, Playwright, esbuild (`check:browser`), Node's `fs.realpathSync.native` in the CLI only.

**Spec:** `docs/superpowers/specs/2026-10-12-pbiplint-v3-power-query-layer-design.md`, sections 3.4, 7, 8, 11.3, 11.4, and 11.5. Pull request 8's plan (`docs/superpowers/plans/2026-10-13-v3-desktop-check.md`) and pull request 6's (`docs/superpowers/plans/2026-10-13-v3-rules-resolver.md`) are the pattern this plan follows.

## Rulings

Every measurement below was taken on October 27, 2026 on Michael's Mac (Node 26.11.1) against `v3/hardening` at 23de9e3, with throwaway scripts in the plan writer's scratch folders. Times are Microsoft's parser alone unless a line says otherwise.

### Item 1: the M work budget

- **The parser's cancellation support, checked.** `Settings.cancellationToken` takes an `ICancellationToken` (`isCancelled`, `throwIfCancelled`, `cancel`), which the lexer and the parser both poll. The package ships `CounterCancellationToken` (cancels after N `isCancelled` calls; its own comment calls it "not really useful other than as an example") and `TimedCancellationToken` (wall clock, ruled out by the item). **A counter cannot bound the quadratic shapes:** the parser polls about 4.5 times per token whatever the shape, so the count is linear while the time is quadratic. A `1+1+...` chain of 40,000 terms makes 359,999 checks and takes 9.3 s; the corpus's largest query makes 1,105,431 checks and takes 0.44 s. Any count that admits the corpus admits a chain that runs for minutes.
- **The synchronous lexer cannot be the guard either.** `TaskUtils.tryLex` is itself quadratic in the tokens on one line: 1,600,000 one-line tokens of `1+1+...` take 49.5 s to lex, 400,000 commas on one line 12.5 s. So the budget is pbiplint's own scan, one regular-expression pass over the text, before the lexer runs.
- **What the parser does with each shape** (at the budget's unit, below; µs per unit at about 2,000,000 units): `1+1+...` 1.14, a 40,000-item list 1.14, 40,000 `let` steps 1.18, a generated `#table` 1.33, 25 lists of 1,000 `+` terms 1.29, 128 nested parentheses around a chain 1.20, 148,000 `else if` 0.97, a literal of 1,450,000 lines 0.33. Three shapes need terms of their own: **nesting** (an unclosed `(` costs memory by the square of its depth: 800 take 524 MB and 4,000 abort the process out of memory; 400 unclosed `{` overflow the parser's stack), **lines** (a literal of 2,000,000 lines parses in 1.0 s; one of 8,000,000 did not finish in 120 s), and **characters on the error path** (a parse error on a long line costs about 0.6 µs a character, linear: 4,000,000 characters 2.4 s, 16,000,000 9.6 s).
- **The unit**, counted by `mWork` in one pass, with M's line breaks (`\n`, U+2028, U+2029) and comments read as the lexer reads them:

  `units = 2 × tokens + lines + ⌊characters / 8⌋ + ⌊Σ chain² / 256⌋ + ⌊Σ commas² / 1,024⌋ + ⌊Σ tokensOnLine² / 16,384⌋`

  A chain is the operators between two commas or brackets in one bracket level (`+ - * / & = < > ?`, `and or not as is meta`); commas are counted per bracket level; a comment is no token. `depth` is the deepest bracket nesting.
- **The budget:** a query is parsed when its `units` are at most **2,000,000**, its `depth` at most **128**, and the model's parsed M so far plus its `units` at most **4,000,000**. A query over its own limit does not use up the model's.
- **Measured in the budget's own unit** over the corpus (1,321 models, 10,005 queries, read by `readM`): the largest query is **847,457 units** (2.4 times under the query budget), the largest model's M **1,158,354 units** in 8 queries (3.5 times under the model budget), the deepest nesting **15** (8.5 times under). The slowest model parses in 642 ms in all. The big model of spec 11.5 (`scripts/make-big-model.mjs`) is **1,328,152 units** in 8 queries, the largest 166,019 (3.0 times under).
- **What it stops:** the review's 80,000-term chain (160 KB, 37.6 s) is 26,901,853 units and is reported in milliseconds without reaching the lexer. Just under the budget the slowest shapes parse in about 2.6 s per query and 5.3 s per model on the Mac (about 3 times that on CI's Node 22, and 1.75 times more on Node 20, spec 11.5), holding up to about 320 bytes of tree per unit (about 1.3 GB at the model budget for the worst shape, `else if` chains; a generated table holds 168). The error-path term is linear: at the query budget a 16,000,000-character line takes about 10 s on the Mac. **For pb-coord** (below): these are the costs the budget still allows.
- **A query over budget is a `PARSE_ISSUE`, not a notice.** Michael decided on October 12, 2026 that M that cannot be read is a `PARSE_ISSUE` (spec 1 and 7), and a query over budget is M pbiplint did not read: no rule reads it, and the finding is how the user hears of that. It is an error, so a gated run fails closed: a crafted query cannot hide a secret or a dynamic source from the M rules by being large and still pass. The notices (`Diagnostic`) belong to the input reader and change no exit code. The finding sits at the query's first line and column, with the reason `M is too large or complex to read (over pbiplint's limit for one query)` or `M is too large or complex to read (over pbiplint's limit for one model's M)` and the first line masked and cut as every M issue's line is.
- **Corpus diff:** zero changes expected.

### Item 2: the resolver

- **Measured** through the whole lint (the review's bundled core): the review's chain (N steps each naming the one before, and N `Web.Contents` calls reading the last) takes 0.84 s at 500 and 6.1 s at 1,000; N comparisons on a chain (`INCREMENTAL_REFRESH_RANGE_BOUNDS`) 0.77 s and 5.8 s; N `Table.SelectRows` steps (`FIXED_DATE_IN_ROW_FILTER`) 1.2 s and 4.4 s. The last is not only the resolver: `readsRange` and the rule's own loop test every identifier and comparison in the whole query with `isWithin` for each call, so both read the condition's own subtree instead (`nodesWithin`).
- **The fix:** each `let`, record, and function indexes its names in a `Map` (a `WeakMap` per scope node, built on first use); the model's queries are indexed by name; `origin` and `boundValue` remember each node's answer in a `WeakMap` for the run (nodes are per parse, so a lint's memory goes with its trees). A cycle still reads as `unknown`. One change of meaning, recorded in spec 8: a node reached twice in one classification reads the same both times, where today the second visit reads `unknown`. `DYNAMIC_DATA_SOURCE` reports neither `static` nor `unknown`, so this can move a finding only when a field access's container chain and a name followed later meet the same node; the corpus diff must confirm zero.
- **The guard's bound:** spec 11.5's rule, three times CI's time rounded up to the next 5 s. CI ran the big-model guard about 3 times slower than Michael's Mac on Node 22 and 5.3 times on Node 20 (spec 11.5: 1.2 s on the Mac, 3.6 s and 6.4 s on CI). The fixed chain is expected to lint in well under 0.3 s on the Mac, so 3 × 5.3 × 0.3 s rounds up to **5 s**, to be confirmed on CI (Task 6 posts CI's time).

### Item 3: a deep tree and one rule's error

- **Measured** (bundled core): `joined` overflows the stack at 8,000 `&` parts, `origin` at about 2,000 levels (an address joined from 2,000 calls), and `hasQueryField` at 12,000 chained steps. Each takes its rule's findings off every query of the model, and the exit code does not change.
- **The fix:** `joined` and `hasQueryField` become loops; `origin` stops at **500 levels** (a quarter of where Node overflowed) and reads anything deeper as `unknown`, as spec 8 already says of "anything deeper than the cycle guard"; and the M rules run per query through `eachQuery`, which records an error as a rule error naming the query (`query 'Sales': Maximum call stack size exceeded`) and goes on with the other queries.
- **For pb-coord, not planned:** should a rule error change the exit code? Today `failed` reads only the findings' severities, so a run in which a rule threw on one query exits as if the rule had found nothing there (the text format does print "Rule errors (please report these)"), and a gated pipeline passes. This plan does not change it.

### Items 4, 5, and 6: masking

- **The leak, reproduced:** in a TMDL file indented with spaces, each line of a multi-line text literal is its own `PARSE_ISSUE`, and the middle line, masked alone, has no quote: a made-up password on it printed whole, in every format.
- **The fix:** `hiddenLiterals(text, { tmdl })` gives one flag per UTF-16 code unit (hidden or not), and `renderMasked` turns each run of hidden code units on a line into one `…`. `maskLiterals` is the two together, so every existing case keeps its output. A TMDL issue's line is hidden wherever `hiddenLiterals` hides it in the whole file (from the file's first line, as `readM` masks M from the query's first line) **or** in the line alone: fail closed. The whole file's text is in `readM`'s line reader, so `MIndex` gains `maskedLine(file, line, text)`, and `PARSE_ISSUE` calls it.
- **Comments:** a comment's text is hidden whole, so a comment reads `//…` or `/*…*/` (each line of a block comment its own run). A TMDL `///` description line keeps today's reading (only quoted text hidden), since it is the model's own documentation and not M.
- **U+2028 and U+2029:** M's lexer ends a line comment at `\n`, U+2028, and U+2029 (checked: not at `\r`, U+0085, U+000B, or U+000C), so `//` runs to the first of those three in both expressions and in the comment replacement.
- **Corpus:** 435 TMDL and 1 M `PARSE_ISSUE` findings; with the prototype of this change, **2 details change** (both a comment's text now hidden) and no finding is added or removed. So Task 4's corpus diff expects `+2 PARSE_ISSUE` and `-2 PARSE_ISSUE` at the same locations, not zero.

### Item 7: SECURITY.md

- `@pbiplint/core` has one runtime dependency, `@microsoft/powerquery-parser`, pinned at exactly 2.0.0. The parser's own two, `grapheme-splitter` (`^1.0.4`) and `performance-now` (`^2.1.0`), use caret ranges, and the parser declares `"node": ">=22"` while pbiplint's `engines` field accepts `^20.19.0`, so npm warns on Node 20. The `pbiplint` CLI ships one bundled file and has no runtime dependency. Task 1 says so, and adds the parser's limits to "In scope".

### Item 8: the two unfinished areas

- **(a) Patterns from `pbiplint.config.json`: none.** No `new RegExp` in core, the CLI, or the site is built from a rule option. A rule's options are declared per rule (`RuleOption`), and `bindConfig` (`packages/core/src/engine/config.ts:79` to `:95`) refuses an option a rule does not declare, a value of the wrong type, and a string outside the option's `values`; the only string options today are `expect` with fixed values (`layout`, `none`, `open`, `closed`). The six `new RegExp` sites build from constants (`DEFAULT_STEP`, `TIME_INTELLIGENCE`), from a year's digits (`namesYear`), or from model names passed through `escapeRegExp` (`columns.ts`, `tables.ts`, `relationships.ts`); the site's `LINKED` is built from constant URLs. A config file cannot make a rule run a pattern of its choosing. No fix is planned.
- **(b)** Task 6 runs the review's resolver proof of concept, and its parser one, through the built CLI under a hard time limit.

### Item 9: references are followed only inside the project folder

- **Where references are followed today:** only on the CLI's `.pbip` route. `resolvePbip` (`walk.ts:342`) resolves the report folder each `artifacts` entry names against the `.pbip`'s folder, and `readNamed` (`walk.ts:394`) resolves the model folder a `definition.pbir`'s `byPath` names against the report folder; both are then read wherever they sit. The folder route (a PBIP folder, a part folder, a report folder given alone) follows nothing: it pairs the report with the model beside it through `pairingDecision`, which compares the written path and reads nothing it names. So a report folder given alone already reads only its own folder, and the rule's second root (its parent) has nothing to apply to today.
- **The rule:** the project folder is the folder that holds the `.pbip` (its real folder when the `.pbip` is a link, as today). A report folder or a model folder a reference names is read only when its real path (`realpathSync.native`) is inside the project folder's real path; a path that is not there is compared as written, and goes on to today's "not there" handling when it is inside. Outside, nothing in it is looked up: the run gives an `unread-file` notice, `../Shared/X.SemanticModel is outside the project folder, where references are not followed, so it was not linted`, the model layer is absent with the reason `the model this report reads is outside the project folder`, and the report is still linted. A `.pbip` whose report is outside reads nothing, so the run is refused naming it, as every run that reads nothing is (#175).
- **Links:** the real-path test comes before the existing link rule, so a link inside the project that leads outside is named as outside the project folder (the real reason), and a link that leads to a folder inside the project is still not followed, with today's link notice. Three existing expectations in `walk.test.ts` move from the link notice to the outside notice.
- **What changes for users:** a `.pbip` whose report reads a model in a sibling folder above the project, such as `../../Shared/X.SemanticModel`, no longer lints that model. Five existing `walk.test.ts` cases assert that it does, and change.
- **The site:** reads only the files the browser gives it from the drop, and has no `.pbip` route (`packages/web/src/input/project-files.ts:505` to `:509`): a `definition.pbir`'s `byPath` goes to `pairingDecision` and is compared, never followed, and nothing outside the drop can be opened by path from the page. So the rule holds there by construction, realpath does not arise, and the site does not change.
- **Corpus check:** the corpus holds 1 `.pbip` and 2 `definition.pbir` files that name a model by path; none names a report or a model outside its project folder (0 of 1 and 0 of 2), and none uses an absolute path. Corpus diff: zero changes expected (the corpus diff reads through core, so Task 5 relies on this check and its tests).

### The core's budget

The base is 235,654 bytes (230.1 KB) against `OWN_LIMIT_KB = 240` (245,760 bytes). Projected growth, minified: Task 1 about 1,050 bytes (`budget.ts` about 750, `read.ts` about 300), Task 2 about 600 (`resolve.ts` 450, `ast.ts` 200, `power-query.ts` less 50), Task 3 about 450 (`eachQuery` and `run.ts` 250, `power-query.ts` and `tables.ts` 120, the cap 80), Task 4 about 480 (`mask.ts` 250, `read.ts` 250), Task 5 none (CLI only). In all about 2,600 bytes, to **about 238,250 bytes (232.7 KB)**, 7.3 KB under. Each task measures with `bytes.mjs`; **crossing 240 KB stops the work** for pb-coord with the `bytes.mjs` lines of the files that grew, and a task more than 1 KB over its own projection reports its lines before committing.

## Global Constraints

- **Base branch:** `release/0.3.0`, never main. Branch `v3/hardening`, from `release/0.3.0` at 23de9e3 (pull requests 1 to 8). Work in the worktree `~/Projects/pbiplint/pbiplint/.claude/worktrees/v3-spec`, never in home (`~/Projects/pbiplint/pbiplint` itself); the one file outside the worktree a task edits is the local release notes draft (Task 5), which the worktree reaches through its `.superpowers` link.
- **No em dashes anywhere** (code, comments, docs, pages, commit messages; `rule-pages.test.ts` checks pages for U+2014). Restructure with a comma, colon, parentheses, or two sentences.
- **Long-form dates in prose** ("October 27, 2026"), except in file names and front matter. **Capitalized bullets** in every list.
- **Item 9's wording:** in every text (code comments, tests, docs, the release notes, commits, the pull request), the change is an ordinary scope rule, "references are followed only inside the project folder". Never call it an exploit, an attack, or a vulnerability.
- **Rule pages** are pbiplint's own prose. **Never name or cite any competing Power Query linter or its author**, in code, pages, commits, or the pull request.
- **Counts only from the corpus:** the pull request, the spec, and the release notes carry counts, never a corpus path, line, value, model or repository name, or vendor word.
- **Secret hygiene:** never print a fake or real secret value. Fixture values are named here as `FIXTURE_PWD` (kind `pwd`, number `0009`) and `FIXTURE_COMMENT_KEY` (kind `key`, number `0010`), in m-zoo's form `pbiplint-fixture-<kind>-<nnnn>-notreal`; the executor writes them out only in the fixture files. Unit tests build their values with `fake(kind, n)` and numbers from `0201` up.
- **Core stays browser-pure:** no Node built-in, no `process.`, no network API in `packages/core/src`. `realpathSync` lives in `packages/cli/src/walk.ts` only.
- **The core budget** is `OWN_LIMIT_KB` (240) in `packages/core/scripts/check-browser-bundle.mjs`, compared in bytes. No task changes it; crossing it stops the work for pb-coord.
- **TDD:** every item gets a test that fails before its fix; each task's Step 2 runs it and records the failure in `progress.md`. The suite stays green at every task: every commit passes `npm test`, `npm run lint`, `npm run typecheck`, and `npm run check:browser`.
- **Formatting:** `npx prettier --write` on every changed `.ts`, `.mts`, `.mjs`, and `.json` file outside `tests/fixtures/` and `tests/expectations/` before committing. Then `npm run lint`.
- **Generated data:** after any page edit, `npm run build -w @pbiplint/core && node scripts/sync-rule-pages.mjs`, and commit the `.data.ts` files it rewrites.
- **Folder inputs in e2e** go through `setFolder` from `packages/web/e2e/folder-input.ts`, never `setInputFiles` on a directory.
- **Commits:** each message ends with `Part of #78.`, a blank line, and `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Never a closing keyword next to an issue number.
- **Subagents** run on Opus 5.5 and share the worktree, so one edits files at a time.
- **Command rules** (pb-coord, October 27, 2026; hard rules):
  - Scratch only under the executing session's job folder, `$CLAUDE_JOB_DIR/tmp` (for this plan's writer, `/Users/michaelmckinley/.claude/jobs/cb7c83fd/tmp`). Never `/tmp`.
  - Every experiment in a fresh folder from `mktemp -d "$CLAUDE_JOB_DIR/tmp/pr9.XXXX"`, used by its printed literal path (shell variables do not survive between tool calls). Leaving scratch folders behind is fine.
  - Never `rm -rf` or `rm -r` with a glob or a variable path; never `cd` somewhere and delete with `*`.
  - No `sudo`, no `git clean`, `git reset --hard`, `git checkout -- .`, `git stash`, or any push (the Finish section's push is pb-coord's).
  - If a command might ask for permission, rewrite it so it cannot. Never wait on a prompt. `npx --yes tsx` runs tsx from npx's cache without asking.
  - Any proof of concept that can take minutes or gigabytes runs under a hard time limit: `node .superpowers/sdd/2026-10-27-v3-hardening/timed.mjs <ms> <command> ...` (Before Task 1), a Node child process with a kill timer. `timeout` is not installed on this Mac.
  - `gh-pb` for GitHub calls, never `gh auth switch`.
- **The plan's workspace** is `.superpowers/sdd/2026-10-27-v3-hardening/` (git-ignored; `.superpowers` links into home's copy, so scripts import the worktree's code by `process.cwd()`). Reused: `bytes.mjs` from `.superpowers/sdd/2026-10-13-v3-rules-resolver/`, and the reader plan's `corpus-diff.mts` from `.superpowers/sdd/2026-10-13-v3-reader/`.
- **The corpus** (`~/Projects/pbiplint/assets/pbip-lint-spike/research-104`) is not pbiplint's.

## Review Focus

- **A project reached through a linked folder.** A repository cloned under a linked folder (on macOS every temp folder sits under `/var`, a link to `/private/var`) must still read Desktop's own `../X.SemanticModel`, since both real paths move together. Task 5 pins it with a project whose parent is a link.
- **A `definition.pbir` written on Windows.** `byPath` written with backslashes, `..\\..\\Shared\\X.SemanticModel`, must be judged as the same path with forward slashes: outside, with the notice. Task 5 pins it.
- **A doubled quote in a multi-line literal.** `"say ""hi""` on one line and its close on the next, in a space-indented file, must stay hidden on both lines, since the whole file's reading and the line's own differ there. Task 4 pins it.
- **A cycle between steps.** `let a = b, b = a in Web.Contents(a)` must read as `unknown` and return, with `origin` remembering answers. Task 2 pins it.
- **A query exactly at the budget.** A query of exactly the query budget's units is read; one unit more is reported. Task 1 pins the boundary with a small budget.

## File Structure

| File | Task | Responsibility |
| --- | --- | --- |
| `packages/core/src/m/budget.ts` (new) | 1 | `mWork`, `MBudget`, `M_BUDGET` |
| `packages/core/src/m/read.ts` | 1, 4 | The budget before each parse; `maskedLine` |
| `packages/core/src/m/types.ts` | 4 | `MIndex.maskedLine` |
| `packages/core/src/m/resolve.ts` | 2, 3 | Scope and query indexes, memos, the depth cap |
| `packages/core/src/m/ast.ts` | 2 | `nodesWithin` |
| `packages/core/src/m/mask.ts` | 4 | `hiddenLiterals`, `renderMasked`, `maskLiterals` |
| `packages/core/src/rules/pbiplint/power-query.ts` | 2, 3 | `readsRange`, `FIXED_DATE_IN_ROW_FILTER`'s loop, `joined`, `eachQuery` at every M rule |
| `packages/core/src/rules/microsoft-bpa/tables.ts` | 3 | `hasQueryField` as a loop; `eachQuery` |
| `packages/core/src/rules/m-helpers.ts` | 3 | `eachQuery` |
| `packages/core/src/rules/types.ts`, `packages/core/src/engine/run.ts` | 3 | `RuleContext.reportError` |
| `packages/core/src/rules/parse-issue.ts` | 4 | TMDL lines through `maskedLine` |
| `packages/core/test/m-budget.test.ts` (new), `packages/core/test/m-limits.test.ts` (new) | 1, 2, 3 | The budget's and the resolver's guards |
| `packages/core/test/m-resolve.test.ts`, `packages/core/test/m-ast.test.ts`, `packages/core/test/m-mask.test.ts`, `packages/core/test/m-read.test.ts` | 2, 4 | Unit tests |
| `tests/fixtures/parse-secrets.SemanticModel/definition/tables/Ledger.tmdl`, `Archive.tmdl` (new) | 4 | The two new leaks, planted |
| The four secret-guard tests and the e2e test | 4 | Four planted values |
| `packages/cli/src/walk.ts`, `packages/cli/test/walk.test.ts` | 5 | The project folder rule |
| `rules/parse-issue.md`, the generated `.data.ts` files | 1, 4 | Quirks |
| `packages/web/content/privacy.md`, `packages/web/content/cli.md` | 5 | "inside the project folder" |
| `SECURITY.md` | 1 | Dependencies and limits |
| The v3 spec, sections 7, 8, 11.5 | 1 to 4 | Dated amendments |
| `~/Projects/pbiplint/pbiplint/.superpowers/sdd/2026-10-13-release-0.3.0/release-notes.md` (local, not committed) | 5 | One line |

---

## Before Task 1

```bash
cd ~/Projects/pbiplint/pbiplint/.claude/worktrees/v3-spec
git switch v3/hardening
git status --short          # expected: only this plan, untracked
pb-worktree-setup
mkdir -p .superpowers/sdd/2026-10-27-v3-hardening
git add docs/superpowers/plans/2026-10-27-v3-hardening.md
git commit -m "docs: the v3 hardening plan

Part of #78.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
npm test 2>&1 | tail -5
npm run check:browser
node .superpowers/sdd/2026-10-13-v3-rules-resolver/bytes.mjs | tail -1
```

Expected: the suite passes; `check:browser` prints `core's own code 230.1 KB`; `bytes.mjs` prints `core's own code 235654 bytes, 230.1 KB`. Write that line into `.superpowers/sdd/2026-10-27-v3-hardening/progress.md` as **the base measurement**. If anything differs, stop and report.

Write `.superpowers/sdd/2026-10-27-v3-hardening/timed.mjs`, the hard time limit every long run goes through:

```js
// Runs a command with a hard time limit, so nothing hangs: node timed.mjs <ms> <command> [args...]
// Prints how it ended and the last of its stderr; its stdout is dropped.
import { spawnSync } from "node:child_process";
const [ms, command, ...args] = process.argv.slice(2);
const started = Date.now();
const r = spawnSync(command, args, {
  timeout: Number(ms),
  killSignal: "SIGKILL",
  stdio: ["ignore", "ignore", "pipe"],
  encoding: "utf8",
  maxBuffer: 1 << 26,
});
console.log(`${r.signal ? `killed (${r.signal})` : `exit ${r.status}`} after ${Date.now() - started} ms`);
process.stdout.write((r.stderr ?? "").slice(-2000));
```

Write `.superpowers/sdd/2026-10-27-v3-hardening/corpus-diff.mts`: a copy of `.superpowers/sdd/2026-10-13-v3-reader/corpus-diff.mts` with one addition right after `models++;`: for each of `before` and `after` whose `summary.ruleErrors` is not empty, print `RULE ERRORS base <model>: <ids>` or `RULE ERRORS head <model>: <ids>` (the model as the script names models, the ids joined with `, `), and at the end `rule errors: <base count> base, <head count> head`. It stays local; only its counts reach public text.

Unpack the base core:

```bash
mktemp -d "$CLAUDE_JOB_DIR/tmp/pr9.XXXX"
```

It prints a path; call it `<base>` and type it out literally. Then:

```bash
git archive 23de9e3 packages/core | tar -x -C <base>
ln -s "$PWD/node_modules" <base>/node_modules
ln -s "$PWD/packages/core/node_modules" <base>/packages/core/node_modules
```

Then run the diff once before any change (the branch is still the base), with its output kept, the form every task uses; it lints the corpus twice and takes minutes, never hours:

```bash
npx --yes tsx .superpowers/sdd/2026-10-27-v3-hardening/corpus-diff.mts <base> ~/Projects/pbiplint/assets/pbip-lint-spike/research-104 > "$CLAUDE_JOB_DIR/tmp/pr9-corpus-diff-0.txt" 2>&1
grep -E "models linted|^[+-][0-9]|ERROR|RULE ERRORS|rule errors:|no finding changed" "$CLAUDE_JOB_DIR/tmp/pr9-corpus-diff-0.txt"
```

Expected: `1321 models linted`, `rule errors: 0 base, 0 head`, `no finding changed`. Write `<base>` and the lines into `progress.md`.

---

### Task 1: The M work budget (items 1 and 7)

**Files:**
- Create: `packages/core/src/m/budget.ts`
- Modify: `packages/core/src/m/read.ts` (`readM` and its doc comment)
- Modify: `rules/parse-issue.md` (Quirks); the generated `.data.ts` files
- Modify: `SECURITY.md`; the v3 spec, sections 7 and 11.5
- Test: `packages/core/test/m-budget.test.ts` (new)

**Interfaces:**
- Produces, in `packages/core/src/m/budget.ts`:
  - `export interface MWork { units: number; depth: number }`
  - `export function mWork(text: string): MWork`
  - `export interface MBudget { query: number; model: number; depth: number }`
  - `export const M_BUDGET: MBudget = { query: 2_000_000, model: 4_000_000, depth: 128 }`
- Produces: `readM(model: Model, files: LintFile[], budget: MBudget = M_BUDGET): Promise<MIndex>`. A query over budget has no `ast`, as a query that does not parse has none, and one `MParseIssue`.

- [ ] **Step 1: Write the failing tests**

Create `packages/core/test/m-budget.test.ts`. Its helper reads one partition, or shared expressions, with `readM` as `m-read.test.ts` does (`readM(buildModel(files.map((f) => parseTmdl(f.path, f.text))), files, budget)`).

```ts
describe("mWork (v3 spec, section 7, amended October 27, 2026)", () => {
  it.each([
    ["1+1", 7, 0],
    ["{1, 2, 3}", 16, 1],
    ['let\n  a = "x, y",\n  b = a & "z"\nin\n  b', 33, 0],
    ["// a, b\n(1)", 9, 1],
    ["f(g(h(1)))", 22, 3],
  ])("counts %j as %i units, nested %i deep", (text, units, depth) => {
    expect(mWork(text)).toEqual({ units, depth });
  });
  it("charges an operator chain by the square of its length", () => {
    expect(mWork(Array(80_000).fill("1").join("+")).units).toBe(26_901_853);
  });
  it("charges a list by the square of its items", () => {
    const list = `{${Array.from({ length: 5000 }, (_, i) => i).join(", ")}}`;
    expect(mWork(list).units).toBe(54_122);
  });
  it("reads a comment as M's lexer does, ending a line comment at U+2028", () => {
    expect(mWork("1 // c\u2028+ 2")).toEqual({ units: 9, depth: 0 });
  });
});

describe("readM's budget (v3 spec, section 7, amended October 27, 2026)", () => {
  it("reports a chain of 80,000 terms as M too large or complex to read, at its first line, unparsed, within 5 seconds", async () => {
    const started = performance.now();
    const m = await readPartition(Array(80_000).fill("1").join("+"));
    expect(performance.now() - started).toBeLessThan(5_000);
    expect(m.queries[0]!.ast).toBeUndefined();
    expect(m.issues).toEqual([
      expect.objectContaining({
        file: "definition/tables/T.tmdl",
        line: 4,
        column: 12,
        reason: "M is too large or complex to read (over pbiplint's limit for one query)",
      }),
    ]);
    expect(m.issues[0]!.text.startsWith("source = 1+1+1")).toBe(true);
    expect(m.issues[0]!.text).toHaveLength(120);
  });
  it("reads M nested 128 brackets deep and reports M nested 129 deep", async () => {
    const nested = (n: number) => `${"(".repeat(n)}1${")".repeat(n)}`;
    expect((await readPartition(nested(128))).issues).toEqual([]);
    expect((await readPartition(nested(129))).issues.map((i) => i.reason)).toEqual([
      "M is too large or complex to read (over pbiplint's limit for one query)",
    ]);
  });
  it("reads a query of exactly the query budget and reports one a unit over", async () => {
    const u = mWork("{1, 2, 3}").units;
    expect((await readPartition("{1, 2, 3}", { query: u, model: u, depth: 128 })).issues).toEqual([]);
    expect(
      (await readPartition("{1, 2, 3}", { query: u - 1, model: u, depth: 128 })).issues,
    ).toHaveLength(1);
  });
  it("stops a model's M at the model's budget, and a query over its own budget uses none of it", async () => {
    const u = mWork("{1, 2, 3}").units;
    const m = await readExpressions(
      [
        "expression A = {1, 2, 3}",
        "expression B = {1, 2, 3}",
        "expression D = {1, 2, 3, 4, 5, 6, 7, 8, 9}",
        "expression C = {1, 2, 3}",
      ].join("\n\n"),
      { query: 2 * u, model: 2 * u, depth: 128 },
    );
    expect(m.queries.map((q) => [q.name, q.ast !== undefined])).toEqual([
      ["A", true],
      ["B", true],
      ["D", false],
      ["C", false],
    ]);
    expect(m.issues.map((i) => i.reason)).toEqual([
      "M is too large or complex to read (over pbiplint's limit for one query)",
      "M is too large or complex to read (over pbiplint's limit for one model's M)",
    ]);
  });
});
```

`readPartition(m, budget?)` writes `table T\n\tpartition T = m\n\t\tmode: import\n\t\tsource = ${m}\n` as `definition/tables/T.tmdl`; `readExpressions(tmdl, budget?)` writes `tmdl` as `definition/expressions.tmdl`. The issue's `text` is the TMDL line's head and the masked M, cut at 120 characters, as for M that does not parse.

- [ ] **Step 2: Run them to make sure they fail**

Run: `node .superpowers/sdd/2026-10-27-v3-hardening/timed.mjs 300000 npx vitest run packages/core/test/m-budget.test.ts`
Expected: FAIL: `budget.ts` does not exist. (Once it does, the 80,000-term test is the one that would hang for about 40 s without the budget, so this run stays under the time limit.) Record it in `progress.md`.

- [ ] **Step 3: Write `mWork` in `packages/core/src/m/budget.ts`**

The algorithm, which the tests pin but do not determine; the doc comments carry the measurements from the Rulings in a line or two each, dated:

```ts
/**
 * M split as the budget counts it: a text literal or quoted name (`""` inside, open to the end),
 * a comment (group 1), a word (2), a line break as M's lexer breaks lines (3), spaces (4), or one
 * other character. A line comment ends at \n, U+2028, or U+2029, as M's lexer ends it.
 */
const SCAN =
  /#?"(?:[^"]|"")*"?|(\/\/[^\n\u2028\u2029]*|\/\*[\s\S]*?(?:\*\/|$))|([\w.@]+)|([\n\u2028\u2029])|([^\S\n\u2028\u2029]+)|[\s\S]/g;
const BREAKS = /[\n\u2028\u2029]/g;
/** The words M reads as operators. */
const WORD_OPERATORS = new Set(["and", "or", "not", "as", "is", "meta"]);

export function mWork(text: string): MWork {
  let tokens = 0, lines = 1, onLine = 0, lineSq = 0, chainSq = 0, commaSq = 0, depth = 0;
  // One entry per open bracket, the outermost for the text itself.
  const open = [{ commas: 0, chain: 0 }];
  const endChain = (g: { chain: number }) => { chainSq += g.chain * g.chain; g.chain = 0; };
  const endLine = () => { lineSq += onLine * onLine; onLine = 0; lines++; };
  for (const [t, comment, word, lineBreak, spaces] of text.matchAll(SCAN)) {
    if (spaces !== undefined) continue;
    if (lineBreak !== undefined) { endLine(); continue; }
    if (comment === undefined) { tokens++; onLine++; }
    if (word !== undefined) { if (WORD_OPERATORS.has(word)) open.at(-1)!.chain++; continue; }
    // A comment, a literal, or a quoted name: only the lines it spans count.
    if (comment !== undefined || t.length > 1) { for (const _ of t.matchAll(BREAKS)) endLine(); continue; }
    const g = open.at(-1)!;
    if ("([{".includes(t)) { open.push({ commas: 0, chain: 0 }); depth = Math.max(depth, open.length - 1); }
    else if (")]}".includes(t)) { const c = open.length > 1 ? open.pop()! : g; endChain(c); commaSq += c.commas * c.commas; c.commas = 0; }
    else if (t === ",") { endChain(g); g.commas++; }
    else if ("+-*/&=<>?".includes(t)) g.chain++;
  }
  lineSq += onLine * onLine;
  for (const g of open) { endChain(g); commaSq += g.commas * g.commas; }
  return {
    depth,
    units: 2 * tokens + lines + Math.floor(text.length / 8) + Math.floor(chainSq / 256) +
      Math.floor(commaSq / 1024) + Math.floor(lineSq / 16384),
  };
}
```

(Prettier lays it out; keep the logic.)

- [ ] **Step 4: Check the budget in `readM` before each parse**

In `packages/core/src/m/read.ts`, `readM` takes `budget: MBudget = M_BUDGET` and keeps a running total of the units of the queries it parsed. In the parse loop, before `parseM`: compute `mWork(q.text)`; when `units > budget.query || depth > budget.depth` the reason is the query one, else when `total + units > budget.model` the model one; with a reason, push an issue at `locate(q, { lineNumber: 0, lineCodeUnit: 0 })` and `continue`; else add `units` to the total and parse. The two reasons:

```ts
const TOO_LARGE = "M is too large or complex to read (over pbiplint's limit for one query)";
const MODEL_TOO_LARGE = "M is too large or complex to read (over pbiplint's limit for one model's M)";
```

Build both kinds of issue with one local function, `issueAt(q, at, reason)`, holding today's masking and cut (the head of the TMDL line, the masked M line, `.trim().slice(0, 120)`); a parse failure calls it with `M could not be parsed: ${maskLiterals(parsed.message)}`. Add a sentence to `readM`'s doc comment: a query over the budget (`budget.ts`, spec 7 amended October 27, 2026) is an issue at its first line and keeps no tree.

Run: `node .superpowers/sdd/2026-10-27-v3-hardening/timed.mjs 300000 npx vitest run packages/core/test/m-budget.test.ts packages/core/test/m-read.test.ts scripts/test/make-big-model.test.mjs`
Expected: `exit 0`, all PASS (the big model is 1,328,152 units, under the model budget).

- [ ] **Step 5: The page, SECURITY.md, and the spec**

In `rules/parse-issue.md`, Quirks, add a first bullet:

```markdown
- M that is too large or too complex to read within pbiplint's limit is reported at the query's first line instead of being parsed, as `M is too large or complex to read (over pbiplint's limit for one query)`, or `for one model's M` when the model's queries together pass it. The limit is counted from the M's text before Microsoft's parser runs, and is set well above the largest query and model in a survey of 1,321 real models, so a query written by hand or by Power BI Desktop stays far under it; a crafted one cannot hold a run up. The M rules then do not read that query, as with M that does not parse.
```

In `SECURITY.md`:
- After the first "In scope" bullet, add: `- M is read within a fixed work limit per query and per model, counted from the text before Microsoft's Power Query parser runs, so a query past it is reported as a PARSE_ISSUE finding instead of parsed. A query under that limit that still hangs the parser, crashes it, or exhausts memory is in scope.`
- Replace the "Not in scope" bullet that begins "Development dependencies that never ship." with: ``- Development dependencies that never ship. The `pbiplint` CLI ships one bundled file and has no runtime dependencies. `@pbiplint/core` has one, Microsoft's Power Query parser (`@microsoft/powerquery-parser`), pinned at exactly 2.0.0; the parser's own two dependencies, `grapheme-splitter` and `performance-now`, use caret ranges, so npm can install a later 1.x or 2.x of either, and the parser declares Node.js 22 or later, so npm warns on Node.js 20. A vulnerability in the parser that pbiplint's use of it reaches is in scope.``

In the spec, section 7, after the last amendment, add:

```markdown
Amended October 27, 2026 (pull request 9, from the pre-release security review): M is read within a work budget. Microsoft's parser is quadratic in some shapes (a chain of `+` or `&`, a long list, many `let` steps or call arguments, many tokens on one line), an unclosed `(` costs memory by the square of its depth, and its own cancellation token counts checks that grow linearly while the time grows quadratically, so it cannot bound them. Before the lexer runs, `mWork` (`packages/core/src/m/budget.ts`) counts a query's work from its text in one linear pass: 2 units a token, 1 a line, 1 per 8 characters, and the squares of each operator chain's length over 256, of each bracket's comma count over 1,024, and of each line's token count over 16,384; and the deepest bracket nesting. A query over 2,000,000 units or nested deeper than 128 brackets, or one that would take the model's parsed M past 4,000,000 units, is not parsed: it is a `PARSE_ISSUE` at its first line (`M is too large or complex to read (over pbiplint's limit for one query)`, or `for one model's M`), and no rule reads it. It is a finding rather than a notice for the reason M that does not parse is one (section 1): the user must hear that a query was not read, and a gated run fails closed. Measured on the corpus: the largest query is 847,457 units, the largest model's M 1,158,354 in 8 queries, the deepest nesting 15; the big model of section 11.5 is 1,328,152. Just under the budget, the slowest shapes parse in about 2.6 s per query on Michael's Mac. Corpus: no finding changes.
```

In section 11.5, after its last paragraph, add:

```markdown
Amended October 27, 2026 (pull request 9): `packages/core/test/m-budget.test.ts` holds the budget to a chain of 80,000 terms (160 KB, 37.6 s in the parser alone), which must be reported within 5 s, as three times CI's time rounded up to the next 5 s; the big model must still be read whole.
```

```bash
npm run build -w @pbiplint/core && node scripts/sync-rule-pages.mjs
npx vitest run packages/core/test/rule-pages.test.ts -t "PARSE_ISSUE"
```

Expected: `wrote 121 summaries ...`; PASS.

- [ ] **Step 6: Measure, the corpus diff, and commit**

```bash
npm run check:browser
node .superpowers/sdd/2026-10-13-v3-rules-resolver/bytes.mjs "m/budget|m/read" 
npx --yes tsx .superpowers/sdd/2026-10-27-v3-hardening/corpus-diff.mts <base> ~/Projects/pbiplint/assets/pbip-lint-spike/research-104 > "$CLAUDE_JOB_DIR/tmp/pr9-corpus-diff-1.txt" 2>&1
grep -E "models linted|^[+-][0-9]|ERROR|RULE ERRORS|rule errors:|no finding changed" "$CLAUDE_JOB_DIR/tmp/pr9-corpus-diff-1.txt"
```

Expected: about 236,700 bytes (231.2 KB); `1321 models linted`, `rule errors: 0 base, 0 head`, `no finding changed`. Any changed finding stops the task: report it. Then:

```bash
npx prettier --write packages/core/src/m/budget.ts packages/core/src/m/read.ts packages/core/test/m-budget.test.ts
npm run lint && npm run typecheck && npm test && npm run check:browser
git add packages/core rules SECURITY.md docs/superpowers/specs packages/cli/src/rule-help.data.ts packages/web/src/results/rule-guidance.data.ts
git commit -m "fix: M is read within a work budget, and a query past it is a PARSE_ISSUE

Microsoft's parser is quadratic in some shapes, and its cancellation token
counts checks that grow linearly, so a linear scan of each query's text
decides first: over 2,000,000 units, deeper than 128 brackets, or past the
model's 4,000,000, a query is reported at its first line and not parsed.
The corpus's largest query is 847,457 units. SECURITY.md names core's one
runtime dependency and these limits.

Part of #78.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: The resolver stays near linear (item 2)

**Files:**
- Modify: `packages/core/src/m/resolve.ts` (`bindingIn`, `resolve`, `origin`, `boundValue`)
- Modify: `packages/core/src/m/ast.ts` (add `nodesWithin`)
- Modify: `packages/core/src/rules/pbiplint/power-query.ts` (`readsRange`, `FIXED_DATE_IN_ROW_FILTER`'s inner loop)
- Modify: the v3 spec, sections 8 and 11.5
- Test: `packages/core/test/m-limits.test.ts` (new), `packages/core/test/m-resolve.test.ts`, `packages/core/test/m-ast.test.ts`

**Interfaces:**
- Produces: `export function nodesWithin(q: MQuery, root: Node, ...kinds: Language.Ast.NodeKind[]): Node[]` in `ast.ts`: `root` and every node below it of the given kinds, in `nodesOfKind`'s order, found by an iterative walk of `childIdsById` from `root`.
- Produces: `origin(m: MIndex, q: MQuery, node: Node): Origin` (the `seen` parameter goes; its one caller, `DYNAMIC_DATA_SOURCE`, passes none). `boundValue` and `resolve` keep their signatures.

- [ ] **Step 1: Write the failing tests**

Create `packages/core/test/m-limits.test.ts` with a helper `chainModel(n)` that returns a model's files: `definition/model.tmdl`; `definition/expressions.tmdl` with `RangeStart` and `RangeEnd` as parameters (`#datetime(2020, 1, 1, 0, 0, 0) meta [IsParameterQuery = true, Type = "DateTime", IsParameterQueryRequired = true]`); and four tables, each one M partition written as Desktop writes a block:

- `Sources`: `s0 = Text.Combine({"https://", "api.example.com"})`, then `s1 = s0` up to `s<n-1>`, then `c0 = Web.Contents(s<n-1>)` up to `c<n-1>`, `in c0` (each call reads the end of the chain; `DYNAMIC_DATA_SOURCE` reports each, `computed`).
- `Ranges`: `t0 = #table({"Date"}, {})`, `r0 = RangeStart`, `r1 = r0` up to `r<n-1>`, then `f0 = Table.SelectRows(t0, each [Date] >= r<n-1> and [Date] < RangeEnd)` up to `f<n-1>`, `in f0`.
- `Filters`: `t0 = #table({"Date", "Id"}, {})`, then `g0 = Table.SelectRows(t0, each [Date] < #date(2020, 1, 1) and [Id] = 0)` up to `g<n-1>` (with `[Id] = <i>`), `in g0` (`FIXED_DATE_IN_ROW_FILTER` reports each date).
- `Options`: `o0 = [Query = "select 1"]`, `o1 = o0` up to `o<n-1>`, `src = Sql.Database("sql.example.com", "Sales", o<n-1>)`, `in src` (`MINIMIZE_POWER_QUERY_TRANSFORMATIONS` reports the partition).

```ts
// The resolver's guard (v3 spec, section 11.5, amended October 27, 2026). The review measured the
// first shape at 0.9 s, 6.5 s, and 46 s for 500, 1,000, and 2,000 steps. The bound is three times
// CI's time rounded up to the next 5 s, CI estimated at 5.3 times Michael's Mac (Node 20, spec
// 11.5); to be confirmed on CI.
const BOUND_MS = 5_000;

describe("the resolver on 2,000 chained steps", () => {
  it(`lints four long chains in under ${BOUND_MS / 1000} seconds, each rule reading them`, async () => {
    const started = performance.now();
    const result = await lint(chainModel(2000), { config: { failOn: "none" } });
    const ms = performance.now() - started;
    const count = (id: string) => result.findings.filter((f) => f.ruleId === id).length;
    expect(result.summary.ruleErrors).toEqual([]);
    expect(count("PARSE_ISSUE")).toBe(0);
    expect(count("DYNAMIC_DATA_SOURCE")).toBe(2000);
    expect(count("FIXED_DATE_IN_ROW_FILTER")).toBe(2000);
    expect(count("MINIMIZE_POWER_QUERY_TRANSFORMATIONS")).toBe(1);
    expect(count("INCREMENTAL_REFRESH_RANGE_BOUNDS")).toBe(0);
    expect(ms).toBeLessThan(BOUND_MS);
  }, 120_000);
});
```

(`Table.SelectRows` is not one of `MINIMIZE_POWER_QUERY_TRANSFORMATIONS`'s transformations, so only `Options` fires it. If a count differs because of a rule's documented exception, set it from the rule's own tests and say why in `progress.md`; the guard is the time and the absence of rule errors.)

In `packages/core/test/m-resolve.test.ts`, `describe("origin")`:

```ts
  it("reads a cycle between steps as unknown, and returns", async () => {
    const { m, q } = await index("let a = b, b = a in Web.Contents(a)");
    const call = calls(q).find((c) => c.name === "Web.Contents")!;
    expect(origin(m, q, call.args[0]!)).toBe("unknown");
  });
  it("gives a step read twice the same origin both times", async () => {
    const { m, q } = await index("let u = Text.From(1), v = u in Web.Contents(u & v)");
    const call = calls(q).find((c) => c.name === "Web.Contents")!;
    expect(origin(m, q, call.args[0]!)).toBe("computed");
  });
```

In `packages/core/test/m-ast.test.ts`:

```ts
  it("nodesWithin finds a node's own descendants of a kind, in text order, and nothing outside it", async () => {
    const q = await parsed('let a = 1 < 2, b = Table.SelectRows(t, each [x] < 3 and [y] = 4) in b');
    const select = calls(q).find((c) => c.name === "Table.SelectRows")!;
    const found = nodesWithin(q, select.args[1]!, Kind.RelationalExpression, Kind.EqualityExpression);
    expect(found.map((n) => n.kind)).toEqual([Kind.RelationalExpression, Kind.EqualityExpression]);
  });
```

(`parsed` is the file's existing helper for one parsed query; use whichever it has.)

- [ ] **Step 2: Run them to make sure they fail**

Run: `node .superpowers/sdd/2026-10-27-v3-hardening/timed.mjs 300000 npx vitest run packages/core/test/m-limits.test.ts packages/core/test/m-ast.test.ts`
Expected: FAIL: the guard times out at 120 s or fails its bound (the review's 46 s for the first chain alone), and `nodesWithin` does not exist. The two `origin` tests may already pass; they pin behavior the memo must keep. Record it in `progress.md`.

- [ ] **Step 3: Index, remember, and walk the condition's own subtree**

In `packages/core/src/m/resolve.ts`:
- `bindingIn` reads a scope's names from `namesOf(scope)`, a `WeakMap<Node, Map<string, Node[]>>` filled on first use with each binding in order: a `let`'s and a record's pairs (`csv.node`) by `identifierName(csv.node.key.literal)`, a function's parameters (`csv.node`) by `identifierName(csv.node.name.literal)`. The first entry `skip` does not refuse is the binding, as `find` gives today.
- `resolve`'s two `m.queries.find` calls read `queriesNamed(m)`, a `WeakMap<MIndex, { shared: Map<string, MQuery[]>; tables: Map<string, MQuery[]> }>` filled on first use in query order; the conditions (`x !== q`, `x.name !== own`) stay as written, applied to the list for the name.
- `origin(m, q, node)` calls `originOf(m, q, node, path)`, with `path` the `Set<Node>` of the nodes being classified above this one. `originOf` returns a remembered answer from `origins`, a `WeakMap<Node, Origin>`; returns `unknown` for a node on `path` (a cycle) and counts that cut in a module-level counter; else adds the node to `path`, classifies it as today (every `origin(..., seen)` call becomes `originOf(..., path)`), removes it, and remembers the answer only when no cut was counted while it was classified, so an answer a cycle shortened is never reused elsewhere. The field-or-item loop keeps its own `Set<Node>` of the containers it followed, so a cycle there still ends the loop with `unknown`.
- `boundValue` follows the chain in its loop as today; it stops early at an identifier whose answer `bound`, a `WeakMap<Node, { node: Node; step?: string }>`, remembers, and takes that answer. Unless a cycle ended the walk, it remembers the final answer for every identifier on the way that resolved to a value: they all stand for the same node, through the same last step.

In `packages/core/src/m/ast.ts`, add `nodesWithin` (Interfaces).

In `packages/core/src/rules/pbiplint/power-query.ts`: `readsRange` becomes `nodesWithin(q, condition, Kind.IdentifierExpression).some((n) => rangeParameterOf(m, q, n) !== undefined)`, and `FIXED_DATE_IN_ROW_FILTER`'s inner loop reads `nodesWithin(q, condition, Kind.RelationalExpression, Kind.EqualityExpression)` and drops its `isWithin` test. Drop `isWithin` from the imports if nothing else uses it.

Run: `node .superpowers/sdd/2026-10-27-v3-hardening/timed.mjs 300000 npx vitest run packages/core/test/m-limits.test.ts packages/core/test/m-resolve.test.ts packages/core/test/m-ast.test.ts packages/core/test/rules-power-query.test.ts packages/core/test/rules-m.test.ts`
Expected: `exit 0`, all PASS. Write the guard's own time (Vitest prints it) into `progress.md`: expected well under 0.3 s on the Mac. **Over 0.31 s**, the bound must be recomputed as 3 × 5.3 × the local time rounded up to the next 5 s: write it into `BOUND_MS` and its comment, and say so in `progress.md`.

- [ ] **Step 4: The spec**

In section 8, after the last amendment, add:

```markdown
Amended October 27, 2026 (pull request 9, from the pre-release security review): the helper stays near linear. Each `let`, record, and function indexes its names, the model's queries are indexed by name, and `origin` and `boundValue` remember each node's answer for the run, so a step that many calls read is followed once. Measured before, through the whole lint: 2,000 steps each naming the one before, read by 2,000 calls, took 46 s. A cycle still reads as `unknown`, and an answer a cycle shortened is not remembered. One change of meaning: a node reached twice in one classification reads the same both times, where it read `unknown` the second time. `readsRange` and `FIXED_DATE_IN_ROW_FILTER` read only the filter condition's own nodes. Corpus: no finding changes.
```

In section 11.5, after Task 1's amendment, add: ``The resolver's guard, `packages/core/test/m-limits.test.ts`, lints four chains of 2,000 steps (a data source, the refresh range, fixed-date filters, a native query's options) within 5 s, three times CI's estimated time rounded up to the next 5 s, to be confirmed on CI.``

- [ ] **Step 5: Measure, the corpus diff, and commit**

As Task 1, Step 6, with `bytes.mjs "m/resolve|m/ast|power-query"` and `pr9-corpus-diff-2.txt`. Expected: about 237,300 bytes (231.7 KB); `1321 models linted`, `rule errors: 0 base, 0 head`, `no finding changed`. Any changed finding stops the task: report it with the rule and the shape (no corpus value). Commit:

```bash
git commit -m "fix: the M name resolver stays near linear on long chains of steps

Each scope's names and the model's queries are indexed, and origin and
boundValue remember each node's answer for the run, so a chain read by many
calls is followed once; the filter rules read only a condition's own nodes.
2,000 chained steps took 46 s and now lint within the guard's 5 s.

Part of #78.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

(after `prettier`, `lint`, `typecheck`, `test`, and `check:browser`, staging `packages/core docs/superpowers/specs`).

---

### Task 3: A deep tree or one query's error leaves the rule running (item 3)

**Files:**
- Modify: `packages/core/src/m/resolve.ts` (`originOf`'s depth)
- Modify: `packages/core/src/rules/pbiplint/power-query.ts` (`joined`; every M rule's query loop)
- Modify: `packages/core/src/rules/microsoft-bpa/tables.ts` (`hasQueryField`; `MINIMIZE_POWER_QUERY_TRANSFORMATIONS`)
- Modify: `packages/core/src/rules/m-helpers.ts` (add `eachQuery`)
- Modify: `packages/core/src/rules/types.ts` (`RuleContext.reportError`), `packages/core/src/engine/run.ts`
- Modify: the v3 spec, section 8
- Test: `packages/core/test/m-limits.test.ts`

**Interfaces:**
- Consumes: Task 2's `originOf(m, q, node, path)`.
- Produces: `RuleContext.reportError?: (message: string) => void`, documented as: records an error the rule caught in one part of its work, so the rest still reports; `runRules` lists each as a `RuleError` with the rule's id.
- Produces: `export function eachQuery(ctx: RuleContext, queries: readonly MQuery[], check: (q: MQuery) => RuleFinding[]): RuleFinding[]` in `m-helpers.ts`: the findings of `check` for each query in order; an error thrown for one query goes to `ctx.reportError` as `${queryLabel(q)}: ${message}` and the next query runs; with no `reportError` the error is thrown, as before, so a test that calls `rule.check` directly still sees it.
- Produces: `MAX_ORIGIN_DEPTH = 500` in `resolve.ts`; deeper reads as `unknown`, counted as a cut (Task 2) so it is not remembered.

- [ ] **Step 1: Write the failing tests**

In `packages/core/test/m-limits.test.ts`, with the file's helpers and `fake(kind, n)`:

```ts
describe("a deep tree in one query (v3 spec, section 8, amended October 27, 2026)", () => {
  it("keeps HARDCODED_SECRET_IN_QUERY running past a header joined from 12,000 parts", async () => {
    // Calls, not literals, so the joined header holds no text that could itself read as a credential.
    const parts = Array.from({ length: 12_000 }, (_, i) => `Text.From(${i})`).join(" & ");
    const result = await lint(model(
      table("Joined", `Web.Contents("https://api.example.com", [Headers = [Authorization = ${parts}]])`),
      table("Keyed", `Web.Contents("https://api.example.com", [Headers = [#"x-api-key" = "${fake("key", "0201")}"]])`),
    ), { config: { failOn: "none" } });
    expect(result.summary.ruleErrors).toEqual([]);
    expect(result.findings.filter((f) => f.ruleId === "HARDCODED_SECRET_IN_QUERY").map((f) => f.objectName)).toEqual(["Keyed"]);
  });
  it("keeps DYNAMIC_DATA_SOURCE running past an address joined from 3,000 calls", async () => {
    const parts = Array.from({ length: 3_000 }, () => "Text.From(1)").join(" & ");
    const result = await lint(model(table("Deep", `Web.Contents(${parts})`)), { config: { failOn: "none" } });
    expect(result.summary.ruleErrors).toEqual([]);
    expect(result.findings.filter((f) => f.ruleId === "DYNAMIC_DATA_SOURCE").map((f) => f.detail)).toEqual([
      "query 'Deep': Web.Contents's address is built by a function call",
    ]);
  });
  it("keeps MINIMIZE_POWER_QUERY_TRANSFORMATIONS running past 12,000 chained options steps", async () => {
    const steps = ['o0 = [Query = "select 1"]', ...Array.from({ length: 11_999 }, (_, i) => `o${i + 1} = o${i}`)];
    const result = await lint(model(table("Native", "let", ...steps.map((s) => `\t${s},`), '\tsrc = Sql.Database("sql.example.com", "Sales", o11999)', "in", "\tsrc")), { config: { failOn: "none" } });
    expect(result.summary.ruleErrors).toEqual([]);
    expect(result.findings.filter((f) => f.ruleId === "MINIMIZE_POWER_QUERY_TRANSFORMATIONS").map((f) => f.objectName)).toEqual(["Native"]);
  });
  it("records one query's error as a rule error naming the query, and keeps the other queries' findings", async () => {
    const result = await lint(model(table("A", "1"), table("B", "2")), { rules: [throwsOnA], config: { failOn: "none" } });
    expect(result.findings.map((f) => f.objectName)).toEqual(["B"]);
    expect(result.summary.ruleErrors).toEqual([{ id: "TEST_EACH_QUERY", message: "query 'A': Maximum call stack size exceeded" }]);
  });
});
```

`model(...tables)` builds the files (`definition/model.tmdl` and one `.tmdl` per table, as `chainModel` does), `table(name, ...lines)` is the Desktop block of `rules-power-query.test.ts`, and `throwsOnA` is a `Rule` written as `PARSE_ISSUE` is (id `TEST_EACH_QUERY`, layer `powerquery`, `needs: ["model"]`) whose `check` is `(_p, ctx) => eachQuery(ctx, ctx.indexes.m.queries, (q) => { if (q.name === "A") throw new RangeError("Maximum call stack size exceeded"); return [finding for q's partition] })`.

- [ ] **Step 2: Run them to make sure they fail**

Run: `node .superpowers/sdd/2026-10-27-v3-hardening/timed.mjs 300000 npx vitest run packages/core/test/m-limits.test.ts -t "deep tree"`
Expected: FAIL: the first three each show their rule in `ruleErrors` with `Maximum call stack size exceeded` and miss the finding; the fourth fails to compile (`eachQuery` does not exist). Record it in `progress.md`.

- [ ] **Step 3: Loops, the cap, and `eachQuery`**

- `joined` becomes a loop over an explicit stack that yields the same parts in the same left-to-right order.
- `hasQueryField` becomes a loop over `(q, n)` with its `seen` set; each branch that recursed now moves `q` and `n` on.
- `originOf` takes `depth: number` (0 at `origin`) and passes `depth + 1` at every call; above `MAX_ORIGIN_DEPTH` it returns `unknown` and counts a cut. Its doc comment says the cap, and that Node overflowed at about 2,000 levels when this was measured.
- `eachQuery` as Interfaces. `runRules` passes `reportError: (message) => result.ruleErrors.push({ id: rule.id, message })` in the context it gives each rule.
- Every M rule's `m.queries.flatMap((q) => ...)` (13 in `power-query.ts`; `PRIVACY_LEVELS_IGNORED` reads no query) becomes `eachQuery(ctx, m.queries, (q) => ...)`, and a filtered list (`FIXED_DATE_IN_ROW_FILTER`, `KEEP_FIRST_ROWS_LEFT_IN`) passes its filtered queries. `MINIMIZE_POWER_QUERY_TRANSFORMATIONS` in `tables.ts` too. `HARDCODED_SECRET_IN_QUERY`'s `reported` set stays outside the loop.

Run: `node .superpowers/sdd/2026-10-27-v3-hardening/timed.mjs 300000 npx vitest run packages/core/test`
Expected: `exit 0`, all PASS.

- [ ] **Step 4: The spec**

In section 8, at the end of Task 2's amendment, add: ``No step of the helper or the rules' own walks recurses without a bound: `origin` follows at most 500 levels, past which a value is `unknown`, as anything deeper than the cycle guard already was, and `&` joins and a native query's options are followed in loops. Each M rule runs per query, so an error in one query is a rule error that names the query (`query 'Sales': ...`), and the rule's findings on the other queries stand. Before, a header joined from 12,000 parts took `HARDCODED_SECRET_IN_QUERY`'s findings off every query of the model.``

- [ ] **Step 5: Measure, the corpus diff, and commit**

As Task 1, Step 6, with `bytes.mjs "m-helpers|m/resolve|power-query|tables|engine/run"` and `pr9-corpus-diff-3.txt`. Expected: about 237,750 bytes (232.2 KB); `1321 models linted`, `rule errors: 0 base, 0 head`, `no finding changed`. Commit:

```bash
git commit -m "fix: a deep M tree or one query's error no longer turns a rule off for the model

joined and hasQueryField loop instead of recursing, origin stops at 500
levels, and each M rule runs per query: an error in one query is a rule
error naming the query, and the other queries' findings stand.

Part of #78.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: A quoted line hides a multi-line literal's every line and a comment's text (items 4, 5, and 6)

**Files:**
- Modify: `packages/core/src/m/mask.ts`
- Modify: `packages/core/src/m/types.ts` (`MIndex.maskedLine`), `packages/core/src/m/read.ts` (`readM`, `emptyMIndex`)
- Modify: `packages/core/src/rules/parse-issue.ts`
- Create: `tests/fixtures/parse-secrets.SemanticModel/definition/tables/Ledger.tmdl`, `Archive.tmdl`
- Modify: `packages/core/test/m-mask.test.ts`, `packages/core/test/m-read.test.ts`, `packages/core/test/secret-masking.test.ts`, `packages/web/test/secret-masking.test.ts`, `packages/cli/test/secret-masking.test.ts`, `packages/cli/test/mcp.test.ts`, `packages/web/e2e/home.spec.ts`; `tests/support/fake-secrets.ts` (its doc comment)
- Modify: `rules/parse-issue.md` (Quirks); the generated `.data.ts` files; the v3 spec, sections 7 and 11.3

**Interfaces:**
- Produces, in `mask.ts`: `export function hiddenLiterals(text: string, options?: { tmdl?: boolean }): Uint8Array` (1 where a code unit is hidden; a line break is never hidden); `export function renderMasked(text: string, hidden: ArrayLike<number>): string` (each run of hidden code units becomes one `…`); `maskLiterals(text, options)` keeps its signature and is `renderMasked(text, hiddenLiterals(text, options))`.
- Produces: `MIndex.maskedLine(file: string, line: number, text: string): string`: `text`, the TMDL file's line `line`, with every code unit hidden that `hiddenLiterals` hides in the whole file (BOM off, line breaks as `parseTmdl` reads them) or in `text` alone, rendered; the whole file's flags computed once per file on first use. When `text` is not that line of the file, or `emptyMIndex()` answers, only the line's own masking applies.

- [ ] **Step 1: Write the failing tests**

In `tests/fixtures/parse-secrets.SemanticModel/definition/tables/`, add (tabs as shown by `\t`, four spaces where the measure is space-indented):

`Ledger.tmdl`:

```
/// A TMDL line that does not parse in the middle of a multi-line text literal holding a made-up password: a measure indented with spaces.
table Ledger
\tlineageTag: 6c0f5a1e-0007-4000-8000-000000000003

    measure 'Legacy Query' = "SELECT 1
    FROM OPENROWSET('SQLNCLI', 'Server=legacy;Uid=sa;Pwd=<FIXTURE_PWD>', 'SELECT 1')
    WHERE 1 = 1"

\tpartition Ledger = m
\t\tmode: import
\t\tsource = #table(type table [Name = text], {{"Ledger"}})
```

`Archive.tmdl`: a copy of `Orders.tmdl` (same columns, tabs, and bracket too many) with `Archive` for `Orders`, lineageTag ending `...000000000004`, its description `/// M that does not parse on a line that ends in a comment holding a made-up key: a bracket too many.`, and its source line:

```
\t\t\t\t\tSource = Web.Contents("https://api.example.com/v1/archive", [Headers = [#"x-api-key" = ApiKey]])), // old key: <FIXTURE_COMMENT_KEY>
```

Then:
- `packages/core/test/secret-masking.test.ts`: the kinds become `["key", "key", "pwd", "token"]`, and the details, in the model's file order, become:

```ts
    expect(parsed.findings.filter((f) => f.ruleId === "PARSE_ISSUE").map((f) => f.detail)).toEqual([
      "space indentation (TMDL requires tabs): measure 'Legacy Query' = \"…",
      "space indentation (TMDL requires tabs): …",
      "space indentation (TMDL requires tabs): …\"",
      "space indentation (TMDL requires tabs): measure 'Service Token' = \"…\"",
      expect.stringMatching(
        /^M could not be parsed: .*: Source = Web\.Contents\("…", \[Headers = \[#"x-api-key" = ApiKey\]\]\)\), \/\/…$/,
      ),
      expect.stringMatching(
        /^M could not be parsed: .*: Source = Web\.Contents\("…", \[Headers = \[#"x-api-key" = "…"\]\]\)\),$/,
      ),
    ]);
```

  and the describe's and tests' "both values" read "every value".
- `packages/web/test/secret-masking.test.ts`, `packages/cli/test/secret-masking.test.ts`, `packages/cli/test/mcp.test.ts`, `packages/web/e2e/home.spec.ts`: each `expect(planted).toHaveLength(2)` becomes `toHaveLength(4)`, and "both values" in a test name "every value".
- `packages/core/test/m-mask.test.ts`: the case `"a quote in a block comment"` now expects `'x = 1 /*…*/, k = "…"'` and `"quoted text in a line comment"` expects `"//…"`. Add:

```ts
    ["a block comment over two lines", "/* a\nb */ c", "/*…\n…*/ c"],
    ["a line comment ended by U+2028", `1 // c\u2028 k = "${fake("key", "0202")}"`, '1 //…\u2028 k = "…"'],
    ["an empty line comment, kept", "x = 1 //", "x = 1 //"],
```

  and, in the TMDL cases: `["a description keeps its words, its quoted text hidden", '\t/// A "quoted" description', '\t/// A "…" description']`.
- `packages/core/test/m-read.test.ts`, a new `describe("MIndex.maskedLine (v3 spec, section 7, amended October 27, 2026)")`:

```ts
  it("hides each line of a multi-line literal, by the whole file and by the line alone", async () => {
    const text = [
      "table T",
      '    measure Q = "SELECT 1',
      `    FROM x WHERE k = '${fake("pwd", "0203")}'`,
      '    AND y = ""say ""hi""',
      '    "',
    ].join("\n");
    const m = await read([{ path: "definition/tables/T.tmdl", text }]);
    const lines = text.split("\n");
    expect([2, 3, 4, 5].map((n) => m.maskedLine("definition/tables/T.tmdl", n, lines[n - 1]!).trim())).toEqual([
      'measure Q = "…',
      "…",
      "…",
      '…"',
    ]);
  });
  it("masks a line by itself when the text is not the file's line", async () => {
    const m = await read([file("table Sales\n")]);
    expect(m.maskedLine("definition/tables/Sales.tmdl", 1, 'x = "a"')).toBe('x = "…"');
  });
```

- [ ] **Step 2: Run them to make sure they fail**

Run: `node .superpowers/sdd/2026-10-27-v3-hardening/timed.mjs 300000 npx vitest run packages/core/test/m-mask.test.ts packages/core/test/m-read.test.ts packages/core/test/secret-masking.test.ts packages/web/test/secret-masking.test.ts`
Expected: FAIL: the guard finds `FIXTURE_PWD` and `FIXTURE_COMMENT_KEY` in every format (named by the guard's `leaks`, which prints the runs it found; do not paste them into `progress.md`, write only "2 values leak in N formats"); the comment and U+2028 cases fail; `maskedLine` does not exist.

- [ ] **Step 3: Flags, a renderer, and the whole file's state**

In `mask.ts`: the two token expressions read a line comment as `\/\/[^\n\u2028\u2029]*`, and the TMDL one reads a `///` description at a line's start (`^[\t ]*\/\/\/[^\n]*`, with the `m` flag) as a token of its own. `hiddenLiterals` marks, per token: a text literal's body (between its quotes, not a `#"..."` name); a comment's text after `//` or between `/*` and `*/` (or to the end when open); in a `///` description, only the text inside each `"..."` (as today). Line breaks are never hidden, so each line of a literal or a block comment renders its own `…`. Update the doc comment of `maskLiterals` to say a comment is hidden whole and a description keeps its words.

In `read.ts`: `readM`'s returned index gains `maskedLine`, using the files it already holds (the same normalization as `lineReader`) and a `Map` of each file's flags and line starts, built on first use. `emptyMIndex()` gains `maskedLine: (_file, _line, text) => maskLiterals(text, { tmdl: true })`.

In `parse-issue.ts`: a TMDL issue's text is `indexes.m.maskedLine(i.file, i.line, i.text)` instead of `maskLiterals(i.text, { tmdl: true })`; update the comment ("hidden wherever the whole file's masking or the line's own would hide it").

In `tests/support/fake-secrets.ts`, `PARSE_SECRETS_FIXTURE`'s doc comment names the four plantings (a key and a key in a comment on M lines, a token and a password on TMDL lines, the password on a multi-line literal's middle line).

Run: `node .superpowers/sdd/2026-10-27-v3-hardening/timed.mjs 600000 npx vitest run`
Expected: `exit 0`, all PASS.

- [ ] **Step 4: The page and the spec**

In `rules/parse-issue.md`, the second paragraph of What it checks: after `show as written.`, add `A comment's text is hidden too, as `//…` or `/*…*/`.` In Quirks, replace the two bullets beginning "A TMDL line that continues" and "A value written outside quotes" with:

```markdown
- A value written outside quotes as a bare word, such as a key typed straight into a formula, is not hidden.
```

In the spec, section 7, after Task 1's amendment, add:

```markdown
Amended October 27, 2026 (pull request 9, from the pre-release security review): a TMDL line is hidden wherever masking the whole file from its first line, or the line alone, would hide it, so each line of a multi-line literal shows `…` and a line that continues one never shows its text; this replaces "A TMDL line is masked by itself". A comment's text is hidden whole, as `//…` or `/*…*/`, so only a value written as a bare word outside quotes is shown; this replaces "A value written outside quotes, in a comment or as a bare word, is not hidden". A TMDL `///` description keeps its words, with its quoted text hidden. A line comment ends where M's lexer ends it, at a line feed, U+2028, or U+2029. The secret guard's second fixture plants a made-up password on a multi-line literal's middle line and a made-up key in a comment (section 11.3). Corpus: 2 `PARSE_ISSUE` details change, each a comment's text now hidden, and no finding is added or removed.
```

In section 11.3, at the end of the pull request 7 amendment, add: ``Amended October 27, 2026 (pull request 9): it plants two more, a made-up password on the middle line of a multi-line literal in a file indented with spaces, and a made-up key in a comment on an M line that does not parse, and every check above holds its outputs to all four.``

Then `npm run build -w @pbiplint/core && node scripts/sync-rule-pages.mjs` and `npx vitest run packages/core/test/rule-pages.test.ts -t "PARSE_ISSUE"`: PASS.

- [ ] **Step 5: Measure, the corpus diff, the browser, and commit**

As Task 1, Step 6, with `bytes.mjs "m/mask|m/read|parse-issue"` and `pr9-corpus-diff-4.txt`. Expected: about 238,250 bytes (232.7 KB); `1321 models linted`, `rule errors: 0 base, 0 head`, `+2 PARSE_ISSUE` and `-2 PARSE_ISSUE`, nothing else. Check the pairs: the same file and line on each side, the head's detail the base's with a comment's text as `//…` or `/*…*/`. Anything else stops the task. Write the counts into `progress.md`. Then:

```bash
npm run build
node .superpowers/sdd/2026-10-27-v3-hardening/timed.mjs 900000 npx playwright test -c packages/web/playwright.config.ts -g "parse-secrets"
```

Expected: `exit 0` (the parse-secrets e2e test in each engine). Commit:

```bash
git commit -m "fix: PARSE_ISSUE hides every line of a multi-line literal, and a comment's text

A TMDL line is hidden wherever masking the whole file or the line alone
would hide it, so a literal's middle line no longer shows; a comment reads
//… or /*…*/, and a line comment ends at U+2028 and U+2029 as M's lexer
ends it. parse-secrets plants both shapes. Corpus: 2 details change.

Part of #78.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

(staging `packages tests rules docs/superpowers/specs`).

---

### Task 5: References are followed only inside the project folder (item 9)

**Files:**
- Modify: `packages/cli/src/walk.ts` (`resolvePbip`, `readNamed`, a new `insideProject`, their doc comments)
- Modify: `packages/cli/test/walk.test.ts`
- Modify: `packages/web/content/privacy.md`, `packages/web/content/cli.md`
- Modify (local, not committed): `~/Projects/pbiplint/pbiplint/.superpowers/sdd/2026-10-13-release-0.3.0/release-notes.md`

**Interfaces:**
- Produces, in `walk.ts` (not exported):
  - `function insideProject(root: string, p: string): boolean`: whether `p` is `root` or below it, comparing `realpathSync.native` of both; when either is not there (`ENOENT`) or the system refuses (`isSystemError`), comparing `resolve`d paths as written. Below means `relative(root, p)` is neither absolute nor `..` nor starts with `..` and a separator.
  - `const OUTSIDE: Unread = { reason: "it is outside the project folder, where references are not followed", says: "is outside the project folder, where references are not followed" }`
  - `const OUTSIDE_MODEL = "the model this report reads is outside the project folder"`

- [ ] **Step 1: Write the failing tests**

In `packages/cli/test/walk.test.ts`, a new `describe("resolveProject follows a reference only inside the project folder", ...)`, with the file's `pbipAt`, `reportAt`, `modelAt`, `tempDir`, and `noLinks`, and:

```ts
  const outside = (path: string) => ({
    kind: "unread-file",
    path,
    message: `${path} is outside the project folder, where references are not followed, so it was not linted`,
  });
  /** A project folder below `top`, its .pbip naming Cost.Report, which reads the model at `byPath`. */
  function project(top: string, byPath: string): string {
    const root = join(top, "Projects");
    mkdirSync(root, { recursive: true });
    pbipAt(join(root, "Cost.pbip"), ["Cost.Report"]);
    reportAt(join(root, "Cost.Report"), { byPath: { path: byPath } });
    modelAt(join(top, "Shared", "X.SemanticModel"), "X");
    return join(root, "Cost.pbip");
  }
  it("does not follow a path that climbs out of the project folder, and says so", () => {
    const p = resolveProject(project(tempDir("refs-up"), "../../Shared/X.SemanticModel"));
    expect(p.model).toBeUndefined();
    expect(p.report).toBeDefined();
    expect(p.absent).toEqual({ model: "the model this report reads is outside the project folder" });
    expect(p.diagnostics).toEqual([outside("../Shared/X.SemanticModel")]);
  });
  it("does not follow an absolute path outside the project folder", () => {
    const top = tempDir("refs-absolute");
    const p = resolveProject(project(top, join(top, "Shared", "X.SemanticModel")));
    expect(p.model).toBeUndefined();
    expect(p.diagnostics).toEqual([outside("../Shared/X.SemanticModel")]);
  });
  it("judges a path written with backslashes as the same path", () => {
    const p = resolveProject(project(tempDir("refs-backslash"), "..\\..\\Shared\\X.SemanticModel"));
    expect(p.diagnostics).toEqual([outside("../Shared/X.SemanticModel")]);
  });
  it.skipIf(noLinks)("does not follow a link inside the project that leads out of it", () => {
    const top = tempDir("refs-link-out");
    const pbip = project(top, "../Linked/X.SemanticModel");
    symlinkSync(join(top, "Shared"), join(top, "Projects", "Linked"));
    const p = resolveProject(pbip);
    expect(p.model).toBeUndefined();
    expect(p.diagnostics).toEqual([outside("Linked/X.SemanticModel")]);
  });
  it.skipIf(noLinks)("still does not follow a link that leads to a folder inside the project", () => {
    const top = tempDir("refs-link-in");
    const pbip = project(top, "../Alias/X.SemanticModel");
    modelAt(join(top, "Projects", "Models", "X.SemanticModel"), "X");
    symlinkSync(join(top, "Projects", "Models"), join(top, "Projects", "Alias"));
    expect(resolveProject(pbip).diagnostics).toEqual([linkNotice("Alias")]);
  });
  it("refuses a .pbip whose report is outside the project folder, naming it", () => {
    const top = tempDir("refs-report");
    mkdirSync(join(top, "Projects"));
    pbipAt(join(top, "Projects", "Cost.pbip"), ["../Other/Cost.Report"]);
    reportAt(join(top, "Other", "Cost.Report"), { byPath: { path: "../Cost.SemanticModel" } });
    expect(() => resolveProject(join(top, "Projects", "Cost.pbip"))).toThrow(
      new Error(`Could not read ${join(top, "Other", "Cost.Report")}: it is outside the project folder, where references are not followed`),
    );
  });
  it.skipIf(noLinks)("reads Desktop's own layout, the model beside the report, under a linked folder", () => {
    const real = tempDir("refs-real");
    const linked = join(tempDir("refs-via"), "repo");
    for (const name of ["Cost"]) {
      pbipAt(join(real, `${name}.pbip`), [`${name}.Report`]);
      modelAt(join(real, `${name}.SemanticModel`), name);
      reportAt(join(real, `${name}.Report`), { byPath: { path: `../${name}.SemanticModel` } });
    }
    symlinkSync(real, linked);
    const p = resolveProject(join(linked, "Cost.pbip"));
    expect(p.model!.root).toBe(join(linked, "Cost.SemanticModel"));
    expect(p.diagnostics).toEqual([]);
  });
```

(`linkNotice` is the helper in the symbolic links describe; lift it to the file's top so both describes use it. In the last test the project folder itself is reached through a link, which the walk follows as it follows the input; if the walk reports `p.model!.root` by the real path instead, assert what it gives today, since that is not this task's change, and say so in `progress.md`.)

Change these existing tests to the new rule, keeping each one's other assertions:
- "follows definition.pbir to a model outside the .pbip's folder": rename to "does not follow definition.pbir to a model outside the .pbip's folder"; expect `p.model` undefined, `p.absent` `{ model: OUTSIDE_MODEL's text }`, and `p.diagnostics` `[outside("../Shared/X.SemanticModel")]`.
- "lints a thin report's .pbip below the folder with the model beside it, or one it follows elsewhere": rename its end to "or names one outside its folder"; for `apart`, expect `q.model` undefined and `q.diagnostics` `[below("reports/Thin.pbip"), outside("../models/Shared.SemanticModel")]`.
- "lints a .pbip whose model sits outside the folder by the .pbip, which follows it": rename to "lints a .pbip found below the folder, and names a model outside its folder"; expect `p.model` undefined and `p.diagnostics` `[below("sub/Thin.pbip"), outside("../../Shared/Shared.SemanticModel")]`.
- "fills each part's unread paths on a .pbip's route, with notices relative to the .pbip's folder": the model moves inside the project, `reportAt(..., { byPath: { path: "../Shared/X.SemanticModel" } })` with `modelAt(join(root, "Shared", "X.SemanticModel"), "X")` and the locked folder `join(root, "Shared", "X.SemanticModel", "definition", "tables")`; the second notice path becomes `"Shared/X.SemanticModel/definition/tables"`.
- "names a link partway along the path a .pbip or a definition.pbir writes, and reads nothing through it": the three links each lead outside the project, so `viaModel` expects `[outside("Shared/X.SemanticModel")]` with `absent.model` the outside reason; `viaReport` expects ``Could not read ${viaReport}/Sub/Cost.Report: it is outside the project folder, where references are not followed``; `above` expects `[outside("../Shared/X.SemanticModel")]` with the outside reason. Rename it to "names a path a .pbip or a definition.pbir writes through a link out of the project as outside it, and reads nothing through it".

- [ ] **Step 2: Run them to make sure they fail**

Run: `npx vitest run packages/cli/test/walk.test.ts`
Expected: FAIL: the new tests other than the two link-inside and linked-folder ones, and the five changed ones, which today read the model or give the link notice. Record it in `progress.md`.

- [ ] **Step 3: Compare the real paths before looking anything up**

In `resolvePbip`, after taking `[reportFolder, written]` and before `folderAt(reportFolder)`: when `!insideProject(folder, reportFolder)`, return `walked(folder, folder, (w) => { unread(w, reportFolder, OUTSIDE); return w.project; })`, which refuses the run naming the folder. In `readNamed`, in the `byPath` branch, before `folderAt(modelFolder)`: when `!insideProject(w.base, modelFolder)`, `unread(w, modelFolder, OUTSIDE)` and `out.absent.model = OUTSIDE_MODEL`, and nothing in it is looked up. Update `resolvePbip`'s and `readNamed`'s doc comments ("wherever each sits" becomes "inside the project folder, the folder that holds the .pbip, by where each really is, so a link that leads out is caught too; a reference outside it is a notice and is not followed"), and `linkOnWay`'s, whose "above" case no longer arises on this route.

Run: `npx vitest run packages/cli/test`
Expected: PASS.

- [ ] **Step 4: The pages and the release notes draft**

In `packages/web/content/privacy.md`, "On the command line": "those in the report or model folder that a `.pbip` file or a report's `definition.pbir` points to" becomes "those in the report or model folder that a `.pbip` file or a report's `definition.pbir` points to inside the project folder". In `packages/web/content/cli.md`, "It reads": "along with the report or model folder a `.pbip` file or a report's `definition.pbir` points to." becomes "along with the report or model folder a `.pbip` file or a report's `definition.pbir` points to inside the project folder, the folder that holds the `.pbip`; a reference that leads outside it, by its path or through a link, is not read, and the run says so in a notice."

Run: `npx vitest run packages/web/test` and `npm run build -w @pbiplint/web`. Expected: PASS and a clean build.

In the release notes draft, "What can change in your results", after the `PARSE_ISSUE` bullets, add:

```markdown
- **The command line follows a reference only inside the project folder,** the folder that holds the `.pbip`. A report that a `.pbip` names, or a model that a report's `definition.pbir` names by path, outside that folder, directly or through a link, is no longer read: the run says so in a notice and lints the rest. A project laid out as Power BI Desktop saves it, with the model beside the report, is unchanged, and so is the site, which reads only the folder you drop.
```

Check it: `perl -CSD -ne 'print "$.: $_" if /\x{2014}/' ~/Projects/pbiplint/pbiplint/.superpowers/sdd/2026-10-13-release-0.3.0/release-notes.md` prints nothing. The entry gets this pull request's number when pb-coord opens it; write `Task 5: release notes need PR 9's number on one entry` into `progress.md`.

- [ ] **Step 5: Commit**

```bash
npx prettier --write packages/cli/src/walk.ts packages/cli/test/walk.test.ts
npm run lint && npm run typecheck && npm test && npm run check:browser
git add packages/cli packages/web/content
git commit -m "feat: the command line follows a reference only inside the project folder

A report a .pbip names and a model a definition.pbir names by path are
read only when their real paths are inside the folder that holds the .pbip;
one outside it, by its path or through a link, is a notice and is not read.
Desktop's own layout is unchanged, and the site reads only the drop.

Part of #78.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: The corpus diff, the proofs of concept, and the whole branch

**Files:** none committed; `progress.md` only.

- [ ] **Step 1: The corpus diff and the bundle**

```bash
npx --yes tsx .superpowers/sdd/2026-10-27-v3-hardening/corpus-diff.mts <base> ~/Projects/pbiplint/assets/pbip-lint-spike/research-104 > "$CLAUDE_JOB_DIR/tmp/pr9-corpus-diff-6.txt" 2>&1
grep -E "models linted|^[+-][0-9]|ERROR|RULE ERRORS|rule errors:" "$CLAUDE_JOB_DIR/tmp/pr9-corpus-diff-6.txt"
node .superpowers/sdd/2026-10-13-v3-rules-resolver/bytes.mjs | tail -1
```

Expected: `1321 models linted`, `rule errors: 0 base, 0 head`, `+2 PARSE_ISSUE` and `-2 PARSE_ISSUE` (Task 4's pairs), nothing else; about 238,250 bytes (232.7 KB), under 245,760. Write both into `progress.md`, with the growth from 235,654 per file (`bytes.mjs` against the base, as pull request 6's plan measured it).

- [ ] **Step 2: The review's proofs of concept through the built CLI (item 8(b))**

```bash
npm run build
node .superpowers/sdd/2026-10-27-v3-hardening/timed.mjs 180000 node packages/cli/dist/pbiplint.mjs /Users/michaelmckinley/.claude/jobs/cb7c83fd/tmp/secreview.YgYt/poc-resolver-cubic.X7wx/chain3000 --format json
node .superpowers/sdd/2026-10-27-v3-hardening/timed.mjs 180000 node packages/cli/dist/pbiplint.mjs /Users/michaelmckinley/.claude/jobs/cb7c83fd/tmp/secreview.YgYt/poc-parser-quadratic.IUjF/plus160k --format json
node packages/cli/dist/pbiplint.mjs /Users/michaelmckinley/.claude/jobs/cb7c83fd/tmp/secreview.YgYt/poc-parser-quadratic.IUjF/plus160k --quiet
```

Expected: the resolver's (3,000 chained steps and 3,000 calls; 151 s and 200 MB before) ends `exit 0` or `exit 1` within a few seconds, not killed; the parser's (a 320 KB chain; 175 s and 1.33 GB before) ends `exit 1` in under 5 s, and its quiet run lists `error PARSE_ISSUE 1`. Write the times into `progress.md`. A run killed at 180 s stops the task.

- [ ] **Step 3: Every check, the browser included**

```bash
npm run lint
npm run typecheck
npm test
npm run check:browser
npm run check:network
npm run check:pack
node .superpowers/sdd/2026-10-27-v3-hardening/timed.mjs 1800000 npm run test:e2e
```

Expected: all pass; the e2e suite in Chromium, Firefox, and WebKit with no retries; the sample's 280 findings do not move. Write each result into `progress.md`, with Vitest's times for `m-budget.test.ts`, `m-limits.test.ts`, and the big model's guard.

---

### Finish

One Opus review of the whole branch (`git diff origin/release/0.3.0...HEAD`) with this plan and spec sections 7, 8, 11.3, and 11.5. Then pb-coord pushes `v3/hardening` and opens a pull request into `release/0.3.0` titled `fix: hardening from the pre-release security review (v3 PR 9)`. Its body lists, counts only:

- **The M work budget:** the unit, the three limits (2,000,000 per query, 4,000,000 per model, 128 brackets), why not the parser's cancellation token or its lexer, the corpus's largest query (847,457) and model (1,158,354), and that a query over budget is a `PARSE_ISSUE`.
- **The resolver:** indexes and memos; the guard's 10 s bound, with CI's time from this run to confirm it.
- **A deep tree:** loops, the 500-level cap, `eachQuery`, and the open question on rule errors and the exit code.
- **Masking:** the whole file or the line alone, comments, U+2028; the corpus's 2 changed details.
- **SECURITY.md**, and item 8(a)'s finding in a sentence.
- **References are followed only inside the project folder:** the rule, the notice, Desktop's layout and the site unchanged, the corpus check (0 of 1 `.pbip` and 0 of 2 `definition.pbir` references outside).
- **The core's own code:** from 230.1 KB to the last measurement.

The body ends with:

```
🤖 Generated with [Claude Code](https://claude.com/claude-code)
```

CI and e2e must be green with no retries; pb-coord posts the guards' CI times as a comment, and then merges.

## For pb-coord

- **The budget's costs.** Under the budget, the slowest quadratic shapes parse in about 2.6 s per query and 5.3 s per model on Michael's Mac (roughly 3 times that on CI's Node 22), a parse error on a very long line costs about 10 s at the query budget (linear, 0.6 µs a character), and the worst shape can hold about 1.3 GB at the model budget. Halving both budgets (1,000,000 and 2,000,000) halves these and leaves 1.2 times room over the corpus's largest query (847,457) and 1.5 times over the big model (1,328,152). This plan uses 2,000,000 and 4,000,000.
- **Rule errors and the exit code** (item 3): stated in the Rulings; no change planned.
- **Item 9 changes what users see** on a `.pbip` whose model sits in a folder above the project (five existing tests assert it is read today); the corpus has none. Three link notices become "outside the project folder", since the real-path test runs first.
- **Not zero in the corpus diff:** items 4 and 5 change 2 `PARSE_ISSUE` details (a comment's text hidden).
- **The release notes draft** lives in home's `.superpowers` folder, which the worktree reaches through its link; Task 5 edits that one file there.

Execution: subagent-driven, one Opus 5.5 subagent per task with a fresh reviewer after each (pb-coord, October 27, 2026).
Task order: 1, 2, 3, 4, 5, then 6; 5 depends on none of 1 to 4 and may run before them.
