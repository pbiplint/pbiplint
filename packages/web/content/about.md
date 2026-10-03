---
title: About pbiplint
description: What pbiplint is, what it checks, who makes it, and what it does not do.
---

# About pbiplint

pbiplint is a free, open-source best-practice linter for Power BI projects. Paste TMDL or drop a PBIP folder on the [home page](/), or run `npx pbiplint <path>` on your own machine, and get a ranked list of findings with a page for every rule that says what it checks, why it matters, and how to fix it.

## What it checks

The site and the command-line tool read both parts of a Power BI project: the semantic model, saved as TMDL, and the report, saved in the PBIR format. Drop a PBIP folder on the site, or point `npx pbiplint` at one, and both are checked together, as long as the report reads the model beside it; a report bound to a published model is checked on its own, and the results say why. A `.SemanticModel` or `.Report` folder given alone is checked by itself, so a report without its model is valid input too. When both parts are checked together, the model is also judged by what the report uses: a field the report names that the model does not have is an error, and a column or measure the report never reaches is listed.

The model rules include every rule from the Microsoft Best Practice Analyzer ruleset, ported so the results match Tabular Editor on the same model apart from eleven documented deviations, and rules of pbiplint's own for a year or a date fixed in DAX, for DAX user-defined functions, for translations, and for decimal columns' format strings, four of them taking their test from Tabular Editor 3's built-in rules or Tabular Editor's community rule files and checked against Tabular Editor. Of the Microsoft rules, the five that need statistics only a live model has are listed but not run, and a column whose TMDL names no type, as Power BI Desktop saves most calculated columns, is left out of the thirteen that test a column's type, where Tabular Editor reads the type from the column's DAX. The report rules are rules ported from PBI Inspector's base rules, by Nat Van Gulck, plus rules of pbiplint's own. Power Query rules come later. The [rules index](/rules/) has the full list.

## Who makes it

pbiplint is made by McKinley Consulting, the makers of [The Data Practitioner](https://www.youtube.com/@TheDataPractitioner). It is free software under the GNU Affero General Public License, version 3 or later, and the source is on [GitHub](https://github.com/pbiplint/pbiplint). There is no paid tier, and no plan to charge for rules.

<h2 id="verify">Privacy</h2>

The analysis runs in your browser, and nothing behind this site receives what you lint. [The pbiplint Privacy Promise](/privacy/) says what that covers on the site, on the command line, and in the GitHub Action, and how to check it for yourself.

## Known limits in the browser

pbiplint reads one semantic model and one report per run. A folder that holds two semantic models saved as TMDL, or two reports, is refused with their names; drop the one you want, or a folder that holds one of each.

The "Choose a folder" button uses the browser's folder picker. In Chrome and Edge that picker does not list files whose names begin or end with a space, so a table file named that way is skipped without a message and its findings are missing. Dragging the folder onto the page, or running the command line, reads every file. The rule that flags such names, `OBJECTS_SHOULD_NOT_START_OR_END_WITH_A_SPACE`, says the same on its page.

In Firefox and Safari the button opens the browser's folder chooser instead, which cannot tell the page when the operating system will not let the browser open a folder inside the one you choose, such as one without read permission. Safari leaves that inner folder out without a message, so its findings are missing. In Firefox nothing is linted, and the page says it found no model or report and suggests dragging the folder onto the page instead. A drag in Chrome, Edge, or Firefox, choosing the folder in Chrome or Edge, or pointing the command line at it reads the rest and names the inner folder in a notice; a drag in Safari leaves the inner folder out in the same way.

## What it does not do

pbiplint does not document models, apply fixes, or analyze query performance. For documentation there is PBIP Documenter; for query plans there is DAX Studio. The model rules pbiplint ports are the Best Practice Analyzer rules, so apart from the five rules that need a live model and the deviations each rule's page documents, a model that is clean here is clean there too.
