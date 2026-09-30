# HARDCODED_YEAR_IN_FILTER: a native report rule for a Filters pane filter on a fixed year

Issue #113, milestone 0.2.2. Written September 30, 2026. The companion to #104's HARDCODED_PERIOD_IN_DAX. Items marked **(Michael)** were his to rule on; he ruled on September 30, 2026, and section 11 records the rulings and what changed with them. The rest follow the issue and the orchestrator's brief.

## 1. Sources and decisions

- **The issue.** #113 decides the cautions: Filters pane only (report, page, and visual `filterConfig`), never saved slicer selections (SLICER_SELECTION_SAVED speaks to those) and not bookmarks; the fix moves the filter to a date column with a relative date filter, or to a current-year flag in the model, rather than editing it in place; deliberate fixed years exist, and the page says so; severity info, like #104.
- **The research.** `.superpowers/research/2026-09-27-hardcoded-periods/report.md`, section 7 (in a local checkout; git-ignored). Its 84 Filters pane filters in 5 repositories of the pull request 5 corpus are 39 lower bounds only, 26 upper bounds (all in one repository), 16 filters that keep the years they name, and 3 exclusions.
- **#104's design and code.** `docs/superpowers/specs/2026-09-29-hardcoded-period-in-dax-design.md`; `packages/core/src/rules/pbiplint/period-words.ts` (the multilingual year words, shared here), `periods.ts` (`englishList`, `namesYear`, shared here).
- **The steering for this milestone.** The smallest rule that meets the issue's boxes: a filter shape is handled only when real files show it or Power BI Desktop writes it, and section 9 lists what is left out on that ground.

## 2. The rule

| Field | Value |
|---|---|
| id | `HARDCODED_YEAR_IN_FILTER` **(Michael)** |
| name | Hardcoded year in a filter **(Michael)** |
| category | Report Design **(Michael)** |
| severity | 1 (info), as decided on the issue |
| scope | `Visual`, `Page`, `Report` |
| layer | `report` (needs the report only) |
| status | `builtin` |
| options | none |

- **Name.** The id pairs with HARDCODED_PERIOD_IN_DAX, so the two sort and search together. "Year", not "period", since fixed days are left out (section 4.4). Alternative: `FILTER_ON_FIXED_YEAR`, "Filter set to a fixed year", which reads like its neighbours ("Slicer saved with a selection").
- **Category.** Report Design, beside FILTERS_PANE_STATE and SLICER_SELECTION_SAVED. Alternative: Maintenance, since the finding is about going stale.
- **No `skipWhenUnread`.** A report file that could not be read hides its filters from the rule, never adds one.
- **Where it lives.** `packages/core/src/rules/pbiplint/filters.ts`, exporting the rule and `filterRules`, listed in `pbiplintRules` after `periodRules`.
- **Its page.** `rules/hardcoded-year-in-filter.md` (section 7).

## 3. What it reads

Each entry of `filterConfig.filters` in report.json (Filters on all pages), a page.json (Filters on this page), and a visual.json (Filters on this visual), with a `filter` whose `Where` holds conditions. Not read: a slicer's own selection (`objects.general`), bookmarks, and anything else in the report.

`ReportFilter` (`packages/core/src/pbir/types.ts`) carries no condition today, and `Report` keeps no parsed JSON to read one from. It gains two optional fields, read in `filtersOf` (`pbir/build.ts`): `howCreated`, the entry's string as written, and `where`, the entry's `filter.Where` array as written. The condition's column is named through `ReportFilter.refs`, which already resolves the `From` aliases, by the pointer of the column inside the condition.

## 4. What counts

### 4.1 Filter shapes

A condition in `Where` counts when it keeps only the years it names:

- **`In`** with one expression, a year column (4.2), and each row one literal: the years among its values. This is what Basic filtering writes when years are checked, and what an Include filter writes (the only shape real files show: all 54 Desktop filters of this kind are `In`).
- **`Comparison` with `ComparisonKind` 0** (Advanced filtering, "is"): a year column on the left and a year literal on the right. Desktop writes it; no real file shows it on a year column.

