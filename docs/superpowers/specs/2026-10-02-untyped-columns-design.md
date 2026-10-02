# Columns with no dataType: what #164 builds

Issue #164, milestone 0.2.3. Written October 2, 2026, after Michael chose the approach (a missing type is unknown) and approved this design in outline the same day. Amended the same day with what the plan measured (sections 4, 5, and 6).

## 1. The problem

Power BI Desktop leaves the `dataType` line off most calculated columns and calculated table columns: in the #104 corpus, 3,816 of 4,063 calculated columns (94%) in 352 Desktop models, and 3,531 of 3,947 calculated table columns (89%) in 335. pbiplint reads a missing line as an empty type, so a rule that asks whether a column is not of some type reports the column:

- `RELATIONSHIP_COLUMNS_SAME_DATA_TYPE` (error): 1,183 of its 1,412 Desktop findings (84%) have an untyped side, in 260 models and 131 repositories. At `error`, the GitHub Action's default `fail-on: error` fails a sound model.
- `MODEL_SHOULD_HAVE_A_DATE_TABLE`: 65 Desktop models in 37 repositories get it only because the marked date table's key is an untyped calculated table column, as `CALENDAR(...)` saves; `DATE/CALENDAR_TABLES_SHOULD_BE_MARKED_AS_A_DATE_TABLE` reports the same tables.

Tabular Editor reads each type from the column's DAX. A probe on October 2, 2026 (`te list Columns` on a throwaway model) gave every untyped column its DAX type: `YEAR(...)` a whole number, `DIVIDE(...)` a decimal, `IF(..., "Y", "N")` and `FORMAT(...)` text, a date plus 30 a date, and `CALENDAR(...)`'s `Date` a date.

## 2. The decision

Michael's ruling of October 2, 2026: **a missing `dataType` is unknown, and no rule reports anything that depends on a type it cannot see.** That stops every false finding, at little code, and follows `DECIMAL_COLUMN_WITHOUT_FORMAT_STRING`, which already skips an untyped column.

Set aside: reading the type from the DAX, as Tabular Editor does, which would also recover the findings the "is" tests miss (section 3.4) but needs a DAX type system (return types for hundreds of functions, operators, `IF` branches, variables, the columns `ADDCOLUMNS` and `CALENDAR` create), the type inference #117's spec left out on the real-files bar (its section 9); and inferring only the common shapes, which is fragile at its edges, where each gap is a quiet miss that is hard to document. A quieter rule is preferred to a wrong one.

## 3. The behavior

### 3.1 The helper

`packages/core/src/rules/helpers.ts` gains one way to ask whether a column's type is known, beside `dataType` and `isNumericType`, so every rule asks it the same way. The model does not change: `Column.dataType` stays an optional string, and `@pbiplint/core`'s types do not move.

### 3.2 The "is not" tests

Each reports nothing on a column whose type is unknown:

- `RELATIONSHIP_COLUMNS_SAME_DATA_TYPE`: no finding when either side's type is unknown.
- `RELATIONSHIP_COLUMNS_SHOULD_BE_OF_INTEGER_DATA_TYPE`: an untyped column in a relationship is not reported.
- `FORMAT_FLAG_COLUMNS_AS_YES/NO_VALUE_STRINGS`: the "ends with ` Flag` and is not text" half skips an untyped column. Its "starts with `Is` and is a whole number" half is an "is" test (section 3.4).

### 3.3 The date table rules

`MODEL_SHOULD_HAVE_A_DATE_TABLE` and `DATE/CALENDAR_TABLES_SHOULD_BE_MARKED_AS_A_DATE_TABLE` count a table marked as a date table (`dataCategory: Time`) whose key column (`isKey`) has an unknown type as having its date key. Whether the key is a date is the test neither rule can decide without the type, and Microsoft's guidance for a marked date table is that "you need to make sure the data type is properly set. You want to set the Data type to Date/Time or Date" ([Mark your date table as the appropriate data type](https://learn.microsoft.com/power-bi/transform-model/desktop-date-tables#mark-your-date-table-as-the-appropriate-data-type)). A marked table whose key has a known type that is not a date is still reported, as now.

### 3.4 The "is" tests

