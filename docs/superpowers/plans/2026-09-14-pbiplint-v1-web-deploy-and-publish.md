# pbiplint v1 web app, Pages deploy, and npm publish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship pbiplint.com (paste or drop a model, ranked results with export, a page per rule, an about page, nothing uploaded), deploy it to GitHub Pages on every push to main, and publish `pbiplint` and `@pbiplint/core` to npm as version 0.1.0.

**Architecture:** A third workspace, `packages/web`, is a static Vite site with no framework. The home page imports the core (`lint()`) straight from `packages/core/src` through an alias, reads dropped folders with the browser's file APIs, and renders the ranked groups into the DOM. Rule pages, the rules index, and the about page are generated from `rules/*.md` and `content/about.md` at build time into gitignored folders that Vite takes as page entries. A build-time check fails the deploy if any HTML, JS, or CSS in `dist/` references a network API or an external resource, and every built page carries a Content-Security-Policy meta tag with `connect-src 'none'` so the browser itself enforces the no-upload claim. Deploy is a Pages workflow; publishing is a tag-triggered workflow with npm trusted publishing after a one-time manual first publish.

**Tech Stack:** TypeScript strict, Vite 8, marked (build-time Markdown), @fontsource-variable/inter (bundled font), Vitest with happy-dom for DOM tests, GitHub Actions (Pages and release), Cloudflare DNS, npm trusted publishing.

**Spec:** `docs/superpowers/specs/2026-09-04-pbiplint-v1-design.md` (sections 9, 11, 13, 14, plus the section 5 correction in Task 13). Plan 1 (`docs/superpowers/plans/2026-09-04-pbiplint-v1-core-and-cli.md`) is merged to main as PR #1 (2da92e4); this plan starts from that main.

## Global Constraints

- Node 20 or later for the published packages (`engines.node: ">=20"`). Vite 8 needs `^20.19.0 || >=22.12.0`, which CI's `node: [20, 22]` matrix satisfies; the web package is private and never published.
- `packages/core` stays browser-pure: no `node:` imports, no `fetch`, no `process`, no `require`; `npm run check:browser` enforces it. `packages/core` and `packages/cli` have no runtime `dependencies`.
- The site makes no network request after load: no analytics, no fonts from a CDN, no external scripts or styles. Every built page carries `<meta http-equiv="Content-Security-Policy" content="... connect-src 'none' ...">` and the site check that runs inside `vite build` (`packages/web/src/build/check-site.ts`) fails the build otherwise.
- Web source uses `module: ESNext`, `moduleResolution: bundler`; relative imports inside `packages/web/src` still end in `.js` to match the rest of the repo.
- Rule page URL stays `https://pbiplint.com/rules/<slug>` (core's `ruleUrl`). The site serves each page at `/rules/<slug>/index.html`, so `/rules/<slug>` redirects to `/rules/<slug>/` on GitHub Pages and both work. Site-internal links use the trailing-slash form.
- Tabular Editor is never required by users, by the CLI, or by CI. Task 1 uses it as a development-time oracle only; `te` 0.5.2 at `~/.local/bin/te` expires 2026-09-30, so do Task 1 first.
- Rule pages are pbiplint's own prose: no ruleset text, no Tabular Editor C#. The generator only renders them; it never rewrites them.
- No em dashes anywhere in the repo (code, HTML copy, comments, docs, commit messages). Commit messages are imperative and end with the attribution trailers Claude Code provides.
- Do not create or edit files under OneDrive. Brand assets are copied from `~/Downloads/pbip-lint-spike/branding/`.
- `gh` global account stays `michaelmckinleyconsulting`. Commands that need org rights run with `GH_TOKEN="$(gh auth token --user TheDataPractitioner)"` in front of the one command, never `gh auth switch`.
- Product naming avoids Microsoft trademarks; "for Power BI projects" in descriptive text is fine.

---

## Ground truth captured for this plan (read before starting)

**Repo state (2026-09-14):** main at 2da92e4. 865 tests, lint and typecheck clean, core browser bundle 96.4 KB minified. Packages: `packages/core` (`@pbiplint/core` 0.0.0) and `packages/cli` (`pbiplint` 0.0.0). 72 rule pages under `rules/` (71 ruleset rules plus `PARSE_ISSUE`): 66 `ported`, 5 `needsLiveModel`, 1 `builtin`. The sample `examples/messy-sales` has 11 `.tmdl` files under `definition/` and lints to 161 findings (16 errors, 39 warnings, 106 info).

**Core API the site uses (all exported from `@pbiplint/core`):**

```ts
lint(files: LintFile[], options?: { config?: PbiplintConfig | ResolvedConfig }): LintResult
// LintFile = { path: string; text: string }   path relative to the model root, forward slashes
// LintResult = { model, findings, groups: RankedGroup[], summary: LintSummary, failed: boolean }
// RankedGroup = { rule: RuleSummary, findings: Finding[] }
// RuleSummary = { id, name, category, severity: 1|2|3, slug, url, status }
// Finding = { ruleId, objectType, objectName, location?: { file, line }, detail? }
// LintSummary = { files, findings, errors, warnings, infos, rulesRun, rulesSkipped, ruleErrors, ignored, unknownRules }
resolveConfig(raw?: unknown): ResolvedConfig          // throws ConfigError on a bad shape
formatMarkdown(result, options?), formatJson(result, options?)   // options.toolVersion
summaryLine(result): string                            // "161 findings (16 errors, ...) in 11 files"
SEVERITY_LABEL: { 1: "info", 2: "warning", 3: "error" }
CATEGORY_ORDER: readonly Category[]
VERSION: string
```

Task 2 adds `skippedLine(result)` and `topGroups(result, n = 5)` to the exports (they exist in `packages/core/src/format/text.ts` but are not re-exported) and makes `VERSION` come from `package.json`.

**CLI folder walk the browser mirrors (`packages/cli/src/walk.ts`):** a path is a model root when it has a `definition` folder with `.tmdl` files inside; otherwise, if it holds exactly one `*.SemanticModel` folder, recurse into it; more than one is an error naming them; otherwise any `.tmdl` files below it are linted with paths relative to it. Config discovery (`packages/cli/src/config.ts`): the nearest `pbiplint.config.json` at or above the model root.

**Browser file APIs:** a drop gives `DataTransferItem.webkitGetAsEntry()` in every current browser; directory entries are read with `createReader().readEntries()` in batches (Chrome caps a batch at 100 and signals the end with an empty batch). `webkitGetAsEntry()` must be called synchronously inside the drop handler, before any `await`. Chrome and Edge also have `window.showDirectoryPicker()`; Firefox and Safari do not, and get `<input type="file" webkitdirectory>` whose files carry `webkitRelativePath`. TypeScript's `lib.dom` types `FileSystemEntry`, `FileSystemDirectoryEntry`, `FileSystemFileEntry`, and `webkitRelativePath`; it does not type `showDirectoryPicker`, so Task 5 declares a minimal local shape instead of adding `@types/wicg-file-system-access`.

**Versions to pin (checked on npm 2026-09-14):** vite 8.3.0, marked 18.0.13, happy-dom 20.14.5, @fontsource-variable/inter 5.3.0. GitHub Actions latest majors: actions/checkout v7, actions/setup-node v7, actions/configure-pages v6, actions/upload-pages-artifact v5, actions/deploy-pages v5, softprops/action-gh-release v3.

**Hosting facts:** `pbiplint.com` is registered and its nameservers are Cloudflare (`lila.ns.cloudflare.com`, `nolan.ns.cloudflare.com`); the zone has no A, AAAA, CNAME, MX, or TXT records yet. GitHub Pages is not enabled on `pbiplint/pbiplint` (`gh api repos/pbiplint/pbiplint/pages` is 404); the repo's homepage field is already `https://pbiplint.com`. GitHub Pages apex addresses: A `185.199.108.153`, `185.199.109.153`, `185.199.110.153`, `185.199.111.153`; AAAA `2606:50c0:8000::153`, `2606:50c0:8001::153`, `2606:50c0:8002::153`, `2606:50c0:8003::153`; `www` is a CNAME to `pbiplint.github.io`.

**npm facts:** `pbiplint`, `@pbiplint/core`, and `pbip-lint` are all unclaimed. No npm login exists on this Mac (`npm whoami` fails) and the `pbiplint` npm org does not exist. Trusted publishing (OIDC from GitHub Actions, no long-lived token, provenance attached automatically) is configured per package on npmjs.com and needs npm 11.5.1 or later in the workflow; it can only be configured on a package that already exists, so the first publish of each package is done by Michael by hand (Task 14) and every later version publishes from the tag workflow.

**Brand:** dark theme is canonical. Canvas `#0A0E1A`, surfaces `#11172A` / `#18203A` / `#1F2A4A`, inset `#070A14`, text `#E6EDF6` / `#A9B4C7` / `#6B7894`, blue `#2D7DD2` (soft `#4F9DE8`), teal `#00A9A5` (soft `#3FC7C3`), warning `#F0B429`, danger `#E5484D`. Font Inter. The mark is `~/Downloads/pbip-lint-spike/branding/pbiplint-mark-only.svg` (800x800, navy square, teal ring, blue chevron, teal check).

## File structure

```
packages/web/
  package.json                 @pbiplint/web, private; scripts dev, build, preview
  tsconfig.json                browser config: ESNext, bundler resolution, DOM lib, vite/client types, core src path
  vite.config.ts               root = packages/web; core alias; plugins: generate pages, inject CSP (build), check the site (build)
  index.html                   home: paste box, drop zone, sample button, status line, results container
  404.html                     not-found page (Pages serves it for unknown paths)
  content/about.md             about page copy (rendered by src/build/generate.ts)
  public/CNAME                 pbiplint.com
  public/favicon.svg           the mark
  public/robots.txt
  public/schema/pbiplint.config.schema.json
  src/styles.css               tokens, layout, components; imports the bundled Inter
  src/main.ts                  home page wiring: inputs -> lint -> render
  src/build/csp.ts             the CSP string and the Vite plugin that injects it at build
  src/build/pages.ts           page shell, frontmatter parser, rule page, rules index, about page, sitemap (pure)
  src/build/generate.ts        writes the generated pages; Vite plugin that runs it in the config hook and registers entries
  src/build/check-site.ts      dist checks: CSP meta on every page, no external resources, no network APIs; Vite plugin (closeBundle)
  src/input/model-files.ts     pure: pick the model root, files, and config out of a dropped tree
  src/input/read-drop.ts       DOM: DataTransfer entries -> InputEntry[] (only .tmdl and the config are read)
  src/input/pick-folder.ts     DOM: showDirectoryPicker, or a directory input, -> InputEntry[]
  src/sample.ts                examples/messy-sales bundled with import.meta.glob
  src/results/render.ts        LintResult -> DOM: privacy line, summary, fix-first, filters, groups
  src/results/export.ts        Markdown and JSON download and copy
  test/csp.test.ts
  test/model-files.test.ts
  test/read-drop.test.ts
  test/pick-folder.test.ts
  test/sample.test.ts
  test/render.test.ts          (happy-dom)
  test/export.test.ts          (happy-dom)
  test/home.test.ts            (happy-dom) loads index.html, runs main.ts, clicks the sample button
  test/generate.test.ts
  test/check-site.test.ts
  rules/, about/, public/sitemap.xml   generated, gitignored

scripts/sync-version.mjs       writes packages/core/src/version.ts from packages/core/package.json
scripts/check-pack.mjs         npm pack --dry-run for both packages; required and forbidden files; versions equal
scripts/check-release-tag.mjs  the pushed tag equals v<version>
scripts/publish.mjs            publishes each package whose version is not on the registry yet
.github/workflows/pages.yml    build, test, check the site, deploy to Pages on push to main
.github/workflows/release.yml  on tag v*: verify, build, check pack, publish, GitHub release
docs/RELEASING.md              how a release is cut
packages/core/README.md, packages/cli/README.md   what npm shows for each package
```

## Conventions for every task

- Run tests with `npm test -- <pattern>` from the repo root (Vitest, one config for all workspaces; `packages/*/test/**/*.test.ts` are picked up automatically). DOM tests start with the line `// @vitest-environment happy-dom`.
- `npm run typecheck` must stay clean; after Task 3 it also runs `tsc -p packages/web/tsconfig.json`.
- `npm run lint` runs ESLint and a Prettier check over everything not ignored; run `npm run format` before committing when in doubt.
- Web tests import the core through `@pbiplint/core` (aliased to `packages/core/src/index.ts` by `vitest.config.ts`) and web modules through relative `../src/...` paths, never through `dist`.
- Commit after every task with the message given in the task; include only the files the task touched.
- Michael's manual steps (DNS, Pages settings, npm account) are marked **Michael:** and are the only steps an agent must not do on his behalf. When a task reaches one, do everything before it, report exactly what he must do, and continue after he confirms.

---

### Task 1: Pin how a blank line between a `///` description and its object is read

**Files:**
- Test: `packages/core/test/parse.test.ts`
- Possibly modify: `packages/core/src/tmdl/parse.ts`

**Interfaces:**
- Consumes: `parseTmdl(file, text): ParsedFile` (`roots: TmdlNode[]`, each with `children`, `description?`).
- Produces: a parser whose blank-line behavior matches Tabular Editor's TMDL reader, pinned by a unit test.

Background: `parseTmdl` skips blank lines before it looks at `///`, so a description followed by a blank line still attaches to the next declaration. Plan 1 left open whether the TMDL reader does the same. This task settles it with the oracle before the `te` preview expires on 2026-09-30.

- [ ] **Step 1: Build a probe model from the rule-zoo fixture**

Use the session scratchpad directory (call it `$S`), never the repo:

```bash
cp -R tests/fixtures/rule-zoo.SemanticModel "$S/zoo.SemanticModel"
```

Edit `$S/zoo.SemanticModel/definition/tables/Customer.tmdl` so the first three columns read exactly:

```
	/// Described directly
	column 'Customer ID'
		dataType: int64
		isKey
		summarizeBy: none
		sourceColumn: Customer ID

	/// Described across a blank line

	column 'Customer Name'
		dataType: string
		summarizeBy: none
		sourceColumn: Customer Name

	column Region
		dataType: string
		summarizeBy: none
		sourceColumn: Region
```

(`Region` stays undescribed as the control.)

- [ ] **Step 2: Ask both tools which columns have no description**

```bash
te bpa run "$S/zoo.SemanticModel/definition" -r ~/Downloads/pbip-lint-spike/ref/BPARules.json --no-defaults --no-model-rules --output-format json > "$S/te.json"
node -e 'const r=JSON.parse(require("fs").readFileSync(process.argv[1],"utf8")).results.filter(x=>x.ruleId==="OBJECTS_WITH_NO_DESCRIPTION"&&/Customer/.test(x.objectName)).map(x=>x.objectName);console.log(r)' "$S/te.json"
npm run build -w pbiplint >/dev/null
node packages/cli/dist/pbiplint.mjs "$S/zoo.SemanticModel" --format json | node -e 'const d=JSON.parse(require("fs").readFileSync(0,"utf8"));const g=d.groups.find(g=>g.rule.id==="OBJECTS_WITH_NO_DESCRIPTION");console.log(g?g.findings.map(f=>f.objectName).filter(n=>/Customer/.test(n)):[])'
```

Expected from pbiplint today: `'Customer'[Region]` listed, `'Customer'[Customer ID]` and `'Customer'[Customer Name]` not listed. Read Tabular Editor's list:

- **A.** Tabular Editor also omits `'Customer'[Customer Name]`: the reader attaches across a blank line. Keep the parser as is.
- **B.** Tabular Editor lists `'Customer'[Customer Name]`: the reader drops a description at a blank line. Change the parser (Step 3B).
- **C.** `te` refuses to load the model (error mentioning the description or line): a blank line after `///` is invalid TMDL. Change the parser (Step 3C).

If `te` fails for an unrelated reason (license, expiry), record that in the test name below as "not checked against Tabular Editor" and keep behavior A.

- [ ] **Step 3A: Pin behavior A**

Append to the `parseTmdl` describe block in `packages/core/test/parse.test.ts`:

```ts
  it("attaches a /// description across a blank line, as Tabular Editor's reader does (checked 2026-09)", () => {
    const pf = parseTmdl("t.tmdl", "table T\n\t/// Described\n\n\tcolumn A\n\t\tdataType: string\n");
    const column = pf.roots[0]!.children.find((n) => n.kind === "object" && n.type === "column");
    expect(column?.description).toBe("Described");
    expect(pf.issues).toEqual([]);
  });
```

- [ ] **Step 3B: Pin behavior B**

Write the test first (expected to fail with `"Described"`):

```ts
  it("drops a /// description that a blank line separates from its object, as Tabular Editor's reader does (checked 2026-09)", () => {
    const pf = parseTmdl("t.tmdl", "table T\n\t/// Described\n\n\tcolumn A\n\t\tdataType: string\n");
    const column = pf.roots[0]!.children.find((n) => n.kind === "object" && n.type === "column");
    expect(column?.description).toBeUndefined();
    expect(pf.issues).toEqual([]);
  });
```

Then in `packages/core/src/tmdl/parse.ts`, in the blank-line branch at the top of the loop, clear the pending description before `i++`:

```ts
    if (raw.trim() === "") {
      // The TMDL reader does not carry a description across a blank line.
      pendingDescription = [];
      i++;
      continue;
    }
```

Run `npm test -- parity` as well: if an expectation changes, that fixture had this pattern and the change is a real parity fix; keep it and say so in the commit body.

- [ ] **Step 3C: Pin behavior C**

Same test as 3B but expecting one issue: `expect(pf.issues).toEqual([{ file: "t.tmdl", line: 2, text: "\t/// Described", reason: "description is not followed by a declaration" }])`. In the blank-line branch, when `pendingDescription.length` is nonzero, push that issue (line is the first description line, so track `descriptionLine` when the first `///` of a run is pushed) and clear the description.

- [ ] **Step 4: Run the parser and parity tests**

Run: `npm test -- parse` and `npm test -- parity`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/core/test/parse.test.ts packages/core/src/tmdl/parse.ts
git commit -m "test(core): pin how a blank line between a /// description and its object is read"
```

(Use `fix(core): drop a description that a blank line separates from its object` for B or C.)

---

### Task 2: Core polish: SARIF URIs, `$schema`, formatter exports, VERSION from package.json

**Files:**
- Modify: `packages/core/src/format/sarif.ts`, `packages/core/src/format/json.ts`, `packages/core/src/format/index.ts`, `packages/core/src/engine/config.ts`, `packages/core/src/index.ts`, `package.json` (root scripts)
- Create: `scripts/sync-version.mjs`, `packages/core/src/version.ts` (generated, committed), `packages/core/test/version.test.ts`
- Test: `packages/core/test/format.test.ts`, `packages/core/test/engine.test.ts`

**Interfaces:**
- Produces: `skippedLine(result: LintResult): string` and `topGroups(result: LintResult, n?: number): RankedGroup[]` exported from `@pbiplint/core`; `VERSION` equal to `packages/core/package.json` `version`; SARIF `artifactLocation.uri` values percent-encoded per path segment; `pbiplint.config.json` may carry a `$schema` key.

- [ ] **Step 1: Write the failing tests**

Append to `packages/core/test/format.test.ts` (inside the existing top-level describe, or a new `describe("SARIF URIs")`):

```ts
  it("percent-encodes SARIF artifact URIs so a path with spaces is a valid URI", () => {
    const spaced = lint([
      {
        path: "definition/tables/ Spaced .tmdl",
        text: "table ' Spaced '\n\tcolumn 'A B'\n\t\tdataType: string\n\t\tsourceColumn: A B\n",
      },
    ]);
    const sarif = JSON.parse(formatSarif(spaced, { pathPrefix: "my models/demo.SemanticModel" }));
    const uris: string[] = sarif.runs[0].results
      .map((r: { locations?: { physicalLocation: { artifactLocation: { uri: string } } }[] }) =>
        r.locations?.[0]?.physicalLocation.artifactLocation.uri,
      )
      .filter((u: string | undefined): u is string => u !== undefined);
    expect(uris.length).toBeGreaterThan(0);
    for (const u of uris) {
      expect(u).not.toContain(" ");
      expect(u).toBe("my%20models/demo.SemanticModel/definition/tables/%20Spaced%20.tmdl");
    }
  });
```

Append to the `resolveConfig` describe in `packages/core/test/engine.test.ts`:

```ts
  it("accepts a $schema key so editors can validate the file", () => {
    expect(() =>
      resolveConfig({ $schema: "https://pbiplint.com/schema/pbiplint.config.schema.json" }),
    ).not.toThrow();
    expect(() => resolveConfig({ $schema: 1, rulez: {} })).toThrow(/unknown key "rulez"/);
  });
```

Create `packages/core/test/version.test.ts`:

```ts
import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import { skippedLine, topGroups, VERSION } from "../src/index.js";
import { lint } from "../src/engine/lint.js";

const manifest = (path: string): { version: string } =>
  JSON.parse(readFileSync(new URL(path, import.meta.url), "utf8"));

it("reports the version from package.json (run scripts/sync-version.mjs after a bump)", () => {
  expect(VERSION).toBe(manifest("../package.json").version);
});

it("is released in lockstep with the CLI", () => {
  expect(manifest("../../cli/package.json").version).toBe(manifest("../package.json").version);
});

it("exports the summary helpers the site shares with the text format", () => {
  const result = lint([{ path: "definition/model.tmdl", text: "model Model\n" }]);
  expect(skippedLine(result)).toMatch(/rules run/);
  expect(topGroups(result)).toEqual([]);
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npm test -- format engine version`
Expected: the URI test fails on `%20`; the `$schema` test fails with `unknown key "$schema"`; version.test.ts fails to import `skippedLine`.

- [ ] **Step 3: Implement**

`packages/core/src/format/sarif.ts`: replace the `uri` helper.

```ts
  // SARIF artifact URIs are URIs, so each path segment is percent-encoded: a model folder with a
  // space in its name would otherwise produce a location code scanning cannot resolve.
  const encodePath = (p: string): string => p.split("/").map(encodeURIComponent).join("/");
  const uri = (file: string): string => encodePath(prefix ? `${prefix}/${file}` : file);
```

`packages/core/src/engine/config.ts`, in `resolveConfig`:

```ts
  for (const k of Object.keys(raw))
    if (k !== "rules" && k !== "failOn" && k !== "$schema")
      throw new ConfigError(`pbiplint.config.json: unknown key "${k}"`);
```

`scripts/sync-version.mjs`:

```js
#!/usr/bin/env node
// Usage: node scripts/sync-version.mjs
//
// Writes packages/core/src/version.ts from packages/core/package.json, so the core can report its
// version without reading a file at run time (it runs in the browser). The CLI takes its own
// version from its package.json at bundle time (packages/cli/build.mjs). The version test fails
// when the generated file or the two package versions are out of step.
import { readFileSync, writeFileSync } from "node:fs";

const { version } = JSON.parse(readFileSync("packages/core/package.json", "utf8"));
const out = "packages/core/src/version.ts";
writeFileSync(
  out,
  `// Generated by scripts/sync-version.mjs from packages/core/package.json. Do not edit by hand.\nexport const VERSION = ${JSON.stringify(version)};\n`,
);
console.log(`wrote ${version} to ${out}`);
```

Run `node scripts/sync-version.mjs` once to create `packages/core/src/version.ts`.

`packages/core/src/index.ts`: replace `export const VERSION = "0.0.0";` with `export { VERSION } from "./version.js";` and add `skippedLine` and `topGroups` to the `./format/index.js` export list.

`packages/core/src/format/index.ts`: import and re-export them:

```ts
import {
  formatText,
  skippedLine,
  summaryLine,
  topGroups,
  type FormatOptions,
  type RuleHelp,
} from "./text.js";
// ...
export { formatJson, formatMarkdown, formatSarif, formatText, skippedLine, summaryLine, topGroups };
```

`packages/core/src/format/json.ts` and `sarif.ts`: `import { VERSION } from "../version.js";` and use `options.toolVersion ?? VERSION` where they read `?? "0.0.0"`. If a format test pins the literal `0.0.0`, change it to compare against `VERSION`.

Root `package.json` scripts: add `"version:sync": "node scripts/sync-version.mjs"`.

- [ ] **Step 4: Run the suite**

Run: `npm test && npm run typecheck && npm run lint && npm run check:browser`
Expected: all green; the CLI SARIF test still passes (its paths have no spaces, so encoding changes nothing).

- [ ] **Step 5: Commit**

```bash
git add packages/core/src packages/core/test scripts/sync-version.mjs package.json
git commit -m "feat(core): encode SARIF URIs, accept \$schema in config, and take VERSION from package.json"
```

---

### Task 3: Web package scaffold, styles, home page markup, and the CSP plugin

**Files:**
- Create: `packages/web/package.json`, `packages/web/tsconfig.json`, `packages/web/vite.config.ts`, `packages/web/index.html`, `packages/web/404.html`, `packages/web/src/styles.css`, `packages/web/src/main.ts` (placeholder until Task 8), `packages/web/src/build/csp.ts`, `packages/web/public/CNAME`, `packages/web/public/favicon.svg`, `packages/web/public/robots.txt`, `packages/web/public/schema/pbiplint.config.schema.json`
- Modify: `package.json` (root devDependencies and `typecheck`), `.gitignore`, `.prettierignore`, `eslint.config.js`
- Test: `packages/web/test/csp.test.ts`

**Interfaces:**
- Produces: `npm run dev -w @pbiplint/web` serves the home page; `npm run build -w @pbiplint/web` writes `packages/web/dist` with a CSP meta tag on every page (the entries come from a `pages()` helper in `vite.config.ts` that Task 9 moves into the generator plugin); `CSP` string and `cspPlugin()` from `src/build/csp.ts`; element ids on the home page that Task 8 wires: `paste`, `lint-paste`, `drop`, `choose-folder`, `folder-input`, `try-sample`, `status`, `results`.

- [ ] **Step 1: Add the dependencies and root wiring**

Root `package.json`: add to `devDependencies` (keep alphabetical):

```json
    "@fontsource-variable/inter": "^5.3.0",
    "happy-dom": "^20.14.5",
    "marked": "^18.0.13",
    "vite": "^8.3.0",
```

and change `typecheck` to:

```json
    "typecheck": "tsc -b packages/core && tsc -p packages/cli/tsconfig.json && tsc -p packages/web/tsconfig.json && tsc -p tsconfig.test.json",
```

Run `npm install` (updates `package-lock.json`).

`.gitignore`, append:

```
# Generated by packages/web/scripts/generate.mjs
packages/web/rules/
packages/web/about/
packages/web/public/sitemap.xml
```

`.prettierignore`, append the same three paths. `eslint.config.js`, extend the ignores array: `"packages/web/rules/**", "packages/web/about/**"`.

- [ ] **Step 2: Write the failing CSP test**

`packages/web/test/csp.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { CSP, cspPlugin } from "../src/build/csp.js";

describe("content security policy", () => {
  it("forbids every connection and every external resource", () => {
    expect(CSP).toContain("default-src 'none'");
    expect(CSP).toContain("connect-src 'none'");
    expect(CSP).toContain("script-src 'self'");
    expect(CSP).toContain("style-src 'self'");
    expect(CSP).toContain("font-src 'self'");
    expect(CSP).toContain("img-src 'self' data:");
    expect(CSP).not.toMatch(/https?:/);
  });
  it("is injected into the head of every built page, and only at build", () => {
    const plugin = cspPlugin();
    expect(plugin.apply).toBe("build");
    const hook = plugin.transformIndexHtml as unknown as (html: string) => {
      tags: { tag: string; attrs: Record<string, string>; injectTo: string }[];
    };
    const out = hook("<html><head></head></html>");
    expect(out.tags).toEqual([
      {
        tag: "meta",
        attrs: { "http-equiv": "Content-Security-Policy", content: CSP },
        injectTo: "head-prepend",
      },
    ]);
  });
});
```

Run: `npm test -- csp`
Expected: FAIL, module not found.

- [ ] **Step 3: Write the package files**

`packages/web/package.json`:

```json
{
  "name": "@pbiplint/web",
  "private": true,
  "version": "0.0.0",
  "description": "pbiplint.com: the in-browser linter, rule pages, and about page.",
  "license": "AGPL-3.0-or-later",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview"
  }
}
```

(Page generation and the site check run inside Vite itself; Tasks 9 and 10 add them as plugins.)

`packages/web/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "composite": false,
    "declaration": false,
    "sourceMap": false,
    "noEmit": true,
    "module": "ESNext",
    "moduleResolution": "bundler",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "types": ["vite/client", "node"],
    "paths": { "@pbiplint/core": ["../core/src/index.ts"] }
  },
  "include": ["src", "vite.config.ts"]
}
```

(`node` is in `types` because `vite.config.ts` and the build helpers under `src/build` read files; browser code under `src` never imports `node:` modules, and the site check would reject a bundle that did.)

`packages/web/src/build/csp.ts`:

```ts
import type { Plugin } from "vite";

