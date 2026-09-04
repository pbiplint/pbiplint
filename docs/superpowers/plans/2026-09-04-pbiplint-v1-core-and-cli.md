# pbiplint v1 core and CLI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the pbiplint core (TMDL parser, object model, indexes, rule engine, all 71 Microsoft BPA rules with Tabular Editor parity, ranking, formatters) and the `pbiplint` command-line tool, with rule pages and CI, so `npx pbiplint <path>` lints a Power BI semantic model exactly the way Tabular Editor does.

**Architecture:** One npm-workspaces monorepo. `packages/core` is pure TypeScript with no Node or network dependency (enforced by a bundle check) and exposes one call, `lint()`, that parses TMDL files into a generic node tree, builds an object model, builds three indexes (relationships, usage, DAX references), runs rules, applies ignores and config, and ranks the findings. `packages/cli` wraps the core with a folder walk, config discovery, four output formats, and exit codes. Rules are literal TypeScript ports of `BPARules.json`, verified by a parity suite that compares per-rule object lists against expectations captured from the Tabular Editor CLI.

**Tech Stack:** TypeScript (strict, NodeNext ESM), npm workspaces, Vitest, esbuild (CLI bundle and browser-purity check), ESLint + Prettier, GitHub Actions. No runtime dependencies in either package.

**Spec:** `docs/superpowers/specs/2026-09-04-pbiplint-v1-design.md` (sections 3 to 8, 10, 11, 13, 14). The web app (spec section 9), Pages deploy, and npm publish are a second plan written after this one is executed.

## Global Constraints

- Node 20 or later (`engines.node: ">=20"`); the CLI must run under `npx pbiplint`.
- `packages/core` contains no `node:` imports, no `fetch`, no `process`, no `require`; a build-time check fails if the browser bundle references any of them.
- Neither package has runtime `dependencies`. Dev dependencies only.
- TypeScript `strict: true`, `module: NodeNext`; every relative import inside `src/` ends in `.js` (for example `import { parseTmdl } from "./tmdl/parse.js"`), because the emitted ESM must run in Node unbundled.
- Ported rules reproduce Microsoft's `BPARules.json` behavior exactly, quirks included; Microsoft rule IDs are kept verbatim as the rule `id`. Corrected variants are out of scope.
- Rule pages live at `rules/<slug>.md` where `slug` = rule id lowercased with every run of non `[a-z0-9]` characters replaced by a single `-` and leading or trailing `-` removed. Rule page URL = `https://pbiplint.com/rules/<slug>`.
- Object-level ignores are the TMDL annotation `pbiplint.ignore` with value `RULE_ID_1, RULE_ID_2` or `*`. Project config is `pbiplint.config.json`.
- Finding object names use Tabular Editor's display names exactly (see "Object naming" below) so the parity suite can compare against Tabular Editor output verbatim.
- Tabular Editor is never required by users, by the CLI, or by CI. It is a development-time oracle only.
- No em dashes anywhere in the repo (code, comments, docs, commit messages). Commit messages are imperative; when Claude Code makes a commit it appends its standard attribution trailer.
- Fixtures are sanitized: every `File.Contents("<path>")` in a partition source is rewritten to `C:\Demo\Data\<basename>`; no `.DS_Store`, no `.pbi/cache.abf`.
- Product naming avoids Microsoft trademarks; "for Power BI projects" in descriptive text is fine.

---

## Ground truth captured for this plan (read before starting)

All of this lives in the spike folder `/Users/michaelmckinley/Downloads/pbip-lint-spike/` (referred to below as `$SPIKE`). Nothing in that folder is production code; the plan copies specific inputs from it.

**Oracle:** Tabular Editor CLI `te` 0.5.2.11639 (TE3 early preview, installed at `~/.local/bin/te`, preview expires 2026-09-30; after that update it from tabulareditor.com/downloads). Ruleset: `$SPIKE/ref/BPARules.json`, sha256 `ddb9cff4c2a0611a6467e2559d38319d9867381998066473ffa1e11c2d360392`, 71 rules, from `microsoft/Analysis-Services` (MIT). The exact oracle command, which points at the `definition` folder, is:

```bash
te bpa run <model>/definition -r $SPIKE/ref/BPARules.json --no-defaults --no-model-rules --output-format json
```

Its JSON has `results[]` with `ruleId`, `objectName`, `objectType`. Captured outputs (already run, 2026-09-04) are in `$SPIKE/te-json/`: `messy-sales.json` (161 findings), `tvw-baseline.json` (183), `tmdlmaker-KitchenSinkDemo.json` (9), `rule-zoo.json` (143), `data-sources.json` (8). Together they exercise 60 of the 71 rules. The 11 never exercised by a fixture are the 5 `needsLiveModel` rules plus `EXPRESSION_RELIANT_OBJECTS_MUST_HAVE_AN_EXPRESSION`, `AVOID_INVALID_NAME_CHARACTERS`, `AVOID_INVALID_DESCRIPTION_CHARACTERS`, `SPECIAL_CHARS_IN_OBJECT_NAMES`, `REMOVE_DATA_SOURCES_NOT_REFERENCED_BY_ANY_PARTITIONS`; those get unit tests with hand-built models (reasons in their tasks).

**Fixture sources:** `$SPIKE/corpus/messy-sales.SemanticModel` (Desktop export, planted violations; becomes the sample project), `$SPIKE/corpus/tvw-baseline.SemanticModel` (Desktop export with auto date tables, variations, calculated columns), `$SPIKE/corpus/tmdlmaker-KitchenSinkDemo.SemanticModel` (roles with RLS and OLS, perspective, hierarchy, descriptions everywhere), `$SPIKE/corpus/rule-zoo.SemanticModel` (hand-written, reproduced in full in Task 7), `$SPIKE/corpus/data-sources.SemanticModel` (Tabular Editor serialized, reproduced in Task 7), `$SPIKE/spec-sample.tmdl` (constructs from Microsoft's TMDL overview page).

**Object naming (Tabular Editor display names, verified from the captures):**

| Object | `objectName` | Example |
|---|---|---|
| Model | `Model` | `Model` |
| Table, calculated table, calculation group table | `'Name'` (always single-quoted, `'` doubled) | `'Sales'`, `' Spaced '` |
| Column (all kinds) | `'Table'[Column]` | `'Sales'[Sale ID]` |
| Measure | `[Name]` | `[Total Sales]` |
| Partition | bare name | `SalesData` |
| Relationship | `'FT'[FC] <from><arrow><to> 'TT'[TC]` where cardinality `many` prints `∞`, `one` prints `1`, and the arrow is `↔` when `crossFilteringBehavior` is `bothDirections`, else `←` | `'Sales'[Month Start] ∞←1 'Date'[Date]`, `'Customer'[Region] ∞↔∞ 'Region Security'[Region]` |
| Role | bare name | `Region Users` |
| Table permission | bare **table** name (the role is not part of the name) | `Date` |
| Perspective, hierarchy, level, calculation item, named expression, data source | bare name | `Empty View`, `by Category`, ` Category`, `YTD`, ` Padded Param `, `Unused SQL` |

**Observed Tabular Editor semantics that the ports must reproduce (each is pinned by the rule-zoo fixture):**

1. A calculation group table is its own object type. It is in scope for rules scoped `CalculationGroup`, and never for rules scoped `Table` or `CalculatedTable` (for example `ENSURE_TABLES_HAVE_RELATIONSHIPS` does not fire on it).
2. A column with an expression is a `CalculatedColumn` even inside a calculated table; a column without an expression in a calculated table is a `CalculatedTableColumn`; every other column is a `Column` (Microsoft scope name `DataColumn`).
3. DAX reference resolution: a qualified reference `'T'[X]` or `T[X]` resolves to column X of table T if it exists, else to measure X of table T, else nothing. A bare `[X]` resolves to the measure named X if one exists anywhere in the model; otherwise, in measures, calculated columns, calculated tables, and table permissions, to column X on the owner's own table, else column X on the first table (model order) that has one; **in calculation items a bare reference that is not a measure resolves to nothing** (Tabular Editor flags `'Time Intelligence'[Ordinal]` as unnecessary even though a calculation item reads `[Ordinal]`).
4. `CHECK_IF_DYNAMIC_ROW_LEVEL_SECURITY_(RLS)_IS_NECESSARY` does not match `USERPRINCIPALNAME ()` with a space before the parenthesis (kitchen-sink fixture, role "Regional Manager").
5. `FILTER_COLUMN_VALUES` also matches `FILTER('Product', [Total Amount] > 100)` because the space after the comma satisfies `[A-Za-z0-9 _]+` as the "table name".
6. `HIDE_FOREIGN_KEYS` compares from-column names only, so `'Region Security'[Region]` is flagged because `'Customer'[Region]` is the from-side of a relationship.
7. `REMOVE_DATA_SOURCES_NOT_REFERENCED_BY_ANY_PARTITIONS` fired when the data-sources model was loaded from `.bim` but not when the identical model was loaded from TMDL. The expectation file skips this rule with that reason; the port follows the rule text.
8. A TMDL `measure X =` with nothing after `=` is not "empty": the TMDL reader takes the next indented line (even a property such as `lineageTag:`) as the expression. So `EXPRESSION_RELIANT_OBJECTS_MUST_HAVE_AN_EXPRESSION` cannot be triggered from a file; it is unit-tested on a hand-built model.

**Multi-line expressions in TMDL:** the first non-blank line after `name =` sets the block's indentation; the block continues while lines are blank or indented at least that much. This is how the TMDL reader behaves (item 8 above shows it), and it also handles Desktop output, where expression lines are two tabs deeper than the declaration and properties are one tab deeper.

## File structure

```
package.json                      npm workspaces root, scripts, dev dependencies
tsconfig.base.json                shared compiler options
vitest.config.ts                  runs packages/*/test, aliases @pbiplint/core to core src
eslint.config.js, .prettierrc, .prettierignore, .editorconfig, .gitignore
.github/workflows/ci.yml          lint, typecheck, test, browser purity, build
packages/core/
  package.json, tsconfig.json
  scripts/check-browser-bundle.mjs           esbuild browser bundle + forbidden-token scan
  src/index.ts                               public API
  src/tmdl/types.ts                          TmdlNode, ParsedFile, ParseIssue
  src/tmdl/quote.ts                          unquoteName, unquoteValue
  src/tmdl/parse.ts                          parseTmdl(file, text)
  src/model/types.ts                         Model, Table, Column, ... (object model)
  src/model/build.ts                         buildModel(files)
  src/model/names.ts                         tableRef, columnRef, measureRef, relationshipName, slug
  src/index/relationships.ts                 RelationshipIndex
  src/index/usage.ts                         UsageIndex (sort-by, hierarchies, variations)
  src/index/references.ts                    ReferenceIndex (DAX dependency approximation)
  src/index/build.ts                         buildIndexes(model)
  src/rules/types.ts                         Rule, RuleContext, Finding, RuleFinding, ObjectType, Category
  src/rules/helpers.ts                       finding factories, scope enumerators, predicates
  src/rules/parse-issue.ts                   built-in PARSE_ISSUE rule
  src/rules/microsoft-bpa/bpa-rules.data.ts  vendored ruleset metadata (generated once)
  src/rules/microsoft-bpa/define.ts          bpaRule(id, check), liveModelRule(id), scope mapping
  src/rules/microsoft-bpa/columns.ts         column property rules
  src/rules/microsoft-bpa/relationships.ts   relationship graph rules
  src/rules/microsoft-bpa/measures.ts        measure format and DAX regex rules
  src/rules/microsoft-bpa/dependencies.ts    rules that use the reference index
  src/rules/microsoft-bpa/tables.ts          table and model level rules
  src/rules/microsoft-bpa/naming.ts          naming and container rules
  src/rules/microsoft-bpa/live-model.ts      the five needsLiveModel rules
  src/rules/microsoft-bpa/index.ts           the pack: every rule, in ruleset order
  src/engine/config.ts                       PbiplintConfig, resolveConfig
  src/engine/ignore.ts                       ignore annotation parsing
  src/engine/run.ts                          runRules
  src/engine/rank.ts                         rank
  src/engine/lint.ts                         lint() entry point
  src/format/text.ts, json.ts, markdown.ts, sarif.ts
  test/*.test.ts                             unit tests (one file per module)
  test/parity.test.ts                        fixture vs Tabular Editor expectations
  test/helpers.ts                            modelFrom(tmdl), lintFiles(dir)
packages/cli/
  package.json, tsconfig.json, build.mjs
  src/args.ts, src/walk.ts, src/config.ts, src/main.ts, src/bin.ts
  test/*.test.ts
rules/<slug>.md                   one page per rule (72 including PARSE_ISSUE)
scripts/vendor-bpa-rules.mjs      BPARules.json -> bpa-rules.data.ts
scripts/sanitize-fixture.mjs      rewrite File.Contents paths, delete junk files
scripts/te-expectations.mjs       Tabular Editor JSON -> tests/expectations/<name>.json
scripts/generate-rule-pages.mjs   one-shot rule page generator
examples/messy-sales/             sample project (also a parity fixture)
tests/fixtures/<name>.SemanticModel/   tvw-baseline, kitchen-sink, rule-zoo, data-sources
tests/fixtures/spec-sample.tmdl
tests/expectations/<name>.json
CONTRIBUTING.md
```

## Conventions for every task

- Run tests with `npm test -- <pattern>` from the repo root (Vitest). `npm run typecheck` runs `tsc -b`.
- Tests import the core through the alias `@pbiplint/core` or relative `../src/...` paths; never through `dist`.
- Commit after every task with the message given in the task; include only the files the task touched.
- Object model names are compared exactly (case-sensitive) except where a task says "case-insensitive"; DAX reference resolution is case-insensitive because DAX identifiers are.

---

### Task 1: Monorepo scaffold

**Files:**
- Create: `package.json`, `tsconfig.base.json`, `vitest.config.ts`, `eslint.config.js`, `.prettierrc`, `.prettierignore`, `.editorconfig`, `.gitignore`
- Create: `packages/core/package.json`, `packages/core/tsconfig.json`, `packages/core/src/index.ts`
- Create: `packages/cli/package.json`, `packages/cli/tsconfig.json`, `packages/cli/src/bin.ts`
- Test: `packages/core/test/index.test.ts`

**Interfaces:**
- Produces: `VERSION` constant exported from `@pbiplint/core`; workspace scripts `build`, `test`, `typecheck`, `lint`, `format`, `check:browser`.

- [ ] **Step 1: Create the root files**

`package.json`:

```json
{
  "name": "pbiplint-monorepo",
  "private": true,
  "type": "module",
  "workspaces": ["packages/*"],
  "engines": { "node": ">=20" },
  "scripts": {
    "build": "npm run build --workspaces --if-present",
    "test": "vitest run",
    "test:watch": "vitest",
    "typecheck": "tsc -b packages/core && tsc -p packages/cli/tsconfig.json",
    "lint": "eslint . && prettier --check .",
    "format": "prettier --write .",
    "check:browser": "node packages/core/scripts/check-browser-bundle.mjs"
  }
}
```

`tsconfig.base.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "verbatimModuleSyntax": true,
    "isolatedModules": true,
    "declaration": true,
    "sourceMap": true,
    "skipLibCheck": true,
    "composite": true
  }
}
```

`vitest.config.ts`:

```ts
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@pbiplint/core": fileURLToPath(new URL("./packages/core/src/index.ts", import.meta.url)),
    },
  },
  test: {
    include: ["packages/*/test/**/*.test.ts"],
  },
});
```

`eslint.config.js`:

```js
import js from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["**/dist/**", "**/node_modules/**", "examples/**", "tests/fixtures/**"] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      "@typescript-eslint/no-non-null-assertion": "off",
    },
  },
);
```

`.prettierrc`:

```json
{ "printWidth": 100 }
```

`.prettierignore`:

```
dist
node_modules
examples
tests/fixtures
*.tmdl
*.md
```

`.editorconfig`:

```
root = true

[*]
charset = utf-8
end_of_line = lf
insert_final_newline = true
indent_style = space
indent_size = 2

[*.tmdl]
indent_style = tab
```

`.gitignore`:

```
node_modules/
dist/
coverage/
.DS_Store
packages/cli/sample/
*.tsbuildinfo
```

- [ ] **Step 2: Create the core package**

`packages/core/package.json`:

```json
{
  "name": "@pbiplint/core",
  "version": "0.0.0",
  "description": "Best-practice linter core for Power BI semantic models (TMDL). Runs in the browser and in Node.",
  "license": "MIT",
  "type": "module",
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "import": "./dist/index.js"
    }
  },
  "files": ["dist"],
  "scripts": {
    "build": "tsc -p tsconfig.json"
  },
  "repository": { "type": "git", "url": "https://github.com/pbiplint/pbiplint" },
  "engines": { "node": ">=20" }
}
```

`packages/core/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": { "rootDir": "src", "outDir": "dist" },
  "include": ["src"]
}
```

`packages/core/src/index.ts`:

```ts
export const VERSION = "0.0.0";
```

- [ ] **Step 3: Create the CLI package**

`packages/cli/package.json`:

```json
{
  "name": "pbiplint",
  "version": "0.0.0",
  "description": "Lint Power BI semantic models (TMDL) for best-practice violations. Nothing is uploaded.",
  "license": "MIT",
  "type": "module",
  "bin": { "pbiplint": "./dist/pbiplint.mjs" },
  "files": ["dist", "sample"],
  "scripts": {
    "build": "node build.mjs"
  },
  "repository": { "type": "git", "url": "https://github.com/pbiplint/pbiplint" },
  "engines": { "node": ">=20" }
}
```

`packages/cli/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "rootDir": "src",
    "noEmit": true,
    "composite": false,
    "declaration": false,
    "paths": { "@pbiplint/core": ["../core/src/index.ts"] }
  },
  "include": ["src"]
}
```

`packages/cli/src/bin.ts`:

```ts
import { VERSION } from "@pbiplint/core";

console.log(`pbiplint ${VERSION}`);
```

- [ ] **Step 4: Install dev dependencies**

Run from the repo root (this picks current versions; do not pin older ones by hand):

```bash
npm install -D typescript vitest esbuild eslint @eslint/js typescript-eslint prettier @types/node
```

Expected: `package-lock.json` created, `node_modules/@pbiplint/core` is a symlink to `packages/core`.

- [ ] **Step 5: Write the smoke test**

`packages/core/test/index.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { VERSION } from "@pbiplint/core";

describe("core package", () => {
  it("exports a version string", () => {
    expect(VERSION).toMatch(/^\d+\.\d+\.\d+$/);
  });
});
```

- [ ] **Step 6: Run everything**

Run: `npm test && npm run typecheck && npm run lint`
Expected: 1 test passes; `tsc -b` emits `packages/core/dist/index.js`; eslint and prettier report no problems. If prettier complains about formatting, run `npm run format` and re-run.

- [ ] **Step 7: Commit**

```bash
git add package.json package-lock.json tsconfig.base.json vitest.config.ts eslint.config.js .prettierrc .prettierignore .editorconfig .gitignore packages
git commit -m "chore: scaffold npm workspaces monorepo with core and cli packages"
```

---

### Task 2: TMDL parser

**Files:**
- Create: `packages/core/src/tmdl/types.ts`, `packages/core/src/tmdl/quote.ts`, `packages/core/src/tmdl/parse.ts`
- Create: `tests/fixtures/spec-sample.tmdl` (copy of `$SPIKE/spec-sample.tmdl`, unchanged)
- Test: `packages/core/test/parse.test.ts`

**Interfaces:**
- Produces: `parseTmdl(file: string, text: string): ParsedFile`; `TmdlNode { kind, type, name?, value?, props, children, description?, file, line, indent }` where `type` and every key of `props` are lowercased; `ParsedFile { file, roots, issues, lineCount }`; `ParseIssue { file, line, text, reason }`; `unquoteName`, `unquoteValue`.

- [ ] **Step 1: Copy the spec sample fixture**

```bash
mkdir -p tests/fixtures && cp "$SPIKE/spec-sample.tmdl" tests/fixtures/spec-sample.tmdl
```

- [ ] **Step 2: Write the failing tests**

`packages/core/test/parse.test.ts`:

```ts
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseTmdl } from "../src/tmdl/parse.js";
import { unquoteName, unquoteValue } from "../src/tmdl/quote.js";

const specSample = readFileSync(new URL("../../../tests/fixtures/spec-sample.tmdl", import.meta.url), "utf8");

describe("quote helpers", () => {
  it("unquotes single-quoted names and doubled quotes", () => {
    expect(unquoteName("'O''Brien'")).toBe("O'Brien");
    expect(unquoteName("Plain")).toBe("Plain");
    expect(unquoteName("  'Net Price'  ")).toBe("Net Price");
  });
  it("unquotes double-quoted values and doubled quotes", () => {
    expect(unquoteValue('" My ""Amazing"" Measures"')).toBe(' My "Amazing" Measures');
    expect(unquoteValue("Long Date")).toBe("Long Date");
  });
});

describe("parseTmdl", () => {
  it("parses the spec sample with no issues", () => {
    const pf = parseTmdl("spec-sample.tmdl", specSample);
    expect(pf.issues).toEqual([]);
    expect(pf.roots.map((r) => `${r.kind}:${r.type}${r.name ? " " + r.name : ""}`)).toEqual([
      "object:database Sales",
      "object:model Model",
      "object:annotation PBI_QueryOrder",
      "object:table Sales",
      "object:table Sales",
      "object:table O'Brien",
      "object:relationship cdb6e6a9-c9d1-42b9-b9e0-484a1bc7e123",
      "object:role Role_Store1",
      "object:perspective Product",
      "object:expression Server",
      "object:expression Database",
      "object:cultureinfo en-US",
      "object:function Sales.Rate",
    ]);
  });

  it("attaches /// description lines to the next declaration", () => {
    const pf = parseTmdl("f.tmdl", specSample);
    const sales = pf.roots[3]!;
    expect(sales.description).toBe("Table Description");
    const measure = sales.children.find((c) => c.type === "measure" && c.name === "Sales Amount")!;
    expect(measure.description).toBe("This is the Measure Description\nOne more line");
  });

  it("lowercases keys and reads flags, properties, and quoted values", () => {
    const pf = parseTmdl("f.tmdl", specSample);
    const sales = pf.roots[3]!;
    const quantity = sales.children.find((c) => c.type === "column" && c.name === "Quantity")!;
    expect(quantity.props).toEqual({
      datatype: "int64",
      ishidden: true,
      isavailableinmdx: "false",
      sourcecolumn: "Quantity",
      summarizeby: "None",
    });
    const netPrice = sales.children.find((c) => c.name === "Net Price")!;
    expect(netPrice.props.sourcecolumn).toBe("Net Price");
    const measure = sales.children.find((c) => c.name === "Sales Amount")!;
    expect(measure.props.displayfolder).toBe(' My "Amazing" Measures');
    expect(measure.props.formatstring).toBe("$ #,##0");
  });

  it("reads inline, indented, and fenced expressions", () => {
    const pf = parseTmdl("f.tmdl", specSample);
    const sales = pf.roots[3]!;
    const byName = (n: string) => sales.children.find((c) => c.name === n)!;
    expect(byName("Sales Amount").value).toBe("SUMX('Sales', [Quantity] * [Net Price])");
    expect(byName("Sales (ly)").value).toBe(
      "var ly = CALCULATE([Sales Amount], SAMEPERIODLASTYEAR('Calendar'[Date]))\nreturn ly",
    );
    expect(byName("Measure1").value).toBe("\tvar myVar = Today()\n\treturn myVar");
    const partition = byName("Sales-Partition");
    expect(partition.value).toBe("m");
    expect(partition.props.mode).toBe("import");
    expect(partition.props.source).toBe("let\n\tSource = Sql.Database(Server, Database)\nin\n\tSource\n");
  });

  it("uses the first block line to set expression indentation, like the TMDL reader", () => {
    const text = "table T\n\tmeasure Empty =\n\t\tlineageTag: abc\n\n\tmeasure Next = 1\n";
    const pf = parseTmdl("f.tmdl", text);
    const t = pf.roots[0]!;
    expect(t.children[0]!.value).toBe("lineageTag: abc");
    expect(t.children[0]!.props).toEqual({});
    expect(t.children[1]!.value).toBe("1");
  });

  it("parses calculation groups, hierarchies, roles, perspectives, cultures, and functions", () => {
    const pf = parseTmdl("f.tmdl", specSample);
    const sales = pf.roots[3]!;
    const cg = sales.children.find((c) => c.type === "calculationgroup")!;
    expect(cg.kind).toBe("flag");
    expect(cg.props.precedence).toBe("1");
    expect(cg.children.filter((c) => c.type === "calculationitem").map((c) => c.name)).toEqual(["YTD", "Prior Year"]);
    const prior = cg.children[2]!;
    expect(prior.value).toBe("CALCULATE(\n\tSELECTEDMEASURE(),\n\tSAMEPERIODLASTYEAR('Calendar'[Date])\n)");
    expect(prior.props.formatstringdefinition).toBe('"0.0%"');
    const hier = sales.children.find((c) => c.type === "hierarchy")!;
    expect(hier.children[0]!.type).toBe("level");
    expect(hier.children[0]!.props.column).toBe("Category");
    const role = pf.roots[7]!;
    expect(role.children[0]!.type).toBe("tablepermission");
    expect(role.children[0]!.value).toBe("'Store'[Store Code] IN {1,10,20,30}");
    const culture = pf.roots[11]!;
    expect(culture.children[0]!.type).toBe("linguisticmetadata");
    expect(culture.children[0]!.value).toContain('"Version": "1.0.0"');
    expect(culture.children[0]!.props.contenttype).toBe("json");
    const fn = pf.roots[12]!;
    expect(fn.value).toBe("(x: INT64) => x * 2");
  });

  it("parses ref lines and CRLF input", () => {
    const pf = parseTmdl("model.tmdl", "model Model\r\n\tculture: en-US\r\n\r\nref table Sales\r\nref cultureInfo en-US\r\n");
    expect(pf.roots[1]).toMatchObject({ kind: "ref", type: "table", name: "Sales", line: 4 });
    expect(pf.roots[2]).toMatchObject({ kind: "ref", type: "cultureinfo", name: "en-US" });
  });

  it("parses a flag with children (query partition source)", () => {
    const text =
      "table Legacy\n\tpartition Legacy = query\n\t\tdataView: full\n\t\tsource\n\t\t\tquery = SELECT * FROM dbo.Legacy\n\t\t\tdataSource: 'Legacy SQL'\n";
    const pf = parseTmdl("f.tmdl", text);
    const partition = pf.roots[0]!.children[0]!;
    expect(partition.value).toBe("query");
    const source = partition.children.find((c) => c.type === "source")!;
    expect(source.kind).toBe("flag");
    expect(source.props).toEqual({ query: "SELECT * FROM dbo.Legacy", datasource: "Legacy SQL" });
  });

  it("reports space indentation and unterminated fences as issues, not exceptions", () => {
    const pf = parseTmdl("bad.tmdl", "table T\n    column C\n\tmeasure M = ```\n\t\tx\n");
    expect(pf.issues.map((i) => [i.line, i.reason])).toEqual([
      [2, "space indentation (TMDL requires tabs)"],
      [3, "unterminated ``` fence"],
    ]);
  });

  it("reports orphan indentation", () => {
    const pf = parseTmdl("bad.tmdl", "\t\tcolumn C\n");
    expect(pf.issues[0]).toMatchObject({ line: 1, reason: "orphan indentation" });
  });

  it("records file, line, and indent on every node", () => {
    const pf = parseTmdl("tables/Sales.tmdl", "table Sales\n\n\tcolumn A\n\t\tdataType: int64\n");
    expect(pf.roots[0]).toMatchObject({ file: "tables/Sales.tmdl", line: 1, indent: 0 });
    expect(pf.roots[0]!.children[0]).toMatchObject({ line: 3, indent: 1 });
    expect(pf.roots[0]!.children[0]!.children[0]).toMatchObject({ line: 4, indent: 2, kind: "prop" });
  });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npm test -- parse`
Expected: FAIL, "Cannot find module '../src/tmdl/parse.js'".

- [ ] **Step 4: Write the types and quote helpers**

`packages/core/src/tmdl/types.ts`:

```ts
export type TmdlNodeKind = "object" | "prop" | "flag" | "ref" | "expr";

/** One line of TMDL and everything indented beneath it. `type` and `props` keys are lowercased. */
export interface TmdlNode {
  kind: TmdlNodeKind;
  /** Object type (`table`, `column`), property key (`datatype`), flag (`ishidden`), or ref target type. */
  type: string;
  /** Unquoted object name, for `object` and `ref` nodes. */
  name?: string;
  /** Property value (unquoted) for `prop`; expression text for `expr` and for `object` nodes declared with `=`. */
  value?: string;
  /** Child properties, flags, and expressions by lowercased key. Flags are `true`. */
  props: Record<string, string | true>;
  children: TmdlNode[];
  /** Joined `///` lines that preceded the declaration. */
  description?: string;
  file: string;
  line: number;
  indent: number;
}

export interface ParseIssue {
  file: string;
  line: number;
  text: string;
  reason: string;
}

export interface ParsedFile {
  file: string;
  roots: TmdlNode[];
  issues: ParseIssue[];
  lineCount: number;
}
```

`packages/core/src/tmdl/quote.ts`:

```ts
/** Strip single quotes from a TMDL object name; `''` inside is one quote. */
export function unquoteName(s: string): string {
  const t = s.trim();
  if (t.length >= 2 && t.startsWith("'") && t.endsWith("'")) return t.slice(1, -1).replace(/''/g, "'");
  return t;
}

/** Strip double quotes from a TMDL property value; `""` inside is one quote. */
export function unquoteValue(s: string): string {
  const t = s.trim();
  if (t.length >= 2 && t.startsWith('"') && t.endsWith('"')) return t.slice(1, -1).replace(/""/g, '"');
  return t;
}
```

- [ ] **Step 5: Write the parser**

`packages/core/src/tmdl/parse.ts`:

```ts
import { unquoteName, unquoteValue } from "./quote.js";
import type { ParsedFile, ParseIssue, TmdlNode } from "./types.js";

const HEADER = /^([A-Za-z_]\w*)(?:\s+(.+))?$/;
const PROP = /^([A-Za-z_]\w*):(?:\s(.*))?$/;
const REF = /^ref\s+([A-Za-z_]\w*)\s+(.+)$/;

const tabIndent = (line: string): number => {
  let n = 0;
  while (line[n] === "\t") n++;
  return n;
};
const leadingWs = (line: string): number => line.length - line.trimStart().length;

/** Split `<type> <name> [= expr]` on the first `=` outside single quotes. */
function splitHeader(content: string): { type: string; name?: string; hasEq: boolean; inline: string } | null {
  let inQuote = false;
  let eqAt = -1;
  for (let i = 0; i < content.length; i++) {
    const ch = content[i];
    if (ch === "'") inQuote = !inQuote;
    else if (ch === "=" && !inQuote) {
      eqAt = i;
      break;
    }
  }
  const left = (eqAt >= 0 ? content.slice(0, eqAt) : content).trim();
  const inline = eqAt >= 0 ? content.slice(eqAt + 1).trim() : "";
  const m = HEADER.exec(left);
  if (!m) return null;
  return { type: m[1]!, name: m[2] === undefined ? undefined : unquoteName(m[2]), hasEq: eqAt >= 0, inline };
}

/**
 * Generic TMDL tree parser. Unknown object types and properties parse as generic nodes,
 * so a construct this code has never seen never aborts a run.
 */
export function parseTmdl(file: string, text: string): ParsedFile {
  const lines = text.replace(/\r\n?/g, "\n").split("\n");
  const roots: TmdlNode[] = [];
  const issues: ParseIssue[] = [];
  const stack: TmdlNode[] = [];
  let pendingDescription: string[] = [];
  let i = 0;

  while (i < lines.length) {
    const raw = lines[i]!;
    const lineNo = i + 1;
    if (raw.trim() === "") {
      i++;
      continue;
    }
    const indent = tabIndent(raw);
    const content = raw.slice(indent);
    if (content.startsWith("///")) {
      pendingDescription.push(content.replace(/^\/\/\/ ?/, ""));
      i++;
      continue;
    }
    if (/^\s/.test(content)) {
      issues.push({ file, line: lineNo, text: raw, reason: "space indentation (TMDL requires tabs)" });
      i++;
      continue;
    }

    // Indented multi-line expression. The first non-blank line after the header sets the block
    // indentation; the block continues while lines are blank or indented at least that much.
    const collectBlock = (): string => {
      let j = i + 1;
      while (j < lines.length && lines[j]!.trim() === "") j++;
      if (j >= lines.length) return "";
      const blockIndent = leadingWs(lines[j]!);
      if (blockIndent <= indent) return "";
      const out: string[] = [];
      let lastNonBlank = -1;
      for (; j < lines.length; j++) {
        const l = lines[j]!;
        if (l.trim() === "") {
          out.push("");
          continue;
        }
        if (leadingWs(l) < blockIndent) break;
        out.push(l.slice(blockIndent));
        lastNonBlank = out.length - 1;
      }
      i = j - 1;
      return out.slice(0, lastNonBlank + 1).join("\n");
    };

    // Fenced expression: header ends with ```; closed by a line that is only ```; that closing
    // line's leading whitespace is the left boundary stripped from every line.
    const collectFenced = (): string => {
      const out: string[] = [];
      let j = i + 1;
      while (j < lines.length && lines[j]!.trim() !== "```") {
        out.push(lines[j]!);
        j++;
      }
      if (j >= lines.length) issues.push({ file, line: lineNo, text: raw, reason: "unterminated ``` fence" });
      const boundary = j < lines.length ? leadingWs(lines[j]!) : 0;
      i = j;
      return out.map((l) => l.slice(Math.min(boundary, leadingWs(l)))).join("\n");
    };

    const base = { props: {} as Record<string, string | true>, children: [] as TmdlNode[], file, line: lineNo, indent };
    let node: TmdlNode;
    let m: RegExpExecArray | null;
    if ((m = REF.exec(content))) {
      node = { ...base, kind: "ref", type: m[1]!.toLowerCase(), name: unquoteName(m[2]!) };
    } else if ((m = PROP.exec(content))) {
      node = { ...base, kind: "prop", type: m[1]!.toLowerCase(), value: unquoteValue(m[2] ?? "") };
    } else {
      const h = splitHeader(content);
      if (!h) {
        issues.push({ file, line: lineNo, text: raw, reason: "unrecognized line" });
        i++;
        continue;
      }
      if (h.hasEq) {
        const value = h.inline === "```" ? collectFenced() : h.inline === "" ? collectBlock() : h.inline;
        node =
          h.name === undefined
            ? { ...base, kind: "expr", type: h.type.toLowerCase(), value }
            : { ...base, kind: "object", type: h.type.toLowerCase(), name: h.name, value };
      } else if (h.name !== undefined) {
        node = { ...base, kind: "object", type: h.type.toLowerCase(), name: h.name };
      } else {
        node = { ...base, kind: "flag", type: h.type.toLowerCase() };
      }
    }

    if (pendingDescription.length) {
      node.description = pendingDescription.join("\n");
      pendingDescription = [];
    }
    stack.length = indent;
    const parent = indent > 0 ? stack[indent - 1] : undefined;
    if (indent > 0 && !parent) {
      issues.push({ file, line: lineNo, text: raw, reason: "orphan indentation" });
      i++;
      continue;
    }
    if (parent) {
      if (node.kind === "prop" || node.kind === "expr") parent.props[node.type] = node.value ?? "";
      else if (node.kind === "flag") parent.props[node.type] = true;
      parent.children.push(node);
    } else {
      roots.push(node);
    }
    stack[indent] = node;
    i++;
  }
  return { file, roots, issues, lineCount: lines.length };
}
```

Note on `stack.length = indent`: JavaScript truncates or extends the array; an extended slot is `undefined`, which is why the orphan check reads `stack[indent - 1]` after truncation.

- [ ] **Step 6: Export from the index and run the tests**

Add to `packages/core/src/index.ts`:

```ts
export { parseTmdl } from "./tmdl/parse.js";
export { unquoteName, unquoteValue } from "./tmdl/quote.js";
export type { ParsedFile, ParseIssue, TmdlNode, TmdlNodeKind } from "./tmdl/types.js";
```

Run: `npm test -- parse`
Expected: PASS (11 tests). Two fenced-expression details are deliberate: the partition `source` ends in `\n` because the fixture has a blank line before the closing fence, and `Measure1` keeps one leading tab per line because its content is indented one level deeper than the closing fence. `formatStringDefinition` keeps its double quotes because it is a DAX expression, not a property value.

- [ ] **Step 7: Commit**

```bash
git add packages/core/src/tmdl packages/core/src/index.ts packages/core/test/parse.test.ts tests/fixtures/spec-sample.tmdl
git commit -m "feat(core): add generic TMDL tree parser"
```

---

### Task 3: Object model

**Files:**
- Create: `packages/core/src/model/types.ts`, `packages/core/src/model/build.ts`
- Create: `packages/core/test/helpers.ts`
- Test: `packages/core/test/build.test.ts`

**Interfaces:**
- Consumes: `parseTmdl`, `ParsedFile`, `TmdlNode`, `unquoteName` (Task 2).
- Produces: `buildModel(files: ParsedFile[]): Model` and the types below. Every object has `name`, `description?`, `annotations` (from child `annotation` nodes), `location { file, line }`, and `node`. `Table.kind` is `"table" | "calculated" | "calculationGroup"`; `Column.kind` is `"data" | "calculated" | "calculatedTable"`. Relationship defaults: `crossFilteringBehavior: "onedirection"`, `fromCardinality: "many"`, `toCardinality: "one"` (all lowercased). `TablePermission.filter` is `undefined` when the permission has no `= expression`. Test helper `modelFrom(tmdl: string): Model` parses one string as file `inline.tmdl`.

- [ ] **Step 1: Write the failing tests**

`packages/core/test/helpers.ts`:

```ts
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { buildModel } from "../src/model/build.js";
import type { Model } from "../src/model/types.js";
import { parseTmdl } from "../src/tmdl/parse.js";
import type { ParsedFile } from "../src/tmdl/types.js";

export function modelFrom(tmdl: string): Model {
  return buildModel([parseTmdl("inline.tmdl", tmdl)]);
}

/** Read every .tmdl under `<root>/definition` (or under `<root>` when it is itself a definition folder). */
export function readModelFiles(root: string): { path: string; text: string }[] {
  const base = statSync(join(root, "definition"), { throwIfNoEntry: false })?.isDirectory() ? join(root, "definition") : root;
  const out: { path: string; text: string }[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const p = join(dir, entry.name);
      if (entry.isDirectory()) walk(p);
      else if (entry.name.endsWith(".tmdl")) out.push({ path: relative(root, p).split("\\").join("/"), text: readFileSync(p, "utf8") });
    }
  };
  walk(base);
  return out;
}

export function parseModelDir(root: string): ParsedFile[] {
  return readModelFiles(root).map((f) => parseTmdl(f.path, f.text));
}

export const fixturesDir = new URL("../../../tests/fixtures/", import.meta.url).pathname;
export const examplesDir = new URL("../../../examples/", import.meta.url).pathname;
```

`packages/core/test/build.test.ts`:

```ts
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buildModel, splitQualifiedName } from "../src/model/build.js";
import { parseTmdl } from "../src/tmdl/parse.js";
import { fixturesDir, modelFrom } from "./helpers.js";

const specSample = readFileSync(fixturesDir + "spec-sample.tmdl", "utf8");

describe("splitQualifiedName", () => {
  it("splits quoted and unquoted table.column references", () => {
    expect(splitQualifiedName("Sales.'Product Key'")).toEqual({ table: "Sales", column: "Product Key" });
    expect(splitQualifiedName("'Region Security'.Region")).toEqual({ table: "Region Security", column: "Region" });
    expect(splitQualifiedName("Date.Date")).toEqual({ table: "Date", column: "Date" });
    expect(splitQualifiedName("'O''Brien'.'A.B'")).toEqual({ table: "O'Brien", column: "A.B" });
  });
});

describe("buildModel on the spec sample", () => {
  const model = buildModel([parseTmdl("spec-sample.tmdl", specSample)]);

  it("reads model name, properties, and root annotations", () => {
    expect(model.name).toBe("Model");
    expect(model.props.culture).toBe("en-US");
    expect(model.annotations.PBI_QueryOrder).toBe('["Sales"]');
  });

  it("merges partial table declarations by name and keeps descriptions", () => {
    expect(model.tables.map((t) => t.name)).toEqual(["Sales", "O'Brien"]);
    const sales = model.tables[0]!;
    expect(sales.description).toBe("Table Description");
    expect(sales.measures.map((m) => m.name)).toEqual(["Sales Amount", "Sales (ly)", "Measure1", "Partial Measure"]);
    expect(model.tables[1]!.isHidden).toBe(true);
  });

  it("builds columns with kinds, flags, and sort-by", () => {
    const sales = model.tables[0]!;
    const byName = (n: string) => sales.columns.find((c) => c.name === n)!;
    expect(byName("Quantity")).toMatchObject({ kind: "data", dataType: "int64", isHidden: true, isAvailableInMdx: false, summarizeBy: "None" });
    expect(byName("Net Price").sourceColumn).toBe("Net Price");
    expect(byName("Category").sortByColumn).toBe("Category Order");
    expect(byName("Margin %")).toMatchObject({ kind: "calculated", expression: "DIVIDE([Sales Amount], 1)", dataType: "double" });
    expect(byName("Quantity").table).toBe(sales);
  });

  it("builds measures, partitions, hierarchies, and the calculation group", () => {
    const sales = model.tables[0]!;
    expect(sales.measures[0]).toMatchObject({ formatString: "$ #,##0", displayFolder: ' My "Amazing" Measures', description: "This is the Measure Description\nOne more line" });
    expect(sales.partitions[0]).toMatchObject({ name: "Sales-Partition", sourceType: "m", mode: "import" });
    expect(sales.partitions[0]!.source).toContain("Sql.Database(Server, Database)");
    expect(sales.hierarchies[0]!.levels).toEqual([expect.objectContaining({ name: "Category", column: "Category" })]);
    expect(sales.kind).toBe("table");
    expect(sales.calculationGroup).toMatchObject({ name: "Sales", precedence: 1 });
    expect(sales.calculationGroup!.items.map((i) => i.name)).toEqual(["YTD", "Prior Year"]);
    expect(sales.calculationGroup!.items[1]!.formatStringDefinition).toBe('"0.0%"');
  });

  it("builds relationships with defaults, roles with table permissions, perspectives, expressions, cultures, functions", () => {
    expect(model.relationships[0]).toMatchObject({
      fromTable: "Sales", fromColumn: "Product Key", toTable: "Product", toColumn: "Product Key",
      isActive: true, crossFilteringBehavior: "onedirection", fromCardinality: "many", toCardinality: "one",
    });
    const role = model.roles[0]!;
    expect(role).toMatchObject({ name: "Role_Store1", modelPermission: "read" });
    expect(role.tablePermissions[0]).toMatchObject({ table: "Store", filter: "'Store'[Store Code] IN {1,10,20,30}" });
    expect(role.tablePermissions[0]!.role).toBe(role);
    expect(role.members).toEqual([]);
    expect(model.perspectives[0]).toMatchObject({ name: "Product", tables: ["Product"] });
    expect(model.expressions.map((e) => e.name)).toEqual(["Server", "Database"]);
    expect(model.cultures[0]!.name).toBe("en-US");
    expect(model.functions[0]).toMatchObject({ name: "Sales.Rate", expression: "(x: INT64) => x * 2" });
  });
});

describe("buildModel on hand-written constructs", () => {
  it("classifies calculated tables and their columns", () => {
    const m = modelFrom(
      "table Calc\n\tcolumn Date\n\t\tdataType: dateTime\n\t\tisNameInferred\n\t\tsourceColumn: [Date]\n\tcolumn Year = YEAR([Date])\n\t\tdataType: int64\n\tpartition Calc = calculated\n\t\tmode: import\n\t\tsource = CALENDARAUTO()\n",
    );
    const t = m.tables[0]!;
    expect(t.kind).toBe("calculated");
    expect(t.columns.map((c) => c.kind)).toEqual(["calculatedTable", "calculated"]);
    expect(t.partitions[0]).toMatchObject({ sourceType: "calculated", source: "CALENDARAUTO()" });
  });

  it("classifies calculation group tables", () => {
    const m = modelFrom("table CG\n\tcalculationGroup\n\t\tprecedence: 2\n\tcolumn Name\n\t\tdataType: string\n\t\tsourceColumn: Name\n\tpartition CG = calculationGroup\n\t\tmode: import\n");
    expect(m.tables[0]!.kind).toBe("calculationGroup");
    expect(m.tables[0]!.columns[0]!.kind).toBe("data");
    expect(m.tables[0]!.calculationGroup!.items).toEqual([]);
  });

  it("reads query partitions with a data source, and data sources with kinds", () => {
    const m = modelFrom(
      "model Model\n\ndataSource 'Legacy SQL' = provider\n\tconnectionString: x\n\ndataSource SQL/localhost;Sales\n\tconnectionDetails =\n\t\t\t{}\n\ntable Legacy\n\tpartition Legacy = query\n\t\tdataView: full\n\t\tsource\n\t\t\tquery = SELECT * FROM dbo.Legacy\n\t\t\tdataSource: 'Legacy SQL'\n",
    );
    expect(m.dataSources.map((d) => [d.name, d.kind])).toEqual([["Legacy SQL", "provider"], ["SQL/localhost;Sales", "structured"]]);
    expect(m.tables[0]!.partitions[0]).toMatchObject({ sourceType: "query", source: "SELECT * FROM dbo.Legacy", dataSource: "Legacy SQL" });
  });

  it("reads role members, metadata permissions, and column permissions", () => {
    const m = modelFrom(
      "role Admins\n\tmodelPermission: administrator\n\tmember 'admin@example.com'\n\t\tidentityProvider: AzureAD\n\t\tmemberType: user\n\ttablePermission 'Sensitive Notes'\n\t\tmetadataPermission: none\n\ttablePermission Product\n\t\tcolumnPermission 'Cost Price' = none\n",
    );
    const role = m.roles[0]!;
    expect(role.members.map((x) => x.name)).toEqual(["admin@example.com"]);
    expect(role.tablePermissions[0]).toMatchObject({ table: "Sensitive Notes", filter: undefined, metadataPermission: "none" });
    expect(role.tablePermissions[1]!.columnPermissions).toEqual([{ column: "Cost Price", permission: "none" }]);
  });

  it("reads variations, alternateOf, and relationship options", () => {
    const m = modelFrom(
      "table Customer\n\tcolumn 'Join Date'\n\t\tdataType: dateTime\n\t\tvariation Variation\n\t\t\tisDefault\n\t\t\trelationship: rel1\n\t\t\tdefaultHierarchy: LocalDateTable_x.'Date Hierarchy'\n\t\t\tdefaultColumn: LocalDateTable_x.Date\n\tcolumn Agg\n\t\tdataType: int64\n\t\talternateOf\n\t\t\tbaseTable: Sales\n\t\t\tsummarization: sum\n\nrelationship rel1\n\tisActive: false\n\tcrossFilteringBehavior: bothDirections\n\tfromCardinality: many\n\ttoCardinality: many\n\tfromColumn: Customer.'Join Date'\n\ttoColumn: LocalDateTable_x.Date\n",
    );
    const c = m.tables[0]!.columns[0]!;
    expect(c.variations).toEqual([{ name: "Variation", relationship: "rel1", defaultHierarchy: "LocalDateTable_x.'Date Hierarchy'", defaultColumn: { table: "LocalDateTable_x", column: "Date" } }]);
    expect(m.tables[0]!.columns[1]!.hasAlternateOf).toBe(true);
    expect(m.relationships[0]).toMatchObject({ isActive: false, crossFilteringBehavior: "bothdirections", fromCardinality: "many", toCardinality: "many" });
  });

  it("keeps ignore annotations and source locations on objects", () => {
    const m = modelFrom("table T\n\tannotation pbiplint.ignore = A, B\n\n\tcolumn C\n\t\tdataType: string\n\n\t\tannotation pbiplint.ignore = *\n");
    expect(m.tables[0]!.annotations["pbiplint.ignore"]).toBe("A, B");
    expect(m.tables[0]!.columns[0]!.annotations["pbiplint.ignore"]).toBe("*");
    expect(m.tables[0]!.columns[0]!.location).toEqual({ file: "inline.tmdl", line: 4 });
  });

  it("synthesizes a model object when no model.tmdl is present", () => {
    const m = modelFrom("table T\n");
    expect(m.name).toBe("Model");
    expect(m.location).toEqual({ file: "", line: 0 });
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- build`
Expected: FAIL, cannot find `../src/model/build.js`.

- [ ] **Step 3: Write the types**

`packages/core/src/model/types.ts`:

```ts
import type { ParsedFile, TmdlNode } from "../tmdl/types.js";

export interface SourceLocation {
  file: string;
  line: number;
}

/** Fields shared by every model object. */
export interface Named {
  name: string;
  description?: string;
  /** Child `annotation` nodes by name. */
  annotations: Record<string, string>;
  location: SourceLocation;
  node?: TmdlNode;
}

export type TableKind = "table" | "calculated" | "calculationGroup";
export type ColumnKind = "data" | "calculated" | "calculatedTable";

export interface Model extends Named {
  /** Properties declared under `model`, keys lowercased. */
  props: Record<string, string | true>;
  tables: Table[];
  relationships: Relationship[];
  roles: Role[];
  perspectives: Perspective[];
  cultures: Culture[];
  expressions: NamedExpression[];
  functions: DaxFunction[];
  dataSources: DataSource[];
  files: ParsedFile[];
}

export interface Table extends Named {
  kind: TableKind;
  isHidden: boolean;
  dataCategory?: string;
  columns: Column[];
  measures: Measure[];
  partitions: Partition[];
  hierarchies: Hierarchy[];
  calculationGroup?: CalculationGroup;
}

export interface Variation {
  name: string;
  relationship?: string;
  defaultHierarchy?: string;
  defaultColumn?: { table: string; column: string };
}

export interface Column extends Named {
  table: Table;
  kind: ColumnKind;
  dataType?: string;
  isHidden: boolean;
  isKey: boolean;
  /** TOM default is true; TMDL only writes `isAvailableInMdx: false`. */
  isAvailableInMdx: boolean;
  formatString?: string;
  summarizeBy?: string;
  sourceColumn?: string;
  sortByColumn?: string;
  dataCategory?: string;
  expression?: string;
  variations: Variation[];
  hasAlternateOf: boolean;
}

export interface Measure extends Named {
  table: Table;
  expression: string;
  formatString?: string;
  /** Raw DAX of `formatStringDefinition = ...`, quotes included. */
  formatStringDefinition?: string;
  isHidden: boolean;
  displayFolder?: string;
}

export interface Partition extends Named {
  table: Table;
  /** Lowercased word after `=` in the header: m, calculated, query, calculationgroup, entity, ... */
  sourceType: string;
  mode?: string;
  /** M, DAX, or native query text. */
  source?: string;
  dataSource?: string;
}

export interface Hierarchy extends Named {
  table: Table;
  isHidden: boolean;
  levels: Level[];
}

export interface Level extends Named {
  hierarchy: Hierarchy;
  column?: string;
}

export interface CalculationGroup extends Named {
  table: Table;
  precedence?: number;
  items: CalculationItem[];
}

export interface CalculationItem extends Named {
  table: Table;
  expression: string;
  formatStringDefinition?: string;
}

export interface Relationship extends Named {
  fromTable: string;
  fromColumn: string;
  toTable: string;
  toColumn: string;
  isActive: boolean;
  /** Lowercased: onedirection | bothdirections | automatic */
  crossFilteringBehavior: string;
  /** Lowercased: many | one | none */
  fromCardinality: string;
  toCardinality: string;
}

export interface RoleMember {
  name: string;
}

export interface TablePermission extends Named {
  role: Role;
  /** Same as `name`: the table the permission applies to. */
  table: string;
  /** DAX filter expression; undefined when the permission declares none. */
  filter?: string;
  /** Lowercased, for object-level security (`none`, `default`, ...). */
  metadataPermission?: string;
  columnPermissions: { column: string; permission: string }[];
}

export interface Role extends Named {
  modelPermission?: string;
  members: RoleMember[];
  tablePermissions: TablePermission[];
}

export interface Perspective extends Named {
  /** Names of `perspectiveTable` children. */
  tables: string[];
}

export type Culture = Named;

export interface NamedExpression extends Named {
  expression: string;
}

export interface DaxFunction extends Named {
  expression: string;
}

export interface DataSource extends Named {
  kind: "provider" | "structured";
}
```

- [ ] **Step 4: Write the builder**

`packages/core/src/model/build.ts`:

```ts
import { unquoteName } from "../tmdl/quote.js";
import type { ParsedFile, TmdlNode } from "../tmdl/types.js";
import type {
  CalculationGroup, CalculationItem, Column, DataSource, Hierarchy, Level, Measure, Model, Named, Partition,
  Perspective, Relationship, Role, SourceLocation, Table, TablePermission, Variation,
} from "./types.js";

const str = (v: string | true | undefined): string | undefined => (typeof v === "string" ? v : undefined);
const flag = (v: string | true | undefined): boolean => v === true || (typeof v === "string" && v.toLowerCase() === "true");
const lower = (v: string | true | undefined): string | undefined => str(v)?.toLowerCase();
const loc = (n: TmdlNode): SourceLocation => ({ file: n.file, line: n.line });
const objects = (n: TmdlNode, type: string): TmdlNode[] => n.children.filter((c) => c.kind === "object" && c.type === type);

function annotationsOf(n: TmdlNode): Record<string, string> {
  const out: Record<string, string> = {};
  for (const c of objects(n, "annotation")) out[c.name!] = c.value ?? "";
  return out;
}

function named(n: TmdlNode, name = n.name ?? ""): Named {
  return { name, description: n.description, annotations: annotationsOf(n), location: loc(n), node: n };
}

/** Split `Table.Column` or `'Some Table'.'Some Column'` into its unquoted parts. */
export function splitQualifiedName(ref: string): { table: string; column: string } {
  const m = /^('(?:[^']|'')*'|[^.]+)\.('(?:[^']|'')*'|.+)$/.exec(ref.trim());
  return m ? { table: unquoteName(m[1]!), column: unquoteName(m[2]!) } : { table: "", column: unquoteName(ref) };
}

function buildColumn(c: TmdlNode, table: Table): Column {
  const p = c.props;
  const variations: Variation[] = objects(c, "variation").map((v) => {
    const dc = str(v.props.defaultcolumn);
    return {
      name: v.name!,
      relationship: str(v.props.relationship),
      defaultHierarchy: str(v.props.defaulthierarchy),
      defaultColumn: dc ? splitQualifiedName(dc) : undefined,
    };
  });
  const sortBy = str(p.sortbycolumn);
  return {
    ...named(c),
    table,
    kind: "data",
    dataType: str(p.datatype),
    isHidden: flag(p.ishidden),
    isKey: flag(p.iskey),
    isAvailableInMdx: p.isavailableinmdx === undefined ? true : flag(p.isavailableinmdx),
    formatString: str(p.formatstring),
    summarizeBy: str(p.summarizeby),
    sourceColumn: str(p.sourcecolumn),
    sortByColumn: sortBy === undefined ? undefined : unquoteName(sortBy),
    dataCategory: str(p.datacategory),
    expression: c.value,
    variations,
    hasAlternateOf: c.children.some((ch) => ch.type === "alternateof"),
  };
}

function buildMeasure(x: TmdlNode, table: Table): Measure {
  const p = x.props;
  return {
    ...named(x),
    table,
    expression: x.value ?? "",
    formatString: str(p.formatstring),
    formatStringDefinition: str(p.formatstringdefinition),
    isHidden: flag(p.ishidden),
    displayFolder: str(p.displayfolder),
  };
}

function buildPartition(pt: TmdlNode, table: Table): Partition {
  const sourceNode = pt.children.find((ch) => ch.type === "source" && ch.kind === "flag");
  const ds = str(sourceNode?.props.datasource);
  return {
    ...named(pt),
    table,
    sourceType: (pt.value ?? "").trim().toLowerCase(),
    mode: lower(pt.props.mode),
    source: str(pt.props.source) ?? str(sourceNode?.props.query),
    dataSource: ds === undefined ? undefined : unquoteName(ds),
  };
}

function buildHierarchy(h: TmdlNode, table: Table): Hierarchy {
  const hierarchy: Hierarchy = { ...named(h), table, isHidden: flag(h.props.ishidden), levels: [] };
  for (const l of objects(h, "level")) {
    const col = str(l.props.column);
    const level: Level = { ...named(l), hierarchy, column: col === undefined ? undefined : unquoteName(col) };
    hierarchy.levels.push(level);
  }
  return hierarchy;
}

function buildCalculationGroup(cg: TmdlNode, table: Table): CalculationGroup {
  const precedence = str(cg.props.precedence);
  const group: CalculationGroup = {
    ...named(cg, table.name),
    table,
    precedence: precedence === undefined ? undefined : Number(precedence),
    items: [],
  };
  for (const ci of objects(cg, "calculationitem")) {
    const item: CalculationItem = { ...named(ci), table, expression: ci.value ?? "", formatStringDefinition: str(ci.props.formatstringdefinition) };
    group.items.push(item);
  }
  return group;
}

function buildTable(r: TmdlNode, model: Model): void {
  let t = model.tables.find((x) => x.name === r.name);
  if (!t) {
    t = { ...named(r), kind: "table", isHidden: flag(r.props.ishidden), dataCategory: str(r.props.datacategory), columns: [], measures: [], partitions: [], hierarchies: [] };
    model.tables.push(t);
  } else {
    // Partial declaration of an existing table: merge flags and fill blanks.
    if (flag(r.props.ishidden)) t.isHidden = true;
    t.dataCategory ??= str(r.props.datacategory);
    t.description ??= r.description;
    Object.assign(t.annotations, annotationsOf(r));
  }
  for (const c of r.children) {
    if (c.kind === "object" && c.type === "column") t.columns.push(buildColumn(c, t));
    else if (c.kind === "object" && c.type === "measure") t.measures.push(buildMeasure(c, t));
    else if (c.kind === "object" && c.type === "partition") t.partitions.push(buildPartition(c, t));
    else if (c.kind === "object" && c.type === "hierarchy") t.hierarchies.push(buildHierarchy(c, t));
    else if (c.type === "calculationgroup") t.calculationGroup = buildCalculationGroup(c, t);
  }
}

function buildRelationship(r: TmdlNode): Relationship {
  const p = r.props;
  const from = splitQualifiedName(str(p.fromcolumn) ?? "");
  const to = splitQualifiedName(str(p.tocolumn) ?? "");
  return {
    ...named(r),
    fromTable: from.table, fromColumn: from.column, toTable: to.table, toColumn: to.column,
    isActive: p.isactive === undefined ? true : flag(p.isactive),
    crossFilteringBehavior: lower(p.crossfilteringbehavior) ?? "onedirection",
    fromCardinality: lower(p.fromcardinality) ?? "many",
    toCardinality: lower(p.tocardinality) ?? "one",
  };
}

function buildRole(r: TmdlNode): Role {
  const role: Role = {
    ...named(r),
    modelPermission: lower(r.props.modelpermission),
    members: r.children.filter((c) => c.kind === "object" && c.type.endsWith("member")).map((c) => ({ name: c.name! })),
    tablePermissions: [],
  };
  for (const tp of objects(r, "tablepermission")) {
    const permission: TablePermission = {
      ...named(tp),
      role,
      table: tp.name!,
      filter: tp.value,
      metadataPermission: lower(tp.props.metadatapermission),
      columnPermissions: objects(tp, "columnpermission").map((cp) => ({ column: cp.name!, permission: (cp.value ?? "").trim().toLowerCase() })),
    };
    role.tablePermissions.push(permission);
  }
  return role;
}

function finalizeKinds(model: Model): void {
  for (const t of model.tables) {
    if (t.calculationGroup) t.kind = "calculationGroup";
    else if (t.partitions.some((p) => p.sourceType === "calculated")) t.kind = "calculated";
    else t.kind = "table";
    for (const c of t.columns) c.kind = c.expression !== undefined ? "calculated" : t.kind === "calculated" ? "calculatedTable" : "data";
  }
}

export function buildModel(files: ParsedFile[]): Model {
  const model: Model = {
    name: "Model", annotations: {}, location: { file: "", line: 0 }, props: {},
    tables: [], relationships: [], roles: [], perspectives: [], cultures: [], expressions: [], functions: [], dataSources: [], files,
  };
  for (const f of files) {
    for (const r of f.roots) {
      if (r.kind === "ref" || r.kind === "prop" || r.kind === "expr") continue;
      switch (r.type) {
        case "model":
          Object.assign(model, named(r, r.name ?? "Model"), { annotations: { ...model.annotations, ...annotationsOf(r) }, props: r.props });
          break;
        case "annotation":
          if (r.name) model.annotations[r.name] = r.value ?? "";
          break;
        case "table": buildTable(r, model); break;
        case "relationship": model.relationships.push(buildRelationship(r)); break;
        case "role": model.roles.push(buildRole(r)); break;
        case "perspective": {
          const p: Perspective = { ...named(r), tables: objects(r, "perspectivetable").map((t) => t.name!) };
          model.perspectives.push(p);
          break;
        }
        case "cultureinfo": model.cultures.push(named(r)); break;
        case "expression": model.expressions.push({ ...named(r), expression: r.value ?? "" }); break;
        case "function": model.functions.push({ ...named(r), expression: r.value ?? "" }); break;
        case "datasource": {
          const ds: DataSource = { ...named(r), kind: (r.value ?? "").trim().toLowerCase() === "provider" ? "provider" : "structured" };
          model.dataSources.push(ds);
          break;
        }
        default:
          break; // database, queryGroup, extendedProperty, unknown: kept in files, not modeled
      }
    }
  }
  finalizeKinds(model);
  return model;
}
```

- [ ] **Step 5: Export and run**

Add to `packages/core/src/index.ts`:

```ts
export { buildModel, splitQualifiedName } from "./model/build.js";
export type * from "./model/types.js";
```

Run: `npm test -- build`
Expected: PASS (12 tests). A likely failure is the `model` case: `Object.assign(model, named(r))` also copies `node` and `location`; that is intended. If the `annotation` root case reports `r.name` undefined, check that the parser produced an `object` node (it does when the line has a name and `=`).

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/model packages/core/src/index.ts packages/core/test/helpers.ts packages/core/test/build.test.ts
git commit -m "feat(core): build the semantic model object graph from parsed TMDL"
```

---

### Task 4: Object names and rule slugs

**Files:**
- Create: `packages/core/src/model/names.ts`
- Test: `packages/core/test/names.test.ts`

**Interfaces:**
- Consumes: `Relationship` (Task 3).
- Produces: `tableRef(name)`, `columnRef(table, column)`, `measureRef(name)`, `relationshipName(r)`, `slug(id)`, `ruleUrl(id)`, `RULE_URL_BASE`. These produce the exact strings in the "Object naming" table above.

- [ ] **Step 1: Write the failing tests**

`packages/core/test/names.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { columnRef, measureRef, relationshipName, ruleUrl, slug, tableRef } from "../src/model/names.js";
import { modelFrom } from "./helpers.js";

describe("DAX object names", () => {
  it("quotes tables and doubles embedded quotes", () => {
    expect(tableRef("Sales")).toBe("'Sales'");
    expect(tableRef("O'Brien")).toBe("'O''Brien'");
    expect(tableRef(" Spaced ")).toBe("' Spaced '");
  });
  it("formats columns and measures", () => {
    expect(columnRef("Sales", "Sale ID")).toBe("'Sales'[Sale ID]");
    expect(columnRef("T", "a]b")).toBe("'T'[a]]b]");
    expect(measureRef("Total Sales")).toBe("[Total Sales]");
  });
  it("formats relationships the way Tabular Editor displays them", () => {
    const m = modelFrom(
      "relationship a\n\tfromColumn: Sales.'Month Start'\n\ttoColumn: Date.Date\n\nrelationship b\n\tfromCardinality: many\n\ttoCardinality: many\n\tcrossFilteringBehavior: bothDirections\n\tfromColumn: Customer.Region\n\ttoColumn: 'Region Security'.Region\n\nrelationship c\n\tfromCardinality: one\n\ttoCardinality: one\n\tfromColumn: A.K\n\ttoColumn: B.K\n",
    );
    expect(relationshipName(m.relationships[0]!)).toBe("'Sales'[Month Start] ∞←1 'Date'[Date]");
    expect(relationshipName(m.relationships[1]!)).toBe("'Customer'[Region] ∞↔∞ 'Region Security'[Region]");
    expect(relationshipName(m.relationships[2]!)).toBe("'A'[K] 1←1 'B'[K]");
  });
});

describe("rule slugs", () => {
  it("lowercases and collapses non-alphanumerics", () => {
    expect(slug("HIDE_FOREIGN_KEYS")).toBe("hide-foreign-keys");
    expect(slug("DATE/CALENDAR_TABLES_SHOULD_BE_MARKED_AS_A_DATE_TABLE")).toBe("date-calendar-tables-should-be-marked-as-a-date-table");
    expect(slug("AVOID_USING_'1-(X/Y)'_SYNTAX")).toBe("avoid-using-1-x-y-syntax");
    expect(slug("MONTH_(AS_A_STRING)_MUST_BE_SORTED")).toBe("month-as-a-string-must-be-sorted");
  });
  it("builds rule page URLs", () => {
    expect(ruleUrl("HIDE_FOREIGN_KEYS")).toBe("https://pbiplint.com/rules/hide-foreign-keys");
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npm test -- names`
Expected: FAIL, cannot find module.

- [ ] **Step 3: Implement**

`packages/core/src/model/names.ts`:

```ts
import type { Relationship } from "./types.js";

/** `'Name'` with embedded single quotes doubled, as DAX and Tabular Editor write table names. */
export const tableRef = (name: string): string => `'${name.replace(/'/g, "''")}'`;

const bracket = (name: string): string => `[${name.replace(/\]/g, "]]")}]`;

export const columnRef = (table: string, column: string): string => `${tableRef(table)}${bracket(column)}`;

export const measureRef = (name: string): string => bracket(name);

const cardinalitySymbol = (c: string): string => (c === "many" ? "∞" : c === "one" ? "1" : "?");

/** Tabular Editor's relationship display name, e.g. `'Sales'[Sale Date] ∞←1 'Date'[Date]`. */
export function relationshipName(r: Relationship): string {
  const arrow = r.crossFilteringBehavior === "bothdirections" ? "↔" : "←";
  return `${columnRef(r.fromTable, r.fromColumn)} ${cardinalitySymbol(r.fromCardinality)}${arrow}${cardinalitySymbol(r.toCardinality)} ${columnRef(r.toTable, r.toColumn)}`;
}

/** Rule id to page slug: lowercase, runs of non-alphanumerics become one dash, no leading or trailing dash. */
export function slug(id: string): string {
  return id.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

export const RULE_URL_BASE = "https://pbiplint.com/rules/";

export const ruleUrl = (id: string): string => RULE_URL_BASE + slug(id);
```

Add to `packages/core/src/index.ts`:

```ts
export { columnRef, measureRef, relationshipName, ruleUrl, RULE_URL_BASE, slug, tableRef } from "./model/names.js";
```

- [ ] **Step 4: Run and commit**

Run: `npm test -- names`
Expected: PASS (5 tests).

```bash
git add packages/core/src/model/names.ts packages/core/src/index.ts packages/core/test/names.test.ts
git commit -m "feat(core): add Tabular Editor compatible object names and rule slugs"
```

---

### Task 5: Indexes (relationships, usage, DAX references)

**Files:**
- Create: `packages/core/src/index/relationships.ts`, `packages/core/src/index/usage.ts`, `packages/core/src/index/references.ts`, `packages/core/src/index/build.ts`
- Test: `packages/core/test/indexes.test.ts`

**Interfaces:**
- Consumes: `Model`, `Column`, `Measure`, `Table`, `TablePermission`, `CalculationItem`, `Relationship` (Task 3).
- Produces: `buildIndexes(model): Indexes` where `Indexes { relationships: RelationshipIndex; usage: UsageIndex; references: ReferenceIndex }`;
  `RelationshipIndex { all: Relationship[]; forColumn(table, column): Relationship[]; forTable(table): Relationship[] }`;
  `UsageIndex { usedInSortBy(c): boolean; usedInHierarchies(c): boolean; usedInVariations(c): boolean }`;
  `ReferenceIndex { owners: RefOwner[]; refsOf(object): DaxRef[]; columnReferencedBy(c): RefOwner[]; measureReferencedBy(m): RefOwner[] }`;
  `DaxRef { kind: "column" | "measure" | "unresolved"; table?: string; name: string; qualified: boolean }` (for resolved refs `table` and `name` carry the model's canonical spelling);
  `RefOwner { kind: "measure" | "calculatedColumn" | "calculatedTable" | "tablePermission" | "calculationItem"; object; ownerTable?: Table; expression: string; refs: DaxRef[] }`;
  `extractRefs(expression)` for the raw regex pass.

Resolution rules (ground-truth item 3): qualified `'T'[X]` resolves column first, then measure, on table T (case-insensitive); bare `[X]` resolves to a measure anywhere in the model, else (not for calculation items) a column on the owner's table, else a column on the first table in model order that has one, else unresolved. Scanned expressions: measure expressions and format string definitions, calculated column expressions, calculated table partition sources, table permission filters, calculation item expressions and format string definitions.

- [ ] **Step 1: Write the failing tests**

`packages/core/test/indexes.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { buildIndexes } from "../src/index/build.js";
import { extractRefs } from "../src/index/references.js";
import { modelFrom } from "./helpers.js";

const zoo = modelFrom(`table Sales
	column Amount
		dataType: decimal
		isHidden
	column Year
		dataType: int64
	column 'Cat'
		dataType: string
		sortByColumn: 'Cat Order'
	column 'Cat Order'
		dataType: int64
	measure 'Total Amount' = SUM('Sales'[Amount])
	measure 'Bare Own' = SUM([Amount])
	measure 'Bare Other' = COUNTROWS(FILTER('Date', [Month Name] = "Jan"))
	measure 'Bare Measure' = [Total Amount] * 2
	measure 'Qualified Measure' = 'Sales'[Total Amount] * 2
	measure 'Unresolved' = [Nothing Here]
	measure 'Fsd' = 1
		formatStringDefinition = IF([Total Amount] > 1, "0", "0.0")
	hierarchy H
		level L
			column: Year
	partition Sales = m
		mode: import
		source = let Source = 1 in Source

table Date
	column Date
		dataType: dateTime
		variation V
			defaultColumn: Sales.Year
	column 'Month Name'
		dataType: string
	column Amount
		dataType: int64
	partition Date = calculated
		mode: import
		source = ADDCOLUMNS(CALENDARAUTO(), "Amt", [Total Amount])

table CG
	calculationGroup
		calculationItem 'Bare Col' = IF(HASONEVALUE([Name]), SELECTEDMEASURE())
		calculationItem 'Qualified Col' = IF(HASONEVALUE('CG'[Name]), SELECTEDMEASURE())
		calculationItem 'Bare Measure' = [Total Amount]
	column Name
		dataType: string
	partition CG = calculationGroup
		mode: import

relationship r1
	fromColumn: Sales.Year
	toColumn: Date.Date

role R
	modelPermission: read
	tablePermission Date = [Month Name] = "Jan" && 'Sales'[Amount] > 0
`);
const idx = buildIndexes(zoo);
const table = (n: string) => zoo.tables.find((t) => t.name === n)!;
const column = (t: string, c: string) => table(t).columns.find((x) => x.name === c)!;
const measure = (n: string) => zoo.tables.flatMap((t) => t.measures).find((m) => m.name === n)!;

describe("extractRefs", () => {
  it("finds qualified and bare references", () => {
    expect(extractRefs("SUM('Sales'[Amount]) + Sales[Qty] + [M] + 'O''Brien'[X]")).toEqual([
      { table: "Sales", name: "Amount", qualified: true },
      { table: "Sales", name: "Qty", qualified: true },
      { table: "O'Brien", name: "X", qualified: true },
      { name: "M", qualified: false },
    ]);
  });
});

describe("relationship index", () => {
  it("looks up by column and table from either side", () => {
    expect(idx.relationships.forColumn("Sales", "Year").map((r) => r.name)).toEqual(["r1"]);
    expect(idx.relationships.forColumn("Date", "Date").map((r) => r.name)).toEqual(["r1"]);
    expect(idx.relationships.forColumn("Sales", "Amount")).toEqual([]);
    expect(idx.relationships.forTable("Date").length).toBe(1);
  });
});

describe("usage index", () => {
  it("knows sort-by targets, hierarchy levels, and variation default columns", () => {
    expect(idx.usage.usedInSortBy(column("Sales", "Cat Order"))).toBe(true);
    expect(idx.usage.usedInSortBy(column("Sales", "Cat"))).toBe(false);
    expect(idx.usage.usedInHierarchies(column("Sales", "Year"))).toBe(true);
    expect(idx.usage.usedInVariations(column("Sales", "Year"))).toBe(true);
    expect(idx.usage.usedInVariations(column("Sales", "Amount"))).toBe(false);
  });
});

describe("reference index", () => {
  it("resolves qualified references column-first, then measure", () => {
    expect(idx.references.refsOf(measure("Total Amount"))).toEqual([{ kind: "column", table: "Sales", name: "Amount", qualified: true }]);
    expect(idx.references.refsOf(measure("Qualified Measure"))).toEqual([{ kind: "measure", table: "Sales", name: "Total Amount", qualified: true }]);
  });
  it("resolves bare references measure-first, then own table, then any table", () => {
    expect(idx.references.refsOf(measure("Bare Own"))).toEqual([{ kind: "column", table: "Sales", name: "Amount", qualified: false }]);
    expect(idx.references.refsOf(measure("Bare Other"))).toEqual([{ kind: "column", table: "Date", name: "Month Name", qualified: false }]);
    expect(idx.references.refsOf(measure("Bare Measure"))).toEqual([{ kind: "measure", table: "Sales", name: "Total Amount", qualified: false }]);
    expect(idx.references.refsOf(measure("Unresolved"))).toEqual([{ kind: "unresolved", name: "Nothing Here", qualified: false }]);
  });
  it("never resolves a bare non-measure reference inside a calculation item", () => {
    const items = table("CG").calculationGroup!.items;
    expect(idx.references.refsOf(items[0]!)).toEqual([{ kind: "unresolved", name: "Name", qualified: false }]);
    expect(idx.references.refsOf(items[1]!)).toEqual([{ kind: "column", table: "CG", name: "Name", qualified: true }]);
    expect(idx.references.refsOf(items[2]!)).toEqual([{ kind: "measure", table: "Sales", name: "Total Amount", qualified: false }]);
  });
  it("scans calculated table sources, table permissions, and format string definitions", () => {
    expect(idx.references.refsOf(table("Date"))).toEqual([{ kind: "measure", table: "Sales", name: "Total Amount", qualified: false }]);
    const tp = zoo.roles[0]!.tablePermissions[0]!;
    expect(idx.references.refsOf(tp)).toEqual([
      { kind: "column", table: "Sales", name: "Amount", qualified: true },
      { kind: "column", table: "Date", name: "Month Name", qualified: false },
    ]);
    expect(idx.references.refsOf(measure("Fsd"))).toEqual([{ kind: "measure", table: "Sales", name: "Total Amount", qualified: false }]);
  });
  it("answers referenced-by for columns and measures", () => {
    expect(idx.references.columnReferencedBy(column("Sales", "Amount")).map((o) => o.kind)).toEqual(["measure", "measure", "tablePermission"]);
    expect(idx.references.columnReferencedBy(column("Date", "Amount"))).toEqual([]);
    // Bare Measure, Qualified Measure, Fsd, the Date calculated table, and calculation item 'Bare Measure'.
    expect(idx.references.measureReferencedBy(measure("Total Amount")).length).toBe(5);
    expect(idx.references.measureReferencedBy(measure("Unresolved"))).toEqual([]);
  });
  it("is case-insensitive on names", () => {
    const m = modelFrom("table T\n\tcolumn Amount\n\t\tdataType: int64\n\tmeasure A = SUM('t'[amount])\n\tmeasure B = [a] + 1\n");
    const i = buildIndexes(m);
    expect(i.references.refsOf(m.tables[0]!.measures[0]!)).toEqual([{ kind: "column", table: "T", name: "Amount", qualified: true }]);
    expect(i.references.refsOf(m.tables[0]!.measures[1]!)).toEqual([{ kind: "measure", table: "T", name: "A", qualified: false }]);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npm test -- indexes`
Expected: FAIL, cannot find module.

- [ ] **Step 3: Implement the relationship index**

`packages/core/src/index/relationships.ts`:

```ts
import type { Model, Relationship } from "../model/types.js";

export interface RelationshipIndex {
  all: Relationship[];
  /** Relationships in which the column is the from-side or the to-side. */
  forColumn(table: string, column: string): Relationship[];
  /** Relationships in which the table is on either side. */
  forTable(table: string): Relationship[];
}

const key = (table: string, column: string): string => `${table} ${column}`;

function push(map: Map<string, Relationship[]>, k: string, r: Relationship): void {
  const arr = map.get(k);
  if (!arr) map.set(k, [r]);
  else if (!arr.includes(r)) arr.push(r);
}

export function buildRelationshipIndex(model: Model): RelationshipIndex {
  const byColumn = new Map<string, Relationship[]>();
  const byTable = new Map<string, Relationship[]>();
  for (const r of model.relationships) {
    push(byColumn, key(r.fromTable, r.fromColumn), r);
    push(byColumn, key(r.toTable, r.toColumn), r);
    push(byTable, r.fromTable, r);
    push(byTable, r.toTable, r);
  }
  return {
    all: model.relationships,
    forColumn: (table, column) => byColumn.get(key(table, column)) ?? [],
    forTable: (table) => byTable.get(table) ?? [],
  };
}
```

- [ ] **Step 4: Implement the usage index**

`packages/core/src/index/usage.ts`:

```ts
import type { Column, Model } from "../model/types.js";

export interface UsageIndex {
  /** Another column in the same table sorts by this column. */
  usedInSortBy(c: Column): boolean;
  /** A hierarchy level in the same table uses this column. */
  usedInHierarchies(c: Column): boolean;
  /** A variation anywhere names this column as its default column. */
  usedInVariations(c: Column): boolean;
}

const key = (table: string, column: string): string => `${table} ${column}`;

export function buildUsageIndex(model: Model): UsageIndex {
  const sortTargets = new Set<string>();
  const levelColumns = new Set<string>();
  const variationDefaults = new Set<string>();
  for (const t of model.tables) {
    for (const c of t.columns) {
      if (c.sortByColumn !== undefined) sortTargets.add(key(t.name, c.sortByColumn));
      for (const v of c.variations) if (v.defaultColumn) variationDefaults.add(key(v.defaultColumn.table, v.defaultColumn.column));
    }
    for (const h of t.hierarchies) for (const l of h.levels) if (l.column !== undefined) levelColumns.add(key(t.name, l.column));
  }
  return {
    usedInSortBy: (c) => sortTargets.has(key(c.table.name, c.name)),
    usedInHierarchies: (c) => levelColumns.has(key(c.table.name, c.name)),
    usedInVariations: (c) => variationDefaults.has(key(c.table.name, c.name)),
  };
}
```

- [ ] **Step 5: Implement the reference index**

`packages/core/src/index/references.ts`:

```ts
import type { CalculationItem, Column, Measure, Model, Table, TablePermission } from "../model/types.js";

export type RefOwnerKind = "measure" | "calculatedColumn" | "calculatedTable" | "tablePermission" | "calculationItem";

export interface DaxRef {
  kind: "column" | "measure" | "unresolved";
  /** Canonical table name of the resolved object. */
  table?: string;
  /** Canonical name of the resolved object, or the raw name when unresolved. */
  name: string;
  qualified: boolean;
}

export interface RefOwner {
  kind: RefOwnerKind;
  object: Measure | Column | Table | TablePermission | CalculationItem;
  ownerTable?: Table;
  expression: string;
  refs: DaxRef[];
}

export interface ReferenceIndex {
  owners: RefOwner[];
  refsOf(object: object): DaxRef[];
  columnReferencedBy(c: Column): RefOwner[];
  measureReferencedBy(m: Measure): RefOwner[];
}

interface RawRef {
  table?: string;
  name: string;
  qualified: boolean;
}

// Qualified: 'Table Name'[Column] or TableName[Column]. Bare: [Name].
const QUALIFIED = /(?:'((?:[^']|'')+)'\s*|([A-Za-z_]\w*))\[([^\]]+)\]/g;
const BARE = /\[([^\]]+)\]/g;

/**
 * Regex approximation of DAX dependencies: qualified refs first, then bare refs whose `[` was not
 * part of a qualified match. Strings and comments are not skipped; that is the upgrade path if a
 * fixture ever breaks parity because of it.
 */
export function extractRefs(expression: string): RawRef[] {
  const out: RawRef[] = [];
  const consumed = new Set<number>();
  for (const m of expression.matchAll(QUALIFIED)) {
    const table = m[1] !== undefined ? m[1].replace(/''/g, "'") : m[2]!;
    out.push({ table, name: m[3]!, qualified: true });
    consumed.add(m.index! + m[0].length - m[3]!.length - 2);
  }
  for (const m of expression.matchAll(BARE)) {
    if (consumed.has(m.index!)) continue;
    out.push({ name: m[1]!, qualified: false });
  }
  return out;
}

const lower = (s: string): string => s.toLowerCase();
const key = (table: string, name: string): string => `${lower(table)} ${lower(name)}`;

export function buildReferenceIndex(model: Model): ReferenceIndex {
  const tables = new Map<string, Table>(model.tables.map((t) => [lower(t.name), t]));
  const columns = new Map<string, Column>();
  const measures = new Map<string, Measure>();
  for (const t of model.tables) {
    for (const c of t.columns) columns.set(key(t.name, c.name), c);
    for (const m of t.measures) measures.set(lower(m.name), m);
  }
  const columnOf = (t: Table, name: string): Column | undefined => columns.get(key(t.name, name));

  const resolve = (raw: RawRef, ownerTable: Table | undefined, ownerKind: RefOwnerKind): DaxRef => {
    if (raw.qualified) {
      const t = tables.get(lower(raw.table!));
      if (!t) return { kind: "unresolved", table: raw.table, name: raw.name, qualified: true };
      const col = columnOf(t, raw.name);
      if (col) return { kind: "column", table: t.name, name: col.name, qualified: true };
      const meas = t.measures.find((m) => lower(m.name) === lower(raw.name));
      if (meas) return { kind: "measure", table: t.name, name: meas.name, qualified: true };
      return { kind: "unresolved", table: raw.table, name: raw.name, qualified: true };
    }
    const meas = measures.get(lower(raw.name));
    if (meas) return { kind: "measure", table: meas.table.name, name: meas.name, qualified: false };
    if (ownerKind === "calculationItem") return { kind: "unresolved", name: raw.name, qualified: false };
    if (ownerTable) {
      const col = columnOf(ownerTable, raw.name);
      if (col) return { kind: "column", table: ownerTable.name, name: col.name, qualified: false };
    }
    for (const t of model.tables) {
      const col = columnOf(t, raw.name);
      if (col) return { kind: "column", table: t.name, name: col.name, qualified: false };
    }
    return { kind: "unresolved", name: raw.name, qualified: false };
  };

  const owners: RefOwner[] = [];
  const byObject = new Map<object, RefOwner>();
  const add = (kind: RefOwnerKind, object: RefOwner["object"], ownerTable: Table | undefined, ...expressions: (string | undefined)[]) => {
    const expression = expressions.filter((e): e is string => e !== undefined).join("\n");
    const owner: RefOwner = { kind, object, ownerTable, expression, refs: extractRefs(expression).map((r) => resolve(r, ownerTable, kind)) };
    owners.push(owner);
    byObject.set(object, owner);
  };
  for (const t of model.tables) {
    for (const m of t.measures) add("measure", m, t, m.expression, m.formatStringDefinition);
    for (const c of t.columns) if (c.kind === "calculated") add("calculatedColumn", c, t, c.expression);
    if (t.kind === "calculated") add("calculatedTable", t, t, ...t.partitions.filter((p) => p.sourceType === "calculated").map((p) => p.source));
    for (const item of t.calculationGroup?.items ?? []) add("calculationItem", item, t, item.expression, item.formatStringDefinition);
  }
  for (const role of model.roles) {
    for (const tp of role.tablePermissions) if (tp.filter !== undefined) add("tablePermission", tp, tables.get(lower(tp.table)), tp.filter);
  }

  const columnRefs = new Map<string, RefOwner[]>();
  const measureRefs = new Map<string, RefOwner[]>();
  for (const o of owners) {
    for (const r of o.refs) {
      if (r.kind === "column") {
        const k = key(r.table!, r.name);
        const arr = columnRefs.get(k) ?? [];
        if (!arr.includes(o)) arr.push(o);
        columnRefs.set(k, arr);
      } else if (r.kind === "measure") {
        const k = lower(r.name);
        const arr = measureRefs.get(k) ?? [];
        if (!arr.includes(o)) arr.push(o);
        measureRefs.set(k, arr);
      }
    }
  }

  return {
    owners,
    refsOf: (object) => byObject.get(object)?.refs ?? [],
    columnReferencedBy: (c) => columnRefs.get(key(c.table.name, c.name)) ?? [],
    measureReferencedBy: (m) => measureRefs.get(lower(m.name)) ?? [],
  };
}
```

`packages/core/src/index/build.ts`:

```ts
import type { Model } from "../model/types.js";
import { buildReferenceIndex, type ReferenceIndex } from "./references.js";
import { buildRelationshipIndex, type RelationshipIndex } from "./relationships.js";
import { buildUsageIndex, type UsageIndex } from "./usage.js";

export interface Indexes {
  relationships: RelationshipIndex;
  usage: UsageIndex;
  references: ReferenceIndex;
}

export function buildIndexes(model: Model): Indexes {
  return {
    relationships: buildRelationshipIndex(model),
    usage: buildUsageIndex(model),
    references: buildReferenceIndex(model),
  };
}
```

Add to `packages/core/src/index.ts`:

```ts
export { buildIndexes, type Indexes } from "./index/build.js";
export { extractRefs, type DaxRef, type RefOwner, type RefOwnerKind, type ReferenceIndex } from "./index/references.js";
export type { RelationshipIndex } from "./index/relationships.js";
export type { UsageIndex } from "./index/usage.js";
```

- [ ] **Step 6: Run and commit**

Run: `npm test -- indexes`
Expected: PASS (11 tests).

```bash
git add packages/core/src/index packages/core/src/index.ts packages/core/test/indexes.test.ts
git commit -m "feat(core): add relationship, usage, and DAX reference indexes"
```

---

### Task 6: Rule engine (types, helpers, config, ignores, run, rank, lint)

**Files:**
- Create: `packages/core/src/rules/types.ts`, `packages/core/src/rules/helpers.ts`, `packages/core/src/rules/parse-issue.ts`, `packages/core/src/rules/index.ts`
- Create: `packages/core/src/engine/config.ts`, `packages/core/src/engine/ignore.ts`, `packages/core/src/engine/run.ts`, `packages/core/src/engine/rank.ts`, `packages/core/src/engine/lint.ts`
- Test: `packages/core/test/engine.test.ts`

**Interfaces:**
- Consumes: `Model`, `Named`, object types (Task 3); `Indexes`, `buildIndexes` (Task 5); names (Task 4).
- Produces:
  - `Rule { id; name; category: Category; severity: Severity; scope: ObjectType[]; description; fixExpression?; references: string[]; status: "ported" | "needsLiveModel" | "builtin"; check(model, ctx: RuleContext): RuleFinding[] }`
  - `RuleContext { indexes: Indexes }`; `RuleFinding { objectType; objectName; location?; detail?; object?: Named }`; `Finding { ruleId; objectType; objectName; location?; detail? }`
  - `Category`, `CATEGORY_ORDER`, `Severity` (1 info, 2 warning, 3 error), `SEVERITY_LABEL`, `ObjectType`
  - helpers: `allColumns(m)`, `allMeasures(m)`, `allPartitions(m)`, `allCalculationItems(m)`, `allTablePermissions(m)`, `dataType(c)`, `isNumericType(c)`, `hiddenOrTableHidden(c)`, `isBlank(s)`, `isDirectQueryTable(t)`, `tableObjectType(t)`, `columnObjectType(c)`, `finding.{model,table,column,measure,partition,relationship,role,tablePermission,perspective,hierarchy,level,calculationItem,expression,dataSource}`, `namedObjects(m, types)`
  - `PARSE_ISSUE` rule; `defaultRules: Rule[]`
  - `PbiplintConfig { rules?: Record<string, "off" | "info" | "warning" | "error">; failOn?: "info" | "warning" | "error" | "none" }`, `resolveConfig(raw): ResolvedConfig { disabled: Set<string>; severity: Map<string, Severity>; failOn: Severity | null }`, `ConfigError`
  - `isIgnored(object, ruleId)`, `IGNORE_ANNOTATION`
  - `runRules(model, indexes, rules, config): RunResult { findings; rulesRun; rulesSkipped; ruleErrors; ignored }`
  - `rank(findings, rules, config): RankedGroup[]` with `RankedGroup { rule: RuleSummary; findings: Finding[] }`, `RuleSummary { id; name; category; severity; slug; url; status }`
  - `lint(files: LintFile[], options?: LintOptions): LintResult { model; findings; groups; summary; failed }`, `LintFile { path; text }`, `LintOptions { config?; rules? }`, `LintSummary { files; findings; errors; warnings; infos; rulesRun; rulesSkipped; ruleErrors; ignored }`

- [ ] **Step 1: Write the failing tests**

`packages/core/test/engine.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { buildIndexes } from "../src/index/build.js";
import { ConfigError, resolveConfig } from "../src/engine/config.js";
import { isIgnored } from "../src/engine/ignore.js";
import { lint } from "../src/engine/lint.js";
import { rank } from "../src/engine/rank.js";
import { runRules } from "../src/engine/run.js";
import { finding, namedObjects } from "../src/rules/helpers.js";
import { PARSE_ISSUE } from "../src/rules/parse-issue.js";
import type { Rule } from "../src/rules/types.js";
import { modelFrom } from "./helpers.js";

const base = { scope: [], description: "", references: [], status: "ported" as const };
const everyTable: Rule = { ...base, id: "EVERY_TABLE", name: "Every table", category: "Maintenance", severity: 1, check: (m) => m.tables.map((t) => finding.table(t)) };
const everyColumn: Rule = { ...base, id: "EVERY_COLUMN", name: "Every column", category: "Formatting", severity: 2, check: (m) => m.tables.flatMap((t) => t.columns.map((c) => finding.column(c))) };
const modelRule: Rule = { ...base, id: "MODEL_RULE", name: "Model", category: "Performance", severity: 2, check: (m) => [finding.model(m)] };
const live: Rule = { ...base, id: "LIVE", name: "Live", category: "Performance", severity: 2, status: "needsLiveModel", check: () => [] };
const boom: Rule = { ...base, id: "BOOM", name: "Boom", category: "Performance", severity: 3, check: () => { throw new Error("kaboom"); } };

const tmdl = "model Model\n\tculture: en-US\n\nannotation pbiplint.ignore = MODEL_RULE\n\ntable A\n\tcolumn X\n\t\tdataType: string\n\n\t\tannotation pbiplint.ignore = \"EVERY_COLUMN, OTHER\"\n\n\tcolumn Y\n\t\tdataType: string\n\ntable B\n\tannotation pbiplint.ignore = *\n\n\tcolumn Z\n\t\tdataType: string\n";

describe("resolveConfig", () => {
  it("defaults to failing on errors with nothing disabled", () => {
    const c = resolveConfig(undefined);
    expect(c.failOn).toBe(3);
    expect(c.disabled.size).toBe(0);
    expect(c.severity.size).toBe(0);
  });
  it("reads rule switches, severity overrides, and failOn", () => {
    const c = resolveConfig({ rules: { A: "off", B: "error", C: "info" }, failOn: "warning" });
    expect([...c.disabled]).toEqual(["A"]);
    expect(c.severity.get("B")).toBe(3);
    expect(c.severity.get("C")).toBe(1);
    expect(c.failOn).toBe(2);
    expect(resolveConfig({ failOn: "none" }).failOn).toBeNull();
  });
  it("rejects bad shapes with a readable message", () => {
    expect(() => resolveConfig({ rules: { A: "loud" } })).toThrow(ConfigError);
    expect(() => resolveConfig({ failOn: "sometimes" })).toThrow(/failOn/);
    expect(() => resolveConfig({ rulez: {} })).toThrow(/unknown key "rulez"/);
    expect(() => resolveConfig([])).toThrow(ConfigError);
  });
});

describe("isIgnored", () => {
  const m = modelFrom(tmdl);
  it("matches listed ids, wildcards, and quoted values", () => {
    expect(isIgnored(m, "MODEL_RULE")).toBe(true);
    expect(isIgnored(m, "OTHER")).toBe(false);
    expect(isIgnored(m.tables[0]!.columns[0]!, "EVERY_COLUMN")).toBe(true);
    expect(isIgnored(m.tables[0]!.columns[0]!, "OTHER")).toBe(true);
    expect(isIgnored(m.tables[0]!.columns[1]!, "EVERY_COLUMN")).toBe(false);
    expect(isIgnored(m.tables[1]!, "ANYTHING")).toBe(true);
    expect(isIgnored(undefined, "ANYTHING")).toBe(false);
  });
});

describe("runRules", () => {
  const m = modelFrom(tmdl);
  const idx = buildIndexes(m);
  it("applies ignores, skips disabled and live-model rules, and survives a throwing rule", () => {
    const r = runRules(m, idx, [everyTable, everyColumn, modelRule, live, boom], resolveConfig({ rules: { EVERY_TABLE: "off" } }));
    // 'A'[X] is ignored by its own annotation; the model ignores MODEL_RULE; 'B'[Z] has no annotation
    // of its own (table-level ignores do not cascade to columns), so it is reported.
    expect(r.findings.map((f) => `${f.ruleId} ${f.objectName}`)).toEqual(["EVERY_COLUMN 'A'[Y]", "EVERY_COLUMN 'B'[Z]"]);
    expect(r.ignored).toBe(2);
    expect(r.rulesRun).toEqual(["EVERY_COLUMN", "MODEL_RULE", "BOOM"]);
    expect(r.rulesSkipped).toEqual([{ id: "EVERY_TABLE", reason: "disabled" }, { id: "LIVE", reason: "needsLiveModel" }]);
    expect(r.ruleErrors).toEqual([{ id: "BOOM", message: "kaboom" }]);
  });
  it("stamps ruleId and drops the object reference", () => {
    const r = runRules(m, idx, [everyColumn], resolveConfig());
    expect(r.findings[0]).toEqual({ ruleId: "EVERY_COLUMN", objectType: "Column", objectName: "'A'[Y]", location: { file: "inline.tmdl", line: 12 } });
  });
});

describe("rank", () => {
  it("orders by severity, then category, then count, then id", () => {
    const m = modelFrom("table A\n\tcolumn X\n\t\tdataType: string\n\tcolumn Y\n\t\tdataType: string\n\ntable B\n\tcolumn Z\n\t\tdataType: string\n");
    const rules = [everyTable, everyColumn, modelRule];
    const cfg = resolveConfig();
    const r = runRules(m, buildIndexes(m), rules, cfg);
    const groups = rank(r.findings, rules, cfg);
    expect(groups.map((g) => [g.rule.id, g.findings.length])).toEqual([
      ["MODEL_RULE", 1], // warning, Performance
      ["EVERY_COLUMN", 3], // warning, Formatting
      ["EVERY_TABLE", 2], // info
    ]);
    expect(groups[0]!.rule).toMatchObject({ severity: 2, slug: "model-rule", url: "https://pbiplint.com/rules/model-rule", category: "Performance" });
  });
  it("uses the configured severity override", () => {
    const m = modelFrom("table A\n");
    const rules = [everyTable, modelRule];
    const cfg = resolveConfig({ rules: { EVERY_TABLE: "error" } });
    const groups = rank(runRules(m, buildIndexes(m), rules, cfg).findings, rules, cfg);
    expect(groups.map((g) => [g.rule.id, g.rule.severity])).toEqual([["EVERY_TABLE", 3], ["MODEL_RULE", 2]]);
  });
});

describe("lint", () => {
  it("parses, runs, ranks, and reports parse issues as findings", () => {
    const files = [
      { path: "definition/model.tmdl", text: "model Model\n" },
      { path: "definition/tables/A.tmdl", text: "table A\n    column Bad\n\tcolumn X\n\t\tdataType: string\n" },
    ];
    const result = lint(files, { rules: [PARSE_ISSUE, everyColumn] });
    expect(result.summary).toMatchObject({ files: 2, findings: 2, errors: 1, warnings: 1, infos: 0, rulesRun: 2, ignored: 0 });
    expect(result.groups[0]!.rule.id).toBe("PARSE_ISSUE");
    expect(result.groups[0]!.findings[0]).toMatchObject({ objectType: "File", objectName: "definition/tables/A.tmdl", location: { file: "definition/tables/A.tmdl", line: 2 } });
    expect(result.failed).toBe(true);
    expect(lint(files, { rules: [everyColumn] }).failed).toBe(false);
    expect(lint(files, { rules: [everyColumn], config: { failOn: "warning" } }).failed).toBe(true);
    expect(lint(files, { rules: [everyColumn], config: { failOn: "none" } }).failed).toBe(false);
  });
  it("uses the default rule set when none is given", () => {
    const result = lint([{ path: "a.tmdl", text: "table A\n" }]);
    expect(result.summary.rulesRun).toBeGreaterThanOrEqual(1);
  });
});

describe("namedObjects", () => {
  it("enumerates objects by scope with their finding shells", () => {
    const m = modelFrom("table A\n\tcolumn X\n\t\tdataType: string\n\tcolumn C = 1\n\tmeasure M = 1\n\thierarchy H\n\t\tlevel L\n\t\t\tcolumn: X\n\tpartition A = m\n\t\tmode: import\n\t\tsource = 1\n\nrole R\n\tmodelPermission: read\n\ttablePermission A = 1 = 1\n\nperspective P\n\nexpression E = 1\n");
    const names = (types: Parameters<typeof namedObjects>[1]) => namedObjects(m, types).map((o) => `${o.finding.objectType}:${o.name}`);
    expect(names(["Model", "Table", "Column", "CalculatedColumn", "Measure", "Hierarchy", "Level", "Partition", "Role", "TablePermission", "Perspective", "NamedExpression"])).toEqual([
      "Model:Model", "Table:A", "Column:X", "CalculatedColumn:C", "Measure:M", "Hierarchy:H", "Level:L", "Partition:A", "Role:R", "TablePermission:A", "Perspective:P", "NamedExpression:E",
    ]);
    expect(names(["CalculatedTable", "CalculationGroupTable", "CalculatedTableColumn", "CalculationItem", "DataSource", "Relationship"])).toEqual([]);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npm test -- engine`
Expected: FAIL, cannot find modules.

- [ ] **Step 3: Write rule types and helpers**

`packages/core/src/rules/types.ts`:

```ts
import type { Indexes } from "../index/build.js";
import type { Model, Named, SourceLocation } from "../model/types.js";

export type Category = "Performance" | "Error Prevention" | "DAX Expressions" | "Maintenance" | "Formatting" | "Naming Conventions";

/** Ranking order of categories (spec section 6). */
export const CATEGORY_ORDER: readonly Category[] = ["Performance", "Error Prevention", "DAX Expressions", "Maintenance", "Formatting", "Naming Conventions"];

/** 1 info, 2 warning, 3 error, as in BPARules.json. */
export type Severity = 1 | 2 | 3;

export const SEVERITY_LABEL: Record<Severity, "info" | "warning" | "error"> = { 1: "info", 2: "warning", 3: "error" };

export type ObjectType =
  | "Model" | "Table" | "CalculatedTable" | "CalculationGroupTable"
  | "Column" | "CalculatedColumn" | "CalculatedTableColumn"
  | "Measure" | "Partition" | "Relationship" | "Role" | "TablePermission" | "Perspective"
  | "Hierarchy" | "Level" | "CalculationItem" | "NamedExpression" | "DataSource" | "File";

export type RuleStatus = "ported" | "needsLiveModel" | "builtin";

export interface RuleContext {
  indexes: Indexes;
}

/** What a rule returns. `object` is used for ignore annotations and stripped before output. */
export interface RuleFinding {
  objectType: ObjectType;
  objectName: string;
  location?: SourceLocation;
  detail?: string;
  object?: Named;
}

export interface Finding {
  ruleId: string;
  objectType: ObjectType;
  objectName: string;
  location?: SourceLocation;
  detail?: string;
}

export interface Rule {
  id: string;
  name: string;
  category: Category;
  severity: Severity;
  scope: ObjectType[];
  description: string;
  fixExpression?: string;
  references: string[];
  status: RuleStatus;
  check(model: Model, ctx: RuleContext): RuleFinding[];
}
```

`packages/core/src/rules/helpers.ts`:

```ts
import { columnRef, measureRef, relationshipName, tableRef } from "../model/names.js";
import type {
  CalculationItem, Column, DataSource, Hierarchy, Level, Measure, Model, NamedExpression, Partition, Perspective,
  Relationship, Role, Table, TablePermission,
} from "../model/types.js";
import type { ObjectType, RuleFinding } from "./types.js";

export const allColumns = (m: Model): Column[] => m.tables.flatMap((t) => t.columns);
export const allMeasures = (m: Model): Measure[] => m.tables.flatMap((t) => t.measures);
export const allPartitions = (m: Model): Partition[] => m.tables.flatMap((t) => t.partitions);
export const allHierarchies = (m: Model): Hierarchy[] => m.tables.flatMap((t) => t.hierarchies);
export const allLevels = (m: Model): Level[] => allHierarchies(m).flatMap((h) => h.levels);
export const allCalculationItems = (m: Model): CalculationItem[] => m.tables.flatMap((t) => t.calculationGroup?.items ?? []);
export const allTablePermissions = (m: Model): TablePermission[] => m.roles.flatMap((r) => r.tablePermissions);

export const dataType = (c: Column): string => (c.dataType ?? "").toLowerCase();
export const isNumericType = (c: Column): boolean => ["int64", "decimal", "double"].includes(dataType(c));
export const hiddenOrTableHidden = (c: Column): boolean => c.isHidden || c.table.isHidden;
export const isBlank = (s: string | undefined): boolean => s === undefined || s.trim() === "";
/** Tabular Editor labels a table by its first partition's mode; DirectQuery tables are what several rules test for. */
export const isDirectQueryTable = (t: Table): boolean => t.kind === "table" && t.partitions[0]?.mode === "directquery";

export const tableObjectType = (t: Table): ObjectType =>
  t.kind === "calculated" ? "CalculatedTable" : t.kind === "calculationGroup" ? "CalculationGroupTable" : "Table";
export const columnObjectType = (c: Column): ObjectType =>
  c.kind === "calculated" ? "CalculatedColumn" : c.kind === "calculatedTable" ? "CalculatedTableColumn" : "Column";

/** Finding factories. Object names follow Tabular Editor's display names (see the plan's naming table). */
export const finding = {
  model: (m: Model): RuleFinding => ({ objectType: "Model", objectName: "Model", location: m.location, object: m }),
  table: (t: Table): RuleFinding => ({ objectType: tableObjectType(t), objectName: tableRef(t.name), location: t.location, object: t }),
  column: (c: Column): RuleFinding => ({ objectType: columnObjectType(c), objectName: columnRef(c.table.name, c.name), location: c.location, object: c }),
  measure: (x: Measure): RuleFinding => ({ objectType: "Measure", objectName: measureRef(x.name), location: x.location, object: x }),
  partition: (p: Partition): RuleFinding => ({ objectType: "Partition", objectName: p.name, location: p.location, detail: `table ${tableRef(p.table.name)}`, object: p }),
  relationship: (r: Relationship): RuleFinding => ({ objectType: "Relationship", objectName: relationshipName(r), location: r.location, object: r }),
  role: (r: Role): RuleFinding => ({ objectType: "Role", objectName: r.name, location: r.location, object: r }),
  tablePermission: (tp: TablePermission): RuleFinding => ({ objectType: "TablePermission", objectName: tp.table, location: tp.location, detail: `role ${tp.role.name}`, object: tp }),
  perspective: (p: Perspective): RuleFinding => ({ objectType: "Perspective", objectName: p.name, location: p.location, object: p }),
  hierarchy: (h: Hierarchy): RuleFinding => ({ objectType: "Hierarchy", objectName: h.name, location: h.location, detail: `table ${tableRef(h.table.name)}`, object: h }),
  level: (l: Level): RuleFinding => ({ objectType: "Level", objectName: l.name, location: l.location, detail: `hierarchy ${l.hierarchy.name} in ${tableRef(l.hierarchy.table.name)}`, object: l }),
  calculationItem: (i: CalculationItem): RuleFinding => ({ objectType: "CalculationItem", objectName: i.name, location: i.location, detail: `calculation group ${tableRef(i.table.name)}`, object: i }),
  expression: (e: NamedExpression): RuleFinding => ({ objectType: "NamedExpression", objectName: e.name, location: e.location, object: e }),
  dataSource: (d: DataSource): RuleFinding => ({ objectType: "DataSource", objectName: d.name, location: d.location, object: d }),
};

export interface NamedObject {
  finding: RuleFinding;
  name: string;
  description?: string;
}

/** Every object of the given types, in model order, for rules that only look at names or descriptions. */
export function namedObjects(m: Model, types: ObjectType[]): NamedObject[] {
  const want = new Set(types);
  const out: NamedObject[] = [];
  const push = (f: RuleFinding, name: string, description?: string) => {
    if (want.has(f.objectType)) out.push({ finding: f, name, description });
  };
  push(finding.model(m), m.name, m.description);
  for (const t of m.tables) {
    push(finding.table(t), t.name, t.description);
    for (const c of t.columns) push(finding.column(c), c.name, c.description);
    for (const x of t.measures) push(finding.measure(x), x.name, x.description);
    for (const h of t.hierarchies) {
      push(finding.hierarchy(h), h.name, h.description);
      for (const l of h.levels) push(finding.level(l), l.name, l.description);
    }
    for (const p of t.partitions) push(finding.partition(p), p.name, p.description);
    for (const i of t.calculationGroup?.items ?? []) push(finding.calculationItem(i), i.name, i.description);
  }
  for (const r of m.relationships) push(finding.relationship(r), r.name, r.description);
  for (const r of m.roles) {
    push(finding.role(r), r.name, r.description);
    for (const tp of r.tablePermissions) push(finding.tablePermission(tp), tp.name, tp.description);
  }
  for (const p of m.perspectives) push(finding.perspective(p), p.name, p.description);
  for (const e of m.expressions) push(finding.expression(e), e.name, e.description);
  for (const d of m.dataSources) push(finding.dataSource(d), d.name, d.description);
  return out;
}
```

`packages/core/src/rules/parse-issue.ts`:

```ts
import type { Rule } from "./types.js";

/** Built-in rule that surfaces parser issues in the same list as everything else (spec section 5). */
export const PARSE_ISSUE: Rule = {
  id: "PARSE_ISSUE",
  name: "TMDL could not be fully parsed",
  category: "Error Prevention",
  severity: 3,
  scope: ["File"],
  description: "A line in a TMDL file was not understood. The rest of the file was still analyzed, but findings in and around this line may be missing or wrong.",
  references: ["https://learn.microsoft.com/analysis-services/tmdl/tmdl-overview"],
  status: "builtin",
  check: (model) =>
    model.files.flatMap((f) =>
      f.issues.map((issue) => ({
        objectType: "File" as const,
        objectName: issue.file,
        location: { file: issue.file, line: issue.line },
        detail: `${issue.reason}: ${issue.text.trim()}`,
      })),
    ),
};
```

`packages/core/src/rules/index.ts` (the pack is appended in Task 13):

```ts
import { PARSE_ISSUE } from "./parse-issue.js";
import type { Rule } from "./types.js";

export const defaultRules: Rule[] = [PARSE_ISSUE];
```

- [ ] **Step 4: Write config and ignore handling**

`packages/core/src/engine/config.ts`:

```ts
import type { Severity } from "../rules/types.js";

export type SeverityName = "info" | "warning" | "error";

/** Shape of pbiplint.config.json. */
export interface PbiplintConfig {
  /** Per rule: "off" disables it; a severity name overrides its severity. */
  rules?: Record<string, "off" | SeverityName>;
  /** Lowest severity that makes the CLI exit nonzero. Default "error". */
  failOn?: SeverityName | "none";
}

export interface ResolvedConfig {
  disabled: Set<string>;
  severity: Map<string, Severity>;
  failOn: Severity | null;
}

export class ConfigError extends Error {}

export const SEVERITY_BY_NAME: Record<SeverityName, Severity> = { info: 1, warning: 2, error: 3 };

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

export function isResolvedConfig(v: unknown): v is ResolvedConfig {
  return isRecord(v) && v.disabled instanceof Set && v.severity instanceof Map;
}

export function resolveConfig(raw: unknown = {}): ResolvedConfig {
  if (!isRecord(raw)) throw new ConfigError("pbiplint.config.json must be a JSON object");
  for (const k of Object.keys(raw)) if (k !== "rules" && k !== "failOn") throw new ConfigError(`pbiplint.config.json: unknown key "${k}"`);
  const out: ResolvedConfig = { disabled: new Set(), severity: new Map(), failOn: 3 };
  if (raw.rules !== undefined) {
    if (!isRecord(raw.rules)) throw new ConfigError('pbiplint.config.json: "rules" must be an object of rule id to "off" | "info" | "warning" | "error"');
    for (const [id, v] of Object.entries(raw.rules)) {
      if (v === "off") out.disabled.add(id);
      else if (v === "info" || v === "warning" || v === "error") out.severity.set(id, SEVERITY_BY_NAME[v]);
      else throw new ConfigError(`pbiplint.config.json: rules["${id}"] must be "off", "info", "warning", or "error"`);
    }
  }
  if (raw.failOn !== undefined) {
    if (raw.failOn === "none") out.failOn = null;
    else if (raw.failOn === "info" || raw.failOn === "warning" || raw.failOn === "error") out.failOn = SEVERITY_BY_NAME[raw.failOn];
    else throw new ConfigError('pbiplint.config.json: "failOn" must be "info", "warning", "error", or "none"');
  }
  return out;
}
```

`packages/core/src/engine/ignore.ts`:

```ts
import type { Named } from "../model/types.js";
import { unquoteValue } from "../tmdl/quote.js";

export const IGNORE_ANNOTATION = "pbiplint.ignore";

/** True when the object carries `annotation pbiplint.ignore = RULE_A, RULE_B` naming this rule, or `= *`. */
export function isIgnored(object: Named | undefined, ruleId: string): boolean {
  const raw = object?.annotations[IGNORE_ANNOTATION];
  if (raw === undefined) return false;
  const items = unquoteValue(raw).split(",").map((s) => s.trim()).filter((s) => s.length > 0);
  return items.includes("*") || items.includes(ruleId);
}
```

- [ ] **Step 5: Write run, rank, and lint**

`packages/core/src/engine/run.ts`:

```ts
import type { Indexes } from "../index/build.js";
import type { Model } from "../model/types.js";
import type { Finding, Rule } from "../rules/types.js";
import type { ResolvedConfig } from "./config.js";
import { isIgnored } from "./ignore.js";

export interface SkippedRule {
  id: string;
  reason: "disabled" | "needsLiveModel";
}

export interface RuleError {
  id: string;
  message: string;
}

export interface RunResult {
  findings: Finding[];
  rulesRun: string[];
  rulesSkipped: SkippedRule[];
  ruleErrors: RuleError[];
  ignored: number;
}

export function runRules(model: Model, indexes: Indexes, rules: Rule[], config: ResolvedConfig): RunResult {
  const result: RunResult = { findings: [], rulesRun: [], rulesSkipped: [], ruleErrors: [], ignored: 0 };
  for (const rule of rules) {
    if (config.disabled.has(rule.id)) {
      result.rulesSkipped.push({ id: rule.id, reason: "disabled" });
      continue;
    }
    if (rule.status === "needsLiveModel") {
      result.rulesSkipped.push({ id: rule.id, reason: "needsLiveModel" });
      continue;
    }
    result.rulesRun.push(rule.id);
    let raw;
    try {
      raw = rule.check(model, { indexes });
    } catch (e) {
      result.ruleErrors.push({ id: rule.id, message: e instanceof Error ? e.message : String(e) });
      continue;
    }
    for (const f of raw) {
      if (isIgnored(f.object, rule.id)) {
        result.ignored++;
        continue;
      }
      const out: Finding = { ruleId: rule.id, objectType: f.objectType, objectName: f.objectName };
      if (f.location) out.location = f.location;
      if (f.detail !== undefined) out.detail = f.detail;
      result.findings.push(out);
    }
  }
  return result;
}
```

`packages/core/src/engine/rank.ts`:

```ts
import { ruleUrl, slug } from "../model/names.js";
import { CATEGORY_ORDER, type Category, type Finding, type Rule, type RuleStatus, type Severity } from "../rules/types.js";
import type { ResolvedConfig } from "./config.js";

export interface RuleSummary {
  id: string;
  name: string;
  category: Category;
  /** Effective severity after config overrides. */
  severity: Severity;
  slug: string;
  url: string;
  status: RuleStatus;
}

export interface RankedGroup {
  rule: RuleSummary;
  findings: Finding[];
}

export const effectiveSeverity = (rule: Rule, config: ResolvedConfig): Severity => config.severity.get(rule.id) ?? rule.severity;

export function summarizeRule(rule: Rule, config: ResolvedConfig): RuleSummary {
  return { id: rule.id, name: rule.name, category: rule.category, severity: effectiveSeverity(rule, config), slug: slug(rule.id), url: ruleUrl(rule.id), status: rule.status };
}

/**
 * Group findings by rule and order the groups by severity (error first), category priority,
 * finding count (more first), then rule id. Findings inside a group keep model order.
 */
export function rank(findings: Finding[], rules: Rule[], config: ResolvedConfig): RankedGroup[] {
  const byId = new Map(rules.map((r) => [r.id, r]));
  const groups = new Map<string, RankedGroup>();
  for (const f of findings) {
    let g = groups.get(f.ruleId);
    if (!g) {
      const rule = byId.get(f.ruleId);
      if (!rule) throw new Error(`Finding for unknown rule ${f.ruleId}`);
      g = { rule: summarizeRule(rule, config), findings: [] };
      groups.set(f.ruleId, g);
    }
    g.findings.push(f);
  }
  return [...groups.values()].sort(
    (a, b) =>
      b.rule.severity - a.rule.severity ||
      CATEGORY_ORDER.indexOf(a.rule.category) - CATEGORY_ORDER.indexOf(b.rule.category) ||
      b.findings.length - a.findings.length ||
      a.rule.id.localeCompare(b.rule.id),
  );
}
```

`packages/core/src/engine/lint.ts`:

```ts
import { buildIndexes } from "../index/build.js";
import { buildModel } from "../model/build.js";
import type { Model } from "../model/types.js";
import { defaultRules } from "../rules/index.js";
import type { Finding, Rule } from "../rules/types.js";
import { parseTmdl } from "../tmdl/parse.js";
import { isResolvedConfig, resolveConfig, type PbiplintConfig, type ResolvedConfig } from "./config.js";
import { rank, type RankedGroup } from "./rank.js";
import { runRules, type RuleError, type SkippedRule } from "./run.js";

export interface LintFile {
  /** Path relative to the model root, forward slashes, e.g. `definition/tables/Sales.tmdl`. */
  path: string;
  text: string;
}

export interface LintOptions {
  config?: PbiplintConfig | ResolvedConfig;
  rules?: Rule[];
}

export interface LintSummary {
  files: number;
  findings: number;
  errors: number;
  warnings: number;
  infos: number;
  rulesRun: number;
  rulesSkipped: SkippedRule[];
  ruleErrors: RuleError[];
  ignored: number;
}

export interface LintResult {
  model: Model;
  findings: Finding[];
  groups: RankedGroup[];
  summary: LintSummary;
  /** True when any finding's effective severity is at or above the configured failOn. */
  failed: boolean;
}

/** The one call the web app and the CLI both make. Pure: no I/O, no network. */
export function lint(files: LintFile[], options: LintOptions = {}): LintResult {
  const config = isResolvedConfig(options.config) ? options.config : resolveConfig(options.config);
  const rules = options.rules ?? defaultRules;
  const parsed = files.map((f) => parseTmdl(f.path, f.text));
  const model = buildModel(parsed);
  const indexes = buildIndexes(model);
  const run = runRules(model, indexes, rules, config);
  const groups = rank(run.findings, rules, config);
  const count = (severity: number) => groups.filter((g) => g.rule.severity === severity).reduce((n, g) => n + g.findings.length, 0);
  const summary: LintSummary = {
    files: files.length,
    findings: run.findings.length,
    errors: count(3),
    warnings: count(2),
    infos: count(1),
    rulesRun: run.rulesRun.length,
    rulesSkipped: run.rulesSkipped,
    ruleErrors: run.ruleErrors,
    ignored: run.ignored,
  };
  const failed = config.failOn !== null && groups.some((g) => g.rule.severity >= config.failOn!);
  return { model, findings: run.findings, groups, summary, failed };
}
```

Add to `packages/core/src/index.ts`:

```ts
export * from "./rules/types.js";
export { finding, namedObjects, allColumns, allMeasures, allPartitions, allCalculationItems, allTablePermissions, tableObjectType, columnObjectType } from "./rules/helpers.js";
export { PARSE_ISSUE } from "./rules/parse-issue.js";
export { defaultRules } from "./rules/index.js";
export { ConfigError, resolveConfig, SEVERITY_BY_NAME, type PbiplintConfig, type ResolvedConfig, type SeverityName } from "./engine/config.js";
export { IGNORE_ANNOTATION, isIgnored } from "./engine/ignore.js";
export { runRules, type RunResult, type SkippedRule, type RuleError } from "./engine/run.js";
export { rank, summarizeRule, effectiveSeverity, type RankedGroup, type RuleSummary } from "./engine/rank.js";
export { lint, type LintFile, type LintOptions, type LintResult, type LintSummary } from "./engine/lint.js";
```

- [ ] **Step 6: Run and commit**

Run: `npm test -- engine && npm run typecheck`
Expected: PASS (12 tests). The `location.line` of `'A'[Y]` in the runRules test is 12 because the ignore annotation and blank lines precede it in the inline TMDL; if the count is off by one, count the lines of the `tmdl` constant rather than changing the parser.

```bash
git add packages/core/src/rules packages/core/src/engine packages/core/src/index.ts packages/core/test/engine.test.ts
git commit -m "feat(core): add rule engine with config, ignores, ranking, and lint entry point"
```

---

### Task 7: Fixtures, sample project, and the parity harness

**Files:**
- Create: `scripts/sanitize-fixture.mjs`, `scripts/te-expectations.mjs`
- Create: `examples/messy-sales/` (sample project, copied and sanitized), `tests/fixtures/tvw-baseline.SemanticModel/`, `tests/fixtures/kitchen-sink.SemanticModel/`, `tests/fixtures/rule-zoo.SemanticModel/`, `tests/fixtures/data-sources.SemanticModel/`
- Create: `tests/expectations/{messy-sales,tvw-baseline,kitchen-sink,rule-zoo,data-sources}.json`
- Test: `packages/core/test/parity.test.ts`

**Interfaces:**
- Consumes: `lint`, `defaultRules` (Task 6), `readModelFiles` (Task 3 helpers).
- Produces: the parity suite every rule task runs. Expectation file shape: `{ fixture: "<repo-relative model dir>", oracle: string, captured: "YYYY-MM-DD", skipRules?: { [ruleId]: reason }, findings: { [ruleId]: string[] } }`. The suite compares, per **ported** rule, the sorted list of our `objectName`s against the sorted expected list; rules Tabular Editor fired that are not ported yet are only logged, so the suite stays green while rules are added one task at a time.

- [ ] **Step 1: Write the sanitizer**

`scripts/sanitize-fixture.mjs`:

```js
#!/usr/bin/env node
// Usage: node scripts/sanitize-fixture.mjs <modelDir>
// Rewrites every File.Contents("<path>") in .tmdl files to C:\Demo\Data\<basename>
// and deletes files that do not belong in a fixture.
import { readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const root = process.argv[2];
if (!root) {
  console.error("usage: node scripts/sanitize-fixture.mjs <modelDir>");
  process.exit(2);
}
const JUNK = new Set([".DS_Store", "cache.abf", "localSettings.json", "diagramLayout.json"]);
let rewritten = 0;
let removed = 0;

function walk(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(p);
      continue;
    }
    if (JUNK.has(entry.name)) {
      rmSync(p);
      removed++;
      continue;
    }
    if (!entry.name.endsWith(".tmdl")) continue;
    const text = readFileSync(p, "utf8");
    const out = text.replace(/File\.Contents\("([^"]+)"\)/g, (_, path) => {
      const base = path.split(/[\\/]/).pop();
      return `File.Contents("C:\\Demo\\Data\\${base}")`;
    });
    if (out !== text) {
      writeFileSync(p, out);
      rewritten++;
    }
  }
}

walk(root);
console.log(`${root}: rewrote ${rewritten} file(s), removed ${removed} junk file(s)`);
```

- [ ] **Step 2: Copy and sanitize the exported fixtures**

```bash
SPIKE=/Users/michaelmckinley/Downloads/pbip-lint-spike
mkdir -p examples tests/fixtures tests/expectations
# Sample project (also a parity fixture)
mkdir -p examples/messy-sales
cp -R "$SPIKE/corpus/messy-sales.SemanticModel/definition" examples/messy-sales/definition
cp "$SPIKE/corpus/messy-sales.SemanticModel/.platform" "$SPIKE/corpus/messy-sales.SemanticModel/definition.pbism" examples/messy-sales/
mkdir -p examples/messy-sales/.pbi && cp "$SPIKE/corpus/messy-sales.SemanticModel/.pbi/editorSettings.json" examples/messy-sales/.pbi/
# Desktop export with auto date tables, variations, calculated columns
mkdir -p tests/fixtures/tvw-baseline.SemanticModel
cp -R "$SPIKE/corpus/tvw-baseline.SemanticModel/definition" tests/fixtures/tvw-baseline.SemanticModel/definition
cp "$SPIKE/corpus/tvw-baseline.SemanticModel/.platform" "$SPIKE/corpus/tvw-baseline.SemanticModel/definition.pbism" tests/fixtures/tvw-baseline.SemanticModel/
# Roles with RLS and OLS, perspective, hierarchy, descriptions everywhere
mkdir -p tests/fixtures/kitchen-sink.SemanticModel
cp -R "$SPIKE/corpus/tmdlmaker-KitchenSinkDemo.SemanticModel/definition" tests/fixtures/kitchen-sink.SemanticModel/definition
cp "$SPIKE/corpus/tmdlmaker-KitchenSinkDemo.SemanticModel/.platform" "$SPIKE/corpus/tmdlmaker-KitchenSinkDemo.SemanticModel/definition.pbism" tests/fixtures/kitchen-sink.SemanticModel/
for d in examples/messy-sales tests/fixtures/tvw-baseline.SemanticModel tests/fixtures/kitchen-sink.SemanticModel; do node scripts/sanitize-fixture.mjs "$d"; done
grep -rl 'OneDrive\|\\\\Mac\|/Users/' examples tests/fixtures || echo "clean"
```

Expected: the sanitizer reports rewritten files for all three (7, 7, and 6 partition sources), and the final grep prints `clean`.

- [ ] **Step 3: Write the rule-zoo fixture**

This hand-written model triggers 35 of the 41 rules the exported fixtures do not, and pins the dependency semantics in ground-truth items 1 to 6. Create the files exactly as shown; indentation is tabs. Directory: `tests/fixtures/rule-zoo.SemanticModel/definition/`.

`database.tmdl`:

```
database
	compatibilityLevel: 1600
```

`model.tmdl`:

```
model Model
	culture: en-US
	defaultPowerBIDataSourceVersion: powerBI_V3
	sourceQueryCulture: en-US

annotation PBI_QueryOrder = ["Sales","Product","Customer","Date","Region Security","Monthly Budget"]

ref table Sales
ref table Product
ref table Customer
ref table Date
ref table 'Region Security'
ref table 'Monthly Budget'
ref table ' Spaced '
ref table 'Time Intelligence'
ref table 'Empty Calc Group'

ref perspective 'Empty View'
ref perspective 'Sales View'

ref role 'Region Users'
ref role Admins
```

`expressions.tmdl`:

```
expression ' Padded Param ' = "localhost" meta [IsParameterQuery=true, Type="Text", IsParameterQueryRequired=true]
```

`relationships.tmdl`:

```
relationship Sales_Product
	fromColumn: Sales.'Product ID'
	toColumn: Product.'Product ID'

relationship Sales_Customer
	fromColumn: Sales.'Customer ID'
	toColumn: Customer.'Customer ID'

relationship Sales_OrderDate
	fromColumn: Sales.'Order Date'
	toColumn: Date.Date

relationship Sales_ShipDate
	isActive: false
	fromColumn: Sales.'Ship Date'
	toColumn: Date.Date

relationship Sales_MonthStart
	isActive: false
	fromColumn: Sales.'Month Start'
	toColumn: Date.Date

relationship Customer_RegionSecurity
	fromCardinality: many
	toCardinality: many
	crossFilteringBehavior: bothDirections
	fromColumn: Customer.Region
	toColumn: 'Region Security'.Region
```

`tables/Sales.tmdl`:

```
table Sales

	column 'Sale ID'
		dataType: int64
		isKey
		summarizeBy: none
		sourceColumn: Sale ID

	column 'Product ID'
		dataType: int64
		isHidden
		summarizeBy: none
		sourceColumn: Product ID

	column 'Customer ID'
		dataType: string
		isHidden
		summarizeBy: none
		sourceColumn: Customer ID

	column 'Order Date'
		dataType: dateTime
		formatString: mm/dd/yyyy
		summarizeBy: none
		sourceColumn: Order Date

	column 'Ship Date'
		dataType: dateTime
		formatString: mm/dd/yyyy
		summarizeBy: none
		sourceColumn: Ship Date

	column 'Month Start'
		dataType: dateTime
		summarizeBy: none
		sourceColumn: Month Start

	column Category
		dataType: string
		summarizeBy: none
		sourceColumn: Category

	column Amount
		dataType: decimal
		isHidden
		summarizeBy: none
		sourceColumn: Amount

	column Cost
		dataType: decimal
		isHidden
		summarizeBy: none
		sourceColumn: Cost

	column IsReturned
		dataType: int64
		summarizeBy: none
		sourceColumn: IsReturned

	column 'Priority Flag'
		dataType: int64
		summarizeBy: none
		sourceColumn: Priority Flag

	column 'No Source'
		dataType: string
		summarizeBy: none

	column 'Product Category' = RELATED('Product'[Category])
		dataType: string
		summarizeBy: none

	column 'Only Calc Item Column'
		dataType: int64
		isHidden
		summarizeBy: none
		sourceColumn: Only Calc Item Column

	column 'Only RLS Column'
		dataType: int64
		isHidden
		summarizeBy: none
		sourceColumn: Only RLS Column

	column 'Only Hidden Measure Column'
		dataType: int64
		isHidden
		summarizeBy: none
		sourceColumn: Only Hidden Measure Column

	measure 'Only Calc Item Uses Me' = 1
		isHidden
		formatString: #,0

	measure 'Hidden Uses Column' = SUM('Sales'[Only Hidden Measure Column])
		isHidden
		formatString: #,0

	measure 'Bare Own Col' = SUM([Amount])
		formatString: #,0

	measure 'Bare Other Col' = COUNTROWS(FILTER('Date', [Year] > 2000))
		formatString: #,0

	measure 'Safe Ratio' = IFERROR([Total Cost] / [Total Amount], 0)
		formatString: #,0.0%;-#,0.0%;#,0.0%

	measure 'Total Amount' = SUM('Sales'[Amount])
		formatString: #,0

	measure 'Total Amount Copy' = SUM('Sales'[Amount])
		formatString: #,0

	measure 'Amount Alias' = [Total Amount]
		formatString: #,0

	measure 'Intersect Demo' = COUNTROWS(INTERSECT(VALUES('Product'[Category]), VALUES('Sales'[Category])))
		formatString: #,0

	measure 'Filter Column' = CALCULATE([Total Amount], FILTER('Sales', 'Sales'[Category] = "Bikes"))
		formatString: #,0

	measure 'Filter Measure' = CALCULATE([Total Amount], FILTER('Product', [Total Amount] > 100))
		formatString: #,0

	measure 'Total Cost' = SUM('Sales'[Cost])
		formatString: #,0

	measure 'Margin Pct' = 1 - DIVIDE([Total Cost], [Total Amount])
		formatString: #,0.0%;-#,0.0%;#,0.0%

	measure 'Logged Amount' = EVALUATEANDLOG([Total Amount])
		formatString: #,0

	measure 'Qualified Ref' = 'Sales'[Total Amount] * 2
		formatString: #,0

	measure 'Hidden Unused' = 1
		isHidden
		formatString: #,0

	measure lowercase = 2
		formatString: #,0

	measure 'Ship Amount' = CALCULATE([Total Amount], USERELATIONSHIP('Sales'[Ship Date], 'Date'[Date]))
		formatString: #,0

	measure 'YTD Amount' = TOTALYTD([Total Amount], 'Date'[Date])
		formatString: #,0

	partition SalesData = m
		mode: import
		source =
				let
				    Source = Table.FromRows({}),
				    Added = Table.AddColumn(Source, "X", each 1)
				in
				    Added
```

`tables/Product.tmdl`:

```
table Product

	column 'Product ID'
		dataType: int64
		isKey
		summarizeBy: none
		sourceColumn: Product ID

	column 'Product Name'
		dataType: string
		summarizeBy: none
		sourceColumn: Product Name

	column Category
		dataType: string
		summarizeBy: none
		sourceColumn: Category

	hierarchy 'by Category'

		level ' Category'
			column: Category

		level 'Product Name'
			column: 'Product Name'

	partition Product = m
		mode: import
		source =
				let
				    Source = Table.FromRows({})
				in
				    Source
```

`tables/Customer.tmdl`:

```
table Customer

	column 'Customer ID'
		dataType: int64
		isKey
		summarizeBy: none
		sourceColumn: Customer ID

	column 'Customer Name'
		dataType: string
		summarizeBy: none
		sourceColumn: Customer Name

	column Region
		dataType: string
		summarizeBy: none
		sourceColumn: Region

	partition Customer = m
		mode: directQuery
		source =
				let
				    Source = Sql.Database("localhost", "Sales"),
				    Customer = Source{[Schema="dbo",Item="Customer"]}[Data]
				in
				    Customer
```

`tables/Date.tmdl`:

```
table Date
	dataCategory: Time

	column Date
		dataType: dateTime
		isKey
		formatString: mm/dd/yyyy
		summarizeBy: none
		sourceColumn: Date

	column Year
		dataType: int64
		summarizeBy: none
		sourceColumn: Year

	column 'Month Name'
		dataType: string
		summarizeBy: none
		sourceColumn: Month Name
		sortByColumn: 'Month Number'

	column 'Month Number'
		dataType: int64
		isHidden
		isAvailableInMdx: false
		summarizeBy: none
		sourceColumn: Month Number

	partition Date = m
		mode: import
		source =
				let
				    Source = Table.FromRows({})
				in
				    Source
```

`tables/Region Security.tmdl`:

```
table 'Region Security'

	column Region
		dataType: string
		summarizeBy: none
		sourceColumn: Region

	column UserEmail
		dataType: string
		summarizeBy: none
		sourceColumn: UserEmail

	partition 'Region Security' = m
		mode: import
		source =
				let
				    Source = Table.FromRows({})
				in
				    Source
```

`tables/Monthly Budget.tmdl`:

```
table 'Monthly Budget'

	column Department
		dataType: string
		summarizeBy: none
		sourceColumn: Department

	column Jan
		dataType: decimal
		summarizeBy: sum
		sourceColumn: Jan

	column Feb
		dataType: decimal
		summarizeBy: sum
		sourceColumn: Feb

	column Mar
		dataType: decimal
		summarizeBy: sum
		sourceColumn: Mar

	column Apr
		dataType: decimal
		summarizeBy: sum
		sourceColumn: Apr

	column May
		dataType: decimal
		summarizeBy: sum
		sourceColumn: May

	column Jun
		dataType: decimal
		summarizeBy: sum
		sourceColumn: Jun

	partition 'Monthly Budget' = m
		mode: import
		source =
				let
				    Source = Table.FromRows({})
				in
				    Source
```

`tables/ Spaced .tmdl` (the file name has a leading and a trailing space):

```
table ' Spaced '

	column ' Padded Col '
		dataType: string
		summarizeBy: none
		sourceColumn: Padded Col

	partition ' Spaced ' = m
		mode: import
		source =
				let
				    Source = Table.FromRows({})
				in
				    Source
```

`tables/Time Intelligence.tmdl`:

```
table 'Time Intelligence'

	calculationGroup
		precedence: 1

		calculationItem YTD = CALCULATE(SELECTEDMEASURE(), DATESYTD('Date'[Date]))

		calculationItem Half = SELECTEDMEASURE() / 2

		calculationItem 'Bare Col' = IF(HASONEVALUE([Name]), SELECTEDMEASURE())

		calculationItem 'Bare Ordinal' = IF(MAX([Ordinal]) > 1, SELECTEDMEASURE())

		calculationItem 'Other Table Bare' = IF(HASONEVALUE([Year]), SELECTEDMEASURE())

		calculationItem 'Uses Hidden Measure' = [Only Calc Item Uses Me] + SELECTEDMEASURE()

		calculationItem 'Uses Hidden Column' = IF(MAX('Sales'[Only Calc Item Column]) > 1, SELECTEDMEASURE())

		calculationItem 'Qualified Measure' = 'Sales'[Total Amount] + SELECTEDMEASURE()

	column Name
		dataType: string
		summarizeBy: none
		sourceColumn: Name

	column Ordinal
		dataType: int64
		isHidden
		summarizeBy: none
		sourceColumn: Ordinal

	partition 'Time Intelligence' = calculationGroup
		mode: import
```

`tables/Empty Calc Group.tmdl`:

```
table 'Empty Calc Group'

	calculationGroup
		precedence: 2

	column Name
		dataType: string
		summarizeBy: none
		sourceColumn: Name

	partition 'Empty Calc Group' = calculationGroup
		mode: import
```

`roles/Region Users.tmdl`:

```
role 'Region Users'
	modelPermission: read

	tablePermission 'Region Security' = 'Region Security'[UserEmail] = USERNAME()

	tablePermission Date = LEFT('Date'[Year], 2) = "20" && [Year] > 2000

	tablePermission Sales = 'Sales'[Only RLS Column] = 1
```

`roles/Admins.tmdl`:

```
role Admins
	modelPermission: administrator

	member 'admin@example.com'
		identityProvider: AzureAD
		memberType: user
```

`perspectives/Empty View.tmdl`:

```
perspective 'Empty View'
```

`perspectives/Sales View.tmdl`:

```
perspective 'Sales View'

	perspectiveTable Sales

		perspectiveMeasure 'Total Amount'
```

- [ ] **Step 4: Write the data-sources fixture**

Serialized by Tabular Editor from a `.bim`; it is the only fixture with data sources and legacy query partitions. Directory: `tests/fixtures/data-sources.SemanticModel/definition/`.

`database.tmdl`:

```
database DsModel
	compatibilityLevel: 1600
	compatibilityMode: analysisServices
```

`model.tmdl`:

```
model Model
	culture: en-US

annotation __TEdtr = 1

ref table Legacy
ref table Structured
```

`dataSources.tmdl`:

```
dataSource 'Legacy SQL' = provider
	connectionString: Provider=SQLNCLI11;Data Source=localhost;Initial Catalog=Sales
	impersonationMode: impersonateServiceAccount

dataSource SQL/localhost;Sales
	connectionDetails =
			{
			  "authentication": null,
			  "query": null
			}
		protocol: tds
		address
			server: localhost
			database: Sales
	credential =
			{
			  "kind": "SQL",
			  "path": "localhost;Sales"
			}
		authenticationKind: ServiceAccount
```

`tables/Legacy.tmdl`:

```
table Legacy

	column Id
		dataType: int64
		summarizeBy: none
		sourceColumn: Id

	partition Legacy = query
		dataView: full
		source
			query = SELECT * FROM dbo.Legacy
			dataSource: 'Legacy SQL'
```

`tables/Structured.tmdl`:

```
table Structured

	column Id
		dataType: int64
		summarizeBy: none
		sourceColumn: Id

	partition Structured = query
		dataView: full
		source
			query = SELECT * FROM dbo.Structured
			dataSource: SQL/localhost;Sales
```

Verify both hand-written fixtures byte-for-byte against the spike copies:

```bash
diff -r tests/fixtures/rule-zoo.SemanticModel/definition "$SPIKE/corpus/rule-zoo.SemanticModel/definition" && diff -r tests/fixtures/data-sources.SemanticModel/definition "$SPIKE/corpus/data-sources.SemanticModel/definition" && echo identical
```

Expected: `identical`. (If a diff shows only trailing-newline differences, copy the spike version; the captured expectations were produced from those bytes.)

- [ ] **Step 5: Write the expectations converter**

`scripts/te-expectations.mjs`:

```js
#!/usr/bin/env node
// Convert Tabular Editor CLI BPA output into a pbiplint parity expectation file.
//
//   node scripts/te-expectations.mjs <fixtureDir> <out.json> --from <te-output.json>
//   node scripts/te-expectations.mjs <fixtureDir> <out.json> --rules <BPARules.json>   (runs `te`)
//
// Keeps any existing skipRules in <out.json>. Tabular Editor is a development-time oracle only.
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";

const [fixtureDir, outPath, ...rest] = process.argv.slice(2);
const opt = (name) => {
  const i = rest.indexOf(name);
  return i >= 0 ? rest[i + 1] : undefined;
};
if (!fixtureDir || !outPath || (!opt("--from") && !opt("--rules"))) {
  console.error("usage: te-expectations <fixtureDir> <out.json> (--from <te.json> | --rules <BPARules.json>) [--oracle <text>]");
  process.exit(2);
}

let raw;
if (opt("--from")) {
  raw = readFileSync(opt("--from"), "utf8");
} else {
  const definition = existsSync(join(fixtureDir, "definition")) ? join(fixtureDir, "definition") : fixtureDir;
  const run = spawnSync("te", ["bpa", "run", definition, "-r", opt("--rules"), "--no-defaults", "--no-model-rules", "--output-format", "json"], { encoding: "utf8" });
  if (run.error) {
    console.error(`could not run te: ${run.error.message}`);
    process.exit(2);
  }
  raw = run.stdout; // te exits 1 when error-level violations exist; that is not a failure here
}
const json = JSON.parse(raw.slice(raw.indexOf("{")));
if (json.ruleErrors) console.error(`warning: Tabular Editor reported ${json.ruleErrors} rule error(s)`);

const findings = {};
for (const r of json.results) (findings[r.ruleId] ??= []).push(r.objectName);
for (const id of Object.keys(findings)) findings[id].sort();
const sorted = Object.fromEntries(Object.keys(findings).sort().map((id) => [id, findings[id]]));

const previous = existsSync(outPath) ? JSON.parse(readFileSync(outPath, "utf8")) : {};
const out = {
  fixture: relative(process.cwd(), fixtureDir).split("\\").join("/"),
  oracle: opt("--oracle") ?? previous.oracle ?? "Tabular Editor CLI 0.5.2.11639 with BPARules.json sha256 ddb9cff4c2a0611a6467e2559d38319d9867381998066473ffa1e11c2d360392",
  captured: new Date().toISOString().slice(0, 10),
  skipRules: previous.skipRules ?? {},
  findings: sorted,
};
writeFileSync(outPath, JSON.stringify(out, null, 2) + "\n");
console.log(`${outPath}: ${json.results.length} findings across ${Object.keys(sorted).length} rules`);
```

- [ ] **Step 6: Generate the expectation files from the captures**

```bash
SPIKE=/Users/michaelmckinley/Downloads/pbip-lint-spike
node scripts/te-expectations.mjs examples/messy-sales tests/expectations/messy-sales.json --from "$SPIKE/te-json/messy-sales.json"
node scripts/te-expectations.mjs tests/fixtures/tvw-baseline.SemanticModel tests/expectations/tvw-baseline.json --from "$SPIKE/te-json/tvw-baseline.json"
node scripts/te-expectations.mjs tests/fixtures/kitchen-sink.SemanticModel tests/expectations/kitchen-sink.json --from "$SPIKE/te-json/tmdlmaker-KitchenSinkDemo.json"
node scripts/te-expectations.mjs tests/fixtures/rule-zoo.SemanticModel tests/expectations/rule-zoo.json --from "$SPIKE/te-json/rule-zoo.json"
node scripts/te-expectations.mjs tests/fixtures/data-sources.SemanticModel tests/expectations/data-sources.json --from "$SPIKE/te-json/data-sources.json"
```

Expected output lines: messy-sales 161 findings / 14 rules; tvw-baseline 183 / 21; kitchen-sink 9 / 5; rule-zoo 143 / 46; data-sources 8 / 4.

Then edit `tests/expectations/data-sources.json` and set `"captured"` to `"2026-09-04"` in all five files (the captures were taken that day) and add the skip:

```json
"skipRules": {
  "REMOVE_DATA_SOURCES_NOT_REFERENCED_BY_ANY_PARTITIONS": "Tabular Editor CLI 0.5.2 flagged 'Unused SQL' when this model was loaded from .bim but not when loaded from these TMDL files; the port follows the rule text and is unit-tested instead."
}
```

- [ ] **Step 7: Write the parity test**

`packages/core/test/parity.test.ts`:

```ts
import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { lint } from "../src/engine/lint.js";
import { defaultRules } from "../src/rules/index.js";
import { readModelFiles } from "./helpers.js";

interface Expectation {
  name: string;
  fixture: string;
  skipRules?: Record<string, string>;
  findings: Record<string, string[]>;
}

const repoRoot = new URL("../../../", import.meta.url).pathname;
const expectationsDir = repoRoot + "tests/expectations/";
const expectations: Expectation[] = readdirSync(expectationsDir)
  .filter((f) => f.endsWith(".json"))
  .map((f) => ({ name: f.replace(/\.json$/, ""), ...(JSON.parse(readFileSync(expectationsDir + f, "utf8")) as Omit<Expectation, "name">) }));

const ported = defaultRules.filter((r) => r.status === "ported");
const expectedCounts = new Map<string, number>(ported.map((r) => [r.id, 0]));

describe.each(expectations)("parity with Tabular Editor: $name", (exp) => {
  const files = readModelFiles(repoRoot + exp.fixture);
  const result = lint(files, { config: { failOn: "none" } });
  const ours: Record<string, string[]> = {};
  for (const f of result.findings) (ours[f.ruleId] ??= []).push(f.objectName);

  it("reads at least one file", () => {
    expect(files.length).toBeGreaterThan(0);
  });
  it("parses every file without issues", () => {
    expect(result.findings.filter((f) => f.ruleId === "PARSE_ISSUE")).toEqual([]);
  });
  it("runs every rule without errors", () => {
    expect(result.summary.ruleErrors).toEqual([]);
  });
  it.each(ported.map((r) => [r.id] as const))("%s", (id) => {
    if (exp.skipRules?.[id]) return;
    const expected = [...(exp.findings[id] ?? [])].sort();
    const actual = [...(ours[id] ?? [])].sort();
    expectedCounts.set(id, (expectedCounts.get(id) ?? 0) + expected.length);
    expect(actual).toEqual(expected);
  });
  it("reports rules Tabular Editor fired that are not ported yet", () => {
    const missing = Object.keys(exp.findings).filter((id) => !ported.some((r) => r.id === id) && !exp.skipRules?.[id]);
    if (missing.length) console.log(`[parity] ${exp.name}: not yet ported: ${missing.join(", ")}`);
  });
});

describe("parity coverage", () => {
  it("lists ported rules that no fixture exercises", () => {
    const untested = [...expectedCounts].filter(([, n]) => n === 0).map(([id]) => id);
    if (untested.length) console.log(`[parity] ported rules with no fixture findings: ${untested.join(", ")}`);
  });
});
```

- [ ] **Step 8: Run**

Run: `npm test -- parity`
Expected: PASS. Every fixture parses with zero issues (this is the first real test of the parser on Desktop and Tabular Editor output). The console shows `not yet ported:` lines for every rule Tabular Editor fired, which is correct at this point. If a fixture reports a `PARSE_ISSUE`, fix the parser (Task 2) rather than the fixture, unless the fixture file is genuinely malformed.

- [ ] **Step 9: Commit**

```bash
git add scripts/sanitize-fixture.mjs scripts/te-expectations.mjs examples tests packages/core/test/parity.test.ts
git commit -m "test: add sanitized fixtures, sample project, and Tabular Editor parity harness"
```

---

### Task 8: Vendored ruleset metadata, rule definition helpers, and column property rules

**Files:**
- Create: `scripts/vendor-bpa-rules.mjs`, `NOTICE`
- Create: `packages/core/src/rules/microsoft-bpa/bpa-rules.data.ts` (generated), `packages/core/src/rules/microsoft-bpa/define.ts`, `packages/core/src/rules/microsoft-bpa/columns.ts`, `packages/core/src/rules/microsoft-bpa/index.ts`
- Modify: `packages/core/src/rules/index.ts`, `packages/core/test/helpers.ts`
- Test: `packages/core/test/define.test.ts`, `packages/core/test/rules-columns.test.ts`

**Interfaces:**
- Consumes: helpers, `Rule`, `RuleFinding` (Task 6); indexes (Task 5).
- Produces: `BPA_RULES: readonly BpaRuleMeta[]` (71 entries, `{ id, name, category, severity, scope, expression, fixExpression?, description }`); `bpaRule(id, check): Rule` (fills name, category, severity, scope, description, fixExpression, references from the metadata; `status: "ported"`); `liveModelRule(id): Rule` (`status: "needsLiveModel"`, `check` returns `[]`); `mapScope(scope: string): ObjectType[]`; `microsoftBpaRules: Rule[]` (the pack; grows in Tasks 9 to 13); `defaultRules` now `[PARSE_ISSUE, ...microsoftBpaRules]`; test helper `objectNames(rule, tmdl): string[]`.
- Rules ported here (12): `AVOID_FLOATING_POINT_DATA_TYPES`, `DATECOLUMN_FORMATSTRING`, `MONTHCOLUMN_FORMATSTRING`, `ADD_DATA_CATEGORY_FOR_COLUMNS`, `MONTH_(AS_A_STRING)_MUST_BE_SORTED`, `NUMERIC_COLUMN_SUMMARIZE_BY`, `FORMAT_FLAG_COLUMNS_AS_YES/NO_VALUE_STRINGS`, `DATA_COLUMNS_MUST_HAVE_A_SOURCE_COLUMN`, `ISAVAILABLEINMDX_FALSE_NONATTRIBUTE_COLUMNS`, `SET_ISAVAILABLEINMDX_TO_TRUE_ON_NECESSARY_COLUMNS`, `UNNECESSARY_COLUMNS`, `HIDE_FACT_TABLE_COLUMNS`.

- [ ] **Step 1: Vendor the ruleset metadata**

`scripts/vendor-bpa-rules.mjs`:

```js
#!/usr/bin/env node
// Usage: node scripts/vendor-bpa-rules.mjs <BPARules.json>
// Writes packages/core/src/rules/microsoft-bpa/bpa-rules.data.ts from Microsoft's ruleset (MIT).
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";

const src = process.argv[2];
if (!src) {
  console.error("usage: node scripts/vendor-bpa-rules.mjs <BPARules.json>");
  process.exit(2);
}
const text = readFileSync(src, "utf8");
const sha = createHash("sha256").update(text).digest("hex");
const nl = (s) => (s ?? "").replace(/\r\n/g, "\n");
const rules = JSON.parse(text).map((r) => ({
  id: r.ID,
  name: r.Name,
  category: r.Category,
  severity: r.Severity,
  scope: r.Scope,
  expression: nl(r.Expression),
  ...(r.FixExpression ? { fixExpression: nl(r.FixExpression) } : {}),
  description: nl(r.Description),
}));
const out = `// Generated by scripts/vendor-bpa-rules.mjs. Do not edit by hand.
// Source: BPARules.json from https://github.com/microsoft/Analysis-Services (MIT License, see NOTICE).
// Source sha256: ${sha}

export interface BpaRuleMeta {
  id: string;
  name: string;
  category: string;
  severity: number;
  scope: string;
  expression: string;
  fixExpression?: string;
  description: string;
}

export const BPA_RULES: readonly BpaRuleMeta[] = ${JSON.stringify(rules, null, 2)};
`;
writeFileSync("packages/core/src/rules/microsoft-bpa/bpa-rules.data.ts", out);
console.log(`wrote ${rules.length} rules (sha256 ${sha})`);
```

Run:

```bash
mkdir -p packages/core/src/rules/microsoft-bpa
node scripts/vendor-bpa-rules.mjs /Users/michaelmckinley/Downloads/pbip-lint-spike/ref/BPARules.json
```

Expected: `wrote 71 rules (sha256 ddb9cff4c2a0611a6467e2559d38319d9867381998066473ffa1e11c2d360392)`.

`NOTICE` (repo root):

```
pbiplint bundles rule definitions derived from BPARules.json in the
microsoft/Analysis-Services repository (https://github.com/microsoft/Analysis-Services),
which is licensed under the MIT License:

MIT License

Copyright (c) Microsoft Corporation. All rights reserved.

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

- [ ] **Step 2: Write the failing tests**

Add to `packages/core/test/helpers.ts`:

```ts
import { buildIndexes } from "../src/index/build.js";
import type { Rule } from "../src/rules/types.js";

/** Run one rule on inline TMDL and return the object names it flags, in emission order. */
export function objectNames(rule: Rule, tmdl: string): string[] {
  const model = modelFrom(tmdl);
  return rule.check(model, { indexes: buildIndexes(model) }).map((f) => f.objectName);
}
```

`packages/core/test/define.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { BPA_RULES } from "../src/rules/microsoft-bpa/bpa-rules.data.js";
import { bpaRule, liveModelRule, mapScope } from "../src/rules/microsoft-bpa/define.js";

describe("vendored ruleset", () => {
  it("has all 71 Microsoft rules with unique ids", () => {
    expect(BPA_RULES.length).toBe(71);
    expect(new Set(BPA_RULES.map((r) => r.id)).size).toBe(71);
    expect(BPA_RULES.some((r) => r.expression.includes("\r"))).toBe(false);
  });
});

describe("mapScope", () => {
  it("maps Microsoft scope names to object types and drops KPI", () => {
    expect(mapScope("DataColumn, CalculatedColumn, CalculatedTableColumn")).toEqual(["Column", "CalculatedColumn", "CalculatedTableColumn"]);
    expect(mapScope("Measure, KPI, TablePermission, CalculationItem")).toEqual(["Measure", "TablePermission", "CalculationItem"]);
    expect(mapScope("ProviderDataSource, StructuredDataSource")).toEqual(["DataSource"]);
    expect(mapScope("CalculationGroup, ModelRole")).toEqual(["CalculationGroupTable", "Role"]);
    expect(() => mapScope("Widget")).toThrow(/Widget/);
  });
});

describe("bpaRule", () => {
  it("fills metadata from the ruleset and strips the category prefix from the name", () => {
    const r = bpaRule("HIDE_FOREIGN_KEYS", () => []);
    expect(r).toMatchObject({ id: "HIDE_FOREIGN_KEYS", name: "Hide foreign keys", category: "Formatting", severity: 2, status: "ported", fixExpression: "IsHidden = true" });
    expect(r.scope).toEqual(["Column", "CalculatedColumn", "CalculatedTableColumn"]);
    expect(r.description).toBe("Foreign keys should always be hidden.");
  });
  it("extracts reference URLs from the description", () => {
    const r = bpaRule("ISAVAILABLEINMDX_FALSE_NONATTRIBUTE_COLUMNS", () => []);
    expect(r.references).toEqual(["https://blog.crossjoin.co.uk/2018/07/02/isavailableinmdx-ssas-tabular/"]);
  });
  it("rejects unknown ids", () => {
    expect(() => bpaRule("NOPE", () => [])).toThrow(/NOPE/);
  });
  it("declares live-model rules that never run", () => {
    const r = liveModelRule("SPLIT_DATE_AND_TIME");
    expect(r.status).toBe("needsLiveModel");
    expect(r.check({} as never, {} as never)).toEqual([]);
  });
});
```

`packages/core/test/rules-columns.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import * as rules from "../src/rules/microsoft-bpa/columns.js";
import { objectNames } from "./helpers.js";

const col = (body: string) => `table T\n${body}\n\tpartition T = m\n\t\tmode: import\n\t\tsource = 1\n`;

describe("column property rules", () => {
  it("AVOID_FLOATING_POINT_DATA_TYPES flags double columns of any kind", () => {
    expect(objectNames(rules.AVOID_FLOATING_POINT_DATA_TYPES, col("\tcolumn A\n\t\tdataType: double\n\tcolumn B = 1\n\t\tdataType: Double\n\tcolumn C\n\t\tdataType: decimal"))).toEqual(["'T'[A]", "'T'[B]"]);
  });
  it("DATECOLUMN_FORMATSTRING and MONTHCOLUMN_FORMATSTRING match names case-insensitively and exact format strings", () => {
    const m = col("\tcolumn 'Order date'\n\t\tdataType: dateTime\n\t\tformatString: Long Date\n\tcolumn 'Ship Date'\n\t\tdataType: dateTime\n\t\tformatString: mm/dd/yyyy\n\tcolumn 'Month Start'\n\t\tdataType: dateTime\n\tcolumn Update\n\t\tdataType: dateTime");
    expect(objectNames(rules.DATECOLUMN_FORMATSTRING, m)).toEqual(["'T'[Order date]", "'T'[Update]"]);
    expect(objectNames(rules.MONTHCOLUMN_FORMATSTRING, m)).toEqual(["'T'[Month Start]"]);
  });
  it("ADD_DATA_CATEGORY_FOR_COLUMNS looks at names and types", () => {
    const m = col("\tcolumn City\n\t\tdataType: string\n\tcolumn Latitude\n\t\tdataType: double\n\tcolumn 'Country Code'\n\t\tdataType: int64\n\tcolumn Continent\n\t\tdataType: string\n\t\tdataCategory: Continent");
    expect(objectNames(rules.ADD_DATA_CATEGORY_FOR_COLUMNS, m)).toEqual(["'T'[City]", "'T'[Latitude]"]);
  });
  it("MONTH_(AS_A_STRING)_MUST_BE_SORTED ignores MONTHS and sorted columns", () => {
    const m = col("\tcolumn Month\n\t\tdataType: string\n\tcolumn Months\n\t\tdataType: string\n\tcolumn MonthName\n\t\tdataType: string\n\t\tsortByColumn: Month\n\tcolumn MonthNo\n\t\tdataType: int64");
    expect(objectNames(rules.MONTH_AS_A_STRING_MUST_BE_SORTED, m)).toEqual(["'T'[Month]"]);
  });
  it("NUMERIC_COLUMN_SUMMARIZE_BY treats a missing summarizeBy as not none and skips hidden columns", () => {
    const m = col("\tcolumn A\n\t\tdataType: int64\n\tcolumn B\n\t\tdataType: decimal\n\t\tsummarizeBy: none\n\tcolumn C\n\t\tdataType: double\n\t\tisHidden\n\tcolumn D\n\t\tdataType: string");
    expect(objectNames(rules.NUMERIC_COLUMN_SUMMARIZE_BY, m)).toEqual(["'T'[A]"]);
  });
  it("FORMAT_FLAG_COLUMNS_AS_YES/NO_VALUE_STRINGS", () => {
    const m = col("\tcolumn IsActive\n\t\tdataType: int64\n\tcolumn Island\n\t\tdataType: string\n\tcolumn 'VIP Flag'\n\t\tdataType: boolean\n\tcolumn 'Text Flag'\n\t\tdataType: string\n\tcolumn IsHiddenOne\n\t\tdataType: int64\n\t\tisHidden");
    expect(objectNames(rules.FORMAT_FLAG_COLUMNS_AS_YES_NO_VALUE_STRINGS, m)).toEqual(["'T'[IsActive]", "'T'[VIP Flag]"]);
  });
  it("DATA_COLUMNS_MUST_HAVE_A_SOURCE_COLUMN skips calculated columns", () => {
    const m = col("\tcolumn A\n\t\tdataType: string\n\tcolumn B = 1\n\t\tdataType: int64\n\tcolumn C\n\t\tdataType: string\n\t\tsourceColumn: C");
    expect(objectNames(rules.DATA_COLUMNS_MUST_HAVE_A_SOURCE_COLUMN, m)).toEqual(["'T'[A]"]);
  });
  it("ISAVAILABLEINMDX rules use the usage index", () => {
    const m = col("\tcolumn Hidden\n\t\tdataType: int64\n\t\tisHidden\n\tcolumn SortTarget\n\t\tdataType: int64\n\t\tisHidden\n\tcolumn Name\n\t\tdataType: string\n\t\tsortByColumn: SortTarget\n\tcolumn Off\n\t\tdataType: string\n\t\tisAvailableInMdx: false\n\t\tsortByColumn: SortTarget\n\thierarchy H\n\t\tlevel L\n\t\t\tcolumn: Name");
    expect(objectNames(rules.ISAVAILABLEINMDX_FALSE_NONATTRIBUTE_COLUMNS, m)).toEqual(["'T'[Hidden]"]);
    expect(objectNames(rules.SET_ISAVAILABLEINMDX_TO_TRUE_ON_NECESSARY_COLUMNS, m)).toEqual(["'T'[Off]"]);
  });
  it("UNNECESSARY_COLUMNS honors references, relationships, sort-by, hierarchies, RLS text, and OLS", () => {
    const m = `table T
	column Unused
		dataType: int64
		isHidden
	column InMeasure
		dataType: int64
		isHidden
	column InRel
		dataType: int64
		isHidden
	column InRlsBare
		dataType: int64
		isHidden
	column InRlsOther
		dataType: int64
		isHidden
	column Ols
		dataType: int64
		isHidden
	measure M = SUM('T'[InMeasure])
	partition T = m
		mode: import
		source = 1

table U
	isHidden
	column K
		dataType: int64
	column TableOls
		dataType: int64
	partition U = m
		mode: import
		source = 1

relationship r
	fromColumn: T.InRel
	toColumn: U.K

role R
	modelPermission: read
	tablePermission T = [InRlsBare] = 1
		columnPermission Ols = none
	tablePermission U = 'T'[InRlsOther] = 1
		metadataPermission: none
`;
    expect(objectNames(rules.UNNECESSARY_COLUMNS, m)).toEqual(["'T'[Unused]"]);
  });
  it("HIDE_FACT_TABLE_COLUMNS matches aggregations over qualified references only", () => {
    const m = col("\tcolumn Amount\n\t\tdataType: decimal\n\tcolumn Qty\n\t\tdataType: int64\n\tcolumn Name\n\t\tdataType: string\n\tmeasure A = SUM ( 'T'[Amount] )\n\tmeasure B = sum(T[Qty]) + COUNTA('T'[Name])\n\tmeasure C = SUMX(T, [Amount])");
    expect(objectNames(rules.HIDE_FACT_TABLE_COLUMNS, m)).toEqual(["'T'[Amount]", "'T'[Qty]"]);
  });
});
```

- [ ] **Step 3: Run to verify failure**

Run: `npm test -- define rules-columns`
Expected: FAIL, cannot find modules.

- [ ] **Step 4: Write the definition helpers**

`packages/core/src/rules/microsoft-bpa/define.ts`:

```ts
import type { Model } from "../../model/types.js";
import type { Category, ObjectType, Rule, RuleContext, RuleFinding, Severity } from "../types.js";
import { BPA_RULES, type BpaRuleMeta } from "./bpa-rules.data.js";

const byId = new Map(BPA_RULES.map((r) => [r.id, r]));

/** Microsoft scope name to pbiplint object type. KPI is not modeled in v1 and maps to nothing. */
const SCOPE_MAP: Record<string, ObjectType | null> = {
  Model: "Model",
  Table: "Table",
  CalculatedTable: "CalculatedTable",
  CalculationGroup: "CalculationGroupTable",
  DataColumn: "Column",
  CalculatedColumn: "CalculatedColumn",
  CalculatedTableColumn: "CalculatedTableColumn",
  Measure: "Measure",
  Partition: "Partition",
  Relationship: "Relationship",
  ModelRole: "Role",
  TablePermission: "TablePermission",
  Perspective: "Perspective",
  Hierarchy: "Hierarchy",
  Level: "Level",
  CalculationItem: "CalculationItem",
  NamedExpression: "NamedExpression",
  ProviderDataSource: "DataSource",
  StructuredDataSource: "DataSource",
  KPI: null,
};

export function mapScope(scope: string): ObjectType[] {
  const out: ObjectType[] = [];
  for (const s of scope.split(",").map((x) => x.trim()).filter((x) => x.length > 0)) {
    if (!(s in SCOPE_MAP)) throw new Error(`Unknown BPA scope: ${s}`);
    const t = SCOPE_MAP[s];
    if (t && !out.includes(t)) out.push(t);
  }
  return out;
}

export const metaOf = (id: string): BpaRuleMeta => {
  const meta = byId.get(id);
  if (!meta) throw new Error(`Unknown BPA rule id: ${id}`);
  return meta;
};

const stripCategory = (name: string): string => name.replace(/^\[[^\]]*\]\s*/, "");

const extractUrls = (text: string): string[] =>
  [...new Set((text.match(/https?:\/\/[^\s)"]+/g) ?? []).map((u) => u.replace(/[.,]$/, "")))];

/** A literal port of one Microsoft BPA rule: metadata from the ruleset, behavior from `check`. */
export function bpaRule(id: string, check: (model: Model, ctx: RuleContext) => RuleFinding[]): Rule {
  const meta = metaOf(id);
  return {
    id,
    name: stripCategory(meta.name),
    category: meta.category as Category,
    severity: meta.severity as Severity,
    scope: mapScope(meta.scope),
    description: meta.description,
    fixExpression: meta.fixExpression,
    references: extractUrls(meta.description),
    status: "ported",
    check,
  };
}

/** A rule that needs VertiPaq statistics: declared so it can be listed, never run. */
export function liveModelRule(id: string): Rule {
  return { ...bpaRule(id, () => []), status: "needsLiveModel" };
}
```

- [ ] **Step 5: Write the column rules**

`packages/core/src/rules/microsoft-bpa/columns.ts`:

```ts
import type { Column, Model } from "../../model/types.js";
import { allColumns, allMeasures, allTablePermissions, dataType, finding, hiddenOrTableHidden, isBlank, isNumericType } from "../helpers.js";
import type { RuleContext, RuleFinding } from "../types.js";
import { bpaRule } from "./define.js";

const columns = (m: Model, pred: (c: Column) => boolean): RuleFinding[] => allColumns(m).filter(pred).map(finding.column);
const escapeRegExp = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export const AVOID_FLOATING_POINT_DATA_TYPES = bpaRule("AVOID_FLOATING_POINT_DATA_TYPES", (m) =>
  columns(m, (c) => dataType(c) === "double"),
);

export const DATECOLUMN_FORMATSTRING = bpaRule("DATECOLUMN_FORMATSTRING", (m) =>
  columns(m, (c) => /date/i.test(c.name) && dataType(c) === "datetime" && (c.formatString ?? "") !== "mm/dd/yyyy"),
);

export const MONTHCOLUMN_FORMATSTRING = bpaRule("MONTHCOLUMN_FORMATSTRING", (m) =>
  columns(m, (c) => /month/i.test(c.name) && dataType(c) === "datetime" && (c.formatString ?? "") !== "MMMM yyyy"),
);

export const ADD_DATA_CATEGORY_FOR_COLUMNS = bpaRule("ADD_DATA_CATEGORY_FOR_COLUMNS", (m) =>
  columns(m, (c) => {
    const n = c.name.toLowerCase();
    const d = dataType(c);
    return (
      isBlank(c.dataCategory) &&
      (((n.includes("country") || n.includes("continent") || n.includes("city")) && d === "string") ||
        ((n === "latitude" || n === "longitude") && (d === "decimal" || d === "double")))
    );
  }),
);

export const MONTH_AS_A_STRING_MUST_BE_SORTED = bpaRule("MONTH_(AS_A_STRING)_MUST_BE_SORTED", (m) =>
  columns(m, (c) => {
    const u = c.name.toUpperCase();
    return u.includes("MONTH") && !u.includes("MONTHS") && dataType(c) === "string" && c.sortByColumn === undefined;
  }),
);

// TOM's default SummarizeBy is Default, which is not None, so a column without the property is flagged.
export const NUMERIC_COLUMN_SUMMARIZE_BY = bpaRule("NUMERIC_COLUMN_SUMMARIZE_BY", (m) =>
  columns(m, (c) => isNumericType(c) && (c.summarizeBy ?? "default").toLowerCase() !== "none" && !hiddenOrTableHidden(c)),
);

export const FORMAT_FLAG_COLUMNS_AS_YES_NO_VALUE_STRINGS = bpaRule("FORMAT_FLAG_COLUMNS_AS_YES/NO_VALUE_STRINGS", (m) =>
  columns(m, (c) => !hiddenOrTableHidden(c) && ((c.name.startsWith("Is") && dataType(c) === "int64") || (c.name.endsWith(" Flag") && dataType(c) !== "string"))),
);

export const DATA_COLUMNS_MUST_HAVE_A_SOURCE_COLUMN = bpaRule("DATA_COLUMNS_MUST_HAVE_A_SOURCE_COLUMN", (m) =>
  columns(m, (c) => c.kind === "data" && isBlank(c.sourceColumn)),
);

export const ISAVAILABLEINMDX_FALSE_NONATTRIBUTE_COLUMNS = bpaRule("ISAVAILABLEINMDX_FALSE_NONATTRIBUTE_COLUMNS", (m, { indexes: { usage } }: RuleContext) =>
  columns(m, (c) => c.isAvailableInMdx && hiddenOrTableHidden(c) && !usage.usedInSortBy(c) && !usage.usedInHierarchies(c) && !usage.usedInVariations(c) && c.sortByColumn === undefined),
);

export const SET_ISAVAILABLEINMDX_TO_TRUE_ON_NECESSARY_COLUMNS = bpaRule("SET_ISAVAILABLEINMDX_TO_TRUE_ON_NECESSARY_COLUMNS", (m, { indexes: { usage } }: RuleContext) =>
  columns(m, (c) => !c.isAvailableInMdx && (usage.usedInSortBy(c) || usage.usedInHierarchies(c) || usage.usedInVariations(c) || c.sortByColumn !== undefined)),
);

export const UNNECESSARY_COLUMNS = bpaRule("UNNECESSARY_COLUMNS", (m, { indexes }: RuleContext) => {
  const permissions = allTablePermissions(m);
  return columns(m, (c) => {
    if (!hiddenOrTableHidden(c)) return false;
    if (indexes.references.columnReferencedBy(c).length > 0) return false;
    if (indexes.relationships.forColumn(c.table.name, c.name).length > 0) return false;
    if (indexes.usage.usedInSortBy(c) || indexes.usage.usedInHierarchies(c)) return false;
    // The source rule also does plain substring checks on RLS filters (case-insensitive).
    const bare = `[${c.name}]`.toLowerCase();
    const qualified = [`${c.table.name}[${c.name}]`.toLowerCase(), `'${c.table.name}'[${c.name}]`.toLowerCase()];
    for (const tp of permissions) {
      const f = tp.filter?.toLowerCase();
      if (f === undefined) continue;
      if (tp.table === c.table.name && f.includes(bare)) return false;
      if (qualified.some((q) => f.includes(q))) return false;
    }
    // Object-level security on the column or its table.
    for (const tp of permissions) {
      if (tp.table !== c.table.name) continue;
      if (tp.metadataPermission === "none") return false;
      if (tp.columnPermissions.some((cp) => cp.column === c.name && cp.permission === "none")) return false;
    }
    return true;
  });
});

const AGGREGATIONS = ["COUNT", "COUNTBLANK", "SUM", "AVERAGE", "VALUES", "DISTINCT", "DISTINCTCOUNT", "MIN", "MAX", "COUNTA", "AVERAGEA", "MAXA", "MINA"];

export const HIDE_FACT_TABLE_COLUMNS = bpaRule("HIDE_FACT_TABLE_COLUMNS", (m) => {
  const measures = allMeasures(m);
  return columns(m, (c) => {
    if (c.isHidden || !isNumericType(c)) return false;
    const re = new RegExp(`(?:${AGGREGATIONS.join("|")})\\s*\\(\\s*'*${escapeRegExp(c.table.name)}'*\\[${escapeRegExp(c.name)}\\]\\s*\\)`, "i");
    return measures.some((x) => re.test(x.expression));
  });
});

export const columnRules = [
  AVOID_FLOATING_POINT_DATA_TYPES,
  DATECOLUMN_FORMATSTRING,
  MONTHCOLUMN_FORMATSTRING,
  ADD_DATA_CATEGORY_FOR_COLUMNS,
  MONTH_AS_A_STRING_MUST_BE_SORTED,
  NUMERIC_COLUMN_SUMMARIZE_BY,
  FORMAT_FLAG_COLUMNS_AS_YES_NO_VALUE_STRINGS,
  DATA_COLUMNS_MUST_HAVE_A_SOURCE_COLUMN,
  ISAVAILABLEINMDX_FALSE_NONATTRIBUTE_COLUMNS,
  SET_ISAVAILABLEINMDX_TO_TRUE_ON_NECESSARY_COLUMNS,
  UNNECESSARY_COLUMNS,
  HIDE_FACT_TABLE_COLUMNS,
];
```

`packages/core/src/rules/microsoft-bpa/index.ts`:

```ts
import type { Rule } from "../types.js";
import { columnRules } from "./columns.js";

/** The microsoft-bpa pack. Later tasks append their rule arrays here. */
export const microsoftBpaRules: Rule[] = [...columnRules];
```

Replace `packages/core/src/rules/index.ts`:

```ts
import { microsoftBpaRules } from "./microsoft-bpa/index.js";
import { PARSE_ISSUE } from "./parse-issue.js";
import type { Rule } from "./types.js";

export const defaultRules: Rule[] = [PARSE_ISSUE, ...microsoftBpaRules];
```

Add to `packages/core/src/index.ts`:

```ts
export { microsoftBpaRules } from "./rules/microsoft-bpa/index.js";
export { BPA_RULES, type BpaRuleMeta } from "./rules/microsoft-bpa/bpa-rules.data.js";
export { bpaRule, liveModelRule, mapScope } from "./rules/microsoft-bpa/define.js";
```

- [ ] **Step 6: Run unit tests, then parity**

Run: `npm test -- define rules-columns`
Expected: PASS (15 tests).

Run: `npm test -- parity`
Expected: PASS. The 12 rules now compare against every fixture: messy-sales (AVOID_FLOATING_POINT 3, DATECOLUMN 7, ADD_DATA_CATEGORY 6, HIDE_FACT_TABLE 5, MONTH 1), tvw-baseline (ISAVAILABLEINMDX 27, UNNECESSARY_COLUMNS 4, NUMERIC 2, ...), rule-zoo (SET_ISAVAILABLEINMDX 1, FORMAT_FLAG 2, DATA_COLUMNS 1, MONTHCOLUMN 1, UNNECESSARY_COLUMNS 1 for `'Time Intelligence'[Ordinal]`). If `UNNECESSARY_COLUMNS` disagrees on `'Time Intelligence'[Ordinal]`, the reference index is resolving bare refs inside calculation items; see ground-truth item 3.

- [ ] **Step 7: Commit**

```bash
git add NOTICE scripts/vendor-bpa-rules.mjs packages/core/src/rules packages/core/src/index.ts packages/core/test/helpers.ts packages/core/test/define.test.ts packages/core/test/rules-columns.test.ts
git commit -m "feat(rules): vendor BPA ruleset metadata and port the column property rules"
```

---

### Task 9: Relationship graph rules

**Files:**
- Create: `packages/core/src/rules/microsoft-bpa/relationships.ts`
- Modify: `packages/core/src/rules/helpers.ts` (add `tablesInScope`), `packages/core/src/rules/microsoft-bpa/index.ts`
- Test: `packages/core/test/rules-relationships.test.ts`

**Interfaces:**
- Consumes: `bpaRule` (Task 8), `RelationshipIndex` (Task 5), helpers (Task 6).
- Produces: `tablesInScope(m): Table[]` (every table except calculation group tables, which satisfy only the `CalculationGroup` scope, ground-truth item 1); `relationshipRules: Rule[]` with 12 rules: `RELATIONSHIP_COLUMNS_SHOULD_BE_OF_INTEGER_DATA_TYPE`, `HIDE_FOREIGN_KEYS`, `MARK_PRIMARY_KEYS`, `REMOVE_REDUNDANT_COLUMNS_IN_RELATED_TABLES`, `SNOWFLAKE_SCHEMA_ARCHITECTURE`, `ENSURE_TABLES_HAVE_RELATIONSHIPS`, `MANY-TO-MANY_RELATIONSHIPS_SHOULD_BE_SINGLE-DIRECTION`, `CHECK_IF_BI-DIRECTIONAL_AND_MANY-TO-MANY_RELATIONSHIPS_ARE_VALID`, `RELATIONSHIP_COLUMNS_SAME_DATA_TYPE`, `INACTIVE_RELATIONSHIPS_THAT_ARE_NEVER_ACTIVATED`, `AVOID_EXCESSIVE_BI-DIRECTIONAL_OR_MANY-TO-MANY_RELATIONSHIPS`, `AVOID_USING_MANY-TO-MANY_RELATIONSHIPS_ON_TABLES_USED_FOR_DYNAMIC_ROW_LEVEL_SECURITY`.

- [ ] **Step 1: Write the failing tests**

`packages/core/test/rules-relationships.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import * as rules from "../src/rules/microsoft-bpa/relationships.js";
import { objectNames } from "./helpers.js";

const star = `table Sales
	column 'Product ID'
		dataType: int64
	column 'Date Key'
		dataType: dateTime
	column Category
		dataType: string
	column 'Product ID Copy'
		dataType: int64
	measure M = CALCULATE(1, USERELATIONSHIP('Sales'[Date Key], 'Date'[Date]))
	partition Sales = m
		mode: import
		source = 1

table Product
	column 'Product ID'
		dataType: int64
	column Category
		dataType: string
	partition Product = m
		mode: import
		source = 1

table Date
	dataCategory: Time
	column Date
		dataType: dateTime
		isKey
	column 'Product ID'
		dataType: string
	partition Date = m
		mode: import
		source = 1

table Lonely
	column X
		dataType: int64
	partition Lonely = m
		mode: import
		source = 1

table CG
	calculationGroup
		calculationItem I = SELECTEDMEASURE()
	column Name
		dataType: string
	partition CG = calculationGroup
		mode: import

relationship r1
	fromColumn: Sales.'Product ID'
	toColumn: Product.'Product ID'

relationship r2
	isActive: false
	fromColumn: Sales.'Date Key'
	toColumn: Date.Date

relationship r3
	isActive: false
	fromColumn: Date.'Product ID'
	toColumn: Product.'Product ID'
`;

describe("relationship graph rules", () => {
  it("RELATIONSHIP_COLUMNS_SHOULD_BE_OF_INTEGER_DATA_TYPE", () => {
    expect(objectNames(rules.RELATIONSHIP_COLUMNS_SHOULD_BE_OF_INTEGER_DATA_TYPE, star)).toEqual(["'Sales'[Date Key]", "'Date'[Date]", "'Date'[Product ID]"]);
  });
  it("HIDE_FOREIGN_KEYS compares from-column names only (the Microsoft quirk)", () => {
    // 'Product'[Product ID] is a primary key, but its name equals a from-column name, so it is flagged too.
    expect(objectNames(rules.HIDE_FOREIGN_KEYS, star)).toEqual(["'Sales'[Product ID]", "'Sales'[Date Key]", "'Product'[Product ID]", "'Date'[Product ID]"]);
  });
  it("MARK_PRIMARY_KEYS skips date tables and marked keys", () => {
    expect(objectNames(rules.MARK_PRIMARY_KEYS, star)).toEqual(["'Product'[Product ID]"]);
  });
  it("REMOVE_REDUNDANT_COLUMNS_IN_RELATED_TABLES", () => {
    // 'Sales'[Category] duplicates 'Product'[Category], Sales is the from-side of a Product relationship.
    expect(objectNames(rules.REMOVE_REDUNDANT_COLUMNS_IN_RELATED_TABLES, star)).toEqual(["'Sales'[Category]"]);
  });
  it("SNOWFLAKE_SCHEMA_ARCHITECTURE and ENSURE_TABLES_HAVE_RELATIONSHIPS ignore calculation groups", () => {
    expect(objectNames(rules.SNOWFLAKE_SCHEMA_ARCHITECTURE, star)).toEqual(["'Date'"]);
    expect(objectNames(rules.ENSURE_TABLES_HAVE_RELATIONSHIPS, star)).toEqual(["'Lonely'"]);
  });
  it("INACTIVE_RELATIONSHIPS_THAT_ARE_NEVER_ACTIVATED only accepts from-then-to argument order", () => {
    expect(objectNames(rules.INACTIVE_RELATIONSHIPS_THAT_ARE_NEVER_ACTIVATED, star)).toEqual(["'Date'[Product ID] ∞←1 'Product'[Product ID]"]);
    const reversed = star.replace("USERELATIONSHIP('Sales'[Date Key], 'Date'[Date])", "USERELATIONSHIP('Date'[Date], 'Sales'[Date Key])");
    expect(objectNames(rules.INACTIVE_RELATIONSHIPS_THAT_ARE_NEVER_ACTIVATED, reversed).length).toBe(2);
  });
  it("RELATIONSHIP_COLUMNS_SAME_DATA_TYPE skips relationships whose columns are missing", () => {
    expect(objectNames(rules.RELATIONSHIP_COLUMNS_SAME_DATA_TYPE, star)).toEqual(["'Date'[Product ID] ∞←1 'Product'[Product ID]"]);
    const dangling = star + "\nrelationship r4\n\tfromColumn: Sales.Nope\n\ttoColumn: Product.'Product ID'\n";
    expect(objectNames(rules.RELATIONSHIP_COLUMNS_SAME_DATA_TYPE, dangling).length).toBe(1);
  });
  it("bi-directional and many-to-many rules", () => {
    const m = "relationship a\n\tfromCardinality: many\n\ttoCardinality: many\n\tcrossFilteringBehavior: bothDirections\n\tfromColumn: A.K\n\ttoColumn: B.K\n\nrelationship b\n\tcrossFilteringBehavior: bothDirections\n\tfromColumn: C.K\n\ttoColumn: D.K\n\nrelationship c\n\tfromCardinality: many\n\ttoCardinality: many\n\tfromColumn: E.K\n\ttoColumn: F.K\n\nrelationship d\n\tfromColumn: G.K\n\ttoColumn: H.K\n";
    expect(objectNames(rules.MANY_TO_MANY_RELATIONSHIPS_SHOULD_BE_SINGLE_DIRECTION, m)).toEqual(["'A'[K] ∞↔∞ 'B'[K]"]);
    expect(objectNames(rules.CHECK_IF_BIDIRECTIONAL_AND_MANY_TO_MANY_RELATIONSHIPS_ARE_VALID, m)).toEqual(["'A'[K] ∞↔∞ 'B'[K]", "'C'[K] ∞↔1 'D'[K]", "'E'[K] ∞←∞ 'F'[K]"]);
    // (1 bidi + 1 many-to-many, plus relationship a counted twice) / 4 = 1.0 > 0.3
    expect(objectNames(rules.AVOID_EXCESSIVE_BIDIRECTIONAL_OR_MANY_TO_MANY_RELATIONSHIPS, m)).toEqual(["Model"]);
    const tenPlain = Array.from({ length: 10 }, (_, i) => `relationship p${i}\n\tfromColumn: P${i}.K\n\ttoColumn: Q${i}.K\n`).join("\n");
    expect(objectNames(rules.AVOID_EXCESSIVE_BIDIRECTIONAL_OR_MANY_TO_MANY_RELATIONSHIPS, m + "\n" + tenPlain)).toEqual([]);
  });
  it("AVOID_USING_MANY-TO-MANY_RELATIONSHIPS_ON_TABLES_USED_FOR_DYNAMIC_ROW_LEVEL_SECURITY needs both a many-to-many relationship and a non-empty filter", () => {
    const m = "table Customer\n\tcolumn Region\n\t\tdataType: string\n\tpartition Customer = m\n\t\tmode: import\n\t\tsource = 1\n\ntable Security\n\tcolumn Region\n\t\tdataType: string\n\tpartition Security = m\n\t\tmode: import\n\t\tsource = 1\n\nrelationship r\n\tfromCardinality: many\n\ttoCardinality: many\n\tfromColumn: Customer.Region\n\ttoColumn: Security.Region\n\nrole R\n\tmodelPermission: read\n\ttablePermission Security = [Region] = \"East\"\n\ttablePermission Customer\n\t\tmetadataPermission: none\n";
    expect(objectNames(rules.AVOID_USING_MANY_TO_MANY_RELATIONSHIPS_ON_TABLES_USED_FOR_DYNAMIC_ROW_LEVEL_SECURITY, m)).toEqual(["'Security'"]);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npm test -- rules-relationships`
Expected: FAIL, cannot find module.

- [ ] **Step 3: Implement**

Add to `packages/core/src/rules/helpers.ts`:

```ts
/** Tables that satisfy the Table or CalculatedTable scope. Calculation group tables are only in the CalculationGroup scope. */
export const tablesInScope = (m: Model): Table[] => m.tables.filter((t) => t.kind !== "calculationGroup");
```

`packages/core/src/rules/microsoft-bpa/relationships.ts`:

```ts
import type { Relationship } from "../../model/types.js";
import { allCalculationItems, allColumns, allMeasures, allTablePermissions, dataType, finding, tablesInScope } from "../helpers.js";
import type { RuleContext } from "../types.js";
import { bpaRule } from "./define.js";

const escapeRegExp = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const isManyToMany = (r: Relationship): boolean => r.fromCardinality === "many" && r.toCardinality === "many";
const isBidirectional = (r: Relationship): boolean => r.crossFilteringBehavior === "bothdirections";

export const RELATIONSHIP_COLUMNS_SHOULD_BE_OF_INTEGER_DATA_TYPE = bpaRule("RELATIONSHIP_COLUMNS_SHOULD_BE_OF_INTEGER_DATA_TYPE", (m, { indexes: { relationships } }: RuleContext) =>
  allColumns(m).filter((c) => relationships.forColumn(c.table.name, c.name).length > 0 && dataType(c) !== "int64").map(finding.column),
);

// Quirk kept on purpose: the source compares FromColumn.Name to the column's name only, not table plus
// column, so a dimension key that shares its name with the foreign key is flagged as well.
export const HIDE_FOREIGN_KEYS = bpaRule("HIDE_FOREIGN_KEYS", (m, { indexes: { relationships } }: RuleContext) =>
  allColumns(m)
    .filter((c) => !c.isHidden && relationships.forColumn(c.table.name, c.name).some((r) => r.fromColumn === c.name && r.fromCardinality === "many"))
    .map(finding.column),
);

export const MARK_PRIMARY_KEYS = bpaRule("MARK_PRIMARY_KEYS", (m, { indexes: { relationships } }: RuleContext) =>
  allColumns(m)
    .filter((c) => !c.isKey && c.table.dataCategory !== "Time" && relationships.forColumn(c.table.name, c.name).some((r) => r.toTable === c.table.name && r.toColumn === c.name && r.toCardinality === "one"))
    .map(finding.column),
);

export const REMOVE_REDUNDANT_COLUMNS_IN_RELATED_TABLES = bpaRule("REMOVE_REDUNDANT_COLUMNS_IN_RELATED_TABLES", (m, { indexes: { relationships } }: RuleContext) => {
  const all = allColumns(m);
  return all
    .filter(
      (c) =>
        relationships.forColumn(c.table.name, c.name).length === 0 &&
        all.some((o) => o.name === c.name && o.table !== c.table && relationships.forTable(o.table.name).some((r) => r.fromTable === c.table.name)),
    )
    .map(finding.column);
});

export const SNOWFLAKE_SCHEMA_ARCHITECTURE = bpaRule("SNOWFLAKE_SCHEMA_ARCHITECTURE", (m, { indexes: { relationships } }: RuleContext) =>
  tablesInScope(m)
    .filter((t) => {
      const rels = relationships.forTable(t.name);
      return rels.some((r) => r.fromTable === t.name) && rels.some((r) => r.toTable === t.name);
    })
    .map(finding.table),
);

export const ENSURE_TABLES_HAVE_RELATIONSHIPS = bpaRule("ENSURE_TABLES_HAVE_RELATIONSHIPS", (m, { indexes: { relationships } }: RuleContext) =>
  tablesInScope(m).filter((t) => relationships.forTable(t.name).length === 0).map(finding.table),
);

export const MANY_TO_MANY_RELATIONSHIPS_SHOULD_BE_SINGLE_DIRECTION = bpaRule("MANY-TO-MANY_RELATIONSHIPS_SHOULD_BE_SINGLE-DIRECTION", (m) =>
  m.relationships.filter((r) => isManyToMany(r) && isBidirectional(r)).map(finding.relationship),
);

export const CHECK_IF_BIDIRECTIONAL_AND_MANY_TO_MANY_RELATIONSHIPS_ARE_VALID = bpaRule("CHECK_IF_BI-DIRECTIONAL_AND_MANY-TO-MANY_RELATIONSHIPS_ARE_VALID", (m) =>
  m.relationships.filter((r) => isManyToMany(r) || isBidirectional(r)).map(finding.relationship),
);

export const RELATIONSHIP_COLUMNS_SAME_DATA_TYPE = bpaRule("RELATIONSHIP_COLUMNS_SAME_DATA_TYPE", (m) => {
  const column = (table: string, name: string) => m.tables.find((t) => t.name === table)?.columns.find((c) => c.name === name);
  return m.relationships
    .filter((r) => {
      const from = column(r.fromTable, r.fromColumn);
      const to = column(r.toTable, r.toColumn);
      return from !== undefined && to !== undefined && dataType(from) !== dataType(to);
    })
    .map(finding.relationship);
});

// The source builds its regex from raw names; names are escaped here so a table called "Date (Order)"
// cannot break the pattern. Argument order matters: USERELATIONSHIP(to, from) does not count, as in the source.
export const INACTIVE_RELATIONSHIPS_THAT_ARE_NEVER_ACTIVATED = bpaRule("INACTIVE_RELATIONSHIPS_THAT_ARE_NEVER_ACTIVATED", (m) => {
  const expressions = [...allMeasures(m).map((x) => x.expression), ...allCalculationItems(m).map((i) => i.expression)];
  return m.relationships
    .filter((r) => {
      if (r.isActive) return false;
      const re = new RegExp(
        `USERELATIONSHIP\\s*\\(\\s*'*${escapeRegExp(r.fromTable)}'*\\[${escapeRegExp(r.fromColumn)}\\]\\s*,\\s*'*${escapeRegExp(r.toTable)}'*\\[${escapeRegExp(r.toColumn)}\\]`,
        "i",
      );
      return !expressions.some((e) => re.test(e));
    })
    .map(finding.relationship);
});

// A relationship that is both bi-directional and many-to-many counts twice, as in the source.
export const AVOID_EXCESSIVE_BIDIRECTIONAL_OR_MANY_TO_MANY_RELATIONSHIPS = bpaRule("AVOID_EXCESSIVE_BI-DIRECTIONAL_OR_MANY-TO-MANY_RELATIONSHIPS", (m) => {
  const rels = m.relationships;
  const count = rels.filter(isBidirectional).length + rels.filter(isManyToMany).length;
  return count / Math.max(rels.length, 1) > 0.3 ? [finding.model(m)] : [];
});

export const AVOID_USING_MANY_TO_MANY_RELATIONSHIPS_ON_TABLES_USED_FOR_DYNAMIC_ROW_LEVEL_SECURITY = bpaRule(
  "AVOID_USING_MANY-TO-MANY_RELATIONSHIPS_ON_TABLES_USED_FOR_DYNAMIC_ROW_LEVEL_SECURITY",
  (m, { indexes: { relationships } }: RuleContext) => {
    const permissions = allTablePermissions(m);
    return m.tables
      .filter((t) => t.kind === "table" && relationships.forTable(t.name).some(isManyToMany) && permissions.some((tp) => tp.table === t.name && (tp.filter ?? "").length > 0))
      .map(finding.table);
  },
);

export const relationshipRules = [
  RELATIONSHIP_COLUMNS_SHOULD_BE_OF_INTEGER_DATA_TYPE,
  HIDE_FOREIGN_KEYS,
  MARK_PRIMARY_KEYS,
  REMOVE_REDUNDANT_COLUMNS_IN_RELATED_TABLES,
  SNOWFLAKE_SCHEMA_ARCHITECTURE,
  ENSURE_TABLES_HAVE_RELATIONSHIPS,
  MANY_TO_MANY_RELATIONSHIPS_SHOULD_BE_SINGLE_DIRECTION,
  CHECK_IF_BIDIRECTIONAL_AND_MANY_TO_MANY_RELATIONSHIPS_ARE_VALID,
  RELATIONSHIP_COLUMNS_SAME_DATA_TYPE,
  INACTIVE_RELATIONSHIPS_THAT_ARE_NEVER_ACTIVATED,
  AVOID_EXCESSIVE_BIDIRECTIONAL_OR_MANY_TO_MANY_RELATIONSHIPS,
  AVOID_USING_MANY_TO_MANY_RELATIONSHIPS_ON_TABLES_USED_FOR_DYNAMIC_ROW_LEVEL_SECURITY,
];
```

In `packages/core/src/rules/microsoft-bpa/index.ts`:

```ts
import type { Rule } from "../types.js";
import { columnRules } from "./columns.js";
import { relationshipRules } from "./relationships.js";

export const microsoftBpaRules: Rule[] = [...columnRules, ...relationshipRules];
```

- [ ] **Step 4: Run unit tests and parity**

Run: `npm test -- rules-relationships`
Expected: PASS (9 tests).

Run: `npm test -- parity`
Expected: PASS. Watch these fixture rules in particular: messy-sales `HIDE_FOREIGN_KEYS` (11 objects including the five dimension keys), tvw-baseline `SNOWFLAKE_SCHEMA_ARCHITECTURE` (4), `MARK_PRIMARY_KEYS` (10), rule-zoo `INACTIVE_RELATIONSHIPS_THAT_ARE_NEVER_ACTIVATED` (`'Sales'[Month Start] ∞←1 'Date'[Date]` only), `AVOID_EXCESSIVE_BI-DIRECTIONAL_OR_MANY-TO-MANY_RELATIONSHIPS` (Model), kitchen-sink `SNOWFLAKE_SCHEMA_ARCHITECTURE` (`'Sales'`).

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/rules packages/core/test/rules-relationships.test.ts
git commit -m "feat(rules): port the relationship graph rules"
```

---

### Task 10: Measure format rules and DAX pattern rules

**Files:**
- Create: `packages/core/src/rules/microsoft-bpa/measures.ts`
- Modify: `packages/core/src/rules/helpers.ts` (add `expressionObjects`), `packages/core/src/rules/microsoft-bpa/index.ts`
- Test: `packages/core/test/rules-measures.test.ts`

**Interfaces:**
- Consumes: `bpaRule` (Task 8), helpers (Task 6).
- Produces: `expressionObjects(m, kinds): { kind; finding: RuleFinding; expression: string }[]` where `kinds` is any of `"measure" | "calculatedColumn" | "calculationItem"`, in model order (per table: measures, calculated columns, calculation items); `measureRules: Rule[]` with 12 rules: `PROVIDE_FORMAT_STRING_FOR_MEASURES`, `INTEGER_FORMATTING`, `PERCENTAGE_FORMATTING`, `USE_THE_DIVIDE_FUNCTION_FOR_DIVISION`, `AVOID_USING_THE_IFERROR_FUNCTION`, `USE_THE_TREATAS_FUNCTION_INSTEAD_OF_INTERSECT`, `FILTER_COLUMN_VALUES`, `FILTER_MEASURE_VALUES_BY_COLUMNS`, `AVOID_USING_'1-(X/Y)'_SYNTAX`, `EVALUATEANDLOG_SHOULD_NOT_BE_USED_IN_PRODUCTION_MODELS`, `REDUCE_USAGE_OF_CALCULATED_COLUMNS_THAT_USE_THE_RELATED_FUNCTION`, `EXPRESSION_RELIANT_OBJECTS_MUST_HAVE_AN_EXPRESSION`.

The .NET patterns are converted as follows: `(?i)` becomes the `i` flag (every pattern that uses it starts with it or has only non-letters before it, so the whole-pattern flag is equivalent); `\'*` becomes `'*`; `/` is escaped in JavaScript literals. Nothing else changes.

- [ ] **Step 1: Write the failing tests**

`packages/core/test/rules-measures.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { buildIndexes } from "../src/index/build.js";
import * as rules from "../src/rules/microsoft-bpa/measures.js";
import { modelFrom, objectNames } from "./helpers.js";

const measures = (body: string) => `table T\n\tcolumn Amount\n\t\tdataType: decimal\n${body}\n\tpartition T = m\n\t\tmode: import\n\t\tsource = 1\n`;

describe("measure format rules", () => {
  it("PROVIDE_FORMAT_STRING_FOR_MEASURES accepts a format string or a format string definition and skips hidden", () => {
    const m = measures("\tmeasure A = 1\n\tmeasure B = 1\n\t\tformatString: #,0\n\tmeasure C = 1\n\t\tformatStringDefinition = \"0\"\n\tmeasure D = 1\n\t\tisHidden\n\tmeasure E = 1\n\t\tformatString: \" \"");
    expect(objectNames(rules.PROVIDE_FORMAT_STRING_FOR_MEASURES, m)).toEqual(["[A]", "[E]"]);
  });
  it("INTEGER_FORMATTING flags everything that is not currency, percent, #,0 or #,0.0, including no format string", () => {
    const m = measures("\tmeasure A = 1\n\tmeasure B = 1\n\t\tformatString: #,0\n\tmeasure C = 1\n\t\tformatString: $ #,0\n\tmeasure D = 1\n\t\tformatString: 0.0%\n\tmeasure E = 1\n\t\tformatString: #,0.00\n\tmeasure F = 1\n\t\tformatString: #,0.0");
    expect(objectNames(rules.INTEGER_FORMATTING, m)).toEqual(["[A]", "[E]"]);
  });
  it("PERCENTAGE_FORMATTING", () => {
    const m = measures("\tmeasure A = 1\n\t\tformatString: 0.0%\n\tmeasure B = 1\n\t\tformatString: #,0.0%;-#,0.0%;#,0.0%\n\tmeasure C = 1\n\t\tformatString: #,0");
    expect(objectNames(rules.PERCENTAGE_FORMATTING, m)).toEqual(["[A]"]);
  });
});

describe("DAX pattern rules", () => {
  it("USE_THE_DIVIDE_FUNCTION_FOR_DIVISION matches ] or ) before a slash that is not a comment", () => {
    const m = measures("\tmeasure A = [X] / [Y]\n\tmeasure B = SUM(T[Amount]) / 2\n\tmeasure C = DIVIDE([X], [Y]) // note\n\tmeasure D = 1 /* c */ + [X]\n\tmeasure E = [X]/[Y]\n\tcolumn CC = [Amount] / 2\n\t\tdataType: double");
    expect(objectNames(rules.USE_THE_DIVIDE_FUNCTION_FOR_DIVISION, m)).toEqual(["[A]", "[B]", "[E]", "'T'[CC]"]);
  });
  it("scopes: IFERROR skips calculation items, INTERSECT skips calculated columns, EVALUATEANDLOG is measures only, RELATED is calculated columns only", () => {
    const m = `table T
	column Amount
		dataType: decimal
	column CC = IFERROR(RELATED(T[Amount]), INTERSECT(T, T))
		dataType: double
	measure M = IFERROR(EVALUATEANDLOG(INTERSECT(T, T)), RELATED(T[Amount]))
	partition T = m
		mode: import
		source = 1

table CG
	calculationGroup
		calculationItem I = IFERROR(INTERSECT(T, T), EVALUATEANDLOG(1))
	column Name
		dataType: string
	partition CG = calculationGroup
		mode: import
`;
    expect(objectNames(rules.AVOID_USING_THE_IFERROR_FUNCTION, m)).toEqual(["[M]", "'T'[CC]"]);
    expect(objectNames(rules.USE_THE_TREATAS_FUNCTION_INSTEAD_OF_INTERSECT, m)).toEqual(["[M]", "I"]);
    expect(objectNames(rules.EVALUATEANDLOG_SHOULD_NOT_BE_USED_IN_PRODUCTION_MODELS, m)).toEqual(["[M]"]);
    expect(objectNames(rules.REDUCE_USAGE_OF_CALCULATED_COLUMNS_THAT_USE_THE_RELATED_FUNCTION, m)).toEqual(["'T'[CC]"]);
  });
  it("FILTER rules reproduce the source patterns, including the space-as-table-name quirk", () => {
    const m = measures(
      "\tmeasure A = CALCULATE([X], FILTER('Sales', 'Sales'[Category] = \"Bikes\"))\n\tmeasure B = CALCULATE([X], FILTER('Product', [X] > 100))\n\tmeasure C = CALCULATE([X], KEEPFILTERS('Sales'[Category] = \"Bikes\"))\n\tmeasure D = CALCULATETABLE(VALUES(T[Amount]), FILTER(T, T[Amount] > 1))\n\tmeasure E = CALCULATETABLE(VALUES(T[Amount]), FILTER(T, [X] > 1))",
    );
    // B and E: the space after the comma is accepted as the "table name" (ground-truth item 5).
    expect(objectNames(rules.FILTER_COLUMN_VALUES, m)).toEqual(["[A]", "[B]", "[D]", "[E]"]);
    expect(objectNames(rules.FILTER_MEASURE_VALUES_BY_COLUMNS, m)).toEqual(["[B]", "[E]"]);
  });
  it("AVOID_USING_'1-(X/Y)'_SYNTAX", () => {
    const m = measures("\tmeasure A = 1 - DIVIDE([X], [Y])\n\tmeasure B = 1 - SUM('T'[Amount]) / SUM('T'[Amount])\n\tmeasure C = 100 + ( SUM ( T[Amount] ) / 2 )\n\tmeasure D = DIVIDE([X] - [Y], [X])\n\tmeasure E = 1 - SUM(T[Amount])");
    expect(objectNames(rules.AVOID_USING_1_X_Y_SYNTAX, m)).toEqual(["[A]", "[B]", "[C]"]);
  });
  it("EXPRESSION_RELIANT_OBJECTS_MUST_HAVE_AN_EXPRESSION cannot be produced from TMDL, so it is checked on a mutated model", () => {
    const model = modelFrom(measures("\tmeasure A = 1\n\tcolumn CC = 2\n\t\tdataType: int64"));
    model.tables[0]!.measures[0]!.expression = "   ";
    model.tables[0]!.columns[1]!.expression = "";
    const names = rules.EXPRESSION_RELIANT_OBJECTS_MUST_HAVE_AN_EXPRESSION.check(model, { indexes: buildIndexes(model) }).map((f) => f.objectName);
    expect(names).toEqual(["[A]", "'T'[CC]"]);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npm test -- rules-measures`
Expected: FAIL, cannot find module.

- [ ] **Step 3: Implement**

Add to `packages/core/src/rules/helpers.ts`:

```ts
export type ExpressionKind = "measure" | "calculatedColumn" | "calculationItem";

export interface ExpressionObject {
  kind: ExpressionKind;
  finding: RuleFinding;
  expression: string;
}

/** Measures, calculated columns, and calculation items (the objects DAX rules are scoped to), in model order. */
export function expressionObjects(m: Model, kinds: ExpressionKind[]): ExpressionObject[] {
  const want = new Set(kinds);
  const out: ExpressionObject[] = [];
  for (const t of m.tables) {
    if (want.has("measure")) for (const x of t.measures) out.push({ kind: "measure", finding: finding.measure(x), expression: x.expression });
    if (want.has("calculatedColumn")) for (const c of t.columns) if (c.kind === "calculated") out.push({ kind: "calculatedColumn", finding: finding.column(c), expression: c.expression ?? "" });
    if (want.has("calculationItem")) for (const i of t.calculationGroup?.items ?? []) out.push({ kind: "calculationItem", finding: finding.calculationItem(i), expression: i.expression });
  }
  return out;
}
```

`packages/core/src/rules/microsoft-bpa/measures.ts`:

```ts
import { allMeasures, expressionObjects, finding, isBlank, type ExpressionKind } from "../helpers.js";
import type { Rule } from "../types.js";
import { bpaRule } from "./define.js";

const M: ExpressionKind = "measure";
const CC: ExpressionKind = "calculatedColumn";
const CI: ExpressionKind = "calculationItem";

/** A rule that flags every object in `kinds` whose expression matches any pattern. */
const patternRule = (id: string, kinds: ExpressionKind[], patterns: RegExp[]): Rule =>
  bpaRule(id, (m) => expressionObjects(m, kinds).filter((o) => patterns.some((p) => p.test(o.expression))).map((o) => o.finding));

export const PROVIDE_FORMAT_STRING_FOR_MEASURES = bpaRule("PROVIDE_FORMAT_STRING_FOR_MEASURES", (m) =>
  allMeasures(m).filter((x) => !x.isHidden && !x.table.isHidden && isBlank(x.formatString) && isBlank(x.formatStringDefinition)).map(finding.measure),
);

export const INTEGER_FORMATTING = bpaRule("INTEGER_FORMATTING", (m) =>
  allMeasures(m)
    .filter((x) => {
      const fs = x.formatString ?? "";
      return !fs.includes("$") && !fs.includes("%") && !(fs === "#,0" || fs === "#,0.0");
    })
    .map(finding.measure),
);

export const PERCENTAGE_FORMATTING = bpaRule("PERCENTAGE_FORMATTING", (m) =>
  allMeasures(m).filter((x) => (x.formatString ?? "").includes("%") && x.formatString !== "#,0.0%;-#,0.0%;#,0.0%").map(finding.measure),
);

export const USE_THE_DIVIDE_FUNCTION_FOR_DIVISION = patternRule("USE_THE_DIVIDE_FUNCTION_FOR_DIVISION", [M, CC, CI], [/\]\s*\/(?!\/)(?!\*)/, /\)\s*\/(?!\/)(?!\*)/]);

export const AVOID_USING_THE_IFERROR_FUNCTION = patternRule("AVOID_USING_THE_IFERROR_FUNCTION", [M, CC], [/IFERROR\s*\(/i]);

export const USE_THE_TREATAS_FUNCTION_INSTEAD_OF_INTERSECT = patternRule("USE_THE_TREATAS_FUNCTION_INSTEAD_OF_INTERSECT", [M, CI], [/INTERSECT\s*\(/i]);

export const FILTER_COLUMN_VALUES = patternRule("FILTER_COLUMN_VALUES", [M, CC, CI], [
  /CALCULATE\s*\(\s*[^,]+,\s*FILTER\s*\(\s*'*[A-Za-z0-9 _]+'*\s*,\s*'*[A-Za-z0-9 _]+'*\[[A-Za-z0-9 _]+\]/i,
  /CALCULATETABLE\s*\([^,]*,\s*FILTER\s*\(\s*'*[A-Za-z0-9 _]+'*,\s*'*[A-Za-z0-9 _]+'*\[[A-Za-z0-9 _]+\]/i,
]);

export const FILTER_MEASURE_VALUES_BY_COLUMNS = patternRule("FILTER_MEASURE_VALUES_BY_COLUMNS", [M, CC, CI], [
  /CALCULATE\s*\(\s*[^,]+,\s*FILTER\s*\(\s*'*[A-Za-z0-9 _]+'*\s*,\s*\[[^\]]+\]/i,
  /CALCULATETABLE\s*\([^,]*,\s*FILTER\s*\(\s*'*[A-Za-z0-9 _]+'*,\s*\[/i,
]);

export const AVOID_USING_1_X_Y_SYNTAX = patternRule("AVOID_USING_'1-(X/Y)'_SYNTAX", [M, CC, CI], [
  /[0-9]+\s*[-+]\s*[(]*\s*SUM\s*\(\s*'*[A-Za-z0-9 _]+'*\s*\[[A-Za-z0-9 _]+\]\s*\)\s*\//i,
  /[0-9]+\s*[-+]\s*DIVIDE\s*\(/i,
]);

export const EVALUATEANDLOG_SHOULD_NOT_BE_USED_IN_PRODUCTION_MODELS = patternRule("EVALUATEANDLOG_SHOULD_NOT_BE_USED_IN_PRODUCTION_MODELS", [M], [/EVALUATEANDLOG\s*\(/i]);

export const REDUCE_USAGE_OF_CALCULATED_COLUMNS_THAT_USE_THE_RELATED_FUNCTION = patternRule("REDUCE_USAGE_OF_CALCULATED_COLUMNS_THAT_USE_THE_RELATED_FUNCTION", [CC], [/RELATED\s*\(/i]);

// The TMDL reader never yields an empty expression (the next indented line becomes the expression),
// so this rule can only fire on models built some other way. It is kept for completeness.
export const EXPRESSION_RELIANT_OBJECTS_MUST_HAVE_AN_EXPRESSION = bpaRule("EXPRESSION_RELIANT_OBJECTS_MUST_HAVE_AN_EXPRESSION", (m) =>
  expressionObjects(m, [M, CC, CI]).filter((o) => isBlank(o.expression)).map((o) => o.finding),
);

export const measureRules = [
  PROVIDE_FORMAT_STRING_FOR_MEASURES,
  INTEGER_FORMATTING,
  PERCENTAGE_FORMATTING,
  USE_THE_DIVIDE_FUNCTION_FOR_DIVISION,
  AVOID_USING_THE_IFERROR_FUNCTION,
  USE_THE_TREATAS_FUNCTION_INSTEAD_OF_INTERSECT,
  FILTER_COLUMN_VALUES,
  FILTER_MEASURE_VALUES_BY_COLUMNS,
  AVOID_USING_1_X_Y_SYNTAX,
  EVALUATEANDLOG_SHOULD_NOT_BE_USED_IN_PRODUCTION_MODELS,
  REDUCE_USAGE_OF_CALCULATED_COLUMNS_THAT_USE_THE_RELATED_FUNCTION,
  EXPRESSION_RELIANT_OBJECTS_MUST_HAVE_AN_EXPRESSION,
];
```

Add `measureRules` to `microsoftBpaRules` in `packages/core/src/rules/microsoft-bpa/index.ts`:

```ts
import { measureRules } from "./measures.js";
export const microsoftBpaRules: Rule[] = [...columnRules, ...relationshipRules, ...measureRules];
```

- [ ] **Step 4: Run unit tests and parity**

Run: `npm test -- rules-measures`
Expected: PASS (8 tests).

Run: `npm test -- parity`
Expected: PASS. Fixture checks: messy-sales `PROVIDE_FORMAT_STRING_FOR_MEASURES` 14, `INTEGER_FORMATTING` 14, `USE_THE_DIVIDE_FUNCTION_FOR_DIVISION` 3; tvw-baseline `PERCENTAGE_FORMATTING` 3, `USE_THE_DIVIDE_FUNCTION_FOR_DIVISION` 6; rule-zoo `FILTER_COLUMN_VALUES` = `[Filter Column]` and `[Filter Measure]`, `USE_THE_DIVIDE_FUNCTION_FOR_DIVISION` = `[Safe Ratio]` and calculation item `Half`, `AVOID_USING_THE_IFERROR_FUNCTION` = `[Safe Ratio]`, `REDUCE_USAGE_OF_CALCULATED_COLUMNS_THAT_USE_THE_RELATED_FUNCTION` = `'Sales'[Product Category]`.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/rules packages/core/test/rules-measures.test.ts
git commit -m "feat(rules): port the measure format and DAX pattern rules"
```

---

### Task 11: Dependency rules (reference index)

**Files:**
- Create: `packages/core/src/rules/microsoft-bpa/dependencies.ts`
- Modify: `packages/core/src/rules/microsoft-bpa/index.ts`
- Test: `packages/core/test/rules-dependencies.test.ts`

**Interfaces:**
- Consumes: `ReferenceIndex`, `RefOwner` (Task 5); `bpaRule` (Task 8); helpers (Task 6).
- Produces: `dependencyRules: Rule[]` with 5 rules: `DAX_COLUMNS_FULLY_QUALIFIED`, `DAX_MEASURES_UNQUALIFIED`, `AVOID_DUPLICATE_MEASURES`, `MEASURES_SHOULD_NOT_BE_DIRECT_REFERENCES_OF_OTHER_MEASURES`, `UNNECESSARY_MEASURES`; `ownerFinding(owner: RefOwner): RuleFinding`.

- [ ] **Step 1: Write the failing tests**

`packages/core/test/rules-dependencies.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import * as rules from "../src/rules/microsoft-bpa/dependencies.js";
import { objectNames } from "./helpers.js";

const model = `table Sales
	column Amount
		dataType: decimal
	column Hidden
		dataType: int64
		isHidden
	column Calc = 'Sales'[Total] + [Amount]
		dataType: decimal
	measure Total = SUM('Sales'[Amount])
	measure 'Bare Column' = SUM([Amount])
	measure 'Qualified Measure' = 'Sales'[Total] * 2
	measure 'Total Copy' = SUM( 'Sales'[Amount] )
	measure Alias = [Total]
	measure 'Hidden Unused' = 1
		isHidden
	measure 'Hidden Used By Item' = 2
		isHidden
	measure 'Hidden Used By Hidden' = [Hidden Used By Item]
		isHidden
	partition Sales = m
		mode: import
		source = 1

table Calc
	column Amount
		dataType: decimal
	partition Calc = calculated
		mode: import
		source = ADDCOLUMNS(VALUES('Sales'[Amount]), "T", 'Sales'[Total])

table CG
	calculationGroup
		calculationItem Bare = IF(HASONEVALUE([Name]), SELECTEDMEASURE())
		calculationItem Qualified = 'Sales'[Total] + SELECTEDMEASURE()
		calculationItem Uses = [Hidden Used By Item]
	column Name
		dataType: string
	partition CG = calculationGroup
		mode: import

role R
	modelPermission: read
	tablePermission Sales = [Amount] > 0
	tablePermission Calc = 'Calc'[Amount] > 0
`;

describe("dependency rules", () => {
  it("DAX_COLUMNS_FULLY_QUALIFIED flags measures and table permissions with bare column refs, never calculation items", () => {
    expect(objectNames(rules.DAX_COLUMNS_FULLY_QUALIFIED, model)).toEqual(["[Bare Column]", "Sales"]);
  });
  it("DAX_MEASURES_UNQUALIFIED flags qualified measure refs in measures, calculated columns, calculated tables, and calculation items", () => {
    expect(objectNames(rules.DAX_MEASURES_UNQUALIFIED, model)).toEqual(["[Qualified Measure]", "'Sales'[Calc]", "'Calc'", "Qualified"]);
  });
  it("AVOID_DUPLICATE_MEASURES ignores whitespace differences and flags both copies", () => {
    expect(objectNames(rules.AVOID_DUPLICATE_MEASURES, model)).toEqual(["[Total]", "[Total Copy]"]);
  });
  it("MEASURES_SHOULD_NOT_BE_DIRECT_REFERENCES_OF_OTHER_MEASURES requires the whole expression to be one measure reference", () => {
    expect(objectNames(rules.MEASURES_SHOULD_NOT_BE_DIRECT_REFERENCES_OF_OTHER_MEASURES, model)).toEqual(["[Alias]", "[Hidden Used By Hidden]"]);
  });
  it("UNNECESSARY_MEASURES counts references from calculation items and other hidden measures", () => {
    expect(objectNames(rules.UNNECESSARY_MEASURES, model)).toEqual(["[Hidden Unused]", "[Hidden Used By Hidden]"]);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npm test -- rules-dependencies`
Expected: FAIL, cannot find module.

- [ ] **Step 3: Implement**

`packages/core/src/rules/microsoft-bpa/dependencies.ts`:

```ts
import type { RefOwner } from "../../index/references.js";
import { measureRef } from "../../model/names.js";
import type { CalculationItem, Column, Measure, Table, TablePermission } from "../../model/types.js";
import { allMeasures, finding } from "../helpers.js";
import type { RuleContext, RuleFinding } from "../types.js";
import { bpaRule } from "./define.js";

/** The finding shell for whichever object owns a DAX expression. */
export function ownerFinding(o: RefOwner): RuleFinding {
  switch (o.kind) {
    case "measure":
      return finding.measure(o.object as Measure);
    case "calculatedColumn":
      return finding.column(o.object as Column);
    case "calculatedTable":
      return finding.table(o.object as Table);
    case "tablePermission":
      return finding.tablePermission(o.object as TablePermission);
    case "calculationItem":
      return finding.calculationItem(o.object as CalculationItem);
  }
}

// Scope: Measure, KPI, TablePermission, CalculationItem. KPIs are not modeled in v1. Calculation items
// never resolve bare references to columns (ground-truth item 3), so they never fire here.
export const DAX_COLUMNS_FULLY_QUALIFIED = bpaRule("DAX_COLUMNS_FULLY_QUALIFIED", (_m, { indexes: { references } }: RuleContext) =>
  references.owners
    .filter((o) => (o.kind === "measure" || o.kind === "tablePermission" || o.kind === "calculationItem") && o.refs.some((r) => r.kind === "column" && !r.qualified))
    .map(ownerFinding),
);

// Scope: Measure, CalculatedColumn, CalculatedTable, KPI, CalculationItem.
export const DAX_MEASURES_UNQUALIFIED = bpaRule("DAX_MEASURES_UNQUALIFIED", (_m, { indexes: { references } }: RuleContext) =>
  references.owners.filter((o) => o.kind !== "tablePermission" && o.refs.some((r) => r.kind === "measure" && r.qualified)).map(ownerFinding),
);

const stripWhitespace = (s: string): string => s.replace(/[ \n\r\t]/g, "");

export const AVOID_DUPLICATE_MEASURES = bpaRule("AVOID_DUPLICATE_MEASURES", (m) => {
  const all = allMeasures(m);
  const counts = new Map<string, number>();
  for (const x of all) {
    const k = stripWhitespace(x.expression);
    counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  return all.filter((x) => (counts.get(stripWhitespace(x.expression)) ?? 0) > 1).map(finding.measure);
});

export const MEASURES_SHOULD_NOT_BE_DIRECT_REFERENCES_OF_OTHER_MEASURES = bpaRule("MEASURES_SHOULD_NOT_BE_DIRECT_REFERENCES_OF_OTHER_MEASURES", (m) => {
  const all = allMeasures(m);
  const names = new Set(all.map((x) => measureRef(x.name)));
  return all.filter((x) => names.has(x.expression)).map(finding.measure);
});

export const UNNECESSARY_MEASURES = bpaRule("UNNECESSARY_MEASURES", (m, { indexes: { references } }: RuleContext) =>
  allMeasures(m).filter((x) => (x.table.isHidden || x.isHidden) && references.measureReferencedBy(x).length === 0).map(finding.measure),
);

export const dependencyRules = [
  DAX_COLUMNS_FULLY_QUALIFIED,
  DAX_MEASURES_UNQUALIFIED,
  AVOID_DUPLICATE_MEASURES,
  MEASURES_SHOULD_NOT_BE_DIRECT_REFERENCES_OF_OTHER_MEASURES,
  UNNECESSARY_MEASURES,
];
```

Add `dependencyRules` to `microsoftBpaRules` in `packages/core/src/rules/microsoft-bpa/index.ts`:

```ts
import { dependencyRules } from "./dependencies.js";
export const microsoftBpaRules: Rule[] = [...columnRules, ...relationshipRules, ...measureRules, ...dependencyRules];
```

- [ ] **Step 4: Run unit tests and parity**

Run: `npm test -- rules-dependencies`
Expected: PASS (5 tests). The expected order in the `DAX_MEASURES_UNQUALIFIED` test follows reference-index owner order: the Sales measures, then the Sales calculated column, then the Calc calculated table, then the calculation item.

Run: `npm test -- parity`
Expected: PASS. Fixture checks: messy-sales `DAX_COLUMNS_FULLY_QUALIFIED` = `[Total Quantity]`, `[Distinct Customers]`; rule-zoo `DAX_COLUMNS_FULLY_QUALIFIED` = `[Bare Own Col]`, `[Bare Other Col]`, `Date` (table permission); `DAX_MEASURES_UNQUALIFIED` = `[Qualified Ref]`, `Qualified Measure`; `AVOID_DUPLICATE_MEASURES` = `[Total Amount]`, `[Total Amount Copy]`; `UNNECESSARY_MEASURES` = `[Hidden Unused]`, `[Hidden Uses Column]`.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/rules packages/core/test/rules-dependencies.test.ts
git commit -m "feat(rules): port the DAX dependency rules"
```

---

### Task 12: Table, partition, security, and model level rules

**Files:**
- Create: `packages/core/src/rules/microsoft-bpa/tables.ts`
- Modify: `packages/core/src/rules/microsoft-bpa/index.ts`
- Test: `packages/core/test/rules-tables.test.ts`

**Interfaces:**
- Consumes: `bpaRule` (Task 8); helpers incl. `tablesInScope`, `expressionObjects`, `isDirectQueryTable` (Tasks 6, 9, 10).
- Produces: `tableRules: Rule[]` with 14 rules: `MODEL_SHOULD_HAVE_A_DATE_TABLE`, `DATE/CALENDAR_TABLES_SHOULD_BE_MARKED_AS_A_DATE_TABLE`, `REMOVE_AUTO-DATE_TABLE`, `REDUCE_USAGE_OF_CALCULATED_TABLES`, `REDUCE_NUMBER_OF_CALCULATED_COLUMNS`, `UNPIVOT_PIVOTED_(MONTH)_DATA`, `PARTITION_NAME_SHOULD_MATCH_TABLE_NAME_FOR_SINGLE_PARTITION_TABLES`, `MINIMIZE_POWER_QUERY_TRANSFORMATIONS`, `MODEL_USING_DIRECT_QUERY_AND_NO_AGGREGATIONS`, `MEASURES_USING_TIME_INTELLIGENCE_AND_MODEL_IS_USING_DIRECT_QUERY`, `LIMIT_ROW_LEVEL_SECURITY_(RLS)_LOGIC`, `CHECK_IF_DYNAMIC_ROW_LEVEL_SECURITY_(RLS)_IS_NECESSARY`, `AVOID_THE_USERELATIONSHIP_FUNCTION_AND_RLS_AGAINST_THE_SAME_TABLE`, `OBJECTS_WITH_NO_DESCRIPTION`.

- [ ] **Step 1: Write the failing tests**

`packages/core/test/rules-tables.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import * as rules from "../src/rules/microsoft-bpa/tables.js";
import { objectNames } from "./helpers.js";

const t = (name: string, body: string, partition = `\tpartition ${name} = m\n\t\tmode: import\n\t\tsource = 1\n`) => `table ${name}\n${body}${partition}\n`;

describe("date table rules", () => {
  const marked = t("Date", "\tdataCategory: Time\n\tcolumn Date\n\t\tdataType: dateTime\n\t\tisKey\n");
  const unmarked = t("Calendar", "\tcolumn Date\n\t\tdataType: dateTime\n\t\tisKey\n");
  it("MODEL_SHOULD_HAVE_A_DATE_TABLE needs Time category plus a dateTime key", () => {
    expect(objectNames(rules.MODEL_SHOULD_HAVE_A_DATE_TABLE, marked)).toEqual([]);
    expect(objectNames(rules.MODEL_SHOULD_HAVE_A_DATE_TABLE, unmarked)).toEqual(["Model"]);
    expect(objectNames(rules.MODEL_SHOULD_HAVE_A_DATE_TABLE, "table X\n")).toEqual(["Model"]);
  });
  it("DATE/CALENDAR_TABLES_SHOULD_BE_MARKED_AS_A_DATE_TABLE goes by name and ignores calculation groups", () => {
    const cg = "table 'Date Intelligence'\n\tcalculationGroup\n\t\tcalculationItem I = 1\n\tcolumn Name\n\t\tdataType: string\n\tpartition 'Date Intelligence' = calculationGroup\n\t\tmode: import\n";
    expect(objectNames(rules.DATE_CALENDAR_TABLES_SHOULD_BE_MARKED_AS_A_DATE_TABLE, marked + unmarked + t("Updates", "") + cg)).toEqual(["'Calendar'", "'Updates'"]);
  });
  it("REMOVE_AUTO-DATE_TABLE requires a calculated table with the Desktop prefix", () => {
    const calc = t("LocalDateTable_1", "\tcolumn Date\n\t\tdataType: dateTime\n", "\tpartition LocalDateTable_1 = calculated\n\t\tmode: import\n\t\tsource = CALENDARAUTO()\n");
    const notCalc = t("DateTableTemplate_2", "\tcolumn Date\n\t\tdataType: dateTime\n");
    expect(objectNames(rules.REMOVE_AUTO_DATE_TABLE, calc + notCalc)).toEqual(["'LocalDateTable_1'"]);
    expect(objectNames(rules.REDUCE_USAGE_OF_CALCULATED_TABLES, calc + notCalc)).toEqual(["'LocalDateTable_1'"]);
  });
});

describe("column count, pivot, partition, and Power Query rules", () => {
  it("REDUCE_NUMBER_OF_CALCULATED_COLUMNS fires above five calculated columns, not counting calculated table columns", () => {
    const six = Array.from({ length: 6 }, (_, i) => `\tcolumn C${i} = ${i}\n\t\tdataType: int64\n`).join("");
    expect(objectNames(rules.REDUCE_NUMBER_OF_CALCULATED_COLUMNS, t("T", six))).toEqual(["Model"]);
    expect(objectNames(rules.REDUCE_NUMBER_OF_CALCULATED_COLUMNS, t("T", six.slice(0, six.lastIndexOf("\tcolumn"))))).toEqual([]);
  });
  it("UNPIVOT_PIVOTED_(MONTH)_DATA needs numeric Jan through Jun columns", () => {
    const cols = (type: string) => ["Jan", "Feb", "Mar", "Apr", "May", "Jun"].map((mo) => `\tcolumn '${mo} Budget'\n\t\tdataType: ${type}\n`).join("");
    expect(objectNames(rules.UNPIVOT_PIVOTED_MONTH_DATA, t("Budget", cols("decimal")))).toEqual(["'Budget'"]);
    expect(objectNames(rules.UNPIVOT_PIVOTED_MONTH_DATA, t("Budget", cols("string")))).toEqual([]);
  });
  it("PARTITION_NAME_SHOULD_MATCH_TABLE_NAME_FOR_SINGLE_PARTITION_TABLES applies to plain tables only", () => {
    const plain = t("Sales", "\tcolumn A\n\t\tdataType: int64\n", "\tpartition SalesData = m\n\t\tmode: import\n\t\tsource = 1\n");
    const calc = t("Calc", "\tcolumn A\n\t\tdataType: int64\n", "\tpartition Other = calculated\n\t\tmode: import\n\t\tsource = {1}\n");
    const two = t("Multi", "\tcolumn A\n\t\tdataType: int64\n", "\tpartition P1 = m\n\t\tmode: import\n\t\tsource = 1\n\tpartition P2 = m\n\t\tmode: import\n\t\tsource = 2\n");
    expect(objectNames(rules.PARTITION_NAME_SHOULD_MATCH_TABLE_NAME_FOR_SINGLE_PARTITION_TABLES, plain + calc + two)).toEqual(["'Sales'"]);
  });
  it("MINIMIZE_POWER_QUERY_TRANSFORMATIONS is a case-sensitive substring check on M partitions", () => {
    const m = t("A", "", "\tpartition A = m\n\t\tmode: import\n\t\tsource = let x = Table.AddColumn(s, \"c\", each 1) in x\n") + t("B", "", "\tpartition B = m\n\t\tmode: import\n\t\tsource = let x = table.addcolumn(s) in x\n") + t("C", "", "\tpartition C = calculated\n\t\tmode: import\n\t\tsource = Table.Combine(\n");
    expect(objectNames(rules.MINIMIZE_POWER_QUERY_TRANSFORMATIONS, m)).toEqual(["A"]);
  });
});

describe("DirectQuery rules", () => {
  const dq = "model Model\n\tdefaultPowerBIDataSourceVersion: powerBI_V3\n\n" + t("Customer", "\tcolumn Id\n\t\tdataType: int64\n", "\tpartition Customer = m\n\t\tmode: directQuery\n\t\tsource = 1\n");
  const sales = t("Sales", "\tcolumn Amount\n\t\tdataType: decimal\n\tmeasure YTD = TOTALYTD([Amount], 'Date'[Date])\n\tmeasure Lower = totalytd([Amount], 'Date'[Date])\n\tmeasure Plain = SUM('Sales'[Amount])\n");
  it("MODEL_USING_DIRECT_QUERY_AND_NO_AGGREGATIONS needs a DirectQuery table, no alternateOf, and PowerBI_V3", () => {
    expect(objectNames(rules.MODEL_USING_DIRECT_QUERY_AND_NO_AGGREGATIONS, dq)).toEqual(["Model"]);
    expect(objectNames(rules.MODEL_USING_DIRECT_QUERY_AND_NO_AGGREGATIONS, dq.replace("powerBI_V3", "powerBI_V2"))).toEqual([]);
    expect(objectNames(rules.MODEL_USING_DIRECT_QUERY_AND_NO_AGGREGATIONS, dq.replace("\t\tdataType: int64\n", "\t\tdataType: int64\n\t\talternateOf\n\t\t\tbaseTable: X\n"))).toEqual([]);
    expect(objectNames(rules.MODEL_USING_DIRECT_QUERY_AND_NO_AGGREGATIONS, dq.replace("directQuery", "import"))).toEqual([]);
  });
  it("MEASURES_USING_TIME_INTELLIGENCE_AND_MODEL_IS_USING_DIRECT_QUERY is case-sensitive and needs a DirectQuery table", () => {
    expect(objectNames(rules.MEASURES_USING_TIME_INTELLIGENCE_AND_MODEL_IS_USING_DIRECT_QUERY, dq + sales)).toEqual(["[YTD]"]);
    expect(objectNames(rules.MEASURES_USING_TIME_INTELLIGENCE_AND_MODEL_IS_USING_DIRECT_QUERY, sales)).toEqual([]);
  });
});

describe("row-level security rules", () => {
  const rls = t("Date", "\tcolumn Year\n\t\tdataType: int64\n") + t("Sales", "\tmeasure M = CALCULATE(1, USERELATIONSHIP('Sales'[D], 'Date'[Date]))\n\tmeasure N = CALCULATE(1, USERELATIONSHIP('Sales'[D], 'Other'[Date]))\n") + t("Other", "") +
    "role R\n\tmodelPermission: read\n\ttablePermission Date = L E F T('Date'[Year], 2) = \"20\"\n\ttablePermission Sales = 'Sales'[U] = USERNAME()\n\ttablePermission Other = 'Other'[U] = USERPRINCIPALNAME ()\n";
  it("LIMIT_ROW_LEVEL_SECURITY_(RLS)_LOGIC strips spaces before matching", () => {
    expect(objectNames(rules.LIMIT_ROW_LEVEL_SECURITY_LOGIC, rls)).toEqual(["'Date'"]);
  });
  it("CHECK_IF_DYNAMIC_ROW_LEVEL_SECURITY_(RLS)_IS_NECESSARY does not match a space before the parenthesis", () => {
    expect(objectNames(rules.CHECK_IF_DYNAMIC_ROW_LEVEL_SECURITY_IS_NECESSARY, rls)).toEqual(["Sales"]);
  });
  it("AVOID_THE_USERELATIONSHIP_FUNCTION_AND_RLS_AGAINST_THE_SAME_TABLE looks at the second USERELATIONSHIP argument", () => {
    expect(objectNames(rules.AVOID_THE_USERELATIONSHIP_FUNCTION_AND_RLS_AGAINST_THE_SAME_TABLE, rls)).toEqual(["'Date'", "'Other'"]);
  });
});

describe("OBJECTS_WITH_NO_DESCRIPTION", () => {
  it("covers visible tables, measures, columns, and calculation group tables once each", () => {
    const m = "/// described\ntable A\n\tcolumn X\n\t\tdataType: int64\n\t/// yes\n\tcolumn Y\n\t\tdataType: int64\n\tcolumn Z\n\t\tdataType: int64\n\t\tisHidden\n\tmeasure M = 1\n\tpartition A = m\n\t\tmode: import\n\t\tsource = 1\n\ntable H\n\tisHidden\n\tcolumn V\n\t\tdataType: int64\n\tpartition H = m\n\t\tmode: import\n\t\tsource = 1\n\ntable CG\n\tcalculationGroup\n\t\tcalculationItem I = 1\n\tcolumn Name\n\t\tdataType: string\n\tpartition CG = calculationGroup\n\t\tmode: import\n";
    expect(objectNames(rules.OBJECTS_WITH_NO_DESCRIPTION, m).sort()).toEqual(["'A'[X]", "'CG'", "'CG'[Name]", "'H'[V]", "[M]"]);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npm test -- rules-tables`
Expected: FAIL, cannot find module.

- [ ] **Step 3: Implement**

`packages/core/src/rules/microsoft-bpa/tables.ts`:

```ts
import type { Table } from "../../model/types.js";
import { allColumns, allMeasures, allPartitions, allTablePermissions, dataType, expressionObjects, finding, isBlank, isDirectQueryTable, isNumericType, tablesInScope } from "../helpers.js";
import { bpaRule } from "./define.js";

const escapeRegExp = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const hasDateTimeKey = (t: Table): boolean => t.columns.some((c) => c.isKey && dataType(c) === "datetime");

export const MODEL_SHOULD_HAVE_A_DATE_TABLE = bpaRule("MODEL_SHOULD_HAVE_A_DATE_TABLE", (m) =>
  m.tables.some((t) => t.dataCategory === "Time" && hasDateTimeKey(t)) ? [] : [finding.model(m)],
);

export const DATE_CALENDAR_TABLES_SHOULD_BE_MARKED_AS_A_DATE_TABLE = bpaRule("DATE/CALENDAR_TABLES_SHOULD_BE_MARKED_AS_A_DATE_TABLE", (m) =>
  tablesInScope(m)
    .filter((t) => {
      const u = t.name.toUpperCase();
      return (u.includes("DATE") || u.includes("CALENDAR")) && (t.dataCategory !== "Time" || !hasDateTimeKey(t));
    })
    .map(finding.table),
);

export const REMOVE_AUTO_DATE_TABLE = bpaRule("REMOVE_AUTO-DATE_TABLE", (m) =>
  m.tables.filter((t) => t.kind === "calculated" && (t.name.startsWith("DateTableTemplate_") || t.name.startsWith("LocalDateTable_"))).map(finding.table),
);

export const REDUCE_USAGE_OF_CALCULATED_TABLES = bpaRule("REDUCE_USAGE_OF_CALCULATED_TABLES", (m) =>
  m.tables.filter((t) => t.kind === "calculated").map(finding.table),
);

export const REDUCE_NUMBER_OF_CALCULATED_COLUMNS = bpaRule("REDUCE_NUMBER_OF_CALCULATED_COLUMNS", (m) =>
  allColumns(m).filter((c) => c.kind === "calculated").length > 5 ? [finding.model(m)] : [],
);

const MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN"];

export const UNPIVOT_PIVOTED_MONTH_DATA = bpaRule("UNPIVOT_PIVOTED_(MONTH)_DATA", (m) =>
  tablesInScope(m)
    .filter((t) => MONTHS.every((mo) => t.columns.some((c) => c.name.toUpperCase().includes(mo) && isNumericType(c))))
    .map(finding.table),
);

// Scope is Table only: calculated tables and calculation groups are not checked.
export const PARTITION_NAME_SHOULD_MATCH_TABLE_NAME_FOR_SINGLE_PARTITION_TABLES = bpaRule("PARTITION_NAME_SHOULD_MATCH_TABLE_NAME_FOR_SINGLE_PARTITION_TABLES", (m) =>
  m.tables.filter((t) => t.kind === "table" && t.partitions.length === 1 && t.partitions[0]!.name !== t.name).map(finding.table),
);

const POWER_QUERY_PATTERNS = [
  "Table.Combine(", "Table.Join(", "Table.NestedJoin(", "Table.AddColumn(", "Table.Group(", "Table.Sort(", "Table.Pivot(",
  "Table.Unpivot(", "Table.UnpivotOtherColumns(", "Table.Distinct(", '[Query="SELECT', "Value.NativeQuery", "OleDb.Query", "Odbc.Query",
];

export const MINIMIZE_POWER_QUERY_TRANSFORMATIONS = bpaRule("MINIMIZE_POWER_QUERY_TRANSFORMATIONS", (m) =>
  allPartitions(m).filter((p) => p.sourceType === "m" && POWER_QUERY_PATTERNS.some((s) => (p.source ?? "").includes(s))).map(finding.partition),
);

export const MODEL_USING_DIRECT_QUERY_AND_NO_AGGREGATIONS = bpaRule("MODEL_USING_DIRECT_QUERY_AND_NO_AGGREGATIONS", (m) =>
  m.tables.some(isDirectQueryTable) && !allColumns(m).some((c) => c.hasAlternateOf) && String(m.props.defaultpowerbidatasourceversion ?? "").toLowerCase() === "powerbi_v3"
    ? [finding.model(m)]
    : [],
);

const TIME_INTELLIGENCE_FUNCTIONS = [
  "CLOSINGBALANCEMONTH", "CLOSINGBALANCEQUARTER", "CLOSINGBALANCEYEAR", "DATEADD", "DATESBETWEEN", "DATESINPERIOD", "DATESMTD", "DATESQTD", "DATESYTD",
  "ENDOFMONTH", "ENDOFQUARTER", "ENDOFYEAR", "FIRSTDATE", "FIRSTNONBLANK", "FIRSTNONBLANKVALUE", "LASTDATE", "LASTNONBLANK", "LASTNONBLANKVALUE",
  "NEXTDAY", "NEXTMONTH", "NEXTQUARTER", "NEXTYEAR", "OPENINGBALANCEMONTH", "OPENINGBALANCEQUARTER", "OPENINGBALANCEYEAR", "PARALLELPERIOD",
  "PREVIOUSDAY", "PREVIOUSMONTH", "PREVIOUSQUARTER", "PREVIOUSYEAR", "SAMEPERIODLASTYEAR", "STARTOFMONTH", "STARTOFQUARTER", "STARTOFYEAR",
  "TOTALMTD", "TOTALQTD", "TOTALYTD",
];
// The source patterns have no (?i), so this one is case-sensitive.
const TIME_INTELLIGENCE = new RegExp(`(?:${TIME_INTELLIGENCE_FUNCTIONS.join("|")})\\s*\\(`);

export const MEASURES_USING_TIME_INTELLIGENCE_AND_MODEL_IS_USING_DIRECT_QUERY = bpaRule("MEASURES_USING_TIME_INTELLIGENCE_AND_MODEL_IS_USING_DIRECT_QUERY", (m) =>
  m.tables.some(isDirectQueryTable) ? expressionObjects(m, ["measure", "calculationItem"]).filter((o) => TIME_INTELLIGENCE.test(o.expression)).map((o) => o.finding) : [],
);

const RLS_FUNCTIONS = [/RIGHT\s*\(/i, /LEFT\s*\(/i, /UPPER\s*\(/i, /LOWER\s*\(/i, /FIND\s*\(/i];

// The source removes spaces from the filter before matching, so "L E F T(" matches and so does "BRIGHT(".
export const LIMIT_ROW_LEVEL_SECURITY_LOGIC = bpaRule("LIMIT_ROW_LEVEL_SECURITY_(RLS)_LOGIC", (m) => {
  const permissions = allTablePermissions(m);
  return tablesInScope(m)
    .filter((t) => permissions.some((tp) => tp.table === t.name && tp.filter !== undefined && RLS_FUNCTIONS.some((re) => re.test(tp.filter!.replace(/ /g, "")))))
    .map(finding.table);
});

// No \s* between the function name and the parenthesis in the source, so "USERPRINCIPALNAME ()" is not matched.
export const CHECK_IF_DYNAMIC_ROW_LEVEL_SECURITY_IS_NECESSARY = bpaRule("CHECK_IF_DYNAMIC_ROW_LEVEL_SECURITY_(RLS)_IS_NECESSARY", (m) =>
  allTablePermissions(m).filter((tp) => tp.filter !== undefined && (/USERNAME\(/i.test(tp.filter) || /USERPRINCIPALNAME\(/i.test(tp.filter))).map(finding.tablePermission),
);

export const AVOID_THE_USERELATIONSHIP_FUNCTION_AND_RLS_AGAINST_THE_SAME_TABLE = bpaRule("AVOID_THE_USERELATIONSHIP_FUNCTION_AND_RLS_AGAINST_THE_SAME_TABLE", (m) => {
  const permissions = allTablePermissions(m);
  const measures = allMeasures(m);
  return tablesInScope(m)
    .filter((t) => {
      if (!permissions.some((tp) => tp.table === t.name && tp.filter !== undefined)) return false;
      const re = new RegExp(`USERELATIONSHIP\\s*\\(\\s*.+?(?=\\])\\]\\s*,\\s*'*${escapeRegExp(t.name)}'*\\[`, "i");
      return measures.some((x) => re.test(x.expression));
    })
    .map(finding.table);
});

// Scope: Table, Measure, DataColumn, CalculatedColumn, CalculatedTable, CalculatedTableColumn, CalculationGroup.
// Visibility is the object's own IsHidden (a visible column in a hidden table is still reported).
export const OBJECTS_WITH_NO_DESCRIPTION = bpaRule("OBJECTS_WITH_NO_DESCRIPTION", (m) => [
  ...m.tables.filter((t) => isBlank(t.description) && !t.isHidden).map(finding.table),
  ...allMeasures(m).filter((x) => isBlank(x.description) && !x.isHidden).map(finding.measure),
  ...allColumns(m).filter((c) => isBlank(c.description) && !c.isHidden).map(finding.column),
]);

export const tableRules = [
  MODEL_SHOULD_HAVE_A_DATE_TABLE,
  DATE_CALENDAR_TABLES_SHOULD_BE_MARKED_AS_A_DATE_TABLE,
  REMOVE_AUTO_DATE_TABLE,
  REDUCE_USAGE_OF_CALCULATED_TABLES,
  REDUCE_NUMBER_OF_CALCULATED_COLUMNS,
  UNPIVOT_PIVOTED_MONTH_DATA,
  PARTITION_NAME_SHOULD_MATCH_TABLE_NAME_FOR_SINGLE_PARTITION_TABLES,
  MINIMIZE_POWER_QUERY_TRANSFORMATIONS,
  MODEL_USING_DIRECT_QUERY_AND_NO_AGGREGATIONS,
  MEASURES_USING_TIME_INTELLIGENCE_AND_MODEL_IS_USING_DIRECT_QUERY,
  LIMIT_ROW_LEVEL_SECURITY_LOGIC,
  CHECK_IF_DYNAMIC_ROW_LEVEL_SECURITY_IS_NECESSARY,
  AVOID_THE_USERELATIONSHIP_FUNCTION_AND_RLS_AGAINST_THE_SAME_TABLE,
  OBJECTS_WITH_NO_DESCRIPTION,
]
```

Note on `OBJECTS_WITH_NO_DESCRIPTION`: the table loop already covers calculation group tables (their `finding.table` object type is `CalculationGroupTable`), which is why the test expects `'CG'` exactly once. The description of a calculation group table is the `///` comment above `table`, as in Tabular Editor, where the calculation group table is the table object.

Add `tableRules` to `microsoftBpaRules` in `packages/core/src/rules/microsoft-bpa/index.ts`:

```ts
import { tableRules } from "./tables.js";
export const microsoftBpaRules: Rule[] = [...columnRules, ...relationshipRules, ...measureRules, ...dependencyRules, ...tableRules];
```

- [ ] **Step 4: Run unit tests and parity**

Run: `npm test -- rules-tables`
Expected: PASS (12 tests).

Run: `npm test -- parity`
Expected: PASS. Fixture checks: messy-sales `OBJECTS_WITH_NO_DESCRIPTION` 91, `MODEL_SHOULD_HAVE_A_DATE_TABLE` Model, `DATE/CALENDAR...` `'Date'`; tvw-baseline `REMOVE_AUTO-DATE_TABLE` 6, `REDUCE_USAGE_OF_CALCULATED_TABLES` 6, `REDUCE_NUMBER_OF_CALCULATED_COLUMNS` Model; rule-zoo `MINIMIZE_POWER_QUERY_TRANSFORMATIONS` `SalesData`, `LIMIT_ROW_LEVEL_SECURITY_(RLS)_LOGIC` `'Date'`, `CHECK_IF_DYNAMIC...` `Region Security`, `AVOID_THE_USERELATIONSHIP...` `'Date'`, `MEASURES_USING_TIME_INTELLIGENCE...` `[YTD Amount]` and `YTD`, `UNPIVOT...` `'Monthly Budget'`, `PARTITION_NAME...` `'Sales'`, `OBJECTS_WITH_NO_DESCRIPTION` including `'Time Intelligence'` and `'Empty Calc Group'` once each; kitchen-sink has no `CHECK_IF_DYNAMIC...` finding (ground-truth item 4).

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/rules packages/core/test/rules-tables.test.ts
git commit -m "feat(rules): port the table, partition, security, and model level rules"
```

---

### Task 13: Naming, container, and data source rules; live-model rules; pack completeness

**Files:**
- Create: `packages/core/src/rules/microsoft-bpa/naming.ts`, `packages/core/src/rules/microsoft-bpa/live-model.ts`
- Modify: `packages/core/src/rules/microsoft-bpa/index.ts`, `packages/core/test/parity.test.ts`
- Test: `packages/core/test/rules-naming.test.ts`, `packages/core/test/pack.test.ts`

**Interfaces:**
- Consumes: `bpaRule`, `liveModelRule`, `metaOf`, `mapScope` (Task 8); `namedObjects` (Task 6).
- Produces: `namingRules: Rule[]` (11 rules: `TRIM_OBJECT_NAMES`, `OBJECTS_SHOULD_NOT_START_OR_END_WITH_A_SPACE`, `SPECIAL_CHARS_IN_OBJECT_NAMES`, `AVOID_INVALID_NAME_CHARACTERS`, `AVOID_INVALID_DESCRIPTION_CHARACTERS`, `FIRST_LETTER_OF_OBJECTS_MUST_BE_CAPITALIZED`, `PERSPECTIVES_WITH_NO_OBJECTS`, `CALCULATION_GROUPS_WITH_NO_CALCULATION_ITEMS`, `REMOVE_ROLES_WITH_NO_MEMBERS`, `REMOVE_DATA_SOURCES_NOT_REFERENCED_BY_ANY_PARTITIONS`, `AVOID_STRUCTURED_DATA_SOURCES_WITH_PROVIDER_PARTITIONS`); `liveModelRules: Rule[]` (5); `microsoftBpaRules` complete (71) and ordered as in `BPARules.json`.

- [ ] **Step 1: Write the failing tests**

`packages/core/test/rules-naming.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { buildIndexes } from "../src/index/build.js";
import * as rules from "../src/rules/microsoft-bpa/naming.js";
import { modelFrom, objectNames } from "./helpers.js";

const zoo = `model ' Model'

table ' Spaced '
	column ' Padded '
		dataType: string
	column lowerCalc = 1
		dataType: int64
	column lowerData
		dataType: int64
	measure ' M'
	hierarchy 'by H'
		level ' L'
			column: lowerData
	partition ' Spaced ' = m
		mode: import
		source = 1

table calc
	column Inferred
		dataType: int64
	partition calc = calculated
		mode: import
		source = {1}

table 'cg'
	calculationGroup
		calculationItem ' I' = 1
	column Name
		dataType: string
	partition 'cg' = calculationGroup
		mode: import

table 'Empty CG'
	calculationGroup
	column Name
		dataType: string
	partition 'Empty CG' = calculationGroup
		mode: import

role ' R'
	modelPermission: read

role Members
	modelPermission: read
	member 'x@example.com'
		identityProvider: AzureAD
		memberType: user

perspective ' P'

perspective Full
	perspectiveTable calc

expression ' E' = 1
`;

describe("name rules by scope", () => {
  it("TRIM_OBJECT_NAMES covers nearly everything named", () => {
    expect(objectNames(rules.TRIM_OBJECT_NAMES, zoo)).toEqual(["Model", "' Spaced '", "' Spaced '[ Padded ]", "[ M]", " L", " Spaced ", " I", " R", " P", " E"]);
  });
  it("OBJECTS_SHOULD_NOT_START_OR_END_WITH_A_SPACE has the narrower scope (no levels, roles, expressions, calculation items, calculated tables)", () => {
    expect(objectNames(rules.OBJECTS_SHOULD_NOT_START_OR_END_WITH_A_SPACE, zoo)).toEqual(["Model", "' Spaced '", "' Spaced '[ Padded ]", "[ M]", " Spaced ", " P"]);
  });
  it("FIRST_LETTER_OF_OBJECTS_MUST_BE_CAPITALIZED skips data columns and includes calculated tables and calculation groups", () => {
    expect(objectNames(rules.FIRST_LETTER_OF_OBJECTS_MUST_BE_CAPITALIZED, zoo)).toEqual(["' Spaced '[lowerCalc]", "by H", "'calc'", "'cg'"]);
  });
  it("control character rules use hand-built models because TMDL cannot carry them", () => {
    const model = modelFrom("table T\n\tcolumn A\n\t\tdataType: string\n\tmeasure M = 1\n");
    model.tables[0]!.columns[0]!.name = "Bad\u0001Name";
    model.tables[0]!.measures[0]!.description = "line1\u0001line2";
    model.tables[0]!.name = "Tab\tName";
    const ctx = { indexes: buildIndexes(model) };
    expect(rules.AVOID_INVALID_NAME_CHARACTERS.check(model, ctx).map((f) => f.objectName)).toEqual(["'Tab\tName'[Bad\u0001Name]"]);
    expect(rules.AVOID_INVALID_DESCRIPTION_CHARACTERS.check(model, ctx).map((f) => f.objectName)).toEqual(["[M]"]);
    expect(rules.SPECIAL_CHARS_IN_OBJECT_NAMES.check(model, ctx).map((f) => f.objectName)).toEqual(["'Tab\tName'"]);
  });
});

describe("container rules", () => {
  it("PERSPECTIVES_WITH_NO_OBJECTS, CALCULATION_GROUPS_WITH_NO_CALCULATION_ITEMS, REMOVE_ROLES_WITH_NO_MEMBERS", () => {
    expect(objectNames(rules.PERSPECTIVES_WITH_NO_OBJECTS, zoo)).toEqual([" P"]);
    expect(objectNames(rules.CALCULATION_GROUPS_WITH_NO_CALCULATION_ITEMS, zoo)).toEqual(["'Empty CG'"]);
    expect(objectNames(rules.REMOVE_ROLES_WITH_NO_MEMBERS, zoo)).toEqual([" R"]);
  });
});

describe("data source rules", () => {
  const ds = "model Model\n\ndataSource 'Legacy SQL' = provider\n\tconnectionString: x\n\ndataSource 'Unused SQL' = provider\n\tconnectionString: y\n\ndataSource 'Mentioned SQL' = provider\n\tconnectionString: z\n\ndataSource SQL/localhost;Sales\n\tconnectionDetails =\n\t\t\t{}\n\ntable Legacy\n\tpartition Legacy = query\n\t\tsource\n\t\t\tquery = SELECT * FROM dbo.Legacy\n\t\t\tdataSource: 'Legacy SQL'\n\ntable Structured\n\tpartition Structured = query\n\t\tsource\n\t\t\tquery = SELECT * FROM dbo.Structured\n\t\t\tdataSource: SQL/localhost;Sales\n\ntable M\n\tpartition M = m\n\t\tmode: import\n\t\tsource = let s = Sql.Database(\"Mentioned SQL\") in s\n";
  it("REMOVE_DATA_SOURCES_NOT_REFERENCED_BY_ANY_PARTITIONS counts partition data sources and query text mentions", () => {
    expect(objectNames(rules.REMOVE_DATA_SOURCES_NOT_REFERENCED_BY_ANY_PARTITIONS, ds)).toEqual(["Unused SQL"]);
  });
  it("AVOID_STRUCTURED_DATA_SOURCES_WITH_PROVIDER_PARTITIONS flags query partitions on structured sources", () => {
    expect(objectNames(rules.AVOID_STRUCTURED_DATA_SOURCES_WITH_PROVIDER_PARTITIONS, ds)).toEqual(["Structured"]);
  });
});
```

`packages/core/test/pack.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { slug } from "../src/model/names.js";
import { BPA_RULES } from "../src/rules/microsoft-bpa/bpa-rules.data.js";
import { microsoftBpaRules } from "../src/rules/microsoft-bpa/index.js";
import { defaultRules } from "../src/rules/index.js";

describe("microsoft-bpa pack", () => {
  it("contains every rule in BPARules.json exactly once, in ruleset order", () => {
    expect(microsoftBpaRules.map((r) => r.id)).toEqual(BPA_RULES.map((r) => r.id));
  });
  it("declares exactly the five VertiPaq rules as needsLiveModel", () => {
    expect(microsoftBpaRules.filter((r) => r.status === "needsLiveModel").map((r) => r.id)).toEqual([
      "AVOID_BI-DIRECTIONAL_RELATIONSHIPS_AGAINST_HIGH-CARDINALITY_COLUMNS",
      "REDUCE_USAGE_OF_LONG-LENGTH_COLUMNS_WITH_HIGH_CARDINALITY",
      "SPLIT_DATE_AND_TIME",
      "LARGE_TABLES_SHOULD_BE_PARTITIONED",
      "FIX_REFERENTIAL_INTEGRITY_VIOLATIONS",
    ]);
  });
  it("has unique slugs across the default rule set", () => {
    const slugs = defaultRules.map((r) => slug(r.id));
    expect(new Set(slugs).size).toBe(slugs.length);
    expect(defaultRules.length).toBe(72);
  });
  it("gives every rule a scope, a name without the category prefix, and a category from the fixed list", () => {
    for (const r of microsoftBpaRules) {
      expect(r.scope.length, r.id).toBeGreaterThan(0);
      expect(r.name.startsWith("["), r.id).toBe(false);
      expect(["Performance", "Error Prevention", "DAX Expressions", "Maintenance", "Formatting", "Naming Conventions"]).toContain(r.category);
    }
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npm test -- rules-naming pack`
Expected: FAIL, cannot find modules.

- [ ] **Step 3: Implement the naming, container, and data source rules**

`packages/core/src/rules/microsoft-bpa/naming.ts`:

```ts
import { allPartitions, finding, namedObjects } from "../helpers.js";
import type { Rule } from "../types.js";
import { bpaRule, mapScope, metaOf } from "./define.js";

/** A rule over every object in the rule's own scope, testing name and description. */
const namedObjectRule = (id: string, test: (name: string, description: string | undefined) => boolean): Rule =>
  bpaRule(id, (m) => namedObjects(m, mapScope(metaOf(id).scope)).filter((o) => test(o.name, o.description)).map((o) => o.finding));

const startsOrEndsWithSpace = (name: string): boolean => name.startsWith(" ") || name.endsWith(" ");

export const TRIM_OBJECT_NAMES = namedObjectRule("TRIM_OBJECT_NAMES", startsOrEndsWithSpace);

export const OBJECTS_SHOULD_NOT_START_OR_END_WITH_A_SPACE = namedObjectRule("OBJECTS_SHOULD_NOT_START_OR_END_WITH_A_SPACE", startsOrEndsWithSpace);

export const SPECIAL_CHARS_IN_OBJECT_NAMES = namedObjectRule("SPECIAL_CHARS_IN_OBJECT_NAMES", (name) => /[\t\n\r]/.test(name));

// .NET char.IsControl minus char.IsWhiteSpace: U+0000..U+001F and U+007F..U+009F, except U+0009..U+000D and U+0085.
const CONTROL_NOT_WHITESPACE = /[\x00-\x08\x0E-\x1F\x7F-\x84\x86-\x9F]/;

export const AVOID_INVALID_NAME_CHARACTERS = namedObjectRule("AVOID_INVALID_NAME_CHARACTERS", (name) => CONTROL_NOT_WHITESPACE.test(name));

export const AVOID_INVALID_DESCRIPTION_CHARACTERS = namedObjectRule("AVOID_INVALID_DESCRIPTION_CHARACTERS", (_name, description) => CONTROL_NOT_WHITESPACE.test(description ?? ""));

export const FIRST_LETTER_OF_OBJECTS_MUST_BE_CAPITALIZED = namedObjectRule("FIRST_LETTER_OF_OBJECTS_MUST_BE_CAPITALIZED", (name) => name.length > 0 && name.slice(0, 1).toUpperCase() !== name.slice(0, 1));

export const PERSPECTIVES_WITH_NO_OBJECTS = bpaRule("PERSPECTIVES_WITH_NO_OBJECTS", (m) => m.perspectives.filter((p) => p.tables.length === 0).map(finding.perspective));

export const CALCULATION_GROUPS_WITH_NO_CALCULATION_ITEMS = bpaRule("CALCULATION_GROUPS_WITH_NO_CALCULATION_ITEMS", (m) =>
  m.tables.filter((t) => t.calculationGroup !== undefined && t.calculationGroup.items.length === 0).map(finding.table),
);

export const REMOVE_ROLES_WITH_NO_MEMBERS = bpaRule("REMOVE_ROLES_WITH_NO_MEMBERS", (m) => m.roles.filter((r) => r.members.length === 0).map(finding.role));

// Table.SourceExpression in the source is approximated by every partition's query or M text.
export const REMOVE_DATA_SOURCES_NOT_REFERENCED_BY_ANY_PARTITIONS = bpaRule("REMOVE_DATA_SOURCES_NOT_REFERENCED_BY_ANY_PARTITIONS", (m) => {
  const partitions = allPartitions(m);
  return m.dataSources
    .filter((ds) => !partitions.some((p) => p.dataSource === ds.name) && !partitions.some((p) => (p.source ?? "").includes(ds.name)))
    .map(finding.dataSource);
});

export const AVOID_STRUCTURED_DATA_SOURCES_WITH_PROVIDER_PARTITIONS = bpaRule("AVOID_STRUCTURED_DATA_SOURCES_WITH_PROVIDER_PARTITIONS", (m) =>
  allPartitions(m)
    .filter((p) => p.sourceType === "query" && m.dataSources.some((ds) => ds.name === p.dataSource && ds.kind === "structured"))
    .map(finding.partition),
);

export const namingRules = [
  TRIM_OBJECT_NAMES,
  OBJECTS_SHOULD_NOT_START_OR_END_WITH_A_SPACE,
  SPECIAL_CHARS_IN_OBJECT_NAMES,
  AVOID_INVALID_NAME_CHARACTERS,
  AVOID_INVALID_DESCRIPTION_CHARACTERS,
  FIRST_LETTER_OF_OBJECTS_MUST_BE_CAPITALIZED,
  PERSPECTIVES_WITH_NO_OBJECTS,
  CALCULATION_GROUPS_WITH_NO_CALCULATION_ITEMS,
  REMOVE_ROLES_WITH_NO_MEMBERS,
  REMOVE_DATA_SOURCES_NOT_REFERENCED_BY_ANY_PARTITIONS,
  AVOID_STRUCTURED_DATA_SOURCES_WITH_PROVIDER_PARTITIONS,
];
```

`packages/core/src/rules/microsoft-bpa/live-model.ts`:

```ts
import { liveModelRule } from "./define.js";

/** Rules that read VertiPaq statistics stored as annotations by a Tabular Editor script. Files never carry them. */
export const liveModelRules = [
  liveModelRule("AVOID_BI-DIRECTIONAL_RELATIONSHIPS_AGAINST_HIGH-CARDINALITY_COLUMNS"),
  liveModelRule("REDUCE_USAGE_OF_LONG-LENGTH_COLUMNS_WITH_HIGH_CARDINALITY"),
  liveModelRule("SPLIT_DATE_AND_TIME"),
  liveModelRule("LARGE_TABLES_SHOULD_BE_PARTITIONED"),
  liveModelRule("FIX_REFERENTIAL_INTEGRITY_VIOLATIONS"),
];
```

Replace `packages/core/src/rules/microsoft-bpa/index.ts`:

```ts
import type { Rule } from "../types.js";
import { BPA_RULES } from "./bpa-rules.data.js";
import { columnRules } from "./columns.js";
import { dependencyRules } from "./dependencies.js";
import { liveModelRules } from "./live-model.js";
import { measureRules } from "./measures.js";
import { namingRules } from "./naming.js";
import { relationshipRules } from "./relationships.js";
import { tableRules } from "./tables.js";

const order = new Map(BPA_RULES.map((r, i) => [r.id, i]));

/** The microsoft-bpa pack: every rule in BPARules.json, in ruleset order. */
export const microsoftBpaRules: Rule[] = [
  ...columnRules,
  ...relationshipRules,
  ...measureRules,
  ...dependencyRules,
  ...tableRules,
  ...namingRules,
  ...liveModelRules,
].sort((a, b) => order.get(a.id)! - order.get(b.id)!);
```

- [ ] **Step 4: Make the parity suite strict**

In `packages/core/test/parity.test.ts`, replace the informational "not yet ported" test with a hard assertion:

```ts
  it("has every rule Tabular Editor fired ported", () => {
    const missing = Object.keys(exp.findings).filter((id) => !ported.some((r) => r.id === id) && !exp.skipRules?.[id]);
    expect(missing).toEqual([]);
  });
```

- [ ] **Step 5: Run everything**

Run: `npm test`
Expected: PASS across all files. The parity coverage log should list exactly these ported rules as having no fixture findings: `EXPRESSION_RELIANT_OBJECTS_MUST_HAVE_AN_EXPRESSION`, `AVOID_INVALID_NAME_CHARACTERS`, `AVOID_INVALID_DESCRIPTION_CHARACTERS`, `SPECIAL_CHARS_IN_OBJECT_NAMES`, `REMOVE_DATA_SOURCES_NOT_REFERENCED_BY_ANY_PARTITIONS` (all covered by unit tests above). rule-zoo checks for this task: `TRIM_OBJECT_NAMES` 5, `OBJECTS_SHOULD_NOT_START_OR_END_WITH_A_SPACE` 3, `FIRST_LETTER_OF_OBJECTS_MUST_BE_CAPITALIZED` = `[lowercase]`, `by Category`; `PERSPECTIVES_WITH_NO_OBJECTS` = `Empty View`; `CALCULATION_GROUPS_WITH_NO_CALCULATION_ITEMS` = `'Empty Calc Group'`; `REMOVE_ROLES_WITH_NO_MEMBERS` = `Region Users`; data-sources `AVOID_STRUCTURED_DATA_SOURCES_WITH_PROVIDER_PARTITIONS` = `Structured`.

Run: `npm run typecheck && npm run lint`
Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/rules packages/core/test/rules-naming.test.ts packages/core/test/pack.test.ts packages/core/test/parity.test.ts
git commit -m "feat(rules): port naming, container, and data source rules; declare live-model rules; complete the pack"
```

---

### Task 14: Output formatters (text, JSON, Markdown, SARIF)

**Files:**
- Create: `packages/core/src/format/text.ts`, `packages/core/src/format/json.ts`, `packages/core/src/format/markdown.ts`, `packages/core/src/format/sarif.ts`, `packages/core/src/format/index.ts`
- Test: `packages/core/test/format.test.ts`

**Interfaces:**
- Consumes: `LintResult`, `RankedGroup`, `RuleSummary`, `Rule`, `SEVERITY_LABEL`, `defaultRules` (Task 6).
- Produces: `formatText(result, options?)`, `formatJson(result, options?)`, `formatMarkdown(result, options?)`, `formatSarif(result, options?)`, each `(LintResult, FormatOptions) => string` where `FormatOptions { toolVersion?: string; rules?: Rule[] }` (`rules` defaults to `defaultRules`, used for descriptions in SARIF); `FORMATS = ["text", "json", "markdown", "sarif"] as const`, `FormatName`, `formatResult(name, result, options)`. Every formatter is pure and browser-safe (no `node:` imports).

Output shapes:

- **text**: header line `pbiplint: <n> findings (<e> errors, <w> warnings, <i> info) in <f> files`, a second line with skipped and ignored counts, a `Fix these first:` list of the top five groups, then one block per group: `ERROR|WARN |INFO   <rule name>  <RULE_ID>  (<count>)`, the rule URL indented, then one line per finding: object name padded to the longest name in the group, `file:line` when known, then the detail. Rule errors, if any, are listed at the end.
- **json**: `{ "version": 1, "tool": { "name": "pbiplint", "version" }, "summary": LintSummary, "groups": [{ "rule": RuleSummary, "count", "findings": [{ objectType, objectName, file?, line?, detail? }] }] }`.
- **markdown**: `# pbiplint report`, a summary sentence, `## Fix these first` numbered list, then `## <SEVERITY>: <rule name> (<count>)` sections with the rule id linked to its page and a table `| Object | Type | Location | Detail |`.
- **sarif**: SARIF 2.1.0 with `tool.driver.rules` for every rule that has findings (`id`, `name`, `shortDescription`, `fullDescription`, `helpUri`, `defaultConfiguration.level`, `properties.category`) and one `result` per finding with `ruleId`, `ruleIndex`, `level` (`error`, `warning`, or `note`), `message.text` = `<objectName>: <rule name>` (plus `detail` when present), and a `physicalLocation` when the finding has a location.

- [ ] **Step 1: Write the failing tests**

`packages/core/test/format.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { lint } from "../src/engine/lint.js";
import { formatJson, formatMarkdown, formatResult, formatSarif, formatText, FORMATS } from "../src/format/index.js";

const files = [
  { path: "definition/model.tmdl", text: "model Model\n\tculture: en-US\n" },
  {
    path: "definition/tables/Sales.tmdl",
    text: "table Sales\n\tcolumn Amount\n\t\tdataType: double\n\t\tsourceColumn: Amount\n\tmeasure Total = SUM([Amount])\n\tpartition Sales = m\n\t\tmode: import\n\t\tsource = 1\n",
  },
];
const result = lint(files);

describe("formatText", () => {
  const text = formatText(result, { toolVersion: "1.2.3" });
  it("starts with the summary line and lists the top groups", () => {
    expect(text.split("\n")[0]).toMatch(/^pbiplint: \d+ findings \(\d+ errors, \d+ warnings, \d+ info\) in 2 files$/);
    expect(text).toContain("Fix these first:");
    expect(text).toContain("5 rules skipped (need a live model)");
  });
  it("prints each group with severity, name, id, count, URL, and file locations", () => {
    expect(text).toMatch(/ERROR\s+Column references should be fully qualified\s+DAX_COLUMNS_FULLY_QUALIFIED\s+\(1\)/);
    expect(text).toContain("https://pbiplint.com/rules/dax-columns-fully-qualified");
    expect(text).toMatch(/\[Total\]\s+definition\/tables\/Sales\.tmdl:5/);
    expect(text).toMatch(/'Sales'\[Amount\]\s+definition\/tables\/Sales\.tmdl:2/);
  });
});

describe("formatJson", () => {
  it("is parseable and carries version, summary, and groups", () => {
    const json = JSON.parse(formatJson(result, { toolVersion: "1.2.3" }));
    expect(json.version).toBe(1);
    expect(json.tool).toEqual({ name: "pbiplint", version: "1.2.3" });
    expect(json.summary.files).toBe(2);
    const group = json.groups.find((g: { rule: { id: string } }) => g.rule.id === "AVOID_FLOATING_POINT_DATA_TYPES");
    expect(group.count).toBe(1);
    expect(group.findings[0]).toEqual({ objectType: "Column", objectName: "'Sales'[Amount]", file: "definition/tables/Sales.tmdl", line: 2 });
    expect(group.rule.url).toBe("https://pbiplint.com/rules/avoid-floating-point-data-types");
  });
});

describe("formatMarkdown", () => {
  it("renders headings, links, and a table per group", () => {
    const md = formatMarkdown(result);
    expect(md.startsWith("# pbiplint report\n")).toBe(true);
    expect(md).toContain("## Fix these first");
    expect(md).toMatch(/## WARNING: Do not use floating point data types \(1\)/);
    expect(md).toContain("[AVOID_FLOATING_POINT_DATA_TYPES](https://pbiplint.com/rules/avoid-floating-point-data-types)");
    expect(md).toContain("| Object | Type | Location | Detail |");
    expect(md).toContain("| `'Sales'[Amount]` | Column | definition/tables/Sales.tmdl:2 |  |");
  });
});

describe("formatSarif", () => {
  it("emits SARIF 2.1.0 with rules and located results", () => {
    const sarif = JSON.parse(formatSarif(result, { toolVersion: "1.2.3" }));
    expect(sarif.version).toBe("2.1.0");
    expect(sarif.$schema).toContain("sarif-2.1.0");
    const run = sarif.runs[0];
    expect(run.tool.driver).toMatchObject({ name: "pbiplint", version: "1.2.3", informationUri: "https://pbiplint.com" });
    const ruleIndex = run.tool.driver.rules.findIndex((r: { id: string }) => r.id === "DAX_COLUMNS_FULLY_QUALIFIED");
    expect(ruleIndex).toBeGreaterThanOrEqual(0);
    expect(run.tool.driver.rules[ruleIndex]).toMatchObject({
      helpUri: "https://pbiplint.com/rules/dax-columns-fully-qualified",
      defaultConfiguration: { level: "error" },
      properties: { category: "DAX Expressions" },
    });
    expect(run.tool.driver.rules[ruleIndex].fullDescription.text).toContain("fully qualified");
    const res = run.results.find((r: { ruleId: string }) => r.ruleId === "DAX_COLUMNS_FULLY_QUALIFIED");
    expect(res).toMatchObject({
      ruleIndex,
      level: "error",
      message: { text: "[Total]: Column references should be fully qualified" },
      locations: [{ physicalLocation: { artifactLocation: { uri: "definition/tables/Sales.tmdl" }, region: { startLine: 5 } } }],
    });
    const info = run.results.find((r: { ruleId: string }) => r.ruleId === "OBJECTS_WITH_NO_DESCRIPTION");
    expect(info.level).toBe("note");
  });
});

describe("formatResult", () => {
  it("dispatches by name", () => {
    expect(FORMATS).toEqual(["text", "json", "markdown", "sarif"]);
    expect(formatResult("json", result)).toBe(formatJson(result));
    expect(() => formatResult("xml" as never, result)).toThrow(/Unknown format/);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npm test -- format`
Expected: FAIL, cannot find module.

- [ ] **Step 3: Implement**

`packages/core/src/format/text.ts`:

```ts
import type { LintResult } from "../engine/lint.js";
import type { RankedGroup } from "../engine/rank.js";
import { SEVERITY_LABEL, type Finding } from "../rules/types.js";

export interface FormatOptions {
  toolVersion?: string;
  rules?: import("../rules/types.js").Rule[];
}

const SEVERITY_TAG = { 3: "ERROR", 2: "WARN ", 1: "INFO " } as const;

export const locationOf = (f: Finding): string => (f.location ? `${f.location.file}:${f.location.line}` : "");

/** Summary sentence shared by the text and markdown formats. */
export function summaryLine(result: LintResult): string {
  const s = result.summary;
  return `${s.findings} findings (${s.errors} errors, ${s.warnings} warnings, ${s.infos} info) in ${s.files} files`;
}

export function skippedLine(result: LintResult): string {
  const s = result.summary;
  const live = s.rulesSkipped.filter((r) => r.reason === "needsLiveModel").length;
  const disabled = s.rulesSkipped.filter((r) => r.reason === "disabled").length;
  const parts = [`${s.rulesRun} rules run`];
  if (live) parts.push(`${live} rules skipped (need a live model)`);
  if (disabled) parts.push(`${disabled} rules disabled by config`);
  if (s.ignored) parts.push(`${s.ignored} findings ignored by annotation`);
  return parts.join(", ");
}

export const topGroups = (result: LintResult, n = 5): RankedGroup[] => result.groups.slice(0, n);

export function formatText(result: LintResult, _options: FormatOptions = {}): string {
  const out: string[] = [`pbiplint: ${summaryLine(result)}`, skippedLine(result), ""];
  if (result.groups.length === 0) {
    out.push("No findings.");
    return out.join("\n") + "\n";
  }
  out.push("Fix these first:");
  topGroups(result).forEach((g, i) => out.push(`  ${i + 1}. ${g.rule.name}  (${g.findings.length} ${SEVERITY_LABEL[g.rule.severity]}${g.findings.length === 1 ? "" : "s"})`));
  out.push("");
  for (const g of result.groups) {
    out.push(`${SEVERITY_TAG[g.rule.severity]}  ${g.rule.name}  ${g.rule.id}  (${g.findings.length})`);
    out.push(`       ${g.rule.url}`);
    const width = Math.max(...g.findings.map((f) => f.objectName.length));
    for (const f of g.findings) {
      const cols = [f.objectName.padEnd(width), locationOf(f), f.detail ?? ""].filter((c, i) => i === 0 || c !== "");
      out.push(`       ${cols.join("  ")}`.trimEnd());
    }
    out.push("");
  }
  if (result.summary.ruleErrors.length) {
    out.push("Rule errors (please report these):");
    for (const e of result.summary.ruleErrors) out.push(`  ${e.id}: ${e.message}`);
    out.push("");
  }
  return out.join("\n");
}
```

`packages/core/src/format/json.ts`:

```ts
import type { LintResult } from "../engine/lint.js";
import type { FormatOptions } from "./text.js";

export function formatJson(result: LintResult, options: FormatOptions = {}): string {
  const doc = {
    version: 1,
    tool: { name: "pbiplint", version: options.toolVersion ?? "0.0.0" },
    summary: result.summary,
    groups: result.groups.map((g) => ({
      rule: g.rule,
      count: g.findings.length,
      findings: g.findings.map((f) => ({
        objectType: f.objectType,
        objectName: f.objectName,
        ...(f.location ? { file: f.location.file, line: f.location.line } : {}),
        ...(f.detail !== undefined ? { detail: f.detail } : {}),
      })),
    })),
  };
  return JSON.stringify(doc, null, 2) + "\n";
}
```

`packages/core/src/format/markdown.ts`:

```ts
import type { LintResult } from "../engine/lint.js";
import { SEVERITY_LABEL } from "../rules/types.js";
import { locationOf, skippedLine, summaryLine, topGroups, type FormatOptions } from "./text.js";

const cell = (s: string): string => s.replace(/\|/g, "\\|").replace(/\n/g, " ");

export function formatMarkdown(result: LintResult, _options: FormatOptions = {}): string {
  const out: string[] = ["# pbiplint report", "", `${summaryLine(result)}. ${skippedLine(result)}.`, ""];
  if (result.groups.length === 0) {
    out.push("No findings.", "");
    return out.join("\n");
  }
  out.push("## Fix these first", "");
  topGroups(result).forEach((g, i) => out.push(`${i + 1}. **${g.rule.name}** (${g.findings.length}) [${g.rule.id}](${g.rule.url})`));
  out.push("");
  for (const g of result.groups) {
    out.push(`## ${SEVERITY_LABEL[g.rule.severity].toUpperCase()}: ${g.rule.name} (${g.findings.length})`, "");
    out.push(`[${g.rule.id}](${g.rule.url}) · ${g.rule.category}`, "");
    out.push("| Object | Type | Location | Detail |", "|---|---|---|---|");
    for (const f of g.findings) out.push(`| \`${cell(f.objectName)}\` | ${f.objectType} | ${locationOf(f)} | ${cell(f.detail ?? "")} |`);
    out.push("");
  }
  return out.join("\n");
}
```

`packages/core/src/format/sarif.ts`:

```ts
import type { LintResult } from "../engine/lint.js";
import { defaultRules } from "../rules/index.js";
import type { Severity } from "../rules/types.js";
import type { FormatOptions } from "./text.js";

const LEVEL: Record<Severity, "error" | "warning" | "note"> = { 3: "error", 2: "warning", 1: "note" };

export function formatSarif(result: LintResult, options: FormatOptions = {}): string {
  const byId = new Map((options.rules ?? defaultRules).map((r) => [r.id, r]));
  const rules = result.groups.map((g) => {
    const full = byId.get(g.rule.id);
    return {
      id: g.rule.id,
      name: g.rule.name,
      shortDescription: { text: g.rule.name },
      fullDescription: { text: full?.description ?? g.rule.name },
      helpUri: g.rule.url,
      defaultConfiguration: { level: LEVEL[g.rule.severity] },
      properties: { category: g.rule.category },
    };
  });
  const results = result.groups.flatMap((g, ruleIndex) =>
    g.findings.map((f) => ({
      ruleId: g.rule.id,
      ruleIndex,
      level: LEVEL[g.rule.severity],
      message: { text: `${f.objectName}: ${g.rule.name}${f.detail ? ` (${f.detail})` : ""}` },
      ...(f.location
        ? { locations: [{ physicalLocation: { artifactLocation: { uri: f.location.file }, region: { startLine: f.location.line } } }] }
        : {}),
    })),
  );
  const doc = {
    $schema: "https://json.schemastore.org/sarif-2.1.0.json",
    version: "2.1.0",
    runs: [
      {
        tool: { driver: { name: "pbiplint", version: options.toolVersion ?? "0.0.0", informationUri: "https://pbiplint.com", rules } },
        results,
      },
    ],
  };
  return JSON.stringify(doc, null, 2) + "\n";
}
```

`packages/core/src/format/index.ts`:

```ts
import type { LintResult } from "../engine/lint.js";
import { formatJson } from "./json.js";
import { formatMarkdown } from "./markdown.js";
import { formatSarif } from "./sarif.js";
import { formatText, type FormatOptions } from "./text.js";

export const FORMATS = ["text", "json", "markdown", "sarif"] as const;
export type FormatName = (typeof FORMATS)[number];

export function formatResult(name: FormatName, result: LintResult, options: FormatOptions = {}): string {
  switch (name) {
    case "text":
      return formatText(result, options);
    case "json":
      return formatJson(result, options);
    case "markdown":
      return formatMarkdown(result, options);
    case "sarif":
      return formatSarif(result, options);
    default:
      throw new Error(`Unknown format: ${String(name)}`);
  }
}

export { formatJson, formatMarkdown, formatSarif, formatText };
export type { FormatOptions };
```

Add to `packages/core/src/index.ts`:

```ts
export { FORMATS, formatResult, formatJson, formatMarkdown, formatSarif, formatText, type FormatName, type FormatOptions } from "./format/index.js";
```

- [ ] **Step 4: Run and commit**

Run: `npm test -- format && npm run typecheck`
Expected: PASS (7 tests). The `[Total]` finding for `DAX_COLUMNS_FULLY_QUALIFIED` is on line 5 of the inline table file, `'Sales'[Amount]` on line 2.

```bash
git add packages/core/src/format packages/core/src/index.ts packages/core/test/format.test.ts
git commit -m "feat(core): add text, JSON, Markdown, and SARIF formatters"
```

---

### Task 15: Rule pages

**Files:**
- Create: `scripts/generate-rule-pages.mjs`, `rules/<slug>.md` (72 files, generated once then hand-maintained)
- Test: `packages/core/test/rule-pages.test.ts`

**Interfaces:**
- Consumes: the built core package (`npm run build -w @pbiplint/core`), `defaultRules`, `slug`, `SEVERITY_LABEL`.
- Produces: one Markdown page per default rule with YAML frontmatter `id`, `name`, `category`, `severity` (info|warning|error), `scope` (list), `status` (ported|needsLiveModel|builtin), `video` (empty until a channel video exists), `sources` (list of URLs), and the sections `## What it checks`, `## Why it matters`, `## How to fix it`, optional `## Quirks`, `## Links`. The web app (next plan) and the CLI (`pbiplint rules --explain`, later) read these files; the CLI prints `https://pbiplint.com/rules/<slug>` beside each group.

- [ ] **Step 1: Write the failing test**

`packages/core/test/rule-pages.test.ts`:

```ts
import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { slug } from "../src/model/names.js";
import { defaultRules } from "../src/rules/index.js";
import { SEVERITY_LABEL } from "../src/rules/types.js";

const rulesDir = new URL("../../../rules/", import.meta.url).pathname;

describe.each(defaultRules.map((r) => [r.id, r] as const))("rule page for %s", (_id, rule) => {
  const path = `${rulesDir}${slug(rule.id)}.md`;
  it("exists with matching frontmatter and the required sections", () => {
    expect(existsSync(path), path).toBe(true);
    const text = readFileSync(path, "utf8");
    const [, frontmatter = ""] = /^---\n([\s\S]*?)\n---\n/.exec(text) ?? [];
    expect(frontmatter).toContain(`id: ${rule.id}`);
    expect(frontmatter).toContain(`severity: ${SEVERITY_LABEL[rule.severity]}`);
    expect(frontmatter).toContain(`status: ${rule.status}`);
    expect(frontmatter).toContain(`category: ${rule.category}`);
    for (const heading of ["## What it checks", "## Why it matters", "## How to fix it", "## Links"]) expect(text, heading).toContain(heading);
    expect(text).not.toContain("TODO");
    expect(text).not.toContain("\u2014");
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npm test -- rule-pages`
Expected: FAIL, 72 pages missing.

- [ ] **Step 3: Write the generator**

`scripts/generate-rule-pages.mjs` (run after `npm run build -w @pbiplint/core`; it refuses to overwrite an existing page unless `--force` is given, so hand edits survive):

```js
#!/usr/bin/env node
// Usage: npm run build -w @pbiplint/core && node scripts/generate-rule-pages.mjs [--force]
// One-shot generator for rules/<slug>.md. Existing pages are kept unless --force.
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { defaultRules, SEVERITY_LABEL, slug } from "@pbiplint/core";

const force = process.argv.includes("--force");
const RULESET_URL = "https://github.com/microsoft/Analysis-Services/blob/master/BestPracticeRules/BPARules.json";

/** One-line "what it checks" and "how to fix it" per rule. */
const SUMMARIES = {
  AVOID_FLOATING_POINT_DATA_TYPES: ["Columns whose data type is Double (floating point).", "Change the column's data type to Decimal (fixed decimal) or Int64 in Power Query or the model. Decimal keeps four decimal places."],
  ISAVAILABLEINMDX_FALSE_NONATTRIBUTE_COLUMNS: ["Hidden columns, or columns in hidden tables, that are not used for sorting, in hierarchies, or in variations, and still have IsAvailableInMdx set to true.", "Set `isAvailableInMdx: false` on the column so no attribute hierarchy is built for it."],
  "AVOID_BI-DIRECTIONAL_RELATIONSHIPS_AGAINST_HIGH-CARDINALITY_COLUMNS": ["Columns in bi-directional relationships with more than 100,000 distinct values. This needs VertiPaq statistics, so pbiplint lists it but cannot run it from files.", "Run Best Practice Analyzer against the deployed model with VertiPaq Analyzer statistics loaded, then replace the bi-directional filter with a measure-based pattern."],
  "REDUCE_USAGE_OF_LONG-LENGTH_COLUMNS_WITH_HIGH_CARDINALITY": ["Text columns longer than 100 characters in more than 500,000 rows. Needs VertiPaq statistics.", "Shorten or split long text columns upstream, or remove them from the model."],
  SPLIT_DATE_AND_TIME: ["DateTime columns with values not at midnight. Needs VertiPaq statistics.", "Split the column into a date column and a time column, or round it to midnight."],
  LARGE_TABLES_SHOULD_BE_PARTITIONED: ["Tables over 25 million rows with a single partition. Needs VertiPaq statistics.", "Add partitions (for example by year) or configure incremental refresh."],
  REDUCE_USAGE_OF_CALCULATED_COLUMNS_THAT_USE_THE_RELATED_FUNCTION: ["Calculated columns whose DAX calls RELATED.", "Move the lookup into Power Query (a merge) or into the source, so the column arrives as a data column."],
  SNOWFLAKE_SCHEMA_ARCHITECTURE: ["Tables that are on the many side of one relationship and the one side of another.", "Flatten the snowflaked dimension into a single dimension table where practical."],
  MODEL_SHOULD_HAVE_A_DATE_TABLE: ["Models with no table marked as a date table (data category Time with a DateTime key column).", "Add a date table and mark it as a date table in Power BI Desktop."],
  "DATE/CALENDAR_TABLES_SHOULD_BE_MARKED_AS_A_DATE_TABLE": ["Tables with Date or Calendar in the name that are not marked as a date table.", "Mark the table as a date table (Table tools, Mark as date table) using a DateTime key column."],
  "REMOVE_AUTO-DATE_TABLE": ["Calculated tables generated by Auto date/time (names starting with DateTableTemplate_ or LocalDateTable_).", "Turn off Auto date/time under Options, Data Load, and use a real date table."],
  "AVOID_EXCESSIVE_BI-DIRECTIONAL_OR_MANY-TO-MANY_RELATIONSHIPS": ["Models where bi-directional plus many-to-many relationships exceed 30 percent of all relationships.", "Change relationships to single direction and replace many-to-many relationships with bridge tables or measures."],
  "LIMIT_ROW_LEVEL_SECURITY_(RLS)_LOGIC": ["Tables whose row-level security filters use RIGHT, LEFT, UPPER, LOWER, or FIND.", "Precompute the security key upstream so the filter is a simple equality."],
  MODEL_USING_DIRECT_QUERY_AND_NO_AGGREGATIONS: ["Models with a DirectQuery table, no aggregation tables (no column has alternateOf), and the PowerBI_V3 data source version.", "Consider adding aggregation tables for the DirectQuery fact table."],
  MINIMIZE_POWER_QUERY_TRANSFORMATIONS: ["M partitions that call heavy transformations: Table.Combine, Table.Join, Table.NestedJoin, Table.AddColumn, Table.Group, Table.Sort, Table.Pivot, Table.Unpivot, Table.UnpivotOtherColumns, Table.Distinct, or native queries.", "Push the transformation into the source system or a view, and check that query folding still occurs."],
  "AVOID_USING_MANY-TO-MANY_RELATIONSHIPS_ON_TABLES_USED_FOR_DYNAMIC_ROW_LEVEL_SECURITY": ["Tables that carry a row-level security filter and take part in a many-to-many relationship.", "Relate the security table many-to-one to a single dimension instead."],
  "UNPIVOT_PIVOTED_(MONTH)_DATA": ["Tables with numeric columns named after the months Jan through Jun.", "Unpivot the month columns into rows in Power Query."],
  "MANY-TO-MANY_RELATIONSHIPS_SHOULD_BE_SINGLE-DIRECTION": ["Many-to-many relationships with bi-directional cross filtering.", "Set the cross filter direction to single."],
  REDUCE_USAGE_OF_CALCULATED_TABLES: ["Every calculated table.", "Build the table in the source or in Power Query so it is loaded as data."],
  REMOVE_REDUNDANT_COLUMNS_IN_RELATED_TABLES: ["Columns not used in any relationship whose name also exists on a table this table relates to.", "Remove the duplicate from the fact table and use the dimension's column."],
  MEASURES_USING_TIME_INTELLIGENCE_AND_MODEL_IS_USING_DIRECT_QUERY: ["Measures and calculation items that use time intelligence functions in a model with a DirectQuery table.", "Add prior-period columns to the fact table, or move the table to Import."],
  REDUCE_NUMBER_OF_CALCULATED_COLUMNS: ["Models with more than five calculated columns.", "Move calculated column logic into Power Query or the source."],
  "CHECK_IF_BI-DIRECTIONAL_AND_MANY-TO-MANY_RELATIONSHIPS_ARE_VALID": ["Every bi-directional or many-to-many relationship.", "Confirm each one is intentional; otherwise make it single direction or many-to-one."],
  "CHECK_IF_DYNAMIC_ROW_LEVEL_SECURITY_(RLS)_IS_NECESSARY": ["Row-level security filters that call USERNAME() or USERPRINCIPALNAME().", "Use static roles when the audience is small and fixed."],
  DAX_COLUMNS_FULLY_QUALIFIED: ["Measures, table permissions, and calculation items that reference a column without its table name.", "Write `'Table'[Column]` instead of `[Column]`."],
  DAX_MEASURES_UNQUALIFIED: ["Expressions that reference a measure with a table prefix.", "Write `[Measure]` instead of `'Table'[Measure]`."],
  AVOID_DUPLICATE_MEASURES: ["Two or more measures with the same DAX after removing whitespace.", "Keep one measure and reference it from the other, or delete the duplicate."],
  USE_THE_TREATAS_FUNCTION_INSTEAD_OF_INTERSECT: ["Measures and calculation items that call INTERSECT.", "Use TREATAS to propagate the filter."],
  USE_THE_DIVIDE_FUNCTION_FOR_DIVISION: ["Expressions that divide with the / operator right after a ] or ).", "Use `DIVIDE(numerator, denominator)` so divide-by-zero returns blank."],
  AVOID_USING_THE_IFERROR_FUNCTION: ["Measures and calculated columns that call IFERROR.", "Handle the specific error case, for example with DIVIDE, instead of IFERROR."],
  MEASURES_SHOULD_NOT_BE_DIRECT_REFERENCES_OF_OTHER_MEASURES: ["Measures whose entire expression is a reference to another measure.", "Delete the alias measure or give it its own logic."],
  FILTER_COLUMN_VALUES: ["CALCULATE or CALCULATETABLE with `FILTER('Table', 'Table'[Column] ...)` as a filter argument.", "Filter the column directly, `'Table'[Column] = value`, or wrap it in KEEPFILTERS."],
  FILTER_MEASURE_VALUES_BY_COLUMNS: ["CALCULATE or CALCULATETABLE with `FILTER('Table', [Measure] ...)` as a filter argument.", "Filter a column instead: `FILTER(VALUES('Table'[Column]), [Measure] > value)` or `FILTER(ALL('Table'[Column]), ...)`."],
  INACTIVE_RELATIONSHIPS_THAT_ARE_NEVER_ACTIVATED: ["Inactive relationships that no measure or calculation item activates with USERELATIONSHIP.", "Delete the relationship, or use it with USERELATIONSHIP in a measure."],
  "AVOID_USING_'1-(X/Y)'_SYNTAX": ["Expressions of the form `1 - x / y`, `1 + x / y`, or a number plus or minus `DIVIDE(...)`.", "Rewrite as `DIVIDE(y - x, y)` so the measure returns blank rather than a constant when there is no data."],
  EVALUATEANDLOG_SHOULD_NOT_BE_USED_IN_PRODUCTION_MODELS: ["Measures that call EVALUATEANDLOG.", "Remove EVALUATEANDLOG before deploying."],
  DATA_COLUMNS_MUST_HAVE_A_SOURCE_COLUMN: ["Data columns with no sourceColumn.", "Set the source column, or delete the column."],
  EXPRESSION_RELIANT_OBJECTS_MUST_HAVE_AN_EXPRESSION: ["Measures, calculated columns, and calculation items with an empty expression.", "Add the DAX expression or delete the object."],
  AVOID_STRUCTURED_DATA_SOURCES_WITH_PROVIDER_PARTITIONS: ["Query (provider) partitions that reference a structured data source.", "Convert the partition to M, or convert the data source to a provider data source."],
  AVOID_THE_USERELATIONSHIP_FUNCTION_AND_RLS_AGAINST_THE_SAME_TABLE: ["Tables that have row-level security and are the target of USERELATIONSHIP in a measure.", "Remove the row-level security from that table, or avoid USERELATIONSHIP against it."],
  RELATIONSHIP_COLUMNS_SAME_DATA_TYPE: ["Relationships whose two columns have different data types.", "Convert both columns to the same type, ideally whole number."],
  AVOID_INVALID_NAME_CHARACTERS: ["Object names containing control characters.", "Replace the control character with a space."],
  AVOID_INVALID_DESCRIPTION_CHARACTERS: ["Descriptions containing control characters.", "Replace the control character with a space."],
  SET_ISAVAILABLEINMDX_TO_TRUE_ON_NECESSARY_COLUMNS: ["Columns with IsAvailableInMdx false that are used for sorting, in a hierarchy, in a variation, or that sort by another column.", "Set `isAvailableInMdx` back to true."],
  UNNECESSARY_COLUMNS: ["Hidden columns that nothing references: no DAX, relationship, hierarchy, sort-by, row-level security, or object-level security.", "Remove the column from the query."],
  UNNECESSARY_MEASURES: ["Hidden measures that no DAX expression references.", "Delete the measure."],
  FIX_REFERENTIAL_INTEGRITY_VIOLATIONS: ["Relationships with foreign key values missing from the dimension. Needs VertiPaq statistics.", "Add the missing dimension rows or fix the fact data."],
  REMOVE_DATA_SOURCES_NOT_REFERENCED_BY_ANY_PARTITIONS: ["Data sources that no partition uses or mentions.", "Delete the data source."],
  REMOVE_ROLES_WITH_NO_MEMBERS: ["Roles with no members.", "Assign members in the service, or delete roles that are not used."],
  ENSURE_TABLES_HAVE_RELATIONSHIPS: ["Tables with no relationships.", "Relate the table, or confirm it is an intentional disconnected table (parameters, security)."],
  OBJECTS_WITH_NO_DESCRIPTION: ["Visible tables, columns, measures, and calculation groups without a description.", "Add a description; it shows on hover in the field list."],
  PERSPECTIVES_WITH_NO_OBJECTS: ["Perspectives containing no tables.", "Add objects to the perspective or delete it."],
  CALCULATION_GROUPS_WITH_NO_CALCULATION_ITEMS: ["Calculation groups with no calculation items.", "Add calculation items or delete the group."],
  PARTITION_NAME_SHOULD_MATCH_TABLE_NAME_FOR_SINGLE_PARTITION_TABLES: ["Tables with a single partition whose name differs from the table name.", "Rename the partition to the table name."],
  SPECIAL_CHARS_IN_OBJECT_NAMES: ["Names containing a tab, line feed, or carriage return.", "Remove the character from the name."],
  TRIM_OBJECT_NAMES: ["Names that start or end with a space.", "Trim the name."],
  "FORMAT_FLAG_COLUMNS_AS_YES/NO_VALUE_STRINGS": ["Visible integer columns named Is... and visible non-text columns named ... Flag.", "Convert the flag to Yes/No text in Power Query."],
  OBJECTS_SHOULD_NOT_START_OR_END_WITH_A_SPACE: ["Names that start or end with a space, for the model, tables, measures, hierarchies, perspectives, partitions, and columns.", "Trim the name."],
  DATECOLUMN_FORMATSTRING: ["DateTime columns with Date in the name whose format string is not mm/dd/yyyy.", "Set the format string to mm/dd/yyyy. The rule is US-centric; if your standard differs, disable it in pbiplint.config.json."],
  MONTHCOLUMN_FORMATSTRING: ["DateTime columns with Month in the name whose format string is not MMMM yyyy.", "Set the format string to MMMM yyyy."],
  PROVIDE_FORMAT_STRING_FOR_MEASURES: ["Visible measures with no format string and no dynamic format string.", "Set a format string on the measure."],
  NUMERIC_COLUMN_SUMMARIZE_BY: ["Visible numeric columns whose default summarization is not None.", "Set `summarizeBy: none` and create explicit measures."],
  PERCENTAGE_FORMATTING: ["Measures with a percent format string other than #,0.0%;-#,0.0%;#,0.0%.", "Use the format string `#,0.0%;-#,0.0%;#,0.0%`."],
  INTEGER_FORMATTING: ["Measures whose format string is not currency, percent, #,0, or #,0.0, including measures with no format string.", "Use `#,0` for whole numbers."],
  RELATIONSHIP_COLUMNS_SHOULD_BE_OF_INTEGER_DATA_TYPE: ["Relationship columns that are not Int64.", "Use whole-number surrogate keys on both sides."],
  ADD_DATA_CATEGORY_FOR_COLUMNS: ["Text columns named with country, continent, or city, and decimal or double columns named latitude or longitude, that have no data category.", "Set the data category so maps and the service recognize the column."],
  HIDE_FOREIGN_KEYS: ["Visible columns whose name is the from-side of a many-to-one relationship.", "Hide the column."],
  MARK_PRIMARY_KEYS: ["Columns on the one side of a relationship, outside date tables, that are not marked as key.", "Set `isKey` on the column."],
  HIDE_FACT_TABLE_COLUMNS: ["Visible numeric columns that a measure aggregates with SUM, COUNT, AVERAGE, MIN, MAX, DISTINCTCOUNT, or similar.", "Hide the column and expose the measure instead."],
  FIRST_LETTER_OF_OBJECTS_MUST_BE_CAPITALIZED: ["Tables, measures, hierarchies, calculated columns, calculated tables, and calculation groups whose first character is not upper case.", "Capitalize the first letter."],
  "MONTH_(AS_A_STRING)_MUST_BE_SORTED": ["Text columns with Month in the name (but not Months) that have no sort-by column.", "Add a month number column and set it as the sort-by column."],
  PARSE_ISSUE: ["Lines the TMDL parser did not understand: space indentation, an unterminated ``` fence, or a line at an impossible indentation.", "Fix the line (TMDL uses tabs; close every ``` fence). The rest of the file is still analyzed."],
};

/** Documented differences from what a reader might expect. Every entry is verified against Tabular Editor. */
const QUIRKS = {
  HIDE_FOREIGN_KEYS: ["The Microsoft rule compares from-column names only, not table plus column, so a dimension's key that shares a name with the fact table's foreign key is flagged too. pbiplint keeps this to match Tabular Editor."],
  FILTER_COLUMN_VALUES: ["The pattern accepts a space as the table name, so `FILTER('Table', [Measure] > 1)` is also flagged by this rule (and by FILTER_MEASURE_VALUES_BY_COLUMNS)."],
  INACTIVE_RELATIONSHIPS_THAT_ARE_NEVER_ACTIVATED: ["Only `USERELATIONSHIP(from column, to column)` counts as activation; the reversed argument order does not.", "pbiplint escapes table and column names before building the pattern, which the Microsoft rule does not, so names with parentheses cannot break the check."],
  MEASURES_USING_TIME_INTELLIGENCE_AND_MODEL_IS_USING_DIRECT_QUERY: ["Function names are matched case-sensitively (upper case only), as in the Microsoft rule."],
  "LIMIT_ROW_LEVEL_SECURITY_(RLS)_LOGIC": ["Spaces are removed before matching and the match is a substring, so `BRIGHT(` or `L E F T(` also match."],
  "CHECK_IF_DYNAMIC_ROW_LEVEL_SECURITY_(RLS)_IS_NECESSARY": ["A space before the parenthesis, as DAX formatters produce (`USERPRINCIPALNAME ()`), is not matched."],
  FIRST_LETTER_OF_OBJECTS_MUST_BE_CAPITALIZED: ["Data columns are not in scope; only calculated and calculated-table columns are checked."],
  OBJECTS_SHOULD_NOT_START_OR_END_WITH_A_SPACE: ["Narrower scope than TRIM_OBJECT_NAMES: levels, roles, expressions, calculation items, and calculated tables are not checked here."],
  "AVOID_EXCESSIVE_BI-DIRECTIONAL_OR_MANY-TO-MANY_RELATIONSHIPS": ["A relationship that is both bi-directional and many-to-many counts twice."],
  DATECOLUMN_FORMATSTRING: ["The Microsoft description says Month; the rule matches Date in the column name. Any name containing the letters date, such as Update, is matched."],
  DAX_COLUMNS_FULLY_QUALIFIED: ["Calculation items never fire this rule: Tabular Editor does not resolve bare column references inside calculation items, and pbiplint matches that.", "KPI expressions are not checked in v1."],
  DAX_MEASURES_UNQUALIFIED: ["KPI expressions are not checked in v1."],
  EXPRESSION_RELIANT_OBJECTS_MUST_HAVE_AN_EXPRESSION: ["Cannot fire on a TMDL file: the TMDL reader takes the next indented line as the expression, so an empty expression never survives loading."],
  REMOVE_DATA_SOURCES_NOT_REFERENCED_BY_ANY_PARTITIONS: ["Tabular Editor 3 CLI 0.5.2 did not report this rule when loading from TMDL, although it did from .bim; pbiplint follows the rule text.", "Power BI Desktop never writes data sources, so this rule matters only for hand-built or migrated models."],
  REMOVE_ROLES_WITH_NO_MEMBERS: ["Power BI projects never contain role members, so every role in a PBIP is flagged. Disable the rule in pbiplint.config.json if this is noise for you."],
  OBJECTS_WITH_NO_DESCRIPTION: ["Visibility is the object's own isHidden flag: a visible column inside a hidden table is still reported.", "A calculation group table is reported once, as a calculation group."],
  INTEGER_FORMATTING: ["A measure with no format string at all is flagged by this rule as well as by PROVIDE_FORMAT_STRING_FOR_MEASURES."],
  NUMERIC_COLUMN_SUMMARIZE_BY: ["A column with no summarizeBy property is treated as Default, which is not None, so it is flagged."],
  UNNECESSARY_COLUMNS: ["DAX references are approximated by pattern matching: references inside strings or comments count, and a bare [Column] reference resolves measure-first, then the expression's own table, then the first table with that column."],
  UNNECESSARY_MEASURES: ["References from calculation items and from other hidden measures count as usage."],
  "REDUCE_USAGE_OF_CALCULATED_COLUMNS_THAT_USE_THE_RELATED_FUNCTION": ["RELATEDTABLE( does not match; the pattern requires a parenthesis right after RELATED."],
};

const why = (rule) => {
  const text = rule.description.split("\n").filter((line) => !/^\s*Reference:/i.test(line)).join("\n").trim();
  return text.length ? text : `Microsoft's Best Practice Analyzer includes this rule under ${rule.category}.`;
};

mkdirSync("rules", { recursive: true });
let written = 0;
for (const rule of defaultRules) {
  const path = `rules/${slug(rule.id)}.md`;
  if (existsSync(path) && !force) continue;
  const summary = SUMMARIES[rule.id];
  if (!summary) throw new Error(`No summary for ${rule.id}`);
  const [what, fix] = summary;
  const sources = rule.status === "builtin" ? rule.references : [RULESET_URL, ...rule.references];
  const lines = [
    "---",
    `id: ${rule.id}`,
    `name: ${JSON.stringify(rule.name)}`,
    `category: ${rule.category}`,
    `severity: ${SEVERITY_LABEL[rule.severity]}`,
    `scope: [${rule.scope.join(", ")}]`,
    `status: ${rule.status}`,
    "video:",
    "sources:",
    ...sources.map((u) => `  - ${u}`),
    "---",
    "",
    `# ${rule.name}`,
    "",
    "## What it checks",
    "",
    what,
    "",
    "## Why it matters",
    "",
    why(rule),
    "",
    "## How to fix it",
    "",
    fix,
    ...(rule.fixExpression ? ["", `Tabular Editor fix expression: \`${rule.fixExpression}\``] : []),
    ...(rule.status === "needsLiveModel" ? ["", "pbiplint cannot evaluate this rule from files; it appears in `pbiplint rules` as needing a live model."] : []),
    "",
  ];
  const quirks = QUIRKS[rule.id];
  if (quirks) lines.push("## Quirks", "", ...quirks.map((q) => `- ${q}`), "");
  lines.push("## Links", "", ...sources.map((u) => `- ${u}`), "");
  writeFileSync(path, lines.join("\n"));
  written++;
}
console.log(`wrote ${written} rule page(s)`);
```

- [ ] **Step 4: Generate and verify**

```bash
npm run build -w @pbiplint/core
node scripts/generate-rule-pages.mjs
ls rules | wc -l
grep -l $'\xe2\x80\x94' rules/*.md || echo "no em dashes"
```

Expected: `wrote 72 rule page(s)`, `72`, and `no em dashes`. Open two pages and read them as a user would: `rules/hide-foreign-keys.md` (has a Quirks section and a fix expression) and `rules/parse-issue.md` (builtin, no ruleset link). Fix any wording that reads badly in the generator's maps and re-run with `--force`.

Run: `npm test -- rule-pages`
Expected: PASS (72 tests).

- [ ] **Step 5: Commit**

```bash
git add scripts/generate-rule-pages.mjs rules packages/core/test/rule-pages.test.ts
git commit -m "docs(rules): generate a page for every rule with what, why, fix, quirks, and links"
```

---

### Task 16: Command-line tool

**Files:**
- Create: `packages/cli/src/args.ts`, `packages/cli/src/walk.ts`, `packages/cli/src/config.ts`, `packages/cli/src/sample.ts`, `packages/cli/src/main.ts`, `packages/cli/build.mjs`
- Modify: `packages/cli/src/bin.ts`, `packages/cli/package.json`
- Test: `packages/cli/test/args.test.ts`, `packages/cli/test/walk.test.ts`, `packages/cli/test/cli.test.ts`

**Interfaces:**
- Consumes: `lint`, `formatResult`, `FORMATS`, `defaultRules`, `resolveConfig`, `ConfigError`, `SEVERITY_LABEL` from `@pbiplint/core`.
- Produces: `parseArgs(argv): CliOptions` (`{ command: "lint" | "rules" | "help" | "version"; path?: string; format: FormatName; failOn?: SeverityName | "none"; config?: string; output?: string; sample: boolean }`, throws `UsageError`); `resolveModel(path): { root: string; files: LintFile[] }` (throws `UsageError` when nothing lintable is found); `findConfig(startDir, explicitPath?): { path?: string; config: PbiplintConfig }`; `sampleDir(): string`; `main(argv, io): Promise<number>` with `io { stdout(text): void; stderr(text): void; cwd(): string }`; exit codes 0 (clean), 1 (findings at or above failOn), 2 (usage, I/O, or config error). Build output `packages/cli/dist/pbiplint.mjs` (single file, shebang, core bundled in) and `packages/cli/sample/` (copy of `examples/messy-sales`).

CLI surface (spec section 10):

```
pbiplint <path> [--format text|json|sarif|markdown] [--fail-on error|warning|info|none] [--config <file>] [--output <file>]
pbiplint --sample [same options]
pbiplint rules
pbiplint --help | --version
```

`<path>` may be a `.SemanticModel` folder, a PBIP folder containing exactly one `*.SemanticModel` folder, a `definition` folder, or a single `.tmdl` file. Finding paths are relative to the model root. Config is `--config`, else the first `pbiplint.config.json` found walking up from the model root; `--fail-on` overrides the file.

- [ ] **Step 1: Write the failing tests**

`packages/cli/test/args.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { parseArgs, UsageError } from "../src/args.js";

describe("parseArgs", () => {
  it("defaults to lint with text output", () => {
    expect(parseArgs(["./model"])).toEqual({ command: "lint", path: "./model", format: "text", sample: false });
  });
  it("reads options in any order", () => {
    expect(parseArgs(["--format", "sarif", "./m", "--fail-on", "warning", "--config", "c.json", "--output", "out.sarif"])).toEqual({
      command: "lint", path: "./m", format: "sarif", failOn: "warning", config: "c.json", output: "out.sarif", sample: false,
    });
    expect(parseArgs(["--format=json", "./m"]).format).toBe("json");
  });
  it("supports the sample, rules, help, and version commands", () => {
    expect(parseArgs(["--sample"])).toMatchObject({ command: "lint", sample: true });
    expect(parseArgs(["rules"]).command).toBe("rules");
    expect(parseArgs(["--help"]).command).toBe("help");
    expect(parseArgs([]).command).toBe("help");
    expect(parseArgs(["--version"]).command).toBe("version");
  });
  it("rejects bad input with a UsageError", () => {
    expect(() => parseArgs(["./m", "--format", "xml"])).toThrow(UsageError);
    expect(() => parseArgs(["./m", "--fail-on", "sometimes"])).toThrow(/--fail-on/);
    expect(() => parseArgs(["./m", "--bogus"])).toThrow(/Unknown option --bogus/);
    expect(() => parseArgs(["a", "b"])).toThrow(/one path/);
    expect(() => parseArgs(["./m", "--sample"])).toThrow(/either/);
  });
});
```

`packages/cli/test/walk.test.ts`:

```ts
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { resolveModel } from "../src/walk.js";

const repo = new URL("../../../", import.meta.url).pathname;

describe("resolveModel", () => {
  it("reads a .SemanticModel folder and reports paths relative to it with forward slashes", () => {
    const { root, files } = resolveModel(join(repo, "tests/fixtures/rule-zoo.SemanticModel"));
    expect(root.endsWith("rule-zoo.SemanticModel")).toBe(true);
    expect(files.map((f) => f.path)).toContain("definition/tables/Sales.tmdl");
    expect(files.every((f) => !f.path.includes("\\"))).toBe(true);
    expect(files.length).toBe(17);
  });
  it("accepts a PBIP folder with one semantic model, a definition folder, and a single file", () => {
    const pbip = mkdtempSync(join(tmpdir(), "pbiplint-"));
    mkdirSync(join(pbip, "Demo.SemanticModel", "definition", "tables"), { recursive: true });
    mkdirSync(join(pbip, "Demo.Report"), { recursive: true });
    writeFileSync(join(pbip, "Demo.SemanticModel", "definition", "model.tmdl"), "model Model\n");
    writeFileSync(join(pbip, "Demo.SemanticModel", "definition", "tables", "T.tmdl"), "table T\n");
    expect(resolveModel(pbip).files.map((f) => f.path).sort()).toEqual(["definition/model.tmdl", "definition/tables/T.tmdl"]);
    expect(resolveModel(join(pbip, "Demo.SemanticModel", "definition")).files.map((f) => f.path).sort()).toEqual(["model.tmdl", "tables/T.tmdl"]);
    expect(resolveModel(join(pbip, "Demo.SemanticModel", "definition", "tables", "T.tmdl")).files).toEqual([{ path: "T.tmdl", text: "table T\n" }]);
  });
  it("explains what it could not find", () => {
    const empty = mkdtempSync(join(tmpdir(), "pbiplint-empty-"));
    expect(() => resolveModel(empty)).toThrow(/No semantic model found/);
    expect(() => resolveModel(join(empty, "missing"))).toThrow(/does not exist/);
  });
});
```

`packages/cli/test/cli.test.ts`:

```ts
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { main } from "../src/main.js";

const repo = new URL("../../../", import.meta.url).pathname;
const sample = join(repo, "examples/messy-sales");

async function run(argv: string[], cwd = repo) {
  let out = "";
  let err = "";
  const code = await main(argv, { stdout: (s) => (out += s), stderr: (s) => (err += s), cwd: () => cwd });
  return { code, out, err };
}

describe("pbiplint CLI", () => {
  it("lints the sample project and exits 1 because it has errors", async () => {
    const r = await run([sample]);
    expect(r.code).toBe(1);
    expect(r.out).toMatch(/^pbiplint: 161 findings \(16 errors, 39 warnings, 106 info\) in 11 files/);
    expect(r.out).toContain("https://pbiplint.com/rules/provide-format-string-for-measures");
    expect(r.err).toBe("");
  });
  it("--sample is the same as pointing at the bundled sample", async () => {
    const r = await run(["--sample", "--format", "json"]);
    expect(r.code).toBe(1);
    expect(JSON.parse(r.out).summary.findings).toBe(161);
  });
  it("respects --fail-on and exits 0 when nothing reaches the threshold", async () => {
    expect((await run([sample, "--fail-on", "none"])).code).toBe(0);
    expect((await run([join(repo, "tests/fixtures/kitchen-sink.SemanticModel")])).code).toBe(0);
    expect((await run([join(repo, "tests/fixtures/kitchen-sink.SemanticModel"), "--fail-on", "info"])).code).toBe(1);
  });
  it("writes every format, to stdout or to --output", async () => {
    for (const format of ["json", "sarif", "markdown"]) {
      const r = await run([sample, "--format", format]);
      expect(r.code).toBe(1);
      if (format === "markdown") expect(r.out.startsWith("# pbiplint report")).toBe(true);
      else expect(() => JSON.parse(r.out)).not.toThrow();
    }
    const dir = mkdtempSync(join(tmpdir(), "pbiplint-out-"));
    const file = join(dir, "report.sarif");
    const r = await run([sample, "--format", "sarif", "--output", file]);
    expect(r.out).toBe("");
    expect(JSON.parse(readFileSync(file, "utf8")).version).toBe("2.1.0");
  });
  it("discovers pbiplint.config.json above the model and honors --config", async () => {
    const dir = mkdtempSync(join(tmpdir(), "pbiplint-cfg-"));
    const cfg = join(dir, "pbiplint.config.json");
    writeFileSync(cfg, JSON.stringify({ rules: { PROVIDE_FORMAT_STRING_FOR_MEASURES: "off", DAX_COLUMNS_FULLY_QUALIFIED: "warning" }, failOn: "warning" }));
    const r = await run([sample, "--config", cfg, "--format", "json"]);
    const json = JSON.parse(r.out);
    expect(json.summary.rulesSkipped).toContainEqual({ id: "PROVIDE_FORMAT_STRING_FOR_MEASURES", reason: "disabled" });
    expect(json.groups.find((g: { rule: { id: string } }) => g.rule.id === "DAX_COLUMNS_FULLY_QUALIFIED").rule.severity).toBe(2);
    expect(r.code).toBe(1);
    const bad = join(dir, "bad.json");
    writeFileSync(bad, '{"rules": {"X": "loud"}}');
    const b = await run([sample, "--config", bad]);
    expect(b.code).toBe(2);
    expect(b.err).toMatch(/rules\["X"\]/);
  });
  it("lists rules", async () => {
    const r = await run(["rules"]);
    expect(r.code).toBe(0);
    expect(r.out).toMatch(/HIDE_FOREIGN_KEYS\s+ported\s+warning\s+Formatting\s+Hide foreign keys/);
    expect(r.out).toMatch(/SPLIT_DATE_AND_TIME\s+needs live model/);
    expect(r.out.trim().split("\n").length).toBeGreaterThanOrEqual(72);
  });
  it("prints help and version, and exits 2 on usage errors", async () => {
    expect((await run(["--help"])).out).toContain("Usage: pbiplint");
    expect((await run(["--version"])).out).toMatch(/^pbiplint \d+\.\d+\.\d+/);
    const bad = await run(["--format", "xml", sample]);
    expect(bad.code).toBe(2);
    expect(bad.err).toContain("--format");
    const missing = await run([join(repo, "nope")]);
    expect(missing.code).toBe(2);
    expect(missing.err).toContain("does not exist");
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npm test -- packages/cli`
Expected: FAIL, cannot find modules.

- [ ] **Step 3: Implement argument parsing**

`packages/cli/src/args.ts`:

```ts
import { FORMATS, type FormatName, type SeverityName } from "@pbiplint/core";

export class UsageError extends Error {}

export interface CliOptions {
  command: "lint" | "rules" | "help" | "version";
  path?: string;
  format: FormatName;
  failOn?: SeverityName | "none";
  config?: string;
  output?: string;
  sample: boolean;
}

const FAIL_ON = ["error", "warning", "info", "none"] as const;

export function parseArgs(argv: string[]): CliOptions {
  const opts: CliOptions = { command: "lint", format: "text", sample: false };
  const positional: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    let arg = argv[i]!;
    let inlineValue: string | undefined;
    const eq = arg.indexOf("=");
    if (arg.startsWith("--") && eq > 0) {
      inlineValue = arg.slice(eq + 1);
      arg = arg.slice(0, eq);
    }
    const value = (): string => {
      if (inlineValue !== undefined) return inlineValue;
      const v = argv[++i];
      if (v === undefined) throw new UsageError(`${arg} needs a value`);
      return v;
    };
    switch (arg) {
      case "--help":
      case "-h":
        return { ...opts, command: "help" };
      case "--version":
      case "-v":
        return { ...opts, command: "version" };
      case "--sample":
        opts.sample = true;
        break;
      case "--format": {
        const f = value();
        if (!(FORMATS as readonly string[]).includes(f)) throw new UsageError(`--format must be one of ${FORMATS.join(", ")}`);
        opts.format = f as FormatName;
        break;
      }
      case "--fail-on": {
        const f = value();
        if (!(FAIL_ON as readonly string[]).includes(f)) throw new UsageError(`--fail-on must be one of ${FAIL_ON.join(", ")}`);
        opts.failOn = f as CliOptions["failOn"];
        break;
      }
      case "--config":
        opts.config = value();
        break;
      case "--output":
      case "-o":
        opts.output = value();
        break;
      default:
        if (arg.startsWith("-")) throw new UsageError(`Unknown option ${arg}`);
        positional.push(arg);
    }
  }
  if (positional[0] === "rules") {
    if (positional.length > 1) throw new UsageError("rules takes no arguments");
    return { ...opts, command: "rules" };
  }
  if (positional.length > 1) throw new UsageError("Expected one path");
  if (positional.length === 1 && opts.sample) throw new UsageError("Give either a path or --sample, not both");
  if (positional.length === 0 && !opts.sample) return { ...opts, command: "help" };
  if (positional.length === 1) opts.path = positional[0];
  return opts;
}

export const HELP = `Usage: pbiplint <path> [options]
       pbiplint --sample [options]
       pbiplint rules

Lint a Power BI semantic model (TMDL) for best-practice violations. Nothing is uploaded.

<path>              a .SemanticModel folder, a PBIP folder, a definition folder, or one .tmdl file
--sample            lint the bundled sample project instead of a path
--format <name>     text (default), json, sarif, markdown
--fail-on <level>   error (default), warning, info, none: lowest severity that exits 1
--config <file>     pbiplint.config.json to use (default: nearest one above the model)
--output <file>     write the report to a file instead of stdout
--help, --version

Exit codes: 0 no findings at or above --fail-on, 1 findings, 2 usage or input error.
Rule pages: https://pbiplint.com/rules/
`;
```

- [ ] **Step 4: Implement the folder walk, config discovery, and sample lookup**

`packages/cli/src/walk.ts`:

```ts
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { basename, dirname, join, relative, resolve } from "node:path";
import type { LintFile } from "@pbiplint/core";
import { UsageError } from "./args.js";

export interface ResolvedModel {
  /** Absolute path finding locations are relative to. */
  root: string;
  files: LintFile[];
}

const toPosix = (p: string): string => p.split("\\").join("/");

function readTmdlFiles(root: string, dir: string, out: LintFile[]): void {
  for (const entry of readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    const p = join(dir, entry.name);
    if (entry.isDirectory()) readTmdlFiles(root, p, out);
    else if (entry.name.endsWith(".tmdl")) out.push({ path: toPosix(relative(root, p)), text: readFileSync(p, "utf8") });
  }
}

/** Find the semantic model at or under `input` and read its .tmdl files. */
export function resolveModel(input: string): ResolvedModel {
  const path = resolve(input);
  if (!existsSync(path)) throw new UsageError(`${input} does not exist`);
  const stat = statSync(path);
  if (stat.isFile()) {
    if (!path.endsWith(".tmdl")) throw new UsageError(`${input} is not a .tmdl file or a folder`);
    return { root: dirname(path), files: [{ path: basename(path), text: readFileSync(path, "utf8") }] };
  }
  if (existsSync(join(path, "definition")) && statSync(join(path, "definition")).isDirectory()) {
    const files: LintFile[] = [];
    readTmdlFiles(path, join(path, "definition"), files);
    if (files.length) return { root: path, files };
  }
  const models = readdirSync(path, { withFileTypes: true }).filter((e) => e.isDirectory() && e.name.endsWith(".SemanticModel"));
  if (models.length === 1) return resolveModel(join(path, models[0]!.name));
  if (models.length > 1) throw new UsageError(`${input} contains ${models.length} semantic models; point at one of them: ${models.map((m) => m.name).join(", ")}`);
  const direct: LintFile[] = [];
  readTmdlFiles(path, path, direct);
  if (direct.length) return { root: path, files: direct };
  throw new UsageError(`No semantic model found at ${input} (expected a .SemanticModel folder, a PBIP folder, a definition folder, or .tmdl files)`);
}
```

`packages/cli/src/config.ts`:

```ts
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import type { PbiplintConfig } from "@pbiplint/core";
import { UsageError } from "./args.js";

export const CONFIG_FILE = "pbiplint.config.json";

export interface FoundConfig {
  path?: string;
  config: PbiplintConfig;
}

function readConfig(path: string): PbiplintConfig {
  try {
    return JSON.parse(readFileSync(path, "utf8")) as PbiplintConfig;
  } catch (e) {
    throw new UsageError(`Could not read ${path}: ${e instanceof Error ? e.message : String(e)}`);
  }
}

/** `explicit` wins; otherwise walk up from `startDir` to the filesystem root looking for pbiplint.config.json. */
export function findConfig(startDir: string, explicit?: string): FoundConfig {
  if (explicit) {
    const path = resolve(explicit);
    if (!existsSync(path)) throw new UsageError(`${explicit} does not exist`);
    return { path, config: readConfig(path) };
  }
  let dir = resolve(startDir);
  for (;;) {
    const candidate = join(dir, CONFIG_FILE);
    if (existsSync(candidate)) return { path: candidate, config: readConfig(candidate) };
    const parent = dirname(dir);
    if (parent === dir) return { config: {} };
    dir = parent;
  }
}
```

`packages/cli/src/sample.ts`:

```ts
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/** The bundled sample (packages/cli/sample after build) or the repo copy (examples/messy-sales) in development. */
export function sampleDir(): string {
  const here = dirname(fileURLToPath(import.meta.url));
  for (const candidate of [join(here, "..", "sample"), join(here, "..", "..", "sample"), join(here, "..", "..", "..", "examples", "messy-sales")]) {
    if (existsSync(join(candidate, "definition"))) return candidate;
  }
  throw new Error("Bundled sample project not found");
}
```

- [ ] **Step 5: Implement main and the bin entry**

`packages/cli/src/main.ts`:

```ts
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { ConfigError, defaultRules, formatResult, lint, resolveConfig, SEVERITY_LABEL } from "@pbiplint/core";
import { HELP, parseArgs, UsageError } from "./args.js";
import { findConfig } from "./config.js";
import { sampleDir } from "./sample.js";
import { resolveModel } from "./walk.js";

declare const __PBIPLINT_VERSION__: string | undefined;
export const VERSION = typeof __PBIPLINT_VERSION__ === "string" ? __PBIPLINT_VERSION__ : "0.0.0-dev";

export interface Io {
  stdout(text: string): void;
  stderr(text: string): void;
  cwd(): string;
}

function listRules(): string {
  const width = Math.max(...defaultRules.map((r) => r.id.length));
  return defaultRules
    .map((r) => `${r.id.padEnd(width)}  ${(r.status === "needsLiveModel" ? "needs live model" : r.status).padEnd(16)}  ${SEVERITY_LABEL[r.severity].padEnd(7)}  ${r.category.padEnd(18)}  ${r.name}`)
    .join("\n");
}

export async function main(argv: string[], io: Io): Promise<number> {
  try {
    const opts = parseArgs(argv);
    if (opts.command === "help") {
      io.stdout(HELP);
      return 0;
    }
    if (opts.command === "version") {
      io.stdout(`pbiplint ${VERSION}\n`);
      return 0;
    }
    if (opts.command === "rules") {
      io.stdout(listRules() + "\n");
      return 0;
    }
    const target = opts.sample ? sampleDir() : resolve(io.cwd(), opts.path!);
    const model = resolveModel(target);
    const found = findConfig(model.root, opts.config ? resolve(io.cwd(), opts.config) : undefined);
    const config = resolveConfig({ ...found.config, ...(opts.failOn ? { failOn: opts.failOn } : {}) });
    const result = lint(model.files, { config });
    const report = formatResult(opts.format, result, { toolVersion: VERSION });
    if (opts.output) {
      const out = resolve(io.cwd(), opts.output);
      mkdirSync(dirname(out), { recursive: true });
      writeFileSync(out, report);
    } else {
      io.stdout(report);
    }
    for (const e of result.summary.ruleErrors) io.stderr(`rule ${e.id} failed: ${e.message}\n`);
    return result.failed ? 1 : 0;
  } catch (e) {
    if (e instanceof UsageError || e instanceof ConfigError) {
      io.stderr(`pbiplint: ${e.message}\n`);
      if (e instanceof UsageError) io.stderr(`Run pbiplint --help for usage.\n`);
      return 2;
    }
    io.stderr(`pbiplint: unexpected error: ${e instanceof Error ? e.stack ?? e.message : String(e)}\n`);
    return 2;
  }
}
```

Replace `packages/cli/src/bin.ts`:

```ts
import { main } from "./main.js";

main(process.argv.slice(2), {
  stdout: (s) => process.stdout.write(s),
  stderr: (s) => process.stderr.write(s),
  cwd: () => process.cwd(),
}).then((code) => {
  process.exitCode = code;
});
```

`packages/cli/build.mjs`:

```js
#!/usr/bin/env node
// Bundles the CLI (core included) into dist/pbiplint.mjs and copies the sample project next to it.
import { cpSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const here = dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(readFileSync(join(here, "package.json"), "utf8"));

await build({
  entryPoints: [join(here, "src/bin.ts")],
  outfile: join(here, "dist/pbiplint.mjs"),
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node20",
  banner: { js: "#!/usr/bin/env node" },
  alias: { "@pbiplint/core": join(here, "../core/src/index.ts") },
  define: { __PBIPLINT_VERSION__: JSON.stringify(pkg.version) },
  logLevel: "info",
});

rmSync(join(here, "sample"), { recursive: true, force: true });
mkdirSync(join(here, "sample"), { recursive: true });
cpSync(join(here, "../../examples/messy-sales"), join(here, "sample"), { recursive: true });
console.log("copied examples/messy-sales to packages/cli/sample");
```

In `packages/cli/package.json` add `"test:bundle": "node dist/pbiplint.mjs --sample --format json > /dev/null; test $? -eq 1"` under `scripts` so CI exercises the built file.

- [ ] **Step 6: Run tests, build, and smoke-test the bundle**

Run: `npm test -- packages/cli`
Expected: PASS (13 tests). The `rule-zoo` walk test expects 17 files (count them if it differs: database, model, expressions, relationships, 9 tables, 2 roles, 2 perspectives).

Run: `npm run build -w pbiplint && node packages/cli/dist/pbiplint.mjs --sample | head -5 && node packages/cli/dist/pbiplint.mjs --version && chmod +x packages/cli/dist/pbiplint.mjs`
Expected: the sample report header, `pbiplint 0.0.0`, exit code 1 from the first command (shown by `echo $?` if you check it).

Run: `npm run typecheck && npm run lint`
Expected: clean. If `tsc -p packages/cli/tsconfig.json` cannot resolve `@pbiplint/core`, add `"baseUrl": "."` to the CLI tsconfig's `compilerOptions`.

- [ ] **Step 7: Commit**

```bash
git add packages/cli
git commit -m "feat(cli): add the pbiplint command with folder walk, config discovery, formats, and exit codes"
```

---

### Task 17: Browser purity check, CI, and contributor docs

**Files:**
- Create: `packages/core/scripts/check-browser-bundle.mjs`, `.github/workflows/ci.yml`, `CONTRIBUTING.md`
- Modify: `README.md`

**Interfaces:**
- Consumes: everything above.
- Produces: `npm run check:browser` (fails when the core bundle references Node or network APIs; prints bundle size), a CI workflow that runs lint, typecheck, tests, the purity check, and the builds on Node 20 and 22, and docs that tell a contributor how to add a rule and refresh parity expectations.

- [ ] **Step 1: Write the purity check**

`packages/core/scripts/check-browser-bundle.mjs`:

```js
#!/usr/bin/env node
// Bundles the core for the browser and fails if the output references Node or network APIs.
import { gzipSync } from "node:zlib";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const here = dirname(fileURLToPath(import.meta.url));
const result = await build({
  entryPoints: [join(here, "../src/index.ts")],
  bundle: true,
  platform: "browser",
  format: "esm",
  minify: true,
  write: false,
  logLevel: "silent",
});
const code = result.outputFiles[0].text;
const FORBIDDEN = ["node:", "require(", "process.", "fetch(", "XMLHttpRequest", "__dirname", "WebSocket"];
const hits = FORBIDDEN.filter((token) => code.includes(token));
const kb = (n) => (n / 1024).toFixed(1);
console.log(`core browser bundle: ${kb(code.length)} KB minified, ${kb(gzipSync(code).length)} KB gzipped`);
if (hits.length) {
  console.error(`core bundle references forbidden APIs: ${hits.join(", ")}`);
  process.exit(1);
}
console.log("core bundle is browser-pure");
```

Run: `npm run check:browser`
Expected: the size line and `core bundle is browser-pure`. If it reports `process.`, search `packages/core/src` for the offender; nothing in core may touch Node.

- [ ] **Step 2: Write the CI workflow**

`.github/workflows/ci.yml`:

```yaml
name: CI

on:
  push:
    branches: [main]
  pull_request:

jobs:
  test:
    runs-on: ubuntu-latest
    strategy:
      matrix:
        node: [20, 22]
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: ${{ matrix.node }}
          cache: npm
      - run: npm ci
      - run: npm run lint
      - run: npm run typecheck
      - run: npm test
      - run: npm run check:browser
      - run: npm run build
      - run: npm run test:bundle -w pbiplint
```

- [ ] **Step 3: Update the README and add CONTRIBUTING**

Replace the placeholder usage in `README.md` with (keep the existing intro, license, and no-upload statement; add these sections):

````markdown
## Use it

```bash
npx pbiplint path/to/Model.SemanticModel        # or a PBIP folder, or one .tmdl file
npx pbiplint --sample                            # try it on the bundled sample project
npx pbiplint path/to/model --format sarif --output pbiplint.sarif
npx pbiplint rules                               # every rule with status and severity
```

Exit code 1 means findings at or above `--fail-on` (default `error`), so it works as a CI gate.

## Configure it

`pbiplint.config.json` next to your project (or anywhere above it):

```json
{
  "rules": {
    "REMOVE_ROLES_WITH_NO_MEMBERS": "off",
    "DAX_COLUMNS_FULLY_QUALIFIED": "warning"
  },
  "failOn": "warning"
}
```

To ignore a rule on one object, add an annotation in TMDL. Power BI Desktop keeps it:

```
	column 'Product ID'
		dataType: int64
		annotation pbiplint.ignore = HIDE_FOREIGN_KEYS, MARK_PRIMARY_KEYS
```

`annotation pbiplint.ignore = *` ignores every rule on that object.

## What it checks

Every rule from Microsoft's Best Practice Analyzer ruleset, ported literally so the numbers match Tabular Editor. Five rules need VertiPaq statistics and are listed but not run. Each rule has a page under `rules/` with what it checks, why, how to fix it, and known quirks.
````

`CONTRIBUTING.md`:

````markdown
# Contributing to pbiplint

## Setup

```bash
npm install
npm test            # unit tests and the Tabular Editor parity suite
npm run typecheck && npm run lint
npm run check:browser
```

Node 20 or later. No runtime dependencies are allowed in `packages/core` or `packages/cli`.

## Layout

- `packages/core`: parser, object model, indexes, rules, ranking, formatters. Browser-pure: no `node:` imports, no network.
- `packages/cli`: the `pbiplint` command. Folder walk, config discovery, output, exit codes.
- `rules/`: one Markdown page per rule. Edit these freely; they are content, not code.
- `tests/fixtures`, `tests/expectations`, `examples/messy-sales`: parity fixtures and the Tabular Editor results they must match.

## Adding or changing a rule

1. Find the rule in `packages/core/src/rules/microsoft-bpa/bpa-rules.data.ts` (generated from Microsoft's `BPARules.json`; do not edit by hand).
2. Write a failing unit test in the matching `packages/core/test/rules-*.test.ts` using `objectNames(rule, tmdl)`.
3. Port the rule literally with `bpaRule(id, check)` in the matching file under `packages/core/src/rules/microsoft-bpa/`. Keep Microsoft's quirks; document them on the rule page under `## Quirks`.
4. Run `npm test -- parity`. Every ported rule is compared against Tabular Editor's object list on every fixture.
5. If no fixture exercises the rule, add the construct to `tests/fixtures/rule-zoo.SemanticModel` and refresh its expectations (below).

## Refreshing parity expectations

Tabular Editor is a development-time oracle only. Users, the CLI, and CI never need it.

```bash
te bpa run tests/fixtures/rule-zoo.SemanticModel/definition -r /path/to/BPARules.json --no-defaults --no-model-rules --output-format json > /tmp/zoo.json
node scripts/te-expectations.mjs tests/fixtures/rule-zoo.SemanticModel tests/expectations/rule-zoo.json --from /tmp/zoo.json
```

`te` is the Tabular Editor 3 command line (Windows, macOS, Linux). The free Tabular Editor 2 CLI on Windows works too with its own flags. Without either, submit hand-verified expectations and say so in the pull request. Keep the `skipRules` entries and their reasons.

New fixtures must be sanitized: `node scripts/sanitize-fixture.mjs <dir>` rewrites data paths and removes junk files. TMDL carries no data.

## Style

- TypeScript strict, ESM, relative imports end in `.js`.
- Commit messages in the imperative.
- No em dashes anywhere in the repo, including docs and commit messages.
- Product naming avoids Microsoft trademarks; "for Power BI projects" in descriptive text is fine.
````

- [ ] **Step 4: Run the full check locally**

Run: `npm ci && npm run lint && npm run typecheck && npm test && npm run check:browser && npm run build && npm run test:bundle -w pbiplint`
Expected: every step succeeds; `npm test` prints the parity coverage line listing only the five unit-tested rules as having no fixture findings.

- [ ] **Step 5: Commit and push**

```bash
git add packages/core/scripts/check-browser-bundle.mjs .github/workflows/ci.yml CONTRIBUTING.md README.md
git commit -m "chore: add browser purity check, CI workflow, and contributor docs"
git push origin main
```

Then open https://github.com/pbiplint/pbiplint/actions and confirm the workflow is green on both Node versions.

---

## Definition of done for this plan

Checked against spec section 14:

- Parser: zero parse issues across the fixture corpus (parity suite asserts it); spec sample fully captured (parse and build tests); unit tests green.
- Rules: all 71 rules in `BPARules.json` registered (pack test), 66 ported, 5 declared `needsLiveModel`; 60 rules verified against Tabular Editor on at least one fixture, 6 verified by unit tests with the reason recorded on their pages; a page per rule.
- CLI: `npx`-style single-file bundle with text, JSON, SARIF, and Markdown output, config discovery, ignores, exit codes, `--sample`, and `rules`. Publishing to npm is in the next plan together with the site, because the first publish claims the name and should ship with pbiplint.com live.
- Repo: MIT with the Microsoft ruleset NOTICE, README with usage and the no-upload claim, CONTRIBUTING with the add-a-rule and refresh-expectations procedures, CI green.

Not in this plan (next plan): the web app (spec section 9), GitHub Pages deploy and DNS, npm publish of `pbiplint` and `@pbiplint/core`, and the rule pages rendered at pbiplint.com/rules.
