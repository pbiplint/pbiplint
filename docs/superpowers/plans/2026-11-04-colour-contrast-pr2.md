# Colour contrast, PR 2: the rule

**Goal:** `LOW_TEXT_CONTRAST` reports report text that falls below WCAG 2.2's contrast thresholds, using only colours the project's files settle, as the first Desktop check showed Power BI Desktop paints them.

**Architecture:** PR 1's resolver gains the Desktop check's calibrations. A new element table (`colour/elements.ts`) says, for each kind of text, where its colour, size, weight, own background, and default come from. A measuring module (`colour/measure.ts`) walks every visual's text elements, instances, and states into measured pairs or skips with a reason, and the rule turns measured pairs below the threshold into findings. PR 3 reads the same measuring module for the coverage line, so the rule and the fact cannot disagree.

**Tech Stack:** TypeScript, Vitest, the message catalog (`messages/en.ts`), rule pages (`rules/*.md`).

**Spec:** `docs/superpowers/specs/2026-10-30-colour-contrast-design.md`, sections 3 and 5 to 12, with the amendment Task 1 adds.

## Global Constraints

- Severity warning; id `LOW_TEXT_CONTRAST`; name "Text with too little contrast"; category Accessibility; layer report; scope Visual (and Report for a theme finding).
- A pair the files do not settle is skipped and counted, never reported on an assumed colour. An element whose default the Desktop checks did not show is "not known".
- 4.5:1, or 3:1 for large text (at least 18 point, or 14 point and bold). No rounding of a computed ratio; shown ratios truncated to two decimals.
- Semibold is not bold. Sizes are compared as written, at Actual size; a `px` run converts at 0.75 pt per px.
- One finding per text element per visual; a failing theme setting reported once, on the theme.
- Nothing says or implies a report "passes WCAG" or "is accessible".
- Rule pages are pbiplint's own prose, with a fix route that needs no third-party tool. Sources: WCAG 2.2 and its Understanding pages, Microsoft Learn, Microsoft's published schemas.
- Microsoft's theme files are never committed; fixtures use hand-written themes.
- Core stays browser-pure and under its bundle tripwire, raised only in measured steps.
- No em dashes. No closing keyword next to an issue number in a commit or PR body.

## Review Focus

1. A report on a CY base theme where no visual sets a background: until the second check settles a visual that is on with no colour, every such visual is skipped as "not known", and nothing is reported against a guessed white or theme background.
2. A visual inside a group: its position is relative to the group, so the overlap test must place it on the page through every parent before comparing boxes.
3. Hidden text: a title with `show: false`, a hidden visual, a visual on a hidden page, and a tooltip page. The first two are not measured; a hidden or tooltip page is still measured, since a reader reaches it.
4. A text box with several runs and paragraphs: each run is an instance, the worst run is named, and a run with an empty value is not measured.
5. A theme finding: the same theme setting failing on twenty visuals gives one finding on the theme, and no visual finding for those pairs, while a visual that sets either colour itself still gets its own.

## Calibration from Desktop check 1 (November 4, 2026)

Read from the check's screenshots and pinned in Task 1's tests:

- ColorId 0 is `#FFFFFF` and ColorId 1 is `#000000`, whatever the theme; ColorId n from 2 is `dataColors[n - 2]`.
- Percent p shades a channel c to c + p(255 - c) for p > 0 and to c(1 + p) for p < 0, rounded to the nearest whole value.
- Each layer's alpha is held as a whole byte: round((1 - t / 100) × 255) / 255. The Fluent2 page (`#FAFAFA` at 14 over `#E6E6E6`) shows one unit lighter than this (`#F8F8F8` against `#F7F7F7`), a known difference recorded in the spec.
- A page's transparency does not reach a visual's own background.
- A group that is on with no colour paints `#FFFFFF`.
- With no colour set: a text box run takes `textClasses.label`; a classic card's category label `textClasses.largeLightLabel`; table headers and values, and slicer items, `foreground`; chart axis labels `foregroundNeutralSecondary`; table cells take the theme's `background` as their own background.

## Steps to fill from Desktop check 2

Marked **CHECK 2** where they appear. Each is "not known" until the check's screenshots settle it; if there is no second check, it stays "not known".

- **CHECK 2a:** the colour of a visual's background that is on with no colour (the theme's `background`, or white).
- **CHECK 2b:** the default text class or structural colour of each element the first check did not settle: visual title and subtitle, classic card value, new card value and label, multi-row card, slicer header, button slicer, legend, axis titles, data labels, button text, shape text.
- **CHECK 2c:** ColorId 0 and 1 under a dark theme. If they follow the theme there, Task 1's fixed values become the theme's background and foreground, with the first check's theme as the case to explain.

