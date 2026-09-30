# DAX references read from the tokenizer

Issue #108, milestone 0.2.2. Written September 30, 2026.

## 1. Sources and decisions

- **The issue.** #108 holds the scope: `extractRefs` reads references from #104's tokens, every rule that reads references is checked for what moves, the parity suite, expectations, and sample pins are rerun, #69's extended column syntax is covered, and `ReportReferenceIndex.referencedBy` goes. #152 names what the release must explain. #115 builds on this reader and is not built here.
- **The measurements.** A prototype of the reader was run over the test suite, every fixture, the sample, the #104 corpus (1,317 models, `~/Projects/pbiplint-assets/pbip-lint-spike/research-104`), and the corpus repositories' reports, fetched at the same commits (324 projects with both a model and a PBIR report). Every moved finding was traced to its cause, and one model per moved case (19; copies of a model count once) was run through Tabular Editor 0.7.1.2. The ledger at `.superpowers/sdd/2026-09-30-dax-refs-from-tokenizer/progress.md` (git-ignored) records the numbers and each ruling.
- **The bar.** A DAX shape gets code only when real files show it or Power BI Desktop writes it (Michael, September 30, 2026). Section 5 lists what was left out on that ground.

## 2. What changes

- **References come from tokens.** `extractRefs` tokenizes the expression with `tokenizeDax` (`packages/core/src/dax/tokenize.ts`) and reads each `[name]` token. It is qualified when it follows a `'table'` token, or follows an identifier with nothing between them (`Sales[Amount]`); any other `[name]` is bare. These are the regular expressions' rules, now applied only to code: a name inside a string or a comment is no longer a reference, a doubled `]]` inside a bracketed name is read as DAX writes it, and a `[` inside a string or a quoted table name no longer throws off the brackets after it.
- **Extended column syntax.** A `[name]` right after `[column].` is skipped, so `'Sales'[OrderDate].[Year]` reads `'Sales'[OrderDate]` alone. Nothing resolves the variation (#69 was closed as not planned on September 29, 2026).
- **Function calls come from the same tokens.** A call is an identifier followed by `(`, its dotted name read whole, so `Set.Intersect(` is one name, as #115 needs; a call inside a comment or a string no longer counts. The index tokenizes each owner's text once and reads both references and calls from it. The report's own measures go through the same two readers.
- **Unchanged:** which DAX is read (measures with their format strings, calculated columns and tables, calculation items with their format strings, row-level security filters, functions, and the report's own measures), how a name resolves once read (`resolveBareName`), and the ported rules that match raw text (IFERROR, USERELATIONSHIP, the FILTER shapes, and the rest). Those follow Tabular Editor's own text tests, so parity keeps them as they are. So does UNNECESSARY_COLUMNS's substring test on security filters, which is the source rule's.

## 3. The public API (release notes, `@pbiplint/core`)

- **`extractRefs`**: the same signature and element type (`{ table?, name, qualified }`). It returns references in source order (before: qualified ones first, then bare ones), and leaves out names inside strings and comments and after `[column].`.
- **`ReportReferenceIndex.referencedBy`** is removed. Nothing called it. Code that did can filter `refs` by `resolution`.
- **`RefOwner.calls`** and `ReferenceIndex.callsOf` no longer count a call inside a comment or a string.

## 4. What moves, and why

Fixtures, the committed expectations, the parity suite, report parity, and the sample (256 findings) do not move. On the corpus:

| Rule | Moves | Cause | Against Tabular Editor |
|---|---|---|---|
| DAX_COLUMNS_FULLY_QUALIFIED | 39 fewer, 22 models | 30 extended column syntax (`.[Date]` read as a bare column), 7 strings, 2 comments | Closer: Tabular Editor reports none of them |
| DAX_MEASURES_UNQUALIFIED | 6 fewer, 4 models | 3 strings (field parameter names such as `"'Fact Workforce'[New Starters %]"`), 3 comments | Closer: Tabular Editor reports none of them |
| UNNECESSARY_COLUMNS | 7 more, 7 models | A hidden column named only in a comment | Closer: Tabular Editor reports them |
| UNNECESSARY_MEASURES | None | | |
| NOT_REACHED_FROM_REPORT | 18 more, 11 projects; 6 fewer, 2 projects; 11 details name fewer referrers, 6 projects | More: 10 comments, 7 strings, 1 `''[Value]` read as a model column. Fewer: measures whose names hold `]` (`[Availability (Actual) [% Market]]]`), which the old reader could not read, so they looked unused. Details: a referrer that named the object only in a comment leaves the "referenced only by" list | pbiplint's own rule |
| BROKEN_FIELD_REFERENCE | None | It skips the report measures' DAX | pbiplint's own rule |

On the 19 models checked with Tabular Editor, the four dependency rules' differences from it fall from 107 to 72. The 72 predate this change: 59 are UNNECESSARY_COLUMNS's recorded group-by deviation, 11 are columns an expression creates (section 5), and 2 are bare names read on another table. No ported rule moves away from Tabular Editor, so #108 records no deviation and the deviation counts in the copy do not change.

`''[Value]` is the column of a table constructor, which [Microsoft Learn](https://learn.microsoft.com/dax/table-constructor) names `Value` when there is one column; 11 corpus models use it (40 times, 32 of them in calculated tables). It now reads as a qualified reference to a table with an empty name, which resolves to nothing, where the old reader took it for a model column called Value.

Six Quirks bullets on five published rule pages describe the old reader and become untrue: `dax-columns-fully-qualified`, `dax-measures-unqualified`, `unnecessary-columns`, `unnecessary-measures`, and `not-reached-from-report` (two bullets, one about calls). Each is reworded to say what the tokens give.

## 5. Left out

On the real-files bar (no corpus file has it):

- A space between an unquoted table name and its bracket (`Sales [Amount]`): still read bare, as today.
- A keyword glued to a bracket (`RETURN[Total]`): no keyword list.
- A string or comment left open in one piece of an owner's text swallowing the next (a measure's expression into its format string): the pieces stay joined, as today.
- Function names DAX refuses (`'Odd+Name[1]'`): the test that matched them as text goes.

Too rare for its machinery:

- Resolving a bare name by the table an iterator walks, which `resolveBareName`'s comment promised for #108: 5 of the corpus's 36,827 bare column references sit in an iterator over a named table with a choice of table, 3 resolve elsewhere, and none of those columns is hidden. The comment is reworded.

On scope (real, not in #108's boxes, and not moved by it):

- **A column the expression creates.** `ADDCOLUMNS(..., "Expiration", ...)` then `[Expiration]` resolves to a model column of that name if one exists. Tabular Editor 0.7.1.2 does not count those, and they are all 11 of the remaining DAX_COLUMNS_FULLY_QUALIFIED differences on the checked models. Corpus-wide, 891 references in 42 models; handling them would remove about 112 DAX_COLUMNS_FULLY_QUALIFIED findings in 20 models. #115 needs the same idea inside function bodies.
- **KPI expressions** (8 corpus models): not read, so a measure named only by a KPI's target can be reported by UNNECESSARY_MEASURES where Tabular Editor does not report it (one case in the one model checked).

## 6. Tasks

Each task writes its tests first and ends green on `npm test`, `npm run lint`, and `npm run typecheck`.

1. **The reader on tokens.** Tests in `indexes.test.ts`: a name in a `//`, `--`, or `/* */` comment or in a string is not read; `'Date'[Date].[Year]` reads `'Date'[Date]` only; `[A [%]]]` and `'O''Brien'[X]` read whole; `''[Value]` reads as a qualified reference with an empty table; references come in source order (three existing expectations reorder: two here, one in `report-refs.test.ts`). Then `extractRefs` over an internal reader of tokens, the index tokenizing each owner's text once, and `resolveBareName`'s comment reworded.
2. **Calls on tokens.** Tests: a call inside a comment or a string is not a call; the dotted-name cases (`MySales.NetAfter(`, `Other.Sales.NetAfter(`) stay non-calls; the odd-name test goes. Then `functionCallReader` reads tokens, and `buildReportReferenceIndex` tokenizes each report measure once for both readers.
3. **`referencedBy` removed** from `ReportReferenceIndex`, its map with it, and `report-refs.test.ts` asserts the same resolutions through `refs`.
4. **One rule test per moved rule**, on inline TMDL, each a shape the corpus moves (UNNECESSARY_MEASURES moves on no corpus model, so it gets none): UNNECESSARY_COLUMNS reports a hidden column named only in a comment; DAX_COLUMNS_FULLY_QUALIFIED is silent on `ALL('Calendar'[Date].[Month])`; DAX_MEASURES_UNQUALIFIED is silent on a qualified measure inside a string; NOT_REACHED_FROM_REPORT reports a column that a reached measure names only in a comment.
5. **Rule pages.** The six Quirks bullets reworded, then `node scripts/sync-rule-pages.mjs`, and the rule-page tests.
6. **Verification.** `npm run check:browser`, `npm run build`, the sample's first line unchanged, and the corpus diff rerun against the built branch, whose counts must match section 4 before the pull request, which carries them.

## 7. Amendment, September 30, 2026: the orchestrator's rulings on Phase 1

- **A column the expression creates** stays out of #108 and is parked for Michael, with the recommendation that #115 builds it once, for every kind of DAX. `resolveBareName`'s comment promises nothing to #108 and may say #115 handles columns a body creates.
- **KPI expressions are read** (task 7, the last task and its own commit, so it can be dropped): a measure's KPI target, status, and trend expressions join that measure's references, as its format string does. No KPI object kind, no KPI-scoped rule, and no change to `define.ts`'s KPI mapping. The parser already keeps the three expressions as properties of the measure's `kpi` block, so the model reads them in a few lines. Task 7 tests the Store Sales shape: a hidden measure named only by a KPI's target is not reported by UNNECESSARY_MEASURES. Any page or code comment that says KPI expressions are not read is corrected, and the corpus delta is reported with the pull request.
- **The six Quirks bullets** are rewritten in task 5 and checked by the reviewer. A commented-out field parameter row gets no bullet: dropping it is correct, and it goes in the release summary instead.
- **Release notes:** both API items in section 3 go under the third heading, `extractRefs` as a behaviour change with an unchanged type.

Task 7 joins section 6:

7. **KPI expressions.** A test that a hidden measure named only by a KPI's `targetExpression` is not reported by UNNECESSARY_MEASURES and that the KPI's references count as the measure's. Then `Measure.kpiExpressions` (target, status, and trend, when present) in `model/build.ts`, read with the measure's expression and format string in `buildReferenceIndex`, and any wording that says KPIs are not read corrected. The corpus rerun reports its delta.
