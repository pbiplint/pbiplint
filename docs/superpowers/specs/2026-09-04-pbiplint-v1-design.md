# pbiplint v1 design

Date: 2026-09-04. Status: draft for review.

## 1. What this is

pbiplint is a free, open-source (MIT) best-practice linter for Power BI
projects. A person pastes TMDL, or drops a `.SemanticModel` folder, and
gets a ranked list of best-practice findings with guidance on how to fix
each one. The analysis runs entirely in the browser or on the user's own
machine from the command line. Nothing is uploaded, ever.

It is a public good and the top of the funnel for The Data Practitioner
channel. Every rule has a page, and every rule page links to
documentation and, over time, to a channel video. There is no paid tier
in v1 and no plan to charge for rules, ever.

v1 covers the semantic model layer only. Report (PBIR) rules and Power
Query rules follow in later versions (section 12).

## 2. Goals and non-goals

Goals for v1:

- Port Microsoft's Best Practice Analyzer rules (the `BPARules.json`
  ruleset in `microsoft/Analysis-Services`, MIT) to TypeScript with
  results that match Tabular Editor exactly on the same model.
- Run in the browser with no backend, no accounts, no network calls
  after page load, and no telemetry.
- Ship the same core as a command-line tool for people who will not use
  a website and for CI.
- Give every rule a page with what, why, how to fix, and links.
- Ship a sample project with planted violations so anyone can try the
  tool without touching their own model.

Non-goals for v1:

- Report rules, Power Query rules, whole-PBIP folder drop (v2, v3).
- DAX performance analysis of the DAX Optimizer kind. Static DAX rules
  from the Microsoft set are in; nothing that needs query plans or
  VertiPaq statistics is.
- Model documentation. PBIP Documenter exists and is MIT; link to it.
- A GitHub Action, a VS Code extension, saved history, team features,
  or anything that needs a server.
- Applying fixes. v1 shows fix guidance as text. Emitting TMDL patches
  is later work.

## 3. Architecture

One TypeScript monorepo with three packages and one core invariant: the
core package has no Node dependency and no network access.

```
packages/
  core/    parser, object model, indexes, rule engine, rule packs, ranking, formatters
  web/     static site: input, results, rule pages (Vite, TypeScript, no framework)
  cli/     Node wrapper: folder walk, config, output formats, exit codes
examples/  sample project with planted violations, sanitized
rules/     one markdown page per rule (content), consumed by web and cli
tests/     fixtures (sanitized models) and Tabular Editor parity expectations
docs/      this spec, plans, and contributor docs
```

Data flow, identical in the browser and the CLI:

```
input (pasted text | folder of .tmdl files)
  -> parseTmdl per file            (generic tree of nodes, parse issues collected)
  -> buildModel                    (object model, partial declarations merged)
  -> buildIndexes                  (relationship graph, usage index, reference index)
  -> runRules(model, config)       (findings, object-level ignores applied)
  -> rank(findings)                (ordered groups per rule)
  -> render | format               (web UI, or text / JSON / SARIF / markdown)
```

The web package imports the core bundle directly. The CLI package imports
the same core and adds the file-system walk. A build-time test asserts
that the core bundle contains no `node:` imports and no `fetch`.

## 4. Core: parser and object model

The parser is the spike parser, cleaned up and tested. It is a generic
TMDL tree parser, not a hand-written grammar per object type, so unknown
constructs parse as generic nodes and never abort a run.

Grammar handled (from the TMDL spec and the spike corpus):

- Tab indentation. Level 1 declares an object, level 2 its properties,
  level 3 multi-line expressions. Space-indented files produce a parse
  issue, not a crash.
- `/// description` lines attach to the next declared object.
- `<type> <name>` object declarations; names single-quoted when they
  contain dot, equals, colon, quote, or whitespace; `''` escapes a quote.
- `key: value` properties. Double-quoted values are unquoted and `""`
  unescaped. Keys and object types are case-insensitive on read.
- `key` alone is a boolean flag set to true.
- `<object> = expr` and `key = expr` default-property expressions,
  single-line, indented multi-line, or fenced with three backticks (the
  closing fence sets the left boundary).
- `ref <type> <name>` ordering lines.
- Partial declarations: the same table declared in several files merges
  by name.
- CRLF and LF line endings.

Object model: model, tables (columns, measures, partitions, hierarchies
with levels, calculation group with calculation items, annotations),
relationships, roles with table permissions, perspectives, cultures,
shared expressions, functions, model-level annotations. KPI, data
sources, query groups, extended properties, and object-level security
are parsed as generic nodes and exposed on the owning object for rules
that need them, but are not first-class in v1.