Nothing else counts (section 9): `Not` (is not, or Select all with years cleared), lower bounds, upper bounds and ranges, `Or` and `And`, relative date and Top N filters. (Amended September 30, 2026: upper bounds and ranges count too; section 11.)

### 4.2 A year column

The condition's `Column` or `HierarchyLevel` (a level of a user hierarchy, or of Desktop's auto date/time hierarchy through a variation) whose name `nameClass` in `period-words.ts` calls a year: the words shared with HARDCODED_PERIOD_IN_DAX, multilingual by default. Year keys (`YearMonth`) and counts of years (`Years of Service`) are not years there, so they are not here. Every real target is covered: Year, Ano, Año, anio, FiscalYear, Fiscal Year, annee_election.

### 4.3 A year

A literal whose value is a whole number of four digits (`2025L`) or text of four digits (`'2025'`), from 1950 to 2049, #104's range, shared from `period-forms.ts` rather than copied. Every kept year in real files is 2015 to 2026, so the range drops nothing real; it keeps a sentinel such as 9999 or 1900 out, as it does for DAX. Double and decimal literals (`2025D`, `2025M`) are not read: no real file writes one on a year column.

### 4.4 Fixed full dates: left out

A filter kept on one day (`datetime'2025-02-21T00:00:00'` in an `In` or "is") is 8 filters in 5 Desktop repositories, 4 of them copies of one Microsoft template in 2 repositories, and they read as a snapshot date, a leftover test day, or unclear. The other 51 fixed-date filters are start dates (45), end dates or ranges (5), and one exclusion. Too few and too mixed to report with confidence; the page's Quirks name them.

### 4.5 Left alone

- **Named for its year (Michael).** As #104 does: when the page's display name, or for a visual filter the visual's title, carries one of the filter's years (`namesYear`: the four digits, or the last two with no digit beside them), the filter is left alone. Real files: 3 filters in 1 repository (2 deliberate, 1 unclear). Recommended, so the page can give the same advice as #104's: name the page or visual for its year.
- **Set by drilling.** An entry whose `howCreated` is `Drillthrough` or `Drill`: Desktop saves the last value passed or drilled into, the author did not choose it, and the fix does not apply. 69 drillthrough filters in the fetched reports hold a value, none on a year column.

## 5. Findings

- **One finding per filter entry** with at least one year, on the object the filter belongs to, from the existing factories in `rules/report-helpers.ts`: `reportFinding.visual` (`"Sales LY" on "Page 1"`, or `slicer (ab19d7) on "Overview"` when it has no title), `reportFinding.pageFilter` (`Page filter on "Overview"`), `reportFinding.reportFilter` (`Report filter`). `pbiplint.ignore` in a page.json or visual.json silences it; a report filter's finding is switched off in config, as every report-level finding is.
- **Location.** The file of the filter's owner, at the line of the first year's literal (`.../Condition/In/Values/0/0/Literal/Value`), where the year is written, as #104 points at the period.
- **Detail (Michael).** `fixed year 2025 on 'Date'[Year]`; several years with #104's `englishList`, each once, in the order written: `fixed years 2024 and 2025 on 'Date'[Year]`, `fixed years 2018, 2019, 2020, and 2 more on 'dCalendário'[Ano]`. The column is named as BROKEN_FIELD_REFERENCE names it (`fieldLabel`, moved from `references.ts` to a shared place), so a level reads `'Sales'[Order Date].[Date Hierarchy].[Year]`.

## 6. Evidence on real files

The #104 corpus's PBIR reports, fetched at the manifest's commits: 347 Desktop reports in 226 repositories (agent, mixed, and tool groups counted apart).

| Shape on a year column (Desktop) | Filters | Repositories |
|---|---|---|
| Keeps the years named (this rule) | 54 | 9 |
| The same, less named for its year (4.5) | 51 | 9 |
| Lower bound only | 65 | 7 |
| Upper bound or range | 28 | 3 (26 in one) |
| Exclusion (`Not`) | 16 | 5 (11 in one) |

