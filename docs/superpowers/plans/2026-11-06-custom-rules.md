# Custom rules, step 1 (#118) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A team's own Tabular Editor rule files run in pbiplint on the semantic model and its Power Query text, everywhere pbiplint runs, with nothing else installed.

**Architecture:** A browser-pure interpreter in core (`packages/core/src/custom-rules/te/`): a rule-file reader, a Dynamic LINQ lexer and parser, an evaluator with .NET semantics over a read-only view of pbiplint's model under Tabular Object Model names, a `Tokenize()` adapter over pbiplint's DAX tokenizer, and a linear-time matcher for .NET regular expressions. It lands self-contained first (pull request B), proven against Tabular Editor's committed results; config, engine, output, site, and writing aids wire it in afterwards.

**Tech Stack:** TypeScript (core, browser-pure), Vitest, Node scripts for captures, GitHub Actions.

**Spec:** `docs/superpowers/specs/2026-11-06-custom-rules-design.md` (approved November 6, 2026). Section numbers below are the spec's.

## Global Constraints

- Core stays browser-pure: no `node:` imports, no `fetch`, no file system, no DOM, no `eval`, no `Function` in anything under `packages/core/src/`.
- No new runtime dependency.
- Power Query parsing is untouched: custom rules read M as text (section 6.6), so nothing under `packages/core/src/m/` changes.
- The survey's rule files are never committed; only Microsoft's `BPARules.json` (MIT), under its notice.
- Everything is written in pbiplint's own words; no text is copied from any rule-writing skill.
- Tabular Editor is a development-time oracle only; it never runs in CI.
- A rule that cannot run gives exactly one `RULE_COULD_NOT_FINISH` for the rule, naming the rule, its file, and the reason; the reason never quotes the model (section 6.7).
- Where .NET and JavaScript differ, the evaluator follows .NET as Tabular Editor runs it (section 6.1).
- Pull requests B and later touch none of the files the four held pull requests change (the site's file readers, the CLI's walk, report formats, contract tests and goldens, `packages/core/src/format/`, `packages/core/src/index.ts`, `packages/web/content/cli.md`) until those merge.
- No em dashes; no closing keyword next to an issue number.

## Review Focus