Every object keeps its source location (file, line) so findings can
point at a line.

Indexes built once per run:

- Relationship graph: per column and per table, the relationships it
  participates in, with cardinality defaults applied (from many, to one)
  and active/inactive.
- Usage index: sort-by targets, hierarchy level columns, variation
  default columns.
- Reference index: for every DAX expression in the model (measures,
  calculated columns, calculated table sources, table permissions,
  format string definitions, calculation items), the columns and
  measures it references. Qualified references `'T'[C]` and `T[C]` are
  resolved directly. Bare `[X]` resolves to a measure if one exists with
  that name, otherwise to a column on the expression's own table. This
  is the regex approximation from the spike, which matched Tabular
  Editor on both corpora. A tokenizer that skips strings and comments is
  the upgrade path if parity breaks on a richer fixture.

## 5. Rule engine

A rule is a TypeScript object, not a JSON dialect. That is the
deliberate difference from Tabular Editor's Dynamic LINQ rules, which
can only run inside a .NET host.

```ts
interface Rule {
  id: string;            // stable; Microsoft IDs kept verbatim for ported rules
  name: string;
  category: Category;    // Performance | Error Prevention | DAX Expressions | Maintenance | Formatting | Naming Conventions
  severity: 1 | 2 | 3;   // info | warning | error, as in the source ruleset
  scope: ObjectType[];
  needsLiveModel?: true; // declared, never run: needs VertiPaq statistics
  check(model: Model, ctx: RuleContext): Finding[];
}

interface Finding {
  ruleId: string;
  objectType: ObjectType;
  objectRef: string;     // 'Table'[Column], [Measure], 'Table', Model
  location?: { file: string; line: number };
  detail?: string;       // rule-specific specifics, optional
}
```

Rule packs: v1 ships one pack, `microsoft-bpa`, containing every rule in
`BPARules.json` that can be evaluated from files. Rules that need
VertiPaq statistics (column cardinality, table sizes, referential
integrity violations) are declared with `needsLiveModel` so they appear
on the site as "not checkable from files" rather than silently missing.

Literal ports, quirks included. Ported rules reproduce the source
ruleset's behavior exactly, including its quirks (for example the
hide-foreign-keys rule matches by column name only, so it also flags a
dimension key that shares a name with the foreign key). Parity with
Tabular Editor is the point: a person comparing the two tools sees the
same numbers. Each quirk is documented on the rule page. Corrected
variants are later work, behind a config switch, never the default.

Parse issues surface as findings of a built-in rule `PARSE_ISSUE`
(severity error) with file and line, so a malformed file is visible in
the same list as everything else.

Object-level ignores are TMDL-native: an annotation on the object,
`annotation pbiplint.ignore = RULE_ID_1, RULE_ID_2` or `= *`. Power BI
Desktop preserves unknown annotations, so ignores survive a round trip.
Project-level configuration lives in `pbiplint.config.json` next to the
project: rules on or off, severity overrides, and the fail threshold for
the CLI. The web app accepts the same file when it is present in the
dropped folder.

## 6. Ranking

Ranking is explainable, not clever. Findings are grouped by rule. Groups
are ordered by severity (error, warning, info), then by category
priority (Performance, Error Prevention, DAX Expressions, Maintenance,
Formatting, Naming Conventions), then by object count. Within a group,
objects are listed in model order. The results page opens with a
"fix these first" summary of the top five groups.

The order is a function of the findings alone, so the CLI and the web
app always agree.

## 7. Rule content

Every rule has a markdown page at `rules/<ID>.md` with frontmatter
(id, name, category, severity, scope, sources) and four sections: what
the rule checks, why it matters, how to fix it, and links. Links carry
the Microsoft documentation URL where the source ruleset or the
semantic-link-labs port has one, and a `video` slot that is empty until
a channel video exists.

The web app renders these pages at `pbiplint.com/rules/<id>` and links
every finding to its page. The CLI prints the page URL beside each rule
group. Rule pages are content, not code, so contributors can improve a
fix explanation without touching TypeScript.

## 8. Parity testing

The parity suite is the acceptance test for every rule.

- Fixtures: sanitized copies of the two spike corpora (the planted
  violations demo model and the Desktop-exported demo model) and the
  spec-derived sample. Sanitized means local paths in partition sources
  replaced with relative placeholders; TMDL carries no data.
- Expectations: for each fixture, the per-rule object lists produced by
  `te bpa run <model> -r <BPARules.json> --no-defaults`, captured once
  and committed as JSON. The test asserts that pbiplint's finding set
  per rule equals the expected set, not just the count.
