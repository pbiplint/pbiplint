# Message IDs, PR 1: the machinery, the contract, and the shared and ported rules. Implementation plan

**Goal:** Findings carry `messageId` and `params` beside an unchanged English `detail`, rendered from an English catalog, for the shared helpers, `PARSE_ISSUE`, `RULE_COULD_NOT_FINISH`, and the Microsoft BPA and PBI Inspector rules; JSON and SARIF carry the new fields; every existing output reads as before.

**Architecture:** A new `packages/core/src/messages/` holds the English catalog (`en.ts`) and pbiplint's own formatter for an ICU MessageFormat subset (`format.ts`). A rule returns `message: { id, params }`; `runRules` renders `detail` from it and copies the ID and params onto the finding. Parsers and the rule error path keep their English strings and gain a `message` they render them from. Rules not migrated yet keep returning `detail` strings until PR 3.

**Tech Stack:** TypeScript, vitest, `Intl.PluralRules`. No new dependency.

**Spec:** `docs/superpowers/specs/2026-10-29-message-ids-design.md` (approved October 29, 2026). Read sections 2 to 5 before starting.

## Global Constraints

- The core stays browser-pure: no Node or network API in `packages/core/src`, and no new dependency; `npm run check:browser` passes.
- English output is byte for byte what it is today, except the two on-purpose changes in spec section 4.
- The 0.3.0 goldens in `packages/cli/test/fixtures/one-project/` are never re-recorded or edited.
- Message IDs: `RULE_ID` or `RULE_ID.lowerCamelVariant`; shared ones in lower camel namespaces (`context.`, `query.`, `parse.tmdl.`, `parse.pbir.`, `parse.m.`, `ruleError.`).
- Template syntax: `{name}`, `{n, plural, one {…} other {…}}` with `#` and `=N`, `{k, select, a {…} other {…}}`; `other` required in plural and select; no quoting (an apostrophe is itself); no literal braces.
- A name from the input, or a TMDL reference as `tableRef` writes it, is a parameter as written; a fixed English fragment is a `select` or a nested message, never a parameter's text (two known exceptions, spec section 2).
- No em dashes in any prose, comments, or commit messages.
- Branch from `1bb4996`. The PR targets `release/0.3.2`.

## Review Focus

1. A name from the input that holds `{`, `}`, `#`, or `'` (a table called `Sales {EU}`, a page called `Q1 #2`): rendered as written, since parameters are never parsed as templates. Test in Task 1.
2. A `#` in plain text outside a plural (none today, but a translator may write one): stays `#`. Test in Task 1.
3. A missing or extra parameter at run time must not throw in a user's run: missing renders `{name}` and the catalog test catches it. Test in Task 1.
4. The one-project JSON for a several-project run (version 2) carries the fields too, since `several.ts` builds it from `formatJson`. Test in Task 3.
5. A SARIF result with no detail gets no `properties` at all, so code scanning's input is unchanged for the 48 BPA rules without a detail. Test in Task 3.

---

### Task 1: The formatter

**Files:**
- Create: `packages/core/src/messages/format.ts`
- Create: `packages/core/src/messages/en.ts`, seeded with the one entry `"context.table": "table {table}"` so the types resolve; later tasks add the rest. Its header comment says the syntax is an ICU MessageFormat subset with no quoting: an apostrophe is itself and there are no literal braces, so a translator or a model adding a language never writes ICU's `''` (October 29, 2026)
- Test: `packages/core/test/messages.test.ts`

**Interfaces:**
- Produces, from `messages/en.ts`: `export const EN = { … } as const;` sorted by key; `export type MessageId = keyof typeof EN;`
- Produces, from `messages/format.ts`:
  - `export type MessageParam = string | number | Message;` (lists and dates arrive in PR 2)
  - `export interface Message { readonly id: MessageId; readonly params: Readonly<Record<string, MessageParam>> }`
  - `export type Catalog = Readonly<Record<MessageId, string>>;`
  - `export const msg = (id: MessageId, params: Record<string, MessageParam> = {}): Message`
  - `export function formatMessage(m: Message, catalog: Catalog = EN, locale = "en"): string`
  - `export type ArgKind = { kind: "plain" } | { kind: "plural" } | { kind: "select"; keys: readonly string[] };`
  - `export function templateArgs(template: string): ReadonlyMap<string, ArgKind>` (throws `Error` on a template it cannot parse; for the catalog tests)

