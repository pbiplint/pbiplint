# The Existing Rules Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Pull request 2 of #117 (milestone 0.2.3): five ported model rules read calendars, `PROVIDE_FORMAT_STRING_FOR_MEASURES` leaves out measures that plainly return text, each change recorded as a deviation with its page, plus the perspectives page fix, the new deviation count in the copy, and the docs sentence pull request 1's final review asked for.

**Architecture:** `buildModel` reads each `calendar` block into an optional `Table.calendars`, and the usage index gains `usedInCalendars`, which three column rules read; the two date table rules read `Table.calendars` directly. The text-measure skip reads the tokens of the existing DAX tokenizer. Every change is a documented deviation: a sentence in the fixture's expectation file, pbiplint's findings under `ours`, and the same sentence in the rule page's Quirks. A new test pins the two IsAvailableInMdx rules to Tabular Editor 3's captured built-in rules. No `te` is needed anywhere.

**Tech Stack:** TypeScript (strict), Vitest, ESLint and Prettier, npm workspaces (`packages/core`, `packages/cli`, `packages/web`), Python 3 for the scripted page edits.

**Spec:** `docs/superpowers/specs/2026-09-30-rules-beyond-bpa-design.md`, section 4 (and 5.3 for the new test), as amended on October 1, 2026 (committed with this plan). Read section 4 before starting any task.

## Global Constraints

- No `te` and no capture script: everything this plan needs is committed. Never change a `findings` list, an `oracle`, or a `captured` value in any file under `tests/expectations/`; only add `deviations` and `ours`, with the helper in this plan.
- A deviation needs four things, which the parity and rule-pages tests check together (docs/RELEASING.md, Report parity expectations, step 4): its sentence in the expectation file's `deviations`, pbiplint's object names under `ours`, a fixture on which the two lists differ, and the same sentence, word for word, in the rule page's Quirks section. The page-edit scripts read each sentence from `tests/expectations/te3-zoo.json`, so the two cannot drift.
- Rule pages are pbiplint's own prose: no Tabular Editor C# and no ruleset text, and every How to fix gives a route that needs no third-party tool. Every quote from a web page links to that page, with a section anchor when there is one. After any page edit, run `npm run build -w @pbiplint/core && node scripts/sync-rule-pages.mjs`, which regenerates `packages/core/src/rules/rule-summaries.data.ts` and `packages/cli/src/rule-help.data.ts`; commit those with the page.
- Core stays browser-pure: no `node:` imports, no `fetch`, nothing that reads files, under `packages/core/src`. `npm run check:browser` enforces it.
- No em dashes anywhere (code, comments, pages, JSON, commit messages). A hook blocks them. Restructure the sentence instead.
- Human-facing copy uses long-form dates ("October 31, 2026"). Bullets start with a capital letter.
- Match the surrounding code: doc comments in full sentences on exported and non-obvious functions; a deviation is named in the rule's own comment, as `UNNECESSARY_COLUMNS`'s `groupByColumn` deviation is.
- TMDL in a test is written with `\t` escapes in ordinary strings, never with literal tab characters, as the plan's test code does.
- Work on the branch `existing-rules` in `~/Projects/pbiplint` (not a worktree). It holds this plan and the spec's amendments. Commit after each task. Commit messages carry `Part of #117.` and end with these two lines, after a blank line:

  ```
  Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01NkR2xcGDMmG1T73cTgjBH3
  ```

  Never write a closing keyword (close, closes, fix, fixes, resolve, resolves) next to an issue number in a commit message or the pull request body. This is pull request 2 of 3; #117 stays open.
- Before each commit: `npx prettier --write <changed .ts and .mjs files>`, then `npm run lint`, `npm run typecheck`, and the task's tests. `*.md`, `tests/expectations/`, and `tests/fixtures/` are Prettier-ignored on purpose. At the end of each task, `npm test` must pass.
- Never edit anything under `~/Library/CloudStorage/OneDrive-McKinleyConsulting/`.
- `$SCRATCH` in the commands below is a scratch folder outside the repository (the session scratchpad). Nothing in it is committed.

## File Structure

| File | Task | Responsibility |
| --- | --- | --- |
| `packages/core/src/model/types.ts` | 1 | `Calendar` and the optional `Table.calendars` |
| `packages/core/src/model/build.ts` | 1 | Reads each `calendar` block |
| `packages/core/src/index/usage.ts` | 1 | `usedInCalendars` |
| `packages/core/test/build.test.ts`, `indexes.test.ts` | 1 | The reader and the index |
| `packages/core/src/rules/microsoft-bpa/columns.ts` | 2 | Both IsAvailableInMdx rules and `UNNECESSARY_COLUMNS` read calendars |
| `packages/core/test/rules-columns.test.ts` | 2 | Those three rules on a calendar |
| `packages/core/test/sourced-parity.test.ts` | 2 | The IsAvailableInMdx rules against Tabular Editor 3's built-in captures |
| `packages/core/src/rules/microsoft-bpa/tables.ts` | 3 | Both date table rules read calendars |
| `packages/core/test/rules-tables.test.ts` | 3 | Those two rules on a calendar |
| `packages/core/src/rules/microsoft-bpa/measures.ts` | 4 | `returnsText` and the text-measure skip |
| `packages/core/test/rules-measures.test.ts` | 4 | The skip, and what it does not skip |
| `tests/expectations/te3-zoo.json` | 2, 3, 4 | Six deviations with their `ours` |
| `tests/expectations/tvw-baseline.json` | 4 | One deviation with its `ours` |
| `rules/*.md` (seven pages) | 2, 3, 4, 5 | Each change in the page's own words |
| `README.md`, `packages/cli/README.md`, `packages/core/README.md`, `packages/web/content/about.md`, `packages/core/src/rules/microsoft-bpa/define.ts` | 5 | Eleven documented deviations, not five |
| `CONTRIBUTING.md`, `docs/RELEASING.md`, `scripts/test/te-captures.test.mjs` | 5 | A captured fixture keeps its captures after October 31, 2026 |

What the draft of this plan measured on October 1, 2026, for reference: with all of it applied, the parity suite fails on exactly seven rule and fixture pairs until their deviations are recorded (six rules on te3-zoo, `PROVIDE_FORMAT_STRING_FOR_MEASURES` on tvw-baseline), no other fixture moves, and the full suite passes at 3,090 tests.

## The deviation helper

Tasks 2, 3, and 4 add deviations with this script. Save it once as `$SCRATCH/add-deviations.mjs` (outside the repository; it is not committed):

```js
// Adds deviations and ours to a model expectation file, in the key order te-expectations.mjs
// writes (after skipRules, before findings), and leaves every other key as it is.
//   node add-deviations.mjs <expectation.json> <additions.json>
import { readFileSync, writeFileSync } from "node:fs";
const [file, json] = process.argv.slice(2);
const add = JSON.parse(readFileSync(json, "utf8"));
const exp = JSON.parse(readFileSync(file, "utf8"));
const out = {};
for (const [k, v] of Object.entries(exp)) {
  if (k === "deviations" || k === "ours") continue;
  if (k === "findings") {
    out.deviations = { ...(exp.deviations ?? {}), ...add.deviations };
    out.ours = { ...(exp.ours ?? {}), ...add.ours };
  }
  out[k] = v;
}
writeFileSync(file, JSON.stringify(out, null, 2) + "\n");
```

The additions file is `{ "deviations": { <rule>: <sentence> }, "ours": { <rule>: [<object names>] } }`.

---

### Task 1: The calendar reader and the usage index

**Files:**
- Modify: `packages/core/src/model/types.ts` (the `Table` interface, around line 46)
- Modify: `packages/core/src/model/build.ts` (imports; a new `buildCalendar` before `buildTable`; `buildTable`)
- Modify: `packages/core/src/index/usage.ts`
- Test: `packages/core/test/build.test.ts`, `packages/core/test/indexes.test.ts`

**Interfaces:**
- Produces: `interface Calendar extends Named { table: Table; columns: string[] }` and `Table.calendars?: Calendar[]` (exported from `@pbiplint/core` through `export type * from "./model/types.js"`); `UsageIndex.usedInCalendars(c: Column): boolean`. Tasks 2 and 3 use both.

