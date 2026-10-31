# A colour contrast rule for report text (#182): spec

Issue: [#182](https://github.com/pbiplint/pbiplint/issues/182), size L. Written October 30, 2026, from main at `9656dce`. **Status: for review, not yet approved.** Decisions the maintainer has made are marked **(decided)**; calls made in writing the spec are marked **(design call)**; anything marked **(builder)** is left to whoever plans and builds it.

Research behind it (October 30, 2026): a read of the codebase, a read of Microsoft's report and theme documentation and schemas, and a survey of 387 real PBIR reports in 259 public GitHub repositories (counts only; no copies kept).

## 1. Intent

pbiplint checks two accessibility basics in a report today, alt text (`ENSURE_ALTTEXT`) and tab order (`TAB_ORDER_FOLLOWS_LAYOUT`). Contrast is the next thing a team under an accessibility requirement is asked about, Section 508 among them, and nothing in pbiplint measures it. This rule measures report text against what sits behind it, with the thresholds in [WCAG 2.2, Success Criterion 1.4.3, Contrast (Minimum)](https://www.w3.org/TR/WCAG22/#contrast-minimum). Microsoft's own checklist asks for the same: "Ensure color contrast between title, axis label, and data label text and the background are at least 4.5:1" ([Design Power BI reports for accessibility, Report accessibility checklist](https://learn.microsoft.com/en-us/power-bi/create-reports/desktop-accessibility-creating-reports#all-visuals)).

**Who it is for (decided):** two readers doing the same job.

- A Power BI report author working to make their own report accessible, who runs pbiplint while building and fixes what it finds.
- An AI agent acting as a report author, doing the same through the CLI, `pbiplint mcp`, or the JSON output.

Both need a finding that says exactly which text, which two colours, how far off it is, where the colour came from, and what would pass. The agent needs all of that as data, not English.

## 2. Goals, non-goals, anti-goals

**Goals**

- Measure every text element in the scope list (section 6) whose colours can be known from the project's files, the way Power BI Desktop resolves them.
- Say what each failing element needs: both colours, the ratio, the threshold, where each colour came from, and a suggested colour that passes.
- Say how much was measured, so nobody reads a quiet run as a pass (section 9).

**Non-goals (this release)**

- Non-text contrast ([Success Criterion 1.4.11](https://www.w3.org/TR/WCAG22/#non-text-contrast), 3:1 for chart marks, icons, and controls). Recorded on the issue as a second step, decided after this ships. `visualHeader.foreground` (1,952 settings in the survey) and button outlines belong there.
- Tooltip text (`visualTooltip`, `visualHeaderTooltip`), which shows only on hover and mostly sits on backgrounds the files do not set (631 unset in the survey). Later, with non-text contrast.
- Custom visuals, whose formatting objects are their own.
- Fixing anything. pbiplint reports; the author or agent changes the colour.

**Anti-goals: it fails even if it works when it**

- **Claims a pass.** No output, page, or message ever says or implies a report "passes WCAG" or "is accessible". A run with no findings means "nothing measured fell below the threshold", and section 9's coverage line says how much was measured. The rule page says what the rule cannot see.
- **Guesses.** A pair the files do not settle is skipped and counted, never reported on an assumed colour. Wrong findings cost more trust than missing ones.
- **Floods.** One finding per text element per visual; a default that fails across the theme is reported once, on the theme (section 8).
- **Reaches outside the project, or past what it needs.** No network, no rendering, no Power BI. In `StaticResources` it opens only the JSON files in the three theme folders and uses only the themes the report names (section 4), never an image.
- **Ships Microsoft's theme files.** pbiplint reads them from the user's project. Tests use hand-written themes (section 12).

## 3. The rule

- **Id:** `LOW_TEXT_CONTRAST` **(design call)**. Name: "Text with too little contrast" **(design call)**. British "colour" in prose and message text, as `ENSURE_THEME_COLOURS` has.
- **Category:** Accessibility, beside the two rules above. **Layer:** report. **Scope:** Visual. **Status:** builtin, defined with `pbiplintRule` (`packages/core/src/rules/pbiplint/define.ts`), modelled on `TAB_ORDER_FOLLOWS_LAYOUT` (`rules/pbiplint/tab-order.ts`).
- **Severity: warning (decided),** as the other two accessibility rules are. In pbiplint an error means something is broken, and errors fail a build by default. The rule page tells a team that must meet Section 508 how to raise it to an error in `pbiplint.config.json` (`"rules": { "LOW_TEXT_CONTRAST": "error" }`) and gate on it.
- **Message ids from the start** (the reason it follows #98): see section 8.

## 4. What it reads, and the copy that changes

pbiplint reads no theme today. The CLI walk (`packages/cli/src/walk.ts:62`, `SKIP_DIRS`), the site's file filter (`packages/web/src/input/read-drop.ts:12-41`, `pick-folder.ts`), and core routing (`packages/core/src/project/route.ts:15-18`) each keep `StaticResources` out, tests pin that (`walk.test.ts:93-119, 241`; `core/test/route.test.ts:28`; `fixtures.test.ts:36-37`), and `report.json`'s theme is kept only as a name (`pbir/build.ts:142-145`).

**What changes:**

- **Read the theme JSON files, by path (design call).** Each reader (the CLI walk, and the site's drop, folder picker, and `webkitdirectory` fallback, which all go through `wanted(path)`) also opens the `.json` files directly in `<name>.Report/StaticResources/SharedResources/BaseThemes/`, `.../SharedResources/BuiltInThemes/`, and `.../StaticResources/RegisteredResources/`: those folders only, not their subfolders, and nothing else in `StaticResources`, never an image. This keeps every reader deciding by path alone, as today, rather than reading `report.json` first. Core then uses only the files that `report.json`'s `themeCollection` names (`baseTheme`, `customTheme`), matched through `resourcePackages` items **by name, not by item type** (Microsoft's own Revenue Opportunities sample registers its custom theme as item type `Image`). An item's `path` is relative to `StaticResources/<package name>/`; one that leaves that folder is not used.
- **A size cap on these files (design call).** `RegisteredResources` may also hold other JSON (a custom shape map's TopoJSON, for example; not confirmed), and the 0.3.0 read limits cap nesting, not size. A file in those folders larger than a cap well above any theme (the largest theme in the survey sets the scale; **builder** picks the number) is not read, and a theme `report.json` names that was over the cap is skipped and counted as "theme file not read" (section 9). The CLI checks the size before reading; the site checks `File.size`.
- **The usual limits apply too:** the 0.3.0 read limits, no symbolic links followed, and the browser walk's depth cap.
- **A theme file that is named but absent** (3 of 387 survey reports; every pbiplint fixture and the bundled sample, since `scripts/sanitize-fixture.mjs` strips the folder) is not an error. Desktop appears to fall back to its own copy of a base theme **(inferred: Microsoft's Revenue Opportunities sample names a base theme file it does not contain)**; pbiplint has none, so anything that depends on that file is skipped and counted (section 9). **(design call: no bundled copy of Microsoft's themes; see section 2)**
- **A theme file that does not parse** gets a `PARSE_ISSUE` finding, like any report JSON **(design call)**.
- **The Promise is unchanged.** Item 2 says pbiplint "reads only the files that describe your model and report" ([the Promise](https://pbiplint.com/privacy/#the-promise)); a theme file describes the report.
- **The CLI page changes.** `packages/web/content/cli.md:202` says the CLI never enters "a report's `StaticResources` and `CustomVisuals` folders". It becomes, in substance: in a report's `StaticResources` it opens only the JSON files in the three theme folders above, up to the size cap, and uses only the themes `report.json` names; it never enters `CustomVisuals`. The words say exactly what the readers do. Grep `content/`, the READMEs, the skill, and `docs/` for any other sentence that says `StaticResources` is never read, and correct each.

## 5. How a colour is resolved

The rule works out each colour as Power BI Desktop paints it, property by property. Where Microsoft documents a step, it is cited; where it is inferred from real files, it is marked, and section 10's Desktop check confirms it before release.

### 5.1 Precedence

From most specific to least, the first that sets the property wins **(the order between theme layers is documented; the order inside one theme is inferred)**:

1. **The visual's own setting** in `visual.json`: `visual.visualContainerObjects` for title, subtitle, and background; `visual.objects` for everything else. "When you format a visual directly using the formatting pane, your customizations take precedence over the base theme or custom theme" ([Visual defaults, Reset formatting](https://learn.microsoft.com/en-us/power-bi/create-reports/power-bi-reports-visual-defaults#reset-formatting)). A style preset (`visualContainerObjects.stylePreset`) selects the theme's named preset below.
2. **The custom theme,** then **3. the base theme.** "The custom theme layers on top of the base theme" and, for anything not defined in it, "the base theme style" applies ([Use report themes, Understand how the report uses themes](https://learn.microsoft.com/en-us/power-bi/create-reports/desktop-report-themes#understand-how-the-report-uses-themes)). Within one theme **(inferred)**: `visualStyles[visualType][preset]` over `visualStyles[visualType]["*"]` over `visualStyles["*"]["*"]`, a named card over the `*` card, and all of those over `textClasses` and the structural colours.
4. **Text classes and structural colours.** Microsoft's [custom theme page](https://learn.microsoft.com/en-us/power-bi/create-reports/report-themes-create-custom) maps each to the elements it colours (`foreground`: text box default, table and matrix values and totals, card data labels, slicer header; `foregroundNeutralSecondary`: labels, legend, axis labels, table and matrix headers, slicer items, button text; `background`: button fill, label background). The page gives two answers for card category labels (`foregroundNeutralTertiary` in one table, `largeLightLabel` #605E5C in another); the Desktop check settles it.
5. **Nothing sets it:** unknown, so the element is skipped.

`show` resolves through the same cascade. A hidden element (`show: false`), a hidden visual (`isHidden`), and an element whose visual has no such part are not measured.

### 5.2 How a colour is written

- **Literal:** `{"solid":{"color":{"expr":{"Literal":{"Value":"'#1F4E79'"}}}}}`, a quoted hex string. 40% of the survey's text colours.
- **Theme colour reference:** `ThemeDataColor {ColorId, Percent}`. 57% of text colours, so theme resolution is not optional. **ColorId (inferred from 13,205 survey uses):** 0 is the theme's `background`, 1 its `foreground`, n of 2 or more is `dataColors[n - 2]`.
- **Percent** (−1 to 1) shades the colour, and Microsoft documents no formula. Two candidates: a straight blend toward white for a positive value and black for a negative one (Microsoft's custom visual helper, [`shadeColor` in powerbi-visuals-utils-colorutils](https://github.com/microsoft/powerbi-visuals-utils-colorutils/blob/main/src/colorUtils.ts)), or an HSV shade. **Until the Desktop check picks one, a colour with a Percent other than 0 is unknown** (28% of theme references in the survey). If neither matches Desktop, that stays the rule.
- **In theme files:** 3, 6, or 8-digit hex, and named theme colours (`foreground`, `background`, `backgroundLight`, `foregroundNeutralSecondary` and the rest of the schema's `colorOrThemeColor` list, as Fluent2 writes `{"solid":{"color":"foregroundNeutralSecondary"}}`), resolved through the custom then the base theme.
- **Text box runs:** `objects.general[].properties.paragraphs[].textRuns[].textStyle.color` is a plain string, not an expression. A run with no colour takes the theme's text box default (`foreground`).
- **Data-dependent, so skipped:** any colour that is not a literal or a theme reference: `FillRule`, `Conditional`, `Measure`, `Aggregation` (830 text colours in the survey). "Conditional formatting overrides any custom background or font color you apply to the cell" ([Apply conditional table formatting](https://learn.microsoft.com/en-us/power-bi/create-reports/desktop-conditional-table-formatting#apply-conditional-formatting-in-power-bi)), so a cell whose background is conditional is skipped too.

### 5.3 The background stack

Text sits on a stack, painted back to front:

1. **Wallpaper** (`page.json` `objects.outspace`, or the theme's `visualStyles.page["*"].outspace`).
2. **Page background** (`objects.background` colour and `transparency`). The CY base themes set the page to transparency 100 over a white wallpaper; Fluent2 sets #FAFAFA at transparency 14 over #E6E6E6.
3. **Visual group backgrounds,** outermost group first, for a visual inside one or more groups: a group container's `visualGroup.objects.background` (colour and transparency; the visualContainer schema from 2.4.0), resolved like a visual's (**design call**). A group's box is a layer of the stack, not "a visual behind it" for the overlap test in 5.4. The survey has 2,211 group containers.
4. **Visual background** (`visualContainerObjects.background` `show`, `color`, `transparency`; the base themes set `show: true, transparency: 0` with no colour, so the default colour is the theme's `background` **(inferred)**; Fluent2 turns it off for text boxes and slicers).
5. **The element's own background,** where it has one: `title.background`, a data label background (`labels.enableBackground`, `backgroundColor`, `backgroundTransparency`), table and matrix `backColor`, `backColorPrimary` and `backColorSecondary` for banded rows (each band measured), slicer `items.background` and `header.background`, button `fill.fillColor`, card `fillCustom.fillColor` and `layout.backgroundFillColor`. An 8-digit hex with alpha 00 (Fluent2's `#FFFFFF00` table cells) is transparent.

Layers combine by source-over blending, alpha = 1 − transparency / 100, the formula of Microsoft's `channelBlend` helper in the same colorutils file **(inferred; Microsoft documents no formula)**. Learn also says "When you apply transparency to the page, the visuals in your report also have the transparency applied" ([Use visual elements, Using wallpaper](https://learn.microsoft.com/en-us/power-bi/create-reports/desktop-visual-elements-for-reports#using-wallpaper-in-power-bi-reports)); the Desktop check settles whether that changes a visual's own background, and the builder implements what Desktop shows.

### 5.4 What it cannot see, so skips

Each is skipped, counted by reason (section 9), and named in the rule page's Quirks section:

- **A colour that depends on the data** (section 5.2).
- **An image anywhere in the stack:** a page or wallpaper image (26% of survey pages have a page image), or a visual background image.
- **Something else behind it.** When the text's stack is not opaque by the visual's own layers (and its groups') and its box overlaps a visual with a lower z on the same page, a group's own box not counted (48% of survey visuals overlap one; 7,957 text-bearing visuals sit over a shape or an image), the rule cannot tell what shows through. Overlap is box geometry from `position`; an opaque visual is measured whatever lies under it.
- **Data labels drawn on the data.** Labels whose position puts them inside a bar, column, slice, or area sit on the data colour; they are measured only when outside, or when their own label background is on and opaque. **(builder: the position values per visual type, from the schemas)**
- **A theme file that is named but absent, or over the size cap,** for whatever depends on it.
- **A Percent other than 0,** until section 10 calibrates it.
- **A disabled state** (`$id`/selector `disabled`). WCAG's Incidental exception covers it: "Text or images of text that are part of an inactive user interface component ... have no contrast requirement" ([Success Criterion 1.4.3](https://www.w3.org/TR/WCAG22/#contrast-minimum)). So it is not measured and not counted as skipped.

Other states the files set (`default`, `interaction:hover`, `interaction:press`, `selection:selected`; about 1,600 settings in the survey) are each measured, since a reader sees them **(design call)**.

## 6. The text elements measured

The issue's list, plus button and shape text **(design call: the most common text setting in the survey, `text.fontColor` 3,986 times on the most common visual type, `actionButton` 5,057 visuals)**. Property names below are those Power BI writes, confirmed in survey files unless marked "schema only"; the builder confirms each against the schemas (`visualContainer` 2.x, `formattingObjectDefinitions`, and the theme schema `reportThemeSchema-2.159.json` in [microsoft/powerbi-desktop-samples](https://github.com/microsoft/powerbi-desktop-samples/tree/main/Report%20Theme%20JSON%20Schema)) and lists in the rule page's What it checks every element and its source.

| Element | Text colour | Size and bold | Its own background |
|---|---|---|---|
| Visual title, subtitle | `title.fontColor`, `subTitle.fontColor` (container) | `fontSize`, `bold` | `title.background` |
| Data labels | `labels.color` | `labels.fontSize`, `bold` | label background, when on |
| Axis labels and titles | `categoryAxis`/`valueAxis` `labelColor`, `titleColor` | `fontSize`, `titleFontSize`, `bold`, `titleBold` | none |
| Legend | `legend.labelColor` | `legend.fontSize`, `bold` | none |
| Classic card | `labels.color` (value), `categoryLabels.color` | `fontSize` | none |
| Card (`cardVisual`) | `value.fontColor`, `label.fontColor`, `referenceLabelTitle.titleFontColor`, `referenceLabelValue.valueFontColor`, `referenceLabelDetail.detailFontColor` | `fontSize` | `fillCustom.fillColor`, `layout.backgroundFillColor`, `referenceLabel.backgroundColor` |
| Multi-row card (schema only) | `dataLabels.color`, `categoryLabels.color`, `cardTitle.color` | `fontSize` | `card.cardBackground` |
| KPI (schema only) | `indicator.fontColor`, `goals.goalFontColor`, `goals.distanceFontColor`, `lastDate.lastDateFontColor` | `fontSize` | none |
| Table and matrix | `columnHeaders`, `rowHeaders`, `values` (`fontColor`, `fontColorPrimary`, `fontColorSecondary`), `total`, `subTotals`, `rowTotal`, `columnTotal`, `columnFormatting` (per field) `fontColor` | `fontSize` | `backColor`, `backColorPrimary`, `backColorSecondary` |
| Slicer | `header.fontColor`, `items.fontColor` | `textSize` (not `fontSize`) | `header.background`, `items.background` |
| Button slicer (`advancedSlicerVisual`) | `value.fontColor`, `label.fontColor` | `fontSize` | the button's fill |
| Text box | each run's `textStyle.color` | `textStyle.fontSize` (`pt` or `px`), `fontWeight` | none |
| Button and shape text | `text.fontColor` | `text.fontSize`, `bold` | `fill.fillColor` with its transparency |

A setting with a `metadata` selector (one field) or a `data` selector is its own instance of the element; all instances of one element on one visual make one finding (section 8).

### Size and the threshold

- **4.5:1, or 3:1 for large text:** at least 18 point, or 14 point and bold ([WCAG 2.2, large scale](https://www.w3.org/TR/WCAG22/#dfn-large-scale)). Power BI sizes are points (`"12D"` in `visual.json`, `"28pt"` in a text box, a number in a theme) and are compared as written, at Actual size; a `px` run converts at 0.75 pt per px.
- **Bold:** `bold: true`, `fontWeight` `bold` or 700 and up, or a font family whose name ends in Bold. Semibold is not bold **(design call: the stricter reading; it matters only for Semibold text from 14 to under 18 points)**.
- **Size unknown after the cascade:** a ratio under 3:1 fails either way and is reported; one from 3:1 up to 4.5:1 cannot be judged and is skipped as "size unknown".
- **No rounding:** "When comparing the computed contrast ratio to the Success Criterion ratio, the computed values should not be rounded (e.g., 4.499:1 would not meet the 4.5:1 threshold)" ([Understanding 1.4.3, Intent](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html#intent)). Shown ratios are truncated to two decimals, so a shown 4.50 always passes.
- **Formula:** WCAG's relative luminance and contrast ratio ([definitions](https://www.w3.org/TR/WCAG22/#dfn-relative-luminance)). There is no colour code in core today; this is a new browser-pure module (`packages/core/src/colour/` or similar, **builder**). `packages/web/test/styles.test.ts`'s private `contrast()` may switch to it later.

## 7. The suggested colour

Each finding carries one colour that passes **(design call)**: the text colour's own hue, lightness moved the shortest way that reaches the threshold (in OKLCH, so the hue holds), rounded to hex and checked again after rounding. Black or white always reaches 4.5:1 against any background, so one direction always works. The suggestion changes the text, not the background, since the background usually serves the whole visual or page. When the text colour came from a theme reference, the How to fix section says to change it in a custom theme or on the visual, and the suggested hex serves either.

## 8. Findings

**Granularity (design call):** one finding per text element per visual (the title, the data labels, the column headers), because each is one setting the author or agent changes. When several instances or states of that element fail (two fields' `columnFormatting`, the hover and selected states), the finding names the worst and counts the rest.

**Where it points:**

- **On the visual** when any colour in the failing pair comes from `visual.json`, a group, or the page. Location: `visual.json`, at the line of the text colour property if the visual sets it, else of the background property it sets, else the visual's first line. Located with `lineOfPointer` (`pbir/json.ts:272`) through the `reportFinding` helpers.
- **On the theme, once per setting (design call),** when both colours come from the theme files: the theme's default fails wherever it is used, and the fix is one change to the theme. The key is **the theme setting that supplies the failing text colour** (its file and JSON pointer), not the element or the visual type: one line such as `foregroundNeutralSecondary` colours axis labels, legends, table headers, slicer items, and button text on every visual type, and it gets one finding. That finding is located at the setting's line (the base theme's line when it comes from there), names the worst pair it fails in, and counts the visuals and lists the element kinds where it fails. It is raised only when at least one visible visual uses the setting and fails. There is no `Theme` object type (`rules/types.ts:39-64`); the finding is a `Report` finding naming the theme file **(builder: confirm that is enough; a new object type ripples through `layerOf`, scopes, and the pages)**. A base theme is Microsoft's file and the user cannot edit it, so its How to fix says to override the colour in a custom theme.
- **Text the same colour as its background:** below 1.1:1, it reads as deliberate hiding (the survey found 45 cases under 1.1:1, and each one it opened was a hidden button or header). Still a finding **(design call)**, with its own message: a screen reader still reads it and a hidden button still takes the tab key, so the fix is to hide the visual or turn the text off, which the page says. The page's When to ignore it covers a deliberate case.

**Message id and parameters.** Templates in `packages/core/src/messages/en.ts`, called with `msg(id, params)`; three variants **(builder: the names)**: on a visual, on a theme, and the same-colour case. Parameters, all as strings or numbers rounded before passing (`format.ts:206` writes `String(n)`):

- `element` (a select over the section 6 names, with `other`), `state` (when not the default), `field` (for a per-field setting)
- `foreground`, `background` (6-digit hex, after blending), `ratio` (two decimals, truncated), `required` (`4.5` or `3`), `fontSize`, `bold`
- `foregroundSource`, `backgroundSource`: `visual`, `group`, `page`, `customTheme`, `baseTheme`
- `suggested`, `suggestedRatio`
- `others` (how many more instances or states fail), and on a theme finding `visuals` (how many visuals it fails on) and `elements` (a list of the element kinds)

An English detail, for example: `Title #A19F9D on #FFFFFF is 2.57:1, and 12 pt text needs 4.5:1. #767676 would be 4.54:1.` **(builder: wording, through the catalog)**

## 9. Saying how much was measured

A quiet run must not read as a pass (the sign-off anti-goal), and the survey says the files settle only part of a report's text: by its strict count 15.5% of the text colours reports set themselves, 41% with themes, blending, and defaults resolved. So the "Report at a glance" block (`packages/core/src/project/facts.ts`) gains a line **(design call)**:

```
  Text contrast    412 text elements measured, 9 below the threshold; 618 not measured   LOW_TEXT_CONTRAST
```

and the JSON `facts` gain the counts, with the skipped ones by reason (section 5.4). The rule page explains each reason. **(builder: the line's exact words; share the measuring between the rule and the fact so they cannot disagree.)**

## 10. The Desktop check

Several steps above are inferred from files, not documented. Before release, a manual check in Power BI Desktop on Windows confirms them **(design call)**. Nothing from it is published.

- **The report:** a hand-made PBIP kept outside the repo, with large bold sample text (so the text's own pixels are solid) for each case: `ThemeDataColor` ColorId 0, 1, 2, and 3 at Percent 0, ±0.2, ±0.6; named theme colours in a custom theme; a custom theme over a base theme; a visual at transparency 50 over a coloured page; the Fluent2 page (transparency 14 over its wallpaper) with a visual on it; a classic card's category label with no colour set; a text box run with no colour; table header and slicer item defaults; white text in a visual with a transparent background inside a group with a dark fill, and the same group at transparency 50.
- **The check:** the project is opened at Actual size, screenshots are saved, and the pixel colours are read from them.
- **It settles:** the ColorId mapping, the Percent formula (or leaves Percent other than 0 skipped), whether page transparency changes a visual's own background, how a group's background layers, the card category label contradiction, and that the resolver gets the same hex as Desktop for every case. Each result is recorded in this spec and pinned in a test.
- **When:** as soon as the resolver exists (after the first PR), so the rule is built on confirmed steps.

## 11. Output, the site, and the rule page

**CLI text, Markdown, SARIF, JSON:** the English detail with hex values and ratios; JSON and SARIF properties carry `messageId` and `params` as every finding does since 0.3.2. No colour codes (and #256's terminal colouring, next on the roadmap, uses the terminal's palette, not the report's).

**The colour sample on the site's results (decided).** Each `LOW_TEXT_CONTRAST` finding's Detail cell (`packages/web/src/results/render.ts:626`, keyed on `f.messageId`, reading `f.params`) shows:

- sample text (generic, not the report's own words, so it claims nothing about how the visual looks **(design call: a preview that differs from Power BI would cost trust)**) in the finding's two colours, at its size and weight (capped at a size that fits the cell, **builder**);
- beside it, the same sample in the suggested colour;
- a label that says these are the two colours drawn by the browser, with the numbers.

Constraints the build already has:

- The CSP has no `unsafe-inline` for styles (`packages/web/src/build/csp.ts`), `check-site` rejects any `style` attribute (`check-site.ts:160-164`), and every e2e test fails on a console error.
- The site's axe scan (`packages/web/e2e/site.spec.ts`) runs `color-contrast`, and the sample is low contrast on purpose.
- So **(design call, builder to confirm in all three browsers):** draw the sample as an `<img>` whose `src` is a `data:` SVG (`img-src` allows `data:`) and whose `alt` gives the numbers. Axe does not measure an image, no inline style is needed, and a Windows contrast theme does not repaint it. Only hex values that match `^#[0-9A-F]{6}$` reach the SVG, since `h()` promises its attributes never carry model text.
- A 1-pixel border in a site token keeps the sample's edge visible on the dark canvas (3:1, pinned in `styles.test.ts`).

**The rule page:** no screenshots (decided). Its Example section shows the same labelled sample, built from the fires and fixed examples' findings by a new hook in `packages/web/src/build/pages.ts` (rule pages are Markdown that also feeds the CLI and SARIF help, so no raw HTML in `rules/*.md`) **(design call)**. This is the only new element on the site from this work.

**The page itself** follows `rules/*.md` and `core/test/rule-pages.test.ts`: What it checks (every element and where its colour comes from), Example (`pbir fires` and `pbir fixed` fences; fully explicit colours, since the stock report in the test has a base theme name and no file), Why it matters, How to fix it (in Desktop's Format pane, in a custom theme, or by editing the property in `visual.json`, which Desktop keeps), When to ignore it, Quirks (each section 5.4 reason, the inferred steps, Actual size, the Semibold call), and Links (WCAG 1.4.3 and its Understanding page, Microsoft's accessibility checklist, the theme pages). `ENSURE_THEME_COLOURS`'s page mentions contrast; the two pages agree and link each other.

## 12. Tests and fixtures

- **Hand-written themes only.** Microsoft's base theme files are not committed **(design call)**. A new fixture (for example `contrast-zoo`) carries a hand-written base and custom theme under `StaticResources` and a page per case in sections 5 and 6, with each finding pinned. `fixtures.test.ts:36-37` and `scripts/sanitize-fixture.mjs` change to allow theme JSON in fixtures (still no images, still no Microsoft theme files).
- **Unit tests** for the colour module (parsing every form in 5.2, luminance, ratio against WCAG's own examples, truncation, blending, the suggestion always passing), the cascade, each skip reason, and the finding's location.
- **The sample.** `examples/messy-sales` has no theme file, so its plant is fully explicit: a text box run in a pale grey on a visual background set to white. A text box, because `ENSURE_THEME_COLOURS` skips text boxes, so the fab-inspector expectations need no re-capture. Its counts move by one warning; every pinned count moves with it (`web/test/sample.test.ts`, `home.test.ts`, `render.test.ts`, `export.test.ts`, `e2e/home.spec.ts`, `cli.test.ts`, `contract.test.ts:244`, core README), and each `tests/expectations/*.report.json` `native` map lists what the rule finds there (`report-parity.test.ts`).
- **Rule counts** (122 rules, 40 built in) move to 123 and 41: `core/test/pack.test.ts:26`, `web/test/generate.test.ts`, `README.md`, the core and CLI READMEs.
- **The one-project goldens** (`packages/cli/test/fixtures/one-project/`, #237) pin 0.3.0's output byte for byte; a new rule changes `rulesRun` and the sample's findings. Their README's "never re-record" was for the `v3/multi-project` branch; re-record them with a dated note saying why **(design call)**.
- **The site:** the sample image renders in the three browsers with no console error, axe stays clean with no exclusion, `check-site` passes, and the e2e scan covers the new rule page (add it to `PAGES` in `site.spec.ts`).
- **Copy:** the `cli.md` change (section 4) and any other `StaticResources` sentence.

## 13. The pull request split

Three pull requests, in order, each with its tests and pages **(design call; builder may adjust)**:

1. **Themes read, and the colour module.** CLI walk, site input, and core routing read the theme files (section 4); `Report` gains its resolved themes; the colour module (parsing, luminance, ratio, blending, theme references and named colours, the cascade). No new finding, no count moves. The `cli.md` copy. Then the Desktop check (section 10).
2. **The rule.** Elements, skips, findings, messages, the suggested colour, the rule page with its sample hook left for PR 3, the `ENSURE_THEME_COLOURS` page, the fixture, the sample plant, every count, the goldens.
3. **What people see.** The colour sample in the site's results and on the rule page, and the "Report at a glance" coverage line.

Release after PR 3 and the Desktop check, as one release with a release issue (the version is decided then).

## 14. Left to the builder

- The property-by-property mapping from each element to its theme default (text class, structural colour, or `visualStyles` card), from Microsoft's theme pages and schema, and confirmed by the Desktop check where Learn is unclear.
- Data label position values per visual type that put a label on the data.
- Message variant names, parameter names, and English wording, through the catalog.
- Where the colour module lives in core, keeping core browser-pure and under its bundle tripwire (`core/scripts/check-browser-bundle.mjs`, which may be raised in measured steps).
- The exact geometry test for overlap.

## Constraints carried

- Core stays browser-pure: no `node:` imports, no `fetch`, no telemetry.
- Rule pages are pbiplint's own words; every How to fix gives a route that needs no third-party tool.
- Smallest change that meets the boxes; tests first; a review of the whole branch before each pull request.
- Microsoft's colorutils formulas (`shadeColor`, `channelBlend`) are reused as formulas; if any of its code is ported, it is credited in `NOTICE` (MIT).
- No closing keyword next to an issue number in any commit or PR body.
- No em dashes anywhere. Long-form dates in prose.
