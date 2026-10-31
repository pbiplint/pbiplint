# v3 Desktop Check Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Pull request 8 of v3 ([#78](https://github.com/pbiplint/pbiplint/issues/78)): the answers of [Michael's Desktop check of October 13, 2026](https://github.com/pbiplint/pbiplint/issues/78#issuecomment-6158143617). `DYNAMIC_DATA_SOURCE` follows Desktop for an address chosen with `if` and for a custom function's parameter; `EXTENSION_FILTER_CASE` ships, leaving `.log` alone, if Michael raises the core's budget (**Task 2 is HELD until he rules**).

**Architecture:** `origin` (`packages/core/src/m/resolve.ts`) gains two classes, `chosen` and `parameter`, between `unknown` and `computed`. `DYNAMIC_DATA_SOURCE` (`packages/core/src/rules/pbiplint/power-query.ts`) fires on anything but `static` and `unknown`, and its detail names the class. `EXTENSION_FILTER_CASE` is pull request 6's prototype (`docs/superpowers/plans/2026-10-13-v3-rules-resolver.md`, Task 8) with one exclusion constant for `.log`.

**Tech Stack:** TypeScript, `@microsoft/powerquery-parser` 2.0.0, Vitest, Playwright, esbuild (`check:browser`).

**Spec:** `docs/superpowers/specs/2026-10-12-pbiplint-v3-power-query-layer-design.md`, sections 3.4, 8, 9.3, 9.10, 10.3, and 11.4. Pull request 6's plan is the pattern this plan follows.

## Rulings

Every code block, page edit, test, pin, and count below was run in a scratch copy of `v3/desktop-check` at f51666c on October 13, 2026, with both tasks applied: the whole suite passed (4,290 tests), lint and typecheck were clean, and `check:browser` measured 230.1 KB, which is why Task 2 is held.

- **Any `if` counts, `if true then` included (agreed with pb-coord).** Desktop warned on an `if` whose condition is a parameter and whose branches are both fixed text. A parameter's value is as knowable as a literal, so Desktop does not evaluate conditions, and nothing suggests a literal condition is treated differently. One rule, "an address that is or passes through an `if` is dynamic", is the simplest to state and test. The condition adds nothing beyond that (a call in it does not make the address `computed`), and a branch that raises an `error` does not keep the address static.
- **Two new origin classes, worst last:** `static`, `unknown`, `chosen`, `parameter`, `computed`, `row`. A name bound to a function's parameter, or a field of one, is `parameter`; an `if` is the worst of `chosen` and its two branches. The details: `is chosen with if ... then ... else` and `is a custom function's parameter`. An address that is both (a custom function whose path is an `if` over its parameter) reads as the parameter; one that is also read from the rows or built by a call keeps that detail.
- **The `.log` exclusion** (Michael, October 13, 2026: "Leave .log alone"): one constant beside `FILE_LISTING`, `const ONE_CASE_EXTENSION = /^\.(?:log)$/i;`, tested in the rule's text check. Another extension later is one more alternative in that line, and nothing else changes.
- **The budget.** Spec 3.4's 230 KB is 235,520 bytes. The base is 234,093 (228.6 KB). Task 1 alone is about 234,335 (228.8 KB). Both tasks measure 235,654 bytes (230.1 KB), **134 bytes over**: `power-query.ts` +1,202 (the rule, about 1,100, and `DYNAMIC_DATA_SOURCE`'s two details, about 100), `rule-summaries.data.ts` +285 (the new page's first paragraph, 217, and `DYNAMIC_DATA_SOURCE`'s longer one, 68), `resolve.ts` +74. pb-coord recommends a raise to 240 KB; Task 2, Step 0 reads Michael's answer.
- **No fixture changes.** m-zoo already holds the shapes (`Orders Pending Check`'s `if` over `Environment`, the `GetPage` function, `Sales Files`' extension filter). No Tabular Editor capture changes. The sample (`examples/messy-sales`) gains nothing, so its 280 findings and the e2e counts do not move.

## Global Constraints

- **Base branch:** `release/0.3.0`, never main. Branch `v3/desktop-check`, cut from `release/0.3.0` at f51666c (pull requests 1 to 7 and the 0.3.0 version bump). Work in a worktree, never in the main checkout.
- **The rules** (spec 9.1): `DYNAMIC_DATA_SOURCE` error (3), Error Prevention, "Data source the service can't refresh"; `EXTENSION_FILTER_CASE` warning (2), Error Prevention, "File extension filter misses other cases". Both builtin through `pbiplintRule`, layer `powerquery`, scope `["Partition", "NamedExpression", "Table"]`, one finding per occurrence through `mFinding`.
- **No em dashes anywhere** (code, comments, docs, pages, commit messages; `rule-pages.test.ts` checks pages for U+2014). Restructure with a comma, colon, parentheses, or two sentences.
- **Long-form dates in prose** ("October 13, 2026"), except in file names and front matter. **Capitalized bullets** in every list.
- **Rule pages** are pbiplint's own prose: the fix starts in Power BI Desktop's Power Query editor, then the TMDL line; no Tabular Editor; every quote linked to its section; "When to ignore it" gives judgment only. Each page's `tmdl fires` and `tmdl fixed` examples must parse and fire.
- **Counts only from the corpus:** the pull request, the spec, and the release notes carry counts, never a corpus path, line, value, or vendor word.
- **Core stays browser-pure:** no Node built-in, no `process.`, no network API in `packages/core/src`.
- **The core budget** is `OWN_LIMIT_KB` in `packages/core/scripts/check-browser-bundle.mjs`, compared in bytes. Crossing it stops the work and goes to pb-coord. Only Task 2's raise path changes it, and only on Michael's ledger line.
- **The suite stays green at every task.** Each task moves every pin it breaks: the rule counts in `pack.test.ts` and `generate.test.ts` (the made-up-input counts there too), the README and About counts, m-zoo's and shelfmart's expectations, and e2e counts (none move here). Every commit passes `npm test`, `npm run lint`, `npm run typecheck`, and `npm run check:browser`.
- **Formatting:** `npx prettier --write` on every changed `.ts`, `.mts`, `.mjs`, and `.json` file outside `tests/fixtures/` and `tests/expectations/` before committing (keep m-zoo's JSON as `pin-m-zoo.mjs` writes it). Then `npm run lint`.
- **Generated data:** after any page edit, `npm run build -w @pbiplint/core && node scripts/sync-rule-pages.mjs`, and commit the three `.data.ts` files it rewrites.
- **Folder inputs in e2e** go through `setFolder` from `packages/web/e2e/folder-input.ts`, never `setInputFiles` on a directory.
- **Commits:** each message ends with `Part of #78.`, a blank line, and `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Never a closing keyword next to an issue number.
- **Subagents** run on Opus 5.5 and share the worktree, so one edits files at a time.
- **Command rules** (pb-coord, October 13, 2026; hard rules):
  - Scratch only in a scratch folder, `$CLAUDE_JOB_DIR/tmp`. Never `/tmp`.
  - Every experiment in a fresh folder from `mktemp -d "$CLAUDE_JOB_DIR/tmp/pr8.XXXX"`, used by its printed literal path (shell variables do not survive between tool calls). Leaving scratch folders behind is fine.
  - Never `rm -rf` or `rm -r` with a glob or a variable path; never `cd` somewhere and delete with `*`.
  - No `sudo`, no deleting outside the worktree or the job folder, no `git clean`, `git reset --hard`, `git checkout -- .`, `git stash`, or any push (the Finish section's push is pb-coord's).
  - If a command might ask for permission, rewrite it so it cannot. Never wait on a prompt.
  - `gh-pb` for GitHub calls, never `gh auth switch`.