/**
 * The browser enforces the no-upload claim: no connections of any kind, and no script, style, font,
 * or image from anywhere but this origin. Navigating a link is not a fetch, so links to GitHub and
 * Microsoft Learn still work. Injected at build only, because the dev server needs a websocket.
 */
export const CSP = [
  "default-src 'none'",
  "script-src 'self'",
  "style-src 'self'",
  "img-src 'self' data:",
  "font-src 'self'",
  "connect-src 'none'",
  "form-action 'none'",
  "base-uri 'none'",
].join("; ");

export function cspPlugin(): Plugin {
  return {
    name: "pbiplint-csp",
    apply: "build",
    transformIndexHtml(html) {
      return {
        html,
        tags: [
          {
            tag: "meta",
            attrs: { "http-equiv": "Content-Security-Policy", content: CSP },
            injectTo: "head-prepend",
          },
        ],
      };
    },
  };
}
```

`packages/web/vite.config.ts`:

```ts
import { readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import { cspPlugin } from "./src/build/csp.js";

const root = fileURLToPath(new URL(".", import.meta.url));
const repo = fileURLToPath(new URL("../..", import.meta.url));

/** Every index.html under the package (home, about, rules, each rule page) plus 404.html is a page. */
function pages(): Record<string, string> {
  const skip = /^(node_modules|dist|public)(\/|$)/;
  const entries = readdirSync(root, { recursive: true })
    .map(String)
    .filter((p) => !skip.test(p) && (p.endsWith("index.html") || p === "404.html"));
  return Object.fromEntries(
    entries.map((p) => [p.replace(/\/?index\.html$/, "").replace(/\.html$/, "") || "home", join(root, p)]),
  );
}

export default defineConfig({
  root,
  base: "/",
  plugins: [cspPlugin()],
  resolve: {
    alias: { "@pbiplint/core": join(repo, "packages/core/src/index.ts") },
  },
  server: { fs: { allow: [repo] } },
  build: {
    // The preload polyfill calls fetch(), which the site check forbids; every browser the site
    // targets supports modulepreload natively.
    modulePreload: { polyfill: false },
    // Never inline an asset as a data: URI; the CSP allows data: for images only, and a font
    // inlined into the CSS would be blocked.
    assetsInlineLimit: 0,
    sourcemap: false,
    rollupOptions: { input: pages() },
  },
});
```

`packages/web/src/main.ts` (placeholder, replaced in Task 8):

```ts
// Wired in Task 8.
export {};
```

- [ ] **Step 4: Write the stylesheet**

`packages/web/src/styles.css`:

```css
@import "@fontsource-variable/inter";

:root {
  --brand-blue: #2d7dd2;
  --brand-blue-soft: #4f9de8;
  --brand-teal: #00a9a5;
  --brand-teal-soft: #3fc7c3;
  --canvas: #0a0e1a;
  --surface-1: #11172a;
  --surface-2: #18203a;
  --surface-3: #1f2a4a;
  --surface-inset: #070a14;
  --fg-1: #e6edf6;
  --fg-2: #a9b4c7;
  --fg-3: #6b7894;
  --line-1: rgba(230, 237, 246, 0.08);
  --line-2: rgba(230, 237, 246, 0.14);
  --line-3: rgba(230, 237, 246, 0.22);
  --warning: #f0b429;
  --danger: #e5484d;
  --font-sans: "Inter Variable", "Helvetica Neue", Arial, sans-serif;
  --font-mono: ui-monospace, "SF Mono", Menlo, Consolas, monospace;
  --radius: 10px;
  --container: 1080px;
  color-scheme: dark;
}
* {
  box-sizing: border-box;
}
html {
  background: var(--canvas);
  color: var(--fg-1);
  font-family: var(--font-sans);
  line-height: 1.55;
  -webkit-text-size-adjust: 100%;
}
body {
  margin: 0;
}
a {
  color: var(--brand-teal-soft);
}
a:hover {
  color: var(--fg-1);
}
code,
pre,
.mono {
  font-family: var(--font-mono);
  font-size: 0.92em;
}
pre {
  background: var(--surface-inset);
  border: 1px solid var(--line-1);
  border-radius: var(--radius);
  padding: 12px 16px;
  overflow-x: auto;
}
code {
  background: var(--surface-inset);
  padding: 1px 5px;
  border-radius: 4px;
}
pre code {
  background: none;
  padding: 0;
}
h1,
h2,
h3 {
  line-height: 1.2;
  letter-spacing: -0.01em;
}
h1 {
  font-size: clamp(28px, 4vw, 40px);
  margin: 0 0 12px;
}
h2 {
  font-size: 22px;
  margin: 32px 0 8px;
}
h3 {
  font-size: 18px;
  margin: 24px 0 8px;
}
.container {
  max-width: var(--container);
  margin: 0 auto;
  padding: 0 20px;
}
[hidden] {
  display: none !important;
}

/* Header and footer */
.site-header {
  border-bottom: 1px solid var(--line-1);
}
.site-header .container {
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 60px;
}
.brand {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  font-weight: 700;
  font-size: 18px;
  color: var(--fg-1);
  text-decoration: none;
}
.brand img {
  border-radius: 6px;
}
.site-header nav {
  display: flex;
  gap: 20px;
}
.site-header nav a {
  color: var(--fg-2);
  text-decoration: none;
  font-weight: 500;
}
.site-header nav a:hover,
.site-header nav a[aria-current="page"] {
  color: var(--fg-1);
}
main {
  padding: 32px 0 64px;
}
.site-footer {
  border-top: 1px solid var(--line-1);
  padding: 24px 0;
  font-size: 14px;
}
.site-footer p {
  color: var(--fg-3);
  margin: 4px 0;
}

/* Home */
.lede {
  font-size: 18px;
  color: var(--fg-2);
  max-width: 62ch;
  margin: 0 0 24px;
}
.inputs {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 20px;
}
@media (max-width: 760px) {
  .inputs {
    grid-template-columns: 1fr;
  }
}
.panel {
  background: var(--surface-1);
  border: 1px solid var(--line-1);
  border-radius: var(--radius);
  padding: 20px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.panel h2 {
  margin: 0;
  font-size: 18px;
}
textarea {
  width: 100%;
  min-height: 220px;
  background: var(--surface-inset);
  color: var(--fg-1);
  border: 1px solid var(--line-2);
  border-radius: 8px;
  padding: 12px;
  font-family: var(--font-mono);
  font-size: 13px;
  resize: vertical;
}
textarea:focus,
button:focus-visible,
input:focus-visible,
a:focus-visible {
  outline: 2px solid var(--brand-teal);
  outline-offset: 2px;
}
.drop {
  flex: 1;
  min-height: 220px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  text-align: center;
  border: 2px dashed var(--line-3);
  border-radius: 8px;
  padding: 20px;
  color: var(--fg-2);
}
.drop p {
  margin: 0;
}
.drop.over {
  border-color: var(--brand-teal);
  background: rgba(0, 169, 165, 0.08);
}
button,
.button {
  font: inherit;
  font-weight: 600;
  color: #fff;
  background: var(--brand-blue);
  border: 0;
  border-radius: 8px;
  padding: 10px 16px;
  cursor: pointer;
  text-decoration: none;
  display: inline-block;
}
button:hover,
.button:hover {
  background: var(--brand-blue-soft);
  color: #fff;
}
button.secondary,
.button.secondary {
  background: var(--surface-2);
  color: var(--fg-1);
  border: 1px solid var(--line-2);
}
button.secondary:hover,
.button.secondary:hover {
  background: var(--surface-3);
}
.actions {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  align-items: center;
  margin-top: 20px;
}
.hint {
  color: var(--fg-3);
  font-size: 14px;
  margin: 0;
}
.status {
  margin: 16px 0 0;
  padding: 10px 14px;
  border-radius: 8px;
  background: var(--surface-2);
}
.status[data-kind="error"] {
  border-left: 3px solid var(--danger);
}

/* Results */
#results {
  margin-top: 48px;
}
.privacy {
  color: var(--brand-teal-soft);
  font-weight: 500;
}
.summary {
  color: var(--fg-2);
}
.notice {
  border-left: 3px solid var(--warning);
  padding-left: 12px;
  color: var(--fg-2);
}
.fix-first li {
  margin: 4px 0;
}
.filters {
  border: 1px solid var(--line-1);
  border-radius: var(--radius);
  padding: 10px 16px;
  margin: 20px 0;
  display: flex;
  flex-wrap: wrap;
  gap: 8px 16px;
  align-items: center;
}
.filters legend {
  color: var(--fg-3);
  font-size: 13px;
  padding: 0 6px;
}
.filter {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  cursor: pointer;
}
.gap {
  width: 8px;
  height: 20px;
  border-left: 1px solid var(--line-2);
}
.export {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  margin: 16px 0;
}
.group {
  background: var(--surface-1);
  border: 1px solid var(--line-1);
  border-radius: var(--radius);
  margin: 10px 0;
}
.group summary {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px;
  padding: 12px 16px;
  cursor: pointer;
  list-style: none;
}
.group summary::-webkit-details-marker {
  display: none;
}
.group summary::before {
  content: "\25B8";
  color: var(--fg-3);
}
.group[open] summary::before {
  content: "\25BE";
}
.group .name {
  font-weight: 600;
  flex: 1;
}
.group .count {
  color: var(--fg-2);
  font-variant-numeric: tabular-nums;
}
.group .meta {
  margin: 0;
  padding: 0 16px 8px 42px;
  color: var(--fg-3);
  font-size: 13px;
}
.badge {
  display: inline-block;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  padding: 2px 8px;
  border-radius: 999px;
  background: var(--surface-3);
  color: var(--fg-2);
}
.badge.error {
  background: rgba(229, 72, 77, 0.18);
  color: #ff8a8e;
}
.badge.warning {
  background: rgba(240, 180, 41, 0.18);
  color: #ffd166;
}
.badge.info {
  background: rgba(45, 125, 210, 0.2);
  color: #8ec3ff;
}
.badge.muted {
  background: var(--surface-2);
  color: var(--fg-3);
}
table {
  width: 100%;
  border-collapse: collapse;
  font-size: 14px;
}
th,
td {
  text-align: left;
  padding: 8px 12px;
  border-top: 1px solid var(--line-1);
  vertical-align: top;
}
th {
  color: var(--fg-3);
  font-weight: 600;
  font-size: 12px;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}
.group td:first-child {
  max-width: 32ch;
  overflow-wrap: anywhere;
}

/* Rules and prose pages */
.eyebrow {
  color: var(--fg-3);
  font-size: 13px;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  margin: 0 0 8px;
}
.rule .meta,
.prose .meta {
  color: var(--fg-2);
}
.rule p,
.prose p,
.rule li,
.prose li {
  max-width: 72ch;
}
.rule-list {
  list-style: none;
  padding: 0;
}
.rule-list li {
  padding: 10px 0;
  border-top: 1px solid var(--line-1);
}
.rule-list .summary {
  font-size: 14px;
}
.cta {
  margin-top: 32px;
  display: flex;
  flex-wrap: wrap;
  gap: 16px;
  align-items: center;
}
```

- [ ] **Step 5: Write the home page, the 404 page, and the public files**

`packages/web/index.html`. The header and footer are the same markup `scripts/layout.mjs` produces in Task 9 (Task 9's test checks the nav matches):

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>pbiplint: best-practice linter for Power BI projects</title>
    <meta
      name="description"
      content="Paste TMDL or drop a .SemanticModel folder and get ranked best-practice findings with fix guidance. Runs in your browser. Nothing is uploaded."
    />
    <link rel="canonical" href="https://pbiplint.com/" />
    <meta property="og:title" content="pbiplint" />
    <meta
      property="og:description"
      content="Best-practice linter for Power BI projects. Runs in your browser. Nothing is uploaded."
    />
    <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
    <link rel="stylesheet" href="/src/styles.css" />
  </head>
  <body>
    <header class="site-header">
      <div class="container">
        <a class="brand" href="/"><img src="/favicon.svg" alt="" width="28" height="28" /> pbiplint</a>
        <nav>
          <a href="/" aria-current="page">Lint</a><a href="/rules/">Rules</a><a href="/about/">About</a
          ><a href="https://github.com/pbiplint/pbiplint">GitHub</a>
        </nav>
      </div>
    </header>
    <main class="container">
      <section class="hero">
        <h1>Lint your Power BI semantic model in the browser</h1>
        <p class="lede">
          Paste TMDL or drop a <code>.SemanticModel</code> folder. pbiplint runs the Microsoft
          best-practice rules on it, ranks what it finds, and tells you how to fix each one. Nothing
          is uploaded: the analysis runs in this tab.
        </p>
      </section>
      <div class="inputs">
        <section class="panel">
          <h2><label for="paste">Paste TMDL</label></h2>
          <textarea
            id="paste"
            spellcheck="false"
            placeholder="table Sales&#10;&#9;column 'Sale ID'&#10;&#9;&#9;dataType: int64&#10;&#9;&#9;sourceColumn: SaleID"
          ></textarea>
          <div><button id="lint-paste" type="button">Lint pasted TMDL</button></div>
        </section>
        <section class="panel">
          <h2>Drop a folder</h2>
          <div id="drop" class="drop">
            <p>
              Drop a <code>.SemanticModel</code> folder, the PBIP folder that holds one, or a single
              <code>.tmdl</code> file here.
            </p>
            <button id="choose-folder" type="button" class="secondary">Choose a folder</button>
            <input id="folder-input" type="file" webkitdirectory multiple hidden />
          </div>
          <p class="hint">
            Only .tmdl files and pbiplint.config.json are read. Nothing else in the folder is opened.
          </p>
        </section>
      </div>
      <div class="actions">
        <button id="try-sample" type="button" class="secondary">Try the sample project</button>
        <p class="hint">
          A small sales model with planted violations, the same one
          <code>npx pbiplint --sample</code> lints.
        </p>
      </div>
      <p id="status" class="status" role="status" aria-live="polite" hidden></p>
      <section id="results" aria-live="polite" hidden></section>
    </main>
    <footer class="site-footer">
      <div class="container">
        <p>Nothing you lint leaves your browser. <a href="/about/#verify">How to check that</a>.</p>
        <p>
          Free software under the AGPL-3.0-or-later license, from the makers of
          <a href="https://www.youtube.com/@TheDataPractitioner">The Data Practitioner</a>. pbiplint
          and its logo are trademarks of McKinley Consulting.
        </p>
      </div>
    </footer>
    <script type="module" src="/src/main.ts"></script>
  </body>
</html>
```

`packages/web/404.html`: the same head (title `Page not found: pbiplint`, no canonical), the same header without `aria-current`, a main of `<h1>Page not found</h1><p>There is nothing at this address. <a href="/">Lint a model</a>, browse the <a href="/rules/">rules</a>, or read <a href="/about/">about pbiplint</a>.</p>`, the same footer, and no script tag.

`packages/web/public/CNAME`:

```
pbiplint.com
```

`packages/web/public/robots.txt`:

```
User-agent: *
Allow: /
Sitemap: https://pbiplint.com/sitemap.xml
```

`packages/web/public/favicon.svg`: copy `~/Downloads/pbip-lint-spike/branding/pbiplint-mark-only.svg` verbatim (`cp`, not a rewrite).

`packages/web/public/schema/pbiplint.config.schema.json`:

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "$id": "https://pbiplint.com/schema/pbiplint.config.schema.json",
  "title": "pbiplint configuration",
  "description": "Rules on or off, severity overrides, and the fail threshold. Saved as pbiplint.config.json next to the project or anywhere above it.",
  "type": "object",
  "additionalProperties": false,
  "properties": {
    "$schema": { "type": "string" },
    "rules": {
      "type": "object",
      "description": "Rule id to \"off\", or to a severity that replaces the rule's own. Ids match regardless of case.",
      "additionalProperties": { "enum": ["off", "info", "warning", "error"] }
    },
    "failOn": {
      "enum": ["error", "warning", "info", "none"],
      "default": "error",
      "description": "Lowest severity that makes the command line exit 1."
    }
  }
}
```

- [ ] **Step 6: Run the test, the build, and the checks**

Run: `npm test -- csp`
Expected: PASS.

Run: `npm run build -w @pbiplint/web`
Expected: `dist/index.html` and `dist/404.html` exist; `grep -c "Content-Security-Policy" packages/web/dist/index.html` prints 1; `ls packages/web/dist/assets` shows one CSS file, one JS file, and Inter woff2 files; `grep -l "fetch(" packages/web/dist/assets/*.js` prints nothing.

Run: `npm run typecheck && npm run lint`
Expected: clean. If Prettier reformats `index.html`, accept its formatting (`npm run format`).

Run `npm run dev -w @pbiplint/web`, open the URL it prints, and confirm the page renders in the dark theme with Inter (the Network tab shows the font loading from the dev server, not from a CDN). Stop the server.

- [ ] **Step 7: Commit**

```bash
git add packages/web package.json package-lock.json .gitignore .prettierignore eslint.config.js
git commit -m "feat(web): scaffold the site package with the home page, styles, and a build-time CSP"
```

---

### Task 4: Pick the model out of a dropped tree (pure)

**Files:**
- Create: `packages/web/src/input/model-files.ts`
- Test: `packages/web/test/model-files.test.ts`

**Interfaces:**
- Produces: `InputEntry { path: string; text: string }`, `SelectedModel { root: string; files: LintFile[]; config?: { path: string; text: string } }`, `InputError`, `CONFIG_FILE`, `selectModel(entries: InputEntry[]): SelectedModel`. Paths use forward slashes and are relative to whatever was dropped; the dropped folder's own name is the first segment (that is how `webkitGetAsEntry().fullPath`, `showDirectoryPicker`, and `webkitRelativePath` all report it). A lone dropped file has no slash.

- [ ] **Step 1: Write the failing tests**

`packages/web/test/model-files.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { InputError, selectModel, type InputEntry } from "../src/input/model-files.js";

const e = (path: string, text = `// ${path}\n`): InputEntry => ({ path, text });

describe("selectModel", () => {
  it("takes a dropped .SemanticModel folder and reports paths relative to it", () => {
    const m = selectModel([
      e("Demo.SemanticModel/definition/model.tmdl"),
      e("Demo.SemanticModel/definition/tables/T.tmdl"),
      e("Demo.SemanticModel/definition.pbism"),
    ]);
    expect(m.root).toBe("Demo.SemanticModel");
    expect(m.files.map((f) => f.path)).toEqual(["definition/model.tmdl", "definition/tables/T.tmdl"]);
    expect(m.config).toBeUndefined();
  });
  it("finds the one semantic model inside a dropped PBIP folder", () => {
    const m = selectModel([
      e("Proj/Demo.SemanticModel/definition/model.tmdl"),
      e("Proj/Demo.SemanticModel/definition/tables/T.tmdl"),
      e("Proj/Demo.Report/definition/report.json"),
    ]);
    expect(m.root).toBe("Proj/Demo.SemanticModel");
    expect(m.files.map((f) => f.path)).toEqual(["definition/model.tmdl", "definition/tables/T.tmdl"]);
  });
  it("refuses a folder with two semantic models and names them", () => {
    expect(() =>
      selectModel([e("Proj/A.SemanticModel/definition/model.tmdl"), e("Proj/B.SemanticModel/definition/model.tmdl")]),
    ).toThrow(/2 semantic models.*A\.SemanticModel, B\.SemanticModel/);
  });
  it("takes a dropped definition folder, loose .tmdl files, and a single file", () => {
    expect(selectModel([e("definition/model.tmdl"), e("definition/tables/T.tmdl")]).files.map((f) => f.path)).toEqual([
      "model.tmdl",
      "tables/T.tmdl",
    ]);
    const loose = selectModel([e("stuff/a.tmdl"), e("stuff/deeper/b.tmdl")]);
    expect(loose.root).toBe("stuff");
    expect(loose.files.map((f) => f.path)).toEqual(["a.tmdl", "deeper/b.tmdl"]);
    const single = selectModel([e("T.tmdl", "table T\n")]);
    expect(single.root).toBe("");
    expect(single.files).toEqual([{ path: "T.tmdl", text: "table T\n" }]);
  });
  it("uses the nearest pbiplint.config.json at or above the model root", () => {
    const outer = e("Proj/pbiplint.config.json", '{"failOn":"warning"}');
    const inner = e("Proj/Demo.SemanticModel/pbiplint.config.json", '{"failOn":"info"}');
    const model = [e("Proj/Demo.SemanticModel/definition/model.tmdl")];
    expect(selectModel([...model, outer]).config).toEqual({ path: "Proj/pbiplint.config.json", text: outer.text });
    expect(selectModel([...model, outer, inner]).config).toEqual({
      path: "Proj/Demo.SemanticModel/pbiplint.config.json",
      text: inner.text,
    });
  });
  it("sorts files by path so results are stable", () => {
    const m = selectModel([e("M.SemanticModel/definition/tables/Z.tmdl"), e("M.SemanticModel/definition/tables/A.tmdl")]);
    expect(m.files.map((f) => f.path)).toEqual(["definition/tables/A.tmdl", "definition/tables/Z.tmdl"]);
  });
  it("explains an empty drop", () => {
    expect(() => selectModel([e("Proj/Demo.Report/definition/report.json")])).toThrow(InputError);
    expect(() => selectModel([])).toThrow(/No \.tmdl files/);
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `npm test -- model-files`
Expected: FAIL, module not found.

- [ ] **Step 3: Implement**

`packages/web/src/input/model-files.ts`:

```ts
import type { LintFile } from "@pbiplint/core";

/** One file read from a drop, a folder pick, or a directory input. Forward slashes, relative to the drop. */
export interface InputEntry {
  path: string;
  text: string;
}

