# v3 Steps Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Pull request 5 of v3 ([#78](https://github.com/pbiplint/pbiplint/issues/78)): five built-in Power Query rules that read a step, its table argument, or a filter's comparisons, `SORT_NOT_HELD_FOR_REMOVE_DUPLICATES`, `KEEP_FIRST_ROWS_LEFT_IN`, `INCREMENTAL_REFRESH_RANGE_BOUNDS`, `FIXED_DATE_IN_ROW_FILTER`, and `DEFAULT_STEP_NAMES`, each with its page; and `Provider=SQLOLEDB` as a SQL Server name for `ODBC_WHERE_CONNECTOR_EXISTS`.

**Architecture:** The rules join PR 4's five in `packages/core/src/rules/pbiplint/power-query.ts` and report through PR 4's `mFinding`. One shared piece is new: `boundValue` in `packages/core/src/m/resolve.ts` follows a name through the resolver's `let` scopes to the step that holds its value, which is how a `Table.Distinct` or a `Table.FirstN` finds the `Table.Sort` it reads and how a comparison finds `RangeStart` held by a step. `packages/core/src/m/ast.ts` gains `callOf` (one node read as a call, the body of `calls`), `nodesOfKind`, and `isWithin`; `periods.ts` exports its long-form date as `longDate`. m-zoo already holds every fixture shape the five rules need, so no fixture and no Tabular Editor capture changes.

**Tech Stack:** TypeScript, `@microsoft/powerquery-parser` 2.0.0, Vitest, Playwright, esbuild (`check:browser`).

**Spec:** `docs/superpowers/specs/2026-10-12-pbiplint-v3-power-query-layer-design.md`, sections 3.4, 6, 8, 9.1, 9.2, 9.4, 9.11, 9.13, 9.15, 9.16, 10.3, 11, and 12.2 item 5. Read 6.3, 8, 9.1, and the five rule sections before starting. PR 4's plan, `docs/superpowers/plans/2026-10-13-v3-rules-calls.md`, is the pattern this plan follows.

## Where this plan reads the spec narrowly

Every code block, page, and count in this plan was run in a scratch copy of the branch on October 13, 2026: the whole suite passed (4,121 tests), lint and typecheck were clean, `check:browser` passed, and the Chromium e2e run of `home.spec.ts` and `site.spec.ts` passed. The rulings below are this plan's; the first two change spec 9.16 and need pb-coord's confirmation before Task 6 runs (see Task 6, Step 0).

- **`FIXED_DATE_IN_ROW_FILTER` leaves `<>` alone** (a spec change, Task 6). Spec 9.16 flags "an end (`<`, `<=`) or an equality (`=`, `<>`)". On the corpus, 25 of the rule's 37 findings as first written were `<>`: a placeholder (`<> #date(1900, 1, 1)`), Christmas Eve across eight years, sixteen census dates left out of a list. None goes stale, which is the rule's whole case. `=` stays (a filter held to March 2026 is stale in April).
- **`FIXED_DATE_IN_ROW_FILTER` leaves alone a table with more than one M partition** (a spec change, Task 6). 3 more of the 37 were partitions `Sales-2022`, `Sales-2023`, `Sales-2024`, each filtered to its year: a table partitioned by hand, as `rules/large-tables-should-be-partitioned.md` itself describes, whose fixed ranges are the point. With both changes the corpus count is 9 filters in 4 models, every one a stale end or window. Task 6 amends spec 9.16 with one dated bullet. If pb-coord declines either change, Task 6, Step 0 says what to drop.
- **"Bound by the resolver" follows a chain of names.** Spec 9.2 and 9.11 say "a name the resolver binds to a `Table.Sort` call". `boundValue` follows a name to its step's value, and on while that value is itself a name (`Again = Sorted`), through `let` and record bindings only; a model parameter or another query is not followed (that is pull request 6's reach). The step a finding names is the last one followed, the step whose value is the sort.
- **Details the spec gives one form of.** Spec 9.2 gives the detail for a sort held by a step; written in place, it reads `nothing holds the order of the Table.Sort inside it, so the sort may not decide which duplicate is kept`. Spec 9.13 gives the form for more than two names; one and two read `1 step keeps its default name, 'Filtered Rows'` and `2 steps keep default names, 'Promoted Headers' and 'Changed Type'`. Spec 9.16 gives the end; `=` reads `rows match a fixed date, March 1, 2026`. Spec 9.11's count is written as M reads it (`Table.FirstN(Source, 0x10)` reads 16).
- **`DEFAULT_STEP_NAMES` names the query only.** Spec 9.13's detail is `query 'Sales': 6 steps keep default names, ...`, with no step, though the finding sits on the first such step. The rule takes `mFinding`'s location and replaces its detail with `queryLabel(q)` and the count. `mFinding` does not change.
- **`DEFAULT_STEP_NAMES`' prefixed names need a word break.** "Names starting **Expanded**, **Inserted**, **Extracted**, or **Calculated**" is read as the word followed by a space, digits, or nothing (`Expanded Orders`, `Inserted Year`, `Expanded1`), so a person's own `ExpandedRows` is not a default name.
- **`INCREMENTAL_REFRESH_RANGE_BOUNDS` reads `<`, `<=`, `>`, `>=` only.** A comparison with `=` or `<>`, or one that points the wrong way (`[Date] < RangeStart`), counts as neither kind. A parameter "wrapped in a call" is read inside any call's arguments, to a depth of 8, so `DateKey(RangeStart)` and `Date.From(RangeStart)` both count.
- **`KEEP_FIRST_ROWS_LEFT_IN` reads partitions and refresh policies only.** "Shared expressions that do not load": in a semantic model only tables load, so every shared expression is skipped (`q.kind !== "expression"`). A table whose partition reads a shared expression holding the step is not reported; the page says so.
- **Scope stays as spec 9.1 sets it** for all five, `["Partition", "NamedExpression", "Table"]`, though `KEEP_FIRST_ROWS_LEFT_IN` never reports a shared expression: one scope for every M rule keeps ignore annotations predictable.
- **No m-zoo change.** Spec 11.1 lists each rule's fixture shapes; all are already in m-zoo (checked shape by shape in Tasks 3 to 7), so the Tabular Editor captures and the shipped `MINIMIZE_POWER_QUERY_TRANSFORMATIONS` results do not move.
- **The SQLOLEDB amendment** (pb-coord, October 13, 2026: a synonym inside the approved rule) is Task 1: one dated bullet in spec 9.15, the pattern, a unit test, and the page's Quirks line. It finds nothing in the corpus (Task 8 confirms no `ODBC_WHERE_CONNECTOR_EXISTS` line in the diff).
- **No page links a rule that does not exist yet.** Pull request 6's rules (`DYNAMIC_DATA_SOURCE`, `HARDCODED_SERVER_NAME`, and the rest) are not named anywhere in this pull request.

## Global Constraints

- **Base branch:** `release/0.3.0`, never main. Branch `v3/rules-steps`, already cut from `release/0.3.0` at 267a1b4 (pull request 4 merged). Work in the worktree `~/Projects/pbiplint/pbiplint/.claude/worktrees/v3-spec`, never in home (`~/Projects/pbiplint/pbiplint` itself).
- **The five rules** (spec 9.1): status `builtin` through `pbiplintRule`; layer `powerquery` (so `needs: ["model"]`); scope `["Partition", "NamedExpression", "Table"]`. Severity and category: `SORT_NOT_HELD_FOR_REMOVE_DUPLICATES` warning (2), Error Prevention; `KEEP_FIRST_ROWS_LEFT_IN` warning (2), Error Prevention; `INCREMENTAL_REFRESH_RANGE_BOUNDS` **error (3)**, Error Prevention (spec 9.4); `FIXED_DATE_IN_ROW_FILTER` info (1), Maintenance; `DEFAULT_STEP_NAMES` info (1), Maintenance.
- **Names, verbatim:** "Sort may not decide which duplicate is kept", "Keep First Rows left in a loaded query", "Incremental refresh filter counts a boundary row twice or never", "Fixed date in a row filter", "Steps keep Power Query's default names".
- **One finding per occurrence** through `mFinding(m, q, node, what)` (`packages/core/src/rules/m-helpers.ts`), except `DEFAULT_STEP_NAMES`, once per query (spec 9.1), and `INCREMENTAL_REFRESH_RANGE_BOUNDS`, once per query by its nature.
- **The sort rule's page keeps the sort and adds `Table.Buffer`**, and never tells the reader not to sort (Michael, spec 9.2).
- **No em dashes anywhere** (code, comments, docs, rule pages, commit messages; a hook blocks them and `rule-pages.test.ts` checks pages for U+2014). Restructure with a comma, colon, parentheses, or two sentences.
- **Long-form dates in prose** ("October 13, 2026"), never `2026-10-13`, except in file names and front matter.
- **Capitalized bullets** in every list this plan writes.
- **Rule pages** are pbiplint's own prose, from the template (`CONTRIBUTING.md`, "Rule pages"). The fix route starts in Power BI Desktop's Power Query editor (Transform data, the query, the step in Applied steps), then the TMDL file. No third-party tool is required, never Tabular Editor for the fix, and no Tabular Editor C#. Every quote is linked to its source page, at the section anchor when there is one (each quote and anchor in this plan's pages was checked against the live page on October 13, 2026). Each page's `tmdl fires` and `tmdl fixed` examples must parse and fire (`rule-pages.test.ts`). Related rules links go both ways where this plan adds them.
- **Never name or cite any competing Power Query linter or its author**, in code, pages, commits, or the pull request.
- **Fixtures and tests are sanitized:** `example.com` or `*.example` hosts, the `C:\Demo\Data\` convention for paths, no real names or servers. Fake secrets, where a test needs one, use the `pbiplint-fixture-<kind>-<nnnn>-notreal` form, which matches no real provider's format. This plan adds none.
- **Core stays browser-pure:** no Node built-in, no `process.`, no network API in `packages/core/src`.
- **The core budget is 230 KB** (`packages/core/scripts/check-browser-bundle.mjs`, spec 3.4 as amended in pull request 4). Every rule task runs `npm run check:browser` and writes its line into `progress.md`. If the core's own code crosses 230 KB, the task stops and reports to pb-coord; nothing here changes the budget. The scratch run measured 211.8 KB before and 219.6 KB after all five rules.
- **The suite stays green at every task.** Each rule task moves every pin its rule breaks, by its own amount: the rule counts in `pack.test.ts` and `generate.test.ts`, m-zoo's expectations, the README and About counts (only numbers change), and, for `DEFAULT_STEP_NAMES`, the report fixtures' native maps and the sample's counts. Every commit passes `npm test`, `npm run lint`, `npm run typecheck`, and `npm run check:browser`.
- **The corpus diff** (spec 11.4) must show only the five new rules' findings, every one an addition, each rule spot-checked for false positives (Task 8).
- **Formatting:** `npx prettier --write` on every changed `.ts`, `.mts`, `.mjs`, and `.json` file outside `tests/` before committing (Markdown, `.tmdl`, `tests/fixtures/`, and `tests/expectations/` are Prettier-ignored; keep their JSON at two-space indents by hand, one finding per line in `m-zoo.json`). Then `npm run lint`.
- **Generated data:** after any rule page edit, `npm run build -w @pbiplint/core && node scripts/sync-rule-pages.mjs`, and commit the three `.data.ts` files it rewrites.
- **Commits:** one or more per task. Each message ends with `Part of #78.`, a blank line, and `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Never write a closing keyword next to an issue number.
- **Subagents** run on Opus 5.5 and share the worktree, so one edits files at a time.
- **Command rules** (pb-coord, October 13, 2026; a previous plan writer stalled for hours on a permission prompt). These are hard rules:
  - Scratch space only under the executing session's job folder, `$CLAUDE_JOB_DIR/tmp` (for this plan's writer, `/Users/michaelmckinley/.claude/jobs/cb7c83fd/tmp`). Never use `/tmp`.
  - For any experiment, make a fresh folder with `mktemp -d "$CLAUDE_JOB_DIR/tmp/pr5.XXXX"` and work inside it by its printed literal path (shell variables do not survive between tool calls). Never run `rm -rf` or `rm -r` with a glob or a variable path; never `cd` somewhere and delete with `*`. Leaving scratch folders behind is fine.
  - No `sudo`, no deleting outside the worktree or that job folder, no `git clean`, `git reset --hard`, `git checkout -- .`, `git stash`, or any push (the Finish section's one push is pb-coord's, after review).
  - If a command might ask for permission, rewrite it so it cannot. Never wait on a prompt.
- **The plan's workspace** is `.superpowers/sdd/2026-10-13-v3-rules-steps/` (git-ignored; `.superpowers` is a symlink into home's copy, so scripts there import the worktree's code by `process.cwd()`, never by a relative path). The reader plan's `corpus-diff.mts` is reused from `.superpowers/sdd/2026-10-13-v3-reader/`, and pull request 4's `rule-counts.mts` from `.superpowers/sdd/2026-10-13-v3-rules-calls/`.
- **Folder inputs in e2e** go through `setFolder` from `packages/web/e2e/folder-input.ts`, never `setInputFiles` on a directory. This plan's browser checks use the sample button and need none.
- **The corpus** (`~/Projects/pbiplint/assets/pbip-lint-spike/research-104`) is not pbiplint's: the pull request carries counts only, never a corpus path, line, or value.

## Review Focus

- **A `Table.Distinct` whose column list is `null`.** M reads `null` as no list, so whole rows decide and the sort cannot matter; the rule must stay silent, as it does with no second argument. Task 3 pins it beside a buffered step between the two (`Table.Buffer(Sorted)`), which must also stay silent.
- **The incremental refresh parameters reached indirectly.** `RangeStart <= [OrderDate]` (parameter first), `DateKey(RangeStart)` (inside a call), and `Start = RangeStart` then `[OrderDate] >= Start` (held by a step) must all count, while a `let` variable named `RangeEnd` must not. Task 5 pins all four.
- **A fixed date that does not go stale.** `<> #date(1900, 1, 1)` (a placeholder left out) and a table cut by hand into yearly partitions must not fire; `=` on a fixed month must. Task 6 pins all three, and a `#datetimezone` with a negative offset, whose `-5` is a unary expression.
- **Step names that only look like Desktop's.** `ExpandedRows`, `Changed Types Of Amount`, a default name inside a nested `let` or inside a function query, and a parameter must not fire; `Changed Type with Locale`, `Added Custom1`, `Expanded Orders`, and an unquoted `Custom` must. Task 7 pins them.
- **A top N that is deliberate.** `Table.FirstN` inside `Table.Group`'s `each`, after a buffered sort held by a step, with a count from a parameter or a condition, and in a shared expression must not fire. Task 4 pins them.

## File Structure

| File | Task | Responsibility |
| --- | --- | --- |
| `packages/core/src/rules/pbiplint/power-query.ts` | 1, 3 to 7 | SQLOLEDB; the five rules, appended to `powerQueryRules` |
| `packages/core/src/m/ast.ts` | 2 | `callOf` (the body of `calls`), `nodesOfKind`, `isWithin` |
| `packages/core/src/m/resolve.ts` | 2 | `boundValue`: a name followed to the step that holds its value |
| `packages/core/src/rules/pbiplint/periods.ts` | 2 | `longDate` exported for the M rule |
| `packages/core/test/m-ast.test.ts`, `packages/core/test/m-resolve.test.ts` | 2 | The helpers' tests |
| `packages/core/test/rules-power-query.test.ts` | 1, 3 to 7 | Each rule's unit tests |
| `tests/expectations/pbiplint/m-zoo.json` | 3 to 7 | m-zoo's pinned findings |
| `rules/sort-not-held-for-remove-duplicates.md`, `rules/keep-first-rows-left-in.md`, `rules/incremental-refresh-range-bounds.md`, `rules/fixed-date-in-row-filter.md`, `rules/default-step-names.md` (new) | 3 to 7 | The pages |
| `rules/odbc-where-connector-exists.md` | 1 | SQLOLEDB on the Quirks line |
| `rules/minimize-power-query-transformations.md`, `rules/large-tables-should-be-partitioned.md`, `rules/hardcoded-period-in-dax.md`, `rules/hardcoded-year-in-filter.md`, `rules/default-page-name.md` | 3, 5, 6, 7 | Related rules back-links (and one Quirks sentence) |
| `packages/core/src/rules/rule-summaries.data.ts`, `packages/cli/src/rule-help.data.ts`, `packages/web/src/results/rule-guidance.data.ts` (generated) | 1, 3 to 7 | Regenerated from the pages |
| `packages/core/test/pack.test.ts`, `packages/web/test/generate.test.ts` | 3 to 7 | Rule counts, 111 to 116, built in 29 to 34 |
| `README.md`, `packages/cli/README.md`, `packages/core/README.md`, `packages/web/content/about.md` | 3 to 7 | The counts' numbers only (and the sample count in the core README, Task 7) |
| `tests/expectations/{base-rules-fails,base-rules-passes,messy-sales,pbip-and-github-demo,shelfmart}.report.json` | 7 | `DEFAULT_STEP_NAMES` in each `native` map |
| Sample count pins (`sample.test.ts`, `home.test.ts`, `render.test.ts`, `export.test.ts`, `home.spec.ts`, `cli.test.ts`, `contract.test.ts`) | 7 | 273 findings become 280 |
| The v3 spec, sections 9.15 and 9.16 | 1, 6 | One dated bullet each |
| `.superpowers/sdd/2026-10-13-v3-rules-steps/rule-counts.mts` (not committed) | 8 | The rules' corpus counts and spot-check examples |

---

## Before Task 1

```bash
cd ~/Projects/pbiplint/pbiplint/.claude/worktrees/v3-spec
git fetch origin
git switch v3/rules-steps
git status --short          # expected: only this plan, untracked
pb-worktree-setup
mkdir -p .superpowers/sdd/2026-10-13-v3-rules-steps
git add docs/superpowers/plans/2026-10-13-v3-rules-steps.md
git commit -m "docs: the v3 steps plan

Part of #78.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
npm test 2>&1 | tail -5
npm run check:browser
```

Expected: the suite passes on the base (4,002 tests), and `check:browser` prints `core's own code 211.8 KB, the M parser 375.9 KB`. Write that whole line into `.superpowers/sdd/2026-10-13-v3-rules-steps/progress.md` as **the base measurement**. If the suite fails, stop and report.

---

### Task 1: `Provider=SQLOLEDB` joins the SQL Server names

**Files:**
- Modify: `packages/core/src/rules/pbiplint/power-query.ts` (`NATIVE_CONNECTORS`)
- Modify: `rules/odbc-where-connector-exists.md` (Quirks)
- Modify (generated): the three `.data.ts` files
- Modify: `docs/superpowers/specs/2026-10-12-pbiplint-v3-power-query-layer-design.md` (section 9.15)
- Test: `packages/core/test/rules-power-query.test.ts`

**Interfaces:**
- Consumes: `ODBC_WHERE_CONNECTOR_EXISTS`, `mFindings`, and the test file's `table` helper, all from pull request 4.
- Produces: nothing new; the SQL Server pattern also matches `sqloledb`.

- [ ] **Step 1: Write the failing test**

In `packages/core/test/rules-power-query.test.ts`, inside `describe("ODBC_WHERE_CONNECTOR_EXISTS ...")`, add after the test "reads the driver part however its key is written":

```ts
  it("reads SQLOLEDB, the older OLE DB provider, as SQL Server", async () => {
    const tmdl = table(
      "Orders",
      'OleDb.DataSource("Provider=SQLOLEDB.1;Data Source=sql.example;Initial Catalog=Sales")',
    );
    expect((await mFindings(rule, tmdl)).map((f) => f.detail)).toEqual([
      "query 'Orders': the OLE DB connection names the SQL Server provider; Power BI has a SQL Server connector",
    ]);
  });
```

- [ ] **Step 2: Run it to make sure it fails**

Run: `npx vitest run packages/core/test/rules-power-query.test.ts -t SQLOLEDB`
Expected: FAIL: the received list is empty.

- [ ] **Step 3: Add the name**

In `packages/core/src/rules/pbiplint/power-query.ts`, in `NATIVE_CONNECTORS`, the SQL Server line becomes:

