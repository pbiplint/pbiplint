# Rules beyond Microsoft's set: what #117 builds

Issue #117, milestone 0.2.3. Written September 30, 2026, after Michael settled the list and approved this design in outline the same day; approved October 1, 2026. Amended the same day with what the capture plan measured on `te` 0.7.1.2 (sections 3.1, 3.4, 3.5, and 5.1), and with Michael's ruling that a column a feature needs counts as used (sections 1, 4.2, and 4.5). Section 8 lists what is still open.

## 1. Sources and decisions

- **The issue.** #117 as corrected on September 30, 2026, and its comment of that day, which records every candidate kept or dropped with its reason. This spec covers the issue's last four boxes: the capture, the rules, the rule pages, and the existing rules.
- **The research.** Four reports in `.superpowers/research/2026-09-30-117-candidates/` (git-ignored): translations and perspectives, format strings and the compatibility level, naming and layout, and the TODO rule with Tabular Editor 3's versions of Microsoft's rules. They measured the #104 corpus (1,317 models: 970 saved by Power BI Desktop, 45 written by AI agents, 302 by other tools), read sampled findings by hand, and ran Tabular Editor CLI 0.7.1.2 on targeted models.
- **Michael's decisions of September 30, 2026.** Two new rules (section 5). Four existing rules change, each as a recorded deviation, with a calendar reader they share; a Direct Lake Quirk; a perspectives page fix (section 4). Everything else dropped, with display folders and CamelCase handed to custom rules (#118). The work is ordered capture first, then rules (section 2). The addition beyond Tabular Editor 3 for `DATE/CALENDAR_TABLES_SHOULD_BE_MARKED_AS_A_DATE_TABLE` (section 4.3) is approved.
- **Michael's ruling of October 1, 2026.** A column the model or one of its features needs counts as used: "not used" stands for "takes up space without providing value". So `UNNECESSARY_COLUMNS` joins the calendar changes (section 4.2), a fifth existing rule.
- **Michael's bar** (September 30, 2026): the smallest change that meets the boxes, a shape handled only when real files show it or Desktop writes it, and what was left out on that ground listed (section 9).
- **The deadline.** `te` 0.7.1.2 stops working after October 31, 2026, and a later build needs a license. Everything that needs `te` is in pull request 1, so the rules can be built after that date against committed captures.
- **Already checked:** `te` 0.7.1.2 with Microsoft's ruleset reproduces every committed model expectation exactly (724 findings on the six fixtures), so moving the oracle to 0.7 changes no captured result.

## 2. What gets built, by pull request

| Pull request | What | Needs `te` |
| --- | --- | --- |
| 1. The capture | `scripts/te-expectations.mjs` for 0.7, three capture modes; the six Microsoft expectation files re-captured; a new fixture; Tabular Editor 3 built-in captures and survey-file captures for every fixture; RELEASING and CONTRIBUTING | Yes, by October 31, 2026 |
| 2. The existing rules | Calendar reader; deviations in five rules; the text-measure skip; Direct Lake Quirk; perspectives page fix | No |
| 3. The new rules | `NAME_WITHOUT_TRANSLATION`, `DECIMAL_COLUMN_WITHOUT_FORMAT_STRING`, their pages, and the check against their sources | No |

Pull requests 2 and 3 are independent of each other; 2 goes first because it is smaller. #164 (calculated columns saved with no `dataType`) is a separate issue with its own pull request, fixture, and capture, also before October 31, 2026 (section 7).

## 3. The capture (pull request 1)

### 3.1 The script

`scripts/te-expectations.mjs` learns `te` 0.7's interface: the model goes in `-m`, and `bpa run` JSON reports `findings[]`, each with `code` and `object`, plus a `ruleErrors` count. Three modes, each writing one file per fixture:

