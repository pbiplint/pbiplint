# v3 Resolver Rules Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Pull request 6 of v3 ([#78](https://github.com/pbiplint/pbiplint/issues/78)): the resolver's full reach. Four built-in Power Query rules that follow names into steps, model parameters, and other queries, `DYNAMIC_DATA_SOURCE`, `HARDCODED_SECRET_IN_QUERY`, `HARDCODED_SERVER_NAME`, and `LEGACY_EXCEL_FILE`, each with its page; the secret guard of spec 11.3 over every output; and, last and conditional on Michael's Desktop check, `EXTENSION_FILTER_CASE`.

**Architecture:** The rules join pull requests 4 and 5's ten in `packages/core/src/rules/pbiplint/power-query.ts` and report through `mFinding`. `DYNAMIC_DATA_SOURCE` is the first rule to use `origin` (`packages/core/src/m/resolve.ts`), which Task 1 teaches to read an `if` by its branches and an `error` as static. The secret rule finds a credential's text literal (in place, in a step, or in a model parameter) and reports on it once, with a detail made only of the rule's words and names from fixed lists, so no output can carry the value. A shared test helper, `tests/support/fake-secrets.ts`, reads m-zoo's made-up credentials, and core, web, CLI, MCP, and e2e tests hold every output to it. m-zoo already holds every fixture shape, so no fixture and no Tabular Editor capture changes.

**Tech Stack:** TypeScript, `@microsoft/powerquery-parser` 2.0.0, Vitest, Playwright, esbuild (`check:browser`).

**Spec:** `docs/superpowers/specs/2026-10-12-pbiplint-v3-power-query-layer-design.md`, sections 3.4, 6, 8, 9.1, 9.3, 9.5, 9.10, 9.14, 9.17, 10.3, 11, and 12.2 item 6. Read 6.3, 8, 9.1, 11.3, and the five rule sections before starting. Pull request 5's plan, `docs/superpowers/plans/2026-10-13-v3-rules-steps.md`, is the pattern this plan follows.

## Where this plan reads the spec narrowly

Every code block, page, test, pin, and count in this plan was run in a scratch copy of the branch on October 13, 2026: the whole suite passed (4,257 tests), lint and typecheck were clean, `check:browser` passed at 229.3 KB of the core's own code with all five rules, and the new e2e test passed in Chromium, Firefox, and WebKit. The rulings below are this plan's. The three marked **(spec change)** need pb-coord's confirmation before the task that makes them (each task's Step 0 says what to drop if pb-coord declines).

- **`origin` reads an `if` by its two branches, and an `error` as static (spec change, Task 1).** Spec 8 says an `if` over static values is static, and its code read the condition too, so a function call in the condition made the address `computed`. On the corpus that is 3 of the rule's 19 findings: two copies of a custom function whose `root = if Text.EndsWith(DataFolder, "\") then DataFolder else DataFolder & "\"`, and one whose `Root = if Text.Trim(DataRoot) = "" then error Error.Record(...) else DataRoot`. Each address is a parameter either way. With the change: 16 findings in 8 models (6 repositories), every one a true positive. Spec 9.3's first Desktop-check shape (an `if` over a parameter) stays `static`, as it was.
- **What counts as a placeholder, and two reads of spec 9.5's shapes (spec change, Task 3).** (1) A scheme word before the token is left off before the length test, any word, not only `Bearer ` and `Basic `: 57 corpus findings are `Authorization = "AfasToken <token>"`, which the spec's research counted. (2) Text with a space left in it after that is prose, not a credential: 2 corpus findings were parameters holding `Enter your ... here`-style text, which spec 9.5's list (`your...` only at the start) missed. (3) A name inside an `&` join is followed as a whole value is, so `Authorization = "Bearer " & Token` reports the step or parameter holding `Token`: 3 corpus findings in 2 models. (4) `OData.Feed`'s second argument is its headers record, so it is read as one, beside the `Headers` field of its third. With all four: 72 findings in 6 models (6 repositories), against 74 in 7 as first written.
- **The guard looks for runs that reach into the distinctive part (spec change, Task 4).** Spec 11.3 checks 8-character runs of the text between `pbiplint-fixture-` and `-notreal`. A leak of `0002-notreal` holds no such run, so the guard checks every 8-character run of the whole value that takes in at least one character of the distinctive part, which is stricter and still never matches the shared prefix or suffix alone. The scratch run proved it: a detail that printed a value's last 14 characters failed 15 guard tests.
- **The secret page's own example value is `pbiplint-fixture-example-0909-notreal`.** The CLI's SARIF output carries each rule's help, which includes the page's Example, so the page's made-up value appears in that output by design. It is not m-zoo's, and its digits are chosen so no 8-character run of it matches a run of m-zoo's six values (which end `0001` to `0006`). The guard reads only m-zoo's values.
- **One finding per literal, for the secret and the legacy workbook.** Spec 9.1 asks for one finding per occurrence at its own place. A credential or a path that several calls read sits at one place, so the rule reports the literal once: for `HARDCODED_SECRET_IN_QUERY` as spec 9.5 says of a parameter, and for `LEGACY_EXCEL_FILE` the same way. The corpus's 8 legacy calls read one parameter's path, so the rule reports 1 finding in 1 model. A literal found twice keeps the first place in this order: a header, a `Query` field, a connection string, a web address's parameter, then a Bearer token anywhere.
- **Details the spec gives one form of.** `DYNAMIC_DATA_SOURCE` names what each function calls its first argument: `path` (`File.Contents`, `Folder.*`), `address` (`Web.Contents`, `OData.Feed`, `SharePoint.*`, `AzureStorage.*`), `connection string` (`Odbc.*`, `OleDb.*`), or `server` (the rest). `HARDCODED_SECRET_IN_QUERY` reads `the Authorization header in Web.Contents holds a credential written into the query (value not shown)` for a literal written in place, and `... reads a credential written here (value not shown)` when the finding is on a step or parameter the call reads; the other places read `the apikey field of the Query record in Web.Contents`, `the api_key parameter of the web address`, `the password in Odbc.DataSource's connection string`, and `the Bearer token`. Every word in a detail comes from the rule or from a name a fixed list matched; no literal is ever interpolated. `HARDCODED_SERVER_NAME` prints `(2 calls in this query)` only when there are two or more. `LEGACY_EXCEL_FILE` names `.xls` or `.xlsb` in lower case.
- **Not read, and said so under Quirks:** an ODBC or OLE DB connection string written as a record; a workbook read from the web; a server or path held by anything but text, a step, or a parameter. `EXTENSION_FILTER_CASE` stops at any `Table.TransformColumns` that names the Extension column, whatever it does to it, and leaves text with no letter (`".7"`) alone.
- **No fixture change.** m-zoo holds every shape the five rules need (checked one by one in each task). Its made-up credentials are six: `pbiplint-fixture-token-0001-notreal` (an `Authorization` header that is also a Bearer token), `key-0002` (a web address's `api_key`), `key-0003` (a `Query` record's `apikey`), `pwd-0004` (an ODBC `Pwd=`), `token-0005` (the `ServiceToken` parameter, read through an `x-api-key` header), and `key-0006` (in a comment, never reported). None is in any capture under `tests/expectations/` (`m-zoo.json`, `te3/m-zoo.json`, `survey/m-zoo.json`), and nothing here changes a capture. `HeaderToken` is both a header and a Bearer token, so m-zoo shows one finding per literal. `ServiceToken` and `ExportFolder` are read once each, so once per parameter is shown by unit tests.
- **The two Desktop-check shapes of spec 9.3 stay unflagged** (an `if` over a parameter is `static`; a custom function's parameter is `unknown`), unless the ledger line Task 2, Step 0 reads says otherwise.
- **No page links a rule before it exists.** `DYNAMIC_DATA_SOURCE`'s page gains its `HARDCODED_SERVER_NAME` bullet in Task 5, and `LOCAL_DRIVE_PATH`'s page gains each new rule's bullet in that rule's task.

## Global Constraints

- **Base branch:** `release/0.3.0`, never main. Branch `v3/rules-resolver`, already cut from `release/0.3.0` at af69278 (pull request 5 merged). Work in the worktree `~/Projects/pbiplint/pbiplint/.claude/worktrees/v3-spec`, never in home (`~/Projects/pbiplint/pbiplint` itself).
- **The rules** (spec 9.1): status `builtin` through `pbiplintRule`; layer `powerquery` (so `needs: ["model"]`); scope `["Partition", "NamedExpression", "Table"]`. Severity and category: `DYNAMIC_DATA_SOURCE` **error (3)**, Error Prevention; `HARDCODED_SECRET_IN_QUERY` **error (3)**, Error Prevention; `HARDCODED_SERVER_NAME` info (1), Maintenance; `LEGACY_EXCEL_FILE` info (1), Error Prevention; `EXTENSION_FILTER_CASE` warning (2), Error Prevention.
- **Names, verbatim:** "Data source the service can't refresh", "Secret written into a query", "Server name written into the query", "Legacy Excel workbook", "File extension filter misses other cases".
- **One finding per occurrence** through `mFinding(m, q, node, what)` (`packages/core/src/rules/m-helpers.ts`), except `HARDCODED_SERVER_NAME`, once per query (spec 9.1), and the secret and legacy workbook rules, once per literal.
- **The secret guard (spec 11.3):** no output may carry any part of a made-up credential's value: not the value, a prefix, a suffix, its length, or a hash of it. A rule's detail is built only from its own words and names a fixed list matched. The guard tests cover core's four formats, the site's rendered results, both downloads and the copy for an AI assistant, the CLI in every format with `--quiet` and `--output`, the MCP server's lint tool, and the site in a real browser.
- **Fixture fake secrets** use the `pbiplint-fixture-<kind>-<nnnn>-notreal` form, which matches no real provider's format (no `sk-`, `ghp_`, `AKIA`, or JWT shape). This plan adds none to any fixture; unit tests and the secret page use values of the same form with numbers from `0101` up and `0909`.
- **No em dashes anywhere** (code, comments, docs, rule pages, commit messages; a hook blocks them and `rule-pages.test.ts` checks pages for U+2014). Restructure with a comma, colon, parentheses, or two sentences.
- **Long-form dates in prose** ("October 13, 2026"), never `2026-10-13`, except in file names and front matter.
- **Capitalized bullets** in every list this plan writes.
- **Rule pages** are pbiplint's own prose, from the template (`CONTRIBUTING.md`, "Rule pages"). The fix route starts in Power BI Desktop's Power Query editor (Transform data, the query, the step in Applied steps), then the TMDL file. No third-party tool is required, never Tabular Editor for the fix, and no Tabular Editor C#. Every quote is linked to its source page, at the section anchor when there is one (each quote and anchor in this plan's pages was checked against the live page on October 13, 2026). "When to ignore it" gives judgment only, with no `pbiplint.ignore` text, and never tells the reader to delete what matters. Each page's `tmdl fires` and `tmdl fixed` examples must parse and fire (`rule-pages.test.ts`). Related rules links go both ways where this plan adds them.
- **Never name or cite any competing Power Query linter or its author**, in code, pages, commits, or the pull request.
- **Fixtures and tests are sanitized:** `example.com` or `*.example` hosts, the `C:\Demo\Data\` convention for paths, no real names or servers.
- **Core stays browser-pure:** no Node built-in, no `process.`, no network API in `packages/core/src`.
- **The core budget is 230 KB** (`packages/core/scripts/check-browser-bundle.mjs`; spec 3.4 says pull request 5 or 6 crossing it stops the work and goes to the coordinator, with no raise). It stands at 220.3 KB. Every task runs `npm run check:browser` and writes its line into `progress.md`. Each rule task compares its measurement with this plan's expected figure and projects the end (see "The budget, task by task" below); if the projection crosses 230 KB, the task stops and reports a measured breakdown. Nothing here changes the budget.
- **The suite stays green at every task.** Each rule task moves every pin its rule breaks: the rule counts in `pack.test.ts` and `generate.test.ts`, the Power Query slug list in `generate.test.ts`, m-zoo's expectations, and the README and About counts (only numbers change); `EXTENSION_FILTER_CASE` also adds shelfmart's native map. The sample (`examples/messy-sales`) gains no finding from any of the five rules, so its counts (280 findings, 19 errors) do not move. Every commit passes `npm test`, `npm run lint`, `npm run typecheck`, and `npm run check:browser`.
- **The corpus diff** (spec 11.4) must show only the new rules' findings, every one an addition, each rule spot-checked for false positives (Task 7, and Task 8 for its rule). For the secret rule the spot check never writes a value anywhere: counts and shapes only.
- **Formatting:** `npx prettier --write` on every changed `.ts`, `.mts`, `.mjs`, and `.json` file outside `tests/fixtures/` and `tests/expectations/` before committing (Markdown, `.tmdl`, and those two folders are Prettier-ignored; keep their JSON as the files write it, which `pin-m-zoo.mjs` does for m-zoo's). Then `npm run lint`.
- **Generated data:** after any rule page edit, `npm run build -w @pbiplint/core && node scripts/sync-rule-pages.mjs`, and commit the three `.data.ts` files it rewrites.
- **Commits:** one or more per task. Each message ends with `Part of #78.`, a blank line, and `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Never write a closing keyword next to an issue number.
- **Subagents** run on Opus 5.5 and share the worktree, so one edits files at a time.
- **Command rules** (pb-coord, October 13, 2026; a previous plan writer stalled for hours on a permission prompt). These are hard rules:
  - Scratch space only under the executing session's job folder, `$CLAUDE_JOB_DIR/tmp` (for this plan's writer, `/Users/michaelmckinley/.claude/jobs/cb7c83fd/tmp`). Never use `/tmp`.
  - For any experiment, make a fresh folder with `mktemp -d "$CLAUDE_JOB_DIR/tmp/pr6.XXXX"` and work inside it by its printed literal path (shell variables do not survive between tool calls). Never run `rm -rf` or `rm -r` with a glob or a variable path; never `cd` somewhere and delete with `*`. Leaving scratch folders behind is fine.
  - No `sudo`, no deleting outside the worktree or that job folder, no `git clean`, `git reset --hard`, `git checkout -- .`, `git stash`, or any push (the Finish section's one push is pb-coord's, after review).
  - If a command might ask for permission, rewrite it so it cannot. Never wait on a prompt.
- **The plan's workspace** is `.superpowers/sdd/2026-10-13-v3-rules-resolver/` (git-ignored; `.superpowers` is a symlink into home's copy, so scripts there import the worktree's code by `process.cwd()`, never by a relative path). The reader plan's `corpus-diff.mts` is reused from `.superpowers/sdd/2026-10-13-v3-reader/`.
- **Folder inputs in e2e** go through `setFolder` from `packages/web/e2e/folder-input.ts`, never `setInputFiles` on a directory.
- **The corpus** (`~/Projects/pbiplint/assets/pbip-lint-spike/research-104`) is not pbiplint's: the pull request carries counts only, never a corpus path, line, or value.

## The budget, task by task