1. **A pattern built from model names.** Rules concatenate `outerIt.Table.Name` into a pattern; a name holding `(`, `[` or `\` changes the pattern per object. Expect the pattern compiled per distinct string, cached, and a pattern that does not compile reported as the rule failing, as .NET throws. Test in Task B5.
2. **Nested collections on a big model.** `Model.AllMeasures.Any(... AllColumns.Any(...))` per object is cubic. Expect the rule stopped at the step budget with "reached the evaluation limit", never a stalled run. Test in Task B6, with `scripts/make-big-model.mjs`'s shape.
3. **A null where .NET throws.** `Description.Length` on an object with no description, `RegEx.IsMatch(Expression, ...)` on a partition with no expression. Expect the rule stopped for the project (section 6.7), matching the probe capture. Test in Task B6.
4. **Keys and layout Tabular Editor accepts.** Lowercase keys, a `rules` wrapper, a byte order mark, comments, an integer `ID`. Expect each to read; anything else refused with the reason. Test in Task B2.
5. **A calculated column with no data type.** Expect it left out of a `DataType` rule and counted, never guessed (section 6.2). Test in Task B4.

---

## Pull requests

| PR | What | Waits for | Merges |
| --- | --- | --- | --- |
| A | Tabular Editor captures: fixtures for every behaviour section 11 names, a probe rule file, captured with Tabular Editor CLI 0.8.1.1 | Nothing | On the coordinator's go-ahead once green, before November 18, 2026; must be captured before December 31, 2026 |
| B | Reader and evaluator, new files in core; unit tests; Microsoft parity in pull request CI; survey parity in its own workflow | A merged | Opens and stays open; merges after 0.3.4 is tagged |
| C | Tabular Editor's ignore annotation for every rule | B merged, the held work merged | After review |
| D | `customRules` config, engine, same-id handling, output, CLI | C | After review |
| E | The site | D | After review |
| F | `pbiplint mcp`, the reference command, the skill | D | After review |
| G | Pages, README, schema, privacy page lists, release notes | E, F | Before the step 1 release |

C to G are planned below at the level of their decisions; each gets its task list added to this plan once the held work has merged, since they edit files that work changes.

---

## Pull request A: the captures

`te` is Tabular Editor CLI 0.8.1.1. Its preview stops after December 31, 2026. Probed November 6, 2026: its JSON names each finding's `severity` as `info`, `warning`, or `error`; `Severity` 0 shows as info, 1 and 2 as warning, 3 and above as error, and a rule with no `Severity` as warning. A rule with no `Scope` runs on nothing and reports nothing.

New captures live in `tests/expectations/custom-rules/` so the existing parity tests, which read every file in `tests/expectations/`, `te3/` and `survey/`, do not yet hold pbiplint's built-in rules to fixtures that carry the ignore annotation pbiplint does not read until pull request C. C moves the Microsoft captures into the main set.

### Task A1: the probe rule file and the script's probe mode

**Files:**
- Create: `tests/rules/te-probes/*.json`
- Modify: `scripts/te-expectations.mjs`
- Test: `scripts/test/te-expectations.test.mjs` (create if absent; else add to the existing script test)

**Interfaces:**
- Produces: `--probes <dir>` mode running each `.json` file in the folder and writing `{ fixture, oracle, captured, results }`, where `results` maps each file name to `{ sha256, findings, ruleErrors, severities, quiet }` or `{ sha256, error }`; `severities` maps each rule id that found anything to te's label and `quiet` lists the rule ids that found nothing; `convertFindings` is unchanged. Every mode keeps a `custom` key (`{ deviations, ours }`, keyed by file id then rule id) from an existing output file, as it keeps `deviations` and `ours`.

The probe files hold rules pbiplint wrote, each with an id starting `PROBE_` and a one-line `Description` of the question it asks, in pbiplint's words. They are several files because a rule `te` refuses can make it refuse the whole file: `semantics.json` (most probes), `unknown-scope.json`, `no-scope.json`, `duplicates.json`, `newlines.json` (newlines built from their character code, since string literals have no escapes), and `layout.json` (a byte order mark, comments, a `rules` wrapper with lowercase keys, an integer id). The questions:

- **Severity:** `Severity` 0, 1, 2, 3, 4, 5 and missing, on scope `Model`, expression `true`.
- **No scope:** expression `true`, no `Scope`; and an unknown scope name (`Scope: "Visual"`).
- **Disabled:** `IsDisabled: true` on an always-true rule.
- **Duplicates:** the same rule twice in the file; and two rules sharing an id with different expressions.
- **Ignore annotation:** `PROBE_IGNORE_CUSTOM`, always true on `Model, Table, Measure, DataColumn, CalculatedColumn, Relationship, Partition`, named in the fixtures' annotations, and `PROBE_IGNORE_CUSTOM_LOWER`, named in lowercase.
- **Tokenize:** one rule per candidate token type name, `Tokenize().Any(Type = <NAME>)` on `Measure`, for every name in Tabular Editor 2's DAX lexer (MIT; read the grammar's token list at a pinned commit, record the commit in the file's description field), plus `Tokenize().Any(Type = DIV and Next.Type = INTEGER_LITERAL)`, a `Next` past the last token, and a string literal token's `Text` with and without its quotes.
- **Failure on one object:** `Name.Substring(4).Length >= 0` on `Measure` (throws only on names shorter than 4); and `RegEx.IsMatch(Expression, "x")` on `Partition`, where one partition has no expression.
- **Semantics, each on `Model` and finding the model when true:** string literal escapes (`"a\\b".Length == 3`, `"a\"b"` parses), single-quoted strings, string ordering (`"a" < "B"`), `==` on strings with case, integer division (`7 / 2 == 3`), decimal and double literals, `null == null`, `Description == null` on a model with none, `string.IsNullOrWhitespace` and `IsNullOrWhiteSpace`, enum by string (`Model.Tables.Any(Columns.Any(DataType == "Int64"))`), enum by name, `Convert.ToInt64("x")`, `Contains` with differing case, `IndexOf` with and without `StringComparison`, `ToUpper` on a non-ASCII letter, `Math.Max` on mixed types, `RegEx` and `Regex` spellings, a mid-pattern `(?i)`, a single-character lookbehind, `$` before a final newline, `\d` on a non-ASCII digit, `\w` on a letter outside ASCII, and `.` against `\n`.

- [ ] **Step 1:** Write the test: `convertFindings` on a hand-made te 0.8 JSON with two severities returns `severities: { A: "info", B: "error" }`; a rerun keeps an existing file's `custom` key unchanged.
- [ ] **Step 2:** Run `npx vitest run scripts/test` and see it fail.
- [ ] **Step 3:** Implement the mode and the kept key; write the probe files.
- [ ] **Step 4:** Run the test and see it pass; run `te bpa run` once with each probe file on `kitchen-sink` to see every probe either find, error, or find nothing, with no error loading the file.
- [ ] **Step 5:** Commit: `test: a probe rule file and a probe mode for the Tabular Editor captures`.

### Task A2: the fixtures

**Files:**
- Create: `tests/fixtures/custom-rules.SemanticModel/definition/` (`database.tmdl`, `model.tmdl`, `relationships.tmdl`, `tables/*.tmdl`)
- Create: `tests/fixtures/custom-rules-model-ignore.SemanticModel/definition/` (the same model with the ignore annotation on the model only)
- Modify: `packages/core/test/fixtures.test.ts` (list the two fixtures, if it enumerates them)

The fixtures are written by hand, sanitized (relative placeholder paths only), and small. `custom-rules` carries:

- `annotation BestPracticeAnalyzer_IgnoreRules = {"RuleIDs":[...]}` on a table, a column, a measure, and a relationship, each naming one Microsoft rule that fires on that object here and `PROBE_IGNORE_CUSTOM`; one annotation with malformed JSON; one naming an id in lowercase.
- Measures for `Tokenize()`: a division by a column, by an integer and by a real literal, a `/` inside a string and inside a comment, `DIVIDE`; one measure named with three letters.
- Partitions: M partitions reading Snowflake with an approved and an unapproved schema; a calculated partition; one entity partition with no expression; a shared expression.
- Calculated columns with and without `dataType`; a hierarchy with levels; a perspective; a culture with a translation; a role with a table permission; a calculation group with items.

`custom-rules-model-ignore` is the same model with every object annotation removed and one on the model naming the same Microsoft ids and `PROBE_IGNORE_CUSTOM`.

- [ ] **Step 1:** Write the fixtures.
- [ ] **Step 2:** `te load tests/fixtures/<name>/definition` loads each with no error.
- [ ] **Step 3:** pbiplint reads each with no `PARSE_ISSUE`: `node packages/cli/dist/cli.js tests/fixtures/<name> --format json` after `npm run build`, and `npm test` stays green.
- [ ] **Step 4:** Commit: `test: two model fixtures for Tabular Editor behaviour custom rules depend on`.

### Task A3: capture, pin, and document

**Files:**
- Create: `tests/expectations/custom-rules/<fixture>.json` (Microsoft), `custom-rules/te3/<fixture>.json`, `custom-rules/survey/<fixture>.json`, `custom-rules/probes/<fixture>.json`, for both fixtures
- Modify: `scripts/test/te-captures.test.mjs`, `docs/RELEASING.md`, `CONTRIBUTING.md`

- [ ] **Step 1:** Write the tests in `te-captures.test.mjs`: a second list `CAPTURED_0_8 = ["custom-rules", "custom-rules-model-ignore"]` with its own oracle constants naming `Tabular Editor CLI 0.8.1.1`; for each, all four captures exist and name the same fixture; the survey capture covers every file in `files.json` with at most one error; its Microsoft result equals the Microsoft capture; the probe capture names every file in `tests/rules/te-probes/` with its current sha256, and every probe id in a file te read is under `findings`, `ruleErrors`, or `quiet`. The existing nine keep their checks unchanged.
- [ ] **Step 2:** Run them and see them fail.
- [ ] **Step 3:** Fetch Microsoft's file at the pinned commit into a fresh scratch folder, check its sha256, and capture each fixture four ways (`--rules`, `--built-in`, `--survey`, `--probes`).
- [ ] **Step 4:** Run the tests and see them pass. Read each capture against the question it answers and write the answers into `.superpowers/sdd/2026-11-06-custom-rules/research.md` (ignore semantics on an object and on the model, token names, default severity, no-scope and unknown-scope handling, failure on one object, each semantics probe).
- [ ] **Step 5:** Re-run the nine existing fixtures three ways with 0.8.1.1 into a scratch folder and compare with the committed 0.7.1.2 captures; record any difference in research.md and report it to the coordinator. The committed nine stay as they are.
- [ ] **Step 6:** Update RELEASING's capture section: the 0.8.1.1 captures, what each of the four kinds is for, the new expiry (December 31, 2026, quoting and linking the installation page), and that the fallback after it is Tabular Editor 2's source. CONTRIBUTING gains the `--probes` command.
- [ ] **Step 7:** `npm run lint && npm run typecheck && npm test`. Commit: `test: Tabular Editor 0.8.1.1 captures for custom rules`.

---

## Pull request B: the reader and the evaluator

All new files. Nothing outside them imports `custom-rules/`, so the shipped bundle does not change; the task that finishes B measures what it would add and reports it.

**Files (all created):**

| File | Responsibility |
| --- | --- |
| `packages/core/src/custom-rules/limits.ts` | The limits |
| `packages/core/src/custom-rules/jsonc.ts` | JSON with a byte order mark and comments |
| `packages/core/src/custom-rules/te/read.ts` | Rule file to rules and per-rule problems |
| `packages/core/src/custom-rules/te/ast.ts`, `lexer.ts`, `parser.ts` | Expression text to a tree |
| `packages/core/src/custom-rules/te/view.ts` | The model under Tabular Object Model names |
| `packages/core/src/custom-rules/te/library.ts` | Methods, static members, enums |
| `packages/core/src/custom-rules/te/regex.ts` | .NET pattern to a linear-time matcher |
| `packages/core/src/custom-rules/te/tokens.ts` | `Tokenize()` over pbiplint's DAX tokenizer |
| `packages/core/src/custom-rules/te/evaluate.ts` | Running a rule over the view |
| `packages/core/src/custom-rules/te/index.ts` | `runTeRules`, the one entry point |
| `tests/rules/microsoft/BPARules.json` | Microsoft's file at the survey's pinned commit, MIT |
| `scripts/fetch-survey-rules.mjs` | Fetches the survey's files to a folder, checks each sha256 |
| `.github/workflows/survey-parity.yml` | The survey parity run |
| `packages/core/test/custom-te-*.test.ts` | Unit and parity tests |

### Task B1: limits and the JSON reader

**Interfaces:**
- Produces: `LIMITS = { fileBytes: 1_048_576, rulesPerFile: 2_000, expressionChars: 20_000, nesting: 100, patternChars: 4_000, patternStates: 10_000, stepsPerRule: 20_000_000 }` (largest survey file 64 KB, longest expression 2,971 characters); `parseJsonc(text: string): { value: unknown } | { error: string }`.

- [ ] **Step 1:** Tests: a byte order mark, `//` and `/* */` comments outside strings, `//` inside a string kept, an unterminated comment refused, a file over `fileBytes` refused with the limit named.
- [ ] **Step 2:** Run, fail. **Step 3:** Implement. **Step 4:** Run, pass. **Step 5:** Commit.

