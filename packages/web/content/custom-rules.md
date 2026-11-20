---
title: Custom rules
description: How to run your team's own Tabular Editor rules in pbiplint, on this site, on the command line, and in your pipelines, how to write one, and everything a rule can use.
---

# Custom rules

pbiplint's own rules are the same for everyone. Most teams also have rules of their own: measures in a folder, visible names in plain words, Power Query that reads only the approved schemas. Custom rules let your team check those too, from the rule files it already keeps in Tabular Editor's Best Practice Analyzer format (`BPARules.json`), with nothing else installed. pbiplint runs them beside its own rules, on the semantic model and the Power Query code it holds, wherever pbiplint runs: on this site, on the command line, in `pbiplint mcp`, and in your GitHub Actions and Azure Pipelines.

On pbiplint.com, custom rules run now. In a [copy your firm hosts](/self-host/), on the command line, and in the pipelines, they run from pbiplint 0.4.0; `pbiplint --version` says which you have, and a self-hosted copy names its version in each page's footer. A team that has never written a rule can have an AI assistant write one, with the skill and the reference pbiplint ships ([below](#assistant)).

A rule file holds rules for the semantic model and its Power Query. Rules for the report, in fab-inspector's format, come in a later release.

<h2 id="set-up">Set up <code>customRules</code></h2>

Put the rule file in the project's repository and name it in `customRules` in `pbiplint.config.json`. The config is the one place pbiplint reads it from, so the site, the command line, and the pipelines all run the same rules; there is no command-line option for it.

```json pbiplint.config.json
{
  "$schema": "https://pbiplint.com/schema/pbiplint.config.schema.json",
  "customRules": ["rules/team.json"],
  "rules": {
    "TEAM_MEASURE_DESCRIPTIONS": "error"
  }
}
```

- **Paths are relative to the folder `pbiplint.config.json` is in,** with `/` or `\` between folders. `customRules` takes a list, and the files run in the order it lists them.
- **Local files only.** A URL or an absolute path, such as `C:\rules\team.json`, is refused as a config error that names the entry, since the site and the pipelines could not open it.
- **A file that cannot be used stops the lint.** A file that is not there, cannot be read, is over 1,048,576 bytes, or is not a rule file, stops that project's lint with a message naming the config and the file; on the command line it exits `2`. Linting on without the team's rules would let a gate pass that should not.
- **The usual settings work on custom ids.** Under `rules`, `"TEAM_MEASURE_DESCRIPTIONS": "off"` turns one off and `"error"` changes its severity, and `failOn` counts custom findings like any other. `annotation pbiplint.ignore = TEAM_MEASURE_DESCRIPTIONS` under an object in its TMDL file ignores the rule there, and so does [Tabular Editor's own annotation](#ignore-annotation).
- **Several projects:** in a run over a folder of projects, each project runs the rules its own nearest config names. A config several projects share reads its rule files once.

A folder laid out like this works everywhere pbiplint runs, the site included:

```
Sales/
  pbiplint.config.json
  rules/
    team.json
  Sales.pbip
  Sales.SemanticModel/
  Sales.Report/
```

<h2 id="format">The rule file</h2>

A rule file is a JSON array of rules, or an object whose `rules` key holds that array; Tabular Editor reads both, and so does pbiplint. Comments (`//` and `/* */`), a byte order mark, and keys in any case are read too, as Tabular Editor reads them. Here is a file with one rule:

```json
[
  {
    "ID": "TEAM_MEASURE_DESCRIPTIONS",
    "Name": "Visible measures have a description",
    "Category": "Documentation",
    "Description": "Flags a visible measure with no description.\n\nThe description is what a report author sees when they hover over the measure in the field list, and it is the only place that says what the number means.\n\nWrite one or two sentences on what the measure calculates and when to use it. If the measure is a helper no report should use, hide it instead.",
    "Severity": 2,
    "Scope": "Measure",
    "Expression": "IsVisible and string.IsNullOrWhiteSpace(Description)"
  }
]
```

