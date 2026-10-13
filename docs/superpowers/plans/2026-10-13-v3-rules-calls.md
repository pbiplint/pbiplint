# v3 Calls and Literals Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Pull request 4 of v3 ([#78](https://github.com/pbiplint/pbiplint/issues/78)): five built-in Power Query rules, `LOCAL_DRIVE_PATH`, `SCRIPT_IN_QUERY`, `EXCEL_USE_HEADERS`, `ODBC_WHERE_CONNECTOR_EXISTS`, and `PRIVACY_LEVELS_IGNORED`, each with its page; `tests/expectations/pbiplint/m-zoo.json` and `rules-m.test.ts`; the sample's and the fixtures' counts; the core's one budget raise; and the About page and the READMEs naming Power Query.

**Architecture:** One shared helper, `mFinding`, turns a node of a parsed query into a finding on the query's owner, located by `MIndex.locate` and named as Power Query's editor names the query and the step (spec 6.3). The four M rules live in one file, `packages/core/src/rules/pbiplint/power-query.ts`, and each reads a call or a text literal where it stands; only `ODBC_WHERE_CONNECTOR_EXISTS` follows a name, one hop through `resolve`, as spec 9.15 says. `PRIVACY_LEVELS_IGNORED` reads no M: the model gains `dataAccessOptions`. m-zoo's expectations file starts empty in Task 1 and each rule task pins its own findings there, so pull requests 5 and 6 follow the same pattern.

**Tech Stack:** TypeScript, `@microsoft/powerquery-parser` 2.0.0 (pinned by pull request 2), Vitest, Playwright, esbuild (`check:browser`).

**Spec:** `docs/superpowers/specs/2026-10-12-pbiplint-v3-power-query-layer-design.md`, sections 3.4, 5.3, 6, 9.1, 9.6, 9.8, 9.9, 9.12, 9.15, 10.3, 11.1, 11.2, 11.4, and 12.2 item 4. Read 6.3, 9.1, and the five rule sections before starting.

## Where this plan reads the spec narrowly