Their code does not change: an unknown type already matches no type they test for. Where Tabular Editor reads the type from the DAX and reports, they stay silent. The rules: `AVOID_FLOATING_POINT_DATA_TYPES`, `DATECOLUMN_FORMATSTRING`, `MONTHCOLUMN_FORMATSTRING`, `ADD_DATA_CATEGORY_FOR_COLUMNS`, `MONTH_(AS_A_STRING)_MUST_BE_SORTED`, `NUMERIC_COLUMN_SUMMARIZE_BY`, the `Is` half of `FORMAT_FLAG_COLUMNS_AS_YES/NO_VALUE_STRINGS`, `HIDE_FACT_TABLE_COLUMNS`, `UNPIVOT_PIVOTED_(MONTH)_DATA`, and pbiplint's own `DECIMAL_COLUMN_WITHOUT_FORMAT_STRING`. Each difference the new fixture shows is a recorded deviation (section 5).

### 3.5 What no fixture shows

A real mismatch with an untyped side (an untyped calculated column whose DAX gives a whole number, related to a text column) is now missed by `RELATIONSHIP_COLUMNS_SAME_DATA_TYPE`. Desktop is not known to save that shape, so the fixture does not construct it; the rule's page states it as a Quirk, its doc comment names it, and a unit test pins it.

## 4. The fixture and its captures

**The captures come first**, before any rule changes, since `te` 0.7.1.2 stops working after October 31, 2026.

- **`tests/fixtures/untyped-columns.SemanticModel`**, written by hand in the shape Desktop saves (the TMDL of a Desktop-saved model such as `DataChant/Trello-Power-BI` at 250f924 is the reference for its lines, not a source to copy), with no identifying names or paths:
  - a `CALENDAR(...)` calculated table marked as a date table (`dataCategory: Time`), its `Date` column untyped with `isKey`, and untyped calculated columns on it, among them a whole-number year and a text month name with no sort-by column;
  - a fact table whose typed date column is related to that `Date` key;
  - an untyped calculated key column whose DAX gives a whole number, related to a whole-number column;
  - untyped calculated columns whose DAX gives a whole number, a decimal, text, and a date, named so the rules that read names see them (a `… Flag` text column, an `Is …` whole-number column, a `… Date` date column), visible, with the `summarizeBy` Desktop writes;
  - a measure that sums one of the untyped numeric columns.
- **Every shape is one Desktop writes**; none is constructed to show a miss (section 3.5).
- **What the plan measured:** the calendar is `CALENDAR(MIN('Orders'[Order Date]), MAX('Orders'[Order Date]))`, since a fixed year would fire `HARDCODED_PERIOD_IN_DAX`, which a test keeps silent on every fixture. `te` types `DIVIDE` of a fixed decimal by a whole number as a fixed decimal, so the fixture has a `DIVIDE` of two whole numbers as well, for a decimal number. With Microsoft's ruleset, `te` reports none of section 1's false findings on it.
- **A survey file is gone.** `aswalsheshant-cell/mt-dashboard/PowerBI/CI/bpa_rules.json` answers 404 (its repository is gone), and neither this Mac nor the Software Heritage archive holds a copy with its sha256; every earlier capture recorded no findings for it. `scripts/te-expectations.mjs` records a file GitHub no longer has as `{ "unavailable": "<url> returned 404 on <date>" }` instead of failing the run, and the capture test accepts that shape. It is not recorded as an error, since every survey capture already uses its one allowed error on a file `te` cannot run.
- **Before capturing**, `te list -m <fixture>/definition Columns` confirms each untyped column's type is the one its DAX was written for, and `te bpa run` with Microsoft's ruleset shows the false findings of section 1 absent from Tabular Editor's results on it.
- **Three captures** with `te` 0.7.1.2, by the commands in CONTRIBUTING's "Refreshing parity expectations": Microsoft's ruleset (`tests/expectations/untyped-columns.json`), the built-in rules (`te3/`), and the survey's files (`survey/`). The fixture joins the list in `scripts/test/te-captures.test.mjs`, which checks all three.

## 5. Deviations and pages

