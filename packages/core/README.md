# @pbiplint/core

The linter behind [pbiplint](https://pbiplint.com): parse TMDL and PBIR, build the semantic model
and the report, run the best-practice rules, rank the findings, and format them. Pure TypeScript
with no dependencies, no Node APIs, and no network access, so it runs in a browser tab as well as
in Node 20.19 or later (or 22.12 or later).

`lint(files)` takes both parts of a Power BI project, `.tmdl` files for the model and the report's
JSON (paths relative to each part's root), and returns findings for both, `layers` saying which
part was read, `facts` for "Report at a glance", and `diagnostics` for what a reader of the results
must know about the input, such as a file that could not be read. Either part alone is valid
input; with both parts, each is also checked against the other, for example the report for fields
the model does not have and the model for columns and measures the report never reaches.

```ts
import { formatText, lint } from "@pbiplint/core";

const result = lint([
  { path: "definition/model.tmdl", text: modelTmdl },
  { path: "definition/tables/Sales.tmdl", text: salesTmdl },
]);

console.log(formatText(result)); // or formatJson, formatMarkdown, formatSarif
for (const group of result.groups) console.log(group.rule.id, group.findings.length, group.rule.url);
```

`result.groups` is ranked by severity, then category, then count, exactly as the command line and
the website show it. Every rule has a page at `https://pbiplint.com/rules/<slug>`; `group.rule.url`
points at it.

The optional second argument, `lint(files, options)`, takes the config, the rules to run, and
what the caller's input reader found besides the files. `config` is a `pbiplint.config.json`
object. `rules` lists the rules to run in place of the default set, `defaultRules`. `diagnostics`
are the reader's notices, such as a file it could not read, carried onto the result. `absent`
gives, per layer, why the reader left that layer out, for the skipped line. `unreadPaths` lists,
per layer, the files and folders the reader could not read, each relative to its part's root in
forward slashes and a folder with a trailing `/`; a path that is not a file the layer reads (a
`.tmdl` file for the model, a file `isReportFile` accepts for the report) is read as a folder. The
layer then knows what it lacks, so no finding or fact states what was not read.

The model rules are literal ports of the Microsoft Best Practice Analyzer ruleset, verified against
Tabular Editor. The report rules are the 11 base rules of PBI Inspector by Nat Van Gulck, ported and
verified against fab-inspector's command line, and pbiplint's own rules for the report and for the
model and report together. A port keeps its source's quirks on purpose, apart from six documented
deviations from PBI Inspector, and each rule's page documents them.

For the command line, install [`pbiplint`](https://www.npmjs.com/package/pbiplint). Source, issues,
and contributing: https://github.com/pbiplint/pbiplint.

## License

Copyright (C) 2026 McKinley Consulting. GNU Affero General Public License, version 3 or later; see
LICENSE. The vendored Microsoft ruleset and PBI Inspector rule metadata are MIT-licensed; see
NOTICE. The name pbiplint and its logo are trademarks of McKinley Consulting.
