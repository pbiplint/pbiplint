# Colour contrast, PR 3: what people see

**Goal:** The site shows each `LOW_TEXT_CONTRAST` finding's two colours as a labelled sample beside a sample in the suggested colour, the rule page's Example shows the same, and "Report at a glance" says how much text was measured, so a quiet run never reads as a pass.

**Architecture:** One measurement per report, shared by the rule and the new fact (a cache keyed on the `Report` object), so the two cannot disagree and a report is measured once. The sample is an `<img>` whose `src` is a `data:` SVG built in core from a finding's parameters, so the site needs no inline style and axe does not measure it. The rule page's Example builds its sample at build time from the fences' own measurement.

**Tech Stack:** TypeScript, Vitest, Playwright with axe, the site's build (`packages/web/src/build`).

**Spec:** `docs/superpowers/specs/2026-10-30-colour-contrast-design.md`, sections 9 and 11.

## Global Constraints

- The CSP has no `unsafe-inline` for styles, `check-site` rejects any `style` attribute, and every e2e test fails on a console error.
- Only hex values matching `^#[0-9A-F]{6}$` reach the SVG; anything else draws no sample.
- The sample's text is generic, never the report's own words, and its label says these are the two colours drawn by the browser, with the numbers.
- CLI text, Markdown, SARIF, and JSON stay hex and ratios only; JSON facts gain counts.
- "Visibility not known" is its own reason in the coverage line, apart from the colour reasons, so text that may not be shown never reads as unmeasured text.
- No claim that a report passes WCAG or is accessible, anywhere.
- Core stays browser-pure and under its 295 KB tripwire.
- No em dashes. No closing keyword next to an issue number in a commit or PR body.

## Review Focus

1. A finding whose params lack a colour, or carry one not in six-digit upper-case hex (an old JSON file opened on the site, say): no image, no error, the text detail alone.
2. Dark mode and Windows contrast themes: the sample keeps its own colours, and its border still shows on the dark canvas.
3. A report with no visuals, or no report layer: no "Text contrast" line, rather than "0 measured".
4. The coverage line's counts and the rule's findings on the same report: below-threshold elements equal the elements the findings cover, including theme findings.
5. The rule page builds the same in every run: the sample comes from the page's own fences, never from a lint of anything else.

---

### Task 1: One measurement per report

**Files:**
- Modify: `packages/core/src/colour/measure.ts`
- Test: `packages/core/test/colour-measure.test.ts`

**Interfaces:**
- Produces: `measureReport(report)` returns the same `Measurement` object for the same `Report` object (a `WeakMap` cache).

- [ ] **Step 1:** Test `measures a report once, and again for another report object`: two calls on one `Report` return the identical object; a second `buildReport` of the same files gives a new one.
- [ ] **Step 2:** Run `npx vitest run packages/core/test/colour-measure.test.ts`; expect FAIL.
- [ ] **Step 3:** Implement the cache.
- [ ] **Step 4:** Run it again; expect PASS. Commit `perf(core): measure a report's text once`.

### Task 2: The "Text contrast" line in Report at a glance

**Files:**
- Modify: `packages/core/src/project/facts.ts`, `packages/core/src/project/types.ts` (`Fact` gains `counts?: Readonly<Record<string, number>>`)
- Test: `packages/core/test/facts.test.ts`, the JSON contract test, and every pinned facts block the line adds to (the sample's text output, the goldens with a dated note, the site's render tests)

**Interfaces:**
- Consumes: `measureReport`.
- Produces: a `Fact` with `label: "Text contrast"`, `ruleId: "LOW_TEXT_CONTRAST"` when an element is below the threshold, and `counts` keyed `measured`, `below`, `visibilityNotKnown`, and one key per colour skip reason.

The unit is the text element of a visual (its kind and object, as a finding groups them): measured when any instance of it was measured, below when any measured instance falls short, else not measured with the first instance's reason. Line words, for example: `412 text elements measured, 9 below the threshold; 618 not measured (412 because a theme file was not read, 206 for another reason); 40 whose visibility the files do not settle`. The reasons named in words are the two commonest, the rest summed; JSON carries every reason.

