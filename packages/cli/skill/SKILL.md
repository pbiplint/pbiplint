---
name: pbiplint
description: Lint a Power BI project (PBIP), its semantic model in TMDL and its report in PBIR, for best-practice problems, offline, with the pbiplint CLI. Use after creating or changing any TMDL or PBIR file, however the change was made (a script, an editor, an MCP server, or Power BI Desktop); when asked to check, review, or lint a Power BI project, model, or report, or whether one is right or ready; and before a commit or pull request that touches one. pbiplint 0.2.4.
license: MIT
metadata:
  version: "0.2.4"
---

# pbiplint

pbiplint checks a Power BI project's files against best-practice rules: the semantic model (TMDL) and the report (PBIR). This file says how to run it, how to read what it prints, and what to leave to the user. Each rule's own guidance comes from `pbiplint explain`, at the version installed.

## When to run it

- After any change to a project's `.tmdl` files or its report's JSON files, however the change was made: a script you wrote and ran, an edit to one file, a modeling MCP server, or the user in Power BI Desktop. When a script writes the project, lint after the script runs.
- When the user asks to check, review, or lint a project, a model, or a report.
- Before a commit or a pull request that touches one.

## What it reads

A PBIP folder, a `.pbip` file, a `.SemanticModel` folder, a `.Report` folder, a `definition` folder, or one `.tmdl` file. Either part alone is fine.

It cannot read a `.pbix` file (the user saves it as a Power BI project first, with File > Save as in Desktop), a report in the older format (one `report.json` with no `definition` folder), or a model stored as `model.bim`. It lints one project per run: given a folder that holds several, it lists them and exits 2, so lint each one it names.

It runs on this machine. It reads the project's files and prints to the terminal, it never uses the network, and nothing has to be uploaded to lint a project.

## How to run it

Use `npx pbiplint` (or `pbiplint` where it is installed). If pbiplint's MCP tools are available (`lint`, `explain_rule`, and `list_rules`), use them in place of the commands: `lint` takes the project's path with the same `quiet` and `rules` options, and `explain_rule` takes a rule id.

1. `pbiplint <path> --quiet` prints the summary and one line per rule with findings: `<severity> <RULE_ID> <count>`.
2. Work on errors first, then warnings. Info findings are suggestions: mention them, do not work through them unless asked.
3. `pbiplint <path> --rule <RULE_ID>` prints one rule's findings, each with its file and line. Give `--rule` more than once for several rules.
4. Before you fix a rule's findings, run `pbiplint explain <RULE_ID>`. It prints what the rule checks, an example, why it matters, how to fix it, and when to ignore it, at the version that produced the finding. Read it there rather than fetching the rule's web page.
5. Make the change, then lint the whole project again, not only the file you changed.
6. Stop when the run is clean of what you were asked to fix, or when what is left needs the user.

## Judgment

<!-- judgment -->
- Keep the tabs TMDL uses for indentation, and keep the formatting and key order Power BI Desktop writes, so a change shows as a small diff.
- Leave each report file's `$schema` as it is.
- Power BI Desktop can overwrite files that change while it has the project open. If the user may have it open, ask before changing files.
- Never clear a finding by ignoring it, changing the lint configuration, or deleting the object it names, without the user's say-so.
- When a finding matches its rule's "When to ignore it" case, ask the user rather than fixing it.
- Renaming a table, column, or measure reaches the report's files too. After a rename, check the whole project, not only the model.
- Info findings are suggestions, not a to-do list.
<!-- /judgment -->

## Reading the results

- Exit code 0: nothing at or above the gate (errors, by default). 1: something is. 2: nothing was linted: a usage error, an input it cannot read, a folder with several projects, or nothing it can lint. Read stderr for why. The full contract is at https://pbiplint.com/cli/#contract.
- A rule skipped because it needs a live model has not passed. It was not run.
- A summary that names a part it did not read (a report file it could not read, a model with no report) has not checked that part.
- Notices (on stderr, and in the text report) say what the run did with the input, such as linting the one project found below the folder given. Pass them on to the user.
- `--format json` prints the whole run as one document, for when you need every field.
- Ignoring a finding means a `pbiplint.ignore` annotation on the object or a change to `pbiplint.config.json`. Both are the user's call.

## Reporting back

Tell the user what you fixed, what is left and why, and what needs their decision, naming each rule by its id.

<!--
This skill file is licensed under the MIT License, so it can be committed to any repository.
The rest of pbiplint is licensed under the GNU Affero General Public License, version 3 or later.

MIT License

Copyright (c) 2026 McKinley Consulting

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
-->
