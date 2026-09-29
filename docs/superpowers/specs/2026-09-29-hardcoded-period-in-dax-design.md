# HARDCODED_PERIOD_IN_DAX: a native rule for fixed calendar periods in DAX

Issue #104, milestone 0.2.1. Written September 29, 2026.

## 1. Sources and decisions

- **The issue.** #104 holds the decided scope, recorded on September 27, 2026 after the research pass and Michael's rulings. This spec follows it and does not reopen it.
- **The research.** `.superpowers/research/2026-09-27-hardcoded-periods/report.md` (in a local checkout; git-ignored), with the corpus, the prototype and its outputs in `~/Downloads/pbip-lint-spike/research-104/`. The prototype is `daxlex.py` (the tokenizer) and `analyze.py` (the forms). Where this spec says "as the research did", it means those two files.
- **Decided on September 29, 2026** (Michael approved the design in chat before this spec was written):
  - A finding points at the line of the fixed period itself, not at the object's declaration line, which needs the parser to record where each expression's text starts (section 7).
  - One finding per object, whose detail lists the periods the object fixes.
  - The name, category, and scope in section 2.
  - An object is named for its period when its name carries one of the years found in it, as four digits or as the last two digits standing alone (section 4.5). On the research's 259 hand-labelled objects this marks exactly the 87 labelled as named for their period, all deliberate, and none of the 73 stale ones.
  - A date table's end is resolved through `VAR`s, `DATE()` of whole numbers or of variables holding one, `dt"..."`, `DATEVALUE`, `DATETIMEVALUE` or `VALUE` of a string, and a bare date string. An end given through a measure or with date arithmetic is left out: none of the corpus's 38 fixed ends is written either way.
  - No skip when the model is partly read (section 2).
  - The tokenizer lives in core at `packages/core/src/dax/tokenize.ts` and is internal to core.
  - The finished rule is run over the research corpus and compared with the prototype before the pull request (section 10).

## 2. The rule

| Field | Value |
|---|---|
| id | `HARDCODED_PERIOD_IN_DAX` |
| name | Hardcoded period in DAX |
| category | DAX Expressions |
| severity | 1 (info) |
| scope | `Measure`, `CalculatedColumn`, `CalculationItem`, `CalculatedTable` |
| layer | `model` (needs the model only) |
| status | `builtin` |
| options | none |