---

### Task 1: The spec's amendment, and the resolver's calibration

**Files:**
- Modify: `docs/superpowers/specs/2026-10-30-colour-contrast-design.md` (section 10 gains "Results, November 4, 2026"; sections 5.2, 5.3, and 8's example detail corrected)
- Modify: `packages/core/src/colour/read.ts`, `packages/core/src/colour/cascade.ts`
- Test: `packages/core/test/colour-read.test.ts`, `packages/core/test/colour-stack.test.ts`

**Interfaces:**
- Produces: `shade(c: Rgba, percent: number): Rgba` in `colour.ts`; `readColour` knows any Percent; ColorId 0 and 1 need no theme.

- [ ] **Step 1: Write the spec amendment**

A dated subsection under section 10 with the calibration list above, the check's method in one paragraph (a hand-made project, screenshots at Actual size, pixels read from them), and what stays open (the CHECK 2 list). Correct section 5.2's ColorId and text box lines, section 5.3's group line, and section 8's example to `#A19F9D on #FFFFFF is 2.63:1`. Mark each corrected step "(confirmed November 4, 2026)".

- [ ] **Step 2: Write the failing tests**

- `ColorId 0 and 1 are white and black, with no theme`: `readColour(themeRef(0), {})` is `#FFFFFF` with no `from`; `themeRef(1)` is `#000000`.
- `shades by Percent as Desktop paints it`: with dataColors `["#2E8B57", "#B8860B"]`, ColorId 2 at -0.6, -0.2, 0.2, 0.6 gives `#123823`, `#256F46`, `#58A279`, `#ABD1BC`; ColorId 3 gives `#4A3604`, `#936B09`, `#C69E3C`, `#E3CF9D`; ColorId 0 at -0.6 `#666666` and 0.2 `#FFFFFF`; ColorId 1 at -0.2 `#000000` and 0.6 `#999999`.
- `blends with a whole-byte alpha`: `#000080` at 50 over `#FFD700` gives `#7F6B40`; `#00FF00` at 50 over a page `#FF0000` at 50 over wallpaper `#0000FF` gives `#40803F`; the page alone gives `#80007F`; group `#222222` at 50 over `#FFD700` gives `#907C11`.
- `records the Fluent2 page's known difference`: `#FAFAFA` at 14 over `#E6E6E6` gives `#F7F7F7`, with a comment naming the one-unit difference Desktop shows.
- `paints a group that is on with no colour white`.
- Delete the tests that pinned Percent as `percent` and group-on-no-colour as `not-set`.

- [ ] **Step 3: Run them to see them fail**

Run: `npx vitest run packages/core/test/colour-read.test.ts packages/core/test/colour-stack.test.ts`
Expected: FAIL on the new tests.

- [ ] **Step 4: Implement**

`shade` rounds each channel with `Math.round`. `"percent"` leaves `NotKnown`. In `backgroundOf`, alpha is `Math.round(colourAlpha × (1 - t / 100) × 255) / 255`. A group place gets `defaultColour: "#FFFFFF"` as a literal (a new `defaultLiteral` field), so it needs no theme. A visual place's default stays a lookup marked **CHECK 2a**: until then a visual that is on with no colour is `not-set`.

- [ ] **Step 5: Run them to see them pass, then commit**

Run: `npx vitest run packages/core/test/colour*`
Expected: PASS.
`git commit -m "feat(core): calibrate the colour resolver to Desktop"`

### Task 2: The element table and text classes

**Files:**
- Create: `packages/core/src/colour/elements.ts`
- Modify: `packages/core/src/colour/cascade.ts` (a fallback that names a text class)
- Test: `packages/core/test/colour-elements.test.ts`

**Interfaces:**
- Produces:

```ts
export type ElementKind =
  | "title" | "subtitle" | "dataLabels" | "axisLabels" | "axisTitles" | "legend"
  | "cardValue" | "cardLabel" | "multiRowCard" | "kpi" | "tableHeaders" | "tableValues"
  | "tableTotals" | "slicerHeader" | "slicerItems" | "buttonSlicer" | "textBox" | "buttonText";
export type Fallback = { textClass: string } | { named: string } | "not-known";
export interface ElementSpec {
  kind: ElementKind;
  /** Visual types it applies to; "*" for every visual (titles). */
  visualTypes: readonly string[] | "*";
  container: boolean;            // visualContainerObjects (title, subtitle) or visual.objects
  object: string;
  colour: readonly string[];     // the colour properties, each an instance (fontColorPrimary...)
  size: string;                  // fontSize, textSize, titleFontSize
  bold?: string;
  background?: { object: string; colour: string; transparency?: string; show?: string };
  fallback: Fallback;
}
export const ELEMENTS: readonly ElementSpec[];
export function textClass(name: string, themes: Report["themes"]): { colour: ColourRead; size?: number };
```

- [ ] **Step 1: Write the failing tests**

- `has one entry per row of the spec's section 6 table`, with the properties the table names, each checked against `formattingObjectDefinitions` (the builder lists the schema path beside each in a comment).
- `takes the defaults the first Desktop check showed`: textBox `{ textClass: "label" }`; cardLabel `{ textClass: "largeLightLabel" }`; tableHeaders, tableValues, slicerItems `{ named: "foreground" }`; axisLabels `{ named: "foregroundNeutralSecondary" }`; table cell background defaults to `background`.
- `leaves the rest not known until the second check`: title, subtitle, cardValue, multiRowCard, kpi, slicerHeader, buttonSlicer, legend, axisTitles, dataLabels, buttonText are `"not-known"` (**CHECK 2b** replaces each with what the check shows).
- `textClass` reads custom then base, stops at a theme not read, and returns the class's `fontSize` beside its colour.
- `lookup` with a text class fallback answers from the class when nothing else sets the property.

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run packages/core/test/colour-elements.test.ts`
Expected: FAIL, no such module.

- [ ] **Step 3: Implement**

The table is data, one object per row. KPI and multi-row card rows are "schema only" (no survey file) and stay `not-known` unless the second check shows them.

- [ ] **Step 4: Run, then commit**

Run: `npx vitest run packages/core/test/colour-elements.test.ts`
Expected: PASS.
`git commit -m "feat(core): the text elements the contrast rule measures"`

### Task 3: Measuring a visual

**Files:**
- Create: `packages/core/src/colour/measure.ts`, `packages/core/src/colour/size.ts`
- Test: `packages/core/test/colour-measure.test.ts`, `packages/core/test/colour-size.test.ts`

**Interfaces:**
- Consumes: Tasks 1 and 2, `backgroundOf`, `lookup`, `readColour`.
- Produces:

```ts
export type SkipReason =
  | NotKnown | "image" | "overlap" | "on-data" | "size-unknown" | "default-not-known";
export interface Measured {
  visual: Visual; kind: ElementKind; state?: string; field?: string;
  foreground: Rgba; background: Rgba; ratio: number; required: 4.5 | 3;
  fontSize?: number; bold: boolean;
  foregroundAt: Found; backgroundAt: StackLayer[];   // where each colour came from
}
export interface Measurement { measured: Measured[]; skipped: { visual: Visual; kind: ElementKind; why: SkipReason }[] }
export function measureReport(report: Report): Measurement;
export function pointSize(value: unknown): number | undefined;   // "12D", "28pt", "16px", 12
export function isBold(props: { bold?: unknown; fontWeight?: unknown; fontFamily?: unknown }): boolean;
export function requiredRatio(size: number | undefined, bold: boolean): 4.5 | 3 | undefined;
```

- [ ] **Step 1: Write the failing tests**

Size (`colour-size.test.ts`): `"12D"` 12, `"28pt"` 28, `"16px"` 12, `12` 12, `"'12'"` undefined; bold from `bold: true`, `fontWeight` `"bold"`, `"700"`, `"800"`, a family ending in `Bold`, not `"Segoe UI Semibold"`; required ratio 3 at 18 pt, at 14 pt bold, 4.5 at 17.9 pt, at 14 pt not bold, undefined with no size.

Measuring (`colour-measure.test.ts`), each over a hand-made report through `buildReport`:
- `measures a title against the visual's background`, with both sources.
- `skips a hidden element and a hidden visual, and counts neither`.
- `measures each state the file sets, and not a disabled one`: hover and selected entries give their own measured pairs; a `disabled` entry gives nothing, and is not counted as skipped.
- `measures each field's setting as its own instance`: two `columnFormatting` entries with metadata selectors.
- `skips by reason`: an image on the page, the visual, or the wallpaper gives `image`; a transparent visual overlapping a lower visual gives `overlap`, an opaque one is measured, and a group's own box does not count; a data label inside a bar gives `on-data`, outside or on its own opaque background is measured; a ratio from 3 to 4.5 with no size gives `size-unknown`, under 3 is measured; an element whose default is not known gives `default-not-known`.
- `places a grouped visual on the page through its groups before testing overlap`: a visual at (10, 10) in a group at (500, 500) does not overlap a visual at (10, 10) on the page.
- `blends a text colour with alpha over its background first`.
- `measures a text box's runs one by one, and not an empty run`.

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run packages/core/test/colour-size.test.ts packages/core/test/colour-measure.test.ts`
Expected: FAIL, no such modules.

- [ ] **Step 3: Implement**

Overlap is box geometry: a visual's box after adding each parent group's x and y; another visual on the page with a lower z, not a group container, not hidden, whose box intersects with positive area. The label positions that put a data label on the data come from the schema's `labelPosition` enum for each chart type (inside end, inside centre, inside base, and the pie and donut inside value); the builder lists them with the schema path in a comment.

- [ ] **Step 4: Run, then commit**

Run: `npx vitest run packages/core/test/colour-size.test.ts packages/core/test/colour-measure.test.ts`
Expected: PASS.
`git commit -m "feat(core): measure a report's text against its background"`

### Task 4: The suggested colour

**Files:**
- Create: `packages/core/src/colour/suggest.ts`
- Test: `packages/core/test/colour-suggest.test.ts`

**Interfaces:**
- Produces: `suggest(foreground: Rgba, background: Rgba, required: number): { colour: Rgba; ratio: number }`

- [ ] **Step 1: Write the failing tests**

- `keeps the hue and moves lightness the shortest way`: `#A19F9D` on `#FFFFFF` at 4.5 gives a darker grey whose ratio is at least 4.5 and whose OKLCH hue is within 2 degrees.
- `always passes after rounding to hex`: over 2,000 random pairs (a seeded generator), the suggestion's ratio from its hex is at least the threshold.
- `goes the other way when one direction cannot reach it`: light text on a mid background goes to white side or black side, whichever reaches it.

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run packages/core/test/colour-suggest.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement**

OKLCH conversion from Björn Ottosson's published OKLab matrices (cite in a comment); binary search on L in the nearer direction, then the other; clamp chroma to sRGB by reducing it until in gamut; round to hex and re-check, stepping one more unit if rounding fell short.

- [ ] **Step 4: Run, then commit**

Expected: PASS. `git commit -m "feat(core): suggest a colour that passes"`

### Task 5: The rule, its messages, and its findings

**Files:**
- Create: `packages/core/src/rules/pbiplint/contrast.ts`
- Modify: `packages/core/src/rules/pbiplint/index.ts` (after `tabOrderRules`), `packages/core/src/messages/en.ts`
- Test: `packages/core/test/rules/contrast.test.ts`

**Interfaces:**
- Consumes: `measureReport`, `suggest`, `reportFinding.visual`, `reportFinding.report`.
- Produces: `LOW_TEXT_CONTRAST`; message ids `LOW_TEXT_CONTRAST` (on a visual), `LOW_TEXT_CONTRAST.theme`, `LOW_TEXT_CONTRAST.sameColour`.

Parameters, as section 8 lists them: `element` (a select over ElementKind with `other`), `state`, `field`, `foreground`, `background`, `ratio`, `required`, `fontSize`, `bold`, `foregroundSource`, `backgroundSource`, `suggested`, `suggestedRatio`, `others`, and on a theme finding `visuals` and `elements`. English for the visual message: `{element} {foreground} on {background} is {ratio}:1, and {fontSize} pt text needs {required}:1. {suggested} would be {suggestedRatio}:1.` (with a size-unknown variant through a select).

- [ ] **Step 1: Write the failing tests**

- `reports a title below 4.5:1 once, naming the worst state and counting the others`.
- `does not report 4.5:1 or above, or 3:1 for large text`: 4.499 is reported, 4.5 is not.
- `points at the text colour's line, else the background's, else line 1`.
- `reports a failing theme setting once, on the theme, at its line`: the base's `foregroundNeutralSecondary` failing on twenty visuals gives one finding with `visuals: 20` and the element kinds, and no visual findings for those pairs; a visual that sets its own background still gets its own.
- `says the same colour below 1.1:1 in its own words`.
- `carries messageId and params in JSON and SARIF` (through `lint` and the formatters).

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run packages/core/test/rules/contrast.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement the rule**

Group measured pairs below the threshold by (visual, element); a pair whose two colours both come from theme files goes to its theme setting's group instead (key: file and pointer of the text colour). The theme finding is a `Report` finding located at the setting's line in the theme file; confirm `reportFinding.report` takes a file other than report.json, or add `reportFinding.theme(theme, pointer, detail)` beside it.

- [ ] **Step 4: Run, then commit**

Run: `npx vitest run packages/core`
Expected: PASS apart from the counts Task 7 moves.
`git commit -m "feat(core): the LOW_TEXT_CONTRAST rule"`

### Task 6: The rule page and ENSURE_THEME_COLOURS

**Files:**
- Create: `rules/low-text-contrast.md`
- Modify: `rules/ensure-theme-colours.md`; regenerated data files from `node scripts/sync-rule-pages.mjs`
- Test: `packages/core/test/rule-pages.test.ts` (existing)

- [ ] **Step 1: Write the page**

Sections as `rule-pages.test.ts` requires: What it checks (every element, where its colour comes from, the defaults the Desktop checks confirmed; that hidden and tooltip pages are measured, since readers reach them through drillthrough, navigation, and tooltips, while hidden visuals and hidden elements are not), Example (`pbir fires` and `pbir fixed` with fully explicit colours, since the test's stock report names a base theme with no file), Why it matters, How to fix it (Format pane, a custom theme, or the property in `visual.json`; for a base theme's colour, override it in a custom theme; for text hidden on purpose, hide the visual or turn the text off), When to ignore it, Quirks (each skip reason, Actual size, Semibold, the Fluent2 one-unit difference, not a sign-off), Links (WCAG 1.4.3 and its Understanding page, Microsoft's accessibility checklist, the theme pages). How to raise it to an error for Section 508: `"rules": { "LOW_TEXT_CONTRAST": "error" }`. No claim of passing WCAG.

- [ ] **Step 2: Link the two pages both ways**, so `ENSURE_THEME_COLOURS`'s sentence on contrast agrees with this rule.

- [ ] **Step 3: Sync and test**

Run: `node scripts/sync-rule-pages.mjs && npx vitest run packages/core/test/rule-pages.test.ts`
Expected: PASS.

- [ ] **Step 4: Commit**

`git commit -m "docs: the LOW_TEXT_CONTRAST rule page"`

### Task 7: The fixture, the sample, and every count

**Files:**
- Create: `tests/fixtures/contrast-zoo/` (hand-written base and custom themes, a page per case), `tests/expectations/contrast-zoo.report.json`
- Modify: `scripts/sanitize-fixture.mjs` and its test (keep theme JSON, still drop images and other resources), `packages/core/test/fixtures.test.ts` (the fixture's shape; the "no registered resources" test allows theme JSON only)
- Modify: `examples/messy-sales` (one text box run, pale grey on a visual background set to white with transparency 0), and the counts that move: `web/test/sample.test.ts`, `home.test.ts`, `render.test.ts`, `export.test.ts`, `e2e/home.spec.ts`, `cli.test.ts`, `contract.test.ts`, the core README, each `tests/expectations/*.report.json` `native` map, `core/test/pack.test.ts` (123 rules, 41 built in), `web/test/generate.test.ts`, `README.md`, the CLI README
- Modify: `packages/cli/test/fixtures/one-project/` re-recorded, with a dated line in its README saying why

- [ ] **Step 1: Validate the fixture's report JSON against its `$schema`** before any test reads it.

Run: `node <validator> node_modules/ajv <cache> $(find tests/fixtures/contrast-zoo -name '*.json' -path '*definition*')`
Expected: `N files checked, 0 invalid`.

- [ ] **Step 2: Pin the fixture's findings and skips**, then the sample's one new warning, then every count, then re-record the goldens.

Run: `npm run build && npm test && npm run test:e2e`
Expected: PASS.

- [ ] **Step 3: Commit**

`git commit -m "test: the contrast fixture, the sample's plant, and the counts"`

### Task 8: Size, real reports, and the review

- [ ] **Step 1:** `npm run check:browser`. If core's own code is over 265 KB, propose a measured raise (rounded up to 5 KB with room for PR 3) to the coordinator before raising it.
- [ ] **Step 2:** Lint the local corpus's reports with themes on this branch and on PR 1's: the only new findings are `LOW_TEXT_CONTRAST`, and each one checked by hand against its files is a real pair.
- [ ] **Step 3:** One review of the whole branch, then the PR, stacked on PR 1's branch.
