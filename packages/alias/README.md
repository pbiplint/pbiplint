# pbip-lint

An alias for **[pbiplint](https://www.npmjs.com/package/pbiplint)**. The real package has no
hyphen; this one exists so a guessed name still installs and runs the right thing. It contains no
linter of its own: it depends on the matching version of `pbiplint` and hands the command straight
to it.

```bash
npx pbip-lint path/to/Model.SemanticModel
npx pbip-lint --sample
```

Every flag, format, exit code, and configuration option is pbiplint's. Read the documentation at
[pbiplint.com](https://pbiplint.com), or install `pbiplint` directly and skip the extra hop.

## License

Copyright (C) 2026 McKinley Consulting. GNU Affero General Public License, version 3 or later; see
LICENSE. The name pbiplint and its logo are trademarks of McKinley Consulting.
