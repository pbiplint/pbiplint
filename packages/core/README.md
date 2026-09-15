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