### Task B2: the rule file reader

**Interfaces:**
- Produces: `readTeRuleFile(text: string): TeRuleFile` where `TeRuleFile = { error: string } | { rules: TeRule[]; problems: TeRuleProblem[] }`; `TeRule = { id: string; name: string; description?: string; category?: string; severity?: number; scopes: string[]; expression: string; disabled: boolean }`; `TeRuleProblem = { id: string; name?: string; reason: string }`.

Keys match in any case; `ID` may be a number and is read as its decimal string; a file is an array or an object with a `rules` array; `Scope` is a comma-separated list. A rule with no scope, an unknown scope, or a report scope (`Page`, `Visual`, `CustomVisual`, `Filter`, `Report`) becomes a problem, the report one saying report rules use fab-inspector's format; the file's other rules stand. A file whose rules carry `part` and `test` is refused with "report rules in fab-inspector's format come in a later release"; one mixing both shapes is refused saying so. Duplicates and `IsDisabled` follow what A's probe capture recorded.

- [ ] **Step 1:** Tests for each case above, with rules written for the test.
- [ ] **Steps 2 to 5:** Fail, implement, pass, commit.

### Task B3: lexer and parser

**Interfaces:**
- Produces: `parseTeExpression(text: string): { expr: TeExpr } | { error: string }`. `TeExpr` is a tagged union: `literal` (string, number with `int | long | decimal | double`, boolean, null), `ident`, `member` (target, name), `call` (target or static type, name, args), `lambdaBody` (a collection method's argument, evaluated with `it`), `unary`, `binary`, `conditional` (`iif`), `paren`.

Operators and precedence follow Dynamic LINQ: `or ||`, `and &&`, `= == != <>`, `< > <= >=`, `+ -` (and `+` on strings), `* / %`, `not !` and unary minus. String literal escapes follow the probe capture. Errors name the position and what was expected, never echoing more than the token. Length and nesting are held to `LIMITS`.

- [ ] **Step 1:** Tests: precedence (`a or b and c`), each operator spelling, number literal types, both string quote forms, `it`, `outerIt`, `current`, a parse error message, nesting over the limit refused.
- [ ] **Steps 2 to 5:** Fail, implement, pass, commit.

### Task B4: the model view

**Interfaces:**
- Consumes: `Model` and its types from `packages/core/src/model/types.ts`.
- Produces: `buildTomView(model: Model): TomView`; `TomView.objectsOf(scope: string): TomObject[]`; `TomObject = { type: TomType; source: unknown; teName: string }`; `PROPERTIES: Record<TomType, Record<string, PropertySpec>>` with `PropertySpec = { type: TeType; get(o: TomObject, view: TomView): unknown | typeof UNSET }`; `UNKNOWN_PROPERTIES: Record<string, string>` for names pbiplint knows it cannot answer (the `Vertipaq_*` annotations through `GetAnnotation`, with the statistics reason); `nearestProperty(type, name): string | undefined`.

The property table covers every property the survey's rules read (the list in research.md) and the scopes section 6.2 names, and is the source the reference (pull request F) is generated from. `teName` matches how Tabular Editor writes the object in its captures (`'Date'[Date]`, `[Total Sales]`, `'Sales'`, a role's or hierarchy's bare name). `UNSET` is returned where the files leave a property unset on that object (a calculated column's `DataType`). Collections (`AllColumns`, `ReferencedBy`, `DependsOn`, `UsedInRelationships`, ...) build on pbiplint's existing reference index where it has one.

