# v3 PARSE_ISSUE Masking Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Pull request 7 of v3 ([#78](https://github.com/pbiplint/pbiplint/issues/78)): inside every text literal of a source line that a `PARSE_ISSUE` finding quotes, TMDL and M alike, the text becomes `…` and the quotes stay, so a credential written on a line that does not parse never reaches an output; a fixture of its own plants one on an M line and one on a TMDL line, and the secret guard holds every output to it.

**Architecture:** One small function, `maskLiterals` in a new `packages/core/src/m/mask.ts`, reads text as M's lexer does (text literals with `""` inside, `#"..."` names, `//` and `/* */` comments) and hides each literal's text. `readM` masks a failing query's whole M before it takes the issue's line, so a literal opened on a line above is hidden too, and before the 120-character cut; it masks the parser's message the same way. `PARSE_ISSUE.check` masks each TMDL issue's line. A new fixture, `tests/fixtures/parse-secrets.SemanticModel`, and a new export of `tests/support/fake-secrets.ts` extend pull request 6's guard tests in core, the CLI, the MCP server, the site, and the browser.

**Tech Stack:** TypeScript, `@microsoft/powerquery-parser` 2.0.0, Vitest, Playwright, esbuild (`check:browser`).

**Spec:** `docs/superpowers/specs/2026-10-12-pbiplint-v3-power-query-layer-design.md`, sections 7, 11.3, and 11.4. Pull request 6's plan, `docs/superpowers/plans/2026-10-13-v3-rules-resolver.md` (Task 4, the guard), is the pattern this plan follows.

## Rulings