export interface SelectedModel {
  /** Path of the model root inside the drop; "" when a lone file was dropped. */
  root: string;
  files: LintFile[];
  /** The nearest pbiplint.config.json at or above the model root, if the drop had one. */
  config?: { path: string; text: string };
}

/** A problem with what was dropped, in words meant for the status line. */
export class InputError extends Error {}

export const CONFIG_FILE = "pbiplint.config.json";
const MODEL_SUFFIX = ".SemanticModel";

const parent = (p: string): string => (p.includes("/") ? p.slice(0, p.lastIndexOf("/")) : "");
const within = (path: string, dir: string): boolean => dir === "" || path.startsWith(dir + "/");
const relativeTo = (path: string, dir: string): string => (dir === "" ? path : path.slice(dir.length + 1));
const join = (dir: string, name: string): string => (dir === "" ? name : `${dir}/${name}`);

/**
 * Mirrors the CLI's resolveModel on a tree of paths: a folder with a definition folder is the
 * model; else a folder holding exactly one .SemanticModel folder points at it; else every .tmdl
 * file under the folder is linted with paths relative to it.
 */
export function selectModel(entries: InputEntry[]): SelectedModel {
  const tmdl = entries.filter((e) => e.path.endsWith(".tmdl"));
  if (tmdl.length === 0)
    throw new InputError(
      "No .tmdl files found. Drop a .SemanticModel folder, the PBIP folder that holds one, or a .tmdl file.",
    );
  // The dropped folder is the first path segment of everything; a lone file has no folder.
  const firsts = new Set(entries.map((e) => e.path.split("/")[0]!));
  const base = firsts.size === 1 && entries.every((e) => e.path.includes("/")) ? [...firsts][0]! : "";
  const root = resolveRoot(tmdl, base);
  const files = tmdl
    .filter((e) => within(e.path, join(root, "definition")) || !hasDefinition(tmdl, root))
    .filter((e) => within(e.path, root))
    .map((e) => ({ path: relativeTo(e.path, root), text: e.text }))
    .sort((a, b) => a.path.localeCompare(b.path));
  return { root, files, config: findConfig(entries, root) };
}

const hasDefinition = (tmdl: InputEntry[], dir: string): boolean =>
  tmdl.some((e) => within(e.path, join(dir, "definition")));

function resolveRoot(tmdl: InputEntry[], dir: string): string {
  if (hasDefinition(tmdl, dir)) return dir;
  const models = [
    ...new Set(
      tmdl
        .filter((e) => within(e.path, dir))
        .map((e) => relativeTo(e.path, dir).split("/")[0]!)
        .filter((name) => name.endsWith(MODEL_SUFFIX)),
    ),
  ].sort();
  if (models.length === 1) return resolveRoot(tmdl, join(dir, models[0]!));
  if (models.length > 1)
    throw new InputError(
      `${dir || "The drop"} contains ${models.length} semantic models; drop one of them: ${models.join(", ")}`,
    );
  return dir;
}

/** The nearest config at or above `root`, walking up to the drop root, as the CLI walks up to the filesystem root. */
function findConfig(entries: InputEntry[], root: string): SelectedModel["config"] {
  const byPath = new Map(entries.map((e) => [e.path, e]));
  for (let dir = root; ; dir = parent(dir)) {
    const hit = byPath.get(join(dir, CONFIG_FILE));
    if (hit) return { path: hit.path, text: hit.text };
    if (dir === "") return undefined;
  }
}
```

The `files` filter reads: when the root has a `definition` folder, only files under it count (a stray `.tmdl` next to `definition.pbism` is ignored, as in the CLI); otherwise every `.tmdl` under the root counts.

- [ ] **Step 4: Run to verify they pass**

Run: `npm test -- model-files && npm run typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/web/src/input/model-files.ts packages/web/test/model-files.test.ts
git commit -m "feat(web): pick the semantic model out of a dropped folder tree"
```

---

### Task 5: Read drops, picked folders, and directory inputs (DOM adapters)

**Files:**
- Create: `packages/web/src/input/read-drop.ts`, `packages/web/src/input/pick-folder.ts`
- Test: `packages/web/test/read-drop.test.ts`, `packages/web/test/pick-folder.test.ts`

**Interfaces:**
- Consumes: `InputEntry`, `CONFIG_FILE` from Task 4.
- Produces: `readDataTransfer(dt: DataTransfer): Promise<InputEntry[]>`, `walkEntry(entry: FileSystemEntry, out: InputEntry[]): Promise<void>`, `wanted(name: string): boolean`, `SKIP_DIRS` (read-drop); `directoryPicker(): DirectoryPicker | null`, `readPickedDirectory(pick: DirectoryPicker): Promise<InputEntry[] | null>`, `readDirectoryInput(input: HTMLInputElement): Promise<InputEntry[]>` (pick-folder). Only `.tmdl` files and `pbiplint.config.json` are ever read; `.git`, `.pbi`, and `node_modules` folders are never entered.

The tests use hand-built objects shaped like the browser APIs, so they run in Node without a DOM (`File` is global in Node 20).

- [ ] **Step 1: Write the failing tests**

`packages/web/test/read-drop.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { readDataTransfer, walkEntry, wanted } from "../src/input/read-drop.js";

/** A fake FileSystemEntry tree: a directory reader hands out its children in batches of two, then an empty batch. */
function dir(name: string, fullPath: string, children: FileSystemEntry[]): FileSystemDirectoryEntry {
  return {
    isFile: false,
    isDirectory: true,
    name,
    fullPath,
    createReader: () => {
      let i = 0;
      return {
        readEntries: (ok: (entries: FileSystemEntry[]) => void) => {
          ok(children.slice(i, i + 2));
          i += 2;
        },
      };
    },
  } as unknown as FileSystemDirectoryEntry;
}
function file(name: string, fullPath: string, text: string): FileSystemFileEntry {
  return {
    isFile: true,
    isDirectory: false,
    name,
    fullPath,
    file: (ok: (f: File) => void) => ok(new File([text], name)),
  } as unknown as FileSystemFileEntry;
}

describe("wanted", () => {
  it("reads only TMDL files and the config", () => {
    expect(wanted("Sales.tmdl")).toBe(true);
    expect(wanted("pbiplint.config.json")).toBe(true);
    expect(wanted("report.json")).toBe(false);
    expect(wanted("cache.abf")).toBe(false);
  });
});

