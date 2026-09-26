# pbiplint

Best-practice linter for Power BI projects. Point it at a PBIP folder, a `.pbip` file, a
`.SemanticModel` folder, a `.Report` folder, a `definition` folder, or one `.tmdl` file and get
ranked findings with a link to a fix page for each rule, and, when the input has a report, a
"Report at a glance" block that says what the report will do when someone opens it. Nothing is
uploaded: it reads the files you name and writes to your terminal. Node 20.19 or later (or 22.12
or later).

```bash
npx pbiplint path/to/Model.SemanticModel
npx pbiplint --sample                                       # a bundled project, a model and its report, with planted violations
npx pbiplint path/to/model --format sarif --output pbiplint.sarif
npx pbiplint path/to/model --format markdown
npx pbiplint rules                                          # every rule with status and severity
npx pbiplint --help                                         # every option, in one screen
npx pbiplint --version
```

Formats: `text` (default), `json`, `sarif` (for GitHub code scanning and editors), `markdown`.

Exit codes: `0` no findings at or above `--fail-on`, `1` findings, `2` usage or input error.
`--fail-on error` is the default; `--fail-on warning` and `--fail-on info` tighten the gate;
`--fail-on none` always exits 0.

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

A rule that takes options is set with an object, such as
`"REDUCE_VISUALS_ON_PAGE": { "severity": "error", "max": 15 }`; each rule's page lists its options.

To ignore a rule on one object, annotate it in TMDL (Power BI Desktop keeps the annotation):

```
	column 'Product ID'
		dataType: int64
		annotation pbiplint.ignore = HIDE_FOREIGN_KEYS, MARK_PRIMARY_KEYS
```

To ignore a report rule on one page or visual, add the annotation to the `annotations` array of its
page.json or visual.json (Power BI Desktop keeps it there too):

```json
"annotations": [{ "name": "pbiplint.ignore", "value": "ENSURE_ALTTEXT" }]
```

## What it checks

Every rule from the Microsoft Best Practice Analyzer ruleset, ported literally so the numbers match
Tabular Editor. Five rules need statistics only a live model has; they are listed but not run. Each
rule has a page at https://pbiplint.com/rules with what it checks, why, how to fix it, and quirks.

The report layer (PBIR) is read beside the model: a `.Report` folder alone is valid input, and with
the model beside it the two are paired through `definition.pbir` and checked together. The report
rules are the 11 base rules of PBI Inspector by Nat Van Gulck, ported so the results match its
command line on the same report, with six documented deviations, and pbiplint's own rules for a
report's correctness and readiness and for the model objects the report never reaches. When the
input has a report, the "Report at a glance" block states what the report will do when someone
opens it, whether or not anything fired. A notice names anything about the input a reader must
know, such as a file that could not be read or a `definition.pbir` that points at a model other
than the one beside it.

The same linter runs in the browser at https://pbiplint.com. Source, issues, and contributing:
https://github.com/pbiplint/pbiplint.

## License

Copyright (C) 2026 McKinley Consulting. GNU Affero General Public License, version 3 or later; see
LICENSE. The vendored Microsoft ruleset and PBI Inspector rule metadata are MIT-licensed; see
NOTICE. The name pbiplint and its logo are trademarks of McKinley Consulting.