- [ ] **Step 1:** Tests on `tests/fixtures/kitchen-sink.SemanticModel` and `custom-rules`: object counts per scope; each property on a known object; an untyped calculated column's `DataType` is `UNSET`; `nearestProperty("Measure", "Visible")` is `IsHidden`; `teName` for each object type equals a name in the committed captures.
- [ ] **Steps 2 to 5:** Fail, implement, pass, commit.

### Task B5: regular expressions

**Interfaces:**
- Produces: `compilePattern(pattern: string): { regex: CompiledPattern } | { unsupported: string }`; `isMatch(regex: CompiledPattern, input: string, budget: Budget): boolean`; `Budget = { left: number }`, throwing `LimitReached` when spent.

Rules call only `RegEx.IsMatch` (188 calls over the survey), so the matcher answers yes or no with a Thompson-style simulation, linear in the input times the pattern's states. It supports literals, `.`, classes and ranges, `\d \w \s \b \B` and negations with .NET's Unicode meanings, `^ $` with .NET's `$` before a final newline, groups of every kind treated as grouping, alternation, `* + ? {n} {n,} {n,m}` greedy or lazy (the same for a yes-or-no answer), `(?i)` anywhere, scoped to its group, and lookarounds whose body is one character or one class (`(?<![A-Za-z0-9])`, `(?=])`, `(?!\/)`). Anything else (backreferences, wider lookarounds, conditionals, atomic groups, `\p{}` it cannot test, options other than `i`) returns `unsupported` naming the construct. Compiled patterns are cached by string.