- **`Model.dataAccessOptions` carries each flag's line.** Spec 9.8 types it `{ flags: string[]; location: SourceLocation }` and in the same sentence asks for "the block's flags lowercased with each one's line", and the finding sits on the `fastCombine` line. A `string[]` cannot carry a line, so the type is `{ location: SourceLocation; flags: { name: string; location: SourceLocation }[] }`: `location` is the block's line, each flag has its own.
- **`ODBC_WHERE_CONNECTOR_EXISTS` follows one name.** Spec 12.2 says these rules need "the resolver beyond a step's name" for nothing; spec 9.15 says the connection string is "a literal, or a name the resolver binds to one". The rule takes 9.15's wording: a connection string written in the call, or a name that `resolve` binds to a `let` step or a model parameter whose value is a text literal. Nothing else is followed. A connection given as a record (`Odbc.DataSource([Driver = ...])`) is not read; the page says so.
- **No page in this pull request names a rule that does not exist yet.** Spec 9.6 says a path built at run time is "`DYNAMIC_DATA_SOURCE`'s" to report. `rule-pages.test.ts` fails a Related rules line that names an unknown rule, so `LOCAL_DRIVE_PATH`'s page describes the case without naming the rule; pull request 6 adds the cross-reference when `DYNAMIC_DATA_SOURCE` lands.
- **`scripts/generate-rule-pages.mjs` needs no change.** The coordinator asked for a branch so built-in Power Query rules do not get the Best Practice Analyzer ruleset link. The script already gives every built-in rule an empty `sources:` list (`rule.status === "builtin" ? [] : ...`, line 20, since September 22, 2026), and only a ported rule gets the ruleset link, which is right for `MINIMIZE_POWER_QUERY_TRANSFORMATIONS`. The PR 3 ledger note said otherwise; it misread the line. Task 2 runs the scaffold for `LOCAL_DRIVE_PATH` and checks its front matter, which is the proof.
- **The suite stays green at every task** (pb-coord, October 13, 2026, replacing this plan's first draft, which moved the rule counts once in Task 7). Each rule task moves every pin its rule breaks by its own amount: the rule counts in `pack.test.ts` and `generate.test.ts` (one rule, one built-in rule), the sample and fixture counts, and the e2e counts. So every commit passes `npm test` and bisects cleanly. Where a task step below says "Expected: PASS, except the rule counts ... which Task 7 moves", read "Expected: PASS", and move those counts in that task. Task 7 then does only the READMEs' and the About page's prose. The one exception is `check:browser`, which may fail locally on the core's own budget from the moment core crosses 210 KB until Task 8 raises the budget; nothing is pushed before then.
- **Task order: 1, 2, 3, 4, 6, 5, 7, 8, 9** (pb-coord, October 13, 2026). `ODBC_WHERE_CONNECTOR_EXISTS` (Task 5) runs after `PRIVACY_LEVELS_IGNORED` (Task 6), as specified (`Driver=` or `Provider=` names only, DSN-only calls left alone), so it is easy to drop if Michael decides against it. Task 5's counts are then its own last step on top of Task 6's.
- **The count phrases in the READMEs and the About page are new.** Spec 10.3 says the counts "move from 106 rules (24 built in)", but no README or the About page states a count today. Task 7 adds one sentence to each, phrased so pull requests 5 and 6 change only its numbers.

## Global Constraints

- **Base branch:** `release/0.3.0`, never main. Branch `v3/rules-calls`, already cut from `release/0.3.0` at d2a18b8 (pull request 3 merged). Work in the worktree `~/Projects/pbiplint/pbiplint/.claude/worktrees/v3-spec`, never in home (`~/Projects/pbiplint/pbiplint` itself).
- **The five rules** (spec 9.1): status `builtin` through `pbiplintRule`; layer `powerquery` (so `needs: ["model"]`); scope `["Partition", "NamedExpression", "Table"]`, except `PRIVACY_LEVELS_IGNORED`, `["Model"]`. Severity and category: `LOCAL_DRIVE_PATH` warning, Error Prevention; `PRIVACY_LEVELS_IGNORED` warning, Error Prevention; `SCRIPT_IN_QUERY` warning, Error Prevention; `EXCEL_USE_HEADERS` info, Error Prevention; `ODBC_WHERE_CONNECTOR_EXISTS` info, Performance.
- **Names, verbatim:** "Path on a local drive", "Privacy levels ignored for this file", "Python or R script in a query", "Excel headers promoted by the workbook reader", "ODBC or OLE DB where Power BI has a connector".
- **One finding per occurrence**, at the node's first token: `MIndex.locate(q, node.tokenRange.positionStart)`. Detail: `query '<query>'`, then `, partition '<partition>'` when the table has more than one M partition, then `, step '<step>'` when the node is in an outermost `let` step, then `: ` and what was found. Names through `tableRef` (always single-quoted, quotes doubled).
- **Object:** the partition (`Partition`, its name), the shared expression (`NamedExpression`), or for a refresh policy's query the table (`Table`, `'Name'`), so `pbiplint.ignore` works as it does today. A finding's own `layer` is `model`.
- **No em dashes anywhere** (code, comments, docs, rule pages, commit messages; a hook blocks them and `rule-pages.test.ts` checks pages for U+2014). Restructure with a comma, colon, parentheses, or two sentences.
- **Long-form dates in prose** ("October 13, 2026"), never `2026-10-13`, except in file names and front matter.
- **Capitalized bullets** in every list this plan writes.
- **Rule pages** are pbiplint's own prose, from the template. The fix route starts in Power BI Desktop's Power Query editor (Transform data, the query, the step in Applied steps), then the source, then the TMDL file. No third-party tool is required, never Tabular Editor for the fix, and no Tabular Editor C#. Every quote is linked to its source page, at the section anchor when there is one. Each page's `tmdl fires` and `tmdl fixed` examples must parse and fire (`rule-pages.test.ts`).
- **Never name or cite any competing Power Query linter or its author**, in code, pages, commits, or the pull request.
- **Fixtures and tests are sanitized:** the `C:\Demo\Data\` convention for file paths, `example.com` or `*.example` hosts, no real names or servers. Fake secrets, where a test needs one, use the `pbiplint-fixture-<kind>-<nnnn>-notreal` form, which matches no real provider's format. This plan adds none.
- **Core stays browser-pure:** no Node built-in, no `process.`, no network API in `packages/core/src`.
- **The core budget:** raised once, in Task 8, from measurement. The parser's 385 KB budget does not change. Until Task 8, `check:browser` may fail on the core's own budget; no task before it runs `check:browser`.
- **The corpus diff** (spec 11.4) must show only the five new rules' findings, every one an addition, each rule spot-checked for false positives (Task 9).
- **Formatting:** `npx prettier --write` on every changed `.ts`, `.mts`, `.mjs`, `.css`, and `.json` file outside `tests/` before committing (Markdown, `.tmdl`, `tests/fixtures/`, and `tests/expectations/` are Prettier-ignored; keep their JSON at two-space indents by hand). Then `npm run lint`.
- **Generated data:** after any rule page edit, `npm run build -w @pbiplint/core && node scripts/sync-rule-pages.mjs`, and commit the three `.data.ts` files it rewrites.
- **Commits:** one or more per task. Each message ends with `Part of #78.`, a blank line, and `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Never write a closing keyword next to an issue number.
- **Subagents** run on Opus 5.5 and share the worktree, so one edits files at a time.
- **`$SCRATCH`** is the executing session's job folder for temporary files (`$CLAUDE_JOB_DIR/tmp`). Nothing in it is committed.
- **Commands that cannot stall on a permission prompt** (pb-coord, October 13, 2026): temporary files only under `$CLAUDE_JOB_DIR/tmp`, never `/tmp`. Each experiment gets a fresh folder from `mktemp -d "$CLAUDE_JOB_DIR/tmp/<name>.XXXX"`, used by the literal path it prints (shell variables do not survive between tool calls). Never `rm -rf` or `rm -r` with a glob or a variable path; to remove a folder, name its full literal path, and leaving scratch folders behind is fine. No `sudo`, no deleting outside the worktree or the job folder, no `git clean`, `git reset --hard`, `git stash`, or force-push. A command that might ask for permission is rewritten so it cannot; never wait on a prompt.
- **The plan's workspace** is `.superpowers/sdd/2026-10-13-v3-rules-calls/` (git-ignored; `.superpowers` is a symlink into home's copy, so scripts there import the worktree's code by `process.cwd()`, never by a relative path). The reader plan's `corpus-diff.mts` is reused from `.superpowers/sdd/2026-10-13-v3-reader/`.
- **Folder inputs in e2e** go through `setFolder` from `packages/web/e2e/folder-input.ts`, never `setInputFiles` on a directory. This plan's browser checks use the sample button and need none, but any added later in this pull request follows the rule.
- **The corpus** (`~/Projects/pbiplint/assets/pbip-lint-spike/research-104`) is not pbiplint's: the pull request carries counts only, never a corpus path, line, or value.

## Review Focus

- **A table with two M partitions, and a refresh policy whose query differs from its partition.** The detail reads `query 'Sales', partition 'Sales 2024': ...` on the partition, and a refresh policy's finding is on the table (`Table`, `'Sales'`). Task 1's `m-helpers.test.ts` pins both.
- **A connection string written loosely.** `DRIVER = {MySQL ODBC 8.0 Unicode Driver}; SERVER=mysql.example` (key in capitals, spaces around `=`) is read as the MySQL driver. Task 5 pins it.
- **An ignore annotation on the object.** `annotation pbiplint.ignore = LOCAL_DRIVE_PATH` under the partition, and `annotation pbiplint.ignore = PRIVACY_LEVELS_IGNORED` under `model`, each silence their finding through `lint`. Tasks 2 and 6 pin them.
- **M that does not parse.** A query whose M has a drive path but does not parse gets only its `PARSE_ISSUE`, never a `LOCAL_DRIVE_PATH` finding on a guess. Task 2 pins it.
- **Text that only looks like a local path.** `file:///C:/...`, `https://example.com/C:/...`, `C:` alone, `C:Data`, a path in a comment, a network path, and a path joined at refresh time from a parameter are each left alone (the parameter's own value is still reported). Task 2 pins all of them.

## File Structure

| File | Task | Responsibility |
| --- | --- | --- |
| `packages/core/src/m/ast.ts` | 1 | `textLiterals(q)` beside `calls(q)` |
| `packages/core/src/rules/m-helpers.ts` (new) | 1 | `queryLabel`, `mFinding`: a finding on a node of a query |
| `packages/core/src/rules/pbiplint/power-query.ts` (new) | 1 to 6 | The five rules and `powerQueryRules` |
| `packages/core/src/rules/pbiplint/index.ts` | 1 | Registers `powerQueryRules` last |
| `packages/core/test/helpers.ts` | 1 | `mFindings(rule, tmdl)` |
| `packages/core/test/m-ast.test.ts`, `packages/core/test/m-helpers.test.ts` (new) | 1 | The helpers' tests |
| `packages/core/test/rules-power-query.test.ts` (new) | 1 to 6 | Each rule's unit tests |
| `tests/expectations/pbiplint/m-zoo.json` (new), `packages/core/test/rules-m.test.ts` (new) | 1 to 6 | m-zoo's pinned findings of pbiplint's own Power Query rules |
| `rules/local-drive-path.md`, `rules/script-in-query.md`, `rules/excel-use-headers.md`, `rules/odbc-where-connector-exists.md`, `rules/privacy-levels-ignored.md` (new) | 2 to 6 | The pages |
| `packages/core/src/rules/rule-summaries.data.ts`, `packages/cli/src/rule-help.data.ts`, `packages/web/src/results/rule-guidance.data.ts` (generated) | 2 to 6 | Regenerated from the pages |
| `tests/expectations/messy-sales.report.json`, `pbip-and-github-demo.report.json`, `shelfmart.report.json` | 2 | `LOCAL_DRIVE_PATH` in each `native` map |
| `packages/core/test/report-parity.test.ts` | 2 | The sample plants every report and project rule, not every Power Query one |
| Sample count pins (`sample.test.ts`, `home.test.ts`, `render.test.ts`, `export.test.ts`, `home.spec.ts`, `cli.test.ts`, `contract.test.ts`, core README) | 2 | 266 findings become 273 |
| `packages/core/src/model/types.ts`, `packages/core/src/model/build.ts`, `packages/core/test/build.test.ts` | 6 | `Model.dataAccessOptions` |
| `packages/core/test/pack.test.ts`, `packages/web/test/generate.test.ts`, `packages/web/e2e/site.spec.ts` | 7 | Rule counts, 106 to 111; a built-in Power Query page in the site checks |
| `README.md`, `packages/cli/README.md`, `packages/core/README.md`, `packages/web/content/about.md` | 7 | Power Query named as a part pbiplint reads, with counts |
| `packages/core/scripts/check-browser-bundle.mjs`, the v3 spec section 3.4 | 8 | The measured budget |
| `.superpowers/sdd/2026-10-13-v3-rules-calls/rule-counts.mts` (not committed) | 9 | The five rules' corpus counts and spot-check examples |

---

## Before Task 1

```bash
cd ~/Projects/pbiplint/pbiplint/.claude/worktrees/v3-spec
git fetch origin
git switch v3/rules-calls
git status --short          # expected: clean apart from this plan
pb-worktree-setup
mkdir -p .superpowers/sdd/2026-10-13-v3-rules-calls
git add docs/superpowers/plans/2026-10-13-v3-rules-calls.md
git commit -m "docs: the v3 calls and literals plan

Part of #78.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
npm test 2>&1 | tail -5
npm run check:browser
```

Expected: the suite passes on the base, and `check:browser` prints `core's own code 206.3 KB` (measured on October 13, 2026 at d2a18b8). Write that whole `check:browser` line into `.superpowers/sdd/2026-10-13-v3-rules-calls/progress.md` as **the base measurement**; Task 8 needs it. If the suite fails, stop and report.

---

### Task 1: A finding on a node of a query, and m-zoo's expectations file

**Files:**
- Modify: `packages/core/src/m/ast.ts` (after `calls`)
- Create: `packages/core/src/rules/m-helpers.ts`
- Create: `packages/core/src/rules/pbiplint/power-query.ts`
- Modify: `packages/core/src/rules/pbiplint/index.ts`
- Modify: `packages/core/test/helpers.ts`
- Create: `tests/expectations/pbiplint/m-zoo.json`
- Test: `packages/core/test/m-ast.test.ts`, `packages/core/test/m-helpers.test.ts` (new), `packages/core/test/rules-m.test.ts` (new)

**Interfaces:**
- Consumes: `MQuery`, `MIndex` (`packages/core/src/m/types.ts`), `nodeOf`, `textValue`, `stepOf` (`packages/core/src/m/ast.ts`), `readM` (`packages/core/src/m/read.ts`), `finding` (`packages/core/src/rules/helpers.ts`), `tableRef` (`packages/core/src/model/names.ts`).
- Produces:
  - `textLiterals(q: MQuery): { node: Language.Ast.TNode; value: string }[]` in `m/ast.ts`: every text literal, in text order, with its value as `textValue` reads it.
  - `queryLabel(q: MQuery): string` and `mFinding(m: MIndex, q: MQuery, node: Language.Ast.TNode, what: string): RuleFinding` in `rules/m-helpers.ts`.
  - `powerQueryRules: Rule[]` in `rules/pbiplint/power-query.ts`, registered last in `pbiplintRules`.
  - `mFindings(rule: Rule, tmdl: string): Promise<Omit<RuleFinding, "object">[]>` in `packages/core/test/helpers.ts`.
  - `tests/expectations/pbiplint/m-zoo.json`: `{ fixture, about, rules: string[], findings: PinnedFinding[] }`, where `PinnedFinding` is `{ rule, objectType, object, file, line, column?, detail }`. `rules-m.test.ts` holds `rules` equal to every built-in Power Query rule id, sorted.

- [ ] **Step 1: Write the failing helper tests**

In `packages/core/test/m-ast.test.ts`, add `textLiterals` to the import from `../src/m/ast.js`, and add after the `describe("identifierName and textValue", ...)` block:

```ts
describe("textLiterals", () => {
  it("lists every text literal in text order with its value, and nothing else", async () => {
    const q = await query('let a = "one", b = 2, c = {"two", true} in "th""ree"');
    expect(textLiterals(q).map((l) => l.value)).toEqual(["one", "two", 'th"ree']);
    expect(textLiterals(q).every((l) => l.node.kind === Language.Ast.NodeKind.LiteralExpression)).toBe(
      true,
    );
  });
  it("finds none in a query that did not parse", () => {
    expect(
      textLiterals({ kind: "expression", name: "Q", owner: { name: "Q" } as never, text: "", file: "q.tmdl", valueLine: 1 }),
    ).toEqual([]);
  });
});
```

Create `packages/core/test/m-helpers.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { textLiterals } from "../src/m/ast.js";
import { readM } from "../src/m/read.js";
import { mFinding, queryLabel } from "../src/rules/m-helpers.js";
import { modelFrom } from "./helpers.js";

/** The M index of inline TMDL, read as `lint` reads it. */
const indexOf = async (tmdl: string) =>
  readM(modelFrom(tmdl), [{ path: "inline.tmdl", text: tmdl }]);

/** A table whose one M partition holds `m`, as Desktop writes a block: four tabs before each M line. */
const table = (name: string, ...m: string[]): string =>
  `table '${name}'\n\tpartition '${name}' = m\n\t\tmode: import\n\t\tsource =\n${m.map((l) => `\t\t\t\t${l}`).join("\n")}\n\n`;

/** mFinding on a query's first text literal, without the object it carries for ignores. */
async function onFirstLiteral(tmdl: string, query = 0) {
  const m = await indexOf(tmdl);
  const q = m.queries[query]!;
  const { object: _object, ...f } = mFinding(m, q, textLiterals(q)[0]!.node, "found");
  return f;
}

describe("mFinding (v3 spec, section 6.3)", () => {
  it("names a partition's query after its table, then the step, at the literal's line and column", async () => {
    const tmdl = table(
      "Sales",
      "let",
      '\tSource = Csv.Document(File.Contents("C:\\Demo\\Data\\Sales.csv"))',
      "in",
      "\tSource",
    );
    expect(await onFirstLiteral(tmdl)).toEqual({
      objectType: "Partition",
      objectName: "Sales",
      location: { file: "inline.tmdl", line: 6, column: 42 },
      detail: "query 'Sales', step 'Source': found",
    });
  });
  it("names a shared expression's query after the expression, with no step outside a let", async () => {
    const tmdl =
      'expression ExportFolder = "d:/Exports/" meta [IsParameterQuery = true, Type = "Text", IsParameterQueryRequired = true]\n';
    expect(await onFirstLiteral(tmdl)).toEqual({
      objectType: "NamedExpression",
      objectName: "ExportFolder",
      location: { file: "inline.tmdl", line: 1, column: 27 },
      detail: "query 'ExportFolder': found",
    });
  });
  it("adds the partition's name when the table has more than one M partition", async () => {
    const tmdl =
      "table Sales\n" +
      "\tpartition 'Sales 2024' = m\n\t\tmode: import\n\t\tsource = File.Contents(\"C:\\Demo\\Data\\2024.csv\")\n" +
      "\tpartition 'Sales 2025' = m\n\t\tmode: import\n\t\tsource = File.Contents(\"C:\\Demo\\Data\\2025.csv\")\n";
    expect(await onFirstLiteral(tmdl)).toEqual({
      objectType: "Partition",
      objectName: "Sales 2024",
      location: { file: "inline.tmdl", line: 4, column: 26 },
      detail: "query 'Sales', partition 'Sales 2024': found",
    });
  });
  it("puts a refresh policy's finding on its table", async () => {
    const tmdl =
      "table Sales\n\tpartition Sales = m\n\t\tmode: import\n\t\tsource = Sql.Database(\"db.example\", \"Warehouse\")\n\n" +
      "\trefreshPolicy\n\t\tpolicyType: basic\n\t\tsourceExpression = File.Contents(\"C:\\Demo\\Data\\Sales.csv\")\n";
    // The policy's query differs from its partition's, so it is read (v3 spec, section 5.1).
    expect(await onFirstLiteral(tmdl, 1)).toEqual({
      objectType: "Table",
      objectName: "'Sales'",
      location: { file: "inline.tmdl", line: 8, column: 36 },
      detail: "query 'Sales': found",
    });
  });
  it("quotes names as pbiplint quotes a table's", async () => {
    // TMDL doubles the quote in a quoted name; M's #"..." keeps it single.
    const tmdl =
      "table 'Bob''s Sales'\n\tpartition 'Bob''s Sales' = m\n\t\tmode: import\n\t\tsource =\n" +
      '\t\t\t\tlet\n\t\t\t\t\t#"Bob\'s Step" = "x"\n\t\t\t\tin\n\t\t\t\t\t#"Bob\'s Step"\n\n';
    const m = await indexOf(tmdl);
    expect(queryLabel(m.queries[0]!)).toBe("query 'Bob''s Sales'");
    expect((await onFirstLiteral(tmdl)).detail).toBe("query 'Bob''s Sales', step 'Bob''s Step': found");
  });
});
```

Create `packages/core/test/rules-m.test.ts`:

```ts
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { lint } from "../src/engine/lint.js";
import { defaultRules } from "../src/rules/index.js";
import { readModelFiles } from "./helpers.js";

/** One finding as `tests/expectations/pbiplint/m-zoo.json` pins it. */
interface PinnedFinding {
  rule: string;
  objectType: string;
  object: string;
  file: string;
  line: number;
  column?: number;
  detail: string;
}

interface MExpectation {
  fixture: string;
  about: string;
  rules: string[];
  findings: PinnedFinding[];
}

const repoRoot = new URL("../../../", import.meta.url).pathname;
const expectation = JSON.parse(
  readFileSync(repoRoot + "tests/expectations/pbiplint/m-zoo.json", "utf8"),
) as MExpectation;

/** pbiplint's own Power Query rules: built in, on the Power Query layer. They have no oracle. */
const ownRules = defaultRules
  .filter((r) => r.status === "builtin" && r.layer === "powerquery")
  .map((r) => r.id)
  .sort();

const cmp = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);
/** By file, then line, then column, then rule: the order the expectations file is written in. */
const byPlace = (a: PinnedFinding, b: PinnedFinding): number =>
  cmp(a.file, b.file) || a.line - b.line || (a.column ?? 0) - (b.column ?? 0) || cmp(a.rule, b.rule);

describe("pbiplint's own Power Query rules on m-zoo (v3 spec, section 11.1)", () => {
  it("pins every built-in Power Query rule, and no other", () => {
    expect([...expectation.rules].sort()).toEqual(ownRules);
  });
  it("finds exactly the pinned findings", async () => {
    const result = await lint(readModelFiles(repoRoot + expectation.fixture));
    const found = result.findings
      .filter((f) => expectation.rules.includes(f.ruleId))
      .map((f) => ({
        rule: f.ruleId,
        objectType: f.objectType,
        object: f.objectName,
        file: f.location!.file,
        line: f.location!.line,
        ...(f.location!.column === undefined ? {} : { column: f.location!.column }),
        detail: f.detail!,
      }))
      .sort(byPlace);
    expect(found).toEqual([...expectation.findings].sort(byPlace));
  });
  it("is written in place order, so a reader can follow it beside the fixture", () => {
    expect(expectation.findings).toEqual([...expectation.findings].sort(byPlace));
  });
  it("shows every pinned rule firing at least once, so m-zoo holds a shape for each", () => {
    for (const id of expectation.rules)
      expect(expectation.findings.some((f) => f.rule === id), id).toBe(true);
  });
});
```

Create `tests/expectations/pbiplint/m-zoo.json`:

```json
{
  "fixture": "tests/fixtures/m-zoo.SemanticModel",
  "about": "pbiplint's own Power Query rules on m-zoo: rule, object, file, line, column, and detail of every finding. These rules have no Tabular Editor oracle (v3 spec, section 11.1), so this file is pbiplint's own, written in place order and reviewed by hand.",
  "rules": [],
  "findings": []
}
```

- [ ] **Step 2: Run them to make sure they fail**

Run: `npx vitest run packages/core/test/m-ast.test.ts packages/core/test/m-helpers.test.ts packages/core/test/rules-m.test.ts`
Expected: FAIL: `textLiterals` is not exported, `../src/rules/m-helpers.js` does not exist. `rules-m.test.ts` passes already (no rule, no finding); that is its starting state.

- [ ] **Step 3: Add `textLiterals`**

In `packages/core/src/m/ast.ts`, after `calls`:

```ts
/** Every text literal in a query, in text order, with its value as `textValue` reads it. */
export function textLiterals(q: MQuery): { node: Node; value: string }[] {
  const ids =
    q.nodeIdMapCollection?.idsByNodeKind.get(Kind.LiteralExpression) ?? new Set<number>();
  const out: { node: Node; value: string }[] = [];
  for (const id of [...ids].sort((a, b) => a - b)) {
    const node = nodeOf(q, id);
    const value = textValue(node);
    if (node && value !== undefined) out.push({ node, value });
  }
  return out;
}
```

- [ ] **Step 4: Add `mFinding`**

Create `packages/core/src/rules/m-helpers.ts`:

```ts
import type { Language } from "@microsoft/powerquery-parser";
import { stepOf } from "../m/ast.js";
import type { MIndex, MQuery } from "../m/types.js";
import { tableRef } from "../model/names.js";
import type { NamedExpression, Partition, Table } from "../model/types.js";
import { finding } from "./helpers.js";
import type { RuleFinding } from "./types.js";

/**
 * The query as Power Query's Queries pane names it (v3 spec, section 6.3): `query 'Sales'`, with
 * the partition's name after it when its table has more than one M partition, which Desktop does
 * not write but a hand-edited model can hold.
 */
export function queryLabel(q: MQuery): string {
  const query = `query ${tableRef(q.name)}`;
  if (q.kind !== "partition") return query;
  const p = q.owner as Partition;
  const mPartitions = p.table.partitions.filter((x) => x.sourceType === "m");
  return mPartitions.length > 1 ? `${query}, partition ${tableRef(p.name)}` : query;
}

/** The object a query's finding names: its partition, its shared expression, or the table whose refresh policy holds it. */
function ownerFinding(q: MQuery): RuleFinding {
  if (q.kind === "partition") return finding.partition(q.owner as Partition);
  if (q.kind === "expression") return finding.expression(q.owner as NamedExpression);
  return finding.table(q.owner as Table);
}

/**
 * A finding on one node of a query (v3 spec, sections 6 and 9.1): on the query's owner, at the
 * TMDL line and column of the node's first token, with a detail that names the query, the step
 * that holds the node when there is one, and then `what`.
 */
export function mFinding(
  m: MIndex,
  q: MQuery,
  node: Language.Ast.TNode,
  what: string,
): RuleFinding {
  const step = stepOf(q, node);
  return {
    ...ownerFinding(q),
    location: m.locate(q, node.tokenRange.positionStart),
    detail: `${queryLabel(q)}${step === undefined ? "" : `, step ${tableRef(step)}`}: ${what}`,
  };
}
```

- [ ] **Step 5: Add the rules' file and register it**

Create `packages/core/src/rules/pbiplint/power-query.ts`:

```ts
import type { Rule } from "../types.js";

/**
 * pbiplint's own Power Query rules (v3 spec, section 9): each reads the M a model's queries hold,
 * or the file's Power Query options, and reports on the model's files.
 */
export const powerQueryRules: Rule[] = [];
```

In `packages/core/src/rules/pbiplint/index.ts`, add `import { powerQueryRules } from "./power-query.js";` (in alphabetical place, after `periodRules`), add `...powerQueryRules,` after `...tabOrderRules,`, and end the doc comment's list with "tab order, and Power Query." instead of "and tab order."

- [ ] **Step 6: Add the test helper**

In `packages/core/test/helpers.ts`, add `RuleFinding` to the type import from `../src/rules/types.js`, and after `mObjectNames`:

```ts
/**
 * Run one rule on inline TMDL with its M read by Microsoft's parser, as `lint` reads it, and
 * return its findings without the object each carries for ignores, in emission order.
 */
export async function mFindings(rule: Rule, tmdl: string): Promise<Omit<RuleFinding, "object">[]> {
  const model = modelFrom(tmdl);
  const m = await readM(model, [{ path: "inline.tmdl", text: tmdl }]);
  return rule
    .check({ model }, { indexes: buildIndexes({ model }, m), options: {} })
    .map(({ object: _object, ...f }) => f);
}
```

- [ ] **Step 7: Run the tests**

Run: `npx vitest run packages/core/test/m-ast.test.ts packages/core/test/m-helpers.test.ts packages/core/test/rules-m.test.ts packages/core/test/define-native.test.ts`
Expected: PASS. Then `npm run typecheck`.

- [ ] **Step 8: Commit**

```bash
npx prettier --write packages/core/src/m/ast.ts packages/core/src/rules/m-helpers.ts packages/core/src/rules/pbiplint/power-query.ts packages/core/src/rules/pbiplint/index.ts packages/core/test/helpers.ts packages/core/test/m-ast.test.ts packages/core/test/m-helpers.test.ts packages/core/test/rules-m.test.ts
npm run lint
git add packages/core tests/expectations/pbiplint/m-zoo.json
git commit -m "feat: a finding on a node of a query, and m-zoo's own expectations

mFinding locates a node of a parsed query at its TMDL line and column and
names the query and the step as Power Query's editor shows them. The
built-in Power Query rules get their file, and m-zoo's pinned findings
start empty, held to every built-in Power Query rule by rules-m.test.ts.

Part of #78.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: `LOCAL_DRIVE_PATH`, its page, and the sample's count

**Files:**
- Modify: `packages/core/src/rules/pbiplint/power-query.ts`
- Create: `rules/local-drive-path.md`
- Modify (generated): `packages/core/src/rules/rule-summaries.data.ts`, `packages/cli/src/rule-help.data.ts`, `packages/web/src/results/rule-guidance.data.ts`
- Modify: `tests/expectations/pbiplint/m-zoo.json`
- Modify: `tests/expectations/messy-sales.report.json`, `tests/expectations/pbip-and-github-demo.report.json`, `tests/expectations/shelfmart.report.json`
- Modify: `packages/core/test/report-parity.test.ts:154-170`
- Modify: `packages/web/test/sample.test.ts:131-133`, `packages/web/test/home.test.ts:76,96,160`, `packages/web/test/render.test.ts:66`, `packages/web/test/export.test.ts:41`, `packages/web/e2e/home.spec.ts:58-79,491,541`, `packages/cli/test/cli.test.ts:101,179,219,581`, `packages/cli/test/contract.test.ts:73`, `packages/core/README.md:41`
- Test: `packages/core/test/rules-power-query.test.ts` (new)

**Interfaces:**
- Consumes: `textLiterals` (`m/ast.ts`), `mFinding` (`rules/m-helpers.ts`), `pbiplintRule` (`rules/pbiplint/define.ts`), `mFindings`, `mObjectNames` (`test/helpers.ts`).
- Produces: `export const LOCAL_DRIVE_PATH: Rule` in `power-query.ts`, in `powerQueryRules`.

- [ ] **Step 1: Write the failing rule tests**

Create `packages/core/test/rules-power-query.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { lint } from "../src/engine/lint.js";
import { LOCAL_DRIVE_PATH } from "../src/rules/pbiplint/power-query.js";
import type { Rule } from "../src/rules/types.js";
import { mFindings, mObjectNames } from "./helpers.js";

/** A table whose one M partition holds `m`, as Desktop writes a block: four tabs before each M line. */
const table = (name: string, ...m: string[]): string =>
  `table '${name}'\n\tpartition '${name}' = m\n\t\tmode: import\n\t\tsource =\n${m.map((l) => `\t\t\t\t${l}`).join("\n")}\n\n`;

/** What all of pbiplint's own Power Query rules share (v3 spec, section 9.1). */
function isPowerQueryRule(rule: Rule, severity: 1 | 2, category: string): void {
  expect(rule.status).toBe("builtin");
  expect(rule.layer).toBe("powerquery");
  expect(rule.needs).toEqual(["model"]);
  expect(rule.severity).toBe(severity);
  expect(rule.category).toBe(category);
}

describe("LOCAL_DRIVE_PATH (v3 spec, section 9.6)", () => {
  const rule = LOCAL_DRIVE_PATH;
  it("is a built-in Power Query warning on a query's owner", () => {
    isPowerQueryRule(rule, 2, "Error Prevention");
    expect(rule.name).toBe("Path on a local drive");
    expect(rule.scope).toEqual(["Partition", "NamedExpression", "Table"]);
  });
  it("reports text that starts with a drive path, naming only the drive", async () => {
    const tmdl = table(
      "Sales",
      "let",
      '\tSource = Csv.Document(File.Contents("C:\\Users\\someone\\Sales.csv"))',
      "in",
      "\tSource",
    );
    expect(await mFindings(rule, tmdl)).toEqual([
      {
        objectType: "Partition",
        objectName: "Sales",
        location: { file: "inline.tmdl", line: 6, column: 42 },
        detail: "query 'Sales', step 'Source': the path is on a local drive (C:)",
      },
    ]);
  });
  it("reads a parameter's value, with either slash and either case of drive letter", async () => {
    const tmdl =
      'expression ExportFolder = "d:/Exports/" meta [IsParameterQuery = true, Type = "Text", IsParameterQueryRequired = true]\n';
    expect(await mFindings(rule, tmdl)).toEqual([
      {
        objectType: "NamedExpression",
        objectName: "ExportFolder",
        location: { file: "inline.tmdl", line: 1, column: 27 },
        detail: "query 'ExportFolder': the path is on a local drive (D:)",
      },
    ]);
  });
  it("reports each piece of text, so two paths in one query are two findings", async () => {
    const tmdl = table(
      "Sales",
      "let",
      '\tA = File.Contents("C:\\Demo\\Data\\A.csv"),',
      '\tB = File.Contents("C:\\Demo\\Data\\B.csv")',
      "in",
      "\tB",
    );
    expect((await mFindings(rule, tmdl)).map((f) => f.detail)).toEqual([
      "query 'Sales', step 'A': the path is on a local drive (C:)",
      "query 'Sales', step 'B': the path is on a local drive (C:)",
    ]);
  });
  it("leaves alone network paths, web and file addresses, comments, relative paths, a bare drive, and a joined path", async () => {
    const tmdl = table(
      "Sales",
      "let",
      "\t// Moved from C:\\Demo\\Data\\Old.csv",
      '\tNetwork = File.Contents("\\\\fileserver\\share\\Sales.csv"),',
      '\tWeb = Web.Contents("https://example.com/C:/Data/Sales.csv"),',
      '\tFileUrl = Web.Contents("file:///C:/Demo/Data/Sales.csv"),',
      '\tRelative = "Data\\Sales.csv",',
      '\tDrive = "C:",',
      '\tNoSlash = "C:Data",',
      '\tJoined = DataFolder & "Sales.csv"',
      "in",
      "\tJoined",
    );
    expect(await mFindings(rule, tmdl)).toEqual([]);
  });
  it("does not read M that does not parse: PARSE_ISSUE reports it", async () => {
    const tmdl = table("Sales", 'File.Contents("C:\\Demo\\Data\\Sales.csv"');
    expect(await mObjectNames(rule, tmdl)).toEqual([]);
    const result = await lint([{ path: "definition/tables/Sales.tmdl", text: tmdl }]);
    expect(result.findings.map((f) => f.ruleId)).toContain("PARSE_ISSUE");
    expect(result.findings.filter((f) => f.ruleId === rule.id)).toEqual([]);
  });
  it("is silenced by an ignore annotation on the partition", async () => {
    const tmdl =
      'table Sales\n\tpartition Sales = m\n\t\tmode: import\n\t\tsource = File.Contents("C:\\Demo\\Data\\Sales.csv")\n\n\t\tannotation pbiplint.ignore = LOCAL_DRIVE_PATH\n';
    const result = await lint([{ path: "definition/tables/Sales.tmdl", text: tmdl }]);
    expect(result.findings.filter((f) => f.ruleId === rule.id)).toEqual([]);
    const without = tmdl.replace("\n\t\tannotation pbiplint.ignore = LOCAL_DRIVE_PATH", "");
    const before = await lint([{ path: "definition/tables/Sales.tmdl", text: without }]);
    expect(before.findings.filter((f) => f.ruleId === rule.id)).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run them to make sure they fail**

Run: `npx vitest run packages/core/test/rules-power-query.test.ts`
Expected: FAIL: `LOCAL_DRIVE_PATH` is not exported.

- [ ] **Step 3: Write the rule**

Replace `packages/core/src/rules/pbiplint/power-query.ts` with:

```ts
import { textLiterals } from "../../m/ast.js";
import { mFinding } from "../m-helpers.js";
import type { Rule } from "../types.js";
import { pbiplintRule } from "./define.js";

/** Text that starts with a drive letter, a colon, and a slash either way: `C:\Data`, `d:/Exports`. */
const DRIVE_PATH = /^([A-Za-z]):[\\/]/;

// Any text literal in any query, a parameter's value included (v3 spec, section 9.6). A network
// path (\\server\share), a web or file: address, a comment, and a path joined at refresh time are
// left alone. Only the drive is named: a path under C:\Users\ carries an account name, which an
// export need not repeat.
export const LOCAL_DRIVE_PATH = pbiplintRule({
  id: "LOCAL_DRIVE_PATH",
  name: "Path on a local drive",
  category: "Error Prevention",
  severity: 2,
  scope: ["Partition", "NamedExpression", "Table"],
  layer: "powerquery",
  check: (_project, { indexes: { m } }) =>
    m.queries.flatMap((q) =>
      textLiterals(q).flatMap(({ node, value }) => {
        const drive = DRIVE_PATH.exec(value);
        return drive
          ? [mFinding(m, q, node, `the path is on a local drive (${drive[1]!.toUpperCase()}:)`)]
          : [];
      }),
    ),
});

/**
 * pbiplint's own Power Query rules (v3 spec, section 9): each reads the M a model's queries hold,
 * or the file's Power Query options, and reports on the model's files.
 */
export const powerQueryRules: Rule[] = [LOCAL_DRIVE_PATH];
```

Run: `npx vitest run packages/core/test/rules-power-query.test.ts`
Expected: PASS.

- [ ] **Step 4: Scaffold the page, and check the scaffold's source list**

```bash
npm run build -w @pbiplint/core && node scripts/generate-rule-pages.mjs
sed -n 1,12p rules/local-drive-path.md
```

Expected: `wrote 1 rule page(s)`, and front matter with `status: builtin`, `layer: powerquery`, and `sources:` followed directly by `---` (no ruleset link). This is the check that the scaffold already branches on a built-in rule (see "Where this plan reads the spec narrowly"). If a ruleset link appears, stop and report.

- [ ] **Step 5: Write the page**

Replace `rules/local-drive-path.md` with:

````markdown
---
id: LOCAL_DRIVE_PATH
name: "Path on a local drive"
category: Error Prevention
severity: warning
scope: [Partition, NamedExpression, Table]
status: builtin
layer: powerquery
video:
sources:
---

# Path on a local drive

## What it checks

Text in a Power Query query or parameter that starts with a path on a drive letter, such as `C:\Demo\Data\Sales.csv` or `D:/Exports/`.

Each finding names the partition, the shared expression, or, for an incremental refresh policy's own query, the table. Its detail names the query and the step as Power Query's editor shows them, then the drive, as `query 'Sales', step 'Source': the path is on a local drive (C:)`. The rest of the path is left out, since a folder under `C:\Users\` carries an account name. The location is the line and column of the text in the TMDL file.

## Example

```tmdl fires
table Sales
	column Amount
		dataType: decimal
		summarizeBy: sum
		sourceColumn: Amount

	partition Sales = m
		mode: import
		source =
				let
					Source = Csv.Document(File.Contents("C:\Demo\Data\Sales.csv"), [Delimiter = ",", Encoding = 65001]),
					#"Promoted Headers" = Table.PromoteHeaders(Source, [PromoteAllScalars = true])
				in
					#"Promoted Headers"
```

```tmdl fixed
table Sales
	column Amount
		dataType: decimal
		summarizeBy: sum
		sourceColumn: Amount

	partition Sales = m
		mode: import
		source =
				let
					Source = Csv.Document(Web.Contents("https://example.sharepoint.com/sites/finance/Shared%20Documents/Sales.csv"), [Delimiter = ",", Encoding = 65001]),
					#"Promoted Headers" = Table.PromoteHeaders(Source, [PromoteAllScalars = true])
				in
					#"Promoted Headers"
```

## Why it matters

Once the model is published, refresh runs in the Power BI service, which cannot see a drive on the machine that built the report. Microsoft states the rule plainly: "If your semantic model uses a data source that Power BI can't access over a direct network connection, you must configure a gateway connection for this semantic model before you can enable a refresh schedule or perform an on-demand data refresh" ([Connecting to on-premises data sources](https://learn.microsoft.com/power-bi/connect-data/refresh-data#connecting-to-on-premises-data-sources)). A file on `C:` is such a source, and for it "A gateway must be installed and running for Power BI to connect to on-premises data sources and refresh the semantic model" ([Refresh semantic models created from local Power BI Desktop files](https://learn.microsoft.com/power-bi/connect-data/refresh-desktop-file-local-drive#on-premises-data-gateway)). Without a gateway on that machine the scheduled refresh fails, and the report goes on showing the data it was published with. The path also ties the model to one person's folders: a colleague who opens the project on another machine gets an error on every query that reads it.

## How to fix it

In Power BI Desktop, choose Transform data, select the query, and select the step the finding names in Applied steps. Put the file in SharePoint or OneDrive for work or school and connect to it there: Get data, then SharePoint folder for a folder of files, or Web with the file's address for one file. Point the query's Source step at the new connection, so the steps after it carry on as before. If the file has to stay where it is, keep the path and refresh through a gateway installed on that machine. Either way, keep the folder in a parameter (Home, Manage Parameters) and build each path from it, so a move changes one value; as Microsoft puts it, "Parameters make queries easier to update because you can change a value in one location instead of editing each query that uses it" ([Use parameters](https://learn.microsoft.com/power-query/best-practices#use-parameters)). A parameter that still holds a local path is still a finding, on the parameter. In the TMDL file, the text is in the partition's `source` block, or in the expression's value for a parameter.

## When to ignore it

A model that is never published needs no refresh in the service, and one refreshed through a gateway on the machine that holds the files can keep its paths; the finding then says only that refresh depends on that machine staying on. Network paths such as `\\fileserver\share\Sales.csv` are not reported, since a gateway in the organization is the usual route for them. For those, Microsoft adds: "When connecting to an Excel workbook on a network share, use the fully qualified domain name (FQDN) path (for example, `\\ServerName.domain.com\FolderName\File.xlsx`) instead of a short server name. Using a short name can cause refresh failures after publishing to the Power BI service." ([Excel connector, Limitations and considerations](https://learn.microsoft.com/power-query/connectors/excel#limitations-and-considerations)). pbiplint does not check that.

## Quirks

- Only text written out in a query is read. A path joined at refresh time, such as `DataFolder & "Sales.csv"`, is reported where its drive letter is written, on the `DataFolder` parameter, and not on the query that joins it.
- A path in a comment is not read, and neither is a `file:` address or a web address.
- Each piece of text is its own finding, so a query that reads three files from `C:` has three.
- Text that starts with a drive path is reported wherever it stands, including where a step compares it rather than reads it, such as a filter on a folder's `Folder Path` column. Moving the files changes that text too.
- A query whose M does not parse is not read; it gets a `PARSE_ISSUE` finding instead.

## Related rules

- `MINIMIZE_POWER_QUERY_TRANSFORMATIONS` reads the same queries; a file source has no upstream to move its steps to, which that rule's page names as a reason to leave its finding.

## Links

- [What is an on-premises data gateway?](https://learn.microsoft.com/power-bi/connect-data/service-gateway-onprem)
- [SharePoint folder connector](https://learn.microsoft.com/power-query/connectors/sharepoint-folder)
````

Task 3 adds a `SCRIPT_IN_QUERY` line under Related rules, once that rule exists.

- [ ] **Step 6: Regenerate the data files and run the page's tests**

```bash
npm run build -w @pbiplint/core && node scripts/sync-rule-pages.mjs
npx vitest run packages/core/test/rule-pages.test.ts -t "LOCAL_DRIVE_PATH"
```

Expected: PASS, including "shows an example the engine flags and a fix it accepts" and "is the source of the rule's description in tool output".

- [ ] **Step 7: Pin the rule's findings on m-zoo**

In `tests/expectations/pbiplint/m-zoo.json`, `"rules": []` becomes `"rules": ["LOCAL_DRIVE_PATH"]`, and `"findings": []` becomes:

```json
  "findings": [
    { "rule": "LOCAL_DRIVE_PATH", "objectType": "NamedExpression", "object": "DataFolder", "file": "definition/expressions.tmdl", "line": 18, "column": 25, "detail": "query 'DataFolder': the path is on a local drive (C:)" },
    { "rule": "LOCAL_DRIVE_PATH", "objectType": "NamedExpression", "object": "ExportFolder", "file": "definition/expressions.tmdl", "line": 21, "column": 27, "detail": "query 'ExportFolder': the path is on a local drive (D:)" },
    { "rule": "LOCAL_DRIVE_PATH", "objectType": "Partition", "object": "Budget", "file": "definition/tables/Budget.tmdl", "line": 15, "column": 51, "detail": "query 'Budget', step 'ReaderHeaders': the path is on a local drive (C:)" },
    { "rule": "LOCAL_DRIVE_PATH", "objectType": "Partition", "object": "Budget", "file": "definition/tables/Budget.tmdl", "line": 16, "column": 51, "detail": "query 'Budget', step 'OptionHeaders': the path is on a local drive (C:)" },
    { "rule": "LOCAL_DRIVE_PATH", "objectType": "Partition", "object": "Budget", "file": "definition/tables/Budget.tmdl", "line": 17, "column": 45, "detail": "query 'Budget', step 'Desktop': the path is on a local drive (C:)" },
    { "rule": "LOCAL_DRIVE_PATH", "objectType": "Partition", "object": "Budget", "file": "definition/tables/Budget.tmdl", "line": 18, "column": 44, "detail": "query 'Budget', step 'Legacy': the path is on a local drive (C:)" },
    { "rule": "LOCAL_DRIVE_PATH", "objectType": "Partition", "object": "Customers Latest", "file": "definition/tables/Customers Latest.tmdl", "line": 14, "column": 42, "detail": "query 'Customers Latest', step 'Source': the path is on a local drive (C:)" },
    { "rule": "LOCAL_DRIVE_PATH", "objectType": "Partition", "object": "Local Paths", "file": "definition/tables/Local Paths.tmdl", "line": 15, "column": 28, "detail": "query 'Local Paths', step 'Local': the path is on a local drive (C:)" },
    { "rule": "LOCAL_DRIVE_PATH", "objectType": "Partition", "object": "Orders Files", "file": "definition/tables/Orders Files.tmdl", "line": 15, "column": 16, "detail": "query 'Orders Files', step 'Archive': the path is on a local drive (C:)" },
    { "rule": "LOCAL_DRIVE_PATH", "objectType": "Partition", "object": "Sales Files", "file": "definition/tables/Sales Files.tmdl", "line": 14, "column": 28, "detail": "query 'Sales Files', step 'Source': the path is on a local drive (C:)" }
  ]
```

These are spec 9.6's fixture shapes, all already in m-zoo: the `C:\Demo\Data\` file paths fire, `ExportFolder`'s `"D:/Exports/"` fires once on the parameter, and `Local Paths`' network path and comment do not. No fixture change, and so no Tabular Editor capture, is needed: m-zoo's captures hold no built-in Power Query rule.

Run: `npx vitest run packages/core/test/rules-m.test.ts`
Expected: PASS. If a finding differs, stop: compare it with the fixture line before changing the file, and report it.

- [ ] **Step 8: The report fixtures' native maps, and the sample's planted rules**

`report-parity.test.ts` holds every built-in rule's findings on each report fixture to the `native` map in its `.report.json`. Add `LOCAL_DRIVE_PATH` as the last key of each `native` map (after the map's current last entry, keeping the file's two-space indents):

- `tests/expectations/messy-sales.report.json`, after `DECIMAL_COLUMN_WITHOUT_FORMAT_STRING`:

```json
    "LOCAL_DRIVE_PATH": [
      "Customer",
      "Date",
      "Employee",
      "Product",
      "Promotion",
      "Sales",
      "Store"
    ]
```

- `tests/expectations/pbip-and-github-demo.report.json`, after `HARDCODED_YEAR_IN_FILTER`:

```json
    "LOCAL_DRIVE_PATH": [
      "Customer",
      "Date",
      "Product",
      "Sales",
      "User Region"
    ]
```

- `tests/expectations/shelfmart.report.json`, after `DECIMAL_COLUMN_WITHOUT_FORMAT_STRING` (two shared expressions and one table hold two paths each; the second of each is a `Folder Path` compared in a filter, a fair finding by the page's Quirks):

```json
    "LOCAL_DRIVE_PATH": [
      "Average High Temperature Summary",
      "Average Revenue per Visit",
      "Average Revenue per Visit Forecast 2024",
      "Foot Traffic",
      "Foot Traffic Forecast 2024",
      "Sample File",
      "Sample File",
      "Store",
      "Weather Data",
      "Weather Data"
    ]
```

The sample's check ("fires every native rule outside the model layer") would now ask the sample to fire every built-in Power Query rule, and the sample is not where they are planted: m-zoo is. In `packages/core/test/report-parity.test.ts`, the doc comment above `describe("the sample", ...)` gains the sentence "pbiplint's own Power Query rules are planted in m-zoo, and `rules-m.test.ts` pins them there.", the test's name becomes `"fires every native report and project rule and every ported report rule"`, and its loop becomes:

```ts
    for (const r of native.filter((r) => r.layer === "report" || r.layer === "project"))
      expect(sample!.native[r.id]?.length, r.id).toBeGreaterThan(0);
```

Run: `npx vitest run packages/core/test/report-parity.test.ts`
Expected: PASS.

- [ ] **Step 9: Move the sample's count**

The sample reads its seven CSV files from `C:\Demo\Data\`, so it gains seven warnings (spec 9.6): 266 findings (19 errors, 77 warnings, 170 info) become **273 findings (19 errors, 84 warnings, 170 info)**. Change every pin:

- `packages/web/test/sample.test.ts:131-133`: `266, 19, 77, 170,` becomes `273, 19, 84, 170,`.
- `packages/web/test/home.test.ts:76` and `:160`: `"266 findings"` becomes `"273 findings"`; `:96`: `266 findings (19 errors, 77 warnings, 170 info)` becomes `273 findings (19 errors, 84 warnings, 170 info)`.
- `packages/web/test/render.test.ts:66`: the same two numbers.
- `packages/web/test/export.test.ts:41`: `toBe(266)` becomes `toBe(273)`.
- `packages/web/e2e/home.spec.ts:66`, `:69`, `:491`, `:541`: 266 becomes 273, and 77 warnings becomes 84.
- `packages/cli/test/cli.test.ts:101`, `:179`, `:219`, `:581`: the same.
- `packages/cli/test/contract.test.ts:73`: 266 becomes 273.
- `packages/core/README.md:41`: `"3 of 266 findings shown, 1 rule ..."` becomes `"3 of 273 findings shown, 1 rule ..."`.

Then run `git grep -n "266 findings\|77 warnings\|toBe(266)\|266, 19" -- packages`. Expected: no output.

- [ ] **Step 10: Show the sample's Power Query group in the browser**

Pull request 3 left this to pull request 4, since the sample had no Power Query group before `LOCAL_DRIVE_PATH` (spec 11.7). In `packages/web/e2e/home.spec.ts`, the test "lints the sample project and announces the result" ends with the Report uncheck. Add after its last line:

```ts
  // The sample reads its CSV files from C:\Demo\Data\, so it has a Power Query group (v3 spec,
  // sections 9.6 and 11.7): a finding's column, its query, and its step show, and the Power Query
  // box hides only that family.
  await results.getByRole("checkbox", { name: "Report", exact: true }).check();
  const powerQuery = results.getByRole("checkbox", { name: "Power Query", exact: true });
  await expect(powerQuery).toBeChecked();
  const local = page.locator("#rule-local-drive-path");
  await local.locator("summary").click();
  await expect(local).toContainText("definition/tables/Customer.tmdl:105:45");
  await expect(local).toContainText(
    "query 'Customer', step 'Source': the path is on a local drive (C:)",
  );
  await powerQuery.uncheck();
  await expect(results.locator('.group[data-layer="powerquery"]:not([hidden])')).toHaveCount(0);
  await expect(results.locator('.group[data-layer="model"]').first()).toBeVisible();
  await expect(results.locator('.group[data-layer="report"]').first()).toBeVisible();
```

- [ ] **Step 11: Run what this task touches**

```bash
npx vitest run packages/core/test packages/web/test packages/cli/test
npm run typecheck
npm run build -w @pbiplint/web
npx playwright test -c packages/web/playwright.config.ts packages/web/e2e/home.spec.ts
```

Expected: PASS, except `pack.test.ts` ("has unique slugs across the default rule set": 107, not 106) and `generate.test.ts`'s rule counts (107 pages, "25 built into pbiplint"), which Task 7 moves. Any other failure stops the task.

- [ ] **Step 12: Commit**

```bash
npx prettier --write packages/core/src/rules/pbiplint/power-query.ts packages/core/test/rules-power-query.test.ts packages/core/test/report-parity.test.ts packages/core/src/rules/rule-summaries.data.ts packages/cli/src/rule-help.data.ts packages/web/src/results/rule-guidance.data.ts packages/web/test/sample.test.ts packages/web/test/home.test.ts packages/web/test/render.test.ts packages/web/test/export.test.ts packages/web/e2e/home.spec.ts packages/cli/test/cli.test.ts packages/cli/test/contract.test.ts
npm run lint
git add packages rules/local-drive-path.md tests/expectations
git commit -m "feat: LOCAL_DRIVE_PATH reports a path on a local drive

Any text in a query or a parameter that starts with a drive path is a
warning at its own line and column, naming only the drive. The sample
reads its CSV files from C:\\Demo\\Data\\, so it gains seven warnings and
shows a Power Query group.

Part of #78.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: `SCRIPT_IN_QUERY` and its page

**Files:**
- Modify: `packages/core/src/rules/pbiplint/power-query.ts`
- Create: `rules/script-in-query.md`
- Modify: `rules/local-drive-path.md` (Related rules)
- Modify (generated): the three `.data.ts` files
- Modify: `tests/expectations/pbiplint/m-zoo.json`
- Test: `packages/core/test/rules-power-query.test.ts`

**Interfaces:**
- Consumes: `calls` (`m/ast.ts`, `MCall { name, args, node }`), `mFinding`, `pbiplintRule`.
- Produces: `export const SCRIPT_IN_QUERY: Rule`, in `powerQueryRules` after `LOCAL_DRIVE_PATH`.

- [ ] **Step 1: Write the failing tests**

In `packages/core/test/rules-power-query.test.ts`, the rule import becomes `import { LOCAL_DRIVE_PATH, SCRIPT_IN_QUERY } from "../src/rules/pbiplint/power-query.js";`, and add at the end:

```ts
describe("SCRIPT_IN_QUERY (v3 spec, section 9.9)", () => {
  const rule = SCRIPT_IN_QUERY;
  it("is a built-in Power Query warning on a query's owner", () => {
    isPowerQueryRule(rule, 2, "Error Prevention");
    expect(rule.name).toBe("Python or R script in a query");
    expect(rule.scope).toEqual(["Partition", "NamedExpression", "Table"]);
  });
  it("reports each Python and R script call at its step, naming the language", async () => {
    const tmdl = table(
      "Scores",
      "let",
      '\tSource = #table({"Score"}, {{1}}),',
      '\t#"Run Python script" = Python.Execute("dataset[\'Score\'] = dataset[\'Score\'] * 2", [dataset = Source]),',
      '\t#"Run R script" = R.Execute("output <- dataset", [dataset = Source])',
      "in",
      '\t#"Run R script"',
    );
    expect(await mFindings(rule, tmdl)).toEqual([
      {
        objectType: "Partition",
        objectName: "Scores",
        location: { file: "inline.tmdl", line: 7, column: 29 },
        detail:
          "query 'Scores', step 'Run Python script': Python.Execute refreshes only through a personal gateway on a machine with Python installed",
      },
      {
        objectType: "Partition",
        objectName: "Scores",
        location: { file: "inline.tmdl", line: 8, column: 24 },
        detail:
          "query 'Scores', step 'Run R script': R.Execute refreshes only through a personal gateway on a machine with R installed",
      },
    ]);
  });
  it("leaves alone a script function passed as a value, and its name in text", async () => {
    const tmdl = table(
      "Scores",
      "let",
      "\tRun = List.Transform({}, Python.Execute),",
      '\tText = "Python.Execute(x)"',
      "in",
      "\tText",
    );
    expect(await mFindings(rule, tmdl)).toEqual([]);
  });
});
```

- [ ] **Step 2: Run them to make sure they fail**

Run: `npx vitest run packages/core/test/rules-power-query.test.ts -t SCRIPT_IN_QUERY`
Expected: FAIL: `SCRIPT_IN_QUERY` is not exported.

- [ ] **Step 3: Write the rule**

In `packages/core/src/rules/pbiplint/power-query.ts`, the `m/ast.js` import becomes `import { calls, textLiterals } from "../../m/ast.js";`. Add after `LOCAL_DRIVE_PATH`:

```ts
/** The script functions, and the language each one runs. */
const SCRIPT_LANGUAGE: ReadonlyMap<string, string> = new Map([
  ["Python.Execute", "Python"],
  ["R.Execute", "R"],
]);

// A call, as the Run Python script and Run R script steps write it (v3 spec, section 9.9). Python
// and R visuals live in the report, not in M, and are not read.
export const SCRIPT_IN_QUERY = pbiplintRule({
  id: "SCRIPT_IN_QUERY",
  name: "Python or R script in a query",
  category: "Error Prevention",
  severity: 2,
  scope: ["Partition", "NamedExpression", "Table"],
  layer: "powerquery",
  check: (_project, { indexes: { m } }) =>
    m.queries.flatMap((q) =>
      calls(q).flatMap((c) => {
        const language = SCRIPT_LANGUAGE.get(c.name);
        return language
          ? [
              mFinding(
                m,
                q,
                c.node,
                `${c.name} refreshes only through a personal gateway on a machine with ${language} installed`,
              ),
            ]
          : [];
      }),
    ),
});
```

and `powerQueryRules` becomes `[LOCAL_DRIVE_PATH, SCRIPT_IN_QUERY]`.

Run: `npx vitest run packages/core/test/rules-power-query.test.ts`
Expected: PASS.

- [ ] **Step 4: Write the page**

Create `rules/script-in-query.md`:

````markdown
---
id: SCRIPT_IN_QUERY
name: "Python or R script in a query"
category: Error Prevention
severity: warning
scope: [Partition, NamedExpression, Table]
status: builtin
layer: powerquery
video:
sources:
---

# Python or R script in a query

## What it checks

Power Query queries that run a Python or R script: a `Python.Execute` or `R.Execute` call, which the Run Python script and Run R script steps write.

Each finding names the partition, the shared expression, or, for an incremental refresh policy's own query, the table. Its detail names the query, the step, and the function, as `query 'Scores', step 'Run Python script': Python.Execute refreshes only through a personal gateway on a machine with Python installed`. The location is the line and column of the call in the TMDL file.

## Example

```tmdl fires
table Scores
	column Score
		dataType: double
		summarizeBy: none
		sourceColumn: Score

	partition Scores = m
		mode: import
		source =
				let
					Source = #table(type table [Score = number], {{1}, {2}}),
					#"Run Python script" = Python.Execute("dataset['Score'] = dataset['Score'] * 2", [dataset = Source]),
					Scores = #"Run Python script"{[Name = "dataset"]}[Value]
				in
					Scores
```

```tmdl fixed
table Scores
	column Score
		dataType: double
		summarizeBy: none
		sourceColumn: Score

	partition Scores = m
		mode: import
		source =
				let
					Source = #table(type table [Score = number], {{1}, {2}}),
					#"Doubled Score" = Table.TransformColumns(Source, {{"Score", each _ * 2, type number}})
				in
					#"Doubled Score"
```

## Why it matters

A script step runs on the machine that refreshes the model, so that machine needs Python or R and every package the script imports. The service has neither, and the gateways most organizations run cannot take its place: "You can't use an enterprise gateway to refresh semantic models containing R scripts in Power Query" ([Use R in Power Query Editor, Considerations and limitations](https://learn.microsoft.com/power-bi/transform-model/desktop-r-in-query-editor#considerations-and-limitations)), and for Python, "You need a Personal Gateway installed on the machine where the file is located, and where Python is installed" ([Use Python in Power BI Power Query Editor, Create visuals from Python script data](https://learn.microsoft.com/power-bi/transform-model/desktop-python-in-query-editor#create-visuals-from-python-script-data)). A personal gateway belongs to one person on one machine. When that machine is off, asleep, or missing a package after an update, the refresh fails, and nobody else can fix it from the service.

## How to fix it

In Power BI Desktop, choose Transform data, select the query, and find the Run Python script or Run R script step in Applied steps. Move what the script does upstream, into a view in the database or a notebook in Fabric that writes a table the query reads, or rebuild it with Power Query's own steps: most column arithmetic is Add Column or Transform, and most reshaping is Group By, Pivot Column, or Unpivot Columns. Then right-click the script step and choose Delete. Where the script has to stay, say so plainly to whoever owns the refresh: it then depends on a [personal gateway](https://learn.microsoft.com/power-bi/connect-data/service-gateway-personal-mode) on one machine with the same Python or R and the same packages. In the TMDL file, the step is a line of the partition's `source` block.

## When to ignore it

A model refreshed only in Power BI Desktop, such as a prototype or a personal analysis, never meets the gateway limit, so the finding is noise there. A team that has chosen a personal gateway on a managed machine, knows who owns it, and accepts that refresh stops when it does can leave the script; the finding then records the dependency. Python and R visuals are not reported: they live in the report and do not affect refresh.

## Quirks

- Only a call is read. `Python.Execute` passed as a function value, or named inside text, is not reported.
- Each call is its own finding, so a query with a Python step and an R step has two.
- A query whose M does not parse is not read; it gets a `PARSE_ISSUE` finding instead.

## Related rules

- `LOCAL_DRIVE_PATH` reports a file on a local drive, the other source that refreshes only through a gateway on one machine.

## Links

- [Run Python scripts in Power BI Desktop](https://learn.microsoft.com/power-bi/connect-data/desktop-python-scripts)
- [Run R scripts in Power BI Desktop](https://learn.microsoft.com/power-bi/connect-data/desktop-r-scripts)
````

In `rules/local-drive-path.md`, add under Related rules, after the existing bullet:

```markdown
- `SCRIPT_IN_QUERY` reports Python and R scripts, which also refresh only through a gateway on one machine.
```

- [ ] **Step 5: Regenerate and run the page's tests**

```bash
npm run build -w @pbiplint/core && node scripts/sync-rule-pages.mjs
npx vitest run packages/core/test/rule-pages.test.ts -t "SCRIPT_IN_QUERY|LOCAL_DRIVE_PATH"
```

Expected: PASS.

- [ ] **Step 6: Pin the rule's findings on m-zoo**

In `tests/expectations/pbiplint/m-zoo.json`, `"rules"` becomes `["LOCAL_DRIVE_PATH", "SCRIPT_IN_QUERY"]`, and these two entries go after the `Sales Files` entry (the last, in place order):

```json
    { "rule": "SCRIPT_IN_QUERY", "objectType": "Partition", "object": "Scores", "file": "definition/tables/Scores.tmdl", "line": 16, "column": 29, "detail": "query 'Scores', step 'Run Python script': Python.Execute refreshes only through a personal gateway on a machine with Python installed" },
    { "rule": "SCRIPT_IN_QUERY", "objectType": "Partition", "object": "Scores", "file": "definition/tables/Scores.tmdl", "line": 17, "column": 24, "detail": "query 'Scores', step 'Run R script': R.Execute refreshes only through a personal gateway on a machine with R installed" }
```

(Remember the comma after the `Sales Files` entry.) These are spec 9.9's two fixture shapes, both in m-zoo's `Scores` table. No other fixture with M calls either function.

Run: `npx vitest run packages/core/test/rules-m.test.ts packages/core/test/report-parity.test.ts`
Expected: PASS.

- [ ] **Step 7: Commit**

Run what this task touches:

```bash
npx vitest run packages/core/test packages/web/test packages/cli/test
npm run typecheck
```

Expected: PASS, except the rule counts in `pack.test.ts` and `generate.test.ts`, which Task 7 moves (108 rules, "26 built into pbiplint"). Any other failure stops the task. Then:

```bash
npx prettier --write packages/core/src/rules/pbiplint/power-query.ts packages/core/test/rules-power-query.test.ts packages/core/src/rules/rule-summaries.data.ts packages/cli/src/rule-help.data.ts packages/web/src/results/rule-guidance.data.ts
npm run lint
git add packages rules/script-in-query.md rules/local-drive-path.md tests/expectations/pbiplint/m-zoo.json
git commit -m "feat: SCRIPT_IN_QUERY reports a Python or R script step

Each Python.Execute or R.Execute call is a warning at its step: refresh
then needs a personal gateway on a machine with the language installed.

Part of #78.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: `EXCEL_USE_HEADERS` and its page

**Files:**
- Modify: `packages/core/src/rules/pbiplint/power-query.ts`
- Create: `rules/excel-use-headers.md`
- Modify (generated): the three `.data.ts` files
- Modify: `tests/expectations/pbiplint/m-zoo.json`
- Test: `packages/core/test/rules-power-query.test.ts`

**Interfaces:**
- Consumes: `calls`, `identifierName`, `unwrap` (`m/ast.ts`), `mFinding`, `pbiplintRule`.
- Produces: `export const EXCEL_USE_HEADERS: Rule`, in `powerQueryRules` after `SCRIPT_IN_QUERY`.

- [ ] **Step 1: Write the failing tests**

In `packages/core/test/rules-power-query.test.ts`, add `EXCEL_USE_HEADERS` to the rule import, and add at the end:

```ts
describe("EXCEL_USE_HEADERS (v3 spec, section 9.12)", () => {
  const rule = EXCEL_USE_HEADERS;
  const book = 'Web.Contents("https://example.com/Budget.xlsx")';
  it("is a built-in Power Query info rule on a query's owner", () => {
    isPowerQueryRule(rule, 1, "Error Prevention");
    expect(rule.name).toBe("Excel headers promoted by the workbook reader");
    expect(rule.scope).toEqual(["Partition", "NamedExpression", "Table"]);
  });
  it("reports useHeaders set to true, as an argument or in the options record, and nothing else", async () => {
    const tmdl = table(
      "Budget",
      "let",
      `\tReader = Excel.Workbook(${book}, true),`,
      `\tOption = Excel.Workbook(${book}, [UseHeaders = true]),`,
      `\tDesktop = Excel.Workbook(${book}, null, true),`,
      `\tOff = Excel.Workbook(${book}, false),`,
      `\tDelay = Excel.Workbook(${book}, [DelayTypes = true]),`,
      `\tBare = Excel.Workbook(${book})`,
      "in",
      "\tBare",
    );
    const what = "Excel.Workbook promotes headers in the refreshing machine's culture";
    expect(await mFindings(rule, tmdl)).toEqual([
      {
        objectType: "Partition",
        objectName: "Budget",
        location: { file: "inline.tmdl", line: 6, column: 15 },
        detail: `query 'Budget', step 'Reader': ${what}`,
      },
      {
        objectType: "Partition",
        objectName: "Budget",
        location: { file: "inline.tmdl", line: 7, column: 15 },
        detail: `query 'Budget', step 'Option': ${what}`,
      },
    ]);
  });
  it("reads true in parentheses, and leaves alone a value it would have to follow", async () => {
    const tmdl = table(
      "Budget",
      "let",
      "\tHeaders = true,",
      `\tWrapped = Excel.Workbook(${book}, (true)),`,
      `\tNamed = Excel.Workbook(${book}, Headers)`,
      "in",
      "\tNamed",
    );
    expect((await mFindings(rule, tmdl)).map((f) => f.detail)).toEqual([
      "query 'Budget', step 'Wrapped': Excel.Workbook promotes headers in the refreshing machine's culture",
    ]);
  });
});
```

- [ ] **Step 2: Run them to make sure they fail**

Run: `npx vitest run packages/core/test/rules-power-query.test.ts -t EXCEL_USE_HEADERS`
Expected: FAIL: `EXCEL_USE_HEADERS` is not exported.

- [ ] **Step 3: Write the rule**

In `packages/core/src/rules/pbiplint/power-query.ts`, add `import { Language } from "@microsoft/powerquery-parser";` as the first import, the `m/ast.js` import becomes `import { calls, identifierName, textLiterals, unwrap } from "../../m/ast.js";`, and add below the imports:

```ts
type Node = Language.Ast.TNode;
const Kind = Language.Ast.NodeKind;
```

Add after `SCRIPT_IN_QUERY`:

```ts
/** `true` as M writes it, with any parentheses or `meta` taken off. */
function isTrue(node: Node | undefined): boolean {
  const n = node && unwrap(node);
  return (
    n?.kind === Kind.LiteralExpression &&
    n.literalKind === Language.Ast.LiteralKind.Logical &&
    n.literal === "true"
  );
}

/** Excel.Workbook's second argument when it asks for headers: `true`, or a record written in the call with `UseHeaders = true`. */
function promotesHeaders(arg: Node | undefined): boolean {
  if (arg === undefined) return false;
  const a = unwrap(arg);
  if (isTrue(a)) return true;
  if (a.kind !== Kind.RecordExpression && a.kind !== Kind.RecordLiteral) return false;
  return a.content.elements.some(
    (csv) => identifierName(csv.node.key.literal) === "UseHeaders" && isTrue(csv.node.value),
  );
}

// Desktop's own call, Excel.Workbook(File.Contents(...), null, true), leaves useHeaders unset and
// sets delayTypes, and is left alone (v3 spec, section 9.12). Only a value written in the call is
// read.
export const EXCEL_USE_HEADERS = pbiplintRule({
  id: "EXCEL_USE_HEADERS",
  name: "Excel headers promoted by the workbook reader",
  category: "Error Prevention",
  severity: 1,
  scope: ["Partition", "NamedExpression", "Table"],
  layer: "powerquery",
  check: (_project, { indexes: { m } }) =>
    m.queries.flatMap((q) =>
      calls(q)
        .filter((c) => c.name === "Excel.Workbook" && promotesHeaders(c.args[1]))
        .map((c) =>
          mFinding(m, q, c.node, "Excel.Workbook promotes headers in the refreshing machine's culture"),
        ),
    ),
});
```

and `powerQueryRules` becomes `[LOCAL_DRIVE_PATH, SCRIPT_IN_QUERY, EXCEL_USE_HEADERS]`. If TypeScript does not narrow `a.content.elements` across the two record kinds, write the check as `isModelParameter` in `packages/core/src/m/resolve.ts:22-33` does (a `.find` over the same union), which compiles.

Run: `npx vitest run packages/core/test/rules-power-query.test.ts`
Expected: PASS.

- [ ] **Step 4: Write the page**

Create `rules/excel-use-headers.md`:

````markdown
---
id: EXCEL_USE_HEADERS
name: "Excel headers promoted by the workbook reader"
category: Error Prevention
severity: info
scope: [Partition, NamedExpression, Table]
status: builtin
layer: powerquery
video:
sources:
---

# Excel headers promoted by the workbook reader

## What it checks

Excel.Workbook calls that ask the workbook reader to promote headers: `true` as the second argument, or `UseHeaders = true` in its options record.

Each finding names the partition, the shared expression, or, for an incremental refresh policy's own query, the table. Its detail names the query and the step, as `query 'Budget', step 'Source': Excel.Workbook promotes headers in the refreshing machine's culture`. The location is the line and column of the call in the TMDL file.

## Example

```tmdl fires
table Budget
	column Amount
		dataType: double
		summarizeBy: sum
		sourceColumn: Amount

	partition Budget = m
		mode: import
		source =
				let
					Source = Excel.Workbook(Web.Contents("https://example.sharepoint.com/sites/finance/Shared%20Documents/Budget.xlsx"), true),
					Budget = Source{[Item = "Budget", Kind = "Sheet"]}[Data]
				in
					Budget
```

```tmdl fixed
table Budget
	column Amount
		dataType: double
		summarizeBy: sum
		sourceColumn: Amount

	partition Budget = m
		mode: import
		source =
				let
					Source = Excel.Workbook(Web.Contents("https://example.sharepoint.com/sites/finance/Shared%20Documents/Budget.xlsx"), null, true),
					Budget = Source{[Item = "Budget", Kind = "Sheet"]}[Data],
					#"Promoted Headers" = Table.PromoteHeaders(Budget, [PromoteAllScalars = true])
				in
					#"Promoted Headers"
```

## Why it matters

When the workbook reader promotes headers, a header cell that holds a number or a date becomes a column name written in the culture of whatever machine runs the refresh. Microsoft's connector page warns about exactly this: "The Excel.Workbook `useHeaders` option converts numbers and dates to text using the current culture, and thus behaves differently when run in environments with different operating system cultures set. We recommend using Table.PromoteHeaders instead." ([Excel connector, Limitations and considerations](https://learn.microsoft.com/power-query/connectors/excel#limitations-and-considerations)). A month column headed with the date January 31, 2025 can be named `1/31/2025` on the laptop that built the report and `31/01/2025` on a gateway set to another culture, and every later step that names the column by its text then fails to find it.

## How to fix it

In Power BI Desktop, choose Transform data, select the query, and select its Source step in Applied steps. In the formula bar, change Excel.Workbook's second argument to `null`, which leaves headers to a later step. Then select the step that picks the sheet or table and choose Home, Use First Row as Headers, which writes Table.PromoteHeaders. Check that the steps after it still find their columns. In the TMDL file, the call is in the partition's `source` block.

## When to ignore it

When every header in the sheet is plain text, there is nothing for the culture to change, and the finding is a note about style rather than a risk. It is still worth fixing when the sheet is edited by hand, since one person typing a date or a number into a header row is enough to bring the problem back.

## Quirks

- Power BI Desktop's own call, `Excel.Workbook(File.Contents(...), null, true)`, is left alone: it leaves `useHeaders` unset and sets `delayTypes`.
- Only a value written in the call counts: `true`, `(true)`, or a record with `UseHeaders = true`. A value held by a step or a parameter is not followed.
- Each call is its own finding.
- A query whose M does not parse is not read; it gets a `PARSE_ISSUE` finding instead.

## Related rules

- `LOCAL_DRIVE_PATH` reports the workbook's path when it is on a local drive, as a workbook read with File.Contents often is.

## Links

- [Excel connector](https://learn.microsoft.com/power-query/connectors/excel)
- [Promote or demote column headers](https://learn.microsoft.com/power-query/table-promote-demote-headers)
````

- [ ] **Step 5: Regenerate and run the page's tests**

```bash
npm run build -w @pbiplint/core && node scripts/sync-rule-pages.mjs
npx vitest run packages/core/test/rule-pages.test.ts -t "EXCEL_USE_HEADERS"
```

Expected: PASS.

- [ ] **Step 6: Pin the rule's findings on m-zoo**

In `tests/expectations/pbiplint/m-zoo.json`, `"rules"` becomes `["EXCEL_USE_HEADERS", "LOCAL_DRIVE_PATH", "SCRIPT_IN_QUERY"]`. Insert the first entry directly before the `Budget.tmdl` line 15 `LOCAL_DRIVE_PATH` entry, and the second directly before the line 16 one (column 22 comes before column 51 on the same line):

```json
    { "rule": "EXCEL_USE_HEADERS", "objectType": "Partition", "object": "Budget", "file": "definition/tables/Budget.tmdl", "line": 15, "column": 22, "detail": "query 'Budget', step 'ReaderHeaders': Excel.Workbook promotes headers in the refreshing machine's culture" },
```

```json
    { "rule": "EXCEL_USE_HEADERS", "objectType": "Partition", "object": "Budget", "file": "definition/tables/Budget.tmdl", "line": 16, "column": 22, "detail": "query 'Budget', step 'OptionHeaders': Excel.Workbook promotes headers in the refreshing machine's culture" },
```

These are spec 9.12's fixture shapes in m-zoo's `Budget` table: `ReaderHeaders` and `OptionHeaders` fire, and Desktop's `null, true` (`Desktop`, `Legacy`) does not. Shelfmart's three `Excel.Workbook(..., null, true)` calls stay silent too (the native maps of Task 2 have no entry for this rule).

Run: `npx vitest run packages/core/test/rules-m.test.ts packages/core/test/report-parity.test.ts`
Expected: PASS.

- [ ] **Step 7: Commit**

Run what this task touches:

```bash
npx vitest run packages/core/test packages/web/test packages/cli/test
npm run typecheck
```

Expected: PASS, except the rule counts in `pack.test.ts` and `generate.test.ts`, which Task 7 moves (109 rules, "27 built into pbiplint"). Any other failure stops the task. Then:

```bash
npx prettier --write packages/core/src/rules/pbiplint/power-query.ts packages/core/test/rules-power-query.test.ts packages/core/src/rules/rule-summaries.data.ts packages/cli/src/rule-help.data.ts packages/web/src/results/rule-guidance.data.ts
npm run lint
git add packages rules/excel-use-headers.md tests/expectations/pbiplint/m-zoo.json
git commit -m "feat: EXCEL_USE_HEADERS reports headers promoted by the workbook reader

Excel.Workbook with useHeaders set to true, as its second argument or in
its options record, is an info finding: the headers follow the
refreshing machine's culture. Desktop's own null, true call is left alone.

Part of #78.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: `ODBC_WHERE_CONNECTOR_EXISTS` and its page

**Files:**
- Modify: `packages/core/src/rules/pbiplint/power-query.ts`
- Create: `rules/odbc-where-connector-exists.md`
- Modify (generated): the three `.data.ts` files
- Modify: `tests/expectations/pbiplint/m-zoo.json`
- Test: `packages/core/test/rules-power-query.test.ts`

**Interfaces:**
- Consumes: `calls`, `textValue`, `unwrap` (`m/ast.ts`), `resolve` (`m/resolve.ts`, `resolve(m: MIndex, q: MQuery, node): Resolution` with `{ kind: "value"; node }` and `{ kind: "modelParameter"; query; value }`), `MIndex`, `MQuery` (`m/types.ts`), `mFinding`, `pbiplintRule`.
- Produces: `export const ODBC_WHERE_CONNECTOR_EXISTS: Rule`, in `powerQueryRules` after `EXCEL_USE_HEADERS`.

- [ ] **Step 1: Write the failing tests**

In `packages/core/test/rules-power-query.test.ts`, add `ODBC_WHERE_CONNECTOR_EXISTS` to the rule import, and add at the end:

```ts
describe("ODBC_WHERE_CONNECTOR_EXISTS (v3 spec, section 9.15)", () => {
  const rule = ODBC_WHERE_CONNECTOR_EXISTS;
  it("is a built-in Power Query info rule on a query's owner", () => {
    isPowerQueryRule(rule, 1, "Performance");
    expect(rule.name).toBe("ODBC or OLE DB where Power BI has a connector");
    expect(rule.scope).toEqual(["Partition", "NamedExpression", "Table"]);
  });
  it("reports an ODBC driver Power BI has a connector for, at the call", async () => {
    const tmdl = table(
      "Orders",
      "let",
      '\tSource = Odbc.DataSource("Driver={Amazon Redshift (x64)};Server=redshift.example;Database=dev", [HierarchicalNavigation = true])',
      "in",
      "\tSource",
    );
    expect(await mFindings(rule, tmdl)).toEqual([
      {
        objectType: "Partition",
        objectName: "Orders",
        location: { file: "inline.tmdl", line: 6, column: 15 },
        detail:
          "query 'Orders', step 'Source': the ODBC connection names the Amazon Redshift driver; Power BI has an Amazon Redshift connector",
      },
    ]);
  });
  it("reads a connection string held by a step or a parameter, and an OLE DB provider", async () => {
    const tmdl =
      'expression OrdersDsn = "Driver={PostgreSQL Unicode(x64)};Server=pg.example;Database=sales" meta [IsParameterQuery = true, Type = "Text", IsParameterQueryRequired = true]\n\n' +
      table(
        "Orders",
        "let",
        '\tConnection = "Provider=MSOLEDBSQL;Data Source=sql.example;Initial Catalog=Sales",',
        "\tFromStep = OleDb.DataSource(Connection),",
        "\tFromParameter = Odbc.DataSource(OrdersDsn)",
        "in",
        "\tFromStep",
      );
    expect((await mFindings(rule, tmdl)).map((f) => [f.location, f.detail])).toEqual([
      [
        { file: "inline.tmdl", line: 9, column: 17 },
        "query 'Orders', step 'FromStep': the OLE DB connection names the SQL Server provider; Power BI has a SQL Server connector",
      ],
      [
        { file: "inline.tmdl", line: 10, column: 22 },
        "query 'Orders', step 'FromParameter': the ODBC connection names the PostgreSQL driver; Power BI has a PostgreSQL connector",
      ],
    ]);
  });
  it("reads the driver part however its key is written", async () => {
    const tmdl = table(
      "Orders",
      'Odbc.DataSource("DRIVER = {MySQL ODBC 8.0 Unicode Driver}; SERVER=mysql.example")',
    );
    expect((await mFindings(rule, tmdl)).map((f) => f.detail)).toEqual([
      "query 'Orders': the ODBC connection names the MySQL driver; Power BI has a MySQL connector",
    ]);
  });
  it("leaves alone a DSN, a driver with no connector, a server's name, and a string built at refresh", async () => {
    const tmdl = table(
      "Orders",
      "let",
      '\tDsn = Odbc.DataSource("dsn=Sales"),',
      '\tOther = Odbc.DataSource("Driver={SQLite3 ODBC Driver};Database=orders.db"),',
      '\tServerOnly = Odbc.DataSource("dsn=Sales;Server=sqlserver.example"),',
      '\tBuilt = Odbc.DataSource("Driver={" & "PostgreSQL" & "}")',
      "in",
      "\tDsn",
    );
    expect(await mFindings(rule, tmdl)).toEqual([]);
  });
});
```

- [ ] **Step 2: Run them to make sure they fail**

Run: `npx vitest run packages/core/test/rules-power-query.test.ts -t ODBC_WHERE_CONNECTOR_EXISTS`
Expected: FAIL: `ODBC_WHERE_CONNECTOR_EXISTS` is not exported.

- [ ] **Step 3: Write the rule**

In `packages/core/src/rules/pbiplint/power-query.ts`, the `m/ast.js` import becomes `import { calls, identifierName, textLiterals, textValue, unwrap } from "../../m/ast.js";`, and add `import { resolve } from "../../m/resolve.js";` and `import type { MIndex, MQuery } from "../../m/types.js";` after it. Add after `EXCEL_USE_HEADERS`:

```ts
/**
 * The databases Power BI has a connector for, by what an ODBC driver's or an OLE DB provider's
 * name holds, any case (v3 spec, section 9.15). Kept small on purpose.
 */
const NATIVE_CONNECTORS: readonly { pattern: RegExp; name: string; article: "a" | "an" }[] = [
  { pattern: /amazon redshift/i, name: "Amazon Redshift", article: "an" },
  { pattern: /postgresql/i, name: "PostgreSQL", article: "a" },
  { pattern: /sql server|sqlncli|msoledbsql/i, name: "SQL Server", article: "a" },
  { pattern: /mysql/i, name: "MySQL", article: "a" },
  { pattern: /oracle/i, name: "Oracle", article: "an" },
  { pattern: /snowflake/i, name: "Snowflake", article: "a" },
];

/** The generic sources: what each calls its connection, and the part of it that names the driver. */
const GENERIC_SOURCES: ReadonlyMap<string, { kind: string; part: string }> = new Map([
  ["Odbc.DataSource", { kind: "ODBC", part: "driver" }],
  ["OleDb.DataSource", { kind: "OLE DB", part: "provider" }],
]);

/** The value of a connection string's `Driver=` or `Provider=` part, its key in any case, braces taken off. */
function driverOf(connection: string): string | undefined {
  for (const part of connection.split(";")) {
    const eq = part.indexOf("=");
    if (eq < 0) continue;
    const key = part.slice(0, eq).trim().toLowerCase();
    if (key === "driver" || key === "provider")
      return part
        .slice(eq + 1)
        .trim()
        .replace(/^\{|\}$/g, "");
  }
  return undefined;
}

/**
 * A connection string written in the call, or held as text by the `let` step or the model
 * parameter a name resolves to. Nothing further is followed, and a record is not read.
 */
function connectionText(m: MIndex, q: MQuery, arg: Node | undefined): string | undefined {
  if (arg === undefined) return undefined;
  const a = unwrap(arg);
  if (a.kind !== Kind.IdentifierExpression) return textValue(a);
  const r = resolve(m, q, a);
  if (r.kind === "value") return textValue(unwrap(r.node));
  if (r.kind === "modelParameter") return textValue(unwrap(r.value));
  return undefined;
}

// A connection string that names only a DSN says nothing of the driver behind it, and is left
// alone (v3 spec, section 9.15).
export const ODBC_WHERE_CONNECTOR_EXISTS = pbiplintRule({
  id: "ODBC_WHERE_CONNECTOR_EXISTS",
  name: "ODBC or OLE DB where Power BI has a connector",
  category: "Performance",
  severity: 1,
  scope: ["Partition", "NamedExpression", "Table"],
  layer: "powerquery",
  check: (_project, { indexes: { m } }) =>
    m.queries.flatMap((q) =>
      calls(q).flatMap((c) => {
        const source = GENERIC_SOURCES.get(c.name);
        if (!source) return [];
        const driver = driverOf(connectionText(m, q, c.args[0]) ?? "");
        const native =
          driver === undefined ? undefined : NATIVE_CONNECTORS.find((n) => n.pattern.test(driver));
        return native
          ? [
              mFinding(
                m,
                q,
                c.node,
                `the ${source.kind} connection names the ${native.name} ${source.part}; Power BI has ${native.article} ${native.name} connector`,
              ),
            ]
          : [];
      }),
    ),
});
```

and `powerQueryRules` becomes `[LOCAL_DRIVE_PATH, SCRIPT_IN_QUERY, EXCEL_USE_HEADERS, ODBC_WHERE_CONNECTOR_EXISTS]`.

Run: `npx vitest run packages/core/test/rules-power-query.test.ts`
Expected: PASS.

- [ ] **Step 4: Write the page**

Create `rules/odbc-where-connector-exists.md`:

````markdown
---
id: ODBC_WHERE_CONNECTOR_EXISTS
name: "ODBC or OLE DB where Power BI has a connector"
category: Performance
severity: info
scope: [Partition, NamedExpression, Table]
status: builtin
layer: powerquery
video:
sources:
---

# ODBC or OLE DB where Power BI has a connector

## What it checks

ODBC and OLE DB sources whose connection string names the driver or provider of a database Power BI has its own connector for: Amazon Redshift, PostgreSQL, SQL Server, MySQL, Oracle, or Snowflake.

Each finding names the partition, the shared expression, or, for an incremental refresh policy's own query, the table. Its detail names the query, the step, and the connector, as `query 'Orders', step 'Source': the ODBC connection names the Amazon Redshift driver; Power BI has an Amazon Redshift connector`. The connection string itself is not repeated, since it can hold a server's name or a password. The location is the line and column of the call in the TMDL file.

## Example

```tmdl fires
table Orders
	column OrderID
		dataType: int64
		summarizeBy: none
		sourceColumn: order_id

	partition Orders = m
		mode: import
		source =
				let
					Source = Odbc.DataSource("Driver={Amazon Redshift (x64)};Server=redshift.example.com;Database=dev", [HierarchicalNavigation = true]),
					Orders = Source{[Name = "dev", Kind = "Database"]}[Data]{[Name = "public", Kind = "Schema"]}[Data]{[Name = "orders", Kind = "Table"]}[Data]
				in
					Orders
```

```tmdl fixed
table Orders
	column OrderID
		dataType: int64
		summarizeBy: none
		sourceColumn: order_id

	partition Orders = m
		mode: import
		source =
				let
					Source = AmazonRedshift.Database("redshift.example.com", "dev"),
					Orders = Source{[Name = "public"]}[Data]{[Name = "orders"]}[Data]
				in
					Orders
```

## Why it matters

A generic ODBC or OLE DB source knows little about the database behind it, so Power Query can push less of the query's work to that database. Microsoft's advice is to "Choose the purpose-built connector for your data source when one is available. For example, the SQL Server connector provides a better **Get Data** experience than the generic ODBC connector when you connect to a SQL Server database. The SQL Server connector also supports performance features such as query folding." ([Best practices, Choose the right connector](https://learn.microsoft.com/power-query/best-practices#choose-the-right-connector)). With the purpose-built connector, filters and joins run in the database rather than on the refresh machine, and the refresh moves fewer rows. The driver also has to be installed, at the same version, on every machine and gateway that refreshes the model, which the built-in connector does not need. Microsoft's [connector list](https://learn.microsoft.com/power-query/connectors/) shows which connector each database has.

## How to fix it

In Power BI Desktop, choose Get data and the connector the finding names (for example, Amazon Redshift), and connect to the same database to see the navigation it offers. Then choose Transform data, select the original query, select its Source step in Applied steps, and in the formula bar replace the `Odbc.DataSource` or `OleDb.DataSource` call with the connector's function, as the fixed example shows for Amazon Redshift. The navigation steps after it usually change too, since each connector names its databases, schemas, and tables its own way; check that every later step still finds its columns before you delete the query you built to compare. In the TMDL file, the call is in the partition's `source` block.

## When to ignore it

When the connector cannot reach the database the way the driver does: an authentication method, a network setup, or a driver setting the connector does not support, or a driver your organization requires for its own reasons. Check the connector's own page for what it supports before switching. A small table read once a day gains little from folding, so there the finding is a note rather than a task.

## Quirks

- A connection string that names only a DSN, such as `dsn=Sales`, is not reported. The DSN's driver is set on each machine, not in the query; open ODBC Data Sources on the machine that refreshes to see which driver it uses.
- Only the `Driver=` or `Provider=` part is read, its key in any case. SQL Server counts under `SQL Server`, `ODBC Driver 18 for SQL Server`, `SQLNCLI`, and `MSOLEDBSQL`.
- The connection string is read where the call writes it, or where a step or a parameter holds it as text. One built at refresh time, or given as a record, is not read.
- Each call is its own finding.
- A query whose M does not parse is not read; it gets a `PARSE_ISSUE` finding instead.

## Related rules

- `MINIMIZE_POWER_QUERY_TRANSFORMATIONS` reports `Odbc.Query` and `OleDb.Query`, the native query functions of the same two sources.

## Links

- [ODBC connector](https://learn.microsoft.com/power-query/connectors/odbc)
- [Amazon Redshift connector](https://learn.microsoft.com/power-query/connectors/amazon-redshift)
- [Query folding in Power Query](https://learn.microsoft.com/power-query/power-query-folding)
````

- [ ] **Step 5: Regenerate and run the page's tests**

```bash
npm run build -w @pbiplint/core && node scripts/sync-rule-pages.mjs
npx vitest run packages/core/test/rule-pages.test.ts -t "ODBC_WHERE_CONNECTOR_EXISTS"
```

Expected: PASS.

- [ ] **Step 6: Pin the rule's finding on m-zoo**

In `tests/expectations/pbiplint/m-zoo.json`, `"rules"` becomes `["EXCEL_USE_HEADERS", "LOCAL_DRIVE_PATH", "ODBC_WHERE_CONNECTOR_EXISTS", "SCRIPT_IN_QUERY"]`. Insert directly after the `Local Paths` entry:

```json
    { "rule": "ODBC_WHERE_CONNECTOR_EXISTS", "objectType": "Partition", "object": "Odbc Orders", "file": "definition/tables/Odbc Orders.tmdl", "line": 15, "column": 17, "detail": "query 'Odbc Orders', step 'Redshift': the ODBC connection names the Amazon Redshift driver; Power BI has an Amazon Redshift connector" },
```

These are spec 9.15's fixture shapes in m-zoo's `Odbc Orders` table: the Redshift driver fires and `dsn=Sales` does not. The detail carries no part of the connection string, which holds m-zoo's fake password.

Run: `npx vitest run packages/core/test/rules-m.test.ts packages/core/test/report-parity.test.ts`
Expected: PASS.

- [ ] **Step 7: Commit**

Run what this task touches:

```bash
npx vitest run packages/core/test packages/web/test packages/cli/test
npm run typecheck
```

Expected: PASS, except the rule counts in `pack.test.ts` and `generate.test.ts`, which Task 7 moves (110 rules, "28 built into pbiplint"). Any other failure stops the task. Then:

```bash
npx prettier --write packages/core/src/rules/pbiplint/power-query.ts packages/core/test/rules-power-query.test.ts packages/core/src/rules/rule-summaries.data.ts packages/cli/src/rule-help.data.ts packages/web/src/results/rule-guidance.data.ts
npm run lint
git add packages rules/odbc-where-connector-exists.md tests/expectations/pbiplint/m-zoo.json
git commit -m "feat: ODBC_WHERE_CONNECTOR_EXISTS reports a driver Power BI has a connector for

An ODBC or OLE DB connection string that names the driver or provider
of Amazon Redshift, PostgreSQL, SQL Server, MySQL, Oracle, or Snowflake
is an info finding. A DSN alone is left alone.

Part of #78.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: `Model.dataAccessOptions`, `PRIVACY_LEVELS_IGNORED`, and its page

**Files:**
- Modify: `packages/core/src/model/types.ts` (`Model`)
- Modify: `packages/core/src/model/build.ts:448-454` (`readModel`)
- Modify: `packages/core/src/rules/pbiplint/power-query.ts`
- Create: `rules/privacy-levels-ignored.md`
- Modify (generated): the three `.data.ts` files
- Modify: `tests/expectations/pbiplint/m-zoo.json`
- Test: `packages/core/test/build.test.ts`, `packages/core/test/rules-power-query.test.ts`

**Interfaces:**
- Consumes: `finding.model` (`rules/helpers.ts`), `pbiplintRule`, `loc` (`model/build.ts:33`).
- Produces: `Model.dataAccessOptions?: { location: SourceLocation; flags: { name: string; location: SourceLocation }[] }`, flag names lowercased; `export const PRIVACY_LEVELS_IGNORED: Rule`, last in `powerQueryRules`.

- [ ] **Step 1: Write the failing tests**

In `packages/core/test/build.test.ts`, add at the end of the file:

```ts
describe("the model's data access options (v3 spec, section 9.8)", () => {
  it("reads each flag under dataAccessOptions, lowercased, with its line", () => {
    const m = modelFrom(
      "model Model\n\tculture: en-US\n\tdataAccessOptions\n\t\tfastCombine\n\t\tlegacyRedirects\n\t\treturnErrorValuesAsNull\n",
    );
    expect(m.dataAccessOptions).toEqual({
      location: { file: "inline.tmdl", line: 3 },
      flags: [
        { name: "fastcombine", location: { file: "inline.tmdl", line: 4 } },
        { name: "legacyredirects", location: { file: "inline.tmdl", line: 5 } },
        { name: "returnerrorvaluesasnull", location: { file: "inline.tmdl", line: 6 } },
      ],
    });
  });
  it("leaves dataAccessOptions unset on a model without the block", () => {
    expect(modelFrom("model Model\n\tculture: en-US\n").dataAccessOptions).toBeUndefined();
  });
});
```

In `packages/core/test/rules-power-query.test.ts`, add `PRIVACY_LEVELS_IGNORED` to the rule import, add `import { buildIndexes } from "../src/index/build.js";` and `modelFrom` to the `./helpers.js` import, and add at the end:

```ts
describe("PRIVACY_LEVELS_IGNORED (v3 spec, section 9.8)", () => {
  const rule = PRIVACY_LEVELS_IGNORED;
  const run = (tmdl: string) => {
    const model = modelFrom(tmdl);
    return rule
      .check({ model }, { indexes: buildIndexes({ model }), options: {} })
      .map(({ object: _object, ...f }) => f);
  };
  const block = (...flags: string[]): string =>
    `model Model\n\tculture: en-US\n\tdataAccessOptions\n${flags.map((f) => `\t\t${f}\n`).join("")}`;
  it("is a built-in Power Query warning on the model", () => {
    isPowerQueryRule(rule, 2, "Error Prevention");
    expect(rule.name).toBe("Privacy levels ignored for this file");
    expect(rule.scope).toEqual(["Model"]);
  });
  it("reports fastCombine once, on its own line", () => {
    expect(run(block("fastCombine", "legacyRedirects", "returnErrorValuesAsNull"))).toEqual([
      {
        objectType: "Model",
        objectName: "Model",
        location: { file: "inline.tmdl", line: 4 },
        detail: "Ignore the Privacy Levels is on for this file; the service does not honor it",
      },
    ]);
  });
  it("leaves alone the flags Desktop writes by default, and a model without the block", () => {
    expect(run(block("legacyRedirects", "returnErrorValuesAsNull"))).toEqual([]);
    expect(run("model Model\n\tculture: en-US\n")).toEqual([]);
  });
  it("is silenced by an ignore annotation on the model", async () => {
    const tmdl = `${block("fastCombine")}\n\tannotation pbiplint.ignore = PRIVACY_LEVELS_IGNORED\n`;
    const result = await lint([{ path: "definition/model.tmdl", text: tmdl }]);
    expect(result.findings.filter((f) => f.ruleId === rule.id)).toEqual([]);
    const before = await lint([{ path: "definition/model.tmdl", text: block("fastCombine") }]);
    expect(before.findings.filter((f) => f.ruleId === rule.id)).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run them to make sure they fail**

Run: `npx vitest run packages/core/test/build.test.ts packages/core/test/rules-power-query.test.ts -t "data access options|PRIVACY_LEVELS_IGNORED"`
Expected: FAIL: `dataAccessOptions` is undefined, and `PRIVACY_LEVELS_IGNORED` is not exported.

- [ ] **Step 3: Read the block into the model**

In `packages/core/src/model/types.ts`, inside `interface Model`, after `unreadPaths: string[];`:

```ts
  /**
   * The model's `dataAccessOptions` block, when it has one (v3 spec, section 9.8): the block's line
   * and each flag under it, its name lowercased, with its own line. Power BI Desktop writes
   * `fastCombine` there when a file ignores privacy levels. Optional, so a `Model` built by hand
   * against an earlier version still type-checks.
   */
  dataAccessOptions?: {
    location: SourceLocation;
    flags: { name: string; location: SourceLocation }[];
  };
```

In `packages/core/src/model/build.ts`, at the end of `readModel` (after its `Object.assign`):

```ts
  // A flag-style block of flags (tmdl/parse.ts keeps it so); a second declaration of the model
  // adds its flags to the first's.
  const block = r.children.find((c) => c.type === "dataaccessoptions");
  if (block) {
    model.dataAccessOptions ??= { location: loc(block), flags: [] };
    for (const c of block.children)
      if (c.kind === "flag") model.dataAccessOptions.flags.push({ name: c.type, location: loc(c) });
  }
```

Run: `npx vitest run packages/core/test/build.test.ts`
Expected: PASS.

- [ ] **Step 4: Write the rule**

In `packages/core/src/rules/pbiplint/power-query.ts`, add `import { finding } from "../helpers.js";` before the `m-helpers.js` import, and add after `ODBC_WHERE_CONNECTOR_EXISTS`:

```ts
// Reads no M: Ignore the Privacy Levels is a Power Query option, saved in model.tmdl (v3 spec,
// section 9.8). legacyRedirects and returnErrorValuesAsNull, which Desktop writes by default, are
// left alone.
export const PRIVACY_LEVELS_IGNORED = pbiplintRule({
  id: "PRIVACY_LEVELS_IGNORED",
  name: "Privacy levels ignored for this file",
  category: "Error Prevention",
  severity: 2,
  scope: ["Model"],
  layer: "powerquery",
  check: ({ model }) => {
    const fastCombine = model?.dataAccessOptions?.flags.find((f) => f.name === "fastcombine");
    return model && fastCombine
      ? [
          {
            ...finding.model(model),
            location: fastCombine.location,
            detail: "Ignore the Privacy Levels is on for this file; the service does not honor it",
          },
        ]
      : [];
  },
});
```

and `powerQueryRules` becomes `[LOCAL_DRIVE_PATH, SCRIPT_IN_QUERY, EXCEL_USE_HEADERS, ODBC_WHERE_CONNECTOR_EXISTS, PRIVACY_LEVELS_IGNORED]`.

Run: `npx vitest run packages/core/test/rules-power-query.test.ts`
Expected: PASS.

- [ ] **Step 5: Write the page**

Create `rules/privacy-levels-ignored.md`:

````markdown
---
id: PRIVACY_LEVELS_IGNORED
name: "Privacy levels ignored for this file"
category: Error Prevention
severity: warning
scope: [Model]
status: builtin
layer: powerquery
video:
sources:
---

# Privacy levels ignored for this file

## What it checks

A model whose Power Query options ignore privacy levels: the `fastCombine` flag in the `dataAccessOptions` block of `model.tmdl`, which Power BI Desktop writes when Ignore the Privacy Levels and potentially improve performance is chosen for the file.

The finding is on the model, at the `fastCombine` line, with the detail `Ignore the Privacy Levels is on for this file; the service does not honor it`.

## Example

```tmdl fires
model Model
	culture: en-US
	dataAccessOptions
		fastCombine
		legacyRedirects
		returnErrorValuesAsNull
```

```tmdl fixed
model Model
	culture: en-US
	dataAccessOptions
		legacyRedirects
		returnErrorValuesAsNull
```

## Why it matters

The option changes how Power BI Desktop refreshes and nothing else. Microsoft is direct about it: "**Ignore the Privacy Levels and potentially improve performance** doesn't work for semantic models. Reports created in Power BI Desktop with this setting and published to the Power BI service don't adhere to the setting." ([Privacy levels, Set the privacy level options](https://learn.microsoft.com/power-query/privacy-levels#set-the-privacy-level-options)). A query that combines two sources can then refresh in Desktop and fail in the service with a firewall error, after it has been published and scheduled. The option also hides a risk while it works: "Enabling Fast Combine by selecting **Ignore the Privacy levels and potentially improve performance** could expose sensitive or confidential data to an unauthorized person." (the same section). A query that sends values from a private source to a public one, such as a web lookup filtered by customer names, does so without a question.

## How to fix it

In Power BI Desktop, choose File, Options and settings, Options, then Privacy under Current file, and choose Combine data according to your Privacy Level settings for each source ([Set the privacy level options in Power BI Desktop](https://learn.microsoft.com/power-query/privacy-levels#set-the-privacy-level-options-in-power-bi-desktop)). Then refresh in Desktop. A query that only worked because privacy levels were ignored now shows the firewall error the service would have shown, while it is still easy to fix: set each source's privacy level under Data source settings, or restructure the query so that one source is read before the other is called, as Microsoft's [Behind the scenes of the Data Privacy Firewall](https://learn.microsoft.com/power-query/data-privacy-firewall) explains. In `model.tmdl`, the option is the `fastCombine` line under `dataAccessOptions`; deleting that line is the same change.

## When to ignore it

A model that is never published refreshes only in Desktop, where the option does what it says, and the warning then guards only against the data exposure above. If every source the model reads has the same owner and the same privacy level, that exposure does not arise, and a model kept on one machine can leave the option on. Anything published should have it off, since the service ignores it anyway.

## Quirks

- `legacyRedirects` and `returnErrorValuesAsNull`, which Power BI Desktop writes in the same block by default, are not reported.
- This rule reads no M. It is on the Power Query layer because Ignore the Privacy Levels is a Power Query option, so a reader who filters the rules to Power Query finds it there.

## Links

- [Power BI Desktop privacy levels](https://learn.microsoft.com/power-bi/enterprise/desktop-privacy-levels)
````

- [ ] **Step 6: Regenerate and run the page's tests**

```bash
npm run build -w @pbiplint/core && node scripts/sync-rule-pages.mjs
npx vitest run packages/core/test/rule-pages.test.ts -t "PRIVACY_LEVELS_IGNORED"
```

Expected: PASS. The example lints `model.tmdl`'s block alone as `example.tmdl`, and the model's finding is on its `fastCombine` line.

- [ ] **Step 7: Pin the rule's finding on m-zoo**

In `tests/expectations/pbiplint/m-zoo.json`, `"rules"` becomes `["EXCEL_USE_HEADERS", "LOCAL_DRIVE_PATH", "ODBC_WHERE_CONNECTOR_EXISTS", "PRIVACY_LEVELS_IGNORED", "SCRIPT_IN_QUERY"]`. Insert directly after the `ExportFolder` entry (`definition/model.tmdl` sorts between `expressions.tmdl` and `tables/`); it has no column, since it is a TMDL line:

```json
    { "rule": "PRIVACY_LEVELS_IGNORED", "objectType": "Model", "object": "Model", "file": "definition/model.tmdl", "line": 6, "detail": "Ignore the Privacy Levels is on for this file; the service does not honor it" },
```

This is spec 9.8's fixture: m-zoo's `model.tmdl` carries the block with all three flags. No other committed fixture has `fastCombine`, so no native map changes.

The finished file holds 16 findings: 10 `LOCAL_DRIVE_PATH`, 2 `SCRIPT_IN_QUERY`, 2 `EXCEL_USE_HEADERS`, 1 `ODBC_WHERE_CONNECTOR_EXISTS`, 1 `PRIVACY_LEVELS_IGNORED`.

Run: `npx vitest run packages/core/test/rules-m.test.ts packages/core/test/report-parity.test.ts packages/core/test/build.test.ts`
Expected: PASS.

- [ ] **Step 8: Commit**

Run what this task touches:

```bash
npx vitest run packages/core/test packages/web/test packages/cli/test
npm run typecheck
```

Expected: PASS, except the rule counts in `pack.test.ts` and `generate.test.ts`, which Task 7 moves (111 rules, "29 built into pbiplint"). Any other failure stops the task. Then:

```bash
npx prettier --write packages/core/src/model/types.ts packages/core/src/model/build.ts packages/core/src/rules/pbiplint/power-query.ts packages/core/test/build.test.ts packages/core/test/rules-power-query.test.ts packages/core/src/rules/rule-summaries.data.ts packages/cli/src/rule-help.data.ts packages/web/src/results/rule-guidance.data.ts
npm run lint
git add packages rules/privacy-levels-ignored.md tests/expectations/pbiplint/m-zoo.json
git commit -m "feat: PRIVACY_LEVELS_IGNORED reports a file set to ignore privacy levels

The model reads model.tmdl's dataAccessOptions flags with their lines,
and fastCombine is a warning on its own line: the service does not
honor the option.

Part of #78.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: The rule counts, the site checks, and Power Query in the READMEs and the About page

**Files:**
- Modify: `packages/core/test/pack.test.ts:26`
- Modify: `packages/web/test/generate.test.ts:688-723,783,1021,1030,1048`
- Modify: `packages/web/e2e/site.spec.ts:10-22` (`PAGES`)
- Modify: `README.md:14-22` and the "What it checks" section, `packages/cli/README.md:96-121`, `packages/core/README.md:52-64`, `packages/web/content/about.md:12,14`

**Interfaces:**
- Consumes: the five rules and pages of Tasks 2 to 6.
- Produces: no code. The count sentences pull requests 5 and 6 edit by number only.

- [ ] **Step 1: Move the rule counts from 106 to 111**

The five rules are built in, so the count is 111 rules, 29 built into pbiplint (24 before):

- `packages/core/test/pack.test.ts:26`: `toBe(106)` becomes `toBe(111)`.
- `packages/web/test/generate.test.ts`:
  - `:688`, `:689`, `:718`, `:723`: `106` becomes `111`.
  - `:696-698`: the Power Query slugs, sorted:

    ```ts
    // The shipped rule and pbiplint's own Power Query rules (v3 spec, sections 9 and 10.1).
    expect(
      metas
        .filter((m) => m.layer === "powerquery")
        .map((m) => m.slug)
        .sort(),
    ).toEqual([
      "excel-use-headers",
      "local-drive-path",
      "minimize-power-query-transformations",
      "odbc-where-connector-exists",
      "privacy-levels-ignored",
      "script-in-query",
    ]);
    expect(readFileSync(join(out, "rules/local-drive-path/index.html"), "utf8")).toContain(
      "· built in · Power Query layer · scope: Partition, NamedExpression, Table",
    );
    ```

    Keep the existing `minimize-power-query-transformations` meta-line assertion after it.
  - `:711`: `"106 rules: ... and 24 built into pbiplint."` becomes `"111 rules: 66 rules ported from Microsoft's Best Practice Analyzer ruleset and verified against Tabular Editor, 5 listed but not run because they need statistics only a live model has, 11 report rules ported from PBI Inspector's base rules by Nat Van Gulck, and 29 built into pbiplint."`
  - `:783`: `6 + 106` becomes `6 + 111`.
  - `:1021`: `"107 rules: ... 12 report rules ... and 24 built into pbiplint."` becomes `"112 rules: 66 rules ported from Microsoft's Best Practice Analyzer ruleset and verified against Tabular Editor, 5 listed but not run because they need statistics only a live model has, 12 report rules ported from PBI Inspector's base rules by Nat Van Gulck, and 29 built into pbiplint."`
  - `:1030`: `"80 rules: ... and 9 built into pbiplint."` becomes `"85 rules: 66 rules ported from Microsoft's Best Practice Analyzer ruleset and verified against Tabular Editor, 5 listed but not run because they need statistics only a live model has, and 14 built into pbiplint."`
  - `:1048`: `"and 25 built into pbiplint."` becomes `"and 30 built into pbiplint."`

If the meta line's exact text for a built-in page differs (the existing `filters-pane-state` assertion at `:389` reads `· built in · report layer · scope: `), match its form and say so in the commit.

Run: `npx vitest run packages/core/test/pack.test.ts packages/web/test/generate.test.ts`
Expected: PASS.

- [ ] **Step 2: A built-in Power Query page in the site checks**

In `packages/web/e2e/site.spec.ts`, add to `PAGES` after the `minimize-power-query-transformations` line:

```ts
  "/rules/local-drive-path/", // pbiplint's own Power Query page, with a quote in When to ignore it
```

The rules index filter's e2e test counts its rows from the page, so it needs no change.

- [ ] **Step 3: Name Power Query in the root README**

In `README.md`'s Status paragraph, `strings; and the report layer (PBIR):` becomes `strings; the report layer (PBIR):`, and `year, and for what the model holds that the report never reaches. Power Query\nrules follow.` becomes (reflowed to the paragraph's width):

```markdown
year, and for what the model holds that the report never reaches; and Power Query, the M behind
the model's tables and shared expressions, read with Microsoft's Power Query parser: 6 rules, 5 of
them pbiplint's own. 111 rules in all, 29 of them built into pbiplint.
```

In `## What it checks`, add a paragraph after the one that begins "The report layer:", in the section's one-line-per-paragraph form:

```markdown
The Power Query layer: the M behind each table's partitions, the shared expressions, and incremental refresh policies, read with Microsoft's Power Query parser, and the file's Power Query options. 6 rules check it: Microsoft's `MINIMIZE_POWER_QUERY_TRANSFORMATIONS` and 5 of pbiplint's own, for a path on a local drive, a Python or R script, Excel headers promoted by the workbook reader, ODBC or OLE DB where Power BI has a connector, and a file set to ignore privacy levels. A finding in M names the query and the step as Power Query's editor shows them, at the line and column in the TMDL file, and M that does not parse gets a `PARSE_ISSUE` error where the parser stopped. 111 rules in all, 29 of them built into pbiplint; the [rules index](https://pbiplint.com/rules/?layer=powerquery) filters to the Power Query ones.
```

Pull requests 5 and 6 change the four numbers and extend the "for ..." list; nothing else in the paragraph moves.

- [ ] **Step 4: Name Power Query in the CLI and core READMEs**

In `packages/cli/README.md`, add after the paragraph that begins "The report layer (PBIR) is read beside the model" (wrapped at 100 columns, as the file is):

```markdown
The Power Query layer is read inside the model: the M behind each table's partitions, the shared
expressions, and incremental refresh policies, with Microsoft's Power Query parser, and the file's
Power Query options. 6 rules check it, `MINIMIZE_POWER_QUERY_TRANSFORMATIONS` and 5 of pbiplint's
own; a finding in M names the query and the step as Power Query's editor shows them, at
`file:line:column`. 111 rules in all, 29 of them built into pbiplint; `pbiplint rules` lists them
with their layer.
```

In `packages/core/README.md`, add after the paragraph that begins "The model rules are ports of the Microsoft Best Practice Analyzer ruleset" (wrapped at 100 columns):

```markdown
The Power Query rules read the M behind each table's partitions, the shared expressions, and
incremental refresh policies, parsed with Microsoft's Power Query parser, and the file's Power
Query options: 6 rules, `MINIMIZE_POWER_QUERY_TRANSFORMATIONS` and 5 of pbiplint's own, each with
`rule.layer` `powerquery` while its findings' `layer` stays `model`. A finding in M carries
`location.column` as well as its line. 111 rules in all, 29 of them built into pbiplint.
```

- [ ] **Step 5: Name Power Query on the About page**

In `packages/web/content/about.md`:

- At the end of the paragraph on line 12 (it begins "The site and the command-line tool read both parts of a Power BI project"), add: `Inside the model they also read Power Query: the M behind each table and shared expression, parsed with Microsoft's Power Query parser, so a finding in a query names the query and the step as Power Query's editor shows them.`
- On line 14, replace `Power Query rules come later. The [rules index](/rules/) has the full list.` with:

```markdown
The Power Query rules, 6 of them, are Microsoft's `MINIMIZE_POWER_QUERY_TRANSFORMATIONS` and 5 of pbiplint's own, which check the M for paths, scripts, and sources that will not refresh as expected, and the file's privacy option. 111 rules in all, 29 of them built into pbiplint. The [rules index](/rules/) has the full list, and [its Power Query view](/rules/?layer=powerquery) shows those alone.
```

Then check the counts' wording reads the same everywhere:

```bash
git grep -n "6 rules\|5 of pbiplint\|111 rules\|29 of them" -- README.md packages/cli/README.md packages/core/README.md packages/web/content/about.md
```

Expected: one Power Query count and one total in each of the four files (the root README has two of each: Status and What it checks).

- [ ] **Step 6: Run what this task touches**

```bash
npx vitest run packages/core/test packages/web/test packages/cli/test
npm run typecheck
npm run build -w @pbiplint/web
npx playwright test -c packages/web/playwright.config.ts packages/web/e2e/site.spec.ts
```

Expected: PASS, every test (the counts no longer fail).

- [ ] **Step 7: Commit**

```bash
npx prettier --write packages/core/test/pack.test.ts packages/web/test/generate.test.ts packages/web/e2e/site.spec.ts
npm run lint
git add packages/core/test/pack.test.ts packages/web README.md packages/cli/README.md packages/core/README.md
git commit -m "docs: the READMEs and the About page name Power Query, and the counts move

Power Query is a part pbiplint reads, with 6 rules, 5 of them its own;
111 rules in all, 29 built in. The rules index and the site checks
count the five new pages.

Part of #78.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: The core's budget, from measurement

**Files:**
- Modify: `packages/core/scripts/check-browser-bundle.mjs:59-62`
- Modify: `docs/superpowers/specs/2026-10-12-pbiplint-v3-power-query-layer-design.md` (section 3.4, after the parser bullet)

**Interfaces:**
- Consumes: the base measurement in `progress.md` (Before Task 1).
- Produces: `OWN_LIMIT_KB` set to the measured budget.

- [ ] **Step 1: Measure after**

Run: `npm run check:browser`
Expected: a line `core browser bundle: ... core's own code <after> KB, the M parser 375.9 KB`, and, if `<after>` is over 210, the budget error. Write the line into `progress.md` as **the after measurement**.

If the base measurement is missing from `progress.md`, measure the base now:

```bash
BASE=$(mktemp -d "$SCRATCH/base-core.XXXX") && echo "$BASE"
git archive origin/release/0.3.0 packages/core | tar -x -C "$BASE"
ln -s "$PWD/node_modules" "$BASE/node_modules"
node "$BASE/packages/core/scripts/check-browser-bundle.mjs"
```

Expected: `core's own code 206.3 KB` (October 13, 2026, at d2a18b8).

- [ ] **Step 2: Work out the budget**

The budget is core's own code after pull request 4, plus pull request 4's average per rule times the ten rules still to come (pull requests 5 and 6), plus 5 KB of headroom, rounded up to the next 5 KB:

```bash
node -e 'const [base, after] = process.argv.slice(1).map(Number);
const perRule = (after - base) / 5;
const raw = after + 10 * perRule + 5;
console.log(`per rule ${perRule.toFixed(2)} KB; ${after} + 10 x ${perRule.toFixed(2)} + 5 = ${raw.toFixed(1)} KB; budget ${Math.ceil(raw / 5) * 5} KB`);' 206.3 <after>
```

Write the printed line into `progress.md`. It is the arithmetic the pull request body carries. Call the printed budget **B**. If B is over 240, stop and report to pb-coord with the numbers before changing anything: the rules would then cost more than the spec foresaw.

- [ ] **Step 3: Set the tripwire**

In `packages/core/scripts/check-browser-bundle.mjs`, replace the comment and constant at lines 59 to 62 with (B, the after measurement, and the per-rule figure from Step 2):

```js
// Tripwires for conscious growth, raised on purpose: the core's own code at B KB and the parser at
// 385 KB, measured at 376.0 KB on October 13, 2026; the parser moves only when its pinned version
// does. The core's budget was 210 KB (the v2 spec's amendment of October 4, 2026) until v3's rules:
// raised once, on <the date>, to its measure after the first five Power Query rules, <after> KB,
// plus their <per rule> KB a rule for the ten still to come, plus 5 KB, rounded up to the next 5 KB
// (v3 spec, section 3.4).
const OWN_LIMIT_KB = B;
```

with B, `<after>`, `<per rule>`, and `<the date>` (long form, the day of the measurement) written in.

Run: `npm run check:browser`
Expected: `core bundle is browser-pure, English only, and within budget`.

- [ ] **Step 4: Amend spec 3.4**

In `docs/superpowers/specs/2026-10-12-pbiplint-v3-power-query-layer-design.md`, section 3.4, add a paragraph after the bullet "**The parser: 385 KB.** ...":

```markdown
Amended <the date> (pull request 4): the core's own code budget is now B KB. Measured with `check:browser`, the core's own code was 206.3 KB before pull request 4 and <after> KB after it, so its five rules cost <per rule> KB a rule. The ten rules of pull requests 5 and 6 at that rate need <10 x per rule> KB, and 5 KB is headroom: <after> + <10 x per rule> + 5 = <raw> KB, rounded up to the next 5 KB. It is a tripwire for conscious growth, as the v2 spec's amendment of October 4, 2026 describes, raised once for v3's rules. The parser's 385 KB budget is unchanged.
```

with every bracketed value written in from Step 2.

- [ ] **Step 5: Commit**

```bash
npx prettier --write packages/core/scripts/check-browser-bundle.mjs
npm run lint
git add packages/core/scripts/check-browser-bundle.mjs docs/superpowers/specs/2026-10-12-pbiplint-v3-power-query-layer-design.md
git commit -m "build: the core's budget, measured for v3's Power Query rules

The core's own code is <after> KB with five Power Query rules. The
budget is that plus <per rule> KB a rule for the ten to come, plus 5 KB,
rounded up: B KB. Spec 3.4 records the arithmetic; the parser's 385 KB
is unchanged.

Part of #78.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

with the numbers written in.

---

### Task 9: The corpus diff, the spot checks, and the whole branch

**Files:**
- Reuse (not committed): `.superpowers/sdd/2026-10-13-v3-reader/corpus-diff.mts`
- Create (not committed): `.superpowers/sdd/2026-10-13-v3-rules-calls/rule-counts.mts`

**Interfaces:**
- Consumes: `lint` from `packages/core/src/index.ts`.

- [ ] **Step 1: Unpack the base core**

```bash
BASE=$(mktemp -d "$SCRATCH/base-core.XXXX") && echo "$BASE"
git archive origin/release/0.3.0 packages/core | tar -x -C "$BASE"
ln -s "$PWD/node_modules" "$BASE/node_modules"
```

- [ ] **Step 2: Run the corpus diff**

```bash
npx tsx .superpowers/sdd/2026-10-13-v3-reader/corpus-diff.mts "$BASE" ~/Projects/pbiplint/assets/pbip-lint-spike/research-104 2>&1 | tee "$SCRATCH/corpus-diff.txt" | grep -E "models linted|^[+-][0-9]"
```

Expected, in about a minute: `1321 models linted`, then only `+` lines, for `LOCAL_DRIVE_PATH` (about 1,083), `PRIVACY_LEVELS_IGNORED` (44), `SCRIPT_IN_QUERY` (7), and `EXCEL_USE_HEADERS` (26), and no `-` line. The diff's key leaves out the column, so two paths on one line with one detail count once there; Step 3's script is the count of record. **Any other rule, or any `-` line, stops the task:** report it with the five examples the script prints.

- [ ] **Step 3: Count each rule and pull examples for the spot check**

Create `.superpowers/sdd/2026-10-13-v3-rules-calls/rule-counts.mts`:

```ts
// The five rules of pull request 4 on the corpus (v3 spec, section 11.4): occurrences, models, and
// repositories per rule, and examples with their TMDL line for a spot check of false positives.
// Imports the worktree's code by the working directory, since .superpowers links into another
// checkout. Nothing it prints goes into the pull request but the counts.
// Usage, from the repository root:
//   npx tsx .superpowers/sdd/2026-10-13-v3-rules-calls/rule-counts.mts <corpus dir>
import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";

const [corpus] = process.argv.slice(2);
const core = await import(join(process.cwd(), "packages/core/src/index.ts"));
const RULES = [
  "LOCAL_DRIVE_PATH",
  "PRIVACY_LEVELS_IGNORED",
  "SCRIPT_IN_QUERY",
  "EXCEL_USE_HEADERS",
  "ODBC_WHERE_CONNECTOR_EXISTS",
];

const roots: string[] = [];
const walk = (d: string) => {
  for (const e of readdirSync(d, { withFileTypes: true })) {
    if (!e.isDirectory() || e.name === ".git" || e.name === "node_modules") continue;
    const p = join(d, e.name);
    if (e.name === "definition" && /\.(SemanticModel|Dataset)$/.test(d)) roots.push(p);
    else walk(p);
  }
};
walk(corpus!);
const tmdls = (d: string): string[] =>
  readdirSync(d, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? tmdls(join(d, e.name)) : e.name.endsWith(".tmdl") ? [join(d, e.name)] : [],
  );

const stats = new Map(
  RULES.map((id) => [id, { n: 0, models: new Set<string>(), repos: new Set<string>(), examples: [] as string[] }]),
);
for (const root of roots) {
  const model = relative(corpus!, root);
  const files = tmdls(root).map((f) => ({ path: relative(root, f).split("\\").join("/"), text: readFileSync(f, "utf8") }));
  const result = await core.lint(files, { config: { failOn: "none" } });
  for (const f of result.findings) {
    const s = stats.get(f.ruleId);
    if (!s) continue;
    s.n++;
    s.models.add(model);
    s.repos.add(model.split("/").slice(0, 2).join("/"));
    // A rule's first five findings, then every fiftieth, for the spot check.
    if (s.examples.length < 5 || s.n % 50 === 0) {
      const text = files.find((x) => x.path === f.location?.file)?.text ?? "";
      const line = text.split(/\r\n?|\n/)[(f.location?.line ?? 1) - 1]?.trim().slice(0, 160) ?? "";
      s.examples.push(`${model} ${f.location?.file}:${f.location?.line}:${f.location?.column ?? ""} ${f.detail}\n      ${line}`);
    }
  }
}
console.log(`${roots.length} models`);
for (const [id, s] of stats)
  console.log(`${id}: ${s.n} occurrences, ${s.models.size} models, ${s.repos.size} repositories\n  ${s.examples.join("\n  ")}`);
```

Run:

```bash
npx tsx .superpowers/sdd/2026-10-13-v3-rules-calls/rule-counts.mts ~/Projects/pbiplint/assets/pbip-lint-spike/research-104 2>&1 | tee "$SCRATCH/rule-counts.txt" | grep -E "^[A-Z_]+:"
```

Expected, from a prototype run of the same logic on October 13, 2026 (spec 11.4's expectation in brackets):

| Rule | Occurrences, models, repositories | Spec 11.4 |
| --- | --- | --- |
| `LOCAL_DRIVE_PATH` | 1,083, 296, 201 | 1,083, 303 or fewer |
| `PRIVACY_LEVELS_IGNORED` | 44, 44, 29 | 44, 44 |
| `SCRIPT_IN_QUERY` | 7, 3, 3 | 7, 3 |
| `EXCEL_USE_HEADERS` | 26, 21, 19 | 26, 21 |
| `ODBC_WHERE_CONNECTOR_EXISTS` | 0, 0, 0 | 236, 17 or fewer |

**The ODBC difference is explained, and it is expected.** The corpus's 267 ODBC and OLE DB calls are all DSN-only (`dsn=...`) apart from 5 with an `Adaptive Server Anywhere 9.0` driver, which is not on the list. The research's 236 counted DSNs whose names hold a driver's name (203 and 28 calls to two DSNs named for Redshift, and 5 to one named for PostgreSQL), and spec 9.15 leaves a DSN alone, since its name says nothing certain of its driver. So the rule as specified finds none in the corpus; m-zoo and the unit tests still pin it. Record this in `progress.md` and in the pull request body, and flag it to pb-coord as a decision for Michael (whether a DSN named for a database should count is a spec change, not this pull request's).

If any other count is off by more than a few, stop and report the line with its examples.

- [ ] **Step 4: Spot-check each rule for false positives**

For each rule with findings, read its examples in `$SCRATCH/rule-counts.txt` (each has its TMDL line under it) and confirm:

- `LOCAL_DRIVE_PATH`: the line's text literal starts with a drive letter, a colon, and a slash; it is not in a comment and not a `file:` or web address. Open two of the models and confirm the line and column land on the opening quote.
- `PRIVACY_LEVELS_IGNORED`: the line is `fastCombine` under `dataAccessOptions` in `model.tmdl`.
- `SCRIPT_IN_QUERY`: the line holds a `Python.Execute(` or `R.Execute(` call.
- `EXCEL_USE_HEADERS`: the call's second argument is `true` or a record with `UseHeaders = true`, never Desktop's `null, true`.

Write one line per rule into `progress.md`: examples read, and false positives found (expected: none). A false positive stops the task: report it with its line.

- [ ] **Step 5: Run the whole suite and every check**

```bash
npm run lint
npm run typecheck
npm test
npm run check:browser
npm run build
npm run check:network -w pbiplint
npm run check:pack
npm run test:bundle -w pbiplint
npm run test:e2e
git grep -n $'\u2014' -- $(git diff --name-only origin/release/0.3.0...HEAD) || echo "no em dashes"
```

(If a script name differs in this repository's `package.json`, use the name CI's `test` job runs, from `.github/workflows/ci.yml`.) Expected: all pass, and the last line prints `no em dashes`.

- [ ] **Step 6: Record the result**

Write into `progress.md`: the corpus diff's `+` lines; the table of Step 3 as measured; the spot-check lines; the e2e engines that ran. Nothing is committed in this task.

---

### Finish

One Opus review of the whole branch (`git diff origin/release/0.3.0...HEAD`) with this plan and spec sections 3.4, 6.3, 9.1, 9.6, 9.8, 9.9, 9.12, 9.15, and 11. Then `git push -u origin v3/rules-calls` and a pull request into `release/0.3.0` titled `feat: calls and literals, the first five Power Query rules (v3 PR 4)`. Its body lists:

- What changed: the five rules and their pages; `Model.dataAccessOptions`; `tests/expectations/pbiplint/m-zoo.json` and `rules-m.test.ts`; the sample's count (266 findings to 273, seven `LOCAL_DRIVE_PATH` warnings) and its Power Query group; the report fixtures' native maps; the READMEs and the About page naming Power Query, with 111 rules, 29 built in.
- For the release notes' "What can change in your results": new findings from the five rules; the sample's count; the release's Sample and Smoke boxes apply, as spec 9.6 says.
- The budget's arithmetic, as Task 8 Step 2 printed it: base 206.3 KB, after, per rule, the sum, and B; the parser's 385 KB unchanged.
- The corpus diff: only additions, of the five rules; the per-rule table (occurrences, models, repositories) beside spec 11.4's expectation; the ODBC explanation (DSN-only connections, left alone by spec 9.15), flagged as a decision for Michael; the spot checks with no false positive. Counts only, no corpus path or line.
- That `scripts/generate-rule-pages.mjs` needed no change (built-in rules already get no ruleset link).

The body ends with:

```
🤖 Generated with [Claude Code](https://claude.com/claude-code)
```

CI and e2e must be green with no retries, and then pb-coord merges.
