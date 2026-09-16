# Contributing to pbiplint

## Setup

```bash
npm install
npm test            # unit tests and the Tabular Editor parity suite
npm run typecheck && npm run lint
npm run check:browser
npm run build       # core, CLI, and the site (the site build fails on any network reference)
npm run test:e2e    # the site in Chromium, Firefox, and WebKit; run `npx playwright install` once first
```

Node 20.19 or later (or 22.12 or later), which Vite needs for the site build. No runtime dependencies are allowed in `packages/core` or `packages/cli`.

## Layout

- `packages/core`: parser, object model, indexes, rules, ranking, formatters. Browser-pure: no `node:` imports, no network.
- `packages/cli`: the `pbiplint` command. Folder walk, config discovery, output, exit codes.
- `packages/web`: the site, a static Vite build. `src/build` generates the rule pages, the rules index, the about page, and the sitemap from `rules/*.md` and `content/about.md` into gitignored folders, and fails the build if any page references the network. `npm run dev -w @pbiplint/web` serves it.
- `rules/`: one Markdown page per rule, written by hand. Content, not code; see Rule pages below.
- `tests/fixtures`, `tests/expectations`, `examples/messy-sales`: parity fixtures and the Tabular Editor results they must match.

## Adding or changing a rule

1. Find the rule in `packages/core/src/rules/microsoft-bpa/bpa-rules.data.ts` (generated from Microsoft's `BPARules.json`; do not edit by hand).
2. Write a failing unit test in the matching `packages/core/test/rules-*.test.ts` using `objectNames(rule, tmdl)`.
3. Port the rule literally with `bpaRule(id, check)` in the matching file under `packages/core/src/rules/microsoft-bpa/`. Keep Microsoft's quirks; document them on the rule page under `## Quirks`.
4. Run `npm test -- parity`. Every ported rule is compared against Tabular Editor's object list on every fixture.
5. If no fixture exercises the rule, add the construct to `tests/fixtures/rule-zoo.SemanticModel` and refresh its expectations (below).
6. Scaffold the rule page with `node scripts/generate-rule-pages.mjs` and write it (see Rule pages below).

## Refreshing parity expectations

Tabular Editor is a development-time oracle only. Users, the CLI, and CI never need it.

```bash
te bpa run tests/fixtures/rule-zoo.SemanticModel/definition -r /path/to/BPARules.json --no-defaults --no-model-rules --output-format json > /tmp/zoo.json
node scripts/te-expectations.mjs tests/fixtures/rule-zoo.SemanticModel tests/expectations/rule-zoo.json --from /tmp/zoo.json
```

`te` is the Tabular Editor 3 command line (Windows, macOS, Linux). The free Tabular Editor 2 CLI on Windows works too with its own flags. Without either, submit hand-verified expectations and say so in the pull request. Keep the `skipRules` entries and their reasons.

New fixtures must be sanitized: `node scripts/sanitize-fixture.mjs <dir>` rewrites data paths and removes junk files. TMDL carries no data.

## Rule pages

Every rule has a page in `rules/`, written in pbiplint's own words. The rule-pages test checks them. The site renders each page at `pbiplint.com/rules/<slug>`; the build regenerates it from the Markdown, so a merged page edit is live after the next deploy.

- `node scripts/generate-rule-pages.mjs` scaffolds a page for any rule that has none, with TODO placeholders that the test rejects until they are replaced. It never touches an existing page and never copies prose from the ruleset.
- Do not paste the ruleset's description text into a page. The ruleset URL under `sources` is the attribution; the prose is ours.
- Every "How to fix it" gives a route that needs no third-party tool: Power BI Desktop, Power Query, the source system, or a direct edit to the TMDL file, which Desktop preserves. Tabular Editor may be mentioned as an optional bulk shortcut or a linked walkthrough, and only after that route.
- No Tabular Editor fix expressions or other C# on the pages.
- Document every quirk kept from the source rule under `## Quirks`, and refer to other rules by their id.
- The pages also feed tool output. The first paragraph of "What it checks" is the rule's description, and the Why, How to fix, and Quirks sections are the help block in SARIF. After editing a page, run `node scripts/sync-rule-pages.mjs` to regenerate `packages/core/src/rules/rule-summaries.data.ts` and `packages/cli/src/rule-help.data.ts`; the rule-pages tests fail until they match.

## Testing a pull request

Every pull request runs three checks on GitHub, and it cannot merge with any of them red:

- The unit matrix on Node 20 and 22: lint, typecheck, the unit tests and the Tabular Editor parity suite, the browser-purity check on the core bundle, the full build with the site check that fails on any network reference, and the npm pack check.
- The browser suite (`packages/web/e2e`) in Chromium, Firefox, and WebKit against the production build: the inputs, the results, drag and drop, downloads, keyboard focus, deep links, the policy and build marker on every page, and an axe-core accessibility scan of every page template. Every test also proves that nothing wrote a console error and no request left the origin.
- The contributor license agreement.

Merging to `main` deploys the site within about a minute, and a verify job then fails the run unless pbiplint.com is serving that exact commit (every page carries `<meta name="pbiplint-build">` with the short sha). If verify goes red, revert the merge; the previous build is live again a minute later.

Three things stay manual, because no automation can reach them. Check them on the deployed site or with `npm run dev -w @pbiplint/web`, and only when the pull request touches that area:

| The change touches | Check by hand |
|---|---|
| The folder or drop input (`packages/web/src/main.ts`, `packages/web/src/input`) | "Choose a folder" in Chrome, and a real folder dragged from the desktop into Chrome |
| The live region or the results announcement | Run the sample with a screen reader on and confirm it reads one sentence |
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