- **What the 51 are** (read from page names, visual types and titles, and the years): 42 stand in for the current year or keep new years out (82%): FiscalYear 2024 on 22 slicers in a packaged P&L template (2 reports), 11 charts that list every year of a series through 2022, page filters on 2024 or 2025 (6), 2022 to 2025 on a page and a slicer (2), a matrix on 2025. 4 are deliberate (a demo on 2017 and 2018). 5 are unclear (an election year, 2015 to 2024 on static sample data).
- **False findings.** None: every finding is a calendar year on a year column. The deliberate ones are what When to ignore it covers.
- **13 reports** fire, of 347. The agent group adds 33 filters in 2 repositories.
- **The project fixtures.** It fires on 3 visuals in 2 fixtures, all stale: `pbip-and-github-demo`, cards "Sales YoY%" and "Sales LY" on Year 2025; `shelfmart`, a card on Year 2024. Their `native` maps list them (the quiet check in `report-parity.test.ts`). shelfmart's hidden report filter "Year is not 2025" is an exclusion and is not reported.

## 7. The rule page

`rules/hardcoded-year-in-filter.md`, in the rule pages template, pbiplint's own prose, `sources:` empty. Every Learn link is opened and its quote checked when the page is written.

- **What it checks.** Filters in the Filters pane, on a visual, a page, or all pages, that keep only fixed years of a year column: Basic filtering with years checked, Advanced filtering's "is", and Include. What a year column is, the range, and what each finding names and where it points.
- **Example.** `pbir fires page.json`: an Overview page with Filters on this page set to 'Date'[Year] 2025 (the sample's plant). `pbir fixed page.json`: the same page filtered on 'Date'[Date] with a relative date filter, "is in this year", as Desktop writes it (`Comparison` 0 with `DateSpan` of `Now`, `TimeUnit` 3, copied in shape from a real Desktop file).
- **Why it matters.** A filter saved with the report becomes every reader's default ([Learn](https://learn.microsoft.com/power-bi/create-reports/power-bi-report-add-filter#reset-to-default-values)). A page filtered to 2026 shows 2026 all through 2027 under the same titles, and years checked in Basic filtering leave out each new year as it arrives. A hidden filter cannot even be seen ([Learn](https://learn.microsoft.com/power-bi/create-reports/power-bi-report-filter#lock-or-hide-filters)).
- **How to fix it,** in Power BI Desktop, no third-party tool:
  - Move the filter to the date column: drag it to the same section of the Filters pane and select Relative date as its Filter type ([Learn](https://learn.microsoft.com/power-bi/visuals/desktop-slicer-filter-date-range#create-the-relative-date-range-filter)), then remove the year filter: delete it when it was added by hand, or clear it when it is one of the visual's own fields, which cannot be deleted ([Learn](https://learn.microsoft.com/power-bi/create-reports/power-bi-report-filter-types#automatic-filters)). The column must be a date, and an auto date/time hierarchy cannot be used, so use its date column ([Learn](https://learn.microsoft.com/power-bi/visuals/desktop-slicer-filter-date-range#considerations-and-limitations)).
  - When the report should follow the data rather than the calendar, or there is no date column: a flag column in the model, such as `Is Latest Year = 'Date'[Year] = YEAR ( MAX ( Sales[Order Date] ) )` or `= YEAR ( TODAY () )`, filtered on True; it moves at refresh ([TODAY](https://learn.microsoft.com/dax/today-function-dax#remarks)).
  - In PBIR, the example's edit, which Desktop preserves.
- **When to ignore it.** A page or visual about one year (an annual review), a baseline year, a cohort, a series that has ended, sample data. Naming the page or the visual for its year says so to every reader, and the rule leaves it alone (if 4.5's name check is ruled in).
- **Quirks.** Exclusions, lower and upper bounds, and ranges are not reported, and why; fixed days are not; drillthrough and drill-down filters are not; slicer selections and bookmarks are other rules' or not read; a hidden or locked filter is reported like any other; year names in several languages; relative date filters in the service follow UTC ([Learn](https://learn.microsoft.com/power-bi/visuals/desktop-slicer-filter-date-range#considerations-and-limitations)), so the new year starts at midnight UTC.
- **Related rules.** `HARDCODED_PERIOD_IN_DAX` (the same problem in DAX), `SLICER_SELECTION_SAVED` (a year saved in a slicer, which this rule does not read).

## 8. The sample change

**The plant.** `examples/messy-sales`, page Overview (`pages/3cea48e58036b1654474/page.json`): add `filterConfig` after `width`, one entry as Desktop writes a page filter with a year checked (shape copied from real Desktop files): a new 20-hex `name`, `field` 'Date'[Year], `type` `Categorical`, `filter` (`Version` 2, `From` `d` = Date, `Where` `In` [[`2025L`]]), `howCreated` `User`. Nothing else in the file changes. The story: an Overview page set to one year that nobody moved.

**What it moves** (run against main's build; confirmed by the tests in Phase 2):

- The new rule: +1 finding, `Page filter on "Overview"`, `fixed year 2025 on 'Date'[Year]`, info.
- NOT_REACHED_FROM_REPORT: −1, `'Date'[Year]`, which the filter now reaches.
- The summary is unchanged: 256 findings (19 errors, 77 warnings, 160 info) in 92 files. No file is added.
- The Model fact: "37 columns and 2 measures not reached" becomes 36 (`cli.test.ts`, `render.test.ts`).
- `tests/expectations/messy-sales.report.json`: the rule's native entry (the page id) and `'Date'[Year]` out of NOT_REACHED_FROM_REPORT. fab-inspector is re-run on the sample to confirm its results are unchanged, as for the last plant (2b4aeb0); a Categorical page filter touches none of the ported rules.
- The rule counts: 103 rules to 104, report pages 25 to 26 (`generate.test.ts`), and whatever else pins the rule set (`engine.test.ts`, `pack.test.ts`, `home.test.ts`, `cli.test.ts`).
- The release (#152): `git log v0.2.1..main -- examples/messy-sales` lists this commit, so the home page's sample hint is untrue until 0.2.2 is on npm; pbiplint/action's `messy-sales.sarif` gains this rule's result and loses the NOT_REACHED one when regenerated.

## 9. Left out, and why

- **Exclusions** (`Not`: is not, or Select all with years cleared): 16 filters in 5 repositories, 11 in one, mostly edge years of a calendar. A new year still shows, so the year turning does not break them.
- **Lower bounds** (is greater than, is on or after a year): 65 in 7 repositories. A new year still shows.
- **Upper bounds and ranges:** 28 in 3 repositories, 26 in one, which also has filters this rule reports. #104 left range comparisons out too. The first candidate if another corpus shows more **(Michael)**. (Amended September 30, 2026: now reported; section 11.)
- **Fixed full days:** section 4.4.
- **`Or` of two "is" conditions, double and decimal year literals, multi-column `In`:** no real file has one on a year column.
- **Drill and drillthrough filters:** section 4.5.
- **Fiscal-year labels** (`'FY2024'`, `'2024/25'`): not four digits; #104 leaves them out too.
- **Slicer selections and bookmarks:** the issue's cautions.

## 10. Phase 2 tasks

Each test-first, one commit each, `Part of #113.`

1. **ReportFilter's condition.** `howCreated?` and `where?` read in `filtersOf`; `pbir-build.test.ts` first.
2. **Shared pieces.** Export #104's year range from `period-forms.ts` (no copy); move `fieldLabel` out of `references.ts` to a shared module; no behaviour change, existing tests green.
3. **The rule.** `packages/core/test/rules-native-filters.test.ts` first: fires on `In` with one year and several, string years, "is", a user hierarchy level and an auto date/time level, report, page, and visual filters, a hidden filter; silent on `Not`, bounds, ranges, relative date, Top N, a date column, `YearMonth`, `Years of Service`, a year outside the range, `2025D`, drill and drillthrough entries, a page or visual named for its year; detail shapes (one year, two, `and N more`, a repeated value once), the location line, an ignore annotation through `lint`. Then `filters.ts` and its registration.
4. **The page.** `rules/hardcoded-year-in-filter.md`, Learn links opened and checked, `node scripts/sync-rule-pages.mjs`, `rule-pages.test.ts` green.
5. **Pins and fixtures.** Rule counts; the native maps of `pbip-and-github-demo` and `shelfmart`.
6. **The sample.** The plant (section 8), its pins, the fab-inspector re-run, and the README's list of pbiplint's own report rules.
7. **The corpus check.** The built CLI over the fetched reports: the rule gives the 51 Desktop findings of section 6 (and the agent group's apart), no rule errors, nothing else moves; the summary goes in the pull request.
8. **Gates and pull request.** Prettier, lint, typecheck, tests, `check:browser`, build, `check:pack`; a "For the 0.2.2 release summary" comment on #113 (New: the rule, and `ReportFilter`'s two fields; What can change: the sample's two findings; the rule is info, so it cannot trip `fail-on: error`).

## 11. Amendment, September 30, 2026: the rulings

- **Ruled by Michael.** The id `HARDCODED_YEAR_IN_FILTER`, the name "Hardcoded year in a filter", Report Design, info; the name check (section 4.5) in; the detail wording of section 5. What counts adds **upper bounds and ranges** to the kept years, since a filter that keeps years up to a fixed one leaves each new year's data out, as a kept year does. Lower bounds, exclusions, and fixed days stay out. The relative date filter's labels on the page ("is in this", then "year") stand until Michael confirms them in Desktop; they sit in one step of How to fix it.
- **Ruled by the orchestrator.** `howCreated` and `where` on `ReportFilter` as optional additions (release notes under New); `fieldLabel` moved to `pbir/names.ts`; #104's range exported from `period-forms.ts` as `inYearRange`.
- **Upper bounds and ranges, as built.** A `Comparison` of a year column with a year, `ComparisonKind` 3 (is less than) or 4 (is less than or equal to), alone; or an `And` whose two sides are a lower bound (kind 1 or 2) and an upper bound on a year column. The kinds are Microsoft's semantic query schema's (1 greater than, 2 greater than or equal, 3 less than, 4 less than or equal). An upper bound joined by `And` to anything else, such as is not blank (one agent filter), and an `Or` are not read. Years are whole, so the detail names the years kept: `years up to 2025 on 'Date'[Year]` for `<= 2025` or `< 2026`, and `years 2018 to 2025 on 'Date'[Year]` for `>= 2018` and `<= 2025`, or `> 2017` and `< 2026`. The finding sits on the upper bound's literal. The name check reads the years the detail names.
- **Corpus check with the built rule** (every `.Report` folder of the fetched #104 reports and the pull request 5 corpus, and every `.pbip`, run with main's build and this branch's): the only findings that move are the new rule's; no rule errors.

| Desktop, fetched #104 reports (347 reports, 226 repositories) | Findings | Reports | Repositories |
|---|---|---|---|
| Kept years | 51 | 13 | 9 |
| Upper bounds and ranges | 28 | 3 | 3 |
| All | 79 | 15 | 11 |

  - Upper bounds and ranges by repository: Rede-DSBR/DocPBI2 26 (`years 2017 to 2022` on 21 slicers and charts, `2018 to 2022` 2, `2017 to 2021` 2, `2013 to 2023` 1), TobiasAnalytica/LIA_Makroekonomi 1 (a page, `years up to 2024`), alcoder06/economic-data-warehouse 1 (a page, `years 2010 to 2024`). Each keeps a series through the last year of its data at the time, so a new year's data is left out. No false finding: every one is a calendar year on a year column.
  - The pull request 5 corpus (Desktop): 39 findings in 2 reports, 13 kept years and 26 upper bounds and ranges. The agent group, counted apart: 33 kept years in 2 repositories, no upper bounds.
- **Phase 2 went differently in one place.** Registration, the page, the rule-count pins, the fixtures' native maps, and the sample's plant are one commit: report-parity's sample check fails for a registered report rule the sample does not fire, so any split leaves a red commit.

September 30, 2026, later: Michael checked the page's labels in Power BI Desktop. A visual's own filter card offers Relative date in its Filter type drop-down; under Show items when the value the choices are "is in the last", "is in this", and "is in the next", and the unlabelled drop-down beside "is in this" offers "day", "week", "month", and "year"; the date table's menu in the Data pane says "New column". The page stands as published.
