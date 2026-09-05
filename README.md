# pbiplint

Best-practice linter for Power BI projects. Browser and CLI. Nothing leaves your machine.

Paste TMDL or Power Query, or drop a whole PBIP project, and get ranked
best-practice findings with guidance on how to fix each one. The analysis
runs entirely in your browser or on your own machine from the command
line. Nothing is uploaded, ever.

## Status

Pre-release. Nothing is published to npm yet, so the commands below start
working at the first release. That release covers the semantic model layer
(TMDL), ported from the Microsoft best-practice rules and verified against
Tabular Editor. Report rules (PBIR) and Power Query rules follow.

## Use it

```bash
npx pbiplint path/to/Model.SemanticModel        # or a PBIP folder, or one .tmdl file
npx pbiplint --sample                            # try it on the bundled sample project
npx pbiplint path/to/model --format sarif --output pbiplint.sarif
npx pbiplint rules                               # every rule with status and severity
```

Exit code 1 means findings at or above `--fail-on` (default `error`), so it works as a CI gate.

## Configure it

`pbiplint.config.json` next to your project (or anywhere above it):

```json
{
  "rules": {
    "REMOVE_ROLES_WITH_NO_MEMBERS": "off",
    "DAX_COLUMNS_FULLY_QUALIFIED": "warning"
  },
  "failOn": "warning"
}
```

The search walks up from the model to the filesystem root and uses the first file it finds, so a
`pbiplint.config.json` in a parent folder or in your home directory applies to every model below it.
Pass `--config <file>` to pick one explicitly.

To ignore a rule on one object, add an annotation in TMDL. Power BI Desktop keeps it:

```
	column 'Product ID'
		dataType: int64
		annotation pbiplint.ignore = HIDE_FOREIGN_KEYS, MARK_PRIMARY_KEYS
```

`annotation pbiplint.ignore = *` ignores every rule on that object.

## What it checks

Every rule from Microsoft's Best Practice Analyzer ruleset, ported literally so the numbers match Tabular Editor. Five rules need VertiPaq statistics and are listed but not run. Each rule has a page under `rules/` with what it checks, why, how to fix it, and known quirks.

## Links

- Website: https://pbiplint.com (coming)
- From the makers of [The Data Practitioner](https://www.youtube.com/@TheDataPractitioner)

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md).

## License

MIT. See [LICENSE](LICENSE). The vendored Microsoft ruleset has its own notice in
[NOTICE](NOTICE).
