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

New captures live in `tests/expectations/custom-rules/` so the existing parity tests, which read every file in `tests/expectations/`, `te3/` and `survey/`, do not yet hold pbiplint's built-in rules to fixtures that carry the ignore annotation pbiplint does not read until pull request C. C has the parity test read the Microsoft captures there too.

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

- **C, the ignore annotation:** `BestPracticeAnalyzer_IgnoreRules` read on every object and the model, with the semantics A's capture showed (malformed JSON and id case as captured), applied to every rule beside `pbiplint.ignore`. The parity test also reads the two A fixtures' Microsoft captures in `tests/expectations/custom-rules/`, so it covers the annotation. `ignoreHelp` mentions the annotation.
- **D, config to output:** `customRules` in the config and its JSON Schema; the engine runs `runTeRules` per file, in order; a rule file that cannot be found stops the project's lint naming it; same-id handling with `packages/core/src/custom-rules/te/upstream-rules.data.ts`, generated by `scripts/fingerprint-upstream-rules.mjs` from every published version of Microsoft's file (all languages) and `TabularEditor/BestPracticeRules`, holding `{ id, scope, hash }` with a 64-bit FNV-1a hash of the whitespace-free expression (no rule text is stored); the severity mapping 0 and 1 info, 2 warning, 3 and above error, as pbiplint's built-in rules read Microsoft's numbers, and a missing severity as A's capture and Tabular Editor 2's source settle; JSON and SARIF fields `custom: true` and `ruleFile` (relative to the config), under the contract's rules for additions; custom categories after the eight; `RULE_COULD_NOT_FINISH` per rule; notices for left-out objects, replaced ids, and skipped copies; `pbiplint explain <ID>` for a custom id.
- **E, the site:** reads the files `customRules` names from inside the dropped folder only; labels a finding "Your team's rule" with its file and description; loads the evaluator only when a config names custom rules if B9's measurement says it is worth it; e2e drops a folder with a config and a rule file.
- **F, assistants:** `pbiplint reference` (text, and `--json`) printed from `PROPERTIES` and `LIBRARY`; `pbiplint mcp` gains it and `explain_rule` and `list_rules` take the project path; a second skill, `pbiplint-custom-rules`, written from scratch, installed by `pbiplint skill --install` and shipped in the npm package and the Claude plugin.
- **G, words:** the "Custom rules" page (setup, the format, built-in ids, the ignore annotation, what does not run, the worked examples from #117 and the approved-schemas rule, the skill, the reference); the CLI page's configuration section; README; the privacy page's lists of files opened and its skill sentence; the pipelines page's "The lint" lines; one sentence on the custom rules page on how `Severity` numbers map, since Tabular Editor CLI 0.8.1.1 labels 1 as warning and pbiplint reads it as info; release notes, with "What can change in your results" for the ignore annotation.

### Pull request C, in tasks (added November 20, 2026)

Tabular Editor's `BestPracticeAnalyzer_IgnoreRules` annotation, honoured for every rule, as pull request A's captures showed it: `{"RuleIDs": [...]}` on an object skips that object; on the model it skips those ids on every object; ids match without regard to case; the key `RuleIDs` matches without regard to case, as Json.NET reads it. A malformed annotation (not JSON, or no `RuleIDs` list of strings) is reported once as a `PARSE_ISSUE` on the annotation's line and ignores nothing, where Tabular Editor fails every rule whose scope covers the object (decided November 6, 2026: better than the source).

#### Task C1: read the annotation

**Files:**
- Modify: `packages/core/src/engine/ignore.ts`, `packages/core/src/engine/run.ts`
- Test: `packages/core/test/engine.test.ts`

**Interfaces:**
- Produces: `TE_IGNORE_ANNOTATION = "BestPracticeAnalyzer_IgnoreRules"`; `teIgnoreIds(raw: string): string[] | undefined` (the ids, upper-cased, or undefined when malformed); `isIgnored(object: Ignorable | undefined, ruleId: string, model?: Ignorable): boolean` now true also when the object's or the model's Tabular Editor annotation names the rule. `run.ts`'s `keep` passes `project.model`. Pull request D calls the same `isIgnored` for custom findings.

- [ ] **Step 1:** Tests: the annotation on a column skips that column only; on the model it skips every object, the model included; a lowercase id matches; `ruleids` as the key matches; `pbiplint.ignore` and the Tabular Editor annotation together each work; a malformed value ignores nothing; `teIgnoreIds` on each malformed shape (not JSON, an array, `RuleIDs` not a list, a non-string id) is undefined.
- [ ] **Steps 2 to 5:** Fail, implement, pass, commit.

#### Task C2: report a malformed annotation

**Files:**
- Modify: where `buildModel` reads annotations (`packages/core/src/model/build.ts`) or `packages/core/src/rules/parse-issue.ts`, whichever gives the annotation's own line with least change; `packages/core/src/messages/en.ts` (a reason `parse.tmdl.ignoreAnnotation`); `rules/parse-issue.md` (one Quirks sentence); the message tests.
- Test: `packages/core/test/parse.test.ts` or `rules-model-unread.test.ts`, whichever holds the nearest cases; `packages/core/test/messages.test.ts`.

- [ ] **Step 1:** Tests: a malformed annotation on a perspective in `tests/fixtures/custom-rules.SemanticModel` gives exactly one `PARSE_ISSUE` at its line, with the reason "the BestPracticeAnalyzer_IgnoreRules annotation is not a JSON object with a RuleIDs list, so it ignores nothing"; the line text is quoted as other TMDL issues quote theirs; the perspective's other findings still appear; a well-formed annotation gives none.
- [ ] **Steps 2 to 5:** Fail, implement, pass, commit. `npm run sync:rule-pages` (or `node scripts/sync-rule-pages.mjs`) after the page edit.

#### Task C3: parity on the two fixtures that carry the annotation

**Files:**
- Modify: `packages/core/test/parity.test.ts` (also read `tests/expectations/custom-rules/*.json`), `tests/expectations/custom-rules/custom-rules.json` and `custom-rules-model-ignore.json` (deviations, if any, with `ours`), rule pages' Quirks for any deviation; `packages/core/test/custom-te-evaluate.test.ts` (the `PROBE_SCOPE_PERSPECTIVE` exception's reason now names the parse issue).

