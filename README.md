# pbiplint

Best-practice linter for Power BI projects. Browser and CLI. Nothing leaves your machine.

Paste TMDL or drop a `.SemanticModel` folder (whole PBIP projects and
Power Query rules come later), and get ranked best-practice findings with
guidance on how to fix each one. The analysis runs entirely in your
browser or on your own machine from the command line. Nothing is
uploaded, ever.

## Status

Version 0.1.0, released on September 16, 2026. It covers the semantic model
layer (TMDL): every rule from the Microsoft best-practice ruleset, ported and
verified against Tabular Editor, in the browser at https://pbiplint.com and on
the command line. Report rules (PBIR) and Power Query rules follow.

## Use it

```bash
npx pbiplint path/to/Model.SemanticModel        # or a PBIP folder, or one .tmdl file
npx pbiplint --sample                            # try it on the bundled sample project
npx pbiplint path/to/model --format sarif --output pbiplint.sarif
npx pbiplint rules                               # every rule with status and severity
```

Or use it in the browser at https://pbiplint.com: paste TMDL or drop a `.SemanticModel` folder.
The page never uploads anything; the About page explains how to check that.

Exit codes: 0 no findings at or above --fail-on (default error), 1 findings, 2 usage or input error. That makes it a CI gate.

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

The search walks up from the model to the filesystem root and uses the first file it finds, so a
`pbiplint.config.json` in a parent folder or in your home directory applies to every model below it.
Pass `--config <file>` to pick one explicitly. Rule ids match regardless of case, and an id that
names no rule prints a warning, so a typo never switches a rule off silently.

To ignore a rule on one object, add an annotation in TMDL. Power BI Desktop keeps it:

```
	column 'Product ID'
		dataType: int64
		annotation pbiplint.ignore = HIDE_FOREIGN_KEYS, MARK_PRIMARY_KEYS
```

`annotation pbiplint.ignore = *` ignores every rule on that object. Ids match regardless of case here too.

## What it checks

Every rule from Microsoft's Best Practice Analyzer ruleset, ported literally so the numbers match Tabular Editor. Five rules need VertiPaq statistics and are listed but not run. Each rule has a page at https://pbiplint.com/rules (source under `rules/`) with what it checks, why, how to fix it, and known quirks.

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
The vendored Microsoft ruleset has its own notice in [NOTICE](NOTICE).

The name pbiplint and its logo are trademarks of McKinley Consulting.
The code license does not cover them.