The parser already reads calendar blocks with no parse issue: a `calendar` is an object node; each `calendarColumnGroup = <category>` is a child node whose own children are `primaryColumn` and `associatedColumn` prop nodes (repeated `associatedColumn` lines each kept); a `calendarColumnGroup` with no category (time-related columns) is a flag node whose children are `column` prop nodes. Values keep their TMDL quotes, so `unquoteName` is needed.

- [ ] **Step 1: Write the failing tests**

In `packages/core/test/build.test.ts`, add this test just before the one that starts `it("builds relationships with defaults, roles with table permissions, perspectives, expressions, cultures, functions"`:

```ts
  it("reads each calendar's primary, associated, and time-related columns, unquoted, in file order", () => {
    const m = modelFrom(
      [
        "table Date",
        "\tcolumn Date",
        "\t\tdataType: dateTime",
        "\tcalendar 'Fiscal Calendar'",
        "\t\tlineageTag: 0a1b",
        "",
        "\t\tcalendarColumnGroup = year",
        "\t\t\tprimaryColumn: Year",
        "",
        "\t\tcalendarColumnGroup = month",
        "\t\t\tprimaryColumn: 'Month Key'",
        "\t\t\tassociatedColumn: 'Month Name'",
        "\t\t\tassociatedColumn: MonthShort",
        "",
        "\t\tcalendarColumnGroup",
        "\t\t\tcolumn: 'Holiday Name'",
        "\t\t\tcolumn: IsWorkingDay",
        "table Sales",
        "\tcolumn Amount",
        "\t\tdataType: decimal",
      ].join("\n"),
    );
    const [date, sales] = m.tables;
    expect(date!.calendars).toEqual([
      expect.objectContaining({
        name: "Fiscal Calendar",
        table: date,
        columns: ["Year", "Month Key", "Month Name", "MonthShort", "Holiday Name", "IsWorkingDay"],
        location: { file: "inline.tmdl", line: 4 },
      }),
    ]);
    expect(sales!.calendars).toEqual([]);
  });

```

In `packages/core/test/indexes.test.ts`, inside `describe("usage index", ...)`, add after the test that ends `expect(usage.usedInGroupBy(col("P"))).toBe(false);`:

```ts
  it("knows the columns a calendar on their own table names", () => {
    const m = modelFrom(
      [
        "table Date",
        "\tcolumn Year",
        "\t\tdataType: int64",
        "\tcolumn Spare",
        "\t\tdataType: int64",
        "\tcalendar Gregorian",
        "\t\tcalendarColumnGroup = year",
        "\t\t\tprimaryColumn: Year",
        "table Other",
        "\tcolumn Year",
        "\t\tdataType: int64",
      ].join("\n"),
    );
    const { usage } = buildIndexes({ model: m });
    const col = (table: string, name: string) =>
      m.tables.find((t) => t.name === table)!.columns.find((c) => c.name === name)!;
    expect(usage.usedInCalendars(col("Date", "Year"))).toBe(true);
    expect(usage.usedInCalendars(col("Date", "Spare"))).toBe(false);
    expect(usage.usedInCalendars(col("Other", "Year"))).toBe(false);
  });
```

- [ ] **Step 2: Run them to make sure they fail**

Run: `npx vitest run packages/core/test/build.test.ts packages/core/test/indexes.test.ts`
Expected: the build test fails (`calendars` is undefined) and the index test fails (`usage.usedInCalendars is not a function`); `npm run typecheck` would also reject both, which is the same red.

- [ ] **Step 3: Add the types**

In `packages/core/src/model/types.ts`, the `Table` interface ends:

```ts
  hierarchies: Hierarchy[];
  calculationGroup?: CalculationGroup;
}
```

Change that to:

```ts
  hierarchies: Hierarchy[];
  calculationGroup?: CalculationGroup;
  /**
   * The table's calendars, for calendar-based time intelligence. Optional, so a `Table` built
   * by hand against an earlier version still type-checks; buildModel always sets it.
   */
  calendars?: Calendar[];
}

/**
 * A `calendar` block under a table. `columns` holds the names, unquoted and in file order, of the
 * table's columns its `calendarColumnGroup` blocks name: each `primaryColumn` and
 * `associatedColumn`, and each `column` of a group with no category, which TMDL reads as
 * time-related. A calendar can name only columns of its own table.
 */
export interface Calendar extends Named {
  table: Table;
  columns: string[];
}
```

- [ ] **Step 4: Read the blocks**

In `packages/core/src/model/build.ts`:

1. Add `Calendar,` to the type import list, after `AlternateOf,`.
2. Just before `function buildTable(r: TmdlNode, model: Model): void {`, add:

```ts
/** The prop lines under a `calendarColumnGroup` that name a column of the calendar's table. */
const CALENDAR_COLUMN_PROPS = new Set(["primarycolumn", "associatedcolumn", "column"]);

function buildCalendar(cal: TmdlNode, table: Table): Calendar {
  const columns: string[] = [];
  for (const group of cal.children)
    if (group.type === "calendarcolumngroup")
      for (const p of group.children)
        if (p.kind === "prop" && CALENDAR_COLUMN_PROPS.has(p.type) && p.value !== undefined)
          columns.push(unquoteName(p.value));
  return { ...named(cal), table, columns };
}

```

3. In `buildTable`, the new table's literal ends `hierarchies: [],`; add `calendars: [],` after it.
4. In `buildTable`'s loop over `r.children`, after the two lines that push a hierarchy:

```ts
    else if (c.kind === "object" && c.type === "hierarchy")
      t.hierarchies.push(buildHierarchy(c, t));
```

add:

```ts
    else if (c.kind === "object" && c.type === "calendar")
      (t.calendars ??= []).push(buildCalendar(c, t));
```