- [ ] **Step 1:** Add the two captures to the parity test's list and run it: pbiplint's built-in rules, through the engine, must give Tabular Editor's objects on both fixtures, ignore annotation included.
- [ ] **Step 2:** Each difference is either a bug in C1 (fix it) or an existing, documented quirk of a ported rule that these fixtures happen to show (record it with the four parts CONTRIBUTING's "Deviating from a ported rule" asks for). None is expected from the annotation itself.
- [ ] **Step 3:** `npm test`; commit.

#### Task C4: the words

**Files:**
- Modify: `ignoreHelp` in `packages/core/src/engine/ignore.ts` and its copy in `packages/web/src/build/pages.ts` (a test holds them equal), its test in `packages/core/test/engine.test.ts`; then `node scripts/sync-rule-pages.mjs` for the SARIF help and description data.

- [ ] **Step 1:** Test: for a model rule, `ignoreHelp` gains one sentence after the `pbiplint.ignore` one and before the project switch: "pbiplint also honors Tabular Editor's `BestPracticeAnalyzer_IgnoreRules` annotation: on an object it ignores the rule there, and on the model it ignores the rule on every model object." Report-only and file-only scopes are unchanged.
- [ ] **Steps 2 to 4:** Fail, implement in both copies, pass.
- [ ] **Step 5:** A comment on #118 headed "For the 0.4.0 release summary", under "What can change in your results": projects whose models carry `BestPracticeAnalyzer_IgnoreRules` stop seeing the findings their authors dismissed, and a malformed one is now reported. Commit, whole-branch review, pull request.

### Pull request D, in tasks (added November 20, 2026)

D connects Tabular Editor rule files to the run: `customRules` in the config, custom rules running as rules in the engine, same-id handling, the output, and the CLI. It ships as two pull requests, since D2's review is of a different kind (a development script that reads two repositories' history, and data that may hold nothing but ids, scopes, hashes and severities, because `TabularEditor/BestPracticeRules` has no license), and D1 alone is larger than C. E and F need only D1; the step 1 release waits for both.

- **D1, Tasks D1 to D9:** config, the custom rules entry, the engine, the output, the CLI and `explain`.
- **D2, Tasks D10 to D13:** fingerprints and same-id handling.

Settled for D (builder calls, November 20, 2026):

