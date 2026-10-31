# Message IDs and parameters on findings (#98): spec

Issue: [#98](https://github.com/pbiplint/pbiplint/issues/98), size L. Written October 29, 2026, from main at `1bb4996`.

Why now: [#79](https://github.com/pbiplint/pbiplint/issues/79) (v4, the VS Code extension) shows findings in the Problems panel and can later show them in the user's display language; [#99](https://github.com/pbiplint/pbiplint/issues/99) (translating pbiplint.com) lists "the finding messages in the site's results" as the part it takes once this lands; and [#182](https://github.com/pbiplint/pbiplint/issues/182) (colour contrast) follows this so its findings carry message IDs from the start.

## 1. Inventory

Counted on October 29, 2026 (the issue's "about 100" was a rough count on September 27, 2026, before v3's Power Query rules). Every English string the core builds for output, by where it goes:

| Group | Templates | Fixed fragments picked from a set | Where it shows |
|---|---|---|---|
| Shared helpers: object context, the Power Query frame, rule could not finish, parse issue | 7 | 2 | finding `detail` |
| Microsoft BPA rules' own details | 3 | 0 | finding `detail` |
| PBI Inspector rules | 10 | 2 | finding `detail` |
| pbiplint report and model rules, with their combiners | 42 | about 12 | finding `detail` |
| `NOT_REACHED_FROM_REPORT` reasons (`index/reachability.ts`) | 4 | 0 | finding `detail` |
| `BROKEN_FIELD_REFERENCE` reasons (`index/report-refs.ts`; 4 more are built and never shown) | 16 | 1 | finding `detail` |
| Power Query rules | 18 | about 19 | finding `detail` |
| Parse issue reasons (TMDL 13, PBIR JSON 4, PBIR build 2, M 4) | 23 | about 9 | `PARSE_ISSUE` finding `detail` |
| **Finding details, all told** | **about 123** | **about 45** | |
| Text, Markdown, and SARIF formatter lines (summary, skipped, layers, headings, notices) | about 32 | 3 | the reports' own lines |
| Engine: rule error labels, `errorKind`, `ignoreHelp`, config errors, internal throws | about 30 | about 4 | notices, stderr |
| Diagnostics built in core, and refusals | 13 | 0 | notices, stderr |
| Layer absent reasons | 8 | 0 | skipped line, JSON `layers` |
| Report at a glance (`project/facts.ts`): labels, values, details | about 54 | 0 | facts block, JSON `facts` |
| **Run-level strings, all told** | **about 137** | **about 7** | |

`plural()` (`packages/core/src/format/text.ts:48`) has 33 call expressions: 28 in core (the summary, skipped, layers, and Fix these first lines, `project/facts.ts`, `engine/projects.ts:250`, and one rule detail at `rules/pbiplint/visuals.ts:29`), one in `packages/cli/src/several.ts:170`, and two in `packages/web/src/results/render.ts` (lines 153 and 166).

Object names hold English words too: `pbir/names.ts` builds `Page "…"`, `Bookmark "…"`, `Report filter` and the like into a finding's `objectName`.

### In scope

**Every finding's detail**: about 123 templates and their fragments, from every rule, the shared helpers, `PARSE_ISSUE` (its parser reasons included), and `RULE_COULD_NOT_FINISH`. That is what the issue's boxes name, and it is what both consumers that will translate need first: the extension's Problems panel shows findings, and #99 takes "the finding messages" from this issue.

### Out of scope, and why

- **Run-level strings** (the summary, skipped, and layers lines, notices, diagnostics, refusals, layer reasons, Report at a glance, the formatters' headings). The CLI, the JSON, and the SARIF stay English by decision (#99, "Out"), and the CLI's text and Markdown layouts are not promised. The site's results page would want these in another language, and that belongs with #99's "interface text", which can reuse this issue's catalog and formatter as they are. Taking them here roughly doubles the issue (about 137 more templates, `facts.ts` rewritten) for a consumer that does not exist yet. Settled October 30, 2026: findings only, and the run's own lines wait for #99's interface text, through the same catalog.
- **CLI-only strings**: help, usage errors, config errors. The CLI stays English.
- **`objectName`**: the JSON contract's name for the object, and the English words `pbir/names.ts` puts in it are a question for #79's spec (what the Problems panel shows) and for #99. Recorded there, not changed here.
- **Rule names and descriptions**: they come from the rule pages, which #99 translates.
- **`plural()`**: after this, its only callers are run-level English lines, so it stays as the English helper it is. Every plural in the catalog goes through `Intl.PluralRules`.

Text from other software inside a detail stays as written, as a parameter: `JSON.parse`'s message (`pbir/json.ts:179`, which differs between engines), Microsoft's M parser's message (`m/read.ts:200`, masked), and the input line `PARSE_ISSUE` quotes.

## 2. The shape

### On a finding

```ts
type MessageParam = string | number | readonly string[] | Message;
interface Message { id: MessageId; params: Readonly<Record<string, MessageParam>> }

interface RuleFinding { /* … */ message?: Message }   // what a rule returns; `detail` goes
interface Finding { /* … */ detail?: string; messageId?: MessageId; params?: Record<string, MessageParam> }
```

A rule returns a `message`, never a string. `runRules` renders the English `detail` from it, once, and copies `messageId` and `params` onto the finding beside it. A finding has all three or none: a rule with nothing to add, as 48 BPA rules are, still has no detail. `RuleFinding.detail` is removed at the end (section 7), so the compiler refuses a rule that writes English directly, and `MessageId` is the catalog's key type, so it refuses an ID the catalog lacks.

A parse issue works the same way: `ParseIssue` keeps its English `reason`, which the parsers' tests assert, and gains `message`, from which the parser renders `reason`. `Resolution.reason` in `index/report-refs.ts` and `ErrorSite.label` do too, so `summary.ruleErrors[].message` in the JSON reads as today (`query 'Sales': TypeError`). A TMDL reference such as `'Sales'` is a parameter as `tableRef` writes it: it is TMDL, not English.

One parameter holds English that belongs to the run-level strings, and stays so until #99 takes them: the refusal that becomes the detail of an unreadable project's `PARSE_ISSUE` finding (`engine/projects.ts:75`, `PARSE_ISSUE.unreadableProject` with `{reason}`, the refusals being CLI and site messages). It is listed in the catalog test as known. When Microsoft's M parser gives no message, `parseM` returns an empty one and the finding nests `parse.m.noReason` ("the parser gave no reason"), the same English as before; an empty message from the parser's catch path now reads the same way, where it used to end "M could not be parsed: " with nothing after it (PR 3). `RULE_COULD_NOT_FINISH`'s `{kind}` is a nested message (`ruleError.errorClass`, `ruleError.outOfStack`, `ruleError.notAnError`), not an exception (October 29, 2026).

Code that matches on a detail today (`isFailureOf` and `isFindingFor` in `rules/rule-could-not-finish.ts`, `shareModels` in `engine/projects.ts`, the de-duplication key in `rules/pbiplint/references.ts`) keeps matching on the rendered English `detail`, which is unchanged. There is no reason to move it.

### Message IDs

- A rule's messages are named after the rule: `BROKEN_ACTION_TARGET` when the rule has one message, `BROKEN_BOOKMARK_REFERENCE.capturedVisual` (a lower camel case variant after a dot) when it has several.
- A message no single rule owns takes a lower camel case namespace, which can never collide with a rule ID: `context.*` (the object context the helpers add for 18 BPA rules), `query.*` (the Power Query frame, `query 'Sales', step 'Filtered Rows': …`), `parse.tmdl.*`, `parse.pbir.*`, `parse.m.*`, and `ruleError.*`.
- IDs are ASCII, never translated, and stable: an ID keeps its meaning for as long as it exists. A rewording that keeps the meaning keeps the ID; a new meaning gets a new ID, which is additive.

### Parameters

| Kind | Example | Renders as |
|---|---|---|
| A name or text from the input | `target: "Sales Detail"` | as written, never translated |
| A number | `count: 12` | digits as today (`String(n)`), so a year is never grouped |
| A list | `names: ["Q1", "Q2", "Q3", "Q4"]` | the language's list (`Intl.ListFormat`), at most three named and the rest counted by the catalog's `list.more` (`and 1 more`); in English with semicolons when an item holds a comma, exactly as `englishList` does today |
| A date | `date: "2025-01-05"` (ISO, in a `{date, date}` placeholder) | `Intl.DateTimeFormat` long style in UTC; in English exactly what `longDate` writes today (`January 5, 2025`) |
| A nested message | `what: { id: "LOCAL_DRIVE_PATH", params: { drive: "C" } }` | that message, rendered in the same language |

A fixed English fragment picked from a set (`Page navigation`, `the model`, `tooltip`) is never a parameter's text. It is either a `select` inside the one template that uses it, so a translator writes the whole sentence for each case, or a nested message when several templates share the set (the query frame, the object context). Raw values that reach a sentence today as English words (`opens.by` at `opening.ts:53`, the configured `expect` at `opening.ts:78`, the lowercased page type at `pbi-inspector/pages.ts:36`) become `select` keys.

### Templates

Templates are strings in the subset of ICU MessageFormat that translation tools and AI models already read:

- `{name}` for a parameter;
- `{count, plural, one {# field bound} other {# fields bound}}`, the category chosen by `Intl.PluralRules` for the catalog's language (exact matches such as `=0` allowed);
- `{action, select, pageNavigation {Page navigation} drillthrough {Drillthrough} other {Bookmark}}`;
- `{names, list}` and `{date, date}` for the two formatted kinds;
- no quoting: an apostrophe is always itself. ICU's quoting would turn the `'` in `query '{query}'`-style text and in French elisions into traps for every translator, and no template needs a literal brace; the parse test refuses one.

For example:

```ts
BROKEN_ACTION_TARGET:
  '{action, select, pageNavigation {Page navigation action points at page} drillthrough {Drillthrough action points at page} other {Bookmark action points at bookmark}} "{target}", which does not exist',
```

The formatter is pbiplint's own, about 150 lines in `packages/core/src/messages/format.ts`. It takes no dependency (an ICU library would be one, and larger than the catalog), only `Intl`, which browsers and Node both have, so the core stays browser-pure. A template it cannot parse fails a test, never a run: the catalog tests parse every template.

### Where it lives, and how a renderer gets text

- `packages/core/src/messages/en.ts`: the English catalog, `export const EN = { … } as const`, with `export type MessageId = keyof typeof EN`. One object, sorted by ID, so a later `fr.ts` is the same keys with other strings.
- `packages/core/src/messages/format.ts`: `formatMessage(message, catalog = EN, locale = "en")`, and `findingDetail(finding, catalog?, locale?)`, which renders `messageId` and `params` when the finding has them and falls back to `detail` (a finding read back from older JSON, say).
- Both exported from `@pbiplint/core`'s index, so the site, the CLI, and later the extension render the same way.
- The text and Markdown formatters and the site's results (`packages/web/src/results/render.ts:474` and `:625`) call `findingDetail` instead of reading `detail`. With English it is the same string.
- JSON and SARIF keep writing the English `detail` (section 3).

## 3. The output contract

### JSON

Each finding that has a detail gains `messageId` and `params`, after `detail`. `version` stays `1` (one project) and `2` (several): [What a script can rely on](https://pbiplint.com/cli/#contract) says "A new field is additive and keeps `version` where it is", and already names this one: "One planned addition is a message id and parameters for each finding." The page's JSON section gains a sentence saying what the two fields are and that a `messageId` is stable, and the "planned addition" sentence goes. `params` values are the kinds in section 2; a nested message is `{ "id", "params" }`.

### SARIF

Use each result's property bag, not SARIF's native message fields (agreed October 29, 2026). If a result already carries `properties`, the two fields merge into it. The shape:

```json
"message": { "text": "Bookmark \"Q4\": Bookmark points at something missing (captured page \"ReportSection9\" does not exist)" },
"properties": { "messageId": "BROKEN_BOOKMARK_REFERENCE.capturedPage", "params": { "page": "ReportSection9" } }
```

We considered SARIF's native `message.id` and chose the property bag because:

- A message with an `id` must resolve. The lookup reads the rule's `messageStrings`, then the tool's `globalMessageStrings`, and if neither has it "the lookup procedure fails (which means the SARIF log file is invalid)"; "the run object SHALL contain enough information for the procedure to succeed" ([SARIF 2.1.0, section 3.11.7](https://docs.oasis-open.org/sarif/sarif/v2.1.0/errata01/os/sarif-v2.1.0-errata01-os-complete.html#_Toc141790718)). So `messageStrings` would have to carry our templates.
- SARIF's placeholders are positional only, `{0}` and `{1}`, and `arguments` "is an array of strings" ([section 3.11.5](https://docs.oasis-open.org/sarif/sarif/v2.1.0/errata01/os/sarif-v2.1.0-errata01-os-complete.html#_Toc141790716), [section 3.11.11](https://docs.oasis-open.org/sarif/sarif/v2.1.0/errata01/os/sarif-v2.1.0-errata01-os-complete.html#_Toc141790722)), with no plural, select, list, or nesting. Our templates cannot be written there faithfully, and a viewer that resolved them would show a sentence the CLI never printed.
- Our `message.text` is `{objectName}: {rule name} ({detail})`, not the detail, so an `id` on that message would name the wrong sentence.
- The property bag is plain SARIF: "every object defined in this document MAY contain a property named properties", whose values "MAY be of any JSON type" ([section 3.8.1](https://docs.oasis-open.org/sarif/sarif/v2.1.0/errata01/os/sarif-v2.1.0-errata01-os-complete.html#_Toc141790699)). Code scanning "will only use the following supported properties" ([GitHub's SARIF support page](https://docs.github.com/en/code-security/code-scanning/integrating-with-code-scanning/sarif-support-for-code-scanning#supported-properties)), so it passes over the bag and keeps showing `message.text`, which is unchanged.

The CLI page already says the SARIF document is not promised beyond what SARIF 2.1.0 defines, so the bag is described there and not promised.

### Who reads it

- **The MCP `lint` tool** returns the CLI's JSON (`packages/cli/src/mcp.ts:49`), so it gains the fields with no change.
- **The Action (1.7.0)** reads SARIF `message.text` and the Markdown export (`action/src/annotate.mjs:56`); **the Azure task (1.3.0)** reads SARIF `message.text` (`azure-pipelines/task/report.mjs:72`). Neither reads anything that changes, so neither needs a release. The task pins its CLI version per release, so it moves to the new CLI whenever it next releases for another reason.
- **The Claude plugin** stays at 0.2.5 until #218; its CLI gains the fields whenever it next updates. Nothing to change in it.

## 4. The plumbing check

With English the only catalog, every output reads as today. What proves it:

- **The CLI one-project goldens** (`packages/cli/test/fixtures/one-project/`, release 0.3.0's output, never re-recorded, compared byte for byte by test 0 in `packages/cli/test/contract.test.ts`). The text, quiet, Markdown, and `--output` cases pass unchanged. The JSON and SARIF cases gain fields, so test 0 removes exactly `messageId` and `params` from each JSON finding and `properties` from each SARIF result before it compares, and a new test asserts that every finding with a detail carries both and that rendering them gives the detail. The goldens themselves are not touched.
- **Every rule test that asserts a detail** (the `packages/core/test/rules-*.test.ts` files, `parse.test.ts`, `rule-could-not-finish.test.ts`, the parity tests) passes unchanged.
- **The sample's findings**: the goldens above lint `examples/messy-sales`, and the site's tests that read the sample (`packages/web/test/render.test.ts`) pass unchanged.
- **The site e2e** (`packages/web/e2e/site.spec.ts`, `home.spec.ts`, `several.spec.ts`) passes unchanged, since the results render through `findingDetail` to the same text.
- **`englishList` and `longDate`** give way to the `list` and `date` kinds only after a test shows the two agree on every case their own tests cover.

Four outputs change on purpose, none reached by a golden or a test before, each pinned by a new test:

- The PBI Inspector count rules (`pbi-inspector/counts.ts:24`, `:52`, `:68`, `:109`) print "1 visuals, more than 0" when a config sets `max` to 0; through a plural they print "1 visual, more than 0".
- The text format's Fix these first line prints "2 infos" (`format/text.ts:190`, `plural(n, "info")`), where the summary line and the site say "2 info". Fixed in PR 1 as its own commit (October 29, 2026).
- A list of three or more names one of which holds a comma, in `NOT_REACHED_FROM_REPORT`'s levels (the only `listOf` caller whose items can hold one), now joins with semicolons, as `englishList`'s lists always did, pinned by a test (PR 2, October 29, 2026).
- `FIXED_DATE_IN_ROW_FILTER` no longer reports a day M itself refuses (a year outside 1 to 9999, or a day its month does not have), since the `date` kind cannot write one and such a query fails at refresh rather than going quietly stale (PR 3, October 29, 2026).

## 5. The catalog tests

In `packages/core/test/messages.test.ts`:

1. **Every template parses**, and its arguments are listed with their kinds (plain, plural, select with its keys, list, date).
2. **Every catalog has the English catalog's IDs, and each template the same arguments of the same kinds, with the same select keys.** Today that runs over `EN` against itself and over a test catalog built from `EN` with one argument dropped, which must fail, so the test is shown to bite before a second language exists.
3. **Every message ID a rule can emit is in the catalog**, twice over: at compile time, since a finding's message ID is a `MessageId`; and at run time, across every finding the core's test fixtures and the sample produce, each finding's `params` hold exactly its template's arguments (none missing, none extra), nested messages included, so a rule cannot pass a parameter its template drops.
4. **Every ID in the catalog is reached** by some test fixture, or listed in the test as reachable only through a case no fixture holds, with the reason. A catalog entry nothing emits is dead text. As built (PR 3, October 29, 2026), test 4 checks that each ID is named in the core's source, and the emitting fixtures are the rules' own tests plus test 3's 15-project sweep and inline parse and rule-error inputs; a plan deviation from "reached by some test fixture", recorded here.
5. **The formatter**: plural categories through `Intl.PluralRules` (checked with a language whose rules differ from English, through a test-only catalog), select with `other`, ICU quoting, and lists and dates in English matching `englishList` and `longDate`.

## 6. Size

The core's own code measures **243.5 KB** minified on October 29, 2026, against the 245 KB tripwire (`packages/core/scripts/check-browser-bundle.mjs`). The templates move from the rules into the catalog rather than being copied, so the growth is the IDs, the parameter names, and the formatter: an estimated 6 to 10 KB. The tripwire is raised in the PR that crosses it, to the measured size plus room, rounded up to 5 KB, and this section gains the date and the numbers. Size is a tripwire, not a stop.

Budget amendments: on October 29, 2026, PR 1 measured the core's own code at 249.7 KB minified, over the 245 KB tripwire, so `OWN_LIMIT_KB` rose to 255 KB (the measured size plus about 5 KB, rounded up to a multiple of 5); PRs 2 and 3 move the rest of the rules' templates in. On October 29, 2026, PR 2 measured it at 257.0 KB, over the 255 KB tripwire, so `OWN_LIMIT_KB` rose to 265 KB; PR 3 moves the Power Query rules' templates in.

## 7. The PR split, and how it ships

Three PRs, each green on its own, each after one review of the whole branch. All three target `release/0.3.2`, opened with milestone 0.3.2 when PR 1 is ready, as 0.3.0 did: main deploys the site at merge, so PR 1's CLI page edit would otherwise go live before npm has the fields, and main's JSON would carry IDs on some rules only. The `list` and `date` kinds land in PR 2, whose plan settles exactly how a list composes in English (the separator and the `list.more` count) so it matches `englishList` on every case its tests cover, with the English-only part in the catalog or the English path, not applied to every language.

1. **The machinery and the contract.** `messages/format.ts`, `messages/en.ts`, `findingDetail`, and catalog tests 1, 2, and 5. `RuleFinding` takes `message` beside `detail` for the length of the migration. JSON and SARIF gain the fields; contract test 0 learns to set them aside, and a new test asserts them; the CLI page's contract section says what they are. The formatters and the site render through `findingDetail`. The shared helpers move (the object context, `PARSE_ISSUE` with every parser reason, and `RULE_COULD_NOT_FINISH`), then the Microsoft BPA and PBI Inspector rules (13 templates).
2. **The pbiplint report and model rules**, with `BROKEN_FIELD_REFERENCE`'s and `NOT_REACHED_FROM_REPORT`'s reasons (about 62 templates), and the `list` and `date` kinds in place of `englishList` and `longDate`.
3. **The Power Query rules** and the query frame (18 templates and about 19 fragments). Then `RuleFinding.detail` goes, catalog tests 3 and 4 run over everything, and the tripwire is set. The runtime keeps passing a plain `detail` through from a rule that returns no message, with a test, so a JavaScript rule given through `options.rules` does not lose its text silently (October 29, 2026); rule-supplied messages are the custom rules issue's to design.

**Release.** The change is additive: new JSON fields with the version unchanged, and a SARIF property bag code scanning passes over. It fits a patch release in the 0.3 line, 0.3.2, ahead of #182. It ships once, after PR 3, since IDs on some rules and not others would be half a promise. The Action, the Azure task, and the Claude plugin need nothing (section 3).

## Constraints carried

The core stays browser-pure, with no new dependency; nothing a user lints leaves their machine; no telemetry; Tabular Editor is never required; the smallest change that meets the boxes; TDD.
