# Custom rules: a team's own rule files, in the CLI, the pipelines, and the browser (#118): spec

Issue: [#118](https://github.com/pbiplint/pbiplint/issues/118), size XL. Written November 6, 2026, from main at `26a69b5`. **Status: approved November 6, 2026.** Decisions the maintainer has made are marked **(decided)**; calls made in writing the spec are marked **(design call)**; anything marked **(builder)** is left to whoever plans and builds it.

Research behind it (November 6, 2026): the 46 distinct rule files the survey of September 28, 2026 found (64 copies in 44 public repositories), each fetched at the commit `tests/expectations/survey/files.json` pins and checked against its sha256; Tabular Editor CLI 0.7.1.2's results on them, committed under `tests/expectations/survey/`; a GitHub code search for models that carry Tabular Editor's rule annotations; fab-inspector's rule format at the commit pbiplint's report rules were ported from; and a read of the codebase.

## 1. Intent

The rules teams write for themselves are mostly one company's policy: approved Snowflake schemas only, measures in a table named `_Measures`, no underscores in column names, table names that match their source views. pbiplint should never ship those as its own rules, and today a team that wants them has to keep Tabular Editor in its pipeline. This lets a team run its own rules in pbiplint, from the rule files it already has, with nothing else installed.

**Who it is for (decided):** two kinds of team.

- **A team that already keeps a rule file,** almost always Tabular Editor's Best Practice Analyzer format (`BPARules.json`). Its file runs unchanged.
- **A team that has never written a rule,** because the format is technical. It describes the rule it wants to an AI assistant, which writes it with pbiplint's skill and reference (section 9) and checks it with pbiplint until it flags what the team meant. This group is likely the larger one.

**Where it runs (decided):** everywhere pbiplint runs today: the CLI, `pbiplint mcp`, the GitHub Action, the Azure Pipelines task, and the site, both pbiplint.com and a firm's self-hosted copy. On the site the rule file comes along with the folder the person drops, and runs in their own browser tab like the rest of the project; pbiplint.com never receives it, and nobody else sees it.

**All three layers (decided):** the semantic model and its Power Query in step 1, in Tabular Editor's format; the report in step 2, in fab-inspector's format. One spec, so the config, the site, the output, and the writing aid are designed once; two steps, each its own release (section 12).

## 2. Goals, non-goals, anti-goals

**Goals**

- A Tabular Editor rule file runs unchanged and finds what Tabular Editor finds, on the model and on its Power Query code read as text (step 1).
- A fab-inspector rule file runs unchanged and finds what fab-inspector finds, on the report (step 2).
- Someone who has never written a rule, or their AI assistant, can write one and see it work in one short loop (section 9).
- Every rule that cannot run is named, with the file it came from and the exact reason.

**Non-goals**

- **Fix expressions and fix actions.** 449 of the survey's rules carry a `FixExpression`; pbiplint ignores it, as it ignores fab-inspector's patches. Fixing is #89's question.
- **Rules stored inside a model** in its `BestPracticeAnalyzer` annotation, which Tabular Editor also reads. Five projects on GitHub do it **(design call)**; a later step if someone asks.
- **Statistics from a live model.** Three rules in Microsoft's set read row counts and similar numbers (`Vertipaq_*` annotations) that a project's files do not hold. A rule that reads one is named as needing them (section 6.6), never run on a guess.
- **Power Query structure.** A custom rule reads a query's M code as text, as Tabular Editor's rules do; it cannot follow the query's steps the way pbiplint's own Power Query rules do, because Tabular Editor cannot, and the same file must work in both.
- **A rule format of pbiplint's own, rules written in JavaScript, and rule files fetched from a URL,** all ruled out in the issue. Local files only.
- **A page for each custom rule.** The rule's own description stands in wherever a built-in rule's page would be linked (section 8) **(decided)**.
- **A rule editor on the site.** The skill and the reference are the writing aid.

**Anti-goals: it fails even if it works when it**

- **Passes silently.** A rule that does not run, a file that is not read, a scope or property pbiplint does not know: each is reported where the team will see it, and a rule that cannot run fails a gated run (section 6.7). A clean result must mean every rule ran.
- **Runs code.** The evaluators interpret a closed set of operations; nothing reaches `eval`, `Function`, the network, the file system, or the page. A rule file is data.
- **Stalls a run.** A rule file and every expression in it are read and evaluated within fixed limits, as everything pbiplint reads already is (section 6.5).
- **Sends anything anywhere.** The Privacy Promise holds unchanged (section 10).
- **Passes for one of pbiplint's rules.** A custom finding is always labelled as the team's rule, with its file (section 8).
- **Needs Tabular Editor or fab-inspector.** They check pbiplint's work in its tests (section 11); a user never needs either.
- **Turns away the files teams have.** Most real files start from Microsoft's rules (section 4); they must run.

## 3. Where rules come from

- **`customRules` in `pbiplint.config.json` (design call on the name):** a list of paths to rule files, relative to the folder the config file is in. Config is the one place, so the site, the CLI, and the pipelines read the same rules from the same file; there is no CLI flag **(design call)**. Each project in a multi-project run uses its own nearest config, as today.
- **Local files only.** An entry that is a URL is a config error naming the key, as an unknown key is today. A named file that cannot be found or read stops that project's lint with a message naming it, as a config that cannot be used does **(design call)**: otherwise a gate would pass without the team's rules.
- **The format is read from the content (design call):** a rule with an `Expression` is Tabular Editor's; one with `part` and `test` is fab-inspector's. A file can be a JSON array of rules or an object with a `rules` array; both occur in the survey and Tabular Editor reads both. A file that is neither, or mixes the two, is refused with a message saying why. Until step 2 ships, a fab-inspector file is refused with a message saying report rules in that format come in a later release.
- **A Tabular Editor rule that cannot run is reported, not the whole file (design call).** A rule with no scope (all 11 rules in one survey file, which Tabular Editor reads and silently runs none of), or whose scope is a report object (one survey file uses Tabular Editor's shape with `Page`, `Visual`, `CustomVisual`, `Filter`, and `Report` scopes, which Tabular Editor refuses outright), is reported as in section 6.7, and the file's other rules run. For a report scope the reason says that report rules use fab-inspector's format. Both differ from Tabular Editor and are recorded deviations.
- **Read the way the source tools read them (builder: match Tabular Editor on every survey file):** a byte order mark, `//` and `/* */` comments (two survey files have them), and keys in any case (two survey files use `id`, `name`, `expression`).
- **The usual settings apply to custom ids:** `rules` entries in the config turn one off or change its severity; `pbiplint.ignore` annotations work on them; so does Tabular Editor's ignore annotation (section 5).
- **Two files with the same custom id (design call):** identical rules run once, as Tabular Editor runs a duplicated rule once; different rules: the first in `customRules` order runs, and a notice names the other.

## 4. A team's rule with the same id as one of pbiplint's (decided)

35 of the survey's 46 files include rules whose id is one of pbiplint's built-in ids, because teams copy Microsoft's set and add their own. In the team files, 93% of those copies are unchanged (901 of 970); up to 69 in 19 files were edited, for example a date column format rule changed to require `dd/mm/yyyy`. The issue's "a custom rule may not reuse a built-in rule's id" would turn most real files away, so instead:

- **An unchanged copy is skipped:** pbiplint already runs that rule, with its page. "Unchanged" means its expression matches, whitespace aside, a published version of that rule: Microsoft's `BPARules.json` and its translations, `TabularEditor/BestPracticeRules`, and, in step 2, fab-inspector's `Base-rules.json`, across each source's history. pbiplint carries a fingerprint of each published version, generated by a script and pinned as `inspector-rules.data.ts` is **(builder: the script and the data's shape)**.
- **An unchanged copy whose severity the team changed:** pbiplint's rule takes the copy's severity for that project, since the change is the team's stated policy **(design call)**.
- **An edited copy runs in place of pbiplint's rule** for that project, as the team's rule (section 8). A notice lists the ids replaced.
- **One notice per project** says how many rules in each file pbiplint runs as its own; the JSON output lists them **(design call)**.

## 5. Tabular Editor's ignore annotation (decided)

About 160 `.tmdl` files in 25 public repositories carry `BestPracticeAnalyzer_IgnoreRules`, among them Microsoft's own sample project in `microsoft/Analysis-Services`. Nearly every id they ignore is one pbiplint's built-in rules share (`HIDE_FOREIGN_KEYS`, `RELATIONSHIP_COLUMNS_SHOULD_BE_OF_INTEGER_DATA_TYPE`, `PARTITION_NAME_SHOULD_MATCH_TABLE_NAME_FOR_SINGLE_PARTITION_TABLES`, and others). pbiplint does not read it today, so it reports findings the model's author already dismissed.

- **pbiplint honours it for every rule, built-in and custom,** as it honours `pbiplint.ignore`: on an object, for that object; on the model, for the whole model; as Tabular Editor does **(builder: confirm the semantics against Tabular Editor with a fixture, including the annotation's JSON shape, `{"RuleIDs": [...]}`)**.
- **It changes results** for projects that carry it: findings their authors dismissed stop appearing. The release notes' "What can change in your results" says so, and the rule pages' "When to ignore it" footer (`ignoreHelp`) mentions the annotation beside `pbiplint.ignore` **(design call)**.

## 6. Step 1: Tabular Editor's rules, on the model and its Power Query

### 6.1 The evaluator

An interpreter in core for Tabular Editor's expression language (Dynamic LINQ over the Tabular Object Model), browser-pure, parsing each expression once and evaluating it per object. What it must run is set by what real rules use; over the survey's 230 distinct rules:

- **Operators:** `and`, `or`, `not` and their symbol forms, comparisons (`=`, `==`, `!=`, `<>`, `<`, `>`, `<=`, `>=`), arithmetic, parentheses, string and number literals, `true`, `false`, `null`.
- **Collections:** `Any`, `All`, `Count`, `Where`, and the others Dynamic LINQ offers that rules use, with `it`, `outerIt`, and `current` (in 21 and 13 rules).
- **Strings:** `Contains`, `StartsWith`, `EndsWith`, `IndexOf` (with `StringComparison`), `Replace`, `Substring`, `ToUpper`, `ToLower`, `Length`, `ToCharArray`, `string.IsNullOrEmpty`, `string.IsNullOrWhitespace` (both spellings), `char.IsWhiteSpace` and its siblings.
- **Conversions and maths:** `Convert.ToInt64`, `ToInt32`, `ToDecimal`, `ToDouble`, `ToString`, `Math.Max` and siblings.
- **Enums by name:** `DataType.Int64`, `CrossFilteringBehavior.BothDirections`, `StringComparison.OrdinalIgnoreCase`, and the rest a rule names.
- **Annotations:** `GetAnnotation`, `HasAnnotation`.
- **`RegEx.IsMatch`** (30 rules; section 6.4) and **`Tokenize()`** (section 6.3).

Where .NET and JavaScript differ (string comparison, null handling, number types), the evaluator follows .NET, because Tabular Editor does **(builder)**. Section 11's bar decides when the list is complete.

### 6.2 The model, under Tabular Object Model names

A read-only view of pbiplint's model that answers to the names Tabular Editor's rules use: the scopes (`Model`, `Table`, `CalculatedTable`, `DataColumn`, `CalculatedColumn`, `CalculatedTableColumn`, `Measure`, `Hierarchy`, `Level`, `Partition`, `Relationship`, `Perspective`, `Culture`, `ModelRole`, `TablePermission`, `CalculationGroup`, `CalculationItem`, `KPI`, `NamedExpression`, `ProviderDataSource`, `StructuredDataSource`, and the rest Tabular Editor defines), and on each the properties rules read (`Name`, `Description`, `IsHidden`, `IsVisible`, `DisplayFolder`, `FormatString`, `DataType`, `Expression`, `Table`, `Model`, `UsedInRelationships`, `UsedInHierarchies`, `UsedInSortBy`, `SortByColumn`, `ReferencedBy`, `DependsOn`, `TranslatedNames`, `DataCategory`, `SummarizeBy`, `IsKey`, `IsAvailableInMDX`, `CrossFilteringBehavior`, the relationship ends, and so on) **(builder: the full list, from the survey's rules and Tabular Editor's documentation)**.

Two cases are kept apart **(design call)**:

- **A property pbiplint's model does not hold at all** stops the rule (section 6.7).
- **A property the files leave unset on some objects only** leaves those objects out of that rule, never guessed, and one notice per rule counts them. The common case: Power BI Desktop saves most calculated columns with no data type, and Tabular Editor works the type out from the column's DAX; 25 of the 230 distinct rules read `DataType` on a column scope. pbiplint's own ported rules already leave such columns out (since 0.2.3), so a custom rule does the same, and where Tabular Editor's captures flag such a column the difference is a recorded deviation. Failing the rule instead would fail the gate on most real Desktop projects. Inferring types from DAX is not part of this work.

### 6.3 `Tokenize()`

Two rules in nine files call `Tokenize()` to check DAX token by token (the division rule). It runs on pbiplint's DAX tokenizer (`packages/core/src/dax/tokenize.ts`, #108), with tokens answering to Tabular Editor's token type names (`DIV`, `INTEGER_LITERAL`, `REAL_LITERAL`, and the rest) and `Next` **(builder: the name mapping, checked against Tabular Editor)**.

### 6.4 Regular expressions

Rules use .NET regular expressions; pbiplint runs them in JavaScript. A pattern is translated when JavaScript can match it exactly, which covers an inline `(?i)` at the start (24 rules) and the constructs the survey's rules use **(builder)**. A pattern that cannot be translated exactly is reported with the construct named, never run approximately.

### 6.5 Limits

A rule file, each expression, and each regular expression are read and evaluated within fixed limits, as everything pbiplint reads already is: the file's size, an expression's length and nesting, and the work a regular expression may do on one value **(builder: the limits and how a regular expression is held to one; a linear-time matcher is one way)**. A rule that reaches a limit is reported (section 6.7).

### 6.6 Power Query, as text

A custom rule reads Power Query code where Tabular Editor's rules do: the M text of a partition (`Expression`, `Query`, with `SourceType`) and of a shared query (`NamedExpression.Expression`), exactly as the project's TMDL holds it. A worked example on the custom rules page (section 10): every query that reads Snowflake names one of the team's approved schemas.

### 6.7 When a rule cannot run (design call)

A custom rule that cannot run, because it has no scope or a scope pbiplint does not know, its expression does not parse, it names a property pbiplint's model does not hold, it uses a function or a regular expression construct pbiplint does not run, it needs live-model statistics, it reaches a limit, or its evaluation fails on an object (a null where .NET throws, as Tabular Editor's does on `RegEx.IsMatch` of a missing expression), is reported as one `RULE_COULD_NOT_FINISH` finding for the rule, an error, naming the rule, its file, and the exact reason.

- **A failure on one object stops the rule for the whole project (design call),** as it does in Tabular Editor: in its captures no rule with an error also has findings. Matching it keeps the parity bar exact. pbiplint's built-in rules report a failure per object; a custom rule's one finding is documented as the difference.
- **The reason never quotes the model (design call),** as the CLI's contract has kept rule error messages free of model text since 0.3.0: it names the cause from the rule's own text (a property, a function, a pattern construct) and the object type, not the object's name or expression. It fails a gated run, as a built-in rule that cannot finish has since 0.3.0. A team that accepts the rule not running turns it off by its id in `rules`, which removes both the rule and the finding. The issue proposed a notice instead; a notice in a CI log lets a gate pass while the team's policy never ran, which is the first anti-goal. 23 rules in 9 of the survey's files fail in Tabular Editor too (a property that does not exist, such as `Visible` on a measure, or a syntax error); pbiplint reports each the same way.

The reason is written for whoever fixes it, person or assistant: "Measure has no property `Visible`; `IsHidden` is the nearest", "`(?<=...)` with a variable length cannot be translated", "reads `Vertipaq_RowCount`, which needs statistics from a live model that a project's files do not hold" **(design call: name the nearest known property when one is close)**.

## 7. Step 2: fab-inspector's rules, on the report

- **The format:** a rule has `id`, `name`, `description`, `disabled`, a `part` (the report part it runs on: the report, its pages, its visuals, and the others fab-inspector defines), and a `test`: a JSON Logic expression, the data it reads, and the expected result. JSON Logic is a published standard ([jsonlogic.com](https://jsonlogic.com/operations.html)); fab-inspector adds operators of its own (`part`, `path`, `customvis`, `diff`, `strcontains`, `tostring`, and others) **(builder: the full set and their meaning, from fab-inspector's source at a pinned commit, MIT)**.
- **An interpreter in core,** like step 1's: browser-pure, within the same limits, every rule it cannot run reported as in section 6.7.
- **What it reads:** the report's JSON as pbiplint already reads it, under the paths fab-inspector's rules use (`visual.visualType`, and so on).
- **Fields:** `disabled: true` is not run, as fab-inspector does; the log type sets the severity (section 8); a rule's patch is ignored (section 2).
- **The same-id handling (section 4) applies:** fab-inspector's base rules are the 12 pbiplint already runs as its own.

## 8. Output

- **A custom finding** carries the rule's id as written, its layer, the object, and the location where pbiplint knows it. It has no detail and no message id: a custom rule has no entry in pbiplint's message catalog, and the rule's name and description carry its meaning **(design call)**. JSON and SARIF mark it as custom and name the rule file, relative to the config's folder **(builder: field names, under the contract's rules for additions)**.
- **SARIF:** the rule's descriptor takes its name and description as its short description and help, with no help link.
- **Text and Markdown:** the rule's name, labelled as a custom rule with its file.
- **The site:** the finding is labelled "Your team's rule" and names its file **(design call)**; the rule's description shows where a built-in rule links to its page.
- **Severity:** Tabular Editor's 1, 2, 3 are info, warning, error; anything above 3 is an error; a missing severity takes Tabular Editor's default **(builder: confirm it)**. fab-inspector's log types map the same way **(builder)**. The config can change any of them, and custom findings count toward `failOn` like any other.
- **Category:** the rule's own, shown as written, translated names included (no mapping, which would be a guess). Ranking keeps severity first, then pbiplint's eight categories in their order, then custom categories alphabetically **(design call)**.
- **`pbiplint explain <ID>`** works for a custom id when it can find the config (the nearest one, or `--config`): it prints the rule's name, description, category, severity, scope, expression, and file. `pbiplint mcp`'s `explain_rule` and `list_rules` do the same for the project they are given **(builder: arguments)**.

## 9. Writing a rule: the reference, the reasons, and the skill (decided)

A rule's format is technical, so pbiplint helps a person, or their AI assistant, write one. A skill alone is not enough: the assistant must be able to check its work, so three pieces go together.

- **The reference:** what a rule can use, for each format: each scope and its properties with their types, each function and operator, how regular expressions are handled, and what pbiplint does not run, with the reason. Generated from the evaluators' own tables, so it cannot drift from what pbiplint runs **(design call)**. It is printed by a CLI command at the installed version, in text and JSON **(builder: the command's name)**, offered by `pbiplint mcp`, and shown on the site's custom rules page.
- **The reasons:** every rule that cannot run says exactly why (section 6.7), so the assistant can fix it.
- **The skill:** a second skill beside the current one, in the npm package and the Claude plugin, installed by `pbiplint skill --install` **(builder: its name)**. It takes the assistant through a loop: ask what the rule should catch; read the reference at the installed version; write the rule into the team's file with a description in the shape of a pbiplint rule page (what it checks, why the team wants it, how to fix it), since that description is what everyone who meets the finding will read; make sure `customRules` names the file; run `pbiplint <path> --rule <ID>`; check the rule flags the objects meant and nothing else; fix and repeat. It is written from scratch. (A public skill for writing Tabular Editor rules exists under GPL-3.0; nothing is copied from it.)
- **First worked examples,** on the custom rules page and in the skill: two team conventions from #117, CamelCase visible names (`NO_CAMELCASE_COLUMNS_HIERARCHIES`) and measures, columns, and hierarchies outside display folders (`LAYOUT_MEASURES_DF`, `LAYOUT_COLUMNS_HIERARCHIES_DF`), and the approved-schemas Power Query rule.

## 10. The site, the pages, and the Promise

- **The site** opens the rule files the dropped folder's `pbiplint.config.json` names, from inside the dropped folder only. A path that leads outside it gets a message asking the person to drop the folder that holds both the project and its rules. Nothing is stored; a second visit needs the folder dropped again, as today. The evaluator loads only when a config names custom rules, so other visitors download nothing more **(builder: whether the size makes that worthwhile; the bundle budget is a tripwire, raised in measured steps)**.
- **The Promise's five items stay word for word (design call).** Item 2's "reads only the files that describe your model and report, never the data they load" already sits beside a config file pbiplint reads; a rule file is the same kind of file, and it holds no data. The lists of files opened change: the privacy page's site and command line paragraphs, the CLI page's list, and the pipelines page's "The lint" lines each add the rule files `customRules` names. The privacy page's sentence that `pbiplint skill --install` "writes one file" changes to match the second skill.
- **A new page, "Custom rules":** setting up `customRules`; both formats; what happens to a rule with a built-in id; Tabular Editor's ignore annotation; what pbiplint does not run and why; the worked examples; the skill; and the reference.
- **The CLI page's "Configure it" section** gains `customRules`; the README and the config's JSON Schema too.

## 11. How it is tested: the bar for shipping

**Step 1 ships when:**

- **Every survey rule Tabular Editor runs** gives the same objects as Tabular Editor on all nine captured model fixtures (the committed captures), evaluated directly, past section 4's skipping, or is a recorded deviation with its reason. Deviations and pbiplint's own results are keyed by the file's id, then the rule's id, since ids repeat across files; this settles the naming question on the issue **(design call)**.
- **Every rule Tabular Editor cannot run** (23 in 9 files) is reported as in section 6.7; the three statistics rules are reported as needing a live model.
- **All 46 files read,** including the two with comments and the two with a `rules` wrapper; the 11 rules with no scope and the 9 with report scopes are reported as in section 3.
- **Where the survey's files come from (design call).** They stay uncommitted: several carry no license, `TabularEditor/BestPracticeRules` among them, and the September 30, 2026 spec settled that #118 fetches them by commit. The survey parity test fetches each at its pinned commit, checks its sha256, and runs in its own CI workflow (on demand, on a schedule, and before each release), not in every pull request's checks; a file gone from GitHub is listed and skipped, never failed. Pull request CI runs the evaluator's unit tests, written in pbiplint's own words, and the parity test on Microsoft's `BPARules.json` (MIT), vendored with its notice.
- **Where Tabular Editor's own behaviour must be confirmed** (the ignore annotation on an object and on the model, `Tokenize()`'s token names and `Next`, the default severity, rules with no scope, a failure on one object): the build that made the captures, 0.7.1.2, stopped working after October 31, 2026, but Tabular Editor has extended the preview. Its [installation page](https://docs.tabulareditor.com/en/features/te-cli/te-cli-install.html) says, "The preview build stops functioning after 2026-12-31", and "no license is required during preview", with a free Tabular Editor account. So step 1's first pull request captures everything that needs Tabular Editor, with a current preview build, before December 31, 2026: new fixtures for each behaviour above, each captured three ways as RELEASING describes, with the build in its oracle. The rest of step 1 is built against those committed captures, as the September 30, 2026 spec did **(design call)**. Should the date pass first, the fallback is Tabular Editor 2's open-source code (MIT), whose analyzer the format comes from, with the expected results marked as read from that code. The 0.7.1.2 captures stay as they are; RELEASING's paragraph on the expiry is updated.
- **Unit tests** for each operator, function, and conversion; fixtures for the ignore annotation (on an object and on the model, for a built-in and a custom rule), for same-id handling (unchanged, severity changed, edited), and for Power Query rules on M text.
- **The CLI's contract tests** pin the custom finding's JSON and SARIF shape; e2e covers dropping a folder with a config and a rule file on the site.

**Step 2 ships when:** fab-inspector's `Base-rules.json`, run as custom rules under fresh ids, gives fab-inspector 3.4.0's results on fab-inspector's two report fixtures and pbiplint's own report fixtures, or recorded deviations; and hand-written rules covering every operator fab-inspector defines at the pinned commit do the same.

## 12. Steps and releases (decided)

- **Step 1, one release:** `customRules`, the Tabular Editor reader and evaluator, the model view, regular expressions, `Tokenize()`, same-id handling, Tabular Editor's ignore annotation for every rule, the output, the site, the reference and skill for this format, the pages, and release notes. **(builder: how it splits into pull requests.)**
- **Step 2, its own release:** the fab-inspector reader and evaluator, the report half of the reference and the skill, and the page. It gets its own plan once step 1 ships, so what step 1 teaches shapes it **(design call)**.
- The GitHub Action and the Azure Pipelines task need no new input: they read the config. Each release's Action and task versions follow the usual release steps.

## 13. Left to the builder

The full property and scope list; the regular expression limits and how they are enforced; field and command names; the skill's name; the fingerprint data's generation and shape; Tabular Editor's default severity; fab-inspector's operators and log types; whether the site loads the evaluator lazily; and the pull requests each step splits into. Each is marked **(builder)** where it arises.
