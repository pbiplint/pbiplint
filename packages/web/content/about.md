---
title: About pbiplint
description: What pbiplint is, who makes it, and how to check for yourself that nothing you lint leaves your browser.
---

# About pbiplint

pbiplint is a free, open-source best-practice linter for Power BI projects. Paste TMDL or drop a `.SemanticModel` folder on the [home page](/), or run `npx pbiplint <path>` on your own machine, and get a ranked list of findings with a page for every rule that says what it checks, why it matters, and how to fix it.

## What it checks

Version 1 covers the semantic model: every rule from the Microsoft Best Practice Analyzer ruleset, ported so the results match Tabular Editor on the same model. Five rules need statistics only a live model has; they are listed but not run. Report rules and Power Query rules come next. The [rules index](/rules/) has the full list.

## Who makes it

pbiplint is made by McKinley Consulting, the makers of [The Data Practitioner](https://www.youtube.com/@TheDataPractitioner). It is free software under the GNU Affero General Public License, version 3 or later, and the source is on [GitHub](https://github.com/pbiplint/pbiplint). There is no paid tier, and no plan to charge for rules.

<h2 id="verify">How to check that nothing is uploaded</h2>

The analysis runs in your browser. There is no server behind this site, no account, and no analytics. You can check that yourself:

1. Open your browser's developer tools, switch to the Network tab, load this site, and lint a model. After the page's own files load, no request is made: not when you drop a folder, not when you click a button, not when you export a report.
2. Load the page, then turn on airplane mode or unplug the network. Everything still works, because nothing needed the network.
3. View the page source. Every page carries a Content-Security-Policy with `connect-src 'none'`: the browser itself refuses to let the page open a connection of any kind.
4. Read the code. The linter core has a build check that fails if it references a network API, and the site build fails if any page references an external script, style, font, or image.

The command-line tool is the same code with a folder walk in front of it. It reads the files you point it at and writes to your terminal or to a file you name.

## Known limits in the browser

The "Choose a folder" button uses the browser's folder picker. In Chrome and Edge that picker does not list files whose names begin or end with a space, so a table file named that way is skipped without a message and its findings are missing. Dragging the folder onto the page, or running the command line, reads every file. The rule that flags such names, `OBJECTS_SHOULD_NOT_START_OR_END_WITH_A_SPACE`, says the same on its page.

## What it does not do

pbiplint does not document models, apply fixes, or analyze query performance. For documentation there is PBIP Documenter; for query plans there is DAX Studio. The rules pbiplint ports are the Best Practice Analyzer rules, so a model that is clean here is clean there too.