describe("walkEntry", () => {
  it("walks nested folders in batches, strips the leading slash, skips junk folders and other files", async () => {
    const tree = dir("Demo.SemanticModel", "/Demo.SemanticModel", [
      file("definition.pbism", "/Demo.SemanticModel/definition.pbism", "{}"),
      dir("definition", "/Demo.SemanticModel/definition", [
        file("model.tmdl", "/Demo.SemanticModel/definition/model.tmdl", "model Model\n"),
        dir("tables", "/Demo.SemanticModel/definition/tables", [
          file("A.tmdl", "/Demo.SemanticModel/definition/tables/A.tmdl", "table A\n"),
          file("B.tmdl", "/Demo.SemanticModel/definition/tables/B.tmdl", "table B\n"),
          file("C.tmdl", "/Demo.SemanticModel/definition/tables/C.tmdl", "table C\n"),
        ]),
      ]),
      dir(".pbi", "/Demo.SemanticModel/.pbi", [file("x.tmdl", "/Demo.SemanticModel/.pbi/x.tmdl", "never")]),
      file("pbiplint.config.json", "/Demo.SemanticModel/pbiplint.config.json", "{}"),
    ]);
    const out: { path: string; text: string }[] = [];
    await walkEntry(tree, out);
    expect(out.map((e) => e.path).sort()).toEqual([
      "Demo.SemanticModel/definition/model.tmdl",
      "Demo.SemanticModel/definition/tables/A.tmdl",
      "Demo.SemanticModel/definition/tables/B.tmdl",
      "Demo.SemanticModel/definition/tables/C.tmdl",
      "Demo.SemanticModel/pbiplint.config.json",
    ]);
    expect(out.find((e) => e.path.endsWith("A.tmdl"))?.text).toBe("table A\n");
  });
});

describe("readDataTransfer", () => {
  it("uses the entries API when the browser has it", async () => {
    const entry = file("T.tmdl", "/T.tmdl", "table T\n");
    const dt = { items: [{ webkitGetAsEntry: () => entry }], files: [] } as unknown as DataTransfer;
    expect(await readDataTransfer(dt)).toEqual([{ path: "T.tmdl", text: "table T\n" }]);
  });
  it("falls back to flat files when it does not", async () => {
    const dt = {
      items: [],
      files: [new File(["table T\n"], "T.tmdl"), new File(["{}"], "report.json")],
    } as unknown as DataTransfer;
    expect(await readDataTransfer(dt)).toEqual([{ path: "T.tmdl", text: "table T\n" }]);
  });
});
```

`packages/web/test/pick-folder.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { readDirectoryInput, readPickedDirectory } from "../src/input/pick-folder.js";

type Handle =
  | { kind: "file"; name: string; getFile(): Promise<File> }
  | { kind: "directory"; name: string; values(): AsyncIterable<Handle> };

const fileHandle = (name: string, text: string): Handle => ({
  kind: "file",
  name,
  getFile: async () => new File([text], name),
});
const dirHandle = (name: string, children: Handle[]): Handle => ({
  kind: "directory",
  name,
  async *values() {
    yield* children;
  },
});

describe("readPickedDirectory", () => {
  it("walks the picked directory, prefixing its name, and reads only model files", async () => {
    const picked = dirHandle("Demo.SemanticModel", [
      fileHandle("definition.pbism", "{}"),
      dirHandle("definition", [fileHandle("model.tmdl", "model Model\n")]),
      dirHandle(".git", [fileHandle("x.tmdl", "never")]),
    ]);
    const out = await readPickedDirectory(async () => picked as never);
    expect(out).toEqual([{ path: "Demo.SemanticModel/definition/model.tmdl", text: "model Model\n" }]);
  });
  it("returns null when the person cancels the dialog", async () => {
    const abort = async () => {
      throw new DOMException("cancelled", "AbortError");
    };
    expect(await readPickedDirectory(abort as never)).toBeNull();
  });
});

describe("readDirectoryInput", () => {
  it("uses the relative path the browser reports for each file", async () => {
    const f = Object.assign(new File(["table T\n"], "T.tmdl"), {
      webkitRelativePath: "Demo.SemanticModel/definition/tables/T.tmdl",
    });
    const junk = Object.assign(new File(["{}"], "report.json"), { webkitRelativePath: "Demo.Report/report.json" });
    const input = { files: [f, junk] } as unknown as HTMLInputElement;
    expect(await readDirectoryInput(input)).toEqual([
      { path: "Demo.SemanticModel/definition/tables/T.tmdl", text: "table T\n" },
    ]);
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `npm test -- read-drop pick-folder`
Expected: FAIL, modules not found.

- [ ] **Step 3: Implement**

`packages/web/src/input/read-drop.ts`:

```ts
import { CONFIG_FILE, type InputEntry } from "./model-files.js";

/** Only these are ever read; everything else in a dropped folder stays unopened. */
export const wanted = (name: string): boolean => name.endsWith(".tmdl") || name === CONFIG_FILE;

/** Folders that never hold model files and can be huge (Desktop's cache, git objects). */
export const SKIP_DIRS: ReadonlySet<string> = new Set([".git", ".pbi", "node_modules"]);

/**
 * Reads the model files out of a drop. The entries are taken from the DataTransfer before the
 * first await, because a DataTransfer is only readable while the drop event is being handled.
 */
export async function readDataTransfer(dt: DataTransfer): Promise<InputEntry[]> {
  const out: InputEntry[] = [];
  const entries = [...dt.items].map((item) => item.webkitGetAsEntry?.() ?? null);
  if (entries.some((e) => e !== null)) {
    for (const entry of entries) if (entry) await walkEntry(entry, out);
    return out;
  }
  // No entries API: a flat list of files is all there is.
  for (const file of [...dt.files])
    if (wanted(file.name)) out.push({ path: file.name, text: await file.text() });
  return out;
}

export async function walkEntry(entry: FileSystemEntry, out: InputEntry[]): Promise<void> {
  if (entry.isFile) {
    if (!wanted(entry.name)) return;
    const file = await new Promise<File>((resolve, reject) =>
      (entry as FileSystemFileEntry).file(resolve, reject),
    );
    out.push({ path: entry.fullPath.replace(/^\//, ""), text: await file.text() });
    return;
  }
  if (!entry.isDirectory || SKIP_DIRS.has(entry.name)) return;
  const reader = (entry as FileSystemDirectoryEntry).createReader();
  // readEntries hands out a batch at a time (Chrome caps a batch at 100) and an empty batch at the end.
  for (;;) {
    const batch = await new Promise<FileSystemEntry[]>((resolve, reject) =>
      reader.readEntries(resolve, reject),
    );
    if (batch.length === 0) break;
    for (const child of batch) await walkEntry(child, out);
  }
}
```

`packages/web/src/input/pick-folder.ts`:

```ts
import type { InputEntry } from "./model-files.js";
import { SKIP_DIRS, wanted } from "./read-drop.js";

// lib.dom does not type the File System Access API's picker or directory iteration, so the shape
// used here is declared locally. It matches Chrome and Edge.
interface FileHandleLike {
  kind: "file";
  name: string;
  getFile(): Promise<File>;
}
interface DirectoryHandleLike {
  kind: "directory";
  name: string;
  values(): AsyncIterable<FileHandleLike | DirectoryHandleLike>;
}
export type DirectoryPicker = (options?: { mode?: "read" }) => Promise<DirectoryHandleLike>;

/** Chrome and Edge have a folder picker; elsewhere this is null and the caller opens a directory input. */
export function directoryPicker(): DirectoryPicker | null {
  const w = window as unknown as { showDirectoryPicker?: DirectoryPicker };
  return typeof w.showDirectoryPicker === "function" ? w.showDirectoryPicker.bind(window) : null;
}

/** Walks a picked folder. Null when the person closes the dialog without choosing. */
export async function readPickedDirectory(pick: DirectoryPicker): Promise<InputEntry[] | null> {
  let dir: DirectoryHandleLike;
  try {
    dir = await pick({ mode: "read" });
  } catch (e) {
    if (e instanceof DOMException && e.name === "AbortError") return null;
    throw e;
  }
  const out: InputEntry[] = [];
  await walkHandle(dir, dir.name, out);
  return out;
}

async function walkHandle(dir: DirectoryHandleLike, prefix: string, out: InputEntry[]): Promise<void> {
  for await (const handle of dir.values()) {
    if (handle.kind === "file") {
      if (wanted(handle.name))
        out.push({ path: `${prefix}/${handle.name}`, text: await (await handle.getFile()).text() });
    } else if (!SKIP_DIRS.has(handle.name)) {
      await walkHandle(handle, `${prefix}/${handle.name}`, out);
    }
  }
}

/** Firefox and Safari: the files of an <input type="file" webkitdirectory>, with the paths the browser reports. */
export async function readDirectoryInput(input: HTMLInputElement): Promise<InputEntry[]> {
  const out: InputEntry[] = [];
  for (const file of [...(input.files ?? [])])
    if (wanted(file.name))
      out.push({ path: file.webkitRelativePath || file.name, text: await file.text() });
  return out;
}
```

- [ ] **Step 4: Run to verify they pass**

Run: `npm test -- read-drop pick-folder && npm run typecheck && npm run lint`
Expected: PASS. If `tsc` reports that `webkitGetAsEntry` is not optional, drop the `?.` and keep `?? null`.

- [ ] **Step 5: Commit**

```bash
git add packages/web/src/input packages/web/test/read-drop.test.ts packages/web/test/pick-folder.test.ts
git commit -m "feat(web): read model files from drops, folder picks, and directory inputs"
```

---

### Task 6: Bundle the sample project into the site

**Files:**
- Create: `packages/web/src/sample.ts`
- Test: `packages/web/test/sample.test.ts`

**Interfaces:**
- Produces: `SAMPLE_FILES: LintFile[]` (the 11 files of `examples/messy-sales` with paths like `definition/tables/Sales.tmdl`) and `SAMPLE_NAME = "the sample project"`.

- [ ] **Step 1: Write the failing test**

`packages/web/test/sample.test.ts`:

```ts
import { lint } from "@pbiplint/core";
import { describe, expect, it } from "vitest";
import { SAMPLE_FILES } from "../src/sample.js";

describe("bundled sample", () => {
  it("is examples/messy-sales with model-relative paths", () => {
    expect(SAMPLE_FILES.length).toBe(11);
    expect(SAMPLE_FILES.map((f) => f.path)).toContain("definition/tables/Sales.tmdl");
    expect(SAMPLE_FILES.every((f) => f.path.startsWith("definition/"))).toBe(true);
    expect(SAMPLE_FILES.map((f) => f.path)).toEqual([...SAMPLE_FILES.map((f) => f.path)].sort());
  });
  it("lints to the same numbers as pbiplint --sample", () => {
    const { summary } = lint(SAMPLE_FILES);
    expect([summary.findings, summary.errors, summary.warnings, summary.infos]).toEqual([161, 16, 39, 106]);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -- sample`
Expected: FAIL, module not found.

- [ ] **Step 3: Implement**

`packages/web/src/sample.ts`:

```ts
import type { LintFile } from "@pbiplint/core";

// Vite inlines the sample's TMDL into the bundle at build time; the page never fetches it.
const raw = import.meta.glob("../../../examples/messy-sales/definition/**/*.tmdl", {
  query: "?raw",
  import: "default",
  eager: true,
}) as Record<string, string>;

/** examples/messy-sales, the files `pbiplint --sample` lints, with paths relative to the model root. */
export const SAMPLE_FILES: LintFile[] = Object.entries(raw)
  .map(([key, text]) => ({ path: key.slice(key.indexOf("definition/")), text }))
  .sort((a, b) => a.path.localeCompare(b.path));

export const SAMPLE_NAME = "the sample project";
```

- [ ] **Step 4: Run to verify it passes**

Run: `npm test -- sample && npm run typecheck`
Expected: PASS. If the glob returns nothing under Vitest, check the path is relative to `packages/web/src/sample.ts` (three levels up to the repo root).

- [ ] **Step 5: Commit**

```bash
git add packages/web/src/sample.ts packages/web/test/sample.test.ts
git commit -m "feat(web): bundle the sample project for the try-it button"
```

---

### Task 7: Render results and export them

**Files:**
- Create: `packages/web/src/results/render.ts`, `packages/web/src/results/export.ts`
- Test: `packages/web/test/render.test.ts`, `packages/web/test/export.test.ts`

**Interfaces:**
- Consumes: `LintResult`, `RankedGroup`, `SEVERITY_LABEL`, `CATEGORY_ORDER`, `summaryLine`, `skippedLine`, `topGroups`, `formatMarkdown`, `formatJson`, `VERSION` from `@pbiplint/core`.
- Produces: `renderResults(container: HTMLElement, result: LintResult, options: { source: string }): void`, `applyFilters(container: HTMLElement): void`, `h(tag, attrs?, ...children)` (render); `ExportFile { name; type; text }`, `exportMarkdown(result)`, `exportJson(result)`, `download(file)`, `copy(file)` (export). Every group element has class `group`, id `rule-<slug>`, `data-severity` (`1`..`3`) and `data-category`; the filter checkboxes have `data-filter="severity"|"category"` and the matching `value`.

- [ ] **Step 1: Write the failing tests**

`packages/web/test/export.test.ts`:

```ts
// @vitest-environment happy-dom
import { lint, VERSION } from "@pbiplint/core";
import { afterEach, describe, expect, it, vi } from "vitest";
import { download, exportJson, exportMarkdown } from "../src/results/export.js";
import { SAMPLE_FILES } from "../src/sample.js";

const result = lint(SAMPLE_FILES);

describe("export", () => {
  afterEach(() => vi.restoreAllMocks());
  it("produces the same Markdown and JSON reports as the CLI", () => {
    const md = exportMarkdown(result);
    expect(md.name).toBe("pbiplint-report.md");
    expect(md.text.startsWith("# pbiplint report")).toBe(true);
    const json = exportJson(result);
    expect(json.name).toBe("pbiplint-report.json");
    const doc = JSON.parse(json.text);
    expect(doc.summary.findings).toBe(161);
    expect(doc.tool.version).toBe(VERSION);
  });
  it("downloads through a blob URL and cleans up after itself", () => {
    const create = vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:test");
    const revoke = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);
    download({ name: "x.md", type: "text/markdown", text: "# x" });
    expect(create).toHaveBeenCalledTimes(1);
    expect(create.mock.calls[0]![0]).toBeInstanceOf(Blob);
    expect(click).toHaveBeenCalledTimes(1);
    expect(revoke).toHaveBeenCalledWith("blob:test");
    expect(document.body.querySelector("a")).toBeNull();
  });
});
```

`packages/web/test/render.test.ts`:

```ts
// @vitest-environment happy-dom
import { lint } from "@pbiplint/core";
import { beforeEach, describe, expect, it } from "vitest";
import { applyFilters, renderResults } from "../src/results/render.js";
import { SAMPLE_FILES } from "../src/sample.js";

const result = lint(SAMPLE_FILES);
let container: HTMLElement;

beforeEach(() => {
  document.body.innerHTML = '<section id="results"></section>';
  container = document.getElementById("results")!;
});

describe("renderResults", () => {
  it("opens with the privacy line, the summary, and the five groups to fix first", () => {
    renderResults(container, result, { source: "the sample project (11 files)" });
    expect(container.querySelector(".privacy")!.textContent).toContain("Nothing was uploaded");
    expect(container.querySelector("h2")!.textContent).toBe("Results for the sample project (11 files)");
    expect(container.querySelector(".summary")!.textContent).toContain("161 findings (16 errors, 39 warnings, 106 info) in 11 files");
    const first = [...container.querySelectorAll(".fix-first li")];
    expect(first.length).toBe(5);
    expect(first[0]!.querySelector("a")!.getAttribute("href")).toBe(`#rule-${result.groups[0]!.rule.slug}`);
  });
  it("renders one group per rule with the objects, a page link, and severity and category data", () => {
    renderResults(container, result, { source: "x" });
    const groups = [...container.querySelectorAll<HTMLElement>(".group")];
    expect(groups.length).toBe(result.groups.length);
    const g0 = groups[0]!;
    const r0 = result.groups[0]!;
    expect(g0.id).toBe(`rule-${r0.rule.slug}`);
    expect(g0.dataset.severity).toBe(String(r0.rule.severity));
    expect(g0.dataset.category).toBe(r0.rule.category);
    expect(g0.querySelector("a.rule-link")!.getAttribute("href")).toBe(`/rules/${r0.rule.slug}/`);
    expect(g0.querySelectorAll("tbody tr").length).toBe(r0.findings.length);
    expect(g0.querySelector("tbody td")!.textContent).toBe(r0.findings[0]!.objectName);
  });
  it("hides groups whose severity or category is unchecked", () => {
    renderResults(container, result, { source: "x" });
    const errors = container.querySelector<HTMLInputElement>('input[data-filter="severity"][value="3"]')!;
    errors.checked = false;
    errors.dispatchEvent(new Event("change", { bubbles: true }));
    const hidden = [...container.querySelectorAll<HTMLElement>(".group")].filter((g) => g.hidden);
    expect(hidden.length).toBe(result.groups.filter((g) => g.rule.severity === 3).length);
    expect(hidden.every((g) => g.dataset.severity === "3")).toBe(true);
    errors.checked = true;
    applyFilters(container);
    expect(container.querySelectorAll<HTMLElement>(".group[hidden]").length).toBe(0);
  });
  it("offers Markdown and JSON export", () => {
    renderResults(container, result, { source: "x" });
    expect([...container.querySelectorAll(".export button")].map((b) => b.textContent)).toEqual([
      "Download Markdown",
      "Download JSON",
      "Copy Markdown",
    ]);
  });
  it("says so when there is nothing to report", () => {
    renderResults(container, lint([{ path: "m.tmdl", text: "model Model\n" }]), { source: "pasted TMDL" });
    expect(container.textContent).toContain("No findings.");
    expect(container.querySelector(".filters")).toBeNull();
  });
  it("never parses model text as HTML", () => {
    const hostile = lint([{ path: "t.tmdl", text: "table '<img src=x onerror=alert(1)>'\n\tcolumn A\n\t\tdataType: string\n" }]);
    renderResults(container, hostile, { source: "x" });
    expect(container.querySelector("img")).toBeNull();
    expect(container.textContent).toContain("<img src=x onerror=alert(1)>");
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `npm test -- render export`
Expected: FAIL, modules not found.

- [ ] **Step 3: Implement export**

`packages/web/src/results/export.ts`:

```ts
import { formatJson, formatMarkdown, VERSION, type LintResult } from "@pbiplint/core";

export interface ExportFile {
  name: string;
  type: string;
  text: string;
}

/** The same reports the CLI writes with --format markdown and --format json. */
export const exportMarkdown = (result: LintResult): ExportFile => ({
  name: "pbiplint-report.md",
  type: "text/markdown",
  text: formatMarkdown(result, { toolVersion: VERSION }),
});

export const exportJson = (result: LintResult): ExportFile => ({
  name: "pbiplint-report.json",
  type: "application/json",
  text: formatJson(result, { toolVersion: VERSION }),
});

/** Offers the text as a download through a same-origin blob URL. No request leaves the page. */
export function download(file: ExportFile): void {
  const url = URL.createObjectURL(new Blob([file.text], { type: file.type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = file.name;
  document.body.append(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export const copy = (file: ExportFile): Promise<void> => navigator.clipboard.writeText(file.text);
```

- [ ] **Step 4: Implement render**

`packages/web/src/results/render.ts`:

```ts
import {
  CATEGORY_ORDER,
  SEVERITY_LABEL,
  skippedLine,
  summaryLine,
  topGroups,
  type LintResult,
  type RankedGroup,
  type Severity,
} from "@pbiplint/core";
import { copy, download, exportJson, exportMarkdown } from "./export.js";

export interface RenderOptions {
  /** What was linted, for the heading: "the sample project (11 files)", "pasted TMDL". */
  source: string;
}

type Child = Node | string | null | undefined;

/** Builds an element. Strings become text nodes, so nothing from a model file is ever parsed as HTML. */
export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | boolean> = {},
  ...children: Child[]
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [name, value] of Object.entries(attrs)) {
    if (value === false) continue;
    el.setAttribute(name, value === true ? "" : value);
  }
  for (const child of children) if (child != null) el.append(child);
  return el;
}

const SEVERITIES: readonly Severity[] = [3, 2, 1];
const pagePath = (slug: string): string => `/rules/${slug}/`;

/** "1 error", "3 warnings", "106 info": the severity nouns as the text format writes them. */
const count = (n: number, severity: Severity): string => {
  const noun = SEVERITY_LABEL[severity];
  return `${n} ${noun}${n === 1 || noun === "info" ? "" : "s"}`;
};

export function renderResults(container: HTMLElement, result: LintResult, options: RenderOptions): void {
  container.replaceChildren(
    h(
      "p",
      { class: "privacy" },
      "Nothing was uploaded. The analysis ran in this browser tab. ",
      h("a", { href: "/about/#verify" }, "How to check that"),
    ),
    h("h2", {}, `Results for ${options.source}`),
    h("p", { class: "summary" }, `${summaryLine(result)}. ${skippedLine(result)}.`),
    ...result.summary.unknownRules.map((id) =>
      h("p", { class: "notice" }, `pbiplint.config.json names no rule called "${id}".`),
    ),
  );
  if (result.groups.length === 0) {
    container.append(h("p", { class: "clean" }, "No findings."));
    return;
  }
  container.append(
    h("h3", {}, "Fix these first"),
    h(
      "ol",
      { class: "fix-first" },
      ...topGroups(result).map((g) =>
        h(
          "li",
          {},
          h("a", { href: `#rule-${g.rule.slug}` }, g.rule.name),
          ` (${count(g.findings.length, g.rule.severity)})`,
        ),
      ),
    ),
    renderExportBar(result),
    renderFilters(result),
    h("div", { class: "groups" }, ...result.groups.map(renderGroup)),
  );
  if (result.summary.ruleErrors.length)
    container.append(
      h(
        "p",
        { class: "notice" },
        "Rule errors (please report these): " +
          result.summary.ruleErrors.map((e) => `${e.id}: ${e.message}`).join("; "),
      ),
    );
  // One handler for the whole container, so re-rendering never stacks listeners.
  container.onchange = (event) => {
    if ((event.target as HTMLElement).matches("input[data-filter]")) applyFilters(container);
  };
}