- Tabular Editor is never required by users, by the CLI, or by CI. It is
  a development-time oracle only: expectations are refreshed by hand
  with a documented script when the fixtures or the ruleset change,
  using the TE3 command line or the free Tabular Editor 2 command line
  on Windows. Contributors without either can submit hand-verified
  expectations.
- A rule is done when it has a fixture that exercises it and matches
  Tabular Editor. Rules with no fixture coverage are listed in the test
  output as untested, and new fixtures are added to close the gaps.

Unit tests cover the parser against the spec sample and against
hand-written edge cases (fenced expressions, partial declarations,
escaped quotes, space indentation, CRLF).

## 9. Web app

Static site, TypeScript, Vite, no framework. Hosted on GitHub Pages at
pbiplint.com. No backend, no accounts, no analytics, no external
requests after load. Fonts are bundled, not fetched.

Pages:

- Home: a paste box and a drop zone, side by side, plus a "try the
  sample" button that loads the bundled sample project. The drop zone
  takes a `.SemanticModel` folder (or the parent PBIP folder, from which
  only the `.SemanticModel` part is read in v1). Chrome and Edge use the
  File System Access API; Firefox and Safari fall back to a directory
  input. A single `.tmdl` file can also be dropped.
- Results: the ranked groups from section 6, expandable to the object
  list with file and line, filters by category and severity, and export
  as markdown or JSON. A privacy line at the top of the page states that
  nothing was uploaded and links to the verification note.
- Rules index and rule pages, generated from `rules/*.md` at build time.
- About: what it is, who makes it, how to verify the no-upload claim
  (open the network tab, or load the page and switch to airplane mode).

The whole site works offline once loaded. A build check fails the deploy
if the bundle references a network API.

## 10. CLI

`npx pbiplint <path>` where path is a `.SemanticModel` folder, a PBIP
folder, or a single `.tmdl` file. Node 20 or later.

- Output formats: text (the default, a grouped table with rule page
  URLs), `--format json`, `--format sarif` (so GitHub code scanning and
  editors can consume it without an Action), `--format markdown`.
- Exit code: nonzero when findings at or above the configured threshold
  exist (default: error). `--fail-on warning` tightens it.
- Config: `pbiplint.config.json` discovered upward from the path.
- `pbiplint rules` lists rules with status (ported, needs live model).

The CLI is the same core with a folder walk in front of it. No feature
lives only in the CLI or only in the web app.

## 11. Sample project

`examples/messy-sales/` is a sanitized copy of the planted-violations
demo model. It ships in the repo, in the CLI package for
`pbiplint --sample`, and bundled into the site for the "try the sample"
button. It is also a parity fixture, so the sample's expected findings
are pinned by the test suite.

## 12. Later versions

Ordered, each its own spec:

- v2: report layer. PBIR parser, rules ported from PBI Inspector's base
  set (MIT, JSON Logic) with a shim for its part navigation, whole-PBIP
  drop, and a GitHub Action wrapping the CLI's SARIF output.
- v3: Power Query layer. M parsing via `@microsoft/powerquery-parser`
  (MIT, bundles for the browser at about 130 KB gzipped), a rule set
  authored from Microsoft's published M guidance.
- Later: VS Code extension, TMDL fix patches, corrected rule variants
  behind a config switch.

## 13. Tooling and conventions

- npm workspaces, TypeScript strict, Vitest, Vite for the site, esbuild
  for the CLI bundle. ESLint and Prettier with default configs.
- CI on every pull request: lint, unit tests, parity suite, core bundle
  purity check, site build. Deploy to Pages on merge to main.
- Releases: semantic versions from `packages/cli` and `packages/core`,
  published to npm as `pbiplint` (the CLI, which depends on the core)
  and `@pbiplint/core`. The first publish claims the name; there is no
  placeholder package. `pbip-lint` is published later as a thin
  re-export so a guessed hyphen still installs the right thing.
- Commit messages in the imperative, no em dashes anywhere in the repo.
- Rule pages and the README avoid Microsoft trademarks in product
  naming; "for Power BI projects" in descriptive text is fine.

## 14. Definition of done for v1

- Parser: zero parse issues across the fixture corpus; spec sample fully
  captured; unit tests green.
- Rules: every file-checkable rule in `BPARules.json` ported, each with
  a rule page, and each matching Tabular Editor's object list on at
  least one fixture. `needsLiveModel` rules declared and listed.
- Web: paste, folder drop, sample, results with ranking and export, rule
  pages, about page; works offline; deployed at pbiplint.com.
- CLI: published to npm; text, JSON, SARIF, markdown outputs; config
  and exit codes; runs the sample.
- Repo: MIT license, README with the no-upload claim and how to verify
  it, contributor guide for adding a rule and a rule page, CI green.
