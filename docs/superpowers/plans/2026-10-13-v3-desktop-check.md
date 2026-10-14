# v3 Desktop Check Implementation Plan (stopped at the budget)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. **Do not start Task 1 until pb-coord answers "The decision" below.**

**Goal:** Pull request 8 of v3 ([#78](https://github.com/pbiplint/pbiplint/issues/78)): the answers of [Michael's Desktop check of October 13, 2026](https://github.com/pbiplint/pbiplint/issues/78#issuecomment-6158143617). `DYNAMIC_DATA_SOURCE` follows Desktop for an `if` and a custom function's parameter, and `EXTENSION_FILTER_CASE` ships, leaving `.log` alone.

**Architecture:** `origin` (`packages/core/src/m/resolve.ts`) gains two classes, `chosen` and `parameter`, between `unknown` and `computed`; `DYNAMIC_DATA_SOURCE` fires on anything but `static` and `unknown`, and its detail names the class. `EXTENSION_FILTER_CASE` is pull request 6's prototype (`docs/superpowers/plans/2026-10-13-v3-rules-resolver.md`, Task 8) with one exclusion constant.

**Tech Stack:** TypeScript, `@microsoft/powerquery-parser` 2.0.0, Vitest, Playwright, esbuild (`check:browser`).

**Spec:** `docs/superpowers/specs/2026-10-12-pbiplint-v3-power-query-layer-design.md`, sections 3.4, 8, 9.3, 9.10, 10.3, and 11.4.

## Status: the prototype crosses 230 KB

Spec 3.4 says crossing the core's budget stops the work, with no raise. Both changes, built as pb-coord scoped them (the rule and page verbatim from pull request 6's Task 8, plus the `.log` exclusion), measure **230.1 KB** of the core's own code: 235,586 bytes against a limit of 235,520 (230 × 1,024), **66 bytes over**. So this plan stops at the report, the decision it needs, and what the prototype settled.

### The breakdown

Measured in a scratch copy of `v3/desktop-check` at f51666c on October 13, 2026, with `check:browser` and the esbuild metafile (`.superpowers/sdd/2026-10-13-v3-rules-resolver/bytes.mjs`, `bytesInOutput` per input file):

| Input file | Base | Prototype | Added |
| --- | --- | --- | --- |
| `packages/core/src/rules/pbiplint/power-query.ts` | 15,395 | 16,597 | 1,202 |
| `packages/core/src/rules/rule-summaries.data.ts` | 25,535 | 25,752 | 217 |
| `packages/core/src/m/resolve.ts` | 3,602 | 3,676 | 74 |
| Every other file | unchanged | unchanged | 0 |
| **The core's own code** | **234,093 (228.6 KB)** | **235,586 (230.1 KB)** | **1,493** |

By change:

- **The Desktop-check reading of `DYNAMIC_DATA_SOURCE`:** about 174 bytes (`origin`'s two classes, 74; the rule's detail for four classes, about 100: its own source minified alone goes from 981 to 1,081 bytes). Alone it measures 228.8 KB.
- **`EXTENSION_FILTER_CASE`:** about 1,102 bytes of rule code in the bundle (`FILE_LISTING`, `ONE_CASE_EXTENSION`, `listingKeepsCase`, `isExtension`, the rule), plus its 217-byte summary (the page's first paragraph, which `sync-rule-pages.mjs` copies into the core).

### The decision (pb-coord, with Michael)

1. **Ship both with a shorter first paragraph on the new page** (measured): "Filters on a folder's files that compare the `Extension` column with text as written, so `".csv"` misses `B.CSV`." The summary drops to 139 bytes and the total to 235,508 bytes (230.0 KB), **12 bytes under**. It passes, but any later byte in the core crosses, so the next rule of any kind needs the budget question answered first.
2. **Ship the `DYNAMIC_DATA_SOURCE` change only** (228.8 KB, 1.2 KB left) and hold `EXTENSION_FILTER_CASE` for 0.3.x or later, with the release notes' placeholder deleted.
3. **A budget ruling from Michael**, which spec 3.4 reserves to him; this plan does not propose a number.

Nothing else in core is trimmed to make room under any option (spec 3.4).

## Global Constraints

- **Base branch:** `release/0.3.0`, never main. Branch `v3/desktop-check`, cut from `release/0.3.0` at f51666c (pull requests 1 to 7 and the 0.3.0 version bump). Work in the worktree `~/Projects/pbiplint/pbiplint/.claude/worktrees/v3-spec`, never in home (`~/Projects/pbiplint/pbiplint` itself).
- **No em dashes anywhere.** Long-form dates in prose ("October 13, 2026"). Capitalized bullets.
- **Core stays browser-pure:** no Node built-in, no `process.`, no network API in `packages/core/src`.
- **The core budget is 230 KB** (`packages/core/scripts/check-browser-bundle.mjs`, compared in bytes, 235,520). Crossing it stops the work and goes to pb-coord; no raise.
- **Never name or cite any competing Power Query linter or its author**, in code, pages, commits, or the pull request.
- **Counts only from the corpus**, never a corpus path, line, value, or vendor word, in anything committed or posted.
- **Rule pages** in pbiplint's own prose: Power BI Desktop's fix first, then the TMDL line; every quote linked to its section; "When to ignore it" gives judgment only.
- **Generated data:** after any page edit, `npm run build -w @pbiplint/core && node scripts/sync-rule-pages.mjs`, and commit the three `.data.ts` files.
- **Folder inputs in e2e** go through `setFolder` (`packages/web/e2e/folder-input.ts`).
- **The suite stays green at every task:** each task moves the pins it breaks (rule counts in `pack.test.ts` and `generate.test.ts`, the made-up-input counts, README and About counts, shelfmart's expectations, e2e counts). Every commit passes `npm test`, `npm run lint`, `npm run typecheck`, and `npm run check:browser`.
- **Commits** end with `Part of #78.`, a blank line, and `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- **Command rules** (hard rules):
  - Scratch only under `$CLAUDE_JOB_DIR/tmp` (for this plan's writer, `/Users/michaelmckinley/.claude/jobs/cb7c83fd/tmp`), never `/tmp`.
  - Every experiment in a fresh folder from `mktemp -d "$CLAUDE_JOB_DIR/tmp/pr8.XXXX"`, used by its printed literal path.
  - Never `rm -rf` or `rm -r` with a glob or a variable path.
  - No `sudo`, no `git clean`, `git reset --hard`, `git checkout -- .`, `git stash`, or any push.
  - If a command might ask for permission, rewrite it so it cannot. Never wait on a prompt.
  - `gh-pb` for GitHub calls, never `gh auth switch`.

## What the prototype settled

- **Any `if` counts, `if true then` included.** Desktop warned on an `if` whose condition is a parameter and whose branches are both fixed text, and a parameter's value is as knowable as a literal, so Desktop is not evaluating conditions; nothing suggests a literal condition is treated differently. One rule ("an address that is or passes through an `if` is dynamic") is simplest to state on the page and to test, and `if true then` in an address is a shape no real model needs. The condition still adds nothing beyond that (a call in it does not make the address `computed`), and a branch that raises an error no longer keeps the address static.
- **Origin classes, worst last:** `static`, `unknown`, `chosen`, `parameter`, `computed`, `row`. A name `resolve` binds to a function's parameter, and a field of one, is `parameter`; an `IfExpression` is the worst of `chosen` and its branches. Details: `is chosen with if ... then ... else` and `is a custom function's parameter`. An address that is both (a custom function whose path is an `if` over its parameter) reads as the parameter.
- **The `.log` exclusion point** (Michael, October 13, 2026: "Leave .log alone"): one constant beside `FILE_LISTING` in `power-query.ts`, `const ONE_CASE_EXTENSION = /^\.(?:log)$/i;`, tested in the rule's text check (`|| ONE_CASE_EXTENSION.test(text)`). Another extension is one more alternative in that line. Tests: `[Extension] = ".LOG"` is silent, `[Extension] = ".CSV"` fires. The page's Quirks gains "A filter on `".log"`, in any case, is left alone: the programs that write log files, such as a gateway, keep one case for them.", and "When to ignore it" drops its log-file example.
- **m-zoo** gains 3 findings (46 to 49, 14 to 15 rules): `Orders Pending Check`, step `Chosen`, line 15, column 15 (the `if` over `Environment`); `GetPage`, line 34, column 13; and `Sales Files` line 15, column 55 for `EXTENSION_FILTER_CASE`. shelfmart gains its 2 `.csv` filters (`Sample File`, `Weather Data`).
- **Pins that break and move:** in `m-resolve.test.ts`, the two "until the Desktop check" cases, the `if` with a call in its condition, the `if` with an error branch (all now `chosen`), and the field of a function's parameter (now `parameter`); in `rules-power-query.test.ts`, "leaves alone the two shapes awaiting the Desktop check"; `rules-m.test.ts` (m-zoo); `report-parity.test.ts` (shelfmart); `pack.test.ts` (rule count, slugs). No other core test failed (3,131 passed).
- **The corpus diff** (1,321 models, against f51666c): only additions. `DYNAMIC_DATA_SOURCE` +6: 5 custom functions' parameters (two copies of one function whose path is an `if` over its parameter, and three others) and 1 `if` over a model parameter with an error branch. All 6 spot-checked; each is a shape Desktop warns on. `EXTENSION_FILTER_CASE` +54 as written (52 `.log`, 1 `.xlsx`, 1 `.gz`), **+2 with `.log` left alone**.

## Tasks (once the decision allows; each outline becomes full steps then)

1. **Re-measure, then `origin` and `DYNAMIC_DATA_SOURCE` follow Desktop:** the two classes, the detail, the five moved `origin` cases and the rule test, m-zoo's 2 findings, the page's What it checks and Quirks saying what Desktop showed, spec 8 and 9.3 dated with the comment's link; stop with the breakdown if the end projection crosses 230 KB.
2. **`EXTENSION_FILTER_CASE` ships** (option 1 only): pull request 6's rule, tests, and page with the `.log` constant and its two tests, the shortened first paragraph, shelfmart and m-zoo pins, the counts (121 rules, 39 built in, 16 Power Query), spec 9.10 dated (54 as written, 2 after `.log`).
3. **The corpus diff and the whole branch:** +6 and +2 only, spot checks, `npm test`, `npm run test:e2e`, `check:browser`.
4. **The release notes draft** (local, `~/Projects/pbiplint/pbiplint/.superpowers/sdd/2026-10-13-release-0.3.0/release-notes.md`): the placeholder becomes a real entry (or is deleted under option 2), the counts, and the dynamic rule's description; nothing posted.

Execution: subagent-driven, one Opus 5.5 subagent per task with a fresh reviewer after each (pb-coord, October 13, 2026).
Next: pb-coord picks option 1, 2, or 3, and this plan's tasks are then written out in full.
