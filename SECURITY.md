# Security

pbiplint runs on your machine and makes no network calls. It reads the files you point it at
and writes to your terminal or to the file you name, and it uploads nothing.
[The pbiplint Privacy Promise](https://pbiplint.com/privacy/) says this for the site, the command
line, and the pipelines, with the checks that show it, and
[the CLI page](https://pbiplint.com/cli/#check) has the command line's checks in detail. To run a
verified copy of the site inside your own network, see
[Host pbiplint yourself](https://pbiplint.com/self-host/). There is
no service to attack, so the security surface is what happens when the linter is handed input it
did not expect.

## Reporting a vulnerability

Report it privately through GitHub:
[open a draft advisory](https://github.com/pbiplint/pbiplint/security/advisories/new). That
reaches the maintainer and stays private until a fix ships. Please do not open a public issue
for a suspected vulnerability.

What helps in a report:

- The pbiplint version (`pbiplint --version`) and your Node version.
- The command you ran.
- The smallest TMDL file or model folder that triggers it. Sanitize anything you cannot share;
  TMDL carries no data, but partition sources can reveal local folder names.
- What you expected, and what happened instead.

This is a one-person project. Expect an acknowledgement within a week. Fixes ship as a patch
release of the current version, and older versions are not backported. If you want credit in
the advisory, say so and say how you would like to be named.

## In scope

The case worth thinking about is pbiplint running in CI against a pull request from someone you
do not trust, which puts attacker-controlled TMDL in front of the parser.

- A crafted or malformed model that hangs the parser, crashes it, or exhausts memory.
- M is read within a fixed work limit per query and per model, counted from the text before
  Microsoft's Power Query parser runs, so a query past it is reported as a PARSE_ISSUE finding
  instead of parsed. A query under that limit that still hangs the parser, crashes it, or exhausts
  memory is in scope.
- Path handling in `--output` and `--config`: reading or writing outside the paths the user named.
- Model content that reaches SARIF output and is then ingested by a code scanning tool.
- Model content rendered into the page at https://pbiplint.com. The site runs this same linter
  in the browser tab and uploads nothing, so the bug that matters there is cross-site scripting
  through finding text.
- Anything in `packages/core` that reaches the network or the file system. The package is
  browser-pure by design and a build check is meant to make this impossible.
- Anything that breaks the Privacy Promise: a network request from the site or the command line,
  or a file opened that the Promise says pbiplint never opens.

## Not in scope

- A rule that misses a violation, fires when it should not, or disagrees with Tabular Editor.
  Those are bugs. Open a regular issue.
- Findings about your own model. The output describes your model; it is not a report about
  pbiplint.
- Vulnerabilities in Power BI, Tabular Editor, or other vendors' products. Report those to the
  vendor.
- Development dependencies that never ship. The `pbiplint` CLI ships one bundled file and has no
  runtime dependencies. `@pbiplint/core` has one, Microsoft's Power Query parser
  (`@microsoft/powerquery-parser`), pinned at exactly 2.0.0; the parser's own two dependencies,
  `grapheme-splitter` and `performance-now`, use caret ranges, so npm can install a later 1.x or 2.x
  of either, and the parser declares Node.js 22 or later, so npm warns on Node.js 20. A
  vulnerability in the parser that pbiplint's use of it reaches is in scope.