- **`--rules <BPARules.json>`** (Microsoft's ruleset, as today): `--no-defaults --no-model-rules`, written to `tests/expectations/<fixture>.json`. Keeps `skipRules`, `deviations`, and `ours`, as today.
- **`--built-in`**: Tabular Editor 3's built-in rules, `--no-model-rules` and no `-r`, written to `tests/expectations/te3/<fixture>.json`. Same shape less `skipRules`, which only the Microsoft parity test reads; `deviations` and `ours` are keyed by the pbiplint rule that follows a built-in rule (section 5.3).
- **`--survey <files.json>`**: every rule file the list names, one `te` run each with `--no-defaults --no-model-rules`, written to `tests/expectations/survey/<fixture>.json` as `results` keyed by file id, each with its `findings` and `ruleErrors`.

`--from` stays for a saved `te` output. The `oracle` default names 0.7.1.2. `te` 0.7 reports a rule it cannot evaluate as a finding on the rule itself (`objectType` `BpaRule`, with the error as its message). Every mode prints it with its id and records it under `ruleErrors`, rule id to message, never as a finding. A rule file `te` cannot read at all is recorded in the survey capture as an `error` with `te`'s message (one of the 46 is a report rules file).

### 3.2 The re-capture

The six Microsoft expectation files are re-captured with 0.7.1.2. No finding changes; `oracle` and `captured` say which build and when, as #153's model parity box asks. `deviations` and `ours` are kept.

### 3.3 Tabular Editor 3's built-in rules

One capture per fixture, all 38 built-in rules as `te` 0.7.1.2 runs them (30 or 32 evaluate on these fixtures; the six VertiPaq rules need a `.vpax` file). Kept as the oracle for the rules pbiplint takes from the built-in set (section 5.3) and as a record of the built-ins' behaviour after `te` is gone.

### 3.4 The survey's rule files

The survey's 68 files (Microsoft's ruleset in four languages, and 64 published files in 44 repositories and Tabular Editor's community repository) come down to 46 distinct files by checksum, at 66 places (the survey listed two places twice). `tests/expectations/survey/files.json` lists each distinct file once: an id, the repository, the path, the commit it was read at, its sha256, its rule count, and the other places the same file was found. The commit is the repository's head when the file there still matches the survey's checksum, or else the newest commit whose copy does; the capture fetches the file at that commit and checks the checksum again.

The rule files themselves are not committed: several carry no license, Tabular Editor's community repository among them. #118 fetches them by commit when it needs them; its expected results are the captures here.

### 3.5 The new fixture

A hand-written model, `tests/fixtures/te3-zoo.SemanticModel` (named after `rule-zoo`), at compatibility level 1702, with `culture: en-US`. It holds every shape the new rules and the deviations need, and nothing else that could move an existing rule:

- **Cultures:** `en-US`, the model's own, with linguistic metadata only; `fr-FR`, with a `translations` block that captions some objects and leaves out a visible table, column, measure, hierarchy, hierarchy level, and calculation group table, plus a hidden column. No culture without a `translations` block, which this section first planned as `de-DE`: for such a culture Tabular Editor reports every visible object, which hides what `fr-FR` shows (measured on a draft, October 1, 2026). Section 5.1's skip of such a culture gets a unit test instead.
- **User-defined functions:** one with a one-word name and no description, and one with a compound name and a description, so section 5.3's check of the UDF rules compares findings. No other fixture has a UDF either rule reports.
- **Columns:** visible Decimal number (`double`) and Fixed decimal number (`decimal`) columns with and without a format string; a hidden one; one in a hidden table; whole-number and date columns with none. Every column declares its `dataType`, so #164's shape stays out of this fixture.
- **Measures with no format string:** a label built with `&` after `RETURN`, a `FORMAT` call, a lone string, a number (the case that is still reported), and `MAXX` over a text column (text, but not plainly so).
- **A calendar** on a `Date` table that is not marked as a date table, with hidden primary columns, one of them set to `isAvailableInMdx: false`; no table in the model is marked.
- **A calculation group** and a hierarchy with two levels, for the translation shapes.

Checks before committing: `te` loads it with no error; `pbiplint` reads it with no `PARSE_ISSUE`; and pbiplint's results today match its Microsoft-ruleset capture with no deviation, so parity passes in this pull request and pull request 2 adds the deviations.

### 3.6 The docs

- **RELEASING, Model parity expectations:** which build each file came from (0.7.1.2 for all, from this pull request), the two new kinds of capture and what each is for, and that a re-capture after October 31, 2026 needs a licensed build.
- **CONTRIBUTING, Refreshing parity expectations:** the three commands.

## 4. The existing rules (pull request 2)

### 4.1 The calendar reader

`buildModel` reads each `calendar` block under a table into `Table.calendars`, optional so code built against 0.2.2 still compiles: each calendar's name, location, and the columns its `calendarColumnGroup` children name (`primaryColumn`, `associatedColumn`, and the time-related `column` entries). The parser already keeps these blocks with no parse issue; the corpus has them in 3 Desktop models.

A column a calendar names is, for these rules, a column the calendar needs: "the primary columns are used for sorting" ([Primary versus associated columns](https://learn.microsoft.com/power-bi/transform-model/desktop-time-intelligence#primary-versus-associated-columns)).

### 4.2 The IsAvailableInMdx rules and UNNECESSARY_COLUMNS

- **`ISAVAILABLEINMDX_FALSE_NONATTRIBUTE_COLUMNS`** skips a column a calendar names, as Tabular Editor 3's built-in rule does (`not UsedInCalendars.Any()`). In the corpus this clears 6 false findings in 2 Desktop models, all hidden primary columns.
- **`SET_ISAVAILABLEINMDX_TO_TRUE_ON_NECESSARY_COLUMNS`** reports a column a calendar names that is set to `isAvailableInMdx: false`, as Tabular Editor 3's does, so the two rules stay mirrors. No corpus model has one.
- **`UNNECESSARY_COLUMNS`** counts a column a calendar names as used. Michael's ruling of October 1, 2026: "not used" is the rule's proxy for a column that takes up space in the model without providing value, and a column the model or one of its features needs to work is providing value. Tabular Editor 3 has no version of this rule, so this goes beyond it, as the rule's existing `groupByColumn` deviation for field parameters already does. te3-zoo shows it: Microsoft's rule reports the calendar's three hidden primary columns.
- **Direct Lake, a Quirk only:** Tabular Editor 3's versions skip tables with a Direct Lake partition, and no source says why (606 Desktop findings in 31 models). The false rule's page says so, and that Direct Lake loads columns on demand rather than processing them at refresh ([Direct Lake overview](https://learn.microsoft.com/fabric/fundamentals/direct-lake-overview)), in Quirks and in When to ignore it.

### 4.3 The date table rules

- **`MODEL_SHOULD_HAVE_A_DATE_TABLE`** passes when any table defines a calendar, as Tabular Editor 3's does. Microsoft: "You don't need to identify your own date table with the Mark as Date table option if you use the recommended Calendar-based time intelligence in Power BI unless in specific circumstances" ([Set and use date tables in Power BI Desktop](https://learn.microsoft.com/power-bi/transform-model/desktop-date-tables)). Tabular Editor 3's looser test (a Time table or a DateTime key, either alone) stays out: it clears half-marked tables.
- **`DATE/CALENDAR_TABLES_SHOULD_BE_MARKED_AS_A_DATE_TABLE`** skips a table that defines a calendar, for the same reason. Tabular Editor 3 has no version of this rule; this one goes beyond it (approved by Michael, September 30, 2026). No corpus model shows it today; all three calendar models are also marked.

### 4.4 Measures that plainly return text

`PROVIDE_FORMAT_STRING_FOR_MEASURES` skips a measure whose result, after its last top-level `RETURN` or the whole expression when there is none, is a lone string literal, holds a top-level `&`, or starts with a text function: `FORMAT`, `CONCATENATE`, `CONCATENATEX`, `UNICHAR`, `COMBINEVALUES`, `LEFT`, `RIGHT`, `MID`, `UPPER`, `LOWER`, `SUBSTITUTE`, `REPT`, `TRIM`, `FIXED`, `REPLACE`. It reads the tokens #104's tokenizer gives, so comments and strings cannot mislead it.

Microsoft: "You can't set a custom format string for fields that are of type string or Boolean" ([Use custom format strings in Power BI Desktop, Considerations and limitations](https://learn.microsoft.com/power-bi/create-reports/desktop-custom-format-strings#considerations-and-limitations)). Tabular Editor 3's built-in rule skips every measure it reads as not a number or a date. pbiplint has no DAX type inference, so it skips only what it can see: on the research's 36-model sample this matched 176 of the 390 measures Tabular Editor types as text and nothing else, and corpus-wide it clears 1,161 Desktop findings in 234 models. A measure that returns text another way, such as `MAXX` over a text column, is still reported; the page's Quirks say so, beside its existing When to ignore it line.

Following a returned variable, or requiring every branch of an `IF` or `SWITCH` to be text, lifts the share only from 45% to 52% for three times the code, so it is left out.

### 4.5 The deviations

Each change is a recorded deviation where a fixture shows it: `PROVIDE_FORMAT_STRING_FOR_MEASURES` on tvw-baseline (`[Top Region Label]` is skipped, `[Top Product Label]`, a `MAXX` over a text column, is still reported) and on te3-zoo; the five calendar changes on te3-zoo. Each rule page states its deviation in a sentence, as the existing ones do. The ported model rules' deviations go from five in three rules to eleven in eight (`UNNECESSARY_COLUMNS` already has deviations); the README's "five documented deviations" follows, in this pull request.

### 4.6 The perspectives page

`PERSPECTIVES_WITH_NO_OBJECTS`'s How to fix says Desktop has no perspective editor, and a Quirk says Desktop never writes perspectives. Microsoft's route is Desktop's TMDL view ("This method also applies to other semantic model metadata that lack a graphical interface, such as translations", [Common use cases for TMDL view](https://learn.microsoft.com/power-bi/transform-model/desktop-tmdl-view#common-use-cases-for-tmdl-view)), and 3 Desktop-saved corpus models carry a perspective. How to fix gives the TMDL view route first; the Quirk goes.

## 5. The new rules (pull request 3)

### 5.1 `NAME_WITHOUT_TRANSLATION`

- **Name:** "Visible name with no translation". **Category:** Naming Conventions. **Severity:** info (Tabular Editor rates its translation rules Low, which pbiplint maps to info). **Scope:** Table, Column, CalculatedColumn, CalculatedTableColumn, Measure, Hierarchy, Level. **Layer:** model. **Options:** none.
- **What it reads:** each culture other than the model's own (`culture:` under `model`) that carries a `translations` block. With no `culture:` line, every culture with a block counts. A culture with no block, such as Desktop's own `en-US` file of linguistic metadata, is not a translation and is skipped.
- **What it reports:** a visible table (calculation groups included), column, measure, or hierarchy, or a level of a visible hierarchy, that such a culture gives no `caption`. A caption equal to the object's name counts, as Tabular Editor counts it. One finding per object, at its declaration line, with the cultures in the detail: `no caption in fr-FR`, or `no caption in fr-FR and de-DE`.
- **Visible:** as pbiplint reads it elsewhere: the object and its table are not hidden; a level, its hierarchy. Where Tabular Editor reads visibility differently (a measure's own flag only), a fixture that shows it records the difference as a deviation.
- **Left out:** descriptions and display folders (they matter only to authors in the service: [Power BI support for metadata translation](https://learn.microsoft.com/power-bi/guidance/multiple-language-translation#power-bi-support-for-metadata-translation)), and the model's and perspectives' names (not among the objects Microsoft lists as translatable: [Metadata translation](https://learn.microsoft.com/power-bi/guidance/multiple-language-translation#metadata-translation)).
- **The model:** `Culture` gains what its `translations` block names: whether it has one, and which tables, columns, measures, hierarchies, and levels it captions. Optional, as `calendars` is.
- **Source:** Tabular Editor's `BPARules-PowerBI.json` (TabularEditor/BestPracticeRules at 98e71e1), `TRANSLATE_HIDEABLE_OBJECT_NAMES` and `TRANSLATE_HIERARCHY_LEVEL_NAMES`, which already skip the model's own culture ("You don't need to supply metadata translations for the default language of the semantic model", [Organize project for metadata translation](https://learn.microsoft.com/power-bi/guidance/multiple-language-locale#organize-project-for-metadata-translation)). Tabular Editor 3's built-in versions do not skip it and fire on nearly every Desktop model (98 findings on the messy-sales sample). Deviations from the source, shown on te3-zoo: calculation group tables are read, and a hidden table and the measures in it are not reported (the draft capture of October 1, 2026 shows Tabular Editor reporting both). A culture with no `translations` block is also skipped, a difference no fixture shows (section 3.5); a unit test covers it and the page states it.
- **Fix route:** Desktop's TMDL view, with a `createOrReplace` of the whole `cultureInfo` block from `definition/cultures/<culture>.tmdl` and the missing `caption:` lines added. The whole block, since `createOrReplace` "Creates or replaces the specified semantic model objects and all the descendants" ([CreateOrReplace command](https://learn.microsoft.com/analysis-services/tmdl/tmdl-scripts#createorreplace-command)). Or edit the culture file with Desktop closed. Translations Builder may be named after that route, as an optional tool.

### 5.2 `DECIMAL_COLUMN_WITHOUT_FORMAT_STRING`

- **Name:** "Visible decimal column with no format string". **Category:** Formatting. **Severity:** info (Tabular Editor 3's is a warning; info for its volume and because formatting is house style). **Scope:** Column, CalculatedColumn, CalculatedTableColumn. **Layer:** model. **Options:** none.
- **What it reports:** a column with `dataType: double` (Decimal number) or `dataType: decimal` (Fixed decimal number), not hidden and in a table that is not hidden, whose `formatString` is missing or blank. A column with no `dataType` line is skipped: its type is unknown to pbiplint (#164).
- **Source:** Tabular Editor 3's built-in `TE3_BUILT_IN_FORMAT_STRING_COLUMNS`. Deviations, shown on te3-zoo and the existing fixtures: whole-number and date columns are left out, since Desktop gives them a format string by default (95% and 98.5% of such columns in Desktop-saved models carry one); and a column with no `dataType` line is skipped.
- **Corpus:** 11,326 findings in 713 models saved by Desktop or other tools; 7 of 8 sampled true. Most land on columns `AVOID_FLOATING_POINT_DATA_TYPES` already reports; the page's Related rules says how the two differ (one is about storage, the other about what readers see).
- **Fix route:** Desktop's Column tools, Format, or the Properties pane's Format in Model view ([Use custom format strings in Power BI Desktop](https://learn.microsoft.com/power-bi/create-reports/desktop-custom-format-strings#add-a-model-level-format-string)); in TMDL, a `formatString:` line. Whether that also removes the `PBI_FormatHint` annotation is a question for Desktop (section 8).
- **The sample:** the rule fires on messy-sales, so the sample's count changes, and #153's Sample and Smoke boxes apply.

### 5.3 The check against the sources

`packages/core/test/sourced-parity.test.ts` maps each pbiplint rule taken from Tabular Editor to the capture and source rules it follows:

| pbiplint rule | Capture | Source rules |
| --- | --- | --- |
| `NAME_WITHOUT_TRANSLATION` | survey, `BPARules-PowerBI.json` | `TRANSLATE_HIDEABLE_OBJECT_NAMES`, `TRANSLATE_HIERARCHY_LEVEL_NAMES` |
| `DECIMAL_COLUMN_WITHOUT_FORMAT_STRING` | te3 | `TE3_BUILT_IN_FORMAT_STRING_COLUMNS` |
| `UDF_USE_COMPOUND_NAMES` | te3 | `TE3_BUILT_IN_UDF_USE_COMPOUND_NAMES` |
| `UDF_WITHOUT_DESCRIPTION` | te3 | `TE3_BUILT_IN_VISIBLE_UDF_NO_DESCRIPTION` |

On every fixture, pbiplint's findings for the rule equal the union of the source rules' findings, or, where the capture records a deviation for the rule, its `ours`. The same checks as `parity.test.ts`: a deviation must show a difference on that fixture and name a mapped rule. Object names compare as Tabular Editor writes them, which the plan checks against the captures for levels and hierarchies before writing the rules.

### 5.4 Pages and counts

Two pages from the template, in pbiplint's own words, with sources linking the rule file at its commit (for the built-in rule, Tabular Editor's knowledge base page), then `scripts/sync-rule-pages.mjs`. 106 rules, 24 built in; the README and the site's rules index follow. Their For AI assistants sections come with #96.

## 6. Dropped, and why

Recorded in #117's comment of September 30, 2026, in short:

- **Display folders, CamelCase:** team conventions, for #118, which runs the community file's rules unchanged.
- **Compatibility level:** Tabular Editor 3's fixed number goes stale, and the forms that would not find nothing.
- **TODO in DAX:** no Desktop model in the corpus has one in a DAX comment; markers in M stay with #78.
- **Relationship column names, single-column dimensions, objects in no perspective:** mostly false findings in the samples.
- **Tabular Editor 3's other differences:** its date table test, its visibility and severity choices for the format string rule, and Direct Lake as a deviation (a Quirk instead).

## 7. #164 and the deadline

#164's fix (a missing `dataType` read as unknown) is its own pull request, with its own fixture of untyped calculated columns, captured with both Microsoft's ruleset and the built-in rules before October 31, 2026. It can run alongside this issue's pull requests; it shares only the date table rule with section 4.3, so whichever lands second rebases. `DECIMAL_COLUMN_WITHOUT_FORMAT_STRING` skips untyped columns either way.

## 8. Questions for Power BI Desktop

For Michael, before pull request 3's pages:

1. **What General shows.** In a table visual, put a Decimal number column left at General (a ratio such as 0.3333, or an amount such as 1234.5). What does the cell show? The page's Why it matters quotes what a reader sees.
2. **The format hint.** Set a format on a Decimal number column in Column tools, save the project, and look at the column in its TMDL file. Is `annotation PBI_FormatHint = {"isGeneralNumber":true}` gone? If yes, the page's TMDL route says to delete it with the new `formatString:` line.

## 9. Left out on the real-files bar

- Display folders and descriptions in the translation rule (no multi-language corpus model has one to translate).
- The legacy `culture` keyword a Desktop 24.02 save used for `cultureInfo`, which pbiplint reports as a `PARSE_ISSUE`: one corpus model, already flagged.
- Type inference for measures and columns: the text-measure skip reads what the tokens show, and #164 reads a missing type as unknown.
- A Direct Lake deviation, until a source explains Tabular Editor 3's.

## 10. Release notes

Each pull request comments on #117 under "For the 0.2.3 release summary": new rules (pull request 3); what can change in results (the sample's count, the five calendar deviations, the text-measure skip, which removes findings a gated workflow may have tripped on); and, for code that uses `@pbiplint/core` directly, the optional `Table.calendars` and the `Culture` field (additions only).
