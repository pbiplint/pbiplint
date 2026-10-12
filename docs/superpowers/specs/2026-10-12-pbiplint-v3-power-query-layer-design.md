# pbiplint v3: the Power Query layer

Issue [#78](https://github.com/pbiplint/pbiplint/issues/78), milestone v3, released as 0.3.0. Written October 12, 2026, for Michael's review. Spec only: the plan follows his approval. Section 9.8 stays open for the rules Michael approves from the second research pass.

## 1. Sources and decisions

- **The issue.** #78's body, and its three comments: #117's four candidates (September 28, 2026), and Michael's decisions of October 12, 2026 ([issuecomment-6132410241](https://github.com/pbiplint/pbiplint/issues/78#issuecomment-6132410241) and [issuecomment-6133344515](https://github.com/pbiplint/pbiplint/issues/78#issuecomment-6133344515)).
- **The research.** `.superpowers/research/2026-10-12-78-m-rules/` (git-ignored): `report.md`, `corpus-summary.json`, and the throwaway `scripts/`. It ran Microsoft's parser over the #104 corpus: 1,321 models in 484 repositories, 1,213 models with M, 10,031 M expressions (7,556 partition sources, 2,459 shared expressions, 16 incremental refresh source expressions).
- **Decided by Michael, October 12, 2026:**
  - M is read with Microsoft's parser, `@microsoft/powerquery-parser`, not a reader of pbiplint's own.
  - The parser loads with the page, never when a folder is dropped.
  - No Tabular Editor parity for the new M rules: committed fixtures pin them.
  - The five rules in section 9 and their severities.
  - `MINIMIZE_POWER_QUERY_TRANSFORMATIONS` moves onto the parser as a recorded deviation.
  - M that does not parse is a `PARSE_ISSUE`.
  - Michael's design idea: messages name the query as Power Query's Queries pane shows it.
- **Michael's bar** (September 30, 2026): the smallest change that meets the boxes; complexity is a cost; a shape handled only when real files show it or Desktop writes it.
- **The deadline that shapes the order.** Tabular Editor CLI 0.7.1.2 stops working after October 31, 2026. The shipped rule's deviation (section 9.7) needs a fixture that `te` captures, so that capture is the first pull request (section 12).

## 2. What v3 is

v3 parses the M that the model layer already holds as text, and runs rules on the syntax tree. It adds no file family and no layer: every M finding lands on a `.tmdl` file and belongs to the model layer.

Not in v3:

- Evaluating M, folding analysis, privacy levels, or anything that needs the data, the engine, or a connector (the research's "Dropped" list).
- Dataflows, `.pbix`, and M outside a semantic model.
- A reader of TMDL shapes that Desktop never writes, beyond the one named in section 5.1.

## 3. Reading M

### 3.1 The parser

- **Package:** `@microsoft/powerquery-parser`, pinned to exactly `2.0.0` (no caret) in `packages/core/package.json`'s `dependencies`, the core's first runtime dependency. A newer version is a conscious bump: its size moves the budget in section 3.4, and its tree can move findings.
- **License:** MIT. NOTICE gains its entry, and those of its two dependencies, `grapheme-splitter` (MIT) and `performance-now` (MIT), as the vendored rulesets' are.
- **Call:** `TaskUtils.tryLexParse(DefaultSettings, text)`. `DefaultSettings` uses the locale `en-US`, so every message the parser writes is English.
- **Node versions.** The package declares `"engines": { "node": ">=22" }`; pbiplint supports `^20.19.0 || >=22.12.0`. Its compiled code uses none of Node 22's additions (searched on October 12, 2026: no `Object.groupBy`, `Promise.withResolvers`, `Array.fromAsync`, new `Set` methods, or `structuredClone`), and the CLI bundles it, so CLI users see nothing. CI's Node 20 leg proves it on every change. Code that installs `@pbiplint/core` itself on Node 20 sees npm's `EBADENGINE` warning, which installs anyway; the core README says so.

### 3.2 English only, and `performance-now`

Two build changes, the same in every bundler that ships the core:

- **English only.** `localization/templates.js` requires one JSON file per locale (42 of them). Every `localization/templates/template.<locale>.json` loads as `{}`; `template.json` (English) is untouched. This removes 380 KB minified and changes no message, since pbiplint only ever asks for `en-US`.
- **`performance-now`.** Its only reference to `process.` sits behind a `typeof process` guard, so it is safe in a browser, but the token fails `check:browser`. It resolves to a one-line module: `module.exports = () => performance.now();`.

Where the core is bundled, checked on October 12, 2026:

| Bundler | File | Ships to |
| --- | --- | --- |
| esbuild | `packages/core/scripts/check-browser-bundle.mjs` | Nothing; it is the check, and must measure what the site ships |
| Vite | `packages/web/vite.config.ts` | The site |
| esbuild | `packages/cli/build.mjs` | The CLI on npm, which is also the MCP server (`pbiplint mcp`, `packages/cli/src/mcp.ts`, which runs the CLI in process) |

The pipelines and the Claude plugin bundle nothing themselves: the GitHub Action and the Azure Pipelines task run the published CLI, and the plugin's `.mcpb` carries the published CLI's `dist/pbiplint.mjs` (`claude-plugin/scripts/build-mcpb.sh`, `mcpb/manifest.json`'s `server/pbiplint.mjs`). They get the change through the CLI. Vitest runs the core from source with the full package, which is fine: nothing ships from it.

One module, `packages/core/build/m-parser-build.mjs`, holds the two patterns and the stub's text, and exports an esbuild plugin and a Vite plugin made from them, so the three builds cannot drift. It is not part of the core's `src`, so it never reaches the browser or the npm `dist`.

### 3.3 Loading with the page

The core imports the parser statically, and nothing imports it with `import()`. The site's bundle therefore holds it, and the browser fetches it with the page's other files.

- [The Privacy Promise, How to check it](https://pbiplint.com/privacy/#check): "After the page's own files load, no request is made: not when you drop a folder, not when you click a button, not when you export a report."
- The same list's second check: "Load the page, then turn on airplane mode or unplug the network. Everything still works, because nothing needed the network."

Both stay true. The existing browser test "once the page has loaded, linting makes no request" (`packages/web/e2e/home.spec.ts:165`) lints a model with M from v3 on (section 11.7), so the parser runs under it.

### 3.4 Budgets

Measured on October 12, 2026 with esbuild 0.28.2, minified, browser platform, from the core's `src/index.ts` plus the parser (`entry.ts` re-exporting both), with both build changes. KB is 1,024 bytes, as `check:browser` prints it.

| What | Minified | gzip | Brotli |
| --- | --- | --- | --- |
| Core bundle today (`check:browser`) | 201.0 | 61.9 | |
| Core's own code inside the combined bundle (esbuild metafile, `bytesInOutput`) | 199.5 | | |
| Parser and its two dependencies inside it | 376.0 | | |
| Combined bundle | 578.3 | 133.8 | 109.3 |
| Combined bundle with all 42 languages (for comparison) | 958.1 | 188.8 | 152.8 |

On the live site (the research's measure), the home page goes from 193 KB to about 265 KB transferred.

`check:browser` gets two budgets, from esbuild's metafile, each a tripwire for conscious growth as the v2 spec's amendment of October 4, 2026 describes:

- **The core's own code: 210 KB**, unchanged. Everything in the bundle that is not the parser or its two dependencies. Measured at 199.5 KB, the same code the 201.0 KB total holds today less esbuild's module wrappers.
- **The parser: 385 KB.** The parser and its two dependencies. Measured at 376.0 KB. It moves only when the pinned version does, so 9 KB of room is enough.

It prints both sizes and the gzipped total, and keeps its forbidden-token check over the whole bundle. A third check fails if the bundle holds any non-English template (a German message string from `template.de-DE.json`, chosen in the plan), so the alias can never silently stop applying. No site-wide budget is added: the two above cover what the site ships.

Left out: the type system (`language/type`, about 71 KB of the parser) may be unused by plain parsing. Trimming it means patching Microsoft's module graph, so it waits until a budget needs it.

## 4. `lint()` returns a Promise

### 4.1 The parser has no synchronous path

- `TaskUtils.tryLex` is synchronous, but `tryParse` and `tryLexParse` return a `Promise` (`lib/powerquery-parser/task/taskUtils.d.ts` in 2.0.0).
- The parser itself is async throughout: 181 `await`s in the compiled library, from the cancellation token checks down (`lexer/lexer.js` calls `cancellationToken?.throwIfCancelled()`, and every parse function is `async`).
- It never waits on a timer or I/O (no `setTimeout`, `setImmediate`, or `queueMicrotask`), so a parse finishes within the microtasks of the call. JavaScript still gives no way to read an async function's result synchronously, so `lint()` (`packages/core/src/engine/lint.ts:95`) cannot stay synchronous and parse.

### 4.2 The choice: an async `lint()`

Two designs meet the box:

- **A pre-parse step** (`lint(files, { m: await parseM(files) })`): `lint()` stays synchronous, but every caller must remember the step. One that does not gets a run without the M rules, and from 0.3.0 that includes the shipped `MINIMIZE_POWER_QUERY_TRANSFORMATIONS`, so a caller's results change silently, and the engine needs a skip reason for it.
- **An async `lint()`** (`export async function lint(files, options): Promise<LintResult>`): one entry point that always parses. Every caller adds `await`.

v3 takes the async `lint()`. It is one entry point with no way to get a partial run, it needs no new option or skip reason, and the caller changes are mechanical. The parse runs inside `lint()` after `buildModel` and before `buildIndexes` (section 5.3). `runRules`, every rule's `check`, `rank`, `buildFacts`, `showOnly`, and every formatter stay synchronous: rules read the parsed M from the indexes.

The page cannot interleave two runs: since a parse waits on no timer or I/O, a run's promise settles before the browser handles another event, so no guard against a stale result is needed.

### 4.3 Every caller that changes

| Caller | Where | Change |
| --- | --- | --- |
| Site | `packages/web/src/main.ts:153`, in `run()` (`:138`) | `run()` becomes `async` and awaits `lint`; its two call sites (`:182` in `runEntries`, which also lints the bundled sample, and `:205` for a paste) call it with `void`. Its `try`/`catch` already covers a rejected promise once awaited. |
| CLI | `packages/cli/src/main.ts:120` | `await lint(...)`; `main()` is already `async` (`:59`). |
| MCP server | `packages/cli/src/mcp.ts` | None: its tools run the CLI's `main()` in process, which is already awaited (`mcp.ts:105`). |
| GitHub Action, Azure Pipelines task, Claude plugin | Their own repositories | None: they run the published CLI. Their next pin to 0.3.0 is an ordinary version bump. |
| Tests | 24 test files in `packages/core/test`, `packages/web/test`, and `packages/cli/test` | Each `lint(...)` call gets `await` and its test or `describe` body becomes `async` (about 150 calls). Where a `describe.each` body lints at collection time (`parity.test.ts:43`, `fixtures.test.ts:17`), the lint moves into a `beforeAll`. |
| Rule-page examples | `packages/core/test/rule-pages.test.ts` | Same; it lints each page's `tmdl fires` and `tmdl fixed` blocks. |

### 4.4 Is it breaking for 0.3.0?

- **For the CLI, the MCP server, the pipelines, the plugin, and the site:** no. Flags, exit codes, and output formats are unchanged; output gains a column where a finding has one (section 6.2).
- **For code that imports `@pbiplint/core`:** yes. `lint()` returns a Promise, and a caller that does not await it gets a Promise where it expected a result. Before 1.0, a minor release may break the API, so this ships as 0.3.0 with the change first under "For code that uses `@pbiplint/core`" in the release notes and the core README. `buildIndexes` gains an optional second argument (additive), and `SourceLocation` an optional `column` (additive).

## 5. Where M comes from

### 5.1 The queries

The M reader builds one list of queries per model, in model order:

- **Partition sources:** each partition whose `sourceType` is `m` (`Partition.source`, `packages/core/src/model/build.ts:142`). Its query is named as section 6.3 says.
- **Shared expressions:** each `expression` declaration (`NamedExpression`, `build.ts:407`). This covers parameters, functions, and queries that are not loaded. Its query is named after the expression.
- **Incremental refresh source expressions:** a table's `refreshPolicy` block keeps the query Desktop shows for the table as `sourceExpression`. The model does not read `refreshPolicy` today. 16 tables in the corpus have one; each also has exactly one M partition whose text is the same M (all 16, checked October 12, 2026, whitespace aside), since Desktop writes the query to both. So a `sourceExpression` is read only when its text, whitespace aside, differs from every M partition of its table; otherwise every finding on it would be reported twice. In the corpus that reads none of the 16, and a model the service has partitioned (`policyRange` partitions, no M) has only the `sourceExpression` to read.

Two further cases:

- **`expression 'Name'` with its M on an `expression = ...` line.** One corpus repository writes a shared expression as a declaration with no `=`, and its M as an `expression = ...` property line under it. `buildModel` reads the declaration's own value only (`build.ts:408`, `r.value ?? ""`), so the expression reads as empty today. It now falls back to that child line's value, and the query's `valueLine` is the child's. Whether Desktop loads this shape is unchecked; reading it can only help, and nothing else changes. The same repository writes measures and partition sources the same way; those are left as they are (section 14).
- **Empty M is skipped.** An expression whose text is empty after trimming is not parsed and has no finding of its own. In the corpus all 10 such expressions come from a TMDL problem upstream (M that is not indented, or indented with spaces), which TMDL's own `PARSE_ISSUE` already reports, except the `expression =` shape above, which is now read.

### 5.2 Changes to the model

- **`Table.refreshPolicy?: RefreshPolicy`**, optional as `calendars` is, so code built against 0.2.5 still compiles. `RefreshPolicy extends Named` with `sourceExpression?: string` (the M) and nothing else until a rule needs more: v3's rules read only the M. `node` keeps the TMDL block, so a later rule can read its other lines.
- **`NamedExpression.expression`** reads the `expression =` child line as section 5.1 says.
- `refreshPolicy` is a flag-style block under a table, which the child-type check skips (`packages/core/src/tmdl/child-types.ts:5`), so the parser needs no change.

### 5.3 The M index

`lint()` calls `readM(model, files)` after `buildModel`; it returns an `MIndex`, and `buildIndexes(project, m)` puts it at `Indexes.m`. When the model layer is absent, `Indexes.m` is the empty index, as the other model indexes are (`packages/core/src/index/build.ts:19`).

```ts
interface MQuery {
  kind: "partition" | "expression" | "refreshPolicy";
  /** The name Power Query's Queries pane shows (section 6.3). */
  name: string;
  /** The object a finding names: the partition, the shared expression, or the table. */
  owner: Partition | NamedExpression | Table;
  text: string;
  file: string;
  /** The TMDL line of the M's first line (TmdlNode.valueLine). */
  valueLine: number;
  /** Set when the M parsed. */
  ast?: Ast.TNode;
  nodeIdMapCollection?: NodeIdMap.Collection;
}

interface MIndex {
  queries: MQuery[];
  /** One per query that did not parse (section 7). */
  issues: MParseIssue[];
}
```

Helpers beside it, in `packages/core/src/m/`: `calls(q)` (each invocation of a named function, with its arguments), `locate(q, node)` (section 6.1), `stepOf(q, node)` (the outermost `let` step that holds the node, for messages), and the resolver (section 8). Rules import nothing from the parser except its node kinds and types. The index is not part of `LintResult`, so the trees are released after the run.

## 6. Locations and names

### 6.1 The TMDL line and column

TMDL keeps M line for line, and the research checked all 297,967 lines of the 10,020 expressions that parse: M line `n` (the parser's `lineNumber`, 0-based) is TMDL line `valueLine + n` (`TmdlNode.valueLine`, 1-based, `packages/core/src/tmdl/types.ts:20`), whether the M is inline after `=` (698), an indented block (8,331), or in a code fence (991). No line failed.

The column comes from the line's text. Every M line that is not blank ends where its TMDL line ends (the TMDL parser strips the block's indentation, or the fence's boundary, from the front, and trims an inline value; `packages/core/src/tmdl/parse.ts:121`, `:277`, and `:65`), so:

```
column (1-based) = tmdlLine.trimEnd().length − mLine.trimEnd().length + lineCodeUnit + 1
```

where `lineCodeUnit` is the parser's 0-based position in its line, in UTF-16 code units. That is the unit SARIF columns default to, and the one an editor's column counts in for any text without characters outside the Basic Multilingual Plane. `readM` gets the lint's files for this and splits a file's text into lines only when a finding or an issue on it needs a column, as `parseTmdl` splits it (BOM dropped, `\r\n` and `\r` read as line breaks). The location is the node's first token.

### 6.2 `SourceLocation.column`

`SourceLocation` (`packages/core/src/model/types.ts:3`) gains `column?: number`, 1-based. Only M findings set it, so no existing finding changes. Where it shows:

| Output | Today | With a column |
| --- | --- | --- |
| Text, Markdown, the site's table (`locationOf`, `packages/core/src/format/text.ts:36`; `packages/web/src/results/render.ts:497`) | `file:line` | `file:line:column`, the form editors and terminals link |
| JSON (`packages/core/src/format/json.ts:22`) | `file`, `line` | Also `column` |
| SARIF (`packages/core/src/format/sarif.ts:79`) | `region.startLine` | Also `region.startColumn` |

The site's table moves to `locationOf`, so it and the text format cannot differ.

### 6.3 Names as Power Query shows them

Power Query's Queries pane lists a table's query under the table's name; Desktop names the partition itself after the table with a suffix of its own, which the pane never shows. So every M rule's detail starts with the query and, where the finding is inside a step, the step, as the Queries pane and the Applied steps list show them:

- A partition's query is its table's name; when a table has more than one M partition, which Desktop does not write, the partition's name follows: `query 'Sales', partition 'Sales 2024'`.
- A shared expression's query is the expression's name; a `sourceExpression`'s, its table's.
- A step's name is the `let` variable's name, unquoted from M's `#"..."` form: `step 'Removed Duplicates'`.
- Names are written as pbiplint writes a table's (`tableRef`, `packages/core/src/model/names.ts`): in single quotes when they need them.

The finding's object stays what it is in every other rule: `objectType` `Partition` with the partition's name, or `NamedExpression` with the expression's, or `Table` for a `sourceExpression`. So `pbiplint.ignore` annotations, SARIF, and the JSON's object fields work as they do today. Example: `Sales-4f1c9 (query 'Sales', step 'Removed Duplicates': ...)`.

## 7. M that does not parse

Each query whose M the parser rejects is one `PARSE_ISSUE` finding, alongside the TMDL and PBIR ones (`packages/core/src/rules/parse-issue.ts`):

- **Where:** `PARSE_ISSUE.check` reads `ctx.indexes.m.issues` beside `model.files[].issues`. Each `MParseIssue` is a `ParseIssue` with a `column`, so the finding has the same shape as the others: `objectType` `File`, `objectName` the file, `layer` `model`.
- **Location:** the token the parser stopped at, when its error carries one (`foundToken` on the expected-token errors, `positionStart` on the others, and the grapheme position on a lex error), mapped as section 6.1 says; otherwise the M's first line.
- **Detail:** `M could not be parsed: <the parser's English message>: <the TMDL line>`, as the TMDL issues read (`${reason}: ${text.trim()}`, `parse-issue.ts:25`). The line is cut at 120 characters, as a JSON issue's is, since generated partitions hold lines of megabytes.
- **What it does not do:** it sets neither `canDropObjects` nor `canDropTableLine` (they describe TMDL lines, and an M error drops no object), and it never stops a rule. A query that does not parse has no tree, so no M rule reads it; the finding is how the user hears of that. A secret on a line that does not parse is not detected, and the quoted line may show it; one expression in 10,021 failed in the corpus.
- **Errors in the parser itself** (`ParseTaskCommonError`, or an exception) are reported the same way, with the error's message.
- **Corpus:** 1 finding in 1 model (a 2.4 MB generated partition whose text literals double their quotes, which Power BI would reject too).

`rules/parse-issue.md` says M is parsed too, and the copy that lists what PARSE_ISSUE covers follows.

## 8. The name-resolution helper

`DYNAMIC_DATA_SOURCE` must know where a value comes from, and an early pass that resolved only the outermost `let` flagged 35 correct `RelativePath` calls. `INCREMENTAL_REFRESH_RANGE_BOUNDS` and `HARDCODED_SECRET_IN_QUERY` use the same helper to tell the model's `RangeStart` parameter, or a header's value, from a local name.

`resolve(q, identifierNode)` walks up from the identifier through `nodeIdMapCollection.parentIdById` and returns the first binding of its name:

| Scope, innermost first | Binds | Result |
| --- | --- | --- |
| `each` | `_` | `row` |
| Function expression | Its parameters | `parameter` |
| `let` | All its variables, for every variable's value and the body (M's `let` is recursive) | `value`, the bound expression, with the query |
| Record expression | Its fields, for the other fields' values | `value` |
| The model's parameters | Shared expressions whose M is `<value> meta [IsParameterQuery = true, ...]` | `modelParameter`, with its value expression |
| The model's other queries | Shared expressions, then tables' queries, by name | `query`, with that query |
| Neither | Library names (any name with a `.`, such as `Text.Combine`), `#shared`, and names nothing defines | `library` or `unknown` |

`@name` resolves as `name`. A quoted identifier (`#"Sorted Rows"`) is compared unquoted.

On top of it, `origin(q, expression)` classifies a value, for the data source rule, as the worst of what it reaches:

- **`static`:** a literal; a model parameter; an `&` join, `if ... then ... else`, or other operator over static values; a name whose binding is static.
- **`unknown`:** a function's parameter (until Michael's Desktop check, section 9.3); a name that resolves to nothing; a field or item access on a record or list written as a literal; anything deeper than the cycle guard.
- **`row`:** `_`, a field or item access on anything else (`[url]` inside `each`, `Config{0}[BaseUrl]`).
- **`computed`:** a function call anywhere in the value, other than the parameter-wrapping cases the rules name.

Order: `static` < `unknown` < `computed` < `row`. Each name is followed once per classification (a visited set of node ids), so a cycle reads as `unknown`.

## 9. The rules

### 9.1 Common to all five

- **Layer:** `model`. **Scope:** `Partition`, `NamedExpression`, and `Table` (a `sourceExpression`). **Status:** `builtin`, through `pbiplintRule` (`packages/core/src/rules/pbiplint/define.ts`).
- **One finding per occurrence**, at its own TMDL line and column, so a query with two problems has two findings.
- **Detail:** query and step first (section 6.3), then what was found, in pbiplint's own words.
- **Pages:** from the rule-page template, in pbiplint's own words, with the fix route in Power BI Desktop's Power Query editor first (no third-party tool), then `scripts/sync-rule-pages.mjs`.
- **The proposed IDs** follow pbiplint's own (`HARDCODED_PERIOD_IN_DAX`, `NAME_WITHOUT_TRANSLATION`): a noun phrase in Power BI's words. Michael approves them with this spec.
- **Corpus counts** are the research's, counted per occurrence, models, and repositories, before the refinements this spec makes; the corpus diff (section 11.4) measures them again and the plan's notes record the final numbers.

### 9.2 `REMOVE_DUPLICATES_AFTER_SORT`

- **Name:** "Duplicates removed straight after a sort". **Category:** Error Prevention. **Severity:** warning.
- **Flags:** a `Table.Distinct` call with a second argument (the columns that decide what is a duplicate) whose table is a `Table.Sort` call, either written in place or a name the resolver binds to a `Table.Sort` call. Desktop's own steps make exactly this: **Sorted Rows**, then **Removed Duplicates**. Located on the `Table.Distinct` call.
- **Leaves alone:**
  - A `Table.Distinct` with no second argument: every column then decides, so the rows it chooses between are identical, and which one survives makes no difference.
  - A `Table.Buffer` between the two (`Table.Distinct(Table.Buffer(Table.Sort(...)), ...)`, or a buffered step), which is Microsoft's second workaround.
  - A sort that is not the table argument's own value, such as one several steps earlier with other steps between.
- **Detail:** `query 'Customers', step 'Removed Duplicates': duplicates are removed straight after the sort in step 'Sorted Rows'`.
- **Sources:**
  - Microsoft, [Common authoring issues, Preserving sort](https://learn.microsoft.com/en-us/power-query/common-issues#preserving-sort): "sort order isn't guaranteed to be preserved through aggregations (such as `Table.Group`), merges (such as `Table.NestedJoin`), or duplicate removal (such as `Table.Distinct`)."
  - Microsoft, [Working with duplicate values, Remove duplicate rows in Power Query](https://learn.microsoft.com/en-us/power-query/working-with-duplicates#remove-duplicate-rows-in-power-query): "Power Query doesn't guarantee that it keeps the first instance in a set of duplicates when it removes duplicates."
  - Ken Puls, [Keep The Most Recent Entry](https://excelguru.ca/keep-the-most-recent-entry/); Matt Allington, [Remove Duplicates and Keep the Last Record with Power Query](https://exceleratorbi.com.au/remove-duplicates-keep-last-record-power-query/); Rick de Groot, [How to Remove Duplicates in Power Query](https://gorilla.bi/power-query/removing-duplicates#inconsistent-results). The research's report quotes each.
- **Fix route,** Microsoft's three ([Preserving sort](https://learn.microsoft.com/en-us/power-query/common-issues#preserving-sort)), in Desktop: **Transform data**, select the query, and in **Applied steps** find **Removed Duplicates** after **Sorted Rows**. Then either rank and filter ("instead of using `Table.Distinct`, you could order by the column(s) containing the duplicate values, rank based on a tie-breaker column (such as `modified_date`), and then filter to keep just the rank 1 rows"), or buffer the sorted table ("Buffer the data (using `Table.Buffer`) before applying the downstream operation. In some cases, this operation causes the downstream operation to preserve the buffered sort order."). The page leads with ranking, since Microsoft hedges the buffer ("In some cases"), and says the buffer holds the whole table in memory.
- **Fixtures:** in m-zoo (section 11.1): a **Sorted Rows** then **Removed Duplicates** pair (fires); the same written in one expression (fires); with `Table.Buffer` between (does not); `Table.Distinct` with no columns after a sort (does not); a sort two steps before the distinct (does not).
- **Corpus:** 19 occurrences in 10 models (8 repositories) before the one-argument exception, which can only lower it.

### 9.3 `DYNAMIC_DATA_SOURCE`

- **Name:** "Data source the service can't refresh". **Category:** Error Prevention. **Severity:** warning.
- **Flags:** a call to a data source function whose first argument, the address, has origin `row` or `computed` (section 8). The functions: `Web.Contents`, `OData.Feed`, `File.Contents`, `Folder.Files`, `Folder.Contents`, `SharePoint.Files`, `SharePoint.Contents`, `SharePoint.Tables`, `AzureStorage.Blobs`, `AzureStorage.DataLake`, `Sql.Database`, `Sql.Databases`, `Oracle.Database`, `PostgreSQL.Database`, `MySQL.Database`, `Snowflake.Databases`, `AnalysisServices.Database`, `AnalysisServices.Databases`, `Odbc.DataSource`, `Odbc.Query`, `OleDb.DataSource`, `OleDb.Query`, `Databricks.Catalogs`, `DB2.Database`, `Teradata.Database`, `SapHana.Database`. Located on the call.
- **Leaves alone:**
  - Literals, model parameters, `&` joins of them, and names that resolve to them, through any depth of `let`.
  - `Web.Contents`' `RelativePath` and `Query` options, whatever they hold: only the first argument is read, since these options are Microsoft's route for a dynamic request to a static base address.
  - **Until Michael's Desktop check:** an address chosen with `if ... then ... else` over a parameter (it classifies as `static`), and an address that is a custom function's parameter (it classifies as `unknown`). If Desktop's **Data source settings** shows either as dynamic, the plan for that change moves it to `computed` or `row`, with a fixture, and the page says so.
  - Names nothing in the model defines (`unknown`): 141 occurrences in 4 corpus models, mostly in files pbiplint cannot fully read.
- **Detail:** `query 'Orders', step 'Added Custom': File.Contents's path is read from the rows` (for `row`), or `... is built by a function call` (for `computed`).
- **Sources:**
  - Microsoft, [Refresh and dynamic data sources](https://learn.microsoft.com/en-us/power-bi/connect-data/refresh-data#refresh-and-dynamic-data-sources): "In most cases, Power BI semantic models that use dynamic data sources can't be refreshed in the Power BI service. There are a few exceptions in which dynamic data sources can be refreshed in the Power BI service, such as when using the RelativePath and Query options with the Web.Contents M function. Queries that reference Power Query parameters can also be refreshed."
  - Microsoft, [Web.Contents, Example 1](https://learn.microsoft.com/en-us/powerquery-m/web-contents#example-1): "These options can be used to dynamically query a static base URL."
  - Chris Webb, [Web.Contents, Text Concatenation And Dataset Refresh Errors](https://blog.crossjoin.co.uk/2022/11/28/web-contents-text-concatenation-and-dataset-refresh-errors-in-power-bi-power-query/) (November 28, 2022), for function calls and `&`; and [Web.Contents(), M Functions And Dataset Refresh Errors In Power BI](https://blog.crossjoin.co.uk/2016/08/23/web-contents-m-functions-and-dataset-refresh-errors-in-power-bi/) (August 23, 2016). The research's report quotes both.
- **Fix route** in Desktop: Microsoft's own check first, "open the **Data source settings** dialog in **Power Query Editor**, and then select **Data sources in current file**. In the window that appears, look for the warning message" ([Refresh and dynamic data sources](https://learn.microsoft.com/en-us/power-bi/connect-data/refresh-data#refresh-and-dynamic-data-sources)). Then, for a web source, keep the base address a literal or a parameter and move the varying part into `RelativePath` and `Query` in the step's formula; for files and folders, point the source at a parameter (**Manage Parameters**, [Use parameters](https://learn.microsoft.com/en-us/power-query/best-practices#use-parameters)) or a folder read once with **Folder** and combined, rather than a path per row.
- **Fixtures:** a `Table.AddColumn(..., each Web.Contents([url]))` (row, fires); `File.Contents(Text.Combine({Folder, "a.csv"}))` (computed, fires); `Web.Contents(Base, [RelativePath = "orders/" & Text.From(Id)])` with `Base` a parameter (does not); `Web.Contents(Base & "/v1")` (does not); a nested `let` that binds the address to a literal two scopes up (does not); the two shapes awaiting the Desktop check (do not, until it says otherwise).
- **Corpus:** 22 occurrences in 13 models (10 repositories) as the research counted them; leaving out its 4 function-parameter occurrences leaves 18 (13 row, 5 computed) in at most 13 models.

### 9.4 `INCREMENTAL_REFRESH_RANGE_BOUNDS`

- **Name:** "Incremental refresh filter counts a boundary row twice or never". **Category:** Error Prevention. **Severity:** warning.
- **Flags:** a query that compares something with both of the model's `RangeStart` and `RangeEnd` parameters (as the resolver finds them, so a local name that shadows one does not count), where:
  - both comparisons include their bound (`>= RangeStart` and `<= RangeEnd`): located on the `RangeEnd` comparison; or
  - neither does (`> RangeStart` and `< RangeEnd`): located on the `RangeStart` comparison.

  Comparisons are read as "column, operator, parameter" whichever side the parameter is on (`RangeStart <= [Date]` is `[Date] >= RangeStart`), and a parameter wrapped in a call still counts (`DateKey(RangeStart)`, Microsoft's own integer-key pattern). A query with comparisons of both kinds on one parameter is left alone, since pbiplint cannot tell which one filters.
- **Leaves alone:** a query that compares with only one of the two, and one with exactly one inclusive bound.
- **Detail:** `query 'Sales', step 'Filtered Rows': both RangeStart and RangeEnd include the boundary, so a row on it lands in two partitions`, or `... neither ..., so a row on it lands in none`.
- **Source:** Microsoft, [Configure incremental refresh, Filter data](https://learn.microsoft.com/en-us/power-bi/connect-data/incremental-refresh-configure#filter-data): "Verify queries have an equal to (=) on either RangeStart or RangeEnd, but not both. If the equal to (=) exists on both parameters, a row could satisfy the conditions for two partitions, which could lead to duplicate data in the model." The exclusive case follows from the same page's instruction, "if you selected **is after** in the first condition, then choose **is before or equal to**".
- **Fix route** in Desktop: **Transform data**, select the query, and select the filter step in **Applied steps** (its gear opens **Filter Rows**); make the conditions **is after or equal to** RangeStart and **is before** RangeEnd, as the page above walks through.
- **Fixtures:** both inclusive (fires); both exclusive (fires); `>=` and `<` (does not); `DateKey(RangeStart)` with `>` and `<=` (does not); a reversed operand order that is both inclusive (fires); a `let` variable named `RangeEnd` that shadows the parameter (does not); the same M in a table's `refreshPolicy` and its partition (fires once).
- **Corpus:** 4 occurrences in 4 models (4 repositories), all one widely copied sample; 15 models filter on the range at all. None exclude both bounds.

### 9.5 `HARDCODED_SECRET_IN_QUERY`

- **Name:** "Secret written into a query". **Category:** Error Prevention. **Severity:** error.
- **Flags** a text literal that is clearly a credential:
  - The value of a header named `Authorization`, `x-api-key`, `api-key`, `apikey`, `Ocp-Apim-Subscription-Key`, `x-auth-token`, or `x-functions-key` (any case) in the `Headers` record of a `Web.Contents` or `OData.Feed` options record. A value built with `&` is read as its literals joined, with a leading `Bearer ` or `Basic ` not counted.
  - A field of that options record's `Query` record named like a key: `api_key`, `apikey`, `key`, `access_token`, `token`, `client_secret`, `secret`, `password`, `code`, `subscription-key`.
  - A query-string parameter of a URL literal with one of those names, or `sig` or `signature`.
  - A literal that starts `Bearer ` followed by 16 or more token characters, anywhere.
  - `Password=` or `Pwd=` in the connection string of `Odbc.DataSource`, `Odbc.Query`, `OleDb.DataSource`, or `OleDb.Query`.
  - Where the header or field's value is a name rather than a literal, the resolver follows it to a `let` variable or a model parameter whose value is a text literal, and the finding is on that literal, once however many queries use it.
- **Leaves alone:** values shorter than 8 characters; placeholders (`<...>`, `{...}`, `xxx...`, `***`, `your...`, `placeholder`, `null`, `none`, `test`, `demo`); an `ApiKeyName` option, which names the key rather than holding it; anything in a comment, since a comment is not a literal (Microsoft's parser keeps comments apart).
- **Masking.** No output prints any part of the value: not the value, a prefix, a suffix, its length, or a hash of it. The rule guarantees this by construction rather than by scrubbing output:
  - The finding's detail names only where the credential is: `query 'API', step 'Source': the Authorization header in Web.Contents holds a credential written into the query (value not shown)`. The words come from the rule, plus the header or field name, which is M's own key, never the literal.
  - The location points at the literal's first character, so a reader can go to it in their own copy, and no format copies source text: text, JSON, SARIF (`message.text` is the object name, the rule name, and the detail; there is no `snippet` or `contextRegion`, `packages/core/src/format/sarif.ts:71`), Markdown, the site's table, its exported report and the copy for an AI assistant (`packages/web/src/results/export.ts`, built from the same findings), and the MCP server's lint tool (the CLI's JSON or quiet text).
  - GitHub's code scanning shows a SARIF result's lines from the repository's own copy of the file, which already holds the secret; nothing pbiplint uploads adds it.
  - The guard test in section 11.3 holds all of this.
- **Sources:**
  - Microsoft, [Web.Contents, Example 3](https://learn.microsoft.com/en-us/powerquery-m/web-contents#example-3): "Instead of hard-coding the secret key in M (which would pose a security risk), the key can be provided securely by specifying its name (not its value) in M, choosing Web API authentication, and entering the key value as part of the Web API credential."
  - Microsoft, [Web.Contents, About](https://learn.microsoft.com/en-us/powerquery-m/web-contents#about), on `ApiKeyName`: "The actual key value is provided in the credential."
  - Microsoft, [Power BI Desktop projects](https://learn.microsoft.com/en-us/power-bi/developer/projects/projects-overview), on why it matters in a PBIP: "Source control ready - Open text files, designed for seamless integration with Git, enabling version history and team collaboration."
- **Fix route** in Desktop: in the query's **Source** step, remove the key from the URL, the header, or the `Query` record, and add `ApiKeyName = "<the key parameter's name>"` to the options; Desktop then asks for a credential, where **Web API** takes the key. A key in a header that `ApiKeyName` cannot carry needs a gateway connection or a custom connector that stores it, which the page names as the fallback (the research's Disagreements). In every case, rotate the key: it is in the repository's history.
- **Fixtures:** an `Authorization` header with a fake token (fires); an `api_key` in a URL (fires); a `Query` record's `apikey` (fires); an ODBC connection string with `Pwd=` (fires); a header value that is a parameter holding a literal (fires once, on the parameter); `ApiKeyName` (does not); a placeholder `<your key>` (does not); a key in a comment (does not). Every fake value is built so it matches no real provider's key format (no `sk-`, `ghp_`, `AKIA`, or JWT shape), so GitHub's push protection and secret scanning stay quiet.
- **Corpus:** 60 occurrences in 2 models (2 repositories): 57 `Authorization` headers and 3 URL keys, before the parameter-literal shape, which the corpus diff counts.

### 9.6 `LOCAL_DRIVE_PATH`

- **Name:** "Path on a local drive". **Category:** Error Prevention. **Severity:** warning.
- **Flags:** a text literal that starts with a drive letter path (`C:\` or `C:/`, any letter), anywhere in a query or a parameter's value. Located on the literal.
- **Leaves alone:** network paths (`\\server\share`), since an organization's gateway is the intended route for them (Michael, October 12, 2026); URLs, including `file:` URLs; paths in comments; relative paths; a path built at run time (`DYNAMIC_DATA_SOURCE` is the rule for that).
- **Detail:** `query 'Sales', step 'Source': the path is on a local drive (C:)`. Only the drive is named: a path under `C:\Users\` carries the user's account name, which an export need not repeat.
- **Sources:**
  - Microsoft, [Connecting to on-premises data sources](https://learn.microsoft.com/en-us/power-bi/connect-data/refresh-data#connecting-to-on-premises-data-sources): "If your semantic model uses a data source that Power BI can't access over a direct network connection, you must configure a gateway connection for this semantic model before you can enable a refresh schedule or perform an on-demand data refresh."
  - Microsoft, [Refresh semantic models created from local Power BI Desktop files](https://learn.microsoft.com/en-us/power-bi/connect-data/refresh-desktop-file-local-drive#on-premises-data-gateway): "A gateway must be installed and running for Power BI to connect to on-premises data sources and refresh the semantic model."
  - Microsoft, [Use parameters](https://learn.microsoft.com/en-us/power-query/best-practices#use-parameters): "Parameters make queries easier to update because you can change a value in one location instead of editing each query that uses it."
- **Fix route** in Desktop: put the file in SharePoint or OneDrive for work or school and connect to it there (**Get data**, **SharePoint folder** or **Web** with the file's address), then repoint the query's **Source** step; or keep the file where it is and refresh through a gateway installed on that machine. Either way, keep the folder in a parameter (**Manage Parameters**) so it changes in one place.
- **Fixtures:** `File.Contents("C:\Demo\Data\Sales.csv")` (fires; the project's sanitized path, as every fixture writes it); a parameter whose value is `"D:/Exports/"` (fires once, on the parameter); `\\fileserver\share\Sales.csv` (does not); a path in a comment (does not).
- **Corpus:** the research's 1,120 path literals less its 37 network paths: 1,083 literals in at most 303 models (206 repositories). Most are tutorial projects reading from `C:\Users\<user>\Downloads` or a synced OneDrive folder.
- **The sample fires it.** messy-sales reads its CSV files from `C:\Demo\Data\`, so its count rises by one warning per such literal, and the release's Sample and Smoke boxes apply, as #117's did. That is a fair finding on a demo: the sample cannot refresh in the service as it stands.

### 9.7 `MINIMIZE_POWER_QUERY_TRANSFORMATIONS` on the parser

The shipped rule (`packages/core/src/rules/microsoft-bpa/tables.ts:106`) matches 14 substrings in a partition's M. It moves onto the parser, recorded as a deviation from Tabular Editor:

- **Reads:** each partition whose source type is M, as today, and reports it when its tree holds an identifier that names `Table.Combine`, `Table.Join`, `Table.NestedJoin`, `Table.AddColumn`, `Table.Group`, `Table.Sort`, `Table.Pivot`, `Table.Unpivot`, `Table.UnpivotOtherColumns`, `Table.Distinct`, `Value.NativeQuery`, `OleDb.Query`, or `Odbc.Query` (called, or passed as a function value), or a `Query` field in the options record of a database connector (the native query option of `Sql.Database`, `Sql.Databases`, `Oracle.Database`, `PostgreSQL.Database`, `MySQL.Database`, `Snowflake.Databases`, `DB2.Database`, `Teradata.Database`, `SapHana.Database`, `AnalysisServices.Database`, `GoogleBigQuery.Database`). `Web.Contents`' own `Query` option is not a native query and does not count.
- **What changes:** a native query is found however it is written: a lowercase `select`, a leading comment or line break, `WITH`, `DECLARE`, `EXEC`, or spaces around `=`. A name inside a comment or a text literal no longer counts, and `Table.Group (` with a space now does. The finding itself is unchanged: same object, location, and detail (`table 'Sales'`).
- **Why:** Tabular Editor's literal `[Query="SELECT` misses 402 corpus partitions with native queries (215 of them lowercase `select`); the parser's reading also drops 1 partition whose only match was in a comment.
- **Recorded:** in m-zoo's Microsoft capture (`deviations` and `ours`), shown by a partition with `[Query = "select ...` (pbiplint reports it, Tabular Editor does not) and one whose only `Table.Group(` is in a comment (Tabular Editor reports it, pbiplint does not). The page's Quirks lose the four lines about substring matching and state the deviation in a sentence, as other pages do; the count of deviations in the READMEs, the About page, and `bpaRule`'s doc comment follows.
- **A parse failure:** a partition whose M does not parse is not reported by this rule (it has a `PARSE_ISSUE`), where Tabular Editor's text match may report it. No fixture shows this, since a captured fixture must parse cleanly (`parity.test.ts:50`); a unit test covers it and the page says it.

### 9.8 Rules from the second research pass (open)

pb-coord is running a second research pass (service refresh blockers such as Python and R scripts and retired functions; robustness to source changes; locale; connector options). Each rule Michael approves from it is added here in the shape of sections 9.2 to 9.6, with its fixtures added to a fixture of its own if m-zoo's captures have been made (section 11.1).

## 10. The site

- **No new `SITE_LAYERS` gate.** The gate (`packages/web/src/build/pages.ts:289`) publishes pages by the layer their findings land in, and every M finding lands on a `.tmdl` file in the model layer, which the site already publishes. The pages carry `layer: model`. The site deploys the core from main on merge, so each rule's code and its page arrive in the same pull request, and nothing half-built shows on the site.
- **Rule pages:** five new pages from the template, and changes to `parse-issue.md` and `minimize-power-query-transformations.md`. Each new page's example is a `tmdl fires` and `tmdl fixed` pair that `rule-pages.test.ts` lints, as for every page, so each example must parse and fire.
- **The rules index** counts its rules itself. The rule counts in the root, CLI, and core READMEs and the About page move from 106 rules (24 built in) to 111 (29 built in), plus any from section 9.8. The About page and the READMEs name Power Query as a part pbiplint reads.
- **Privacy page:** no change. Its statements hold as written (section 3.3).

A suggestion, not in scope: a "Power Query" filter on the rules index, once the M rules number more than a handful.

## 11. Testing

### 11.1 Fixtures

- **`tests/fixtures/m-zoo.SemanticModel`**, hand-written and sanitized: no real names, servers, or paths, and the project's `C:\Demo\Data\` convention for file paths (the Desktop checks rewrite it for the Windows VM). It holds:
  - Every fixture shape sections 9.2 to 9.7 name, each in its own table or shared expression, named for what it shows.
  - All three ways TMDL stores M (inline, block, fence), an `expression 'Name'` written with an `expression =` line, and a table with a `refreshPolicy` whose `sourceExpression` matches its partition.
  - `RangeStart` and `RangeEnd` parameters, and a parameter that holds a fake key.
  - Nothing unparsable: the parity test requires a captured fixture to read with no `PARSE_ISSUE`.
- **Captured before October 31, 2026,** all three ways with `te` 0.7.1.2 (Microsoft's ruleset, the built-in rules, and the survey's files) and added to `CAPTURED` in `scripts/test/te-captures.test.mjs`, as te3-zoo was. After that date it cannot change; a later shape goes in a new fixture whose expectations are pbiplint's own.
- **The new rules' expectations** are pinned in `tests/expectations/pbiplint/m-zoo.json` (rule, object, line, column, detail; a folder of its own, since `parity.test.ts:23` reads every `.json` file at the top level as a Tabular Editor capture), read by a new `packages/core/test/rules-m.test.ts`. The M rules have no Tabular Editor oracle (Michael, October 12, 2026), so the file is pbiplint's own, reviewed by hand once.
- **Unit tests** for what a fixture cannot hold: M that does not parse (`PARSE_ISSUE` with line and column, the 120-character cut), a lex error, a `sourceExpression` that differs from its partition, the resolver's scopes one by one, and the column formula on each storage style with tabs and spaces.

### 11.2 Existing fixtures

The committed fixtures with M (`tvw-baseline`, `udf-sales`, `shelfmart`, `rule-zoo`, the project fixtures, and messy-sales) gain `LOCAL_DRIVE_PATH` findings on their `C:\Demo\Data\` paths and any other new findings the corpus diff predicts. Their expectation files for Microsoft's rules do not change, since those hold only ported rules. The tests that count a fixture's or the sample's findings move with them. The project fixtures' check that every `File.Contents` path is under `C:\Demo\Data\` (`fixtures.test.ts:34`) stays as it is.

### 11.3 The secret guard

One test, `packages/core/test/secret-masking.test.ts` with a web and a CLI counterpart, lints m-zoo and asserts that none of its fake secret values, nor any 8-character run of them, appears in:

- `formatText`, `formatJson`, `formatSarif`, and `formatMarkdown`;
- the site's rendered results and its exported report, with the preamble for an AI assistant;
- the CLI's output in every format, and the MCP server's lint tool, through `packages/cli/test`.

It reads the values from the fixture, so a new fake secret is covered when it is added.

### 11.4 The corpus diff

A throwaway script in the plan's folder (not committed; the corpus is not pbiplint's to commit) lints every corpus model with main and with the branch, and compares each finding by rule, object, file, line, and detail:

- **Every existing finding is unchanged,** except `MINIMIZE_POWER_QUERY_TRANSFORMATIONS`, whose difference must be exactly the deviation: partitions gained only through native queries or spacing, partitions lost only through matches in comments or literals (expected: about 402 gained, 1 lost).
- **New findings** are counted per rule in occurrences, models, and repositories, and compared with sections 9.2 to 9.6; a difference is explained in the plan's notes before the rule's pull request merges.
- **`PARSE_ISSUE`** gains exactly 1 finding.
- Run once per pull request that adds or moves an M rule.

### 11.5 The parse-time guard

The largest corpus model parses in 680 ms (Node, Michael's Mac, research of October 12, 2026): its partitions embed their data as M literals, the largest 4.2 MB. A script, `scripts/make-big-model.mjs`, writes a model of the same shape and size into `tests/generated/` (git-ignored, as `make-big-report.mjs` does for reports): the same number of M partitions and the same total M size, filled with generated `#table` literals. Two guards read it:

- **Node:** `packages/core/test` lints it, and the whole lint must finish within a budget set in the plan at three times the time measured on CI's runners, so a slow runner does not flake it but a parser that grows quadratic does.
- **Browser:** the e2e suite drops it and holds the lint to the same two-second budget the 300-visual report has, if the plan's measurement in Chromium on CI shows room; otherwise to a budget set the same way as Node's.

### 11.6 Bundle checks

- `check:browser`: the two budgets, the English-only check, and the forbidden tokens (section 3.4).
- `check:network` (`packages/cli/scripts/check-network.mjs`): unchanged, and must pass with the parser in the CLI bundle.
- `check:pack`: the core's `package.json` names the parser at exactly `2.0.0`, and the CLI's packed bundle holds no non-English template.
- The site build: the same English-only check on the built home JavaScript.
- `test:bundle` and the MCP smoke test (`packages/cli/scripts/smoke-mcp.mjs`) run the built CLI on the sample, which now has M rules firing.

### 11.7 Browser

- The e2e test "once the page has loaded, linting makes no request" (`packages/web/e2e/home.spec.ts:165`) lints a model with M and still sees no request.
- A results test shows an M finding's `file:line:column` and its query and step.
- The axe scan covers the new pages through the existing site checks.

## 12. Delivery

Pull requests in order, each with CI and e2e green and one Opus review of the branch:

1. **The m-zoo fixture and its captures** (needs `te`, so by October 31, 2026). The fixture, its three captures, `CAPTURED`, and nothing else: on main it changes no result, since today's text-match rule is what Tabular Editor runs, so the capture records no deviation yet.
2. **The reader.** The parser pinned; the two build changes in all three bundlers; the budgets and bundle checks; `lint()` async with every caller; `readM`, `Indexes.m`, `refreshPolicy`, the `expression =` fallback; locations with columns in every output; `PARSE_ISSUE` for M; the resolver with its unit tests; `make-big-model.mjs` and both parse-time guards. No new rule, so the corpus diff must show only the 1 new `PARSE_ISSUE`.
3. **The shipped rule on the parser**, with the deviation in m-zoo's capture, the page, and the deviation counts.
4. **`REMOVE_DUPLICATES_AFTER_SORT`, `INCREMENTAL_REFRESH_RANGE_BOUNDS`, and `LOCAL_DRIVE_PATH`**, the three that need little of the resolver, with their pages, `tests/expectations/pbiplint/m-zoo.json`, and the sample and fixture counts.
5. **`DYNAMIC_DATA_SOURCE` and `HARDCODED_SECRET_IN_QUERY`**, with their pages and the secret guard (section 11.3).
6. **Rules from section 9.8,** if Michael approves any, one pull request per rule or per close family.

Pull requests 4 and 5 are independent and may go in either order. Then:

- **Release 0.3.0**, from the coordinator, with its release issue's boxes: the notes lead with the Power Query layer and the five rules, list what can change in results (new findings, the sample's count, the shipped rule's deviation, columns in locations), and say under "For code that uses `@pbiplint/core`" that `lint()` now returns a Promise (section 4.4). The Action, the Azure Pipelines task, and the Claude plugin follow with their pins.
- **#70**, the Fabric Stack catalog submission, once 0.3.0 is on npm and live at pbiplint.com.

## 13. For Michael

- **Approve this spec,** including the five proposed IDs (section 9). Pull request 1 needs approval of section 11.1 in time to capture before October 31, 2026; the rest of the spec can still change after that.
- **The Desktop check** for `DYNAMIC_DATA_SOURCE` (from the research, still open): two tiny queries in the Windows VM, one choosing a web address with `if ... then ... else` over a parameter and one passing it as a custom function's parameter; for each, whether **Data source settings**, **Data sources in current file**, shows the dynamic source warning. Until then the rule leaves both alone (section 9.3).

## 14. Left out

- **The `expression =` shape for measures and partition sources** (`source` with `type: m` and `expression =` lines). Seen in the same single corpus repository (8 files) as the shared-expression case, a shape Desktop does not write; it is a TMDL reader question for #144's class of guards, not v3's.
- **Unknown identifiers** (`True` for `true`, a deleted query): later, with #144's guards for AI-written files, as the research recommends.
- **`STEPS_AFTER_NATIVE_QUERY`:** dropped by pb-coord, since the shipped rule already flags every native-query partition.
- **Everything the research dropped**, for the reasons it gives: default step names, fixed server names, `Table.Buffer`, `DateTime.LocalNow`, TODO comments, referenced queries, and the rest.
- **Trimming the parser's type system** (section 3.4).
