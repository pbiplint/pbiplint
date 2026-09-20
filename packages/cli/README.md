# pbiplint

Best-practice linter for Power BI projects. Point it at a PBIP folder, a `.pbip` file, a
`.SemanticModel` folder, a `.Report` folder, a `definition` folder, or one `.tmdl` file and get
ranked findings with a link to a fix page for each rule, plus a "Report at a glance" block that
says what the report will do when someone opens it. Nothing is uploaded: it reads the files you
name and writes to your terminal. Node 20 or later.

```bash
npx pbiplint path/to/Model.SemanticModel
npx pbiplint --sample                                       # a bundled model with planted violations
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

The report layer (PBIR): 11 rules ported from PBI Inspector's base rules and pbiplint's own rules
for broken field references, model objects the report never reaches, the opening page, the Filters
pane, hidden visuals that still query, default page names, empty visuals, visuals past the page
edge, report-level measures, broken button and bookmark targets, tab order, and saved slicer
selections. A `.Report` folder alone is valid input; with the model beside it, the two are checked
against each other.

The same linter runs in the browser at https://pbiplint.com. Source, issues, and contributing:
https://github.com/pbiplint/pbiplint.

## License

Copyright (C) 2026 McKinley Consulting. GNU Affero General Public License, version 3 or later; see
LICENSE. The vendored Microsoft ruleset is MIT-licensed; see NOTICE. The name pbiplint and its
logo are trademarks of McKinley Consulting.
