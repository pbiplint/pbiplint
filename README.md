# pbiplint

Best-practice linter for Power BI projects. Browser and CLI. Nothing leaves your machine.

Paste TMDL, or drop a PBIP folder, a `.SemanticModel` folder, or a `.Report` folder, and get
ranked best-practice findings with guidance on how to fix each one, and, when the input has a
report, a "Report at a glance" block that says what the report will do when someone opens it. The
analysis runs entirely in your browser or on your own machine from the command line. Nothing is
uploaded, ever.

## Status

Version 0.2.0. It covers the semantic model layer (TMDL): every rule from the
Microsoft best-practice ruleset, ported and verified against Tabular Editor;
and the report layer (PBIR): the 11 base rules of PBI Inspector, ported and
verified against it, plus pbiplint's own rules for what is broken, unfinished,
or expensive in a report, and for what the model holds that the report never
reaches. Power Query rules follow. The site at https://pbiplint.com runs the
code on main; the command line runs the version npm gives you, and the
[releases page](https://github.com/pbiplint/pbiplint/releases) lists each
version with the date it was published.

## Use it

```bash
npx pbiplint path/to/Project                     # a PBIP folder, a .pbip file, a .SemanticModel or .Report folder, or one .tmdl file
npx pbiplint --sample                            # try it on the bundled sample project
npx pbiplint path/to/model --format sarif --output pbiplint.sarif
npx pbiplint rules                               # every rule with status and severity
```

Or use it in the browser at https://pbiplint.com: paste TMDL, or drop a PBIP folder, a
`.SemanticModel` folder, or a `.Report` folder. The page never uploads anything; the About page
explains how to check that.

Exit codes: 0 no findings at or above --fail-on (default error), 1 findings, 2 usage or input error. That makes it a CI gate.

### In GitHub Actions

One step lints the model on every pull request: the check fails on findings, each finding is
annotated on its line in the Files changed tab, the full report is in the job summary, and the
findings reach code scanning. See https://github.com/pbiplint/action for the inputs and outputs.

```yaml
permissions:
  contents: read
  security-events: write # for code scanning; drop it and set upload-sarif: false otherwise
steps:
  - uses: actions/checkout@v7
  - uses: pbiplint/action@v1
    with:
      path: Sales.SemanticModel
```

## Configure it

`pbiplint.config.json` next to your project (or anywhere above it):

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

The $schema line is optional; with it, editors validate the file as you type.

A rule that takes options is set with an object. The thresholds of the ported report rules and
the three policy rules are examples; each rule's page lists its options:

```json
{
  "rules": {
    "REDUCE_VISUALS_ON_PAGE": { "severity": "error", "max": 15 },
    "FILTERS_PANE_STATE": { "expect": "closed" },
    "SLICER_SELECTION_SAVED": { "expect": "none" },
    "TAB_ORDER_FOLLOWS_LAYOUT": { "expect": "layout" }
  }
}
```

The search walks up from the project to the filesystem root and uses the first file it finds, so
a `pbiplint.config.json` in a parent folder or in your home directory applies to every project
below it. Pass `--config <file>` to pick one explicitly. Rule ids match regardless of case, and an
id that names no rule prints a warning, so a typo never switches a rule off silently.

To ignore a rule on one object, add an annotation in TMDL. Power BI Desktop keeps it:

```
	column 'Product ID'
		dataType: int64
		annotation pbiplint.ignore = HIDE_FOREIGN_KEYS, MARK_PRIMARY_KEYS
```

`annotation pbiplint.ignore = *` ignores every rule on that object. Ids match regardless of case here too.

To ignore a report rule on one page or visual, add an annotation to the `annotations` array of its
page.json or visual.json. Desktop keeps it, and its value is a list of ids or `*`, as in TMDL:

```json
"annotations": [{ "name": "pbiplint.ignore", "value": "ENSURE_ALTTEXT" }]
```

## What it checks

Every rule from Microsoft's Best Practice Analyzer ruleset, ported literally so the numbers match Tabular Editor. Five rules need VertiPaq statistics and are listed but not run. Each rule has a page at https://pbiplint.com/rules (source under `rules/`) with what it checks, an example that fires it and the same example fixed, why it matters, how to fix it, when ignoring it is legitimate, known quirks, and related rules.

The report layer: the 11 base rules of [PBI Inspector](https://github.com/NatVanG/fab-inspector)
by Nat Van Gulck, ported so the results match its command line on the same report, with six
documented deviations where the source is noisier, or quieter, than it means to be; and pbiplint's
own rules for a report's correctness and readiness: fields the model does not have, model objects
the report never reaches, a landing page not set, the opening page, the Filters pane, hidden
visuals left with fields bound, default page names, empty visuals, visuals past the page edge,
report-level measures, actions that point at a missing page or bookmark, bookmarks that refer to a
missing page or visual, actions with no destination, tab order against layout, and saved slicer
selections and search terms. "Report at a glance" states what the report will do whether or not
anything fired.

## Links

- Website: https://pbiplint.com
- Rule pages: https://pbiplint.com/rules
- From the makers of [The Data Practitioner](https://www.youtube.com/@TheDataPractitioner)

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md).

## License

Copyright (C) 2026 McKinley Consulting.

pbiplint is free software under the GNU Affero General Public License,
version 3 or later. See [LICENSE](LICENSE). You can use it, modify it,
and share it. If you distribute a modified version, or run one as a
service, you must publish your source under the same license. Other
terms for closed products can be discussed with the copyright holder.
The vendored Microsoft ruleset and PBI Inspector rule metadata have their own notices in
[NOTICE](NOTICE).

The name pbiplint and its logo are trademarks of McKinley Consulting.
The code license does not cover them.