- **`ID`** names the rule in every finding, in your config, and in `--rule`. Ids match without regard to case. Give your team's rules a prefix, such as `TEAM_`, so they stay apart from pbiplint's; `pbiplint rules` lists those. A rule with one of pbiplint's ids is handled as [the next section](#built-in-ids) says.
- **`Name`** is the short title every finding shows, and **`Description`** stands in where one of pbiplint's rules links to its page, so whoever meets a finding reads it. Write it in three paragraphs, as a rule page has them: what the rule checks, why the team wants it, and how to fix a finding.
- **`Category`** groups the rule in the results, written as the file writes it. Within a severity, custom categories come after pbiplint's own eight, in alphabetical order, as the site's category filter lists them; a rule with none is in `Custom`.
- **`Scope`** names the object types the rule runs on, separated by commas, such as `"DataColumn, CalculatedColumn, Hierarchy"`. [The reference](#reference-scopes) lists every scope.
- **`Expression`** is a condition in Tabular Editor's expression language. Each object it is true for is a finding. A bare name such as `IsVisible` is a property of the object the rule runs on, which is also `it`; inside a condition such as `Columns.Any(...)`, `it` is the element being tested, `outerIt` the one a level out, and `current` always the object the rule runs on. The expression is a JSON string, so each `"` inside it is written `\"`.
- **`Severity`** sets how serious a finding is. A `Severity` below 2 is info, from 2 up to 3 a warning, and 3 or more an error; a rule with none reads as 1, info. Tabular Editor's own command line labels `Severity` 1 as a warning; pbiplint reads 1 as info, as its built-in rules read Microsoft's numbers, so a team moving from it sees those rules as info. Set a rule's severity in your config to change it.
- **`IsDisabled`** is read, but the rule still runs, as Tabular Editor's command line runs it; turn a rule off in your config instead. **`FixExpression`** and **`CompatibilityLevel`** are ignored.

pbiplint reads at most 2,000 rules from one file, and an `Expression` of at most 20,000 characters; a rule past either limit is reported as not read. [The reference](#reference) lists every property, function, and limit.

<h2 id="built-in-ids">A rule with one of pbiplint's ids</h2>

Most team files start from Microsoft's ruleset, so they carry rules with the same ids as pbiplint's own, which pbiplint already runs. pbiplint tells the copies apart by comparing each one with every version of that rule published when this release was built: [Microsoft's `BPARules.json`](https://github.com/microsoft/Analysis-Services/blob/master/BestPracticeRules/BPARules.json) in every language, and Tabular Editor's own rule files. A copy is unchanged when its scope is the same and its expression is the same, whitespace aside, as any of those versions.

- **An unchanged copy is not run again.** pbiplint runs its own rule, with its rule page.
- **An unchanged copy with a different severity** sets the severity of pbiplint's rule for that project, since the change is your team's policy. A severity your config sets for the id wins over both.
- **An edited copy** runs in place of pbiplint's rule for that project, as your team's rule, with its own name and description; pbiplint's rule of that id does not run there.
- **A copy pbiplint cannot read,** one with no ID, no `Scope` or a report scope, or no `Expression` or one past the limit, never switches pbiplint's rule off: pbiplint's rule runs, and the copy is one `RULE_COULD_NOT_FINISH` finding, as [any rule that cannot run](#cannot-run) is. Turning the id off in your config turns off both.
- **A copy that reads but cannot run,** such as one whose expression does not parse or names a property pbiplint does not run, is an edited copy: it runs in place of pbiplint's rule as one `RULE_COULD_NOT_FINISH` finding, and pbiplint's rule of that id does not run there. Fix the copy, or delete it to have pbiplint's rule back.

A file that holds a rule with one of pbiplint's ids gets one notice, which says how many of its rules pbiplint runs as its own, which ids your team's rules replace, and how many run as the team's. Two files with the same custom id run an identical rule once; when the two rules differ, the first in `customRules` runs, and a notice names the other. A custom rule can never take the id `PARSE_ISSUE` or `RULE_COULD_NOT_FINISH`: such a rule cannot run, so neither of those safety nets can be replaced.

<h2 id="ignore-annotation">Tabular Editor's ignore annotation</h2>

Tabular Editor keeps the rules someone has dismissed in an annotation, `BestPracticeAnalyzer_IgnoreRules`, which Power BI Desktop keeps in the TMDL files. pbiplint honors it beside its own `pbiplint.ignore`, for every rule's findings on the model's objects, its own rules and your team's:

```tmdl
	column 'Product ID'
		dataType: int64
		annotation BestPracticeAnalyzer_IgnoreRules = {"RuleIDs":["HIDE_FOREIGN_KEYS"]}
```

- **On an object,** it ignores the rules it names on that object.
- **On the model,** it ignores them on every object in the model.
- **Ids and the `RuleIDs` key match without regard to case,** as Tabular Editor reads them.
- **It never hides a finding on the report, a `RULE_COULD_NOT_FINISH`, or a `PARSE_ISSUE` finding,** since Tabular Editor reads only the model and knows nothing of what pbiplint could not read or run. Only `pbiplint.ignore` hides those.
- **An annotation that is not a JSON object with a `RuleIDs` list** ignores nothing, and is one [`PARSE_ISSUE`](/rules/parse-issue/) on its line, so it can be fixed. Tabular Editor instead fails every rule that runs on the object.

This changes results for a project that carries the annotation, whether or not it uses custom rules: the findings its authors dismissed in Tabular Editor stop appearing. On pbiplint.com it does so now; on the command line and in a self-hosted copy, from 0.4.0.

<h2 id="cannot-run">When a rule cannot run</h2>

A rule that cannot run is never skipped without a word. It is one [`RULE_COULD_NOT_FINISH`](/rules/rule-could-not-finish/) finding, an error on the model, whose detail names the rule, its file, and the reason, as in `` TEAM_VISIBLE could not finish on the model: rules/team.json: Measure has no property `Visible`; `IsHidden` is the nearest ``. The reason names the cause from the rule's own text, never a name or a value from your model, so it can be shared to get the rule fixed.

A rule cannot run when pbiplint cannot read it: it has no ID, no `Scope`, a scope pbiplint does not know, or a report scope, or no `Expression`. A rule that reads can still fail to run: when its expression does not parse; when it names a property, function, or regular expression construct pbiplint does not run; when it needs statistics from a live model; when it reaches a limit; or when it fails on an object, such as passing an empty value to `RegEx.IsMatch`. A failure on one object stops the rule for the whole project, as it does in Tabular Editor. The other rules in the file still run. For a rule with one of pbiplint's ids, the two kinds differ: a copy pbiplint cannot read runs beside pbiplint's rule, and one that reads but cannot run takes its place, as [above](#built-in-ids) says.

The finding fails a gated run, as any error does, so a clean result means every rule ran. The cause is in the rule file, so the fix is there: the reason says what to change, and an assistant can read it and fix the rule ([below](#assistant)). Until then, turning the rule's id off in your config, as in `"TEAM_VISIBLE": "off"`, removes both the rule and the finding.

A property that the project's files leave unset on some objects is different. Power BI Desktop saves most calculated columns with no data type, which Tabular Editor works out from the column's DAX; a rule that reads `DataType` leaves those columns out rather than guess, and one notice per rule says how many it left out. pbiplint's own rules do the same.

<h2 id="output">In the output</h2>

On the command line, all of this comes with pbiplint 0.4.0. A custom finding is always labelled as your team's rule, with its file, so it never passes for one of pbiplint's.

- **Text and Markdown:** the rule's name and id, then `custom rule, rules/team.json` where a built-in rule's page link would be; the Markdown export adds the rule's description.
- **JSON:** the group's `rule` has `custom` (`true`), `ruleFile` (the file as `customRules` names it), and `description`; its `url` is this page, and its findings have no `detail`, `messageId`, or `params`. `summary.customRules` lists each file with its rules, the copies pbiplint runs as its own, the ids it replaces, and the rules that could not run. [The CLI page](/cli/#the-json-document) has every field.
- **SARIF:** the rule's descriptor takes its name as its short description and its description as its help, with no help link, and carries `custom` and `ruleFile`, as each of its results does.
- **`--quiet`:** a custom rule's line is like any other. An id can hold a space, which the quiet line writes as `%20`, so the line still splits into three fields; `--rule` and `explain` accept the id either way.
- **`--rule <ID>`** shows a custom rule's findings, as it does a built-in rule's.
- **`pbiplint explain <ID>`** prints a custom rule's name, file, description, category, severity, scope, and expression, read from the nearest `pbiplint.config.json` in or above the working folder, or the one `--config` names.

<h2 id="on-this-site">On this site</h2>

Drop or choose the folder that holds both the project and its rule files. The page reads `pbiplint.config.json`, then opens the rule files its `customRules` names, from inside that folder only, and nothing else in it. An entry that leads outside the folder, names a file that is not in it, or points into a folder pbiplint never opens, such as `.git` or `node_modules`, refuses the drop with a message saying why, and nothing is linted. Each finding of your team's rule is labelled "Your team's rule", with its file and its description.

The rule files run in your browser tab, like the rest of the project. The code that runs them is a file of the site's own, which the page fetches from the site once it has loaded and is idle, before you drop anything; no request follows a drop, and once the page has loaded, custom rules work with the network off. Nothing is sent anywhere and nothing is stored, so a second visit needs the folder again. [The pbiplint Privacy Promise](/privacy/) holds word for word, and its checks show it.

<h2 id="pipelines">In your pipelines</h2>

The pbiplint Action in GitHub Actions and the pbiplint task in Azure Pipelines run the command line, which reads the project's `pbiplint.config.json` and the rule files it names, so custom rules need no new input: commit the rule files beside the config. They run once the step runs pbiplint 0.4.0 or later, the version the Action's `pbiplint-version` input or the task's `pbiplintVersion` input names. A rule that cannot run fails the check, as any error does. [Pipelines](/pipelines/) lists what each step reads and sends.

<h2 id="assistant">Write a rule with an AI assistant</h2>

The format is technical, so pbiplint gives an AI assistant what it needs to write a rule and check it. On the command line, all three come with pbiplint 0.4.0:

- **A skill.** `pbiplint-custom-rules` takes an assistant through the loop: ask what the rule should catch, with one object that should be flagged and one that should not; read what a rule can use; write the rule, with its description; make sure `customRules` names the file; run `pbiplint <path> --rule <ID>`; check it flags what was meant and nothing else; and when it gives `RULE_COULD_NOT_FINISH`, read the reason, fix the rule, and run it again. `pbiplint skill --install claude` (or `copilot`, `codex`, `gemini`) writes it into your project beside pbiplint's first skill, and `pbiplint skill --name pbiplint-custom-rules` prints it. [The CLI page](/cli/#custom-rule) has the details.
- **The reference.** `pbiplint reference` prints what a rule can use at the version installed, and `--format json` prints the same as data. It is the [reference below](#reference), built from the same tables pbiplint runs.
- **MCP tools.** In `pbiplint mcp`, `custom_rules_reference` returns the reference, and `explain_rule` and `list_rules`, given a `path` in the project, include the custom rules its config names. [The CLI page](/cli/#mcp) has the setup.

Severity, and any change to a rule your team already has, stay your team's call. An assistant should never turn a rule off, or change the model, to make a new rule pass.

<h2 id="examples">Worked examples</h2>

Four rules a team might write, from the skill. Each is one rule, as it would sit in a rule file's array, and each flags exactly the objects named on [the fixture written for them](https://github.com/pbiplint/pbiplint/tree/main/tests/fixtures/custom-rules-examples.SemanticModel) in pbiplint's repository. The first three keep the names teams already use for these conventions, which is why they have no team prefix.

### Visible names in plain words

`NO_CAMELCASE_COLUMNS_HIERARCHIES` catches a visible column or hierarchy named in camelCase, such as `customerName`, which should read `Customer Name`. It flags the visible column `customerName` and the hierarchy `orderCalendar`, and leaves the hidden column `orderKey`, the code `SKU`, and `Order Date`.

```json
{
  "ID": "NO_CAMELCASE_COLUMNS_HIERARCHIES",
  "Name": "Visible columns and hierarchies are not named in camelCase",
  "Category": "Naming",
  "Description": "Flags a visible column or hierarchy whose name starts with a lower-case letter and runs into an upper-case one with no space between, as customerName or orderCalendar do. Hidden objects are left alone, since report readers never see their names.\n\nThe names in the field list are the names on every visual. Words with spaces, such as Customer Name, read as plain language to the people using the report, while camelCase reads as a database column carried through unchanged.\n\nRename the object in words with spaces, such as Customer Name for customerName, and check the report's visuals and any DAX that refers to it. If the name is a code the business uses as written, hide the object or ask the team whether the rule should allow it.",
  "Severity": 2,
  "Scope": "DataColumn, CalculatedColumn, CalculatedTableColumn, Hierarchy",
  "Expression": "IsVisible and RegEx.IsMatch(Name, \"^[a-z][a-z0-9]*[A-Z]\")"
}
```

The pattern is anchored at the start, so a name that begins with a capital never matches.

### Measures in display folders

`LAYOUT_MEASURES_DF` catches a measure a report reader can see that sits in no display folder. It flags `Order Count`, and leaves `Total Sales`, which is in a folder, and the hidden `Sales Check`.

```json
{
  "ID": "LAYOUT_MEASURES_DF",
  "Name": "Visible measures sit in a display folder",
  "Category": "Layout",
  "Description": "Flags a visible measure with no display folder. Hidden measures are left alone, since they do not appear in the field list.\n\nFolders keep the field list short enough to scan as a model grows, and they put related measures, such as totals or ratios, where a report author expects to find them.\n\nSet the measure's display folder to the one its neighbours use, or start a new folder when none fits. If the measure is a helper no report should use, hide it instead.",
  "Severity": 1,
  "Scope": "Measure",
  "Expression": "IsVisible and string.IsNullOrWhiteSpace(DisplayFolder)"
}
```

### Columns and hierarchies in display folders

`LAYOUT_COLUMNS_HIERARCHIES_DF` is the same convention for columns and hierarchies. It flags the column `Test Value` and the hierarchy `orderCalendar`, and leaves columns in folders, hidden columns, and `Order Calendar`, which is in one.

```json
{
  "ID": "LAYOUT_COLUMNS_HIERARCHIES_DF",
  "Name": "Visible columns and hierarchies sit in a display folder",
  "Category": "Layout",
  "Description": "Flags a visible column or hierarchy with no display folder. Hidden columns, such as keys, are left alone.\n\nA table's columns and hierarchies are easier to find when grouped by subject, such as Dates or Customer, and a report author can tell at a glance which fields belong together.\n\nSet the object's display folder to one its table already uses, or start a new one. If the column exists only for relationships or sorting, hide it instead.",
  "Severity": 1,
  "Scope": "DataColumn, CalculatedColumn, CalculatedTableColumn, Hierarchy",
  "Expression": "IsVisible and string.IsNullOrWhiteSpace(DisplayFolder)"
}
```

### Snowflake from approved schemas only

`TEAM_APPROVED_SNOWFLAKE_SCHEMAS` reads Power Query as text: a query that reads Snowflake must name one of the team's approved schemas, `SALES` or `FINANCE`. It flags the partition `Scratch`, which reads `SANDBOX`, and leaves the `Sales` partition, the shared query on `FINANCE`, and a partition that reads a CSV file.

```json
{
  "ID": "TEAM_APPROVED_SNOWFLAKE_SCHEMAS",
  "Name": "Snowflake queries read an approved schema",
  "Category": "Data sources",
  "Description": "Flags a partition or shared query whose Power Query reads Snowflake but names neither of the approved schemas, SALES and FINANCE. A query that does not read Snowflake is left alone.\n\nThe approved schemas hold reviewed, governed data. A report built on a sandbox or staging schema can change or vanish without notice, and its numbers will not match the team's other reports.\n\nPoint the query at the same data in SALES or FINANCE; if it is not there yet, ask the data team to publish it. If the schema should be approved, ask the team to add it to this rule.",
  "Severity": 3,
  "Scope": "Partition, NamedExpression",
  "Expression": "not string.IsNullOrEmpty(Expression) and Expression.Contains(\"Snowflake.Databases\") and not RegEx.IsMatch(Expression, \"Name\\s*=\\s*\"\"(SALES|FINANCE)\"\"\\s*,\\s*Kind\\s*=\\s*\"\"Schema\"\"\")"
}
```

The empty-expression test comes first, since a partition with no Power Query has no `Expression` to search, and passing an empty one to `RegEx.IsMatch` would stop the rule. Inside the expression a quote is doubled (`""`), which the JSON file holds as `\"\"`, and a backslash in the pattern is only doubled for JSON: `\\s` in the file is `\s` in the pattern. The pattern looks for the navigation step Power BI Desktop writes, `Name="SALES",Kind="Schema"`, so a database that happens to be called `SALES` does not count.

<h2 id="not-run">What pbiplint does not run, and why</h2>

- **Statistics from a live model.** A rule that reads row counts, column sizes, or the other statistics Tabular Editor keeps in a deployed model's `Vertipaq_` annotations needs a deployed model, which a project's files do not hold. It is reported as needing them, never run on a guess; run it in Tabular Editor against the deployed model. The same goes for what only the server keeps, such as a table's refresh time.
- **Fix expressions.** pbiplint reports findings and never changes your files, so a rule's `FixExpression` is ignored.
- **Rules stored inside a model,** in its `BestPracticeAnalyzer` annotation, which Tabular Editor also reads. pbiplint reads rules only from the files `customRules` names.
- **Power Query structure.** A custom rule reads a query's M code as text, as Tabular Editor's rules do. It cannot follow the query's steps the way pbiplint's own Power Query rules do, because the same file must work in Tabular Editor too.
- **Report rules.** A Tabular Editor rule checks the semantic model; a rule whose scope is a report object cannot run. Report rules in fab-inspector's format come in a later release.
- **Anything the reference does not list.** A property, function, or regular expression construct the reference leaves out cannot run, and the rule says which and why. A regular expression is never run approximately: pbiplint runs the .NET constructs it can match exactly, and refuses the rest with the construct named.

<h2 id="reference">Reference</h2>

Everything a Tabular Editor rule can use in the pbiplint this site runs, and what it cannot, generated from the tables pbiplint runs, so it cannot drift from them. `pbiplint reference` prints the same for the version you have installed. Names match without regard to case: properties, methods, scopes, keywords, and enum values. Anything not listed is not run, and a rule that uses it is one `RULE_COULD_NOT_FINISH` finding with the reason.

<!-- reference -->