- **The plan's workspace** is `.superpowers/sdd/2026-10-13-v3-desktop-check/` (git-ignored; `.superpowers` links into home's copy, so scripts import the worktree's code by `process.cwd()`). Pull request 6's scripts are reused from `.superpowers/sdd/2026-10-13-v3-rules-resolver/` (`bytes.mjs`, `minsize.mjs`, `pin-m-zoo.mjs`, `rule-counts.mts`), and the reader plan's `corpus-diff.mts` from `.superpowers/sdd/2026-10-13-v3-reader/`.
- **The corpus** (in the maintainer's research folder) is not pbiplint's.

## Review Focus

- **A guard that raises an error.** `if ApiBase = "" then error ... else ApiBase` is a common, careful shape, and it now fires; the page must say why in one sentence, and Task 1 pins it.
- **An `if` in `RelativePath` or `Query`.** Only the first argument is read, so an `if` inside the options record must stay silent. Task 1 pins it.
- **An `if` beside a worse origin.** An `if` with a branch read from the rows must still say "read from the rows", not "chosen". The existing `origin` case `if with a branch read from the rows` stays `row`; Task 1 keeps it.
- **A field of a function's parameter.** `(cfg) => Web.Contents(cfg[Url])` and `(settings as record) => File.Contents(settings[Path])` must fire as the parameter does. Task 1 pins both.
- **`.log` in any case, and only `.log`.** `.log`, `.LOG`, and `".Log" = [Extension]` stay silent while `.CSV` in the same query fires. Task 2 pins it.

## File Structure

| File | Task | Responsibility |
| --- | --- | --- |
| `packages/core/src/m/resolve.ts` | 1 | `origin`'s `chosen` and `parameter` |
| `packages/core/src/rules/pbiplint/power-query.ts` | 1, 2 | `DYNAMIC_DATA_SOURCE`'s test and detail; `EXTENSION_FILTER_CASE` |
| `packages/core/test/m-resolve.test.ts`, `packages/core/test/rules-power-query.test.ts` | 1, 2 | Unit tests |
| `rules/dynamic-data-source.md`, `rules/extension-filter-case.md` (new), `rules/local-drive-path.md` | 1, 2 | Pages |
| The three generated `.data.ts` files | 1, 2 | Regenerated from the pages |
| `tests/expectations/pbiplint/m-zoo.json`, `tests/expectations/shelfmart.report.json` | 1, 2 | Pins |
| `packages/core/test/pack.test.ts`, `packages/web/test/generate.test.ts`, `README.md`, `packages/cli/README.md`, `packages/core/README.md`, `packages/web/content/about.md` | 2 | Counts, 120 rules to 121 |
| `packages/core/scripts/check-browser-bundle.mjs` | 2 (raise path) | The budget |
| The v3 spec, sections 3.4, 8, 9.3, 9.10 | 1, 2 | Dated amendments |
| `.superpowers/sdd/2026-10-13-release-0.3.0/release-notes.md` (local, not committed) | 4 | The release notes draft |

---

## Before Task 1

```bash
git switch v3/desktop-check
git status --short          # expected: only this plan, untracked
pb-worktree-setup
mkdir -p .superpowers/sdd/2026-10-13-v3-desktop-check
git add docs/superpowers/plans/2026-10-13-v3-desktop-check.md
git commit -m "docs: the v3 Desktop check plan

Part of #78.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
npm test 2>&1 | tail -5
npm run check:browser
node .superpowers/sdd/2026-10-13-v3-rules-resolver/bytes.mjs | tail -1
```

Expected: the suite passes; `check:browser` prints `core's own code 228.6 KB`; `bytes.mjs` prints `core's own code 234093 bytes, 228.6 KB`. Write that line into `.superpowers/sdd/2026-10-13-v3-desktop-check/progress.md` as **the base measurement**. If anything differs, stop and report.

**The ledger line pb-coord writes into `progress.md`** (Task 2 reads it): `Budget (Michael): raise to <N> KB` or `Budget (Michael): hold`.

---

### Task 1: `origin` and `DYNAMIC_DATA_SOURCE` follow Desktop

**Files:**
- Modify: `packages/core/src/m/resolve.ts` (the `Origin` type, `ORIGIN_ORDER`, `origin` and its doc comment)
- Modify: `packages/core/src/rules/pbiplint/power-query.ts` (`DYNAMIC_DATA_SOURCE` and its comment)
- Modify: `rules/dynamic-data-source.md`, `rules/local-drive-path.md`; the three generated `.data.ts` files
- Modify: `tests/expectations/pbiplint/m-zoo.json`
- Modify: the v3 spec, sections 8 and 9.3
- Test: `packages/core/test/m-resolve.test.ts`, `packages/core/test/rules-power-query.test.ts`

**Interfaces:**
- Produces: `export type Origin = "static" | "unknown" | "chosen" | "parameter" | "computed" | "row"` and `ORIGIN_ORDER` in that order. Nothing else calls `origin` (only `DYNAMIC_DATA_SOURCE`).

- [ ] **Step 1: Write the failing tests**

In `packages/core/test/m-resolve.test.ts`, `describe("origin")`'s `cases`: replace the two cases labelled `(until the Desktop check)` with these five:

```ts
    [
      "if over a parameter between literals, as Desktop reads it",
      'Web.Contents(if Environment = "Prod" then "https://a.example.com" else "https://b.example.com")',
      "chosen",
    ],
    [
      "if with a literal condition",
      'Web.Contents(if true then "https://a.example.com" else "https://b.example.com")',
      "chosen",
    ],
    [
      "an if inside an & join",
      'Web.Contents(ApiBase & (if Environment = "Prod" then "/v1" else "/test"))',
      "chosen",
    ],
    [
      "a function's parameter, as Desktop reads it",
      "let f = (u) => Web.Contents(u) in f",
      "parameter",
    ],
    [
      "if over a function's parameter",
      'let f = (u) => Web.Contents(if u = "" then ApiBase else u) in f',
      "parameter",
    ],
```

In the same list, the expected class of `"if whose condition calls a function, between static branches"` and of `"if with a branch that raises an error"` changes from `"static"` to `"chosen"` (their M stays). `"if with a branch built by a function call"` stays `"computed"` and `"if with a branch read from the rows"` stays `"row"`. In `describe("origin of a field or item")`, replace the function-parameter test with:

```ts
  it("is parameter for a field of a function's parameter, as the parameter is", async () => {
    expect(await originOf("let f = (cfg) => Web.Contents(cfg[Url]) in f")).toBe("parameter");
  });
```

In `packages/core/test/rules-power-query.test.ts`, `describe("DYNAMIC_DATA_SOURCE ...")`: replace the test `"leaves alone the two shapes awaiting the Desktop check: ..."` with:

```ts
  it("reports an address chosen with if, whatever its branches, and a custom function's parameter, as Desktop does", async () => {
    const tmdl =
      base +
      "expression GetPage = (address as text) => Web.Contents(address)\n\n" +
      "expression GetFile = (settings as record) => File.Contents(settings[Path])\n\n" +
      table(
        "Orders",
        "let",
        '\tAddress = if ApiBase = "" then "https://test.example.com" else ApiBase,',
        "\tChosen = Web.Contents(Address),",
        '\tGuarded = Web.Contents(if ApiBase = "" then error Error.Record("Missing", "Set ApiBase") else ApiBase),',
        '\tAlways = Web.Contents(if true then "https://api.example.com" else "https://test.example.com"),',
        '\tJoined = Folder.Files(DataFolder & (if ApiBase = "" then "Test" else "Prod")),',
        '\tRelative = Web.Contents(ApiBase, [RelativePath = if ApiBase = "" then "test" else "v1"]),',
        '\tThroughFunction = GetPage("https://api.example.com/v1/customers")',
        "in",
        "\tThroughFunction",
      );
    expect(
      (await mFindings(rule, tmdl)).map((f) => [f.objectName, f.location?.line, f.detail]),
    ).toEqual([
      [
        "Orders",
        15,
        "query 'Orders', step 'Chosen': Web.Contents's address is chosen with if ... then ... else",
      ],
      [
        "Orders",
        16,
        "query 'Orders', step 'Guarded': Web.Contents's address is chosen with if ... then ... else",
      ],
      [
        "Orders",
        17,
        "query 'Orders', step 'Always': Web.Contents's address is chosen with if ... then ... else",
      ],
      [
        "Orders",
        18,
        "query 'Orders', step 'Joined': Folder.Files's path is chosen with if ... then ... else",
      ],
      ["GetPage", 5, "query 'GetPage': Web.Contents's address is a custom function's parameter"],
      ["GetFile", 7, "query 'GetFile': File.Contents's path is a custom function's parameter"],
    ]);
  });
```

(`Relative`, an `if` inside `RelativePath`, and `ThroughFunction`, the call site, stay silent: the finding is on the function.)

- [ ] **Step 2: Run them to make sure they fail**

Run: `npx vitest run packages/core/test/m-resolve.test.ts packages/core/test/rules-power-query.test.ts -t "origin|DYNAMIC"`
Expected: FAIL: the new cases get `static` or `unknown`, and the rule reports nothing for them.

- [ ] **Step 3: Teach `origin` the two classes**

In `packages/core/src/m/resolve.ts`, replace the `Origin` type and `ORIGIN_ORDER` with:

```ts
export type Origin = "static" | "unknown" | "chosen" | "parameter" | "computed" | "row";
/** Worst last: a value is as bad as the worst thing it reaches. */
export const ORIGIN_ORDER: readonly Origin[] = [
  "static",
  "unknown",
  "chosen",
  "parameter",
  "computed",
  "row",
];
```

Replace `origin`'s doc comment with:

```ts
/**
 * Where a value comes from: `static` for literals, model parameters, and what joins them; `unknown`
 * for a name nothing defines, a field or item of a record or list written in place, or a cycle;
 * `chosen` for an `if ... then ... else`, whatever its branches, as Power BI Desktop reads it;
 * `parameter` for a custom function's parameter or a field of one; `computed` for a function call
 * anywhere in it; `row` for `_` or a field or item of anything else. A value is the worst of what
 * it reaches. An `if`'s condition adds nothing beyond `chosen`, and an `error` is static, since it
 * reaches no source. Each node is followed once, so a cycle reads as unknown.
 */
```

In the `IdentifierExpression` case, after `if (r.kind === "modelParameter" || r.kind === "library") return "static";`, add:

```ts
      if (r.kind === "parameter") return "parameter";
```

Replace the `IfExpression` case and its comment with:

```ts
    // Desktop reads any if as dynamic, whatever its branches; the condition adds nothing more.
    case Kind.IfExpression:
      return worst([
        "chosen",
        origin(m, q, node.trueExpression, seen),
        origin(m, q, node.falseExpression, seen),
      ]);
```

In the field-or-item loop, replace:

```ts
          // A custom function's parameter is unknown (spec 9.3), and so is any field of it.
          return "unknown";
```

with:

```ts
          // A custom function's parameter is dynamic (spec 9.3), and so is any field of it.
          return "parameter";
```

In `packages/core/src/rules/pbiplint/power-query.ts`, replace the comment above `DYNAMIC_DATA_SOURCE` with:

```ts
// A data source whose address is read from the rows, built by a function call, chosen with an if,
// or a custom function's parameter cannot refresh in the service (v3 spec, section 9.3; the last two
// from Michael's Desktop check of October 13, 2026). Only the first argument is read, so
// Web.Contents' RelativePath and Query options, Microsoft's route for a dynamic request to a static
// address, are left alone, as are literals, parameters, and joins of them.
```

and in its `check`, replace `if (o !== "row" && o !== "computed") return [];` with `if (o === "static" || o === "unknown") return [];`, and the `how` line with:

```ts
        const how = {
          row: "is read from the rows",
          computed: "is built by a function call",
          parameter: "is a custom function's parameter",
          chosen: "is chosen with if ... then ... else",
        }[o];
```

Run: `npx vitest run packages/core/test/m-resolve.test.ts packages/core/test/rules-power-query.test.ts`
Expected: PASS.

- [ ] **Step 4: The page says what Desktop showed**

In `rules/dynamic-data-source.md`:

- Replace the first paragraph of What it checks with: ``Data sources whose address the Power BI service cannot know before the query runs: a call such as `Web.Contents`, `File.Contents`, or `Sql.Database` whose first argument is read from a table's rows, built by a function call, chosen with `if ... then ... else`, or a custom function's parameter.``
- In the second paragraph, after ``... is read from the rows`.``, add: ``The other endings, in the order the detail prefers them when more than one applies, are `is built by a function call`, `is a custom function's parameter`, and `is chosen with if ... then ... else`.``
- Under How to fix it, after the database bullet, add: ``- For an address chosen with `if ... then ... else`, hold the address in a parameter and change the parameter's current value (Home, Manage Parameters) instead of choosing in the query. For a custom function, keep the address a fixed text or a parameter inside the function, and pass in only what goes into `RelativePath` and `Query`.``
- Under Quirks, replace the two bullets that begin "An address chosen with" and "An address that is a custom function's own parameter" with:

```markdown
- An address chosen with `if ... then ... else` is reported whatever its branches hold, because Power BI Desktop reports it: in [a check on October 13, 2026](https://github.com/pbiplint/pbiplint/issues/78#issuecomment-6158143617), Data source settings showed its dynamic source warning for a web address chosen between two fixed texts by a parameter. It counts even when one branch raises an `error`, since Desktop does not evaluate the condition.
- An address that is a custom function's own parameter, or a field of one, is reported, as Desktop reported it in the same check, even when every call passes fixed text.
- A name nothing in the model defines is left alone.
```

In `rules/local-drive-path.md`, Related rules, replace the `DYNAMIC_DATA_SOURCE` bullet with: ``- `DYNAMIC_DATA_SOURCE` reports a path the service cannot know before the query runs (read from the rows, built by a function call, chosen with `if`, or a custom function's parameter), which it cannot refresh at all.``

```bash
npm run build -w @pbiplint/core && node scripts/sync-rule-pages.mjs
npx vitest run packages/core/test/rule-pages.test.ts -t "DYNAMIC_DATA_SOURCE|LOCAL_DRIVE_PATH"
```

Expected: `wrote 120 summaries ...`; PASS.

- [ ] **Step 5: Pin m-zoo's two shapes**

Write `.superpowers/sdd/2026-10-13-v3-desktop-check/pin-dynamic.json`:

```json
[
  {
    "rule": "DYNAMIC_DATA_SOURCE",
    "objectType": "NamedExpression",
    "object": "GetPage",
    "file": "definition/expressions.tmdl",
    "line": 34,
    "column": 13,
    "detail": "query 'GetPage': Web.Contents's address is a custom function's parameter"
  },
  {
    "rule": "DYNAMIC_DATA_SOURCE",
    "objectType": "Partition",
    "object": "Orders Pending Check",
    "file": "definition/tables/Orders Pending Check.tmdl",
    "line": 15,
    "column": 15,
    "detail": "query 'Orders Pending Check', step 'Chosen': Web.Contents's address is chosen with if ... then ... else"
  }
]
```

```bash
node .superpowers/sdd/2026-10-13-v3-rules-resolver/pin-m-zoo.mjs .superpowers/sdd/2026-10-13-v3-desktop-check/pin-dynamic.json
npx vitest run packages/core/test/rules-m.test.ts
```

Expected: `2 added, 48 findings, 14 rules`; PASS. If m-zoo's `about` text says the two shapes are left alone, change only that sentence to say they fire since the Desktop check.

- [ ] **Step 6: Amend spec 8 and 9.3**

In section 8, replace the four class bullets and the `Order:` line with:

```markdown
- **`static`:** a literal; a model parameter; an `&` join or other operator over static values; a name whose binding is static.
- **`unknown`:** a name that resolves to nothing; a field or item access on a record or list written as a literal; anything deeper than the cycle guard.
- **`chosen`:** an `if ... then ... else`, whatever its condition and branches (section 9.3's Desktop check).
- **`parameter`:** a function's parameter, or a field or item of one (section 9.3's Desktop check).
- **`row`:** `_`, a field or item access on anything else (`[url]` inside `each`, `Config{0}[BaseUrl]`).
- **`computed`:** a function call anywhere in the value, other than the parameter-wrapping cases the rules name.

Order: `static` < `unknown` < `chosen` < `parameter` < `computed` < `row`. Each name is followed once per classification (a visited set of node ids), so a cycle reads as `unknown`.
```

and after the paragraph that begins "Amended October 13, 2026 (the coordinator's decision, pull request 6", add:

```markdown
Amended October 13, 2026 ([Michael's Desktop check](https://github.com/pbiplint/pbiplint/issues/78#issuecomment-6158143617), pull request 8): Power BI Desktop's Data source settings showed its dynamic source warning for a web address chosen with `if ... then ... else` over a parameter between two fixed texts, and for a web address that is a custom function's parameter called with fixed text. So an `if` is `chosen` whatever its branches, and the worst of that and its branches; its condition still adds nothing, and a branch that raises an `error` no longer leaves the value `static`. An `if` with a literal condition (`if true then`) counts too: Desktop does not evaluate the condition, and one rule is simpler to state and test. A function's parameter, and a field of one, is `parameter`. Both sit below `computed`, so an address that is also built by a call or read from the rows keeps that detail.
```

In section 9.3:

- In Flags, replace ``has origin `row` or `computed` (section 8)`` with ``has origin `row`, `computed`, `parameter`, or `chosen` (section 8)``.
- In Leaves alone, replace the bullet that begins "**Until Michael's Desktop check:**" with: ``- **Amended October 13, 2026 ([Michael's Desktop check](https://github.com/pbiplint/pbiplint/issues/78#issuecomment-6158143617)):** no longer left alone. An address that is or passes through an `if ... then ... else` (`chosen`) and an address that is a custom function's parameter or a field of one (`parameter`) fire, as Desktop's Data source settings flagged both. The page says that an `if` with an `error` branch counts, since Desktop does not evaluate the condition.``
- Replace the Detail line with: ``- **Detail:** `query 'Orders', step 'Added Custom': File.Contents's path is read from the rows` (for `row`), or `... is built by a function call` (`computed`), `... is a custom function's parameter` (`parameter`), `... is chosen with if ... then ... else` (`chosen`).``
- In Fixtures, replace ``the two shapes awaiting the Desktop check (do not, until it says otherwise)`` with ``the two Desktop-check shapes, m-zoo's `Orders Pending Check` and `GetPage` (fire, from October 13, 2026)``.
- After the Corpus bullet, add: ``- **Corpus, amended October 13, 2026:** with the Desktop-check shapes, 22 occurrences in 13 models (10 repositories), 6 more than pull request 6's 16: 5 custom functions' parameters and 1 `if` over a model parameter with an `error` branch.``

- [ ] **Step 7: Measure**

```bash
npm run check:browser
node .superpowers/sdd/2026-10-13-v3-rules-resolver/bytes.mjs "power-query|resolve|summaries"
```

Expected: about 228.8 KB (about 234,335 bytes): `resolve.ts` 3,676, `rule-summaries.data.ts` about 25,603. **Stop** if over 229.1 KB: do not commit; write the `bytes.mjs` lines into `progress.md` and report. Write the line into `progress.md`.

- [ ] **Step 8: The corpus diff and the spot check**

```bash
mktemp -d "$CLAUDE_JOB_DIR/tmp/pr8.XXXX"
```

It prints a path; call it `<base>` and type it out literally. Then:

```bash
git archive f51666c packages/core | tar -x -C <base>
ln -s "$PWD/node_modules" <base>/node_modules
ln -s "$PWD/packages/core/node_modules" <base>/packages/core/node_modules
npx tsx .superpowers/sdd/2026-10-13-v3-reader/corpus-diff.mts <base> <research-folder>/research-104 > "$CLAUDE_JOB_DIR/tmp/pr8-corpus-diff-1.txt" 2>&1
grep -E "models linted|^[+-][0-9]|ERROR" "$CLAUDE_JOB_DIR/tmp/pr8-corpus-diff-1.txt"
```

Expected: `1321 models linted` and `+6 DYNAMIC_DATA_SOURCE`, nothing else (no `-` line, no other rule, no `ERROR`). Write `<base>` into `progress.md` (Tasks 2 and 3 reuse it). The diff prints only 5 examples per rule, so list all 6 with `rule-counts.mts`:

```bash
npx tsx .superpowers/sdd/2026-10-13-v3-rules-resolver/rule-counts.mts <research-folder>/research-104 60 > "$CLAUDE_JOB_DIR/tmp/pr8-rule-counts-1.txt" 2>&1
grep -E "^DYNAMIC_DATA_SOURCE:" "$CLAUDE_JOB_DIR/tmp/pr8-rule-counts-1.txt"
grep -E "custom function's parameter|chosen with if" "$CLAUDE_JOB_DIR/tmp/pr8-rule-counts-1.txt"
```

Expected: `DYNAMIC_DATA_SOURCE: 22 occurrences, 13 models, 10 repositories`; 5 parameter details (two copies of one function whose path is an `if` over its parameter, `File.Contents` in two others, `AzureStorage.Blobs` and `Folder.Files` in a fourth model's two functions) and 1 `chosen` (`Folder.Contents` over a model parameter guarded by an `error` branch). Open each in the corpus and confirm the shape is one Desktop warned on: the address is a function's parameter, or passes through an `if`. Write the counts and `spot check: 6 of 6 true to the Desktop check` into `progress.md`. Counts only go anywhere else.

- [ ] **Step 9: Run every check, and commit**

```bash
npx prettier --write packages/core/src/m/resolve.ts packages/core/src/rules/pbiplint/power-query.ts packages/core/test/m-resolve.test.ts packages/core/test/rules-power-query.test.ts packages/core/src/rules/rule-summaries.data.ts packages/cli/src/rule-help.data.ts packages/web/src/results/rule-guidance.data.ts
npm run lint
npm run typecheck
npm test
npm run check:browser
git add packages rules tests/expectations docs/superpowers/specs
git commit -m "feat: DYNAMIC_DATA_SOURCE reports an address chosen with if or a function's parameter

Michael's Desktop check showed Data source settings warns on both shapes:
an address chosen with if ... then ... else, whatever its branches, and
a custom function's parameter. origin gains chosen and parameter, the
detail names each, and spec 8 and 9.3 record the check. Corpus: 6 more
findings, 22 in 13 models.

Part of #78.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: `EXTENSION_FILTER_CASE`, with `.log` left alone (HELD until Michael rules on the budget)

**Files (ship path):**
- Modify: `packages/core/src/rules/pbiplint/power-query.ts`
- Create: `rules/extension-filter-case.md`
- Modify: `rules/local-drive-path.md`; the three generated `.data.ts` files
- Modify: `tests/expectations/pbiplint/m-zoo.json`, `tests/expectations/shelfmart.report.json`
- Modify: `packages/core/test/pack.test.ts`, `packages/web/test/generate.test.ts`, `README.md`, `packages/cli/README.md`, `packages/core/README.md`, `packages/web/content/about.md`
- Modify: `packages/core/scripts/check-browser-bundle.mjs`
- Modify: the v3 spec, sections 3.4 and 9.10
- Test: `packages/core/test/rules-power-query.test.ts`

**Files (hold path):** the v3 spec, section 9.10, only.

**Interfaces:**
- Consumes: `boundValue` (`m/resolve.ts`); `callOf`, `calls`, `identifierName`, `isWithin`, `nodesOfKind`, `textLiterals`, `textValue`, `unwrap`, and the type `MCall` (`m/ast.ts`); `mFinding`; `pbiplintRule`.
- Produces (ship path): `export const EXTENSION_FILTER_CASE: Rule`, appended to `powerQueryRules`; `const ONE_CASE_EXTENSION`, the exclusion point.

- [ ] **Step 0: Read the budget ruling**

```bash
grep -n "Budget (Michael)" .superpowers/sdd/2026-10-13-v3-desktop-check/progress.md || echo "no answer yet"
```

- **`raise to <N> KB`:** the ship path, Steps 1 to 10, with `<N>` where this task writes 240.
- **`hold`:** the hold path, Step H.
- **No line:** commit nothing for this rule, write `Task 2: held, waiting for Michael's budget ruling` into `progress.md`, go on to Task 3, and report the wait.

- [ ] **Step H (hold path only): The spec note, and nothing else**

In section 9.10, after the Corpus bullet, add:

```markdown
- **Held, October 13, 2026:** [Michael's Desktop check](https://github.com/pbiplint/pbiplint/issues/78#issuecomment-6158143617) showed `Folder.Files` keeps an extension's case, so the rule is true, but with it the core's own code measured 230.1 KB, over section 3.4's 230 KB, and Michael held it rather than raise the budget. Its code, tests, and page are in pull request 8's plan, Task 2, with `.log` left alone at his ruling ("Leave .log alone"): 54 corpus filters as written, 2 after.
```

```bash
git add docs/superpowers/specs/2026-10-12-pbiplint-v3-power-query-layer-design.md
git commit -m "docs: EXTENSION_FILTER_CASE held at the core's budget

Part of #78.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

Write `Task 2: held (budget); spec note committed` into `progress.md`. The task ends here.

- [ ] **Step 1: Write the failing tests**

The rule import in `packages/core/test/rules-power-query.test.ts` gains `EXTENSION_FILTER_CASE,` after `EXCEL_USE_HEADERS,`. Add at the end of the file:

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
  it("leaves a log file's extension alone in any case, and reports any other extension in capitals", async () => {
    const tmdl = table(
      "Gateway Logs",
      "let",
      '\tSource = Folder.Files("C:\\Demo\\Data\\Logs"),',
      '\tLower = Table.SelectRows(Source, each [Extension] = ".log"),',
      '\tUpper = Table.SelectRows(Source, each [Extension] = ".LOG"),',
      '\tMixed = Table.SelectRows(Source, each ".Log" = [Extension]),',
      '\tCsv = Table.SelectRows(Source, each [Extension] = ".CSV")',
      "in",
      "\tCsv",
    );
    expect((await mFindings(rule, tmdl)).map((f) => f.detail)).toEqual([
      "query 'Gateway Logs', step 'Csv': the extension test matches \".CSV\" but not \".csv\"",
    ]);
  });
});
```

- [ ] **Step 2: Run them to make sure they fail**

Run: `npx vitest run packages/core/test/rules-power-query.test.ts -t EXTENSION`
Expected: FAIL: `EXTENSION_FILTER_CASE` is not exported.

- [ ] **Step 3: Write the rule**

In `packages/core/src/rules/pbiplint/power-query.ts`, the `m/ast.js` import gains `type MCall,` after `identifierName,`. Add after `LEGACY_EXCEL_FILE`:

```ts
/** The functions that list a folder's files, with an Extension column. */
const FILE_LISTING = /^(?:Folder|SharePoint)\.(?:Files|Contents)$/;

/**
 * Extensions left alone in any case, since the programs that write them keep one case: a log
 * file's (Michael, October 13, 2026). One alternative per extension.
 */
const ONE_CASE_EXTENSION = /^\.(?:log)$/i;

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
// Comparer.OrdinalIgnoreCase, a listing whose Extension column a Table.TransformColumns step
// changes first, and a log file's extension are left alone.
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
          if (text === undefined || !/[a-z]/i.test(text) || ONE_CASE_EXTENSION.test(text))
            return [];
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

When the files come from one system that always writes the extension in the same case, the filter cannot miss one. A comparison that does not change case says so to the next reader too.

## Quirks

- Read: `[Extension] = "<text>"` or `<>`, either way round, inside a `Table.SelectRows` whose table is a `Folder.Files`, `Folder.Contents`, `SharePoint.Files`, or `SharePoint.Contents` listing, followed back through the steps before it.
- A comparison through `Text.Lower`, `Text.Upper`, or `Comparer.OrdinalIgnoreCase` is left alone. So is a listing with a `Table.TransformColumns` step on its Extension column before the filter, whatever that step does, since lowercasing the column there is one of the fixes above.
- A listing the rule cannot follow back to one of the four functions, such as a lakehouse's or a storage account's, is not read.
- Text with no letter in it, such as `".7"`, cannot miss a case and is left alone.
- A filter on `".log"`, in any case, is left alone: the programs that write log files, such as a gateway, keep one case for them.
- Each comparison is its own finding.
- A query whose M does not parse is not read; it gets a `PARSE_ISSUE` finding instead.

## Related rules

- `LOCAL_DRIVE_PATH` reports the folder's path when it is on a local drive, as a folder of files often is.

## Links

- [Folder connector](https://learn.microsoft.com/power-query/connectors/folder)
- [Comparer.OrdinalIgnoreCase](https://learn.microsoft.com/powerquery-m/comparer-ordinalignorecase)
````

(This is pull request 6's page with two changes: When to ignore it drops its log-file example, and Quirks gains the `.log` bullet. Check the quote and anchor against the live page before committing.) In `rules/local-drive-path.md`, add a last bullet under Related rules:

```markdown
- `EXTENSION_FILTER_CASE` reports a filter on a folder's files that misses an extension written in other capitals, often over a local folder.
```

- [ ] **Step 5: Regenerate and run the pages' tests**

```bash
npm run build -w @pbiplint/core && node scripts/sync-rule-pages.mjs
npx vitest run packages/core/test/rule-pages.test.ts -t "EXTENSION_FILTER_CASE|LOCAL_DRIVE_PATH"
```

Expected: `wrote 121 summaries ...`; PASS.

- [ ] **Step 6: Pin the rule's findings**

Write `.superpowers/sdd/2026-10-13-v3-desktop-check/pin-extension.json`:

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
node .superpowers/sdd/2026-10-13-v3-rules-resolver/pin-m-zoo.mjs .superpowers/sdd/2026-10-13-v3-desktop-check/pin-extension.json
npx vitest run packages/core/test/rules-m.test.ts
```

Expected: `1 added, 49 findings, 15 rules`; PASS.

shelfmart filters its weather files on `.csv` twice. In `tests/expectations/shelfmart.report.json`, after the `DEFAULT_STEP_NAMES` array (its last entry is `"Weather Data"`), add the key so the map ends:

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
Expected: PASS.

- [ ] **Step 7: Move the counts by one rule**

121 rules, 39 built in, 16 Power Query rules, 15 of them pbiplint's own:

```bash
perl -pi -e 's/toBe\(120\)/toBe(121)/' packages/core/test/pack.test.ts
perl -pi -e 's/toBe\(120\)/toBe(121)/g; s/6 \+ 120\b/6 + 121/; s/"and 39 built into pbiplint\."/"and 40 built into pbiplint."/; s/"121 rules: 66/"122 rules: 66/; s/"120 rules: 66/"121 rules: 66/; s/and 38 built into pbiplint\./and 39 built into pbiplint./g; s/"94 rules: 66/"95 rules: 66/; s/and 23 built into pbiplint\./and 24 built into pbiplint./' packages/web/test/generate.test.ts
perl -pi -e 's/^(\s+)"excel-use-headers",\n/$1"excel-use-headers",\n$1"extension-filter-case",\n/' packages/web/test/generate.test.ts
perl -0pi -e 's/\b15(\s+)rules/16$1rules/g; s/Power Query rules, 15 of them/Power Query rules, 16 of them/g; s/\b14 of them pbiplint/15 of them pbiplint/g; s/\b14 of pbiplint/15 of pbiplint/g; s/\b120(\s+)rules in all, 38 of/121$1rules in all, 39 of/g' README.md packages/cli/README.md packages/core/README.md packages/web/content/about.md
git diff -- README.md packages/cli/README.md packages/core/README.md packages/web/content/about.md packages/web/test/generate.test.ts | grep '^[-+][^-+]'
```

Expected: only numbers change (15 to 16, 14 to 15, 120 to 121, 38 to 39; in `generate.test.ts` also the made-up inputs, 121 to 122, 94 to 95, 23 to 24, and "39" to "40"), and the slug list gains `"extension-filter-case"` after `"excel-use-headers"`.

- [ ] **Step 8: The budget, as Michael ruled**

In `packages/core/scripts/check-browser-bundle.mjs`, replace the tripwire comment and `const OWN_LIMIT_KB = 230;` with (240 being `<N>` from the ledger):

```js
// Tripwires for conscious growth, raised on purpose: the core's own code at 240 KB and the parser at
// 385 KB, measured at 376.0 KB on October 13, 2026; the parser moves only when its pinned version
// does. The core's budget was 210 KB (the v2 spec's amendment of October 4, 2026), then 230 KB for
// v3's first fifteen rules, and Michael raised it to 240 KB on October 13, 2026, when the Desktop
// check's two changes measured 230.1 KB (v3 spec, section 3.4). If a later change crosses it, stop
// and tell the coordinator.
const OWN_LIMIT_KB = 240;
```

```bash
npm run check:browser
node .superpowers/sdd/2026-10-13-v3-rules-resolver/bytes.mjs "power-query|resolve|summaries"
```

Expected: `core's own code 230.1 KB` and the script passes; `bytes.mjs` prints `power-query.ts` 16,597, `resolve.ts` 3,676, `rule-summaries.data.ts` about 25,820, and `core's own code 235654 bytes, 230.1 KB`. Over 230.4 KB: do not commit; report the lines. In section 3.4 of the spec, after the paragraph that begins "Amended October 13, 2026 (pull request 4)", add (with the measured figures if they differ):

```markdown
Amended October 13, 2026 (Michael, pull request 8): the core's own code budget is now 240 KB. With both answers of the Desktop check, `DYNAMIC_DATA_SOURCE`'s two shapes and `EXTENSION_FILTER_CASE`, `check:browser` measured 230.1 KB (235,654 bytes), 134 bytes over 230 KB (235,520 bytes). From 228.6 KB (234,093 bytes) at the 0.3.0 version bump: `power-query.ts` +1,202 bytes (the new rule, about 1,100, and `DYNAMIC_DATA_SOURCE`'s two new details, about 100), `rule-summaries.data.ts` +285 (the new page's first paragraph, 217, and `DYNAMIC_DATA_SOURCE`'s longer one, 68), and `resolve.ts` +74 (`origin`'s two classes). The rule alone, without the Desktop check's other change, measured 66 bytes over. As before, the budget is a tripwire for conscious growth, and crossing it stops the work for the coordinator. The parser's 385 KB budget is unchanged.
```

- [ ] **Step 9: Spec 9.10, and the corpus count**

```bash
npx tsx .superpowers/sdd/2026-10-13-v3-reader/corpus-diff.mts <base> <research-folder>/research-104 > "$CLAUDE_JOB_DIR/tmp/pr8-corpus-diff-2.txt" 2>&1
grep -E "models linted|^[+-][0-9]|ERROR" "$CLAUDE_JOB_DIR/tmp/pr8-corpus-diff-2.txt"
```

(`<base>` is Task 1's folder, from `progress.md`.) Expected: `+6 DYNAMIC_DATA_SOURCE` and `+2 EXTENSION_FILTER_CASE`, nothing else: a filter on `.xlsx` and one on `.gz`. Spot-check both: each is `[Extension] = "<text>"` in a `Table.SelectRows` over a folder listing, with no case folding. In section 9.10, after the Corpus bullet, add:

```markdown
- **Amended October 13, 2026:** [Michael's Desktop check](https://github.com/pbiplint/pbiplint/issues/78#issuecomment-6158143617) showed `Folder.Files` keeps an extension's case (`B.CSV` lists as `.CSV`), so the rule ships. Michael, the same day: "Leave .log alone." A filter on `.log`, in any case, is left alone, since the programs that write log files keep one case for them. Corpus: 54 filters in 6 models (6 repositories) as first written, 52 of them on `.log`; 2 in 2 models (2 repositories) after.
```

Section 10.3 already gives 121 rules, 39 built in, and needs no change. Write the counts and spot check into `progress.md`.

- [ ] **Step 10: Run every check, and commit**

```bash
npx prettier --write packages/core/src/rules/pbiplint/power-query.ts packages/core/test/rules-power-query.test.ts packages/core/src/rules/rule-summaries.data.ts packages/cli/src/rule-help.data.ts packages/web/src/results/rule-guidance.data.ts packages/core/test/pack.test.ts packages/web/test/generate.test.ts packages/core/scripts/check-browser-bundle.mjs
npm run lint
npm run typecheck
npm test
npm run check:browser
git add packages rules README.md tests/expectations docs/superpowers/specs
git commit -m "feat: EXTENSION_FILTER_CASE reports an extension filter that misses other cases

Michael's Desktop check showed Folder.Files keeps an extension's case, so
a filter on \".csv\" misses B.CSV: a warning on the comparison, unless it
folds case, a step changes the Extension column first, or the extension is
.log, which Michael ruled to leave alone. The core's budget moves from 230
to 240 KB at his ruling (spec 3.4): 230.1 KB with this pull request.
121 rules, 39 built in.

Part of #78.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: The corpus diff and the whole branch

**Files:** none committed; `progress.md` only.

- [ ] **Step 1: The corpus diff**

```bash
npx tsx .superpowers/sdd/2026-10-13-v3-reader/corpus-diff.mts <base> <research-folder>/research-104 > "$CLAUDE_JOB_DIR/tmp/pr8-corpus-diff-3.txt" 2>&1
grep -E "models linted|^[+-][0-9]|ERROR" "$CLAUDE_JOB_DIR/tmp/pr8-corpus-diff-3.txt"
npx tsx .superpowers/sdd/2026-10-13-v3-rules-resolver/rule-counts.mts <research-folder>/research-104 0 > "$CLAUDE_JOB_DIR/tmp/pr8-rule-counts-3.txt" 2>&1
grep -E "^(DYNAMIC_DATA_SOURCE|EXTENSION_FILTER_CASE):" "$CLAUDE_JOB_DIR/tmp/pr8-rule-counts-3.txt"
```

Expected: `1321 models linted`; `+6 DYNAMIC_DATA_SOURCE` and, on the ship path, `+2 EXTENSION_FILTER_CASE`; no other line. `DYNAMIC_DATA_SOURCE: 22 occurrences, 13 models, 10 repositories`; on the ship path `EXTENSION_FILTER_CASE: 2 occurrences, 2 models, 2 repositories`. **Any `-` line or other rule stops the task:** report it.

- [ ] **Step 2: Every check, the browser included**

```bash
npm run lint
npm run typecheck
npm test
npm run build
npm run check:browser
npm run test:e2e
```

Expected: all pass; the e2e suite in Chromium, Firefox, and WebKit with no retries and no count change (the sample's 280 findings do not move). Write each result into `progress.md`, with `check:browser`'s line.

---

### Task 4: The release notes draft (local; its extension entry depends on Task 2)

**Files:** `.superpowers/sdd/2026-10-13-release-0.3.0/release-notes.md` only (git-ignored; never posted, never committed).

- [ ] **Step 1: Read which path Task 2 took**

```bash
grep -n "^Task 2:" .superpowers/sdd/2026-10-13-v3-desktop-check/progress.md
```

- [ ] **Step 2: `DYNAMIC_DATA_SOURCE`'s description and count**

In the Errors list, replace the `DYNAMIC_DATA_SOURCE` line's text after the link with: ``: a data source whose address is read from a table's rows, built by a function call, chosen with `if ... then ... else`, or a custom function's parameter, which the Power BI service cannot refresh. The last two follow a check in Power BI Desktop, whose Data source settings flags both. (#231)``. In "What can change in your results", replace "the three errors found 16, 72, and 4 findings, in 8, 6, and 4 models" with "the three errors found 22, 72, and 4 findings, in 13, 6, and 4 models".

- [ ] **Step 3 (ship path): The extension entry and the counts**

Replace the whole `**[Placeholder, to keep or delete at release.]**` bullet with:

```markdown
    - [`EXTENSION_FILTER_CASE`](https://pbiplint.com/rules/extension-filter-case/): a filter on a folder's files that compares the extension as written, such as `.csv`, so a file saved as `.CSV` is left out. A filter on `.log` is left alone, since programs write their log files in one case.
```

Then: "**14 new Power Query rules,**" becomes "**15 new Power Query rules,**"; "The 14 new rules and Microsoft's" becomes "The 15 new rules and Microsoft's"; "make 15 Power Query rules, and pbiplint now has 120 rules in all, 38 of them built in" becomes "make 16 Power Query rules, and pbiplint now has 121 rules in all, 39 of them built in"; "**New findings** from the 14 new rules" becomes "from the 15 new rules". The new entry and the `DYNAMIC_DATA_SOURCE` change get this pull request's number when pb-coord opens it; write `Task 4: needs PR 8's number on two entries` into `progress.md`.

- [ ] **Step 3 (hold path): Delete the placeholder**

Delete the whole `**[Placeholder, to keep or delete at release.]**` bullet; every count stays as written (14 new rules, 15 Power Query rules, 120 in all, 38 built in).

- [ ] **Step 4: Check the draft**

```bash
grep -n "Placeholder, to keep" .superpowers/sdd/2026-10-13-release-0.3.0/release-notes.md
perl -CSD -ne 'print "$.: $_" if /\x{2014}/' .superpowers/sdd/2026-10-13-release-0.3.0/release-notes.md
grep -n "120 rules\|121 rules\|new Power Query rules\|new rules" .superpowers/sdd/2026-10-13-release-0.3.0/release-notes.md
```

Expected: no placeholder for this rule (the Action and Pipelines placeholder stays) and no em dash; the counts agree with each other and with Task 2's path. Write `Task 4: release notes updated (<ship | hold>)` into `progress.md`.

---

### Finish

One Opus review of the whole branch (`git diff origin/release/0.3.0...HEAD`) with this plan and spec sections 3.4, 8, 9.3, and 9.10. Then pb-coord pushes `v3/desktop-check` and opens a pull request into `release/0.3.0` titled `feat: the Desktop check's answers (v3 PR 8)`. Its body lists:

- What changed: `origin`'s `chosen` and `parameter`; `DYNAMIC_DATA_SOURCE` reports an address chosen with `if` (any `if`, an `error` branch and a literal condition included) and a custom function's parameter, with its page and spec 8 and 9.3, linking [the Desktop check](https://github.com/pbiplint/pbiplint/issues/78#issuecomment-6158143617). On the ship path: `EXTENSION_FILTER_CASE`, a warning, with `.log` left alone at Michael's ruling and the one constant a later exclusion changes, its page, shelfmart and m-zoo pins, and 121 rules, 39 built in, 16 on the Power Query layer.
- The budget: the core's own code from 228.6 KB to the last measurement (about 228.8 KB on the hold path; 230.1 KB on the ship path, with Michael's raise to 240 KB and spec 3.4's amendment and breakdown).
- The corpus diff: only additions, `DYNAMIC_DATA_SOURCE` +6 (22 in 13 models, 10 repositories: 5 custom functions' parameters and 1 `if`), `EXTENSION_FILTER_CASE` +2 on the ship path (54 as first written, 52 of them `.log`), each spot-checked. Counts only.
- For the release notes' "What can change in your results": `DYNAMIC_DATA_SOURCE` is an error, so its 6 new shapes can fail a gated pipeline at the default `--fail-on error`.

The body ends with:

```
🤖 Generated with [Claude Code](https://claude.com/claude-code)
```

CI and e2e must be green with no retries, and then pb-coord merges.

Execution: subagent-driven, one Opus 5.5 subagent per task with a fresh reviewer after each (pb-coord, October 13, 2026).
Task order: 1, 2 (by the ledger's budget line; held until Michael rules), 3, then 4.