- [ ] **Step 1:** Tests: each supported construct matching and not; each refused construct naming itself; every distinct pattern in the survey compiles (listed in the test, as data, pattern text only); `(a*)*b` against 50,000 `a`s finishes within the budget; a pattern built from `Sales (EU)` compiles or reports, never throws.
- [ ] **Steps 2 to 5:** Fail, implement, pass, commit.

### Task B6: library, `Tokenize()`, and the evaluator

**Interfaces:**
- Consumes: B3's `TeExpr`, B4's view, B5's matcher, `tokenizeDax` from `packages/core/src/dax/tokenize.ts`.
- Produces: `evaluateTeRule(rule: TeRule, expr: TeExpr, view: TomView): TeOutcome` where `TeOutcome = { kind: "findings"; objects: TomObject[]; unset: number } | { kind: "could-not-run"; reason: string }`; `LIBRARY` (methods per receiver type, static members of `string`, `char`, `Convert`, `Math`, `RegEx`/`Regex`, and enums by name), the second source for the reference.

The evaluator runs the expression once per object in the rule's scopes, with `it` the object. A property in `UNKNOWN_PROPERTIES` or absent from `PROPERTIES` for the type stops the rule before it runs, naming the nearest property; an `UNSET` value leaves the object out and counts it; a .NET exception (null receiver, bad conversion, failed pattern) stops the rule for the project; every node evaluated and every regex step spends the rule's budget. Values follow .NET: integer division on integer types, ordinal `==` on strings, culture rules as the probe capture showed for comparisons and `IndexOf`. `Tokenize()` maps pbiplint's tokens to Tabular Editor's names as A's capture recorded, with `Next`. Reasons are built from the rule's own text and the object type only.

