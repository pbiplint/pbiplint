# Contributing to pbiplint

## Setup

```bash
npm install
npm test            # unit tests and the parity suites (Tabular Editor and fab-inspector expectations)
npm run typecheck && npm run lint
npm run check:browser
npm run build       # core, CLI, and the site (the site build fails on any network reference)
npm run test:e2e    # the site in Chromium, Firefox, and WebKit; run `npx playwright install` once first
```

Node 20.19 or later (or 22.12 or later), which Vite needs for the site build. No runtime dependencies are allowed in `packages/core` or `packages/cli`.

## Layout

- `packages/core`: parser (TMDL and PBIR), object models, indexes, rules, ranking, formatters. Browser-pure: no `node:` imports, no network.
- `packages/cli`: the `pbiplint` command. Folder walk, config discovery, output, exit codes.
- `packages/web`: the site, a static Vite build. `src/build` generates the rule pages, the rules index, the about page, and the sitemap from `rules/*.md` and `content/about.md` into gitignored folders, and fails the build if any page references the network. `npm run dev -w @pbiplint/web` serves it.
- `rules/`: one Markdown page per rule, written by hand. Content, not code; see Rule pages below.
- `tests/fixtures`, `tests/expectations`: parity fixtures (model fixtures and whole-PBIP project fixtures) and the results they must match: `<name>.json` from Tabular Editor, and `<name>.report.json` from fab-inspector, with the native rules' findings and pbiplint's side of each deviation written by hand.
- `examples/messy-sales`: the sample project `pbiplint --sample` lints, a PBIP folder whose model (`Messy Sales Demo.SemanticModel`) is also a Tabular Editor parity fixture, with its report (`Messy Sales Demo.Report`, which plants a violation of every report rule and is also a fab-inspector parity fixture) and the `pbiplint.config.json` that sets the policies two of those rules need to fire.

## Adding or changing a rule

