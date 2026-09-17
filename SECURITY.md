# Security

pbiplint runs on your machine and makes no network calls. It reads the files you point it at
and writes to your terminal or to the file you name, and it uploads nothing. There is no
service to attack, so the security surface is what happens when the linter is handed input it
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
- Path handling in `--output` and `--config`: reading or writing outside the paths the user named.
- Model content that reaches SARIF output and is then ingested by a code scanning tool.
- Model content rendered into the page at https://pbiplint.com. The site runs this same linter
  in the browser tab and uploads nothing, so the bug that matters there is cross-site scripting
  through finding text.
- Anything in `packages/core` that reaches the network or the file system. The package is
  browser-pure by design and a build check is meant to make this impossible.

## Not in scope

- A rule that misses a violation, fires when it should not, or disagrees with Tabular Editor.
  Those are bugs. Open a regular issue.
- Findings about your own model. The output describes your model; it is not a report about
  pbiplint.
- Vulnerabilities in Power BI, Tabular Editor, or other vendors' products. Report those to the
  vendor.
- Development dependencies that never ship. `pbiplint` and `@pbiplint/core` have no runtime
  dependencies.