- [ ] **Step 1:** Tests: every operator, method, static member, conversion, and enum in the tables, each with a case written for the test; each A probe's answer reproduced (the probe files and captures are pbiplint's own, so the test reads them); a null receiver stops the rule; a nested `Any` over a generated model of 400 tables reaches the limit and says so; no reason contains an object's name.
- [ ] **Steps 2 to 5:** Fail, implement, pass, commit.

### Task B7: the entry point and Microsoft parity in pull request CI

**Interfaces:**
- Produces: `runTeRules(text: string, model: Model): TeRunResult`, `TeRunResult = { error: string } | { results: { rule: TeRule; outcome: TeOutcome }[]; problems: TeRuleProblem[] }`. Pull request D consumes this.

- [ ] **Step 1:** Vendor `tests/rules/microsoft/BPARules.json` at the survey's pinned commit (sha256 `ddb9cff4...0392`, checked by the test) and confirm the root `NOTICE` covers it.
- [ ] **Step 2:** Test `custom-te-microsoft.test.ts`: on each of the nine captured fixtures and the two from A, `runTeRules` on the vendored file gives each rule's objects equal to the Microsoft capture's findings; a rule reading `Vertipaq_*` is `could-not-run` with the statistics reason; a difference is allowed only where the survey capture's `custom.deviations[fileId][ruleId]` holds a sentence and `custom.ours` holds pbiplint's objects, and each deviation must show a difference.
- [ ] **Steps 3 to 5:** Fail, implement, pass, commit.

### Task B8: survey parity in its own workflow