- **Core reads no file.** The CLI reads each file `customRules` names and passes `{ path, text }` to `readCustomRules`, which lives in a separate entry, `@pbiplint/core/custom-rules`, and returns a `CustomRuleSet` that `lint` takes as `LintOptions.customRules`. `lint` never imports the evaluator, so what `packages/core/src/index.ts` reaches does not grow by the evaluator's size; the site (E) loads the entry only when a config names custom rules; the CLI bundles both. The bundle check holds the entry to its own tripwire.
- **A custom rule is a `Rule`** with `status: "custom"`, so `rules` entries, `failOn`, `rulesRun`, `showOnly` and `keep` (with both ignore annotations) work unchanged. A rule is evaluated only when it runs (one rule per `check`, not one file per call), so a rule the config turns off is never evaluated; each expression is parsed once and the model's view built once per model.
- **Reader problems** (no id, no scope, a report scope, an unknown scope, no expression, over a limit) each become a rule that cannot run: one `RULE_COULD_NOT_FINISH` finding, as section 3 says. A second rule in one file with the same id and different text is a notice, as it is across files.
- **A file the reader refuses whole** (not JSON, or fab-inspector's shape) stops that project's lint with a `ConfigError` naming the file and the reason, as a file that cannot be read does (section 3).
- **Severity:** below 2 is info, 2 up to 3 a warning, 3 and above an error; a missing `Severity` takes the default in Tabular Editor 2's `BestPracticeRule` at a pinned commit (MIT), recorded beside the mapping.
- **Paths:** `customRules` entries are relative to the config's folder; a URL and an absolute path are config errors naming the key, since the site and the pipelines need relative paths.
- **Ids:** compare without regard to case. A custom id equal to `PARSE_ISSUE` or `RULE_COULD_NOT_FINISH` is refused as a rule that cannot run, so neither safety net can be replaced. A custom id holding whitespace runs (two survey files have such ids); see decisions.md for how the quiet output writes it.
- **The JSON `url` of a custom rule** is the custom rules page, `https://pbiplint.com/custom-rules/`, since the contract lists `url` as always present and a rule page link would be wrong for an edited copy.
- **Fingerprint data** holds `{ id, scope, hash, severity }`: without the severity, "the team changed the severity" would be judged against pbiplint's own severity.
- **Interim in D1:** a custom rule whose id is a built-in id is skipped; pbiplint's own rule runs and a notice says so. D2 replaces this with section 4's handling.
- **Output additions appear only when the config names custom rules,** so the one-project goldens never change.
- **Also in D1:** `--rule` accepts custom ids (it checks once the configs are read), and `shareModels` keeps a later project's custom findings on a shared model.

#### Task D1: `customRules` in the config and its schema

**Files:** Modify `packages/core/src/engine/config.ts`, `packages/web/public/schema/pbiplint.config.schema.json`. Test `packages/core/test/engine.test.ts`.

**Interfaces:** `PbiplintConfig.customRules?: string[]`; `ResolvedConfig.customRules: string[]` (as written, in order, `[]` when absent). `ConfigError`s naming the key: `pbiplint.config.json: "customRules" must be a list of paths to rule files`; `pbiplint.config.json: customRules[N] is a URL; customRules takes paths to local files, relative to the folder pbiplint.config.json is in`; the same shape for an empty entry and an absolute path (`/x`, `C:\x`, `\\server\x`).

- [ ] **Step 1:** Tests: entries read in order; absent gives `[]`; a non-list value and a non-string entry refused; `https://`, `http://`, `file:///` refused naming the index; absolute paths refused; `rules\team.json` accepted; the schema's top-level `properties` equal the keys `resolveConfig` accepts.
- [ ] **Steps 2 to 5:** Fail, implement (the schema gains `customRules`, an array of strings with a description and a pattern refusing `://`), pass, commit.

#### Task D2: the custom rules entry and the bundle check

**Files:** Create `packages/core/src/custom-rules/index.ts`. Modify `packages/core/package.json` (`exports` gains `./custom-rules`), `packages/core/scripts/check-browser-bundle.mjs`, `packages/cli/build.mjs`, `packages/cli/tsconfig.json`, `vitest.config.ts` (an alias for `@pbiplint/core/custom-rules` beside the existing one; esbuild must not resolve the subpath through the `@pbiplint/core` alias), `scripts/check-pack.mjs` (`REQUIRED` gains `dist/custom-rules/index.js` and `.d.ts`).

**Interfaces:** the entry re-exports `runTeRules` and its types, and `readCustomRules` from D3. The check bundles `index.ts` as today and fails when any input under `src/custom-rules/` is in it; it then bundles the entry with the same forbidden-API list and its own tripwire, `CUSTOM_LIMIT_KB`, set from the measurement with room for D2's data.

- [ ] **Step 1:** Extend the check; add a throwaway import of the entry to `engine/lint.ts`, see `npm run check:browser` fail naming the custom rules inputs; remove the import.
- [ ] **Step 2:** `npm run check:browser` and `npm run build`; write the dated note above the limits (the entry's size, the core's own code before and after D's wiring). If the core's own code crosses 300 KB from D's wiring alone, raise it in a measured step with a dated note and tell the coordinator.
- [ ] **Step 3:** `npm run check:pack`; commit.

#### Task D3: custom rules as rules

**Files:** Create `packages/core/src/custom-rules/rules.ts`, `packages/core/src/engine/custom.ts` (types and `CustomRuleStop` only, so the engine reaches nothing of the evaluator). Modify `packages/core/src/custom-rules/te/index.ts` (`teRunner`), `te/read.ts` (`TeRuleProblem` gains `kind?: "duplicate"`), `packages/core/src/rules/types.ts`, `packages/core/src/custom-rules/index.ts`. Test `packages/core/test/custom-rules.test.ts`.

**Interfaces:**
- `rules/types.ts`: `RuleStatus` gains `"custom"`; `Rule.category` and `RuleSummary.category` widen to `string` (a test keeps built-in rules to `CATEGORY_ORDER`); `ObjectType` gains `KPI`, `Culture`, `RoleMember`, `Variation`, `Calendar`; `Rule.custom?: { file: string; scopes: string[]; expression: string; teSeverity?: number }`.
- `teSeverity(n: number | undefined): Severity`; `teRunner(model: Model): (rule: TeRule) => TeOutcome` (view cached per model, parse cached per rule); `tomFinding(o: TomObject): RuleFinding` (the object type, name and location the built-in helpers give that object; an object without annotations gets an empty `Ignorable`, so the model's annotation still reaches it).
- `readCustomRules(files: readonly { path: string; text: string }[]): CustomRuleSet`, `CustomRuleSet = { files: { path: string; ids: string[] }[]; rules: Rule[]; notices: Diagnostic[] }`. Each `TeRule` becomes a `Rule`: id as written, name, `description ?? name`, `category ?? "Custom"`, severity from `teSeverity`, scope mapped to `ObjectType`s, `layer: "model"`, `needs: ["model"]`, `skipWhenModelUnread: modelPartlyRead`, `references: []`, and a `check` that runs `teRunner`, maps findings with `tomFinding`, throws `CustomRuleStop(reason)` when the rule could not run, and calls `ctx.notice` when `unset > 0`. Each `TeRuleProblem` without `kind` becomes a `Rule` whose check throws `CustomRuleStop(problem.reason)`. The same id in two files: identical rules (scopes, expression, severity) run once; different rules: the first in `customRules` order runs and a `custom-rule-duplicate` notice names the other file.

- [ ] **Step 1:** Tests: severity 0, 1, 2, 3, 5, missing, -1, 2.5; for every scope, `tomFinding` on a `custom-rules` fixture object gives what the built-in helper gives; a refused file throws a `ConfigError` naming its path; a problem becomes a rule that throws with its reason; a same-file duplicate becomes a notice; two files with an identical rule give one rule, with different rules the first plus a notice; nothing is evaluated until `check` runs; the view is built once for two rules; `PARSE_ISSUE` and `RULE_COULD_NOT_FINISH` as custom ids are refused.
- [ ] **Steps 2 to 5:** Fail, implement, pass, commit.

#### Task D4: the engine runs them

**Files:** Modify `packages/core/src/engine/lint.ts`, `run.ts`, `packages/core/src/rules/types.ts` (`RuleContext.notice?: (d: Diagnostic) => void`), `packages/core/src/project/types.ts` (`DiagnosticKind` gains `custom-rules`, `custom-rule-left-out`, `custom-rule-duplicate`), `packages/core/src/messages/en.ts` (`ruleError.customRule`: `{file}: {reason}`). Test `packages/core/test/custom-rules-engine.test.ts`, `messages.test.ts`.

**Interfaces:** `LintOptions.customRules?: CustomRuleSet`; `RuleError.ruleFile?: string`; `LintSummary.customRules?: { file: string; rules: string[]; asBuiltIn: string[]; replaced: string[]; notRun: string[] }[]`. `lint` binds the config over the built-in rules, then the custom ones in file order. `fail` in `run.ts`, on a `CustomRuleStop`, writes `RuleError { id, message: "<file>: <reason>", ruleFile }` with the kind `msg("ruleError.customRule", { file, reason })` on the model, so the detail reads `TEAM_X could not finish on the model: rules/team.json: <reason>` and `isFailureOf` and `isFindingFor` hold. Each `ctx.notice` reaches `diagnostics`.

- [ ] **Step 1:** Tests on `tests/fixtures/custom-rules.SemanticModel` with rule files written for the test: a custom finding has no `detail`, `messageId` or `params`; it counts in `rulesRun`; `"TEAM_X": "off"` gives skipped `disabled` and is never evaluated; `"TEAM_X": "error"` sets its severity; `failOn: "warning"` fails on a custom warning; `pbiplint.ignore` and `BestPracticeAnalyzer_IgnoreRules` on an object and on the model drop it; a rule that cannot run gives exactly one `RULE_COULD_NOT_FINISH` on the model naming the rule, the file and the reason with no object name from the fixture, fails the default gate, and is gone when its id is turned off; the same for a reader problem; `showOnly(result, ["TEAM_X"])` keeps the failure; a left-out object gives one notice per rule; `unknownRules` never lists a custom id; interim: a custom id equal to a built-in id runs pbiplint's rule and is listed in `asBuiltIn` and the notice; with no `customRules` the result deep-equals today's.
- [ ] **Steps 2 to 5:** Fail, implement, pass, commit.

#### Task D5: ranking and the four formats

**Files:** Modify `packages/core/src/engine/rank.ts`, `packages/core/src/format/json.ts`, `sarif.ts`, `text.ts`, `markdown.ts`, `rules/rule-could-not-finish.md` (one paragraph on a custom rule that cannot run: the cause is in the rule file, and how to turn it off), then `node scripts/sync-rule-pages.mjs`. Test `packages/core/test/format.test.ts`, `engine.test.ts`.

**Interfaces:** `RuleSummary` gains, for a custom rule only, `custom: true`, `ruleFile`, `description`, and its `url` is `https://pbiplint.com/custom-rules/`. `categoryRank(category: string): number`; `byRank` sorts by severity, then `CATEGORY_ORDER`, then custom categories by `localeCompare(b, "en")`, then count, then id. JSON: the group's `rule` carries the three fields, findings unchanged, `summary.customRules` and `ruleErrors[].ruleFile` when set. SARIF: the descriptor's `shortDescription` is the name, `fullDescription` and `help` the description, no `helpUri`, `properties` `{ custom: true, ruleFile }`; `options.help` never used for a custom rule; each result's `properties` carry `custom` and `ruleFile`. Text: the group's second line is `custom rule, rules/team.json` in place of the URL; a custom rule that cannot run gets the notice `The custom rule TEAM_X in rules/team.json could not run: <reason>`, without "please report this". Markdown: the id unlinked, then `custom rule, rules/team.json`, then the description.

- [ ] **Step 1:** Tests: rank order over error groups in `Performance`, `Model Layout`, `2. Data Modelling`, `Formatting` and a warning group; each format's custom group and finding; a built-in-only result formats exactly as before in all four.
- [ ] **Steps 2 to 5:** Fail, implement, pass, commit.

#### Task D6: the CLI reads the rule files

**Files:** Modify `packages/cli/src/config.ts`, `several.ts`, `main.ts`, `packages/core/src/engine/projects.ts` (`shareModels`). Test `packages/cli/test/cli.test.ts`, `several.test.ts`, and the `shareModels` test.

**Interfaces:** `readCustomRuleFiles(found: FoundConfig): CustomRuleSet | undefined` resolves each entry against the config's folder; `ruleFile` is the entry with `\` as `/` and a leading `./` dropped; the size is checked by `stat` against `LIMITS.fileBytes` before reading; a file that cannot be found, read, or is too large is a `ConfigError`: `pbiplint.config.json: customRules: rules/team.json could not be read (ENOENT)`. `lintProject(project, config, custom?)`; `lintSeveral` reads each config's files once inside its existing `try`. `--rule` ids that are not built-in are checked once the configs are read; an id nothing knows gives `noRuleLines` and exit 2.

- [ ] **Step 1:** Tests: a missing file exits 2, stdout empty, stderr naming the config and the file; a folder in a file's place and a file over the limit the same; a URL entry exits 2 naming the key; `customRules: []` gives byte for byte the output of no key; in a several-project run each project runs its own config's rules and one missing file stops the run naming its config; `--rule TEAM_X` shows the custom rule; `shareModels` keeps the custom findings a later project's config adds.
- [ ] **Steps 2 to 5:** Fail, implement, pass, commit.

#### Task D7: `pbiplint explain` for a custom id

**Files:** Modify `packages/cli/src/args.ts` (`explain` takes `--config`), `explain.ts`, `main.ts`. Test `packages/cli/test/explain.test.ts`.

**Interfaces:** `explainRule(input: string, custom?: CustomRuleSet): Explained | NotFound`; the config from `--config` or the nearest from the working folder; a built-in rule wins unless the set replaces it (D2); a custom rule gives `rule: RuleSummary & { description; custom: true; ruleFile; scope: string[]; expression }` and `sections: {}`; `suggest` includes custom ids. Text: id and name; severity, `model layer`, category, `custom rule`; the file, the description, `Scope: ...`, the expression indented.

- [ ] **Step 1:** Tests: a custom id through the nearest config, in text and JSON; the same id in another case; a near miss suggests a custom id; a config whose rule file is missing exits 2 naming it; with no config a custom id exits 2 as today.
- [ ] **Steps 2 to 5:** Fail, implement, pass, commit.

#### Task D8: engine parity on the two annotated fixtures

**Files:** Modify `packages/core/test/custom-te-microsoft.test.ts`, `custom-te-parity.ts`.

- [ ] **Step 1:** Run the vendored `BPARules.json` through `lint` with `rules: [RULE_COULD_NOT_FINISH]` (no built-in rules, so no copy is skipped) and `customRules: readCustomRules(...)` on `custom-rules` and `custom-rules-model-ignore`. Each rule's objects equal the Microsoft capture with the annotation applied by the engine (no `leftOutForAnnotation` skip on this path); statistics rules give `RULE_COULD_NOT_FINISH`; the malformed perspective annotation is C's recorded difference.
- [ ] **Steps 2 to 4:** Run, explain or fix each difference, commit.

#### Task D9: the contract, the end-to-end fixture, and finishing D1

**Files:** Create `packages/cli/test/fixtures/custom-rules/pbiplint.config.json`, `rules/team.json`, `rules/more.json`. Modify `packages/cli/test/contract.test.ts`, `cli.test.ts`, `packages/web/content/cli.md` (the JSON document section only: the new fields, the notice kinds, `ruleErrors[].ruleFile`, `explain --config`; "Configure it" is G's).

The fixture is pbiplint's own words: the config names both files and turns one custom id to `error`; `team.json` holds `TEAM_MEASURES_IN_FOLDERS` (finds), `TEAM_VISIBLE` (reads `Visible` on `Measure`, cannot run), `PROBE_IGNORE_CUSTOM` (always true, skipped by the fixture's annotations), a rule with no `Scope`, and a rule whose id holds a space; `more.json` an identical copy of one team rule and a different rule under another team id. Tests run `--config packages/cli/test/fixtures/custom-rules/pbiplint.config.json tests/fixtures/custom-rules.SemanticModel`.

- [ ] **Step 1:** Contract tests, inline, no new goldens, `fixtures/one-project` untouched: a custom group's `rule` has `custom`, `ruleFile`, `description`; its findings no `detail` or `messageId`; `summary.customRules` has its shape; the `RULE_COULD_NOT_FINISH` finding names the rule and the file; SARIF's descriptor has no `helpUri`, short description the name, help the description; results carry `custom` and `ruleFile`; `executionSuccessful` is `false`; quiet rule lines for custom ids split into three fields; exit 1 at the default gate; test 0 unchanged.
- [ ] **Step 2:** End-to-end in `cli.test.ts`: the text report labels each custom group with its file; stderr carries the duplicate and left-out notices; turning `TEAM_VISIBLE` and the no-scope rule off exits 0.
- [ ] **Step 3:** Fail, implement anything missing, pass.
- [ ] **Step 4:** `npm run build && npm test && npm run typecheck && npm run lint && npm run check:browser && npm run check:pack`; one whole-branch review; open D1 with "For #118." and both measured bundle sizes.

#### Task D10: the fingerprint and the upstream data (D2 starts here)

**Files:** Create `packages/core/src/custom-rules/te/fingerprint.ts`, `scripts/fingerprint-upstream-rules.mjs`, `packages/core/src/custom-rules/te/upstream-rules.data.ts` (generated), `scripts/test/fingerprint-upstream-rules.test.mjs`, `packages/core/test/custom-te-fingerprint.test.ts`. Modify `CONTRIBUTING.md` (the command), `docs/RELEASING.md` (when to regenerate).

**Interfaces:** `fingerprint(expression: string): string` drops every character `isWhiteSpaceCode` (library.ts) calls whitespace, hashes the UTF-8 bytes with 64-bit FNV-1a (offset `cbf29ce484222325`, prime `100000001b3`), returns 16 lowercase hex digits. `scopeKey(scopes: string[]): string`: the scopes as the reader spells them, sorted, joined by `,`. `UPSTREAM_RULES: readonly { id: string; scope: string; hash: string; severity: number }[]`; the header names each source, the commit read up to, and the sha256 of every file version read; no rule text is stored. The script, run by hand and never in CI: `node scripts/fingerprint-upstream-rules.mjs <scratchDir>` clones `microsoft/Analysis-Services` and `TabularEditor/BestPracticeRules` into the scratch folder up to commits pinned in the script, reads every version of each rule file in their history (Microsoft's `BPARules*.json` in every language, and the Tabular Editor repository's rule files), keeps ids pbiplint's built-in rules carry, removes duplicates, sorts, writes the data; its pure part, `fingerprintVersions(files)`, is exported for the test.

- [ ] **Step 1:** Tests: FNV-1a vectors (`""` gives `cbf29ce484222325`, `"a"` gives `af63dc4c8601ec8c`); whitespace ignored; the script's hash agrees with core's; `fingerprintVersions` on two hand-made versions; every data id is a built-in id; every rule of the vendored `BPARules.json` matches an entry; sorted, no duplicates.
- [ ] **Steps 2 to 4:** Fail, implement, run the script once into a fresh scratch folder, pass.
- [ ] **Step 5:** Measure the entry again and adjust `CUSTOM_LIMIT_KB` with a dated note if needed; commit.

#### Task D11: same-id handling

**Files:** Modify `packages/core/src/custom-rules/rules.ts`, `packages/core/src/engine/lint.ts` (replaces D1's interim), `packages/cli/src/explain.ts`. Test `custom-rules-engine.test.ts`, `explain.test.ts`.

**Interfaces:** each custom rule whose id (any case) has upstream entries gets `upstream: "unchanged" | "edited"` and `upstreamSeverityChanged?: Severity`. Unchanged (scope key and hash match a published version): the copy is dropped and listed in `asBuiltIn`; when its mapped severity matches none of the matching versions' mapped severities, pbiplint's rule takes the copy's severity, unless the config sets one. Edited: it replaces the built-in rule for the project and is listed in `replaced`. One `custom-rules` notice per project, per file: how many rules it holds, how many pbiplint runs as its own, which ids it replaces, how many run as the team's.

- [ ] **Step 1:** Tests: an unchanged copy with reflowed whitespace is skipped and pbiplint's rule runs with its page; an older published version counts as unchanged; a copy with severity 3 where upstream says 2 makes pbiplint's rule an error, and the config's severity beats the copy's; a changed scope counts as edited; an edited copy's findings come from the team's rule under its id (custom group, pbiplint's rule does not run, SARIF help is the description); the same unchanged copy in two files is counted once; the notice and `summary.customRules`; `explain` on an edited id shows the team's rule and says it replaces pbiplint's.
- [ ] **Steps 2 to 5:** Fail, implement, pass, commit.
- A copy the reader could not read (no scope, a report scope, an unknown scope, no expression, over a limit) never replaces pbiplint's rule, and is reported as every rule the reader could not read is (spec sections 3 and 6.7): pbiplint's rule runs, and the copy runs beside it as one RULE_COULD_NOT_FINISH finding naming its id, its file, and the reader's reason, which fails a gated run. It is in neither `asBuiltIn` nor `replaced` but in `notRun` (`Rule.custom.readProblem` marks it), and the file's `custom-rules` notice names its id. The id's group is pbiplint's rule, the config's settings for the id bind to pbiplint's rule (the first rule with an id), and `"ID": "off"` turns off both. A safety net's id keeps its handling, and a copy read fine that fails while it runs stays edited.
- `asBuiltIn` and `replaced` are per file, from each kept rule's file: a copy left out as a `custom-rule-duplicate` (a different rule with the id earlier in `customRules`) is in neither list of its file, and a copy identical to an earlier one is the earlier file's. The notice counts as the team's only the file's kept rules that can run, and names each id whose severity pbiplint's rule takes from the file (`HIDE_FOREIGN_KEYS at error`).

#### Task D12: the fingerprints against the survey

**Files:** Modify `packages/core/test/custom-te-survey.test.ts`.

- [ ] **Step 1:** Every rule in Microsoft's and Tabular Editor's own files in the survey classifies as unchanged; across team files at least 901 of the 970 copies are unchanged; the test prints each edited copy's file id and rule id.
- [ ] **Step 2:** Run locally with `PBIPLINT_SURVEY_DIR`; a copy that looks unchanged but classifies as edited goes to the coordinator before going on. Commit.

#### Task D13: the end-to-end copies and finishing D2

**Files:** Modify `packages/cli/test/fixtures/custom-rules/rules/team.json`, `contract.test.ts`, `cli.test.ts`.

- [ ] **Step 1:** `team.json` gains three copies, their expressions from the vendored Microsoft file (MIT): an unchanged rule with reflowed whitespace, an unchanged rule with its severity changed, an edited rule. Tests: the unchanged copy's group is pbiplint's rule with its URL; the severity-changed copy shows that severity; the edited copy's group is custom; `summary.customRules` lists each; the notice names the replaced id.
- [ ] **Step 2:** Fail, pass.
- [ ] **Step 3:** Full checks; one whole-branch review; open D2 with "For #118.".

Heads-up for E: `packages/web/src/results/render.ts` filters groups by `CATEGORY_ORDER`, so the site would hide custom categories until E changes it.

### Pull request E, in tasks (added November 20, 2026)

E brings custom rules to the site. When a dropped folder's `pbiplint.config.json` names rule files, the page opens those files from inside the dropped folder only, hands them to `@pbiplint/core/custom-rules`, and shows each finding as the team's rule, with its file and its description.

Settled for E (November 20, 2026):

- **When the code loads (decided by Michael, November 20, 2026):** the custom rules entry is a chunk of the site's own, fetched from the same origin once the page has loaded and is idle, before any drop. Every Promise sentence and check stays true word for word: no request follows a drop, and custom rules work offline once the page has loaded. The CSP is unchanged (`script-src 'self'` allows it), and the self-hosting build carries the chunk.
- **The walkers keep a handle on every file they pass, and open none of them.** Today the folder readers open only the files they want, decided before any config is read, so a rule file would never be read. Each walker records an unopened opener for every file it passes outside a skipped folder (the entry's `file()` for a drop, the handle's `getFile()` for the picker, the `File` itself for the directory input). Once the config is read, the rule file reader opens only the files it names, and nothing else.
- **Inside the dropped folder:** an entry resolves against the config's folder in the drop (`\` read as `/`, `.` and `..` applied). It is outside when it climbs above the top of the drop, or when its first segment is not something that was dropped.
- **The CLI's words where the cause is the same** (the size limit, a file that could not be read); words of the site's own where only the site has the cause (outside the folder, not in the folder, inside a folder the walk skips, a folder in a file's place). `ruleFileName` moves from the CLI to core's main entry so the two cannot name files differently.
- **Every config's rule files are read before anything is linted,** so one missing file refuses the drop and names its config; a config several projects share is read once.
- **No rule file text becomes a link or markup:** name, description, category and file are text, through `showControls`.

#### Task E1: the walkers keep a handle on every file

**Files:** Modify `packages/web/src/input/project-files.ts` (`InputTree`, `emptyTree`), `read-drop.ts` (`walkEntry`, `readLoose`), `pick-folder.ts` (`walkHandle`, `readDirectoryInput`), `packages/web/src/sample.ts` if its tree is a literal. Test `packages/web/test/read-drop.test.ts`, `pick-folder.test.ts`, `projects-below.test.ts`.

**Interfaces:** `export type OpenFile = () => Promise<File>`; `InputTree.handles: Map<string, OpenFile>`, every file the walk passed outside a skipped folder, by drop-relative path, wanted or not, never opened by the walk; `emptyTree()` gives an empty map. Markers (`.pbix`, `model.bim`, `report.json`) get no handle.

- [ ] **Step 1:** Tests: on each route, a drop or pick holding `rules/team.json` gives it a handle whose `file()`/`getFile()` is never called by the walk; a file under `.git`, `node_modules`, `.pbi` or `StaticResources` (outside the theme paths) has none; nothing below the depth cap; a `.pbix` has none; a wanted file has both an entry and a handle; the directory input keeps its `File` objects after the input's value is cleared.
- [ ] **Steps 2 to 5:** Fail, implement, pass, commit.

#### Task E2: the rule file reader and the chunk

**Files:** Create `packages/web/src/rule-files.ts`, `packages/web/src/custom-rules.ts` (re-exports `readCustomRules`, `LIMITS` and the `CustomRuleSet` type from `@pbiplint/core/custom-rules`, nothing else). Modify `packages/web/vite.config.ts` (`resolve.alias` becomes the exact-match array `vitest.config.ts` uses), `packages/web/tsconfig.json` (`paths` gains the subpath), `packages/web/src/build/check-site.ts`, `packages/core/src/engine/config.ts` and `packages/core/src/index.ts` (`ruleFileName`), `packages/cli/src/config.ts` (imports it). Test `packages/web/test/rule-files.test.ts`, `check-site.test.ts`, the moved `ruleFileName` cases in `packages/core/test/engine.test.ts`.

**Interfaces:**
- `ruleFilePath(configPath: string, entry: string): string | undefined`: the drop-relative path, or `undefined` above the top of the drop.
- `loadCustomRules(): Promise<typeof import("./custom-rules.js")>`: the dynamic import, one promise per page; a rejection clears it and throws `new InputError(CUSTOM_RULES_LOAD_FAILED)`. `preloadCustomRules(): void` calls it once the page is idle (`requestIdleCallback`, or a `setTimeout` fallback, after `load`), swallowing errors (a later drop retries).
- `readRuleFiles(config: { path: string; text: string }, entries: readonly string[], handles: ReadonlyMap<string, OpenFile>, load = loadCustomRules): Promise<{ set: CustomRuleSet; opened: string[] } | undefined>`: `undefined` without calling `load` when `entries` is empty; otherwise each entry in order is checked, opened (size first against `LIMITS.fileBytes`, then `text()`), and passed as `{ path: ruleFileName(entry), text }` to `readCustomRules`; `opened` holds the drop-relative paths.
- Refusals are `ConfigError`s (`named` in `lint-projects.ts` rewrites the leading `pbiplint.config.json` into the config's path in the drop):
  - `pbiplint.config.json: customRules: ../rules/team.json is outside the folder you dropped or chose; drop or choose the folder that holds both the project and its rule files`
  - `pbiplint.config.json: customRules: rules/team.json is not in the folder you dropped or chose; the path is relative to the folder pbiplint.config.json is in`
  - `pbiplint.config.json: customRules: .git/team.json is inside a .git folder, which pbiplint never opens; move the rule file to another folder` (the skipped folder's own name)
  - `pbiplint.config.json: customRules: rules is a folder; customRules takes paths to rule files`
  - the CLI's: `pbiplint.config.json: customRules: rules/team.json is 2,000,000 bytes, over the limit of 1,048,576 bytes for a rule file`, and `... could not be read (<the browser's message>)`
- `CUSTOM_RULES_LOAD_FAILED = "pbiplint could not load its custom rules code from this site, so the folder was not linted. Reload the page, then drop or choose the folder again."`
- `check-site.ts`: `checkChunks(dir)` finds exactly one `assets/custom-rules-*.js` and checks no other `.js` holds `CUSTOM_RULES_PROBE` (the text of the entry's `STATISTICS_REASON`; a test holds them equal), in both builds; `scriptSizes(dir)` gives `home` (the module script in `index.html` plus its `modulepreload` files) and `chunk`, raw and gzipped; the plugin prints `home page scripts: N KB (G KB gzipped); custom rules chunk: N KB (G KB gzipped)`.

- [ ] **Step 1:** The baseline: add `scriptSizes` and its line first, with its test; commit; record the line from `npm run build -w @pbiplint/web` (the "before").
- [ ] **Step 2:** Tests: `ruleFilePath` cases (`rules/team.json`, `./rules/team.json`, `rules\team.json`, `rules/../rules/team.json`, `../x.json` from a nested config, `../../x.json` above the top); each refusal word for word; outside when several items were dropped; size checked before `text()`; `load` never called for `[]` and once for two configs; a rejecting `load` gives `CUSTOM_RULES_LOAD_FAILED` and a second call retries; `preloadCustomRules` calls `load` once after idle and a failure is swallowed; a file the reader refuses whole gives core's `ConfigError`; `checkChunks` on fake dists; `ruleFileName` as the CLI's.
- [ ] **Steps 3 to 5:** Fail, implement, pass.
- [ ] **Step 6:** Both builds (`npm run build -w @pbiplint/web`, and with `-- --mode self-host`) print the chunk and pass the site check; record the "after"; `npm run check:browser`; commit.

#### Task E3: lint with them

**Files:** Modify `packages/web/src/main.ts` (`run`, `runSeveral`, `runEntries`, and `preloadCustomRules` at start-up), `packages/web/src/lint-projects.ts`. Test `packages/web/test/home.test.ts`, `projects-below.test.ts`.

**Interfaces:** `Run` gains `handles?: ReadonlyMap<string, OpenFile>`; `runEntries(tree)` passes `tree.handles`; the paste and the sample pass none. `run` resolves the config, awaits `readRuleFiles`, checks `superseded(token)`, lints with `customRules: read?.set`, and lists each rule file as `relativeToRoot(root, path) + " (custom rules)"`. `lintProjects(projects, before, handles = new Map())` reads each config's rule files once, keyed by its path, before the first `before(i)`, refusals through `named`; it returns `ruleFiles: string[][]` as well, which `runSeveral` appends to each project's files.

- [ ] **Step 1:** Tests: a tree with `Team/custom-rules.SemanticModel`, `Team/pbiplint.config.json`, `Team/rules/team.json` (texts from `packages/cli/test/fixtures/custom-rules/`) shows a custom group and lists the rule file; a config without `customRules` never calls the loader and its results are unchanged; a superseded drop renders nothing; each refusal reaches the status line and clears results; the CLI's `lintSeveral` and the site's `lintProjects` on the same folder give the same groups, `summary.customRules` and diagnostics; two projects under one config read its files once; one project's missing file refuses the drop naming its config; core's "this run was not given them" refusal never appears.
- [ ] **Steps 2 to 5:** Fail, implement, pass, commit.

#### Task E4: the results

**Files:** Modify `packages/web/src/results/render.ts`, `packages/web/src/styles.css`. Test `packages/web/test/render.test.ts`, `styles.test.ts`.

**Interfaces:** `TEAM_RULE = "Your team's rule"`. A custom group: the summary gains `<span class="team-tag">Your team's rule</span>` after the layer tag; the meta line reads `<code>TEAM_X</code> · Team conventions · rules/team.json`; under it `<p class="rule-description">` (with `white-space: pre-line`) holds the description; "Fix these first" shows `Your team's rule` where the rule link would be; no custom group links to `/rules/`. `categoriesOf(groups): string[]`: the eight in `CATEGORY_ORDER`, then the others by `localeCompare(b, "en")`. `groupSlugs(groups)`: unique slugs, a custom id whose slug is empty or taken gets `-2`, `-3`.

- [ ] **Step 1:** Tests: tag, file and description, no rule link; a built-in group renders as before; the custom category's filter box after the eight works; two custom categories sort alphabetically; `TEAM_FLOAT COLUMNS` and `TEAM_FLOAT_COLUMNS` get two ids and their own fix-first links; a description with a newline and a bidi control shows as text; the custom rule that could not run is in the notices with its file; every new class meets the contrast checks in both themes.
- [ ] **Steps 2 to 5:** Fail, implement, pass, commit.

#### Task E5: the export for an assistant

**Files:** Modify `packages/web/src/results/export.ts`. Test `packages/web/test/export.test.ts`.

**Interfaces:** `ASSISTANT_CUSTOM_NOTE`, under the preamble only when a group is custom: "A rule marked as the team's own comes from the team's rule file, named beside it. Its description is the only guidance there is, and `npx pbiplint explain <RULE_ID>` prints its expression. Fix the project to meet the rule, or, if the rule itself is wrong, its file." A custom rule's last line is `Custom rules in pbiplint: https://pbiplint.com/custom-rules/` in place of `Rule page:`.

- [ ] **Step 1:** Tests: no custom group gives the export byte for byte as before; a custom group gives the note once, its description and file, no "How to fix it", and the custom rules line; the Markdown and JSON downloads carry the custom fields.
- [ ] **Steps 2 to 4:** Fail, implement, pass, commit.

#### Task E6: the words the behaviour needs

**Files:** Modify `packages/web/index.html` (the hint under the drop zone), and `packages/web/content/privacy.md` (the site paragraph's list of files opened only: add the rule files `customRules` names, from 0.4.0). The rest of the privacy page, the CLI and pipelines lists, the skill sentence, and the custom rules page are G's.

- [ ] **Step 1:** The hint reads: "Only .tmdl files, the report's JSON under its definition folder, .platform, definition.pbir, the .pbip file, pbiplint.config.json, and the rule files it names under customRules are read. Nothing else in the folder is opened." The privacy page's site list gains the rule files. Checks 1 and 2 and the self-hosting page stay as they are.
- [ ] **Step 2:** `npm test`; commit.

#### Task E7: end to end, and finishing E

**Files:** Create `packages/web/e2e/custom-rules.spec.ts` (folders built in `withTempFolder` from `tests/fixtures/custom-rules.SemanticModel` and `packages/cli/test/fixtures/custom-rules/`, given with `setFolder`).

- [ ] **Step 1:** Tests in all three engines (`fixtures.ts` already fails a test on a console error or a request off the origin): giving `Team/` shows the team's group with "Your team's rule", its file and description, the `TEAM_VISIBLE` notice, the custom category's filter, and the rule file among the files read; the request to `/assets/custom-rules-` happens on the page's origin before the drop and none follows the drop; the sample and a folder with no `customRules` give the same requests as before (the chunk is fetched at idle either way); an axe scan of the results is clean; "Copy for an AI assistant" (Chromium) holds the team's rule and its file; a config naming `../rules/team.json` with only the model folder given shows the outside message and no results; a missing file shows the not-in-the-folder message.
- [ ] **Step 2:** `npm run build && npm test && npm run typecheck && npm run lint && npm run check:browser && npm run check:pack && npm run test:e2e`; `npm run build -w @pbiplint/web -- --mode self-host && npm run check:egress`; `node scripts/site-archive.mjs <scratch folder>` and confirm the zip lists `assets/custom-rules-`.
- [ ] **Step 3:** One whole-branch review. Open E with "For #118.", the home page scripts before and after, the chunk, each in KB and gzipped KB, and the egress check and the privacy checks passing as written.