```ts
  { pattern: /sql server|sqlncli|sqloledb|msoledbsql/i, name: "SQL Server", article: "a" },
```

Run: `npx vitest run packages/core/test/rules-power-query.test.ts`
Expected: PASS.

- [ ] **Step 4: The page and the spec**

In `rules/odbc-where-connector-exists.md`, Quirks, the bullet that begins "Only the `Driver=` or `Provider=` part is read" ends with:

```markdown
SQL Server counts under `SQL Server`, `ODBC Driver 18 for SQL Server`, `SQLNCLI`, `SQLOLEDB`, and `MSOLEDBSQL`.
```

In the spec, section 9.15, add a last bullet after "- **Corpus:** 236 calls naming Redshift or PostgreSQL drivers, ...":

```markdown
- **Amended October 13, 2026** (the coordinator's decision, pull request 5): `SQLOLEDB`, the older OLE DB provider for SQL Server, joins the SQL Server names, a synonym inside the approved rule. The corpus has none.
```

Then:

```bash
npm run build -w @pbiplint/core && node scripts/sync-rule-pages.mjs
npx vitest run packages/core/test/rule-pages.test.ts -t ODBC_WHERE_CONNECTOR_EXISTS
npx vitest run packages/core/test packages/cli/test packages/web/test
npm run check:browser
```

Expected: PASS everywhere; `check:browser` within budget (about 211.8 KB). Write its line into `progress.md` under Task 1.

- [ ] **Step 5: Commit**

```bash
npx prettier --write packages/core/src/rules/pbiplint/power-query.ts packages/core/test/rules-power-query.test.ts packages/core/src/rules/rule-summaries.data.ts packages/cli/src/rule-help.data.ts packages/web/src/results/rule-guidance.data.ts
npm run lint
git add packages rules/odbc-where-connector-exists.md docs/superpowers/specs/2026-10-12-pbiplint-v3-power-query-layer-design.md
git commit -m "feat: SQLOLEDB counts as a SQL Server provider for ODBC_WHERE_CONNECTOR_EXISTS

The older OLE DB provider for SQL Server joins the names the rule reads,
a synonym inside the approved rule (spec 9.15, amended).

Part of #78.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: A call, nodes by kind, and a name followed to its step

**Files:**
- Modify: `packages/core/src/m/ast.ts` (`calls` and after it)
- Modify: `packages/core/src/m/resolve.ts` (end of file)
- Modify: `packages/core/src/rules/pbiplint/periods.ts` (`shown`)
- Test: `packages/core/test/m-ast.test.ts`, `packages/core/test/m-resolve.test.ts`

**Interfaces:**
- Consumes: `MCall`, `nodeOf`, `parentOf`, `identifierName`, `unwrap` (`m/ast.ts`); `resolve` (`m/resolve.ts`); `MIndex`, `MQuery` (`m/types.ts`).
- Produces:
  - `callOf(n: Node | undefined): MCall | undefined` in `m/ast.ts`: a node read as a call to a function named by an identifier (`Table.Sort(...)`, `#date(...)`), as `calls` reads each one; undefined for any other node.
  - `nodesOfKind(q: MQuery, ...kinds: Language.Ast.NodeKind[]): Node[]` in `m/ast.ts`: every node of those kinds, in text order (by first token, the wider node first).
  - `isWithin(q: MQuery, node: Node, ancestor: Node): boolean` in `m/ast.ts`: `node` is `ancestor` or inside it.
  - `boundValue(m: MIndex, q: MQuery, node: Node): { node: Node; step?: string }` in `m/resolve.ts`: what a node stands for, following `let` and record names while the value is itself a name; `step` is the last name followed.
  - `longDate(year: number, month: number, day: number): string` in `rules/pbiplint/periods.ts`: `December 31, 2025`.

- [ ] **Step 1: Write the failing tests**

In `packages/core/test/m-ast.test.ts`, the import from `../src/m/ast.js` gains `callOf`, `isWithin`, and `nodesOfKind` (alphabetical: `callOf, calls, identifierName, isWithin, nodeOf, nodesOfKind, stepOf, textLiterals, textValue, unwrap`). Add at the end:

```ts
describe("callOf, nodesOfKind, and isWithin", () => {
  it("reads a node as a call to a named function, and nothing else as one", async () => {
    const q = await query('let a = Table.Sort(S, {"x"}), b = (Table.Sort)(S, {}), c = S{0} in a');
    const nodes = nodesOfKind(q, Language.Ast.NodeKind.RecursivePrimaryExpression);
    expect(nodes.map((n) => callOf(n)?.name)).toEqual(["Table.Sort", undefined, undefined]);
    expect(callOf(nodes[0])?.args).toHaveLength(2);
    expect(callOf(undefined)).toBeUndefined();
  });
  it("lists the nodes of several kinds in text order, and none for M that did not parse", async () => {
    const q = await query("each [a] < 1 and [b] = 2 and [c] >= 3");
    const kinds = nodesOfKind(
      q,
      Language.Ast.NodeKind.EqualityExpression,
      Language.Ast.NodeKind.RelationalExpression,
    ).map((n) => n.kind);
    expect(kinds).toEqual([
      Language.Ast.NodeKind.RelationalExpression,
      Language.Ast.NodeKind.EqualityExpression,
      Language.Ast.NodeKind.RelationalExpression,
    ]);
    expect(
      nodesOfKind(
        {
          kind: "expression",
          name: "Q",
          owner: { name: "Q" } as never,
          text: "",
          file: "q.tmdl",
          valueLine: 1,
        },
        Language.Ast.NodeKind.RelationalExpression,
      ),
    ).toEqual([]);
  });
  it("tells whether a node sits inside another", async () => {
    const q = await query("Table.SelectRows(S, each [a] < 1)");
    const [select] = calls(q);
    const [comparison] = nodesOfKind(q, Language.Ast.NodeKind.RelationalExpression);
    expect(isWithin(q, comparison!, select!.args[1]!)).toBe(true);
    expect(isWithin(q, comparison!, comparison!)).toBe(true);
    expect(isWithin(q, select!.args[0]!, select!.args[1]!)).toBe(false);
  });
});
```

The text-order test matters: node ids are not in text order for `and` chains (the parser numbers a binary expression after its operands), which is why `nodesOfKind` sorts by token position rather than by id.

In `packages/core/test/m-resolve.test.ts`, the import from `../src/m/resolve.js` becomes `import { boundValue, origin, resolve } from "../src/m/resolve.js";`, and add at the end:

```ts
describe("boundValue", () => {
  /** What the first argument of the first call to `fn` stands for: the call it is, and the step that holds it. */
  async function bound(partition: string, fn = "Table.Distinct", expressions = "") {
    const { m, q } = await index(partition, expressions);
    const b = boundValue(m, q, calls(q).find((c) => c.name === fn)!.args[0]!);
    return {
      name: calls(q).find((c) => c.node.id === b.node.id)?.name,
      step: b.step,
      kind: b.node.kind,
    };
  }
  it("follows a name to the step that holds its value", async () => {
    expect(
      await bound(
        'let #"Sorted Rows" = Table.Sort(S, {"x"}), D = Table.Distinct(#"Sorted Rows", {"k"}) in D',
      ),
    ).toEqual({
      name: "Table.Sort",
      step: "Sorted Rows",
      kind: Language.Ast.NodeKind.RecursivePrimaryExpression,
    });
  });
  it("follows a step that only renames another, and takes parentheses off", async () => {
    expect(
      await bound(
        'let Sorted = Table.Sort(S, {"x"}), Again = (Sorted), D = Table.Distinct(Again, {"k"}) in D',
      ),
    ).toMatchObject({ name: "Table.Sort", step: "Sorted" });
  });
  it("gives a value written in place with no step", async () => {
    expect(await bound('Table.Distinct(Table.Sort(S, {"x"}), {"k"})')).toMatchObject({
      name: "Table.Sort",
      step: undefined,
    });
  });
  it("stops at a model parameter and at a name nothing defines", async () => {
    const parameter = await bound(
      'Table.Distinct(Customers, {"k"})',
      "Table.Distinct",
      'expression Customers = "x" meta [IsParameterQuery = true, Type = "Text", IsParameterQueryRequired = true]\n',
    );
    expect(parameter).toEqual({
      name: undefined,
      step: undefined,
      kind: Language.Ast.NodeKind.IdentifierExpression,
    });
    expect((await bound('Table.Distinct(Nowhere, {"k"})')).kind).toBe(
      Language.Ast.NodeKind.IdentifierExpression,
    );
  });
  it("stops on a cycle", async () => {
    expect((await bound('let a = b, b = a, D = Table.Distinct(a, {"k"}) in D')).kind).toBe(
      Language.Ast.NodeKind.IdentifierExpression,
    );
  });
});
```

- [ ] **Step 2: Run them to make sure they fail**

Run: `npx vitest run packages/core/test/m-ast.test.ts packages/core/test/m-resolve.test.ts`
Expected: FAIL: `callOf`, `nodesOfKind`, `isWithin`, and `boundValue` are not exported.

- [ ] **Step 3: `callOf`, `nodesOfKind`, and `isWithin`**

In `packages/core/src/m/ast.ts`, replace `calls` (the function and its doc comment) with:

```ts
/** A node as an invocation of a function named by an identifier; undefined for any other node. */
export function callOf(n: Node | undefined): MCall | undefined {
  if (n?.kind !== Kind.RecursivePrimaryExpression || n.head.kind !== Kind.IdentifierExpression)
    return undefined;
  const first = n.recursiveExpressions.elements[0];
  if (first?.kind !== Kind.InvokeExpression) return undefined;
  return {
    name: identifierName(n.head.identifier.literal),
    args: first.content.elements.map((csv) => csv.node),
    node: n,
  };
}

/** Every invocation in a query whose function is named by an identifier, in text order. */
export function calls(q: MQuery): MCall[] {
  const ids =
    q.nodeIdMapCollection?.idsByNodeKind.get(Kind.RecursivePrimaryExpression) ?? new Set<number>();
  const out: MCall[] = [];
  for (const id of [...ids].sort((a, b) => a - b)) {
    const c = callOf(nodeOf(q, id));
    if (c) out.push(c);
  }
  return out;
}

/** Every node of the given kinds in a query, in text order. */
export function nodesOfKind(q: MQuery, ...kinds: Language.Ast.NodeKind[]): Node[] {
  return kinds
    .flatMap((k) => [...(q.nodeIdMapCollection?.idsByNodeKind.get(k) ?? [])])
    .map((id) => nodeOf(q, id))
    .filter((n): n is Node => n !== undefined)
    .sort(
      (a, b) =>
        a.tokenRange.tokenIndexStart - b.tokenRange.tokenIndexStart ||
        b.tokenRange.tokenIndexEnd - a.tokenRange.tokenIndexEnd,
    );
}

/** Whether `node` is `ancestor` or sits inside it. */
export function isWithin(q: MQuery, node: Node, ancestor: Node): boolean {
  for (let n: Node | undefined = node; n; n = parentOf(q, n)) if (n.id === ancestor.id) return true;
  return false;
}
```

`calls` keeps its behavior exactly; pull request 4's rule tests are its regression check.

- [ ] **Step 4: `boundValue`**

At the end of `packages/core/src/m/resolve.ts`:

```ts
/**
 * What a node stands for through `let` and record bindings: a name bound to a step is followed to
 * the step's value while that value is itself a name, with parentheses and `meta` taken off.
 * `step` is the last name followed, the step whose value `node` is; undefined when `node` is
 * written in place. Model parameters and other queries are not followed.
 */
export function boundValue(m: MIndex, q: MQuery, node: Node): { node: Node; step?: string } {
  let n = unwrap(node);
  let step: string | undefined;
  const seen = new Set<number>();
  while (n.kind === Kind.IdentifierExpression && !seen.has(n.id)) {
    seen.add(n.id);
    const r = resolve(m, q, n);
    if (r.kind !== "value") break;
    step = identifierName(n.identifier.literal);
    n = unwrap(r.node);
  }
  return { node: n, step };
}
```

- [ ] **Step 5: `longDate`**

In `packages/core/src/rules/pbiplint/periods.ts`, replace the `shown` constant and its doc comment with:

```ts
/** A day in long form, as a detail names it: `December 31, 2025`. `month` is 1 to 12. */
export const longDate = (year: number, month: number, day: number): string =>
  `${MONTHS[month - 1]} ${day}, ${year}`;

/** How a detail names a period: a year as `2025`, a day in long form, an ambiguous string as written. */
const shown = (p: Period): string =>
  p.ambiguous !== undefined
    ? `"${p.ambiguous}"`
    : p.date
      ? longDate(p.date.year, p.date.month, p.date.day)
      : String(p.year);
```

`HARDCODED_PERIOD_IN_DAX`'s own tests are its regression check.

- [ ] **Step 6: Run the tests**

```bash
npx vitest run packages/core/test
npm run typecheck
npm run check:browser
```

Expected: PASS. Write the `check:browser` line into `progress.md` under Task 2 (the helpers alone cost well under 1 KB).

- [ ] **Step 7: Commit**

```bash
npx prettier --write packages/core/src/m/ast.ts packages/core/src/m/resolve.ts packages/core/src/rules/pbiplint/periods.ts packages/core/test/m-ast.test.ts packages/core/test/m-resolve.test.ts
npm run lint
git add packages/core
git commit -m "feat: a call, nodes by kind, and a name followed to the step that holds it

callOf reads one node as a call, as calls reads each; nodesOfKind lists
nodes in text order; boundValue follows a name through let and record
bindings to its step's value. periods.ts exports its long-form date.
The step rules of v3 build on these.

Part of #78.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: `SORT_NOT_HELD_FOR_REMOVE_DUPLICATES` and its page

**Files:**
- Modify: `packages/core/src/rules/pbiplint/power-query.ts`
- Create: `rules/sort-not-held-for-remove-duplicates.md`
- Modify: `rules/minimize-power-query-transformations.md` (Related rules)
- Modify (generated): the three `.data.ts` files
- Modify: `tests/expectations/pbiplint/m-zoo.json`
- Modify: `packages/core/test/pack.test.ts`, `packages/web/test/generate.test.ts`, `README.md`, `packages/cli/README.md`, `packages/core/README.md`, `packages/web/content/about.md` (counts)
- Test: `packages/core/test/rules-power-query.test.ts`

**Interfaces:**
- Consumes: `callOf`, `calls`, `unwrap` (`m/ast.ts`); `boundValue` (`m/resolve.ts`); `tableRef` (`model/names.ts`); `mFinding`; `pbiplintRule`.
- Produces: `export const SORT_NOT_HELD_FOR_REMOVE_DUPLICATES: Rule`, appended to `powerQueryRules`; the module-level helper `isNull(n: Node | undefined): boolean` in `power-query.ts`.

- [ ] **Step 1: Write the failing tests**

In `packages/core/test/rules-power-query.test.ts`, the import from `../src/rules/pbiplint/power-query.js` gains `SORT_NOT_HELD_FOR_REMOVE_DUPLICATES` (last, alphabetically). Add at the end of the file:

```ts
describe("SORT_NOT_HELD_FOR_REMOVE_DUPLICATES (v3 spec, section 9.2)", () => {
  const rule = SORT_NOT_HELD_FOR_REMOVE_DUPLICATES;
  const customers =
    '\tSource = #table(type table [#"Customer ID" = text, Updated = date], {{"C1", #date(2025, 1, 1)}, {"C1", #date(2025, 2, 1)}}),';
  it("is a built-in Power Query warning on a query's owner", () => {
    isPowerQueryRule(rule, 2, "Error Prevention");
    expect(rule.name).toBe("Sort may not decide which duplicate is kept");
    expect(rule.scope).toEqual(["Partition", "NamedExpression", "Table"]);
  });
  it("reports Desktop's Sorted Rows then Removed Duplicates on the Table.Distinct call, naming the sort's step", async () => {
    const tmdl = table(
      "Customers",
      "let",
      customers,
      '\t#"Sorted Rows" = Table.Sort(Source, {{"Updated", Order.Descending}}),',
      '\t#"Removed Duplicates" = Table.Distinct(#"Sorted Rows", {"Customer ID"})',
      "in",
      '\t#"Removed Duplicates"',
    );
    expect(await mFindings(rule, tmdl)).toEqual([
      {
        objectType: "Partition",
        objectName: "Customers",
        location: { file: "inline.tmdl", line: 8, column: 30 },
        detail:
          "query 'Customers', step 'Removed Duplicates': nothing holds the order of step 'Sorted Rows', so the sort may not decide which duplicate is kept",
      },
    ]);
  });
  it("reports the sort written in place, and a step that only renames the sort", async () => {
    const tmdl = table(
      "Customers",
      "let",
      customers,
      '\tInPlace = Table.Distinct(Table.Sort(Source, {{"Updated", Order.Descending}}), {"Customer ID"}),',
      '\tSorted = Table.Sort(Source, {{"Updated", Order.Descending}}),',
      "\tAgain = Sorted,",
      '\tRenamed = Table.Distinct(Again, {"Customer ID"})',
      "in",
      "\tRenamed",
    );
    expect((await mFindings(rule, tmdl)).map((f) => f.detail)).toEqual([
      "query 'Customers', step 'InPlace': nothing holds the order of the Table.Sort inside it, so the sort may not decide which duplicate is kept",
      "query 'Customers', step 'Renamed': nothing holds the order of step 'Sorted', so the sort may not decide which duplicate is kept",
    ]);
  });
  it("leaves alone a buffered sort, whole rows, a null column list, and a sort two steps back", async () => {
    const tmdl = table(
      "Customers",
      "let",
      customers,
      '\tBuffered = Table.Buffer(Table.Sort(Source, {{"Updated", Order.Descending}})),',
      '\tFromBuffer = Table.Distinct(Buffered, {"Customer ID"}),',
      '\tSorted = Table.Sort(Source, {{"Updated", Order.Descending}}),',
      "\tBufferedStep = Table.Buffer(Sorted),",
      '\tFromBufferedStep = Table.Distinct(BufferedStep, {"Customer ID"}),',
      "\tWholeRows = Table.Distinct(Sorted),",
      "\tNullColumns = Table.Distinct(Sorted, null),",
      '\tTyped = Table.TransformColumnTypes(Sorted, {{"Updated", type date}}),',
      '\tTwoBack = Table.Distinct(Typed, {"Customer ID"})',
      "in",
      "\tTwoBack",
    );
    expect(await mFindings(rule, tmdl)).toEqual([]);
  });
  it("is silenced by an ignore annotation on the partition", async () => {
    const tmdl =
      'table Customers\n\tpartition Customers = m\n\t\tmode: import\n\t\tsource = Table.Distinct(Table.Sort(S, {"Updated"}), {"Customer ID"})\n\n\t\tannotation pbiplint.ignore = SORT_NOT_HELD_FOR_REMOVE_DUPLICATES\n';
    const result = await lint([{ path: "definition/tables/Customers.tmdl", text: tmdl }]);
    expect(result.findings.filter((f) => f.ruleId === rule.id)).toEqual([]);
    const without = tmdl.replace(
      "\n\t\tannotation pbiplint.ignore = SORT_NOT_HELD_FOR_REMOVE_DUPLICATES",
      "",
    );
    const before = await lint([{ path: "definition/tables/Customers.tmdl", text: without }]);
    expect(before.findings.filter((f) => f.ruleId === rule.id)).toHaveLength(1);
  });
});
```

The column 30 is where `Table.Distinct` starts on line 8: four tabs of block indent plus the tab the test writes, then `#"Removed Duplicates" = ` (24 characters).

- [ ] **Step 2: Run them to make sure they fail**

Run: `npx vitest run packages/core/test/rules-power-query.test.ts -t SORT_NOT_HELD`
Expected: FAIL: `SORT_NOT_HELD_FOR_REMOVE_DUPLICATES` is not exported.

- [ ] **Step 3: Write the rule**

In `packages/core/src/rules/pbiplint/power-query.ts`, the imports at the top become:

```ts
import { Language } from "@microsoft/powerquery-parser";
import { callOf, calls, identifierName, textLiterals, textValue, unwrap } from "../../m/ast.js";
import { boundValue, resolve } from "../../m/resolve.js";
import type { MIndex, MQuery } from "../../m/types.js";
import { tableRef } from "../../model/names.js";
import { finding } from "../helpers.js";
import { mFinding } from "../m-helpers.js";
import type { Rule } from "../types.js";
import { pbiplintRule } from "./define.js";
```

