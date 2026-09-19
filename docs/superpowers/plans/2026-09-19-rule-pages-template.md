# Rule Pages Template Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bring every rule page up to the complete template (executable example, generated ignore mechanics, checked related-rule links, attribution apart from further reading), with the tooling that keeps pages honest, landed as one tooling pull request and then one pull request per category.

**Architecture:** The pages under `rules/` stay the single source; three consumers read them: the site build (`packages/web/src/build/pages.ts`, plain `marked` with renderer overrides), the sync script (`scripts/sync-rule-pages.mjs`, which copies prose into two generated data files for the CLI and core), and the rule-pages test (`packages/core/test/rule-pages.test.ts`, which now also lints each page's example through the engine). A `LEGACY_PAGES` set in the test phases the migration: pages in it meet today's checks, pages out of it meet the whole template.

**Tech Stack:** TypeScript strict ESM, vitest 5, marked 18, Vite 7 static build, Node 20/22 in CI (Node 26 locally), Playwright for the browser suite.

**Spec:** `docs/superpowers/specs/2026-09-19-rule-pages-template-design.md`. The plan argues from the spec; read both.

## Global Constraints

- Pages are pbiplint's own words. No ruleset description text, no Tabular Editor C#, no "run this script in TE", and the phrase "fix expression" never appears (the test rejects it).
- Every "How to fix it" gives a route with no third-party tool: Power BI Desktop, Power Query, the source system, or a TMDL edit Desktop preserves. Name the Desktop route and the TMDL property where both exist. Tabular Editor only after that route, as an optional bulk shortcut or a linked walkthrough.
- No em dashes anywhere: pages, code comments, commit messages, pull request bodies. The rule-pages test rejects the character on a page.
- Never put a closing keyword (`closes`, `fixes`, `resolves`) next to an issue number anywhere in a commit message or pull request body. Write "issue #45" or "tracked in #45".
- Main cannot be rewound. Every change lands from a branch through a pull request. Pull request 1 is branch `rule-pages-template`; each batch is `rule-pages-<category>` off main after the previous batch merges.
- Commit messages end with the two trailers the harness provides (`Co-Authored-By` and `Claude-Session`).
- The site build (`packages/web/src/build/*.ts`) imports nothing from `@pbiplint/core`. Copies are tied to core by a test in `packages/web/test/generate.test.ts`.
- `sources` in a page's frontmatter is attribution only: exactly the ruleset URL `https://github.com/microsoft/Analysis-Services/blob/master/BestPracticeRules/BPARules.json` for `ported` and `needsLiveModel` pages, empty for `builtin`.
- The first paragraph of "What it checks" is the rule's description in every output. Leave a correct one alone.
- After any page edit: `npm run build -w @pbiplint/core && node scripts/sync-rule-pages.mjs`, then commit the regenerated `packages/core/src/rules/rule-summaries.data.ts` and `packages/cli/src/rule-help.data.ts`.
- gh has three accounts. Any command that needs the org runs after `gh auth switch --user TheDataPractitioner` and is followed by `gh auth switch --user michaelmckinleyconsulting`. The repo's git config already commits as TheDataPractitioner.

---

## File map for pull request 1

| File | Change |
|---|---|
| `packages/core/src/engine/ignore.ts` | add `ignoreHelp(ruleId, scope)` |
| `packages/core/src/index.ts` | export `ignoreHelp` |
| `packages/core/test/engine.test.ts` | pin `ignoreHelp` text, both forms |
| `scripts/sync-rule-pages.mjs` | import `ignoreHelp`; `exampleMarkdown`; `helpMarkdown(s, url, id, scope)`; `helpText` strips bold; header comments |
| `scripts/test/sync-rule-pages.test.mjs` | `helpMarkdown` order and captions; bold stripping |
| `packages/cli/test/rule-help.test.ts` | help carries Example, When to ignore it, and the mechanics |
| `packages/web/src/build/pages.ts` | `ignoreHelp` copy, `withIgnoreHelp`, `siteMarkdown` factory with `code` and `codespan` overrides, `attribution`, `ruleLinks`, `rulePage(markdown, slug, links)` |
| `packages/web/src/build/generate.ts` | build the id-to-slug map before rendering; pass it to `rulePage` |
| `packages/web/src/styles.css` | `.example`, `.example figcaption`, `.example pre`, `.sources` |
| `packages/web/test/generate.test.ts` | figures, links, mechanics, attribution, `ruleLinks`, the copy tie, new h2 id list |
| `packages/core/test/rule-pages.test.ts` | `LEGACY_PAGES`; template checks for migrated pages |
| `rules/hide-foreign-keys.md` | proof page, ported path |
| `rules/avoid-using-1-x-y-syntax.md` | proof page, DAX rule |
| `rules/parse-issue.md` | proof page, builtin path |
| `rules/avoid-bi-directional-relationships-against-high-cardinality-columns.md` | proof page, live-model path |
| `packages/core/src/rules/rule-summaries.data.ts`, `packages/cli/src/rule-help.data.ts` | regenerated |
| `scripts/generate-rule-pages.mjs` | scaffold emits the template |
| `CONTRIBUTING.md` | Rule pages section rewritten |

Facts every task relies on (verified 2026-09-19 on main at 91cc4eb):

- `lint(files)` from `packages/core/src/engine/lint.ts` takes `{ path, text }[]` and returns `{ findings }` where each finding has `ruleId`, `objectName`, and optional `detail`. One inline TMDL string can carry several tables and relationships. Malformed lines become `PARSE_ISSUE` findings, never exceptions.
- marked 18: a renderer override that returns `false` falls back to the default renderer. The default fence renders as `<pre><code class="language-tmdl">…\n</code></pre>\n`, escaping `'` as `&#39;`. A `codespan` override receives the span's text raw (unescaped); the default renders `<code>` with `"` as `&quot;`.
- Vitest aliases `@pbiplint/core` to `packages/core/src/index.ts`, so tests and the sync test see source. Run as a script, `node scripts/sync-rule-pages.mjs` resolves `@pbiplint/core` to `packages/core/dist`, so core must be built first.
- `.prettierignore` lists `*.md`, so prettier never touches the pages.
- Rule ids contain `'`, `(`, `)`, `/`, and `-`, for example `AVOID_USING_'1-(X/Y)'_SYNTAX`. Never match ids by shape; match against the real list.
- Snippets verified through the engine: the `hide-foreign-keys` example fires exactly `'Sales'[Product Key]` and clears with `isHidden`; the `1-(x/y)` example fires `[Margin %]` and also `USE_THE_DIVIDE_FUNCTION_FOR_DIVISION`, and the DIVIDE rewrite clears both; the space-indented `parse-issue` example produces two `PARSE_ISSUE` findings and the tab version none.

---

### Task 1: `ignoreHelp` in core

**Files:**
- Modify: `packages/core/src/engine/ignore.ts`
- Modify: `packages/core/src/index.ts:10`
- Test: `packages/core/test/engine.test.ts`

**Interfaces:**
- Produces: `ignoreHelp(ruleId: string, scope: readonly string[] = []): string`, Markdown. Exported from `@pbiplint/core`. Tasks 2 and 3 depend on its exact text.

- [ ] **Step 1: Write the failing test**

Append to `packages/core/test/engine.test.ts`, after the `describe("isIgnored", …)` block, and add `ignoreHelp` to the existing import from `../src/engine/ignore.js`:

```ts
describe("ignoreHelp", () => {
  it("names the annotation and the config line for the rule", () => {
    expect(ignoreHelp("HIDE_FOREIGN_KEYS", ["Column"])).toBe(
      "To ignore this rule on one object, add `annotation pbiplint.ignore = HIDE_FOREIGN_KEYS` under the object in its TMDL file. Power BI Desktop keeps the annotation. To turn the rule off for a whole project, set `\"HIDE_FOREIGN_KEYS\": \"off\"` under `rules` in `pbiplint.config.json`.",
    );
    expect(ignoreHelp("X")).toBe(ignoreHelp("X", ["Model"]));
  });
  it("offers only the project switch for a rule that reports on files", () => {
    expect(ignoreHelp("PARSE_ISSUE", ["File"])).toBe(
      "This rule reports on files, so there is no object to annotate. To turn the rule off for a whole project, set `\"PARSE_ISSUE\": \"off\"` under `rules` in `pbiplint.config.json`.",
    );
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `npx vitest run packages/core/test/engine.test.ts -t ignoreHelp`
Expected: FAIL, `ignoreHelp` is not exported.

- [ ] **Step 3: Implement**

Append to `packages/core/src/engine/ignore.ts`:

```ts
/**
 * How to silence a rule, in Markdown, for the foot of a rule page's "When to ignore it" section
 * and for the SARIF help block. Written once so the two surfaces cannot drift. The site build
 * carries a copy (packages/web/src/build/pages.ts) that a test holds equal, because the build
 * imports nothing from core. A rule scoped to files alone has no object to annotate.
 */
export function ignoreHelp(ruleId: string, scope: readonly string[] = []): string {
  const project = `To turn the rule off for a whole project, set \`"${ruleId}": "off"\` under \`rules\` in \`pbiplint.config.json\`.`;
  if (scope.length > 0 && scope.every((s) => s === "File"))
    return `This rule reports on files, so there is no object to annotate. ${project}`;
  return (
    `To ignore this rule on one object, add \`annotation ${IGNORE_ANNOTATION} = ${ruleId}\` under ` +
    `the object in its TMDL file. Power BI Desktop keeps the annotation. ${project}`
  );
}
```

In `packages/core/src/index.ts` change the ignore export line to:

```ts
export { IGNORE_ANNOTATION, ignoreHelp, isIgnored } from "./engine/ignore.js";
```

- [ ] **Step 4: Run the tests**

Run: `npx vitest run packages/core/test/engine.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/engine/ignore.ts packages/core/src/index.ts packages/core/test/engine.test.ts
git commit -m "feat(core): ignoreHelp, the ignore mechanics written once"
```

---

### Task 2: The sync script carries Example and When to ignore it

**Files:**
- Modify: `scripts/sync-rule-pages.mjs`
- Test: `scripts/test/sync-rule-pages.test.mjs`
- Test: `packages/cli/test/rule-help.test.ts`

**Interfaces:**
- Consumes: `ignoreHelp` from `@pbiplint/core` (Task 1).
- Produces: `exampleMarkdown(example: string): string`; `helpMarkdown(sections, url, id, scope): string`; `helpText(markdown)` now strips `**`. The generated data files keep their shape (`RULE_SUMMARIES`, `RULE_HELP`).

- [ ] **Step 1: Write the failing tests**

Replace the import line of `scripts/test/sync-rule-pages.test.mjs` with:

```js
import { exampleMarkdown, helpMarkdown, helpText } from "../sync-rule-pages.mjs";
```

Append to the file:

```js
describe("exampleMarkdown", () => {
  it("captions the two fences and reduces their info strings to tmdl", () => {
    expect(exampleMarkdown("```tmdl fires\ntable A\n```\n\n```tmdl fixed\ntable B\n```")).toBe(
      "**Fires the rule**\n\n```tmdl\ntable A\n```\n\n**After the fix**\n\n```tmdl\ntable B\n```",
    );
  });
});

describe("helpMarkdown", () => {
  const mechanics =
    'To ignore this rule on one object, add `annotation pbiplint.ignore = X` under the object in its TMDL file. Power BI Desktop keeps the annotation. To turn the rule off for a whole project, set `"X": "off"` under `rules` in `pbiplint.config.json`.';
  it("mirrors the page minus What it checks, captions the example, and appends the mechanics", () => {
    const s = {
      Example: "```tmdl fires\ntable A\n```\n\n```tmdl fixed\ntable B\n```",
      "Why it matters": "Why.",
      "How to fix it": "How.",
      "When to ignore it": "Never.",
      Quirks: "- One.",
    };
    expect(helpMarkdown(s, "https://pbiplint.com/rules/x", "X", ["Column"])).toBe(
      [
        "### Example",
        "",
        "**Fires the rule**",
        "",
        "```tmdl",
        "table A",
        "```",
        "",
        "**After the fix**",
        "",
        "```tmdl",
        "table B",
        "```",
        "",
        "### Why it matters",
        "",
        "Why.",
        "",
        "### How to fix it",
        "",
        "How.",
        "",
        "### When to ignore it",
        "",
        "Never.",
        "",
        mechanics,
        "",
        "### Quirks",
        "",
        "- One.",
        "",
        "Read more: https://pbiplint.com/rules/x",
      ].join("\n"),
    );
  });
  it("leaves out the sections a page does not have", () => {
    expect(helpMarkdown({ "Why it matters": "Why.", "How to fix it": "How." }, "u", "X", [])).toBe(
      "### Why it matters\n\nWhy.\n\n### How to fix it\n\nHow.\n\nRead more: u",
    );
  });
});
```

Inside the existing `describe("helpText", …)` add:

```js
  it("drops the bold markers on a caption so it reads as a plain line", () => {
    expect(helpText("**Fires the rule**\n\n```tmdl\ntable A\n```")).toBe("Fires the rule\n\ntable A");
  });
```

In `packages/cli/test/rule-help.test.ts`, change the core import to `import { defaultRules, ignoreHelp, ruleUrl, slug } from "@pbiplint/core";` and replace the two `it` blocks with:

```ts
  it("carries the page's Why, How to fix, When to ignore, and Quirks sections and links to the page", () => {
    expect(help).toBeDefined();
    const markdown = normalize(help!.markdown);
    for (const heading of ["Why it matters", "How to fix it", "When to ignore it", "Quirks"]) {
      const body = normalize(section(page, heading));
      if (body) expect(markdown, heading).toContain(body);
    }
    if (section(page, "When to ignore it"))
      expect(markdown).toContain(normalize(ignoreHelp(rule.id, rule.scope)));
    if (section(page, "Example")) {
      expect(markdown).toContain("### Example **Fires the rule** ```tmdl");
      expect(markdown).toContain("**After the fix** ```tmdl");
    }
    expect(markdown).toContain(`Read more: ${ruleUrl(rule.id)}`);
  });

  it("has a plain-text form with no Markdown syntax", () => {
    // A code span leaves this shape behind once its delimiters are gone. Backticks a sentence is
    // about, such as the ``` that opens a TMDL expression block, are its content rather than
    // syntax, so they stay: PARSE_ISSUE reads "open and close with ``` on their own lines".
    expect(help!.text).not.toMatch(/`[^`\n]+`/);
    expect(help!.text).not.toMatch(/^```/m);
    expect(help!.text).not.toContain("### ");
    expect(help!.text).not.toContain("**");
    expect(help!.text).not.toMatch(/\]\(/);
    expect(help!.text).toContain("Read more: ");
  });
