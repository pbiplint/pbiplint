# Columns With No dataType Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** #164 (milestone 0.2.3): a column whose TMDL has no `dataType` line reads as unknown, so no rule reports what rests on a type pbiplint cannot see, pinned by a new fixture captured three ways with `te` 0.7.1.2 before October 31, 2026.

**Architecture:** A new fixture, `untyped-columns`, in the shape Power BI Desktop saves, is captured first (Microsoft's ruleset, Tabular Editor 3's built-in rules, the survey's rule files). Then one helper, `typeKnown`, lets the three "is not" tests and the date table key test skip a column whose type is unknown; the "is" tests keep their code. Each difference from the captures that remains is a recorded deviation with the same sentence on the rule's page, and the copy says the thirteen ported rules that test a type leave such a column out.

**Tech Stack:** TypeScript (strict), Vitest, ESLint and Prettier, npm workspaces (`packages/core`, `packages/cli`, `packages/web`), Tabular Editor CLI `te` 0.7.1.2 for the captures only, Python 3 and Node for the scripted edits.

**Spec:** `docs/superpowers/specs/2026-10-02-untyped-columns-design.md`, as amended on October 2, 2026 (committed with this plan). Read it before starting any task.

## Global Constraints

- `te` 0.7.1.2 is needed in Task 1 only, and stops working after October 31, 2026. `te --version` prints `0.7.1.2` with a warning that the preview expires; that warning is expected. Never change a `findings` list, a `results` entry, an `oracle`, or a `captured` value in a committed capture, except by running `scripts/te-expectations.mjs` as Task 1 says; Task 2 adds only `deviations` and `ours`, with the script in this plan.
- A deviation needs four things, which the parity and rule-pages tests check together (CONTRIBUTING, "Deviating from a ported rule"): its sentence in the capture's `deviations`, pbiplint's object names under `ours`, a fixture on which the two lists differ, and the same sentence, word for word, in the rule page's Quirks section. The page script reads the sentence from the capture, so the two cannot drift.
- Rule pages are pbiplint's own prose: no Tabular Editor C# and no ruleset text. Every quote from a web page links to that page, with a section anchor when there is one. After any page edit, run `npm run build -w @pbiplint/core && node scripts/sync-rule-pages.mjs`, which regenerates `packages/core/src/rules/rule-summaries.data.ts` and `packages/cli/src/rule-help.data.ts`; commit those with the pages.
- Core stays browser-pure: no `node:` imports, no `fetch`, nothing that reads files, under `packages/core/src`. `npm run check:browser` enforces it.
- No em dashes anywhere (code, comments, pages, JSON, TMDL, commit messages). A hook blocks them. Restructure the sentence instead.
- Human-facing copy uses long-form dates ("October 31, 2026"). Bullets start with a capital letter.
- Match the surrounding code: doc comments in full sentences on exported and non-obvious functions; a rule's deviation is named in the rule's own comment.
- TMDL in a test or a script is written with `\t` escapes in ordinary strings, never with literal tab characters.
- Work on the branch `untyped-columns` in `~/Projects/pbiplint` (not a worktree). It holds the spec, this plan, and the spec's amendments. Commit after each task. Commit messages carry `Part of #164.` and end with these two lines, after a blank line:

  ```
  Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01NkR2xcGDMmG1T73cTgjBH3
  ```

  Never write a closing keyword (close, closes, fix, fixes, resolve, resolves) next to an issue number in a commit message or the pull request body.
- Before each commit: `npx prettier --write <changed .ts and .mjs files>`, then `npm run lint`, `npm run typecheck`, and the task's tests. `*.md`, `tests/expectations/`, and `tests/fixtures/` are Prettier-ignored on purpose.
- **Task 1 ends with the suite red by design**: the spec puts the captures first, before any rule changes, so after Task 1 the parity checks fail on exactly the eleven tests Task 1 lists, and nothing else. Tasks 2 and 3 end with `npm run build && npm test` passing.
- Never edit anything under `~/Library/CloudStorage/OneDrive-McKinleyConsulting/`.
- `$SCRATCH` in the commands below is a scratch folder outside the repository (the session scratchpad). Nothing in it is committed. Every command runs from the repository root.

## File Structure

| File | Task | Responsibility |
| --- | --- | --- |
| `scripts/te-expectations.mjs` | 1 | A survey rule file GitHub no longer has (404) is recorded as unavailable instead of failing the run |
| `scripts/test/te-captures.test.mjs` | 1 | Lists the new fixture; accepts an unavailable survey result |
| `tests/fixtures/untyped-columns.SemanticModel/` | 1 | Six TMDL files: untyped calculated columns and a `CALENDAR` date table |
| `tests/expectations/untyped-columns.json`, `te3/untyped-columns.json`, `survey/untyped-columns.json` | 1, 2 | The three captures (Task 1); the deviations (Task 2) |
| `packages/core/src/rules/helpers.ts` | 2 | `typeKnown` |
| `packages/core/src/rules/microsoft-bpa/relationships.ts`, `columns.ts`, `tables.ts` | 2 | The "is not" tests and the date key test skip an unknown type; thirteen rules name the deviation |
| `packages/core/test/rules-untyped-columns.test.ts` | 2 | The helper and the four changed rules |
| `rules/*.md` (thirteen pages) | 2 | The untyped-column Quirk; `RELATIONSHIP_COLUMNS_SAME_DATA_TYPE`'s rewritten text |
| `README.md`, `packages/cli/README.md`, `packages/core/README.md`, `packages/web/content/about.md`, `packages/core/src/rules/microsoft-bpa/define.ts`, `docs/RELEASING.md`, `CONTRIBUTING.md` | 3 | The copy and the capture docs |

What the draft of this plan measured on October 2, 2026, for reference. Its scripts were run against this branch in a clone, task by task:

- `te` types every untyped column by its DAX (Task 1, Step 3), and with Microsoft's ruleset reports none of the false findings of spec section 1 on the fixture.
- One of the survey's 46 rule files, `aswalsheshant-cell/mt-dashboard/PowerBI/CI/bpa_rules.json`, is gone: its repository answers 404, and neither this Mac nor the Software Heritage archive holds a copy with its sha256. Every earlier survey capture recorded no findings for it. Task 1 records it as unavailable rather than as an error, since each survey capture already uses its one allowed error (`bonardi/PowerBI-CICD`, a file `te` cannot run).
- With the captures in and main's rules, the parity checks fail on eleven tests on the new fixture. After Task 2's code, eight remain: seven Microsoft rules whose untyped columns `te` reports and pbiplint now leaves out, and `DECIMAL_COLUMN_WITHOUT_FORMAT_STRING` on the built-in capture. Task 2 records those eight as deviations, after which the suite passes at 3,278 tests (10 skipped). The sample's count does not move.
- `RELATIONSHIP_COLUMNS_SHOULD_BE_OF_INTEGER_DATA_TYPE` loses a finding `te` rightly gives: the `CALENDAR` table's `Date` key, a date, is in a relationship, and pbiplint no longer sees its type. That is the cost of the spec's decision, recorded like the rest.
- The fixture's calendar is `CALENDAR(MIN('Orders'[Order Date]), MAX('Orders'[Order Date]))`, not `CALENDAR(DATE(2024, 1, 1), ...)`: a fixed year would fire `HARDCODED_PERIOD_IN_DAX`, which a test keeps silent on every fixture.

---

### Task 1: The fixture and its three captures

**Files:**
- Modify: `scripts/te-expectations.mjs` (the survey fetch and loop)
- Modify: `scripts/test/te-captures.test.mjs` (the `CAPTURED` list and the survey result test)
- Create: `tests/fixtures/untyped-columns.SemanticModel/definition/` (six files)
- Create: `tests/expectations/untyped-columns.json`, `tests/expectations/te3/untyped-columns.json`, `tests/expectations/survey/untyped-columns.json` (by the script only)

**Interfaces:**
- Consumes: nothing from other tasks.
- Produces: the fixture and its three captures, which Task 2 records deviations in. A survey result may now be `{ "unavailable": "<url> returned 404 on <date>" }`.

- [ ] **Step 1: Let a capture record a rule file GitHub no longer has**

Save this as `$SCRATCH/capture-script.py` and run `python3 $SCRATCH/capture-script.py`. Each replacement asserts it matched once; an assertion error means a file differs from what this plan expects, so stop and report it.

```python
# te-expectations.mjs records a survey rule file GitHub no longer has (404) as unavailable, and the
# capture test lists the new fixture and accepts that third shape of survey result.
from pathlib import Path


def sub(path, old, new):
    p = Path(path)
    t = p.read_text(encoding="utf-8")
    assert t.count(old) == 1, (path, old[:70])
    p.write_text(t.replace(old, new), encoding="utf-8")


S = "scripts/te-expectations.mjs"
sub(
    S,
    """/** A rule file the survey list names, fetched at its commit and checked against its sha256. */
async function fetchRuleFile(file) {
  const path = file.path.split("/").map(encodeURIComponent).join("/");
  const url = `https://raw.githubusercontent.com/${file.repository}/${file.commit}/${path}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${file.id}: ${url} returned ${res.status}`);
""",
    """/** Where a rule file the survey list names is, at its commit. */
function ruleFileUrl(file) {
  const path = file.path.split("/").map(encodeURIComponent).join("/");
  return `https://raw.githubusercontent.com/${file.repository}/${file.commit}/${path}`;
}

/**
 * A rule file the survey list names, fetched at its commit and checked against its sha256, or null
 * when GitHub answers 404: its repository, or the commit, is no longer there.
 */
async function fetchRuleFile(file) {
  const url = ruleFileUrl(file);
  const res = await fetch(url);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`${file.id}: ${url} returned ${res.status}`);
""",
)
sub(
    S,
    """        const local = join(tmp, `${i}.json`);
        writeFileSync(local, await fetchRuleFile(file));
""",
    """        const body = await fetchRuleFile(file);
        if (body === null) {
          // Recorded, not run: no build of te can run a file that is gone.
          results[file.id] = { unavailable: `${ruleFileUrl(file)} returned 404 on ${captured}` };
          console.error(`warning: ${file.id}: GitHub no longer has it; recorded as unavailable`);
          console.error(`${i + 1}/${files.length} ${file.id}: unavailable`);
          continue;
        }
        const local = join(tmp, `${i}.json`);
        writeFileSync(local, body);
""",
)
T = "scripts/test/te-captures.test.mjs"
sub(
    T,
    """// The model fixtures captured three ways with te 0.7.1.2 before October 31, 2026, by name. A
// fixture whose captures are made before October 31, 2026 (such as #164's) is added here. A fixture
""",
    """// The model fixtures captured three ways with te 0.7.1.2 before October 31, 2026, by name. A
// fixture whose captures are made before October 31, 2026 is added here. A fixture
""",
)
sub(T, '  "udf-sales",\n];', '  "udf-sales",\n  "untyped-columns",\n];')
sub(
    T,
    '"%s: the survey capture has findings or an error for every listed file, and at most one error",',
    '"%s: the survey capture has findings, an error, or a note that GitHub no longer has it, for every listed file, and at most one error",',
)
sub(
    T,
    """        if ("error" in result) {
          expect(Object.keys(result), id).toEqual(["error"]);
          expect(typeof result.error, id).toBe("string");
          expect(result.error.length, id).toBeGreaterThan(0);
        } else {""",
    """        if ("error" in result || "unavailable" in result) {
          const [key] = Object.keys(result);
          expect(Object.keys(result), id).toEqual([key]);
          expect(typeof result[key], id).toBe("string");
          expect(result[key].length, id).toBeGreaterThan(0);
        } else {""",
)
```

Then:

```bash
npx prettier --write scripts/te-expectations.mjs scripts/test/te-captures.test.mjs
npx vitest run scripts/test/te-expectations.test.mjs
```

Expected: PASS. (`te-captures.test.mjs` fails until Step 5, since it now lists a fixture with no captures.)

- [ ] **Step 2: Write the fixture**

Save this as `$SCRATCH/fixture.py` and run `python3 $SCRATCH/fixture.py`. It writes six files under `tests/fixtures/untyped-columns.SemanticModel/definition/`, in the shape Power BI Desktop saves (lineage tags, `summarizeBy`, annotations), with no identifying names or paths.

```python
# Writes the untyped-columns fixture: TMDL in the shape Power BI Desktop saves, with calculated
# columns and a CALENDAR table that carry no dataType line (#164).
from pathlib import Path

ROOT = Path("tests/fixtures/untyped-columns.SemanticModel")
FILES = {
    "definition/database.tmdl": """database
\tcompatibilityLevel: 1567

""",
    "definition/model.tmdl": """model Model
\tculture: en-US
\tdefaultPowerBIDataSourceVersion: powerBI_V3
\tsourceQueryCulture: en-US
\tdataAccessOptions
\t\tlegacyRedirects
\t\treturnErrorValuesAsNull

annotation PBI_QueryOrder = ["Orders","Targets"]

annotation __PBI_TimeIntelligenceEnabled = 0

ref table Orders
ref table Targets
ref table Calendar

""",
    "definition/relationships.tmdl": """relationship a70ae52d-24ec-40e1-a273-1d00da6616af
\tfromColumn: Orders.'Order Date'
\ttoColumn: Calendar.Date

relationship 741df519-0ec4-4d70-906f-53dc62542efc
\tfromColumn: Orders.'Month Key'
\ttoColumn: Targets.'Month Key'

""",
    "definition/tables/Calendar.tmdl": """table Calendar
\tlineageTag: 08f33eb5-1f3f-4d74-95d6-077e71758aa9
\tdataCategory: Time

\tcolumn Date
\t\tisKey
\t\tformatString: dd-mmm-yy
\t\tlineageTag: 14ab337c-4678-4caa-b1c6-1705e71b3b28
\t\tsummarizeBy: none
\t\tisNameInferred
\t\tsourceColumn: [Date]

\t\tannotation SummarizationSetBy = Automatic

\t\tannotation UnderlyingDateTimeDataType = Date

\t\tannotation PBI_FormatHint = {"isDateTimeCustom":true}

\tcolumn Year = YEAR('Calendar'[Date])
\t\tlineageTag: e2da23b5-e84a-4967-a7fd-4ee8332c3be4
\t\tsummarizeBy: sum

\t\tannotation SummarizationSetBy = Automatic

\tcolumn 'Month Name' = FORMAT('Calendar'[Date], "MMMM")
\t\tlineageTag: 72a6c3b1-ad16-4f91-aca4-002f0a5962cc
\t\tsummarizeBy: none

\t\tannotation SummarizationSetBy = Automatic

\tpartition Calendar = calculated
\t\tmode: import
\t\tsource = CALENDAR(MIN('Orders'[Order Date]), MAX('Orders'[Order Date]))

\tannotation PBI_Id = ccc46cec0ea145ffa4fa03003aa22511

""",
    "definition/tables/Orders.tmdl": """table Orders
\tlineageTag: fe87c0c3-4d10-49af-bdc6-b7b11867de2c

\tmeasure 'Total Line Value' = SUM('Orders'[Unit Price])
\t\tformatString: #,0.00
\t\tlineageTag: 7d4c3b71-7686-4547-8162-f31df1937a01

\tcolumn 'Order ID'
\t\tdataType: int64
\t\tisHidden
\t\tformatString: 0
\t\tlineageTag: 15f4f9ce-1ef6-4b9f-a266-f0f89ae48a47
\t\tsummarizeBy: none
\t\tsourceColumn: Order ID

\t\tannotation SummarizationSetBy = Automatic

\tcolumn 'Order Date'
\t\tdataType: dateTime
\t\tisHidden
\t\tformatString: General Date
\t\tlineageTag: d3fa466f-0102-44a6-a5e2-eb336a388cfb
\t\tsummarizeBy: none
\t\tsourceColumn: Order Date

\t\tannotation SummarizationSetBy = Automatic

\tcolumn Quantity
\t\tdataType: int64
\t\tformatString: 0
\t\tlineageTag: 2787bf11-305d-4314-960a-337ddd191dc0
\t\tsummarizeBy: none
\t\tsourceColumn: Quantity

\t\tannotation SummarizationSetBy = User

\tcolumn Amount
\t\tdataType: decimal
\t\tformatString: #,0.00
\t\tlineageTag: a4497492-50ff-4368-8e71-db98d85fc77a
\t\tsummarizeBy: none
\t\tsourceColumn: Amount

\t\tannotation SummarizationSetBy = User

\tcolumn 'Month Key' = YEAR('Orders'[Order Date]) * 100 + MONTH('Orders'[Order Date])
\t\tisHidden
\t\tlineageTag: 9a296541-734b-43c8-942c-66f81c423e16
\t\tsummarizeBy: none

\t\tannotation SummarizationSetBy = Automatic

\tcolumn 'Unit Price' = DIVIDE('Orders'[Amount], 'Orders'[Quantity])
\t\tlineageTag: fd5a7169-b597-4577-932d-791ef1c7c25c
\t\tsummarizeBy: sum

\t\tannotation SummarizationSetBy = Automatic

\tcolumn 'Units per Case' = DIVIDE('Orders'[Quantity], 12)
\t\tlineageTag: 5f1c2a8e-7d43-4b9a-9e61-2c8d4f0b7a35
\t\tsummarizeBy: sum

\t\tannotation SummarizationSetBy = Automatic

\tcolumn 'Rush Flag' = IF('Orders'[Quantity] > 10, "Y", "N")
\t\tlineageTag: b55302e7-1d02-48d6-8dcc-c20ad8318ee3
\t\tsummarizeBy: none

\t\tannotation SummarizationSetBy = Automatic

\tcolumn 'Is Large Order' = IF('Orders'[Quantity] > 10, 1, 0)
\t\tlineageTag: c40b3a27-5de9-4bfe-b1cb-177b168df6b9
\t\tsummarizeBy: sum

\t\tannotation SummarizationSetBy = Automatic

\tcolumn 'Due Date' = 'Orders'[Order Date] + 30
\t\tlineageTag: b3283db3-484b-4af3-8fef-0588c5bcb6e3
\t\tsummarizeBy: none

\t\tannotation SummarizationSetBy = Automatic

\t\tannotation UnderlyingDateTimeDataType = Date

\tpartition Orders = m
\t\tmode: import
\t\tsource =
\t\t\t\tlet
\t\t\t\t    Source = Csv.Document(File.Contents("orders.csv"), [Delimiter = ",", Encoding = 65001]),
\t\t\t\t    Promoted = Table.PromoteHeaders(Source, [PromoteAllScalars = true]),
\t\t\t\t    Typed = Table.TransformColumnTypes(Promoted, {{"Order ID", Int64.Type}, {"Order Date", type datetime}, {"Quantity", Int64.Type}, {"Amount", Currency.Type}})
\t\t\t\tin
\t\t\t\t    Typed

\tannotation PBI_ResultType = Table

""",
    "definition/tables/Targets.tmdl": """table Targets
\tlineageTag: 1f2df56c-5689-4a12-b303-2ebb084737c0

\tcolumn 'Month Key'
\t\tdataType: int64
\t\tisHidden
\t\tformatString: 0
\t\tlineageTag: 8776ad2f-8c53-4daf-90e8-20bde4e1ca85
\t\tsummarizeBy: none
\t\tsourceColumn: Month Key

\t\tannotation SummarizationSetBy = Automatic

\tcolumn Target
\t\tdataType: decimal
\t\tformatString: #,0.00
\t\tlineageTag: d55839e0-ffbd-4b44-b21a-90ebc181b501
\t\tsummarizeBy: none
\t\tsourceColumn: Target

\t\tannotation SummarizationSetBy = User

\tpartition Targets = m
\t\tmode: import
\t\tsource =
\t\t\t\tlet
\t\t\t\t    Source = Csv.Document(File.Contents("targets.csv"), [Delimiter = ",", Encoding = 65001]),
\t\t\t\t    Promoted = Table.PromoteHeaders(Source, [PromoteAllScalars = true]),
\t\t\t\t    Typed = Table.TransformColumnTypes(Promoted, {{"Month Key", Int64.Type}, {"Target", Currency.Type}})
\t\t\t\tin
\t\t\t\t    Typed

\tannotation PBI_ResultType = Table

""",
}
for rel, text in FILES.items():
    path = ROOT / rel
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(text, encoding="utf-8")
```

- [ ] **Step 3: Confirm the types `te` reads from the DAX**

Run: `te list -m tests/fixtures/untyped-columns.SemanticModel/definition Columns`

Expected (after the preview warning), every untyped calculated column typed by its DAX; in particular `Date` DateTime, `Due Date` DateTime, `Is Large Order` int64, `Month Key` int64 (both), `Month Name` String, `Rush Flag` String, `Unit Price` decimal, `Units per Case` double, `Year` int64:

```text
Columns (15)

  Name           │ SourceColumn │ DataType                                  │ Description │ Hidden
 ────────────────┼──────────────┼───────────────────────────────────────────┼─────────────┼────────
  Amount         │ Amount       │ Currency / Fixed Decimal Number (decimal) │             │ False
  Date           │              │ DateTime                                  │             │ False
  Due Date       │              │ DateTime                                  │             │ False
  Is Large Order │              │ Integer / Whole Number (int64)            │             │ False
  Month Key      │              │ Integer / Whole Number (int64)            │             │ True
  Month Key      │ Month Key    │ Integer / Whole Number (int64)            │             │ True
  Month Name     │              │ String / Text                             │             │ False
  Order Date     │ Order Date   │ DateTime                                  │             │ True
  Order ID       │ Order ID     │ Integer / Whole Number (int64)            │             │ True
  Quantity       │ Quantity     │ Integer / Whole Number (int64)            │             │ False
  Rush Flag      │              │ String / Text                             │             │ False
  Target         │ Target       │ Currency / Fixed Decimal Number (decimal) │             │ False
  Unit Price     │              │ Currency / Fixed Decimal Number (decimal) │             │ False
  Units per Case │              │ Floating Point / Decimal Number (double)  │             │ False
  Year           │              │ Integer / Whole Number (int64)            │             │ False
```

If any type differs, stop and report it: the deviations in Task 2 depend on these.

- [ ] **Step 4: Capture Microsoft's ruleset and the built-in rules**

`BPARules.json` is Microsoft's ruleset with sha256 `ddb9cff4c2a0611a6467e2559d38319d9867381998066473ffa1e11c2d360392`; on this Mac it is at `~/Projects/pbiplint-assets/pbip-lint-spike/ref/BPARules.json` (check with `shasum -a 256`).

```bash
node scripts/te-expectations.mjs tests/fixtures/untyped-columns.SemanticModel tests/expectations/untyped-columns.json --rules ~/Projects/pbiplint-assets/pbip-lint-spike/ref/BPARules.json
node scripts/te-expectations.mjs tests/fixtures/untyped-columns.SemanticModel tests/expectations/te3/untyped-columns.json --built-in
```

Expected: `tests/expectations/untyped-columns.json: 37 findings across 14 rules` and `tests/expectations/te3/untyped-columns.json: 29 findings across 7 rules`.

- [ ] **Step 5: Capture the survey's rule files**

```bash
node scripts/te-expectations.mjs tests/fixtures/untyped-columns.SemanticModel tests/expectations/survey/untyped-columns.json --survey tests/expectations/survey/files.json
```

About two minutes. Expected: warnings for rules `te` cannot evaluate (normal for these files), `14/46 bonardi/PowerBI-CICD/resources/report/config/bparules.json: error`, `warning: aswalsheshant-cell/mt-dashboard/PowerBI/CI/bpa_rules.json: GitHub no longer has it; recorded as unavailable`, and last `tests/expectations/survey/untyped-columns.json: 46 rule files`. Any other download failure is not expected: stop and report it.

- [ ] **Step 6: Check the captures, and that only the parity checks are red**

```bash
npx vitest run scripts/test
npm run build -w @pbiplint/core
npx vitest run packages/core/test/parity.test.ts packages/core/test/sourced-parity.test.ts
```

Expected: `scripts/test` passes. The parity run fails on exactly these eleven tests, every one on `untyped-columns`: in `parity.test.ts`, `AVOID_FLOATING_POINT_DATA_TYPES`, `MODEL_SHOULD_HAVE_A_DATE_TABLE`, `DATE/CALENDAR_TABLES_SHOULD_BE_MARKED_AS_A_DATE_TABLE`, `RELATIONSHIP_COLUMNS_SAME_DATA_TYPE`, `FORMAT_FLAG_COLUMNS_AS_YES/NO_VALUE_STRINGS`, `DATECOLUMN_FORMATSTRING`, `NUMERIC_COLUMN_SUMMARIZE_BY`, `RELATIONSHIP_COLUMNS_SHOULD_BE_OF_INTEGER_DATA_TYPE`, `HIDE_FACT_TABLE_COLUMNS`, and `MONTH_(AS_A_STRING)_MUST_BE_SORTED`; in `sourced-parity.test.ts`, `DECIMAL_COLUMN_WITHOUT_FORMAT_STRING`. These are #164 itself, and Task 2 resolves them. Any other failure: stop and report it.

- [ ] **Step 7: Commit**

```bash
npm run lint && npm run typecheck
git add scripts/te-expectations.mjs scripts/test/te-captures.test.mjs tests/fixtures/untyped-columns.SemanticModel tests/expectations/untyped-columns.json tests/expectations/te3/untyped-columns.json tests/expectations/survey/untyped-columns.json
git commit -m "test: the untyped-columns fixture, captured three ways with te 0.7.1.2

A fixture of calculated columns and a CALENDAR date table saved with no
dataType line, as Power BI Desktop saves most, captured with Microsoft's
ruleset, the built-in rules, and the survey's rule files before the
preview build stops working after October 31, 2026. One survey file's
repository is gone; the capture records it as unavailable. The parity
checks fail on the new fixture until the next commit, by design.

Part of #164.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01NkR2xcGDMmG1T73cTgjBH3"
```

---

### Task 2: A missing type is unknown

**Files:**
- Modify: `packages/core/src/rules/helpers.ts` (after `dataType`, line 31)
- Modify: `packages/core/src/rules/microsoft-bpa/relationships.ts`, `columns.ts`, `tables.ts`
- Create: `packages/core/test/rules-untyped-columns.test.ts`
- Modify: `tests/expectations/untyped-columns.json`, `tests/expectations/te3/untyped-columns.json` (`deviations` and `ours` only)
- Modify: thirteen `rules/*.md` pages; regenerate `rule-summaries.data.ts` and `rule-help.data.ts`

**Interfaces:**
- Consumes: the fixture and captures from Task 1.
- Produces: `typeKnown(c: Column): boolean` exported from `packages/core/src/rules/helpers.ts`.

- [ ] **Step 1: Write the failing tests**

Create `packages/core/test/rules-untyped-columns.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { typeKnown } from "../src/rules/helpers.js";
import * as columns from "../src/rules/microsoft-bpa/columns.js";
import * as relationships from "../src/rules/microsoft-bpa/relationships.js";
import * as tables from "../src/rules/microsoft-bpa/tables.js";
import { modelFrom, objectNames } from "./helpers.js";

// Calculated columns saved as Power BI Desktop saves most of them: with no dataType line, so a type
// pbiplint does not know (#164). A rule reports nothing that rests on that type.

/** A calendar table marked as a date table, whose `Date` key is untyped, as `CALENDAR` saves it. */
const calendar = [
  "table Calendar",
  "\tdataCategory: Time",
  "\tcolumn Date",
  "\t\tisKey",
  "\t\tsourceColumn: [Date]",
  "\tpartition Calendar = calculated",
  "\t\tmode: import",
  "\t\tsource = CALENDAR(MIN('Orders'[Order Date]), MAX('Orders'[Order Date]))",
];
const keyed = [
  "table Orders",
  "\tcolumn 'Order Date'",
  "\t\tdataType: dateTime",
  "\tcolumn 'Order Code'",
  "\t\tdataType: string",
  "\tcolumn 'Month Key' = YEAR('Orders'[Order Date]) * 100 + MONTH('Orders'[Order Date])",
  "\tcolumn 'Product Code' = 7",
  ...calendar,
  "table Targets",
  "\tcolumn 'Month Key'",
  "\t\tdataType: int64",
  "table Products",
  "\tcolumn 'Product Code'",
  "\t\tdataType: string",
  "\tcolumn 'Order Code'",
  "\t\tdataType: int64",
  "relationship r1",
  "\tfromColumn: Orders.'Order Date'",
  "\ttoColumn: Calendar.Date",
  "relationship r2",
  "\tfromColumn: Orders.'Month Key'",
  "\ttoColumn: Targets.'Month Key'",
  "relationship r3",
  "\tfromColumn: Orders.'Product Code'",
  "\ttoColumn: Products.'Product Code'",
  "relationship r4",
  "\tfromColumn: Orders.'Order Code'",
  "\ttoColumn: Products.'Order Code'",
].join("\n");

describe("a column with no dataType line (#164)", () => {
  it("has a type pbiplint does not know", () => {
    const [orders] = modelFrom(keyed).tables;
    expect(orders!.columns.map((c) => [c.name, typeKnown(c)])).toEqual([
      ["Order Date", true],
      ["Order Code", true],
      ["Month Key", false],
      ["Product Code", false],
    ]);
  });

  it("is not compared by RELATIONSHIP_COLUMNS_SAME_DATA_TYPE, even where its DAX gives another type", () => {
    // r3 joins a whole number, by its DAX, to text: a real mismatch pbiplint cannot see.
    expect(objectNames(relationships.RELATIONSHIP_COLUMNS_SAME_DATA_TYPE, keyed)).toEqual([
      "'Orders'[Order Code] ∞←1 'Products'[Order Code]",
    ]);
  });

  it("is not reported by RELATIONSHIP_COLUMNS_SHOULD_BE_OF_INTEGER_DATA_TYPE", () => {
    expect(
      objectNames(relationships.RELATIONSHIP_COLUMNS_SHOULD_BE_OF_INTEGER_DATA_TYPE, keyed),
    ).toEqual(["'Orders'[Order Date]", "'Orders'[Order Code]", "'Products'[Product Code]"]);
  });

  it("is not reported by either half of FORMAT_FLAG_COLUMNS_AS_YES/NO_VALUE_STRINGS", () => {
    const flags = [
      "table Orders",
      '\tcolumn \'Rush Flag\' = IF(1 > 0, "Y", "N")',
      "\tcolumn 'Priority Flag'",
      "\t\tdataType: int64",
      "\tcolumn 'Is Large' = IF(1 > 0, 1, 0)",
      "\tcolumn 'Is Rush'",
      "\t\tdataType: int64",
    ].join("\n");
    expect(objectNames(columns.FORMAT_FLAG_COLUMNS_AS_YES_NO_VALUE_STRINGS, flags)).toEqual([
      "'Orders'[Priority Flag]",
      "'Orders'[Is Rush]",
    ]);
  });

  it("counts as a marked date table's date key for both date table rules", () => {
    const marked = calendar.join("\n");
    expect(objectNames(tables.MODEL_SHOULD_HAVE_A_DATE_TABLE, marked)).toEqual([]);
    expect(
      objectNames(tables.DATE_CALENDAR_TABLES_SHOULD_BE_MARKED_AS_A_DATE_TABLE, marked),
    ).toEqual([]);
    // A key whose type is known and not a date still leaves the table unmarked.
    const wholeKey = [
      "table Calendar",
      "\tdataCategory: Time",
      "\tcolumn DateKey",
      "\t\tdataType: int64",
      "\t\tisKey",
    ].join("\n");
    expect(objectNames(tables.MODEL_SHOULD_HAVE_A_DATE_TABLE, wholeKey)).toEqual(["Model"]);
    expect(
      objectNames(tables.DATE_CALENDAR_TABLES_SHOULD_BE_MARKED_AS_A_DATE_TABLE, wholeKey),
    ).toEqual(["'Calendar'"]);
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run packages/core/test/rules-untyped-columns.test.ts`
Expected: FAIL, five tests: `typeKnown is not a function`, then each rule reporting the untyped columns (for example `RELATIONSHIP_COLUMNS_SAME_DATA_TYPE` gives four relationships where the test expects one).

- [ ] **Step 3: Add the helper**

In `packages/core/src/rules/helpers.ts`, immediately after the line `export const dataType = (c: Column): string => (c.dataType ?? "").toLowerCase();`, add:

```ts
/**
 * Whether the column's type is known: false when its TMDL has no `dataType` line, as Power BI
 * Desktop saves most calculated columns (#164). A rule reports nothing that rests on a type it
 * cannot see.
 */
export const typeKnown = (c: Column): boolean => dataType(c) !== "";
```

- [ ] **Step 4: Skip an unknown type in the four tests**

In each of `relationships.ts`, `columns.ts`, and `tables.ts` under `packages/core/src/rules/microsoft-bpa/`, add `typeKnown` to the import from `../helpers.js`, last in the list (after `tablesPartlyRead`):

```ts
  tablesPartlyRead,
  typeKnown,
} from "../helpers.js";
```

In `relationships.ts`, `RELATIONSHIP_COLUMNS_SHOULD_BE_OF_INTEGER_DATA_TYPE`, replace

```ts
        (c) => relationships.forColumn(c.table.name, c.name).length > 0 && dataType(c) !== "int64",
```

with

```ts
        (c) =>
          relationships.forColumn(c.table.name, c.name).length > 0 &&
          typeKnown(c) &&
          dataType(c) !== "int64",
```

In `relationships.ts`, `RELATIONSHIP_COLUMNS_SAME_DATA_TYPE`, replace

```ts
        return from !== undefined && to !== undefined && dataType(from) !== dataType(to);
```

with

```ts
        return (
          from !== undefined &&
          to !== undefined &&
          typeKnown(from) &&
          typeKnown(to) &&
          dataType(from) !== dataType(to)
        );
```

In `columns.ts`, `FORMAT_FLAG_COLUMNS_AS_YES_NO_VALUE_STRINGS`, replace

```ts
          (c.name.endsWith(" Flag") && dataType(c) !== "string")),
```

with

```ts
          (c.name.endsWith(" Flag") && typeKnown(c) && dataType(c) !== "string")),
```

In `tables.ts`, replace

```ts
const hasDateTimeKey = (t: Table): boolean =>
  t.columns.some((c) => c.isKey && dataType(c) === "datetime");
```

with

```ts
// A key column with no dataType line counts: its type is unknown (#164), and a marked date table's
// key is meant to be a date.
const hasDateTimeKey = (t: Table): boolean =>
  t.columns.some((c) => c.isKey && (dataType(c) === "datetime" || !typeKnown(c)));
```

- [ ] **Step 5: Name the deviation in each of the thirteen rules' comments**

Save this as `$SCRATCH/comments.py` and run `python3 $SCRATCH/comments.py`. It adds one comment, last in each rule's comment block, to the thirteen ported rules that test a column's type.

```python
# Names the untyped-column deviation in the doc comment of each of the thirteen rules (#164).
from pathlib import Path

IS = (
    "// A column with no dataType line is not read, since its type is unknown (#164): a documented\n"
    "// deviation."
)
SAME = (
    "// A relationship with an untyped column on either side is not compared, since that type is\n"
    "// unknown (#164): a documented deviation."
)
DATE = (
    "// A marked table whose key has no dataType line counts as having its date key (#164): a\n"
    "// documented deviation."
)
D = "packages/core/src/rules/microsoft-bpa/"
RULES = {
    "columns.ts": [
        ("AVOID_FLOATING_POINT_DATA_TYPES", IS),
        ("DATECOLUMN_FORMATSTRING", IS),
        ("MONTHCOLUMN_FORMATSTRING", IS),
        ("ADD_DATA_CATEGORY_FOR_COLUMNS", IS),
        ("MONTH_AS_A_STRING_MUST_BE_SORTED", IS),
        ("NUMERIC_COLUMN_SUMMARIZE_BY", IS),
        ("FORMAT_FLAG_COLUMNS_AS_YES_NO_VALUE_STRINGS", IS),
        ("HIDE_FACT_TABLE_COLUMNS", IS),
    ],
    "relationships.ts": [
        ("RELATIONSHIP_COLUMNS_SHOULD_BE_OF_INTEGER_DATA_TYPE", IS),
        ("RELATIONSHIP_COLUMNS_SAME_DATA_TYPE", SAME),
    ],
    "tables.ts": [
        ("MODEL_SHOULD_HAVE_A_DATE_TABLE", DATE),
        ("DATE_CALENDAR_TABLES_SHOULD_BE_MARKED_AS_A_DATE_TABLE", DATE),
        ("UNPIVOT_PIVOTED_MONTH_DATA", IS),
    ],
}
for file, rules in RULES.items():
    p = Path(D + file)
    t = p.read_text(encoding="utf-8")
    for name, comment in rules:
        anchor = f"export const {name} = bpaRule("
        assert t.count(anchor) == 1, (file, name)
        # The line goes last in the rule's comment block, or on its own above the rule.
        t = t.replace(anchor, f"{comment}\n{anchor}")
    p.write_text(t, encoding="utf-8")
```

- [ ] **Step 6: Run the unit tests and the parity checks**

```bash
npx prettier --write packages/core/src/rules/helpers.ts packages/core/src/rules/microsoft-bpa/relationships.ts packages/core/src/rules/microsoft-bpa/columns.ts packages/core/src/rules/microsoft-bpa/tables.ts packages/core/test/rules-untyped-columns.test.ts
npx vitest run packages/core/test/rules-untyped-columns.test.ts
npm run build -w @pbiplint/core
npx vitest run packages/core/test/parity.test.ts packages/core/test/sourced-parity.test.ts
```

Expected: the unit tests PASS (5). The parity run now fails on exactly eight tests on `untyped-columns`: `AVOID_FLOATING_POINT_DATA_TYPES`, `FORMAT_FLAG_COLUMNS_AS_YES/NO_VALUE_STRINGS`, `DATECOLUMN_FORMATSTRING`, `NUMERIC_COLUMN_SUMMARIZE_BY`, `RELATIONSHIP_COLUMNS_SHOULD_BE_OF_INTEGER_DATA_TYPE`, `HIDE_FACT_TABLE_COLUMNS`, `MONTH_(AS_A_STRING)_MUST_BE_SORTED`, and `DECIMAL_COLUMN_WITHOUT_FORMAT_STRING`. In each, `te` reports an untyped column pbiplint now leaves out; the date table rules, `RELATIONSHIP_COLUMNS_SAME_DATA_TYPE`, and the `Flag` half now match.

- [ ] **Step 7: Record the eight deviations**

Save this as `$SCRATCH/deviations.mjs` and run `node $SCRATCH/deviations.mjs`:

```js
// Records the untyped-column deviation of seven Microsoft rules on the untyped-columns fixture, and
// the decimal rule's on its built-in capture, before `findings` in each file, leaving every other
// key as it is.
//   node deviations.mjs
import { readFileSync, writeFileSync } from "node:fs";
const IS =
  "A column with no `dataType` line, as Power BI Desktop saves most calculated columns, is not reported, since pbiplint does not know its type. Tabular Editor reads the type from the column's DAX.";
const DECIMAL =
  "A column whose TMDL has no `dataType` line is not read, since pbiplint does not know its type. Power BI Desktop leaves the line out of most calculated columns it saves.";
const add = (file, deviations, ours) => {
  const exp = JSON.parse(readFileSync(file, "utf8"));
  const out = {};
  for (const [k, v] of Object.entries(exp)) {
    if (k === "deviations" || k === "ours") continue;
    if (k === "findings") {
      out.deviations = { ...(exp.deviations ?? {}), ...deviations };
      out.ours = { ...(exp.ours ?? {}), ...ours };
    }
    out[k] = v;
  }
  writeFileSync(file, JSON.stringify(out, null, 2) + "\n");
};
add(
  "tests/expectations/untyped-columns.json",
  Object.fromEntries(
    [
      "AVOID_FLOATING_POINT_DATA_TYPES",
      "DATECOLUMN_FORMATSTRING",
      "FORMAT_FLAG_COLUMNS_AS_YES/NO_VALUE_STRINGS",
      "HIDE_FACT_TABLE_COLUMNS",
      "MONTH_(AS_A_STRING)_MUST_BE_SORTED",
      "NUMERIC_COLUMN_SUMMARIZE_BY",
      "RELATIONSHIP_COLUMNS_SHOULD_BE_OF_INTEGER_DATA_TYPE",
    ].map((id) => [id, IS]),
  ),
  {
    AVOID_FLOATING_POINT_DATA_TYPES: [],
    DATECOLUMN_FORMATSTRING: ["'Orders'[Order Date]"],
    "FORMAT_FLAG_COLUMNS_AS_YES/NO_VALUE_STRINGS": [],
    HIDE_FACT_TABLE_COLUMNS: [],
    "MONTH_(AS_A_STRING)_MUST_BE_SORTED": [],
    NUMERIC_COLUMN_SUMMARIZE_BY: [],
    RELATIONSHIP_COLUMNS_SHOULD_BE_OF_INTEGER_DATA_TYPE: ["'Orders'[Order Date]"],
  },
);
add(
  "tests/expectations/te3/untyped-columns.json",
  { DECIMAL_COLUMN_WITHOUT_FORMAT_STRING: DECIMAL },
  { DECIMAL_COLUMN_WITHOUT_FORMAT_STRING: [] },
);
```

Run:

```bash
git diff --stat tests/expectations
npx vitest run packages/core/test/parity.test.ts packages/core/test/sourced-parity.test.ts
```

Expected: two files change, each only in `deviations` and `ours`, before `findings`; the parity run passes.

- [ ] **Step 8: The pages**

Save this as `$SCRATCH/pages.py` and run `python3 $SCRATCH/pages.py`. It adds the Quirk to thirteen pages, reading the recorded sentence from the capture, and rewrites what `RELATIONSHIP_COLUMNS_SAME_DATA_TYPE`'s page says about a column with no `dataType` line.

```python
# Adds the untyped-column Quirk to the thirteen rule pages that test a column's type, reading the
# recorded sentence from the fixture's capture, and rewrites what RELATIONSHIP_COLUMNS_SAME_DATA_TYPE's
# page says about a column with no dataType line.
import json
from pathlib import Path

IS = json.load(open("tests/expectations/untyped-columns.json", encoding="utf-8"))["deviations"][
    "AVOID_FLOATING_POINT_DATA_TYPES"
]
UNPIVOT = (
    "A column with no `dataType` line, as Power BI Desktop saves most calculated columns, does not "
    "count as a numeric month column, since pbiplint does not know its type. Tabular Editor reads "
    "the type from the column's DAX."
)
SAME = (
    "A relationship with a column that has no `dataType` line on either side, as Power BI Desktop "
    "saves most calculated columns, is not reported, since pbiplint does not know that column's "
    "type. Tabular Editor reads the type from the column's DAX, so it still reports a real mismatch "
    "on such a relationship, which pbiplint misses."
)
DATE = (
    "A table marked as a date table whose key column has no `dataType` line, as Power BI Desktop "
    "saves a `CALENDAR` table's `Date` column, counts as having its date key, since pbiplint does "
    "not know the column's type and a marked date table's key is meant to be a date: \"you need to "
    "make sure the data type is properly set. You want to set the Data type to Date/Time or Date\" "
    "([Mark your date table as the appropriate data type](https://learn.microsoft.com/power-bi/"
    "transform-model/desktop-date-tables#mark-your-date-table-as-the-appropriate-data-type)). "
    "Tabular Editor reads the type from the column's DAX."
)
# Boilerplate Quirks that stay last on a page.
LAST = ("- The rule also needs every part of a table's declaration", "- While a model file has a parse issue")


def sub(path, old, new):
    p = Path(path)
    t = p.read_text(encoding="utf-8")
    assert t.count(old) == 1, (path, old[:70])
    p.write_text(t.replace(old, new), encoding="utf-8")


def add_quirk(slug, sentence, after=None):
    """Adds `- sentence` to the page's Quirks: after the bullet starting `after`, or else before a
    closing boilerplate bullet, or else at the end of the list."""
    p = Path(f"rules/{slug}.md")
    lines = p.read_text(encoding="utf-8").split("\n")
    start = lines.index("## Quirks")
    end = next(i for i in range(start + 1, len(lines)) if lines[i].startswith("## "))
    bullets = [i for i in range(start, end) if lines[i].startswith("- ")]
    if after is not None:
        [at] = [i + 1 for i in bullets if lines[i].startswith(after)]
    else:
        last = [i for i in bullets if lines[i].startswith(LAST)]
        at = last[0] if last else bullets[-1] + 1
    lines.insert(at, f"- {sentence}")
    p.write_text("\n".join(lines), encoding="utf-8")


for slug in [
    "avoid-floating-point-data-types",
    "datecolumn-formatstring",
    "format-flag-columns-as-yes-no-value-strings",
    "hide-fact-table-columns",
    "month-as-a-string-must-be-sorted",
    "numeric-column-summarize-by",
    "relationship-columns-should-be-of-integer-data-type",
    "add-data-category-for-columns",
    "monthcolumn-formatstring",
]:
    add_quirk(slug, IS)
add_quirk("unpivot-pivoted-month-data", UNPIVOT, after="- The column that matches has to be numeric")
add_quirk("model-should-have-a-date-table", DATE, after="- Without a calendar, both properties")
add_quirk(
    "date-calendar-tables-should-be-marked-as-a-date-table", DATE, after="- Without a calendar, the key"
)

R = "rules/relationship-columns-same-data-type.md"
sub(
    R,
    "- The comparison is on the declared `dataType`, ignoring letter case. A column with no `dataType` line compares as having none, and so differs from any column that has one.",
    f"- The comparison is on the declared `dataType`, ignoring letter case.\n- {SAME}",
)
sub(
    R,
    "A column whose declaration carries no `dataType` at all compares as having none, so a relationship onto a calculated column that was written without the property is reported although both sides may hold the same type once the model is loaded. That is the one finding here worth reading twice, and the answer to it is to write the property rather than to change a type. Where both types are written and they differ, there is nothing to ignore.",
    "There is nothing to ignore: where both columns name a type and the types differ, set them to the same type. The rule compares only the types the TMDL names, so a relationship with a calculated column saved with no `dataType` line is not reported at all (see Quirks).",
)
```

Then:

```bash
git diff --stat rules
npm run build -w @pbiplint/core && node scripts/sync-rule-pages.mjs
```

Expected: thirteen pages change; `wrote 106 summaries ... and 106 help entries ...`.

- [ ] **Step 9: Check and commit**

```bash
npm run lint && npm run typecheck && npm run check:browser && npm run build && npm test
git add packages/core/src/rules packages/cli/src/rule-help.data.ts packages/core/test/rules-untyped-columns.test.ts tests/expectations/untyped-columns.json tests/expectations/te3/untyped-columns.json rules
git commit -m "fix(core): a column with no dataType line has a type pbiplint does not know

Power BI Desktop saves most calculated columns with no dataType line.
The rules that ask whether a column is not of a type no longer report
such a column, and a marked date table whose key is untyped counts as
having its date key, so RELATIONSHIP_COLUMNS_SAME_DATA_TYPE's false
errors and the date table rules' false warnings are gone. Where
Tabular Editor reads the type from the DAX and reports, pbiplint now
stays silent: a documented deviation on each of the thirteen ported
rules that test a type, recorded on the new fixture where it shows.

Part of #164.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01NkR2xcGDMmG1T73cTgjBH3"
```

Expected: every command exits 0; `npm test` passes (3,278 tests, 10 skipped, in the draft); `git status` is clean.

---

### Task 3: The copy and the capture docs

**Files:**
- Modify: `README.md`, `packages/cli/README.md`, `packages/core/README.md`, `packages/web/content/about.md`, `packages/core/src/rules/microsoft-bpa/define.ts`, `docs/RELEASING.md`, `CONTRIBUTING.md`

**Interfaces:**
- Consumes: the behavior of Task 2 (thirteen ported rules leave an untyped column out) and Task 1's unavailable survey result.
- Produces: nothing later tasks use.

The eleven documented deviations stay eleven: they are where the source is noisier or quieter than it means to be. Untyped columns are one reading rule across thirteen rules, so the copy says so in a sentence of its own (spec section 6, as amended).

- [ ] **Step 1: Edit the copy**

Save this as `$SCRATCH/copy.py` and run `python3 $SCRATCH/copy.py`:

```python
# The copy says that a column whose TMDL names no type is left out of the thirteen ported rules that
# test a type, and the capture docs say what happens to a survey rule file GitHub no longer has.
from pathlib import Path


def sub(path, old, new):
    p = Path(path)
    t = p.read_text(encoding="utf-8")
    assert t.count(old) == 1, (path, old[:70])
    p.write_text(t.replace(old, new), encoding="utf-8")


UNTYPED = (
    "A column whose TMDL names no type, as Power BI Desktop saves most calculated columns, is left "
    "out of the thirteen ported rules that test a column's type, where Tabular Editor reads the type "
    "from the column's DAX; each rule's page says so."
)
sub(
    "README.md",
    "Five of the Microsoft rules need VertiPaq statistics and are listed but not run.",
    f"Five of the Microsoft rules need VertiPaq statistics and are listed but not run. {UNTYPED}",
)
sub(
    "packages/cli/README.md",
    "the Microsoft rules need statistics only a live model has; they are listed but not run. Each rule\n"
    "has a page at https://pbiplint.com/rules with what it checks, why, how to fix it, and quirks.",
    "the Microsoft rules need statistics only a live model has; they are listed but not run. A column\n"
    "whose TMDL names no type, as Power BI Desktop saves most calculated columns, is left out of the\n"
    "thirteen ported rules that test a column's type, where Tabular Editor reads the type from the\n"
    "column's DAX; each rule's page says so. Each rule has a page at https://pbiplint.com/rules with\n"
    "what it checks, why, how to fix it, and quirks.",
)
sub(
    "packages/core/README.md",
    "deviations from the Microsoft ruleset and six from PBI Inspector, and each rule's page documents\nthem.",
    "deviations from the Microsoft ruleset and six from PBI Inspector, and each rule's page documents\n"
    "them. A column whose TMDL names no type, as Power BI Desktop saves most calculated columns, is left\n"
    "out of the thirteen ported rules that test a column's type, where Tabular Editor reads the type\n"
    "from the column's DAX.",
)
sub(
    "packages/web/content/about.md",
    "the five that need statistics only a live model has are listed but not run.",
    "the five that need statistics only a live model has are listed but not run, and a column whose "
    "TMDL names no type, as Power BI Desktop saves most calculated columns, is left out of the "
    "thirteen that test a column's type, where Tabular Editor reads the type from the column's DAX.",
)
sub(
    "packages/core/src/rules/microsoft-bpa/define.ts",
    " * quirks, apart from the eleven deviations named on the pages and in the rules' doc comments;\n",
    " * quirks, apart from the eleven deviations named on the pages and in the rules' doc comments, and\n"
    " * the thirteen rules that test a column's type leaving out a column whose TMDL names none (#164);\n",
)
sub(
    "docs/RELEASING.md",
    "  carry no license: the list pins each one to a commit and a sha256, and the script fetches it from\n"
    "  there and checks it.",
    "  carry no license: the list pins each one to a commit and a sha256, and the script fetches it from\n"
    "  there and checks it. A file GitHub no longer has is recorded as unavailable, with the date the\n"
    "  capture found it gone, as one of the 46 is in the captures made from October 2, 2026.",
)
sub(
    "CONTRIBUTING.md",
    "and warns for every rule `te` cannot evaluate, which is expected for these files.",
    "and warns for every rule `te` cannot evaluate, which is expected for these files. A rule file "
    "GitHub no longer has is recorded as unavailable, with a warning.",
)
```

- [ ] **Step 2: Check, run the site's end-to-end tests, and commit**

```bash
git diff --stat
npx prettier --write packages/core/src/rules/microsoft-bpa/define.ts
npm run lint && npm run typecheck && npm run build && npm test
npm run test:e2e
git add README.md packages/cli/README.md packages/core/README.md packages/web/content/about.md packages/core/src/rules/microsoft-bpa/define.ts docs/RELEASING.md CONTRIBUTING.md
git commit -m "docs: say that a column with no dataType line is left out of type tests

The READMEs, the About page, and bpaRule's doc comment say that the
thirteen ported rules that test a column's type leave out a column whose
TMDL names none, and the capture docs say a survey rule file GitHub no
longer has is recorded as unavailable.

Part of #164.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01NkR2xcGDMmG1T73cTgjBH3"
```

Expected: seven files change; every command exits 0; the end-to-end suite passes (68 passed, 1 skipped before this branch; the sample's count does not move); `git status` is clean.

---

## After the tasks

- The final whole-branch review, then the pull request from `untyped-columns` to `main`, naming #164 without a closing keyword and listing what changes in results: `RELATIONSHIP_COLUMNS_SAME_DATA_TYPE`'s false errors and the date table rules' false warnings on untyped columns are gone, so a workflow gated on `error` that failed on them passes; the "is" rules stay silent on untyped columns where Tabular Editor reports them; the sample's count does not move.
- Merge when reviewed and green. Then comment on #164 for the 0.2.3 release summary (spec section 7), and close it by hand with its box ticked.

## Out of scope

- Reading types from DAX (spec sections 2 and 8).
- A fixture shape built only to show a miss (spec section 3.5); the unit test pins it.
- The survey file that is gone: nothing can capture it now, and #118, the only reader of survey files beyond the sourced rules, cannot run it either.