- [ ] **Step 1: Write the failing tests** in `messages.test.ts`, `describe("formatMessage")`, with a test-only catalog cast to `Catalog`:
  - `"{a} and {b}"` with `{ a: "x", b: 2 }` gives `"x and 2"`.
  - `"{n, plural, one {# field bound} other {# fields bound}}"` gives `"1 field bound"` for 1, `"0 fields bound"` for 0, `"12 fields bound"` for 12; with `=0 {nothing}` added, 0 gives `"nothing"`.
  - The same plural under `locale = "pl"` with `one`, `few`, `many`, `other` branches picks `few` for 2 and `many` for 5 (proves `Intl.PluralRules` decides).
  - `"{k, select, page {page} other {bookmark}}"` gives `"page"` for `page`, `"bookmark"` for `x`.
  - A nested message param renders through the same catalog and locale.
  - Review Focus 1: a param `"Sales {EU} #2 'x'"` comes out exactly as given.
  - Review Focus 2: `"Q#1 {a}"` gives `"Q#1 x"`.
  - Review Focus 3: a missing param renders `{a}`; an extra param is ignored; neither throws.
  - A catalog that lacks an ID renders the English template for it.
  - `templateArgs` lists plain, plural, and select args (with select keys) of a template that has all three, including args inside branches; it throws on `"{a"`, `"a}"`, `"{n, plural, one {x}}"` (no `other`), and `"{n, frobnicate, x {y}}"`.

- [ ] **Step 2: Run** `npx vitest run packages/core/test/messages.test.ts`. Expected: FAIL, module not found.

- [ ] **Step 3: Implement** `format.ts`: a small recursive-descent parser from template to a node list (text, arg, plural with branches and `#`, select with branches), cached per template string in a `Map`; `formatMessage` walks it. `#` renders the plural's number as `String(n)`; numbers render as `String(n)`, never grouped. `Intl.PluralRules` per locale is cached. An ID the catalog lacks: `catalog[id] ?? EN[id] ?? id`, the English template before the bare ID. A select with no matching key, or a plural category with no branch, takes `other`.

- [ ] **Step 4: Run** the same command. Expected: PASS.

- [ ] **Step 5: Commit** `feat(core): format messages from a catalog (#98)`.

### Task 2: Findings and parse issues carry messages; JSON and SARIF write them; renderers read them

**Files:**
- Modify: `packages/core/src/rules/types.ts` (`RuleFinding`, `Finding`, `ErrorSite`)
- Modify: `packages/core/src/engine/run.ts` (`keep`, the failure label)
- Modify: `packages/core/src/format/json.ts`, `format/sarif.ts`, `format/text.ts`, `format/markdown.ts`
- Modify: `packages/core/src/index.ts` (export `EN`, `MessageId`, `Message`, `MessageParam`, `Catalog`, `msg`, `formatMessage`, `findingDetail`)
- Modify: `packages/web/src/results/render.ts:474` and `:625`
- Test: `packages/core/test/messages.test.ts`, `packages/core/test/format.test.ts`

**Interfaces:**
- Consumes: Task 1's `Message`, `formatMessage`, `MessageId`, `MessageParam`.
- Produces:
  - `RuleFinding.message?: Message` beside `detail?: string` (both allowed until PR 3; a finding has at most one).
  - `Finding.messageId?: MessageId` and `Finding.params?: Readonly<Record<string, MessageParam>>`, set exactly when `detail` came from a message.
  - `ErrorSite.label: Message` (was `string`); `runRules` renders it to English for `RuleError.message`, unchanged text.
  - `export function findingDetail(f: Pick<Finding, "detail" | "messageId" | "params">, catalog: Catalog = EN, locale = "en"): string | undefined` in `messages/format.ts`.

- [ ] **Step 1: Write the failing tests:**
  - `messages.test.ts`, `describe("runRules")`: a test rule returning `{ objectType: "Model", objectName: "Model", message: msg("context.table", { table: "'Sales'" }) }` yields a finding with `detail: "table 'Sales'"`, `messageId: "context.table"`, `params: { table: "'Sales'" }`; a rule returning `detail: "x"` yields `detail: "x"` and no `messageId` or `params` keys.
  - `findingDetail` returns the rendered message when `messageId` is there, else `detail`.
  - `format.test.ts`: `formatJson` writes `messageId` and `params` right after `detail` (key order checked with `Object.keys`), and neither when the finding has no message.
  - `format.test.ts`: `formatSarif` writes `properties: { messageId, params }` on a result whose finding has a message, and no `properties` key otherwise (Review Focus 5); `message.text` is unchanged.

- [ ] **Step 2: Run** `npx vitest run packages/core/test/messages.test.ts packages/core/test/format.test.ts`. Expected: the new tests FAIL.