```

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run scripts/test/sync-rule-pages.test.mjs packages/cli/test/rule-help.test.ts`
Expected: FAIL on `exampleMarkdown` not exported and on `helpMarkdown` output.

- [ ] **Step 3: Implement**

In `scripts/sync-rule-pages.mjs`:

Replace the header comment block (lines 1 to 11) with:

```js
#!/usr/bin/env node
// Usage: npm run build -w @pbiplint/core && node scripts/sync-rule-pages.mjs
//
// Copies prose from the rule pages into generated data files, so packages that cannot read
// files at run time still speak in pbiplint's own words:
//   packages/core/src/rules/rule-summaries.data.ts  the first paragraph of "What it checks",
//                                                    which becomes Rule.description
//   packages/cli/src/rule-help.data.ts               the Example, Why, How to fix, When to ignore,
//                                                    and Quirks sections plus a link to the page,
//                                                    which the CLI hands to the SARIF formatter as
//                                                    each rule's help block
// The rule-pages tests fail when a data file and the pages disagree. Core is imported for the
// ignore mechanics, so build it first.
```

Add after the `node:url` import:

```js
import { ignoreHelp } from "@pbiplint/core";
```

Replace `helpMarkdown` with:

```js
/** The Example section for the help block: each fence captioned, its info string reduced to `tmdl`. */
export const exampleMarkdown = (example) =>
  example
    .replace(/^```tmdl fires[ \t]*$/m, "**Fires the rule**\n\n```tmdl")
    .replace(/^```tmdl fixed[ \t]*$/m, "**After the fix**\n\n```tmdl");

/**
 * Markdown help for SARIF consumers: the page minus its What section, in the page's order, with
 * the ignore mechanics generated onto the end of "When to ignore it", plus a link back.
 */
export const helpMarkdown = (s, url, id, scope) =>
  [
    ...(s["Example"] ? ["### Example", "", exampleMarkdown(s["Example"]), ""] : []),
    "### Why it matters",
    "",
    s["Why it matters"],
    "",
    "### How to fix it",
    "",
    s["How to fix it"],
    ...(s["When to ignore it"]
      ? ["", "### When to ignore it", "", s["When to ignore it"], "", ignoreHelp(id, scope)]
      : []),
    ...(s["Quirks"] ? ["", "### Quirks", "", s["Quirks"]] : []),
    "",
    `Read more: ${url}`,
  ].join("\n");
```

In `helpText`, change the doc comment to `/** The same help as plain text: headings kept as lines, code fences dropped, bold markers dropped, code spans unwrapped. */` and add, after the `.replace(/^### /, "")` map and join, one more replace before the link replace:

```js
    .replace(/\*\*([^*\n]+)\*\*/g, "$1")
```

In `main()`, after the `id` line, read the scope:

```js
    const scope = (/^scope: \[(.*)\]$/m.exec(frontmatter)?.[1] ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
```

and change the `helpMarkdown` call to `helpMarkdown(s, RULE_URL_BASE + file.replace(/\.md$/, ""), id, scope)`.

Change the generated header of `HELP_OUT` to:

```js
    `// Generated by scripts/sync-rule-pages.mjs from the Example, Why, How to fix, When to ignore,
// and Quirks sections of each rule page. Do not edit by hand: edit the page under rules/ and
// rerun the script.
import type { RuleHelp } from "@pbiplint/core";

/** SARIF help per rule id: the page minus What it checks, plus a link to the page. */
export const RULE_HELP: Readonly<Record<string, RuleHelp>> = ${JSON.stringify(help, null, 2)};
`,
```

- [ ] **Step 4: Run the tests, then regenerate**

Run: `npx vitest run scripts/test/sync-rule-pages.test.mjs packages/cli/test/rule-help.test.ts`
Expected: PASS.

Run: `npm run build -w @pbiplint/core && node scripts/sync-rule-pages.mjs && git diff --stat`
Expected: only `packages/cli/src/rule-help.data.ts` changes, and `git diff packages/cli/src/rule-help.data.ts` touches only the comment lines at the top of the file, because no page has the new sections yet so every help entry is byte-identical.

- [ ] **Step 5: Commit**

```bash
git add scripts/sync-rule-pages.mjs scripts/test/sync-rule-pages.test.mjs packages/cli/test/rule-help.test.ts packages/cli/src/rule-help.data.ts
git commit -m "feat(sync): help block carries the example and the ignore mechanics"
```

---

### Task 3: The renderer: figures, rule links, ignore mechanics, attribution

**Files:**
- Modify: `packages/web/src/build/pages.ts`
- Modify: `packages/web/src/build/generate.ts:30-40`
- Modify: `packages/web/src/styles.css` (after the `pre code` rule near line 64)
- Test: `packages/web/test/generate.test.ts`

**Interfaces:**
- Consumes: `ignoreHelp` from `@pbiplint/core` in the test only.
- Produces: `ignoreHelp(ruleId, scope)` (copy), `withIgnoreHelp(body, ruleId, scope)`, `attribution(sources)`, `ruleLinks(pages)`, type `RuleLinks = ReadonlyMap<string, string>`, and `rulePage(markdown, slug, links = new Map())`. Task 5 depends on the h2 id list this produces.

- [ ] **Step 1: Write the failing tests**

In `packages/web/test/generate.test.ts`, change the core import to `import { CATEGORY_ORDER as CORE_CATEGORY_ORDER, ignoreHelp as coreIgnoreHelp } from "@pbiplint/core";` and add `attribution`, `ignoreHelp`, `ruleLinks`, `withIgnoreHelp` to the import from `../src/build/pages.js`.

Add inside `describe("rulePage", …)`:

```ts
  it("renders an example fence as a captioned figure and leaves other fences alone", () => {
    const page = read("hide-foreign-keys").replace(
      "## Why it matters",
      "## Example\n\n```tmdl fires\ntable T\n\tcolumn 'A'\n```\n\n```tmdl fixed\ntable T\n```\n\n```\nDAX here\n```\n\n## Why it matters",
    );
    const { html } = rulePage(page, "hide-foreign-keys");
    expect(html).toContain(
      '<figure class="example fires">\n<figcaption>Fires the rule</figcaption>\n<pre><code class="language-tmdl">table T\n\tcolumn &#39;A&#39;\n</code></pre>\n</figure>',
    );
    expect(html).toContain('<figure class="example fixed">\n<figcaption>After the fix</figcaption>');
    expect(html).toContain("<pre><code>DAX here\n</code></pre>");
    expect(html).toContain('<h2 id="example">Example</h2>');
  });
  it("links a code span that names another rule, and only another rule", () => {
    const page = read("hide-foreign-keys").replace(
      "## Quirks",
      "See `MARK_PRIMARY_KEYS`, `HIDE_FOREIGN_KEYS`, and `MADE_UP`.\n\n## Quirks",
    );
    const links = new Map([
      ["MARK_PRIMARY_KEYS", "mark-primary-keys"],
      ["HIDE_FOREIGN_KEYS", "hide-foreign-keys"],
    ]);
    const { html } = rulePage(page, "hide-foreign-keys", links);
    expect(html).toContain('<a href="/rules/mark-primary-keys/"><code>MARK_PRIMARY_KEYS</code></a>');
    expect(html).toContain("<code>HIDE_FOREIGN_KEYS</code>");
    expect(html).not.toContain('<a href="/rules/hide-foreign-keys/">');
    expect(html).toContain("<code>MADE_UP</code>");
    expect(html).not.toContain("made-up");
    // With no link table, nothing is linked.
    expect(rulePage(page, "hide-foreign-keys").html).not.toContain("/rules/mark-primary-keys/");
  });
  it("appends the ignore mechanics to When to ignore it, in core's words", () => {
    const page = read("hide-foreign-keys").replace(
      "## Quirks",
      "## When to ignore it\n\nRarely.\n\n## Quirks",
    );
    const { html } = rulePage(page, "hide-foreign-keys");
    expect(html).toContain(
      "<p>Rarely.</p>\n<p>To ignore this rule on one object, add <code>annotation pbiplint.ignore = HIDE_FOREIGN_KEYS</code>",
    );
    expect(html).toContain("<code>&quot;HIDE_FOREIGN_KEYS&quot;: &quot;off&quot;</code>");
    // The build cannot import core (see CATEGORY_ORDER), so the text is copied and held equal here.
    expect(ignoreHelp("X", ["Column"])).toBe(coreIgnoreHelp("X", ["Column"]));
    expect(ignoreHelp("X", ["File"])).toBe(coreIgnoreHelp("X", ["File"]));
    // A page without the section gets nothing appended.
    const live = read("avoid-bi-directional-relationships-against-high-cardinality-columns");
    expect(rulePage(live, "x").html).not.toContain("pbiplint.ignore");
  });
  it("prints where the rule was ported from, and nothing for a rule with no source", () => {
    const { html } = rulePage(read("hide-foreign-keys"), "hide-foreign-keys");
    expect(html).toContain(
      `<p class="sources">Ported from <a href="https://github.com/microsoft/Analysis-Services/blob/master/BestPracticeRules/BPARules.json">Microsoft's Best Practice Analyzer ruleset</a>.</p>`,
    );
    const none = rulePage(read("hide-foreign-keys").replace(/sources:\n(  - .*\n)+/, "sources:\n"), "x");
    expect(none.html).not.toContain('class="sources"');
    const other = rulePage(
      read("hide-foreign-keys").replace(/sources:\n(  - .*\n)+/, "sources:\n  - https://learn.microsoft.com/x\n"),
      "x",
    );
    expect(other.html).toContain('<a href="https://learn.microsoft.com/x">learn.microsoft.com</a>');
  });