- **One recorded deviation per rule** on which pbiplint and a capture still differ on the new fixture, every sentence in the same shape: a column with no `dataType` line, as Power BI Desktop saves most calculated columns, has a type pbiplint does not know, so the rule does not report it (or compare it), where Tabular Editor reads the type from the column's DAX. The sentence goes in the fixture's capture (`deviations`, with pbiplint's findings under `ours`), on the rule's page under Quirks, and in the rule's doc comment, as for every deviation.
- **`DECIMAL_COLUMN_WITHOUT_FORMAT_STRING`**'s existing Quirk on untyped columns becomes a recorded deviation on the fixture's te3 capture, if the fixture shows it; the whole-number and date sentence too, if it shows that.
- **What the plan measured:** seven Microsoft rules differ on the fixture and get the recorded deviation (`AVOID_FLOATING_POINT_DATA_TYPES`, `DATECOLUMN_FORMATSTRING`, `FORMAT_FLAG_COLUMNS_AS_YES/NO_VALUE_STRINGS`, `HIDE_FACT_TABLE_COLUMNS`, `MONTH_(AS_A_STRING)_MUST_BE_SORTED`, `NUMERIC_COLUMN_SUMMARIZE_BY`, `RELATIONSHIP_COLUMNS_SHOULD_BE_OF_INTEGER_DATA_TYPE`), with `DECIMAL_COLUMN_WITHOUT_FORMAT_STRING` on the te3 capture by its existing untyped-column sentence alone. The other six ported rules that test a type (`RELATIONSHIP_COLUMNS_SAME_DATA_TYPE`, both date table rules, `ADD_DATA_CATEGORY_FOR_COLUMNS`, `MONTHCOLUMN_FORMATSTRING`, `UNPIVOT_PIVOTED_(MONTH)_DATA`) state it on their pages without a fixture. `RELATIONSHIP_COLUMNS_SHOULD_BE_OF_INTEGER_DATA_TYPE` loses a finding Tabular Editor rightly gives, a `CALENDAR` table's untyped `Date` key in a relationship: the cost of section 2's decision.
- **Pages:**
  - `RELATIONSHIP_COLUMNS_SAME_DATA_TYPE`: its Quirk and How to fix text that "a column with no `dataType` line compares as having none" is replaced by the new behavior, with section 3.5's miss.
  - `RELATIONSHIP_COLUMNS_SHOULD_BE_OF_INTEGER_DATA_TYPE` and `FORMAT_FLAG_COLUMNS_AS_YES/NO_VALUE_STRINGS`: a Quirk for the skipped untyped column.
  - Both date table pages: a Quirk for the untyped key, with the Microsoft quote of section 3.3.
  - Each "is" rule the fixture shows: its deviation sentence.
- After the page edits, `scripts/sync-rule-pages.mjs`.

## 6. Copy and counts

- **The count of documented deviations** in the Microsoft rules stays eleven: those are where the source is noisier or quieter than it means to be. Untyped columns are one reading rule across thirteen rules, not thirteen judgments, so `README.md`, `packages/cli/README.md`, `packages/core/README.md`, `packages/web/content/about.md`, and the doc comment in `packages/core/src/rules/microsoft-bpa/define.ts` gain a sentence of their own: a column whose TMDL names no type, as Power BI Desktop saves most calculated columns, is left out of the thirteen ported rules that test a column's type, where Tabular Editor reads the type from the column's DAX. (Plan amendment of October 2, 2026; the spec first said the count would move.) `docs/RELEASING.md` and `CONTRIBUTING.md` say what a capture does with a survey file GitHub no longer has.
- **The sample's count** does not move (measured): its three untyped columns are field-parameter columns, on which no type test changes its answer.
- **No rule is added**, so the rule counts stay at 106 and 24 built in.

## 7. One pull request, and the release note

One pull request: the fixture and captures (first), the helper and the rule changes, the deviations and pages, and the copy. Its comment on #164, for the 0.2.3 release summary: false `RELATIONSHIP_COLUMNS_SAME_DATA_TYPE` errors and date table warnings on calculated columns Desktop saves with no type are gone, so a workflow gated on `error` that failed on them passes; the "is" rules stay silent on untyped columns, each a documented deviation; the deviation count; no change to `@pbiplint/core`'s types.

## 8. Left out

- Reading types from DAX (section 2).
- A fixture shape built only to show a miss (section 3.5).
- Typed columns: nothing changes for a column with a `dataType` line.
