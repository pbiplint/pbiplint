# Message IDs, PR 3: the Power Query rules, the end of string details, and the catalog's guarantees. Implementation plan

**Goal:** Every Power Query finding carries a message ID; `RuleFinding.detail` leaves the type, so no built-in rule can write English directly; catalog tests 3 and 4 hold every finding's params to its template and every catalog entry to a source that emits it; the PR 1 and PR 2 leftovers close.

**Architecture:** As PRs 1 and 2. The Power Query frame (`query 'Sales', step 'Filtered Rows': …`) becomes two messages that nest the query label and the rule's own message. `mFinding` takes a `Message`. With `detail` gone from `RuleFinding`'s type, `runRules` still passes a plain `detail` through from a rule that returns one at run time (a JavaScript rule given through `options.rules`), so its text is never lost.

**Tech Stack:** TypeScript, vitest. No new dependency.

**Spec:** `docs/superpowers/specs/2026-10-29-message-ids-design.md`. Base: `release/0.3.2` after PR 2 ([#251](https://github.com/pbiplint/pbiplint/pull/251)) merges. The PR targets `release/0.3.2`.

## Global Constraints

Every Global Constraint of plan-pr1.md and plan-pr2.md holds, and the contract rules PR 2's reviews settled:

- `messageId`, param names, and select keys freeze when 0.3.2 ships: select keys lower camel and saying what they are; param names naming their meaning; one name per concept across rules (`table`, `reason`, `kind`, `query`, `step`); a single name a plain string with its quote marks in the template; a TMDL reference as `tableRef` writes it is a plain string (it is TMDL, not English).
- A message ID always takes the same params; a select whose branches need different params splits into variant IDs.
- Each EN template renders byte for byte what the code builds today for every reachable branch. No English output changes in this PR.
- Existing tests' detail strings never change; whole-object literals only gain the new fields; direct `rule.check` tests go through `rendered()`.
- Dates are ISO days with a four-digit, zero-padded year, rendered by the `date` kind.

## Review Focus

1. A JavaScript rule (no types) passed through `options.rules` that returns a plain `detail`: its finding keeps the detail, with no `messageId` or `params`. Task 3.
2. A Power Query finding on a query with a step and one without, on a table with one M partition and with two (the partition label): the frame reads as today. Task 1.
3. `DEFAULT_STEP_NAMES`, which replaces the frame with the query label alone: its two variants with one step and with several. Task 2.
4. `HARDCODED_SECRET_IN_QUERY`'s five `where` forms, which hold names from the input: names as plain params, the words in the catalog. Task 2.
5. Catalog test 3 must bite: a rule passing a param its template does not use, or missing one, fails it. Task 4.
6. No param may hold text the detail would not show (October 29, 2026). JSON and SARIF carry params into CI logs and artifacts: `HARDCODED_SECRET_IN_QUERY`'s params name where a credential is, never its value; the M parser's message param stays the masked one; no param is set for a select branch the finding does not take. Test in Task 2: lint the secret fixture (`tests/fixtures/parse-secrets.SemanticModel`, and any other fixture with a hardcoded secret) and assert no param anywhere in any finding, nested messages and list items included, contains a secret value the fixture holds.

---

### Task 1: The Power Query frame, and the first Power Query rules

**Files:** `packages/core/src/rules/m-helpers.ts` (`mFinding(m, q, node, what: Message | string)` during the migration; the frame as `query.finding` `{query}: {finding}` and `query.stepFinding` `{query}, step {step}: {finding}`, `query` the nested `query.name` or `query.partition` label, `step` a plain `tableRef` string, `finding` the rule's nested message), `rules/pbiplint/power-query.ts` (`LOCAL_DRIVE_PATH`, `SCRIPT_IN_QUERY` with a `language` select, `EXCEL_USE_HEADERS`, `ODBC_WHERE_CONNECTOR_EXISTS` with its `kind`, `part`, connector name, and article as selects or nested messages so no English fragment is a param, `PRIVACY_LEVELS_IGNORED` (a model finding with no frame), `SORT_NOT_HELD_FOR_REMOVE_DUPLICATES` with `sort` nested (`the Table.Sort inside it` or `step {step}`), `KEEP_FIRST_ROWS_LEFT_IN`, `INCREMENTAL_REFRESH_RANGE_BOUNDS`'s two), `messages/en.ts`. Tests: `rules-power-query.test.ts`, `rules-m.test.ts` unchanged apart from added fields; new cases in `messages.test.ts`.

- [ ] **Step 1: Failing tests:** Review Focus 2; each rule above yields its ID with today's English on fixtures its tests already build; `ODBC_WHERE_CONNECTOR_EXISTS` for each connection kind and an article `a` and `an`.
- [ ] **Step 2:** Run them. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** `npm test`, `npm run typecheck`. Expected: PASS, no existing English changed.
- [ ] **Step 5:** Commit `feat(core): the Power Query frame and the first Power Query rules carry message ids (#98)`.

### Task 2: The remaining Power Query rules

**Files:** `power-query.ts` (`FIXED_DATE_IN_ROW_FILTER` with its `use` select and the date as a `date` param, so `longDate` goes from `periods.ts`; `DEFAULT_STEP_NAMES`' two variants and its frame without a step, `query.finding`; `DYNAMIC_DATA_SOURCE` with its noun and how selects; `HARDCODED_SECRET_IN_QUERY`'s two templates and five `where` forms; `HARDCODED_SERVER_NAME` with its calls count, a plural; `LEGACY_EXCEL_FILE` with an `extension` select; `EXTENSION_FILTER_CASE`), `rules/pbiplint/periods.ts` (delete `longDate` once nothing imports it), `messages/en.ts`. Tests as Task 1.

- [ ] **Step 1: Failing tests:** Review Focus 3, 4, and 6; each rule's ID with today's English; `FIXED_DATE_IN_ROW_FILTER` with a three-digit year.
- [ ] **Steps 2 to 4:** as Task 1.
- [ ] **Step 5:** Commit `feat(core): the remaining Power Query rules carry message ids (#98)`.

### Task 3: No string details in the rule type

**Files:** `rules/types.ts` (`RuleFinding.detail` removed), `engine/run.ts` (`keep` passes through a plain `detail` a rule returns at run time, typed as `unknown` input, rendering nothing and adding no `messageId`), `rules/helpers.ts` (`withDetail` removed), `rules/m-helpers.ts` (`mFinding` takes only `Message`; `queryLabelText` removed if nothing uses it), `rules/report-helpers.ts` (the factories take only `Message`), `rules/rule-could-not-finish.ts` (a test that `isFailureOf`'s literal prefix starts the rendered `RULE_COULD_NOT_FINISH` message), `m/read.ts` (the "the parser gave no reason" fallback becomes a nested `parse.m.noReason` message, leaving `parseM`'s return type alone), `test/helpers.ts` (`rendered()` and `keep` share one exported `renderFinding` from `engine/run.ts` or `messages/format.ts`, so the tests follow the engine), the spec's known exception list. Tests: a new test for Review Focus 1 in `engine.test.ts`; existing tests unchanged apart from type-level adjustments.

- [ ] **Step 1: Failing tests:** Review Focus 1 (a rule object cast through `unknown` returning `{ objectType, objectName, detail: "x" }` gives a finding with `detail: "x"` and no `messageId` key); the `isFailureOf` prefix test; `parse.m.noReason` is the nested message when the parser gives none.
- [ ] **Step 2:** Run them. Expected: FAIL.
- [ ] **Step 3:** Implement; let the compiler find every remaining string detail.
- [ ] **Step 4:** `npm test`, `npm run typecheck`, `npm run lint`. Expected: PASS.
- [ ] **Step 5:** Commit `refactor(core): a built-in rule's finding carries a message, never English (#98)`.

### Task 4: Catalog tests 3 and 4

**Files:** `packages/core/test/messages.test.ts`, `packages/core/test/helpers.ts`.

- **Test 3, params match templates.** One helper, `checkParams(finding)`, asserts a finding's `params` hold exactly its template's arguments (none missing, none extra), recursing into nested messages and list items. It runs (a) inside `renderFinding`'s test path, so every rule test that goes through `rendered()` checks every finding it makes; and (b) over every finding of `lint` on each of the 14 projects in `tests/fixtures/` and on `examples/messy-sales`.
- **Test 4, every entry is emitted.** For each EN key, the source under `packages/core/src` names it as a string literal (`"KEY"` or `'KEY'`), or the key is in a short list in the test of IDs built another way, each with its reason (`PARSE_ISSUE.unreadableProject`, the known exception, is named in source). A key nothing names fails, as dead text.
- [ ] **Step 1:** Write both tests, and Review Focus 5: a test that a deliberately wrong finding (an extra param, a missing param, a wrong nested param) fails `checkParams`.
- [ ] **Step 2:** Run. Expected: PASS, or failures that are real defects; fix each in the code it names, never in the test.
- [ ] **Step 3:** Commit `test(core): every finding's params match its template, and every catalog entry is emitted (#98)`.

### Task 5: Size, the README, the spec, the gate

- [ ] **Step 1:** `npm run check:browser`; if over 265 KB, raise `OWN_LIMIT_KB` by the measured-plus-5-rounded-to-5 rule, extend the history comment, amend spec section 6 (python, that line only).
- [ ] **Step 2:** `packages/core/README.md`: a short section on messages: a finding's `messageId` and `params`, `findingDetail` and `formatMessage`, the English catalog `EN`, and that the IDs are stable. Match the README's voice and length.
- [ ] **Step 3:** The full gate (`npm run build && npm test && npm run typecheck && npm run lint && npm run check:browser && npm run check:network && npm run check:pack && npm run test:e2e`). Expected: all pass, the CLI goldens included.
- [ ] **Step 4:** Commit; then one review of the whole branch, the PR, and the close-out of #98 after merge: the dated comments on #79 and #99 about `objectName` and `visualName`'s English words, and the issue's boxes.