Every code block, test, count, and byte figure in this plan was run in a scratch copy of the branch on October 13, 2026: the whole suite passed (4,262 tests), `check:browser` passed at 228.5 KB, and the planted leak failed 15 guard tests. The e2e test was not run in the scratch copy (its build reads the worktree's core); Task 2 runs it. The rulings below are this plan's, under pb-coord's scope of October 13, 2026.

- **What a text literal is.** A double-quoted run read as M's lexer reads it: `""` inside is one quote, a literal may run past a line break, and one left open runs to the end of the text. Each line of a literal's text becomes `…`; the quotes and line breaks stay; an empty literal `""` stays as it is. A `#"..."` name (M's quoted identifier, such as `#"Changed Type"`) is a name, not a literal, and is kept. A `//` or `/* */` comment is read as one, so a quote inside it never pairs with a literal's quote (otherwise `/* 5" */, k = "<value>"` would show the value); a closed `"..."` inside a comment is hidden too. TMDL's single quotes (`'Service Token'`) are names and are kept. The same function serves TMDL lines, which often hold M or DAX, both of which write text as `"..."` with `""` inside.
- **Mask before the cut.** The M is masked first, then the line is cut to 120 characters, so the quote shows the line's code and never part of a literal; a literal the cut would have left open is already `"…"`. A TMDL issue's line has no cut.
- **M is masked as a whole query.** A literal may open on an earlier line of the M (`a = "one` then a continuation line), so masking the quoted line alone would read its quotes inverted and show the text between them. `readM` masks the whole query text, takes the issue's line from it, and puts back the TMDL line's head (the indentation, and `source = ` on an inline value), which holds no literal. Only failing queries are masked: the corpus has one.
- **The parser's message.** Every English template a parse or lex error uses names a token's kind (`identifier`, `keyword <'in'>`), never the text it found, and none holds a double quote (checked in the parser's `localization/templates/template.json`). Only a fault in the parser itself can carry text: an invariant error's JSON details, or an unknown error's inner error. So `readM` passes the message through `maskLiterals` too, which changes no message a parse error writes, at no measurable cost.
- **The PBIR side is out of scope.** `readJson` quotes report JSON lines (`packages/core/src/pbir/json.ts`, `quoted`), and an invalid JSON's reason echoes the engine's message, which quotes the document. They stay as they are: Power BI writes no credential into a report file (a report reads its model by path or by a connection with no secret in it), and a report JSON line is mostly keys, so hiding every string would turn `"displayName": "Sales"` into `"…": "…"` and the quote would no longer say where the file broke. `parse-issue.ts` masks only the model layer's issues; the report layer's map is unchanged.
- **Known limit, said in the spec:** a TMDL issue's line is masked by itself, so a TMDL line that is a continuation of a multi-line literal opened on the line above (an M block that lost its indentation mid-literal) can read its quotes inverted. Text in a comment outside quotes (`// key: <value>`) is not a literal and is not hidden, as spec 7 has said of comments since pull request 6 (m-zoo's comment key is never reported).
- **A fixture of its own.** `tests/fixtures/parse-secrets.SemanticModel`, apart from m-zoo, which must parse cleanly (spec 11.1) and has Tabular Editor captures. Two made-up values in m-zoo's form, `pbiplint-fixture-<kind>-<nnnn>-notreal`, numbered on from m-zoo's six: **FIXTURE_KEY** is kind `key`, number `0007`, on an M line with a bracket too many; **FIXTURE_TOKEN** is kind `token`, number `0008`, on a TMDL measure line indented with spaces. Unit tests build their values with numbers from `0101` up. This plan names values only this way; the executor writes them out only in the fixture and test files.

## Global Constraints

- **Base branch:** `release/0.3.0`, never main. Branch `v3/parse-issue-masking`, already cut from `release/0.3.0` at 5fac3ab (pull request 6 merged). Work in the worktree `~/Projects/pbiplint/pbiplint/.claude/worktrees/v3-spec`, never in home (`~/Projects/pbiplint/pbiplint` itself).
- **Secret hygiene:** never print or write any made-up or real secret value outside the fixture and test files that must hold it: not in `progress.md`, commit messages, the pull request, logs, or a scratch file. Refer to values by name (FIXTURE_KEY, FIXTURE_TOKEN). The corpus diff is piped straight into its summary `grep`, never saved, since the base core's details quote corpus lines unmasked.
- **The secret guard (spec 11.3):** no output may carry any part of a made-up value: not the value, a prefix, a suffix, its length, or a hash of it. `leaks` from `tests/support/fake-secrets.ts` is the test, unchanged.
- **No em dashes anywhere** (code, comments, docs, rule pages, commit messages; a hook blocks them and `rule-pages.test.ts` checks pages for U+2014). Restructure with a comma, colon, parentheses, or two sentences.
- **Long-form dates in prose** ("October 13, 2026"), never `2026-10-13`, except in file names and front matter.
- **Capitalized bullets** in every list this plan writes.
- **Never name or cite any competing Power Query linter or its author**, in code, pages, commits, or the pull request.
- **Fixtures and tests are sanitized:** `example.com` or `*.example` hosts, no real names or servers.
- **Core stays browser-pure:** no Node built-in, no `process.`, no network API in `packages/core/src`.
- **The core budget is 230 KB** (`packages/core/scripts/check-browser-bundle.mjs`). It stands at 228.1 KB; this plan adds 0.4 KB (see "The budget"). If a measurement crosses 228.8 KB, or a projection 230.0 KB, stop, do not commit, and report the breakdown to pb-coord. Nothing here raises the budget or trims other code.
- **The suite stays green at every task.** The one existing test that pins a quoted M line with a literal in it (`packages/core/test/m-read.test.ts`, "records M that does not parse ... cut to 120 characters") changes in Task 1, with the code. Every commit passes `npm test`, `npm run lint`, `npm run typecheck`, and `npm run check:browser`.
- **The corpus diff** (spec 11.4) must show only `PARSE_ISSUE` detail changes: no finding added or removed. Counts only, never a corpus path, line, value, or vendor word.
- **Formatting:** `npx prettier --write` on every changed `.ts`, `.mts`, `.mjs`, and `.json` file outside `tests/fixtures/` and `tests/expectations/` before committing. Then `npm run lint`.
- **Generated data:** after the rule page edit, `npm run build -w @pbiplint/core && node scripts/sync-rule-pages.mjs`, and commit whatever of the three `.data.ts` files it rewrites (expected: none, since only the page's second paragraph changes).
- **Commits:** one per task (Task 3 commits nothing). Each message ends with `Part of #78.`, a blank line, and `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Never write a closing keyword next to an issue number.
- **Subagents** run on Opus 5.5 and share the worktree, so one edits files at a time.
- **Folder inputs in e2e** go through `setFolder` from `packages/web/e2e/folder-input.ts`, never `setInputFiles` on a directory.
- **Command rules** (pb-coord, October 13, 2026). These are hard rules:
  - Scratch space only under `/Users/michaelmckinley/.claude/jobs/cb7c83fd/tmp` (the executing session's `$CLAUDE_JOB_DIR/tmp`), never `/tmp`.
  - For any experiment, make a fresh folder with `mktemp -d /Users/michaelmckinley/.claude/jobs/cb7c83fd/tmp/pr7.XXXX` and work by its printed literal path. Never `rm -rf` or `rm -r` with a glob or a variable path.
  - No `sudo`, no deleting outside the worktree or that job folder, no `git clean`, `git reset --hard`, `git checkout -- .`, `git stash`, or any push (the Finish section's push is pb-coord's).
  - If a command might ask for permission, rewrite it so it cannot. Never wait on a prompt.
- **The plan's workspace** is `.superpowers/sdd/2026-10-13-v3-parse-issue-masking/` (git-ignored; `.superpowers` links into home's copy, so scripts there import the worktree's code by `process.cwd()`). Pull request 6's `bytes.mjs` and the reader plan's `corpus-diff.mts` are reused from their folders.
- **The corpus** (`~/Projects/pbiplint/assets/pbip-lint-spike/research-104`) is not pbiplint's: the pull request carries counts only.

## The budget

Measured in the scratch run with `check:browser` and pull request 6's `bytes.mjs` (KB is 1,024 bytes):

| After | Core's own code | Added | Where the bytes go |
| --- | --- | --- | --- |
| The base (5fac3ab) | 228.1 KB (233,553 bytes) | | |
| Task 1 | 228.5 KB (233,966 bytes) | 413 bytes | `m/mask.ts` 233; `m/read.ts` 147 (2,010 to 2,157); `rules/parse-issue.ts` 33 (648 to 681) |
| Task 2 | 228.5 KB | 0 | Tests and a fixture only |

That leaves 1.5 KB of the 230 KB. The breakdown, if a stop needs one: `node .superpowers/sdd/2026-10-13-v3-rules-resolver/bytes.mjs "mask|m/read|parse-issue"` in the worktree, against the figures above.

## Review Focus

- **A literal opened on a line above.** An M line that continues a multi-line literal (`a = "one` on the line before) must hide the text before its closing quote, not the code after it. Task 1 pins it in `m-read.test.ts`.
- **A quote inside a comment.** `/* 5" */, k = "<value>"` must hide the value; a lexer that ignored comments would pair the comment's quote with the literal's and show it. Task 1 pins it in `m-mask.test.ts`.
- **A long line with a literal near the cut.** A line past 120 characters whose literal starts before the cut must read `"…"` whole, and the quote must show the code after it. Task 1 pins it.
- **Step names stay readable.** `#"Changed Type"` must stay as written, so the quote still says which step broke. Task 1 pins it.
- **Doubled and empty quotes.** `"say ""<value>"""` must be one literal, hidden; `""` must stay `""`. Task 1 pins both.

## File Structure

| File | Task | Responsibility |
| --- | --- | --- |
| `packages/core/src/m/mask.ts` (new) | 1 | `maskLiterals` |
| `packages/core/src/m/read.ts` | 1 | A failing query's line and message, masked, then cut |
| `packages/core/src/rules/parse-issue.ts` | 1 | Each TMDL issue's line, masked |
| `packages/core/test/m-mask.test.ts` (new) | 1 | `maskLiterals`'s cases |
| `packages/core/test/m-read.test.ts` | 1 | The cut test's long line loses its literal; a masking test |
| `rules/parse-issue.md` | 1 | The quoted line hides text literals |
| The v3 spec, sections 7 and 11.3 | 1, 2 | Dated amendments |
| `tests/fixtures/parse-secrets.SemanticModel/` (new) | 2 | FIXTURE_KEY on an M line, FIXTURE_TOKEN on a TMDL line, neither parsable |
| `tests/support/fake-secrets.ts` | 2 | `PARSE_SECRETS_FIXTURE` |
| `packages/core/test/secret-masking.test.ts`, `packages/web/test/secret-masking.test.ts`, `packages/cli/test/secret-masking.test.ts`, `packages/cli/test/mcp.test.ts`, `packages/web/e2e/home.spec.ts` | 2 | The guard over the new fixture |
| `.superpowers/sdd/2026-10-13-v3-parse-issue-masking/detail-diff.mts` (not committed) | 3 | Findings compared without the detail, details counted |

---

## Before Task 1

```bash
cd ~/Projects/pbiplint/pbiplint/.claude/worktrees/v3-spec
git fetch origin
git switch v3/parse-issue-masking
git status --short          # expected: only this plan, untracked
pb-worktree-setup
mkdir -p .superpowers/sdd/2026-10-13-v3-parse-issue-masking
git add docs/superpowers/plans/2026-10-13-v3-parse-issue-masking.md
git commit -m "docs: the v3 PARSE_ISSUE masking plan

Part of #78.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
npm run check:browser
```

Expected: `core's own code 228.1 KB`. Write the line into `.superpowers/sdd/2026-10-13-v3-parse-issue-masking/progress.md` as **the base measurement**. If it differs, stop and report.

---

### Task 1: `maskLiterals`, the quoted lines, the page, and spec 7

**Files:**
- Create: `packages/core/src/m/mask.ts`, `packages/core/test/m-mask.test.ts`
- Modify: `packages/core/src/m/read.ts:128-138`, `packages/core/src/rules/parse-issue.ts:1,32`, `packages/core/test/m-read.test.ts:120-146`
- Modify: `rules/parse-issue.md` ("What it checks", second paragraph), the spec (section 7)

**Interfaces:**
- Produces: `maskLiterals(text: string): string` in `packages/core/src/m/mask.ts`. `MParseIssue.text` and `.reason` arrive masked; `PARSE_ISSUE` masks `model.files[].issues[].text` itself. `ParseIssue.text` from the TMDL parser and `readJson` is unchanged.

- [ ] **Step 1: Write the failing tests**

Create `packages/core/test/m-mask.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { maskLiterals } from "../src/m/mask.js";

/** A made-up value in the fixtures' form (v3 spec, section 11.3). */
const fake = (kind: string, n: string): string => `pbiplint-fixture-${kind}-${n}-notreal`;

describe("maskLiterals (v3 spec, section 7)", () => {
  it.each([
    ["a literal", `a = "${fake("key", "0101")}", b`, 'a = "…", b'],
    ["an empty literal, kept", 'a = "", b = 1', 'a = "", b = 1'],
    ["doubled quotes inside a literal", `a = "say ""${fake("key", "0102")}""", b`, 'a = "…", b'],
    [
      "a quoted name, kept",
      '#"Changed Type" = Table.AddColumn(t, "Key", each "x")',
      '#"Changed Type" = Table.AddColumn(t, "…", each "…")',
    ],
    [
      "a literal left open",
      `Source = Web.Contents("https://api.example.com/v1?key=${fake("key", "0103")}`,
      'Source = Web.Contents("…',
    ],
    ["a quote in a block comment", `x = 1 /* 5" */, k = "${fake("key", "0104")}"`, 'x = 1 /* 5" */, k = "…"'],
    ["quoted text in a line comment", `// old key "${fake("key", "0105")}"`, '// old key "…"'],
    ["a literal over two lines", `a = "${fake("key", "0106").replace("key-", "key-\n")}", b = "x"`, 'a = "…\n…", b = "…"'],
    ["text with no quote, unchanged", "Expected to find a comma <','>", "Expected to find a comma <','>"],
    ["a TMDL line", `    measure 'Service Token' = "${fake("token", "0107")}"`, "    measure 'Service Token' = \"…\""],
  ])("hides %s", (_name, text, masked) => {
    expect(maskLiterals(text)).toBe(masked);
  });
});
```

In `packages/core/test/m-read.test.ts`, in the test "records M that does not parse as an issue at its TMDL line and column, cut to 120 characters", change the long line so it holds no literal (same length, so the column stays 215):

```ts
    const long = `${"x".repeat(202)} 2`;