Measured in the scratch run with `check:browser` (the core's own code; KB is 1,024 bytes):

| After | Core's own code | Added | Where the bytes go |
| --- | --- | --- | --- |
| The base (af69278) | 220.3 KB | | |
| Task 1 (`origin`) | 220.3 KB | 0 | `origin` is still unused, so esbuild drops it |
| Task 2 (`DYNAMIC_DATA_SOURCE`) | 223.3 KB | 3.0 KB | `origin` and its helpers in `resolve.ts`, now live (1.8 KB); the rule (0.9 KB); its summary (0.3 KB) |
| Task 3 (`HARDCODED_SECRET_IN_QUERY`) | 226.4 KB | 3.2 KB | The rule and its readers of headers, fields, addresses, and connection strings (2.9 KB); its summary (0.3 KB) |
| Task 4 (the guard) | 226.4 KB | 0 | Tests only |
| Task 5 (`HARDCODED_SERVER_NAME`) | 227.3 KB | 0.8 KB | |
| Task 6 (`LEGACY_EXCEL_FILE`) | 228.1 KB | 0.8 KB | |
| Task 8 (`EXTENSION_FILTER_CASE`, if it ships) | 229.3 KB | 1.3 KB | |

That leaves 0.7 KB of the 230 KB with all five rules, and 1.9 KB without `EXTENSION_FILTER_CASE`. The rate spec 3.4 assumed (1.10 KB a rule) did not hold: pull request 5 spent 1.56 KB a rule, and this one spends 1.84, since `origin` (written in pull request 2, unused until now) lands here.

**The check each rule task makes** (Tasks 2, 3, 5, 6, and 8, at their measuring step): read the `check:browser` line, then

- **Projection** = the measurement + the "Added" figures of the rule tasks still to come in the table (after Task 2: 3.2 + 0.8 + 0.8 + 1.3 = 6.1 KB; after Task 3: 2.9 KB; after Task 5: 2.1 KB; after Task 6: 1.3 KB; after Task 8: 0).
- **Stop** if the projection is over 230.0 KB, or if the measurement is more than 0.3 KB over this plan's figure for the task. Do not commit; write the breakdown below into `progress.md` and report to pb-coord. Nothing in this plan raises the budget or trims other code to make room.
- **The breakdown** (the scripts are made in "Before Task 1"):
  1. `node .superpowers/sdd/2026-10-13-v3-rules-resolver/bytes.mjs > "$CLAUDE_JOB_DIR/tmp/pr6-bytes-head.txt"` in the worktree, and the same in the base copy (`mktemp -d "$CLAUDE_JOB_DIR/tmp/pr6.XXXX"`, then `git archive origin/release/0.3.0 | tar -x -C <base>`, `ln -s "$PWD/node_modules" <base>/node_modules`, `ln -s "$PWD/packages/core/node_modules" <base>/packages/core/node_modules`, and from `<base>`: `node <worktree>/.superpowers/sdd/2026-10-13-v3-rules-resolver/bytes.mjs > "$CLAUDE_JOB_DIR/tmp/pr6-bytes-base.txt"`). Each lists every input file's bytes in the core's own code.
  2. `diff "$CLAUDE_JOB_DIR/tmp/pr6-bytes-base.txt" "$CLAUDE_JOB_DIR/tmp/pr6-bytes-head.txt"`: the files that grew, by how much. Expect `packages/core/src/rules/pbiplint/power-query.ts` (the rules), `packages/core/src/m/resolve.ts` (`origin`, live from Task 2), and `packages/core/src/rules/rule-summaries.data.ts` (the pages' first paragraphs).
  3. Per rule: `node .superpowers/sdd/2026-10-13-v3-rules-resolver/minsize.mjs "const DATA_SOURCE =" "interface HeldText" "const SERVER_CONNECTOR =" "export const LEGACY_EXCEL_FILE" "const FILE_LISTING =" "export const powerQueryRules"` (pass only the markers of the rules present) prints each rule's own source minified alone. The scratch run printed 981, 3,150, 732, 721, and 1,231 bytes for the five, in that order.
  4. Per summary: the length of each new rule's entry in `rule-summaries.data.ts` (`grep -A1 "<RULE_ID>:" packages/core/src/rules/rule-summaries.data.ts | tail -1 | wc -c`).

## Review Focus

- **A credential that only a name points at.** `Authorization = "Bearer " & Token` with `Token` a step, and an `x-api-key` header read from a parameter that two queries share, must each report the text once, on the step or the parameter, with a detail that says the header reads a credential written there. Task 3 pins both.
- **Text in a credential's place that holds none.** `<your key>`, `Bearer {token}`, `xxxxxxxxxxxx`, `YOUR_API_KEY`, `Enter your key here`, `***` in a connection string, `ApiKeyName`, and a key in a comment must not fire. Task 3 pins all of them.
- **An address whose `if` only chooses.** A function call in an `if`'s condition, or a branch that raises an error, must leave a static address static, while a branch that is computed or read from the rows still reports. Task 1 pins all four.
- **A server that is not text.** A server from a parameter, from a call, and `SapHana.Database` (not on spec 9.14's list) must not fire; a server held by a step must, once per query with the count. Task 5 pins them.
- **An extension filter after a step on the column.** A `Table.TransformColumns` on the Extension column before the filter, a comparison through `Text.Lower` or `Comparer.OrdinalIgnoreCase`, and a listing from another source must not fire; `<>`, the text first, an upper-case extension, and steps between must. Task 8 pins them.

## File Structure

| File | Task | Responsibility |
| --- | --- | --- |
| `packages/core/src/m/resolve.ts` | 1 | `origin` reads an `if` by its branches and an `error` as static |
| `packages/core/test/m-resolve.test.ts` | 1 | Four `origin` cases |
| `packages/core/src/rules/pbiplint/power-query.ts` | 2, 3, 5, 6, 8 | The five rules, appended to `powerQueryRules` |
| `packages/core/test/rules-power-query.test.ts` | 2, 3, 5, 6, 8 | Each rule's unit tests |
| `rules/dynamic-data-source.md`, `rules/hardcoded-secret-in-query.md`, `rules/hardcoded-server-name.md`, `rules/legacy-excel-file.md`, `rules/extension-filter-case.md` (new) | 2, 3, 5, 6, 8 | The pages |
| `rules/local-drive-path.md`, `rules/odbc-where-connector-exists.md`, `rules/excel-use-headers.md` | 2, 3, 5, 6, 8 | Related rules back-links |
| `packages/core/src/rules/rule-summaries.data.ts`, `packages/cli/src/rule-help.data.ts`, `packages/web/src/results/rule-guidance.data.ts` (generated) | 2, 3, 5, 6, 8 | Regenerated from the pages |
| `tests/expectations/pbiplint/m-zoo.json` | 2, 3, 5, 6, 8 | m-zoo's pinned findings |
| `tests/expectations/shelfmart.report.json` | 8 | `EXTENSION_FILTER_CASE` in the `native` map |
| `packages/core/test/pack.test.ts`, `packages/web/test/generate.test.ts`, `README.md`, `packages/cli/README.md`, `packages/core/README.md`, `packages/web/content/about.md` | 2, 3, 5, 6, 8 | The counts' numbers, 116 rules to 121 (or 120) |
| `tests/support/fake-secrets.ts` (new) | 4 | m-zoo's made-up credentials, and the test for a leak |
| `packages/core/test/secret-masking.test.ts`, `packages/web/test/secret-masking.test.ts`, `packages/cli/test/secret-masking.test.ts` (new); `packages/cli/test/mcp.test.ts`; `packages/web/e2e/home.spec.ts` | 4 | The secret guard |
| The v3 spec, sections 8, 9.5, 9.10, 9.17, and 11.3 | 1, 3, 4, 6, 8 | One dated bullet or sentence each |
| `.superpowers/sdd/2026-10-13-v3-rules-resolver/` `bytes.mjs`, `minsize.mjs`, `pin-m-zoo.mjs`, `rule-counts.mts` (not committed) | Before 1, 7 | Measuring, pinning, counting |

---

## Before Task 1

```bash
cd ~/Projects/pbiplint/pbiplint/.claude/worktrees/v3-spec
git fetch origin
git switch v3/rules-resolver
git status --short          # expected: only this plan, untracked
pb-worktree-setup
mkdir -p .superpowers/sdd/2026-10-13-v3-rules-resolver
git add docs/superpowers/plans/2026-10-13-v3-rules-resolver.md
git commit -m "docs: the v3 resolver rules plan

Part of #78.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

Create the three scripts the tasks use (not committed). `.superpowers/sdd/2026-10-13-v3-rules-resolver/bytes.mjs`:

```js
// The core's own code per input file, from the build check:browser runs (esbuild's metafile,
// bytesInOutput), largest first, with the total check:browser prints. Imports the worktree's code
// by the working directory, since .superpowers links into another checkout.
// Usage, from the repository root: node <this file> [regex to filter the files listed]
import { createRequire } from "node:module";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const root = process.cwd();
const { build } = createRequire(join(root, "package.json"))("esbuild");
const { mParserEsbuild } = await import(
  pathToFileURL(join(root, "packages/core/build/m-parser-build.mjs")).href
);
const result = await build({
  entryPoints: [join(root, "packages/core/src/index.ts")],
  bundle: true,
  platform: "browser",
  format: "esm",
  minify: true,
  write: false,
  metafile: true,
  plugins: [mParserEsbuild],
  logLevel: "silent",
});
// The same split check-browser-bundle.mjs makes: the parser and its two dependencies apart.
const PARSER =
  /node_modules[\\/](?:@microsoft[\\/]powerquery-parser|grapheme-splitter)[\\/]|^pbiplint-performance-now:/;
const [output] = Object.values(result.metafile.outputs);
const rows = Object.entries(output.inputs)
  .filter(([path]) => !PARSER.test(path))
  .map(([path, input]) => [input.bytesInOutput, path])
  .sort((a, b) => b[0] - a[0]);
const filter = process.argv[2] ? new RegExp(process.argv[2]) : undefined;
for (const [bytes, path] of rows.filter(([, path]) => !filter || filter.test(path)))
  console.log(String(bytes).padStart(8), path);
const total = rows.reduce((sum, [bytes]) => sum + bytes, 0);
console.log(`core's own code ${total} bytes, ${(total / 1024).toFixed(1)} KB`);
```

`.superpowers/sdd/2026-10-13-v3-rules-resolver/minsize.mjs`:

```js
// The minified size of each rule's own source in power-query.ts: the file split at the line that
// starts each block named on the command line (the first line of the block's first comment or
// constant), each part minified alone. A rough per-rule figure beside bytes.mjs's per-file one.
// Usage, from the repository root: node <this file> "<first line of block 1>" "<first line of block 2>" ...
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";

const { transform } = createRequire(join(process.cwd(), "package.json"))("esbuild");
const text = readFileSync("packages/core/src/rules/pbiplint/power-query.ts", "utf8");
const marks = process.argv.slice(2);
const parts = [];
let current = { name: "(before the first block)", lines: [] };
for (const line of text.split("\n")) {
  const mark = marks.find((m) => line.startsWith(m));
  if (mark) {
    parts.push(current);
    current = { name: mark, lines: [] };
  }
  current.lines.push(line);
}
parts.push(current);
for (const part of parts) {
  const { code } = await transform(part.lines.join("\n"), { loader: "ts", minify: true });
  console.log(String(code.length).padStart(8), part.name);
}
```

`.superpowers/sdd/2026-10-13-v3-rules-resolver/pin-m-zoo.mjs`:

```js
// Adds findings to tests/expectations/pbiplint/m-zoo.json and rewrites it as it is written: the
// rules sorted, the findings in place order (file, line, column, rule), one finding per line.
// Usage, from the repository root: node <this file> <file holding a JSON array of findings>
import { readFileSync, writeFileSync } from "node:fs";

const path = "tests/expectations/pbiplint/m-zoo.json";
const doc = JSON.parse(readFileSync(path, "utf8"));
const added = process.argv[2] ? JSON.parse(readFileSync(process.argv[2], "utf8")) : [];
const findings = [...doc.findings, ...added];
const cmp = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
findings.sort(
  (a, b) =>
    cmp(a.file, b.file) || a.line - b.line || (a.column ?? 0) - (b.column ?? 0) || cmp(a.rule, b.rule),
);
const rules = [...new Set([...doc.rules, ...added.map((f) => f.rule)])].sort();
const line = (f) =>
  "    { " +
  Object.entries(f)
    .map(([k, v]) => `${JSON.stringify(k)}: ${JSON.stringify(v)}`)
    .join(", ") +
  " }";
writeFileSync(
  path,
  `{\n  "fixture": ${JSON.stringify(doc.fixture)},\n  "about": ${JSON.stringify(doc.about)},\n  "rules": [${rules.map((r) => JSON.stringify(r)).join(", ")}],\n  "findings": [\n${findings.map(line).join(",\n")}\n  ]\n}\n`,
);
console.log(`${added.length} added, ${findings.length} findings, ${rules.length} rules`);
```

Then:

```bash
node .superpowers/sdd/2026-10-13-v3-rules-resolver/pin-m-zoo.mjs && git diff --exit-code tests/expectations/pbiplint/m-zoo.json && echo "pin-m-zoo rewrites m-zoo.json byte for byte"
npm test 2>&1 | tail -5
npm run check:browser
node .superpowers/sdd/2026-10-13-v3-rules-resolver/bytes.mjs power-query
```

Expected: the pin script reports `0 added, 36 findings, 10 rules` and leaves the file unchanged; the suite passes on the base (about 4,124 tests); `check:browser` prints `core's own code 220.3 KB, the M parser 375.9 KB`; `bytes.mjs` prints `power-query.ts` at 10,160 bytes and `core's own code 225602 bytes, 220.3 KB`. Write the `check:browser` line into `.superpowers/sdd/2026-10-13-v3-rules-resolver/progress.md` as **the base measurement**. If anything differs, stop and report.

**Ledger lines pb-coord writes into `progress.md`** (the tasks read them; none is needed before Task 1):

- `Ruling (pb-coord): spec changes of PR 6: <accepted | declined: list>`, for the three rulings marked (spec change) above (Tasks 1, 3, 4).
- `Desktop check (dynamic shapes): if over a parameter <static | dynamic>; custom function's parameter <static | dynamic>` (Task 2).
- `Desktop check (Extension case): <keeps case | lowercases>` (Task 8).

---

### Task 1: `origin` reads an `if` by its branches, and an `error` as static

**Files:**
- Modify: `packages/core/src/m/resolve.ts` (`origin`, the `switch`)
- Modify: `docs/superpowers/specs/2026-10-12-pbiplint-v3-power-query-layer-design.md` (section 8)
- Test: `packages/core/test/m-resolve.test.ts` (`describe("origin")`)

**Interfaces:**
- Consumes: `origin(m: MIndex, q: MQuery, node: Node, seen?: Set<string>): Origin` and its `worst` helper, both in `m/resolve.ts` from pull request 2.
- Produces: no new name; `origin` of an `IfExpression` is the worst of its `trueExpression` and `falseExpression`, and of an `ErrorRaisingExpression` is `"static"`.

- [ ] **Step 0: The ruling**

Read `progress.md` for the line `Ruling (pb-coord): spec changes of PR 6`. If it is missing, ask pb-coord and wait for the line. If it declines the `origin` change, skip this task (commit nothing); Task 2's corpus count is then 19 findings in 11 models (8 repositories), and Task 7 says why 3 of them are false positives.

- [ ] **Step 1: Write the failing tests**

In `packages/core/test/m-resolve.test.ts`, in `describe("origin")`, add these four cases to the `cases` array, just before `["a cycle", "let a = b, b = a in Web.Contents(a)", "unknown"],`:

```ts
    [
      "if whose condition calls a function, between static branches",
      'Web.Contents(if Text.EndsWith(ApiBase, "/") then ApiBase else ApiBase & "/")',
      "static",
    ],
    [
      "if with a branch that raises an error",
      'Web.Contents(if ApiBase = "" then error Error.Record("Missing", "Set ApiBase") else ApiBase)',
      "static",
    ],
    [
      "if with a branch built by a function call",
      'Web.Contents(if Environment = "Prod" then ApiBase else Text.Lower(ApiBase))',
      "computed",
    ],
    [
      "if with a branch read from the rows",
      'Table.AddColumn(S, "c", each Web.Contents(if [u] = null then ApiBase else [u]))',
      "row",
    ],
```

- [ ] **Step 2: Run them to make sure they fail**

Run: `npx vitest run packages/core/test/m-resolve.test.ts`
Expected: FAIL on the first two cases, `expected 'computed' to be 'static'`; the last two pass already.

- [ ] **Step 3: Read the branches**

In `packages/core/src/m/resolve.ts`, in `origin`'s `switch`, after the `case Kind.LetExpression:` line and its `return`, add:

```ts
    // The condition only chooses: the value is one of the two branches.
    case Kind.IfExpression:
      return worst([
        origin(m, q, node.trueExpression, seen),
        origin(m, q, node.falseExpression, seen),
      ]);
    // An error stops the query, so it reaches no source.
    case Kind.ErrorRaisingExpression:
      return "static";
```

and in the doc comment above `origin`, replace its last sentence, ` * Each node is followed once, so a cycle reads as unknown.`, with:

```ts
 * An `if` is read by its two branches, since its condition only chooses, and an `error` is static,
 * since it reaches no source. Each node is followed once, so a cycle reads as unknown.
```

- [ ] **Step 4: The spec**

In the spec, section 8, after the paragraph that starts "Order: `static` < `unknown`", add:

```markdown
Amended October 13, 2026 (the coordinator's decision, pull request 6, from the corpus spot check): an `if ... then ... else` is read by its two branches only, since its condition chooses between them and builds neither, and an `error` expression is `static`, since it stops the query before any source is read. As first written, a function call in the condition made the value `computed`, which reported 3 custom functions whose address is a parameter either way (`if Text.EndsWith(DataFolder, "\") then DataFolder else DataFolder & "\"`, and an `error` when a parameter is empty). `DYNAMIC_DATA_SOURCE`'s corpus count was 19 findings in 11 models (8 repositories) as written, and is 16 in 8 models (6 repositories) after. An `if` over a parameter stays `static`, pending the Desktop check (section 9.3).
```

(If pb-coord's ruling line carries another date, use that date.)

- [ ] **Step 5: Run the tests and measure**

```bash
npx vitest run packages/core/test
npm run typecheck
npm run check:browser
```

Expected: PASS; `check:browser` unchanged at 220.3 KB (nothing calls `origin` yet). Write its line into `progress.md` under Task 1.

- [ ] **Step 6: Commit**

```bash
npx prettier --write packages/core/src/m/resolve.ts packages/core/test/m-resolve.test.ts
npm run lint
git add packages/core docs/superpowers/specs/2026-10-12-pbiplint-v3-power-query-layer-design.md
git commit -m "feat: origin reads an if by its branches and an error as static

The condition of an if only chooses between its branches, and an error
reaches no source, so neither makes an address computed. The corpus
showed 3 custom functions whose address is a parameter either way
reported as dynamic (spec 8, amended).

Part of #78.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: `DYNAMIC_DATA_SOURCE` and its page

**Files:**
- Modify: `packages/core/src/rules/pbiplint/power-query.ts`
- Create: `rules/dynamic-data-source.md`
- Modify: `rules/local-drive-path.md` (Related rules)
- Modify (generated): the three `.data.ts` files
- Modify: `tests/expectations/pbiplint/m-zoo.json`
- Modify: `packages/core/test/pack.test.ts`, `packages/web/test/generate.test.ts`, `README.md`, `packages/cli/README.md`, `packages/core/README.md`, `packages/web/content/about.md` (counts)
- Test: `packages/core/test/rules-power-query.test.ts`

**Interfaces:**
- Consumes: `origin` (Task 1), `calls`, `mFinding`, `pbiplintRule`.
- Produces: `export const DYNAMIC_DATA_SOURCE: Rule`, appended to `powerQueryRules`; the module-level `DATA_SOURCE` regex in `power-query.ts`.

- [ ] **Step 0: The Desktop check**

Read `progress.md` for the line `Desktop check (dynamic shapes):`. If it is missing, or says `static` for both, go on: both shapes stay unflagged. If it says `dynamic` for either, stop before writing anything and report to pb-coord: moving a shape to `computed` or `row` changes `origin`, m-zoo's pins, the page, and spec 9.3, which is a decision for pb-coord.

- [ ] **Step 1: Write the failing tests**

In `packages/core/test/rules-power-query.test.ts`, the import from `../src/rules/pbiplint/power-query.js` gains `DYNAMIC_DATA_SOURCE` (in alphabetical place, after `DEFAULT_STEP_NAMES`). Add at the end of the file:

```ts
describe("DYNAMIC_DATA_SOURCE (v3 spec, section 9.3)", () => {
  const rule = DYNAMIC_DATA_SOURCE;
  const base =
    'expression ApiBase = "https://api.example.com" meta [IsParameterQuery = true, Type = "Text", IsParameterQueryRequired = true]\n\nexpression DataFolder = "C:\\Demo\\Data\\" meta [IsParameterQuery = true, Type = "Text", IsParameterQueryRequired = true]\n\n';
  it("is a built-in Power Query error on a query's owner", () => {
    isPowerQueryRule(rule, 3, "Error Prevention");
    expect(rule.name).toBe("Data source the service can't refresh");
    expect(rule.scope).toEqual(["Partition", "NamedExpression", "Table"]);
  });
  it("reports an address read from the rows, on the call", async () => {
    const tmdl = table(
      "Orders",
      "let",
      '\tSource = #table(type table [url = text], {{"https://api.example.com/v1/orders/1"}}),',
      '\t#"Added Custom" = Table.AddColumn(Source, "Body", each Web.Contents([url]))',
      "in",
      '\t#"Added Custom"',
    );
    expect(await mFindings(rule, tmdl)).toEqual([
      {
        objectType: "Partition",
        objectName: "Orders",
        location: { file: "inline.tmdl", line: 7, column: 61 },
        detail: "query 'Orders', step 'Added Custom': Web.Contents's address is read from the rows",
      },
    ]);
  });
  it("reports an address built by a function call, naming what each function calls its address", async () => {
    const tmdl =
      base +
      table(
        "Orders",
        "let",
        '\tBuilt = File.Contents(Text.Combine({DataFolder, "orders.csv"})),',
        "\tListed = Folder.Files(Text.Lower(DataFolder)),",
        '\tServer = Sql.Database(Text.Upper("sql.example"), "Warehouse"),',
        '\tOdbc = Odbc.DataSource(Text.Combine({"dsn=", "Sales"})),',
        '\tWeb = Web.Contents(Uri.Combine(ApiBase, "v1"))',
        "in",
        "\tWeb",
      );
    expect((await mFindings(rule, tmdl)).map((f) => f.detail)).toEqual([
      "query 'Orders', step 'Built': File.Contents's path is built by a function call",
      "query 'Orders', step 'Listed': Folder.Files's path is built by a function call",
      "query 'Orders', step 'Server': Sql.Database's server is built by a function call",
      "query 'Orders', step 'Odbc': Odbc.DataSource's connection string is built by a function call",
      "query 'Orders', step 'Web': Web.Contents's address is built by a function call",
    ]);
  });
  it("leaves alone literals, parameters, joins of them, steps that hold them, and RelativePath and Query", async () => {
    const tmdl =
      base +
      table(
        "Orders",
        "let",
        '\tArchive = "C:\\Demo\\Data\\orders.csv",',
        "\tNested = let Inner = let Read = File.Contents(Archive) in Read in Inner,",
        '\tJoined = Web.Contents(ApiBase & "/v1/orders"),',
        '\tRelative = Web.Contents(ApiBase, [RelativePath = "v1/orders/" & Text.From(1), Query = [page = Text.From(2)]]),',
        '\tFolder = Folder.Files(DataFolder & "Sales")',
        "in",
        "\tFolder",
      );
    expect(await mFindings(rule, tmdl)).toEqual([]);
  });
  it("leaves alone the two shapes awaiting the Desktop check: if over a parameter, and a function's parameter", async () => {
    const tmdl =
      base +
      "expression GetPage = (address as text) => Web.Contents(address)\n\n" +
      table(
        "Orders",
        "let",
        '\tAddress = if ApiBase = "" then "https://test.example.com" else ApiBase,',
        "\tChosen = Web.Contents(Address),",
        '\tThroughFunction = GetPage("https://api.example.com/v1/customers")',
        "in",
        "\tThroughFunction",
      );
    expect(await mFindings(rule, tmdl)).toEqual([]);
  });
  it("leaves alone a function that is not a data source, and an address it cannot follow", async () => {
    const tmdl = table(
      "Orders",
      "let",
      '\tSource = Json.Document(Text.Combine({"{", "}"})),',
      "\tUnknown = Web.Contents(Nowhere)",
      "in",
      "\tUnknown",
    );
    expect(await mFindings(rule, tmdl)).toEqual([]);
  });
});
```

The column 61 is where `Web.Contents` starts on line 7: five tabs, then `#"Added Custom" = Table.AddColumn(Source, "Body", each ` (55 characters).

- [ ] **Step 2: Run them to make sure they fail**

Run: `npx vitest run packages/core/test/rules-power-query.test.ts -t DYNAMIC`
Expected: FAIL: `DYNAMIC_DATA_SOURCE` is not exported.

- [ ] **Step 3: Write the rule**

In `packages/core/src/rules/pbiplint/power-query.ts`, the resolver import becomes:

```ts
import { boundValue, origin, resolve } from "../../m/resolve.js";
```

Add after `DEFAULT_STEP_NAMES` (before the `powerQueryRules` doc comment):

```ts
/**
 * The functions whose first argument is the address of a data source (v3 spec, section 9.3), and
 * what each calls it: a path, an address, a connection string, or a server.
 */
const DATA_SOURCE =
  /^(?:(File\.Contents|Folder\.(?:Files|Contents))|(Web\.Contents|OData\.Feed|SharePoint\.(?:Files|Contents|Tables)|AzureStorage\.(?:Blobs|DataLake))|((?:Odbc|OleDb)\.(?:DataSource|Query))|Sql\.Databases?|Oracle\.Database|PostgreSQL\.Database|MySQL\.Database|Snowflake\.Databases|AnalysisServices\.Databases?|Databricks\.Catalogs|DB2\.Database|Teradata\.Database|SapHana\.Database)$/;

// A data source whose address is read from the rows or built by a function call cannot refresh in
// the service (v3 spec, section 9.3). Only the first argument is read, so Web.Contents' RelativePath
// and Query options, Microsoft's route for a dynamic request to a static address, are left alone,
// as are literals, parameters, joins of them, and a custom function's parameter.
export const DYNAMIC_DATA_SOURCE = pbiplintRule({
  id: "DYNAMIC_DATA_SOURCE",
  name: "Data source the service can't refresh",
  category: "Error Prevention",
  severity: 3,
  scope: ["Partition", "NamedExpression", "Table"],
  layer: "powerquery",
  check: (_project, { indexes: { m } }) =>
    m.queries.flatMap((q) =>
      calls(q).flatMap((c) => {
        const source = DATA_SOURCE.exec(c.name);
        const o = source && c.args[0] ? origin(m, q, c.args[0]) : "static";
        if (o !== "row" && o !== "computed") return [];
        const noun = source![1]
          ? "path"
          : source![2]
            ? "address"
            : source![3]
              ? "connection string"
              : "server";
        const how = o === "row" ? "is read from the rows" : "is built by a function call";
        return [mFinding(m, q, c.node, `${c.name}'s ${noun} ${how}`)];
      }),
    ),
});
```

and `powerQueryRules` gains `DYNAMIC_DATA_SOURCE,` after `DEFAULT_STEP_NAMES,`.

Run: `npx vitest run packages/core/test/rules-power-query.test.ts`
Expected: PASS.

- [ ] **Step 4: Write the page**

Create `rules/dynamic-data-source.md`:

````markdown
---
id: DYNAMIC_DATA_SOURCE
name: "Data source the service can't refresh"
category: Error Prevention
severity: error
scope: [Partition, NamedExpression, Table]
status: builtin
layer: powerquery
video:
sources:
---

# Data source the service can't refresh

## What it checks

Data sources whose address is read from a table's rows or built by a function call: a call such as `Web.Contents`, `File.Contents`, or `Sql.Database` whose first argument the Power BI service cannot know before the query runs.

Each finding names the partition, the shared expression, or, for an incremental refresh policy's own query, the table. Its detail names the query and the step, then the function and where its address comes from, as `query 'Orders', step 'Added Custom': Web.Contents's address is read from the rows`. The location is the line and column of the call in the TMDL file.