- [ ] **Step 1:** `scripts/fetch-survey-rules.mjs <files.json> <outDir>`: fetches each file at its commit, checks its sha256, writes `<outDir>/index.json` naming each file's local name or `unavailable`.
- [ ] **Step 2:** Test `custom-te-survey.test.ts`, skipped unless `PBIPLINT_SURVEY_DIR` is set: for every fixture with a survey capture and every available file, each rule's outcome equals the capture (findings to objects, `ruleErrors` to `could-not-run`, a file error to a refused file) or is a recorded deviation; the 11 rules with no scope and the 9 with report scopes are problems; all 46 files read; a file the index marks unavailable is listed in the output and skipped.
- [ ] **Step 3:** `.github/workflows/survey-parity.yml`: `workflow_dispatch`, a weekly `schedule`, Node 22, `npm ci`, fetch into the runner's temp folder, run the one test. RELEASING's release steps gain "run Survey parity on the release commit and see it green".
- [ ] **Step 4:** Run locally until green, adding deviations only with their reasons (an untyped calculated column, a statistics rule, a difference .NET semantics explain); a difference no reason covers goes to the coordinator.
- [ ] **Step 5:** Commit.

### Task B9: finish

- [ ] Measure what the evaluator would add to the core bundle (esbuild of `custom-rules/te/index.ts`, minified and gzipped) and report it to the coordinator.
- [ ] `npm run lint && npm run typecheck && npm test && npm run check:browser && npm run build`.
- [ ] One whole-branch review, then open B and leave it unmerged until 0.3.4 is tagged, with "For #118." and the measured size in its body.

---

## Pull requests C to G: the wiring (after the held work merges)

Each settles the spec's builder items as follows; its tasks are added here before it starts.

- **C, the ignore annotation:** `BestPracticeAnalyzer_IgnoreRules` read on every object and the model, with the semantics A's capture showed (malformed JSON and id case as captured), applied to every rule beside `pbiplint.ignore`. The two A fixtures' Microsoft captures move into `tests/expectations/`, so the existing parity test covers it. `ignoreHelp` mentions the annotation.
- **D, config to output:** `customRules` in the config and its JSON Schema; the engine runs `runTeRules` per file, in order; a rule file that cannot be found stops the project's lint naming it; same-id handling with `packages/core/src/custom-rules/te/upstream-rules.data.ts`, generated by `scripts/fingerprint-upstream-rules.mjs` from every published version of Microsoft's file (all languages) and `TabularEditor/BestPracticeRules`, holding `{ id, scope, hash }` with a 64-bit FNV-1a hash of the whitespace-free expression (no rule text is stored); the severity mapping 0 and 1 info, 2 warning, 3 and above error, as pbiplint's built-in rules read Microsoft's numbers, and a missing severity as A's capture and Tabular Editor 2's source settle; JSON and SARIF fields `custom: true` and `ruleFile` (relative to the config), under the contract's rules for additions; custom categories after the eight; `RULE_COULD_NOT_FINISH` per rule; notices for left-out objects, replaced ids, and skipped copies; `pbiplint explain <ID>` for a custom id.
- **E, the site:** reads the files `customRules` names from inside the dropped folder only; labels a finding "Your team's rule" with its file and description; loads the evaluator only when a config names custom rules if B9's measurement says it is worth it; e2e drops a folder with a config and a rule file.
- **F, assistants:** `pbiplint reference` (text, and `--json`) printed from `PROPERTIES` and `LIBRARY`; `pbiplint mcp` gains it and `explain_rule` and `list_rules` take the project path; a second skill, `pbiplint-custom-rules`, written from scratch, installed by `pbiplint skill --install` and shipped in the npm package and the Claude plugin.
- **G, words:** the "Custom rules" page (setup, the format, built-in ids, the ignore annotation, what does not run, the worked examples from #117 and the approved-schemas rule, the skill, the reference); the CLI page's configuration section; README; the privacy page's lists of files opened and its skill sentence; the pipelines page's "The lint" lines; one sentence on the custom rules page on how `Severity` numbers map, since Tabular Editor CLI 0.8.1.1 labels 1 as warning and pbiplint reads it as info; release notes, with "What can change in your results" for the ignore annotation.
