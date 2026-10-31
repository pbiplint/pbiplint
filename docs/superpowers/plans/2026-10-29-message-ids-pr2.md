# Message IDs, PR 2: lists and dates, the pbiplint report and model rules, and the reference reasons. Implementation plan

**Goal:** Every pbiplint report and model rule's finding, and `BROKEN_FIELD_REFERENCE`'s and `NOT_REACHED_FROM_REPORT`'s reasons, carry message IDs; the formatter gains `list` and `date` kinds; `englishList` and both `listOf` copies go.

**Architecture:** As PR 1 (`docs/superpowers/plans/2026-10-29-message-ids-pr1.md`): a rule returns `message`; `runRules` renders `detail`. A list parameter is an array whose items are strings or nested messages, rendered through `Intl.ListFormat`; English adds its own rule for items that hold a comma. A date is an ISO day rendered through `Intl.DateTimeFormat`. A "combiner" that today glues an object context and a rule's own words becomes a message of the rule's with both parts nested.

**Tech Stack:** TypeScript, vitest, `Intl.ListFormat`, `Intl.DateTimeFormat`, `Intl.PluralRules`. No new dependency.

**Spec:** `docs/superpowers/specs/2026-10-29-message-ids-design.md`. Base: PR 1's head (`a529b25`, or `release/0.3.2` after PR 1 merges there). The PR targets `release/0.3.2`.

## Global Constraints

Every Global Constraint of plan-pr1.md holds, and:

- Each catalog template renders byte for byte the English the code builds today, for every value of every count, select, and list length the code can produce. The implementer derives each template from the code it replaces; the reviewer compares them.
- Raw values that reach a sentence as English words become `select` keys: `opens.by` (`opening.ts:53`, `landing` and `active`), the configured `expect` and the read `state` (`opening.ts:76-78`, `report-helpers.ts:460`), the `which` fragments (`opening.ts:35`), `pattern` (`pages.ts:5`, `:6`, `:26`), `noun` (`periods.ts:78`, year, date, period), and `what` (`report-refs.ts:226`, hierarchy or column).
- A plural written by hand (`s` on a noun, `is`/`are`, `uses`/`use`, two templates split on a count) becomes one template with a `plural`, unless the two sentences differ in more than the plural, in which case they stay two IDs.
- Quote marks around a name inside a list item live in the catalog: a nested `"quoted": '"{name}"'` per item.
- Two existing tests' English may change on purpose only if the reviewer agrees it is the list rule below; any other changed string is a defect.

## The list kind, settled