function renderExportBar(result: LintResult): HTMLElement {
  const button = (label: string, onClick: (b: HTMLButtonElement) => void): HTMLButtonElement => {
    const b = h("button", { type: "button", class: "secondary" }, label);
    b.addEventListener("click", () => onClick(b));
    return b;
  };
  return h(
    "div",
    { class: "export" },
    button("Download Markdown", () => download(exportMarkdown(result))),
    button("Download JSON", () => download(exportJson(result))),
    button("Copy Markdown", (b) => {
      void copy(exportMarkdown(result)).then(() => {
        b.textContent = "Copied";
        setTimeout(() => (b.textContent = "Copy Markdown"), 1500);
      });
    }),
  );
}

function renderFilters(result: LintResult): HTMLElement {
  const box = (kind: string, value: string, label: string): HTMLElement =>
    h(
      "label",
      { class: "filter" },
      h("input", { type: "checkbox", checked: true, "data-filter": kind, value }),
      label,
    );
  const severities = SEVERITIES.filter((s) => result.groups.some((g) => g.rule.severity === s));
  const categories = CATEGORY_ORDER.filter((c) => result.groups.some((g) => g.rule.category === c));
  return h(
    "fieldset",
    { class: "filters" },
    h("legend", {}, "Show"),
    ...severities.map((s) => box("severity", String(s), SEVERITY_LABEL[s])),
    h("span", { class: "gap" }),
    ...categories.map((c) => box("category", c, c)),
  );
}

/** Hides every group whose severity or category is unchecked. */
export function applyFilters(container: HTMLElement): void {
  const checked = (kind: string): Set<string> =>
    new Set(
      [...container.querySelectorAll<HTMLInputElement>(`input[data-filter="${kind}"]`)]
        .filter((i) => i.checked)
        .map((i) => i.value),
    );
  const severities = checked("severity");
  const categories = checked("category");
  for (const group of container.querySelectorAll<HTMLElement>(".group"))
    group.hidden = !(
      severities.has(group.dataset.severity ?? "") && categories.has(group.dataset.category ?? "")
    );
}

function renderGroup(g: RankedGroup): HTMLElement {
  const label = SEVERITY_LABEL[g.rule.severity];
  const rows = g.findings.map((f) =>
    h(
      "tr",
      {},
      h("td", { class: "mono" }, f.objectName),
      h("td", {}, f.objectType),
      h("td", { class: "mono" }, f.location ? `${f.location.file}:${f.location.line}` : ""),
      h("td", {}, f.detail ?? ""),
    ),
  );
  return h(
    "details",
    {
      class: "group",
      id: `rule-${g.rule.slug}`,
      "data-severity": String(g.rule.severity),
      "data-category": g.rule.category,
    },
    h(
      "summary",
      {},
      h("span", { class: `badge ${label}` }, label),
      h("span", { class: "name" }, g.rule.name),
      h("span", { class: "count" }, String(g.findings.length)),
      h("a", { class: "rule-link", href: pagePath(g.rule.slug) }, "How to fix it"),
    ),
    h("p", { class: "meta" }, h("code", {}, g.rule.id), ` · ${g.rule.category}`),
    h(
      "table",
      {},
      h(
        "thead",
        {},
        h("tr", {}, h("th", {}, "Object"), h("th", {}, "Type"), h("th", {}, "Location"), h("th", {}, "Detail")),
      ),
      h("tbody", {}, ...rows),
    ),
  );
}
```

- [ ] **Step 5: Run to verify they pass**

Run: `npm test -- render export && npm run typecheck && npm run lint`
Expected: PASS. If happy-dom lacks `navigator.clipboard`, nothing in these tests calls it; if it lacks `URL.createObjectURL`, the spy in the download test defines it (use `vi.stubGlobal` on `URL` only if `spyOn` throws "not a function", and say so in the test).

- [ ] **Step 6: Commit**

```bash
git add packages/web/src/results packages/web/test/render.test.ts packages/web/test/export.test.ts
git commit -m "feat(web): render ranked results with filters and Markdown and JSON export"
```

---

### Task 8: Wire the home page

**Files:**
- Modify: `packages/web/src/main.ts` (replace the placeholder)
- Test: `packages/web/test/home.test.ts`

**Interfaces:**
- Consumes: everything from Tasks 4 to 7 and the element ids from Task 3.
- Produces: a working home page: paste and lint, drop a folder, choose a folder, try the sample; a status line for input and config errors; results rendered below the inputs.

- [ ] **Step 1: Write the failing test**

`packages/web/test/home.test.ts`:

```ts
// @vitest-environment happy-dom
import { readFileSync } from "node:fs";
import { beforeAll, describe, expect, it } from "vitest";

const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
const body = html.slice(html.indexOf("<body>") + 6, html.indexOf("</body>")).replace(/<script[\s\S]*?<\/script>/, "");
const tick = (): Promise<void> => new Promise((r) => setTimeout(r, 0));