```

Add two new describes after `describe("rulePage", …)`:

```ts
describe("withIgnoreHelp", () => {
  it("appends to the section whether or not another section follows it", () => {
    const help = ignoreHelp("X", ["Column"]);
    expect(withIgnoreHelp("## When to ignore it\n\nRarely.\n\n## Quirks\n\n- Q\n", "X", ["Column"])).toBe(
      `## When to ignore it\n\nRarely.\n\n${help}\n\n## Quirks\n\n- Q\n`,
    );
    expect(withIgnoreHelp("## When to ignore it\n\nRarely.\n", "X", ["Column"])).toBe(
      `## When to ignore it\n\nRarely.\n\n${help}\n`,
    );
    expect(withIgnoreHelp("## Quirks\n\n- Q\n", "X", ["Column"])).toBe("## Quirks\n\n- Q\n");
  });
});

describe("ruleLinks and attribution", () => {
  it("maps every page's id to its slug", () => {
    const links = ruleLinks([{ slug: "hide-foreign-keys", markdown: read("hide-foreign-keys") }]);
    expect([...links]).toEqual([["HIDE_FOREIGN_KEYS", "hide-foreign-keys"]]);
  });
  it("names a known source and falls back to the hostname", () => {
    expect(attribution([])).toBe("");
    expect(
      attribution([
        "https://github.com/microsoft/Analysis-Services/blob/master/BestPracticeRules/BPARules.json",
      ]),
    ).toBe(
      `<p class="sources">Ported from <a href="https://github.com/microsoft/Analysis-Services/blob/master/BestPracticeRules/BPARules.json">Microsoft's Best Practice Analyzer ruleset</a>.</p>\n`,
    );
    expect(attribution(["https://example.org/a?b=1"])).toBe(
      `<p class="sources">Ported from <a href="https://example.org/a?b=1">example.org</a>.</p>\n`,
    );
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run packages/web/test/generate.test.ts`
Expected: FAIL, the new exports do not exist.

- [ ] **Step 3: Implement the renderer**

In `packages/web/src/build/pages.ts`:

After `STATUS_LABEL`, add:

```ts
/** Known source URLs and how the attribution line names them. Any other URL is named by its host. */
const SOURCE_NAMES: Record<string, string> = {
  "https://github.com/microsoft/Analysis-Services/blob/master/BestPracticeRules/BPARules.json":
    "Microsoft's Best Practice Analyzer ruleset",
};
/** The caption a fenced example carries, by the word after `tmdl` in its info string. */
const EXAMPLE_CAPTION: Record<string, string> = {
  fires: "Fires the rule",
  fixed: "After the fix",
};
```

After `escapeHtml`, add:

```ts
/** escapeHtml plus the apostrophe, for text inside <code>, matching what marked writes there. */
const escapeCode = (s: string): string => escapeHtml(s).replace(/'/g, "&#39;");

/**
 * How to silence a rule, appended to a page's "When to ignore it" section. Core exports the same
 * text as ignoreHelp; this copy is deliberate for the reason CATEGORY_ORDER gives, and a test
 * holds the two equal.
 */
export function ignoreHelp(ruleId: string, scope: readonly string[] = []): string {
  const project = `To turn the rule off for a whole project, set \`"${ruleId}": "off"\` under \`rules\` in \`pbiplint.config.json\`.`;
  if (scope.length > 0 && scope.every((s) => s === "File"))
    return `This rule reports on files, so there is no object to annotate. ${project}`;
  return (
    `To ignore this rule on one object, add \`annotation pbiplint.ignore = ${ruleId}\` under ` +
    `the object in its TMDL file. Power BI Desktop keeps the annotation. ${project}`
  );
}

/** The body with the ignore mechanics as the last paragraph of "When to ignore it", when the page has that section. */
export function withIgnoreHelp(body: string, ruleId: string, scope: readonly string[]): string {
  const heading = "## When to ignore it";
  const start = body.indexOf(heading);
  if (start === -1) return body;
  const next = body.indexOf("\n## ", start + heading.length);
  const end = next === -1 ? body.length : next;
  return `${body.slice(0, end).trimEnd()}\n\n${ignoreHelp(ruleId, scope)}\n${body.slice(end)}`;
}

/** Rule id to page slug; a code span that names a rule in this map links to its page. */
export type RuleLinks = ReadonlyMap<string, string>;

/** The link table for a set of pages, read from their frontmatter before any page is rendered. */
export function ruleLinks(pages: { slug: string; markdown: string }[]): RuleLinks {
  return new Map(
    pages.map(({ slug, markdown }) => [
      str(parseFrontmatter(markdown, `rules/${slug}.md`).data.id),
      slug,
    ]),
  );
}

/** The attribution line under a rule page. Nothing for a rule that was ported from nowhere. */
export function attribution(sources: string[]): string {
  if (sources.length === 0) return "";
  const links = sources.map(
    (url) =>
      `<a href="${escapeHtml(url)}">${escapeHtml(SOURCE_NAMES[url] ?? new URL(url).hostname)}</a>`,
  );
  return `<p class="sources">Ported from ${links.join(" and ")}.</p>\n`;
}
```

`str` is declared later in the file as a `const`; move the `str` and `list` declarations up to sit directly under `escapeHtml` so `ruleLinks` can use `str` (a `const` arrow function is not hoisted).

Replace the `md` and `render` declarations with:

```ts
/**
 * The site's Markdown renderer. marked adds no heading ids of its own since v8, so headings get
 * them here. On a rule page, a fence whose info string is `tmdl fires` or `tmdl fixed` renders as
 * a captioned figure, and a code span naming another rule links to its page; returning false
 * from an override hands the token back to marked's default renderer.
 */
function siteMarkdown(links: RuleLinks = new Map(), self = ""): Marked {
  return new Marked({
    renderer: {
      heading({ tokens, depth, text }: Tokens.Heading): string {
        return `<h${depth} id="${headingId(text)}">${this.parser.parseInline(tokens)}</h${depth}>\n`;
      },
      code({ text, lang, escaped }: Tokens.Code): string | false {
        const example = /^tmdl (fires|fixed)$/.exec(lang ?? "");
        if (!example) return false;
        const kind = example[1]!;
        const code = (escaped ? text : escapeCode(text)).replace(/\n$/, "");
        return `<figure class="example ${kind}">\n<figcaption>${EXAMPLE_CAPTION[kind]!}</figcaption>\n<pre><code class="language-tmdl">${code}\n</code></pre>\n</figure>\n`;
      },
      codespan({ text }: Tokens.Codespan): string | false {
        const slug = links.get(text);
        if (slug === undefined || text === self) return false;
        return `<a href="/rules/${escapeHtml(slug)}/"><code>${escapeCode(text)}</code></a>`;
      },
    },
  });
}
const md = siteMarkdown();
const render = (markdown: string, links?: RuleLinks, self?: string): string =>
  (links ? siteMarkdown(links, self) : md).parse(markdown, { async: false }) as string;
```

Change the `rulePage` signature to `export function rulePage(markdown: string, slug: string, links: RuleLinks = new Map()): { html: string; meta: RuleMeta }` and its `main` template to:

```ts
  const main = `<article class="rule">
  <p class="eyebrow"><a href="/rules/">Rules</a> / ${escapeHtml(meta.category)}</p>
  <h1>${escapeHtml(title)}</h1>
  <p class="meta"><span class="badge ${escapeHtml(meta.severity)}">${escapeHtml(meta.severity)}</span> <code>${escapeHtml(meta.id)}</code> · ${escapeHtml(STATUS_LABEL[meta.status] ?? meta.status)} · scope: ${escapeHtml(list(data.scope).join(", "))}</p>
  ${video ? `<p class="video"><a href="${escapeHtml(video)}">Watch the video for this rule</a></p>` : ""}
  ${render(withIgnoreHelp(body.replace(/^# .+\n/m, ""), meta.id, list(data.scope)), links, meta.id)}
  ${attribution(list(data.sources))}<p class="cta"><a class="button" href="/">Check a model for this</a> <a href="https://github.com/pbiplint/pbiplint/edit/main/rules/${escapeHtml(slug)}.md">Improve this page</a></p>
</article>`;
```

In `packages/web/src/build/generate.ts`, add `ruleLinks` to the import from `./pages.js` and replace the page loop with:

```ts
  const sources = readdirSync(rulesDir)
    .filter((f) => f.endsWith(".md"))
    .sort()
    .map((file) => ({
      slug: file.replace(/\.md$/, ""),
      markdown: readFileSync(join(rulesDir, file), "utf8"),
    }));
  // Every page's id is known before any page renders, so a code span naming a rule links only to
  // a page this build is about to write.
  const links = ruleLinks(sources);
  for (const { slug, markdown } of sources) {
    const { html, meta } = rulePage(markdown, slug, links);
    pages.push({ slug, html });
    metas.push(meta);
  }
```

In `packages/web/src/styles.css`, after the `pre code { … }` rule:

```css
/* A rule page's example: the snippet that fires and the same snippet fixed, captioned by the
   renderer so every page reads the same. */
.example {
  margin: 16px 0;
}
.example figcaption {
  color: var(--fg-2);
  font-size: 13px;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  margin: 0 0 6px;
}
.example pre {
  margin: 0;
}
/* Where a rule was ported from, under the page. */
.sources {
  color: var(--fg-2);
  font-size: 14px;
  margin-top: 32px;
}
```

- [ ] **Step 4: Run the tests, typecheck, lint**

Run: `npx vitest run packages/web/test && npm run typecheck && npm run lint`
Expected: PASS. If eslint objects to `this` in the `heading` override, it already accepted the same code before this task; nothing new uses `this`.

- [ ] **Step 5: Commit**

```bash
git add packages/web/src/build/pages.ts packages/web/src/build/generate.ts packages/web/src/styles.css packages/web/test/generate.test.ts
git commit -m "feat(web): example figures, rule links, ignore mechanics, and attribution on rule pages"
```

---

### Task 4: The rule-pages test: `LEGACY_PAGES` and the template checks

**Files:**
- Modify: `packages/core/test/rule-pages.test.ts` (replace the file)

**Interfaces:**
- Consumes: `lint` from `../src/engine/lint.js`, `Finding` from `../src/rules/types.js`.
- Produces: `LEGACY_PAGES`, a `Set<string>` of slugs that Tasks 5 to 8 and every batch shrink.

- [ ] **Step 1: Replace the test file**

The `LEGACY_PAGES` literal lists all 72 slugs, which is `ls rules | sed 's/\.md$//'` on main today; every page is legacy until a later task migrates it.

```ts
import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { lint } from "../src/engine/lint.js";
import { slug } from "../src/model/names.js";
import { defaultRules } from "../src/rules/index.js";
import { BPA_RULES } from "../src/rules/microsoft-bpa/bpa-rules.data.js";
import { SEVERITY_LABEL, type Finding } from "../src/rules/types.js";

const rulesDir = new URL("../../../rules/", import.meta.url).pathname;
const rulesetDescription = new Map(BPA_RULES.map((r) => [r.id, r.description]));
const ruleIds = new Set(defaultRules.map((r) => r.id));
const RULESET_URL =
  "https://github.com/microsoft/Analysis-Services/blob/master/BestPracticeRules/BPARules.json";

/**
 * Pages not yet brought up to the complete template
 * (docs/superpowers/specs/2026-09-19-rule-pages-template-design.md, section 10). A page here meets
 * only the checks every page meets; a page not here meets the whole template. Each batch removes
 * its slugs, and the last batch deletes this set and everything that reads it.
 */
const LEGACY_PAGES = new Set<string>([
  "add-data-category-for-columns",
  "avoid-bi-directional-relationships-against-high-cardinality-columns",
  "avoid-duplicate-measures",
  "avoid-excessive-bi-directional-or-many-to-many-relationships",
  "avoid-floating-point-data-types",
  "avoid-invalid-description-characters",
  "avoid-invalid-name-characters",
  "avoid-structured-data-sources-with-provider-partitions",
  "avoid-the-userelationship-function-and-rls-against-the-same-table",
  "avoid-using-1-x-y-syntax",
  "avoid-using-many-to-many-relationships-on-tables-used-for-dynamic-row-level-security",
  "avoid-using-the-iferror-function",
  "calculation-groups-with-no-calculation-items",
  "check-if-bi-directional-and-many-to-many-relationships-are-valid",
  "check-if-dynamic-row-level-security-rls-is-necessary",
  "data-columns-must-have-a-source-column",
  "date-calendar-tables-should-be-marked-as-a-date-table",
  "datecolumn-formatstring",
  "dax-columns-fully-qualified",
  "dax-measures-unqualified",
  "ensure-tables-have-relationships",
  "evaluateandlog-should-not-be-used-in-production-models",
  "expression-reliant-objects-must-have-an-expression",
  "filter-column-values",
  "filter-measure-values-by-columns",
  "first-letter-of-objects-must-be-capitalized",
  "fix-referential-integrity-violations",
  "format-flag-columns-as-yes-no-value-strings",
  "hide-fact-table-columns",
  "hide-foreign-keys",
  "inactive-relationships-that-are-never-activated",
  "integer-formatting",
  "isavailableinmdx-false-nonattribute-columns",
  "large-tables-should-be-partitioned",
  "limit-row-level-security-rls-logic",
  "many-to-many-relationships-should-be-single-direction",
  "mark-primary-keys",
  "measures-should-not-be-direct-references-of-other-measures",
  "measures-using-time-intelligence-and-model-is-using-direct-query",
  "minimize-power-query-transformations",
  "model-should-have-a-date-table",
  "model-using-direct-query-and-no-aggregations",
  "month-as-a-string-must-be-sorted",
  "monthcolumn-formatstring",
  "numeric-column-summarize-by",
  "objects-should-not-start-or-end-with-a-space",
  "objects-with-no-description",
  "parse-issue",
  "partition-name-should-match-table-name-for-single-partition-tables",
  "percentage-formatting",
  "perspectives-with-no-objects",
  "provide-format-string-for-measures",
  "reduce-number-of-calculated-columns",
  "reduce-usage-of-calculated-columns-that-use-the-related-function",
  "reduce-usage-of-calculated-tables",
  "reduce-usage-of-long-length-columns-with-high-cardinality",
  "relationship-columns-same-data-type",
  "relationship-columns-should-be-of-integer-data-type",
  "remove-auto-date-table",
  "remove-data-sources-not-referenced-by-any-partitions",
  "remove-redundant-columns-in-related-tables",
  "remove-roles-with-no-members",
  "set-isavailableinmdx-to-true-on-necessary-columns",
  "snowflake-schema-architecture",
  "special-chars-in-object-names",
  "split-date-and-time",
  "trim-object-names",
  "unnecessary-columns",
  "unnecessary-measures",
  "unpivot-pivoted-month-data",
  "use-the-divide-function-for-division",
  "use-the-treatas-function-instead-of-intersect",
]);

/** The sections a complete page may have, in the only order they may appear. */
const SECTION_ORDER = [
  "What it checks",
  "Example",
  "Why it matters",
  "How to fix it",
  "When to ignore it",
  "Quirks",
  "Related rules",
  "Links",
];
const RUNS = ["What it checks", "Example", "Why it matters", "How to fix it", "When to ignore it"];
const REQUIRED: Record<string, string[]> = {
  ported: RUNS,
  builtin: RUNS,
  needsLiveModel: ["What it checks", "Why it matters", "How to fix it"],
};
/** A live-model rule never runs, so it can show no example that fires and has no finding to ignore. */
const FORBIDDEN: Record<string, string[]> = {
  ported: [],
  builtin: [],
  needsLiveModel: ["Example", "When to ignore it"],
};

const normalize = (s: string): string =>
  s.toLowerCase().replace(/["'`]/g, "").replace(/\s+/g, " ").trim();

/** The first paragraph of a section, whitespace collapsed, as scripts/sync-rule-pages.mjs reads it. */
const firstParagraph = (s: string): string =>
  s
    .trim()
    .split(/\n\s*\n/)[0]
    ?.replace(/\s+/g, " ")
    .trim() ?? "";

/** The section between one `## ` heading and the next. */
const section = (text: string, heading: string): string =>
  text.split(`## ${heading}`)[1]?.split(/\n## /)[0] ?? "";

const headings = (text: string): string[] =>
  [...text.matchAll(/^## (.+)$/gm)].map((m) => m[1]!.trim());

/** The `sources` list in the frontmatter, as the site's parseFrontmatter would read it. */
const sourcesOf = (text: string): string[] => {
  const frontmatter = /^---\n([\s\S]*?)\n---\n/.exec(text)?.[1] ?? "";
  const block = /^sources:\n((?:  - .*\n?)*)/m.exec(frontmatter)?.[1] ?? "";
  return block
    .split("\n")
    .filter((l) => l.startsWith("  - "))
    .map((l) => l.slice(4).trim());
};

/** The contents of every fenced block in a section whose info string is exactly `info`. */
const fences = (s: string, info: string): string[] =>
  [...s.matchAll(/^```([^\n]*)\n([\s\S]*?)\n```$/gm)]
    .filter((m) => m[1]!.trim() === info)
    .map((m) => m[2]!);

const bullets = (s: string): string[] => s.split("\n").filter((l) => l.startsWith("- "));

const run = (tmdl: string): Finding[] => lint([{ path: "example.tmdl", text: tmdl }]).findings;
const hits = (findings: Finding[], id: string): Finding[] =>
  findings.filter((f) => f.ruleId === id);

describe("LEGACY_PAGES", () => {
  it("names only pages that exist and have not been migrated", () => {
    for (const s of LEGACY_PAGES) {
      const path = `${rulesDir}${s}.md`;
      expect(existsSync(path), path).toBe(true);
      expect(
        readFileSync(path, "utf8"),
        `${s} is migrated: remove it from LEGACY_PAGES`,
      ).not.toContain("## When to ignore it");
    }
  });
});

describe.each(defaultRules.map((r) => [r.id, r] as const))("rule page for %s", (_id, rule) => {
  const path = `${rulesDir}${slug(rule.id)}.md`;
  const migrated = !LEGACY_PAGES.has(slug(rule.id));

  it("exists with matching frontmatter and the required sections", () => {
    expect(existsSync(path), path).toBe(true);
    const text = readFileSync(path, "utf8");
    const [, frontmatter = ""] = /^---\n([\s\S]*?)\n---\n/.exec(text) ?? [];
    expect(frontmatter).toContain(`id: ${rule.id}`);
    expect(frontmatter).toContain(`severity: ${SEVERITY_LABEL[rule.severity]}`);
    expect(frontmatter).toContain(`status: ${rule.status}`);
    expect(frontmatter).toContain(`category: ${rule.category}`);
    // Links is required on a page that has not been migrated; on the template it is further
    // reading only, present when there is some.
    for (const heading of [
      "## What it checks",
      "## Why it matters",
      "## How to fix it",
      ...(migrated ? [] : ["## Links"]),
    ])
      expect(text, heading).toContain(heading);
    expect(text).not.toContain("TODO");
    expect(text).not.toContain("\u2014");
  });

  it("is written in pbiplint's own words, with no Tabular Editor fix expressions", () => {
    const text = readFileSync(path, "utf8");
    // Fixes are described for Power BI Desktop, Power Query, the source, or the TMDL file,
    // never as a C# expression for another tool.
    expect(text).not.toMatch(/fix expression/i);
    // The ruleset's description is data the engine carries, not prose for the page. The
    // page's Why section must not reuse its opening sentence.
    const ruleset = rulesetDescription.get(rule.id) ?? "";
    const firstSentence = normalize(ruleset.split(/\.\s|\n/)[0] ?? "");
    if (firstSentence.length >= 30)
      expect(normalize(section(text, "Why it matters"))).not.toContain(firstSentence);
  });

  it("is the source of the rule's description in tool output", () => {
    // rule-summaries.data.ts is generated from the page; rerun scripts/sync-rule-pages.mjs after editing.
    const text = readFileSync(path, "utf8");
    expect(rule.description).toBe(firstParagraph(section(text, "What it checks")));
  });

  describe.runIf(migrated)("meets the complete template", () => {
    it("has its sections in order, with the ones its status requires and none it forbids", () => {
      const found = headings(readFileSync(path, "utf8"));
      expect(found).toEqual([...new Set(found)]);
      for (const h of found) expect(SECTION_ORDER, h).toContain(h);
      expect(found).toEqual(SECTION_ORDER.filter((h) => found.includes(h)));
      for (const h of REQUIRED[rule.status]!) expect(found, h).toContain(h);
      for (const h of FORBIDDEN[rule.status]!) expect(found, h).not.toContain(h);
    });

    it("attributes its source and keeps further reading apart from it", () => {
      const text = readFileSync(path, "utf8");
      const sources = sourcesOf(text);
      expect(sources).toEqual(rule.status === "builtin" ? [] : [RULESET_URL]);
      if (!text.includes("## Links")) return;
      const items = bullets(section(text, "Links"));
      expect(items.length).toBeGreaterThan(0);
      for (const item of items) {
        const url = /^- \[[^\]]+\]\(([^)]+)\)/.exec(item)?.[1];
        expect(url, item).toBeDefined();
        expect(sources).not.toContain(url);
      }
    });

    it.runIf(rule.status !== "needsLiveModel")(
      "shows an example the engine flags and a fix it accepts",
      () => {
        const example = section(readFileSync(path, "utf8"), "Example");
        const [fires, ...moreFires] = fences(example, "tmdl fires");
        const [fixed, ...moreFixed] = fences(example, "tmdl fixed");
        expect(fires, "one `tmdl fires` fence").toBeDefined();
        expect(fixed, "one `tmdl fixed` fence").toBeDefined();
        expect(moreFires).toEqual([]);
        expect(moreFixed).toEqual([]);
        // A fix is a fix, not a suppression.
        expect(`${fires}${fixed}`).not.toContain("pbiplint.ignore");
        const before = run(fires!);
        expect(hits(before, rule.id).length, "the fires snippet produces a finding").toBeGreaterThan(0);
        if (rule.id !== "PARSE_ISSUE")
          expect(hits(before, "PARSE_ISSUE").map((f) => f.detail)).toEqual([]);
        const after = run(fixed!);
        expect(
          hits(after, rule.id).map((f) => f.objectName),
          "the fixed snippet is clean for this rule",
        ).toEqual([]);
        expect(hits(after, "PARSE_ISSUE").map((f) => f.detail)).toEqual([]);
      },
    );

    it.runIf(rule.status !== "needsLiveModel")(
      "writes the judgment on ignoring and leaves the mechanics to the generator",
      () => {
        const s = section(readFileSync(path, "utf8"), "When to ignore it");
        expect(s.trim()).not.toBe("");
        expect(s).not.toContain("pbiplint.ignore");
        expect(s).not.toContain('"off"');
      },
    );

    it("names only real rules under Related rules, never itself", () => {
      const text = readFileSync(path, "utf8");
      if (!text.includes("## Related rules")) return;
      const items = bullets(section(text, "Related rules"));
      expect(items.length).toBeGreaterThan(0);
      for (const item of items) {
        const id = /^- `([^`]+)`/.exec(item)?.[1];
        expect(id, item).toBeDefined();
        expect(ruleIds.has(id!), item).toBe(true);
        expect(id).not.toBe(rule.id);
      }
    });
  });
});
```

- [ ] **Step 2: Run the test**

Run: `npx vitest run packages/core/test/rule-pages.test.ts`
Expected: PASS, with every "meets the complete template" block skipped (all 72 pages are legacy). `npm run typecheck` also passes.

- [ ] **Step 3: Commit**

```bash
git add packages/core/test/rule-pages.test.ts
git commit -m "test(rules): the complete template, phased by LEGACY_PAGES"
```

---

### Task 5: Proof page: hide-foreign-keys (the ported path)

**Files:**
- Modify: `rules/hide-foreign-keys.md` (replace)
- Modify: `packages/core/test/rule-pages.test.ts` (remove one slug)
- Modify: `packages/web/test/generate.test.ts` (h2 id list; a link assertion)
- Regenerate: `packages/core/src/rules/rule-summaries.data.ts`, `packages/cli/src/rule-help.data.ts`

- [ ] **Step 1: Remove the slug and update the renderer expectations so the tests fail first**

Delete the line `  "hide-foreign-keys",` from `LEGACY_PAGES`.

In `packages/web/test/generate.test.ts`, in the test "gives every section heading an id", change the expected id list to:

```ts
    expect(ids).toEqual([
      "what-it-checks",
      "example",
      "why-it-matters",
      "how-to-fix-it",
      "when-to-ignore-it",
      "quirks",
      "related-rules",
    ]);
```

In the `generateSite` test "writes every rule page, the index, the about page, and the sitemap", after the `existsSync(join(out, "rules/hide-foreign-keys/index.html"))` line add:

```ts
    expect(readFileSync(join(out, "rules/hide-foreign-keys/index.html"), "utf8")).toContain(
      '<a href="/rules/mark-primary-keys/"><code>MARK_PRIMARY_KEYS</code></a>',
    );
```

Run: `npx vitest run packages/core/test/rule-pages.test.ts packages/web/test/generate.test.ts -t "HIDE_FOREIGN_KEYS|heading an id|writes every rule page"`
Expected: FAIL on the missing sections and the id list.

- [ ] **Step 2: Write the page**

Replace `rules/hide-foreign-keys.md` with (indentation inside the fences is tabs):

````md
---
id: HIDE_FOREIGN_KEYS
name: "Hide foreign keys"
category: Formatting
severity: warning
scope: [Column, CalculatedColumn, CalculatedTableColumn]
status: ported
video:
sources:
  - https://github.com/microsoft/Analysis-Services/blob/master/BestPracticeRules/BPARules.json
---

# Hide foreign keys

## What it checks

Visible columns whose name matches the from column of a relationship whose from side is many. Only the from cardinality is tested, so a many-to-many relationship counts here too, not just many-to-one.

Each finding names the column, as `'Sales'[Product Key]`.

## Example

```tmdl fires
table Sales
	column 'Product Key'
		dataType: int64
		sourceColumn: ProductKey

table Product
	column 'Product ID'
		dataType: int64
		isKey
		sourceColumn: ProductID

relationship Sales_Product
	fromColumn: Sales.'Product Key'
	toColumn: Product.'Product ID'
```

```tmdl fixed
table Sales
	column 'Product Key'
		dataType: int64
		isHidden
		sourceColumn: ProductKey

table Product
	column 'Product ID'
		dataType: int64
		isKey
		sourceColumn: ProductID

relationship Sales_Product
	fromColumn: Sales.'Product Key'
	toColumn: Product.'Product ID'
```

## Why it matters

A key column on the many side of a relationship carries no meaning for a report author: the values are surrogate integers, and grouping by the fact table's key gives one row per key value labeled with a number nobody recognizes. Leaving it visible also puts two versions of the same field in the field list, one on the fact table and one on the dimension, and only the dimension's version filters the way people expect. Hiding the key removes the wrong choice from the field list without changing anything about how the model behaves.

## How to fix it

In Power BI Desktop, open the model view, select the column, and turn on Is hidden in the Properties pane, or right-click the column in the Data pane and choose Hide in report view. In the TMDL file, add `isHidden` under the column. A hidden column still takes part in the relationship and still filters. It only leaves the field list.

## When to ignore it

A key that people search or filter by in its own right can stay visible, for example an order number that is both the key to an Orders dimension and a value a reader types into a slicer. Ignore the finding on that column and leave the rule on for the rest of the model. A bare surrogate key is never something a report author needs to see.

## Quirks

- The source rule compares from-column names only, not table plus column, so a dimension's key that shares a name with the fact table's foreign key is flagged too. pbiplint keeps this to match Tabular Editor. The example above names the two columns differently for that reason.

## Related rules

- `MARK_PRIMARY_KEYS` covers the other side of the same relationship: the column on the one side should be marked as a key.
- `RELATIONSHIP_COLUMNS_SHOULD_BE_OF_INTEGER_DATA_TYPE` fires on the same columns when they are not integers.
````

- [ ] **Step 3: Regenerate and run the tests**

Run: `npm run build -w @pbiplint/core && node scripts/sync-rule-pages.mjs && npx vitest run packages/core/test/rule-pages.test.ts packages/web/test/generate.test.ts packages/cli/test/rule-help.test.ts`
Expected: PASS. The regenerated help for `HIDE_FOREIGN_KEYS` carries `### Example`, `### When to ignore it`, and the mechanics.

- [ ] **Step 4: Look at it**

Run: `npm run build -w @pbiplint/web` and open `packages/web/dist/rules/hide-foreign-keys/index.html` in a browser (or `npm run dev -w @pbiplint/web` and visit `/rules/hide-foreign-keys/`). Check: two captioned figures, `MARK_PRIMARY_KEYS` is a link, the mechanics paragraph ends "When to ignore it", the attribution line sits above the buttons, and nothing overflows at phone width.

- [ ] **Step 5: Commit**

```bash
git add rules/hide-foreign-keys.md packages/core/test/rule-pages.test.ts packages/web/test/generate.test.ts packages/core/src/rules/rule-summaries.data.ts packages/cli/src/rule-help.data.ts
git commit -m "docs(rules): hide-foreign-keys on the complete template"
```

---

### Task 6: Proof page: avoid-using-1-x-y-syntax (a DAX rule's example)

**Files:**
- Modify: `rules/avoid-using-1-x-y-syntax.md` (replace)
- Modify: `packages/core/test/rule-pages.test.ts` (remove one slug)
- Regenerate: the two data files

- [ ] **Step 1: Remove the slug and see the test fail**

Delete `  "avoid-using-1-x-y-syntax",` from `LEGACY_PAGES`.
Run: `npx vitest run packages/core/test/rule-pages.test.ts -t "1-\(X/Y\)"`
Expected: FAIL on the missing sections.

- [ ] **Step 2: Write the page**

Replace `rules/avoid-using-1-x-y-syntax.md` with:

````md
---
id: AVOID_USING_'1-(X/Y)'_SYNTAX
name: "Avoid using '1-(x/y)' syntax"
category: DAX Expressions
severity: warning
scope: [Measure, CalculatedColumn, CalculationItem]
status: ported
video:
sources:
  - https://github.com/microsoft/Analysis-Services/blob/master/BestPracticeRules/BPARules.json
---

# Avoid using '1-(x/y)' syntax

## What it checks

Expressions with a number, then plus or minus, then either `SUM('Table'[Column])` followed by a division operator, or a call to DIVIDE. The common shape is `1 - SUM(Sales[Cost]) / SUM(Sales[Amount])`.

Each finding names the measure, calculated column, or calculation item, as `[Margin %]`.

## Example

```tmdl fires
table Sales
	column Amount
		dataType: decimal
		sourceColumn: Amount
	column Cost
		dataType: decimal
		sourceColumn: Cost
	measure 'Margin %' = 1 - SUM(Sales[Cost]) / SUM(Sales[Amount])
		formatString: 0.0%
```

```tmdl fixed
table Sales
	column Amount
		dataType: decimal
		sourceColumn: Amount
	column Cost
		dataType: decimal
		sourceColumn: Cost
	measure 'Margin %' = DIVIDE(SUM(Sales[Amount]) - SUM(Sales[Cost]), SUM(Sales[Amount]))
		formatString: 0.0%
```

## Why it matters

Written that way the measure always returns a value. When there are no rows, the division is blank, one minus blank is one, and every empty cell in the matrix shows 100 percent. The visual fills with rows that should not be there, and the query does extra work to produce them. Written as a single DIVIDE over the difference, the measure is blank when the data is blank and the engine skips those rows.

## How to fix it

Rewrite `1 - x / y` as `DIVIDE(y - x, y)`, and hold the shared denominator in a variable when it is used twice:

```
Margin % =
VAR Sales = SUM ( Sales[Amount] )
RETURN DIVIDE ( Sales - SUM ( Sales[Cost] ), Sales )
```

In Power BI Desktop, select the measure and edit it in the formula bar. In the TMDL file, edit the expression after `measure 'Margin %' =`.

## When to ignore it

There is no case where the original shape is the better one. If a visual relies on the measure showing 100 percent where there is no data, that is a display decision, and it belongs in a measure that returns the value on purpose, not in a subtraction that happens to produce it.

## Quirks

- The pattern needs SUM as the numerator, or DIVIDE right after the number. `1 - [Cost] / [Sales]` and `1 - AVERAGE(...) / ...` are not matched.
- Table and column names must contain only letters, digits, spaces, and underscores for the SUM form to match.

## Related rules

- `USE_THE_DIVIDE_FUNCTION_FOR_DIVISION` fires on the `/` in the same expression, and the rewrite clears both.
````

- [ ] **Step 3: Regenerate and run the tests**

Run: `npm run build -w @pbiplint/core && node scripts/sync-rule-pages.mjs && npx vitest run packages/core/test/rule-pages.test.ts packages/cli/test/rule-help.test.ts`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add rules/avoid-using-1-x-y-syntax.md packages/core/test/rule-pages.test.ts packages/core/src/rules/rule-summaries.data.ts packages/cli/src/rule-help.data.ts
git commit -m "docs(rules): avoid-using-1-x-y-syntax on the complete template"
```

---

### Task 7: Proof page: parse-issue (the builtin path)

**Files:**
- Modify: `rules/parse-issue.md` (replace)
- Modify: `packages/core/test/rule-pages.test.ts` (remove one slug)
- Regenerate: the two data files

- [ ] **Step 1: Remove the slug and see the test fail**

Delete `  "parse-issue",` from `LEGACY_PAGES`.
Run: `npx vitest run packages/core/test/rule-pages.test.ts -t PARSE_ISSUE`
Expected: FAIL on the missing sections and on `sources` not being empty.

- [ ] **Step 2: Write the page**

Replace `rules/parse-issue.md` with (the first fence is indented with four spaces on purpose; the second with tabs):

````md
---
id: PARSE_ISSUE
name: "TMDL could not be fully parsed"
category: Error Prevention
severity: error
scope: [File]
status: builtin
video:
sources:
---

# TMDL could not be fully parsed

## What it checks

Lines the TMDL parser could not use: space indentation, an unterminated code fence, a line at an impossible indentation, a line in no form the parser recognizes, and a `///` description with a blank line between it and its declaration.

Each finding names the file and the line and says what was wrong with it, as `space indentation (TMDL requires tabs): column Amount`.

## Example

```tmdl fires
table Sales
    column Amount
        dataType: decimal
```

```tmdl fixed
table Sales
	column Amount
		dataType: decimal
```

The first snippet is indented with spaces, so both lines under the table are reported, and the model pbiplint checks has a Sales table with no columns.

## Why it matters

The parser skipped the line, so whatever it declared, a column, a property, a measure, is missing from the model the rules see. Findings on that object and on anything that references it may be missing or wrong, and a result that looks clean may not be. The orphaned description is the mild case: no declaration is lost, only the description, which stops at the blank line instead of reaching the object below it, so that object is read as having none. Tabular Editor's TMDL reader is stricter and refuses to open a file that puts a blank line after a `///` line at all.

## How to fix it

Open the file at the reported line. TMDL is indented with tabs, and expression blocks open and close with ``` on their own lines. A `///` description must sit directly above its declaration, with no blank line between them. Power BI Desktop writes valid TMDL, so a parse issue usually means a hand edit or a merge conflict marker.

## When to ignore it

Not on purpose. A parse issue means the model pbiplint checked is not the model in the file, so every other result on that file is in doubt until the line is fixed. The one exception is a line that Power BI Desktop wrote and opens without complaint and pbiplint still reports: that is a gap in pbiplint's parser. Report it with the line. Until it is fixed, only the project-wide switch quiets it, and that also hides real parse issues, so weigh the two.

## Links

- [TMDL overview on Microsoft Learn](https://learn.microsoft.com/analysis-services/tmdl/tmdl-overview)
````

- [ ] **Step 3: Regenerate and run the tests**

Run: `npm run build -w @pbiplint/core && node scripts/sync-rule-pages.mjs && npx vitest run packages/core/test/rule-pages.test.ts packages/cli/test/rule-help.test.ts packages/web/test/generate.test.ts`
Expected: PASS. The `generateSite` test still finds "an unterminated code fence" in the parse-issue meta description, since the first paragraph is unchanged. The help for `PARSE_ISSUE` ends its "When to ignore it" with the file-scope sentence, not the annotation.

- [ ] **Step 4: Commit**

```bash
git add rules/parse-issue.md packages/core/test/rule-pages.test.ts packages/core/src/rules/rule-summaries.data.ts packages/cli/src/rule-help.data.ts
git commit -m "docs(rules): parse-issue on the complete template"
```

---

### Task 8: Proof page: the live-model path

**Files:**
- Modify: `rules/avoid-bi-directional-relationships-against-high-cardinality-columns.md` (replace)
- Modify: `packages/core/test/rule-pages.test.ts` (remove one slug)
- Regenerate: the two data files

- [ ] **Step 1: Remove the slug and see the test fail**

Delete `  "avoid-bi-directional-relationships-against-high-cardinality-columns",` from `LEGACY_PAGES`.
Run: `npx vitest run packages/core/test/rule-pages.test.ts -t "HIGH-CARDINALITY"`
Expected: FAIL on `sources` having two entries and on Links carrying bare URLs.

- [ ] **Step 2: Write the page**

Replace the file with:

````md
---
id: AVOID_BI-DIRECTIONAL_RELATIONSHIPS_AGAINST_HIGH-CARDINALITY_COLUMNS
name: "Avoid bi-directional relationships against high-cardinality columns"
category: Performance
severity: warning
scope: [Column, CalculatedColumn, CalculatedTableColumn]
status: needsLiveModel
video:
sources:
  - https://github.com/microsoft/Analysis-Services/blob/master/BestPracticeRules/BPARules.json
---

# Avoid bi-directional relationships against high-cardinality columns

## What it checks

Columns in a bi-directional relationship that have more than 100,000 distinct values. Cardinality is a statistic of the loaded data, not of the model files, so pbiplint lists this rule but does not run it: it needs column statistics that only a live model carries.

## Why it matters

A bi-directional relationship makes the engine propagate filters both ways on every query that touches either table. On a key with a few hundred values that is cheap. On a key with hundreds of thousands of values, the expanded filter list is built and applied on every evaluation, and the cost shows up as slow visuals that look innocent in the model view.

## How to fix it

Find the cardinality first. In Power BI Desktop's DAX query view, run a query such as `EVALUATE ROW("n", DISTINCTCOUNT('Sales'[Order ID]))` for each column in a bi-directional relationship. Then set the relationship back to single direction in the model view, or remove `crossFilteringBehavior: bothDirections` from it in the TMDL file, and where one report needs the reverse filter, get it from a measure with CROSSFILTER or TREATAS. DAX Studio's VertiPaq Analyzer shows every column's cardinality at once, and if you already use Tabular Editor, the walkthrough under Links loads the same statistics into its Best Practice Analyzer, which can then run this rule directly.

## Related rules

- `AVOID_EXCESSIVE_BI-DIRECTIONAL_OR_MANY-TO-MANY_RELATIONSHIPS` counts the same relationships without needing statistics, and fires when they are more than 30 percent of the model's relationships.
- `CHECK_IF_BI-DIRECTIONAL_AND_MANY-TO-MANY_RELATIONSHIPS_ARE_VALID` lists every bi-directional and many-to-many relationship for review, whatever its cardinality.

## Links

- [Loading VertiPaq statistics into Tabular Editor's Best Practice Analyzer](https://www.elegantbi.com/post/vertipaqintabulareditor)
````

- [ ] **Step 3: Regenerate and run the tests**

Run: `npm run build -w @pbiplint/core && node scripts/sync-rule-pages.mjs && npx vitest run packages/core/test/rule-pages.test.ts packages/cli/test/rule-help.test.ts packages/web/test/generate.test.ts`
Expected: PASS. The "meets the complete template" block runs for this page with the example and ignore tests skipped, and the two related ids resolve to real rules.

- [ ] **Step 4: Commit**

```bash
git add rules/avoid-bi-directional-relationships-against-high-cardinality-columns.md packages/core/test/rule-pages.test.ts packages/core/src/rules/rule-summaries.data.ts packages/cli/src/rule-help.data.ts
git commit -m "docs(rules): the live-model proof page on the complete template"
```

---

### Task 9: The scaffold and CONTRIBUTING

**Files:**
- Modify: `scripts/generate-rule-pages.mjs:18-59`
- Modify: `CONTRIBUTING.md:46-55`

- [ ] **Step 1: Rewrite the scaffold's page body**

Replace from `const sources = …` through `writeFileSync(path, lines.join("\n"));` with:

```js
  const sources = rule.status === "builtin" ? [] : [RULESET_URL];
  // A live-model rule never runs, so it has no example to show and no finding to ignore.
  const runs = rule.status !== "needsLiveModel";
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
    "TODO: the exact condition the rule tests, in one or two sentences.",
    ...(runs
      ? []
      : [
          "",
          "TODO: after the condition, say that pbiplint lists this rule but does not run it, because it needs column statistics that only a live model carries and a TMDL file does not.",
        ]),
    ...(runs
      ? [
          "",
          "## Example",
          "",
          "```tmdl fires",
          "TODO: the smallest TMDL that fires the rule",
          "```",
          "",
          "```tmdl fixed",
          "TODO: the same TMDL with the fix applied",
          "```",
        ]
      : []),
    "",
    "## Why it matters",
    "",
    "TODO: the practical consequence for a report author or a refresh, in pbiplint's own words.",
    "",
    "## How to fix it",
    "",
    "TODO: a route that needs no third-party tool: Power BI Desktop, Power Query, the source, or the TMDL file. Name the Desktop route and the TMDL property where both exist.",
    ...(runs
      ? [
          "",
          "## When to ignore it",
          "",
          "TODO: the situations in which the finding is noise, or one sentence saying there are none. The annotation and config lines are generated; do not write them here.",
        ]
      : []),
    ...(rule.references.length > 0
      ? ["", "## Links", "", ...rule.references.map((u) => `- [TODO: what this is](${u})`)]
      : []),
    "",
  ];
  writeFileSync(path, lines.join("\n"));
```

Check it runs without writing: `npm run build -w @pbiplint/core && node scripts/generate-rule-pages.mjs` prints `wrote 0 rule page(s)`.

- [ ] **Step 2: Rewrite the Rule pages section of CONTRIBUTING**

Replace the section from `## Rule pages` up to (not including) `## Testing a pull request` with:

```md
## Rule pages

Every rule has a page in `rules/`, written in pbiplint's own words. The rule-pages test checks them. The site renders each page at `pbiplint.com/rules/<slug>`; the build regenerates it from the Markdown, so a merged page edit is live after the next deploy. The template is specified in `docs/superpowers/specs/2026-09-19-rule-pages-template-design.md`.

Sections, in this order: What it checks, Example, Why it matters, How to fix it, When to ignore it, Quirks, Related rules, Links. The first five are required. A rule that needs a live model has no Example and no When to ignore it, because it never runs. Quirks, Related rules, and Links appear only when there is something to say.

- `node scripts/generate-rule-pages.mjs` scaffolds a page for any rule that has none, with TODO placeholders that the test rejects until they are replaced. It never touches an existing page and never copies prose from the ruleset. Build core first.
- Do not paste the ruleset's description text into a page. `sources` in the frontmatter is the attribution: the ruleset URL and nothing else, empty for a built-in rule. The site prints it as a line under the page. Further reading goes under Links as `[text](url)`, never a bare URL and never a URL that is already in `sources`.
- The first paragraph of What it checks is the rule's description in tool output. Keep it to the condition, in one or two sentences. A second paragraph may show the finding as the tool prints it.
- Example holds two fenced blocks, one with the info string `tmdl fires` and one with `tmdl fixed`, and no captions: the site and the SARIF help add them. The test lints both through the engine. The first must produce a finding for the rule and no parse issue; the second must produce neither. Neither may carry a `pbiplint.ignore` annotation. Snippets are minimal and need not be clean on other rules.
- Every How to fix it gives a route that needs no third-party tool: Power BI Desktop, Power Query, the source system, or a direct edit to the TMDL file, which Desktop preserves. Name the Desktop route and the TMDL property where both exist. Tabular Editor may be mentioned as an optional bulk shortcut or a linked walkthrough, and only after that route. No Tabular Editor fix expressions or other C# on the pages.
- When to ignore it is the judgment only: the cases where the finding is noise, or a sentence saying there are none. The annotation and config lines are generated from the rule id (`ignoreHelp` in core) onto the page and into the help block, and the test rejects a page that writes them by hand.
- Document every quirk kept from the source rule under Quirks.
- Related rules is a bulleted list. Each bullet opens with a rule id in backticks and says how the rules relate. The test checks the ids. On the site, a rule id in backticks anywhere on a page links to that rule's page.
- The pages also feed tool output. After editing a page, run `npm run build -w @pbiplint/core && node scripts/sync-rule-pages.mjs` to regenerate `packages/core/src/rules/rule-summaries.data.ts` and `packages/cli/src/rule-help.data.ts`; the rule-pages tests fail until they match.
- `LEGACY_PAGES` in `packages/core/test/rule-pages.test.ts` lists the pages not yet on this template. Migrate a page by bringing it up to the template and removing its slug.

```

- [ ] **Step 3: Check and commit**

Run: `npm run lint && grep -c $'\u2014' CONTRIBUTING.md scripts/generate-rule-pages.mjs`
Expected: lint passes; both counts are 0.

```bash
git add scripts/generate-rule-pages.mjs CONTRIBUTING.md
git commit -m "docs: the scaffold and CONTRIBUTING describe the complete template"
```

---

### Task 10: Full verification and pull request 1

**Files:** none new.

- [ ] **Step 1: Run everything CI runs**

```bash
npm run lint && npm run typecheck && npm test && npm run build && npm run check:browser && npm run check:pack && npm run test:e2e
```

Expected: all green. If the browser suite reports an axe violation on `/rules/hide-foreign-keys/`, it is the new markup: a `figure` needs no role, a `figcaption` needs no label, so look for a contrast issue in `.example figcaption` or `.sources` and fix the CSS.

- [ ] **Step 2: Check the branch for closing keywords and em dashes**

```bash
git log --format=%B main..HEAD | grep -inE '\b(close[sd]?|fix(e[sd])?|resolve[sd]?)\b[[:space:]]*#[0-9]+' ; git diff main..HEAD | grep -c $'\u2014'
```

Expected: no keyword lines; em dash count 0.

- [ ] **Step 3: Push and open the pull request**

```bash
git push -u origin rule-pages-template
gh auth switch --user TheDataPractitioner
gh pr create --repo pbiplint/pbiplint --base main --head rule-pages-template --title "Rule pages: the complete template, tooling and four proof pages" --body-file - <<'EOF'
Pull request 1 of the work tracked in #45. The template, the tooling that keeps pages honest, and four proof pages, one per code path.

- `ignoreHelp` in core writes the ignore mechanics once. The site build carries a copy a test holds equal, because the build imports nothing from core.
- The site renders `tmdl fires` and `tmdl fixed` fences as captioned figures, links any backticked rule id to its page, appends the mechanics to When to ignore it, and prints `sources` as an attribution line.
- The SARIF help block gains Example and When to ignore it.
- The rule-pages test lints every migrated page's example through the engine: the fires snippet must produce a finding and the fixed snippet must not. `LEGACY_PAGES` phases the migration; each batch removes its slugs.
- Proof pages: hide-foreign-keys (ported), avoid-using-1-x-y-syntax (a DAX rule), parse-issue (built in, empty sources, inverted parse check), and the bi-directional high-cardinality page (needs a live model, so no example and no ignore section).
- Scaffold and CONTRIBUTING describe the template. The spec and plan are under docs/superpowers.

Next: one pull request per category, Naming Conventions first.

🤖 Generated with [Claude Code](https://claude.com/claude-code)

https://claude.ai/code/session_01WVdKDnH74zRc1As3VDtmy6
EOF
gh auth switch --user michaelmckinleyconsulting
```

- [ ] **Step 4: Stop**

Report the pull request URL and stop. Michael reviews and merges. Tick the first four boxes of issue #45 by hand after the merge (settle the template; executable examples; tool output; renderer).

---

## The batches: pull requests 2 to 7

Each batch is one task. The steps are the same for every batch; the slugs and the count differ. Start a batch only after the previous pull request has merged.

The drafting subagent gets this brief, verbatim, plus the batch's slugs:

> Bring these rule pages up to the complete template. Read `docs/superpowers/specs/2026-09-19-rule-pages-template-design.md` sections 4, 5, 6, 7, and 13, and the four finished pages `rules/hide-foreign-keys.md`, `rules/avoid-using-1-x-y-syntax.md`, `rules/parse-issue.md`, and `rules/avoid-bi-directional-relationships-against-high-cardinality-columns.md` as the models to match. For each page: keep the first paragraph of What it checks unless it is wrong; add a second paragraph with the finding's shape when the tool's line is not obvious; write an Example with a `tmdl fires` fence and a `tmdl fixed` fence, minimal, realistic names, tabs for indentation, and run both through the engine with `node --input-type=module -e` against `packages/core/dist/index.js` (build core first) to prove the first produces a finding for the rule and no PARSE_ISSUE and the second produces neither; keep Why it matters; make How to fix it name the Power BI Desktop route and the TMDL property where both exist and never a third-party tool as the route; write When to ignore it as the judgment only, never the annotation or config lines; keep Quirks, and add any quirk the rule's implementation under `packages/core/src/rules/microsoft-bpa/` keeps from the source; add Related rules only where a real relation exists, each bullet opening with an exact rule id from `grep -h '^id:' rules/*.md`; set `sources` to the ruleset URL only and move any other URL to Links with descriptive text. A live-model page (status needsLiveModel) gets no Example and no When to ignore it, and its What it checks says pbiplint lists the rule but does not run it because it needs column statistics that only a live model carries. No em dashes. No ruleset text. No "fix expression". Write in the voice of the four finished pages.

### Task 11: Batch: Naming Conventions (3 pages)

- [ ] **Step 1: Branch**

```bash
git switch main && git pull --ff-only && git switch -c rule-pages-naming-conventions
```

- [ ] **Step 2: List the slugs**

Run: `grep -l '^category: Naming Conventions$' rules/*.md | xargs -n1 basename | sed 's/\.md$//'`

- [ ] **Step 3: Draft**

Dispatch one Opus subagent with the brief above and the slugs. It edits the pages in place and reports which snippets it verified and how.

- [ ] **Step 4: Review every page**

For each page, read it whole and check against the Global Constraints and spec section 13. Fix what is wrong. Then remove the batch's slugs from `LEGACY_PAGES` in `packages/core/test/rule-pages.test.ts`.

- [ ] **Step 5: Regenerate and test**

```bash
npm run build -w @pbiplint/core && node scripts/sync-rule-pages.mjs && npm run lint && npm run typecheck && npm test && npm run build
```

Expected: all green. A failing example test names the page and whether the fires snippet did not fire or the fixed snippet still fired; fix the snippet, not the test.

- [ ] **Step 6: Commit, push, open the pull request, stop**

```bash
git add rules packages/core/test/rule-pages.test.ts packages/core/src/rules/rule-summaries.data.ts packages/cli/src/rule-help.data.ts
git commit -m "docs(rules): Naming Conventions pages on the complete template"
git push -u origin rule-pages-naming-conventions
gh auth switch --user TheDataPractitioner
gh pr create --repo pbiplint/pbiplint --base main --head rule-pages-naming-conventions --title "Rule pages: Naming Conventions on the complete template" --body-file - <<'EOF'
Batch 1 of the migration tracked in #45: the 3 Naming Conventions pages. Every example is linted by the rule-pages test; the sync data is regenerated.

🤖 Generated with [Claude Code](https://claude.com/claude-code)

https://claude.ai/code/session_01WVdKDnH74zRc1As3VDtmy6
EOF
gh auth switch --user michaelmckinleyconsulting
```

Report the URL and stop for review.

### Task 12: Batch: Maintenance (9 pages)

- [ ] **Step 1: Branch**

```bash
git switch main && git pull --ff-only && git switch -c rule-pages-maintenance
```

- [ ] **Step 2: List the slugs**

Run: `grep -l '^category: Maintenance$' rules/*.md | xargs -n1 basename | sed 's/\.md$//'`

- [ ] **Step 3: Draft**

Dispatch one Opus subagent with the brief above and the slugs. It edits the pages in place and reports which snippets it verified and how.

- [ ] **Step 4: Review every page**

For each page, read it whole and check against the Global Constraints and spec section 13. Fix what is wrong. Then remove the batch's slugs from `LEGACY_PAGES` in `packages/core/test/rule-pages.test.ts`.

- [ ] **Step 5: Regenerate and test**

```bash
npm run build -w @pbiplint/core && node scripts/sync-rule-pages.mjs && npm run lint && npm run typecheck && npm test && npm run build
```

Expected: all green.

- [ ] **Step 6: Commit, push, open the pull request, stop**

```bash
git add rules packages/core/test/rule-pages.test.ts packages/core/src/rules/rule-summaries.data.ts packages/cli/src/rule-help.data.ts
git commit -m "docs(rules): Maintenance pages on the complete template"
git push -u origin rule-pages-maintenance
gh auth switch --user TheDataPractitioner
gh pr create --repo pbiplint/pbiplint --base main --head rule-pages-maintenance --title "Rule pages: Maintenance on the complete template" --body-file - <<'EOF'
Batch 2 of the migration tracked in #45: the 9 Maintenance pages. Every example is linted by the rule-pages test; the sync data is regenerated.

🤖 Generated with [Claude Code](https://claude.com/claude-code)

https://claude.ai/code/session_01WVdKDnH74zRc1As3VDtmy6
EOF
gh auth switch --user michaelmckinleyconsulting
```

Report the URL and stop for review.

### Task 13: Batch: Error Prevention (8 pages; parse-issue is already done)

- [ ] **Step 1: Branch**

```bash
git switch main && git pull --ff-only && git switch -c rule-pages-error-prevention
```

- [ ] **Step 2: List the slugs**

Run: `grep -l '^category: Error Prevention$' rules/*.md | xargs -n1 basename | sed 's/\.md$//' | grep -v '^parse-issue$'`

- [ ] **Step 3: Draft**

Dispatch one Opus subagent with the brief above and the slugs. It edits the pages in place and reports which snippets it verified and how.

- [ ] **Step 4: Review every page**

For each page, read it whole and check against the Global Constraints and spec section 13. Fix what is wrong. Then remove the batch's slugs from `LEGACY_PAGES` in `packages/core/test/rule-pages.test.ts`.

- [ ] **Step 5: Regenerate and test**

```bash
npm run build -w @pbiplint/core && node scripts/sync-rule-pages.mjs && npm run lint && npm run typecheck && npm test && npm run build
```

Expected: all green.

- [ ] **Step 6: Commit, push, open the pull request, stop**

```bash
git add rules packages/core/test/rule-pages.test.ts packages/core/src/rules/rule-summaries.data.ts packages/cli/src/rule-help.data.ts
git commit -m "docs(rules): Error Prevention pages on the complete template"
git push -u origin rule-pages-error-prevention
gh auth switch --user TheDataPractitioner
gh pr create --repo pbiplint/pbiplint --base main --head rule-pages-error-prevention --title "Rule pages: Error Prevention on the complete template" --body-file - <<'EOF'
Batch 3 of the migration tracked in #45: the 8 remaining Error Prevention pages. Every example is linted by the rule-pages test; the sync data is regenerated.

🤖 Generated with [Claude Code](https://claude.com/claude-code)

https://claude.ai/code/session_01WVdKDnH74zRc1As3VDtmy6
EOF
gh auth switch --user michaelmckinleyconsulting
```

Report the URL and stop for review.

### Task 14: Batch: DAX Expressions (11 pages; avoid-using-1-x-y-syntax is already done)

- [ ] **Step 1: Branch**

```bash
git switch main && git pull --ff-only && git switch -c rule-pages-dax-expressions
```

- [ ] **Step 2: List the slugs**

Run: `grep -l '^category: DAX Expressions$' rules/*.md | xargs -n1 basename | sed 's/\.md$//' | grep -v '^avoid-using-1-x-y-syntax$'`

- [ ] **Step 3: Draft**

Dispatch one Opus subagent with the brief above and the slugs. It edits the pages in place and reports which snippets it verified and how.

- [ ] **Step 4: Review every page**

For each page, read it whole and check against the Global Constraints and spec section 13. Fix what is wrong. Then remove the batch's slugs from `LEGACY_PAGES` in `packages/core/test/rule-pages.test.ts`.

- [ ] **Step 5: Regenerate and test**

```bash
npm run build -w @pbiplint/core && node scripts/sync-rule-pages.mjs && npm run lint && npm run typecheck && npm test && npm run build
```

Expected: all green.

- [ ] **Step 6: Commit, push, open the pull request, stop**

```bash
git add rules packages/core/test/rule-pages.test.ts packages/core/src/rules/rule-summaries.data.ts packages/cli/src/rule-help.data.ts
git commit -m "docs(rules): DAX Expressions pages on the complete template"
git push -u origin rule-pages-dax-expressions
gh auth switch --user TheDataPractitioner
gh pr create --repo pbiplint/pbiplint --base main --head rule-pages-dax-expressions --title "Rule pages: DAX Expressions on the complete template" --body-file - <<'EOF'
Batch 4 of the migration tracked in #45: the 11 remaining DAX Expressions pages. Every example is linted by the rule-pages test; the sync data is regenerated.

🤖 Generated with [Claude Code](https://claude.com/claude-code)

https://claude.ai/code/session_01WVdKDnH74zRc1As3VDtmy6
EOF
gh auth switch --user michaelmckinleyconsulting
```

Report the URL and stop for review.

### Task 15: Batch: Formatting (14 pages; hide-foreign-keys is already done)

- [ ] **Step 1: Branch**

```bash
git switch main && git pull --ff-only && git switch -c rule-pages-formatting
```

- [ ] **Step 2: List the slugs**

Run: `grep -l '^category: Formatting$' rules/*.md | xargs -n1 basename | sed 's/\.md$//' | grep -v '^hide-foreign-keys$'`

- [ ] **Step 3: Draft**

Dispatch one Opus subagent with the brief above and the slugs. It edits the pages in place and reports which snippets it verified and how.

- [ ] **Step 4: Review every page**

For each page, read it whole and check against the Global Constraints and spec section 13. Fix what is wrong. Then remove the batch's slugs from `LEGACY_PAGES` in `packages/core/test/rule-pages.test.ts`.

- [ ] **Step 5: Regenerate and test**

```bash
npm run build -w @pbiplint/core && node scripts/sync-rule-pages.mjs && npm run lint && npm run typecheck && npm test && npm run build
```

Expected: all green.

- [ ] **Step 6: Commit, push, open the pull request, stop**

```bash
git add rules packages/core/test/rule-pages.test.ts packages/core/src/rules/rule-summaries.data.ts packages/cli/src/rule-help.data.ts
git commit -m "docs(rules): Formatting pages on the complete template"
git push -u origin rule-pages-formatting
gh auth switch --user TheDataPractitioner
gh pr create --repo pbiplint/pbiplint --base main --head rule-pages-formatting --title "Rule pages: Formatting on the complete template" --body-file - <<'EOF'
Batch 5 of the migration tracked in #45: the 14 remaining Formatting pages. Every example is linted by the rule-pages test; the sync data is regenerated.

🤖 Generated with [Claude Code](https://claude.com/claude-code)

https://claude.ai/code/session_01WVdKDnH74zRc1As3VDtmy6
EOF
gh auth switch --user michaelmckinleyconsulting
```

Report the URL and stop for review.

### Task 16: Batch: Performance (23 pages; the live-model proof page is already done), and the finish

**Files beyond the pages:**
- Modify: `packages/core/test/rule-pages.test.ts` (delete `LEGACY_PAGES` and what reads it)
- Modify: `README.md:83`

- [ ] **Step 1: Branch**

```bash
git switch main && git pull --ff-only && git switch -c rule-pages-performance
```

- [ ] **Step 2: List the slugs**

Run: `grep -l '^category: Performance$' rules/*.md | xargs -n1 basename | sed 's/\.md$//' | grep -v '^avoid-bi-directional-relationships-against-high-cardinality-columns$'`

Four of these are live-model pages (fix-referential-integrity-violations, large-tables-should-be-partitioned, reduce-usage-of-long-length-columns-with-high-cardinality, split-date-and-time): no Example, no When to ignore it, and What it checks says the rule is listed but not run. Say so in the subagent's brief.

- [ ] **Step 3: Draft**

Dispatch two Opus subagents, each with the brief above and half the slugs, since 23 pages is more than one context comfortably holds. Each edits its pages in place and reports which snippets it verified and how.

- [ ] **Step 4: Review every page**

For each page, read it whole and check against the Global Constraints and spec section 13. Fix what is wrong.

- [ ] **Step 5: Retire `LEGACY_PAGES`**

In `packages/core/test/rule-pages.test.ts`: delete the `LEGACY_PAGES` constant and its comment, delete the `describe("LEGACY_PAGES", …)` block, delete the `const migrated = …` line, change `describe.runIf(migrated)(` to `describe(`, and change the required-headings list in the first test to `["## What it checks", "## Why it matters", "## How to fix it"]` with the comment above it reduced to `// Every page has these; the template block below checks the rest.` In `CONTRIBUTING.md`, delete the bullet that names `LEGACY_PAGES`.

- [ ] **Step 6: Update the README paragraph**

In `README.md`, replace the sentence `Each rule has a page at https://pbiplint.com/rules (source under \`rules/\`) with what it checks, why, how to fix it, and known quirks.` with:

```md
Each rule has a page at https://pbiplint.com/rules (source under `rules/`) with what it checks, an example that fires it and the same example fixed, why it matters, how to fix it, when ignoring it is legitimate, known quirks, and related rules.
```

- [ ] **Step 7: Regenerate and test**

```bash
npm run build -w @pbiplint/core && node scripts/sync-rule-pages.mjs && npm run lint && npm run typecheck && npm test && npm run build && npm run test:e2e
```

Expected: all green, and `grep -c LEGACY_PAGES packages/core/test/rule-pages.test.ts CONTRIBUTING.md` prints 0 for both files.

- [ ] **Step 8: Commit, push, open the pull request, stop**

```bash
git add rules packages/core/test/rule-pages.test.ts packages/core/src/rules/rule-summaries.data.ts packages/cli/src/rule-help.data.ts README.md CONTRIBUTING.md
git commit -m "docs(rules): Performance pages on the complete template; every page is migrated"
git push -u origin rule-pages-performance
gh auth switch --user TheDataPractitioner
gh pr create --repo pbiplint/pbiplint --base main --head rule-pages-performance --title "Rule pages: Performance on the complete template, and the template is now required everywhere" --body-file - <<'EOF'
Batch 6, the last of the migration tracked in #45: the 23 remaining Performance pages, four of them live-model pages. LEGACY_PAGES is gone, so the rule-pages test now requires the complete template on every page. The README names the sections.

After this merges, every box on the issue can be ticked and the issue closed by hand.

🤖 Generated with [Claude Code](https://claude.com/claude-code)

https://claude.ai/code/session_01WVdKDnH74zRc1As3VDtmy6
EOF
gh auth switch --user michaelmckinleyconsulting
```

Report the URL and stop. After the merge, tick the remaining boxes on issue #45 and close it by hand.
