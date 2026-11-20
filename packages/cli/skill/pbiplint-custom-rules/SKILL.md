---
name: pbiplint-custom-rules
description: Write, check, and fix a team's own pbiplint rule for a Power BI semantic model or its Power Query, in Tabular Editor's Best Practice Analyzer format (a BPARules.json file), and run it with pbiplint until it flags what the team meant. Use when asked to add a custom rule or team convention to pbiplint, such as a naming, display folder, or approved data source policy; when a custom rule gives RULE_COULD_NOT_FINISH; or when a rule file that customRules names in pbiplint.config.json needs changing. pbiplint 0.3.4.
license: MIT
metadata:
  version: "0.3.4"
---

# pbiplint custom rules

A team can give pbiplint rules of its own: a JSON file of rules in Tabular Editor's Best Practice Analyzer format, named in `customRules` in the project's `pbiplint.config.json`. pbiplint runs them beside its own rules, on the semantic model's TMDL and the Power Query each partition and shared query holds. This file says how to write one, how to check that it flags what the team meant, and what to leave to the team.

Whoever meets a finding reads the rule's name and description, so a rule is only as good as the words it carries. Write those as carefully as the expression.

## When to use it

- The user asks for a team convention to be checked: a naming style, display folders, the data sources a model may read, anything the team agrees on and wants every project held to.
- A custom rule gives `RULE_COULD_NOT_FINISH`, which means the rule could not run. The finding says why.
- A rule in a file that `customRules` names needs changing, or flags too much or too little.

For linting a project and fixing what pbiplint's own rules find, use the `pbiplint` skill.

## The loop

Use `npx pbiplint` (or `pbiplint` where it is installed). If pbiplint's MCP tools are there, `custom_rules_reference` gives what `pbiplint reference` prints, `explain_rule` with a `path` explains a custom rule, and `list_rules` with a `path` lists the project's custom rules after pbiplint's.

1. Ask what the rule should catch, with one object in the project that it should flag and one that it should not. If the user has no example, find a candidate in the files and confirm it.
2. Read `pbiplint reference` (or call `custom_rules_reference`) at the installed version: it lists every scope, property, function, and regular expression construct a rule can use, and what pbiplint does not run, with the reason. Write from it, not from memory of other tools.
3. Write the rule into the team's rule file (create one, such as `rules/team.json`, if there is none), with a description in the shape set out below.
4. Make sure `customRules` in the nearest `pbiplint.config.json` names the file, by its path from the config's folder.
5. Run `pbiplint <path> --rule <ID>` on the project.
6. Check that it flags the objects meant and nothing else, the example that should pass included; `pbiplint explain <ID>` shows the rule as pbiplint read it, and `pbiplint <path> --rule <ID> --format json` gives every finding with its object.
7. On `RULE_COULD_NOT_FINISH`, read the reason, which names the property, function, or pattern construct at fault, fix the rule, and go back to step 5. Do the same when it flags too much or too little.

## Writing the rule

A rule file is a JSON array of rules. Each rule has these fields:

- `ID`: upper case with underscores. A short team prefix (`TEAM_`, `FIN_`) keeps it apart from pbiplint's ids; `pbiplint rules` lists those. A rule with one of pbiplint's ids runs in place of pbiplint's rule when its expression differs, and is skipped when it is an unchanged copy, so reuse an id only when the team means to replace that rule. A team that already has ids for its conventions keeps them.
- `Name`: a short title, read in every finding.
- `Category`: the team's own word for the group, such as `Naming` or `Layout`.
- `Description`: three paragraphs, as a pbiplint rule page has: what the rule checks; why the team wants it; how to fix a finding. Separate them with a blank line (`\n\n` in the JSON).
- `Severity`: 1 is info, 2 a warning, 3 an error, as pbiplint reads it (a rule with none is info). Tabular Editor CLI shows 1 as a warning, so a team that has used it may expect that.
- `Scope`: a comma-separated list of the scopes the reference gives, such as `"Measure"` or `"DataColumn, CalculatedColumn, Hierarchy"`. The rule runs on each object of each scope.
- `Expression`: a condition; each object it is true for is a finding.