- [ ] **Step 1:** Tests: the line on a report with measured, failing, skipped, and visibility-not-known elements, with exact words and counts; no line without visuals or without a report; `below` equals the elements the rule's findings cover on the same report, theme findings included; the JSON `counts`.
- [ ] **Step 2:** Run them; expect FAIL.
- [ ] **Step 3:** Implement in `reportFacts`, after the existing lines. Words for each reason live in one table beside the fact.
- [ ] **Step 4:** Update the pinned blocks; re-record the goldens as PR 2 did, with a dated README line.
- [ ] **Step 5:** `npm run build && npm test`; expect PASS. Commit `feat(core): say how much report text was measured`.

### Task 3: The colour sample in core

**Files:**
- Create: `packages/core/src/colour/sample.ts`, exported from the package index
- Test: `packages/core/test/colour-sample.test.ts`

**Interfaces:**
- Produces: `contrastSample(params: Readonly<Record<string, unknown>>): { src: string; alt: string } | undefined`

The SVG: two panels side by side, each the background colour with the sample text `Sample text 123` in its text colour, the second in the suggested colour; size from `fontSize` capped at 24 pt, bold when `bold` is `yes`; a caption under each panel in the SVG's own neutral colours: `as found, 2.63:1` and `suggested, 4.54:1`. `alt`: `Sample text drawn by the browser in #A19F9D on #FFFFFF, 2.63:1, beside the suggested #767676, 4.54:1`. A theme finding draws the same from its params. A same-colour finding draws the one panel.

- [ ] **Step 1:** Tests: the `src` is `data:image/svg+xml,` with URL-encoded SVG holding both hex values; `alt` as above; `undefined` for a missing or malformed hex (`#fff`, `red`, `#FFFFFF"><script>`); the size cap; the SVG contains no script, no external reference, and no `style` attribute.
- [ ] **Step 2:** Run them; expect FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run them; expect PASS. Commit `feat(core): a labelled colour sample for a contrast finding`.

### Task 4: The sample on the site's results

**Files:**
- Modify: `packages/web/src/results/render.ts` (the Detail cell), `packages/web/src/styles/*.css` (one class for the image: a 1-pixel border in a site token, `max-width: 100%`)
- Test: `packages/web/test/render.test.ts`, `packages/web/test/styles.test.ts` (the border's 3:1 against the dark canvas), `packages/web/e2e/home.spec.ts` (the sample's finding renders the image with no console error in all three browsers, and axe stays clean with no exclusion)

- [ ] **Step 1:** Tests: a `LOW_TEXT_CONTRAST` finding's Detail cell holds the text and one `img` with `src` from `contrastSample` and its `alt`; another rule's cell holds no image; a finding with a malformed hex holds the text alone; the image carries no `style` attribute.
- [ ] **Step 2:** Run; expect FAIL.
- [ ] **Step 3:** Implement with `h("img", { src, alt, class: "contrast-sample" })`.
- [ ] **Step 4:** `npm run build && npm test && npm run test:e2e`; expect PASS. Commit `feat(web): show a contrast finding's colours`.

### Task 5: The sample on the rule page

**Files:**
- Modify: `packages/web/src/build/pages.ts` (a hook after the Example section for `LOW_TEXT_CONTRAST`), `rules/low-text-contrast.md` (one sentence saying the sample below the example is drawn by the browser)
- Test: `packages/web/test/generate.test.ts`, `packages/web/e2e/site.spec.ts` (add the page to `PAGES`)

The hook builds the fires fence's report with `buildReport`, runs `measureReport` and the rule's check on it, and appends `contrastSample` of the first finding's params as a figure after the Example. Rule pages stay Markdown with no raw HTML.

- [ ] **Step 1:** Tests: the built page holds one `img.contrast-sample` after the Example with the fires example's colours (`#A19F9D` on `#FFFFFF`); no other rule page holds one; the build is the same twice.
- [ ] **Step 2:** Run; expect FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** `npm run build && npm test && npm run test:e2e`; expect PASS, axe clean on the page. Commit `feat(web): the colour sample on the contrast rule's page`.

### Task 6: Review and the PR

- [ ] **Step 1:** `npm run check:browser`; the tripwire holds.
- [ ] **Step 2:** One review of the whole branch, then the PR, stacked on PR 2.