(A later part of a table's declaration adds its calendars to the same list, as it adds hierarchies.)

- [ ] **Step 5: Index the columns**

In `packages/core/src/index/usage.ts`:

1. In `interface UsageIndex`, after `usedInGroupBy(c: Column): boolean;`, add:

```ts
  /**
   * A calendar on the column's table names it, as a primary, associated, or time-related column.
   * The calendar needs it for time intelligence, and for sorting when it is a primary column.
   */
  usedInCalendars(c: Column): boolean;
```

2. In `buildUsageIndex`, after `const groupByTargets = new Set<string>();`, add `const calendarColumns = new Set<string>();`, and as the first statement inside `for (const t of model.tables) {`, add:

```ts
    for (const cal of t.calendars ?? [])
      for (const c of cal.columns) calendarColumns.add(key(t.name, c));
```

3. In the returned object, after the `usedInGroupBy` line, add:

```ts
    usedInCalendars: (c) => calendarColumns.has(key(c.table.name, c.name)),
```

- [ ] **Step 6: Run the tests, the checks, and commit**

Run: `npx prettier --write packages/core/src/model/types.ts packages/core/src/model/build.ts packages/core/src/index/usage.ts packages/core/test/build.test.ts packages/core/test/indexes.test.ts && npx vitest run packages/core/test/build.test.ts packages/core/test/indexes.test.ts && npm run lint && npm run typecheck && npm run check:browser && npm test`
Expected: the two new tests pass; everything else passes unchanged (no rule reads calendars yet, so no parity result moves).

```bash
git add packages/core/src/model/types.ts packages/core/src/model/build.ts packages/core/src/index/usage.ts packages/core/test/build.test.ts packages/core/test/indexes.test.ts
git commit -F - <<'EOF'
feat(core): read calendars, and index the columns they name

buildModel reads each calendar block under a table into Table.calendars:
its name and the columns its calendarColumnGroup blocks name, primary,
associated, and time-related. The usage index answers usedInCalendars for
the rules that will read it. Both are additions; no rule changes yet.

Part of #117.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01NkR2xcGDMmG1T73cTgjBH3
EOF
```

---

### Task 2: Both IsAvailableInMdx rules and UNNECESSARY_COLUMNS read calendars

**Files:**
- Modify: `packages/core/src/rules/microsoft-bpa/columns.ts` (the three rules)
- Test: `packages/core/test/rules-columns.test.ts`; create `packages/core/test/sourced-parity.test.ts`
- Modify: `tests/expectations/te3-zoo.json` (three deviations)
- Modify: `rules/isavailableinmdx-false-nonattribute-columns.md`, `rules/set-isavailableinmdx-to-true-on-necessary-columns.md`, `rules/unnecessary-columns.md`, and the two generated data files

**Interfaces:**
- Consumes: `UsageIndex.usedInCalendars` from Task 1.
- Produces: `packages/core/test/sourced-parity.test.ts` with its `SOURCED` list of `{ rule, builtIn }`, which pull request 3 extends.

- [ ] **Step 1: Write the failing tests**

In `packages/core/test/rules-columns.test.ts`, add this test just before the one that starts `it("UNNECESSARY_COLUMNS honors references, relationships, sort-by, hierarchies, RLS text, and OLS"`:

```ts
  it("ISAVAILABLEINMDX rules and UNNECESSARY_COLUMNS read the columns a calendar names", () => {
    // A documented deviation in all three rules: the source rules do not read calendars.
    const m = [
      "table Date",
      "\tcolumn Year",
      "\t\tdataType: int64",
      "\t\tisHidden",
      "\tcolumn 'Quarter Key'",
      "\t\tdataType: int64",
      "\t\tisHidden",
      "\t\tisAvailableInMdx: false",
      "\tcolumn 'Month Number'",
      "\t\tdataType: int64",
      "\t\tisHidden",
      "\tcolumn 'Month Name'",
      "\t\tdataType: string",
      "\t\tisHidden",
      "\tcolumn Holiday",
      "\t\tdataType: string",
      "\t\tisHidden",
      "\tcolumn Unused",
      "\t\tdataType: int64",
      "\t\tisHidden",
      "\tcalendar Gregorian",
      "\t\tcalendarColumnGroup = year",
      "\t\t\tprimaryColumn: Year",
      "\t\tcalendarColumnGroup = quarter",
      "\t\t\tprimaryColumn: 'Quarter Key'",
      "\t\tcalendarColumnGroup = monthOfYear",
      "\t\t\tprimaryColumn: 'Month Number'",
      "\t\t\tassociatedColumn: 'Month Name'",
      "\t\tcalendarColumnGroup",
      "\t\t\tcolumn: Holiday",
      "\tpartition Date = m",
      "\t\tmode: import",
      "\t\tsource = 1",
    ].join("\n");
    expect(objectNames(rules.ISAVAILABLEINMDX_FALSE_NONATTRIBUTE_COLUMNS, m)).toEqual([
      "'Date'[Unused]",
    ]);
    expect(objectNames(rules.SET_ISAVAILABLEINMDX_TO_TRUE_ON_NECESSARY_COLUMNS, m)).toEqual([
      "'Date'[Quarter Key]",
    ]);
    expect(objectNames(rules.UNNECESSARY_COLUMNS, m)).toEqual(["'Date'[Unused]"]);
  });
```

Create `packages/core/test/sourced-parity.test.ts`:

```ts
import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { lint } from "../src/engine/lint.js";
import { defaultRules } from "../src/rules/index.js";
import { readModelFiles } from "./helpers.js";

/**
 * The pbiplint rules whose results follow Tabular Editor 3's built-in rules, each with the
 * built-in rules it follows. On every fixture with a built-in capture, the rule reports exactly
 * the objects those rules report together. The captures are `tests/expectations/te3/`, made with
 * `te` 0.7.1.2 (docs/RELEASING.md); spec section 5.3 adds the rules pbiplint takes from them.
 */
const SOURCED: { rule: string; builtIn: string[] }[] = [
  {
    rule: "ISAVAILABLEINMDX_FALSE_NONATTRIBUTE_COLUMNS",
    builtIn: ["TE3_BUILT_IN_SET_ISAVAILABLEINMDX_FALSE"],
  },
  {
    rule: "SET_ISAVAILABLEINMDX_TO_TRUE_ON_NECESSARY_COLUMNS",
    builtIn: ["TE3_BUILT_IN_SET_ISAVAILABLEINMDX_TRUE_NECESSARY"],
  },
];

interface BuiltInCapture {
  name: string;
  fixture: string;
  findings: Record<string, string[]>;
}

const repoRoot = new URL("../../../", import.meta.url).pathname;
const te3Dir = repoRoot + "tests/expectations/te3/";
const captures: BuiltInCapture[] = readdirSync(te3Dir)
  .filter((f) => f.endsWith(".json"))
  .map((f) => ({
    name: f.replace(/\.json$/, ""),
    ...(JSON.parse(readFileSync(te3Dir + f, "utf8")) as Omit<BuiltInCapture, "name">),
  }));

describe("the sourced rules", () => {
  it("name pbiplint rules and built-in rules that exist", () => {
    const ids = new Set(defaultRules.map((r) => r.id));
    const builtIns = new Set(captures.flatMap((c) => Object.keys(c.findings)));
    for (const { rule, builtIn } of SOURCED) {
      expect(ids.has(rule), rule).toBe(true);
      // Each built-in rule fires on some fixture, so a misspelt id cannot pass by matching nothing.
      for (const id of builtIn) expect(builtIns.has(id), id).toBe(true);
    }
  });
});

describe.each(captures)("parity with Tabular Editor 3's built-in rules: $name", (capture) => {
  const result = lint(readModelFiles(repoRoot + capture.fixture), { config: { failOn: "none" } });
  const ours: Record<string, string[]> = {};
  for (const f of result.findings) (ours[f.ruleId] ??= []).push(f.objectName);

  it.each(SOURCED.map((s) => [s.rule, s.builtIn] as const))("%s", (rule, builtIn) => {
    const expected = builtIn.flatMap((id) => capture.findings[id] ?? []).sort();
    expect([...(ours[rule] ?? [])].sort()).toEqual(expected);
  });
});
```

- [ ] **Step 2: Run them to make sure they fail**

Run: `npx vitest run packages/core/test/rules-columns.test.ts packages/core/test/sourced-parity.test.ts`
Expected: the rules-columns test fails (Year, Month Number, Month Name, and Holiday are reported by the false rule and `UNNECESSARY_COLUMNS`, and the true rule reports nothing); the sourced-parity test fails on te3-zoo for both rules (pbiplint reports `'Date'[Month Key]`, `'Date'[Month Short Name]`, and `'Date'[Year]`, which Tabular Editor 3 leaves out, and does not report `'Date'[Quarter Key]`) and passes on the other six fixtures.

- [ ] **Step 3: Change the three rules**

In `packages/core/src/rules/microsoft-bpa/columns.ts`:

1. The comment above `ISAVAILABLEINMDX_FALSE_NONATTRIBUTE_COLUMNS` reads `// A model file pbiplint could not fully read may hold a variation that names the column.` Replace it with:

```ts
// A column a calendar names is left out, as Tabular Editor 3's built-in version of the rule leaves
// it out and the source does not: a documented deviation. A model file pbiplint could not fully
// read may hold a variation that names the column.
```

and in that rule's condition, after `!usage.usedInVariations(c) &&`, add the line `!usage.usedInCalendars(c) &&`.

2. Above `export const SET_ISAVAILABLEINMDX_TO_TRUE_ON_NECESSARY_COLUMNS = bpaRule(`, add:

```ts
// A column a calendar names is reported, as Tabular Editor 3's built-in version of the rule reports
// it and the source does not: a documented deviation, which keeps the two rules mirrors.
```

and in that rule's condition, after `usage.usedInVariations(c) ||`, add the line `usage.usedInCalendars(c) ||`.

3. In `UNNECESSARY_COLUMNS`, after the line `if (indexes.usage.usedInGroupBy(c)) return false;`, add:

```ts
      // A column a calendar names counts as used, which the source does not do: a documented
      // deviation. The calendar needs it for time intelligence.
      if (indexes.usage.usedInCalendars(c)) return false;
```

- [ ] **Step 4: Run the focused tests, then parity, which now needs the deviations**

Run: `npx prettier --write packages/core/src/rules/microsoft-bpa/columns.ts packages/core/test/rules-columns.test.ts packages/core/test/sourced-parity.test.ts && npx vitest run packages/core/test/rules-columns.test.ts packages/core/test/sourced-parity.test.ts packages/core/test/parity.test.ts`
Expected: rules-columns and sourced-parity pass (15 sourced-parity tests: one, plus two rules on seven fixtures); parity fails on te3-zoo for exactly three rules, `ISAVAILABLEINMDX_FALSE_NONATTRIBUTE_COLUMNS`, `SET_ISAVAILABLEINMDX_TO_TRUE_ON_NECESSARY_COLUMNS`, and `UNNECESSARY_COLUMNS`, because Microsoft's ruleset does not read calendars. That is the deviation; the next step records it.

- [ ] **Step 5: Record the three deviations on te3-zoo**

Write `$SCRATCH/dev-task2.json`:

```json
{
  "deviations": {
    "ISAVAILABLEINMDX_FALSE_NONATTRIBUTE_COLUMNS": "A column a calendar names, as a primary, associated, or time-related column, is not reported, as Tabular Editor 3's built-in version of the rule does not report it: the calendar uses the column for time intelligence, and a primary column for sorting. The source rule does not read calendars, so Tabular Editor reports such a column when it is hidden.",
    "SET_ISAVAILABLEINMDX_TO_TRUE_ON_NECESSARY_COLUMNS": "A column a calendar names, as a primary, associated, or time-related column, is reported when IsAvailableInMdx is false, as Tabular Editor 3's built-in version of the rule reports it, so the two rules stay mirrors. The source rule does not read calendars.",
    "UNNECESSARY_COLUMNS": "A column a calendar names, as a primary, associated, or time-related column, counts as used: the calendar needs it for time intelligence. The source rule does not read calendars, so Tabular Editor reports such a column when it is hidden and nothing else uses it."
  },
  "ours": {
    "ISAVAILABLEINMDX_FALSE_NONATTRIBUTE_COLUMNS": [
      "'Budget'[Budget Amount]",
      "'Customer'[Customer ID]",
      "'Sales'[Customer ID]",
      "'Sales'[Internal Cost]",
      "'Sales'[Order Date]",
      "'Sales'[Order ID]",
      "'Time Intelligence'[Ordinal]"
    ],
    "SET_ISAVAILABLEINMDX_TO_TRUE_ON_NECESSARY_COLUMNS": ["'Date'[Quarter Key]"],
    "UNNECESSARY_COLUMNS": [
      "'Sales'[Internal Cost]",
      "'Sales'[Order ID]",
      "'Time Intelligence'[Ordinal]"
    ]
  }
}
```

Run: `node "$SCRATCH/add-deviations.mjs" tests/expectations/te3-zoo.json "$SCRATCH/dev-task2.json" && git diff --stat tests/expectations/te3-zoo.json && npx vitest run packages/core/test/parity.test.ts`
Expected: only `te3-zoo.json` changes (insertions only, between `skipRules` and `findings`); parity passes in full.

- [ ] **Step 6: Edit the three pages**

Save this as `$SCRATCH/pages-task2.py` and run it from the repository root (`python3 "$SCRATCH/pages-task2.py"`). Each replacement must match exactly once, or the script stops and says which:

```python
import json, sys

S = json.load(open("tests/expectations/te3-zoo.json", encoding="utf-8"))["deviations"]
DL = "https://learn.microsoft.com/fabric/fundamentals/direct-lake-overview"


def edit(path, pairs):
    t = open(path, encoding="utf-8").read()
    for old, new in pairs:
        if t.count(old) != 1:
            sys.exit(f"{path}: expected one match for {old[:80]!r}, found {t.count(old)}")
        t = t.replace(old, new, 1)
    open(path, "w", encoding="utf-8").write(t)


edit("rules/isavailableinmdx-false-nonattribute-columns.md", [
    ("and are not used to sort another column, in a hierarchy, or in a variation, and do not themselves sort by another column.",
     "and are not used to sort another column, in a hierarchy, in a variation, or in a calendar, and do not themselves sort by another column."),
    ("A column you are about to unhide is a fair thing to leave, since unhiding it clears the finding anyway, as long as its table is visible.",
     "A column you are about to unhide is a fair thing to leave, since unhiding it clears the finding anyway, as long as its table is visible. A table in Direct Lake storage mode is a judgment of its own: Direct Lake loads a column's data when a query needs it, and its refresh copies only metadata, so the refresh time this rule is about is not spent the same way (see Quirks)."),
    ("- Both ends of a sort-by pair are out of scope: the column another column sorts by, and the column that names one in `sortByColumn`.\n",
     "- Both ends of a sort-by pair are out of scope: the column another column sorts by, and the column that names one in `sortByColumn`.\n- " + S["ISAVAILABLEINMDX_FALSE_NONATTRIBUTE_COLUMNS"] + "\n"),
    ("- Relationships are not read. A hidden foreign key, which is exactly what `HIDE_FOREIGN_KEYS` asks you to create, is reported here.\n",
     "- Relationships are not read. A hidden foreign key, which is exactly what `HIDE_FOREIGN_KEYS` asks you to create, is reported here.\n- Tables in Direct Lake storage mode are read like any other. Tabular Editor 3's built-in version of the rule skips them, and no source says why. What differs is when the work is done: Direct Lake loads into memory only the column data a query needs, and its refresh copies only metadata ([Direct Lake overview](" + DL + ")).\n"),
    ("reports the ones used to sort another column, in a hierarchy or a variation, or sorting by another column.",
     "reports the ones used to sort another column, in a hierarchy, a variation, or a calendar, or sorting by another column."),
])

edit("rules/set-isavailableinmdx-to-true-on-necessary-columns.md", [
    ("Columns with IsAvailableInMdx set to false that are used to sort another column, appear in a hierarchy or a variation, or sort by another column.",
     "Columns with IsAvailableInMdx set to false that are used to sort another column, appear in a hierarchy, a variation, or a calendar, or sort by another column."),
    ("the hierarchy level that names it, or the variation that makes it a default.",
     "the hierarchy level that names it, the variation that makes it a default, or the calendar that names it."),
    ("whenever the property is false on either.\n",
     "whenever the property is false on either.\n- " + S["SET_ISAVAILABLEINMDX_TO_TRUE_ON_NECESSARY_COLUMNS"] + "\n"),
    ("A column this rule lists because another column sorts by it, or because it sits in a hierarchy, is not reported there;",
     "A column this rule lists because another column sorts by it, because it sits in a hierarchy, or because a calendar names it, is not reported there;"),
])

edit("rules/unnecessary-columns.md", [
    ("no DAX expression, relationship, hierarchy, sort-by column, group-by column, row-level security filter, or object-level security rule.",
     "no DAX expression, relationship, hierarchy, sort-by column, group-by column, calendar, row-level security filter, or object-level security rule."),
    ("The source rule does not test `groupByColumn`, so Tabular Editor reports that column.\n- Report usage",
     "The source rule does not test `groupByColumn`, so Tabular Editor reports that column.\n- " + S["UNNECESSARY_COLUMNS"] + "\n- Report usage"),
    ("not used to sort, in a hierarchy, or in a variation, whether or not",
     "not used to sort, in a hierarchy, in a variation, or in a calendar, whether or not"),
])
print("edited")
```

Expected: `edited`. Then read the three pages in place: each What it checks now names calendars, each Quirks section carries its deviation sentence, and the false rule's page has the Direct Lake sentence in When to ignore it and its Quirk. The Direct Lake wording rests on Microsoft's [Direct Lake overview](https://learn.microsoft.com/fabric/fundamentals/direct-lake-overview): "a Direct Lake refresh copies only metadata" and "only the data that's needed to answer a query is loaded into memory".

- [ ] **Step 7: Regenerate the help data, run everything, and commit**

Run: `npm run build -w @pbiplint/core && node scripts/sync-rule-pages.mjs && npm run lint && npm run typecheck && npm test`
Expected: sync writes 104 summaries and 104 help entries; everything passes, including `rule-pages.test.ts`'s "documented deviations" (each sentence in its page's Quirks).

```bash
git add packages/core/src/rules/microsoft-bpa/columns.ts packages/core/test/rules-columns.test.ts packages/core/test/sourced-parity.test.ts tests/expectations/te3-zoo.json rules/isavailableinmdx-false-nonattribute-columns.md rules/set-isavailableinmdx-to-true-on-necessary-columns.md rules/unnecessary-columns.md packages/core/src/rules/rule-summaries.data.ts packages/cli/src/rule-help.data.ts
git commit -F - <<'EOF'
feat(core): the IsAvailableInMdx rules and UNNECESSARY_COLUMNS read calendars

A column a calendar names, primary, associated, or time-related, is no
longer reported as a candidate for IsAvailableInMdx false, is reported
when the property is false, and counts as used. The first two follow
Tabular Editor 3's built-in rules, which a new test checks against their
captures on all seven fixtures; the third is Michael's ruling that a
column a feature needs counts as used. Three deviations, shown on
te3-zoo, each stated on its page, and the Direct Lake Quirk.

Part of #117.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01NkR2xcGDMmG1T73cTgjBH3
EOF
```

---

### Task 3: Both date table rules read calendars

**Files:**
- Modify: `packages/core/src/rules/microsoft-bpa/tables.ts` (lines 21-46)
- Test: `packages/core/test/rules-tables.test.ts`
- Modify: `tests/expectations/te3-zoo.json` (two deviations)
- Modify: `rules/model-should-have-a-date-table.md`, `rules/date-calendar-tables-should-be-marked-as-a-date-table.md`, and the two generated data files

**Interfaces:**
- Consumes: `Table.calendars` from Task 1.

- [ ] **Step 1: Write the failing test**

In `packages/core/test/rules-tables.test.ts`, inside `describe("date table rules", ...)`, add just before the test that starts `it("REMOVE_AUTO-DATE_TABLE requires a calculated table with the Desktop prefix"`:

```ts
  it("both date table rules accept a table that defines a calendar, marked or not", () => {
    // A documented deviation in both rules: calendar-based time intelligence needs no marking.
    const withCalendar = t(
      "Date",
      "\tcolumn Date\n\t\tdataType: dateTime\n\tcalendar Gregorian\n\t\tcalendarColumnGroup = date\n\t\t\tprimaryColumn: Date\n",
    );
    expect(objectNames(rules.MODEL_SHOULD_HAVE_A_DATE_TABLE, withCalendar)).toEqual([]);
    expect(
      objectNames(
        rules.DATE_CALENDAR_TABLES_SHOULD_BE_MARKED_AS_A_DATE_TABLE,
        withCalendar + unmarked,
      ),
    ).toEqual(["'Calendar'"]);
  });
```

- [ ] **Step 2: Run it to make sure it fails**

Run: `npx vitest run packages/core/test/rules-tables.test.ts`
Expected: FAIL. `MODEL_SHOULD_HAVE_A_DATE_TABLE` reports `Model`, and the other rule reports `'Date'` as well as `'Calendar'`.

- [ ] **Step 3: Change the two rules**

In `packages/core/src/rules/microsoft-bpa/tables.ts`, replace:

```ts
// A model file pbiplint could not fully read may hold the date table.
export const MODEL_SHOULD_HAVE_A_DATE_TABLE = bpaRule(
  "MODEL_SHOULD_HAVE_A_DATE_TABLE",
  { skipWhenModelUnread: modelPartlyRead },
  (m) =>
    m.tables.some((t) => t.dataCategory === "Time" && hasDateTimeKey(t)) ? [] : [finding.model(m)],
);

// A part of the table pbiplint could not read may mark it, hold its key, or make it a calculation
// group, which the rule leaves out.
```

with:

```ts
const hasCalendar = (t: Table): boolean => (t.calendars?.length ?? 0) > 0;

// A table that defines a calendar satisfies the rule, as it does Tabular Editor 3's built-in
// version and not the source: a documented deviation. A model file pbiplint could not fully read
// may hold the date table.
export const MODEL_SHOULD_HAVE_A_DATE_TABLE = bpaRule(
  "MODEL_SHOULD_HAVE_A_DATE_TABLE",
  { skipWhenModelUnread: modelPartlyRead },
  (m) =>
    m.tables.some((t) => hasCalendar(t) || (t.dataCategory === "Time" && hasDateTimeKey(t)))
      ? []
      : [finding.model(m)],
);

// A table that defines a calendar is left out, which the source does not do and Tabular Editor 3
// has no version of: a documented deviation. A part of the table pbiplint could not read may mark
// it, hold its key, define a calendar on it, or make it a calculation group, which the rule leaves
// out.
```

and in `DATE_CALENDAR_TABLES_SHOULD_BE_MARKED_AS_A_DATE_TABLE`, after the line `(u.includes("DATE") || u.includes("CALENDAR")) &&`, add the line `!hasCalendar(t) &&`.

- [ ] **Step 4: Run the focused test, then parity**

Run: `npx prettier --write packages/core/src/rules/microsoft-bpa/tables.ts packages/core/test/rules-tables.test.ts && npx vitest run packages/core/test/rules-tables.test.ts packages/core/test/parity.test.ts`
Expected: rules-tables passes; parity fails on te3-zoo for exactly `MODEL_SHOULD_HAVE_A_DATE_TABLE` and `DATE/CALENDAR_TABLES_SHOULD_BE_MARKED_AS_A_DATE_TABLE` (pbiplint reports nothing; Tabular Editor reports `Model` and `'Date'`).

- [ ] **Step 5: Record the two deviations on te3-zoo**

Write `$SCRATCH/dev-task3.json`:

```json
{
  "deviations": {
    "MODEL_SHOULD_HAVE_A_DATE_TABLE": "A table that defines a calendar satisfies the rule, as it satisfies Tabular Editor 3's built-in version, since calendar-based time intelligence works without a table marked as a date table. The source rule does not read calendars, so Tabular Editor reports a model whose only calendar table is not marked.",
    "DATE/CALENDAR_TABLES_SHOULD_BE_MARKED_AS_A_DATE_TABLE": "A table that defines a calendar is not reported, since calendar-based time intelligence works without the table being marked as a date table. The source rule does not read calendars, and Tabular Editor 3 has no version of this rule."
  },
  "ours": {
    "MODEL_SHOULD_HAVE_A_DATE_TABLE": [],
    "DATE/CALENDAR_TABLES_SHOULD_BE_MARKED_AS_A_DATE_TABLE": []
  }
}
```

Run: `node "$SCRATCH/add-deviations.mjs" tests/expectations/te3-zoo.json "$SCRATCH/dev-task3.json" && npx vitest run packages/core/test/parity.test.ts`
Expected: parity passes in full.

- [ ] **Step 6: Edit the two pages**

Save this as `$SCRATCH/pages-task3.py` and run it from the repository root:

```python
import json, sys

S = json.load(open("tests/expectations/te3-zoo.json", encoding="utf-8"))["deviations"]
CAL = "https://learn.microsoft.com/power-bi/transform-model/desktop-time-intelligence#calendar-based-time-intelligence-preview"
DATES = "https://learn.microsoft.com/power-bi/transform-model/desktop-date-tables"
MUST = "https://learn.microsoft.com/power-bi/transform-model/desktop-date-tables#when-you-must-mark-your-date-table"


def edit(path, pairs):
    t = open(path, encoding="utf-8").read()
    for old, new in pairs:
        if t.count(old) != 1:
            sys.exit(f"{path}: expected one match for {old[:80]!r}, found {t.count(old)}")
        t = t.replace(old, new, 1)
    open(path, "w", encoding="utf-8").write(t)


edit("rules/model-should-have-a-date-table.md", [
    ("Models with no table that has the data category Time and a DateTime column marked as the key, which is what Mark as date table sets.",
     "Models with no table that defines a calendar, and none that has the data category Time and a DateTime column marked as the key, which is what Mark as date table sets."),
    ("so the hidden per-column calendars stop being built.",
     "so the hidden per-column calendars stop being built. Where the model uses calendar-based time intelligence, a preview in Power BI Desktop, define a calendar on the table instead, under Calendar options in Table tools, which writes a `calendar` block under the table in its file ([Calendar-based time intelligence](" + CAL + "))."),
    ("- Both properties are needed on one table:",
     "- " + S["MODEL_SHOULD_HAVE_A_DATE_TABLE"] + " Microsoft: \"You don't need to identify your own date table with the Mark as Date table option if you use the recommended Calendar-based time intelligence in Power BI unless in specific circumstances\" ([Set and use date tables in Power BI Desktop](" + DATES + ")). Those circumstances are not read here, so a calendar satisfies the rule even where Microsoft still asks for the marking ([When you must mark your date table](" + MUST + ")).\n- Without a calendar, both properties are needed on one table:"),
    ("Marking it clears both rules at once.",
     "Marking it, or defining a calendar on it, clears both rules at once."),
])

edit("rules/date-calendar-tables-should-be-marked-as-a-date-table.md", [
    ("Tables with date or calendar in the name that are not marked as a date table, meaning",
     "Tables with date or calendar in the name that define no calendar and are not marked as a date table, meaning"),
    ("Where the table is not a calendar at all and only the name caught it, rename it or ignore the finding on it.",
     "Where the model uses calendar-based time intelligence, a preview in Power BI Desktop, defining a calendar on the table under Calendar options in Table tools clears the finding instead, since its functions need the marking only in the cases Microsoft lists ([When you must mark your date table](" + MUST + ")). Where the table is not a calendar at all and only the name caught it, rename it or ignore the finding on it."),
    ("so the table cannot be marked and the finding stays for as long as the table exists.",
     "so the table cannot be marked; a calendar defined on it, which needs no row for every day, clears the finding, and without one the finding stays for as long as the table exists."),
    ("a calculation group called Date Intelligence is left alone.\n",
     "a calculation group called Date Intelligence is left alone.\n- " + S["DATE/CALENDAR_TABLES_SHOULD_BE_MARKED_AS_A_DATE_TABLE"] + "\n"),
    ("because a part of the table in what pbiplint missed could mark the table, hold its key column, or make it a calculation group, which the rule leaves out,",
     "because a part of the table in what pbiplint missed could mark the table, hold its key column, define a calendar on it, or make it a calculation group, which the rule leaves out,"),
    ("reports the model when nothing anywhere carries `dataCategory: Time` with a DateTime key.",
     "reports the model when no table defines a calendar and none carries `dataCategory: Time` with a DateTime key."),
])
print("edited")
```

Expected: `edited`. The quotes and the two claims rest on Microsoft's [Set and use date tables in Power BI Desktop](https://learn.microsoft.com/power-bi/transform-model/desktop-date-tables) (the note that opens the page, and the section [When you must mark your date table](https://learn.microsoft.com/power-bi/transform-model/desktop-date-tables#when-you-must-mark-your-date-table)) and [Calendar-based time intelligence](https://learn.microsoft.com/power-bi/transform-model/desktop-time-intelligence#calendar-based-time-intelligence-preview), whose Sparse dates section says calendar functions do not need a row for every day.

- [ ] **Step 7: Regenerate the help data, run everything, and commit**

Run: `npm run build -w @pbiplint/core && node scripts/sync-rule-pages.mjs && npm run lint && npm run typecheck && npm test`
Expected: all pass.

```bash
git add packages/core/src/rules/microsoft-bpa/tables.ts packages/core/test/rules-tables.test.ts tests/expectations/te3-zoo.json rules/model-should-have-a-date-table.md rules/date-calendar-tables-should-be-marked-as-a-date-table.md packages/core/src/rules/rule-summaries.data.ts packages/cli/src/rule-help.data.ts
git commit -F - <<'EOF'
feat(core): both date table rules accept a table that defines a calendar

Calendar-based time intelligence needs no table marked as a date table
outside the cases Microsoft lists, so a calendar satisfies
MODEL_SHOULD_HAVE_A_DATE_TABLE, as it does Tabular Editor 3's built-in
version, and keeps its table out of
DATE/CALENDAR_TABLES_SHOULD_BE_MARKED_AS_A_DATE_TABLE, which Tabular
Editor 3 has no version of. Two deviations, shown on te3-zoo, each stated
on its page with the calendar route in How to fix.

Part of #117.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01NkR2xcGDMmG1T73cTgjBH3
EOF
```

---

### Task 4: Measures that plainly return text

**Files:**
- Modify: `packages/core/src/rules/microsoft-bpa/measures.ts` (imports; the rule at lines 25-39)
- Test: `packages/core/test/rules-measures.test.ts`
- Modify: `tests/expectations/te3-zoo.json` and `tests/expectations/tvw-baseline.json` (one deviation each)
- Modify: `rules/provide-format-string-for-measures.md` and the two generated data files

**Interfaces:**
- Consumes: `tokenizeDax`, `isWord`, `isPunctuation` from `packages/core/src/dax/tokenize.ts` (a token has `kind`, `text`, and `depth`, the count of enclosing `(` and `{`; comments are dropped).
- Produces: `export function returnsText(expression: string): boolean` in `measures.ts`.

- [ ] **Step 1: Write the failing test**

In `packages/core/test/rules-measures.test.ts`, add just before the test that starts `it("INTEGER_FORMATTING flags everything that is not currency, percent, #,0 or #,0.0, including no format string"`:

```ts
  it("PROVIDE_FORMAT_STRING_FOR_MEASURES leaves out a measure whose DAX plainly returns text", () => {
    // A documented deviation: the source rule does not read what a measure returns. Text the
    // tokens do not show plainly (F, a MAXX; H, an IF) is still reported, as is text in a comment
    // (G), in a VAR before RETURN (I), or inside a call (J).
    const m = measures(
      [
        '\tmeasure A = "Hello"',
        '\tmeasure B = VAR x = 1 RETURN "n: " & x',
        '\tmeasure C = FORMAT(1, "0")',
        '\tmeasure D = concatenatex(T, T[Amount], ", ")',
        "\tmeasure E = 1",
        "\tmeasure F = MAXX(T, T[Amount])",
        '\tmeasure G = 1 /* "a" & "b" */',
        '\tmeasure H = IF(1, "a", "b")',
        '\tmeasure I = VAR s = "x" & 1 RETURN 2',
        '\tmeasure J = CALCULATE(VAR x = 1 RETURN x & "a")',
      ].join("\n"),
    );
    expect(objectNames(rules.PROVIDE_FORMAT_STRING_FOR_MEASURES, m)).toEqual([
      "[E]",
      "[F]",
      "[G]",
      "[H]",
      "[I]",
      "[J]",
    ]);
  });
```

- [ ] **Step 2: Run it to make sure it fails**

Run: `npx vitest run packages/core/test/rules-measures.test.ts`
Expected: FAIL; all ten measures are reported, A to D included.

- [ ] **Step 3: Add `returnsText` and use it**

In `packages/core/src/rules/microsoft-bpa/measures.ts`, add as the first import:

```ts
import { isPunctuation, isWord, tokenizeDax } from "../../dax/tokenize.js";
```

Then replace the rule, from the comment `// A part of the measure's table pbiplint could not read may hide the table.` through the rule's closing `);`, with:

```ts
/** DAX functions that return text, for `returnsText`. */
const TEXT_FUNCTIONS = new Set([
  "FORMAT",
  "CONCATENATE",
  "CONCATENATEX",
  "UNICHAR",
  "COMBINEVALUES",
  "LEFT",
  "RIGHT",
  "MID",
  "UPPER",
  "LOWER",
  "SUBSTITUTE",
  "REPT",
  "TRIM",
  "FIXED",
  "REPLACE",
]);

/**
 * Whether a measure plainly returns text, as its tokens show it: the result, which is what follows
 * the last top-level `RETURN` or the whole expression when there is none, is a lone string, joins
 * values with a top-level `&`, or starts with a call to a function that returns text. Comments and
 * strings cannot mislead it. Text returned any other way, such as `MAXX` over a text column, is not
 * seen, since pbiplint does not work out a DAX expression's type.
 */
export function returnsText(expression: string): boolean {
  const tokens = tokenizeDax(expression);
  let from = 0;
  tokens.forEach((t, i) => {
    if (t.depth === 0 && isWord(t, "RETURN")) from = i + 1;
  });
  const result = tokens.slice(from);
  const first = result[0];
  if (first === undefined) return false;
  if (result.length === 1 && first.kind === "string") return true;
  if (result.some((t) => t.depth === 0 && t.kind === "operator" && t.text === "&")) return true;
  return (
    first.kind === "identifier" &&
    TEXT_FUNCTIONS.has(first.text.toUpperCase()) &&
    isPunctuation(result[1], "(")
  );
}

// A measure that plainly returns text is left out, which the source does not do: a documented
// deviation. Power BI sets no format string on text, and Tabular Editor 3's built-in version of
// the rule leaves out every measure it reads as text. A part of the measure's table pbiplint could
// not read may hide the table.
export const PROVIDE_FORMAT_STRING_FOR_MEASURES = bpaRule(
  "PROVIDE_FORMAT_STRING_FOR_MEASURES",
  { skipWhenModelUnread: tablesPartlyRead },
  (m) =>
    allMeasures(m)
      .filter(
        (x) =>
          !x.isHidden &&
          !x.table.isHidden &&
          isBlank(x.formatString) &&
          isBlank(x.formatStringDefinition) &&
          !returnsText(x.expression),
      )
      .map(finding.measure),
);
```

- [ ] **Step 4: Run the focused test, then parity**

Run: `npx prettier --write packages/core/src/rules/microsoft-bpa/measures.ts packages/core/test/rules-measures.test.ts && npx vitest run packages/core/test/rules-measures.test.ts packages/core/test/parity.test.ts`
Expected: rules-measures passes; parity fails on exactly two pairs, `PROVIDE_FORMAT_STRING_FOR_MEASURES` on te3-zoo (pbiplint `[Last Region]`, `[Order Count]`; Tabular Editor also `[Amount Text]`, `[Status Note]`, `[Top Region Label]`) and on tvw-baseline (pbiplint `[Top Product Label]`; Tabular Editor also `[Top Region Label]`).

- [ ] **Step 5: Record the deviation on both fixtures**

The sentence is the same on both. Write `$SCRATCH/dev-task4-zoo.json`:

```json
{
  "deviations": {
    "PROVIDE_FORMAT_STRING_FOR_MEASURES": "A measure that plainly returns text is not reported: one whose result, after its last top-level `RETURN`, is a lone string, joins values with `&`, or starts with a function that returns text, such as `FORMAT` or `CONCATENATEX`. The source rule does not read what a measure returns, so Tabular Editor reports such a measure."
  },
  "ours": {
    "PROVIDE_FORMAT_STRING_FOR_MEASURES": ["[Last Region]", "[Order Count]"]
  }
}
```

and `$SCRATCH/dev-task4-tvw.json`:

```json
{
  "deviations": {
    "PROVIDE_FORMAT_STRING_FOR_MEASURES": "A measure that plainly returns text is not reported: one whose result, after its last top-level `RETURN`, is a lone string, joins values with `&`, or starts with a function that returns text, such as `FORMAT` or `CONCATENATEX`. The source rule does not read what a measure returns, so Tabular Editor reports such a measure."
  },
  "ours": {
    "PROVIDE_FORMAT_STRING_FOR_MEASURES": ["[Top Product Label]"]
  }
}
```

Run: `node "$SCRATCH/add-deviations.mjs" tests/expectations/te3-zoo.json "$SCRATCH/dev-task4-zoo.json" && node "$SCRATCH/add-deviations.mjs" tests/expectations/tvw-baseline.json "$SCRATCH/dev-task4-tvw.json" && npx vitest run packages/core/test/parity.test.ts`
Expected: parity passes in full.

- [ ] **Step 6: Edit the page**

Save this as `$SCRATCH/pages-task4.py` and run it from the repository root:

```python
import json, sys

S = json.load(open("tests/expectations/te3-zoo.json", encoding="utf-8"))["deviations"]
FMT = "https://learn.microsoft.com/power-bi/create-reports/desktop-custom-format-strings#considerations-and-limitations"


def edit(path, pairs):
    t = open(path, encoding="utf-8").read()
    for old, new in pairs:
        if t.count(old) != 1:
            sys.exit(f"{path}: expected one match for {old[:80]!r}, found {t.count(old)}")
        t = t.replace(old, new, 1)
    open(path, "w", encoding="utf-8").write(t)


edit("rules/provide-format-string-for-measures.md", [
    ("Visible measures with no format string and no dynamic format string.",
     "Visible measures with no format string and no dynamic format string, other than those whose DAX plainly returns text."),
    ("a measure that has only a dynamic format string is also left alone.",
     "a measure that has only a dynamic format string is also left alone, and so is one whose DAX plainly returns text, which has nothing to format."),
    ("A measure that returns text has nothing to format. A label measure that builds a title, and a measure that returns a hex color for conditional formatting, are both reported here and neither has a number behind it.",
     "A measure that returns text has nothing to format. pbiplint leaves out the ones whose DAX shows it plainly (see Quirks), but a label that comes from a column, such as `MAXX` over a text column, and a measure that picks a hex color for conditional formatting with `SWITCH` or `IF`, are still reported, and neither has a number behind it."),
    ("## Quirks\n\n",
     "## Quirks\n\n- " + S["PROVIDE_FORMAT_STRING_FOR_MEASURES"] + " Power BI has no format string for text: \"You can't set a custom format string for fields that are of type string or Boolean\" ([Use custom format strings in Power BI Desktop](" + FMT + ")).\n- Text returned any other way is still reported: `MAXX` over a text column, a variable holding text returned by its name, or an `IF` or `SWITCH` whose every branch is a string. pbiplint does not work out what type a DAX expression returns, and reads only what the tokens show, so a string or `&` inside a comment, or before the last `RETURN`, does not count.\n"),
])
print("edited")
```

Expected: `edited`. The page's first paragraph is the rule's description in tool output, which the sync in the next step carries there.

- [ ] **Step 7: Regenerate the help data, run everything, and commit**

Run: `npm run build -w @pbiplint/core && node scripts/sync-rule-pages.mjs && npm run lint && npm run typecheck && npm run check:browser && npm test`
Expected: all pass.

```bash
git add packages/core/src/rules/microsoft-bpa/measures.ts packages/core/test/rules-measures.test.ts tests/expectations/te3-zoo.json tests/expectations/tvw-baseline.json rules/provide-format-string-for-measures.md packages/core/src/rules/rule-summaries.data.ts packages/cli/src/rule-help.data.ts
git commit -F - <<'EOF'
feat(core): PROVIDE_FORMAT_STRING_FOR_MEASURES leaves out text measures

A measure whose DAX plainly returns text, a lone string, a top-level &
join, or a call to a text function after its last top-level RETURN, is
no longer asked for a format string Power BI cannot set. It reads the
DAX tokenizer's tokens, so comments and strings cannot mislead it; text
returned any other way is still reported, as the page says. A deviation,
shown on te3-zoo and tvw-baseline.

Part of #117.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01NkR2xcGDMmG1T73cTgjBH3
EOF
```

---

### Task 5: The perspectives page, the count in the copy, and the captured-fixture docs

**Files:**
- Modify: `rules/perspectives-with-no-objects.md` and the two generated data files
- Modify: `README.md`, `packages/cli/README.md`, `packages/core/README.md`, `packages/web/content/about.md`, `packages/core/src/rules/microsoft-bpa/define.ts` (the count)
- Modify: `CONTRIBUTING.md`, `docs/RELEASING.md`, `scripts/test/te-captures.test.mjs` (the captured-fixture sentence)

**Interfaces:** none; text only. Run it after Tasks 2 to 4, since the count it writes is theirs.

The count is eleven deviations in eight rules, counted as #148 counted the five: every documented difference in what a ported rule reports, whether a fixture shows it or not. The five were two in `UNNECESSARY_COLUMNS`, two in `INACTIVE_RELATIONSHIPS_THAT_ARE_NEVER_ACTIVATED`, and one in `AVOID_THE_USERELATIONSHIP_FUNCTION_AND_RLS_AGAINST_THE_SAME_TABLE`; this pull request adds one in each of the two IsAvailableInMdx rules, `UNNECESSARY_COLUMNS`, both date table rules, and `PROVIDE_FORMAT_STRING_FOR_MEASURES`.

- [ ] **Step 1: Edit the pages, the copy, and the docs**

Save this as `$SCRATCH/text-task5.py` and run it from the repository root:

```python
import sys

TMDLV = "https://learn.microsoft.com/power-bi/transform-model/desktop-tmdl-view#common-use-cases-for-tmdl-view"


def edit(path, pairs):
    t = open(path, encoding="utf-8").read()
    for old, new in pairs:
        if t.count(old) != 1:
            sys.exit(f"{path}: expected one match for {old[:80]!r}, found {t.count(old)}")
        t = t.replace(old, new, 1)
    open(path, "w", encoding="utf-8").write(t)


edit("rules/perspectives-with-no-objects.md", [
    ("Power BI Desktop has no perspective editor, so the fix is in the file. A perspective is a `perspective` block of its own, and the objects it shows are `perspectiveTable` entries under it, with the columns, measures, and hierarchies it shows listed beneath each one. Add the tables the perspective should show, or delete its file from the `perspectives` folder and drop the matching `ref perspective` line from `model.tmdl`.",
     "Power BI Desktop has no graphical editor for perspectives, and its TMDL view is the route Microsoft gives ([Common use cases for TMDL view](" + TMDLV + ")). A perspective is a `perspective` block of its own, and the objects it shows are `perspectiveTable` entries under it, with the columns, measures, and hierarchies it shows listed beneath each one. In TMDL view, write a `createOrReplace` script of the whole perspective with the tables it should show, and select Apply. To remove the perspective instead, close Desktop, delete its file from the `perspectives` folder, and drop the matching `ref perspective` line from `model.tmdl`."),
    ("- Power BI Desktop never writes perspectives, so this rule fires only on models built or edited somewhere else.\n", ""),
])

edit("README.md", [("same model, with five documented deviations where", "same model, with eleven documented deviations where")])
edit("packages/web/content/about.md", [("same model apart from five documented deviations,", "same model apart from eleven documented deviations,")])
edit("packages/cli/README.md", [
    ("Editor on the same model, with five documented deviations where the source is noisier, or quieter,\nthan it means to be; and pbiplint's own rules for a year or a date fixed in DAX, such as a measure\nfiltered to 2025",
     "Editor on the same model, with eleven documented deviations where the source is noisier, or quieter,\nthan it means to be; and pbiplint's own rules for a year or a date fixed in DAX, such as a measure\nfiltered to 2025"),
])
edit("packages/core/README.md", [
    ("model and report together. A port keeps its source's quirks on purpose, apart from five documented\ndeviations from the Microsoft ruleset and six from PBI Inspector, and each rule's page documents\nthem.",
     "model and report together. A port keeps its source's quirks on purpose, apart from eleven documented\ndeviations from the Microsoft ruleset and six from PBI Inspector, and each rule's page documents\nthem."),
])
edit("packages/core/src/rules/microsoft-bpa/define.ts", [
    (" * quirks, apart from the five deviations named on the pages and in the rules' doc comments; those a\n * fixture shows are pinned by `ours` in the model expectation files, the others by the rules' unit\n * tests.",
     " * quirks, apart from the eleven deviations named on the pages and in the rules' doc comments;\n * those a fixture shows are pinned by `ours` in the model expectation files, the others by the\n * rules' unit tests."),
])

edit("CONTRIBUTING.md", [
    ("5. If no fixture exercises the rule, add the construct to `tests/fixtures/rule-zoo.SemanticModel` and refresh its expectations (below).",
     "5. If no fixture exercises the rule, add the construct to `tests/fixtures/rule-zoo.SemanticModel` and refresh its expectations (below). After October 31, 2026, add it to a new fixture instead: a fixture listed in `scripts/test/te-captures.test.mjs` keeps its captures as they are (see Refreshing parity expectations)."),
    ("A fixture added later needs only its Microsoft capture (the first command below), from a licensed build or hand-verified.",
     "A fixture added later needs only its Microsoft capture (the first command below), from a licensed build or hand-verified. A listed fixture keeps its captures as they are once the build that made them stops working: a change to it changes its Microsoft capture, which the survey's run of Microsoft's own file must equal, so it would need all seven listed fixtures re-captured three ways with one licensed build."),
    ("without `--oracle`, the file keeps the oracle it had.",
     "without `--oracle`, an existing file keeps the oracle it had, and a new one names Tabular Editor CLI 0.7.1.2, which is wrong for any other build."),
])
edit("docs/RELEASING.md", [
    ("build in their oracles. A fixture added later has only its Microsoft capture. The three are:",
     "build in their oracles. A fixture added later has only its Microsoft capture. A listed fixture\nkeeps its captures as they are once 0.7.1.2 stops working: a change to it changes its Microsoft\ncapture, which the survey's run of Microsoft's own file must equal, so all seven are then\nre-captured three ways with one licensed build, or the change goes in a new fixture. The three are:"),
])
edit("scripts/test/te-captures.test.mjs", [
    ("// The model fixtures captured three ways with te 0.7.1.2 before October 31, 2026, by name. A fixture\n// whose captures are made before October 31, 2026 (such as #164's) is added here. A fixture added\n// later has only its Microsoft capture and is not listed.",
     "// The model fixtures captured three ways with te 0.7.1.2 before October 31, 2026, by name. A\n// fixture whose captures are made before October 31, 2026 (such as #164's) is added here. A fixture\n// added later has only its Microsoft capture and is not listed. A listed fixture keeps its captures\n// as they are after that date: a change to it needs all seven re-captured three ways with one\n// licensed build (docs/RELEASING.md)."),
])
print("edited")
```

Expected: `edited`. The perspectives wording rests on Microsoft's [Common use cases for TMDL view](https://learn.microsoft.com/power-bi/transform-model/desktop-tmdl-view#common-use-cases-for-tmdl-view), whose perspective scenario says Desktop's graphical interface cannot create or edit one and TMDL view can, and which notes that personalized visuals use perspectives, which is why models saved by Desktop do carry them.

- [ ] **Step 2: Check the copy**

```bash
grep -rn -i 'five documented\|five deviations' README.md packages/cli/README.md packages/core/README.md packages/web/content/about.md packages/core/src/rules/microsoft-bpa/define.ts
awk 'length > 100 {print FILENAME": "FNR": "length}' packages/cli/README.md packages/core/README.md docs/RELEASING.md packages/core/src/rules/microsoft-bpa/define.ts
```

Expected: the first command prints nothing. The second prints only lines that were already longer than 100 columns before this task (`packages/cli/README.md: 12`, `packages/core/README.md: 24`, and RELEASING's lines from 162 on); none of this task's lines.

- [ ] **Step 3: Regenerate the help data, run everything, and commit**

Run: `npm run build -w @pbiplint/core && node scripts/sync-rule-pages.mjs && npx prettier --write packages/core/src/rules/microsoft-bpa/define.ts scripts/test/te-captures.test.mjs && npm run lint && npm run typecheck && npm run build && npm test`
Expected: all pass. (The site build prints "Unable to parse HTML; parse5 error code control-character-reference" twice; it does on `main` too.)

```bash
git add rules/perspectives-with-no-objects.md packages/core/src/rules/rule-summaries.data.ts packages/cli/src/rule-help.data.ts README.md packages/cli/README.md packages/core/README.md packages/web/content/about.md packages/core/src/rules/microsoft-bpa/define.ts CONTRIBUTING.md docs/RELEASING.md scripts/test/te-captures.test.mjs
git commit -F - <<'EOF'
docs: perspectives in TMDL view, eleven deviations, and captured fixtures

PERSPECTIVES_WITH_NO_OBJECTS's page gives Desktop's TMDL view as the
route, as Microsoft does, and drops the Quirk that Desktop never writes
perspectives. The copy counts eleven documented deviations in the ported
model rules. CONTRIBUTING, RELEASING, and the capture test say that a
fixture listed for the te captures keeps them after October 31, 2026,
and that a new --from file without --oracle names 0.7.1.2.

Part of #117.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01NkR2xcGDMmG1T73cTgjBH3
EOF
```

---

## After the tasks

The controller runs the whole-branch review, opens the pull request, merges it when it is reviewed and CI is green (Michael's standing rule), and then:

1. Comments on #117 under "For the 0.2.3 release summary": what can change in results (on a model with a calendar, the five calendar rules; on any model, `PROVIDE_FORMAT_STRING_FOR_MEASURES` reports fewer measures, which a gated workflow may notice), and for code that uses `@pbiplint/core` directly, the additions: the `Calendar` type, the optional `Table.calendars`, and `UsageIndex.usedInCalendars` (a new member of an exported interface, so code that implements `UsageIndex` itself needs it).
2. Ticks #117's box that starts `**The existing rules**`.

## Out of scope

- The new rules, their pages, and the survey half of the sourced-parity test: pull request 3.
- #164 and its captures, which must be made before October 31, 2026.
- `MONTH_(AS_A_STRING)_MUST_BE_SORTED` stays as it is (Michael, October 1, 2026; spec section 4.2).
