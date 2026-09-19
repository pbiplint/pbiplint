# Rule pages: the complete template

Design spec, approved by Michael on 2026-09-19 in the session that wrote
it. Issue #45 ordered this work. The plan that implements it is written
from this document and nothing else, so everything a fresh session needs
is here, including the facts gathered while designing.

## 1. What this is for

A rule page is where every finding ends up. The CLI prints the rule id
on each line, the SARIF help block links back to the page, the code
scanning annotation carries the page's Why and How to fix sections, and
the rules index lists every page. Someone who lands on a page should be
able to recognise the finding they saw, see it in a snippet, fix it,
decide whether ignoring it is legitimate, and know which other rules
touch the same object. Today's pages answer the first and the third.

Every page has the four required sections, and 47 of the 72 have
Quirks. Pages run 128 to 382 words, median 196. One page has a code
example. None has a TMDL snippet. No page fills `video`. Links repeats
the `sources` list on all 72 pages. Nine pages refer to another rule by
id. The ignore mechanism is documented only in the README, and no page
says when ignoring is the right call.

This spec defines what a complete page is, the tooling that keeps
complete pages honest, and the order the 72 pages are brought up to it.
The v2 report-layer spec (`2026-09-18-pbiplint-v2-report-layer-design.md`,
sections 7 and 9) has every report rule page follow the same template,
so this lands before the first report-layer pages and the template is
set once.

## 2. Goals and non-goals

Goals:

- One template for all 72 pages, with an example that the engine runs
  in a test, so no page can show a snippet that does not fire.
- The ignore mechanism written once and generated onto every page and
  into the SARIF help block, never hand-copied.
- Cross-references between rules that are checked and rendered as links.
- Attribution separated from further reading.
- Every constraint from v1 kept: pages in pbiplint's own words, a fix
  route that needs no third-party tool, no Tabular Editor C#, no
  ruleset text on a page, no em dashes.
- The work lands in reviewable pieces: the tooling first, then one pull
  request per category.

Non-goals:

- Videos. `video` stays a frontmatter field to fill as episodes exist.
- Report-layer pages. Issue #9 tracks them; they inherit this template.
- Changing what any rule checks. A page describes the rule as ported.
- Rewriting a page's existing prose for its own sake. The batches add
  the new sections and fix what review finds wrong.

## 3. Ground truth captured while designing

Measured on main at 91cc4eb.

**Pages.** 72 files under `rules/`, one per rule in `defaultRules`.
Frontmatter fields: `id`, `name`, `category`, `severity`, `scope`,
`status`, `video`, `sources`. Statuses: 66 `ported`, 5 `needsLiveModel`
(avoid-bi-directional-relationships-against-high-cardinality-columns,
fix-referential-integrity-violations, large-tables-should-be-partitioned,
reduce-usage-of-long-length-columns-with-high-cardinality,
split-date-and-time), 1 `builtin` (parse-issue). Categories, with
counts: Performance 24, Formatting 15, DAX Expressions 12, Error
Prevention 9, Maintenance 9, Naming Conventions 3. `CATEGORY_ORDER` in
`packages/web/src/build/pages.ts` drives the index and fails the build
on any other category.

**How a page flows to tool output.** `scripts/sync-rule-pages.mjs`
reads every page, takes the first paragraph of What it checks as the
rule's description into `packages/core/src/rules/rule-summaries.data.ts`,
and builds the SARIF help block (Why, How to fix, Quirks, a Read more
link) into `packages/cli/src/rule-help.data.ts`, in Markdown and in a
plain-text form that drops fence lines and unwraps code spans. It reads
rule ids from frontmatter by regex and does not import core.
`scripts/test/sync-rule-pages.test.mjs` and
`packages/cli/test/rule-help.test.ts` cover the helpers and the data.
`packages/core/test/rule-pages.test.ts` fails when a page and the data
disagree, checks frontmatter against the rule, requires the four
sections, rejects `TODO` and em dashes, rejects the phrase "fix
expression", and rejects a Why section that reuses the ruleset
description's first sentence.