- [ ] **Step 3: Implement.** `keep` in `run.ts` renders `formatMessage(f.message)` into `detail` and copies `id` and `params`. `eachQuery`'s `reportError` and `run.ts`'s fallback labels pass messages: add `"query.name": "query {query}"`, `"query.partition": "query {query}, partition {partition}"`, `"ruleError.theModel": "the model"`, `"ruleError.theReport": "the report"` to `EN`, and have `queryLabel` in `rules/m-helpers.ts` return a `Message` with `queryLabelText(q): string` (its English) beside it for `mFinding`, which stays a string builder until PR 3. JSON adds the two keys after `detail`. SARIF spreads `properties` into the result only when the finding has `messageId`. `formatText`, `formatMarkdown` (line 191), and the site's `render.ts:625` call `findingDetail(f)` in place of `f.detail`, and so do both site reads, `render.ts:474` (the detail span in each group's finding list, which the site e2e covers) and `:625`.

- [ ] **Step 4: Run** `npm test` and `npm run typecheck`. Expected: all pass, the 0.3.0 golden test included (no rule emits a message yet, so JSON and SARIF are unchanged).

- [ ] **Step 5: Commit** `feat(core): findings carry a message id and params beside the detail (#98)`.

### Task 3: The contract test and the CLI page

**Files:**
- Modify: `packages/cli/test/contract.test.ts` (test 0, and a new test)
- Modify: `packages/web/content/cli.md:172` and `:180`

**Interfaces:**
- Consumes: Finding fields from Task 2.

This task changes no output yet; its new contract test is written in Task 4, once a rule emits a message.

- [ ] **Step 1: Change test 0** so that, for the `-json` and `-sarif` cases only, it parses stdout, deletes `messageId` and `params` from every finding (JSON) or `properties` from every result (SARIF), re-serializes with `JSON.stringify(doc, null, 2) + "\n"` after `escapeJsonControls`, and compares that with the golden. Every other case compares exactly as now. Add a comment saying why, citing #98.

- [ ] **Step 2: Run** `npm run build && npx vitest run packages/cli/test/contract.test.ts`. Expected: PASS.

- [ ] **Step 3: Edit `cli.md`.** Line 172, after "and `detail`": add ", and, from 0.3.2, where there is a `detail`, `messageId`, the stable identifier of the message the detail was written from, and `params`, the values filled into it; a name from the project is a value as written, and a value can itself be a message, `{ "id", "params" }`." Line 180: remove "One planned addition is a message id and parameters for each finding." In the SARIF sentence under Not promised, nothing changes; add to the JSON section's end: "SARIF results carry the same two fields in their `properties`." Run `npx vitest run packages/web/test` (the page tests).

- [ ] **Step 4: Commit** `test(cli): hold JSON and SARIF to 0.3.0's output apart from the message fields (#98)`.

### Task 4: The shared helpers, PARSE_ISSUE, and RULE_COULD_NOT_FINISH

**Files:**
- Modify: `packages/core/src/rules/helpers.ts:121-172` (partition, tablePermission, hierarchy, level, calculationItem)
- Modify: `packages/core/src/tmdl/types.ts` (`ParseIssue.message: Message`), `tmdl/parse.ts` (13 reasons), `pbir/json.ts` (4), `pbir/build.ts:700`, `:715`, `m/read.ts` (`TOO_LARGE`, `MODEL_TOO_LARGE`, the parse failure), `m/parse.ts:72`
- Modify: `packages/core/src/rules/parse-issue.ts`, `rules/rule-could-not-finish.ts`, `engine/run.ts:179`, `engine/projects.ts:75`
- Modify: `packages/core/src/messages/en.ts`
- Test: existing `parse.test.ts`, `pbir-json.test.ts`, `pbir-build.test.ts`, `m-read.test.ts`, `rule-could-not-finish.test.ts`, `projects.test.ts`, and the rule tests, all unchanged; new cases in `messages.test.ts` and `packages/cli/test/contract.test.ts`

