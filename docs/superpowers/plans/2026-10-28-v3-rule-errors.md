# A Rule That Cannot Finish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** [#238](https://github.com/pbiplint/pbiplint/issues/238), part of v3 ([#78](https://github.com/pbiplint/pbiplint/issues/78)): a rule that cannot finish on an object or query becomes an `error` finding of a new built-in rule, `RULE_COULD_NOT_FINISH`, so the default `fail-on: error` fails a gated run with exit 1, SARIF's `executionSuccessful` goes false, the error's text never prints a secret, and the rule's page says what it means, what to do now, and how to report it.

**Architecture:** One choke point sanitizes the error: wherever the engine records a `RuleError` (`packages/core/src/engine/run.ts`), the thrown value is reduced to its class by `errorKind` (`packages/core/src/engine/rule-error.ts`), so the JSON's `ruleErrors`, every notice, the CLI's stderr, SARIF, and the new finding all carry the same safe text. `RuleContext.reportError` gains the site of the error (a label and the query owner's `RuleFinding`), and after every rule has run the engine writes one `RULE_COULD_NOT_FINISH` finding per failed rule and object, honoring that rule's own config and `pbiplint.ignore`. The rule itself is a registered `Rule` whose `check` returns nothing, so config binding, ranking, severity overrides, pages, and SARIF metadata work as for any rule.

**Tech Stack:** TypeScript, Vitest (with `vi.mock` for the CLI's planted proof), esbuild (`check:browser`), the rule page generator and `sync-rule-pages.mjs`.

**Spec:** `docs/superpowers/specs/2026-10-12-pbiplint-v3-power-query-layer-design.md`, sections 3.4, 9.1, and 11.3; the issue body of #238. Pull request 9's plan (`docs/superpowers/plans/2026-10-27-v3-hardening.md`) is the pattern this plan follows.

## Rulings

Measured on October 28, 2026 against `v3/rule-errors` at 06012fb, with a prototype of Tasks 1 to 3 in a scratch folder (typechecked, and run through `lint` with a rule that throws per query and one that throws whole).

### The finding

- **ID, name, category, layer:** `RULE_COULD_NOT_FINISH`, "Rule could not finish", `Error Prevention`, `project`, severity `error` (3), status `builtin`, `needs: []`, `references: []`, scope `[Model, Table, Partition, NamedExpression, Report]` (every object the finding can name; `Table` is a refresh policy's query). It sits in `defaultRules` right after `PARSE_ISSUE`.
- **Produced in the engine, from the rule errors**, not by a rule reading them: a rule that read `ruleErrors` would have to run last, and `defaultRules` order is a public, tested list. `RULE_COULD_NOT_FINISH.check` returns `[]`; it runs in the loop like any rule (so it is in `rulesRun`, or in `rulesSkipped` as `disabled`), and after the loop, only when it is in `rulesRun`, `runRules` writes its findings. So:
  - **Its own config works as for any rule:** `"RULE_COULD_NOT_FINISH": "warning"` lowers it through `rank`; `"off"` writes none.
  - **A failing rule turned off never runs, so it cannot fail:** no rule error, no finding.
  - **A caller whose `rules` leave it out gets no finding,** only `ruleErrors`, as one that leaves out `PARSE_ISSUE` gets no parse findings.
- **One finding per failed rule and object** (keyed on the failed rule's id, `objectType`, `objectName`, and `objectId`). `ruleErrors` keeps every entry, as today.
- **The object it names:**
  - **An error inside `eachQuery`:** the query's owner, as `mFinding` names it (the partition, the shared expression, or the refresh policy's table), at the owner's location. `pbiplint.ignore` on that object in TMDL matches.
  - **An error thrown out of `check`** (a whole-model or whole-report rule, or code outside `eachQuery`): `finding.model(project.model)` when the model is present and the rule's layer is not `report`; else `reportFinding.report(project.report)` (object type `Report`, id `report`); with neither present (a `needs: []` rule on empty input), `objectType: "Model"`, `objectName: "Model"`, no location and no object. The model's annotation in `model.tmdl` matches; a report has nowhere to annotate (`ignoreHelp`'s report case), so there the ways out are the severity and turning a rule off.
- **The detail:** `<FAILED_RULE> could not finish on <where>: <kind>`, where `<where>` is the query label (`query 'Sales'`, with `, partition '...'` as `queryLabel` writes it), `the model`, or `the report`. Example: `LOCAL_DRIVE_PATH could not finish on query 'Sales': TypeError`.
- **Refinement: the detail carries no link.** Every format already prints the rule's page with its group (the text format's URL line, Markdown's link, the JSON's `rule.url`, SARIF's `helpUri` and help block), so a URL in each detail would repeat it per finding.
- **Refinement: `pbiplint.ignore` naming the failed rule also drops the finding.** An object that ignores `LOCAL_DRIVE_PATH` has already asked not to hear from that rule there, and the rule's findings on it would have been dropped anyway. `RULE_COULD_NOT_FINISH` and `*` match as usual. A dropped finding counts in `ignored`; `ruleErrors`, the notices, and the summary's ", 1 rule could not finish" still say it, so nothing goes quiet.

### The error text

- **Choice: keep only the error's class** (`errorKind`), and no masking. An exception message is free text with no syntax: `PARSE_ISSUE`'s masking finds secrets by M and TMDL quoting, and a message such as `Cannot read properties of undefined (reading '...')` or one a rule builds by interpolation can hold a value with no quotes around it, so masking it would fail open. The class fails closed. The cost is the message a maintainer would read; the report the page asks for (the rule, the object, the version, the smallest sanitized file) reproduces it.
- **`errorKind(e: unknown): string`:**
  - An `Error` whose `name` is one of `Error`, `TypeError`, `RangeError`, `SyntaxError`, `ReferenceError`, `EvalError`, `URIError`, `AggregateError`, `InternalError` gives that name; any other name gives `Error` (a name is a writable property, so it is untrusted too).
  - The engine's stack overflow is named, since it is the likeliest real failure on deep M and the message is compared, never printed: a message exactly `Maximum call stack size exceeded` (V8, WebKit's is `Maximum call stack size exceeded.`, also matched) or `too much recursion` (Firefox) adds ` (out of stack space)`: `RangeError (out of stack space)`, `InternalError (out of stack space)`.
  - Anything thrown that is not an `Error` gives `a value that is not an Error`.
  - Reading `name` or `message` that throws (a hostile getter) gives `Error`.
- **Same treatment everywhere:** the `RuleError.message` the engine records becomes `<label>: <kind>` for an error inside `eachQuery` and `<kind>` for a whole throw. The JSON's `ruleErrors`, the text and Markdown notices, the site's notices, SARIF's notification, and the CLI's `rule X failed:` stderr line all read it, so all are fixed at the source. The JSON's shape (`id`, `message`) is unchanged.

### Gating

- No new exit code: the `error` finding fails the default gate through `LintResult.failed`, exit 1.
- SARIF: `executionSuccessful` is `result.summary.ruleErrors.length === 0` (a run with only unread files keeps `true`, as today).
- The summary's ", N rule could not finish" and the JSON's `ruleErrors` are unchanged.

### Guidance

- **The page** `rules/rule-could-not-finish.md` has What it checks, Why it matters, How to fix it, When to ignore it, Links, and **no Example**: an input that makes a rule fail is a pbiplint bug, fixed when found, so no snippet could stand on the page. Refinement: `rule-pages.test.ts` gains a one-rule exemption (`NO_EXAMPLE`) that forbids the Example section for this rule and skips `checkExample`, with that reason in its comment.
- **The ways out go in How to fix it**, since When to ignore it may not carry `pbiplint.ignore` or `"off"` (the generator appends `ignoreHelp`'s TMDL form there, which names `RULE_COULD_NOT_FINISH`).
- **An issue template, yes:** `.github/ISSUE_TEMPLATE/rule-could-not-finish.md`. The page's Links section opens it (`https://github.com/pbiplint/pbiplint/issues/new?template=rule-could-not-finish.md`), so a reporter is asked for exactly the four things and reminded to sanitize before anything is posted. It costs no bundle bytes.

### The core's budget

- **Base:** 243,910 bytes (238.2 KB) against `OWN_LIMIT_KB = 240` (245,760 bytes).
- **Prototype of Tasks 1 to 3:** 245,671 bytes (239.9 KB), +1,761: `errorKind` and the engine's findings about 1,100, the rule object about 250, and its page's first paragraph in `rule-summaries.data.ts` about 300 (a 290-character paragraph). The real page's paragraph and the hostile-getter guard will very likely take it past 245,760.
- **Proposed limit: 245 KB** (250,880 bytes): the measured size, about 240 KB, plus 5 KB for 0.3.x. Why 5 and not 10: pull request 8's 10 KB "for 0.3.x" went 8.1 KB into pull request 9's hardening before 0.3.0 shipped, a tripwire with too much room stops being one, and 0.3.x releases are fixes; 5 KB is about four rule-sized changes at pull request 4's measured 1.10 KB a rule.
- **The task whose measurement crosses 245,760 bytes** (expected: Task 3) sets `OWN_LIMIT_KB = 245`, rewrites the tripwire comment, and adds a dated amendment to spec 3.4 with the per-file bytes. Each task records `bytes.mjs` in `progress.md`.

### The corpus

- **Expected: zero changes,** `rule errors: 0 base, 0 head` (pull request 9's run). If any corpus model makes a rule fail, the task stops and reports to pb-coord with the rule ids and counts only.

## Global Constraints

- **Base branch:** `release/0.3.0`, never main. Branch `v3/rule-errors` from `release/0.3.0` at 06012fb (pull requests 1 to 9). Work in a worktree, never in the main checkout; the one file outside the worktree a task edits is the local release notes draft (Task 4), reached through the worktree's `.superpowers` link.
- **No em dashes anywhere** (code, comments, docs, pages, commits; `rule-pages.test.ts` checks pages for U+2014). Restructure with a comma, colon, parentheses, or two sentences.
- **Long-form dates in prose** ("October 28, 2026"), except in file names and front matter. **Capitalized bullets** in every list.
- **Rule pages** are pbiplint's own prose.
- **The Privacy Promise** and **the Promise** take a capital P. This plan does not change the Promise.
- **Counts only from the corpus:** public text carries counts, never a corpus path, line, value, model or repository name.
- **Secret hygiene:** never print a fake or real secret value. Tests refer to fixture values through `fakeSecrets()` and `leaks()`; a unit test that needs one builds it with m-zoo's form through a helper, and the plan names none.
- **Core stays browser-pure:** no Node built-in, no `process.`, no network API in `packages/core/src`.
- **The core budget** is `OWN_LIMIT_KB` in `packages/core/scripts/check-browser-bundle.mjs`, compared in bytes. Only the crossing task changes it, to 245 (Rulings).
- **TDD:** every behavior gets a test that fails before its code; each task's Step 2 records the failure in `progress.md`. The suite stays green at every commit: `npm test`, `npm run lint`, `npm run typecheck`, `npm run check:browser`. Each task moves the count and format pins it breaks, and no other.
- **Formatting:** `npx prettier --write` on every changed `.ts`, `.mts`, `.mjs`, `.json`, and `.md` file outside `tests/fixtures/` and `tests/expectations/`, then `npm run lint`.
- **Generated data:** after any page edit, `npm run build -w @pbiplint/core && node scripts/sync-rule-pages.mjs`, and commit the `.data.ts` files it rewrites.
- **Folder inputs in e2e** go through `setFolder` from `packages/web/e2e/folder-input.ts`.
- **Commits:** each message ends with `Part of #78.`, a blank line, and `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Never a closing keyword next to an issue number.
- **Subagents** run on Opus 5.5 and share the worktree, so one edits files at a time.
- **Command rules** (pb-coord, October 28, 2026; hard rules):
  - Scratch only in a scratch folder, never /tmp.
  - Every experiment goes in a fresh folder from `mktemp -d <scratch-folder>/rule-errors.XXXX`, used by its printed literal path.
  - Never `rm -rf` or `rm -r` with a glob or a variable path.
  - No sudo, no `git clean`, `git reset --hard`, `git checkout -- .`, `git stash`, or any push. Stage files by name.
  - If a command might ask for permission, rewrite it so it cannot. Never wait on a prompt. `npx --yes tsx` runs tsx without asking.
  - `timeout` is not installed on this Mac. Anything that could run long goes through a Node wrapper that kills its process group (spawn with `detached: true`, then `process.kill(-pid)`). A working one is `run.mjs` in a scratch folder (`node run.mjs <ms> <label> <outPrefix> -- <command> [args...]`).
  - Use `gh-pb` (never `gh auth switch`) for read-only GitHub calls.
- **The plan's workspace** is `.superpowers/sdd/2026-10-28-v3-rule-errors/` (git-ignored). Reused: `bytes.mjs` from `.superpowers/sdd/2026-10-13-v3-rules-resolver/`, and pull request 9's `corpus-diff.mts` (which prints rule errors) from `.superpowers/sdd/2026-10-27-v3-hardening/`.
- **The corpus** (in the maintainer's research folder) is not pbiplint's.

## Review Focus

- **A rule that throws whole on a report-only project.** It must name the `Report` (id `report`), not crash on a missing model. Task 2 pins it.
- **A thrown value with a hostile `name` getter, or a thrown string.** The engine must still record the error and go on, as `Error` and `a value that is not an Error`. Task 1 pins both.
- **A secret in the error's message reaching any output** (the four formats, quiet, `--output`, stderr, the MCP lint tool, the site's page and its three exports). Task 1's planted rule pins every one.
- **`--rule` naming the rule that failed.** `showOnly` keeps only the named rules' groups, so `--rule LOCAL_DRIVE_PATH` drops the `RULE_COULD_NOT_FINISH` finding and passes the gate, as it drops `PARSE_ISSUE` today; the summary line still says ", 1 rule could not finish". Unchanged here and pinned as is in Task 3, for pb-coord's decision (below).
- **The same object failing twice in one rule** (a rule that reports two errors for one query, or a query error and then a whole throw on another object). One finding per rule and object, every error still in `ruleErrors`. Task 2 pins it.

## File Structure

| File | Task | Responsibility |
| --- | --- | --- |
| `packages/core/src/engine/rule-error.ts` (new) | 1 | `errorKind` |
| `packages/core/src/rules/types.ts` | 1 | `ErrorSite`, `RuleContext.reportError` |
| `packages/core/src/rules/m-helpers.ts` | 1 | `eachQuery` reports the site; `ownerFinding` exported |
| `packages/core/src/engine/run.ts` | 1, 2 | Sanitized `RuleError`s; the findings |
| `packages/core/src/rules/rule-could-not-finish.ts` (new) | 2, 3 | The rule |
| `packages/core/src/format/sarif.ts` | 2 | `executionSuccessful` |
| `packages/core/src/rules/index.ts`, `packages/core/src/index.ts` | 2, 3 | Export, then registration |
| `tests/support/planted-rule.ts` (new) | 1 | The rule that throws a fixture's M |
| `packages/core/test/rule-error.test.ts`, `packages/core/test/rule-could-not-finish.test.ts` (new) | 1, 2 | Unit tests |
| `packages/core/test/secret-masking.test.ts`, `packages/web/test/secret-masking.test.ts`, `packages/cli/test/rule-error-secrets.test.ts` (new) | 1, 3 | The guard's new path; the CLI's gate |
| `rules/rule-could-not-finish.md` (new), the generated `.data.ts` files | 3 | The page |
| `packages/core/test/rule-pages.test.ts` | 3 | `NO_EXAMPLE` |
| `.github/ISSUE_TEMPLATE/rule-could-not-finish.md` (new) | 3 | The report |
| `packages/core/scripts/check-browser-bundle.mjs`, spec 3.4 | 3 (the crossing task) | 245 KB |
| READMEs, `packages/web/content/about.md`, `pack.test.ts`, `generate.test.ts` | 3 | 122 rules, 40 built in |
| `packages/web/content/cli.md`, spec 9.1 and 11.3 | 4 | Contract, exit codes, amendments |
| `.superpowers/sdd/2026-10-13-release-0.3.0/release-notes.md` (local) | 4 | Two lines |

---

## Before Task 1

```bash
git switch v3/rule-errors
git status --short          # expected: only this plan, untracked
pb-worktree-setup
mkdir -p .superpowers/sdd/2026-10-28-v3-rule-errors
git add docs/superpowers/plans/2026-10-28-v3-rule-errors.md
git commit -m "docs: the plan for a rule that cannot finish

Part of #78.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
npm test 2>&1 | tail -5
node .superpowers/sdd/2026-10-13-v3-rules-resolver/bytes.mjs | tail -1
```

Expected: the suite passes; `bytes.mjs` prints `core's own code 243910 bytes, 238.2 KB`. Write it into `.superpowers/sdd/2026-10-28-v3-rule-errors/progress.md` as **the base measurement**; if anything differs, stop and report.

Unpack the base core: run `mktemp -d <scratch-folder>/rule-errors.XXXX`, call the printed path `<base>` and type it literally, then:

```bash
git archive 06012fb packages/core | tar -x -C <base>
ln -s "$PWD/node_modules" <base>/node_modules
ln -s "$PWD/packages/core/node_modules" <base>/packages/core/node_modules
node <scratch-folder>/run.mjs 1800000 corpus-0 <scratch-folder>/rule-errors-corpus-0 -- npx --yes tsx .superpowers/sdd/2026-10-27-v3-hardening/corpus-diff.mts <base> <research-folder>/research-104
grep -E "models linted|^[+-][0-9]|ERROR|RULE ERRORS|rule errors:|no finding changed" <scratch-folder>/rule-errors-corpus-0.out
```

Expected: `1321 models linted`, `rule errors: 0 base, 0 head`, `no finding changed`. Write `<base>` and the lines into `progress.md`.

---

### Task 1: The error's text is its class alone, in every output

**Files:**
- Create: `packages/core/src/engine/rule-error.ts`, `tests/support/planted-rule.ts`, `packages/core/test/rule-error.test.ts`, `packages/cli/test/rule-error-secrets.test.ts`
- Modify: `packages/core/src/rules/types.ts` (`RuleContext.reportError`), `packages/core/src/rules/m-helpers.ts` (`eachQuery`, export `ownerFinding`), `packages/core/src/engine/run.ts` (both places a `RuleError` is pushed)
- Test: `packages/core/test/secret-masking.test.ts`, `packages/web/test/secret-masking.test.ts`; pins in `engine.test.ts`, `format.test.ts`, `m-limits.test.ts`, `packages/cli/test/cli.test.ts`, `packages/web/test/render.test.ts`

**Interfaces:**
- Produces, in `packages/core/src/engine/rule-error.ts`: `export function errorKind(e: unknown): string` (Rulings, "The error text"). Not exported from the package.
- Produces, in `packages/core/src/rules/types.ts`: `export interface ErrorSite { label: string; finding: RuleFinding }` and `reportError?: (error: unknown, site: ErrorSite) => void`.
- Produces, in `m-helpers.ts`: `export function ownerFinding(q: MQuery): RuleFinding`; `eachQuery` calls `ctx.reportError(e, { label: queryLabel(q), finding: ownerFinding(q) })`.
- Produces, in `run.ts`: a `RuleError.message` of `${site.label}: ${errorKind(e)}`, or `errorKind(e)` for a throw out of `check`.
- Produces, in `tests/support/planted-rule.ts`: `export function plantedLeakRule(): Rule`, id `PLANTED_LEAK`, `layer: "powerquery"`, `needs: ["model"]`, status `ported`, whose `check` runs `eachQuery` over `ctx.indexes.m.queries` throwing `new Error(q.text)` for each query, then throws `new TypeError(<every query's text joined>)` out of `check`. It imports `eachQuery` and the types from `packages/core/src` by relative path.

- [ ] **Step 1: Write the failing tests**

`packages/core/test/rule-error.test.ts`:

```ts
describe("errorKind", () => {
  it.each([
    [new Error("x"), "Error"],
    [new TypeError("x"), "TypeError"],
    [new RangeError("Maximum call stack size exceeded"), "RangeError (out of stack space)"],
    [new RangeError("Maximum call stack size exceeded."), "RangeError (out of stack space)"],
    [Object.assign(new Error("too much recursion"), { name: "InternalError" }), "InternalError (out of stack space)"],
    [Object.assign(new Error("x"), { name: "NotAKnownClass" }), "Error"],
    ["thrown text", "a value that is not an Error"],
    [undefined, "a value that is not an Error"],
  ])("names %o as %j", (e, kind) => expect(errorKind(e)).toBe(kind));
  it("names an error whose name getter throws as Error", () => {
    const e = new Error("x");
    Object.defineProperty(e, "name", { get() { throw new Error("no"); } });
    expect(errorKind(e)).toBe("Error");
  });
  it("never repeats the message", () => {
    expect(errorKind(new Error("a message with words"))).not.toContain("words");
  });
});
```

Core guard, a new `describe` in `secret-masking.test.ts`, "the secret guard, on a rule that could not finish (v3 spec, section 11.3)": `lint(readModelFiles(SECRETS_FIXTURE), { rules: [...defaultRules, plantedLeakRule()] })`, then:

```ts
expect(crashed.summary.ruleErrors.filter((e) => e.id === "PLANTED_LEAK").length).toBeGreaterThan(1);
const { model: _m, project: _p, ...printed } = crashed;
expect(leaks(JSON.stringify(printed), secrets)).toEqual([]);
// and for each of formatText, formatJson, formatMarkdown, formatSarif:
expect(leaks(format(crashed, { toolVersion: "0.0.0" }), secrets)).toEqual([]);
```

Web guard, the same `describe` in `packages/web/test/secret-masking.test.ts`: `lint(folder(SECRETS_FIXTURE), { rules: [...defaultRules, plantedLeakRule()] })`, `renderResults` (assert its text contains `PLANTED_LEAK`) and the three exports, each with `leaks(...)` equal to `[]`.

CLI guard, `packages/cli/test/rule-error-secrets.test.ts`: `vi.mock("@pbiplint/core", async (importOriginal) => { const core = await importOriginal(); return { ...core, lint: (files, options) => core.lint(files, { ...options, rules: [...core.defaultRules, plantedLeakRule()] }) }; })`. Then, with `run` as in `secret-masking.test.ts`: every `--format` (stdout contains `PLANTED_LEAK`), `--quiet`, `--format sarif --output <tempDir file>`, each with `leaks(out + err (+ written), secrets)` equal to `[]`; and the MCP lint tool, driven as `mcp.test.ts` drives it, with `leaks` of its replies equal to `[]`.

Move the pins that print the old message: `engine.test.ts`'s `{ id: "BOOM", message: "kaboom" }` becomes `message: "Error"`; `format.test.ts`'s `kaboom` notices and SARIF text become `Error`, and the `CRASHING` control-character case expects `...(please report this): Error` (the diagnostics notice in the same test still proves a notice's controls are shown); `m-limits.test.ts`'s `query 'A': Maximum call stack size exceeded` becomes `query 'A': RangeError (out of stack space)` and its custom `reportError` collector takes `(e, site)` and collects `` `${site.label}: ${errorKind(e)}` ``; `cli.test.ts`'s and `render.test.ts`'s `kaboom` notices become `Error`.

- [ ] **Step 2: Run them to make sure they fail**

Run: `npx vitest run packages/core/test/rule-error.test.ts packages/core/test/secret-masking.test.ts packages/web/test/secret-masking.test.ts packages/cli/test/rule-error-secrets.test.ts`
Expected: FAIL: `rule-error.ts` does not exist, and each new guard case reports a leak (today's notices print `e.message`). Record which values leaked, by count only, in `progress.md`.

- [ ] **Step 3: Write `errorKind`, the new `reportError` signature, and the sanitized messages**

`run.ts` builds every `RuleError` through one local function `fail(id, e, label)` that calls `errorKind`; Task 2 extends it. Doc comments say the message carries the error's class alone because a message can hold the model's text (v3 spec, section 11.3, amended October 28, 2026).

- [ ] **Step 4: Run the whole suite**

Run: `npm test && npm run lint && npm run typecheck && npm run check:browser && node .superpowers/sdd/2026-10-13-v3-rules-resolver/bytes.mjs | tail -1`
Expected: all pass; write the bytes line into `progress.md` (about 244,500).

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/engine/rule-error.ts packages/core/src/engine/run.ts packages/core/src/rules/types.ts packages/core/src/rules/m-helpers.ts tests/support/planted-rule.ts packages/core/test/rule-error.test.ts packages/core/test/secret-masking.test.ts packages/core/test/engine.test.ts packages/core/test/format.test.ts packages/core/test/m-limits.test.ts packages/web/test/secret-masking.test.ts packages/web/test/render.test.ts packages/cli/test/rule-error-secrets.test.ts packages/cli/test/cli.test.ts
git commit -m "fix: a rule error names the error's class, never its message

Part of #78.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: A rule that cannot finish is an error finding, and SARIF says the run did not succeed

**Files:**
- Create: `packages/core/src/rules/rule-could-not-finish.ts`, `packages/core/test/rule-could-not-finish.test.ts`
- Modify: `packages/core/src/engine/run.ts`, `packages/core/src/format/sarif.ts`, `packages/core/src/index.ts` (export `RULE_COULD_NOT_FINISH`)
- Test: `format.test.ts`'s SARIF pin

**Interfaces:**
- Consumes: `ErrorSite`, `errorKind`, `ownerFinding` (Task 1).
- Produces: `export const RULE_COULD_NOT_FINISH: Rule` (Rulings, "The finding"; `description` from `RULE_SUMMARIES["RULE_COULD_NOT_FINISH"] ?? "Rule could not finish"`), exported from the package, **not yet in `defaultRules`** (Task 3 registers it with its page).
- Produces: after the loop, `runRules` writes the findings described in the Rulings (object, detail, dedupe, ignore by either id) when `RULE_COULD_NOT_FINISH.id` is in `result.rulesRun`.

- [ ] **Step 1: Write the failing tests**

In `rule-could-not-finish.test.ts`, `lintWith(rules, config?, files?)` calls `lint` on a model of `model.tmdl` plus `Sales.tmdl` and `Stock.tmdl`, each with an M partition (`source = 1`). Test rules: `PER_QUERY` (`eachQuery` throwing `TypeError` on `Sales` only), `WHOLE` (model layer, throws `Error` out of `check`), `WHOLE_REPORT` (report layer, `needs: ["report"]`, throws), `TWICE` (calls `ctx.reportError` twice with `Sales`'s site). `rules` is `[RULE_COULD_NOT_FINISH, <test rule>]` unless a case says otherwise. `own(r)` is `r.findings.filter((f) => f.ruleId === "RULE_COULD_NOT_FINISH")`.

```ts
it("gives one error finding on the query's partition, and fails the run", async () => {
  const r = await lintWith([PER_QUERY]);
  expect(own(r)).toEqual([{
    ruleId: "RULE_COULD_NOT_FINISH", layer: "model", objectType: "Partition", objectName: "Sales",
    location: { file: "definition/tables/Sales.tmdl", line: 2 },
    detail: "PER_QUERY could not finish on query 'Sales': TypeError",
  }]);
  expect(r.groups.find((g) => g.rule.id === "RULE_COULD_NOT_FINISH")!.rule.severity).toBe(3);
  expect(r.failed).toBe(true);
});
it("names the model for a rule that throws out of its check", ...);
// detail "WHOLE could not finish on the model: Error", objectType "Model", objectName "Model"
it("names the report for a report rule that throws, on a report-only project", ...);
// objectType "Report", objectId "report", detail "WHOLE_REPORT could not finish on the report: Error"
it("gives one finding per rule and object, and keeps every error", ...);
// TWICE: own(r).length 1, r.summary.ruleErrors.length 2
it("is a warning when the config lowers it, and the run passes", ...);
// config { rules: { RULE_COULD_NOT_FINISH: "warning" } }: severity 2, failed false
it("writes nothing when it is turned off, and still lists the error", ...);
// "off": own(r) [], ruleErrors length 1, failed false, rulesSkipped has { id: "RULE_COULD_NOT_FINISH", reason: "disabled" }
it("has nothing to report when the failing rule is turned off, since that rule never runs", ...);
// { PER_QUERY: "off" }: own(r) [], ruleErrors [], failed false
it.each(["RULE_COULD_NOT_FINISH", "PER_QUERY", "*"])(
  "drops the finding when the partition's pbiplint.ignore names %s", ...);
// annotation on partition Sales: own(r) [], summary.ignored 1, ruleErrors length 1
it("drops a whole-model finding when the model's annotation names it", ...);
it("writes no finding when the caller's rules leave it out", ...);
// rules [PER_QUERY]: own(r) [], ruleErrors length 1
```

In `format.test.ts`, the "gives SARIF an error notification on the rule" pin expects `executionSuccessful: false`; a new case expects `true` for a result whose only notice is an `unread-file` diagnostic.

- [ ] **Step 2: Run them to make sure they fail**

Run: `npx vitest run packages/core/test/rule-could-not-finish.test.ts packages/core/test/format.test.ts`
Expected: FAIL: `rule-could-not-finish.ts` does not exist; SARIF says `true`. Record it.

- [ ] **Step 3: Write the rule, the engine's findings, and SARIF's flag**

The engine collects `{ id, label, finding, kind }` in `fail` and writes the findings after the loop, in the order the errors happened. The whole-throw object follows the Rulings, falling back to `{ objectType: "Model", objectName: "Model" }`. `runRules`'s doc comment and `RuleError`'s say that each error is also a `RULE_COULD_NOT_FINISH` finding when that rule runs. SARIF's comment says a run in which a rule could not finish is not successful.

- [ ] **Step 4: Run the whole suite and measure**

Run: `npm test && npm run lint && npm run typecheck && npm run check:browser && node .superpowers/sdd/2026-10-13-v3-rules-resolver/bytes.mjs | tail -1`
Expected: all pass; bytes about 245,350, under 245,760 (if over, this task does Task 3's Step 4 budget change instead of Task 3). Write it into `progress.md`.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/rules/rule-could-not-finish.ts packages/core/src/engine/run.ts packages/core/src/format/sarif.ts packages/core/src/index.ts packages/core/test/rule-could-not-finish.test.ts packages/core/test/format.test.ts
git commit -m "feat: a rule that cannot finish is a RULE_COULD_NOT_FINISH error

Part of #78.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: The rule ships, with its page, its report template, and the counts

**Files:**
- Create: `rules/rule-could-not-finish.md` (scaffold with `npm run build -w @pbiplint/core && node scripts/generate-rule-pages.mjs`, then written by hand), `.github/ISSUE_TEMPLATE/rule-could-not-finish.md`
- Modify: `packages/core/src/rules/index.ts` (after `PARSE_ISSUE`), `packages/core/test/rule-pages.test.ts` (`NO_EXAMPLE`), the generated `.data.ts` files, `README.md` (two places), `packages/cli/README.md`, `packages/core/README.md`, `packages/web/content/about.md`
- Modify, if this task crosses 245,760 bytes: `packages/core/scripts/check-browser-bundle.mjs`, spec 3.4
- Test: `packages/core/test/pack.test.ts`, `packages/web/test/generate.test.ts`, `packages/cli/test/rule-error-secrets.test.ts`

**Interfaces:**
- Consumes: `RULE_COULD_NOT_FINISH` (Task 2), `plantedLeakRule` and the CLI mock (Task 1).
- Produces: `defaultRules[1] === RULE_COULD_NOT_FINISH`.

- [ ] **Step 1: Write the failing tests**

- **Counts:** `pack.test.ts` `defaultRules.length` 122. `generate.test.ts`: 688 and 689 to 122; 734 to `122 rules: ... 11 report rules ... and 40 built into pbiplint.`; 741 and 746 to 122; 806 to `6 + 122`; the made-up inputs: 1044 to `123 rules: ... 12 report rules ... and 40 built into pbiplint.`, 1053 to `96 rules: ... and 25 built into pbiplint.` (the new rule's layer is `project`, so the filter keeps it), 1071 to `and 41 built into pbiplint.`.
- **`rule-pages.test.ts`:** `const NO_EXAMPLE = new Set(["RULE_COULD_NOT_FINISH"])`, with the Rulings' reason as its comment; for those rules the section test forbids `Example` and the example test is skipped (`it.runIf(rule.status !== "needsLiveModel" && !NO_EXAMPLE.has(rule.id))`).
- **The CLI's gate**, in `rule-error-secrets.test.ts` (the mock's planted rule now meets a registered `RULE_COULD_NOT_FINISH`):

```ts
it("exits 1 at the default fail-on, with the finding in every format", async () => {
  const r = await run([SECRETS_FIXTURE, "--format", "json"]);
  expect(r.code).toBe(1);
  const doc = JSON.parse(r.out);
  expect(doc.groups.find((g) => g.rule.id === "RULE_COULD_NOT_FINISH").rule.severity).toBe("error");
});
it("passes when pbiplint.config.json lowers it to a warning and nothing else is an error", ...);
// a temp project copy of a fixture with no error findings plus a config { rules: { RULE_COULD_NOT_FINISH: "warning" } }: code 0
it("passes when pbiplint.config.json turns the failing rule off", ...);
// { PLANTED_LEAK: "off" }: code 0 on the same clean copy, no "could not finish" on stderr
it("says executionSuccessful false in SARIF", ...);
it("leaves the finding out under --rule naming the failing rule, as it leaves PARSE_ISSUE out", ...);
// --rule PLANTED_LEAK: no RULE_COULD_NOT_FINISH group; the summary line still ends ", 1 rule could not finish"
```

The clean fixture is the smallest existing one with no error finding (the executor picks it and names it in `progress.md`).

- [ ] **Step 2: Run them to make sure they fail**

Run: `npx vitest run packages/core/test/pack.test.ts packages/core/test/rule-pages.test.ts packages/web/test/generate.test.ts packages/cli/test/rule-error-secrets.test.ts`
Expected: FAIL on the counts and the CLI's exit code. Record it.

- [ ] **Step 3: Register the rule and write its page and template**

The page's first paragraph under What it checks becomes the rule's description; write it exactly:

> A rule that stopped partway through an object or query, because pbiplint met input it could not handle. Each finding names the rule, the object or query, and the kind of error. This is a bug in pbiplint, not a fault in the model, and the rule's findings on that object or query are missing.

Then, in pbiplint's words:
- **What it checks**, second paragraph: the detail's form with the example in the Rulings; that the error's message is left out, since it can carry text from the model, and only its kind is shown; that the object is the query's partition, shared expression, or table, or the model or report for a rule that stopped outside any one query.
- **Why it matters:** the named rule's findings on that object are missing, so a clean result there means nothing; it is an error so a gated run fails rather than passing with a rule incomplete.
- **How to fix it:** the fix is a pbiplint release. Until then, three ways out: lower this rule's severity in `pbiplint.config.json` (`"RULE_COULD_NOT_FINISH": "warning"`), turn off the rule the finding names (`"LOCAL_DRIVE_PATH": "off"`, which then never runs), or add `annotation pbiplint.ignore = RULE_COULD_NOT_FINISH` (or the named rule's id) under the object in its TMDL file. To report it: open an issue with the template linked below, naming the rule, the object or query, pbiplint's version (`pbiplint --version`), and the smallest file that shows it, with every name, value, and address that is not yours to share replaced.
- **When to ignore it:** judgment only, no mechanics: while a fix ships, on a project whose gate must pass, and never by silencing it for good, since the rule stays incomplete there.
- **Links:** `- [Report a rule that could not finish](https://github.com/pbiplint/pbiplint/issues/new?template=rule-could-not-finish.md)`.

`.github/ISSUE_TEMPLATE/rule-could-not-finish.md`: front matter `name: A rule could not finish`, `about: Report a RULE_COULD_NOT_FINISH finding`, `title: "RULE_COULD_NOT_FINISH: "`, `labels: bug`; a body asking for the finding's detail line, pbiplint's version, where it ran (CLI, site, Action, Azure Pipelines task), and the smallest sanitized file, with a first line saying to replace every credential, address, and private name before posting, and that the detail never holds the model's text.

Then `npm run build -w @pbiplint/core && node scripts/sync-rule-pages.mjs`, and the README and About counts: 122 rules in all, 40 of them built into pbiplint.

- [ ] **Step 4: Measure, and raise the budget if this task crosses it**

Run: `npm run check:browser; node .superpowers/sdd/2026-10-13-v3-rules-resolver/bytes.mjs | tail -1`
If the bytes exceed 245,760: set `OWN_LIMIT_KB = 245`; rewrite the tripwire comment's last sentences to add "raised to 245 KB on October 28, 2026, when a rule that cannot finish became a finding (#238) measured <N> KB, with 5 KB for 0.3.x"; add to spec 3.4, after the October 13 amendment: "Amended October 28, 2026 (pb-coord, with Michael's authorization; pull request 10, #238): the core's own code budget is now 245 KB." followed by the measured bytes, the per-file growth from 243,910 (`bytes.mjs` against `<base>`), and the Rulings' reason for 5 KB. If the bytes stay under, change nothing and write the remaining room into `progress.md` for pb-coord.

- [ ] **Step 5: Run the whole suite**

Run: `npm test && npm run lint && npm run typecheck && npm run check:browser`
Expected: all pass; the sample's 280 findings do not move (no sample rule fails).

- [ ] **Step 6: Commit**

```bash
git add rules/rule-could-not-finish.md .github/ISSUE_TEMPLATE/rule-could-not-finish.md packages/core/src/rules/index.ts packages/core/src/rules/rule-summaries.data.ts packages/core/test/rule-pages.test.ts packages/core/test/pack.test.ts packages/web/test/generate.test.ts packages/cli/test/rule-error-secrets.test.ts README.md packages/cli/README.md packages/core/README.md packages/web/content/about.md
# plus every other .data.ts the sync rewrote, by name, and, if Step 4 raised it, packages/core/scripts/check-browser-bundle.mjs and the spec
git commit -m "feat: RULE_COULD_NOT_FINISH ships with its page and a report template

Part of #78.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: The CLI page, the spec, the release notes, and the corpus

**Files:**
- Modify: `packages/web/content/cli.md`; the v3 spec, sections 9.1 and 11.3; the local release notes draft (not committed)
- Test: the corpus diff (local); every check

- [ ] **Step 1: The CLI page**

- **Exit codes, `1`:** something at or above `--fail-on`, which from 0.3.0 includes a rule that could not finish, through its `RULE_COULD_NOT_FINISH` error finding (link the rule's page).
- **The contract's `ruleErrors`:** each `message` names the error's kind and, for a Power Query rule, the query (`query 'Sales': TypeError`), never the error's own message; each entry is also a `RULE_COULD_NOT_FINISH` finding unless the config or an annotation says otherwise.
- **SARIF:** `executionSuccessful` is `false` when a rule could not finish.

- [ ] **Step 2: The spec**

Dated amendments, "Amended October 28, 2026 (pull request 10, #238)": in section 9.1, the rule, its finding, its object, its ways out, and that it is produced in the engine; in section 11.3, the guard's new path (a planted rule throwing m-zoo's M, in core, the CLI with the MCP lint tool, and the site's unit test), and why the e2e test has no counterpart: the shipped page has no way to load a rule that throws, and adding one only for a test is a hook in production code.

- [ ] **Step 3: The release notes**

In `.superpowers/sdd/2026-10-13-release-0.3.0/release-notes.md`:
- **Amend** the #236 bullet "A rule that cannot finish is now visible": drop "The exit code is unchanged." (it no longer holds).
- **Add**, under "What can change in your results", after it: "**A rule that cannot finish fails a gated workflow.** It is a [`RULE_COULD_NOT_FINISH`](https://pbiplint.com/rules/rule-could-not-finish/) error on the query or object, so the default `fail-on: error` exits 1, and SARIF's `executionSuccessful` is false. The rule's page says how to keep a gate passing while a fix ships and how to report it. A rule error's message now names only the kind of error, never its text, which can carry the model's. Over 1,321 real models, no rule failed. (#238)"
- **Add** under "For code that uses `@pbiplint/core`": `RULE_COULD_NOT_FINISH` is exported; `RuleError.message` names the error's kind only; `RuleContext.reportError` takes the error and its site, `(error, { label, finding })`, a change within 0.3.0's own additions (#238).

- [ ] **Step 4: The corpus diff**

```bash
node <scratch-folder>/run.mjs 1800000 corpus-4 <scratch-folder>/rule-errors-corpus-4 -- npx --yes tsx .superpowers/sdd/2026-10-27-v3-hardening/corpus-diff.mts <base> <research-folder>/research-104
grep -E "models linted|^[+-][0-9]|ERROR|RULE ERRORS|rule errors:|no finding changed" <scratch-folder>/rule-errors-corpus-4.out
```

Expected: `1321 models linted`, `rule errors: 0 base, 0 head`, `no finding changed`. Any `RULE ERRORS` line, or any `RULE_COULD_NOT_FINISH` count, stops the task: report the rule ids and counts to pb-coord.

- [ ] **Step 5: Every check**

```bash
npm run lint && npm run typecheck && npm test && npm run check:browser && npm run check:network && npm run check:pack
node <scratch-folder>/run.mjs 1800000 e2e <scratch-folder>/rule-errors-e2e -- npm run test:e2e
grep -n "$(printf '\342\200\224')" rules/rule-could-not-finish.md .github/ISSUE_TEMPLATE/rule-could-not-finish.md packages/web/content/cli.md
```

Expected: all pass, e2e in all three browsers with no retries; the grep prints nothing. Write each result and the final `bytes.mjs` line into `progress.md`.

- [ ] **Step 6: Commit**

```bash
git add packages/web/content/cli.md docs/superpowers/specs/2026-10-12-pbiplint-v3-power-query-layer-design.md
git commit -m "docs: a rule that cannot finish, on the CLI page and in the spec

Part of #78.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Finish

One Opus review of the whole branch (`git diff origin/release/0.3.0...HEAD`) with this plan and spec sections 3.4, 9.1, and 11.3. Then pb-coord pushes `v3/rule-errors` and opens a pull request into `release/0.3.0` titled `feat: a rule that cannot finish fails a gated run (v3 PR 10)`, whose body names #238 without a closing keyword, covers the finding, the masking choice, gating, the ways out, the page and template, the budget, and the corpus's zero, and ends with:

```
🤖 Generated with [Claude Code](https://claude.com/claude-code)
```

## For pb-coord

- **`--rule` and a failed rule.** `--rule LOCAL_DRIVE_PATH` drops the `RULE_COULD_NOT_FINISH` finding about `LOCAL_DRIVE_PATH` and the gate passes, as `PARSE_ISSUE` is dropped today. Keeping it would mean `showOnly` matching findings to the failed rule (a field on the finding, or the detail's first word). This plan leaves it, pinned, for your call.
- **The budget if no task crosses it.** If the final measurement stays under 245,760 bytes, this plan changes nothing and the next change to core crosses; raising to 245 KB here anyway is your call.

Execution: subagent-driven, one Opus 5.5 subagent per task with a fresh reviewer after each.
Task order: 1, 2, 3, then 4; each depends on the one before.