## Example

```tmdl fires
table Orders
	column Body
		dataType: binary
		summarizeBy: none
		sourceColumn: Body

	partition Orders = m
		mode: import
		source =
				let
					Source = #table(type table [url = text], {{"https://api.example.com/v1/orders/1"}, {"https://api.example.com/v1/orders/2"}}),
					#"Added Custom" = Table.AddColumn(Source, "Body", each Web.Contents([url]))
				in
					#"Added Custom"
```

```tmdl fixed
table Orders
	column Body
		dataType: binary
		summarizeBy: none
		sourceColumn: Body

	partition Orders = m
		mode: import
		source =
				let
					Source = #table(type table [id = number], {{1}, {2}}),
					#"Added Custom" = Table.AddColumn(Source, "Body", each Web.Contents("https://api.example.com", [RelativePath = "v1/orders/" & Text.From([id])]))
				in
					#"Added Custom"
```

## Why it matters

Microsoft defines the term: "A *dynamic data source* is a data source in which some or all of the information required to connect can't be determined until Power Query runs its query, because the data is generated in code or returned from another data source." And it says what follows: "In most cases, Power BI semantic models that use dynamic data sources can't be refreshed in the Power BI service. There are a few exceptions in which dynamic data sources can be refreshed in the Power BI service, such as when using the RelativePath and Query options with the Web.Contents M function. Queries that reference Power Query parameters can also be refreshed." ([Refresh and dynamic data sources](https://learn.microsoft.com/power-bi/connect-data/refresh-data#refresh-and-dynamic-data-sources)). The query works in Power BI Desktop, so the problem shows only after publishing, when the model's refresh in the service fails and its reports go on showing old data.

## How to fix it

In Power BI Desktop, choose Transform data, then Data source settings, and select Data sources in current file. Microsoft's own check is to "look for the warning message" there ([Refresh and dynamic data sources](https://learn.microsoft.com/power-bi/connect-data/refresh-data#refresh-and-dynamic-data-sources)). Then select the query, and the step the finding names in Applied steps.

- For a web source, keep the first argument of `Web.Contents` a fixed address or a parameter, and move the part that changes into its `RelativePath` and `Query` options in the formula bar, as the fixed example does. Microsoft's reference says of them: "These options can be used to dynamically query a static base URL." ([Web.Contents, Example 1](https://learn.microsoft.com/powerquery-m/web-contents#example-1)).
- For files and folders, point the source at a parameter (Home, Manage Parameters) holding the path, or read the whole folder once with the Folder or SharePoint folder connector and combine its files, rather than opening one path per row.
- For a database, read the server and database from parameters rather than from another query's data.

In the TMDL file, the call is in the partition's `source` block.

## When to ignore it

A model that is never published, or never refreshed in the service, can build its addresses however it likes. If Data source settings shows no warning for the source, the service can work it out after all, and the finding can go.

## Quirks

- Only the first argument, the address, is read. `Web.Contents`' `RelativePath` and `Query` options are left alone whatever they hold, since they are Microsoft's route for a request that changes.
- An address held by a parameter, a fixed text, a step that holds one, or text joined with `&` from those, is left alone, however deeply the steps nest.
- An address chosen with `if ... then ... else` between fixed texts or parameters is left alone, and so is a branch that raises an error. A function call in the condition alone does not count.
- An address that is a custom function's own parameter is left alone, since the query that calls the function decides it. A name nothing in the model defines is left alone too.
- Each call is its own finding.
- A query whose M does not parse is not read; it gets a `PARSE_ISSUE` finding instead.

## Related rules

- `LOCAL_DRIVE_PATH` reports a fixed path on a local drive; this rule reports a path built at run time.

## Links

- [Web.Contents](https://learn.microsoft.com/powerquery-m/web-contents)
- [Using parameters](https://learn.microsoft.com/power-query/power-query-query-parameters)
````

The quotes are verbatim from the live pages (checked October 13, 2026). In `rules/local-drive-path.md`, add a last bullet under Related rules:

```markdown
- `DYNAMIC_DATA_SOURCE` reports a path built at run time, from the rows or by a function call, which the service cannot refresh at all.
```

- [ ] **Step 5: Regenerate the data files and run the pages' tests**

```bash
npm run build -w @pbiplint/core && node scripts/sync-rule-pages.mjs
npx vitest run packages/core/test/rule-pages.test.ts -t "DYNAMIC_DATA_SOURCE|LOCAL_DRIVE_PATH"
```

Expected: PASS, including "shows an example the engine flags and a fix it accepts".

- [ ] **Step 6: Pin the rule's findings on m-zoo**

Spec 9.3's fixture shapes are all in m-zoo: `Orders Web` (`each Web.Contents([url])`, row, fires), and in `Orders Files` the `Text.Combine` path (computed, fires), the literal two scopes up, `ApiBase & "/v1/orders"`, and `RelativePath` (none fires); `Orders Pending Check` and `GetPage` hold the two Desktop-check shapes (neither fires). Write the two findings into `.superpowers/sdd/2026-10-13-v3-rules-resolver/pin-dynamic.json`:

```json
[
  {
    "rule": "DYNAMIC_DATA_SOURCE",
    "objectType": "Partition",
    "object": "Orders Files",
    "file": "definition/tables/Orders Files.tmdl",
    "line": 14,
    "column": 14,
    "detail": "query 'Orders Files', step 'Built': File.Contents's path is built by a function call"
  },
  {
    "rule": "DYNAMIC_DATA_SOURCE",
    "objectType": "Partition",
    "object": "Orders Web",
    "file": "definition/tables/Orders Web.tmdl",
    "line": 15,
    "column": 61,
    "detail": "query 'Orders Web', step 'Added Custom': Web.Contents's address is read from the rows"
  }
]
```

Then:

```bash
node .superpowers/sdd/2026-10-13-v3-rules-resolver/pin-m-zoo.mjs .superpowers/sdd/2026-10-13-v3-rules-resolver/pin-dynamic.json
git diff --stat tests/expectations/pbiplint/m-zoo.json
npx vitest run packages/core/test/rules-m.test.ts
```

Expected: `2 added, 38 findings, 11 rules`; the diff adds two lines and changes the `"rules"` line; the test passes. If a finding differs, stop: compare it with the fixture line before changing anything, and report it. No other committed fixture with M fires this rule.

- [ ] **Step 7: Move the counts by one rule**

117 rules, 35 built into pbiplint, 12 Power Query rules, 11 of them pbiplint's own:

```bash
perl -pi -e 's/toBe\(116\)/toBe(117)/' packages/core/test/pack.test.ts
perl -pi -e 's/toBe\(116\)/toBe(117)/g; s/6 \+ 116\b/6 + 117/; s/"and 35 built into pbiplint\."/"and 36 built into pbiplint."/; s/"117 rules: 66/"118 rules: 66/; s/"116 rules: 66/"117 rules: 66/; s/and 34 built into pbiplint\./and 35 built into pbiplint./g; s/"90 rules: 66/"91 rules: 66/; s/and 19 built into pbiplint\./and 20 built into pbiplint./' packages/web/test/generate.test.ts
perl -0pi -e 's/\b11(\s+)rules/12$1rules/g; s/Power Query rules, 11 of them/Power Query rules, 12 of them/g; s/\b10 of them pbiplint/11 of them pbiplint/g; s/\b10 of pbiplint/11 of pbiplint/g; s/\b116(\s+)rules in all, 34 of/117$1rules in all, 35 of/g' README.md packages/cli/README.md packages/core/README.md packages/web/content/about.md
git diff --stat
```

In `packages/web/test/generate.test.ts`, add `"dynamic-data-source",` to the sorted Power Query slug list, after `"default-step-names",`. Check the prose with `git diff README.md packages/cli/README.md packages/core/README.md packages/web/content/about.md`: only the numbers in the count sentences changed (the root README twice, once each elsewhere).

- [ ] **Step 8: Run what this task touches, and measure**

```bash
npx vitest run packages/core/test packages/web/test packages/cli/test
npm run typecheck
npm run check:browser
```

Expected: PASS, every test; `check:browser` at about 223.3 KB. Write its line into `progress.md` under Task 2, with the projection (the measurement + 6.1 KB, about 229.4 KB). If the projection is over 230.0 KB, or the measurement is over 223.6 KB, stop, take the breakdown ("The budget, task by task"), and report to pb-coord.

- [ ] **Step 9: Commit**

```bash
npx prettier --write packages/core/src/rules/pbiplint/power-query.ts packages/core/test/rules-power-query.test.ts packages/core/src/rules/rule-summaries.data.ts packages/cli/src/rule-help.data.ts packages/web/src/results/rule-guidance.data.ts packages/core/test/pack.test.ts packages/web/test/generate.test.ts
npm run lint
git add packages rules README.md tests/expectations/pbiplint/m-zoo.json
git commit -m "feat: DYNAMIC_DATA_SOURCE reports an address the service cannot know

A data source call whose first argument is read from the rows or built
by a function call is an error: the published model cannot refresh, and
only rewriting the query fixes it. Literals, parameters, joins of them,
RelativePath and Query, and the two shapes awaiting the Desktop check
are left alone. 117 rules, 35 built in.

Part of #78.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: `HARDCODED_SECRET_IN_QUERY` and its page

**Files:**
- Modify: `packages/core/src/rules/pbiplint/power-query.ts`
- Create: `rules/hardcoded-secret-in-query.md`
- Modify: `rules/odbc-where-connector-exists.md` (Related rules)
- Modify (generated): the three `.data.ts` files
- Modify: `tests/expectations/pbiplint/m-zoo.json`
- Modify: `docs/superpowers/specs/2026-10-12-pbiplint-v3-power-query-layer-design.md` (section 9.5)
- Modify: the counts' files, as in Task 2
- Test: `packages/core/test/rules-power-query.test.ts`

**Interfaces:**
- Consumes: `boundValue`, `resolve` (`m/resolve.ts`); `calls`, `identifierName`, `textLiterals`, `textValue`, `unwrap` (`m/ast.ts`); `mFinding`; `pbiplintRule`.
- Produces: `export const HARDCODED_SECRET_IN_QUERY: Rule`, appended to `powerQueryRules`; the module-level `HeldText` interface and `heldText(m: MIndex, q: MQuery, node: Node): HeldText | undefined` in `power-query.ts`, which Task 6 reuses (a text literal written in place, held by a `let` step, or held by a model parameter, with the query it sits in).

- [ ] **Step 0: The ruling**

Read the `Ruling (pb-coord): spec changes of PR 6` line. If it declines the placeholder change, take `&& !/\s/.test(v)` out of `isCredential` and write `.replace(/^(bearer|basic) /i, "")` in place of `.replace(/^\S+ (?=\S+$)/, "")` in Step 3, drop the `E` line (`Enter your key here`) from the "leaves alone" test, and skip the spec bullet's first two points; the corpus count is then 74 findings in 7 models (Task 7 explains the 2 extra). Declined join-following: in `heldTexts`, delete the `for (const p of parts)` loop, drop the `Orders` table from the "follows a name" test, and expect only the `ServiceToken` finding. Declined `OData.Feed` headers: drop the `...(c.name === "OData.Feed" ? recordFields(m, q, c.args[1]) : []),` line and the `FeedHeaders` step and its expected detail from the tests.

- [ ] **Step 1: Write the failing tests**

In `packages/core/test/rules-power-query.test.ts`, the rule import gains `HARDCODED_SECRET_IN_QUERY` (in alphabetical place, after `FIXED_DATE_IN_ROW_FILTER`). Add at the end of the file:

```ts
describe("HARDCODED_SECRET_IN_QUERY (v3 spec, sections 9.5 and 11.3)", () => {
  const rule = HARDCODED_SECRET_IN_QUERY;
  /** A model parameter holding text, as Desktop writes one. */
  const parameter = (name: string, value: string): string =>
    `expression ${name} = "${value}" meta [IsParameterQuery = true, Type = "Text", IsParameterQueryRequired = true]\n\n`;
  it("is a built-in Power Query error on a query's owner", () => {
    isPowerQueryRule(rule, 3, "Error Prevention");
    expect(rule.name).toBe("Secret written into a query");
    expect(rule.scope).toEqual(["Partition", "NamedExpression", "Table"]);
  });
  it("reports an Authorization header on its text, once, though it is a Bearer token too", async () => {
    const tmdl = table(
      "Orders API",
      "let",
      '\tSource = Web.Contents("https://api.example.com/v1/orders", [Headers = [Authorization = "Bearer pbiplint-fixture-token-0101-notreal"]])',
      "in",
      "\tSource",
    );
    expect(await mFindings(rule, tmdl)).toEqual([
      {
        objectType: "Partition",
        objectName: "Orders API",
        location: { file: "inline.tmdl", line: 6, column: 93 },
        detail:
          "query 'Orders API', step 'Source': the Authorization header in Web.Contents holds a credential written into the query (value not shown)",
      },
    ]);
  });
  it("reads every place spec 9.5 names, with names in any case", async () => {
    const tmdl = table(
      "Orders API",
      "let",
      '\tHeader = Web.Contents("https://api.example.com/v1", [Headers = [#"X-API-Key" = "pbiplint-fixture-key-0102-notreal"]]),',
      '\tField = Web.Contents("https://api.example.com/v1", [Query = [access_token = "pbiplint-fixture-token-0103-notreal"]]),',
      '\tAddress = Web.Contents("https://api.example.com/v1?format=json&Sig=pbiplint-fixture-sig-0104-notreal"),',
      '\tFeedHeaders = OData.Feed("https://odata.example.com", [#"Ocp-Apim-Subscription-Key" = "pbiplint-fixture-key-0105-notreal"]),',
      '\tFeedOptions = OData.Feed("https://odata.example.com", null, [Headers = [#"x-functions-key" = "pbiplint-fixture-key-0106-notreal"]]),',
      '\tToken = "Bearer pbiplint-fixture-token-0107-notreal",',
      '\tConnection = OleDb.DataSource("Provider=SQLOLEDB;Data Source=sql.example;User ID=reader;Password={pbiplint-fixture-pwd-0108-notreal}")',
      "in",
      "\tConnection",
    );
    expect((await mFindings(rule, tmdl)).map((f) => f.detail)).toEqual([
      "query 'Orders API', step 'Header': the X-API-Key header in Web.Contents holds a credential written into the query (value not shown)",
      "query 'Orders API', step 'Field': the access_token field of the Query record in Web.Contents holds a credential written into the query (value not shown)",
      "query 'Orders API', step 'FeedHeaders': the Ocp-Apim-Subscription-Key header in OData.Feed holds a credential written into the query (value not shown)",
      "query 'Orders API', step 'FeedOptions': the x-functions-key header in OData.Feed holds a credential written into the query (value not shown)",
      "query 'Orders API', step 'Connection': the password in OleDb.DataSource's connection string holds a credential written into the query (value not shown)",
      "query 'Orders API', step 'Address': the sig parameter of the web address holds a credential written into the query (value not shown)",
      "query 'Orders API', step 'Token': the Bearer token holds a credential written into the query (value not shown)",
    ]);
  });
  it("follows a name to the step or parameter that holds the text, and reports a parameter once however many queries read it", async () => {
    const tmdl =
      parameter("ServiceToken", "pbiplint-fixture-token-0109-notreal") +
      table(
        "Customers",
        "let",
        '\tSource = Web.Contents("https://api.example.com/v1/customers", [Headers = [#"x-api-key" = ServiceToken]])',
        "in",
        "\tSource",
      ) +
      table(
        "Orders",
        "let",
        '\tKey = "pbiplint-fixture-key-0110-notreal",',
        '\tSource = Web.Contents("https://api.example.com/v1/orders", [Headers = [Authorization = "Bearer " & Key, #"x-api-key" = ServiceToken]])',
        "in",
        "\tSource",
      );
    expect(await mFindings(rule, tmdl)).toEqual([
      {
        objectType: "NamedExpression",
        objectName: "ServiceToken",
        location: { file: "inline.tmdl", line: 1, column: 27 },
        detail:
          "query 'ServiceToken': the x-api-key header in Web.Contents reads a credential written here (value not shown)",
      },
      {
        objectType: "Partition",
        objectName: "Orders",
        location: { file: "inline.tmdl", line: 17, column: 12 },
        detail:
          "query 'Orders', step 'Key': the Authorization header in Web.Contents reads a credential written here (value not shown)",
      },
    ]);
  });
  it("leaves alone placeholders, short values, prose, ApiKeyName, comments, and other headers and fields", async () => {
    const tmdl = table(
      "Orders API",
      "let",
      "\t// The old key was pbiplint-fixture-key-0111-notreal.",
      '\tA = Web.Contents("https://api.example.com/v1", [Headers = [Authorization = "<your key>"]]),',
      '\tB = Web.Contents("https://api.example.com/v1", [Headers = [Authorization = "Bearer {token}"]]),',
      '\tC = Web.Contents("https://api.example.com/v1", [Headers = [#"x-api-key" = "xxxxxxxxxxxx"]]),',
      '\tD = Web.Contents("https://api.example.com/v1", [Headers = [#"x-api-key" = "YOUR_API_KEY"]]),',
      '\tE = Web.Contents("https://api.example.com/v1", [Query = [key = "Enter your key here"]]),',
      '\tF = Web.Contents("https://api.example.com/v1", [Query = [token = "short"]]),',
      '\tG = Web.Contents("https://api.example.com/v1", [ApiKeyName = "api_key"]),',
      '\tH = Web.Contents("https://api.example.com/v1", [Headers = [Accept = "application/json; charset=utf-8"], Query = [page = "pbiplint-fixture-page-0112-notreal"]]),',
      '\tI = Web.Contents("https://api.example.com/v1?api_key=&format=json"),',
      '\tJ = Odbc.DataSource("dsn=Sales;Pwd=***", [HierarchicalNavigation = true]),',
      '\tK = Web.Contents("https://api.example.com/v1", [Headers = [Authorization = "Bearer " & Text.From(Number.Random())]])',
      "in",
      "\tK",
    );
    expect(await mFindings(rule, tmdl)).toEqual([]);
  });
  it("writes no part of a value into a detail: only the rule's words and M's own names", async () => {
    const tmdl =
      parameter("ServiceToken", "pbiplint-fixture-token-0113-notreal") +
      table(
        "Orders API",
        "let",
        '\tSource = Web.Contents("https://api.example.com/v1?api_key=pbiplint-fixture-key-0114-notreal", [Headers = [#"x-api-key" = ServiceToken]])',
        "in",
        "\tSource",
      );
    const details = (await mFindings(rule, tmdl)).map((f) => f.detail ?? "");
    expect(details).toHaveLength(2);
    for (const d of details) expect(d).not.toMatch(/fixture|notreal|0113|0114/);
  });
});
```

Every value is made up, in the `pbiplint-fixture-<kind>-<nnnn>-notreal` form. The column 93 is where the Authorization header's text starts on line 6.

- [ ] **Step 2: Run them to make sure they fail**

Run: `npx vitest run packages/core/test/rules-power-query.test.ts -t HARDCODED_SECRET`
Expected: FAIL: `HARDCODED_SECRET_IN_QUERY` is not exported.

- [ ] **Step 3: Write the rule**

Add after `DYNAMIC_DATA_SOURCE` in `packages/core/src/rules/pbiplint/power-query.ts`:

```ts
/** A text literal a value stands for: written in place, or held by a step or a model parameter. */
interface HeldText {
  node: Node;
  query: MQuery;
  value: string;
  /** Reached through a name, so the literal sits in a step or a parameter of its own. */
  named: boolean;
}

/**
 * The text a value holds: a literal written in place, or the literal a name stands for through
 * `let` steps or a model parameter. Nothing further is followed.
 */
function heldText(m: MIndex, q: MQuery, node: Node): HeldText | undefined {
  const v = boundValue(m, q, node).node;
  const named = v !== unwrap(node);
  const text = textValue(v);
  if (text !== undefined) return { node: v, query: q, value: text, named };
  const r = resolve(m, q, v);
  const p = r.kind === "modelParameter" ? unwrap(r.value) : undefined;
  const value = textValue(p);
  return p && value !== undefined && r.kind === "modelParameter"
    ? { node: p, query: r.query, value, named: true }
    : undefined;
}

/** The parts of a value joined with `&`, in order; the value itself when it is not a join. */
function joined(n: Node): Node[] {
  const v = unwrap(n);
  return v.kind === Kind.ArithmeticExpression && v.operatorConstant.constantKind === "&"
    ? [...joined(v.left), ...joined(v.right)]
    : [v];
}

/**
 * The texts a header's or a field's value holds. A value joined with `&` is read as its literals
 * joined, located on the first of them, and each name in it as the text that name holds.
 */
function heldTexts(m: MIndex, q: MQuery, node: Node): HeldText[] {
  const parts = joined(node);
  const literals = parts.filter((p) => textValue(p) !== undefined);
  const out: HeldText[] = literals[0]
    ? [{ node: literals[0], query: q, value: literals.map(textValue).join(""), named: false }]
    : [];
  for (const p of parts)
    if (p.kind === Kind.IdentifierExpression) {
      const held = heldText(m, q, p);
      if (held) out.push(held);
    }
  return out;
}

/** A placeholder written where a credential would go (v3 spec, section 9.5). */
const PLACEHOLDER = /^(<.*>|\{.*\}|x{3,}.*|\*{3,}.*|your.*|placeholder|null|none|test|demo)$/i;
/**
 * Whether text holds a credential: 8 characters or more once a scheme word before it, such as
 * `Bearer `, is left off; no space left in it, which prose such as `Enter your key here` has; and
 * no placeholder.
 */
const isCredential = (value: string): boolean => {
  const v = value.trim().replace(/^\S+ (?=\S+$)/, "");
  return v.length >= 8 && !/\s/.test(v) && !PLACEHOLDER.test(v);
};

/** The headers that carry a credential, in any case. */
const SECRET_HEADER =
  /^(?:authorization|x-api-key|api-?key|ocp-apim-subscription-key|x-auth-token|x-functions-key)$/i;
/** The `Query` record's fields that carry one, in any case. */
const SECRET_FIELD =
  /^(?:api_?key|key|access_token|token|client_secret|secret|password|code|subscription-key)$/i;
/** A web address's parameters that carry one: the same names, and a signature's. */
const SECRET_PARAMETER =
  /[?&](api_?key|key|access_token|token|client_secret|secret|password|code|subscription-key|sig|signature)=([^&#]*)/gi;
/** The functions whose connection string's `Password=` or `Pwd=` part is read. */
const CONNECTION_STRING = /^(?:Odbc|OleDb)\.(?:DataSource|Query)$/;

/** The fields of a record written in place, or held by a step, by their M names. */
function recordFields(
  m: MIndex,
  q: MQuery,
  node: Node | undefined,
): { name: string; value: Node }[] {
  const v = node && boundValue(m, q, node).node;
  return v?.kind === Kind.RecordExpression
    ? v.content.elements.map((csv) => ({
        name: identifierName(csv.node.key.literal),
        value: csv.node.value,
      }))
    : [];
}

/** A credential and where a finding says it is. The words never hold any part of the value. */
interface Credential {
  held: HeldText;
  where: string;
}

/**
 * The credentials a query writes into a web request's headers or `Query` record, a connection
 * string, a web address, or a Bearer token, in that order, so a literal found twice keeps the
 * first place it was found.
 */
function credentialsIn(m: MIndex, q: MQuery): Credential[] {
  const out: Credential[] = [];
  const add = (value: Node, where: string): void => {
    for (const held of heldTexts(m, q, value))
      if (isCredential(held.value)) out.push({ held, where });
  };
  for (const c of calls(q)) {
    if (c.name === "Web.Contents" || c.name === "OData.Feed") {
      // OData.Feed takes its headers as its second argument, and its options as its third.
      const options = recordFields(m, q, c.args[c.name === "OData.Feed" ? 2 : 1]);
      const field = (name: string) => options.find((f) => f.name === name)?.value;
      for (const h of [
        ...(c.name === "OData.Feed" ? recordFields(m, q, c.args[1]) : []),
        ...recordFields(m, q, field("Headers")),
      ])
        if (SECRET_HEADER.test(h.name)) add(h.value, `the ${h.name} header in ${c.name}`);
      for (const f of recordFields(m, q, field("Query")))
        if (SECRET_FIELD.test(f.name))
          add(f.value, `the ${f.name} field of the Query record in ${c.name}`);
    }
    const held =
      CONNECTION_STRING.test(c.name) && c.args[0] ? heldText(m, q, c.args[0]) : undefined;
    for (const part of held?.value.split(";") ?? []) {
      const [key = "", ...rest] = part.split("=");
      const k = key.trim().toLowerCase();
      if ((k === "password" || k === "pwd") && isCredential(rest.join("=").replace(/[{}]/g, "")))
        out.push({ held: held!, where: `the password in ${c.name}'s connection string` });
    }
  }
  for (const { node, value } of textLiterals(q)) {
    const held = { node, query: q, value, named: false };
    if (/^https?:\/\//i.test(value))
      for (const [, name = "", v = ""] of value.matchAll(SECRET_PARAMETER))
        if (isCredential(v))
          out.push({ held, where: `the ${name.toLowerCase()} parameter of the web address` });
    if (/^bearer [\w.~+/-]{16}/i.test(value)) out.push({ held, where: "the Bearer token" });
  }
  return out;
}

// A credential written into a query (v3 spec, section 9.5). The finding is on the literal that
// holds it, once however many places read it, and its detail names only where the credential is:
// no output prints any part of the value, its length, or a hash of it (spec 11.3).
export const HARDCODED_SECRET_IN_QUERY = pbiplintRule({
  id: "HARDCODED_SECRET_IN_QUERY",
  name: "Secret written into a query",
  category: "Error Prevention",
  severity: 3,
  scope: ["Partition", "NamedExpression", "Table"],
  layer: "powerquery",
  check: (_project, { indexes: { m } }) => {
    const reported = new Set<string>();
    return m.queries.flatMap((q) =>
      credentialsIn(m, q).flatMap(({ held, where }) => {
        const key = `${held.query.kind}:${held.query.name}:${held.node.id}`;
        if (reported.has(key)) return [];
        reported.add(key);
        const what = held.named
          ? `${where} reads a credential written here (value not shown)`
          : `${where} holds a credential written into the query (value not shown)`;
        return [mFinding(m, held.query, held.node, what)];
      }),
    );
  },
});
```

and `powerQueryRules` gains `HARDCODED_SECRET_IN_QUERY,` after `DYNAMIC_DATA_SOURCE,`.

Why it is built this way: every interpolated word in a detail is the rule's own, a function name (`Web.Contents`, `OData.Feed`, or one `CONNECTION_STRING` matched), a header or field name `SECRET_HEADER` or `SECRET_FIELD` matched, or a parameter name `SECRET_PARAMETER` matched (lowercased). No literal's text reaches `mFinding`; the literal's node gives only the location. That is spec 11.3's "by construction".

Run: `npx vitest run packages/core/test/rules-power-query.test.ts`
Expected: PASS.

- [ ] **Step 4: Write the page**

Create `rules/hardcoded-secret-in-query.md`:

````markdown
---
id: HARDCODED_SECRET_IN_QUERY
name: "Secret written into a query"
category: Error Prevention
severity: error
scope: [Partition, NamedExpression, Table]
status: builtin
layer: powerquery
video:
sources:
---

# Secret written into a query

## What it checks

Credentials written into Power Query queries as text: a key, token, or password in a web request's headers or `Query` record, in a web address, as a Bearer token, or in an ODBC or OLE DB connection string.

Each finding names the partition, the shared expression, or, for an incremental refresh policy's own query, the table, and says where the credential is, never what it is: `query 'Orders API', step 'Source': the Authorization header in Web.Contents holds a credential written into the query (value not shown)`. No output of pbiplint shows any part of the value, its length, or anything computed from it. The location is the line and column where the text starts in the TMDL file, so you can find it in your own copy. When a parameter or a step holds the credential, the finding is on that text, once, however many queries read it.

## Example

```tmdl fires
table 'Orders API'
	column Content
		dataType: binary
		summarizeBy: none
		sourceColumn: Content

	partition 'Orders API' = m
		mode: import
		source =
				let
					Source = Web.Contents("https://api.example.com/v1/orders", [Headers = [Authorization = "Bearer pbiplint-fixture-example-0909-notreal"]])
				in
					Source
```

```tmdl fixed
table 'Orders API'
	column Content
		dataType: binary
		summarizeBy: none
		sourceColumn: Content

	partition 'Orders API' = m
		mode: import
		source =
				let
					Source = Web.Contents("https://api.example.com/v1/orders")
				in
					Source
```

## Why it matters

A Power BI project is text made for source control: every copy of the repository, every clone, and every fork holds the queries as written, and so holds the credential. Removing the line later does not take it back, since the history keeps it. Microsoft's reference for `Web.Contents` names the risk while showing the alternative: "Instead of hard-coding the secret key in M (which would pose a security risk), the key can be provided securely by specifying its name (not its value) in M, choosing Web API authentication, and entering the key value as part of the Web API credential." ([Web.Contents, Example 3](https://learn.microsoft.com/powerquery-m/web-contents#example-3)).

## How to fix it

1. Revoke or rotate the credential with whoever issued it, first. The old value is in the repository's history, so taking it out of the query does not unpublish it.
2. In Power BI Desktop, choose Transform data, select the query, and select the step the finding names in Applied steps. Delete the credential from the step's address, header, or `Query` record in the formula bar, or from the parameter that holds it (Home, Manage Parameters). In the TMDL file, the text is in the partition's `source` block, or in the expression's value for a parameter.
3. For a model that is published, give the source a credential the service can refresh with. Where the source accepts it, sign in with an organizational account: when Desktop asks for credentials, choose Organizational account, one of the authentication kinds the Web connector lists for `Web.Contents` ([Web connector, Summary](https://learn.microsoft.com/power-query/connectors/web/web#summary)). Where the source takes only a key, Microsoft's route is a custom connector that holds the credential: "If you build reports in Power BI Desktop that use custom data connectors, you can use an on-premises data gateway to refresh those reports in the Power BI service." ([Use custom data connectors with the on-premises data gateway](https://learn.microsoft.com/power-bi/connect-data/service-gateway-custom-connectors)).
4. For a model that is never published, `ApiKeyName` with a Web API credential keeps the key out of the files, as Example 3 above shows. Do not rely on it for a published model: "The Web API authentication type is available in Power BI Desktop and Power Query in Excel, but isn't supported in the Power BI service." ([Web connector, Summary](https://learn.microsoft.com/power-query/connectors/web/web#summary)).

## When to ignore it

When the text is not a working credential, such as a public demo key the provider publishes for everyone, or a value already revoked. Even then, a placeholder that reads as one, such as `<your key>`, says so to the next reader without looking like a leak.

## Quirks

- Read as a credential: the value of an `Authorization`, `x-api-key`, `api-key`, `apikey`, `Ocp-Apim-Subscription-Key`, `x-auth-token`, or `x-functions-key` header in `Web.Contents` or `OData.Feed`; a field of their `Query` record named `api_key`, `apikey`, `key`, `access_token`, `token`, `client_secret`, `secret`, `password`, `code`, or `subscription-key`; a web address's parameter with one of those names, or `sig` or `signature`; text that starts `Bearer ` followed by at least 16 token characters, anywhere; and `Password=` or `Pwd=` in the connection string of `Odbc.DataSource`, `Odbc.Query`, `OleDb.DataSource`, or `OleDb.Query`. Names are read in any case.
- A header or field whose value is a name is followed to the step or parameter that holds the text. A value joined with `&` is read as its texts joined, and each name in it is followed the same way.
- Text under 8 characters once a scheme word such as `Bearer ` is left off, text with a space left in it, such as `Enter your key here`, and placeholders (text in angle brackets or braces, such as `<your key>`; text starting with three x's or three asterisks; text starting `your`; and `placeholder`, `null`, `none`, `test`, and `demo`) are not read as credentials.
- `ApiKeyName`, which names the key rather than holding it, is left alone, and so is anything in a comment.
- A connection string written as a record, rather than as text, is not read.
- A query whose M does not parse is not read, and its `PARSE_ISSUE` finding quotes the line where the parser stopped, which may hold the credential.

## Related rules

- `ODBC_WHERE_CONNECTOR_EXISTS` reads the same connection strings for the driver they name.
- `DYNAMIC_DATA_SOURCE` reads the same `Web.Contents` calls for their address; moving a key into the `Query` record keeps the address static but still writes the key into the query.

## Links

- [Web.Contents](https://learn.microsoft.com/powerquery-m/web-contents)
- [Power Query Web connector](https://learn.microsoft.com/power-query/connectors/web/web)
````

The quotes are verbatim from the live pages (checked October 13, 2026). The example's value, `pbiplint-fixture-example-0909-notreal`, is made up and shares no 8-character run with m-zoo's values, so the guard of Task 4 stays exact though the CLI's SARIF help carries this example. In `rules/odbc-where-connector-exists.md`, add a last bullet under Related rules:

```markdown
- `HARDCODED_SECRET_IN_QUERY` reports a password written into the same connection strings.
```

- [ ] **Step 5: Regenerate the data files and run the pages' tests**

```bash
npm run build -w @pbiplint/core && node scripts/sync-rule-pages.mjs
npx vitest run packages/core/test/rule-pages.test.ts packages/cli/test/rule-help.test.ts packages/web/test/rule-guidance.test.ts -t "HARDCODED_SECRET_IN_QUERY|ODBC_WHERE_CONNECTOR_EXISTS"
```

Expected: PASS, including the SARIF help's plain-text form (`rule-help.test.ts` rejects `**` and code spans left behind, which is why the page writes the placeholders in words).

- [ ] **Step 6: Pin the rule's findings on m-zoo**

Spec 9.5's fixture shapes are all in m-zoo's `Api Secrets` and `Odbc Orders` tables and its `ServiceToken` parameter: the `Authorization` header (fires once, though it is a Bearer token too), the `api_key` in a web address (fires), the `Query` record's `apikey` (fires), the ODBC `Pwd=` (fires), the `x-api-key` header read from `ServiceToken` (fires once, on the parameter), `ApiKeyName`, `<your key>`, and the key in a comment (none fires). Write `.superpowers/sdd/2026-10-13-v3-rules-resolver/pin-secret.json`:

```json
[
  {
    "rule": "HARDCODED_SECRET_IN_QUERY",
    "objectType": "Partition",
    "object": "Api Secrets",
    "file": "definition/tables/Api Secrets.tmdl",
    "line": 15,
    "column": 98,
    "detail": "query 'Api Secrets', step 'HeaderToken': the Authorization header in Web.Contents holds a credential written into the query (value not shown)"
  },
  {
    "rule": "HARDCODED_SECRET_IN_QUERY",
    "objectType": "Partition",
    "object": "Api Secrets",
    "file": "definition/tables/Api Secrets.tmdl",
    "line": 17,
    "column": 86,
    "detail": "query 'Api Secrets', step 'QueryKey': the apikey field of the Query record in Web.Contents holds a credential written into the query (value not shown)"
  },
  {
    "rule": "HARDCODED_SECRET_IN_QUERY",
    "objectType": "NamedExpression",
    "object": "ServiceToken",
    "file": "definition/expressions.tmdl",
    "line": 24,
    "column": 27,
    "detail": "query 'ServiceToken': the x-api-key header in Web.Contents reads a credential written here (value not shown)"
  },
  {
    "rule": "HARDCODED_SECRET_IN_QUERY",
    "objectType": "Partition",
    "object": "Api Secrets",
    "file": "definition/tables/Api Secrets.tmdl",
    "line": 16,
    "column": 28,
    "detail": "query 'Api Secrets', step 'UrlKey': the api_key parameter of the web address holds a credential written into the query (value not shown)"
  },
  {
    "rule": "HARDCODED_SECRET_IN_QUERY",
    "objectType": "Partition",
    "object": "Odbc Orders",
    "file": "definition/tables/Odbc Orders.tmdl",
    "line": 15,
    "column": 33,
    "detail": "query 'Odbc Orders', step 'Redshift': the password in Odbc.DataSource's connection string holds a credential written into the query (value not shown)"
  }
]
```

Then:

```bash
node .superpowers/sdd/2026-10-13-v3-rules-resolver/pin-m-zoo.mjs .superpowers/sdd/2026-10-13-v3-rules-resolver/pin-secret.json
npx vitest run packages/core/test/rules-m.test.ts
```

Expected: `5 added, 43 findings, 12 rules`; PASS. No other committed fixture with M fires this rule.

- [ ] **Step 7: The spec**

In the spec, section 9.5, add a last bullet after "- **Corpus:** 60 occurrences in 2 models ...":

```markdown
- **Amended October 13, 2026** (the coordinator's decision, pull request 6, from the corpus spot check): a scheme word before the token, any word and not only `Bearer ` or `Basic `, is left off before the length test, since 57 of the corpus's headers read `AfasToken <token>`; text with a space left in it after that is prose, not a credential, which leaves out two parameters holding `Enter your key here`-style text; a name inside an `&` join is followed as a whole value's name is, so `"Bearer " & Token` reports the step or parameter that holds `Token`; and `OData.Feed`'s second argument, its headers record, is read as headers. A literal is reported once, on the literal, however many places read it. The corpus count was 74 findings in 7 models as written, and is 72 in 6 models (6 repositories) after: 59 `AfasToken` headers in one model (57 written in place, 2 held by steps), 7 `key` and 3 `apikey` web address parameters, and 3 credentials reached through `&` joins or parameters.
```

- [ ] **Step 8: Move the counts by one rule**

118 rules, 36 built in, 13 Power Query rules, 12 of them pbiplint's own:

```bash
perl -pi -e 's/toBe\(117\)/toBe(118)/' packages/core/test/pack.test.ts
perl -pi -e 's/toBe\(117\)/toBe(118)/g; s/6 \+ 117\b/6 + 118/; s/"and 36 built into pbiplint\."/"and 37 built into pbiplint."/; s/"118 rules: 66/"119 rules: 66/; s/"117 rules: 66/"118 rules: 66/; s/and 35 built into pbiplint\./and 36 built into pbiplint./g; s/"91 rules: 66/"92 rules: 66/; s/and 20 built into pbiplint\./and 21 built into pbiplint./' packages/web/test/generate.test.ts
perl -0pi -e 's/\b12(\s+)rules/13$1rules/g; s/Power Query rules, 12 of them/Power Query rules, 13 of them/g; s/\b11 of them pbiplint/12 of them pbiplint/g; s/\b11 of pbiplint/12 of pbiplint/g; s/\b117(\s+)rules in all, 35 of/118$1rules in all, 36 of/g' README.md packages/cli/README.md packages/core/README.md packages/web/content/about.md
```

In `packages/web/test/generate.test.ts`, add `"hardcoded-secret-in-query",` to the slug list after `"fixed-date-in-row-filter",`. Check the prose as in Task 2.

- [ ] **Step 9: Run what this task touches, and measure**

```bash
npx vitest run packages/core/test packages/web/test packages/cli/test
npm run typecheck
npm run check:browser
```

Expected: PASS; `check:browser` at about 226.4 KB. Write its line and the projection (+ 2.9 KB, about 229.3 KB) into `progress.md` under Task 3. Over 230.0 KB projected, or over 226.7 KB measured: stop, breakdown, report.

- [ ] **Step 10: Commit**

```bash
npx prettier --write packages/core/src/rules/pbiplint/power-query.ts packages/core/test/rules-power-query.test.ts packages/core/src/rules/rule-summaries.data.ts packages/cli/src/rule-help.data.ts packages/web/src/results/rule-guidance.data.ts packages/core/test/pack.test.ts packages/web/test/generate.test.ts
npm run lint
git add packages rules README.md tests/expectations/pbiplint/m-zoo.json docs/superpowers/specs/2026-10-12-pbiplint-v3-power-query-layer-design.md
git commit -m "feat: HARDCODED_SECRET_IN_QUERY reports a credential written into a query

A key, token, or password in a web request's headers or Query record, a
web address, a Bearer token, or a connection string is an error, reported
once on the text that holds it, written in place or in a step or a
parameter. The detail says where the credential is and never any part
of it. 118 rules, 36 built in.

Part of #78.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: The secret guard over every output

**Files:**
- Create: `tests/support/fake-secrets.ts`
- Create: `packages/core/test/secret-masking.test.ts`, `packages/web/test/secret-masking.test.ts`, `packages/cli/test/secret-masking.test.ts`
- Modify: `packages/cli/test/mcp.test.ts`, `packages/web/e2e/home.spec.ts`
- Modify: `docs/superpowers/specs/2026-10-12-pbiplint-v3-power-query-layer-design.md` (section 11.3)

**Interfaces:**
- Consumes: `HARDCODED_SECRET_IN_QUERY` (Task 3); `formatText`, `formatJson`, `formatMarkdown`, `formatSarif` (core); `renderResults` (`packages/web/src/results/render.ts`); `exportMarkdown`, `exportJson`, `exportForAssistant` (`packages/web/src/results/export.ts`); `main` (`packages/cli/src/main.ts`); the MCP test's `connect()` and `Client.call`; `setFolder`.
- Produces: in `tests/support/fake-secrets.ts`, `SECRETS_FIXTURE: string` (m-zoo's path), `fakeSecrets(dir?: string): string[]` (every made-up value under a folder, sorted), and `leaks(text: string, secrets: readonly string[]): string[]` (the pieces of `secrets` that `text` holds; empty when none).

- [ ] **Step 0: The ruling**

Read the `Ruling (pb-coord): spec changes of PR 6` line. If it declines the stricter guard, `leaks` checks only 8-character runs inside the distinctive part: its loop becomes `for (let i = start; i + 8 <= end; i++)`, and the `"…0002-not…"` expectation in the core test goes.

- [ ] **Step 1: The shared helper**

Create `tests/support/fake-secrets.ts`:

```ts
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * m-zoo, the fixture that plants the made-up credentials (v3 spec, sections 9.5 and 11.1). Built
 * from the module's path, as a happy-dom test must: there `new URL(..., import.meta.url)` resolves
 * against the page's address rather than the file.
 */
export const SECRETS_FIXTURE = join(
  dirname(fileURLToPath(import.meta.url)),
  "../fixtures/m-zoo.SemanticModel",
);

/** A made-up credential as fixtures write one: it matches no real provider's format. */
const FAKE = /pbiplint-fixture-[a-z]+-\d{4}-notreal/g;

/**
 * Every made-up credential under a fixture folder, read from its files, so one a fixture adds later
 * is covered without a change here.
 */
export function fakeSecrets(dir: string = SECRETS_FIXTURE): string[] {
  const found = new Set<string>();
  const walk = (d: string): void => {
    for (const e of readdirSync(d, { withFileTypes: true }))
      if (e.isDirectory()) walk(join(d, e.name));
      else for (const m of readFileSync(join(d, e.name), "utf8").matchAll(FAKE)) found.add(m[0]);
  };
  walk(dir);
  return [...found].sort();
}

/**
 * The pieces of `secrets` that `text` holds (v3 spec, section 11.3): a whole value, or any run of 8
 * characters of it that takes in any of its distinctive part, the text between `pbiplint-fixture-`
 * and `-notreal`. Runs inside the shared prefix or suffix alone are not looked for, since they say
 * nothing of one value. Empty when the text holds none.
 */
export function leaks(text: string, secrets: readonly string[]): string[] {
  const start = "pbiplint-fixture-".length;
  const out = new Set<string>();
  for (const secret of secrets) {
    if (text.includes(secret)) out.add(secret);
    const end = secret.length - "-notreal".length;
    for (let i = Math.max(0, start - 7); i < end && i + 8 <= secret.length; i++) {
      const run = secret.slice(i, i + 8);
      if (text.includes(run)) out.add(run);
    }
  }
  return [...out];
}
```

The path is built from `fileURLToPath(import.meta.url)` because under happy-dom `new URL(..., import.meta.url)` resolves against the page's `http:` address (as `packages/web/test/home.test.ts` notes).

- [ ] **Step 2: Write the guard tests**

Create `packages/core/test/secret-masking.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { fakeSecrets, leaks, SECRETS_FIXTURE } from "../../../tests/support/fake-secrets.js";
import { lint } from "../src/engine/lint.js";
import { formatJson, formatMarkdown, formatSarif, formatText } from "../src/format/index.js";
import { readModelFiles } from "./helpers.js";

// The secret guard (v3 spec, section 11.3): m-zoo plants made-up credentials, and no output pbiplint
// writes may hold any part of one. The web and CLI suites hold their own outputs to the same test.
const secrets = fakeSecrets();
const result = await lint(readModelFiles(SECRETS_FIXTURE));

describe("the secret guard, in core (v3 spec, section 11.3)", () => {
  it("reads m-zoo's made-up credentials, so the guard has something to look for", () => {
    expect(secrets.length).toBeGreaterThanOrEqual(6);
    // A whole value, and 8 characters of one with nothing around them, both count.
    expect(leaks("pbiplint-fixture-key-0002-notreal", secrets)).toContain(
      "pbiplint-fixture-key-0002-notreal",
    );
    expect(leaks("…key-0002…", secrets)).toEqual(["key-0002"]);
    expect(leaks("…0002-not…", secrets)).toEqual(["0002-not"]);
    // The prefix and suffix every value shares are not a leak of any one value.
    expect(leaks("pbiplint-fixture- and -notreal", secrets)).toEqual([]);
  });
  it("reports them, so the outputs below carry their findings", () => {
    expect(
      result.findings.filter((f) => f.ruleId === "HARDCODED_SECRET_IN_QUERY").length,
    ).toBeGreaterThanOrEqual(5);
  });
  it("keeps every part of every value out of the result, but for the model it was read from", () => {
    // The result carries the model and project it read, for callers that go on to use them; they
    // hold the M as written, and no output prints them. Everything else is what outputs are made of.
    const { model: _model, project: _project, ...printed } = result;
    expect(leaks(JSON.stringify(printed), secrets)).toEqual([]);
  });
  it.each([
    ["text", formatText],
    ["JSON", formatJson],
    ["Markdown", formatMarkdown],
    ["SARIF", formatSarif],
  ] as const)("keeps every part of every value out of the %s format", (_name, format) => {
    expect(leaks(format(result, { toolVersion: "0.0.0" }), secrets)).toEqual([]);
  });
});
```

Create `packages/web/test/secret-masking.test.ts`:

```ts
// @vitest-environment happy-dom
import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { lint } from "@pbiplint/core";
import { describe, expect, it } from "vitest";
import { fakeSecrets, leaks, SECRETS_FIXTURE } from "../../../tests/support/fake-secrets.js";
import { exportForAssistant, exportJson, exportMarkdown } from "../src/results/export.js";
import { renderResults } from "../src/results/render.js";

// The secret guard (v3 spec, section 11.3) on the site: the results page, both downloads, and the
// copy for an AI assistant, built from a lint of m-zoo as the page runs it.
const secrets = fakeSecrets();
/** m-zoo's files as the page reads a dropped folder: paths relative to the model folder. */
const files: { path: string; text: string }[] = [];
const walk = (d: string): void => {
  for (const e of readdirSync(d, { withFileTypes: true }))
    if (e.isDirectory()) walk(join(d, e.name));
    else
      files.push({
        path: relative(SECRETS_FIXTURE, join(d, e.name)).split("\\").join("/"),
        text: readFileSync(join(d, e.name), "utf8"),
      });
};
walk(SECRETS_FIXTURE);
const result = await lint(files);

describe("the secret guard, on the site (v3 spec, section 11.3)", () => {
  it("lints m-zoo with its credentials reported", () => {
    expect(secrets.length).toBeGreaterThanOrEqual(6);
    expect(
      result.findings.filter((f) => f.ruleId === "HARDCODED_SECRET_IN_QUERY").length,
    ).toBeGreaterThanOrEqual(5);
  });
  it("keeps every part of every value out of the rendered results", () => {
    document.body.innerHTML = '<section id="results"></section>';
    const container = document.getElementById("results")!;
    renderResults(container, result, { source: "m-zoo.SemanticModel" });
    expect(container.textContent).toContain("HARDCODED_SECRET_IN_QUERY");
    expect(leaks(container.innerHTML, secrets)).toEqual([]);
  });
  it.each([
    ["the Markdown download", exportMarkdown],
    ["the JSON download", exportJson],
    ["the copy for an AI assistant", exportForAssistant],
  ] as const)("keeps every part of every value out of %s", (_name, exported) => {
    const text = exported(result).text;
    expect(text).toContain("HARDCODED_SECRET_IN_QUERY");
    expect(leaks(text, secrets)).toEqual([]);
  });
});
```

Create `packages/cli/test/secret-masking.test.ts`:

```ts
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { fakeSecrets, leaks, SECRETS_FIXTURE } from "../../../tests/support/fake-secrets.js";
import { tempDir } from "../../../tests/support/temp-dir.js";
import { main } from "../src/main.js";

// The secret guard (v3 spec, section 11.3) on the CLI: every format, the quiet text, a report
// written with --output, and stderr, for a lint of m-zoo. The MCP server's lint tool is held to it
// in mcp.test.ts, where its client lives.
const secrets = fakeSecrets();

async function run(argv: string[]) {
  let out = "";
  let err = "";
  const code = await main(argv, {
    stdout: (s) => (out += s),
    stderr: (s) => (err += s),
    cwd: () => process.cwd(),
  });
  return { code, out, err };
}

describe("the secret guard, in the CLI (v3 spec, section 11.3)", () => {
  it.each(["text", "json", "markdown", "sarif"])(
    "keeps every part of every value out of --format %s and stderr",
    async (format) => {
      const r = await run([SECRETS_FIXTURE, "--format", format]);
      expect(r.code).toBe(1);
      expect(r.out).toContain("HARDCODED_SECRET_IN_QUERY");
      expect(leaks(r.out, secrets)).toEqual([]);
      expect(leaks(r.err, secrets)).toEqual([]);
    },
  );
  it("keeps every part of every value out of the quiet text", async () => {
    const r = await run([SECRETS_FIXTURE, "--quiet"]);
    expect(r.out).toContain("HARDCODED_SECRET_IN_QUERY");
    expect(leaks(r.out + r.err, secrets)).toEqual([]);
  });
  it("keeps every part of every value out of a report written with --output", async () => {
    const file = join(tempDir("secret-output"), "report.sarif");
    const r = await run([SECRETS_FIXTURE, "--format", "sarif", "--output", file]);
    const written = readFileSync(file, "utf8");
    expect(written).toContain("HARDCODED_SECRET_IN_QUERY");
    expect(leaks(written + r.out + r.err, secrets)).toEqual([]);
  });
});
```

In `packages/cli/test/mcp.test.ts`, add the import beside the `tempDir` one:

```ts
import { fakeSecrets, leaks, SECRETS_FIXTURE } from "../../../tests/support/fake-secrets.js";
```

and, in `describe("pbiplint mcp")`, before the test "returns the CLI's message as an error for a path it cannot read":

```ts
  it("keeps every part of m-zoo's made-up credentials out of the lint tool's answers (v3 spec, section 11.3)", async () => {
    const secrets = fakeSecrets();
    expect(secrets.length).toBeGreaterThanOrEqual(6);
    const client = await connect();
    const json = await client.call("lint", { path: SECRETS_FIXTURE });
    const quiet = await client.call("lint", { path: SECRETS_FIXTURE, quiet: true });
    expect(json.text).toContain("HARDCODED_SECRET_IN_QUERY");
    expect(quiet.text).toContain("HARDCODED_SECRET_IN_QUERY");
    expect(leaks(json.text + quiet.text + client.lines.join("\n"), secrets)).toEqual([]);
  });
```

In `packages/web/e2e/home.spec.ts`, add the import after the `./fixtures.js` one:

```ts
import { fakeSecrets, leaks, SECRETS_FIXTURE } from "../../../tests/support/fake-secrets.js";
```

(the import order then is `./fixtures.js`, the helper, `./folder-input.js`; Prettier leaves it), and add this test before the test "a clean run offers nothing to copy":

```ts
test("shows, downloads, and copies m-zoo's results with no part of a made-up credential (v3 spec, section 11.3)", async ({
  page,
  context,
  browserName,
}) => {
  if (browserName === "chromium")
    await context.grantPermissions(["clipboard-write", "clipboard-read"]);
  const secrets = fakeSecrets();
  expect(secrets.length).toBeGreaterThanOrEqual(6);
  await setFolder(page.locator("#folder-input"), SECRETS_FIXTURE);
  const results = page.locator("#results");
  await expect(results.locator("h2")).toContainText("m-zoo.SemanticModel");
  await expect(results).toContainText("HARDCODED_SECRET_IN_QUERY");
  expect(leaks(await page.content(), secrets)).toEqual([]);
  for (const name of ["Download Markdown", "Download JSON"]) {
    const [download] = await Promise.all([
      page.waitForEvent("download"),
      page.getByRole("button", { name }).click(),
    ]);
    const text = readFileSync((await download.path())!, "utf8");
    expect(text).toContain("HARDCODED_SECRET_IN_QUERY");
    expect(leaks(text, secrets)).toEqual([]);
  }
  // Only Chromium lets a test read the clipboard back; the unit test holds the copy's text in every
  // engine.
  const copy = page.locator(".export button").nth(1);
  await expect(copy).toHaveText("Copy for an AI assistant");
  await copy.click();
  await expect(copy).toHaveText("Copied");
  if (browserName === "chromium") {
    const text = await page.evaluate(() => navigator.clipboard.readText());
    expect(text).toContain("HARDCODED_SECRET_IN_QUERY");
    expect(leaks(text, secrets)).toEqual([]);
  }
});
```

- [ ] **Step 3: Run them, and prove they bite**

```bash
npx vitest run packages/core/test/secret-masking.test.ts packages/web/test/secret-masking.test.ts packages/cli/test/secret-masking.test.ts packages/cli/test/mcp.test.ts
```

Expected: PASS (31 tests in the scratch run). These tests guard code that already holds, so prove they would catch a leak: in `power-query.ts`, in `HARDCODED_SECRET_IN_QUERY`, temporarily replace the text `holds a credential written into the query (value not shown)` (the second branch of the `held.named` choice) with `holds ${held.value.slice(-14)}`, rerun the command above, and expect failures in the core, web, CLI, and MCP files (15 in the scratch run). Then undo the change with the Edit tool, rerun, and confirm PASS and `git diff packages/core/src` empty.

- [ ] **Step 4: The browser**

```bash
npm run build -w @pbiplint/web
npx playwright test -c packages/web/playwright.config.ts packages/web/e2e/home.spec.ts -g "made-up credential"
```

Expected: 3 passed (Chromium, Firefox, WebKit).

- [ ] **Step 5: The spec**

In the spec, section 11.3, add after the paragraph "It reads the values from the fixture, ...":

```markdown
Amended October 13, 2026 (pull request 6): the guard looks for every 8-character run of a value that takes in at least one character of its distinctive part, not only runs inside that part, so a leak of a value's end such as `0002-notreal` fails it too; runs inside the prefix or suffix every value shares are not looked for. The helper is `tests/support/fake-secrets.ts`; the MCP check sits in `packages/cli/test/mcp.test.ts`, beside its client, and an e2e test holds the site in a real browser to it: the page, both downloads, and, in Chromium, the copy for an AI assistant.
```

- [ ] **Step 6: Run what this task touches, and commit**

```bash
npx vitest run packages/core/test packages/web/test packages/cli/test
npm run typecheck
npm run check:browser
npx prettier --write tests/support/fake-secrets.ts packages/core/test/secret-masking.test.ts packages/web/test/secret-masking.test.ts packages/cli/test/secret-masking.test.ts packages/cli/test/mcp.test.ts packages/web/e2e/home.spec.ts
npm run lint
git add tests/support/fake-secrets.ts packages docs/superpowers/specs/2026-10-12-pbiplint-v3-power-query-layer-design.md
git commit -m "test: the secret guard holds every output to m-zoo's made-up credentials

Core's four formats, the site's results, downloads, and copy for an AI
assistant, the CLI in every format with --quiet and --output, the MCP
lint tool, and the site in a real browser carry no part of any value,
read from the fixture so a new one is covered (spec 11.3, amended).

Part of #78.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

`check:browser` is unchanged (226.4 KB); write its line into `progress.md` under Task 4.

---

### Task 5: `HARDCODED_SERVER_NAME` and its page

**Files:**
- Modify: `packages/core/src/rules/pbiplint/power-query.ts`
- Create: `rules/hardcoded-server-name.md`
- Modify: `rules/dynamic-data-source.md`, `rules/local-drive-path.md` (Related rules)
- Modify (generated): the three `.data.ts` files
- Modify: `tests/expectations/pbiplint/m-zoo.json`
- Modify: the counts' files
- Test: `packages/core/test/rules-power-query.test.ts`

**Interfaces:**
- Consumes: `boundValue`, `calls`, `textValue`, `mFinding`, `pbiplintRule`.
- Produces: `export const HARDCODED_SERVER_NAME: Rule`, appended to `powerQueryRules`.

- [ ] **Step 1: Write the failing tests**

The rule import gains `HARDCODED_SERVER_NAME` (after `HARDCODED_SECRET_IN_QUERY`). Add at the end of `packages/core/test/rules-power-query.test.ts`:

```ts
describe("HARDCODED_SERVER_NAME (v3 spec, section 9.14)", () => {
  const rule = HARDCODED_SERVER_NAME;
  it("is a built-in Power Query info rule on a query's owner", () => {
    isPowerQueryRule(rule, 1, "Maintenance");
    expect(rule.name).toBe("Server name written into the query");
    expect(rule.scope).toEqual(["Partition", "NamedExpression", "Table"]);
  });
  it("reports a query once, on its first call, with the number of calls", async () => {
    const tmdl = table(
      "Sales",
      "let",
      '\tSource = Sql.Database("finance-sql.example", "Warehouse"),',
      '\tArchive = Sql.Database("finance-sql.example", "Archive"),',
      '\tOrders = Table.Combine({Source{[Schema = "dbo", Item = "Orders"]}[Data], Archive{[Schema = "dbo", Item = "Orders"]}[Data]})',
      "in",
      "\tOrders",
    );
    expect(await mFindings(rule, tmdl)).toEqual([
      {
        objectType: "Partition",
        objectName: "Sales",
        location: { file: "inline.tmdl", line: 6, column: 15 },
        detail:
          "query 'Sales', step 'Source': Sql.Database names its server as text (2 calls in this query); a parameter would hold it",
      },
    ]);
  });
  it("reads a server held by a step, and every connector spec 9.14 names", async () => {
    const tmdl = [
      [
        "A",
        'let Server = "finance-sql.example", Source = Sql.Database(Server, "Warehouse") in Source',
      ],
      ["B", 'Sql.Databases("finance-sql.example")'],
      ["C", 'PostgreSQL.Database("pg.example", "sales")'],
      ["D", 'MySQL.Database("mysql.example", "sales")'],
      ["E", 'Oracle.Database("oracle.example")'],
      ["F", 'Snowflake.Databases("account.example", "WAREHOUSE")'],
      ["G", 'AnalysisServices.Database("powerbi://api.example.com/v1.0/myorg/Sales", "Sales")'],
      ["H", 'AnalysisServices.Databases("as.example")'],
      ["I", 'DB2.Database("db2.example", "SALES")'],
      ["J", 'Teradata.Database("teradata.example")'],
    ]
      .map(([name, m]) => table(name!, m!))
      .join("");
    expect((await mFindings(rule, tmdl)).map((f) => f.detail)).toEqual([
      "query 'A', step 'Source': Sql.Database names its server as text; a parameter would hold it",
      "query 'B': Sql.Databases names its server as text; a parameter would hold it",
      "query 'C': PostgreSQL.Database names its server as text; a parameter would hold it",
      "query 'D': MySQL.Database names its server as text; a parameter would hold it",
      "query 'E': Oracle.Database names its server as text; a parameter would hold it",
      "query 'F': Snowflake.Databases names its server as text; a parameter would hold it",
      "query 'G': AnalysisServices.Database names its server as text; a parameter would hold it",
      "query 'H': AnalysisServices.Databases names its server as text; a parameter would hold it",
      "query 'I': DB2.Database names its server as text; a parameter would hold it",
      "query 'J': Teradata.Database names its server as text; a parameter would hold it",
    ]);
  });
  it("leaves alone a server from a parameter or a call, the database argument, and other connectors", async () => {
    const tmdl =
      'expression ServerName = "finance-sql.example" meta [IsParameterQuery = true, Type = "Text", IsParameterQueryRequired = true]\n\n' +
      table(
        "Sales",
        "let",
        '\tSource = Sql.Database(ServerName, "Warehouse"),',
        '\tBuilt = Sql.Database(Text.Lower(ServerName), "Warehouse"),',
        '\tHana = SapHana.Database("hana.example"),',
        '\tOdbc = Odbc.DataSource("dsn=Sales")',
        "in",
        "\tOdbc",
      );
    expect(await mFindings(rule, tmdl)).toEqual([]);
  });
  it("never prints the server's name", async () => {
    const tmdl = table("Sales", 'Sql.Database("finance-sql.example", "Warehouse")');
    const [f] = await mFindings(rule, tmdl);
    expect(f?.detail).not.toContain("finance-sql");
  });
});
```

- [ ] **Step 2: Run them to make sure they fail**

Run: `npx vitest run packages/core/test/rules-power-query.test.ts -t HARDCODED_SERVER`
Expected: FAIL: `HARDCODED_SERVER_NAME` is not exported.

- [ ] **Step 3: Write the rule**

Add after `HARDCODED_SECRET_IN_QUERY`:

```ts
/** The database connectors whose first argument names the server (v3 spec, section 9.14). */
const SERVER_CONNECTOR =
  /^(?:Sql\.Databases?|PostgreSQL\.Database|MySQL\.Database|Oracle\.Database|Snowflake\.Databases|AnalysisServices\.Databases?|DB2\.Database|Teradata\.Database)$/;

// Once per query, on its first connector that names its server as text, written in place or held
// by a step (v3 spec, section 9.14). A server from a model parameter is the fix. The server's name
// is not printed: an internal host name need not travel with an export.
export const HARDCODED_SERVER_NAME = pbiplintRule({
  id: "HARDCODED_SERVER_NAME",
  name: "Server name written into the query",
  category: "Maintenance",
  severity: 1,
  scope: ["Partition", "NamedExpression", "Table"],
  layer: "powerquery",
  check: (_project, { indexes: { m } }) =>
    m.queries.flatMap((q) => {
      const named = calls(q).filter(
        (c) =>
          SERVER_CONNECTOR.test(c.name) &&
          c.args[0] !== undefined &&
          textValue(boundValue(m, q, c.args[0]).node) !== undefined,
      );
      const [first] = named;
      if (!first) return [];
      const count = named.length > 1 ? ` (${named.length} calls in this query)` : "";
      return [
        mFinding(
          m,
          q,
          first.node,
          `${first.name} names its server as text${count}; a parameter would hold it`,
        ),
      ];
    }),
});
```

and `powerQueryRules` gains `HARDCODED_SERVER_NAME,` after `HARDCODED_SECRET_IN_QUERY,`.

Run: `npx vitest run packages/core/test/rules-power-query.test.ts`
Expected: PASS.

- [ ] **Step 4: Write the page**

Create `rules/hardcoded-server-name.md`:

````markdown
---
id: HARDCODED_SERVER_NAME
name: "Server name written into the query"
category: Maintenance
severity: info
scope: [Partition, NamedExpression, Table]
status: builtin
layer: powerquery
video:
sources:
---

# Server name written into the query

## What it checks

Power Query queries that name a database server as text in a connector such as `Sql.Database`, rather than reading it from a parameter, reported once per query.

Each finding names the partition, the shared expression, or, for an incremental refresh policy's own query, the table. Its detail names the query and the step of the first such call, then the connector, and how many calls the query makes this way when there are more than one, as `query 'Sales', step 'Source': Sql.Database names its server as text (2 calls in this query); a parameter would hold it`. The server's name is not shown, since an internal host name need not travel with an exported report. The location is the line and column of the first such call in the TMDL file.

## Example

```tmdl fires
table Sales
	column OrderID
		dataType: int64
		summarizeBy: none
		sourceColumn: OrderID

	partition Sales = m
		mode: import
		source =
				let
					Source = Sql.Database("finance-sql.example", "Warehouse"),
					Orders = Source{[Schema = "dbo", Item = "Orders"]}[Data]
				in
					Orders
```

```tmdl fixed
expression ServerName = "finance-sql.example" meta [IsParameterQuery = true, Type = "Text", IsParameterQueryRequired = true]

table Sales
	column OrderID
		dataType: int64
		summarizeBy: none
		sourceColumn: OrderID

	partition Sales = m
		mode: import
		source =
				let
					Source = Sql.Database(ServerName, "Warehouse"),
					Orders = Source{[Schema = "dbo", Item = "Orders"]}[Data]
				in
					Orders
```

## Why it matters

A model usually outlives its server: the database moves to a new host, or the model moves from a test server to production. With the server written into each query, that move means finding and editing every query that names it, and missing one leaves a table reading the old server with no error until that server goes away. Microsoft's best practices suggest a parameter for exactly this: "You can even use parameters in some of the arguments of the data connectors. For example, you could create a parameter for your server name when connecting to your SQL Server database." And: "If you change your server location, all you need to do is update the parameter for your server name, and your queries are updated." ([Best practices, Use parameters](https://learn.microsoft.com/power-query/best-practices#use-parameters)).

## How to fix it

In Power BI Desktop, choose Transform data, then Home, Manage Parameters, New Parameter. Give it a name such as ServerName, the type Text, and the server as its current value. Then select the query, select its Source step in Applied steps, open the step's settings with the gear beside it, and choose Parameter, then the new parameter, for Server. Do the same in each query the finding names. In the TMDL file, the parameter is an `expression` with `IsParameterQuery = true`, and the connector's first argument becomes the parameter's name, as the fixed example shows.

## When to ignore it

A model with one query on one server that will never move gains little from a parameter, though the second query that names the server is where it starts to pay. A server name that is itself a placeholder, such as `localhost` in a model built only on one machine, is not worth a parameter either.

## Quirks

- Read: the first argument of `Sql.Database`, `Sql.Databases`, `PostgreSQL.Database`, `MySQL.Database`, `Oracle.Database`, `Snowflake.Databases`, `AnalysisServices.Database`, `AnalysisServices.Databases`, `DB2.Database`, and `Teradata.Database`, written as text in the call or in a step the call reads. The database name, the second argument, is not read.
- One finding per query, on its first such call, with the number of calls in the detail, since most models name their server in every query.
- A server from a parameter is the fix, and is left alone. So is a server from anything else the rule cannot read as text, such as a call or another query.
- A query whose M does not parse is not read; it gets a `PARSE_ISSUE` finding instead.

## Related rules

- `LOCAL_DRIVE_PATH` reports a file path written into a query, which a parameter holds in the same way.
- `DYNAMIC_DATA_SOURCE` reports a server built at run time, which the service cannot refresh; a parameter is the fix for both rules.

## Links

- [Using parameters](https://learn.microsoft.com/power-query/power-query-query-parameters)
- [SQL Server database connector](https://learn.microsoft.com/power-query/connectors/sql-server)
````

In `rules/dynamic-data-source.md`, add a last bullet under Related rules:

```markdown
- `HARDCODED_SERVER_NAME` reports a server written as text; a parameter is the fix for both rules.
```

In `rules/local-drive-path.md`, add a last bullet under Related rules:

```markdown
- `HARDCODED_SERVER_NAME` reports a database server written into a query, which a parameter holds in the same way.
```

- [ ] **Step 5: Regenerate and run the pages' tests**

```bash
npm run build -w @pbiplint/core && node scripts/sync-rule-pages.mjs
npx vitest run packages/core/test/rule-pages.test.ts -t "HARDCODED_SERVER_NAME|DYNAMIC_DATA_SOURCE|LOCAL_DRIVE_PATH"
```

Expected: PASS.

- [ ] **Step 6: Pin the rule's findings on m-zoo**

Spec 9.14's shapes are in m-zoo: `Server Literal` (two calls, fires once with the count), `Server Step` (a step holding the text, fires), and `Sql.Database(ServerName, ...)` in `Sales`, `Top Rows`, `Navigation Only`, `Group In Comment`, and `Native Lowercase` (a parameter, none fires). Write `.superpowers/sdd/2026-10-13-v3-rules-resolver/pin-server.json`:

```json
[
  {
    "rule": "HARDCODED_SERVER_NAME",
    "objectType": "Partition",
    "object": "Server Literal",
    "file": "definition/tables/Server Literal.tmdl",
    "line": 15,
    "column": 15,
    "detail": "query 'Server Literal', step 'Source': Sql.Database names its server as text (2 calls in this query); a parameter would hold it"
  },
  {
    "rule": "HARDCODED_SERVER_NAME",
    "objectType": "Partition",
    "object": "Server Step",
    "file": "definition/tables/Server Step.tmdl",
    "line": 16,
    "column": 15,
    "detail": "query 'Server Step', step 'Source': Sql.Database names its server as text; a parameter would hold it"
  }
]
```

```bash
node .superpowers/sdd/2026-10-13-v3-rules-resolver/pin-m-zoo.mjs .superpowers/sdd/2026-10-13-v3-rules-resolver/pin-server.json
npx vitest run packages/core/test/rules-m.test.ts
```

Expected: `2 added, 45 findings, 13 rules`; PASS. `rule-zoo` also gains one finding (its `Customer` table names its server as text), which no test pins, so nothing else moves.

- [ ] **Step 7: Move the counts by one rule**

119 rules, 37 built in, 14 Power Query rules, 13 of them pbiplint's own:

```bash
perl -pi -e 's/toBe\(118\)/toBe(119)/' packages/core/test/pack.test.ts
perl -pi -e 's/toBe\(118\)/toBe(119)/g; s/6 \+ 118\b/6 + 119/; s/"and 37 built into pbiplint\."/"and 38 built into pbiplint."/; s/"119 rules: 66/"120 rules: 66/; s/"118 rules: 66/"119 rules: 66/; s/and 36 built into pbiplint\./and 37 built into pbiplint./g; s/"92 rules: 66/"93 rules: 66/; s/and 21 built into pbiplint\./and 22 built into pbiplint./' packages/web/test/generate.test.ts
perl -0pi -e 's/\b13(\s+)rules/14$1rules/g; s/Power Query rules, 13 of them/Power Query rules, 14 of them/g; s/\b12 of them pbiplint/13 of them pbiplint/g; s/\b12 of pbiplint/13 of pbiplint/g; s/\b118(\s+)rules in all, 36 of/119$1rules in all, 37 of/g' README.md packages/cli/README.md packages/core/README.md packages/web/content/about.md
```

Add `"hardcoded-server-name",` to the slug list after `"hardcoded-secret-in-query",`. Check the prose as in Task 2.

- [ ] **Step 8: Run what this task touches, and measure**

```bash
npx vitest run packages/core/test packages/web/test packages/cli/test
npm run typecheck
npm run check:browser
```

Expected: PASS; about 227.3 KB. Projection + 2.1 KB, about 229.4 KB. Over 230.0 KB projected, or over 227.6 KB measured: stop, breakdown, report.

- [ ] **Step 9: Commit**

```bash
npx prettier --write packages/core/src/rules/pbiplint/power-query.ts packages/core/test/rules-power-query.test.ts packages/core/src/rules/rule-summaries.data.ts packages/cli/src/rule-help.data.ts packages/web/src/results/rule-guidance.data.ts packages/core/test/pack.test.ts packages/web/test/generate.test.ts
npm run lint
git add packages rules README.md tests/expectations/pbiplint/m-zoo.json
git commit -m "feat: HARDCODED_SERVER_NAME reports a server written as text

Once per query, on its first database connector whose server is text
written in place or held by a step, with the number of calls; a server
from a parameter is the fix. The server's name is never printed. 119
rules, 37 built in.

Part of #78.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: `LEGACY_EXCEL_FILE` and its page

**Files:**
- Modify: `packages/core/src/rules/pbiplint/power-query.ts`
- Create: `rules/legacy-excel-file.md`
- Modify: `rules/local-drive-path.md`, `rules/excel-use-headers.md` (Related rules)
- Modify (generated): the three `.data.ts` files
- Modify: `tests/expectations/pbiplint/m-zoo.json`
- Modify: `docs/superpowers/specs/2026-10-12-pbiplint-v3-power-query-layer-design.md` (section 9.17)
- Modify: the counts' files
- Test: `packages/core/test/rules-power-query.test.ts`

**Interfaces:**
- Consumes: `heldText` (Task 3), `boundValue`, `callOf`, `calls`, `mFinding`, `pbiplintRule`.
- Produces: `export const LEGACY_EXCEL_FILE: Rule`, appended to `powerQueryRules`.

- [ ] **Step 1: Write the failing tests**

The rule import gains `LEGACY_EXCEL_FILE` (after `KEEP_FIRST_ROWS_LEFT_IN`). Add at the end of the test file:

```ts
describe("LEGACY_EXCEL_FILE (v3 spec, section 9.17)", () => {
  const rule = LEGACY_EXCEL_FILE;
  it("is a built-in Power Query info rule on a query's owner", () => {
    isPowerQueryRule(rule, 1, "Error Prevention");
    expect(rule.name).toBe("Legacy Excel workbook");
    expect(rule.scope).toEqual(["Partition", "NamedExpression", "Table"]);
  });
  it("reports an .xls path, on the path", async () => {
    const tmdl = table(
      "Budget",
      "let",
      '\tSource = Excel.Workbook(File.Contents("C:\\Demo\\Data\\Budget.xls"), null, true)',
      "in",
      "\tSource",
    );
    expect(await mFindings(rule, tmdl)).toEqual([
      {
        objectType: "Partition",
        objectName: "Budget",
        location: { file: "inline.tmdl", line: 6, column: 44 },
        detail:
          "query 'Budget', step 'Source': the workbook is a legacy .xls file, read through the Access Database Engine",
      },
    ]);
  });
  it("reads .xlsb in any case, a path held by a step, and one in a parameter once however many queries read it", async () => {
    const tmdl =
      'expression BudgetFile = "C:\\Demo\\Data\\Budget.XLS" meta [IsParameterQuery = true, Type = "Text", IsParameterQueryRequired = true]\n\n' +
      table("A", "Excel.Workbook(File.Contents(BudgetFile), null, true)") +
      table("B", "Excel.Workbook(File.Contents(BudgetFile), null, true)") +
      table(
        "C",
        "let",
        '\tPath = "C:\\Demo\\Data\\Forecast.xlsb",',
        "\tBinary = File.Contents(Path),",
        "\tSource = Excel.Workbook(Binary, null, true)",
        "in",
        "\tSource",
      );
    expect((await mFindings(rule, tmdl)).map((f) => [f.objectName, f.detail])).toEqual([
      [
        "BudgetFile",
        "query 'BudgetFile': the workbook is a legacy .xls file, read through the Access Database Engine",
      ],
      [
        "C",
        "query 'C', step 'Path': the workbook is a legacy .xlsb file, read through the Access Database Engine",
      ],
    ]);
  });
  it("leaves alone .xlsx and .xlsm, a workbook from the web, and a path built at run time", async () => {
    const tmdl = table(
      "Budget",
      "let",
      '\tA = Excel.Workbook(File.Contents("C:\\Demo\\Data\\Budget.xlsx"), null, true),',
      '\tB = Excel.Workbook(File.Contents("C:\\Demo\\Data\\Budget.xlsm"), null, true),',
      '\tC = Excel.Workbook(Web.Contents("https://files.example.com/Budget.xls"), null, true),',
      '\tD = Excel.Workbook(File.Contents(Text.Combine({"C:\\Demo\\Data\\", "Budget.xls"})), null, true)',
      "in",
      "\tD",
    );
    expect(await mFindings(rule, tmdl)).toEqual([]);
  });
});
```

- [ ] **Step 2: Run them to make sure they fail**

Run: `npx vitest run packages/core/test/rules-power-query.test.ts -t LEGACY`
Expected: FAIL: `LEGACY_EXCEL_FILE` is not exported.

- [ ] **Step 3: Write the rule**

Add after `HARDCODED_SERVER_NAME`:

```ts
// An .xls or .xlsb workbook, read through the Access Database Engine, which the service's cloud
// cannot install (v3 spec, section 9.17). Only a path the resolver can read is checked.
export const LEGACY_EXCEL_FILE = pbiplintRule({
  id: "LEGACY_EXCEL_FILE",
  name: "Legacy Excel workbook",
  category: "Error Prevention",
  severity: 1,
  scope: ["Partition", "NamedExpression", "Table"],
  layer: "powerquery",
  check: (_project, { indexes: { m } }) => {
    const reported = new Set<string>();
    return m.queries.flatMap((q) =>
      calls(q).flatMap((c) => {
        const file =
          c.name === "Excel.Workbook" && c.args[0] && callOf(boundValue(m, q, c.args[0]).node);
        const path =
          file && file.name === "File.Contents" && file.args[0] && heldText(m, q, file.args[0]);
        const ext = path && /\.(xlsb?)$/i.exec(path.value.trim());
        if (!path || !ext) return [];
        const key = `${path.query.kind}:${path.query.name}:${path.node.id}`;
        if (reported.has(key)) return [];
        reported.add(key);
        return [
          mFinding(
            m,
            path.query,
            path.node,
            `the workbook is a legacy .${ext[1]!.toLowerCase()} file, read through the Access Database Engine`,
          ),
        ];
      }),
    );
  },
});
```

and `powerQueryRules` gains `LEGACY_EXCEL_FILE,` after `HARDCODED_SERVER_NAME,`.

Run: `npx vitest run packages/core/test/rules-power-query.test.ts`
Expected: PASS.

- [ ] **Step 4: Write the page**

Create `rules/legacy-excel-file.md`:

````markdown
---
id: LEGACY_EXCEL_FILE
name: "Legacy Excel workbook"
category: Error Prevention
severity: info
scope: [Partition, NamedExpression, Table]
status: builtin
layer: powerquery
video:
sources:
---

# Legacy Excel workbook

## What it checks

Power Query queries that read an `.xls` or `.xlsb` workbook, which Power Query opens through the Access Database Engine rather than reading the file itself.

Each finding names the partition, the shared expression, or, for an incremental refresh policy's own query, the table that holds the path. Its detail names the query and the step, then the file type, as `query 'Budget', step 'Source': the workbook is a legacy .xls file, read through the Access Database Engine`. The location is the line and column of the path in the TMDL file, once however many queries read it.

## Example

```tmdl fires
table Budget
	column Amount
		dataType: double
		summarizeBy: sum
		sourceColumn: Amount

	partition Budget = m
		mode: import
		source =
				let
					Source = Excel.Workbook(File.Contents("C:\Demo\Data\Budget.xls"), null, true),
					Sheet = Source{[Item = "Budget", Kind = "Sheet"]}[Data]
				in
					Sheet
```

```tmdl fixed
table Budget
	column Amount
		dataType: double
		summarizeBy: sum
		sourceColumn: Amount

	partition Budget = m
		mode: import
		source =
				let
					Source = Excel.Workbook(File.Contents("C:\Demo\Data\Budget.xlsx"), null, true),
					Sheet = Source{[Item = "Budget", Kind = "Sheet"]}[Data]
				in
					Sheet
```

## Why it matters

Power Query reads an `.xlsx` workbook itself, but not an older one. Microsoft explains: "Power Query reads legacy workbooks (such as .xls or .xlsb) using the Access Database Engine (or ACE) OLEDB provider. Because of this dependency, you might come across unexpected behaviors when importing legacy workbooks that don't occur when importing OpenXML workbooks (such as .xlsx)." ([Excel connector, Legacy ACE connector](https://learn.microsoft.com/power-query/connectors/excel#legacy-ace-connector)). The same section lists them: numbers that arrive as their formatted text, columns typed from the first eight rows with nulls for anything that does not match, and results that change between refreshes. The engine also has to be installed wherever the refresh runs, and "ACE can't be installed in cloud service environments." ([Excel connector, Prerequisites](https://learn.microsoft.com/power-query/connectors/excel#prerequisites)), so a refresh in the cloud needs a gateway on a machine that has it.

## How to fix it

Open the workbook in Excel and save it as an Excel Workbook (`.xlsx`) with File, Save As. Then in Power BI Desktop, choose Transform data, select the query, select its Source step in Applied steps, open the step's settings with the gear beside it, and choose the new file. In the TMDL file, the path is in the partition's `source` block, or in the expression's value when a parameter holds it; change its extension to `.xlsx`, as the fixed example does.

## When to ignore it

When the workbook is produced by a system that can only write the legacy format, and its data is simple enough that the engine reads it right, a gateway with the engine installed keeps it refreshing. The finding then says only that the refresh depends on that gateway.

## Quirks

- Only a path given to `File.Contents` inside `Excel.Workbook` is read, written as text in the call, in a step it reads, or in a parameter. A path built at run time, or a workbook read from the web or SharePoint, is not read.
- The extension is read in any case, so `.XLS` counts. `.xlsx` and `.xlsm` are left alone.
- A path that several queries read is one finding, on the path.
- A query whose M does not parse is not read; it gets a `PARSE_ISSUE` finding instead.

## Related rules

- `EXCEL_USE_HEADERS` reports another way a workbook's reading can depend on the machine that refreshes it.
- `LOCAL_DRIVE_PATH` reports the same path when it is on a local drive, as a workbook's often is.

## Links

- [Excel connector](https://learn.microsoft.com/power-query/connectors/excel)
- [Excel.Workbook](https://learn.microsoft.com/powerquery-m/excel-workbook)
````

In `rules/local-drive-path.md`, add a last bullet under Related rules:

```markdown
- `LEGACY_EXCEL_FILE` reports an `.xls` or `.xlsb` workbook, often one read from a local path.
```

In `rules/excel-use-headers.md`, add a last bullet under Related rules:

```markdown
- `LEGACY_EXCEL_FILE` reports a workbook in the legacy format, whose reading also depends on the machine that refreshes it.
```

- [ ] **Step 5: Regenerate and run the pages' tests**

```bash
npm run build -w @pbiplint/core && node scripts/sync-rule-pages.mjs
npx vitest run packages/core/test/rule-pages.test.ts -t "LEGACY_EXCEL_FILE|LOCAL_DRIVE_PATH|EXCEL_USE_HEADERS"
```

Expected: PASS.

- [ ] **Step 6: Pin the rule's finding on m-zoo**

Spec 9.17's shapes are in m-zoo's `Budget` table: the `.xls` path of the `Legacy` step (fires, on the same literal `LOCAL_DRIVE_PATH` reports) and three `.xlsx` paths (none fires). Write `.superpowers/sdd/2026-10-13-v3-rules-resolver/pin-legacy.json`:

```json
[
  {
    "rule": "LEGACY_EXCEL_FILE",
    "objectType": "Partition",
    "object": "Budget",
    "file": "definition/tables/Budget.tmdl",
    "line": 18,
    "column": 44,
    "detail": "query 'Budget', step 'Legacy': the workbook is a legacy .xls file, read through the Access Database Engine"
  }
]
```

```bash
node .superpowers/sdd/2026-10-13-v3-rules-resolver/pin-m-zoo.mjs .superpowers/sdd/2026-10-13-v3-rules-resolver/pin-legacy.json
npx vitest run packages/core/test/rules-m.test.ts
```

Expected: `1 added, 46 findings, 14 rules`; PASS.

- [ ] **Step 7: The spec**

In the spec, section 9.17, add a last bullet after "- **Corpus:** 8 calls in 1 model (1 repository).":

```markdown
- **Amended October 13, 2026** (pull request 6): the finding is on the path, once however many workbook calls read it, as `HARDCODED_SECRET_IN_QUERY` reports a parameter (section 9.5). The corpus's 8 calls read one parameter's path, so the corpus count is 1 finding in 1 model (1 repository).
```

- [ ] **Step 8: Move the counts by one rule**

120 rules, 38 built in, 15 Power Query rules, 14 of them pbiplint's own:

```bash
perl -pi -e 's/toBe\(119\)/toBe(120)/' packages/core/test/pack.test.ts
perl -pi -e 's/toBe\(119\)/toBe(120)/g; s/6 \+ 119\b/6 + 120/; s/"and 38 built into pbiplint\."/"and 39 built into pbiplint."/; s/"120 rules: 66/"121 rules: 66/; s/"119 rules: 66/"120 rules: 66/; s/and 37 built into pbiplint\./and 38 built into pbiplint./g; s/"93 rules: 66/"94 rules: 66/; s/and 22 built into pbiplint\./and 23 built into pbiplint./' packages/web/test/generate.test.ts
perl -0pi -e 's/\b14(\s+)rules/15$1rules/g; s/Power Query rules, 14 of them/Power Query rules, 15 of them/g; s/\b13 of them pbiplint/14 of them pbiplint/g; s/\b13 of pbiplint/14 of pbiplint/g; s/\b119(\s+)rules in all, 37 of/120$1rules in all, 38 of/g' README.md packages/cli/README.md packages/core/README.md packages/web/content/about.md
```

Add `"legacy-excel-file",` to the slug list after `"keep-first-rows-left-in",`. Check the prose: `git diff af69278 -- README.md packages/cli/README.md packages/core/README.md packages/web/content/about.md` shows, across the pull request so far, only `11` to `15` Power Query rules, `10` to `14` of pbiplint's own, `116` to `120` rules in all, and `34` to `38` built in.

- [ ] **Step 9: Run what this task touches, and measure**

```bash
npx vitest run packages/core/test packages/web/test packages/cli/test
npm run typecheck
npm run check:browser
```

Expected: PASS; about 228.1 KB. Projection + 1.3 KB, about 229.4 KB. Over 230.0 KB projected, or over 228.4 KB measured: stop, breakdown, report.

- [ ] **Step 10: Commit**

```bash
npx prettier --write packages/core/src/rules/pbiplint/power-query.ts packages/core/test/rules-power-query.test.ts packages/core/src/rules/rule-summaries.data.ts packages/cli/src/rule-help.data.ts packages/web/src/results/rule-guidance.data.ts packages/core/test/pack.test.ts packages/web/test/generate.test.ts
npm run lint
git add packages rules README.md tests/expectations/pbiplint/m-zoo.json docs/superpowers/specs/2026-10-12-pbiplint-v3-power-query-layer-design.md
git commit -m "feat: LEGACY_EXCEL_FILE reports an .xls or .xlsb workbook

A workbook Power Query reads through the Access Database Engine is an
info finding, on its path, once however many queries read it. 120 rules,
38 built in.

Part of #78.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: The corpus diff, the spot checks, and the whole branch

**Files:**
- Reuse (not committed): `.superpowers/sdd/2026-10-13-v3-reader/corpus-diff.mts`
- Create (not committed): `.superpowers/sdd/2026-10-13-v3-rules-resolver/rule-counts.mts`

**Interfaces:**
- Consumes: `lint` from `packages/core/src/index.ts`, in the branch and in a base core unpacked from `origin/release/0.3.0`.

- [ ] **Step 1: Unpack the base core**

```bash
mktemp -d "$CLAUDE_JOB_DIR/tmp/pr6.XXXX"
```

It prints a path; call it `<base>` below and type it out literally in each command. Then:

```bash
git archive origin/release/0.3.0 packages/core | tar -x -C <base>
ln -s "$PWD/node_modules" <base>/node_modules
ln -s "$PWD/packages/core/node_modules" <base>/packages/core/node_modules
```

- [ ] **Step 2: Run the corpus diff**

```bash
npx tsx .superpowers/sdd/2026-10-13-v3-reader/corpus-diff.mts <base> ~/Projects/pbiplint/assets/pbip-lint-spike/research-104 > "$CLAUDE_JOB_DIR/tmp/pr6-corpus-diff.txt" 2>&1
grep -E "models linted|^[+-][0-9]|ERROR" "$CLAUDE_JOB_DIR/tmp/pr6-corpus-diff.txt"
```

Expected, in about a minute and a half, as the scratch run printed it (October 13, 2026):

```
1321 models linted
+2462 HARDCODED_SERVER_NAME
+1 LEGACY_EXCEL_FILE
+16 DYNAMIC_DATA_SOURCE
+72 HARDCODED_SECRET_IN_QUERY
```

(in some order). Only `+` lines, only these four rules, no `-` line, no `ERROR`. The diff prints each finding's detail, which holds no credential (Task 4 proves it), so its output file is safe to keep. **Any other rule, or any `-` line, stops the task:** report it with the examples the diff prints.

- [ ] **Step 3: Count each rule and pull examples for the spot check**

Create `.superpowers/sdd/2026-10-13-v3-rules-resolver/rule-counts.mts`:

```ts
// The rules of pull request 6 on the corpus (v3 spec, section 11.4): occurrences, models, and
// repositories per rule, and examples for a spot check. For HARDCODED_SECRET_IN_QUERY it never
// prints a value: each example line has every text literal replaced by «…» and its comments cut,
// so only the line's shape shows. Imports the code under the working directory.
// Usage, from the repository root: npx tsx <this file> <corpus dir> [examples per rule]
import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";

const [corpus, many = "60"] = process.argv.slice(2);
const core = await import(join(process.cwd(), "packages/core/src/index.ts"));
const RULES = ["DYNAMIC_DATA_SOURCE", "HARDCODED_SECRET_IN_QUERY", "HARDCODED_SERVER_NAME", "LEGACY_EXCEL_FILE", "EXTENSION_FILTER_CASE"];
const SECRET = "HARDCODED_SECRET_IN_QUERY";
/**
 * A line's shape: every text literal replaced by «…», then comments cut, and a text that runs past
 * the line's end cut from its quote. Holds no literal's value.
 */
const shape = (line: string): string =>
  line
    .replace(/"(?:[^"]|"")*"/g, "«…»")
    .replace(/\/\/.*$/, "")
    .replace(/\/\*.*?(\*\/|$)/g, "")
    .replace(/".*$/, "«…");

const roots: string[] = [];
const walk = (d: string) => {
  for (const e of readdirSync(d, { withFileTypes: true })) {
    if (!e.isDirectory() || e.name === ".git" || e.name === "node_modules") continue;
    const p = join(d, e.name);
    if (e.name === "definition" && /\.(SemanticModel|Dataset)$/.test(d)) roots.push(p);
    else walk(p);
  }
};
walk(corpus!);
const tmdls = (d: string): string[] =>
  readdirSync(d, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? tmdls(join(d, e.name)) : e.name.endsWith(".tmdl") ? [join(d, e.name)] : [],
  );

const stats = new Map(
  RULES.map((id) => [id, { n: 0, models: new Set<string>(), repos: new Set<string>(), examples: [] as string[], details: new Map<string, number>() }]),
);
for (const root of roots) {
  const model = relative(corpus!, root);
  const files = tmdls(root).map((f) => ({ path: relative(root, f).split("\\").join("/"), text: readFileSync(f, "utf8") }));
  const result = await core.lint(files, { config: { failOn: "none" } });
  for (const f of result.findings) {
    const s = stats.get(f.ruleId);
    if (!s) continue;
    s.n++;
    s.models.add(model);
    s.repos.add(model.split("/").slice(0, 2).join("/"));
    // The detail without its query and step: what kind of finding it is.
    const kind = (f.detail ?? "").replace(/^query .*?: /, "").replace(/\(\d+ calls/, "(N calls");
    s.details.set(kind, (s.details.get(kind) ?? 0) + 1);
    if (s.examples.length < Number(many) || s.n % 200 === 0) {
      const text = files.find((x) => x.path === f.location?.file)?.text ?? "";
      const raw = text.split(/\r\n?|\n/)[(f.location?.line ?? 1) - 1]?.trim() ?? "";
      const line = (f.ruleId === SECRET ? shape(raw) : raw).slice(0, 200);
      s.examples.push(`${model} ${f.location?.file}:${f.location?.line}:${f.location?.column ?? ""} ${f.detail}\n      ${line}`);
    }
  }
}
console.log(`${roots.length} models`);
for (const [id, s] of stats) {
  console.log(`${id}: ${s.n} occurrences, ${s.models.size} models, ${s.repos.size} repositories`);
  for (const [k, n] of [...s.details].sort((a, b) => b[1] - a[1])) console.log(`    ${n} × ${k}`);
  console.log(`  ${s.examples.join("\n  ")}`);
}
```

It prints a credential's line only as its shape: every text literal becomes `«…»`, comments are cut, and a text that runs past the line's end is cut from its quote, so no value is written to its output. Then:

```bash
npx tsx .superpowers/sdd/2026-10-13-v3-rules-resolver/rule-counts.mts ~/Projects/pbiplint/assets/pbip-lint-spike/research-104 60 > "$CLAUDE_JOB_DIR/tmp/pr6-rule-counts.txt" 2>&1
grep -E "^[A-Z_]+:|^    [0-9]+ ×" "$CLAUDE_JOB_DIR/tmp/pr6-rule-counts.txt"
```

Expected, from the scratch run, with spec 11.4's expectation beside it:

| Rule | Occurrences, models, repositories | Spec 11.4 (occurrences, models) |
| --- | --- | --- |
| `DYNAMIC_DATA_SOURCE` | 16, 8, 6 | 18, 13 or fewer |
| `HARDCODED_SECRET_IN_QUERY` | 72, 6, 6 | 60 or more, 2 or more |
| `HARDCODED_SERVER_NAME` | 2,462, 466, 166 | fewer than 2,463, 465 |
| `LEGACY_EXCEL_FILE` | 1, 1, 1 | 8, 1 |

**The differences, explained, and expected:**

- `DYNAMIC_DATA_SOURCE`: 16 rather than 18. The research's 22 less its 4 function-parameter occurrences was 18; the rule as first written found 19 in 11 models, and Task 1's `if` and `error` reading leaves out 3 custom functions whose address is a parameter either way. By kind: 8 `File.Contents` paths and 2 `Web.Contents` addresses read from the rows, and 3 `File.Contents` and 3 `Web.Contents` built by a function call.
- `HARDCODED_SECRET_IN_QUERY`: 72 in 6 models. The research's 57 `Authorization` headers and 3 URL keys are all here, with 7 `key` parameters of weather and time-zone services' addresses the research did not count, 2 `Authorization` headers held by steps, and 3 credentials reached through `&` joins or parameters (Task 3's spec bullet).
- `HARDCODED_SERVER_NAME`: 2,462 queries in 466 models. No corpus query names its server as text in two calls (no detail carries a count), so once per query lowers the research's 2,463 calls by little. 15 findings are a server held by a step, which the research's text count did not follow, and they are the likely source of the one model more. By kind: 1,208 servers with a dot, colon, comma, or backslash, 744 bare names, 470 `localhost`-style local servers (the page's When to ignore it names them), 25 `powerbi://` addresses, and those 15.
- `LEGACY_EXCEL_FILE`: 1 finding, where the research counted 8 calls: all 8 read one parameter's path, reported once (Task 6's spec bullet).

If any count is off by more than a few, stop and report the line with its examples.

- [ ] **Step 4: Spot-check each rule for false positives**

Read each rule's examples in `$CLAUDE_JOB_DIR/tmp/pr6-rule-counts.txt` and confirm:

- `DYNAMIC_DATA_SOURCE` (all 16): a data source call whose first argument is `[column]` or `_` inside `each` (row), a field of another query's table (row), or a function call such as `Text.Combine`, `Text.TrimEnd`, `List.First`, or `Number.ToText` (computed). None is a parameter, a literal, or a custom function's own parameter, and none is an `if` whose branches are static.
- `HARDCODED_SECRET_IN_QUERY` (all 72, by shape only): the detail names a header, field, or parameter on spec 9.5's lists, and the line's shape shows that place holding `«…»` or a name. Do not open the files to read a value; if a shape leaves a doubt, count it as one to report, by its detail and shape, without the value.
- `HARDCODED_SERVER_NAME` (the sixty printed and every two hundredth): the first argument of a connector on spec 9.14's list is text, or a step holding text; never a parameter.
- `LEGACY_EXCEL_FILE` (1): a parameter whose text ends `.xls`, read by `Excel.Workbook(File.Contents(...))`.

Write one line per rule into `progress.md`: examples read, false positives found (expected: none). A false positive stops the task: report it with its detail and shape.

- [ ] **Step 5: Run the whole suite and every check**

```bash
npm run lint
npm run typecheck
npm test
npm run check:browser
npm run build
npm run check:network
npm run check:pack
npm run test:bundle -w pbiplint
npm run test:e2e
git grep -n $'\u2014' -- $(git diff --name-only origin/release/0.3.0...HEAD) || echo "no em dashes"
```

(If a script name differs in this repository's `package.json`, use the name CI's `test` job runs, from `.github/workflows/ci.yml`.) Expected: all pass, `check:browser` at about 228.1 KB, the sample's 280 findings unchanged in `test:bundle`, and the last line prints `no em dashes`.

- [ ] **Step 6: Record the result**

Write into `progress.md`: the corpus diff's `+` lines; the table of Step 3 as measured; the explanations; the spot-check lines; each task's `check:browser` line; the e2e engines that ran. Nothing is committed in this task.

---

### Task 8: `EXTENSION_FILTER_CASE`, if the Desktop check keeps it

This task runs last, and has three paths. Pick one in Step 0 and follow only its steps.

**Files (ship path):**
- Modify: `packages/core/src/rules/pbiplint/power-query.ts`
- Create: `rules/extension-filter-case.md`
- Modify: `rules/local-drive-path.md` (Related rules)
- Modify (generated): the three `.data.ts` files
- Modify: `tests/expectations/pbiplint/m-zoo.json`, `tests/expectations/shelfmart.report.json`
- Modify: the counts' files
- Test: `packages/core/test/rules-power-query.test.ts`

**Files (drop path):** `docs/superpowers/specs/2026-10-12-pbiplint-v3-power-query-layer-design.md` (sections 9.10 and 10.3) only.

**Interfaces:**
- Consumes: `boundValue`, `callOf`, `calls`, `identifierName`, `isWithin`, `nodesOfKind`, `textLiterals`, `textValue`, `unwrap`, and the type `MCall` (`m/ast.ts`); `mFinding`; `pbiplintRule`.
- Produces (ship path): `export const EXTENSION_FILTER_CASE: Rule`, appended to `powerQueryRules`.

- [ ] **Step 0: Read the Desktop check**

```bash
grep -n "Desktop check (Extension case)" .superpowers/sdd/2026-10-13-v3-rules-resolver/progress.md || echo "no answer yet"
```

- **`keeps case`:** the ship path, Steps 1 to 10.
- **`lowercases`:** the drop path, Step D.
- **No line:** the wait path. Commit nothing for this rule, write `Task 8: waits for the Desktop check; EXTENSION_FILTER_CASE goes in a pull request of its own (spec 12.2)` into `progress.md`, and stop. The branch is complete with four rules (120 rules, 38 built in), and the Finish section says so.

- [ ] **Step D (drop path only): The spec note, and nothing else**

No code, page, pin, or count changes; m-zoo's three shapes in `Sales Files` stay as harmless data. In the spec, section 9.10, add a last bullet after "- **Corpus:** 54 filters over `Folder.Files` ...":

```markdown
- **Dropped** (Michael's Desktop check, recorded by the coordinator in pull request 6's ledger): `Folder.Files` lowercases the **Extension** column, so a filter on `".csv"` already matches `B.CSV`, and the rule would report nothing true. It has no code and no page; m-zoo's three shapes stay as data.
```

and in section 10.3 nothing changes (it already gives the counts without the rule: 120 rules, 38 built in). Then:

```bash
git add docs/superpowers/specs/2026-10-12-pbiplint-v3-power-query-layer-design.md
git commit -m "docs: EXTENSION_FILTER_CASE dropped after the Desktop check

Folder.Files lowercases the Extension column, so the rule would report
nothing true (spec 9.10).

Part of #78.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

Write `Task 8: dropped (Desktop check: lowercases); spec note committed` into `progress.md`. The task ends here.

- [ ] **Step 1: Write the failing tests**

The rule import gains `EXTENSION_FILTER_CASE` (after `EXCEL_USE_HEADERS`). Add at the end of the test file:

```ts
describe("EXTENSION_FILTER_CASE (v3 spec, section 9.10)", () => {
  const rule = EXTENSION_FILTER_CASE;
  it("is a built-in Power Query warning on a query's owner", () => {
    isPowerQueryRule(rule, 2, "Error Prevention");
    expect(rule.name).toBe("File extension filter misses other cases");
    expect(rule.scope).toEqual(["Partition", "NamedExpression", "Table"]);
  });
  it("reports an extension compared as written over a folder listing, on the comparison", async () => {
    const tmdl = table(
      "Sales Files",
      "let",
      '\tSource = Folder.Files("C:\\Demo\\Data\\Sales"),',
      '\t#"Filtered Rows" = Table.SelectRows(Source, each [Extension] = ".csv")',
      "in",
      '\t#"Filtered Rows"',
    );
    expect(await mFindings(rule, tmdl)).toEqual([
      {
        objectType: "Partition",
        objectName: "Sales Files",
        location: { file: "inline.tmdl", line: 7, column: 55 },
        detail:
          "query 'Sales Files', step 'Filtered Rows': the extension test matches \".csv\" but not \".CSV\"",
      },
    ]);
  });
  it("reads <>, the text first, an upper-case extension, steps between, and every listing function", async () => {
    const tmdl = table(
      "Files",
      "let",
      '\tA = Table.SelectRows(SharePoint.Files("https://example.sharepoint.com/sites/s"), each ".XLSX" = [Extension]),',
      '\tB = Table.SelectRows(Table.RemoveColumns(Folder.Contents("C:\\Demo\\Data"), {"Attributes"}), each [Extension] <> ".tmp"),',
      '\tListed = SharePoint.Contents("https://example.sharepoint.com/sites/s"),',
      "\tKept = Listed,",
      '\tC = Table.SelectRows(Kept, each [Name] <> "x" and [Extension] = ".Json")',
      "in",
      "\tC",
    );
    expect((await mFindings(rule, tmdl)).map((f) => f.detail)).toEqual([
      "query 'Files', step 'A': the extension test matches \".XLSX\" but not \".xlsx\"",
      "query 'Files', step 'B': the extension test matches \".tmp\" but not \".TMP\"",
      "query 'Files', step 'C': the extension test matches \".Json\" but not \".json\"",
    ]);
  });
  it("leaves alone a comparison that folds case, a lowercased column, another source, and text with no letter", async () => {
    const tmdl = table(
      "Files",
      "let",
      '\tSource = Folder.Files("C:\\Demo\\Data\\Sales"),',
      '\tA = Table.SelectRows(Source, each Comparer.OrdinalIgnoreCase([Extension], ".csv") = 0),',
      '\tB = Table.SelectRows(Source, each Text.Lower([Extension]) = ".csv"),',
      '\tLowercased = Table.TransformColumns(Source, {{"Extension", Text.Lower, type text}}),',
      '\tC = Table.SelectRows(Lowercased, each [Extension] = ".csv"),',
      '\tD = Table.SelectRows(Lakehouse.Contents(null), each [Extension] = ".csv"),',
      '\tE = Table.SelectRows(Source, each [Extension] = ".7"),',
      '\tF = Table.SelectRows(Source, each [Name] = "a.csv")',
      "in",
      "\tF",
    );
    expect(await mFindings(rule, tmdl)).toEqual([]);
  });
});
```

- [ ] **Step 2: Run them to make sure they fail**

Run: `npx vitest run packages/core/test/rules-power-query.test.ts -t EXTENSION`
Expected: FAIL: `EXTENSION_FILTER_CASE` is not exported.

- [ ] **Step 3: Write the rule**

In `packages/core/src/rules/pbiplint/power-query.ts`, the `m/ast.js` import gains `type MCall,` after `calls,`. Add after `LEGACY_EXCEL_FILE`:

```ts
/** The functions that list a folder's files, with an Extension column. */
const FILE_LISTING = /^(?:Folder|SharePoint)\.(?:Files|Contents)$/;

/**
 * Whether a table is a file listing whose Extension column keeps its case: followed back through
 * each step's first argument to one of the listing functions, with no Table.TransformColumns on the
 * way that names the Extension column, which may lowercase it.
 */
function listingKeepsCase(m: MIndex, q: MQuery, table: Node): boolean {
  const transformsExtension = (c: MCall): boolean =>
    c.name === "Table.TransformColumns" &&
    textLiterals(q).some((t) => t.value === "Extension" && isWithin(q, t.node, c.node));
  for (let c = callOf(boundValue(m, q, table).node), depth = 0; c && depth < 50; depth++) {
    if (FILE_LISTING.test(c.name)) return true;
    if (transformsExtension(c) || !c.args[0]) return false;
    c = callOf(boundValue(m, q, c.args[0]).node);
  }
  return false;
}

/** `[Extension]`, the file listing's column, as a row filter reads it. */
const isExtension = (n: Node): boolean => {
  const v = unwrap(n);
  return v.kind === Kind.FieldSelector && identifierName(v.content.literal) === "Extension";
};

// A row filter over a file listing that compares [Extension] with text as written, so ".csv" misses
// "B.CSV" (v3 spec, section 9.10). A comparison through Text.Lower, Text.Upper, or
// Comparer.OrdinalIgnoreCase, and a listing whose Extension column a Table.TransformColumns step
// changes first, are left alone.
export const EXTENSION_FILTER_CASE = pbiplintRule({
  id: "EXTENSION_FILTER_CASE",
  name: "File extension filter misses other cases",
  category: "Error Prevention",
  severity: 2,
  scope: ["Partition", "NamedExpression", "Table"],
  layer: "powerquery",
  check: (_project, { indexes: { m } }) =>
    m.queries.flatMap((q) =>
      calls(q).flatMap((c) => {
        const [table, condition] = c.args;
        if (c.name !== "Table.SelectRows" || !table || !condition || !listingKeepsCase(m, q, table))
          return [];
        return nodesOfKind(q, Kind.EqualityExpression).flatMap((node) => {
          if (node.kind !== Kind.EqualityExpression || !isWithin(q, node, condition)) return [];
          const text = isExtension(node.left)
            ? textValue(unwrap(node.right))
            : isExtension(node.right)
              ? textValue(unwrap(node.left))
              : undefined;
          if (text === undefined || !/[a-z]/i.test(text)) return [];
          const other = text === text.toLowerCase() ? text.toUpperCase() : text.toLowerCase();
          return [mFinding(m, q, node, `the extension test matches "${text}" but not "${other}"`)];
        });
      }),
    ),
});
```

and `powerQueryRules` gains `EXTENSION_FILTER_CASE,` after `LEGACY_EXCEL_FILE,`.

Run: `npx vitest run packages/core/test/rules-power-query.test.ts`
Expected: PASS.

- [ ] **Step 4: Write the page**

Create `rules/extension-filter-case.md`:

````markdown
---
id: EXTENSION_FILTER_CASE
name: "File extension filter misses other cases"
category: Error Prevention
severity: warning
scope: [Partition, NamedExpression, Table]
status: builtin
layer: powerquery
video:
sources:
---

# File extension filter misses other cases

## What it checks

Power Query filters on a folder's files that compare the `Extension` column with text such as `".csv"` as written, so a file whose extension is in other capitals, such as `.CSV`, is left out.

Each finding names the partition, the shared expression, or, for an incremental refresh policy's own query, the table. Its detail names the query and the step, then the text and the case it misses, as `query 'Sales Files', step 'Filtered Rows': the extension test matches ".csv" but not ".CSV"`. The location is the line and column of the comparison in the TMDL file.

## Example

```tmdl fires
table 'Sales Files'
	column Name
		dataType: string
		summarizeBy: none
		sourceColumn: Name

	partition 'Sales Files' = m
		mode: import
		source =
				let
					Source = Folder.Files("C:\Demo\Data\Sales"),
					#"Filtered Rows" = Table.SelectRows(Source, each [Extension] = ".csv")
				in
					#"Filtered Rows"
```

```tmdl fixed
table 'Sales Files'
	column Name
		dataType: string
		summarizeBy: none
		sourceColumn: Name

	partition 'Sales Files' = m
		mode: import
		source =
				let
					Source = Folder.Files("C:\Demo\Data\Sales"),
					#"Filtered Rows" = Table.SelectRows(Source, each Comparer.OrdinalIgnoreCase([Extension], ".csv") = 0)
				in
					#"Filtered Rows"
```

## Why it matters

The Folder and SharePoint folder connectors list each file's extension as the file system or the site has it, and `=` compares text exactly, capitals included. A folder that collects files from several people or systems sooner or later holds a `Sales.CSV` beside the `sales.csv` files, and the filter drops it without an error, so its rows are missing from every total. Microsoft's own example for SharePoint folders compares the extension without regard to case, and says why: "The extension comparison is case-insensitive, so it also matches `.XLSX`." ([SharePoint.Files, Example 2](https://learn.microsoft.com/powerquery-m/sharepoint-files#example-2)).

## How to fix it

In Power BI Desktop, choose Transform data, select the query, and select the filter step in Applied steps. In the formula bar, change `[Extension] = ".csv"` to `Comparer.OrdinalIgnoreCase([Extension], ".csv") = 0`, as the fixed example and Microsoft's example write it. Without editing the formula, insert a step before the filter instead: select the Extension column and choose Transform, Format, lowercase, so every extension is in lower case by the time the filter reads it. In the TMDL file, the filter is a `Table.SelectRows` line in the partition's `source` block.

## When to ignore it

When the files come from one system that always writes the extension in the same case, such as a service's own log files, the filter cannot miss one. A comparison that does not change case says so to the next reader too.

## Quirks

- Read: `[Extension] = "<text>"` or `<>`, either way round, inside a `Table.SelectRows` whose table is a `Folder.Files`, `Folder.Contents`, `SharePoint.Files`, or `SharePoint.Contents` listing, followed back through the steps before it.
- A comparison through `Text.Lower`, `Text.Upper`, or `Comparer.OrdinalIgnoreCase` is left alone. So is a listing with a `Table.TransformColumns` step on its Extension column before the filter, whatever that step does, since lowercasing the column there is one of the fixes above.
- A listing the rule cannot follow back to one of the four functions, such as a lakehouse's or a storage account's, is not read.
- Text with no letter in it, such as `".7"`, cannot miss a case and is left alone.
- Each comparison is its own finding.
- A query whose M does not parse is not read; it gets a `PARSE_ISSUE` finding instead.

## Related rules

- `LOCAL_DRIVE_PATH` reports the folder's path when it is on a local drive, as a folder of files often is.

## Links

- [Folder connector](https://learn.microsoft.com/power-query/connectors/folder)
- [Comparer.OrdinalIgnoreCase](https://learn.microsoft.com/powerquery-m/comparer-ordinalignorecase)
````

In `rules/local-drive-path.md`, add a last bullet under Related rules:

```markdown
- `EXTENSION_FILTER_CASE` reports a filter on a folder's files that misses an extension written in other capitals, often over a local folder.
```

- [ ] **Step 5: Regenerate and run the pages' tests**

```bash
npm run build -w @pbiplint/core && node scripts/sync-rule-pages.mjs
npx vitest run packages/core/test/rule-pages.test.ts -t "EXTENSION_FILTER_CASE|LOCAL_DRIVE_PATH"
```

Expected: PASS.

- [ ] **Step 6: Pin the rule's findings**

Spec 9.10's shapes are in m-zoo's `Sales Files`: `[Extension] = ".csv"` over `Folder.Files` (fires), the same through `Comparer.OrdinalIgnoreCase` (does not), and after a lowercase step (does not). Write `.superpowers/sdd/2026-10-13-v3-rules-resolver/pin-extension.json`:

```json
[
  {
    "rule": "EXTENSION_FILTER_CASE",
    "objectType": "Partition",
    "object": "Sales Files",
    "file": "definition/tables/Sales Files.tmdl",
    "line": 15,
    "column": 55,
    "detail": "query 'Sales Files', step 'Filtered Rows': the extension test matches \".csv\" but not \".CSV\""
  }
]
```

```bash
node .superpowers/sdd/2026-10-13-v3-rules-resolver/pin-m-zoo.mjs .superpowers/sdd/2026-10-13-v3-rules-resolver/pin-extension.json
npx vitest run packages/core/test/rules-m.test.ts
```

Expected: `1 added, 47 findings, 15 rules`; PASS.

shelfmart's model filters its weather files by extension twice, so `report-parity.test.ts` needs the rule in its native map. In `tests/expectations/shelfmart.report.json`, after the `DEFAULT_STEP_NAMES` array (its last entry is `"Weather Data"`), add the key so the map ends:

```json
      "Transform Sample File",
      "Weather Data"
    ],
    "EXTENSION_FILTER_CASE": [
      "Sample File",
      "Weather Data"
    ]
  },
```

Run: `npx vitest run packages/core/test/report-parity.test.ts`
Expected: PASS. No other report fixture fires the rule.

- [ ] **Step 7: Move the counts by one rule**

121 rules, 39 built in, 16 Power Query rules, 15 of them pbiplint's own:

```bash
perl -pi -e 's/toBe\(120\)/toBe(121)/' packages/core/test/pack.test.ts
perl -pi -e 's/toBe\(120\)/toBe(121)/g; s/6 \+ 120\b/6 + 121/; s/"and 39 built into pbiplint\."/"and 40 built into pbiplint."/; s/"121 rules: 66/"122 rules: 66/; s/"120 rules: 66/"121 rules: 66/; s/and 38 built into pbiplint\./and 39 built into pbiplint./g; s/"94 rules: 66/"95 rules: 66/; s/and 23 built into pbiplint\./and 24 built into pbiplint./' packages/web/test/generate.test.ts
perl -0pi -e 's/\b15(\s+)rules/16$1rules/g; s/Power Query rules, 15 of them/Power Query rules, 16 of them/g; s/\b14 of them pbiplint/15 of them pbiplint/g; s/\b14 of pbiplint/15 of pbiplint/g; s/\b120(\s+)rules in all, 38 of/121$1rules in all, 39 of/g' README.md packages/cli/README.md packages/core/README.md packages/web/content/about.md
```

Add `"extension-filter-case",` to the slug list after `"excel-use-headers",`. The list is then:

```ts
      "default-step-names",
      "dynamic-data-source",
      "excel-use-headers",
      "extension-filter-case",
      "fixed-date-in-row-filter",
      "hardcoded-secret-in-query",
      "hardcoded-server-name",
      "incremental-refresh-range-bounds",
      "keep-first-rows-left-in",
      "legacy-excel-file",
      "local-drive-path",
      "minimize-power-query-transformations",
      "odbc-where-connector-exists",
      "privacy-levels-ignored",
      "script-in-query",
      "sort-not-held-for-remove-duplicates",
```

Check the prose: `git diff af69278 -- README.md packages/cli/README.md packages/core/README.md packages/web/content/about.md` shows only `11` to `16`, `10` to `15`, `116` to `121`, and `34` to `39`.

- [ ] **Step 8: Run what this task touches, and measure**

```bash
npx vitest run packages/core/test packages/web/test packages/cli/test
npm run typecheck
npm run check:browser
```

Expected: PASS; about 229.3 KB. Over 230.0 KB, or over 229.6 KB: do not commit; take the breakdown and report to pb-coord, who decides whether the rule waits (spec 3.4 allows no raise).

- [ ] **Step 9: Count it on the corpus**

```bash
npx tsx .superpowers/sdd/2026-10-13-v3-reader/corpus-diff.mts <base> ~/Projects/pbiplint/assets/pbip-lint-spike/research-104 > "$CLAUDE_JOB_DIR/tmp/pr6-corpus-diff-8.txt" 2>&1
grep -E "models linted|^[+-][0-9]|ERROR" "$CLAUDE_JOB_DIR/tmp/pr6-corpus-diff-8.txt"
npx tsx .superpowers/sdd/2026-10-13-v3-rules-resolver/rule-counts.mts ~/Projects/pbiplint/assets/pbip-lint-spike/research-104 60 > "$CLAUDE_JOB_DIR/tmp/pr6-rule-counts-8.txt" 2>&1
grep -E "^EXTENSION_FILTER_CASE:|^    [0-9]+ × the extension" "$CLAUDE_JOB_DIR/tmp/pr6-rule-counts-8.txt"
```

(`<base>` is Task 7's folder.) Expected: Task 7's four `+` lines and `+54 EXTENSION_FILTER_CASE`, nothing else; `EXTENSION_FILTER_CASE: 54 occurrences, 6 models, 6 repositories` (spec 11.4: 54, 12 or fewer): 52 filters on `".log"` over one model's gateway log folders, one on `".xlsx"`, and one on `".gz"`. Spot-check all 54: each is `[Extension] = "<text>"` in a `Table.SelectRows` over a folder or SharePoint listing, with no case folding. The gateway's own log files are always lower case, which the page's When to ignore it names; they are true to the rule. Write the counts and the spot-check line into `progress.md`.

- [ ] **Step 10: Run every check, and commit**

```bash
npm run lint
npm test
npm run build
npm run test:e2e
npx prettier --write packages/core/src/rules/pbiplint/power-query.ts packages/core/test/rules-power-query.test.ts packages/core/src/rules/rule-summaries.data.ts packages/cli/src/rule-help.data.ts packages/web/src/results/rule-guidance.data.ts packages/core/test/pack.test.ts packages/web/test/generate.test.ts
npm run lint
git add packages rules README.md tests/expectations
git commit -m "feat: EXTENSION_FILTER_CASE reports an extension filter that misses other cases

Michael's Desktop check showed Folder.Files keeps an extension's case, so
a filter on \".csv\" misses B.CSV: a warning, on the comparison, unless the
comparison folds case or a step changes the Extension column first.
shelfmart's two filters are in its native map. 121 rules, 39 built in.

Part of #78.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Finish

One Opus review of the whole branch (`git diff origin/release/0.3.0...HEAD`) with this plan and spec sections 3.4, 6.3, 8, 9.1, 9.3, 9.5, 9.10, 9.14, 9.17, and 11. Then pb-coord pushes `v3/rules-resolver` and opens a pull request into `release/0.3.0` titled `feat: the resolver's full reach, Power Query rules that follow names (v3 PR 6)`. Its body lists:

- What changed: the four rules (five if the Desktop check kept `EXTENSION_FILTER_CASE`) and their pages; `origin`'s reading of `if` and `error`; the secret guard and where it looks; m-zoo's expectations; the back-links; 120 rules, 38 built in, 15 on the Power Query layer (or 121, 39, and 16).
- For the release notes' "What can change in your results": two new errors, `DYNAMIC_DATA_SOURCE` and `HARDCODED_SECRET_IN_QUERY`, which can fail a pipeline at the default `--fail-on error`; `HARDCODED_SERVER_NAME` (info, once per query) is the common one. The sample's count does not move (280 findings).
- The spec changes: 8 (`if` and `error`), 9.5 (placeholders, joins, `OData.Feed` headers, once per literal), 9.17 (once per path), 11.3 (the stricter guard), and 9.10 if the rule was dropped; each with its corpus evidence.
- The budget: the core's own code from 220.3 KB to the last measurement (about 228.1 KB with four rules, 229.3 KB with five), under 230 KB; the parser's 385 KB unchanged. The per-task figures, and that `origin` (1.8 KB) became live here.
- The corpus diff: only additions, of the new rules; the per-rule table (occurrences, models, repositories) beside spec 11.4's expectation; the explanations; the spot checks with no false positive. Counts only, no corpus path, line, or value.

The body ends with:

```
🤖 Generated with [Claude Code](https://claude.com/claude-code)
```

CI and e2e must be green with no retries, and then pb-coord merges.

Execution: subagent-driven, one Opus 5.5 subagent per task with a fresh reviewer after each (pb-coord, October 13, 2026).
Task order: 1 (once pb-coord rules on the spec changes), 2, 3, 4, 5, 6, 7, then 8 by the ledger's Desktop check line.