**Interfaces:**
- Consumes: `msg`, `formatMessage`, `Message` (Task 1); `RuleFinding.message`, `ErrorSite.label: Message` (Task 2).
- Produces: `ParseIssue.message: Message` with `reason` its English (`reason: formatMessage(message)` at each push, through one helper `issue(file, line, text, message)` per parser module or a shared `parseIssue(...)` in `tmdl/types.ts`'s neighbour; pick one and use it in all four parsers). `failureDetail` becomes `failureMessage(ruleId, label: Message, kind): Message`; `isFailureOf` and `isFindingFor` keep comparing rendered English.

Catalog entries (exact English, from the code today):
- `context.table` `table {table}`; `context.role` `role {role}`; `context.level` `hierarchy {hierarchy} in {table}`; `context.calculationGroup` `calculation group {table}`
- `PARSE_ISSUE` `{reason}: {text}` with `reason` a nested message; `PARSE_ISSUE.unreadableProject` `{reason}` (known exception, spec section 2)
- `RULE_COULD_NOT_FINISH` `{rule} could not finish on {where}: {kind}` with `where` nested (`ruleError.theModel`, `ruleError.theReport`, `query.name`, `query.partition`) and `kind` nested too: `ruleError.errorClass` `{class}`, `ruleError.outOfStack` `{class} (out of stack space)`, `ruleError.notAnError` `a value that is not an Error`. `errorKind` gains a `Message`-returning twin beside its string, and the run-level notice and `RuleError.message` keep rendering the English. If `errorKind`'s string is matched elsewhere so that this costs more than a few lines, keep it a known exception and say why in the PR message
- `parse.tmdl.*`, one per reason in `tmdl/parse.ts` (244, 277, 335, 370, the two at 411 and 414, 446, 480, 482, 488 and 509 sharing one ID, 495, 511, 584 with `{where, select, root {at the root of a file} other {under a model}}` and `{under, select, declaration {a declaration} other {lines}}`); `parse.pbir.*` for `pbir/json.ts` 164, 179 (`{message}` holds the engine's text), 192, 209 (`{kind, select, …}` over `kindOf`'s values), and `pbir/build.ts` 700 (`{state, select, missing {missing} other {empty}}`) and 715 (`{state, select, missing {no} other {an empty}}`, `{entity}`); `parse.m.tooLarge`, `parse.m.modelTooLarge`, `parse.m.notParsed` (`M could not be parsed: {message}`), and `m/parse.ts:72`'s fallback as the `message` value `parse.m.noReason` nested.

- [ ] **Step 1: Write the failing tests** in `messages.test.ts`: a TMDL file with a space-indented line, a PBIR file that is not valid JSON, and an M partition that does not parse each yield a `PARSE_ISSUE` finding with the expected `messageId` (`PARSE_ISSUE`), `params.reason.id` (`parse.tmdl.spaceIndentation`, `parse.pbir.notValidJson`, `parse.m.notParsed`), and a `detail` equal to today's; a rule that throws yields a `RULE_COULD_NOT_FINISH` finding with `params.where.id === "ruleError.theModel"`; a Power Query rule throwing on one query yields `params.where.id === "query.name"`; a `TablePermission` finding from a BPA rule carries `context.role`.
- [ ] **Step 1b (runs in Task 5): the contract test** in `contract.test.ts`: `"the JSON and SARIF findings carry messageId and params, which render to the detail (#98)"`. For `examples/messy-sales` with `--format json`, at least one finding has a `messageId`; every finding with one has `params`, and `formatMessage({ id: messageId, params })` equals its `detail`. With `--format sarif`, a result has `properties.messageId` and `properties.params` exactly when its finding has a message. For a version 2 run over a folder holding two copies of the sample, the same holds inside `projects[*].groups` (Review Focus 4). No rule Task 4 migrates fires on the sample, so this test is written and run in Task 5, where `INTEGER_FORMATTING` (14 findings), the five count rules, `ENSURE_ALTTEXT`, and five more fire on it.
- [ ] **Step 2: Run** `npx vitest run packages/core/test/messages.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** the catalog entries and the call sites above.
- [ ] **Step 4: Run** `npm test` and `npm run typecheck`. Expected: all pass, every existing parser and rule test unchanged.
- [ ] **Step 5: Commit** `feat(core): parse issues, rule errors, and object context carry message ids (#98)`.

### Task 5: The Microsoft BPA and PBI Inspector rules

**Files:**
- Modify: `packages/core/src/rules/report-helpers.ts:43`, `:69`, `:80` (`reportFinding.report`, `.page`, `.visual` take `detail?: string | Message`; a `Message` goes to `message`)
- Modify: `packages/core/src/rules/microsoft-bpa/measures.ts:101-106`, `rules/pbi-inspector/counts.ts`, `pages.ts`, `report.ts`, `visuals.ts`
- Modify: `packages/core/src/messages/en.ts`
- Test: `packages/core/test/rules-report-counts.test.ts` (new case), `messages.test.ts`

Catalog entries:
- `INTEGER_FORMATTING.formatString` `format string "{format}"`, `INTEGER_FORMATTING.none` `no format string`, `INTEGER_FORMATTING.dynamicOnly` `dynamic format string only`
- `REDUCE_VISUALS_ON_PAGE` `{count, plural, one {# visual} other {# visuals}}, more than {max}`; `REDUCE_OBJECTS_WITHIN_VISUALS` `{count, plural, one {# field} other {# fields}} bound, more than {max}`; `REDUCE_TOPN_FILTERS` `{count, plural, one {# visual} other {# visuals}} with a TopN filter, more than {max}`; `REDUCE_ADVANCED_FILTERS` `{count, plural, one {# visual} other {# visuals}} with an Advanced filter applied, more than {max}`; `REDUCE_PAGES` `{count, plural, one {# page} other {# pages}}, more than {max}`
- `HIDE_TOOLTIP_DRILLTROUGH_PAGES` `{kind, select, tooltip {tooltip} other {drillthrough}} page is visible to readers` (the key is the type lower-cased; check `BOUND_TYPES` holds only the two)
- `ENSURE_PAGES_DO_NOT_SCROLL_VERTICALLY` `height {height}, more than {max}`
- `REMOVE_UNUSED_CUSTOM_VISUALS` `{visual} is registered but no visual uses it`
- `AVOID_SHOW_ITEMS_WITH_NO_DATA` `Show items with no data is on for {roles}` (`roles` joined with `", "` as today: they are Power BI's own role names, not English)
- `ENSURE_THEME_COLOURS` `{count, plural, one {# colour} other {# colours}} set to a hex value instead of a theme colour`
- `ENSURE_ALTTEXT` `no alt text`

- [ ] **Step 1: Write the failing tests:** in `rules-report-counts.test.ts`, `"a count of one reads as one (#98)"`: with `max: 0` and one visual on a page, `REDUCE_VISUALS_ON_PAGE`'s detail is `"1 visual, more than 0"`; with one page and `max: 0`, `REDUCE_PAGES` gives `"1 page, more than 0"`. In `messages.test.ts`: `ENSURE_ALTTEXT` and `REDUCE_PAGES` findings carry their IDs. Then Task 4's Step 1b contract test, here.
- [ ] **Step 2: Run** them. Expected: FAIL.
- [ ] **Step 3: Implement** the entries and call sites.
- [ ] **Step 4: Run** `npm test`, `npm run typecheck`, `npm run lint`. Expected: all pass, every existing detail test unchanged.
- [ ] **Step 5: Commit** `feat(core): Microsoft BPA and PBI Inspector findings carry message ids (#98)`.

### Task 6: "2 infos"

**Files:**
- Modify: `packages/core/src/format/text.ts:190`
- Test: `packages/core/test/format.test.ts`

- [ ] **Step 1: Write the failing test** `"Fix these first counts info findings as info, not infos"`: a result whose top group is an info rule with two findings prints a line containing `(2 info)`.
- [ ] **Step 2: Run** it. Expected: FAIL with `(2 infos)`.
- [ ] **Step 3: Implement**: the line writes `n info` for severity 1, as `countsLine` does.
- [ ] **Step 4: Run** `npm test`. Expected: PASS, goldens unchanged.
- [ ] **Step 5: Commit** `fix(core): the text format's Fix these first line says "2 info", not "2 infos"`.

### Task 7: Catalog tests 1 and 2, size, and review

**Files:**
- Test: `packages/core/test/messages.test.ts`
- Modify (only if crossed): `packages/core/scripts/check-browser-bundle.mjs:66` and its comment; spec section 6

- [ ] **Step 1: Write the tests:** `"every English template parses"` (`templateArgs` over every `EN` value); `"a catalog has English's IDs and each template the same arguments"` as a function `sameShape(catalog: Catalog): string[]` returning the problems, empty for `EN`, and naming the entry for a copy of `EN` with `{max}` dropped from `REDUCE_PAGES`, and for one with a select key renamed.
- [ ] **Step 2: Run** `npx vitest run packages/core/test/messages.test.ts`. Expected: PASS.
- [ ] **Step 3: Run** `npm run check:browser`. If the core's own code exceeds 245 KB, set `OWN_LIMIT_KB` to the measured size plus about 5 KB, rounded up to a multiple of 5, extend the comment's history with the date and numbers, amend spec section 6, and give the number in the PR message.
- [ ] **Step 4: Run** the full gate: `npm run build && npm test && npm run typecheck && npm run lint && npm run check:browser && npm run check:network && npm run check:pack && npm run test:e2e`. Expected: all pass.
- [ ] **Step 5:** One review of the whole branch, fix what it finds, commit, then open PR 1 against `release/0.3.2`.