describe("home page", () => {
  beforeAll(async () => {
    document.body.innerHTML = body;
    await import("../src/main.js");
  });
  it("lints the sample project from its button", async () => {
    document.getElementById("try-sample")!.click();
    await tick();
    const results = document.getElementById("results")!;
    expect(results.hidden).toBe(false);
    expect(results.querySelector(".summary")!.textContent).toContain("161 findings");
    expect(document.getElementById("status")!.hidden).toBe(true);
  });
  it("lints pasted TMDL and complains about an empty paste", async () => {
    const paste = document.getElementById("paste") as HTMLTextAreaElement;
    paste.value = "";
    document.getElementById("lint-paste")!.click();
    const status = document.getElementById("status")!;
    expect(status.hidden).toBe(false);
    expect(status.textContent).toBe("Paste some TMDL first.");
    paste.value = "table Sales\n\tcolumn Amount\n\t\tdataType: double\n\t\tsourceColumn: Amount\n";
    document.getElementById("lint-paste")!.click();
    await tick();
    expect(status.hidden).toBe(true);
    expect(document.querySelector("#results h2")!.textContent).toBe("Results for pasted TMDL");
    expect(document.querySelector("#results .summary")!.textContent).toContain("in 1 file");
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -- home`
Expected: FAIL (the placeholder main.ts wires nothing, so `results.hidden` stays true).

- [ ] **Step 3: Implement**

`packages/web/src/main.ts`:

```ts
import { ConfigError, lint, resolveConfig, type LintFile } from "@pbiplint/core";
import { InputError, selectModel, type InputEntry } from "./input/model-files.js";
import { directoryPicker, readDirectoryInput, readPickedDirectory } from "./input/pick-folder.js";
import { readDataTransfer } from "./input/read-drop.js";
import { renderResults } from "./results/render.js";
import { SAMPLE_FILES, SAMPLE_NAME } from "./sample.js";

const byId = <T extends HTMLElement>(id: string): T => {
  const el = document.getElementById(id);
  if (!el) throw new Error(`The home page has no #${id}`);
  return el as T;
};

const paste = byId<HTMLTextAreaElement>("paste");
const status = byId<HTMLParagraphElement>("status");
const results = byId<HTMLElement>("results");
const dropZone = byId<HTMLElement>("drop");
const folderInput = byId<HTMLInputElement>("folder-input");

const plural = (n: number, noun: string): string => `${n} ${noun}${n === 1 ? "" : "s"}`;

function say(text: string, kind: "info" | "error" = "info"): void {
  status.textContent = text;
  status.dataset.kind = kind;
  status.hidden = text === "";
}

function fail(e: unknown): void {
  if (e instanceof InputError || e instanceof ConfigError) say(e.message, "error");
  else say(`Something went wrong: ${e instanceof Error ? e.message : String(e)}`, "error");
}

/** Every input ends up here: read the config if there is one, lint, render. Nothing touches the network. */
function run(files: LintFile[], source: string, configText?: string): void {
  try {
    let raw: unknown;
    if (configText !== undefined) {
      try {
        raw = JSON.parse(configText);
      } catch (e) {
        throw new ConfigError(
          `pbiplint.config.json is not valid JSON: ${e instanceof Error ? e.message : String(e)}`,
        );
      }
    }
    const result = lint(files, { config: resolveConfig(raw) });
    renderResults(results, result, { source });
    results.hidden = false;
    say("");
    if (typeof results.scrollIntoView === "function")
      results.scrollIntoView({ behavior: "smooth", block: "start" });
  } catch (e) {
    fail(e);
  }
}

function runEntries(entries: InputEntry[]): void {
  try {
    const model = selectModel(entries);
    run(
      model.files,
      `${model.root || "the dropped file"} (${plural(model.files.length, "file")})`,
      model.config?.text,
    );
  } catch (e) {
    fail(e);
  }
}

byId("lint-paste").addEventListener("click", () => {
  const text = paste.value;
  if (text.trim() === "") {
    say("Paste some TMDL first.", "error");
    return;
  }
  run([{ path: "pasted.tmdl", text }], "pasted TMDL");
});

byId("try-sample").addEventListener("click", () =>
  run(SAMPLE_FILES, `${SAMPLE_NAME} (${plural(SAMPLE_FILES.length, "file")})`),
);

// A drop anywhere else would make the browser open the file; keep it on the page.
document.addEventListener("dragover", (event) => event.preventDefault());
document.addEventListener("drop", (event) => event.preventDefault());
for (const type of ["dragenter", "dragover"] as const)
  dropZone.addEventListener(type, (event) => {
    event.preventDefault();
    dropZone.classList.add("over");
  });
dropZone.addEventListener("dragleave", () => dropZone.classList.remove("over"));
dropZone.addEventListener("drop", (event) => {
  event.preventDefault();
  dropZone.classList.remove("over");
  if (!event.dataTransfer) return;
  say("Reading files...");
  // readDataTransfer takes the entries before its first await, while the DataTransfer is still readable.
  readDataTransfer(event.dataTransfer).then(runEntries, fail);
});

const picker = directoryPicker();
byId("choose-folder").addEventListener("click", () => {
  if (picker) readPickedDirectory(picker).then((entries) => entries && runEntries(entries), fail);
  else folderInput.click();
});
folderInput.addEventListener("change", () => {
  readDirectoryInput(folderInput).then(runEntries, fail);
  folderInput.value = "";
});
```

- [ ] **Step 4: Run the tests, then try it in a browser**

Run: `npm test -- home && npm run typecheck && npm run lint`
Expected: PASS.

Run `npm run dev -w @pbiplint/web` and, in the browser:

1. Click "Try the sample project": the results appear with "161 findings", five items under "Fix these first", filters, and expandable groups whose "How to fix it" links point at `/rules/<slug>/` (404 in dev until Task 9).
2. Paste a table and click "Lint pasted TMDL".
3. Drag `tests/fixtures/rule-zoo.SemanticModel` from Finder onto the drop zone: results for `rule-zoo.SemanticModel (17 files)`.
4. Drag `examples/` (the folder holding `messy-sales`): expect the message that no `.SemanticModel` folder was found unless `messy-sales` is renamed; drag `examples/messy-sales` itself: 161 findings, root shown as `messy-sales`.
5. Click "Choose a folder" in Chrome (native picker) and in Safari or Firefox (file dialog).
6. Click "Download Markdown" and "Copy Markdown".
7. Open the Network tab, reload, run the sample again: nothing after the initial page assets.

Stop the server.

- [ ] **Step 5: Commit**

```bash
git add packages/web/src/main.ts packages/web/test/home.test.ts
git commit -m "feat(web): wire paste, drop, folder pick, and the sample on the home page"
```

---

### Task 9: Generate the rule pages, the rules index, the about page, and the sitemap

**Files:**
- Create: `packages/web/src/build/pages.ts`, `packages/web/src/build/generate.ts`, `packages/web/content/about.md`
- Modify: `packages/web/vite.config.ts`
- Test: `packages/web/test/generate.test.ts`

**Interfaces:**
- Produces (pages.ts): `NAV`, `SITE`, `escapeHtml(s)`, `parseFrontmatter(text): { data: Frontmatter; body: string }`, `page({ title, description, path, main }): string`, `rulePage(markdown, slug): { html: string; meta: RuleMeta }`, `rulesIndex(metas: RuleMeta[]): string`, `contentPage(markdown, path): string`, `sitemap(paths: string[]): string`. `RuleMeta = { slug, id, title, category, severity, status, summary }`.
- Produces (generate.ts): `generateSite(options?: { rulesDir?; contentDir?; outDir? }): RuleMeta[]` (writes `rules/<slug>/index.html`, `rules/index.html`, `about/index.html`, `public/sitemap.xml` under `outDir`), `pageEntries(root): Record<string, string>`, `generatePlugin(): Plugin` (runs `generateSite()` in Vite's `config` hook, in dev and in build, and registers the pages as Rollup inputs), `RULES_DIR`, `WEB_ROOT`.

The generator lives in TypeScript under `src/build` and runs inside Vite (which loads its config through esbuild), so there is no separate script to run and the tests import the same functions the build uses.

- [ ] **Step 1: Write the failing tests**

`packages/web/test/generate.test.ts`:

```ts
import { existsSync, mkdtempSync, readFileSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { generateSite, pageEntries, RULES_DIR } from "../src/build/generate.js";
import { NAV, parseFrontmatter, rulePage } from "../src/build/pages.js";

const read = (slug: string): string => readFileSync(join(RULES_DIR, `${slug}.md`), "utf8");
const home = readFileSync(new URL("../index.html", import.meta.url), "utf8");

describe("parseFrontmatter", () => {
  it("reads scalars, bracket lists, dash lists, and empty keys", () => {
    const { data, body } = parseFrontmatter(read("hide-foreign-keys"));
    expect(data.id).toBe("HIDE_FOREIGN_KEYS");
    expect(data.name).toBe("Hide foreign keys");
    expect(data.scope).toEqual(["Column", "CalculatedColumn", "CalculatedTableColumn"]);
    expect(data.sources).toEqual([
      "https://github.com/microsoft/Analysis-Services/blob/master/BestPracticeRules/BPARules.json",
    ]);
    expect(data.video).toEqual([]);
    expect(body.trim().startsWith("# Hide foreign keys")).toBe(true);
  });
});

describe("rulePage", () => {
  it("renders the page inside the site shell with the rule's metadata", () => {
    const { html, meta } = rulePage(read("hide-foreign-keys"), "hide-foreign-keys");
    expect(meta).toMatchObject({
      slug: "hide-foreign-keys",
      id: "HIDE_FOREIGN_KEYS",
      title: "Hide foreign keys",
      category: "Formatting",
      severity: "warning",
      status: "ported",
    });
    expect(meta.summary.startsWith("Visible columns whose name matches")).toBe(true);
    expect(html).toContain("<h1>Hide foreign keys</h1>");
    expect(html).toContain("<h2>What it checks</h2>");
    expect(html).toContain('<link rel="canonical" href="https://pbiplint.com/rules/hide-foreign-keys/" />');
    expect(html).toContain('href="https://github.com/pbiplint/pbiplint/edit/main/rules/hide-foreign-keys.md"');
    expect(html).toContain('<link rel="stylesheet" href="/src/styles.css" />');
    expect(html).not.toContain("<script");
  });
  it("marks a live-model rule and shows a video link only when the page has one", () => {
    const live = rulePage(read("avoid-bi-directional-relationships-against-high-cardinality-columns"), "x");
    expect(live.html).toContain("needs a live model");
    expect(live.html).not.toContain("Watch the video");
    const withVideo = rulePage(
      read("hide-foreign-keys").replace("video:\n", "video: https://youtu.be/abc\n"),
      "hide-foreign-keys",
    );
    expect(withVideo.html).toContain('href="https://youtu.be/abc"');
  });
});

describe("generateSite", () => {
  it("writes every rule page, the index, the about page, and the sitemap", () => {
    const out = mkdtempSync(join(tmpdir(), "pbiplint-site-"));
    const metas = generateSite({ outDir: out });
    expect(metas.length).toBe(72);
    expect(readdirSync(join(out, "rules")).filter((d) => d !== "index.html").length).toBe(72);
    expect(existsSync(join(out, "rules/hide-foreign-keys/index.html"))).toBe(true);
    const index = readFileSync(join(out, "rules/index.html"), "utf8");
    expect(index).toContain("72 rules: 66 ported");
    expect((index.match(/needs a live model/g) ?? []).length).toBe(5);
    for (const m of metas) expect(index).toContain(`href="/rules/${m.slug}/"`);
    const about = readFileSync(join(out, "about/index.html"), "utf8");
    expect(about).toContain('<h2 id="verify">');
    expect(about).toContain("<title>About pbiplint");
    const sitemap = readFileSync(join(out, "public/sitemap.xml"), "utf8");
    expect(sitemap).toContain("<loc>https://pbiplint.com/rules/hide-foreign-keys/</loc>");
    expect(Object.keys(pageEntries(out)).sort()).toEqual(
      ["about", "rules", ...metas.map((m) => `rules/${m.slug}`)].sort(),
    );
  });
});

describe("home page shell", () => {
  it("has the same navigation and privacy footer as the generated pages", () => {
    for (const n of NAV) {
      expect(home).toContain(`href="${n.href}"`);
      expect(home).toMatch(new RegExp(`>\\s*${n.label}\\s*</a`));
    }
    expect(home).toContain("Nothing you lint leaves your browser.");
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `npm test -- generate`
Expected: FAIL, modules not found.

- [ ] **Step 3: Write the page functions**

`packages/web/src/build/pages.ts`:

```ts
import { marked } from "marked";

export const SITE = "https://pbiplint.com";

export const NAV = [
  { href: "/", label: "Lint" },
  { href: "/rules/", label: "Rules" },
  { href: "/about/", label: "About" },
  { href: "https://github.com/pbiplint/pbiplint", label: "GitHub" },
] as const;

const CATEGORY_ORDER = [
  "Performance",
  "Error Prevention",
  "DAX Expressions",
  "Maintenance",
  "Formatting",
  "Naming Conventions",
];
const STATUS_LABEL: Record<string, string> = {
  ported: "ported",
  needsLiveModel: "needs a live model",
  builtin: "built in",
};

export const escapeHtml = (s: string): string =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export type Frontmatter = Record<string, string | string[]>;

/** The frontmatter the rule pages use: `key: value`, `key: [a, b]`, and `key:` followed by `  - item` lines. */
export function parseFrontmatter(text: string): { data: Frontmatter; body: string } {
  const m = /^---\n([\s\S]*?)\n---\n([\s\S]*)$/.exec(text);
  if (!m) throw new Error("The page has no frontmatter");
  const data: Frontmatter = {};
  let list: string[] | null = null;
  for (const line of m[1]!.split("\n")) {
    const item = /^\s+- (.*)$/.exec(line);
    if (item && list) {
      list.push(item[1]!.trim());
      continue;
    }
    const kv = /^([A-Za-z_]+):\s*(.*)$/.exec(line);
    if (!kv) continue;
    const key = kv[1]!;
    const value = kv[2]!.trim();
    list = null;
    if (value === "") {
      list = [];
      data[key] = list;
    } else if (value.startsWith("[") && value.endsWith("]")) {
      data[key] = value
        .slice(1, -1)
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
    } else {
      data[key] = value.replace(/^"(.*)"$/, "$1");
    }
  }
  return { data, body: m[2]! };
}

const str = (v: string | string[] | undefined): string => (Array.isArray(v) ? (v[0] ?? "") : (v ?? ""));
const list = (v: string | string[] | undefined): string[] => (Array.isArray(v) ? v : v ? [v] : []);
const section = (body: string, heading: string): string =>
  body.split(`## ${heading}`)[1]?.split(/\n## /)[0] ?? "";
const firstParagraph = (s: string): string =>
  s
    .trim()
    .split(/\n\s*\n/)[0]
    ?.replace(/\s+/g, " ")
    .trim() ?? "";
const render = (markdown: string): string => marked.parse(markdown, { async: false }) as string;

function header(path: string): string {
  const current = (href: string): boolean =>
    href === path || (href !== "/" && !href.startsWith("http") && path.startsWith(href));
  return `<header class="site-header">
      <div class="container">
        <a class="brand" href="/"><img src="/favicon.svg" alt="" width="28" height="28" /> pbiplint</a>
        <nav>
          ${NAV.map((n) => `<a href="${n.href}"${current(n.href) ? ' aria-current="page"' : ""}>${n.label}</a>`).join("")}
        </nav>
      </div>
    </header>`;
}

const FOOTER = `<footer class="site-footer">
      <div class="container">
        <p>Nothing you lint leaves your browser. <a href="/about/#verify">How to check that</a>.</p>
        <p>
          Free software under the AGPL-3.0-or-later license, from the makers of
          <a href="https://www.youtube.com/@TheDataPractitioner">The Data Practitioner</a>. pbiplint
          and its logo are trademarks of McKinley Consulting.
        </p>
      </div>
    </footer>`;

export interface PageOptions {
  title: string;
  description: string;
  /** Site path with a trailing slash, e.g. `/rules/hide-foreign-keys/`. */
  path: string;
  /** HTML for the inside of <main>. */
  main: string;
}

/** The shell every generated page shares. The home page (index.html) carries the same header and footer by hand. */
export function page({ title, description, path, main }: PageOptions): string {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(title)}</title>
    <meta name="description" content="${escapeHtml(description)}" />
    <link rel="canonical" href="${SITE}${escapeHtml(path)}" />
    <meta property="og:title" content="${escapeHtml(title)}" />
    <meta property="og:description" content="${escapeHtml(description)}" />
    <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
    <link rel="stylesheet" href="/src/styles.css" />
  </head>
  <body>
    ${header(path)}
    <main class="container">
${main}
    </main>
    ${FOOTER}
  </body>
</html>
`;
}

export interface RuleMeta {
  slug: string;
  id: string;
  title: string;
  category: string;
  severity: string;
  status: string;
  summary: string;
}

export function rulePage(markdown: string, slug: string): { html: string; meta: RuleMeta } {
  const { data, body } = parseFrontmatter(markdown);
  const title = /^# (.+)$/m.exec(body)?.[1] ?? str(data.name);
  const meta: RuleMeta = {
    slug,
    id: str(data.id),
    title,
    category: str(data.category),
    severity: str(data.severity),
    status: str(data.status),
    summary: firstParagraph(section(body, "What it checks")),
  };
  const video = str(data.video);
  const main = `<article class="rule">
  <p class="eyebrow"><a href="/rules/">Rules</a> / ${escapeHtml(meta.category)}</p>
  <h1>${escapeHtml(title)}</h1>
  <p class="meta"><span class="badge ${escapeHtml(meta.severity)}">${escapeHtml(meta.severity)}</span> <code>${escapeHtml(meta.id)}</code> · ${escapeHtml(STATUS_LABEL[meta.status] ?? meta.status)} · scope: ${escapeHtml(list(data.scope).join(", "))}</p>
  ${video ? `<p class="video"><a href="${escapeHtml(video)}">Watch the video for this rule</a></p>` : ""}
  ${render(body.replace(/^# .+\n/m, ""))}
  <p class="cta"><a class="button" href="/">Check a model for this</a> <a href="https://github.com/pbiplint/pbiplint/edit/main/rules/${escapeHtml(slug)}.md">Improve this page</a></p>
</article>`;
  return {
    html: page({ title: `${title} · pbiplint`, description: meta.summary, path: `/rules/${slug}/`, main }),
    meta,
  };
}

export function rulesIndex(metas: RuleMeta[]): string {
  const count = (status: string): number => metas.filter((m) => m.status === status).length;
  const sections = CATEGORY_ORDER.map((category) => {
    const rows = metas
      .filter((m) => m.category === category)
      .sort((a, b) => a.title.localeCompare(b.title));
    if (rows.length === 0) return "";
    const items = rows
      .map(
        (m) =>
          `  <li><a href="/rules/${escapeHtml(m.slug)}/">${escapeHtml(m.title)}</a> <span class="badge ${escapeHtml(m.severity)}">${escapeHtml(m.severity)}</span>${m.status === "needsLiveModel" ? ' <span class="badge muted">needs a live model</span>' : ""}<br /><span class="summary">${escapeHtml(m.summary)}</span></li>`,
      )
      .join("\n");
    return `<h2>${escapeHtml(category)}</h2>\n<ul class="rule-list">\n${items}\n</ul>`;
  }).join("\n");
  const main = `<article class="prose">
<h1>Rules</h1>
<p>${metas.length} rules: ${count("ported")} ported from the Microsoft Best Practice Analyzer ruleset so the results match Tabular Editor, ${count("needsLiveModel")} listed but not run because they need statistics only a live model has, and ${count("builtin")} built into pbiplint. Ranked by severity, then category, then how many objects they hit.</p>
${sections}
</article>`;
  return page({
    title: "Rules · pbiplint",
    description: "Every rule pbiplint checks: what it checks, why it matters, and how to fix it.",
    path: "/rules/",
    main,
  });
}

/** A Markdown page with `title` and `description` frontmatter, such as content/about.md. */
export function contentPage(markdown: string, path: string): string {
  const { data, body } = parseFrontmatter(markdown);
  return page({
    title: `${str(data.title)} · pbiplint`,
    description: str(data.description),
    path,
    main: `<article class="prose">\n${render(body)}\n</article>`,
  });
}

export function sitemap(paths: string[]): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${paths.map((p) => `  <url><loc>${SITE}${escapeHtml(p)}</loc></url>`).join("\n")}
</urlset>
`;
}
```

- [ ] **Step 4: Write the generator and plug it into Vite**

`packages/web/src/build/generate.ts`:

```ts
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { Plugin } from "vite";
import { contentPage, rulePage, rulesIndex, sitemap, type RuleMeta } from "./pages.js";

export const WEB_ROOT = fileURLToPath(new URL("../..", import.meta.url));
export const RULES_DIR = join(WEB_ROOT, "../../rules");
export const CONTENT_DIR = join(WEB_ROOT, "content");

export interface GenerateOptions {
  rulesDir?: string;
  contentDir?: string;
  outDir?: string;
}

/** Writes rules/<slug>/index.html, rules/index.html, about/index.html, and public/sitemap.xml under outDir. */
export function generateSite({
  rulesDir = RULES_DIR,
  contentDir = CONTENT_DIR,
  outDir = WEB_ROOT,
}: GenerateOptions = {}): RuleMeta[] {
  const metas: RuleMeta[] = [];
  for (const file of readdirSync(rulesDir)
    .filter((f) => f.endsWith(".md"))
    .sort()) {
    const slug = file.replace(/\.md$/, "");
    const { html, meta } = rulePage(readFileSync(join(rulesDir, file), "utf8"), slug);
    write(join(outDir, "rules", slug, "index.html"), html);
    metas.push(meta);
  }
  write(join(outDir, "rules", "index.html"), rulesIndex(metas));
  write(
    join(outDir, "about", "index.html"),
    contentPage(readFileSync(join(contentDir, "about.md"), "utf8"), "/about/"),
  );
  write(
    join(outDir, "public", "sitemap.xml"),
    sitemap(["/", "/about/", "/rules/", ...metas.map((m) => `/rules/${m.slug}/`)]),
  );
  return metas;
}

function write(path: string, text: string): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, text);
}

/** Every index.html under the package plus 404.html, keyed by site path, for Rollup. */
export function pageEntries(root: string): Record<string, string> {
  const skip = /^(node_modules|dist|public|src|test|content)(\/|$)/;
  const files = readdirSync(root, { recursive: true })
    .map(String)
    .filter((p) => !skip.test(p) && (p.endsWith("index.html") || p === "404.html"));
  return Object.fromEntries(
    files.map((p) => [p.replace(/\/?index\.html$/, "").replace(/\.html$/, "") || "home", join(root, p)]),
  );
}

/** Generates the pages before Vite reads its config, in dev and in build, and registers them as entries. */
export function generatePlugin(): Plugin {
  return {
    name: "pbiplint-generate",
    config() {
      const n = generateSite().length;
      console.log(`generated ${n} rule pages, the rules index, the about page, and the sitemap`);
      return { build: { rollupOptions: { input: pageEntries(WEB_ROOT) } } };
    },
  };
}
```

`packages/web/vite.config.ts`: delete the `pages()` function and the `readdirSync` and `join` imports it used, add `import { generatePlugin } from "./src/build/generate.js";`, set `plugins: [generatePlugin(), cspPlugin()]`, and remove the `rollupOptions` line from `build` (the plugin supplies the inputs).

- [ ] **Step 5: Write the about page**

`packages/web/content/about.md`:

```markdown
---
title: About pbiplint
description: What pbiplint is, who makes it, and how to check for yourself that nothing you lint leaves your browser.
---

# About pbiplint

pbiplint is a free, open-source best-practice linter for Power BI projects. Paste TMDL or drop a `.SemanticModel` folder on the [home page](/), or run `npx pbiplint <path>` on your own machine, and get a ranked list of findings with a page for every rule that says what it checks, why it matters, and how to fix it.

## What it checks

Version 1 covers the semantic model: every rule from the Microsoft Best Practice Analyzer ruleset, ported so the results match Tabular Editor on the same model. Five rules need statistics only a live model has; they are listed but not run. Report rules and Power Query rules come next. The [rules index](/rules/) has the full list.

## Who makes it

pbiplint is made by McKinley Consulting, the makers of [The Data Practitioner](https://www.youtube.com/@TheDataPractitioner). It is free software under the GNU Affero General Public License, version 3 or later, and the source is on [GitHub](https://github.com/pbiplint/pbiplint). There is no paid tier, and no plan to charge for rules.

<h2 id="verify">How to check that nothing is uploaded</h2>

The analysis runs in your browser. There is no server behind this site, no account, and no analytics. You can check that yourself:

1. Open your browser's developer tools, switch to the Network tab, load this site, and lint a model. After the page's own files load, no request is made: not when you drop a folder, not when you click a button, not when you export a report.
2. Load the page, then turn on airplane mode or unplug the network. Everything still works, because nothing needed the network.
3. View the page source. Every page carries a Content-Security-Policy with `connect-src 'none'`: the browser itself refuses to let the page open a connection of any kind.
4. Read the code. The linter core has a build check that fails if it references a network API, and the site build fails if any page references an external script, style, font, or image.

The command-line tool is the same code with a folder walk in front of it. It reads the files you point it at and writes to your terminal or to a file you name.

## What it does not do

pbiplint does not document models, apply fixes, or analyze query performance. For documentation there is PBIP Documenter; for query plans there is DAX Studio. The rules pbiplint ports are the Best Practice Analyzer rules, so a model that is clean here is clean there too.
```

- [ ] **Step 6: Run the tests and the build**

Run: `npm test -- generate && npm run typecheck && npm run lint`
Expected: PASS.

Run: `npm run build -w @pbiplint/web`
Expected: the log line `generated 72 rule pages, ...`, then Vite emits `dist/index.html`, `dist/404.html`, `dist/about/index.html`, `dist/rules/index.html`, and 72 `dist/rules/<slug>/index.html`, plus `dist/sitemap.xml` and `dist/robots.txt`. `git status` shows no new tracked files (the generated folders are ignored).

Run `npm run dev -w @pbiplint/web`, open `/rules/`, `/rules/hide-foreign-keys/`, `/about/#verify`, and a missing path such as `/nope/` (the dev server shows its own 404; `dist/404.html` is what Pages serves). Check the header, the badges, and that the "How to fix it" links from the home page results now resolve. Stop the server.

- [ ] **Step 7: Commit**

```bash
git add packages/web/src/build packages/web/content packages/web/vite.config.ts packages/web/test/generate.test.ts
git commit -m "feat(web): generate the rule pages, rules index, about page, and sitemap at build time"
```

---

### Task 10: Fail the build on any network reference, and run the site build in CI

**Files:**
- Create: `packages/web/src/build/check-site.ts`
- Modify: `packages/web/vite.config.ts`, `.github/workflows/ci.yml`
- Test: `packages/web/test/check-site.test.ts`

**Interfaces:**
- Produces: `checkSite(dir: string): { files: number; bytes: number; problems: string[] }` and `siteCheckPlugin(): Plugin` (runs `checkSite` on the output folder in `closeBundle` and throws, failing `vite build`, when there is a problem). CI runs the site build on every pull request and push to main, with least-privilege permissions and per-branch concurrency.

- [ ] **Step 1: Write the failing test**

`packages/web/test/check-site.test.ts`:

```ts
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";
import { checkSite } from "../src/build/check-site.js";
import { CSP } from "../src/build/csp.js";

const META = `<meta http-equiv="Content-Security-Policy" content="${CSP}">`;

function site(files: Record<string, string>): string {
  const dir = mkdtempSync(join(tmpdir(), "pbiplint-dist-"));
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(dirname(join(dir, path)), { recursive: true });
    writeFileSync(join(dir, path), text);
  }
  return dir;
}

describe("checkSite", () => {
  it("passes a site whose pages carry the CSP and reference only their own origin", () => {
    const dir = site({
      "index.html": `<html><head>${META}<link rel="canonical" href="https://pbiplint.com/" /><link rel="stylesheet" href="/assets/a.css"></head><body><a href="https://github.com/pbiplint/pbiplint">GitHub</a><script type="module" src="/assets/a.js"></script></body></html>`,
      "rules/x/index.html": `<html><head>${META}</head><body><img src="/favicon.svg"></body></html>`,
      "assets/a.js": 'document.createElement("a");URL.createObjectURL(new Blob([""]));',
      "assets/a.css": "@font-face{src:url(/assets/inter.woff2)}",
      "sitemap.xml": "<urlset/>",
    });
    const report = checkSite(dir);
    expect(report.problems).toEqual([]);
    expect(report.files).toBe(5);
    expect(report.bytes).toBeGreaterThan(0);
  });
  it("names every page that lacks the CSP or reaches off the origin, and every script or style that could", () => {
    const dir = site({
      "index.html": `<html><head></head><body></body></html>`,
      "a/index.html": `<html><head>${META}<script src="https://cdn.example/x.js"></script></head></html>`,
      "b/index.html": `<html><head>${META}<link rel="stylesheet" href="//fonts.example/x.css"></head></html>`,
      "c/index.html": `<html><head>${META}</head><body><img src="https://img.example/x.png"></body></html>`,
      "assets/f.js": 'fetch("/x")',
      "assets/x.js": "new XMLHttpRequest()",
      "assets/b.js": "navigator.sendBeacon(u)",
      "assets/w.js": "new WebSocket(u)",
      "assets/s.js": "navigator.serviceWorker.register(u)",
      "assets/a.css": "@font-face{src:url(https://fonts.gstatic.com/x.woff2)}",
      "assets/i.css": '@import url("https://x.example/y.css");',
    });
    const { problems } = checkSite(dir);
    expect(problems).toEqual([
      "a/index.html: external resource <script src=\"https://cdn.example/x.js\">",
      "assets/a.css: external url(https://fonts.gstatic.com/x.woff2)",
      "assets/b.js: references sendBeacon",
      "assets/f.js: references fetch(",
      "assets/i.css: external url(\"https://x.example/y.css\")",
      "assets/s.js: references navigator.serviceWorker",
      "assets/w.js: references WebSocket",
      "assets/x.js: references XMLHttpRequest",
      "b/index.html: external resource <link rel=\"stylesheet\" href=\"//fonts.example/x.css\">",
      "c/index.html: external resource <img src=\"https://img.example/x.png\">",
      "index.html: no Content-Security-Policy meta with connect-src 'none'",
    ]);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -- check-site`
Expected: FAIL, module not found.

- [ ] **Step 3: Implement**

`packages/web/src/build/check-site.ts`:

```ts
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import type { Plugin } from "vite";

export interface SiteReport {
  files: number;
  bytes: number;
  problems: string[];
}

/** Substrings that prove a script reaches for the network (or a service worker, which could). */
const NETWORK_APIS = [
  "fetch(",
  "XMLHttpRequest",
  "WebSocket",
  "sendBeacon",
  "EventSource",
  "navigator.serviceWorker",
  'import("http',
];
/** Elements that load something, with the attribute that names it. Anchors navigate; they are not resources. */
const RESOURCE_TAG = /<(script|link|img|iframe|video|audio|source|embed|object)\b[^>]*>/gi;
const OFF_ORIGIN = /^(https?:)?\/\//i;
const CSS_URL = /url\((["']?)((?:https?:)?\/\/[^)"']*)\1\)/gi;

export function checkSite(dir: string): SiteReport {
  const report: SiteReport = { files: 0, bytes: 0, problems: [] };
  for (const file of walk(dir).sort()) {
    const rel = relative(dir, file).split("\\").join("/");
    report.files++;
    report.bytes += statSync(file).size;
    if (rel.endsWith(".html")) checkHtml(rel, readFileSync(file, "utf8"), report);
    else if (rel.endsWith(".js") || rel.endsWith(".mjs")) checkScript(rel, readFileSync(file, "utf8"), report);
    else if (rel.endsWith(".css")) checkStyle(rel, readFileSync(file, "utf8"), report);
  }
  report.problems.sort();
  return report;
}

function checkHtml(rel: string, html: string, report: SiteReport): void {
  const csp = /<meta http-equiv="Content-Security-Policy" content="([^"]*)"/.exec(html)?.[1] ?? "";
  if (!csp.includes("connect-src 'none'"))
    report.problems.push(`${rel}: no Content-Security-Policy meta with connect-src 'none'`);
  for (const tag of html.match(RESOURCE_TAG) ?? []) {
    if (/\brel="canonical"/.test(tag)) continue;
    const target = /\s(?:src|href)=["']([^"']*)["']/i.exec(tag)?.[1] ?? "";
    if (OFF_ORIGIN.test(target)) report.problems.push(`${rel}: external resource ${tag}`);
  }
}

function checkScript(rel: string, code: string, report: SiteReport): void {
  for (const api of NETWORK_APIS) if (code.includes(api)) report.problems.push(`${rel}: references ${api}`);
}

function checkStyle(rel: string, css: string, report: SiteReport): void {
  for (const m of css.matchAll(CSS_URL)) report.problems.push(`${rel}: external ${m[0]}`);
}

function walk(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory() ? walk(join(dir, entry.name)) : [join(dir, entry.name)],
  );
}

/** Runs the check on the finished build and fails it on any problem, so a deploy can never ship a page that phones home. */
export function siteCheckPlugin(): Plugin {
  let outDir = "";
  return {
    name: "pbiplint-check-site",
    apply: "build",
    configResolved(config) {
      outDir = resolve(config.root, config.build.outDir);
    },
    closeBundle() {
      const report = checkSite(outDir);
      console.log(`site: ${report.files} files, ${(report.bytes / 1024).toFixed(0)} KB`);
      if (report.problems.length)
        throw new Error(`site check failed:\n  ${report.problems.join("\n  ")}`);
      console.log("site check passed: CSP on every page, no external resources, no network APIs");
    },
  };
}
```

`packages/web/vite.config.ts`: `plugins: [generatePlugin(), cspPlugin(), siteCheckPlugin()]` with the matching import.

- [ ] **Step 4: Run the test, then prove the check bites**

Run: `npm test -- check-site && npm run typecheck && npm run lint`
Expected: PASS.

Run: `npm run build -w @pbiplint/web`
Expected: the `site:` line and `site check passed` at the end. If it reports `fetch(` in a Vite chunk, confirm `build.modulePreload.polyfill` is `false` in `vite.config.ts` and look for the offender with `grep -o ".\{40\}fetch(.\{40\}" packages/web/dist/assets/*.js`.

Now add `void fetch("/x");` at the bottom of `packages/web/src/main.ts`, run the build again, and confirm it fails with `assets/...js: references fetch(`. Remove the line.

- [ ] **Step 5: Update the CI workflow**

`.github/workflows/ci.yml`:

```yaml
name: CI

on:
  push:
    branches: [main]
  pull_request:

permissions:
  contents: read

concurrency:
  group: ci-${{ github.ref }}
  cancel-in-progress: true

jobs:
  test:
    runs-on: ubuntu-latest
    strategy:
      matrix:
        node: [20, 22]
    steps:
      - uses: actions/checkout@v7
      - uses: actions/setup-node@v7
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

`npm run build` now builds the site as well (the web workspace has a `build` script), and the site check runs inside it.

- [ ] **Step 6: Commit and open the pull request**

```bash
git add packages/web/src/build/check-site.ts packages/web/vite.config.ts packages/web/test/check-site.test.ts .github/workflows/ci.yml
git commit -m "feat(web): fail the build on any network reference; build the site in CI"
```

Push the branch and open a pull request against main titled "pbiplint.com: the web app" with a body listing Tasks 1 to 10. CI must pass on Node 20 and 22, and the CLA check must pass, before Task 11 (the deploy workflow lands in the same PR, so the first deploy happens on merge).

---

### Task 11: Deploy to GitHub Pages at pbiplint.com

**Files:**
- Create: `.github/workflows/pages.yml`

**Interfaces:**
- Consumes: the site build from Tasks 3 to 10 (`packages/web/dist`).
- Produces: every push to main rebuilds, tests, checks, and deploys the site; `https://pbiplint.com` serves it over HTTPS with `www.pbiplint.com` redirecting to it.

Order matters: DNS first (so GitHub can verify the domain and issue the certificate), then Pages settings, then the first deploy on merge, then HTTPS enforcement once the certificate exists.

- [ ] **Step 1: Write the deploy workflow**

`.github/workflows/pages.yml`:

```yaml
name: Deploy site

on:
  push:
    branches: [main]
  workflow_dispatch:

permissions:
  contents: read
  pages: write
  id-token: write

concurrency:
  group: pages
  cancel-in-progress: false

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v7
      - uses: actions/setup-node@v7
        with:
          node-version: 22
          cache: npm
      - run: npm ci
      - run: npm test
      - run: npm run build -w @pbiplint/web
      - uses: actions/configure-pages@v6
      - uses: actions/upload-pages-artifact@v5
        with:
          path: packages/web/dist
  deploy:
    needs: build
    runs-on: ubuntu-latest
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    steps:
      - id: deployment
        uses: actions/deploy-pages@v5
```

The build job runs the tests before the site build so a red main never deploys, and the site check inside `vite build` blocks any page that references the network.

- [ ] **Step 2: Commit and push to the open pull request**

```bash
git add .github/workflows/pages.yml
git commit -m "ci: deploy the site to GitHub Pages on every push to main"
git push
```

Pushing a workflow file needs the `workflow` scope on the TheDataPractitioner token; it was added on 2026-09-05. If the push is rejected for that reason, Michael runs `gh auth refresh -h github.com -s workflow --user TheDataPractitioner` in Terminal.

- [ ] **Step 3: Michael: add the DNS records at Cloudflare**

**Michael:** in the Cloudflare dashboard for `pbiplint.com`, DNS, add these records with the proxy off (grey cloud, "DNS only") and TTL Auto:

| Type | Name | Content |
|---|---|---|
| A | `@` | `185.199.108.153` |
| A | `@` | `185.199.109.153` |
| A | `@` | `185.199.110.153` |
| A | `@` | `185.199.111.153` |
| AAAA | `@` | `2606:50c0:8000::153` |
| AAAA | `@` | `2606:50c0:8001::153` |
| AAAA | `@` | `2606:50c0:8002::153` |
| AAAA | `@` | `2606:50c0:8003::153` |
| CNAME | `www` | `pbiplint.github.io` |

The proxy stays off so GitHub can see the domain and issue the certificate; it can be turned on later with SSL mode "Full (strict)" if ever wanted. Also in Cloudflare, SSL/TLS, set the encryption mode to "Full" now, so a later proxy switch does not create a redirect loop.

Recommended, same visit: in GitHub, organization `pbiplint`, Settings, Pages, "Verified domains", add `pbiplint.com`. GitHub shows a TXT record (`_github-pages-challenge-pbiplint` with a token value); add it at Cloudflare and click Verify. A verified domain cannot be claimed by another GitHub user's Pages site.

Check from the terminal after a minute:

```bash
dig +short A pbiplint.com      # the four 185.199.* addresses
dig +short AAAA pbiplint.com   # the four 2606:50c0:* addresses
dig +short CNAME www.pbiplint.com   # pbiplint.github.io.
```

- [ ] **Step 4: Enable Pages with the Actions source and set the custom domain**

Run (these change repository settings and are reversible; Michael approved this plan):

```bash
GH_TOKEN="$(gh auth token --user TheDataPractitioner)" gh api -X POST repos/pbiplint/pbiplint/pages -f build_type=workflow
GH_TOKEN="$(gh auth token --user TheDataPractitioner)" gh api -X PUT repos/pbiplint/pbiplint/pages -f cname=pbiplint.com
gh api repos/pbiplint/pbiplint/pages --jq '{status, cname, build_type, https_enforced, protected_domain_state, cert: .https_certificate.state}'
```

Expected: the POST returns the new site (a 409 means it already exists; carry on); the PUT returns 204; the GET shows `cname: "pbiplint.com"`, `build_type: "workflow"`, and a certificate state of `new` or `authorization_created` that becomes `approved` within the hour once DNS resolves.

- [ ] **Step 5: Michael: merge the pull request**

**Michael:** merge the pull request from Task 10. The Deploy site workflow runs on the merge commit. Watch it:

```bash
gh run list --repo pbiplint/pbiplint --workflow "Deploy site" --limit 1
gh run watch --repo pbiplint/pbiplint "$(gh run list --repo pbiplint/pbiplint --workflow 'Deploy site' --limit 1 --json databaseId --jq '.[0].databaseId')"
```

- [ ] **Step 6: Enforce HTTPS once the certificate is issued, then verify the live site**

Poll until the certificate is approved, then enforce HTTPS:

```bash
gh api repos/pbiplint/pbiplint/pages --jq '.https_certificate.state'
GH_TOKEN="$(gh auth token --user TheDataPractitioner)" gh api -X PUT repos/pbiplint/pbiplint/pages -F https_enforced=true
```

Verify:

```bash
curl -sI https://pbiplint.com/ | head -3                       # HTTP/2 200
curl -sI http://pbiplint.com/ | grep -i location               # https://pbiplint.com/
curl -sI https://www.pbiplint.com/ | grep -i location          # https://pbiplint.com/
curl -s https://pbiplint.com/ | grep -c "connect-src 'none'"   # 1
curl -sI https://pbiplint.com/rules/hide-foreign-keys | grep -iE "^(HTTP|location)"   # 301 to the trailing-slash URL, then 200
curl -s https://pbiplint.com/sitemap.xml | grep -c "<loc>"     # 75
curl -sI https://pbiplint.com/nope/ | head -1                   # 404, and the body is the site's 404 page
```

In a browser: open https://pbiplint.com, run the sample, open the Network tab and confirm no request after the page assets, switch to airplane mode and run the sample again. Open a rule page from a result and the About page's verification section.

- [ ] **Step 7: Record the outcome**

Add to the top of `docs/RELEASING.md` in Task 13 (or a note in the PR) the date the site went live. Nothing else to commit in this task.

---

### Task 12: Package metadata, per-package READMEs, and the pack check

**Files:**
- Modify: `packages/core/package.json`, `packages/cli/package.json`, `packages/core/tsconfig.json`, `package.json` (root script), `.github/workflows/ci.yml`
- Create: `packages/core/README.md`, `packages/cli/README.md`, `scripts/check-pack.mjs`

**Interfaces:**
- Produces: two packages whose npm pages have a README, repository, homepage, bugs, and keywords; `@pbiplint/core` ships `dist` with source maps that resolve because `src` ships too, plus declaration maps; `npm run check:pack` fails when a required file is missing from either tarball, a forbidden file is present, or the versions differ; CI runs it after the build.

- [ ] **Step 1: Write the pack check**

`scripts/check-pack.mjs`:

```js
#!/usr/bin/env node
// Usage: node scripts/check-pack.mjs   (after npm run build)
//
// Dry-runs npm pack for both published packages and fails when a file that must ship is missing,
// a file that must not ship is present, or the two versions differ. Scripts are skipped so the
// check looks at what the last build produced, exactly as the release workflow publishes it.
import { execFileSync } from "node:child_process";

const REQUIRED = {
  "@pbiplint/core": [
    "package.json",
    "README.md",
    "LICENSE",
    "NOTICE",
    "dist/index.js",
    "dist/index.d.ts",
    "dist/index.js.map",
    "dist/index.d.ts.map",
    "src/index.ts",
  ],
  pbiplint: [
    "package.json",
    "README.md",
    "LICENSE",
    "NOTICE",
    "dist/pbiplint.mjs",
    "sample/definition/model.tmdl",
    "sample/definition/tables/Sales.tmdl",
  ],
};
const FORBIDDEN = [/^test\//, /\.test\./, /tsbuildinfo$/, /^\.env/, /\.DS_Store$/, /^node_modules\//];

const json = execFileSync(
  "npm",
  ["pack", "--dry-run", "--json", "--ignore-scripts", "-w", "@pbiplint/core", "-w", "pbiplint"],
  { encoding: "utf8", stdio: ["ignore", "pipe", "inherit"] },
);
const packs = JSON.parse(json);
let ok = true;
const fail = (message) => {
  ok = false;
  console.error(message);
};
for (const pack of packs) {
  const files = new Set(pack.files.map((f) => f.path));
  for (const f of REQUIRED[pack.name] ?? []) if (!files.has(f)) fail(`${pack.name}: missing ${f}`);
  for (const f of files) if (FORBIDDEN.some((re) => re.test(f))) fail(`${pack.name}: must not ship ${f}`);
  console.log(`${pack.name}@${pack.version}: ${pack.entryCount} files, ${(pack.unpackedSize / 1024).toFixed(0)} KB unpacked`);
}
if (packs.length !== 2) fail(`expected 2 packages, got ${packs.length}`);
const versions = new Set(packs.map((p) => p.version));
if (versions.size !== 1) fail(`versions differ: ${[...versions].join(", ")}`);
if (!ok) process.exit(1);
console.log("pack contents look right");
```

Root `package.json` scripts: add `"check:pack": "node scripts/check-pack.mjs"`.

Run: `npm run build && npm run check:pack`
Expected: FAIL with `missing README.md` for both packages and `missing dist/index.d.ts.map` for the core (that is the point of the next steps).

- [ ] **Step 2: Complete the manifests**

`packages/core/package.json` (whole file):

```json
{
  "name": "@pbiplint/core",
  "version": "0.0.0",
  "description": "Best-practice linter core for Power BI semantic models (TMDL). Runs in the browser and in Node, makes no network calls.",
  "keywords": ["power-bi", "tmdl", "semantic-model", "pbip", "linter", "best-practices", "tabular"],
  "license": "AGPL-3.0-or-later",
  "author": "McKinley Consulting",
  "homepage": "https://pbiplint.com",
  "repository": {
    "type": "git",
    "url": "git+https://github.com/pbiplint/pbiplint.git",
    "directory": "packages/core"
  },
  "bugs": { "url": "https://github.com/pbiplint/pbiplint/issues" },
  "type": "module",
  "sideEffects": false,
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "import": "./dist/index.js"
    }
  },
  "files": ["dist", "src", "README.md", "NOTICE", "LICENSE"],
  "publishConfig": { "access": "public" },
  "scripts": {
    "build": "tsc -p tsconfig.json && node scripts/copy-notices.mjs",
    "prepack": "npm run build"
  },
  "engines": { "node": ">=20" }
}
```

`packages/cli/package.json` (whole file):

```json
{
  "name": "pbiplint",
  "version": "0.0.0",
  "description": "Lint Power BI semantic models (TMDL) for best-practice violations, with text, JSON, SARIF, and Markdown output. Nothing is uploaded.",
  "keywords": ["power-bi", "tmdl", "semantic-model", "pbip", "linter", "best-practices", "sarif", "cli"],
  "license": "AGPL-3.0-or-later",
  "author": "McKinley Consulting",
  "homepage": "https://pbiplint.com",
  "repository": {
    "type": "git",
    "url": "git+https://github.com/pbiplint/pbiplint.git",
    "directory": "packages/cli"
  },
  "bugs": { "url": "https://github.com/pbiplint/pbiplint/issues" },
  "type": "module",
  "bin": { "pbiplint": "./dist/pbiplint.mjs" },
  "files": ["dist", "sample", "README.md", "NOTICE", "LICENSE"],
  "publishConfig": { "access": "public" },
  "scripts": {
    "build": "node build.mjs",
    "prepack": "npm run build",
    "test:bundle": "node dist/pbiplint.mjs --sample --format json > /dev/null; test $? -eq 1"
  },
  "engines": { "node": ">=20" }
}
```

`packages/core/tsconfig.json`: source maps already ship (`sourceMap: true` in the base config) and now resolve because `src` is in `files`; add declaration maps and keep the build info out of `dist`:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "rootDir": "src",
    "outDir": "dist",
    "declarationMap": true,
    "tsBuildInfoFile": "./tsconfig.tsbuildinfo"
  },
  "include": ["src"]
}
```

- [ ] **Step 3: Write the package READMEs**

`packages/core/README.md`:

````markdown
# @pbiplint/core

The linter behind [pbiplint](https://pbiplint.com): parse TMDL, build the semantic model, run the
best-practice rules, rank the findings, and format them. Pure TypeScript with no dependencies, no
Node APIs, and no network access, so it runs in a browser tab as well as in Node 20 or later.

```ts
import { formatText, lint } from "@pbiplint/core";

const result = lint([
  { path: "definition/model.tmdl", text: modelTmdl },
  { path: "definition/tables/Sales.tmdl", text: salesTmdl },
]);

console.log(formatText(result)); // or formatJson, formatMarkdown, formatSarif
for (const group of result.groups) console.log(group.rule.id, group.findings.length, group.rule.url);
```

`lint(files, { config })` takes the files of one model with paths relative to the model root and an
optional `pbiplint.config.json` object. `result.groups` is ranked by severity, then category, then
count, exactly as the command line and the website show it. Every rule has a page at
`https://pbiplint.com/rules/<slug>`; `group.rule.url` points at it.

The rules are literal ports of the Microsoft Best Practice Analyzer ruleset, verified against
Tabular Editor. Quirks are kept on purpose and documented on each rule's page.

For the command line, install [`pbiplint`](https://www.npmjs.com/package/pbiplint). Source, issues,
and contributing: https://github.com/pbiplint/pbiplint.

## License

Copyright (C) 2026 McKinley Consulting. GNU Affero General Public License, version 3 or later; see
LICENSE. The vendored Microsoft ruleset is MIT-licensed; see NOTICE. The name pbiplint and its
logo are trademarks of McKinley Consulting.
````

`packages/cli/README.md`:

````markdown
# pbiplint

Best-practice linter for Power BI semantic models. Point it at a `.SemanticModel` folder, a PBIP
folder, or one `.tmdl` file and get ranked findings with a link to a fix page for each rule.
Nothing is uploaded: it reads the files you name and writes to your terminal. Node 20 or later.

```bash
npx pbiplint path/to/Model.SemanticModel
npx pbiplint --sample                                       # a bundled model with planted violations
npx pbiplint path/to/model --format sarif --output pbiplint.sarif
npx pbiplint path/to/model --format markdown
npx pbiplint rules                                          # every rule with status and severity
```

Formats: `text` (default), `json`, `sarif` (for GitHub code scanning and editors), `markdown`.

Exit codes: `0` no findings at or above `--fail-on` (default `error`), `1` findings, `2` usage or
input error. `--fail-on warning` tightens the gate; `--fail-on none` always exits 0.

## Configuration

`pbiplint.config.json` next to the project, or anywhere above it (the nearest one wins; `--config`
picks one explicitly):

```json
{
  "$schema": "https://pbiplint.com/schema/pbiplint.config.schema.json",
  "rules": {
    "REMOVE_ROLES_WITH_NO_MEMBERS": "off",
    "DAX_COLUMNS_FULLY_QUALIFIED": "warning"
  },
  "failOn": "warning"
}
```

To ignore a rule on one object, annotate it in TMDL (Power BI Desktop keeps the annotation):

```
	column 'Product ID'
		dataType: int64
		annotation pbiplint.ignore = HIDE_FOREIGN_KEYS, MARK_PRIMARY_KEYS
```

## What it checks

Every rule from the Microsoft Best Practice Analyzer ruleset, ported literally so the numbers match
Tabular Editor. Five rules need statistics only a live model has; they are listed but not run. Each
rule has a page at https://pbiplint.com/rules with what it checks, why, how to fix it, and quirks.

The same linter runs in the browser at https://pbiplint.com. Source, issues, and contributing:
https://github.com/pbiplint/pbiplint.

## License

Copyright (C) 2026 McKinley Consulting. GNU Affero General Public License, version 3 or later; see
LICENSE. The vendored Microsoft ruleset is MIT-licensed; see NOTICE. The name pbiplint and its
logo are trademarks of McKinley Consulting.
````

- [ ] **Step 4: Run the checks and add the CI step**

Run: `npm run build && npm run check:pack && npm run lint && npm test`
Expected: `pack contents look right`, both packages listed with their file counts; nothing under `test/` or a `tsbuildinfo` in either tarball; everything else green. If `dist/tsconfig.tsbuildinfo` still appears, the `tsBuildInfoFile` setting did not take: check `tsc -b packages/core` (the root `typecheck`) and the package build both use it.

`.github/workflows/ci.yml`: after `- run: npm run build`, add `- run: npm run check:pack`.

- [ ] **Step 5: Commit**

```bash
git add packages/core/package.json packages/core/tsconfig.json packages/core/README.md packages/cli/package.json packages/cli/README.md scripts/check-pack.mjs package.json .github/workflows/ci.yml
git commit -m "chore: complete the package manifests and READMEs and check the tarballs in CI"
```

---

### Task 13: Release workflow, release doc, README and CONTRIBUTING updates, spec correction

**Files:**
- Create: `.github/workflows/release.yml`, `scripts/check-release-tag.mjs`, `scripts/publish.mjs`, `docs/RELEASING.md`
- Modify: `README.md`, `CONTRIBUTING.md`, `docs/superpowers/specs/2026-09-04-pbiplint-v1-design.md`

**Interfaces:**
- Produces: pushing a tag `vX.Y.Z` verifies, builds, checks, publishes whichever of the two packages is not yet on the registry at that version, and creates a GitHub release with generated notes. `scripts/publish.mjs` is idempotent so a rerun, or a tag pushed after a manual first publish, never fails on an already published version.

- [ ] **Step 1: Write the release scripts**

`scripts/check-release-tag.mjs`:

```js
#!/usr/bin/env node
// Usage: node scripts/check-release-tag.mjs v1.2.3
// Fails unless the tag is exactly "v" plus the version in packages/core/package.json (the CLI's
// version is checked against the core's by the version test and by scripts/check-pack.mjs).
import { readFileSync } from "node:fs";

const tag = process.argv[2] ?? "";
const { version } = JSON.parse(readFileSync("packages/core/package.json", "utf8"));
if (tag !== `v${version}`) {
  console.error(`tag ${tag || "(none)"} does not match package version ${version}`);
  process.exit(1);
}
console.log(`tag ${tag} matches package version ${version}`);
```

`scripts/publish.mjs`:

```js
#!/usr/bin/env node
// Usage: node scripts/publish.mjs   (in the release workflow, after build and check:pack)
//
// Publishes each package whose version is not on the registry yet. Skipping what is already there
// makes the workflow safe to rerun and lets a tag follow a first publish done by hand.
// In GitHub Actions the publish authenticates through npm trusted publishing (OIDC), so no token
// is read here; provenance is attached by npm.
import { execFileSync, spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";

for (const dir of ["packages/core", "packages/cli"]) {
  const { name, version } = JSON.parse(readFileSync(`${dir}/package.json`, "utf8"));
  const seen = spawnSync("npm", ["view", `${name}@${version}`, "version"], { encoding: "utf8" });
  if (seen.status === 0 && seen.stdout.trim() === version) {
    console.log(`${name}@${version} is already published, skipping`);
    continue;
  }
  console.log(`publishing ${name}@${version}`);
  execFileSync("npm", ["publish", "-w", name], { stdio: "inherit" });
}
```

Run: `node scripts/check-release-tag.mjs v0.0.0; echo "exit $?"` and `node scripts/check-release-tag.mjs v9.9.9; echo "exit $?"`
Expected: `exit 0` then `exit 1`. Do not run `publish.mjs` locally.

- [ ] **Step 2: Write the release workflow**

`.github/workflows/release.yml`:

```yaml
name: Release

on:
  push:
    tags: ["v*"]

permissions:
  contents: write
  id-token: write

concurrency:
  group: release-${{ github.ref }}
  cancel-in-progress: false

jobs:
  publish:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v7
      - uses: actions/setup-node@v7
        with:
          node-version: 22
          cache: npm
      # Trusted publishing needs npm 11.5.1 or later; Node 22 ships an older npm.
      - run: npm install -g npm@latest
      - run: npm ci
      - run: node scripts/check-release-tag.mjs "$GITHUB_REF_NAME"
      - run: npm run lint
      - run: npm run typecheck
      - run: npm test
      - run: npm run check:browser
      - run: npm run build
      - run: npm run check:pack
      - run: node scripts/publish.mjs
      - uses: softprops/action-gh-release@v3
        with:
          generate_release_notes: true
```

- [ ] **Step 3: Write the release doc**

`docs/RELEASING.md`:

```markdown
# Releasing pbiplint

Two packages ship together at the same version: `@pbiplint/core` and `pbiplint` (the command
line, which bundles the core). The site at pbiplint.com deploys itself on every push to main and
is not versioned.

## One-time setup (done once, kept here for the record)

- npm organization `pbiplint`, with Michael's npm account as owner and two-factor authentication on.
- The first version of each package was published by hand (see "First release" below), because
  npm only lets a trusted publisher be configured on a package that already exists.
- Trusted publishing configured on npmjs.com for each package: package settings, "Trusted
  publisher", GitHub Actions, organization `pbiplint`, repository `pbiplint`, workflow file
  `release.yml`, environment left blank. From then on the workflow publishes without a token and
  npm attaches provenance.

## Every release

1. On a branch from main, set the version in both packages and regenerate the core's version file:

   ```bash
   npm version 0.2.0 -w @pbiplint/core -w pbiplint --no-git-tag-version
   npm install
   npm run version:sync
   npm test && npm run build && npm run check:pack
   ```

2. Commit as `chore: release v0.2.0`, open a pull request, let CI pass, merge.
3. Tag the merge commit and push the tag:

   ```bash
   git fetch origin main && git tag v0.2.0 origin/main && git push origin v0.2.0
   ```

4. The Release workflow verifies the tag against the version, runs every check, builds, dry-runs
   the tarballs, publishes both packages, and creates the GitHub release with generated notes.
   Watch it with `gh run watch --repo pbiplint/pbiplint`.
5. Check: `npx pbiplint@0.2.0 --sample` in an empty folder exits 1 with 161 findings.

A rerun of the workflow, or a tag pushed after a manual publish, is safe: `scripts/publish.mjs`
skips a version that is already on the registry.

## First release (v0.1.0, by hand)

Done once by Michael from a clean checkout of the release commit, logged in to npm:

```bash
npm ci && npm run build && npm run check:pack
npm publish -w @pbiplint/core
npm publish -w pbiplint
```

Then the trusted publisher was configured for each package and the tag was pushed, which created
the GitHub release and skipped the two publishes.

## Later

`pbip-lint` (with the hyphen) is published as a thin package that depends on `pbiplint`, so a
guessed name still installs the right thing. Not before v0.1.0 has been out for a while.
```

- [ ] **Step 4: Update the README**

`README.md` changes:

- In "Use it", after the CLI block, add:

  ````markdown
  Or use it in the browser at https://pbiplint.com: paste TMDL or drop a `.SemanticModel` folder.
  The page never uploads anything; the About page explains how to check that.
  ````

- Replace the exit code sentence with: `Exit codes: 0 no findings at or above --fail-on (default error), 1 findings, 2 usage or input error. That makes it a CI gate.`
- In "Configure it", add `"$schema": "https://pbiplint.com/schema/pbiplint.config.schema.json",` as the first line of the JSON example and, after the block, the sentence: `The $schema line is optional; with it, editors validate the file as you type.`
- In "Links", change `https://pbiplint.com (coming)` to `https://pbiplint.com`, and add `- Rule pages: https://pbiplint.com/rules`.
- In "What it checks", change `Each rule has a page under rules/ ...` to `Each rule has a page at https://pbiplint.com/rules (source under rules/) with ...`.
- Leave the "Status" section for Task 14.

- [ ] **Step 5: Update CONTRIBUTING**

`CONTRIBUTING.md` changes:

- Under "Layout", after the `packages/cli` line, add: `` - `packages/web`: the site, a static Vite build. `src/build` generates the rule pages, the rules index, the about page, and the sitemap from `rules/*.md` and `content/about.md` into gitignored folders, and fails the build if any page references the network. `npm run dev -w @pbiplint/web` serves it. ``
- Under "Setup", add `npm run build` to the command list with the comment `# core, CLI, and the site (the site build fails on any network reference)`.
- Under "Rule pages", add: `The site renders each page at pbiplint.com/rules/<slug>; the build regenerates it from the Markdown, so a merged page edit is live after the next deploy.`
- Add a section before "Style": `## Releasing` with the one line `See docs/RELEASING.md.`

- [ ] **Step 6: Correct spec section 5 and the spec header**

In `docs/superpowers/specs/2026-09-04-pbiplint-v1-design.md`:

- Line 3: append ` Web app, deploy, and publish plan: docs/superpowers/plans/2026-09-14-pbiplint-v1-web-deploy-and-publish.md.`
- In section 5, replace the two interfaces in the code block with what the code has:

  ```ts
  interface Rule {
    id: string;            // stable; Microsoft IDs kept verbatim for ported rules
    name: string;
    category: Category;    // Performance | Error Prevention | DAX Expressions | Maintenance | Formatting | Naming Conventions
    severity: 1 | 2 | 3;   // info | warning | error, as in the source ruleset
    scope: ObjectType[];
    description: string;   // the first paragraph of the rule page's "What it checks"
    references: string[];  // documentation URLs
    status: "ported" | "needsLiveModel" | "builtin";   // needsLiveModel: declared, never run
    check(model: Model, ctx: RuleContext): RuleFinding[];
  }

  interface Finding {
    ruleId: string;
    objectType: ObjectType;
    objectName: string;    // Tabular Editor's display name: 'Table'[Column], [Measure], 'Table', Model
    location?: { file: string; line: number };
    detail?: string;       // rule-specific specifics, optional
  }
  ```

  and change the sentence `Rules that need VertiPaq statistics ... are declared with needsLiveModel` to say `are declared with status "needsLiveModel"`.

- [ ] **Step 7: Lint, then commit**

Run: `npm run lint && npm test -- version`
Expected: clean (Prettier ignores `*.md`; the workflow YAML is not linted).

```bash
git add .github/workflows/release.yml scripts/check-release-tag.mjs scripts/publish.mjs docs/RELEASING.md README.md CONTRIBUTING.md docs/superpowers/specs/2026-09-04-pbiplint-v1-design.md
git commit -m "chore: add the tag-driven release workflow and the release, README, and contributor docs"
```

Push, open a pull request titled "Release workflow and package docs" (Tasks 12 and 13), let CI pass, and have Michael merge it. Pushing `release.yml` needs the `workflow` scope, as in Task 11.

---

### Task 14: First release, v0.1.0

**Files:**
- Modify: `packages/core/package.json`, `packages/cli/package.json`, `packages/core/src/version.ts`, `package-lock.json`, `README.md`

**Interfaces:**
- Produces: `pbiplint@0.1.0` and `@pbiplint/core@0.1.0` on npm, the tag `v0.1.0` and a GitHub release, trusted publishing configured for every later version, and a README that says the tool is released.

- [ ] **Step 1: Michael: npm account and organization**

**Michael:** on npmjs.com, sign in (or create an account) with two-factor authentication turned on, then create an organization named `pbiplint` (free for public packages; the scoped package `@pbiplint/core` needs it). In Terminal on this Mac, run `npm login` and finish the browser flow; `npm whoami` then prints the account.

- [ ] **Step 2: Bump to 0.1.0 on a branch**

```bash
git checkout -b release-0.1.0 main
npm version 0.1.0 -w @pbiplint/core -w pbiplint --no-git-tag-version   # if npm refuses the workspace flags, set "version" in both package.json files by hand
npm install
npm run version:sync
npm test && npm run typecheck && npm run lint && npm run build && npm run check:pack
git add packages/core/package.json packages/cli/package.json packages/core/src/version.ts package-lock.json
git commit -m "chore: release v0.1.0"
git push -u origin release-0.1.0
```

Expected: the version test passes with `0.1.0`; `check:pack` prints both packages at 0.1.0. Open a pull request titled "Release v0.1.0"; CI passes; **Michael** merges it.

- [ ] **Step 3: Michael: publish both packages by hand**

**Michael:** from a clean checkout of main at the merge commit (or after `git pull` on a clean tree):

```bash
git checkout main && git pull
npm ci && npm run build && npm run check:pack
npm publish -w @pbiplint/core
npm publish -w pbiplint
```

npm asks for the one-time code on each publish. `publishConfig.access` is already `public`. Expected: `+ @pbiplint/core@0.1.0` and `+ pbiplint@0.1.0`.

- [ ] **Step 4: Michael: configure trusted publishing**

**Michael:** on npmjs.com, for each of `@pbiplint/core` and `pbiplint`: package page, Settings, "Trusted publisher", GitHub Actions; organization or user `pbiplint`, repository `pbiplint`, workflow filename `release.yml`, environment blank; save. Optionally set the package's publishing access to "Require two-factor authentication or a trusted publisher" so a leaked token could never publish.

- [ ] **Step 5: Tag the release**

```bash
git fetch origin main
git tag v0.1.0 origin/main
git push origin v0.1.0
gh run watch --repo pbiplint/pbiplint "$(gh run list --repo pbiplint/pbiplint --workflow Release --limit 1 --json databaseId --jq '.[0].databaseId')"
```

Expected: the Release workflow passes every check, `publish.mjs` prints `already published, skipping` for both packages, and a GitHub release `v0.1.0` appears with generated notes (`gh release view v0.1.0 --repo pbiplint/pbiplint`).

- [ ] **Step 6: Verify from a clean machine's point of view**

```bash
cd "$(mktemp -d)" && npx --yes pbiplint@0.1.0 --sample | head -5; echo "exit ${PIPESTATUS[0]}"
npm view pbiplint version description homepage repository.url
npm view @pbiplint/core version files
```

Expected: the summary line `pbiplint: 161 findings (16 errors, 39 warnings, 106 info) in 11 files`, exit 1; both views show 0.1.0, the homepage, and the git+ repository URL.

- [ ] **Step 7: Update the README status and commit**

Replace the "Status" section of `README.md` with:

```markdown
## Status

Version 0.1.0, released on the date of the v0.1.0 tag (write it as a long-form date, for example September 21, 2026). It covers the semantic model layer (TMDL):
every rule from the Microsoft best-practice ruleset, ported and verified against Tabular
Editor, in the browser at https://pbiplint.com and on the command line. Report rules (PBIR)
and Power Query rules follow.
```

```bash
git checkout main && git pull
git add README.md
git commit -m "docs: mark v0.1.0 as released"
git push
```

(Michael's admin bypass allows the direct push; a pull request is fine too.)

---

## Self-review against the spec

- **Section 9 (web app):** home page with paste box, drop zone, folder picker for Chrome and Edge with a directory input elsewhere, single `.tmdl` drop, sample button (Tasks 3 to 8). Results with ranked groups, object list with file and line, filters by category and severity, Markdown and JSON export, privacy line linking to the verification note (Task 7). Rules index and rule pages from `rules/*.md` at build time, About page with the no-upload verification (Task 9). No backend, accounts, analytics, or external requests; fonts bundled (Task 3); build check that fails on any network reference (Task 10). "Works offline once loaded" is met as stated: a loaded page keeps working with the network off, because nothing it does needs the network; there is no service worker, so navigating to a page that was never loaded needs the network (About says exactly this).
- **Section 11 (sample):** bundled into the site by `import.meta.glob` (Task 6); the CLI and the parity fixture were done in plan 1.
- **Section 13 (tooling):** Vite for the site; CI runs lint, tests, parity, purity, and now the site build and the pack check (Tasks 10 and 12); deploy to Pages on merge to main (Task 11); semantic versions published as `pbiplint` and `@pbiplint/core` with the first publish claiming the names (Tasks 13 and 14); `pbip-lint` deferred as the spec says.
- **Section 14 (definition of done):** web deployed at pbiplint.com (Task 11); CLI published (Task 14); README with the no-upload claim and how to verify it (Task 13 links the About page and the CLI README states it). Section 5's interface sketch corrected to the code (Task 13).
- **Carried from plan 1:** git+ repository URLs, per-package READMEs, `npm pack --dry-run` in CI, core VERSION from package.json, source maps decision (ship `src` and declaration maps), `$schema` in the config, README exit code 2, workflow permissions and concurrency, percent-encoded SARIF URIs, the `///` blank-line check, and the spec section 5 update: all placed (Tasks 1, 2, 10, 12, 13).

## Definition of done for this plan

- pbiplint.com serves the site over HTTPS with `www` redirecting; every page carries the CSP; the sample lints in the browser with no network request after load; rule pages resolve from CLI output URLs.
- CI green on Node 20 and 22 with the site build, the site check, and the pack check; the deploy workflow runs on every push to main.
- `pbiplint@0.1.0` and `@pbiplint/core@0.1.0` on npm; `npx pbiplint --sample` works from an empty folder; trusted publishing configured; `v0.1.0` release on GitHub.
- README, CONTRIBUTING, RELEASING, and the spec updated as above.

Not in this plan: v2 (PBIR rules, whole-PBIP drop, GitHub Action), v3 (Power Query rules), the `pbip-lint` alias package, a service worker for full offline navigation, channel videos on rule pages (the `video` frontmatter slot is rendered when filled).
