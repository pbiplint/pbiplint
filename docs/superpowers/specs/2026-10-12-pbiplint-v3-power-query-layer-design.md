# pbiplint v3: the Power Query layer

Issue [#78](https://github.com/pbiplint/pbiplint/issues/78), milestone v3, released as 0.3.0. Written October 12, 2026; updated October 13, 2026 with the 15 rules Michael approved that day. **Approved by Michael on October 13, 2026** ([issuecomment-6144834846](https://github.com/pbiplint/pbiplint/issues/78#issuecomment-6144834846)), with two notes folded in: Power Query as a rule family of its own (section 10.1) and one public release from one branch (section 12). Plans follow, one per pull request.

## 1. Sources and decisions

- **The issue.** #78's body, and its three comments: #117's four candidates (September 28, 2026), and Michael's decisions of October 12, 2026 ([issuecomment-6132410241](https://github.com/pbiplint/pbiplint/issues/78#issuecomment-6132410241) and [issuecomment-6133344515](https://github.com/pbiplint/pbiplint/issues/78#issuecomment-6133344515)).
- **The research.** `.superpowers/research/2026-10-12-78-m-rules/` (git-ignored): `report.md`, `corpus-summary.json`, and the throwaway `scripts/`. It ran Microsoft's parser over the #104 corpus: 1,321 models in 484 repositories, 1,213 models with M, 10,031 M expressions (7,556 partition sources, 2,459 shared expressions, 16 incremental refresh source expressions).
- **Decided by Michael, October 12, 2026:**
  - M is read with Microsoft's parser, `@microsoft/powerquery-parser`, not a reader of pbiplint's own.
  - The parser loads with the page, never when a folder is dropped.
  - No Tabular Editor parity for the new M rules: committed fixtures pin them.
  - `MINIMIZE_POWER_QUERY_TRANSFORMATIONS` moves onto the parser as a recorded deviation.
  - M that does not parse is a `PARSE_ISSUE`.
  - Michael's design idea: messages name the query as Power Query's Queries pane shows it.
- **Decided by Michael, October 13, 2026:**
  - The rules ([issuecomment-6143569646](https://github.com/pbiplint/pbiplint/issues/78#issuecomment-6143569646)): 15 new rules and their severities, drawn from both research passes (`report.md` and `report-2.md` in the research folder), with the severity test (section 9.1).
  - The spec approved ([issuecomment-6144834846](https://github.com/pbiplint/pbiplint/issues/78#issuecomment-6144834846)), with two notes. "Let's add the filter on the rules index for 'Power Query' like there is for model and report" (section 10.1). And "I want to release the Power Query (i.e., v0.3.0) in one release to the public, meaning our first v0.3.x release should be in one branch merged into main once when ready for release, including bug fixes and, possibly, other various fixes" (section 12).
- **Michael's bar** (September 30, 2026): the smallest change that meets the boxes; complexity is a cost; a shape handled only when real files show it or Desktop writes it.
- **The deadline that shapes the order.** Tabular Editor CLI 0.7.1.2 stops working after October 31, 2026. The shipped rule's deviation (section 9.7) needs a fixture that `te` captures, so that capture is the first pull request (section 12).

## 2. What v3 is

v3 parses the M that the model layer already holds as text, and runs rules on the syntax tree. It adds no file family: every M finding lands on a `.tmdl` file, and the finding's own `layer`, the file family a reader opens to fix it, stays `model`. It does add a rule family: the Power Query rules carry the rule layer `powerquery`, shown as "Power Query" wherever the site and the outputs name a rule's layer, so a reader can find and filter them as they can the model and report rules (section 10.1).

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

- **For the CLI, the MCP server, the pipelines, the plugin, and the site:** no. Flags and exit codes are unchanged. The output formats keep their shape and gain two things: a column where a finding has one (section 6.2), and a fourth rule layer value, `powerquery` (section 10.1). Under "What can change in your results", the notes say that `MINIMIZE_POWER_QUERY_TRANSFORMATIONS`' `rule.layer` moves from `model` to `powerquery` in JSON, SARIF (`properties.layer`), `list_rules`, and the text tag, so a script that selects model rules by `rule.layer == "model"` stops seeing it; its findings' own `layer` stays `model`. The same list says that the text format's columns shift by three characters on every line, because the layer tag's fixed width grows to fit `[powerquery]` (section 10.1), so a script that cuts the text format by column must move with it. Neither the GitHub Action nor the Azure Pipelines task reads `rule.layer` (searched October 13, 2026: only their SARIF test fixtures mention it).
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

The finding's object stays what it is in every other rule: `objectType` `Partition` with the partition's name, or `NamedExpression` with the expression's, or `Table` for a `sourceExpression`. So `pbiplint.ignore` annotations, SARIF, and the JSON's object fields work as they do today. Example: `Sales-4f1c9 (query 'Sales', step 'Removed Duplicates': ...)`. The finding's `layer` is `model`, its file family; its rule's layer is `powerquery`, which is what the site's tag and the results filter show (section 10.1).

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

### 9.1 Common to all fifteen

Michael approved 15 new rules on October 13, 2026 ([issuecomment-6143569646](https://github.com/pbiplint/pbiplint/issues/78#issuecomment-6143569646)), with their severities:

| Severity | Rules |
| --- | --- |
| Error | `DYNAMIC_DATA_SOURCE` (9.3), `INCREMENTAL_REFRESH_RANGE_BOUNDS` (9.4), `HARDCODED_SECRET_IN_QUERY` (9.5) |
| Warning | `SORT_NOT_HELD_FOR_REMOVE_DUPLICATES` (9.2), `LOCAL_DRIVE_PATH` (9.6), `PRIVACY_LEVELS_IGNORED` (9.8), `SCRIPT_IN_QUERY` (9.9), `EXTENSION_FILTER_CASE` (9.10, if the Desktop check keeps it), `KEEP_FIRST_ROWS_LEFT_IN` (9.11) |
| Info | `EXCEL_USE_HEADERS` (9.12), `DEFAULT_STEP_NAMES` (9.13), `HARDCODED_SERVER_NAME` (9.14), `ODBC_WHERE_CONNECTOR_EXISTS` (9.15), `FIXED_DATE_IN_ROW_FILTER` (9.16), `LEGACY_EXCEL_FILE` (9.17) |

- **The severity test** (Michael, October 13, 2026). An error fails a pipeline by default (`--fail-on error`), so an error means the query text alone shows a broken model or unreliable data, and nobody writes it on purpose. A warning is likely trouble that a setting can fix, or that might be deliberate. Info is an improvement worth making.
- **Layer:** `powerquery` (section 10.1), for all fifteen and for the shipped `MINIMIZE_POWER_QUERY_TRANSFORMATIONS`; `PRIVACY_LEVELS_IGNORED` reads no M but is a Power Query setting, so a reader filtering on Power Query expects it. Their findings' `layer` is `model`. **Scope:** `Partition`, `NamedExpression`, and `Table` (a `sourceExpression`), except `PRIVACY_LEVELS_IGNORED`, which reports the `Model`. **Status:** `builtin`, through `pbiplintRule` (`packages/core/src/rules/pbiplint/define.ts`).
- **One finding per occurrence**, at its own TMDL line and column, so a query with two problems has two findings. `DEFAULT_STEP_NAMES` and `HARDCODED_SERVER_NAME` are the exceptions: each reports once per query, on its first occurrence, with the count in the detail, since a common shape reported per step or per call would bury everything else.
- **Detail:** query and step first (section 6.3), then what was found, in pbiplint's own words.
- **Pages:** from the rule-page template, in pbiplint's own words, with the fix route in Power BI Desktop's Power Query editor first (no third-party tool), then `scripts/sync-rule-pages.mjs`.
- **The proposed IDs** follow pbiplint's own (`HARDCODED_PERIOD_IN_DAX`, `NAME_WITHOUT_TRANSLATION`): a noun phrase in Power BI's words. Michael approves them with this spec.
- **Corpus counts** are the research's, counted per occurrence, models, and repositories, before the refinements this spec makes; the corpus diff (section 11.4) measures them again and the plan's notes record the final numbers.

### 9.2 `SORT_NOT_HELD_FOR_REMOVE_DUPLICATES`

- **Name:** "Sort may not decide which duplicate is kept". **Category:** Error Prevention. **Severity:** warning.
- **The framing** (Michael, October 13, 2026): sorting first is the intended pattern for choosing which row survives, newest first so the latest record is kept. The fault is that nothing holds the order. The page and the detail say so, and never tell the reader not to sort.
- **Flags:** a `Table.Distinct` call with a second argument (the columns that decide what is a duplicate) whose table is a `Table.Sort` call, either written in place or a name the resolver binds to a `Table.Sort` call. Desktop's own steps make exactly this: **Sorted Rows**, then **Removed Duplicates**. Located on the `Table.Distinct` call.
- **Leaves alone:**
  - A sort held by `Table.Buffer` (`Table.Distinct(Table.Buffer(Table.Sort(...)), ...)`, or a buffered step between), which is the fix the page leads with.
  - A `Table.Distinct` with no second argument: every column then decides, so the rows it chooses between are identical, and which one survives makes no difference.
  - A sort that is not the table argument's own value, such as one several steps earlier with other steps between.
- **Detail:** `query 'Customers', step 'Removed Duplicates': nothing holds the order of step 'Sorted Rows', so the sort may not decide which duplicate is kept`.
- **Sources:**
  - Microsoft, [Common authoring issues, Preserving sort](https://learn.microsoft.com/en-us/power-query/common-issues#preserving-sort): "if you sort a sales table so that each store's largest sale is shown first, you might expect that doing a "Remove duplicates" operation returns only the top sale for each store. And this operation might, in fact, appear to work. However, this behavior isn't guaranteed." And: "sort order isn't guaranteed to be preserved through aggregations (such as `Table.Group`), merges (such as `Table.NestedJoin`), or duplicate removal (such as `Table.Distinct`)."
  - Microsoft, [Working with duplicate values, Remove duplicate rows in Power Query](https://learn.microsoft.com/en-us/power-query/working-with-duplicates#remove-duplicate-rows-in-power-query): "Power Query doesn't guarantee that it keeps the first instance in a set of duplicates when it removes duplicates."
  - Leila Gharani, [Power Query Remove Duplicates Keeps the Wrong Record](https://www.xelplus.com/power-query-keep-latest-record/) (XelPlus, June 9, 2026), the current treatment of exactly this shape: "[wrap your sort step in Table.Buffer()](https://www.xelplus.com/power-query-keep-latest-record/#h-the-one-line-fix-table-buffer)", and for a result that does not depend on order, "[Group By the columns that define your group, then pull the row with the latest timestamp from each.](https://www.xelplus.com/power-query-keep-latest-record/#h-the-sturdier-fix-group-by-to-keep-the-latest-record)"
  - Ken Puls, [Keep The Most Recent Entry](https://excelguru.ca/keep-the-most-recent-entry/); Matt Allington, [Remove Duplicates and Keep the Last Record with Power Query](https://exceleratorbi.com.au/remove-duplicates-keep-last-record-power-query/); Rick de Groot, [How to Remove Duplicates in Power Query](https://gorilla.bi/power-query/removing-duplicates#inconsistent-results). The research's report quotes each; all three use `Table.Buffer`.
  - Imke Feldmann's Fabric community blog post on the same shape could not be read (the page refused access on October 12 and 13, 2026), so it is not cited.
- **Fix route** in Desktop: **Transform data**, select the query, and in **Applied steps** select **Sorted Rows**. Keep the sort and hold it: in the formula bar, wrap the step's formula in `Table.Buffer( ... )`, which is Microsoft's second suggestion ("Buffer the data (using `Table.Buffer`) before applying the downstream operation. In some cases, this operation causes the downstream operation to preserve the buffered sort order.", [Preserving sort](https://learn.microsoft.com/en-us/power-query/common-issues#preserving-sort)). The page says the buffer holds the whole table in memory, and that Microsoft hedges it ("In some cases"). For a result that does not depend on order at all, replace the two steps with **Group By** on the key columns, keeping the row with the latest date, or with Microsoft's rank ("order by the column(s) containing the duplicate values, rank based on a tie-breaker column (such as `modified_date`), and then filter to keep just the rank 1 rows").
- **Fixtures:** in m-zoo (section 11.1): a **Sorted Rows** then **Removed Duplicates** pair (fires); the same written in one expression (fires); with `Table.Buffer` around the sort (does not); `Table.Distinct` with no columns after a sort (does not); a sort two steps before the distinct (does not).
- **Corpus:** 19 occurrences in 10 models (8 repositories) before the one-argument exception, which can only lower it.

### 9.3 `DYNAMIC_DATA_SOURCE`

- **Name:** "Data source the service can't refresh". **Category:** Error Prevention. **Severity:** error (Michael, October 13, 2026): the published model cannot refresh, and no gateway or setting fixes it, only rewriting the query. The rule flags only the certain shapes, so an error is always right.
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

- **Name:** "Incremental refresh filter counts a boundary row twice or never". **Category:** Error Prevention. **Severity:** error (Michael, October 13, 2026): the text alone shows rows duplicated or lost, and nobody writes it on purpose.
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
  - Microsoft, [Web.Contents, Example 3](https://learn.microsoft.com/en-us/powerquery-m/web-contents#example-3), the reason not to write the key into M: "Instead of hard-coding the secret key in M (which would pose a security risk), the key can be provided securely by specifying its name (not its value) in M, choosing Web API authentication, and entering the key value as part of the Web API credential."
  - Microsoft, [Power BI Desktop projects](https://learn.microsoft.com/en-us/power-bi/developer/projects/projects-overview), on why it matters in a PBIP: "Source control ready - Open text files, designed for seamless integration with Git, enabling version history and team collaboration."
  - Microsoft, [Power Query Web connector, Summary](https://learn.microsoft.com/en-us/power-query/connectors/web/web#summary), on the limit of Example 3's route: "The **Web API** authentication type is available in Power BI Desktop and Power Query in Excel, but isn't supported in the Power BI service. Consider this limitation when planning to publish a semantic model or dataflow that uses this authentication type."
  - Microsoft, [Use custom data connectors with the on-premises data gateway](https://learn.microsoft.com/en-us/power-bi/connect-data/service-gateway-custom-connectors): "If you build reports in Power BI Desktop that use custom data connectors, you can use an on-premises data gateway to refresh those reports in the Power BI service."
- **Fix route,** in this order:
  1. **Rotate the key and take it out of the PBIP.** It is in the repository's history, so removing the line does not unpublish it: revoke it with the provider first, then, in Desktop, open **Transform data**, select the query, and delete the key from the **Source** step's URL, header, or `Query` record (or from the parameter that holds it, in **Manage Parameters**).
  2. **For a model that is published, use a route that refreshes in the service.** Where the source accepts it, sign in with an organizational account: when Desktop asks for credentials, choose **Organizational account**, which the Web connector lists among its authentication kinds for `Web.Contents` ([Summary](https://learn.microsoft.com/en-us/power-query/connectors/web/web#summary)). Where the source takes only a key, a custom connector that holds the credential, refreshed through an on-premises data gateway (quoted above), is Microsoft's documented route; the page links the gateway article and does not describe building a connector.
  3. **For a model that is never published,** `ApiKeyName` with a **Web API** credential keeps the key out of the files, as Example 3 shows; the page quotes the Web connector's note that the service does not support it, so nobody relies on it for a published model.
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
- **Network paths on the page, no rule:** the page's When to ignore it, where it says network paths are left alone, adds one sentence with Microsoft's advice for them, from the [Excel connector, Limitations and considerations](https://learn.microsoft.com/en-us/power-query/connectors/excel#limitations-and-considerations): "When connecting to an Excel workbook on a network share, use the fully qualified domain name (FQDN) path (for example, `\\ServerName.domain.com\FolderName\File.xlsx`) instead of a short server name. Using a short name can cause refresh failures after publishing to the Power BI service." The rule does not check it (the second research pass counted 27 short-name literals in 6 models).
- **Fixtures:** `File.Contents("C:\Demo\Data\Sales.csv")` (fires; the project's sanitized path, as every fixture writes it); a parameter whose value is `"D:/Exports/"` (fires once, on the parameter); `\\fileserver\share\Sales.csv` (does not); a path in a comment (does not).
- **Corpus:** the research's 1,120 path literals less its 37 network paths: 1,083 literals in at most 303 models (206 repositories). Most are tutorial projects reading from `C:\Users\<user>\Downloads` or a synced OneDrive folder.
- **The sample fires it.** messy-sales reads its CSV files from `C:\Demo\Data\`, so its count rises by one warning per such literal, and the release's Sample and Smoke boxes apply, as #117's did. That is a fair finding on a demo: the sample cannot refresh in the service as it stands.

### 9.7 `MINIMIZE_POWER_QUERY_TRANSFORMATIONS` on the parser

The shipped rule (`packages/core/src/rules/microsoft-bpa/tables.ts:106`) matches 14 substrings in a partition's M. It moves onto the parser, recorded as a deviation from Tabular Editor:

- **Reads:** each partition whose source type is M, as today, and reports it when its tree holds an identifier that names `Table.Combine`, `Table.Join`, `Table.NestedJoin`, `Table.AddColumn`, `Table.Group`, `Table.Sort`, `Table.Pivot`, `Table.Unpivot`, `Table.UnpivotOtherColumns`, `Table.Distinct`, `Value.NativeQuery`, `OleDb.Query`, or `Odbc.Query` (called, or passed as a function value), or a `Query` field in the options record of a database connector (the native query option of `Sql.Database`, `Sql.Databases`, `Oracle.Database`, `PostgreSQL.Database`, `MySQL.Database`, `Snowflake.Databases`, `DB2.Database`, `Teradata.Database`, `SapHana.Database`, `GoogleBigQuery.Database`). `Web.Contents`' own `Query` option is not a native query and does not count, and neither does `AnalysisServices.Database`'s: it holds DAX, MDX, or a DMV query. Tabular Editor's `[Query="SELECT` match also reports a DMV query given to `AnalysisServices.Database`, such as `[Query="SELECT * FROM $System.TMSCHEMA_TABLES"]`, and pbiplint does not: a recorded deviation, stated on the page and in m-zoo's capture.
- **What changes:** a native query is found however it is written: a lowercase `select`, a leading comment or line break, `WITH`, `DECLARE`, `EXEC`, or spaces around `=`. A name inside a comment or a text literal no longer counts, and `Table.Group (` with a space now does. The finding itself is unchanged: same object, location, and detail (`table 'Sales'`).
- **Why:** Tabular Editor's literal `[Query="SELECT` misses 402 corpus partitions with native queries (215 of them lowercase `select`); the parser's reading also drops 1 partition whose only match was in a comment. The research counted a `Query` field in any record, so the corpus diff measures the gain again with the connector list as written here (section 11.4).
- **Recorded:** in m-zoo's Microsoft capture (`deviations` and `ours`), shown by a partition with `[Query = "select ...` (pbiplint reports it, Tabular Editor does not) and one whose only `Table.Group(` is in a comment (Tabular Editor reports it, pbiplint does not). The page's Quirks lose the four lines about substring matching and state the deviation in a sentence, as other pages do; the count of deviations in the READMEs, the About page, and `bpaRule`'s doc comment follows.
- **A parse failure:** a partition whose M does not parse is not reported by this rule (it has a `PARSE_ISSUE`), where Tabular Editor's text match may report it. No fixture shows this, since a captured fixture must parse cleanly (`parity.test.ts:50`); a unit test covers it and the page says it.

### 9.8 `PRIVACY_LEVELS_IGNORED`

- **Name:** "Privacy levels ignored for this file". **Category:** Error Prevention. **Severity:** warning (a setting fixes it, and it may be deliberate in a model that is never published). **Scope:** `Model`.
- **Flags:** a `model.tmdl` whose `dataAccessOptions` block holds `fastCombine`, which is how a PBIP saves the file's **Ignore the Privacy Levels and potentially improve performance** option. One finding on the model, located on the `fastCombine` line.
- **Leaves alone:** the block's other flags, `legacyRedirects` and `returnErrorValuesAsNull`, which Desktop writes by default.
- **No parser needed.** Today the TMDL parser keeps the block as a flag under `model` with its flags as children (`packages/core/src/tmdl/parse.ts:526` describes such blocks), and `buildModel` exposes only `props.dataaccessoptions = true`. `Model` gains `dataAccessOptions?: { flags: string[]; location: SourceLocation }`, the block's flags lowercased with each one's line, optional as `Table.calendars` is.
- **Detail:** `Ignore the Privacy Levels is on for this file; the service does not honor it`.
- **Sources:**
  - Microsoft, [Privacy levels, Set the privacy level options](https://learn.microsoft.com/en-us/power-query/privacy-levels#set-the-privacy-level-options): "**Ignore the Privacy Levels and potentially improve performance** doesn't work for semantic models. Reports created in Power BI Desktop with this setting and published to the Power BI service don't adhere to the setting." And: "Enabling Fast Combine by selecting **Ignore the Privacy levels and potentially improve performance** could expose sensitive or confidential data to an unauthorized person."
- **Fix route** in Desktop, from [Set the privacy level options in Power BI Desktop](https://learn.microsoft.com/en-us/power-query/privacy-levels#set-the-privacy-level-options-in-power-bi-desktop): **File**, **Options and settings**, **Options**, then **Privacy** under **Current file**, and choose **Combine data according to your Privacy Level settings for each source**. Then refresh in Desktop: a query that only worked because privacy levels were ignored now shows the firewall error the service would have shown, and the page links Microsoft's [Behind the scenes of the Data Privacy Firewall](https://learn.microsoft.com/en-us/power-query/data-privacy-firewall) for restructuring it.
- **Fixtures:** m-zoo's `model.tmdl` carries a `dataAccessOptions` block with `fastCombine`, `legacyRedirects`, and `returnErrorValuesAsNull` (fires once). A unit test covers a block without `fastCombine` (does not). The other fixtures have no `fastCombine` and stay silent.
- **Corpus:** 44 models in 29 repositories; 22 of them call two or more kinds of data source, where a firewall error is most likely once the setting stops applying.

### 9.9 `SCRIPT_IN_QUERY`

- **Name:** "Python or R script in a query". **Category:** Error Prevention. **Severity:** warning (a personal gateway can refresh it, so it may be deliberate).
- **Flags:** a `Python.Execute` or `R.Execute` call, located on the call.
- **Leaves alone:** Python and R visuals, which live in the report, not in M.
- **Detail:** `query 'Scores', step 'Run Python script': Python.Execute refreshes only through a personal gateway on a machine with Python installed`.
- **Sources:**
  - Microsoft, [Use R in Power Query Editor, Considerations and limitations](https://learn.microsoft.com/en-us/power-bi/transform-model/desktop-r-in-query-editor#considerations-and-limitations): "You can't use an enterprise gateway to refresh semantic models containing R scripts in Power Query."
  - Microsoft, [Use Python in Power BI Power Query Editor, Create visuals from Python script data](https://learn.microsoft.com/en-us/power-bi/transform-model/desktop-python-in-query-editor#create-visuals-from-python-script-data): "You need a Personal Gateway installed on the machine where the file is located, and where Python is installed."
- **Fix route** in Desktop: **Transform data**, select the query, and find the **Run Python script** or **Run R script** step in **Applied steps**. Move what the script does upstream (a view, or a notebook in Fabric) or rebuild it with Power Query's own steps, then delete the script step. Where the script must stay, the page says plainly that refresh then depends on a personal gateway on one machine, and links Microsoft's [personal gateway](https://learn.microsoft.com/en-us/power-bi/connect-data/service-gateway-personal-mode) page.
- **Fixtures:** one `Python.Execute` step and one `R.Execute` step, with short scripts that read nothing (both fire).
- **Corpus:** 7 calls (4 Python, 3 R) in 3 models (3 repositories).

### 9.10 `EXTENSION_FILTER_CASE`

- **Name:** "File extension filter misses other cases". **Category:** Error Prevention. **Severity:** warning.
- **Conditional:** kept only if Michael's Windows VM check shows that `Folder.Files` keeps an extension's case (a folder holding `a.csv` and `B.CSV`; read the **Extension** column). If it lowercases, the rule is dropped before its pull request, its page is not written, and its m-zoo shapes stay as harmless data.
- **Flags:** a `Table.SelectRows` over a file listing (`Folder.Files`, `Folder.Contents`, `SharePoint.Files`, `SharePoint.Contents`, followed back through earlier steps with the resolver) whose condition compares `[Extension]` with a text literal, with no case folding. Located on the comparison.
- **Leaves alone:** a condition with `Text.Lower`, `Text.Upper`, or `Comparer.OrdinalIgnoreCase`; a listing whose **Extension** column an earlier step lowercases or uppercases; a listing the resolver cannot follow back to one of the four functions (10 corpus filters over lakehouse and storage listings).
- **Detail:** `query 'Sales Files', step 'Filtered Rows': the extension test matches ".csv" but not ".CSV"`.
- **Sources:**
  - Microsoft, [SharePoint.Files, Example 2](https://learn.microsoft.com/en-us/powerquery-m/sharepoint-files#example-2), whose filter is `Comparer.OrdinalIgnoreCase([Extension], ".xlsx") = 0`: "The extension comparison is case-insensitive, so it also matches `.XLSX`."
  - Gašper Kamenšek, [Making Importing from Folder in Power Query (or Power BI) Bulletproof](https://excelunplugged.com/2018/02/13/making-importing-from-folder-in-power-query-or-power-bi-bulletproof/) (February 13, 2018), as the second research pass quotes it.
- **Fix route** in Desktop: **Transform data**, select the query, select the filter step, and in the formula bar change `[Extension] = ".csv"` to `Comparer.OrdinalIgnoreCase([Extension], ".csv") = 0`, as Microsoft's example writes it. Without editing the formula: before the filter, select the **Extension** column and choose **Transform**, **Format**, **lowercase**.
- **Fixtures:** `each [Extension] = ".csv"` over `Folder.Files` (fires, if kept); the same with `Comparer.OrdinalIgnoreCase` (does not); the same after a lowercase step (does not).
- **Corpus:** 54 filters over `Folder.Files` in at most 12 models (10 repositories).

### 9.11 `KEEP_FIRST_ROWS_LEFT_IN`

- **Name:** "Keep First Rows left in a loaded query". **Category:** Error Prevention. **Severity:** warning (it may be deliberate).
- **Flags:** a `Table.FirstN` call whose count is a number literal greater than 1, in a query that loads (a partition, or a `sourceExpression` that is read). Located on the call.
- **Leaves alone:**
  - A `Table.FirstN` whose table is a `Table.Sort`, or a `Table.Buffer` of one, written in place or bound by the resolver: a top N after a sort is deliberate.
  - A count of 0 or 1, which the corpus shows on purpose (115 of 117 calls: an empty table to keep a schema, or one row of settings).
  - A count that is not a literal, a call inside an `each` or a function (a top N per group), and shared expressions that do not load.
- **Detail:** `query 'Sales', step 'Kept First Rows': only the first 1000 rows load`.
- **Source:** Microsoft, [Best practices, Use a data subset while developing a query](https://learn.microsoft.com/en-us/power-query/best-practices#use-a-data-subset-while-developing-a-query): "After you add all the required steps, remove the **Keep First Rows** step so the completed query processes the full data set."
- **Fix route** in Desktop: **Transform data**, select the query, and in **Applied steps** delete **Kept First Rows** (the **X** beside it, [Applied steps, Delete step](https://learn.microsoft.com/en-us/power-query/applied-steps#delete-step)). If the top rows are meant, sort first so the step reads as a top N.
- **Fixtures:** `Table.FirstN(Source, 1000)` in a partition (fires); after a `Table.Sort` (does not); `Table.FirstN(Source, 0)` (does not); inside `Table.Group(..., each Table.FirstN(_, 3))` (does not).
- **Corpus:** 2 calls in 1 model (1 repository).

### 9.12 `EXCEL_USE_HEADERS`

- **Name:** "Excel headers promoted by the workbook reader". **Category:** Error Prevention. **Severity:** info.
- **Flags:** `Excel.Workbook` with `useHeaders` set to `true`, as its second argument or as `UseHeaders = true` in its options record. Located on the call.
- **Leaves alone:** Desktop's own `Excel.Workbook(File.Contents(...), null, true)`, which leaves `useHeaders` unset and sets `delayTypes` (914 of the corpus's 999 calls).
- **Detail:** `query 'Budget', step 'Source': Excel.Workbook promotes headers in the refreshing machine's culture`.
- **Source:** Microsoft, [Excel connector, Limitations and considerations](https://learn.microsoft.com/en-us/power-query/connectors/excel#limitations-and-considerations): "The Excel.Workbook `useHeaders` option converts numbers and dates to text using the current culture, and thus behaves differently when run in environments with different operating system cultures set. We recommend using Table.PromoteHeaders instead."
- **Fix route** in Desktop: **Transform data**, select the query, select **Source**, and in the formula bar change the second argument to `null`; then select the sheet's step and choose **Home**, **Use First Row as Headers**, which writes `Table.PromoteHeaders`.
- **Fixtures:** `Excel.Workbook(..., true)` (fires); `[UseHeaders = true]` (fires); Desktop's `null, true` (does not).
- **Corpus:** 26 calls in 21 models (19 repositories), 14 distinct expressions, most from one widely copied demo.

### 9.13 `DEFAULT_STEP_NAMES`

- **Name:** "Steps keep Power Query's default names". **Category:** Maintenance. **Severity:** info. **Once per query.**
- **Flags:** a query whose outermost `let` has steps named as Power BI Desktop names them by default: **Changed Type**, **Changed Type with Locale**, **Promoted Headers**, **Removed Columns**, **Removed Other Columns**, **Renamed Columns**, **Reordered Columns**, **Filtered Rows**, **Sorted Rows**, **Removed Duplicates**, **Grouped Rows**, **Merged Queries**, **Appended Query**, **Added Custom**, **Added Conditional Column**, **Added Index**, **Duplicated Column**, **Replaced Value**, **Pivoted Column**, **Unpivoted Columns**, **Unpivoted Other Columns**, **Split Column by Delimiter**, **Removed Top Rows**, **Removed Bottom Rows**, **Removed Blank Rows**, **Removed Alternate Rows**, **Removed Errors**, **Kept First Rows**, **Kept Range of Rows**, **Trimmed Text**, **Cleaned Text**, **Uppercased Text**, **Lowercased Text**, **Capitalized Each Word**, **Transposed Table**, **Filled Down**, **Filled Up**, **Invoke Custom Function**, **Custom**, and names starting **Expanded**, **Inserted**, **Extracted**, or **Calculated**, each with or without a number after it (`Added Custom1`). One finding per query, located on the first such step.
- **Leaves alone:** **Source** and **Navigation**, which name what they are; parameters and functions; a step a person has renamed to anything else. A Desktop in another language writes other default names; the rule reads only the English ones, and the page says so.
- **Detail:** `query 'Sales': 6 steps keep default names, such as 'Changed Type' and 'Added Custom1'` (at most two names).
- **Source:** Microsoft, [Best practices, Document your work](https://learn.microsoft.com/en-us/power-query/best-practices#document-your-work): "Document a Power Query solution by giving steps, queries, and groups meaningful names and descriptions. These details make the purpose of each transformation easier to understand and maintain."
- **Fix route** in Desktop: **Transform data**, select the query, and in **Applied steps** right-click each step and choose **Rename** ([Applied steps, Rename step](https://learn.microsoft.com/en-us/power-query/applied-steps#rename-step)), or **Properties** to add a description as well ([Edit step names and their descriptions](https://learn.microsoft.com/en-us/power-query/applied-steps#edit-step-names-and-their-descriptions)).
- **Fixtures:** a partition with **Changed Type** and **Added Custom1** (fires once, on **Changed Type**); a partition whose steps are renamed (does not); a query with only **Source** and **Navigation** (does not). Most m-zoo queries keep Desktop's names on purpose, since the other rules' shapes are written as Desktop writes them, so this rule fires on many m-zoo queries; `tests/expectations/pbiplint/m-zoo.json` records each.
- **Corpus:** 3,274 partition queries in 517 models (247 repositories), counted on partitions only; shared expressions add some, which the corpus diff counts. The sample fires it too (messy-sales keeps Desktop's names), so its count rises.

### 9.14 `HARDCODED_SERVER_NAME`

- **Name:** "Server name written into the query". **Category:** Maintenance. **Severity:** info. **Once per query.**
- **Flags:** a text literal as the server argument of a database connector, written in place or bound by the resolver to a `let` step: the first argument of `Sql.Database`, `Sql.Databases`, `PostgreSQL.Database`, `MySQL.Database`, `Oracle.Database`, `Snowflake.Databases`, `AnalysisServices.Database`, `AnalysisServices.Databases`, `DB2.Database`, and `Teradata.Database`. One finding per query, located on the first such call.
- **Leaves alone:** a server argument that resolves to a model parameter, which is the fix; any other argument (the database name).
- **Detail:** `query 'Sales', step 'Source': Sql.Database names its server as text (2 calls in this query); a parameter would hold it`. The server's name is not printed: an internal host name need not travel with an export.
- **Source:** Microsoft, [Best practices, Use parameters](https://learn.microsoft.com/en-us/power-query/best-practices#use-parameters): "You can even use parameters in some of the arguments of the data connectors. For example, you could create a parameter for your server name when connecting to your SQL Server database." And: "If you change your server location, all you need to do is update the parameter for your server name, and your queries are updated."
- **Fix route** in Desktop: **Transform data**, **Manage Parameters**, **New Parameter**, type **Text**, the server as its current value; then select the query's **Source** step, open its settings (the gear), and choose **Parameter** for **Server**.
- **Fixtures:** `Sql.Database("finance-sql.example", "Warehouse")` twice in one query (fires once); `Sql.Database(ServerName, "Warehouse")` with `ServerName` a parameter (does not); a `let` step holding the literal (fires).
- **Corpus:** 2,463 calls in 465 models (166 repositories), counted per call; once per query lowers the occurrences, which the corpus diff measures.

### 9.15 `ODBC_WHERE_CONNECTOR_EXISTS`

- **Name:** "ODBC or OLE DB where Power BI has a connector". **Category:** Performance. **Severity:** info.
- **Flags:** `Odbc.DataSource` or `OleDb.DataSource` whose connection string (a literal, or a name the resolver binds to one) names the driver or provider of a source Power BI connects to natively. The list, kept small: Amazon Redshift (`Amazon Redshift`, the only driver the corpus shows in volume), PostgreSQL (`PostgreSQL`), SQL Server (`SQL Server`, `SQLNCLI`, `MSOLEDBSQL`, `ODBC Driver <n> for SQL Server`), MySQL (`MySQL`), Oracle (`Oracle`), and Snowflake (`Snowflake`), matched in the `Driver=` or `Provider=` part, any case. Located on the call.
- **Leaves alone:** a connection string that names only a DSN (`dsn=Sales`), which says nothing of the driver behind it; a driver not on the list.
- **Detail:** `query 'Orders', step 'Source': the ODBC connection names the Amazon Redshift driver; Power BI has an Amazon Redshift connector`.
- **Source:** Microsoft, [Best practices, Choose the right connector](https://learn.microsoft.com/en-us/power-query/best-practices#choose-the-right-connector): "Choose the purpose-built connector for your data source when one is available. For example, the SQL Server connector provides a better **Get Data** experience than the generic ODBC connector when you connect to a SQL Server database. The SQL Server connector also supports performance features such as query folding." The page links Microsoft's [connector list](https://learn.microsoft.com/en-us/power-query/connectors/) to confirm each entry.
- **Fix route** in Desktop: **Get data**, the named connector (for example **Amazon Redshift**), connect to the same database, and in the original query's **Source** step point at the new connection (the page shows the formula), then check that the later steps still find their columns.
- **Fixtures:** `Odbc.DataSource("Driver={Amazon Redshift (x64)};Server=...")` (fires); `Odbc.DataSource("dsn=Sales")` (does not).
- **Corpus:** 236 calls naming Redshift or PostgreSQL drivers, within the 17 models (6 repositories) that use ODBC or OLE DB at all.

### 9.16 `FIXED_DATE_IN_ROW_FILTER`

- **Name:** "Fixed date in a row filter". **Category:** Maintenance. **Severity:** info.
- **The framing** matches `HARDCODED_PERIOD_IN_DAX` (`rules/hardcoded-period-in-dax.md`), its DAX sibling: a fixed date goes stale without an error, and the report quietly shows an old window.
- **Flags:** a `Table.SelectRows` whose condition compares a column with a fixed `#date(...)`, `#datetime(...)`, or `#datetimezone(...)` of number literals, as an end (`<`, `<=`) or an equality (`=`, `<>`). Located on the date.
- **Leaves alone:** a fixed start (`>`, `>=`): history that starts on a fixed date is normal, as the DAX rule leaves a `CALENDAR` start alone; a condition that also uses `RangeStart` or `RangeEnd`; a date built from a parameter or from `DateTime.LocalNow()`.
- **Detail:** `query 'Sales', step 'Filtered Rows': rows end at a fixed date, December 31, 2025`, the date written long form as the DAX rule writes it.
- **Source:** Microsoft, [Data reduction techniques for Import modeling, Remove unnecessary rows](https://learn.microsoft.com/en-us/power-bi/guidance/import-modeling-data-reduction#remove-unnecessary-rows): "You can implement time-based Power Query filters with parameters, and even set them to use relative time periods". Microsoft, [Best practices, Filter data early to improve performance](https://learn.microsoft.com/en-us/power-query/best-practices#filter-data-early-to-improve-performance): "You can also take advantage of the type-specific filters such as **In the previous** for a date, datetime, or even date timezone column."
- **Fix route** in Desktop: **Transform data**, select the query, select the filter step's gear in **Applied steps**, and use a relative date filter (**Date Filters**, **In the Previous**) or a parameter in place of the fixed date.
- **Fixtures:** `each [Order Date] <= #date(2025, 12, 31)` (fires); `each [Order Date] >= #date(2020, 1, 1)` (does not); a `RangeStart` filter (does not).
- **Corpus:** 31 filters in 15 models (13 repositories), counted before the start exception, which can only lower it.

### 9.17 `LEGACY_EXCEL_FILE`

- **Name:** "Legacy Excel workbook". **Category:** Error Prevention. **Severity:** info.
- **Flags:** `Excel.Workbook` whose content is `File.Contents` of a path, a literal or a name the resolver binds to one, ending `.xls` or `.xlsb` (any case). Located on the path.
- **Leaves alone:** `.xlsx` and `.xlsm`; a path the resolver cannot follow (185 corpus Excel sources sit in parameters or functions it cannot read through).
- **Detail:** `query 'Budget', step 'Source': the workbook is a legacy .xls file, read through the Access Database Engine`.
- **Source:** Microsoft, [Excel connector, Legacy ACE connector](https://learn.microsoft.com/en-us/power-query/connectors/excel#legacy-ace-connector): "Power Query reads legacy workbooks (such as .xls or .xlsb) using the Access Database Engine (or ACE) OLEDB provider. Because of this dependency, you might come across unexpected behaviors when importing legacy workbooks that don't occur when importing OpenXML workbooks (such as .xlsx)." And from [Prerequisites](https://learn.microsoft.com/en-us/power-query/connectors/excel#prerequisites): "ACE can't be installed in cloud service environments."
- **Fix route:** open the workbook in Excel and save it as an Excel Workbook (`.xlsx`); then in Desktop, **Transform data**, select the query's **Source** step, open its settings, and point it at the new file.
- **Fixtures:** `Excel.Workbook(File.Contents("C:\Demo\Data\Budget.xls"), null, true)` (fires, and `LOCAL_DRIVE_PATH` fires on the same literal); a `.xlsx` path (does not).
- **Corpus:** 8 calls in 1 model (1 repository).

## 10. The site

### 10.1 Power Query as a rule family

Michael, October 13, 2026: "Let's add the filter on the rules index for 'Power Query' like there is for model and report." Today a rule's layer shows in three places on the site: the rules index tags each row `model`, `report`, or `project` (`layerBadge`, `packages/web/src/build/pages.ts:652`, styled by `.layer` at `packages/web/src/styles.css:603`); a rule page's meta line names it (`pages.ts:576`); and the results' Show filter has a box per layer (`LAYERS` and `filterBoxes`, `packages/web/src/results/render.ts:122` and `:293`).

**The design: a fourth value of `Rule.layer`, `powerquery`.** `Layer` (`packages/core/src/rules/types.ts:65`) becomes `"model" | "report" | "project" | "powerquery"`. `LayerName`, the file families, stays `"model" | "report"`, and so do `Finding.layer` (`layerOf`, `types.ts:78`) and `result.layers`, since M lives in model files. This is the smallest design: `Rule.layer` already means "the part of the project a rule reads", every place that shows a rule's layer already reads that one field, and a reader who meets `powerquery` in it needs no second field to understand it. A separate field (say `family`) was weighed and set aside: every display would read two fields to pick one word, and the JSON would carry two answers to one question.

What follows from it:

- **`needs`.** `pbiplintRule` derives a rule's needs from its layer (`packages/core/src/rules/pbiplint/define.ts:45`); `powerquery` needs `["model"]`. `MINIMIZE_POWER_QUERY_TRANSFORMATIONS`, made by `bpaRule`, sets `layer: "powerquery"` and keeps `needs: ["model"]`.
- **Ranking.** `summarizeRule` narrows only a `project` rule's group to its findings' shared layer (`packages/core/src/engine/rank.ts:45`), so a `powerquery` group keeps `powerquery`.
- **The JSON contract** (`packages/web/content/cli.md:166`): `rule.layer` gains the value `powerquery`; a finding's `layer` keeps `model` and `report`. The CLI page says both, in one sentence each.
- **SARIF:** `rules[].properties.layer` (`packages/core/src/format/sarif.ts:64`) reads `powerquery`; artifact paths are built from the finding's `layer` (`sarif.ts:79`), so they do not move.
- **Text and Markdown:** the tag reads `[powerquery]` (`layerTag`, `packages/core/src/format/text.ts:98`), and the fixed width for it (`padEnd(9)`, `text.ts:155`) grows to fit it, which shifts the text format's columns by three characters on every line; Markdown's heading and fix-first line print `powerquery` (`markdown.ts:162` and `:168`).
- **The CLI's rule list and `list_rules`:** the layer column (`packages/cli/src/main.ts:42`, `padEnd(7)`) widens to fit `powerquery`; `list_rules` (`packages/cli/src/mcp.ts:132`) returns the value as is. `--rule` takes rule ids and is unchanged. `pbiplint explain` prints `powerquery layer` (`packages/cli/src/explain.ts:130`).
- **Tests that pick rules by layer.** `parity.test.ts:30` runs the ported rules whose layer is `model`; it widens to `model` or `powerquery`, so `MINIMIZE_POWER_QUERY_TRANSFORMATIONS` stays checked against Tabular Editor. `rule-pages.test.ts:240` expects TMDL examples on `model` pages, and widens the same way, since a Power Query page's examples are TMDL too.

On the site, the machine value `powerquery` is shown as "Power Query", through one label map beside `RULE_LAYERS` that the badge, the meta line, the results tag, and the filter box all read; `model`, `report`, and `project` show as they do today.

- **`RULE_LAYERS` and `SITE_LAYERS`.** `RuleLayer` (`pages.ts:261`) gains `powerquery`, and `RULE_LAYERS` (`pages.ts:264`) lists it, so `pageLayer` (`pages.ts:307`) accepts `layer: powerquery` in a page's front matter. `SITE_LAYERS` (`pages.ts:289`) stays `["model", "report"]`: it gates the file families the site publishes, and `publishesLayer` (`pages.ts:326`) publishes a `powerquery` page whenever `model` is published, as it publishes a `project` page whenever either is. `CHECK_LABEL` (`pages.ts:42`) gives `powerquery` "Check a model for this", since the button takes a model.
- **Front matter.** The 16 pages (the 15 new rules and `minimize-power-query-transformations.md`) carry `layer: powerquery`; `rule-pages.test.ts` already holds each page's layer equal to its rule's.
- **The rules index count** (`rulesIndex`, `pages.ts:615` to `:634`, which fails the build on a page no clause claims). The ported clause for Microsoft's rules becomes "ported, layer `model` or `powerquery`", so `MINIMIZE_POWER_QUERY_TRANSFORMATIONS` stays counted with Microsoft's ruleset. The 15 new rules are `builtin`, which the existing clause counts at any layer. No new clause.
- **The rules index badge and the meta line** show "Power Query" (`showsLayers` is already true, with two families published). `.layer.powerquery` gets its own outline in `styles.css`, as the report and project tags have theirs, told apart by its word as well as its colour.
- **The results filter.** Today the layer boxes show only when the run has groups on both model and report (`render.ts:449`). The rule becomes: the boxes show when the groups span two or more of `model`, `report`, and `powerquery`, one box each for those present ("Model", "Report", "Power Query"). A `project` group's rule generalizes from "shown while either layer is checked" (`render.ts:480`) to "shown while the Model or the Report box is checked, or when neither is present"; `reveal` (`render.ts:284`) checks the Model and Report boxes present when none of them is checked. A `powerquery` group shows only while the Power Query box is checked, as a model group shows only while Model is.
- **Results tag.** `layerTag` in `render.ts:298` shows the label, so a Power Query group's row reads "Power Query".

### 10.2 A filter on the rules index

Michael, October 13, 2026: "Please add the clickable filter on the rules index." Today the index's family tags are labels only; the results page has the site's only filter.

- **The controls.** Above the rules list, a `fieldset` with the legend "Show" and one checkbox per published family, in this order: Model, Report, Power Query (the families `SITE_LAYERS` publishes, plus Power Query when any `powerquery` page is published). All are checked when the page opens. Unchecking one hides the rows of that family's rules. A `project` rule shows while Model or Report is checked, the rule the results page follows (section 10.1). A category heading (`h2`) and its list hide when every row under them is hidden.
- **Without JavaScript.** `rulesIndex` renders every rule row as today, with its family as a `data-layer` attribute on the `li`, and renders the `fieldset` with the `hidden` attribute. The script reveals it and does all the hiding, so a reader without the script sees the full list and no controls that do nothing.
- **Stores nothing.** [The Promise](https://pbiplint.com/privacy/#the-promise) says "The site stores nothing in your browser", so the filter uses no `localStorage`, `sessionStorage`, IndexedDB, or cookie. Its state lives in the address instead:
  - On load, the script reads `layer` from the query string, a comma-separated list (`/rules/?layer=powerquery`, `/rules/?layer=model,report`). The families it names start checked and the others unchecked. A missing, empty, or wholly unknown value starts with every box checked; an unknown name among known ones is ignored.
  - As boxes change, `history.replaceState` rewrites the query string, so the link a reader copies opens what they see. With every box checked the query string is removed, so the plain `/rules/` stays the default. `replaceState` replaces the current history entry rather than adding one, so the Back button is not filled with filter states.
  - Worth it: it costs a few lines (`URLSearchParams` and one `replaceState` call), and it gives the release notes, the About page, and #70's submission a direct link to the Power Query rules, `https://pbiplint.com/rules/?layer=powerquery`.
- **Accessibility.** Real checkboxes in the `fieldset` with its `legend`, in the keyboard order they are written. A polite live region under the controls reads the count after each change: "Showing 16 of 121 rules". It reuses the results page's Show-filter classes (`.filters` and the box styles in `styles.css`), so the two filters look alike, and the layer-visibility rule from section 10.1 lives in one small function both pages import, so they behave alike. The site's axe scan covers the index with the controls shown.
- **Script.** A small module, `packages/web/src/rules-filter.ts`, loaded from the index page only (`<script type="module" src="/src/rules-filter.ts">` beside the shared `nav.ts` one at `packages/web/src/build/pages.ts:536`), importing the shared visibility function. Nothing external; the CSP's `script-src 'self'` (`packages/web/src/build/csp.ts:10`) already allows it.
- **Tests:**
  - A build test in `packages/web/test`: the index renders the `fieldset` with `hidden`, one box per family present, and every rule row with its `data-layer`.
  - An e2e test in `packages/web/e2e/site.spec.ts`: unchecking Power Query hides its rows and any heading left empty; the live count reads right; `/rules/?layer=powerquery` opens with only Power Query checked and only its rows shown; the address follows the boxes; and nothing is stored (`localStorage` and `sessionStorage` stay empty and `document.cookie` is empty after use). The existing no-request watch in `fixtures.ts` still holds on the page.

### 10.3 Pages and counts

- **No new gate while v3 is built.** Everything ships in one release from `release/0.3.0` (section 12), and `pages.yml` deploys only from main, so nothing half-built reaches the site; no rule needs a gate of its own.
- **Rule pages:** fifteen new pages from the template (fourteen if the Desktop check drops `EXTENSION_FILTER_CASE`), and changes to `parse-issue.md` and `minimize-power-query-transformations.md`. Each new page's example is a `tmdl fires` and `tmdl fixed` pair that `rule-pages.test.ts` lints, as for every page, so each example must parse and fire.
- **The rules index** counts its rules itself. The rule counts in the root, CLI, and core READMEs and the About page move from 106 rules (24 built in) to 121 (39 built in), or 120 (38 built in) without `EXTENSION_FILTER_CASE`. The About page and the READMEs name Power Query as a part pbiplint reads.
- **Privacy page:** no change. Its statements hold as written (section 3.3).

## 11. Testing

### 11.1 Fixtures

- **`tests/fixtures/m-zoo.SemanticModel`**, hand-written and sanitized: no real names, servers, or paths, and the project's `C:\Demo\Data\` convention for file paths (the Desktop checks rewrite it for the Windows VM). It holds:
  - Every fixture shape sections 9.2 to 9.17 name, grouped per rule in tables and shared expressions named for what they show. The shapes of each rule that reports once per query (`DEFAULT_STEP_NAMES`, `HARDCODED_SERVER_NAME`) and of `INCREMENTAL_REFRESH_RANGE_BOUNDS` sit in tables of their own, so each finding is unambiguous.
  - All three ways TMDL stores M (inline, block, fence), an `expression 'Name'` written with an `expression =` line, and a table with a `refreshPolicy` whose `sourceExpression` matches its partition.
  - `RangeStart` and `RangeEnd` parameters, and a parameter that holds a fake key.
  - Nothing unparsable: the parity test requires a captured fixture to read with no `PARSE_ISSUE`.
  - A `model.tmdl` with a `dataAccessOptions` block holding `fastCombine` (section 9.8).
  - A `C:\Demo\Data\` `.xls` path for `LEGACY_EXCEL_FILE`; it has no file behind it, as no fixture path does.
- **The Desktop check does not hold up the capture.** Michael's Windows VM check can move the two dynamic-source shapes (section 9.3) into `row` or `computed`, and keep or drop `EXTENSION_FILTER_CASE` (section 9.10). All three shapes are in m-zoo from the start, so the check's answer changes only pbiplint's own `tests/expectations/pbiplint/m-zoo.json`, never the Tabular Editor captures, which hold no M rule. Nobody waits on the check to capture.
- **Captured before October 31, 2026,** all three ways with `te` 0.7.1.2 (Microsoft's ruleset, the built-in rules, and the survey's files) and added to `CAPTURED` in `scripts/test/te-captures.test.mjs`, as te3-zoo was. After that date it cannot change; a later shape goes in a new fixture whose expectations are pbiplint's own.
- **The new rules' expectations** are pinned in `tests/expectations/pbiplint/m-zoo.json` (rule, object, line, column, detail; a folder of its own, since `parity.test.ts:23` reads every `.json` file at the top level as a Tabular Editor capture), read by a new `packages/core/test/rules-m.test.ts`. The M rules have no Tabular Editor oracle (Michael, October 12, 2026), so the file is pbiplint's own, reviewed by hand once.
- **Unit tests** for what a fixture cannot hold: M that does not parse (`PARSE_ISSUE` with line and column, the 120-character cut), a lex error, a `sourceExpression` that differs from its partition, the resolver's scopes one by one, and the column formula on each storage style with tabs and spaces.

### 11.2 Existing fixtures

The committed fixtures with M (`tvw-baseline`, `udf-sales`, `shelfmart`, `rule-zoo`, the project fixtures, and messy-sales) gain `LOCAL_DRIVE_PATH` findings on their `C:\Demo\Data\` paths and any other new findings the corpus diff predicts. Their expectation files for Microsoft's rules do not change, since those hold only ported rules. The tests that count a fixture's or the sample's findings move with them. The project fixtures' check that every `File.Contents` path is under `C:\Demo\Data\` (`fixtures.test.ts:34`) stays as it is.

### 11.3 The secret guard

One test, `packages/core/test/secret-masking.test.ts` with a web and a CLI counterpart, lints m-zoo and asserts that none of its fake secret values appears whole, nor any 8-character run of a value's distinctive part (the text between `pbiplint-fixture-` and `-notreal`, for example `key-0002`), in:

- `formatText`, `formatJson`, `formatSarif`, and `formatMarkdown`;
- the site's rendered results and its exported report, with the preamble for an AI assistant;
- the CLI's output in every format, and the MCP server's lint tool, through `packages/cli/test`.

It reads the values from the fixture, so a new fake secret is covered when it is added.

### 11.4 The corpus diff

A throwaway script in the plan's folder (not committed; the corpus is not pbiplint's to commit) lints every corpus model with main and with the branch, and compares each finding by rule, object, file, line, and detail:

- **Every existing finding is unchanged,** except `MINIMIZE_POWER_QUERY_TRANSFORMATIONS`, whose difference must be exactly the deviation: partitions gained only through native queries or spacing, partitions lost only through matches in comments or literals (expected: up to 402 gained, since the research also counted `Query` fields outside the connectors section 9.7 lists, and 1 lost). Measured on the corpus on October 13, 2026: of 1,321 models, 444 partitions gained (408 `Sql.Database`, 20 `MySQL.Database`, 14 `PostgreSQL.Database`, 2 `Oracle.Database`), each a native query the old text match missed: 220 with a lowercase `select`, 206 whose SQL does not start with `SELECT`, and 18 whose `Query` is not the record's first field or is spaced. 65 partitions lost: 64 DMV queries given to `AnalysisServices.Database` (the same 16 partitions in 4 copies of one model), the deviation section 9.7 records, and 1 whose only match is in a comment. No other rule changed.
- **New findings** are counted per rule in occurrences, models, and repositories, and compared with each rule's Corpus line in sections 9.2 to 9.17; a difference is explained in the plan's notes before the rule's pull request merges. Expected, as the research counted them (occurrences, models):

  | Rule | Expected | Moves because |
  | --- | --- | --- |
  | `SORT_NOT_HELD_FOR_REMOVE_DUPLICATES` | 19 or fewer, 10 or fewer | The one-argument exception |
  | `DYNAMIC_DATA_SOURCE` | 18, 13 or fewer | Function parameters left out |
  | `INCREMENTAL_REFRESH_RANGE_BOUNDS` | 4, 4 | |
  | `HARDCODED_SECRET_IN_QUERY` | 60 or more, 2 or more | The parameter-literal shape |
  | `LOCAL_DRIVE_PATH` | 1,083, 303 or fewer | |
  | `PRIVACY_LEVELS_IGNORED` | 44, 44 | |
  | `SCRIPT_IN_QUERY` | 7, 3 | |
  | `EXTENSION_FILTER_CASE` | 54, 12 or fewer | Unresolved listings left out |
  | `KEEP_FIRST_ROWS_LEFT_IN` | 2, 1 | |
  | `EXCEL_USE_HEADERS` | 26, 21 | |
  | `DEFAULT_STEP_NAMES` | 3,274 or more, 517 or more | Shared expressions added |
  | `HARDCODED_SERVER_NAME` | fewer than 2,463, 465 | Once per query |
  | `ODBC_WHERE_CONNECTOR_EXISTS` | 236, 17 or fewer | |
  | `FIXED_DATE_IN_ROW_FILTER` | 31 or fewer, 15 or fewer | The start exception |
  | `LEGACY_EXCEL_FILE` | 8, 1 | |
- **`PARSE_ISSUE`** gains exactly 1 finding.
- Run once per pull request that adds or moves an M rule.

### 11.5 The parse-time guard

The largest corpus model parses in 680 ms (Node, Michael's Mac, research of October 12, 2026): its partitions embed their data as M literals, the largest 4.2 MB. A script, `scripts/make-big-model.mjs`, writes a model of the same shape and size into `tests/generated/` (git-ignored, as `make-big-report.mjs` does for reports): the same number of M partitions and the same total M size, filled with generated `#table` literals. Two guards read it:

- **Node:** `packages/core/test` lints it, and the whole lint must finish within a budget set in the plan at three times the time measured on CI's runners, so a slow runner does not flake it but a parser that grows quadratic does.
- **Browser:** the e2e suite drops it and holds the lint to a budget per engine. Every budget, Node's and each engine's, is three times the time measured on CI's runners, rounded up to the next 5 s. Measured on CI on October 13, 2026, that gives 20 s for Node (6.4 s on Node 20), 10 s for Chromium, 20 s for WebKit and 65 s for Firefox (20.6 s), whose parse stays linear in size but runs about 7.5 times slower than Chromium's.

### 11.6 Bundle checks

- `check:browser`: the two budgets, the English-only check, and the forbidden tokens (section 3.4).
- `check:network` (`packages/cli/scripts/check-network.mjs`): unchanged, and must pass with the parser in the CLI bundle.
- `check:pack`: the core's `package.json` names the parser at exactly `2.0.0`, and the CLI's packed bundle holds no non-English template.
- The site build: the same English-only check on the built home JavaScript.
- `test:bundle` and the MCP smoke test (`packages/cli/scripts/smoke-mcp.mjs`) run the built CLI on the sample, which now has M rules firing.

### 11.7 Browser

- The e2e test "once the page has loaded, linting makes no request" (`packages/web/e2e/home.spec.ts:165`) lints a model with M and still sees no request.
- A results test shows an M finding's `file:line:column` and its query and step.
- The Power Query family (section 10.1): unit tests in `packages/web/test` for the label map, the index badge and meta line, the count clause, and the filter's box rules (boxes shown for two or more families; a project group shown while Model or Report is checked; `reveal` on a hidden Power Query group); an e2e check that the sample's results show a Power Query box and that unchecking it hides only Power Query groups.
- The axe scan covers the new pages through the existing site checks.

## 12. Delivery

Michael, October 13, 2026: "I want to release the Power Query (i.e., v0.3.0) in one release to the public, meaning our first v0.3.x release should be in one branch merged into main once when ready for release, including bug fixes and, possibly, other various fixes."

### 12.1 One integration branch

- **The branch:** `release/0.3.0`, created from main by the coordinator right after this spec's pull request (#224) merges.
- **What targets it:** every v3 pull request below, and any bug fix or other change meant for 0.3.0, uses `release/0.3.0` as its base, not main.
- **CI runs on those pull requests.** `.github/workflows/ci.yml`'s trigger is `pull_request:` with no branch filter (`ci.yml:6`), so its test job (lint, typecheck, tests, `check:browser`, build, `check:network`, `check:pack`, `test:bundle`) and its e2e job run on a pull request into `release/0.3.0` as they do into main. Its `push` trigger is limited to main (`ci.yml:4` to `:5`), so a merge into the release branch runs nothing further; the pull request's own run is the check.
- **Nothing reaches users before the one merge.**
  - The site deploys only on a push to main (`.github/workflows/pages.yml:3` to `:6`: `push: branches: [main]`, plus `workflow_dispatch`, which nobody runs from the release branch).
  - npm publishing runs only on a `v*` tag (`.github/workflows/release.yml:3` to `:5`), which the coordinator pushes only after the release merge.
  - The Action, the Azure Pipelines task, and the Claude plugin pin a published version, so they move only after that.
- **No interim gating.** Since nothing deploys from the release branch, no rule needs a page that arrives with its code or a gate while v3 is half built (section 10.3).
- **Keeping it current.** Main takes only an urgent fix that cannot wait for 0.3.0, through its own pull request. The coordinator then merges main into `release/0.3.0` (a merge commit, never a rebase: the branch is shared, and rebasing it would rewrite what every open v3 pull request is based on). A v3 pull request that falls behind merges `release/0.3.0` into itself, or rebases its own unshared branch onto it.

### 12.2 The pull requests into `release/0.3.0`

Each with CI and e2e green and one Opus review of the branch, merged by the coordinator:

1. **The m-zoo fixture and its captures** (needs `te`, so by October 31, 2026). The fixture, its three captures, `CAPTURED`, and nothing else. It changes no result, since today's text-match rule is what Tabular Editor runs, so the capture records no deviation yet.
2. **The reader.** The parser pinned; the two build changes in all three bundlers; the budgets and bundle checks; `lint()` async with every caller; `readM`, `Indexes.m`, `refreshPolicy`, the `expression =` fallback; locations with columns in every output; `PARSE_ISSUE` for M; the resolver with its unit tests; `make-big-model.mjs` and both parse-time guards. No new rule, so the corpus diff must show only the 1 new `PARSE_ISSUE`.
3. **The Power Query family and the shipped rule on the parser.** The `powerquery` rule layer through core, the CLI, and the site (section 10.1), the clickable filter on the rules index (section 10.2), with `MINIMIZE_POWER_QUERY_TRANSFORMATIONS` as its first member: moved onto the parser, its layer changed, its deviation in m-zoo's capture, its page, and the deviation counts. They go together because the shipped rule is the first rule with the new layer, and the parity and rule-page tests widen in the same change.
4. **Calls and literals:** `LOCAL_DRIVE_PATH`, `SCRIPT_IN_QUERY`, `EXCEL_USE_HEADERS`, `ODBC_WHERE_CONNECTOR_EXISTS`, and `PRIVACY_LEVELS_IGNORED` (which reads `model.tmdl` and needs only `Model.dataAccessOptions`). Each reads a call or a literal where it stands, so none needs the resolver beyond a step's name. This pull request also starts `tests/expectations/pbiplint/m-zoo.json` and moves the sample and fixture counts.
5. **Steps:** `SORT_NOT_HELD_FOR_REMOVE_DUPLICATES`, `KEEP_FIRST_ROWS_LEFT_IN`, `INCREMENTAL_REFRESH_RANGE_BOUNDS`, `FIXED_DATE_IN_ROW_FILTER`, and `DEFAULT_STEP_NAMES`. Each reads a step, its table argument, or a filter's comparisons, through the resolver's `let` scopes.
6. **The resolver's full reach:** `DYNAMIC_DATA_SOURCE`, `HARDCODED_SECRET_IN_QUERY` with the secret guard (section 11.3), `HARDCODED_SERVER_NAME`, `LEGACY_EXCEL_FILE`, and `EXTENSION_FILTER_CASE` if the Desktop check keeps it. These follow names into model parameters and other queries. If the check has not happened when the rest is ready, `EXTENSION_FILTER_CASE` waits for a pull request of its own and the others go ahead.

Pull requests 4, 5, and 6 depend on 2 and 3 and may go in any order; 6 is last only because it is the largest and carries the guard. Bug fixes and other changes for 0.3.0 go in alongside, each its own pull request into `release/0.3.0`.

### 12.3 The release

- **One pull request,** `release/0.3.0` into main, merged with a merge commit, so main's history shows the release as one step and each v3 pull request's commits stay intact under it. Its description carries the release issue's boxes and the release notes: they lead with the Power Query layer and its fifteen rules (three errors, six warnings, six info), list what can change in results (new findings, the sample's count, the shipped rule's deviation and its move to the `powerquery` layer, columns in locations), and say under "For code that uses `@pbiplint/core`" that `lint()` now returns a Promise (section 4.4).
- **Michael previews the site first.** Before the merge, Michael builds and previews the site from the release branch on his Mac, in a checkout that is not home (home stays on main and clean), for example a worktree made for the purpose:

  ```bash
  cd ~/Projects/pbiplint/pbiplint
  git fetch origin
  git worktree add .claude/worktrees/preview-0.3.0 origin/release/0.3.0
  cd .claude/worktrees/preview-0.3.0
  npm ci
  npm run build -w @pbiplint/web
  npm run preview -w @pbiplint/web
  ```

  No separate core build is needed: the site's Vite config resolves `@pbiplint/core` to the core's source (`packages/web/vite.config.ts`, `resolve.alias`), and `pages.yml` builds the deployed site with the same one command (`.github/workflows/pages.yml:28`). Then open the address `vite preview` prints (`http://localhost:4173/` by default): drop a model with M, check the Power Query tags, the results filter, and the rules index filter (including `/rules/?layer=powerquery`), and read a few rule pages. Afterwards, from home: `git worktree remove .claude/worktrees/preview-0.3.0`. The release pull request carries this as a box that only Michael ticks.
- **Then the coordinator** merges, tags `v0.3.0` on the merge commit, and lets `release.yml` publish. The GitHub Action, the Azure Pipelines task, and the Claude plugin follow with their pins.
- **Then #70,** the Fabric Stack catalog submission, once 0.3.0 is on npm and live at pbiplint.com.

## 13. For Michael

Michael approved this spec on October 13, 2026 ([issuecomment-6144834846](https://github.com/pbiplint/pbiplint/issues/78#issuecomment-6144834846)), with the rule list and severities decided the same day and two notes folded in (sections 10.1 and 12). Only the Desktop check is open: three tests in the Windows VM, none of which holds up m-zoo's capture (section 11.1).

1. A web address chosen with `if ... then ... else` over a parameter: does **Data source settings**, **Data sources in current file**, show the dynamic source warning? (Section 9.3.)
2. A web address passed in as a custom function's parameter: the same question. (Section 9.3.)
3. A folder holding `a.csv` and `B.CSV`, read with **Folder**: does the **Extension** column show `.CSV`? If it shows `.csv`, `EXTENSION_FILTER_CASE` is dropped. (Section 9.10.)

## 14. Left out

- **The `expression =` shape for measures and partition sources** (`source` with `type: m` and `expression =` lines). Seen in the same single corpus repository (8 files) as the shared-expression case, a shape Desktop does not write; it is a TMDL reader question for #144's class of guards, not v3's.
- **Unknown identifiers** (`True` for `true`, a deleted query): later, with #144's guards for AI-written files, as the research recommends.
- **`STEPS_AFTER_NATIVE_QUERY`:** dropped by pb-coord, since the shipped rule already flags every native-query partition.
- **Everything else the research passes dropped**, for the reasons they give: `Table.Buffer`, `DateTime.LocalNow`, TODO comments, referenced queries, distinct on a text key, `Table.RemoveColumns`, the legacy dataflows connector, and the rest. Default step names, fixed server names, ODBC where a connector exists, fixed dates, Keep First Rows, and legacy Excel files were dropped or deferred by the first pass and are in v3 under Michael's decision of October 13, 2026 to take Microsoft's own best-practice recommendations even where they are common.
- **Network paths with a short server name** (27 literals in 6 models): advice on `LOCAL_DRIVE_PATH`'s page, not a rule (section 9.6).
- **Trimming the parser's type system** (section 3.4).
