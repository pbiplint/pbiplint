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

## License

pbiplint is licensed under the GNU Affero General Public License, version 3 or later (see
[LICENSE](LICENSE)). By submitting a contribution you agree that it is licensed under the same
terms.