```

and add after that test:

```ts
  it("hides the text literals of the line it quotes, before the cut, and one opened on a line above", async () => {
    const key = ["pbiplint", "fixture", "key", "0110", "notreal"].join("-");
    const m = await read([
      file(
        `table Sales\n\tpartition Sales = m\n\t\tsource =\n\t\t\t\tlet\n\t\t\t\t    a = "${"x".repeat(100)}", k = "${key}" 2\n\t\t\t\tin\n\t\t\t\t    a\n\ntable Open\n\tpartition Open = m\n\t\tsource =\n\t\t\t\tlet\n\t\t\t\t    a = "one\n\t\t\t\t${key}", b = 1 2\n\t\t\t\tin\n\t\t\t\t    a\n`,
      ),
    ]);
    // Masked before the cut: the first line is 150 characters as written, and reads whole once
    // masked. The second continues a literal opened on the line above.
    expect(m.issues.map((i) => i.text)).toEqual(['a = "…", k = "…" 2', '…", b = 1 2']);
  });
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run packages/core/test/m-mask.test.ts packages/core/test/m-read.test.ts`
Expected: FAIL: `m-mask.test.ts` cannot resolve `../src/m/mask.js`; the new `m-read` test fails on the unmasked lines.

- [ ] **Step 3: Write the implementation**

Create `packages/core/src/m/mask.ts`:

```ts
/**
 * A text literal (`""` is a quote inside one, and one may run past a line, or to the end unclosed),
 * a `#"..."` name, a comment, or a run of anything else, as M's lexer reads them.
 */