**Site renderer.** `rulePage` in `packages/web/src/build/pages.ts`
parses the frontmatter, renders the whole body through `marked` 18.0.13
with a heading renderer that adds ids (`headingId`), and wraps it in
the page shell with a meta line (severity badge, id, status, scope),
the optional video link, and a call-to-action. `sources` is not
rendered. The build code imports only `marked`; the web app's runtime
code imports `@pbiplint/core`, so the package is available to the build
too. `packages/web/test/generate.test.ts` pins the h2 id list of
hide-foreign-keys as `what-it-checks, why-it-matters, how-to-fix-it,
quirks, links`, pins the page count at 72, and tests the live-model
badge and the video link on
avoid-bi-directional-relationships-against-high-cardinality-columns and
hide-foreign-keys. `packages/web/e2e/site.spec.ts` deep-links
`/rules/hide-foreign-keys/#how-to-fix-it` and runs axe on that page.
`check-site.ts` fails the build on inline styles, inline handlers,
off-origin resources, and duplicate ids.

**Linting a snippet.** `lint(files, options)` in
`packages/core/src/engine/lint.ts` is the one call the web app and the
CLI make: it parses each `{ path, text }`, builds the model, runs the
rules, and returns `findings` (each with `ruleId` and `objectName`),
ranked `groups`, and a summary. The unit tests feed one inline TMDL
string as a single file (`modelFrom` in `packages/core/test/helpers.ts`)
and that string can hold several tables, relationships, and roles.
Malformed lines surface as `PARSE_ISSUE` findings, never as exceptions.

**Ignoring a rule.** `annotation pbiplint.ignore = RULE_A, RULE_B`
under an object, or `= *`; matched without regard to case
(`packages/core/src/engine/ignore.ts`, `IGNORE_ANNOTATION` exported).
Project-wide: `"RULE_ID": "off"` under `rules` in
`pbiplint.config.json`. Both are documented in the README only.

**Scaffold.** `scripts/generate-rule-pages.mjs` imports `@pbiplint/core`
(so core must be built first), writes a page for any rule without one,
and never touches an existing page. It emits the four sections with
`TODO` placeholders and puts the ruleset URL plus the rule's references
in both `sources` and Links.

**Git.** Main cannot be rewound (ruleset 23615692). Every change lands
through a pull request from a branch off main. No closing keyword next
to an issue number anywhere in a commit message or pull request body.

## 4. The template

Sections, in this fixed order:

| Section | ported | needsLiveModel | builtin |
|---|---|---|---|
| What it checks | required | required | required |
| Example | required | absent | required |
| Why it matters | required | required | required |
| How to fix it | required | required | required |
| When to ignore it | required | absent | required |
| Quirks | when there is one | when there is one | when there is one |
| Related rules | when there is one | when there is one | when there is one |
| Links | when there is further reading | same | same |

A live-model rule has no Example and no When to ignore it because the
engine does not run it: an example that cannot fire is a promise the
page cannot keep, and there is no finding to ignore. Its What it checks
states, after the condition, that pbiplint lists the rule but does not
run it, because it needs column statistics that only a live model
carries and a TMDL file does not.

Sections keep their exact headings. The test enforces presence, absence,
and order per status.

**What it checks.** The first paragraph stays the condition the rule
tests, in one or two sentences, because it is the rule's description in
every output. A second paragraph may describe the shape of the finding
as the tool prints it, so a reader can match the line they saw to the
page. Where the first paragraph is already right it is left alone, so
descriptions do not churn across the batches.

**How to fix it.** Names the Power BI Desktop route and the TMDL
property wherever both exist, and Power Query or the source system
where the fix lives there. Never a third-party tool as the route.
Tabular Editor may be named only after that route, as an optional bulk
shortcut or a linked walkthrough. Not machine-checked; review checks it.

**Frontmatter.** Unchanged fields, one changed meaning. `sources` is
attribution only: the ruleset URL for every `ported` and
`needsLiveModel` page, and nothing for `builtin`, since nothing was
ported. Any further-reading URL that sits in `sources` today moves to
Links with descriptive link text.

## 5. The Example section