1. Find the rule in `packages/core/src/rules/microsoft-bpa/bpa-rules.data.ts` (generated from Microsoft's `BPARules.json`; do not edit by hand).
2. Write a failing unit test in the matching `packages/core/test/rules-*.test.ts` using `objectNames(rule, tmdl)`.
3. Port the rule literally with `bpaRule(id, check)` in the matching file under `packages/core/src/rules/microsoft-bpa/`. Keep Microsoft's quirks; document them on the rule page under `## Quirks`.
4. Run `npm test -- parity`. Every ported model rule is compared against Tabular Editor's object list on every fixture.
5. If no fixture exercises the rule, add the construct to `tests/fixtures/rule-zoo.SemanticModel` and refresh its expectations (below).
6. Scaffold the rule page with `node scripts/generate-rule-pages.mjs` and write it (see Rule pages below).

## Adding a report rule

1. A port of a PBI Inspector base rule goes under `packages/core/src/rules/pbi-inspector/` with `inspectorRule(id, { category, scope, options }, check)`; its id and name come from the vendored `inspector-rules.data.ts` (regenerate with `node scripts/vendor-inspector-rules.mjs <Base-rules.json> <commit>`), and its description, as every rule's does, from its page. A rule of pbiplint's own goes under `packages/core/src/rules/pbiplint/` with `pbiplintRule({ ... })`. Both read the report object model (`packages/core/src/pbir/types.ts`) and the indexes. A rule of pbiplint's own names the part it reads in `layer`, `"project"` for both, and one that reads one part but cannot run without the other declares `needs` as well, as `REPORT_LEVEL_MEASURES` does.
2. Write a failing unit test on inline JSON with the helpers in `packages/core/test/report-helpers.ts`.
3. Pin it. A port must match the oracle on every fixture in `tests/expectations/*.report.json` (`npm test -- report-parity`). A native rule has no oracle, so each fixture's `native` map lists, under the rule's id, the id (or name) of the object of every finding the rule produces there. Every report rule, ported or native, must fire on the sample (`tests/expectations/messy-sales.report.json`), so a new one is planted in `examples/messy-sales` too.
4. Scaffold the page with `node scripts/generate-rule-pages.mjs` and write it (see Rule pages). A report rule's example is two fences, `pbir fires <file>` and `pbir fixed <file>`, each one JSON document for the file it names (`visual.json`, `page.json`, `report.json`, `pages.json`, `bookmarks.json`, a `<name>.bookmark.json`, `reportExtensions.json`, `definition.pbir`, or `tree.json`, which maps several paths to documents); an optional fence with the info string `json pbiplint.config.json` sets options for both runs. The rule-pages test places each document in a stock report, with a stock model when the rule needs one, and lints them the way it lints TMDL examples.

## Deviating from a ported rule

A port matches its source unless the source is wrong in a way that would make pbiplint noisy on real reports, or miss what the rule means to report. Adding a deviation needs three things that the parity and rule-page tests hold together: one sentence in the `deviations` map of an expectation file whose fixture shows the difference, pbiplint's own result for that rule under `ours` in the same file, and the same sentence under Quirks on the rule's page. A deviation that shows no difference on its fixture fails the test. A deviation no fixture shows yet has no expectation entry: its sentence goes under Quirks on the rule's page and in the rule's doc comment, and the rule's unit tests pin pbiplint's behaviour until a fixture shows it. Refreshing the oracle's results is in `docs/RELEASING.md`.

## Refreshing parity expectations

Tabular Editor is a development-time oracle only. Users, the CLI, and CI never need it.

```bash
te bpa run tests/fixtures/rule-zoo.SemanticModel/definition -r /path/to/BPARules.json --no-defaults --no-model-rules --output-format json > /tmp/zoo.json
node scripts/te-expectations.mjs tests/fixtures/rule-zoo.SemanticModel tests/expectations/rule-zoo.json --from /tmp/zoo.json
```

`te` is the Tabular Editor 3 command line (Windows, macOS, Linux). The free Tabular Editor 2 CLI on Windows works too with its own flags. Without either, submit hand-verified expectations and say so in the pull request. Keep the `skipRules` entries and their reasons.

The report rules are pinned to fab-inspector the same way; the steps are in docs/RELEASING.md under Report parity expectations. What Tabular Editor CLI 0.7.0 changes for these commands, and what a re-capture after September 30, 2026 needs first, is in the same file under Model parity expectations.

New fixtures must be sanitized: `node scripts/sanitize-fixture.mjs <modelDir | projectDir>` rewrites every absolute path in the TMDL to `C:\Demo\Data\<name>`, deletes what does not belong in a fixture (Desktop caches and layouts, registered resources, custom visual packages, `.pbix` files), and edits a report's `report.json` so it no longer names the resources it deleted. TMDL carries no data.

## Rule pages

Every rule has a page in `rules/`, written in pbiplint's own words. The rule-pages test checks them. The site renders each page at `pbiplint.com/rules/<slug>`; the build regenerates it from the Markdown, so a merged page edit is live after the next deploy. The template is specified in `docs/superpowers/specs/2026-09-19-rule-pages-template-design.md`.

Sections, in this order: What it checks, Example, Why it matters, How to fix it, When to ignore it, Quirks, Related rules, Links. The first five are required. A rule that needs a live model has no Example and no When to ignore it, because it never runs. Quirks, Related rules, and Links appear only when there is something to say.

- `node scripts/generate-rule-pages.mjs` scaffolds a page for any rule that has none, with TODO placeholders that the test rejects until they are replaced. It never touches an existing page and never copies prose from the ruleset. Build core first.
- Do not paste the ruleset's description text into a page. `sources` in the frontmatter is the attribution: the URL of the ruleset the rule is ported from and nothing else, empty for a built-in rule. The site prints it as a line under the page. Further reading goes under Links as `[text](url)`, never a bare URL and never a URL that is already in `sources`.
- The first paragraph of What it checks is the rule's description in tool output. Keep it to the condition, in one or two sentences. A second paragraph may show the finding as the tool prints it.
- Example holds two fenced blocks, one with the info string `tmdl fires` and one with `tmdl fixed` (on a report rule's page, the `pbir` pair that "Adding a report rule" describes), and no captions: the site and the SARIF help add them. The test lints both through the engine. The first must produce a finding for the rule and no parse issue (the parse-issue page is the exception, since its first snippet is the parse issue); the second must produce neither. Neither may carry a `pbiplint.ignore` annotation. Snippets are minimal and need not be clean on other rules.
- Every How to fix it gives a route that needs no third-party tool: Power BI Desktop, Power Query, the source system, or a direct edit to the TMDL file or, for a report rule, to the report's JSON, which Desktop preserves. Name the Desktop route and the TMDL or JSON property where both exist. Tabular Editor may be mentioned as an optional bulk shortcut or a linked walkthrough, and only after that route. No Tabular Editor fix expressions or other C# on the pages.
- When to ignore it is the judgment only: the cases where the finding is noise, or a sentence saying there are none. The annotation and config lines are generated from the rule id (`ignoreHelp` in core) onto the page and into the help block, and the test rejects a page that writes them by hand.
- Document every quirk kept from the source rule under Quirks, and every deviation from it (see Deviating from a ported rule).
- Related rules is a bulleted list. Each bullet opens with a rule id in backticks and says how the rules relate. The test checks the ids. On the site, a rule id in backticks anywhere on a page links to that rule's page.
- The pages also feed tool output. After editing a page, run `npm run build -w @pbiplint/core && node scripts/sync-rule-pages.mjs` to regenerate `packages/core/src/rules/rule-summaries.data.ts` and `packages/cli/src/rule-help.data.ts`; the rule-pages tests fail until they match.

## Testing a pull request

Every pull request runs three checks on GitHub, and it cannot merge with any of them red:

- The unit matrix on Node 20 and 22: lint, typecheck, the unit tests and the parity suites against the Tabular Editor and fab-inspector expectations, the browser-purity check on the core bundle, the full build with the site check that fails on any network reference, and the npm pack check.
- The browser suite (`packages/web/e2e`) in Chromium, Firefox, and WebKit against the production build: the inputs, the results, drag and drop, downloads, keyboard focus, deep links, the policy and build marker on every page, and an axe-core accessibility scan of every page template. Every test also proves that nothing wrote a console error and no request left the origin.
- The contributor license agreement.

Merging to `main` deploys the site within about a minute, and a verify job then fails the run unless pbiplint.com is serving that exact commit (every page carries `<meta name="pbiplint-build">` with the short sha). If verify goes red, revert the merge; the previous build is live again a minute later.

Four things stay manual, because no automation can reach them. Check them on the deployed site or with `npm run dev -w @pbiplint/web`, and only when the pull request touches that area:

| The change touches | Check by hand |
|---|---|
| The folder or drop input (`packages/web/src/main.ts`, `packages/web/src/input`) | "Choose a folder" in Chrome, and a real folder dragged from the desktop into Chrome |
| The live region or the results announcement | Run the sample with a screen reader on and confirm it reads one sentence |
| The facts panel or the layer filter (`packages/web/src/results/render.ts`) | Drop the sample project folder (`examples/messy-sales`) from the desktop into Chrome, and check that each linked fact in "Report at a glance" jumps to its group or opens its rule page, and that the Model and Report boxes hide and show the right groups |
| Visual design, layout, or copy | Look at it, on a phone-width window too |

The tests pin the sample project's counts, so a change to a rule or to the sample fails them until the expectations are updated. That is the point.

## Releasing

See docs/RELEASING.md.

## Style

- TypeScript strict, ESM, relative imports end in `.js`.
- Commit messages in the imperative.
- No em dashes anywhere in the repo, including docs and commit messages.
- Product naming avoids Microsoft trademarks; "for Power BI projects" in descriptive text is fine.

## License

pbiplint is licensed under the GNU Affero General Public License, version 3 or later (see
[LICENSE](LICENSE)). Contributions are accepted under the contributor license agreement in
CLA.md. A bot asks you to sign it on your first pull request by posting one sentence as a
comment, and you only sign once.