const TOKEN = /(#?)"((?:[^"]|"")*)("?)|\/\/[^\n]*|\/\*[\s\S]*?(?:\*\/|$)|[^"#/]+|[\s\S]/g;

/**
 * Text with every text literal's text hidden, for a line PARSE_ISSUE quotes (v3 spec, section 7,
 * amended October 13, 2026): inside each `"..."` each line of text becomes `…`, and the quotes and
 * line breaks stay. A literal left open runs to the end. A `#"..."` name is kept. A comment is read
 * as one, so a quote in it never pairs with a literal's, and quoted text inside it is hidden too.
 */
export function maskLiterals(text: string): string {
  return text.replace(TOKEN, (token, name: string, body?: string, close?: string) =>
    body !== undefined
      ? name
        ? token
        : `"${body.replace(/[^\n]+/g, "…")}${close}`
      : token[0] === "/"
        ? token.replace(/"[^"\n]*"/g, '"…"')
        : token,
  );
}
```

In `packages/core/src/m/read.ts`, add the import before the `./parse.js` one:

```ts
import { maskLiterals } from "./mask.js";
```

and replace the `issues.push` block after `const at = locate(...)`:

```ts
    const at = locate(q, parsed.position ?? { lineNumber: 0, lineCodeUnit: 0 });
    // The TMDL line with its M's text literals hidden (v3 spec, section 7): the M is masked whole,
    // since a literal may open on an earlier line, and its line put back after the TMDL line's head.
    const n = at.line - q.valueLine;
    const line = lineAt(at.file, at.line);
    const head = line.trimEnd().length - (mLines.get(q)!.lines[n] ?? "").trimEnd().length;
    issues.push({
      file: at.file,
      line: at.line,
      column: at.column!,
      // Masked, then cut as a JSON issue's line is (readJson): a generated partition can hold
      // lines of megabytes, and a literal the cut leaves open is already hidden.
      text: (line.slice(0, Math.max(0, head)) + (maskLiterals(q.text).split("\n")[n] ?? ""))
        .trim()
        .slice(0, 120),
      reason: `M could not be parsed: ${maskLiterals(parsed.message)}`,
    });
```

(`locate` has already filled `mLines` for `q`.) In `packages/core/src/rules/parse-issue.ts`, add `import { maskLiterals } from "../m/mask.js";` as the first import, and replace the model line of the returned list:

```ts
      // A TMDL line with its text literals hidden (v3 spec, section 7); M's issues come masked.
      ...(model?.files.flatMap((f) => f.issues) ?? [])
        .map((i) => ({ ...i, text: maskLiterals(i.text) }))
        .map(issue("model")),
```

The report layer's line stays `...(report?.issues ?? []).map(issue("report")),` (the PBIR ruling).

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run packages/core/test/m-mask.test.ts packages/core/test/m-read.test.ts`
Expected: PASS (20 tests in the scratch run).

- [ ] **Step 5: The page and the spec**

In `rules/parse-issue.md`, "What it checks", replace the second paragraph with:

```markdown
Each finding names the file and the line and says what was wrong with it, as `space indentation (TMDL requires tabs): column Amount`, `"tabel" is not a type TMDL declares at the root of a file: tabel Sales`, or `M could not be parsed: Finished parsing but more tokens remain: source = "…" 2`. In a TMDL or M line the finding quotes, the text of every text literal shows as `…` between its quotes, so a key or password written on a line that does not parse never reaches a report; names, such as `'Sales'` or a step's `#"Changed Type"`, show as written. A report JSON line is quoted as written.
```

In the spec, section 7, add after the paragraph "`rules/parse-issue.md` says M is parsed too, ...":

```markdown
Amended October 13, 2026 (the coordinator's decision, pull request 7): the quoted line hides its text literals. Inside every `"..."` of a line `PARSE_ISSUE` quotes, TMDL or M, the text becomes `…` and the quotes stay (`packages/core/src/m/mask.ts`); a `#"..."` name and a TMDL `'...'` name are kept, and a comment is read as one, so its quotes never pair with a literal's. M is masked as a whole query before its line is taken, so a literal opened on a line above is hidden too, and before the 120-character cut, so the cut never shows part of a literal. The parser's message is masked the same way: its English templates name a token's kind, never its text, so only a fault in the parser itself could carry text. A TMDL line is masked by itself, so one that continues a literal from the line above can read its quotes inverted. A report JSON line is quoted as written: Power BI writes no credential into a report file, and a JSON line is mostly keys, which masking would hide. This replaces "the quoted line may show it" in the bullet above. Corpus: 51 `PARSE_ISSUE` details change in 7 models, and no finding is added or removed.
```

Then:

```bash
npm run build -w @pbiplint/core && node scripts/sync-rule-pages.mjs
git status --short
```

Expected: no `.data.ts` file changes (the summary is the first paragraph). If one does, commit it with this task.

- [ ] **Step 6: Run what this task touches, measure, and commit**

```bash
npx vitest run packages/core/test packages/cli/test packages/web/test
npm run typecheck
npm run check:browser
npx prettier --write packages/core/src/m/mask.ts packages/core/src/m/read.ts packages/core/src/rules/parse-issue.ts packages/core/test/m-mask.test.ts packages/core/test/m-read.test.ts
npm run lint
```

Expected: all pass; `check:browser` prints `core's own code 228.5 KB`. Over 228.8 KB, stop (Global Constraints). Write the line into `progress.md` under Task 1, then:

```bash
git add packages/core/src/m/mask.ts packages/core/src/m/read.ts packages/core/src/rules/parse-issue.ts packages/core/test/m-mask.test.ts packages/core/test/m-read.test.ts rules/parse-issue.md docs/superpowers/specs/2026-10-12-pbiplint-v3-power-query-layer-design.md
git commit -m "fix: PARSE_ISSUE hides the text literals of the line it quotes

Inside every text literal of a TMDL or M line the finding quotes, the
text becomes an ellipsis and the quotes stay, so a credential on a line
that does not parse never reaches an output. M is masked as a whole
query, before the 120-character cut; the parser's message is masked too.
Report JSON lines are quoted as written (spec 7, amended).

Part of #78.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: The parse-secrets fixture and the guard over every output

**Files:**
- Create: `tests/fixtures/parse-secrets.SemanticModel/definition/database.tmdl`, `model.tmdl`, `tables/Orders.tmdl`, `tables/Settings.tmdl`
- Modify: `tests/support/fake-secrets.ts`, `packages/core/test/secret-masking.test.ts`, `packages/web/test/secret-masking.test.ts`, `packages/cli/test/secret-masking.test.ts`, `packages/cli/test/mcp.test.ts`, `packages/web/e2e/home.spec.ts`
- Modify: the spec (section 11.3)

**Interfaces:**
- Consumes: Task 1's masking; `fakeSecrets(dir)`, `leaks(text, secrets)`; the guard files of pull request 6.
- Produces: `PARSE_SECRETS_FIXTURE: string` in `tests/support/fake-secrets.ts`.

- [ ] **Step 1: The fixture**

Write the four files. Where a block says `<FIXTURE_KEY>` or `<FIXTURE_TOKEN>`, write the value the Rulings define (m-zoo's form; kind `key` number `0007`, and kind `token` number `0008`). Each file ends with a newline.

`definition/database.tmdl`:

```tmdl
database
	compatibilityLevel: 1702
```

`definition/model.tmdl`:

```tmdl
model Model
	culture: en-US
	defaultPowerBIDataSourceVersion: powerBI_V3
	sourceQueryCulture: en-US

ref table Orders
ref table Settings
```

`definition/tables/Orders.tmdl` (the `source` lines are indented with four tabs and five tabs, as m-zoo's are):

```tmdl
/// M that does not parse on the line that holds a made-up key: a bracket too many.
table Orders
	lineageTag: 6c0f5a1e-0007-4000-8000-000000000001

	column Content
		dataType: binary
		summarizeBy: none
		sourceColumn: Content

	partition Orders = m
		mode: import
		source =
				let
					Source = Web.Contents("https://api.example.com/v1/orders", [Headers = [#"x-api-key" = "<FIXTURE_KEY>"]])),
					Contents = #table(type table [Content = binary], {{Source}})
				in
					Contents
```

`definition/tables/Settings.tmdl` (the measure line is indented with four spaces, the rest with tabs):

```tmdl
/// A TMDL line that does not parse and holds a made-up token: a measure indented with spaces.
table Settings
	lineageTag: 6c0f5a1e-0007-4000-8000-000000000002

    measure 'Service Token' = "<FIXTURE_TOKEN>"

	partition Settings = m
		mode: import
		source = #table(type table [Name = text], {{"Token"}})
```

- [ ] **Step 2: The helper and the guard tests**

In `tests/support/fake-secrets.ts`, add before the `FAKE` constant's comment:

```ts
/**
 * parse-secrets, the fixture that plants a made-up key on an M line and a made-up token on a TMDL
 * line that do not parse, so PARSE_ISSUE quotes both lines (v3 spec, sections 7 and 11.3).
 */
export const PARSE_SECRETS_FIXTURE = join(
  dirname(fileURLToPath(import.meta.url)),
  "../fixtures/parse-secrets.SemanticModel",
);
```

In each of the four test files below, the helper's import becomes:

```ts
import {
  fakeSecrets,
  leaks,
  PARSE_SECRETS_FIXTURE,
  SECRETS_FIXTURE,
} from "../../../tests/support/fake-secrets.js";
```

`packages/core/test/secret-masking.test.ts`, append:

```ts
describe("the secret guard, on lines PARSE_ISSUE quotes (v3 spec, sections 7 and 11.3)", async () => {
  const planted = fakeSecrets(PARSE_SECRETS_FIXTURE);
  const parsed = await lint(readModelFiles(PARSE_SECRETS_FIXTURE));
  it("reads the fixture's key and token, and quotes both lines with their literals hidden", () => {
    expect(planted.map((v) => v.split("-")[2])).toEqual(["key", "token"]);
    expect(
      parsed.findings.filter((f) => f.ruleId === "PARSE_ISSUE").map((f) => f.detail),
    ).toEqual([
      "space indentation (TMDL requires tabs): measure 'Service Token' = \"…\"",
      expect.stringMatching(
        /^M could not be parsed: .*: Source = Web\.Contents\("…", \[Headers = \[#"x-api-key" = "…"\]\]\)\),$/,
      ),
    ]);
  });
  it.each([
    ["text", formatText],
    ["JSON", formatJson],
    ["Markdown", formatMarkdown],
    ["SARIF", formatSarif],
  ] as const)("keeps every part of both values out of the %s format", (_name, format) => {
    expect(leaks(format(parsed, { toolVersion: "0.0.0" }), planted)).toEqual([]);
  });
});
```

`packages/web/test/secret-masking.test.ts`: replace the block from the comment `/** m-zoo's files as the page reads a dropped folder ... */` through `const result = await lint(files);` with a function, so both fixtures are read the same way:

```ts
/** A fixture's files as the page reads a dropped folder: paths relative to the model folder. */
function folder(root: string): { path: string; text: string }[] {
  const files: { path: string; text: string }[] = [];
  const walk = (d: string): void => {
    for (const e of readdirSync(d, { withFileTypes: true }))
      if (e.isDirectory()) walk(join(d, e.name));
      else
        files.push({
          path: relative(root, join(d, e.name)).split("\\").join("/"),
          text: readFileSync(join(d, e.name), "utf8"),
        });
  };
  walk(root);
  return files;
}
const result = await lint(folder(SECRETS_FIXTURE));
```

and append:

```ts
describe("the secret guard, on lines PARSE_ISSUE quotes, on the site (v3 spec, sections 7 and 11.3)", async () => {
  const planted = fakeSecrets(PARSE_SECRETS_FIXTURE);
  const parsed = await lint(folder(PARSE_SECRETS_FIXTURE));
  it("keeps every part of both values out of the rendered results", () => {
    expect(planted).toHaveLength(2);
    document.body.innerHTML = '<section id="results"></section>';
    const container = document.getElementById("results")!;
    renderResults(container, parsed, { source: "parse-secrets.SemanticModel" });
    expect(container.textContent).toContain("PARSE_ISSUE");
    expect(leaks(container.innerHTML, planted)).toEqual([]);
  });
  it.each([
    ["the Markdown download", exportMarkdown],
    ["the JSON download", exportJson],
    ["the copy for an AI assistant", exportForAssistant],
  ] as const)("keeps every part of both values out of %s", (_name, exported) => {
    const text = exported(parsed).text;
    expect(text).toContain("PARSE_ISSUE");
    expect(leaks(text, planted)).toEqual([]);
  });
});
```

`packages/cli/test/secret-masking.test.ts`, append:

```ts
describe("the secret guard, on lines PARSE_ISSUE quotes, in the CLI (v3 spec, sections 7 and 11.3)", () => {
  const planted = fakeSecrets(PARSE_SECRETS_FIXTURE);
  it.each(["text", "json", "markdown", "sarif"])(
    "keeps every part of both values out of --format %s and stderr",
    async (format) => {
      expect(planted).toHaveLength(2);
      const r = await run([PARSE_SECRETS_FIXTURE, "--format", format]);
      expect(r.code).toBe(1);
      expect(r.out).toContain("PARSE_ISSUE");
      expect(leaks(r.out + r.err, planted)).toEqual([]);
    },
  );
  it("keeps every part of both values out of the quiet text and a report written with --output", async () => {
    const quiet = await run([PARSE_SECRETS_FIXTURE, "--quiet"]);
    expect(quiet.out).toContain("PARSE_ISSUE");
    const file = join(tempDir("parse-secret-output"), "report.sarif");
    const r = await run([PARSE_SECRETS_FIXTURE, "--format", "sarif", "--output", file]);
    const written = readFileSync(file, "utf8");
    expect(written).toContain("PARSE_ISSUE");
    expect(leaks(quiet.out + quiet.err + written + r.out + r.err, planted)).toEqual([]);
  });
});
```

`packages/cli/test/mcp.test.ts`, add before the test "returns the CLI's message as an error for a path it cannot read":

```ts
  it("keeps every part of the made-up values on lines PARSE_ISSUE quotes out of the lint tool's answers (v3 spec, sections 7 and 11.3)", async () => {
    const planted = fakeSecrets(PARSE_SECRETS_FIXTURE);
    expect(planted).toHaveLength(2);
    const client = await connect();
    const json = await client.call("lint", { path: PARSE_SECRETS_FIXTURE });
    const quiet = await client.call("lint", { path: PARSE_SECRETS_FIXTURE, quiet: true });
    expect(json.text).toContain("PARSE_ISSUE");
    expect(quiet.text).toContain("PARSE_ISSUE");
    expect(leaks(json.text + quiet.text + client.lines.join("\n"), planted)).toEqual([]);
  });
```

`packages/web/e2e/home.spec.ts`, add after the test "shows, downloads, and copies m-zoo's results with no part of a made-up credential":

```ts
test("shows, downloads, and copies parse-secrets's results with no part of a made-up value on a line PARSE_ISSUE quotes (v3 spec, sections 7 and 11.3)", async ({
  page,
  context,
  browserName,
}) => {
  if (browserName === "chromium")
    await context.grantPermissions(["clipboard-write", "clipboard-read"]);
  const planted = fakeSecrets(PARSE_SECRETS_FIXTURE);
  expect(planted).toHaveLength(2);
  await setFolder(page.locator("#folder-input"), PARSE_SECRETS_FIXTURE);
  const results = page.locator("#results");
  await expect(results.locator("h2")).toContainText("parse-secrets.SemanticModel");
  await expect(results).toContainText("PARSE_ISSUE");
  expect(leaks(await page.content(), planted)).toEqual([]);
  for (const name of ["Download Markdown", "Download JSON"]) {
    const [download] = await Promise.all([
      page.waitForEvent("download"),
      page.getByRole("button", { name }).click(),
    ]);
    const text = readFileSync((await download.path())!, "utf8");
    expect(text).toContain("PARSE_ISSUE");
    expect(leaks(text, planted)).toEqual([]);
  }
  const copy = page.locator(".export button").nth(1);
  await expect(copy).toHaveText("Copy for an AI assistant");
  await copy.click();
  await expect(copy).toHaveText("Copied");
  if (browserName === "chromium") {
    const text = await page.evaluate(() => navigator.clipboard.readText());
    expect(text).toContain("PARSE_ISSUE");
    expect(leaks(text, planted)).toEqual([]);
  }
});
```

- [ ] **Step 3: Run them, and prove they bite**

```bash
npx vitest run packages/core/test/secret-masking.test.ts packages/web/test/secret-masking.test.ts packages/cli/test/secret-masking.test.ts packages/cli/test/mcp.test.ts
```

Expected: PASS (46 tests in the scratch run). Then plant a leak: in `packages/core/src/m/mask.ts`, add `if (text.length > 0) return text;` as the first line of `maskLiterals`'s body, and rerun the command. Expected: 15 failures, all in the new tests (core 5, site 4, CLI 5, MCP 1); none of pull request 6's m-zoo tests fails. Do not copy any failure message into `progress.md` (it quotes the value); write the count only. Undo the line with the Edit tool, rerun, confirm PASS, and confirm `git diff packages/core/src` is empty.

- [ ] **Step 4: The browser**

```bash
npm run build -w @pbiplint/web
npx playwright test -c packages/web/playwright.config.ts packages/web/e2e/home.spec.ts -g "made-up"
```

Expected: 6 passed (both guard tests in Chromium, Firefox, and WebKit).

- [ ] **Step 5: The spec**

In the spec, section 11.3, add after pull request 6's amendment:

```markdown
Amended October 13, 2026 (the coordinator's decision, pull request 7): a second fixture, `tests/fixtures/parse-secrets.SemanticModel`, plants a made-up key on an M line and a made-up token on a TMDL line, neither of which parses, so `PARSE_ISSUE` quotes both (section 7). It sits apart from m-zoo, which must parse cleanly and has Tabular Editor captures. `PARSE_SECRETS_FIXTURE` in the helper names it, and every check above (core's four formats, the site, the CLI, the MCP lint tool, and the browser) holds its outputs to its two values.
```

- [ ] **Step 6: Run what this task touches, and commit**

```bash
npx vitest run packages/core/test packages/web/test packages/cli/test
npm run typecheck
npm run check:browser
npx prettier --write tests/support/fake-secrets.ts packages/core/test/secret-masking.test.ts packages/web/test/secret-masking.test.ts packages/cli/test/secret-masking.test.ts packages/cli/test/mcp.test.ts packages/web/e2e/home.spec.ts
npm run lint
git add tests/fixtures/parse-secrets.SemanticModel tests/support/fake-secrets.ts packages/core/test/secret-masking.test.ts packages/web/test/secret-masking.test.ts packages/cli/test/secret-masking.test.ts packages/cli/test/mcp.test.ts packages/web/e2e/home.spec.ts docs/superpowers/specs/2026-10-12-pbiplint-v3-power-query-layer-design.md
git commit -m "test: the secret guard holds every output to values on unparsable lines

A new fixture plants a made-up key on an M line and a made-up token on
a TMDL line, neither parsable, and core, the site, the CLI, the MCP
lint tool, and the browser keep every part of both out of PARSE_ISSUE's
quoted lines (spec 11.3, amended).

Part of #78.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

`check:browser` is unchanged (228.5 KB); write its line into `progress.md` under Task 2.

---

### Task 3: The corpus diff and the whole branch

**Files:**
- Reuse (not committed): `.superpowers/sdd/2026-10-13-v3-reader/corpus-diff.mts`
- Create (not committed): `.superpowers/sdd/2026-10-13-v3-parse-issue-masking/detail-diff.mts`

- [ ] **Step 1: Unpack the base core**

```bash
mktemp -d /Users/michaelmckinley/.claude/jobs/cb7c83fd/tmp/pr7.XXXX
```

It prints a path; call it `<base>` and type it out literally in each command. Then:

```bash
git archive origin/release/0.3.0 packages/core | tar -x -C <base>
ln -s "$PWD/node_modules" <base>/node_modules
ln -s "$PWD/packages/core/node_modules" <base>/packages/core/node_modules
```

- [ ] **Step 2: Run the corpus diff, summary lines only**

Its examples quote the base core's unmasked details, so its output goes straight into `grep` and is never saved:

```bash
npx tsx .superpowers/sdd/2026-10-13-v3-reader/corpus-diff.mts <base> ~/Projects/pbiplint/assets/pbip-lint-spike/research-104 2>&1 | grep -E "models linted|^[+-][0-9]|ERROR|no finding"
```

Expected, as the scratch run printed it:

```
1321 models linted
+51 PARSE_ISSUE
-51 PARSE_ISSUE
```

Any other rule, unequal counts, or an `ERROR` stops the task: report the summary lines only.

- [ ] **Step 3: Confirm that only details changed**

Create `.superpowers/sdd/2026-10-13-v3-parse-issue-masking/detail-diff.mts`:

```ts
// PARSE_ISSUE masking on the corpus (v3 spec, section 11.4), counts only: lints every corpus model
// with the base core and with this branch's, compares findings by rule, object, file, line, and
// column without the detail (they must match one for one), then counts the details that changed,
// by rule. Prints no detail, path, or value.
// Usage, from the repository root: npx tsx <this file> <base core dir> <corpus dir>
import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";

type F = {
  ruleId: string;
  objectType: string;
  objectName: string;
  location?: { file: string; line: number; column?: number };
  detail?: string;
};
const [baseDir, corpus] = process.argv.slice(2);
const base = await import(join(baseDir!, "packages/core/src/index.ts"));
const head = await import(join(process.cwd(), "packages/core/src/index.ts"));
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
const key = (f: F) =>
  JSON.stringify([f.ruleId, f.objectType, f.objectName, f.location?.file ?? "", f.location?.line ?? 0, f.location?.column ?? 0]);
/** Each key's details, sorted, so findings that share a key compare as a multiset. */
const byKey = (fs: F[]) => {
  const m = new Map<string, string[]>();
  for (const f of fs) (m.get(key(f)) ?? m.set(key(f), []).get(key(f))!).push(f.detail ?? "");
  for (const list of m.values()) list.sort();
  return m;
};
let models = 0, errors = 0, keyMismatch = 0, parse = 0, parseModels = 0, changedModels = 0;
const changed = new Map<string, number>();
for (const root of roots) {
  const files = tmdls(root).map((f) => ({ path: relative(root, f).split("\\").join("/"), text: readFileSync(f, "utf8") }));
  let before, after;
  try {
    before = await base.lint(files, { config: { failOn: "none" } });
    after = await head.lint(files, { config: { failOn: "none" } });
  } catch {
    errors++;
    continue;
  }
  models++;
  const p = after.findings.filter((f: F) => f.ruleId === "PARSE_ISSUE").length;
  parse += p;
  if (p) parseModels++;
  const a = byKey(before.findings);
  const b = byKey(after.findings);
  const same =
    a.size === b.size && [...a].every(([k, list]) => b.get(k)?.length === list.length);
  if (!same) {
    keyMismatch++;
    continue;
  }
  let any = false;
  for (const [k, da] of a) {
    const db = b.get(k)!;
    for (let i = 0; i < da.length; i++)
      if (da[i] !== db[i]) {
        const rule = JSON.parse(k)[0];
        changed.set(rule, (changed.get(rule) ?? 0) + 1);
        any = true;
      }
  }
  if (any) changedModels++;
}
console.log(`${models} models linted, ${errors} errors`);
console.log(`PARSE_ISSUE on the branch: ${parse} findings in ${parseModels} models`);
console.log(`models whose findings differ apart from the detail: ${keyMismatch}`);
console.log(`details changed: ${[...changed].map(([r, n]) => `${r} ${n}`).join(", ") || "none"}, in ${changedModels} models`);
```

Run it:

```bash
npx tsx .superpowers/sdd/2026-10-13-v3-parse-issue-masking/detail-diff.mts <base> ~/Projects/pbiplint/assets/pbip-lint-spike/research-104
```

Expected, in about a minute and a quarter, as the scratch run printed it:

```
1321 models linted, 0 errors
PARSE_ISSUE on the branch: 436 findings in 23 models
models whose findings differ apart from the detail: 0
details changed: PARSE_ISSUE 51, in 7 models
```

A nonzero mismatch, an error, or a rule other than `PARSE_ISSUE` stops the task. Write the four lines into `progress.md`.

- [ ] **Step 4: Run the whole suite and every check**

```bash
npm run lint
npm run typecheck
npm test
npm run check:browser
npm run build
npm run check:network
npm run check:pack
npm run test:bundle -w pbiplint
npm run test:e2e
git grep -n $'\u2014' -- $(git diff --name-only origin/release/0.3.0...HEAD) || echo "no em dashes"
git diff origin/release/0.3.0...HEAD -- . ':!tests/fixtures' ':!packages/*/test' ':!packages/web/e2e' | grep -cE "pbiplint-fixture-[a-z]+-[0-9]{4}-notreal"
```

(If a script name differs in `package.json`, use the name CI's `test` job runs, from `.github/workflows/ci.yml`.) Expected: all pass; `check:browser` at 228.5 KB; the sample's 280 findings unchanged in `test:bundle` (it parses cleanly); the em dash check prints `no em dashes`, and the last line prints `0` (no whole made-up value in the branch's changes outside fixtures and tests). Write the result into `progress.md`. Nothing is committed in this task.

---

### Finish

One Opus review of the whole branch (`git diff origin/release/0.3.0...HEAD`) with this plan and spec sections 7, 11.3, and 11.4. Then pb-coord pushes `v3/parse-issue-masking` and opens a pull request into `release/0.3.0` titled `fix: PARSE_ISSUE hides text literals in the line it quotes (v3 PR 7)`. Its body lists:

- What changed: `maskLiterals`; the M line masked as a whole query and before the cut, and the parser's message; TMDL lines masked in `PARSE_ISSUE`; report JSON lines unchanged, and why; the new fixture and the guard tests over it; the page and the two spec amendments.
- For the release notes: `PARSE_ISSUE` details show `"…"` where a quoted TMDL or M line held text; no finding is added or removed, so no count moves.
- The budget: 228.1 KB to 228.5 KB, under 230 KB, with the byte breakdown.
- The corpus diff: 1,321 models; 51 `PARSE_ISSUE` details changed in 7 models; no finding added or removed. Counts only.

The body ends with:

```
🤖 Generated with [Claude Code](https://claude.com/claude-code)
```

CI and e2e must be green with no retries, and then pb-coord merges.

Execution: subagent-driven, one Opus 5.5 subagent per task with a fresh reviewer after each (pb-coord, October 13, 2026).
Task order: 1, 2, 3.