Two fenced TMDL blocks, and optionally a sentence or two of prose around
them. The first fence carries the info string `tmdl fires` and holds a
snippet the rule flags. The second carries `tmdl fixed` and holds the
same snippet with the fix applied. No hand-written captions: the
renderer and the sync script supply them, so all 72 pages read the same
and nothing drifts.

    ## Example

    ```tmdl fires
    table Sales
    	column 'Product ID'
    		dataType: int64
    		sourceColumn: ProductID

    table Product
    	column 'Product ID'
    		dataType: int64
    		isKey
    		sourceColumn: ProductID

    relationship Sales-Product
    	fromColumn: Sales.'Product ID'
    	toColumn: Product.'Product ID'
    ```

    ```tmdl fixed
    table Sales
    	column 'Product ID'
    		dataType: int64
    		isHidden
    		sourceColumn: ProductID

    table Product
    	column 'Product ID'
    		dataType: int64
    		isKey
    		sourceColumn: ProductID

    relationship Sales-Product
    	fromColumn: Sales.'Product ID'
    	toColumn: Product.'Product ID'
    ```

The snippet above is illustrative; the proof page carries whatever the
test proves.

A snippet is a complete TMDL file as someone would paste it into the
site: a `table` block, or several tables plus `relationship` blocks, or
a `role`, with tabs for indentation. It is minimal, with realistic
names (Sales, Product, Date, Customer), and it need not be clean on any
other rule. A DAX rule's example is still TMDL, a measure with the
expression inside, because that is what the engine reads and what the
file looks like.

**The example test**, in `packages/core/test/rule-pages.test.ts`, for
every migrated page that has an Example:

- Exactly one `tmdl fires` fence and exactly one `tmdl fixed` fence.
- `lint([{ path: "example.tmdl", text: fires }])` with the default rules
  and default config yields at least one finding whose `ruleId` is the
  page's rule, and no `PARSE_ISSUE` finding.
- The same call on `fixed` yields no finding for the page's rule and no
  `PARSE_ISSUE` finding.
- Neither snippet contains `pbiplint.ignore`, so a fix is a fix and not
  a suppression.
- Findings from other rules are ignored in both directions.

The parse-issue page inverts the parse check: its `fires` snippet must
produce a `PARSE_ISSUE` finding, and its `fixed` snippet must produce
none. Live-model pages must have no Example section.

**Rendering.** A `marked` code renderer override reads the info string.
`tmdl fires` renders as a `<figure class="example fires">` with a
`<figcaption>` reading "Fires the rule", then the `<pre><code
class="language-tmdl">` block; `tmdl fixed` the same with class `fixed`
and the caption "After the fix". Any other info string renders as it
does today. CSS for the figure and caption goes in
`packages/web/src/styles.css`. Fence contents are HTML-escaped as
`marked` already does.

## 6. When to ignore it

The page writes only the judgment: the situations in which the finding
is noise, or one sentence saying there is no legitimate exception. Text
along the lines of "add an annotation" or a config snippet does not
belong on the page. The test rejects a section that contains
`pbiplint.ignore` or `"off"`.

The mechanics are generated from the rule id by one helper in core,
exported for the renderer and the sync script to share. Proposed name
`ignoreHelp(ruleId)`, returning Markdown to this effect:

> To ignore this rule on one object, add `annotation pbiplint.ignore =
> RULE_ID` under the object in its TMDL file. Power BI Desktop keeps the
> annotation. To turn the rule off for a whole project, set `"RULE_ID":
> "off"` under `rules` in `pbiplint.config.json`.

The helper is a pure string function, so core stays browser-pure. The
renderer appends its output as the last paragraph of the section before
rendering the body, by splitting the Markdown at the heading. The sync
script appends the same text in the help block. A unit test in core
pins the helper's text, and the renderer and sync tests check that the
section ends with it.

## 7. Related rules, Links, and attribution

**Related rules** is a bulleted list. Each bullet opens with a rule id
in backticks and continues with a short clause: fires on the same
object, clears together, contradicts, or is the stricter form. The test
checks that the section has at least one bullet, that every backticked
token shaped like a rule id names a rule in `defaultRules`, and that
the page's own id is not listed.

**Rule ids become links** everywhere on every page: a `marked` codespan
renderer override checks the span's text against the set of rule ids
(imported from `@pbiplint/core`, which the build can now use) and, when
it matches and is not the page's own id, wraps the `<code>` in an
`<a href="/rules/<slug>/">`. The nine pages that already name other
rules in Quirks and How to fix get links for free. `slug` is exported
from core and is what the site already uses for paths.