`FixExpression` and `CompatibilityLevel` are ignored. `IsDisabled` is read, but the rule still runs; a rule is turned off in `pbiplint.config.json`, which is the team's call.

In the expression:

- A bare property, such as `Name` or `IsHidden`, belongs to the object the rule runs on, which is also `it`. Names match without regard to case.
- Inside a condition such as `Columns.Any(...)`, `it` is the element being tested, `outerIt` is what `it` was one level out, and `current` is always the object the rule runs on.
- The expression is a JSON string, so each `"` in it is written `\"` in the file. A quote inside a string in the expression is doubled (`""`), which the file holds as `\"\"`. The expression language has no backslash escapes of its own, so a pattern's backslash is only doubled for JSON: `\\d` in the file is `\d` in the pattern.
- A property marked `?` in the reference can be empty. Calling a method on an empty one stops the rule for the whole project, as it does in Tabular Editor, so test it first, as `Expression != null and Expression.Length > 2000` does on a partition.
- Regular expressions are .NET's. pbiplint runs the constructs the reference lists and refuses the others with the reason; it never runs one approximately.
- Power Query is read as text: a partition's `Expression` (with `SourceType`) and a shared query's `Expression` on the `NamedExpression` scope, exactly as the TMDL holds them.

## Judgment

- Ask before changing a rule the team already has, even one that looks wrong; it may be a decision.
- Never turn a rule off, ignore a finding, or change the model to make a new rule pass or go quiet. If the rule flags something it should not, change the rule.
- Severity is the team's call. Propose one and say why, but let the user decide what fails their build.
- Keep the rule file's formatting: its indentation, its key order, and the order of its rules. Add a new rule at the end.
- A rule that flags nothing has not been shown to work. Check it against an object that should be flagged; if the project has none, say so rather than calling the rule done.
- Say what the rule cannot see. A rule on the model's files cannot read the data, row counts, or anything only a deployed model holds.

## Worked examples

Each example runs on `tests/fixtures/custom-rules-examples.SemanticModel` in pbiplint's repository and flags exactly the objects named.

### `NO_CAMELCASE_COLUMNS_HIERARCHIES`

The team writes visible names as words with spaces, so `customerName` should read `Customer Name`. It flags the visible column `customerName` and the hierarchy `orderCalendar`; it leaves the hidden column `orderKey`, the code `SKU`, and `Order Date`.

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

The pattern is anchored at the start, so a name that begins with a capital, as `SKU` and `Order Date` do, never matches.

### `LAYOUT_MEASURES_DF`

The team wants every measure a report reader can see in a display folder. It flags `Order Count`; it leaves `Total Sales`, which is in a folder, and the hidden `Sales Check`.

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

### `LAYOUT_COLUMNS_HIERARCHIES_DF`

The same convention for columns and hierarchies. It flags the column `Test Value` and the hierarchy `orderCalendar`; it leaves columns in folders, hidden columns, and `Order Calendar`, which is in one.

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

### `TEAM_APPROVED_SNOWFLAKE_SCHEMAS`

The team allows reports to read Snowflake only from the schemas `SALES` and `FINANCE`. It flags the partition `Scratch`, which reads `SANDBOX`; it leaves the `Sales` partition, the shared query on `FINANCE`, and a partition that reads a CSV file.

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

The empty-expression test comes first, since a partition with no Power Query has no `Expression` to search. The pattern looks for the navigation step Power BI Desktop writes, `Name="SALES",Kind="Schema"`, so a database that happens to be called `SALES` does not count. A query that names an approved schema and also another one passes, and a partition that reads a shared query is checked through that query; say so when you report back.

## Reporting back

Tell the user the rule's id and the file it is in, what it flagged on their project (how many objects, and a few by name), the severity you chose and why, any change to `pbiplint.config.json`, and anything the rule cannot catch.

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