Add after `PRIVACY_LEVELS_IGNORED` (before the `powerQueryRules` doc comment):

```ts
/** A `null` written as an argument, which M's table functions read as the argument left out. */
const isNull = (n: Node | undefined): boolean =>
  n !== undefined &&
  unwrap(n).kind === Kind.LiteralExpression &&
  (unwrap(n) as Language.Ast.LiteralExpression).literalKind === Language.Ast.LiteralKind.Null;

// Desktop's Sorted Rows then Removed Duplicates, with a column list deciding what is a duplicate
// (v3 spec, section 9.2). The sort is the intended way to choose the row that survives; the fault
// is that nothing holds its order. A sort held by Table.Buffer, a distinct over whole rows, and a
// sort with other steps between are left alone.
export const SORT_NOT_HELD_FOR_REMOVE_DUPLICATES = pbiplintRule({
  id: "SORT_NOT_HELD_FOR_REMOVE_DUPLICATES",
  name: "Sort may not decide which duplicate is kept",
  category: "Error Prevention",
  severity: 2,
  scope: ["Partition", "NamedExpression", "Table"],
  layer: "powerquery",
  check: (_project, { indexes: { m } }) =>
    m.queries.flatMap((q) =>
      calls(q).flatMap((c) => {
        const [table, columns] = c.args;
        if (c.name !== "Table.Distinct" || !table || !columns || isNull(columns)) return [];
        const sorted = boundValue(m, q, table);
        if (callOf(sorted.node)?.name !== "Table.Sort") return [];
        const sort =
          sorted.step === undefined ? "the Table.Sort inside it" : `step ${tableRef(sorted.step)}`;
        return [
          mFinding(
            m,
            q,
            c.node,
            `nothing holds the order of ${sort}, so the sort may not decide which duplicate is kept`,
          ),
        ];
      }),
    ),
});
```

and `powerQueryRules` gains `SORT_NOT_HELD_FOR_REMOVE_DUPLICATES,` after `PRIVACY_LEVELS_IGNORED,`.

Run: `npx vitest run packages/core/test/rules-power-query.test.ts`
Expected: PASS.

- [ ] **Step 4: Write the page**

Create `rules/sort-not-held-for-remove-duplicates.md`:

````markdown
---
id: SORT_NOT_HELD_FOR_REMOVE_DUPLICATES
name: "Sort may not decide which duplicate is kept"
category: Error Prevention
severity: warning
scope: [Partition, NamedExpression, Table]
status: builtin
layer: powerquery
video:
sources:
---

# Sort may not decide which duplicate is kept

## What it checks

Power Query queries that remove duplicates by some of their columns straight after a sort, with nothing holding the sort's order: a `Table.Distinct` call with a list of columns whose table is a `Table.Sort`, written in place or as the step it reads. Power BI Desktop writes this shape as a Sorted Rows step followed by Removed Duplicates.

Each finding names the partition, the shared expression, or, for an incremental refresh policy's own query, the table. Its detail names the query and the step that removes duplicates, then the sort, as `query 'Customers', step 'Removed Duplicates': nothing holds the order of step 'Sorted Rows', so the sort may not decide which duplicate is kept`. The location is the line and column of the `Table.Distinct` call in the TMDL file.

## Example

```tmdl fires
table Customers
	column 'Customer ID'
		dataType: string
		summarizeBy: none
		sourceColumn: Customer ID

	partition Customers = m
		mode: import
		source =
				let
					Source = #table(type table [#"Customer ID" = text, Updated = date], {{"C1", #date(2025, 1, 1)}, {"C1", #date(2025, 2, 1)}}),
					#"Sorted Rows" = Table.Sort(Source, {{"Updated", Order.Descending}}),
					#"Removed Duplicates" = Table.Distinct(#"Sorted Rows", {"Customer ID"})
				in
					#"Removed Duplicates"
```

```tmdl fixed
table Customers
	column 'Customer ID'
		dataType: string
		summarizeBy: none
		sourceColumn: Customer ID

	partition Customers = m
		mode: import
		source =
				let
					Source = #table(type table [#"Customer ID" = text, Updated = date], {{"C1", #date(2025, 1, 1)}, {"C1", #date(2025, 2, 1)}}),
					#"Sorted Rows" = Table.Buffer(Table.Sort(Source, {{"Updated", Order.Descending}})),
					#"Removed Duplicates" = Table.Distinct(#"Sorted Rows", {"Customer ID"})
				in
					#"Removed Duplicates"
```

## Why it matters

Sorting first is the usual way to choose which row survives: newest first, so that removing duplicates keeps each customer's latest record. The trouble is that Power Query does not promise to keep the order the sort made. Microsoft describes exactly this case: "if you sort a sales table so that each store's largest sale is shown first, you might expect that doing a "Remove duplicates" operation returns only the top sale for each store. And this operation might, in fact, appear to work. However, this behavior isn't guaranteed." ([Common authoring issues, Preserving sort](https://learn.microsoft.com/power-query/common-issues#preserving-sort)). The same page says "sort order isn't guaranteed to be preserved through aggregations (such as `Table.Group`), merges (such as `Table.NestedJoin`), or duplicate removal (such as `Table.Distinct`)", and the page on duplicates repeats it: "Power Query doesn't guarantee that it keeps the first instance in a set of duplicates when it removes duplicates." ([Working with duplicate values, Remove duplicate rows in Power Query](https://learn.microsoft.com/power-query/working-with-duplicates#remove-duplicate-rows-in-power-query)).

So the query can keep the latest row in Power BI Desktop and an older one after a refresh in the service, or after the source changes how it returns rows, with no error either time. The report then shows an out-of-date address, price, or status for some keys, and nothing points at why.

## How to fix it