**Links** is further reading only. Every bullet is `- [text](url)` with
descriptive text; a bare URL fails the test, and so does a URL that
also appears in `sources`. The section is omitted when there is nothing
more to read.

**Attribution** is rendered from `sources` as a paragraph at the foot
of the article, before the call-to-action: for the ruleset URL, "Ported
from Microsoft's Best Practice Analyzer ruleset" with the link; for any
other URL, the link under its hostname. The renderer keeps a small map
from known URLs to names, which is the extension point the v2 spec
needs for PBI Inspector. A page with empty `sources` renders no
attribution paragraph. The test checks `sources` per status as section
4 says.

## 8. Site renderer changes, in one place

In `packages/web/src/build/pages.ts` and `styles.css`:

1. Code renderer override for `tmdl fires` and `tmdl fixed` figures.
2. Codespan renderer override that links known rule ids.
3. `ignoreHelp` appended to the When to ignore it section before render.
4. Attribution paragraph from `sources`.
5. CSS for `.example`, `figcaption`, and the attribution paragraph;
   `packages/web/test/styles.test.ts` stays green.

New h2 ids on a full page: `example`, `when-to-ignore-it`,
`related-rules`. The `generate.test.ts` expectation for
hide-foreign-keys changes to the new list. No inline styles, no new
ids on figures, so `check-site.ts` stays green. The e2e deep-link test
keeps `#how-to-fix-it`.

## 9. Tool output

`scripts/sync-rule-pages.mjs` builds the help block in this order,
mirroring the page minus What it checks: Example, Why it matters, How to
fix it, When to ignore it, Quirks, Read more. In the Markdown form each
example fence is preceded by a bold caption line, "**Fires the rule**"
or "**After the fix**", and the fence's info string is reduced to
`tmdl`. When to ignore it ends with `ignoreHelp(ruleId)`. The text form
is produced as today, fence lines dropped and code spans unwrapped, and
the bold markers on the captions are dropped too so they read as plain
lines.

The script imports `ignoreHelp` from `@pbiplint/core`, so it needs core
built first, as the scaffold already does; its usage comment says so.
The description stays the first paragraph of What it checks, so the CLI
text output and the web results do not change shape.

`rule-help.data.ts` grows. The pack check and the CLI tests decide
whether that matters; nothing in this design depends on its size.

## 10. Tests

**Phasing.** `rule-pages.test.ts` carries `LEGACY_PAGES`, a set of
slugs not yet migrated. A page outside the set must meet the full
template of sections 4 to 7. A page inside it must meet today's rules
and must not contain `## When to ignore it`, so migrating a page
without removing its slug fails. A slug naming no file fails. Each
batch removes its slugs; the last batch deletes the set and the code in
the test that reads it.

**Per migrated page:**

- Sections present, absent, and ordered per status.
- Example: fence counts, the lint assertions, no `pbiplint.ignore`.
- When to ignore it: non-empty, no mechanics text.
- Related rules: at least one bullet, known ids, not self.
- Links: link text on every bullet, no overlap with `sources`.
- `sources`: exactly the ruleset URL, or empty for `builtin`.
- Everything the test checks today.

**Renderer** (`generate.test.ts`): figures and captions from the info
strings, a known rule id linked and an unknown one left as code, the
own id not linked, `ignoreHelp` text present in the section, the
attribution paragraph present with the ruleset name and absent for an
empty `sources`, the new h2 id list.

**Core**: `ignoreHelp` text pinned.

**Sync** (`scripts/test/sync-rule-pages.test.mjs`,
`packages/cli/test/rule-help.test.ts`): section order in the help block,
captions, reduced info string, `ignoreHelp` present, text form drops
fences.

**Browser suite**: unchanged, and it must stay green on the migrated
hide-foreign-keys page, including axe.

## 11. Scaffold and CONTRIBUTING

`scripts/generate-rule-pages.mjs` emits the new template: the sections
per status with `TODO` placeholders, two example fences with `TODO`
inside, `sources` holding only the ruleset URL for ported rules and
nothing for builtin, and the rule's references as `TODO` link-text
bullets under Links.