- Template syntax `{names, list}`. The parameter is `readonly (string | Message)[]`; each item renders first (a string as written, a message through the same catalog and locale), then the items join through `new Intl.ListFormat(locale, { type: "conjunction" })`.
- **The English path**, applied only when the catalog's locale's language is `en`: when any rendered item holds a comma, every `literal` part from `formatToParts` has its `,` replaced by `;` (so `a, b, and c` becomes `a; b; and c`, as `englishList` writes dates). Other languages keep Intl's punctuation.
- **The cap is the rule's, not the formatter's.** `export function capped(items: readonly (string | Message)[], max = 3): (string | Message)[]` in `messages/format.ts` returns the items unchanged when there are at most `max`, else the first `max` and `msg("list.more", { count: items.length - max })`. `EN["list.more"] = "{count} more"`. That is `englishList`'s cap exactly ("and 3 more" comes from the conjunction).
- Checked on October 29, 2026 in Node: `Intl.ListFormat("en", { type: "conjunction" })` gives `a`, `a and b`, `a, b, and c`, which is what `translations.ts:7` and `reachability.ts:32` write. `englishList` = `capped` + the English path.
- One output can change: a `listOf` caller (cultures, `NOT_REACHED_FROM_REPORT`'s names) with three or more items one of which holds a comma now uses semicolons. Culture names never hold one; an object name can. Recorded as an on-purpose change in spec section 4, with a test.

## The date kind

`{d, date}` with an ISO day string (`"2025-12-31"`), rendered by `new Intl.DateTimeFormat(locale, { dateStyle: "long", timeZone: "UTC" })`; `EN["date.long"] = "{date, date}"` for a date that is a list item. In English it equals `longDate` (Node, October 29, 2026: `January 5, 2025`). `longDate` itself stays until PR 3, since a Power Query rule uses it.

## Review Focus

1. A list of one item, of exactly three, of four (the cap), and of three where one holds a comma: English matches `englishList` or `listOf` as the call site used. Task 1.
2. A date at a year's edges (January 1, December 31) and a leap day: UTC, so no day shifts. Task 1.
3. A locale string Intl refuses (`"xx-invalid-"`): the formatter falls back to `en` and does not throw (PR 1's deferred minor). Task 1.
4. A combiner with no context (an object with no partition or table context): renders the rule's own message alone, as today. Tasks 3 and 4.
5. `BROKEN_FIELD_REFERENCE`'s `unread` and `notRead` wrappers (`report-refs.ts:131`, `:140`), which nest a reason in a reason. Task 4.

---

### Task 1: The list and date kinds, and three PR 1 leftovers

**Files:** Modify `packages/core/src/messages/format.ts`, `messages/en.ts`; Test `packages/core/test/messages.test.ts`.

**Interfaces:** Produces `MessageParam = string | number | Message | readonly (string | Message)[]`; `ArgKind` gains `{ kind: "list" }` and `{ kind: "date" }`; `capped(items, max?)` as above; `EN["list.more"]`, `EN["date.long"]`, `EN["quoted"]`.

- [ ] **Step 1: Failing tests:** every case in the existing tests of `englishList` and `listOf` (find them with `grep -rn "englishList\|listOf" packages/core/test`), rendered through `{x, list}` with `capped` where the call site caps, giving the same strings; Review Focus 1 to 3; `templateArgs` reports `list` and `date`; `sameShape` (test file) compares the new kinds. PR 1 leftovers: a template that fails to parse renders as its text and does not throw; a missing plural or select param renders `{n}`; a failed parse is cached (call twice, parse once; assert through a spy on nothing: assert identical output and no throw, and keep the cache a `Map` whose failed entry is a sentinel).
- [ ] **Step 2: Run** `npx vitest run packages/core/test/messages.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** in `format.ts`; `Intl.ListFormat`, `Intl.DateTimeFormat`, and `Intl.PluralRules` cached per locale; one guard that resolves an unusable locale to `"en"`.
- [ ] **Step 4: Run** the same, then `npm test`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(core): list and date parameters in messages (#98)`.

### Task 2: The report rules: actions, opening, pages, report measures

**Files:** `packages/core/src/rules/pbiplint/actions.ts` (`BROKEN_ACTION_TARGET`, `ACTION_WITHOUT_DESTINATION`, `BROKEN_BOOKMARK_REFERENCE`'s four details, the last a capped list of quoted visuals with a plural), `opening.ts` (`LANDING_PAGE_NOT_SET`, `OPENING_PAGE_INVALID`, `FILTERS_PANE_STATE`), `pages.ts` (`DEFAULT_PAGE_NAME`), `measures.ts` (`REPORT_LEVEL_MEASURES`), `messages/en.ts`. Tests: the existing `rules-native-*.test.ts` files for these rules, unchanged apart from added fields in whole-object literals; new cases in `messages.test.ts`.

IDs: `RULE_ID` for a rule's single message; `BROKEN_BOOKMARK_REFERENCE.activePage`, `.capturedPage`, `.capturedVisual`, `.targetVisuals`; `OPENING_PAGE_INVALID.missing`, `.hidden`; `LANDING_PAGE_NOT_SET.activeMissing`, `.opensOn`; `FILTERS_PANE_STATE` with selects for `state` and `expect` and for "not recorded" against "saved". The implementer may split or merge variants where the code's branches say so, keeping the naming rule.

- [ ] **Step 1: Failing tests:** in `messages.test.ts`, each rule above yields its `messageId` on a fixture its own test file already builds (reuse those builders), and `BROKEN_BOOKMARK_REFERENCE.targetVisuals` with one, two, and five stale visuals renders today's English (`target visual "A" is not on page …`, `target visuals "A" and "B" are not …`, `… "A", "B", "C", and 2 more are not …`).
- [ ] **Step 2: Run** them. Expected: FAIL.
- [ ] **Step 3: Implement.** `englishList`'s import leaves `actions.ts`.
- [ ] **Step 4: Run** `npm test`, `npm run typecheck`. Expected: PASS, every existing detail string unchanged.
- [ ] **Step 5: Commit** `feat(core): action, opening, and page findings carry message ids (#98)`.

### Task 3: The report rules: visuals, tab order, year filters

**Files:** `rules/pbiplint/visuals.ts` (`HIDDEN_VISUAL_WITH_FIELDS` with its `plural()` call, `VISUAL_WITHOUT_FIELDS`, `VISUAL_OUTSIDE_PAGE` (one template with a select over which edges, so "right", "bottom", or both joined as today), `SLICER_SELECTION_SAVED`, `SLICER_SEARCH_SAVED`'s two), `tab-order.ts` (two details and the group prefix as a combiner), `filters.ts` (`HARDCODED_YEAR_IN_FILTER`: a capped list of years with a plural, `years up to {year}`, `years {from} to {to}`, and the `{kept} on {field}` suffix as a combiner), `messages/en.ts`. Tests as in Task 2.

- [ ] **Step 1: Failing tests:** each rule's `messageId` on an existing fixture; `HARDCODED_YEAR_IN_FILTER` with one year, two, and five renders today's English; `VISUAL_OUTSIDE_PAGE` with right only, bottom only, and both; Review Focus 4 for the tab-order group prefix (no group, then a group).
- [ ] **Step 2 to 4:** as Task 2. `plural` and `englishList` imports leave these files.
- [ ] **Step 5: Commit** `feat(core): visual, tab order, and year filter findings carry message ids (#98)`.

### Task 4: Reference reasons: `BROKEN_FIELD_REFERENCE` and `NOT_REACHED_FROM_REPORT`

**Files:** `packages/core/src/index/report-refs.ts` (`Resolution`'s `reason: string` gains `message: Message`, `reason` its English, as `ParseIssue` did in PR 1; all reasons built there, the four never shown included, so the type holds), `rules/pbiplint/references.ts` (`BROKEN_FIELD_REFERENCE` `{field}: {reason}` with `reason` nested; check whether `fieldLabel` writes English words, and if it does, say so in the report and leave it, since `pbir/names.ts` is out of scope by the spec), `index/reachability.ts` (`NOT_REACHED_FROM_REPORT`'s reasons, the level and hierarchy form, the `{why}; {list} {uses|use} it` combiner with a plural over the list's length; its `listOf` goes), `messages/en.ts`. Tests: `report-refs.test.ts`, `reachability.test.ts`, `rules-native-references.test.ts`, unchanged apart from added fields.

IDs: `BROKEN_FIELD_REFERENCE` and `BROKEN_FIELD_REFERENCE.<reason>` for each reason (e.g. `.noColumn`, `.noTable`, `.measureNotColumn`, `.unread` wrapping a nested reason, `.notRead`); `NOT_REACHED_FROM_REPORT.<variant>`.

- [ ] **Step 1: Failing tests:** each reason kind yields its ID through the rule on fixtures the existing tests build; Review Focus 5 (the two wrappers render today's English with a nested reason); the reachability combiner with one level and with two; one on-purpose case: three names, one holding a comma, now joined with semicolons (spec section 4 gains the line).
- [ ] **Step 2 to 4:** as Task 2.
- [ ] **Step 5: Commit** `feat(core): field reference and reachability reasons carry message ids (#98)`.

### Task 5: The model rules: periods, translations, functions

**Files:** `rules/pbiplint/periods.ts` (`HARDCODED_PERIOD_IN_DAX`: `fixed {noun}…` with a capped list and a plural, the end-date pair as one template with a plural if the two read as one sentence, else two IDs, dates as `date.long` items, and the `{own} in {context}` combiner replacing `withDetail` there), `translations.ts` (`NAME_WITHOUT_TRANSLATION`: `no caption in {cultures, list}` and the `{context}, {captions}` combiner; its `listOf` goes), `functions.ts` (`UDF_NOT_CALLED`'s two, as one plural template if they read as one sentence), `messages/en.ts`. If `withDetail` has no caller left in `rules/helpers.ts` but `mFinding`'s, keep it for PR 3. `englishList` leaves `periods.ts` once nothing imports it (`longDate` stays). Tests as in Task 2.

- [ ] **Step 1: Failing tests:** each rule's ID on existing fixtures; `HARDCODED_PERIOD_IN_DAX` with one date, two dates (joined with " and ", no separator), three dates (the semicolon form, `January 1, 2024; March 3, 2025; and May 5, 2025`), and five years (the cap); Review Focus 4 (a measure with no context, and a calculation item with one).
- [ ] **Step 2 to 4:** as Task 2.
- [ ] **Step 5: Commit** `feat(core): period, translation, and function findings carry message ids (#98)`.

### Task 6: Size, the spec, the gate

- [ ] **Step 1:** `grep -rn "englishList\|listOf" packages/core/src` finds only `project/route.ts` (a refusal, run-level, out of scope). Delete `englishList` if nothing uses it.
- [ ] **Step 2:** `npm run check:browser`. If over 255 KB, raise `OWN_LIMIT_KB` to the measured size plus about 5 KB rounded up to 5, extend the comment's history, amend spec section 6, and give the numbers in the PR.
- [ ] **Step 3:** Spec section 4 gains the list semicolon change beside the other two on-purpose changes (same method).
- [ ] **Step 4:** The full gate: `npm run build && npm test && npm run typecheck && npm run lint && npm run check:browser && npm run check:network && npm run check:pack && npm run test:e2e`. Expected: all pass, the CLI goldens included.
- [ ] **Step 5:** Commit, then one review of the whole branch.