- **Severity.** Info by default, because many fixed periods are deliberate (61% of the research's flagged objects) and the fix takes judgement. A team that wants it louder sets `"HARDCODED_PERIOD_IN_DAX": "warning"` under `rules` in `pbiplint.config.json`, the per-rule severity every rule already accepts. No new option.
- **No `skipWhenModelUnread`.** The rule reads each object's own expression and reports what that text holds. A file the parser could not read can hide an object from the rule, never put a false period in one. (The date table end does not follow a reference to a measure, so a missing measure cannot change a finding either.)
- **Where it lives.** `packages/core/src/rules/pbiplint/periods.ts`, exporting `HARDCODED_PERIOD_IN_DAX` and `periodRules`, listed in `pbiplintRules` after `measureRules`. It is pbiplint's first native model rule.
- **Its page.** `rules/hardcoded-period-in-dax.md` (section 9).

## 3. What it reads

- **Measures**, their `expression` (not `formatStringDefinition`).
- **Calculated columns** (`Column.kind === "calculated"`), their `expression`.
- **Calculation items**, their `expression` (not `formatStringDefinition`).
- **Calculated tables** (`Table.kind === "calculated"`), the DAX of each partition whose `sourceType` is `calculated`, for the date table form only (section 4.1). Desktop's auto date/time tables (`isAutoDateTable` in `model/names.ts`: `LocalDateTable_` and `DateTableTemplate_`) are left out; their template is `Calendar(Date(2015,1,1), Date(2015,1,1))`, which the sample project carries.

Not read: other calculated tables' DAX beyond `CALENDAR`, DAX functions, row-level security filters, format string expressions, and M. The issue's "left out of the first version" list gives the reasons.

## 4. What it reports

Each form below finds **periods** in one expression. A period is a year (from a whole number or a string of four digits) or a date (from `DATE()` of three whole numbers, a date string, or `dt"..."`). Every form works on tokens from the tokenizer (section 6), so text inside a string, a comment, a `'table'` name, or a `[column]` name is never read as a number.

**A year** below means a four-digit whole-number token, or a string token whose trimmed text is four digits, whose value is from 1950 to 2049. Outside that range a literal is left alone: the research found `DATE(9999, 12, 31)` as an open-end sentinel, 1900 as a missing-date default, and 1899 as the serial-date epoch, and no stale period outside it. The range does not apply to a date table's end (section 4.1).

### 4.1 A date table whose `CALENDAR` ends on a fixed date

For each `CALENDAR(` call in a calculated table's DAX, its second argument (the end) is resolved:

- **`DATE(a, b, c)`** filling the whole argument, where each of `a`, `b`, and `c` is a whole-number token, or an identifier naming a variable whose definition is one whole-number token (so `DATE(__LastYear, 12, 31)` with `VAR __LastYear = 2023` resolves). The date is what DAX makes of it: `DATE(2025, 13, 1)` is January 1, 2026, as JavaScript's `Date.UTC` rolls a month or day over.
- **`dt"yyyy-mm-dd"`** filling the whole argument.
- **`DATEVALUE("...")`, `DATETIMEVALUE("...")`, or `VALUE("...")`** filling the whole argument, with one string argument that reads as a date (below).
- **A string** filling the whole argument that reads as a date.
- **An identifier naming a variable**: its definition is resolved by these same steps, with a guard against a variable that refers back to itself.

Anything else (a column, `MAX(...)`, `TODAY()`, `EOMONTH(TODAY(), 0)`, `CALENDARAUTO()`, a measure, arithmetic) is not a fixed end. The start is never read: 51 of the corpus's 148 `CALENDAR` calls have a fixed start, which is normal.

**A string reads as a date** when its trimmed text is:

- Year first: four digits, a separator (`-` or `/`, the same one twice), month, day, optionally followed by a time (a space or `T`, then `h:mm`). Only `-` and `/` count, so a version string such as `"2026.9.11"` does not.
- Year last: day and month in either order (one or two digits each), a separator (`-`, `/`, or `.`), four digits, optionally followed by a time. When only one order gives a real date, that is the date. When both do and they differ (`"01/02/2026"`), the date is ambiguous: DAX reads it by the model's culture, which pbiplint does not settle, so the detail quotes the string as written instead of naming a date.

Every fixed end is reported, whatever its year, and the detail names the end date, so a finding depends only on the files and never on the day of the run. The research found 38 fixed ends in the Desktop corpus, 24 of them on or before December 31, 2026.

### 4.2 `DATE()` with a fixed year

In measures, calculated columns, and calculation items: each `DATE(` call whose first argument is exactly one whole-number token holding a year. The period is the date when the second and third arguments are each one whole-number token too, and the year otherwise (`DATE(2024, 'Date'[Month], 1)` fixes the year 2024).

Left alone:

- **A date table bound**: a `DATE(` call inside an argument of `CALENDAR` or `GENERATESERIES`, directly or at any depth, as the research left them.
- **A year that does not matter**: a `DATE(` call that is the first argument of `FORMAT`, when `FORMAT`'s second argument is one string token with no `y` or `Y` in it. This covers the locale probe `FORMAT(DATE(2000, 1, 1), "oooo")` and the month-name trick `FORMAT(DATE(2025, 'Date'[MonthNum], 1), "mmmm")`.

### 4.3 A year compared or listed with a year

In measures, calculated columns, and calculation items:

- **Compared.** An `=`, `==`, or `<>` operator with a year on one side and a **year operand** (section 4.4) on the other: `'Date'[Year] = 2025`, `YEAR('Sales'[Order Date]) = 2026`, `2025 = SelectedYear`, `Productivity[Year] = "2025"`. The `=` of `VAR name =` is not a comparison. Range operators (`<`, `<=`, `>`, `>=`) are left out: only 24% of those were stale.
- **Listed.** `<year operand> IN { ... }`: each year among the number and string tokens inside the braces. `'Dim_Fecha'[Año] IN {2024, 2025, 2026}` fixes three years.
- **Assigned.** `VAR <name> = <year>`, where the name is a year name and the definition is the year alone (one number or string token): `VAR SelectedYear = 2025`. All four such objects in the research were stale.

### 4.4 Year operands and year names

A **year operand** is the operand next to the operator: for the left side, the operand that ends just before it; for the right side, the one that starts just after it; for `IN`, the operand before `IN`. It is one of:

- **A column or measure name** (`[Year]`, `'Date'[Año]`, `Date[FiscalYear]`) whose name is a year name.
- **A call to `YEAR(...)`.**
- **A call to an aggregate or wrapper** whose parentheses hold a call to `YEAR(`, or else in which the first column or measure name that has any class below (year, month, quarter, or key) is a year name: `SELECTEDVALUE('Date'[Year])`. The functions are the research's: `SELECTEDVALUE`, `MAX`, `MIN`, `VALUES`, `DISTINCT`, `FIRSTNONBLANK`, `LASTNONBLANK`, `MAXX`, `MINX`, `LOOKUPVALUE`, `RELATED`, `CALCULATE`, `HASONEVALUE`, `SUM`, `AVERAGE`, `CONVERT`, `INT`, `VALUE`, and `FORMAT` (for `FORMAT`, a string argument of `yyyy` or `yy` also makes it a year operand).
- **A variable**: an identifier not followed by `(` whose name is a year name (`SelectedYear`, `_anio`).

Both sides are read the same way. (The prototype read `FORMAT` on the left side only; section 10 accounts for any finding this adds.)

A name is split into **words**: at a lowercase letter followed by an uppercase one, at a letter followed by a digit, and at every character that is neither a letter nor a digit; then lowercased. Its class, as the research's `name_class` gives it:

- **Year words:** year, years, yr, yrs, año, años, ano, anos, anio, jahr, année, annee, anno, jaar, år, rok, vuosi, ejercicio, exercice, fy, ay, cy, ly, py, yyyy, y; and any word that starts with `year`, or ends with `year` and is longer than four letters (`fiscalyear`).
- **Month words:** month, months, mes, mês, meses, monat, mois, mese, maand, mm, mon, mth, period, periodo, período; and any word that starts with `month`.
- **Quarter words:** quarter, qtr, q, trimestre, quartal, kwartaal; and any word that starts with `quarter`.
- **Key words:** key, id, yyyymm, yearmonth, ym, monthkey, datekey, periodkey, yyyymmdd, sk.

A name is a **year name** when it has a year word and none of these apply:

- It also has a month or quarter word, or its lowercased text without spaces contains `yearmonth` or `yearqtr`: it is a key (`YearMonth`, `Year Quarter`), and year-month keys were never stale.
- It has the word `years` and one of the words of, service, experience, at, in, since, tenure, or old: it counts years (`Years of Service`), and is not a year.

Every word list is multilingual by default, as decided on the issue; #97's language setting is for the ported rules.

### 4.5 An object named for its period

After the forms have run, an object is left out entirely when its own name carries any year the forms found in it, as written in the DAX:

- the year's four digits anywhere in the name (`Total Sales 2026 (eBay)`, `Values2025`, `discharged_on_or_after_01042022`), or
- the year's last two digits with no digit on either side (`Average Daily Calls Jan-24 to Dec-24`, `GP Pop Growth from 19/20`, `% Frail 2021/22`).

The name is the measure's, the column's, the calculation item's, or, for a date table, the table's. All 87 objects of this kind in the research were deliberate. The cost is a rare miss where two digits in a name match by chance (`Top 20` beside a fixed 2020); the page's Quirks section says so.

## 5. Findings

- **One finding per object** with at least one period after section 4.5, from `finding.measure`, `finding.column`, `finding.calculationItem`, or `finding.table` in `rules/helpers.ts`, so the object name, the object type, and the object an ignore annotation sits on are the ones every other rule gives. `annotation pbiplint.ignore = HARDCODED_PERIOD_IN_DAX` on the object silences it.
- **Location.** The file of the node that holds the expression (for a calculated table, its partition's `source` line, which may sit in a different file from the table's declaration when the table is split), and the line of the first period's token (section 7). A period's token is where the period is written, the place a reader edits: a year's own number or string, the `DATE` of a `DATE(` call, a date string, or a `dt"..."` literal. For a date table ended through a variable, that is inside the variable's definition, not at the `CALENDAR` call. When the object carries no node, the object's own location is used.
- **Detail**, for measures, calculated columns, and calculation items:
  - The periods in the order they appear in the expression, each once: a year as `2025`, a date in long form as `December 31, 2024`.
  - Prefixed `fixed year` or `fixed years` when every period is a year, `fixed date` or `fixed dates` when every one is a date, and `fixed periods` when they mix.
  - Joined as English lists are: `2024 and 2025`; `2024, 2025, and 2026`; with semicolons when an item holds a comma (`January 1, 2024; June 30, 2024; and December 31, 2024`).
  - At most three named; more become `and N more` (`2020, 2021, 2022, and 3 more`).
  - Examples: `fixed year 2025`, `fixed years 2024, 2025, and 2026`, `fixed dates January 1, 2024 and December 31, 2024`, `fixed periods 2025 and December 31, 2024`.
- **Detail**, for a date table: `ends on a fixed date, December 31, 2026`. An ambiguous string is quoted as written: `ends on a fixed date, "01/02/2026"`. A table with more than one fixed end (rare) names each: `ends on fixed dates December 31, 2025 and December 31, 2026`.
- **The rule page** carries the rest: that a fixed period can be deliberate (a baseline, a known event, a named year), and what to change to when it is not (`TODAY()`, the latest date in the data, or a parameter). A finding's detail stays short, as every other rule's does.

## 6. The DAX tokenizer

`packages/core/src/dax/tokenize.ts`, browser-pure like the rest of core (no `node:` imports), internal to core (not exported from `packages/core/src/index.ts`). It is a TypeScript port of the research's `daxlex.py` (`lex_dax` and `annotate`), about 150 lines, and #108 later moves `extractRefs` onto it.

**`tokenizeDax(expression: string): DaxToken[]`**, never throwing. Each token has:

- `kind`: `number`, `string`, `date` (a `dt"..."` literal), `table` (a `'quoted'` name), `column` (a `[bracketed]` name), `identifier`, `operator`, or `punctuation`.
- `text`: for `string`, `table`, and `column`, the content with its doubled quote or bracket undone (`""`, `''`, `]]`); for `date`, the text between the quotes; for the rest, the source text.
- `start` and `end`: offsets into the expression.
- Structure, filled after the scan: for an opening `(` or `{`, the index of its closing token (`close`), and the upper-cased name of the function it calls when an identifier precedes a `(` (`call`); for every token, the index of the innermost enclosing `(` or `{` (`parent`) and its argument index within it (`arg`), counted by the commas directly inside.

It reads:

- **Comments**, dropped: `//` and `--` to the end of the line, `/* */` to its close or the end of the text.
- **Strings**: `"..."` with `""` for a quote; an unterminated one runs to the end of the text.
- **`dt"..."`**: `dt` or `DT` (any case) directly before a quote, not preceded by a letter, digit, or `_`.
- **`'table'`** names with `''`, and **`[column]`** names with `]]`; an unterminated one runs to the end.
- **Numbers**: digits with an optional fraction and exponent, or a leading `.` and digits.
- **Identifiers**: a letter (any script, `\p{L}`) or `_`, then letters, digits, `_`, and `.` (`PERCENTILE.INC`).
- **Operators**: `==`, `<>`, `<=`, `>=`, `&&`, `||`, `=`, `<`, `>`, `+`, `-`, `*`, `/`, `^`, `&`. Anything else is one character of punctuation.
- **Unbalanced brackets** do not throw: an unmatched close has no `close` and pops nothing.

**`daxVariables(tokens)`** returns each `VAR name = ...` definition: the name, lowercased, and the token range of its definition, which runs from after `=` to the next `VAR` or `RETURN` at the same depth, or to the first token at a shallower depth. A name used later resolves to the nearest definition before the use. (The prototype kept one definition per name, the last; the nearest earlier one is right for DAX's nested `VAR` blocks, and section 10 accounts for any difference.)

## 7. Where an expression's text starts

The parser records, on each `TmdlNode` with a value read after `=` (an `expr` node, or an `object` node declared with `=`), `valueLine`: the file line of the value's first line.

- **Inline** (`measure X = SUM(...)`): the header's own line.
- **Indented block**: the first non-blank line after the header, where `collectBlock` starts reading.
- **Code fence**: the line after the header, closed or not.

Every value line maps one to one to a file line (blank lines inside a value are kept as empty lines, and only trailing ones are dropped), so the line of any offset in a value is `valueLine` plus the number of line breaks before the offset. A helper in the rule's file, `lineAt(node, offset)`, gives it; the rule is its only reader. `Measure.expression`, `Column.expression`, `CalculationItem.expression`, and a partition's `source` are each the text of such a node, so an offset into one is an offset into the node's value. A calculated table's `source` node is the partition's child `expr` node of type `source`.

`valueLine` is optional on the type and set wherever the parser reads a value; nothing else reads it yet.

## 8. Tests

- **Tokenizer** (`packages/core/test/dax-tokenize.test.ts`): every token kind; comments of all three forms dropped; `""`, `''`, and `]]` undone; `dt"..."` and an identifier ending in `dt` before a string; dotted and non-Latin identifiers; each operator; `close`, `call`, `parent`, and `arg` on nested calls and braces; unterminated strings, names, and comments and unbalanced brackets without a throw; `daxVariables` with nested `VAR` blocks and a reused name.
- **Parser** (`parse.test.ts`): `valueLine` for an inline value, an indented block (with a blank line before its first line), a closed fence, and an unterminated fence.
- **Rule** (`packages/core/test/rules-native-periods.test.ts`), each case a small TMDL model through `lint`:
  - Fires: each form of 4.1 to 4.3, both sides of a comparison, string years, `IN` lists, `VAR` years, calculation items, calculated columns.
  - Stays silent: a range comparison; a month or quarter compared with a small number; a year-end string such as `DATESYTD('Date'[Date], "6/30")`; `DIVIDE(x, 12)`; a year in a comment, a string elsewhere, a `[name]`, or a `'table'` name; a key column (`[YearMonth] = 202306`); `Years of Service`; a year outside 1950 to 2049; the `FORMAT` exclusions; `DATE()` inside `CALENDAR` or `GENERATESERIES`; an auto date table; a date table's fixed start with a dynamic end; an object named for its period in both digit forms.
  - Findings: one per object; the location line in each value layout of section 7 and in a split table; each detail shape of section 5, the ambiguous string, and `and N more`; an ignore annotation.
- **The rule page's example** runs through `rule-pages.test.ts` as every page's does.
- **Pinned lists**: wherever tests pin the rule set or the sample's findings (`engine.test.ts`, `cli.test.ts`, the expectations under `tests/expectations/`, the site's sample counts), updated for the new rule. The sample project's only `CALENDAR` is its auto date table, so the sample should gain no finding; the plan confirms it.

## 9. The rule page

`rules/hardcoded-period-in-dax.md`, in the template every page follows (the rule pages spec, `2026-09-19-rule-pages-template-design.md`), pbiplint's own prose, `sources:` empty as a `builtin` rule's are.

- **What it checks**: the three forms, the scope, the year range, and what each finding names and where it points (the line of the period, not the object's first line, which is new among the model rules and worth a sentence).
- **Example**: a `tmdl fires` table with a `Current Year Sales` measure filtering `'Date'[Year] = 2025`, and a `tmdl fixed` one that takes the year from the data. The date table form is shown in How to fix it.
- **Why it matters**: a measure right this year is quietly wrong next year, and a date table built to `DATE(2026, 12, 31)` stops time intelligence at the year's end with no error.
- **How to fix it**, in Power BI Desktop with no third-party tool: edit the measure or column in the formula bar (or the TMDL), replacing the year with `YEAR(TODAY())`, with the latest year in the data (`YEAR(MAX('Sales'[Order Date]))`), or with a what-if parameter's value; for a date table, end `CALENDAR` at `MAX` of the fact table's date column, at a date built from `TODAY()`, or use `CALENDARAUTO()`.
- **When to ignore it**: a baseline, a known event, a cohort, a historic rule change, or sample data; renaming the object to carry its year also stops the finding, since that is what the rule reads as deliberate.
- **Quirks**: the name check's two-digit form; ambiguous date strings; the forms left out (range comparisons, fiscal-year labels such as `"2024/25"`, year-month keys, other calculated tables, functions, row-level security, M), with the reason for each in a clause.
- **Related rules**: `MODEL_SHOULD_HAVE_A_DATE_TABLE` and `DATE/CALENDAR_TABLES_SHOULD_BE_MARKED_AS_A_DATE_TABLE` beside the date table form, if their pages suit it.
- **Links**: Microsoft Learn's pages on `CALENDAR`, `DATE`, `TODAY`, `CALENDARAUTO`, date tables in Power BI, and what-if parameters. Each URL is opened and checked before it goes on the page, and any sentence that says what one of them says carries its link.

After the page is written, `scripts/sync-rule-pages.mjs` regenerates the summary and SARIF help data from it.

## 10. The corpus check

Before the pull request, a scratch script (in the session's scratchpad, not committed) runs the built core over every model in `~/Downloads/pbip-lint-spike/research-104/corpus/`, grouped as `corpus-manifest.tsv` groups them, and compares the rule's findings on the 970 Desktop models with the prototype's:

- **The prototype's side**, rebuilt from `findings.jsonl` with the decided scope: the forms of section 4 (`B_full_date` `DATE-literal` and `A_year_context` `DATE-year-arg` outside date table bounds and year-free `FORMAT`; `A_year_context` `compare`, `compare-reversed` and `compare-string-year` with `=`, `==`, or `<>`; `in-list` and `in-list-string`; `var-assign` with a year name; `D_date_table` `CALENDAR` with a literal end), in measures, calculated columns, calculation items, and calculated tables for the date table form, less objects named for their period by section 4.5.
- **Expected**: 74 objects in 23 repositories (81 counting copies) besides the date tables, and the 38 fixed `CALENDAR` ends.
- **Every difference** is listed with its repository, file, and line, and explained (a deliberate difference named in this spec, such as `FORMAT` on the right or the nearest `VAR` definition, or a bug to fix). A difference no sentence explains is brought to Michael.
- **Robustness**: the run covers the agent and tool groups too (counted apart), and no model may throw.
- The summary (counts, differences, and the stale share on the research's labels where they apply) goes in the pull request body.

## 11. Out of scope

- Everything the issue leaves out of the first version: range comparisons, date strings and typed literals outside date table ends, year-month and year-quarter keys, fiscal-year labels (the first candidate to add later), other calculated tables, DAX functions, row-level security filters, and year arithmetic.
- Report filters on a fixed year: #113.
- Moving `extractRefs` onto the tokenizer: #108.
- Fixed dates in M (`#date`, `List.Dates`): the v3 Power Query work.
- The README's Status clause naming the first native model rule, and the release note: #116, which gets a comment when this merges.