CONTRIBUTING's Rule pages section is rewritten to describe the template,
the example convention and its test, the generated ignore mechanics,
the link rules, and the attribution meaning of `sources`. The existing
constraints stay in it verbatim in substance. The README's "What it
checks" paragraph names the new sections once every page has them, in
the last batch.

## 12. Sequencing

**Pull request 1**, branch `rule-pages-template`: this spec, the plan,
`ignoreHelp` in core, the renderer changes and CSS, the sync script
changes and regenerated data files, the tests including `LEGACY_PAGES`
holding 68 slugs, the scaffold, CONTRIBUTING, and four proof pages, one
per path:

| Page | Proves |
|---|---|
| hide-foreign-keys | the ported path; the build tests and the browser suite already exercise it |
| avoid-using-1-x-y-syntax | a DAX rule's example as TMDL; the one page with a code block today |
| avoid-bi-directional-relationships-against-high-cardinality-columns | the live-model path; the build tests already exercise it |
| parse-issue | the builtin path, empty `sources`, and the inverted parse check |

**Pull requests 2 to 7**, one per category, smallest first, each on a
branch `rule-pages-<category>` off main after the previous one merges:
Naming Conventions (3), Maintenance (9), Error Prevention (8), DAX
Expressions (11), Formatting (14), Performance (23). Counts exclude the
proof pages. Each batch: an Opus subagent drafts the pages from the
template and section 13; the session reviews every page against the
constraints; `node scripts/sync-rule-pages.mjs`; lint, typecheck, unit
tests, build; the batch's slugs leave `LEGACY_PAGES`; the pull request
opens and the session stops for Michael's review. The Performance batch
deletes `LEGACY_PAGES` and updates the README paragraph.

Issue #45's checklist is ticked by hand as each pull request merges.

## 13. Writing the pages

Constraints, unchanged from v1 and enforced where a test can:

- pbiplint's own words. No ruleset description text, no Tabular Editor
  C#, no "run this script in TE", no "fix expression".
- Every How to fix it gives a route with no third-party tool. Tabular
  Editor only after that route, and only as an optional bulk shortcut
  or a linked walkthrough.
- Quirks kept from the source rule are documented. Other rules are
  referred to by id in backticks.
- No em dashes. Long-form dates in prose.
- The voice of the existing pages: plain, specific, second person
  where a reader is addressed, a consequence stated as what a report
  author or a refresh will see.

Per section:

- **What it checks.** Leave a correct first paragraph alone. Add the
  finding's shape in a second paragraph when the tool's line is not
  obvious from the condition.
- **Example.** The smallest snippet that fires, with real-looking
  names, and the same snippet fixed the way How to fix it says. Prose
  only where the snippet needs a word of orientation.
- **How to fix it.** Desktop route and TMDL property, both, where both
  exist. Power Query or the source where the fix lives there.
- **When to ignore it.** Name the concrete legitimate situations, for
  example a key column deliberately left visible for a lookup page, and
  what to check before deciding. When there is none, say so in a
  sentence rather than inventing one.
- **Quirks.** As today. The 25 pages without the section are reviewed
  for quirks the port kept; a rule with none keeps the section out.
- **Related rules.** Rules that fire on the same object, clear together
  with one fix, contradict, or are the stricter form. One clause each.
- **Links.** Microsoft Learn articles and the like, with descriptive
  text. Never the ruleset URL.
- **Live-model pages.** What it checks says, after the condition, that
  pbiplint lists the rule but does not run it because it needs column
  statistics from a live model that a TMDL file does not carry.

## 14. Definition of done

- All 72 pages meet the template; `LEGACY_PAGES` is gone.
- Every example fires and every fix clears, proven by the test on every
  run.
- `ignoreHelp` is the only copy of the ignore mechanics outside the
  README.
- The site renders figures, linked rule ids, the generated mechanics,
  and attribution; the site check, the build tests, and the browser
  suite are green.
- The sync data files are regenerated and the CLI's SARIF help carries
  the new sections.
- CONTRIBUTING and the scaffold describe and emit the template; the
  README names the sections.
- Issue #45's checklist is complete and the issue is closed by hand.