Keep the sort, and hold its order. In Power BI Desktop, choose Transform data, select the query, and in Applied steps select the Sorted Rows step. In the formula bar, wrap the step's formula in `Table.Buffer( ... )`, as the fixed example does. This is Microsoft's own suggestion: "Buffer the data (using `Table.Buffer`) before applying the downstream operation. In some cases, this operation causes the downstream operation to preserve the buffered sort order." ([Preserving sort](https://learn.microsoft.com/power-query/common-issues#preserving-sort)). Two things to know: a buffer holds the whole table in memory during refresh, so it costs more on a large table, and Microsoft hedges it ("In some cases"). It is also the fix the guides on keeping the latest record lead with: "[wrap your sort step in Table.Buffer()](https://www.xelplus.com/power-query-keep-latest-record/#h-the-one-line-fix-table-buffer)".

For a result that does not depend on order at all, replace the two steps. Either Group By the columns that decide what is a duplicate and keep the row with the latest date from each group, as the same guide puts it: "[Group By the columns that define your group, then pull the row with the latest timestamp from each.](https://www.xelplus.com/power-query-keep-latest-record/#h-the-sturdier-fix-group-by-to-keep-the-latest-record)"; or rank the rows, as Microsoft suggests: "order by the column(s) containing the duplicate values, rank based on a tie-breaker column (such as `modified_date`), and then filter to keep just the rank 1 rows" ([Preserving sort](https://learn.microsoft.com/power-query/common-issues#preserving-sort)). In the TMDL file, both steps are lines of the partition's `source` block.

## When to ignore it

When every row that shares the listed columns is the same in every column the query keeps afterwards, which row survives makes no difference, and the sort is only tidying the output. A finding on a query like that is noise; removing the sort step, or the columns the sort reads, says so to the next reader too.

## Quirks

- Only the sort that the `Table.Distinct` reads is checked: one written in place, or the step it names, followed through steps that only give that step another name. A sort several steps earlier, with other steps between, is not reported, though those steps can lose the order as well.
- A `Table.Buffer` around the sort, or a buffered step between the two, holds the order, and the query is not reported.
- A `Table.Distinct` with no list of columns, or with `null` in its place, compares whole rows, so the rows it chooses between are identical and the query is not reported.
- Only duplicate removal is read. A `Table.Group` after a sort can lose the order too, as Microsoft's page says, but it is not reported.
- Each `Table.Distinct` call is its own finding.
- A query whose M does not parse is not read; it gets a `PARSE_ISSUE` finding instead.

## Related rules

- `MINIMIZE_POWER_QUERY_TRANSFORMATIONS` counts `Table.Sort` and `Table.Distinct` among the steps it would rather see in the source, where a database's own `ORDER BY` and `DISTINCT`, or a window function, decide the surviving row with no doubt about order.

## Links

- [Table.Buffer](https://learn.microsoft.com/powerquery-m/table-buffer)
- [Table.Distinct](https://learn.microsoft.com/powerquery-m/table-distinct)
- [Group rows or summarize values](https://learn.microsoft.com/power-query/group-by)
````

The quotes are verbatim (checked on October 13, 2026); the XelPlus article is the one spec 9.2 cites, and its two anchors exist. In `rules/minimize-power-query-transformations.md`, add a last bullet under Related rules:

```markdown
- `SORT_NOT_HELD_FOR_REMOVE_DUPLICATES` reports a `Table.Distinct` straight after a `Table.Sort`, two of the names this rule reads, when nothing holds the sort's order.
```

Task 4 adds a `KEEP_FIRST_ROWS_LEFT_IN` bullet to the new page's Related rules once that rule exists.

- [ ] **Step 5: Regenerate the data files and run the page's tests**

```bash
npm run build -w @pbiplint/core && node scripts/sync-rule-pages.mjs
npx vitest run packages/core/test/rule-pages.test.ts -t "SORT_NOT_HELD_FOR_REMOVE_DUPLICATES|MINIMIZE_POWER_QUERY_TRANSFORMATIONS"
```

Expected: PASS, including "shows an example the engine flags and a fix it accepts".

- [ ] **Step 6: Pin the rule's findings on m-zoo**

Spec 9.2's five fixture shapes are all in m-zoo: `Customers Latest` (Sorted Rows then Removed Duplicates, fires), `Customers Inline` (in one expression, fires), and in `Sort Held` the buffered sort, the whole-row distinct, and the sort two steps back (none fires). In `tests/expectations/pbiplint/m-zoo.json`, add `"SORT_NOT_HELD_FOR_REMOVE_DUPLICATES"` at the end of `"rules"` (the list stays sorted), and insert these two entries in place order (by file, then line, then column, then rule: the first after the last `Budget.tmdl` entry, the second after the `Customers Latest.tmdl` line 14 entry):

```json
    { "rule": "SORT_NOT_HELD_FOR_REMOVE_DUPLICATES", "objectType": "Partition", "object": "Customers Inline", "file": "definition/tables/Customers Inline.tmdl", "line": 12, "column": 12, "detail": "query 'Customers Inline': nothing holds the order of the Table.Sort inside it, so the sort may not decide which duplicate is kept" },
    { "rule": "SORT_NOT_HELD_FOR_REMOVE_DUPLICATES", "objectType": "Partition", "object": "Customers Latest", "file": "definition/tables/Customers Latest.tmdl", "line": 18, "column": 30, "detail": "query 'Customers Latest', step 'Removed Duplicates': nothing holds the order of step 'Sorted Rows', so the sort may not decide which duplicate is kept" },
```

(Mind the commas: every entry but the last ends with one.) No other fixture with M fires this rule.

Run: `npx vitest run packages/core/test/rules-m.test.ts`
Expected: PASS. If a finding differs, stop: compare it with the fixture line before changing the file, and report it.

- [ ] **Step 7: Move the counts by one rule**

The rule is built in, so the count is 112 rules, 30 built into pbiplint, 7 Power Query rules, 6 of them pbiplint's own:

```bash
perl -pi -e 's/toBe\(111\)/toBe(112)/' packages/core/test/pack.test.ts
perl -pi -e 's/toBe\(111\)/toBe(112)/g; s/6 \+ 111\b/6 + 112/; s/"and 30 built into pbiplint\."/"and 31 built into pbiplint."/; s/"112 rules: 66/"113 rules: 66/; s/"111 rules: 66/"112 rules: 66/; s/and 29 built into pbiplint\."/and 30 built into pbiplint."/g; s/"85 rules: 66/"86 rules: 66/; s/and 14 built into pbiplint\."/and 15 built into pbiplint."/' packages/web/test/generate.test.ts
perl -0pi -e 's/\b6(\s+)rules/7$1rules/g; s/Power Query rules, 6 of them/Power Query rules, 7 of them/g; s/\b5 of them pbiplint/6 of them pbiplint/g; s/\b5 of pbiplint/6 of pbiplint/g; s/\b111(\s+)rules in all, 29 of/112$1rules in all, 30 of/g' README.md packages/cli/README.md packages/core/README.md packages/web/content/about.md
git diff --stat
```

Expected: `git diff --stat` lists the six files with small changes. In `packages/web/test/generate.test.ts`, also add `"sort-not-held-for-remove-duplicates",` as the last entry of the sorted Power Query slug list (after `"script-in-query",`). Then confirm the prose reads right:

```bash
git grep -n "112\|30 of\|7 rules\|7 of them\|6 of" -- README.md packages/cli/README.md packages/core/README.md packages/web/content/about.md
```

Expected: the root README twice (Status, and What it checks, where `7` ends one line and `rules check it` starts the next), and once each in the CLI README, the core README, and the About page; nothing else changed.

- [ ] **Step 8: Run what this task touches, and measure**

```bash
npx vitest run packages/core/test packages/web/test packages/cli/test
npm run typecheck
npm run check:browser
```

Expected: PASS, every test. Write the `check:browser` line into `progress.md` under Task 3. If the core's own code is over 230 KB, stop and report to pb-coord.

- [ ] **Step 9: Commit**

```bash
npx prettier --write packages/core/src/rules/pbiplint/power-query.ts packages/core/test/rules-power-query.test.ts packages/core/src/rules/rule-summaries.data.ts packages/cli/src/rule-help.data.ts packages/web/src/results/rule-guidance.data.ts packages/core/test/pack.test.ts packages/web/test/generate.test.ts
npm run lint
git add packages rules README.md tests/expectations/pbiplint/m-zoo.json
git commit -m "feat: SORT_NOT_HELD_FOR_REMOVE_DUPLICATES reports a sort nothing holds

A Table.Distinct with a column list, straight after a Table.Sort written
in place or held by a step, is a warning: Power Query does not promise to
keep the order, so the sort may not decide which duplicate survives. The
page keeps the sort and adds Table.Buffer. 112 rules, 30 built in.

Part of #78.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: `KEEP_FIRST_ROWS_LEFT_IN` and its page

**Files:**
- Modify: `packages/core/src/rules/pbiplint/power-query.ts`
- Create: `rules/keep-first-rows-left-in.md`
- Modify: `rules/sort-not-held-for-remove-duplicates.md` (Related rules)
- Modify (generated): the three `.data.ts` files
- Modify: `tests/expectations/pbiplint/m-zoo.json`
- Modify: `packages/core/test/pack.test.ts`, `packages/web/test/generate.test.ts`, the four count files
- Test: `packages/core/test/rules-power-query.test.ts`

**Interfaces:**
- Consumes: `callOf`, `calls`, `parentOf`, `unwrap` (`m/ast.ts`); `boundValue`; `mFinding`; `pbiplintRule`.
- Produces: `export const KEEP_FIRST_ROWS_LEFT_IN: Rule`, appended to `powerQueryRules`; the module-level helper `numberLiteral(n: Node): number | undefined` in `power-query.ts`, which Task 6 reuses.

- [ ] **Step 1: Write the failing tests**

In `packages/core/test/rules-power-query.test.ts`, the rule import gains `KEEP_FIRST_ROWS_LEFT_IN` (in alphabetical place, after `EXCEL_USE_HEADERS`). Add at the end:

```ts
describe("KEEP_FIRST_ROWS_LEFT_IN (v3 spec, section 9.11)", () => {
  const rule = KEEP_FIRST_ROWS_LEFT_IN;
  const orders =
    "\tSource = #table(type table [OrderID = number, Amount = number], {{1, 10}, {2, 20}}),";
  it("is a built-in Power Query warning on a query's owner", () => {
    isPowerQueryRule(rule, 2, "Error Prevention");
    expect(rule.name).toBe("Keep First Rows left in a loaded query");
    expect(rule.scope).toEqual(["Partition", "NamedExpression", "Table"]);
  });
  it("reports a Keep First Rows step in a partition, with its count", async () => {
    const tmdl = table(
      "Orders",
      "let",
      orders,
      '\t#"Kept First Rows" = Table.FirstN(Source, 1000)',
      "in",
      '\t#"Kept First Rows"',
    );
    expect(await mFindings(rule, tmdl)).toEqual([
      {
        objectType: "Partition",
        objectName: "Orders",
        location: { file: "inline.tmdl", line: 7, column: 27 },
        detail: "query 'Orders', step 'Kept First Rows': only the first 1000 rows load",
      },
    ]);
  });
  it("leaves alone a top N after a sort or a buffered sort, a count of 0 or 1, a count not written as a number, and a top N per group", async () => {
    const tmdl = table(
      "Orders",
      "let",
      orders,
      '\tTopTen = Table.FirstN(Table.Sort(Source, {{"Amount", Order.Descending}}), 10),',
      '\tSorted = Table.Buffer(Table.Sort(Source, {{"Amount", Order.Descending}})),',
      "\tTopFive = Table.FirstN(Sorted, 5),",
      "\tSchemaOnly = Table.FirstN(Source, 0),",
      "\tSettings = Table.FirstN(Source, 1),",
      "\tFromParameter = Table.FirstN(Source, RowLimit),",
      "\tWhile = Table.FirstN(Source, each [Amount] > 0),",
      '\tPerGroup = Table.Group(Source, {"OrderID"}, {{"Top", each Table.FirstN(_, 3), type table}})',
      "in",
      "\tPerGroup",
    );
    expect(await mFindings(rule, tmdl)).toEqual([]);
  });
  it("leaves alone a shared expression, which does not load", async () => {
    const tmdl = 'expression Preview =\n\t\tTable.FirstN(#table({"OrderID"}, {{1}}), 1000)\n';
    expect(await mFindings(rule, tmdl)).toEqual([]);
  });
});
```

- [ ] **Step 2: Run them to make sure they fail**

Run: `npx vitest run packages/core/test/rules-power-query.test.ts -t KEEP_FIRST`
Expected: FAIL: `KEEP_FIRST_ROWS_LEFT_IN` is not exported.

- [ ] **Step 3: Write the rule**

In `packages/core/src/rules/pbiplint/power-query.ts`, the `m/ast.js` import becomes:

```ts
import {
  callOf,
  calls,
  identifierName,
  parentOf,
  textLiterals,
  textValue,
  unwrap,
} from "../../m/ast.js";
```

Add after `SORT_NOT_HELD_FOR_REMOVE_DUPLICATES`:

```ts
/** A number written in place, as M reads it; undefined for anything else. */
function numberLiteral(n: Node): number | undefined {
  const v = unwrap(n);
  return v.kind === Kind.LiteralExpression && v.literalKind === Language.Ast.LiteralKind.Numeric
    ? Number(v.literal)
    : undefined;
}

/** A table that is a Table.Sort, or a Table.Buffer of one, written in place or held by a step. */
function isSorted(m: MIndex, q: MQuery, table: Node): boolean {
  let c = callOf(boundValue(m, q, table).node);
  if (c?.name === "Table.Buffer" && c.args[0]) c = callOf(boundValue(m, q, c.args[0]).node);
  return c?.name === "Table.Sort";
}

/** Whether a node sits inside an `each` or a function, where it runs once per row or per call. */
function inFunction(q: MQuery, node: Node): boolean {
  for (let n = parentOf(q, node); n; n = parentOf(q, n))
    if (n.kind === Kind.EachExpression || n.kind === Kind.FunctionExpression) return true;
  return false;
}

// Keep First Rows left in a query that loads: a partition's, or a refresh policy's that is read
// (v3 spec, section 9.11). A count of 0 or 1, a top N after a sort, a count that is not written
// in place, a top N per group, and shared expressions, which do not load, are left alone.
export const KEEP_FIRST_ROWS_LEFT_IN = pbiplintRule({
  id: "KEEP_FIRST_ROWS_LEFT_IN",
  name: "Keep First Rows left in a loaded query",
  category: "Error Prevention",
  severity: 2,
  scope: ["Partition", "NamedExpression", "Table"],
  layer: "powerquery",
  check: (_project, { indexes: { m } }) =>
    m.queries
      .filter((q) => q.kind !== "expression")
      .flatMap((q) =>
        calls(q).flatMap((c) => {
          const [table, count] = c.args;
          if (c.name !== "Table.FirstN" || !table || !count) return [];
          const n = numberLiteral(count);
          if (n === undefined || n <= 1 || isSorted(m, q, table) || inFunction(q, c.node))
            return [];
          return [mFinding(m, q, c.node, `only the first ${n} rows load`)];
        }),
      ),
});
```

and `powerQueryRules` gains `KEEP_FIRST_ROWS_LEFT_IN,` after `SORT_NOT_HELD_FOR_REMOVE_DUPLICATES,`.

Run: `npx vitest run packages/core/test/rules-power-query.test.ts`
Expected: PASS.

- [ ] **Step 4: Write the page**

Create `rules/keep-first-rows-left-in.md`:

````markdown
---
id: KEEP_FIRST_ROWS_LEFT_IN
name: "Keep First Rows left in a loaded query"
category: Error Prevention
severity: warning
scope: [Partition, NamedExpression, Table]
status: builtin
layer: powerquery
video:
sources:
---

# Keep First Rows left in a loaded query

## What it checks

Power Query queries that load into the model and keep only their first rows: a `Table.FirstN` call with a number greater than 1, the Keep First Rows step, whose table is not sorted first.

Each finding names the partition or, for an incremental refresh policy's own query, the table. Its detail names the query, the step, and the number of rows, as `query 'Orders', step 'Kept First Rows': only the first 1000 rows load`. The location is the line and column of the `Table.FirstN` call in the TMDL file.

## Example

```tmdl fires
table Orders
	column OrderID
		dataType: int64
		summarizeBy: none
		sourceColumn: OrderID

	partition Orders = m
		mode: import
		source =
				let
					Source = #table(type table [OrderID = number], {{1}, {2}, {3}}),
					#"Kept First Rows" = Table.FirstN(Source, 1000)
				in
					#"Kept First Rows"
```

```tmdl fixed
table Orders
	column OrderID
		dataType: int64
		summarizeBy: none
		sourceColumn: OrderID

	partition Orders = m
		mode: import
		source =
				let
					Source = #table(type table [OrderID = number], {{1}, {2}, {3}})
				in
					Source
```

## Why it matters

Keep First Rows is a good way to work on a large source: the editor previews and applies each step against a few hundred rows instead of millions. Microsoft recommends it while a query is being built, and says what to do after: "After you add all the required steps, remove the **Keep First Rows** step so the completed query processes the full data set." ([Best practices, Use a data subset while developing a query](https://learn.microsoft.com/power-query/best-practices#use-a-data-subset-while-developing-a-query)). Left in, the step goes on cutting the table at every refresh. Totals, counts, and averages are then computed over a slice of the data, the report shows them with no error or warning, and once the source grows past the limit the numbers stop changing.

## How to fix it

In Power BI Desktop, choose Transform data, select the query, and in Applied steps delete the Kept First Rows step with the X beside it ([Applied steps, Delete step](https://learn.microsoft.com/power-query/applied-steps#delete-step)). If the first rows are what the table should hold, such as the ten largest orders, sort first: add a Sort step before Keep First Rows, so the step reads as a top N and keeps the same rows at every refresh. In the TMDL file, remove the `Table.FirstN` line from the partition's `source` block and point the line after `in` at the step before it, as the fixed example does.

## When to ignore it

When the table is meant to hold a sample, such as a preview table beside the full one or a model that only ever runs in Desktop for development. When the source already returns its rows in a meaningful order, such as an API that lists the newest first, the first rows may be the ones you want; a sort in the query says so to the next reader, and the rule then leaves it alone.

## Quirks

- A count of 0 or 1 is not reported: an empty table that keeps a query's columns, and a single row of settings, are both common and deliberate.
- A `Table.FirstN` whose table is sorted, by a `Table.Sort` or a `Table.Buffer` of one, written in place or as the step it reads, is a top N and is not reported.
- Only a count written as a number is read. A count from a parameter, or a condition such as `each [Amount] > 0` in place of a count, is not reported.
- A `Table.FirstN` inside an `each` or a function, such as a top three per group in `Table.Group`, runs once per group or per call and is not reported.
- Shared expressions do not load on their own, so they are not read. A table that reads a shared expression holding a Keep First Rows step is not reported either.
- Each call is its own finding.
- A query whose M does not parse is not read; it gets a `PARSE_ISSUE` finding instead.

## Related rules

- `SORT_NOT_HELD_FOR_REMOVE_DUPLICATES` reads the same thing from the other side: a sort meant to decide which rows are kept, before a step that may not keep its order.

## Links

- [Table.FirstN](https://learn.microsoft.com/powerquery-m/table-firstn)
````

In `rules/sort-not-held-for-remove-duplicates.md`, add a last bullet under Related rules:

```markdown
- `KEEP_FIRST_ROWS_LEFT_IN` reads a sort the same way, as what decides which rows a Keep First Rows step keeps, and leaves a sorted top N alone.
```

- [ ] **Step 5: Regenerate and run the pages' tests**

```bash
npm run build -w @pbiplint/core && node scripts/sync-rule-pages.mjs
npx vitest run packages/core/test/rule-pages.test.ts -t "KEEP_FIRST_ROWS_LEFT_IN|SORT_NOT_HELD_FOR_REMOVE_DUPLICATES"
```

Expected: PASS.

- [ ] **Step 6: Pin the rule's finding on m-zoo**

Spec 9.11's four shapes are in m-zoo: `Top Rows` (`Table.FirstN(Orders, 1000)`, fires) and, in `Top Rows Kept`, the sorted top ten, `Table.FirstN(Sales, 0)`, and the top three inside `Table.Group`'s `each` (none fires). In `tests/expectations/pbiplint/m-zoo.json`, add `"KEEP_FIRST_ROWS_LEFT_IN"` to `"rules"` in sorted place (after `"EXCEL_USE_HEADERS"`), and add this entry last (it is the last in place order; add a comma after the entry before it):

```json
    { "rule": "KEEP_FIRST_ROWS_LEFT_IN", "objectType": "Partition", "object": "Top Rows", "file": "definition/tables/Top Rows.tmdl", "line": 17, "column": 27, "detail": "query 'Top Rows', step 'Kept First Rows': only the first 1000 rows load" }
```

Run: `npx vitest run packages/core/test/rules-m.test.ts`
Expected: PASS.

- [ ] **Step 7: Move the counts by one rule**

113 rules, 31 built in, 8 Power Query rules, 7 of them pbiplint's own:

```bash
perl -pi -e 's/toBe\(112\)/toBe(113)/' packages/core/test/pack.test.ts
perl -pi -e 's/toBe\(112\)/toBe(113)/g; s/6 \+ 112\b/6 + 113/; s/"and 31 built into pbiplint\."/"and 32 built into pbiplint."/; s/"113 rules: 66/"114 rules: 66/; s/"112 rules: 66/"113 rules: 66/; s/and 30 built into pbiplint\."/and 31 built into pbiplint."/g; s/"86 rules: 66/"87 rules: 66/; s/and 15 built into pbiplint\."/and 16 built into pbiplint."/' packages/web/test/generate.test.ts
perl -0pi -e 's/\b7(\s+)rules/8$1rules/g; s/Power Query rules, 7 of them/Power Query rules, 8 of them/g; s/\b6 of them pbiplint/7 of them pbiplint/g; s/\b6 of pbiplint/7 of pbiplint/g; s/\b112(\s+)rules in all, 30 of/113$1rules in all, 31 of/g' README.md packages/cli/README.md packages/core/README.md packages/web/content/about.md
git diff --stat
```

In `packages/web/test/generate.test.ts`, add `"keep-first-rows-left-in",` to the Power Query slug list in sorted place (after `"excel-use-headers",`). Check the prose with `git diff README.md packages/cli/README.md packages/core/README.md packages/web/content/about.md`: only the four numbers per count sentence changed.

- [ ] **Step 8: Run what this task touches, and measure**

```bash
npx vitest run packages/core/test packages/web/test packages/cli/test
npm run typecheck
npm run check:browser
```

Expected: PASS. Write the `check:browser` line into `progress.md` under Task 4; over 230 KB stops the task.

- [ ] **Step 9: Commit**

```bash
npx prettier --write packages/core/src/rules/pbiplint/power-query.ts packages/core/test/rules-power-query.test.ts packages/core/src/rules/rule-summaries.data.ts packages/cli/src/rule-help.data.ts packages/web/src/results/rule-guidance.data.ts packages/core/test/pack.test.ts packages/web/test/generate.test.ts
npm run lint
git add packages rules README.md tests/expectations/pbiplint/m-zoo.json
git commit -m "feat: KEEP_FIRST_ROWS_LEFT_IN reports a Keep First Rows step left in

A Table.FirstN with a count above 1 in a query that loads, its table not
sorted first, is a warning: refresh then loads only those rows. A top N
after a sort, a count of 0 or 1, and a top N per group are left alone.
113 rules, 31 built in.

Part of #78.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: `INCREMENTAL_REFRESH_RANGE_BOUNDS` and its page

**Files:**
- Modify: `packages/core/src/rules/pbiplint/power-query.ts`
- Create: `rules/incremental-refresh-range-bounds.md`
- Modify: `rules/large-tables-should-be-partitioned.md` (Related rules)
- Modify (generated): the three `.data.ts` files
- Modify: `tests/expectations/pbiplint/m-zoo.json`
- Modify: `packages/core/test/pack.test.ts`, `packages/web/test/generate.test.ts`, the four count files
- Test: `packages/core/test/rules-power-query.test.ts`

**Interfaces:**
- Consumes: `callOf`, `nodesOfKind` (`m/ast.ts`); `boundValue`, `resolve` (`m/resolve.ts`); `mFinding`; `pbiplintRule`.
- Produces: `export const INCREMENTAL_REFRESH_RANGE_BOUNDS: Rule`, appended to `powerQueryRules`; module-level helpers in `power-query.ts` that Task 6 reuses: `type RangeParameter = "RangeStart" | "RangeEnd"`, `rangeParameterOf(m: MIndex, q: MQuery, side: Node, depth?: number): RangeParameter | undefined`, and `FLIPPED: Readonly<Record<string, string>>`.

- [ ] **Step 1: Write the failing tests**

In `packages/core/test/rules-power-query.test.ts`, the rule import gains `INCREMENTAL_REFRESH_RANGE_BOUNDS` (after `EXCEL_USE_HEADERS`), and `isPowerQueryRule`'s signature becomes `function isPowerQueryRule(rule: Rule, severity: 1 | 2 | 3, category: string): void {` (this is the first error among the Power Query rules). Add at the end:

```ts
describe("INCREMENTAL_REFRESH_RANGE_BOUNDS (v3 spec, section 9.4)", () => {
  const rule = INCREMENTAL_REFRESH_RANGE_BOUNDS;
  const parameters =
    'expression RangeStart = #datetime(2024, 1, 1, 0, 0, 0) meta [IsParameterQuery = true, Type = "DateTime", IsParameterQueryRequired = true]\n\n' +
    'expression RangeEnd = #datetime(2025, 1, 1, 0, 0, 0) meta [IsParameterQuery = true, Type = "DateTime", IsParameterQueryRequired = true]\n\n';
  /** A Sales partition filtered with `condition`, beside the model's RangeStart and RangeEnd. */
  const filtered = (condition: string, ...before: string[]): string =>
    parameters +
    table(
      "Sales",
      "let",
      "\tSource = #table(type table [OrderDate = datetime], {}),",
      ...before,
      `\t#"Filtered Rows" = Table.SelectRows(Source, each ${condition})`,
      "in",
      '\t#"Filtered Rows"',
    );
  it("is a built-in Power Query error on a query's owner", () => {
    isPowerQueryRule(rule, 3, "Error Prevention");
    expect(rule.name).toBe("Incremental refresh filter counts a boundary row twice or never");
    expect(rule.scope).toEqual(["Partition", "NamedExpression", "Table"]);
  });
  it("reports both bounds included, on the RangeEnd comparison", async () => {
    expect(
      await mFindings(rule, filtered("[OrderDate] >= RangeStart and [OrderDate] <= RangeEnd")),
    ).toEqual([
      {
        objectType: "Partition",
        objectName: "Sales",
        location: { file: "inline.tmdl", line: 11, column: 85 },
        detail:
          "query 'Sales', step 'Filtered Rows': both RangeStart and RangeEnd include the boundary, so a row on it lands in two partitions",
      },
    ]);
  });
  it("reports neither bound included, on the RangeStart comparison", async () => {
    const [f] = await mFindings(
      rule,
      filtered("[OrderDate] > RangeStart and [OrderDate] < RangeEnd"),
    );
    expect(f?.location).toEqual({ file: "inline.tmdl", line: 11, column: 55 });
    expect(f?.detail).toBe(
      "query 'Sales', step 'Filtered Rows': neither RangeStart nor RangeEnd includes the boundary, so a row on it lands in none",
    );
  });
  it("reads a comparison with the parameter first, inside a call, or held by a step", async () => {
    const details = async (condition: string, ...before: string[]) =>
      (await mFindings(rule, filtered(condition, ...before))).map(
        (f) => f.detail!.split(": ")[1]!.split(" ")[0],
      );
    expect(await details("RangeStart <= [OrderDate] and RangeEnd >= [OrderDate]")).toEqual([
      "both",
    ]);
    expect(await details("[Key] > DateKey(RangeStart) and [Key] < DateKey(RangeEnd)")).toEqual([
      "neither",
    ]);
    expect(
      await details("[OrderDate] >= Start and [OrderDate] <= RangeEnd", "\tStart = RangeStart,"),
    ).toEqual(["both"]);
  });
  it("leaves alone one bound included, one parameter only, a shadowed parameter, and both kinds on one parameter", async () => {
    expect(
      await mFindings(rule, filtered("[OrderDate] >= RangeStart and [OrderDate] < RangeEnd")),
    ).toEqual([]);
    expect(
      await mFindings(rule, filtered("[Key] > DateKey(RangeStart) and [Key] <= DateKey(RangeEnd)")),
    ).toEqual([]);
    expect(await mFindings(rule, filtered("[OrderDate] >= RangeStart"))).toEqual([]);
    expect(
      await mFindings(
        rule,
        filtered(
          "[OrderDate] >= RangeStart and [OrderDate] <= RangeEnd",
          "\tRangeEnd = #datetime(2030, 1, 1, 0, 0, 0),",
        ),
      ),
    ).toEqual([]);
    expect(
      await mFindings(
        rule,
        filtered(
          "[OrderDate] >= RangeStart and [OrderDate] > RangeStart and [OrderDate] <= RangeEnd",
        ),
      ),
    ).toEqual([]);
  });
  it("reports a refresh policy whose query matches its partition once, on the partition", async () => {
    const m = [
      "let",
      "\tSource = #table(type table [OrderDate = datetime], {}),",
      '\t#"Filtered Rows" = Table.SelectRows(Source, each [OrderDate] >= RangeStart and [OrderDate] <= RangeEnd)',
      "in",
      '\t#"Filtered Rows"',
    ];
    const tmdl =
      parameters +
      `table Sales\n\tpartition Sales = m\n\t\tmode: import\n\t\tsource =\n${m.map((l) => `\t\t\t\t${l}`).join("\n")}\n\n` +
      `\trefreshPolicy\n\t\tpolicyType: basic\n\t\tsourceExpression =\n${m.map((l) => `\t\t\t\t${l}`).join("\n")}\n`;
    expect((await mFindings(rule, tmdl)).map((f) => f.objectType)).toEqual(["Partition"]);
  });
});
```

The detail's word after `: ` (`both` or `neither`) is what the third and fourth tests compare; a missing finding gives `[]`.

- [ ] **Step 2: Run them to make sure they fail**

Run: `npx vitest run packages/core/test/rules-power-query.test.ts -t INCREMENTAL`
Expected: FAIL: `INCREMENTAL_REFRESH_RANGE_BOUNDS` is not exported.

- [ ] **Step 3: Write the rule**

In `packages/core/src/rules/pbiplint/power-query.ts`, the `m/ast.js` import gains `nodesOfKind`:

```ts
import {
  callOf,
  calls,
  identifierName,
  nodesOfKind,
  parentOf,
  textLiterals,
  textValue,
  unwrap,
} from "../../m/ast.js";
```

Add after `KEEP_FIRST_ROWS_LEFT_IN`:

```ts
type RangeParameter = "RangeStart" | "RangeEnd";

/**
 * The incremental refresh parameter one side of a comparison reads: the model's `RangeStart` or
 * `RangeEnd`, written as itself, through steps that hold it, or inside a call
 * (`DateKey(RangeStart)`). A local name that shadows the parameter is not it.
 */
function rangeParameterOf(m: MIndex, q: MQuery, side: Node, depth = 0): RangeParameter | undefined {
  const v = boundValue(m, q, side).node;
  if (v.kind === Kind.IdentifierExpression) {
    const r = resolve(m, q, v);
    const name = r.kind === "modelParameter" ? r.query.name : undefined;
    return name === "RangeStart" || name === "RangeEnd" ? name : undefined;
  }
  const c = callOf(v);
  if (!c || depth > 8) return undefined;
  for (const a of c.args) {
    const found = rangeParameterOf(m, q, a, depth + 1);
    if (found) return found;
  }
  return undefined;
}

/** A relational operator read the other way round: `RangeStart <= [Date]` is `[Date] >= RangeStart`. */
const FLIPPED: Readonly<Record<string, string>> = { "<": ">", "<=": ">=", ">": "<", ">=": "<=" };

// Microsoft asks for an equals sign on one of RangeStart and RangeEnd, not both (v3 spec, section
// 9.4). A query whose comparisons with the two include both bounds, or neither, is an error: a row
// on the boundary lands in two partitions, or in none. Comparisons of both kinds on one parameter
// are left alone, since which one filters cannot be told.
export const INCREMENTAL_REFRESH_RANGE_BOUNDS = pbiplintRule({
  id: "INCREMENTAL_REFRESH_RANGE_BOUNDS",
  name: "Incremental refresh filter counts a boundary row twice or never",
  category: "Error Prevention",
  severity: 3,
  scope: ["Partition", "NamedExpression", "Table"],
  layer: "powerquery",
  check: (_project, { indexes: { m } }) =>
    m.queries.flatMap((q) => {
      const start = { inclusive: [] as Node[], exclusive: [] as Node[] };
      const end = { inclusive: [] as Node[], exclusive: [] as Node[] };
      for (const node of nodesOfKind(q, Kind.RelationalExpression)) {
        if (node.kind !== Kind.RelationalExpression) continue;
        const left = rangeParameterOf(m, q, node.left);
        const right = rangeParameterOf(m, q, node.right);
        if ((left === undefined) === (right === undefined)) continue;
        const op = node.operatorConstant.constantKind as string;
        // Read as "column, operator, parameter".
        const operator = right ? op : FLIPPED[op]!;
        const parameter = right ?? left;
        if (parameter === "RangeStart" && operator === ">=") start.inclusive.push(node);
        else if (parameter === "RangeStart" && operator === ">") start.exclusive.push(node);
        else if (parameter === "RangeEnd" && operator === "<=") end.inclusive.push(node);
        else if (parameter === "RangeEnd" && operator === "<") end.exclusive.push(node);
      }
      const one = (b: typeof start) => b.inclusive.length > 0 !== b.exclusive.length > 0;
      if (!one(start) || !one(end)) return [];
      if (start.inclusive.length > 0 && end.inclusive.length > 0)
        return [
          mFinding(
            m,
            q,
            end.inclusive[0]!,
            "both RangeStart and RangeEnd include the boundary, so a row on it lands in two partitions",
          ),
        ];
      if (start.exclusive.length > 0 && end.exclusive.length > 0)
        return [
          mFinding(
            m,
            q,
            start.exclusive[0]!,
            "neither RangeStart nor RangeEnd includes the boundary, so a row on it lands in none",
          ),
        ];
      return [];
    }),
});
```

and `powerQueryRules` gains `INCREMENTAL_REFRESH_RANGE_BOUNDS,` after `KEEP_FIRST_ROWS_LEFT_IN,`.

Why it works on m-zoo's shapes: `boundValue` stops at `RangeStart` (its resolution is `modelParameter`, not `value`), so `resolve` names the parameter; a `let` variable named `RangeEnd` resolves to `value`, `boundValue` follows it to `#datetime(2030, ...)`, a call of numbers, and nothing is found. A refresh policy whose query matches its partition is not in `m.queries` (`readM`, spec 5.1), so the table has one finding.

Run: `npx vitest run packages/core/test/rules-power-query.test.ts`
Expected: PASS.

- [ ] **Step 4: Write the page**

Create `rules/incremental-refresh-range-bounds.md`:

````markdown
---
id: INCREMENTAL_REFRESH_RANGE_BOUNDS
name: "Incremental refresh filter counts a boundary row twice or never"
category: Error Prevention
severity: error
scope: [Partition, NamedExpression, Table]
status: builtin
layer: powerquery
video:
sources:
---

# Incremental refresh filter counts a boundary row twice or never

## What it checks

Power Query queries that filter on both of the model's incremental refresh parameters, `RangeStart` and `RangeEnd`, and either include the boundary on both (`>= RangeStart` and `<= RangeEnd`) or on neither (`> RangeStart` and `< RangeEnd`).

Each finding names the partition, the shared expression, or, for an incremental refresh policy's own query, the table. Its detail names the query and the step, then which way the filter is wrong, as `query 'Sales', step 'Filtered Rows': both RangeStart and RangeEnd include the boundary, so a row on it lands in two partitions`, or `neither RangeStart nor RangeEnd includes the boundary, so a row on it lands in none`. The location is the line and column of the `RangeEnd` comparison when both include the boundary, and of the `RangeStart` comparison when neither does.

## Example

```tmdl fires
expression RangeStart = #datetime(2024, 1, 1, 0, 0, 0) meta [IsParameterQuery = true, Type = "DateTime", IsParameterQueryRequired = true]

expression RangeEnd = #datetime(2025, 1, 1, 0, 0, 0) meta [IsParameterQuery = true, Type = "DateTime", IsParameterQueryRequired = true]

table Sales
	column OrderDate
		dataType: dateTime
		summarizeBy: none
		sourceColumn: OrderDate

	partition Sales = m
		mode: import
		source =
				let
					Source = #table(type table [OrderDate = datetime], {{#datetime(2024, 6, 1, 0, 0, 0)}}),
					#"Filtered Rows" = Table.SelectRows(Source, each [OrderDate] >= RangeStart and [OrderDate] <= RangeEnd)
				in
					#"Filtered Rows"
```

```tmdl fixed
expression RangeStart = #datetime(2024, 1, 1, 0, 0, 0) meta [IsParameterQuery = true, Type = "DateTime", IsParameterQueryRequired = true]

expression RangeEnd = #datetime(2025, 1, 1, 0, 0, 0) meta [IsParameterQuery = true, Type = "DateTime", IsParameterQueryRequired = true]

table Sales
	column OrderDate
		dataType: dateTime
		summarizeBy: none
		sourceColumn: OrderDate

	partition Sales = m
		mode: import
		source =
				let
					Source = #table(type table [OrderDate = datetime], {{#datetime(2024, 6, 1, 0, 0, 0)}}),
					#"Filtered Rows" = Table.SelectRows(Source, each [OrderDate] >= RangeStart and [OrderDate] < RangeEnd)
				in
					#"Filtered Rows"
```

## Why it matters

Incremental refresh splits a table into partitions by date, and the service fills each one by running the query with `RangeStart` and `RangeEnd` set to that partition's first moment and the next partition's first moment. The end of one partition is the start of the next, so a row stamped exactly on that moment must pass one filter and fail the other. Microsoft's instruction is plain: "Verify queries have an equal to (=) on either RangeStart or RangeEnd, but not both. If the equal to (=) exists on both parameters, a row could satisfy the conditions for two partitions, which could lead to duplicate data in the model." ([Configure incremental refresh, Filter data](https://learn.microsoft.com/power-bi/connect-data/incremental-refresh-configure#filter-data)). With the equals sign on neither, the same row passes no filter at all and never loads. Dates without a time of day sit on the boundary at midnight, so on a date column the rows of the first day of every partition are counted twice or lost. Either way the totals are wrong, nothing fails, and the error grows with every partition.

## How to fix it

In Power BI Desktop, choose Transform data, select the query, and in Applied steps select the gear beside the filter step (usually Filtered Rows) to open Filter Rows. Make the first condition **is after or equal to** `RangeStart` and the second **is before** `RangeEnd`, as Microsoft's [Filter data](https://learn.microsoft.com/power-bi/connect-data/incremental-refresh-configure#filter-data) walkthrough shows. Any pair with exactly one equals sign works; that one is the most common. In the TMDL file, change `<=` to `<` (or `>` to `>=`) in the partition's `source` block. When the table has a `refreshPolicy`, Desktop writes the same query as its `sourceExpression`; change it there too, or open the query in Desktop, which keeps the two in step.

## When to ignore it

A column that can never hold a value equal to a boundary, such as a timestamp that always carries seconds past midnight, cannot double or lose a row today. The fix still costs one character and keeps holding if the data changes, so there is rarely a reason to keep the finding.

## Quirks

- Comparisons are read anywhere in the query, in either order (`RangeStart <= [OrderDate]` reads as `[OrderDate] >= RangeStart`), and with the parameter inside a call, as in `DateKey(RangeStart)` for an integer date key, or held by a step.
- Only the model's own parameters count: shared expressions named `RangeStart` and `RangeEnd` that are Power Query parameters. A step or a function parameter with the same name hides the model's parameter, and its comparison is not read.
- A query that compares one parameter both ways, with and without the equals sign, is left alone, since which comparison filters cannot be told from the text.
- A query that compares with only one of the two parameters, or that uses `=` or `<>` with them, is not reported.
- The refresh policy's own query is read only when it differs from the partition's, so a table where Desktop writes the same query in both places has one finding, on the partition.
- A query whose M does not parse is not read; it gets a `PARSE_ISSUE` finding instead.

## Related rules

- `LARGE_TABLES_SHOULD_BE_PARTITIONED` asks for incremental refresh on a large table; this rule checks the filter that incremental refresh depends on.

## Links

- [Incremental refresh and real-time data for semantic models](https://learn.microsoft.com/power-bi/connect-data/incremental-refresh-overview)
- [Configure incremental refresh, Create parameters](https://learn.microsoft.com/power-bi/connect-data/incremental-refresh-configure#create-parameters)
````

The fires example holds the two parameters and the table in one file; `rule-pages.test.ts` lints it as one `example.tmdl`, which the scratch run confirmed parses with no `PARSE_ISSUE`. In `rules/large-tables-should-be-partitioned.md`, add a last bullet under Related rules:

```markdown
- `INCREMENTAL_REFRESH_RANGE_BOUNDS` checks the `RangeStart` and `RangeEnd` filter that incremental refresh depends on, so the partitions this rule asks for neither share nor lose a boundary row.
```

- [ ] **Step 5: Regenerate and run the pages' tests**

```bash
npm run build -w @pbiplint/core && node scripts/sync-rule-pages.mjs
npx vitest run packages/core/test/rule-pages.test.ts -t "INCREMENTAL_REFRESH_RANGE_BOUNDS|LARGE_TABLES_SHOULD_BE_PARTITIONED"
```

Expected: PASS.

- [ ] **Step 6: Pin the rule's findings on m-zoo**

Spec 9.4's seven shapes are in m-zoo: `Sales` (both inclusive, with a `refreshPolicy` whose `sourceExpression` matches the partition: fires once), `Range Exclusive` (fires), `Range Reversed` (parameters first, both inclusive: fires), `Range Correct` (`>=` and `<`), `Range Date Key` (`DateKey` with `>` and `<=`), and `Range Shadowed` (a `let` variable named `RangeEnd`), the last three silent. In `tests/expectations/pbiplint/m-zoo.json`, add `"INCREMENTAL_REFRESH_RANGE_BOUNDS"` to `"rules"` in sorted place (after `"EXCEL_USE_HEADERS"`), and insert these in place order (`Range Exclusive.tmdl` and `Range Reversed.tmdl` after the `Orders Files.tmdl` entry; `Sales.tmdl` after the `Sales Files.tmdl` entry, since a space sorts before a dot):

```json
    { "rule": "INCREMENTAL_REFRESH_RANGE_BOUNDS", "objectType": "Partition", "object": "Range Exclusive", "file": "definition/tables/Range Exclusive.tmdl", "line": 16, "column": 55, "detail": "query 'Range Exclusive', step 'Filtered Rows': neither RangeStart nor RangeEnd includes the boundary, so a row on it lands in none" },
    { "rule": "INCREMENTAL_REFRESH_RANGE_BOUNDS", "objectType": "Partition", "object": "Range Reversed", "file": "definition/tables/Range Reversed.tmdl", "line": 16, "column": 85, "detail": "query 'Range Reversed', step 'Filtered Rows': both RangeStart and RangeEnd include the boundary, so a row on it lands in two partitions" },
    { "rule": "INCREMENTAL_REFRESH_RANGE_BOUNDS", "objectType": "Partition", "object": "Sales", "file": "definition/tables/Sales.tmdl", "line": 17, "column": 85, "detail": "query 'Sales', step 'Filtered Rows': both RangeStart and RangeEnd include the boundary, so a row on it lands in two partitions" },
```

Run: `npx vitest run packages/core/test/rules-m.test.ts`
Expected: PASS. The test "is written in place order" fails with the right order in its diff if an entry is misplaced; move the line, do not change its content.

- [ ] **Step 7: Move the counts by one rule**

114 rules, 32 built in, 9 Power Query rules, 8 of them pbiplint's own:

```bash
perl -pi -e 's/toBe\(113\)/toBe(114)/' packages/core/test/pack.test.ts
perl -pi -e 's/toBe\(113\)/toBe(114)/g; s/6 \+ 113\b/6 + 114/; s/"and 32 built into pbiplint\."/"and 33 built into pbiplint."/; s/"114 rules: 66/"115 rules: 66/; s/"113 rules: 66/"114 rules: 66/; s/and 31 built into pbiplint\."/and 32 built into pbiplint."/g; s/"87 rules: 66/"88 rules: 66/; s/and 16 built into pbiplint\."/and 17 built into pbiplint."/' packages/web/test/generate.test.ts
perl -0pi -e 's/\b8(\s+)rules/9$1rules/g; s/Power Query rules, 8 of them/Power Query rules, 9 of them/g; s/\b7 of them pbiplint/8 of them pbiplint/g; s/\b7 of pbiplint/8 of pbiplint/g; s/\b113(\s+)rules in all, 31 of/114$1rules in all, 32 of/g' README.md packages/cli/README.md packages/core/README.md packages/web/content/about.md
git diff --stat
```

In `packages/web/test/generate.test.ts`, add `"incremental-refresh-range-bounds",` to the Power Query slug list in sorted place (after `"excel-use-headers",`). Check the prose with `git diff` on the four count files: only the numbers changed.

- [ ] **Step 8: Run what this task touches, and measure**

```bash
npx vitest run packages/core/test packages/web/test packages/cli/test
npm run typecheck
npm run check:browser
```

Expected: PASS. Write the `check:browser` line into `progress.md` under Task 5; over 230 KB stops the task.

- [ ] **Step 9: Commit**

```bash
npx prettier --write packages/core/src/rules/pbiplint/power-query.ts packages/core/test/rules-power-query.test.ts packages/core/src/rules/rule-summaries.data.ts packages/cli/src/rule-help.data.ts packages/web/src/results/rule-guidance.data.ts packages/core/test/pack.test.ts packages/web/test/generate.test.ts
npm run lint
git add packages rules README.md tests/expectations/pbiplint/m-zoo.json
git commit -m "feat: INCREMENTAL_REFRESH_RANGE_BOUNDS reports a range filter wrong at its bounds

A query whose comparisons with the model's RangeStart and RangeEnd include
the boundary on both, or on neither, is an error: a row on the boundary
lands in two partitions, or in none. Read in either order, through a call
such as DateKey, or held by a step; a shadowing local name is not the
parameter. 114 rules, 32 built in.

Part of #78.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: `FIXED_DATE_IN_ROW_FILTER` and its page

**Files:**
- Modify: `packages/core/src/rules/pbiplint/power-query.ts`
- Create: `rules/fixed-date-in-row-filter.md`
- Modify: `rules/hardcoded-period-in-dax.md` (one Quirks sentence, Related rules), `rules/hardcoded-year-in-filter.md` (Related rules), `rules/incremental-refresh-range-bounds.md` (Related rules)
- Modify (generated): the three `.data.ts` files
- Modify: `tests/expectations/pbiplint/m-zoo.json`
- Modify: `docs/superpowers/specs/2026-10-12-pbiplint-v3-power-query-layer-design.md` (section 9.16)
- Modify: `packages/core/test/pack.test.ts`, `packages/web/test/generate.test.ts`, the four count files
- Test: `packages/core/test/rules-power-query.test.ts`

**Interfaces:**
- Consumes: `callOf`, `calls`, `isWithin`, `nodesOfKind`, `unwrap` (`m/ast.ts`); `numberLiteral` (Task 4), `rangeParameterOf` and `FLIPPED` (Task 5); `longDate` (`periods.ts`, Task 2); `Partition` (`model/types.ts`); `mFinding`; `pbiplintRule`.
- Produces: `export const FIXED_DATE_IN_ROW_FILTER: Rule`, appended to `powerQueryRules`.

- [ ] **Step 0: Confirm the two spec changes**

This task leaves alone `<>` and a table with more than one M partition, which spec 9.16 does not (see "Where this plan reads the spec narrowly"). Before writing code, check `progress.md` for pb-coord's ruling on both. If it is missing, ask pb-coord, and wait for the answer naming whom you wait on. If pb-coord declines:

- `<>`: add `"<>": "rows leave out a fixed date",` to `FIXED_DATE_USE` in Step 3, move `[Order Date] <> #date(1900, 1, 1)` from the "leaves alone" test to the "reads" test with the detail `rows leave out a fixed date, January 1, 1900`, drop the page's `<>` Quirks bullet, and add `, or, for \`<>\`, \`rows leave out a fixed date\`` to the page's second paragraph.
- Hand partitions: drop `isHandPartition` and its `.filter`, the hand-partition half of the last test, and the page's matching Quirks bullet.
- Either way, the spec amendment in Step 4 names only what was kept.

- [ ] **Step 1: Write the failing tests**

In `packages/core/test/rules-power-query.test.ts`, the rule import gains `FIXED_DATE_IN_ROW_FILTER` (after `EXCEL_USE_HEADERS`). Add at the end:

```ts
describe("FIXED_DATE_IN_ROW_FILTER (v3 spec, section 9.16)", () => {
  const rule = FIXED_DATE_IN_ROW_FILTER;
  /** A Sales partition filtered with `condition`. */
  const filtered = (condition: string, extra = ""): string =>
    extra +
    table(
      "Sales",
      "let",
      '\tSource = #table(type table [#"Order Date" = date], {}),',
      `\t#"Filtered Rows" = Table.SelectRows(Source, each ${condition})`,
      "in",
      '\t#"Filtered Rows"',
    );
  it("is a built-in Power Query info rule on a query's owner", () => {
    isPowerQueryRule(rule, 1, "Maintenance");
    expect(rule.name).toBe("Fixed date in a row filter");
    expect(rule.scope).toEqual(["Partition", "NamedExpression", "Table"]);
  });
  it("reports a fixed end on the date, written long form", async () => {
    expect(await mFindings(rule, filtered("[Order Date] <= #date(2025, 12, 31)"))).toEqual([
      {
        objectType: "Partition",
        objectName: "Sales",
        location: { file: "inline.tmdl", line: 7, column: 71 },
        detail: "query 'Sales', step 'Filtered Rows': rows end at a fixed date, December 31, 2025",
      },
    ]);
  });
  it("reads <, =, the date first, #datetime, and #datetimezone with a negative offset", async () => {
    const details = async (condition: string) =>
      (await mFindings(rule, filtered(condition))).map((f) => f.detail!.split(": ")[1]);
    expect(await details("[Order Date] < #datetime(2026, 1, 1, 0, 0, 0)")).toEqual([
      "rows end at a fixed date, January 1, 2026",
    ]);
    expect(await details("[Month] = #date(2026, 3, 1) or [Month] = #date(2026, 3, 31)")).toEqual([
      "rows match a fixed date, March 1, 2026",
      "rows match a fixed date, March 31, 2026",
    ]);
    expect(await details("#datetimezone(2025, 6, 30, 0, 0, 0, -5, 0) >= [Order Date]")).toEqual([
      "rows end at a fixed date, June 30, 2025",
    ]);
  });
  it("leaves alone a fixed start, a date left out with <>, a date from a parameter or from now, and a filter on the refresh range", async () => {
    expect(await mFindings(rule, filtered("[Order Date] >= #date(2020, 1, 1)"))).toEqual([]);
    expect(await mFindings(rule, filtered("[Order Date] <> #date(1900, 1, 1)"))).toEqual([]);
    expect(await mFindings(rule, filtered("[Order Date] <= #date(EndYear, 12, 31)"))).toEqual([]);
    expect(
      await mFindings(rule, filtered("[Order Date] <= Date.From(DateTime.LocalNow())")),
    ).toEqual([]);
    const parameters =
      'expression RangeStart = #datetime(2024, 1, 1, 0, 0, 0) meta [IsParameterQuery = true, Type = "DateTime", IsParameterQueryRequired = true]\n\n';
    expect(
      await mFindings(
        rule,
        filtered("[Order Date] >= RangeStart and [Order Date] < #date(2030, 1, 1)", parameters),
      ),
    ).toEqual([]);
  });
  it("leaves alone a fixed date outside a row filter, and a table partitioned by hand", async () => {
    const column = table(
      "Sales",
      "let",
      '\tSource = #table(type table [#"Order Date" = date], {}),',
      '\tFlagged = Table.AddColumn(Source, "Old", each [Order Date] < #date(2025, 1, 1))',
      "in",
      "\tFlagged",
    );
    expect(await mFindings(rule, column)).toEqual([]);
    const slice = (year: number) =>
      `\tpartition 'Sales ${year}' = m\n\t\tmode: import\n\t\tsource = Table.SelectRows(S, each [Order Date] >= #date(${year}, 1, 1) and [Order Date] <= #date(${year}, 12, 31))\n`;
    expect(await mFindings(rule, `table Sales\n${slice(2024)}${slice(2025)}`)).toEqual([]);
  });
});
```

- [ ] **Step 2: Run them to make sure they fail**

Run: `npx vitest run packages/core/test/rules-power-query.test.ts -t FIXED_DATE`
Expected: FAIL: `FIXED_DATE_IN_ROW_FILTER` is not exported.

- [ ] **Step 3: Write the rule**

In `packages/core/src/rules/pbiplint/power-query.ts`, the imports at the top become:

```ts
import { Language } from "@microsoft/powerquery-parser";
import {
  callOf,
  calls,
  identifierName,
  isWithin,
  nodesOfKind,
  parentOf,
  textLiterals,
  textValue,
  unwrap,
} from "../../m/ast.js";
import { boundValue, resolve } from "../../m/resolve.js";
import type { MIndex, MQuery } from "../../m/types.js";
import { tableRef } from "../../model/names.js";
import type { Partition } from "../../model/types.js";
import { finding } from "../helpers.js";
import { mFinding } from "../m-helpers.js";
import type { Rule } from "../types.js";
import { pbiplintRule } from "./define.js";
import { longDate } from "./periods.js";
```

Add after `INCREMENTAL_REFRESH_RANGE_BOUNDS`:

```ts
/** The constructors of a fixed date. */
const DATE_CONSTRUCTORS: ReadonlySet<string> = new Set(["#date", "#datetime", "#datetimezone"]);

/** A whole number written in place, with a sign if it has one. */
function wholeNumber(n: Node): number | undefined {
  const v = unwrap(n);
  if (v.kind === Kind.UnaryExpression) {
    const inner = numberLiteral(v.typeExpression);
    const signs = v.operators.elements.map((o) => o.constantKind as string);
    if (inner === undefined || signs.some((s) => s !== "-" && s !== "+")) return undefined;
    return signs.filter((s) => s === "-").length % 2 ? -inner : inner;
  }
  const value = numberLiteral(v);
  return value !== undefined && Number.isInteger(value) ? value : undefined;
}

/** A `#date`, `#datetime`, or `#datetimezone` of numbers written in place, as the day it names. */
function fixedDate(n: Node): string | undefined {
  const c = callOf(unwrap(n));
  if (!c || !DATE_CONSTRUCTORS.has(c.name) || c.args.length < 3) return undefined;
  const parts = c.args.map(wholeNumber);
  if (parts.some((p) => p === undefined)) return undefined;
  const [year, month, day] = parts as number[];
  return month! >= 1 && month! <= 12 && day! >= 1 && day! <= 31
    ? longDate(year!, month!, day!)
    : undefined;
}

/**
 * What a filter does with a fixed date, by the operator read as "column, operator, date". A date
 * left out with `<>`, such as a placeholder or a holiday, does not go stale and is not read.
 */
const FIXED_DATE_USE: Readonly<Record<string, string>> = {
  "<": "rows end at a fixed date",
  "<=": "rows end at a fixed date",
  "=": "rows match a fixed date",
};

/** Whether a filter's condition reads the model's RangeStart or RangeEnd anywhere. */
function readsRange(m: MIndex, q: MQuery, condition: Node): boolean {
  return nodesOfKind(q, Kind.IdentifierExpression).some(
    (n) => isWithin(q, n, condition) && rangeParameterOf(m, q, n) !== undefined,
  );
}

/**
 * A partition of a table with more than one M partition: a slice of the table cut by hand, whose
 * fixed range is the point.
 */
function isHandPartition(q: MQuery): boolean {
  if (q.kind !== "partition") return false;
  const p = q.owner as Partition;
  return p.table.partitions.filter((x) => x.sourceType === "m").length > 1;
}

// A row filter whose end, or equality, is a fixed date goes stale without an error (v3 spec,
// section 9.16, amended), as HARDCODED_PERIOD_IN_DAX says of DAX. A fixed start is normal history,
// and a filter on the incremental refresh range and a table partitioned by hand are left alone.
export const FIXED_DATE_IN_ROW_FILTER = pbiplintRule({
  id: "FIXED_DATE_IN_ROW_FILTER",
  name: "Fixed date in a row filter",
  category: "Maintenance",
  severity: 1,
  scope: ["Partition", "NamedExpression", "Table"],
  layer: "powerquery",
  check: (_project, { indexes: { m } }) =>
    m.queries
      .filter((q) => !isHandPartition(q))
      .flatMap((q) => {
        const reported = new Set<number>();
        return calls(q).flatMap((c) => {
          const condition = c.args[1];
          if (c.name !== "Table.SelectRows" || !condition || readsRange(m, q, condition)) return [];
          return nodesOfKind(q, Kind.RelationalExpression, Kind.EqualityExpression).flatMap(
            (node) => {
              if (
                (node.kind !== Kind.RelationalExpression &&
                  node.kind !== Kind.EqualityExpression) ||
                !isWithin(q, node, condition)
              )
                return [];
              const onLeft = fixedDate(node.left);
              const onRight = fixedDate(node.right);
              if ((onLeft === undefined) === (onRight === undefined)) return [];
              const op = node.operatorConstant.constantKind as string;
              const use = FIXED_DATE_USE[onRight ? op : (FLIPPED[op] ?? op)];
              const date = unwrap(onRight ? node.right : node.left);
              if (!use || reported.has(date.id)) return [];
              reported.add(date.id);
              return [mFinding(m, q, date, `${use}, ${onRight ?? onLeft}`)];
            },
          );
        });
      }),
});
```

and `powerQueryRules` gains `FIXED_DATE_IN_ROW_FILTER,` after `INCREMENTAL_REFRESH_RANGE_BOUNDS,`. `reported` keeps a date counted once when one `Table.SelectRows` sits inside another's condition.

Run: `npx vitest run packages/core/test/rules-power-query.test.ts`
Expected: PASS.

- [ ] **Step 4: Amend spec 9.16**

In the spec, section 9.16, add a last bullet after "- **Corpus:** 31 filters in 15 models (13 repositories), ...":

```markdown
- **Amended October 13, 2026** (pull request 5, from the corpus spot check, confirmed by the coordinator): a date left out with `<>` is left alone, since leaving out a placeholder (January 1, 1900) or a holiday does not go stale (25 of the rule's 37 corpus findings as first written); and so is every partition of a table with more than one M partition, a table partitioned by hand whose fixed ranges are the point (3 more). The corpus count is then 9 filters in 4 models (4 repositories). `=` stays: a filter held to one month goes stale the month after.
```

- [ ] **Step 5: Write the page, and link it from its siblings**

Create `rules/fixed-date-in-row-filter.md`:

````markdown
---
id: FIXED_DATE_IN_ROW_FILTER
name: "Fixed date in a row filter"
category: Maintenance
severity: info
scope: [Partition, NamedExpression, Table]
status: builtin
layer: powerquery
video:
sources:
---

# Fixed date in a row filter

## What it checks

Power Query row filters that end at, or match, a date written into the query: a `Table.SelectRows` condition that compares a column with `<`, `<=`, or `=` to a `#date`, `#datetime`, or `#datetimezone` of fixed numbers.

Each finding names the partition, the shared expression, or, for an incremental refresh policy's own query, the table. Its detail names the query and the step, then the date in long form, as `query 'Sales', step 'Filtered Rows': rows end at a fixed date, December 31, 2025`, or, for `=`, `rows match a fixed date, March 1, 2026`. The location is the line and column of the date in the TMDL file.

## Example

```tmdl fires
table Sales
	column 'Order Date'
		dataType: dateTime
		summarizeBy: none
		sourceColumn: Order Date

	partition Sales = m
		mode: import
		source =
				let
					Source = #table(type table [#"Order Date" = date], {{#date(2025, 6, 1)}}),
					#"Filtered Rows" = Table.SelectRows(Source, each [Order Date] <= #date(2025, 12, 31))
				in
					#"Filtered Rows"
```

```tmdl fixed
table Sales
	column 'Order Date'
		dataType: dateTime
		summarizeBy: none
		sourceColumn: Order Date

	partition Sales = m
		mode: import
		source =
				let
					Source = #table(type table [#"Order Date" = date], {{#date(2025, 6, 1)}}),
					#"Filtered Rows" = Table.SelectRows(Source, each Date.IsInPreviousNYears([Order Date], 3))
				in
					#"Filtered Rows"
```

## Why it matters

A filter that ends on a fixed date is right on the day it was written and quietly wrong after it. A query that keeps rows up to December 31, 2025 goes on refreshing through 2026 without an error, and every visual built on it stops at the end of 2025 while the source fills up with rows the model never loads. Nobody looking at the report can tell. The same goes for `HARDCODED_PERIOD_IN_DAX`, the same mistake in DAX. Microsoft's guidance is to make such filters move with time: "You can implement time-based Power Query filters with parameters, and even set them to use relative time periods" ([Data reduction techniques for Import modeling, Remove unnecessary rows](https://learn.microsoft.com/power-bi/guidance/import-modeling-data-reduction#remove-unnecessary-rows)), and "You can also take advantage of the type-specific filters such as **In the previous** for a date, datetime, or even date timezone column." ([Best practices, Filter data early to improve performance](https://learn.microsoft.com/power-query/best-practices#filter-data-early-to-improve-performance)).

## How to fix it

In Power BI Desktop, choose Transform data, select the query, and in Applied steps select the gear beside the filter step to open Filter Rows. Replace the fixed date with a relative one: on the column's filter menu, choose Date Filters, then **In the Previous**, and set how many days, months, or years to keep, which writes a condition such as `Date.IsInPreviousNYears([Order Date], 3)`, as the fixed example shows. Where the end should stay fixed but be easy to move, put it in a parameter instead: Home, Manage Parameters, New Parameter, of type Date, and compare the column with the parameter. In the TMDL file, the condition is in the partition's `source` block.

## When to ignore it

When the fixed end is the point: an archive table that holds a closed period, a fiscal year that has ended, data before a change of system that a newer table carries on from, or sample data that never changes. A parameter still says so more clearly than a date in a step, but the finding is then a note rather than a task.

## Quirks

- A fixed start (`>` or `>=`) is not reported: history that starts on a fixed date is normal, as a date table that starts on a fixed date is in DAX.
- A date left out with `<>` is not reported either: leaving out a placeholder such as January 1, 1900, or a holiday, does not go stale.
- A table with more than one M partition, each filtered to its own range, is partitioned by hand, and its fixed ranges are the point, so its partitions are not reported.
- A filter whose condition also reads the model's `RangeStart` or `RangeEnd` parameter is incremental refresh's own, and is not reported.
- Only a date of fixed numbers counts. A date built from a parameter, from `DateTime.LocalNow()`, or from another column is not reported.
- Only `Table.SelectRows` conditions are read. A fixed date compared elsewhere, such as in a custom column, is not.
- The date is named in long form, without the time of a `#datetime` or the offset of a `#datetimezone`.
- Each date is its own finding, so a filter with a fixed end on two columns has two.
- A query whose M does not parse is not read; it gets a `PARSE_ISSUE` finding instead.

## Related rules

- `HARDCODED_PERIOD_IN_DAX` reports the same problem in DAX: a year or a date fixed in a measure, a calculated column, or a date table.
- `HARDCODED_YEAR_IN_FILTER` reports it in the report: a Filters pane filter held to a fixed year.
- `INCREMENTAL_REFRESH_RANGE_BOUNDS` reads the filters on the incremental refresh range, which this rule leaves alone.

## Links

- [Filter by values in a column, Type-specific filters](https://learn.microsoft.com/power-query/filter-values#type-specific-filters)
- [Using parameters](https://learn.microsoft.com/power-query/power-query-query-parameters)
````

Then the siblings:

- `rules/hardcoded-period-in-dax.md`, Quirks, the bullet that begins "From a calculated table": replace `and fixed dates in Power Query (M) are left to pbiplint's Power Query rules, which are still to come.` with `and a fixed date in Power Query (M) is \`FIXED_DATE_IN_ROW_FILTER\`'s to report.` (the backticks stay in the page). Under Related rules, add after the `HARDCODED_YEAR_IN_FILTER` bullet:

  ```markdown
  - `FIXED_DATE_IN_ROW_FILTER` reports the same problem in Power Query: a row filter that ends at a fixed date.
  ```

- `rules/hardcoded-year-in-filter.md`, a last bullet under Related rules:

  ```markdown
  - `FIXED_DATE_IN_ROW_FILTER` reports the same problem in Power Query: a row filter that ends at a fixed date, so the model never loads what comes after it.
  ```

- `rules/incremental-refresh-range-bounds.md`, a last bullet under Related rules:

  ```markdown
  - `FIXED_DATE_IN_ROW_FILTER` reports a row filter that ends at a fixed date, and leaves a filter on `RangeStart` or `RangeEnd` to this rule.
  ```

- [ ] **Step 6: Regenerate and run the pages' tests**

```bash
npm run build -w @pbiplint/core && node scripts/sync-rule-pages.mjs
npx vitest run packages/core/test/rule-pages.test.ts -t "FIXED_DATE_IN_ROW_FILTER|HARDCODED_PERIOD_IN_DAX|HARDCODED_YEAR_IN_FILTER|INCREMENTAL_REFRESH_RANGE_BOUNDS"
```

Expected: PASS.

- [ ] **Step 7: Pin the rule's finding on m-zoo**

Spec 9.16's three shapes are m-zoo's `Fixed Dates` table: `#"Filtered Rows"` with `<= #date(2025, 12, 31)` fires; `SinceStart` (`>=`) and `InRange` (`>= Date.From(RangeStart)`) do not. No m-zoo filter uses `<>`, and no m-zoo table has two M partitions, so the spec change moves nothing here. In `tests/expectations/pbiplint/m-zoo.json`, add `"FIXED_DATE_IN_ROW_FILTER"` to `"rules"` in sorted place (after `"EXCEL_USE_HEADERS"`), and insert after the `Customers Latest.tmdl` line 18 entry:

```json
    { "rule": "FIXED_DATE_IN_ROW_FILTER", "objectType": "Partition", "object": "Fixed Dates", "file": "definition/tables/Fixed Dates.tmdl", "line": 16, "column": 71, "detail": "query 'Fixed Dates', step 'Filtered Rows': rows end at a fixed date, December 31, 2025" },
```

Run: `npx vitest run packages/core/test/rules-m.test.ts`
Expected: PASS.

- [ ] **Step 8: Move the counts by one rule**

115 rules, 33 built in, 10 Power Query rules, 9 of them pbiplint's own:

```bash
perl -pi -e 's/toBe\(114\)/toBe(115)/' packages/core/test/pack.test.ts
perl -pi -e 's/toBe\(114\)/toBe(115)/g; s/6 \+ 114\b/6 + 115/; s/"and 33 built into pbiplint\."/"and 34 built into pbiplint."/; s/"115 rules: 66/"116 rules: 66/; s/"114 rules: 66/"115 rules: 66/; s/and 32 built into pbiplint\."/and 33 built into pbiplint."/g; s/"88 rules: 66/"89 rules: 66/; s/and 17 built into pbiplint\."/and 18 built into pbiplint."/' packages/web/test/generate.test.ts
perl -0pi -e 's/\b9(\s+)rules/10$1rules/g; s/Power Query rules, 9 of them/Power Query rules, 10 of them/g; s/\b8 of them pbiplint/9 of them pbiplint/g; s/\b8 of pbiplint/9 of pbiplint/g; s/\b114(\s+)rules in all, 32 of/115$1rules in all, 33 of/g' README.md packages/cli/README.md packages/core/README.md packages/web/content/about.md
git diff --stat
```

In `packages/web/test/generate.test.ts`, add `"fixed-date-in-row-filter",` to the Power Query slug list in sorted place (after `"excel-use-headers",`). Check the prose with `git diff` on the four count files: only the numbers changed. (`\b9(\s+)rules` cannot touch another number in these files: the scratch run grepped them, and the only `9 rules` is the Power Query count.)

- [ ] **Step 9: Run what this task touches, and measure**

```bash
npx vitest run packages/core/test packages/web/test packages/cli/test
npm run typecheck
npm run check:browser
```

Expected: PASS. Write the `check:browser` line into `progress.md` under Task 6; over 230 KB stops the task.

- [ ] **Step 10: Commit**

```bash
npx prettier --write packages/core/src/rules/pbiplint/power-query.ts packages/core/test/rules-power-query.test.ts packages/core/src/rules/rule-summaries.data.ts packages/cli/src/rule-help.data.ts packages/web/src/results/rule-guidance.data.ts packages/core/test/pack.test.ts packages/web/test/generate.test.ts
npm run lint
git add packages rules README.md tests/expectations/pbiplint/m-zoo.json docs/superpowers/specs/2026-10-12-pbiplint-v3-power-query-layer-design.md
git commit -m "feat: FIXED_DATE_IN_ROW_FILTER reports a row filter that ends at a fixed date

A Table.SelectRows condition that ends at, or matches, a #date, #datetime,
or #datetimezone of fixed numbers is info: it goes stale without an
error. A fixed start, a date left out with <>, a filter on the refresh
range, and a table partitioned by hand are left alone (spec 9.16,
amended). The DAX and report siblings link to it. 115 rules, 33 built in.

Part of #78.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: `DEFAULT_STEP_NAMES`, its page, and the sample's count

**Files:**
- Modify: `packages/core/src/rules/pbiplint/power-query.ts`
- Create: `rules/default-step-names.md`
- Modify: `rules/default-page-name.md` (Related rules)
- Modify (generated): the three `.data.ts` files
- Modify: `tests/expectations/pbiplint/m-zoo.json`
- Modify: `tests/expectations/base-rules-fails.report.json`, `base-rules-passes.report.json`, `messy-sales.report.json`, `pbip-and-github-demo.report.json`, `shelfmart.report.json` (`native` maps)
- Modify: `packages/web/test/sample.test.ts`, `packages/web/test/home.test.ts`, `packages/web/test/render.test.ts`, `packages/web/test/export.test.ts`, `packages/web/e2e/home.spec.ts`, `packages/cli/test/cli.test.ts`, `packages/cli/test/contract.test.ts`, `packages/core/README.md` (the sample's count)
- Modify: `packages/core/test/pack.test.ts`, `packages/web/test/generate.test.ts`, the four count files
- Test: `packages/core/test/rules-power-query.test.ts`

**Interfaces:**
- Consumes: `identifierName`, `unwrap` (`m/ast.ts`); `mFinding`, `queryLabel` (`rules/m-helpers.ts`); `tableRef`; `pbiplintRule`.
- Produces: `export const DEFAULT_STEP_NAMES: Rule`, appended to `powerQueryRules` (the last of this pull request).

- [ ] **Step 1: Write the failing tests**

In `packages/core/test/rules-power-query.test.ts`, the rule import gains `DEFAULT_STEP_NAMES` (first, alphabetically). Add at the end:

```ts
describe("DEFAULT_STEP_NAMES (v3 spec, section 9.13)", () => {
  const rule = DEFAULT_STEP_NAMES;
  it("is a built-in Power Query info rule on a query's owner", () => {
    isPowerQueryRule(rule, 1, "Maintenance");
    expect(rule.name).toBe("Steps keep Power Query's default names");
    expect(rule.scope).toEqual(["Partition", "NamedExpression", "Table"]);
  });
  it("reports a query once, on its first default name, with the count and two names", async () => {
    const tmdl = table(
      "Sales",
      "let",
      "\tSource = #table(type table [Amount = number], {{1}}),",
      '\t#"Changed Type" = Table.TransformColumnTypes(Source, {{"Amount", type number}}),',
      '\t#"Added Custom1" = Table.AddColumn(#"Changed Type", "Doubled", each [Amount] * 2),',
      '\t#"Expanded Orders" = #"Added Custom1",',
      '\tCustom = #"Expanded Orders"',
      "in",
      "\tCustom",
    );
    expect(await mFindings(rule, tmdl)).toEqual([
      {
        objectType: "Partition",
        objectName: "Sales",
        location: { file: "inline.tmdl", line: 7, column: 6 },
        detail:
          "query 'Sales': 4 steps keep default names, such as 'Changed Type' and 'Added Custom1'",
      },
    ]);
  });
  it("words one and two names as English does", async () => {
    const one = table("Sales", "let", '\t#"Filtered Rows" = 1', "in", '\t#"Filtered Rows"');
    expect((await mFindings(rule, one)).map((f) => f.detail)).toEqual([
      "query 'Sales': 1 step keeps its default name, 'Filtered Rows'",
    ]);
    const two = table(
      "Sales",
      "let",
      '\t#"Promoted Headers" = 1,',
      '\t#"Changed Type with Locale" = 2',
      "in",
      '\t#"Changed Type with Locale"',
    );
    expect((await mFindings(rule, two)).map((f) => f.detail)).toEqual([
      "query 'Sales': 2 steps keep default names, 'Promoted Headers' and 'Changed Type with Locale'",
    ]);
  });
  it("reads a shared expression's steps too", async () => {
    const tmdl =
      'expression Staging =\n\t\tlet\n\t\t\t#"Removed Errors" = 1\n\t\tin\n\t\t\t#"Removed Errors"\n';
    expect((await mFindings(rule, tmdl)).map((f) => [f.objectType, f.detail])).toEqual([
      ["NamedExpression", "query 'Staging': 1 step keeps its default name, 'Removed Errors'"],
    ]);
  });
  it("leaves alone Source and Navigation, renamed steps, names that only start like a default, nested lets, parameters, and functions", async () => {
    const tmdl =
      'expression Limit = 10 meta [IsParameterQuery = true, Type = "Number", IsParameterQueryRequired = true]\n\n' +
      'expression GetPage = (url as text) => let #"Changed Type" = 1 in #"Changed Type"\n\n' +
      table(
        "Sales",
        "let",
        "\tSource = 1,",
        "\tNavigation = Source,",
        "\tTypedAmount = Navigation,",
        '\t#"Changed Types Of Amount" = TypedAmount,',
        "\tExpandedRows = 1,",
        '\tInner = let #"Added Custom" = 1 in #"Added Custom"',
        "in",
        "\tInner",
      );
    expect(await mFindings(rule, tmdl)).toEqual([]);
  });
});
```

The location is the step's name, at column 6 (four tabs of block indent and the test's own tab); the detail names no step, since the finding speaks for the whole query.

- [ ] **Step 2: Run them to make sure they fail**

Run: `npx vitest run packages/core/test/rules-power-query.test.ts -t DEFAULT_STEP_NAMES`
Expected: FAIL: `DEFAULT_STEP_NAMES` is not exported.

- [ ] **Step 3: Write the rule**

In `packages/core/src/rules/pbiplint/power-query.ts`, the `m-helpers.js` import becomes `import { mFinding, queryLabel } from "../m-helpers.js";`. Add after `FIXED_DATE_IN_ROW_FILTER`:

```ts
/** Power BI Desktop's default step names in English, each with or without a number after it. */
const DEFAULT_STEP = new RegExp(
  "^(?:(?:" +
    [
      "Changed Type",
      "Changed Type with Locale",
      "Promoted Headers",
      "Removed Columns",
      "Removed Other Columns",
      "Renamed Columns",
      "Reordered Columns",
      "Filtered Rows",
      "Sorted Rows",
      "Removed Duplicates",
      "Grouped Rows",
      "Merged Queries",
      "Appended Query",
      "Added Custom",
      "Added Conditional Column",
      "Added Index",
      "Duplicated Column",
      "Replaced Value",
      "Pivoted Column",
      "Unpivoted Columns",
      "Unpivoted Other Columns",
      "Split Column by Delimiter",
      "Removed Top Rows",
      "Removed Bottom Rows",
      "Removed Blank Rows",
      "Removed Alternate Rows",
      "Removed Errors",
      "Kept First Rows",
      "Kept Range of Rows",
      "Trimmed Text",
      "Cleaned Text",
      "Uppercased Text",
      "Lowercased Text",
      "Capitalized Each Word",
      "Transposed Table",
      "Filled Down",
      "Filled Up",
      "Invoke Custom Function",
      "Custom",
    ].join("|") +
    ")\\d*|(?:Expanded|Inserted|Extracted|Calculated)(?:\\d*| .*))$",
);

// Once per query, on its first such step, with the count (v3 spec, section 9.13): a shape Desktop
// writes by default, reported per step, would bury everything else. Only the outermost let's
// steps are read; Source and Navigation name what they are.
export const DEFAULT_STEP_NAMES = pbiplintRule({
  id: "DEFAULT_STEP_NAMES",
  name: "Steps keep Power Query's default names",
  category: "Maintenance",
  severity: 1,
  scope: ["Partition", "NamedExpression", "Table"],
  layer: "powerquery",
  check: (_project, { indexes: { m } }) =>
    m.queries.flatMap((q) => {
      const root = q.ast && unwrap(q.ast);
      if (root?.kind !== Kind.LetExpression) return [];
      const steps = root.variableList.elements
        .map((csv) => csv.node)
        .filter((pair) => DEFAULT_STEP.test(identifierName(pair.key.literal)));
      if (steps.length === 0) return [];
      const [a, b] = steps.map((pair) => tableRef(identifierName(pair.key.literal)));
      const what =
        steps.length === 1
          ? `1 step keeps its default name, ${a}`
          : `${steps.length} steps keep default names, ${steps.length > 2 ? "such as " : ""}${a} and ${b}`;
      // The detail names the query only: the steps it lists say where.
      return [{ ...mFinding(m, q, steps[0]!, what), detail: `${queryLabel(q)}: ${what}` }];
    }),
});
```

and `powerQueryRules` gains `DEFAULT_STEP_NAMES,` after `FIXED_DATE_IN_ROW_FILTER,`. A parameter (`<value> meta [...]`) and a function query have no `let` at the root, so they are not read.

Run: `npx vitest run packages/core/test/rules-power-query.test.ts`
Expected: PASS.

- [ ] **Step 4: Write the page**

Create `rules/default-step-names.md`:

````markdown
---
id: DEFAULT_STEP_NAMES
name: "Steps keep Power Query's default names"
category: Maintenance
severity: info
scope: [Partition, NamedExpression, Table]
status: builtin
layer: powerquery
video:
sources:
---

# Steps keep Power Query's default names

## What it checks

Power Query queries whose steps keep the names Power BI Desktop gives them, such as Changed Type, Added Custom1, or Removed Other Columns, reported once per query.

Each finding names the partition, the shared expression, or, for an incremental refresh policy's own query, the table. Its detail names the query, how many of its steps keep a default name, and up to two of them, as `query 'Sales': 3 steps keep default names, such as 'Changed Type' and 'Added Custom1'`. The location is the line and column of the first such step in the TMDL file.

The names read are Desktop's English defaults: Changed Type, Changed Type with Locale, Promoted Headers, Removed Columns, Removed Other Columns, Renamed Columns, Reordered Columns, Filtered Rows, Sorted Rows, Removed Duplicates, Grouped Rows, Merged Queries, Appended Query, Added Custom, Added Conditional Column, Added Index, Duplicated Column, Replaced Value, Pivoted Column, Unpivoted Columns, Unpivoted Other Columns, Split Column by Delimiter, Removed Top Rows, Removed Bottom Rows, Removed Blank Rows, Removed Alternate Rows, Removed Errors, Kept First Rows, Kept Range of Rows, Trimmed Text, Cleaned Text, Uppercased Text, Lowercased Text, Capitalized Each Word, Transposed Table, Filled Down, Filled Up, Invoke Custom Function, and Custom, and names that start with Expanded, Inserted, Extracted, or Calculated, each with or without a number after it.

## Example

```tmdl fires
table Sales
	column Region
		dataType: string
		summarizeBy: none
		sourceColumn: Region

	partition Sales = m
		mode: import
		source =
				let
					Source = #table(type table [Region = text, Amount = number], {{"East", 10}, {"West", 20}}),
					#"Changed Type" = Table.TransformColumnTypes(Source, {{"Amount", type number}}),
					#"Added Custom1" = Table.AddColumn(#"Changed Type", "Doubled", each [Amount] * 2, type number)
				in
					#"Added Custom1"
```

```tmdl fixed
table Sales
	column Region
		dataType: string
		summarizeBy: none
		sourceColumn: Region

	partition Sales = m
		mode: import
		source =
				let
					Source = #table(type table [Region = text, Amount = number], {{"East", 10}, {"West", 20}}),
					#"Typed Amount" = Table.TransformColumnTypes(Source, {{"Amount", type number}}),
					#"Added Doubled Amount" = Table.AddColumn(#"Typed Amount", "Doubled", each [Amount] * 2, type number)
				in
					#"Added Doubled Amount"
```

## Why it matters

A step's name is what the next person reads first, in Applied steps and in every step that refers to it. Changed Type, Changed Type1, and Changed Type2 say that the types changed three times but not which columns, or why. Added Custom says a column was added but not what it holds. Someone who has to fix a refresh error, or change a calculation, then opens each step to find the one they need. Microsoft's guidance is to name them: "Document a Power Query solution by giving steps, queries, and groups meaningful names and descriptions. These details make the purpose of each transformation easier to understand and maintain." ([Best practices, Document your work](https://learn.microsoft.com/power-query/best-practices#document-your-work)).

## How to fix it

In Power BI Desktop, choose Transform data, select the query, and in Applied steps right-click each step with a default name and choose Rename ([Applied steps, Rename step](https://learn.microsoft.com/power-query/applied-steps#rename-step)). Name what the step does to the data, such as Typed Amount or Added Doubled Amount. Desktop updates every step that refers to the renamed one. To say why as well, choose Properties instead, which takes a name and a description ([Edit step names and their descriptions](https://learn.microsoft.com/power-query/applied-steps#edit-step-names-and-their-descriptions)). In the TMDL file, each step is a line of the partition's `source` block; rename it there and in every step that refers to it, and in the line after `in`.

## When to ignore it

A short query whose steps say what they do, such as Source, a Promoted Headers step, and one Changed Type, reads clearly enough, and renaming its steps adds little. A team that agrees to keep Desktop's names, or queries generated by a tool and never edited by hand, can leave them too.

## Quirks

- Each query is reported once, on its first step with a default name, with the count in the detail, since a shape Desktop writes on every query would bury the rest of the results if each step were its own finding.
- Only the query's own steps are read: the outermost `let`. Steps inside a nested `let` or a function are not.
- Source and Navigation are not reported: they name what they are. A parameter or a function is not reported either, since it has no steps.
- Only the English names are read. Power BI Desktop in another language writes its own default names, which this rule does not know.
- A step named with a number after a default name, such as Added Custom1 or Changed Type2, counts as that default name.
- A query whose M does not parse is not read; it gets a `PARSE_ISSUE` finding instead.

## Related rules

- `DEFAULT_PAGE_NAME` reports the same habit in the report: a page that keeps Power BI's default name.

## Links

- [Applied steps](https://learn.microsoft.com/power-query/applied-steps)
````

In `rules/default-page-name.md`, add a last bullet under Related rules:

```markdown
- `DEFAULT_STEP_NAMES` reports the same habit in Power Query: steps that keep the names Power BI Desktop gave them.
```

- [ ] **Step 5: Regenerate and run the pages' tests**

```bash
npm run build -w @pbiplint/core && node scripts/sync-rule-pages.mjs
npx vitest run packages/core/test/rule-pages.test.ts -t "DEFAULT_STEP_NAMES|DEFAULT_PAGE_NAME"
```

Expected: PASS.

- [ ] **Step 6: Pin the rule's findings on m-zoo**

Spec 9.13's three shapes are in m-zoo: `Default Steps` (Changed Type, Added Custom1, and Removed Other Columns: fires once, on Changed Type), `Sort Held` (every step renamed: silent), and `Navigation Only` (Source and Navigation: silent). Most other m-zoo queries keep Desktop's names on purpose, so the rule fires on thirteen tables, and no shared expression (each is a parameter or a function). Replace `tests/expectations/pbiplint/m-zoo.json` with this complete file, which is what the scratch run produced and is the state after Tasks 3 to 7:

```json
{
  "fixture": "tests/fixtures/m-zoo.SemanticModel",
  "about": "pbiplint's own Power Query rules on m-zoo: rule, object, file, line, column, and detail of every finding. These rules have no Tabular Editor oracle (v3 spec, section 11.1), so this file is pbiplint's own, written in place order and reviewed by hand.",
  "rules": ["DEFAULT_STEP_NAMES", "EXCEL_USE_HEADERS", "FIXED_DATE_IN_ROW_FILTER", "INCREMENTAL_REFRESH_RANGE_BOUNDS", "KEEP_FIRST_ROWS_LEFT_IN", "LOCAL_DRIVE_PATH", "ODBC_WHERE_CONNECTOR_EXISTS", "PRIVACY_LEVELS_IGNORED", "SCRIPT_IN_QUERY", "SORT_NOT_HELD_FOR_REMOVE_DUPLICATES"],
  "findings": [
    { "rule": "LOCAL_DRIVE_PATH", "objectType": "NamedExpression", "object": "DataFolder", "file": "definition/expressions.tmdl", "line": 18, "column": 25, "detail": "query 'DataFolder': the path is on a local drive (C:)" },
    { "rule": "LOCAL_DRIVE_PATH", "objectType": "NamedExpression", "object": "ExportFolder", "file": "definition/expressions.tmdl", "line": 21, "column": 27, "detail": "query 'ExportFolder': the path is on a local drive (D:)" },
    { "rule": "PRIVACY_LEVELS_IGNORED", "objectType": "Model", "object": "Model", "file": "definition/model.tmdl", "line": 6, "detail": "Ignore the Privacy Levels is on for this file; the service does not honor it" },
    { "rule": "EXCEL_USE_HEADERS", "objectType": "Partition", "object": "Budget", "file": "definition/tables/Budget.tmdl", "line": 15, "column": 22, "detail": "query 'Budget', step 'ReaderHeaders': Excel.Workbook promotes headers in the refreshing machine's culture" },
    { "rule": "LOCAL_DRIVE_PATH", "objectType": "Partition", "object": "Budget", "file": "definition/tables/Budget.tmdl", "line": 15, "column": 51, "detail": "query 'Budget', step 'ReaderHeaders': the path is on a local drive (C:)" },
    { "rule": "EXCEL_USE_HEADERS", "objectType": "Partition", "object": "Budget", "file": "definition/tables/Budget.tmdl", "line": 16, "column": 22, "detail": "query 'Budget', step 'OptionHeaders': Excel.Workbook promotes headers in the refreshing machine's culture" },
    { "rule": "LOCAL_DRIVE_PATH", "objectType": "Partition", "object": "Budget", "file": "definition/tables/Budget.tmdl", "line": 16, "column": 51, "detail": "query 'Budget', step 'OptionHeaders': the path is on a local drive (C:)" },
    { "rule": "LOCAL_DRIVE_PATH", "objectType": "Partition", "object": "Budget", "file": "definition/tables/Budget.tmdl", "line": 17, "column": 45, "detail": "query 'Budget', step 'Desktop': the path is on a local drive (C:)" },
    { "rule": "LOCAL_DRIVE_PATH", "objectType": "Partition", "object": "Budget", "file": "definition/tables/Budget.tmdl", "line": 18, "column": 44, "detail": "query 'Budget', step 'Legacy': the path is on a local drive (C:)" },
    { "rule": "DEFAULT_STEP_NAMES", "objectType": "Partition", "object": "Budget", "file": "definition/tables/Budget.tmdl", "line": 20, "column": 6, "detail": "query 'Budget': 1 step keeps its default name, 'Promoted Headers'" },
    { "rule": "SORT_NOT_HELD_FOR_REMOVE_DUPLICATES", "objectType": "Partition", "object": "Customers Inline", "file": "definition/tables/Customers Inline.tmdl", "line": 12, "column": 12, "detail": "query 'Customers Inline': nothing holds the order of the Table.Sort inside it, so the sort may not decide which duplicate is kept" },
    { "rule": "LOCAL_DRIVE_PATH", "objectType": "Partition", "object": "Customers Latest", "file": "definition/tables/Customers Latest.tmdl", "line": 14, "column": 42, "detail": "query 'Customers Latest', step 'Source': the path is on a local drive (C:)" },
    { "rule": "DEFAULT_STEP_NAMES", "objectType": "Partition", "object": "Customers Latest", "file": "definition/tables/Customers Latest.tmdl", "line": 15, "column": 6, "detail": "query 'Customers Latest': 5 steps keep default names, such as 'Promoted Headers' and 'Changed Type'" },
    { "rule": "SORT_NOT_HELD_FOR_REMOVE_DUPLICATES", "objectType": "Partition", "object": "Customers Latest", "file": "definition/tables/Customers Latest.tmdl", "line": 18, "column": 30, "detail": "query 'Customers Latest', step 'Removed Duplicates': nothing holds the order of step 'Sorted Rows', so the sort may not decide which duplicate is kept" },
    { "rule": "DEFAULT_STEP_NAMES", "objectType": "Partition", "object": "Default Steps", "file": "definition/tables/Default Steps.tmdl", "line": 15, "column": 6, "detail": "query 'Default Steps': 3 steps keep default names, such as 'Changed Type' and 'Added Custom1'" },
    { "rule": "DEFAULT_STEP_NAMES", "objectType": "Partition", "object": "Fixed Dates", "file": "definition/tables/Fixed Dates.tmdl", "line": 16, "column": 6, "detail": "query 'Fixed Dates': 1 step keeps its default name, 'Filtered Rows'" },
    { "rule": "FIXED_DATE_IN_ROW_FILTER", "objectType": "Partition", "object": "Fixed Dates", "file": "definition/tables/Fixed Dates.tmdl", "line": 16, "column": 71, "detail": "query 'Fixed Dates', step 'Filtered Rows': rows end at a fixed date, December 31, 2025" },
    { "rule": "LOCAL_DRIVE_PATH", "objectType": "Partition", "object": "Local Paths", "file": "definition/tables/Local Paths.tmdl", "line": 15, "column": 28, "detail": "query 'Local Paths', step 'Local': the path is on a local drive (C:)" },
    { "rule": "ODBC_WHERE_CONNECTOR_EXISTS", "objectType": "Partition", "object": "Odbc Orders", "file": "definition/tables/Odbc Orders.tmdl", "line": 15, "column": 17, "detail": "query 'Odbc Orders', step 'Redshift': the ODBC connection names the Amazon Redshift driver; Power BI has an Amazon Redshift connector" },
    { "rule": "LOCAL_DRIVE_PATH", "objectType": "Partition", "object": "Orders Files", "file": "definition/tables/Orders Files.tmdl", "line": 15, "column": 16, "detail": "query 'Orders Files', step 'Archive': the path is on a local drive (C:)" },
    { "rule": "DEFAULT_STEP_NAMES", "objectType": "Partition", "object": "Orders Web", "file": "definition/tables/Orders Web.tmdl", "line": 15, "column": 6, "detail": "query 'Orders Web': 2 steps keep default names, 'Added Custom' and 'Removed Other Columns'" },
    { "rule": "DEFAULT_STEP_NAMES", "objectType": "Partition", "object": "Range Correct", "file": "definition/tables/Range Correct.tmdl", "line": 16, "column": 6, "detail": "query 'Range Correct': 1 step keeps its default name, 'Filtered Rows'" },
    { "rule": "DEFAULT_STEP_NAMES", "objectType": "Partition", "object": "Range Date Key", "file": "definition/tables/Range Date Key.tmdl", "line": 16, "column": 6, "detail": "query 'Range Date Key': 1 step keeps its default name, 'Filtered Rows'" },
    { "rule": "DEFAULT_STEP_NAMES", "objectType": "Partition", "object": "Range Exclusive", "file": "definition/tables/Range Exclusive.tmdl", "line": 16, "column": 6, "detail": "query 'Range Exclusive': 1 step keeps its default name, 'Filtered Rows'" },
    { "rule": "INCREMENTAL_REFRESH_RANGE_BOUNDS", "objectType": "Partition", "object": "Range Exclusive", "file": "definition/tables/Range Exclusive.tmdl", "line": 16, "column": 55, "detail": "query 'Range Exclusive', step 'Filtered Rows': neither RangeStart nor RangeEnd includes the boundary, so a row on it lands in none" },
    { "rule": "DEFAULT_STEP_NAMES", "objectType": "Partition", "object": "Range Reversed", "file": "definition/tables/Range Reversed.tmdl", "line": 16, "column": 6, "detail": "query 'Range Reversed': 1 step keeps its default name, 'Filtered Rows'" },
    { "rule": "INCREMENTAL_REFRESH_RANGE_BOUNDS", "objectType": "Partition", "object": "Range Reversed", "file": "definition/tables/Range Reversed.tmdl", "line": 16, "column": 85, "detail": "query 'Range Reversed', step 'Filtered Rows': both RangeStart and RangeEnd include the boundary, so a row on it lands in two partitions" },
    { "rule": "DEFAULT_STEP_NAMES", "objectType": "Partition", "object": "Range Shadowed", "file": "definition/tables/Range Shadowed.tmdl", "line": 17, "column": 6, "detail": "query 'Range Shadowed': 1 step keeps its default name, 'Filtered Rows'" },
    { "rule": "LOCAL_DRIVE_PATH", "objectType": "Partition", "object": "Sales Files", "file": "definition/tables/Sales Files.tmdl", "line": 14, "column": 28, "detail": "query 'Sales Files', step 'Source': the path is on a local drive (C:)" },
    { "rule": "DEFAULT_STEP_NAMES", "objectType": "Partition", "object": "Sales Files", "file": "definition/tables/Sales Files.tmdl", "line": 15, "column": 6, "detail": "query 'Sales Files': 1 step keeps its default name, 'Filtered Rows'" },
    { "rule": "DEFAULT_STEP_NAMES", "objectType": "Partition", "object": "Sales", "file": "definition/tables/Sales.tmdl", "line": 17, "column": 6, "detail": "query 'Sales': 1 step keeps its default name, 'Filtered Rows'" },
    { "rule": "INCREMENTAL_REFRESH_RANGE_BOUNDS", "objectType": "Partition", "object": "Sales", "file": "definition/tables/Sales.tmdl", "line": 17, "column": 85, "detail": "query 'Sales', step 'Filtered Rows': both RangeStart and RangeEnd include the boundary, so a row on it lands in two partitions" },
    { "rule": "SCRIPT_IN_QUERY", "objectType": "Partition", "object": "Scores", "file": "definition/tables/Scores.tmdl", "line": 16, "column": 29, "detail": "query 'Scores', step 'Run Python script': Python.Execute refreshes only through a personal gateway on a machine with Python installed" },
    { "rule": "SCRIPT_IN_QUERY", "objectType": "Partition", "object": "Scores", "file": "definition/tables/Scores.tmdl", "line": 17, "column": 24, "detail": "query 'Scores', step 'Run R script': R.Execute refreshes only through a personal gateway on a machine with R installed" },
    { "rule": "DEFAULT_STEP_NAMES", "objectType": "Partition", "object": "Top Rows", "file": "definition/tables/Top Rows.tmdl", "line": 17, "column": 6, "detail": "query 'Top Rows': 1 step keeps its default name, 'Kept First Rows'" },
    { "rule": "KEEP_FIRST_ROWS_LEFT_IN", "objectType": "Partition", "object": "Top Rows", "file": "definition/tables/Top Rows.tmdl", "line": 17, "column": 27, "detail": "query 'Top Rows', step 'Kept First Rows': only the first 1000 rows load" }
  ]
}
```

Run: `npx vitest run packages/core/test/rules-m.test.ts`
Expected: PASS. Then `git diff tests/expectations/pbiplint/m-zoo.json`: only `"DEFAULT_STEP_NAMES"` in `"rules"` and the thirteen `DEFAULT_STEP_NAMES` lines are added; every other line is as Task 6 left it. If anything else differs, stop and report.

- [ ] **Step 7: The report fixtures' native maps**

`report-parity.test.ts` holds every built-in rule's findings on each report fixture to its `native` map. Each fixture keeps Desktop's step names, so each gains a `DEFAULT_STEP_NAMES` key, added as the last key of the map (two-space indents, one name per line, as the files are written):

- `tests/expectations/base-rules-fails.report.json` and `tests/expectations/base-rules-passes.report.json`, after `HIDDEN_VISUAL_WITH_FIELDS` (passes) or `SLICER_SELECTION_SAVED` (fails): `"DEFAULT_STEP_NAMES": ["Inventory-8e9bfd81-45ee-4073-8d41-a12afe381650"]` (the partition's name; its query keeps `Changed Type1` and `Changed Type`).
- `tests/expectations/messy-sales.report.json`, after `LOCAL_DRIVE_PATH`: `"Customer"`, `"Date"`, `"Employee"`, `"Product"`, `"Promotion"`, `"Sales"`, `"Store"` (each keeps `Promoted Headers` and `Changed Type`).
- `tests/expectations/pbip-and-github-demo.report.json`, after `LOCAL_DRIVE_PATH`: `"Customer"`, `"Date"`, `"Product"`, `"Sales"`, `"User Region"`.
- `tests/expectations/shelfmart.report.json`, after `LOCAL_DRIVE_PATH`: `"Average High Temperature Summary"`, `"Average Revenue per Visit"`, `"Average Revenue per Visit Forecast 2024"`, `"Foot Traffic"`, `"Foot Traffic Forecast 2024"`, `"Revenue per Store"`, `"Revenue per Store Forecast 2024"`, `"Sample File"`, `"Transform Sample File"`, `"Weather Data"` (seven partitions and three shared expressions).

The files are `JSON.stringify(..., null, 2)` output (a round trip through `JSON.parse` and `JSON.stringify(d, null, 2) + "\n"` reproduces each byte for byte), so the arrays are written one item per line:

```json
    "DEFAULT_STEP_NAMES": [
      "Inventory-8e9bfd81-45ee-4073-8d41-a12afe381650"
    ]
```

Run: `npx vitest run packages/core/test/report-parity.test.ts`
Expected: PASS (238 tests). A failure prints the expected and received lists; if a name differs from the lists above, stop and report.

The other committed fixtures with M (`tvw-baseline`, `udf-sales`, `kitchen-sink`) also gain `DEFAULT_STEP_NAMES` findings (7, 7, and 6), but no test pins their counts, so nothing else moves.

- [ ] **Step 8: Move the sample's count**

The sample's seven queries each keep `Promoted Headers` and `Changed Type`, so it gains seven info findings: 273 findings (19 errors, 84 warnings, 170 info) become **280 findings (19 errors, 84 warnings, 177 info)**.

```bash
perl -pi -e 's/273, 19, 84, 170,/280, 19, 84, 177,/' packages/web/test/sample.test.ts
perl -pi -e 's/273 findings \(19 errors, 84 warnings, 170 info\)/280 findings (19 errors, 84 warnings, 177 info)/; s/"273 findings"/"280 findings"/g' packages/web/test/home.test.ts packages/web/test/render.test.ts packages/web/e2e/home.spec.ts packages/cli/test/cli.test.ts
perl -pi -e 's/78 files\\\): 273 findings/78 files\\): 280 findings/' packages/web/e2e/home.spec.ts
perl -pi -e 's/273 findings \\\(19 errors, 84 warnings, 170 info\\\)/280 findings \\(19 errors, 84 warnings, 177 info\\)/' packages/cli/test/cli.test.ts
perl -pi -e 's/toBe\(273\)/toBe(280)/g' packages/web/test/export.test.ts packages/cli/test/cli.test.ts
perl -pi -e 's/273 findings/280 findings/' packages/cli/test/contract.test.ts
perl -pi -e 's/3 of 273 findings/3 of 280 findings/' packages/core/README.md
git grep -n "273\b" -- packages ':!*.data.ts'
```

Expected: the last command prints nothing. (The pins it moved: `sample.test.ts` 132; `home.test.ts` 76, 96, 160; `render.test.ts` 66; `export.test.ts` 41; `home.spec.ts` 66, 69, 507, 557; `cli.test.ts` 101, 179, 219, 581; `contract.test.ts` 73; the core README's line 41. Line numbers are as of 267a1b4.) If a pin is left, change it by hand to the same numbers.

- [ ] **Step 9: Move the counts by one rule**

116 rules, 34 built in, 11 Power Query rules, 10 of them pbiplint's own:

```bash
perl -pi -e 's/toBe\(115\)/toBe(116)/' packages/core/test/pack.test.ts
perl -pi -e 's/toBe\(115\)/toBe(116)/g; s/6 \+ 115\b/6 + 116/; s/"and 34 built into pbiplint\."/"and 35 built into pbiplint."/; s/"116 rules: 66/"117 rules: 66/; s/"115 rules: 66/"116 rules: 66/; s/and 33 built into pbiplint\."/and 34 built into pbiplint."/g; s/"89 rules: 66/"90 rules: 66/; s/and 18 built into pbiplint\."/and 19 built into pbiplint."/' packages/web/test/generate.test.ts
perl -0pi -e 's/\b10(\s+)rules/11$1rules/g; s/Power Query rules, 10 of them/Power Query rules, 11 of them/g; s/\b9 of them pbiplint/10 of them pbiplint/g; s/\b9 of pbiplint/10 of pbiplint/g; s/\b115(\s+)rules in all, 33 of/116$1rules in all, 34 of/g' README.md packages/cli/README.md packages/core/README.md packages/web/content/about.md
git diff --stat
```

In `packages/web/test/generate.test.ts`, add `"default-step-names",` as the first entry of the Power Query slug list. The list is then:

```ts
      "default-step-names",
      "excel-use-headers",
      "fixed-date-in-row-filter",
      "incremental-refresh-range-bounds",
      "keep-first-rows-left-in",
      "local-drive-path",
      "minimize-power-query-transformations",
      "odbc-where-connector-exists",
      "privacy-levels-ignored",
      "script-in-query",
      "sort-not-held-for-remove-duplicates",
```

Check the prose: `git diff 267a1b4 -- README.md packages/cli/README.md packages/core/README.md packages/web/content/about.md` shows, across the whole pull request, only `6` to `11` Power Query rules, `5` to `10` of pbiplint's own, `111` to `116` rules in all, `29` to `34` built in, and the sample's `273` to `280`.

- [ ] **Step 10: Run what this task touches, in the browser too, and measure**

```bash
npx vitest run packages/core/test packages/web/test packages/cli/test
npm run typecheck
npm run check:browser
npm run build -w @pbiplint/web
npx playwright test -c packages/web/playwright.config.ts packages/web/e2e/home.spec.ts packages/web/e2e/site.spec.ts
```

Expected: PASS everywhere (the scratch run of the two specs in Chromium: 40 passed, 1 skipped; the sample's five groups to fix first are unchanged, since the new findings are info). Write the `check:browser` line into `progress.md` under Task 7 as **the after measurement**; the scratch run measured `core's own code 219.6 KB`. Over 230 KB stops the task.

- [ ] **Step 11: Commit**

```bash
npx prettier --write packages/core/src/rules/pbiplint/power-query.ts packages/core/test/rules-power-query.test.ts packages/core/src/rules/rule-summaries.data.ts packages/cli/src/rule-help.data.ts packages/web/src/results/rule-guidance.data.ts packages/core/test/pack.test.ts packages/web/test/generate.test.ts packages/web/test/sample.test.ts packages/web/test/home.test.ts packages/web/test/render.test.ts packages/web/test/export.test.ts packages/web/e2e/home.spec.ts packages/cli/test/cli.test.ts packages/cli/test/contract.test.ts
npm run lint
git add packages rules README.md tests/expectations
git commit -m "feat: DEFAULT_STEP_NAMES reports a query whose steps keep Desktop's names

Once per query, on its first step named as Power BI Desktop names steps
by default, with the count and up to two names. The sample's seven
queries keep Promoted Headers and Changed Type, so it gains seven info
findings (280), and the report fixtures' native maps name theirs. 116
rules, 34 built in, 11 on the Power Query layer.

Part of #78.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: The corpus diff, the spot checks, and the whole branch

**Files:**
- Reuse (not committed): `.superpowers/sdd/2026-10-13-v3-reader/corpus-diff.mts`
- Create (not committed): `.superpowers/sdd/2026-10-13-v3-rules-steps/rule-counts.mts`

**Interfaces:**
- Consumes: `lint` from `packages/core/src/index.ts`, in the branch and in a base core unpacked from `origin/release/0.3.0`.

- [ ] **Step 1: Unpack the base core**

```bash
mktemp -d "$CLAUDE_JOB_DIR/tmp/pr5.XXXX"
```

It prints a path; call it `<base>` below and type it out literally in each command (a shell variable does not survive to the next command). Then:

```bash
git archive origin/release/0.3.0 packages/core | tar -x -C <base>
ln -s "$PWD/node_modules" <base>/node_modules
ln -s "$PWD/packages/core/node_modules" <base>/packages/core/node_modules
```

(`packages/core/node_modules` exists in this worktree; if `ls packages/core/node_modules` says it does not, skip the last line.)

- [ ] **Step 2: Run the corpus diff**

```bash
npx tsx .superpowers/sdd/2026-10-13-v3-reader/corpus-diff.mts <base> ~/Projects/pbiplint/assets/pbip-lint-spike/research-104 > "$CLAUDE_JOB_DIR/tmp/pr5-corpus-diff.txt" 2>&1
grep -E "models linted|^[+-][0-9]|ERROR" "$CLAUDE_JOB_DIR/tmp/pr5-corpus-diff.txt"
```

Expected, in about a minute and a quarter, as the scratch run printed it (October 13, 2026, before the two `FIXED_DATE_IN_ROW_FILTER` changes; with them the fixed-date line reads `+9`):

```
1321 models linted
+4125 DEFAULT_STEP_NAMES
+9 FIXED_DATE_IN_ROW_FILTER
+19 SORT_NOT_HELD_FOR_REMOVE_DUPLICATES
+2 KEEP_FIRST_ROWS_LEFT_IN
+4 INCREMENTAL_REFRESH_RANGE_BOUNDS
```

Only `+` lines, only these five rules, no `-` line, no `ERROR`, and no `ODBC_WHERE_CONNECTOR_EXISTS` line (SQLOLEDB appears nowhere in the corpus). The diff's key leaves out the column, so two findings on one line with one detail count once there; Step 3's script is the count of record. **Any other rule, or any `-` line, stops the task:** report it with the examples the diff prints.

- [ ] **Step 3: Count each rule and pull examples for the spot check**

Create `.superpowers/sdd/2026-10-13-v3-rules-steps/rule-counts.mts` as a copy of pull request 4's script with this pull request's rules, and more examples:

```bash
sed -e 's/const RULES = \[/const RULES = ["SORT_NOT_HELD_FOR_REMOVE_DUPLICATES", "KEEP_FIRST_ROWS_LEFT_IN", "INCREMENTAL_REFRESH_RANGE_BOUNDS", "FIXED_DATE_IN_ROW_FILTER", "DEFAULT_STEP_NAMES", "ODBC_WHERE_CONNECTOR_EXISTS"]; const PR4_RULES = [/' -e 's/s.examples.length < 5 || s.n % 50 === 0/s.examples.length < 60 || s.n % 200 === 0/' -e 's/The five rules of pull request 4/The rules of pull request 5/' .superpowers/sdd/2026-10-13-v3-rules-calls/rule-counts.mts > .superpowers/sdd/2026-10-13-v3-rules-steps/rule-counts.mts
npx tsx .superpowers/sdd/2026-10-13-v3-rules-steps/rule-counts.mts ~/Projects/pbiplint/assets/pbip-lint-spike/research-104 > "$CLAUDE_JOB_DIR/tmp/pr5-rule-counts.txt" 2>&1
grep -E "^[A-Z_]+:" "$CLAUDE_JOB_DIR/tmp/pr5-rule-counts.txt"
```

(The first `sed` expression keeps pull request 4's list as an unused `PR4_RULES`, so the script still parses; the second prints the first sixty findings of each rule and every two hundredth after.) Expected, from the scratch run on October 13, 2026, with spec 11.4's expectation beside it:

| Rule | Occurrences, models, repositories | Spec 11.4 (occurrences, models) |
| --- | --- | --- |
| `SORT_NOT_HELD_FOR_REMOVE_DUPLICATES` | 19, 10, 8 | 19 or fewer, 10 or fewer |
| `KEEP_FIRST_ROWS_LEFT_IN` | 2, 1, 1 | 2, 1 |
| `INCREMENTAL_REFRESH_RANGE_BOUNDS` | 4, 4, 4 | 4, 4 |
| `FIXED_DATE_IN_ROW_FILTER` | 9, 4, 4 | 31 or fewer, 15 or fewer |
| `DEFAULT_STEP_NAMES` | 4,125, 492, 249 | 3,274 or more, 517 or more |
| `ODBC_WHERE_CONNECTOR_EXISTS` | 0, 0, 0 (unchanged) | |

**Two differences are explained, and expected:**

- `FIXED_DATE_IN_ROW_FILTER`: 37 filters in 8 models as spec 9.16 first read; the spec change of Task 6 leaves out 25 `<>` and 3 hand partitions, so 9 in 4 models, within the prediction.
- `DEFAULT_STEP_NAMES`: 3,247 partition queries in 489 models, plus 878 shared expressions in 118 models; 4,125 queries in 492 models together. The occurrences meet the prediction; the models fall short of the research's 517. A plain text match of the same names (`#"<name>"\d* =` over every `.tmdl` file) also finds 489 models, so the rule finds what the corpus holds today and the research's 517 is not reproducible from it. Record this in `progress.md` and the pull request body; it needs no decision.

If any other count is off by more than a few, stop and report the line with its examples.

- [ ] **Step 4: Spot-check each rule for false positives**

For each rule, read its examples in `$CLAUDE_JOB_DIR/tmp/pr5-rule-counts.txt` (each has its TMDL line under it) and confirm:

- `SORT_NOT_HELD_FOR_REMOVE_DUPLICATES` (all 19): the line is a `Table.Distinct` with a column list whose first argument is the step `Sorted Rows`, `Sorted Rows1`, `Sorted`, or a `Table.Sort` written in place, with no `Table.Buffer`. Open two models and confirm the step before is the sort.
- `KEEP_FIRST_ROWS_LEFT_IN` (both): `Table.FirstN(<step>, 20)` in a partition, the step not a sort.
- `INCREMENTAL_REFRESH_RANGE_BOUNDS` (all 4): `>= RangeStart and ... <= RangeEnd`, the widely copied sample spec 9.4 names; the column lands on the `<= RangeEnd` comparison.
- `FIXED_DATE_IN_ROW_FILTER` (all 9): a `Table.SelectRows` ending at (`<`, `<=`) or matching (`=`) a date of numbers; no `<>`, no table with more than one M partition, no `RangeStart`.
- `DEFAULT_STEP_NAMES` (the sixty printed and every two hundredth): the names in the detail are on the rule's list, in the query's outermost `let`. Desktop's combine-files helper queries (`Sample File`, `Transform Sample File`) count; they are Desktop's own names, and the page's When to ignore it covers generated queries.

Write one line per rule into `progress.md`: examples read, false positives found (expected: none). A false positive stops the task: report it with its line.

- [ ] **Step 5: Run the whole suite and every check**

```bash
npm run lint
npm run typecheck
npm test
npm run check:browser
npm run build
npm run check:network -w pbiplint
npm run check:pack
npm run test:bundle -w pbiplint
npm run test:e2e
git grep -n $'\u2014' -- $(git diff --name-only origin/release/0.3.0...HEAD) || echo "no em dashes"
```

(If a script name differs in this repository's `package.json`, use the name CI's `test` job runs, from `.github/workflows/ci.yml`.) Expected: all pass, `check:browser` at about 219.6 KB of the core's own code, and the last line prints `no em dashes`.

- [ ] **Step 6: Record the result**

Write into `progress.md`: the corpus diff's `+` lines; the table of Step 3 as measured; the two explanations; the spot-check lines; each task's `check:browser` line; the e2e engines that ran. Nothing is committed in this task.

---

### Finish

One Opus review of the whole branch (`git diff origin/release/0.3.0...HEAD`) with this plan and spec sections 3.4, 6.3, 8, 9.1, 9.2, 9.4, 9.11, 9.13, 9.15, 9.16, and 11. Then pb-coord pushes `v3/rules-steps` and opens a pull request into `release/0.3.0` titled `feat: steps, five Power Query rules that read a step or a filter (v3 PR 5)`. Its body lists:

- What changed: the five rules and their pages; `callOf`, `nodesOfKind`, `isWithin`, `boundValue`, and `longDate`; SQLOLEDB as a SQL Server name; m-zoo's expectations; the back-links on six pages; 116 rules, 34 built in, 11 on the Power Query layer.
- For the release notes' "What can change in your results": new findings from the five rules, most of them `DEFAULT_STEP_NAMES` (info, once per query); the sample's count (273 findings to 280, seven `DEFAULT_STEP_NAMES` info findings).
- The spec changes: 9.15 (SQLOLEDB) and 9.16 (`<>` and hand partitions left alone, with the corpus evidence).
- The budget: the core's own code from 211.8 KB to the after measurement (about 219.6 KB), under 230 KB; the parser's 385 KB unchanged. Pull request 6 has about 10.4 KB for its five rules, against this pull request's 7.8 KB for five.
- The corpus diff: only additions, of the five rules; the per-rule table (occurrences, models, repositories) beside spec 11.4's expectation; the two explanations; the spot checks with no false positive. Counts only, no corpus path or line.

The body ends with:

```
🤖 Generated with [Claude Code](https://claude.com/claude-code)
```

CI and e2e must be green with no retries, and then pb-coord merges.

Execution: subagent-driven, one Opus 5.5 subagent per task with a fresh reviewer after each (pb-coord, October 13, 2026).
Task order: 1, 2, 3, 4, 5, then 6 once pb-coord confirms its two spec changes, 7, 8.

