# Colour contrast, PR 1: themes read, and the colour module

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every reader opens a report's theme JSON, `Report` carries the themes `report.json` names, and a browser-pure module works out a colour and a background stack as Power BI Desktop paints them. No new finding and no count moves on a project without theme files.

**Architecture:** The readers decide by path alone (`isThemeFile`), as they do today. `buildReport` holds theme files back from its ordinary JSON pass, parses only the ones `report.json` names, and records each on `report.themes`. The colour module has three files: pure maths (`colour.ts`), reading one written colour (`read.ts`), and the cascade and background stack (`cascade.ts`). No rule calls it yet, so it stays out of the bundle until PR 2.

**Tech Stack:** TypeScript, Vitest, the CLI's `node:fs` walk, the site's three browser read routes.

**Spec:** `docs/superpowers/specs/2026-10-30-colour-contrast-design.md`, sections 4, 5, and 13.

## Global Constraints

- Core stays browser-pure: no `node:` imports, no `fetch`, no telemetry.
- In `StaticResources`, readers open only `.json` files directly in `SharedResources/BaseThemes/`, `SharedResources/BuiltInThemes/`, and `RegisteredResources/`: not subfolders, never an image.
- Only the themes `report.json`'s `themeCollection` names are used, matched through `resourcePackages` items by name, never by item type. A path that leaves `StaticResources/<package name>/` is not used.
- A named theme that is absent, or over the size cap, is not an error. A named theme that does not parse is a `PARSE_ISSUE`. A theme nobody names is never parsed.
- A pair the files do not settle is unknown, never assumed. Nothing below an unread theme layer is used, since the unread layer might have overridden it.
- A Percent other than 0 is unknown until the Desktop check calibrates it.
- Microsoft's theme files are never committed; tests use hand-written themes.
- WCAG's formula, with no rounding of a computed ratio; shown ratios are truncated to two decimals.
- No em dashes. No closing keyword next to an issue number in a commit or PR body.

## Review Focus

1. A legacy report (`report.json` directly in the `.Report` folder) that also has a `StaticResources` folder: it reads as legacy, on the CLI and on all three site routes, and the theme files do not make it look like a PBIR report.
2. Unrelated or broken JSON in `RegisteredResources` (a shape map, a half-written file): no `PARSE_ISSUE`, no change to any finding.
3. A `.tmdl`, `.pbip`, `.pbix`, or image inside a theme folder: never opened and never recorded, on any route. A `pbiplint.config.json` there is only JSON in a theme folder, and the config search, which goes by folder, never takes it.
4. A custom theme that is named but missing, with a base theme that sets the property: the answer is `theme-not-read`, not the base's colour.
5. A real saved project with a base theme: its findings are byte for byte what they were before this PR, apart from the report's file count.

---

### Task 1: Which paths are theme files, and `report.themes`

**Files:**
- Modify: `packages/core/src/project/route.ts`, `packages/core/src/pbir/types.ts`, `packages/core/src/pbir/build.ts`, `packages/core/src/index.ts`
- Create: `packages/core/src/pbir/themes.ts`
- Test: `packages/core/test/route.test.ts`, `packages/core/test/pbir-themes.test.ts`

**Interfaces:**
- Produces, from `route.ts` and the package index: `THEME_FOLDERS: readonly string[]` (the three folders, relative to the report root), `isThemeFile(path: string): boolean`, `MAX_THEME_BYTES = 5 * 1024 * 1024`. `isReportFile` also accepts `isThemeFile`.
- Produces, on `Report`: `themes: { base?: ThemeFile; custom?: ThemeFile }`, with

```ts
export interface ThemeFile {
  /** The name `themeCollection` gives it. */
  name: string;
  /** read; absent (not given, over the cap, or not findable); unparsed (a PARSE_ISSUE was raised). */
  state: "read" | "absent" | "unparsed";
  file?: string;
  text?: string;
  json?: Record<string, unknown>;
}
```

- [ ] **Step 1: Write the failing tests**

In `route.test.ts`: `isThemeFile` is true for `StaticResources/SharedResources/BaseThemes/CY24SU10.json`, `.../BuiltInThemes/a.json`, `StaticResources/RegisteredResources/a.json`, and the same below `X.Report/`; false for `StaticResources/x.json`, `StaticResources/RegisteredResources/sub/a.json`, `StaticResources/RegisteredResources/a.png`, `StaticResources/SharedResources/a.json`. `routeFiles` keeps `StaticResources/x.json` out and sends a theme file to the report.

In `pbir-themes.test.ts`, with `buildReport` and `lint` over hand-written files:
- `reads the base and custom themes report.json names`: both `state: "read"`, with `file` and `json`.
- `matches an item by name, whatever its type`: a custom theme registered as item type `Image` is read.
- `prefers the package the theme's type names`: an item of the same name in another package is not used.
- `is absent when no file was given, when no item names it, or when the item's path leaves its package`: `../../definition/report.json` and `/abs.json` give `state: "absent"` and no `file`.
- `has no themes when report.json names none`: `themes` is `{}`.
- `raises a PARSE_ISSUE for a named theme that does not parse`, with the theme's path and `state: "unparsed"`; the same text in an unnamed theme file raises none.
- `leaves every other result alone`: `lint(files)` and `lint([...files, unnamedBrokenTheme])` give equal findings.

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run packages/core/test/route.test.ts packages/core/test/pbir-themes.test.ts`
Expected: FAIL, `isThemeFile` is not exported.

- [ ] **Step 3: Implement**

`route.ts`: the three exports and the `isReportFile` line. `themes.ts`: `readThemes(reportJson: unknown, given: ReadonlyMap<string, LintFile>, issues: ParseIssue[]): Report["themes"]`, which looks an item up in the package the theme's `type` names, then in the others, builds `StaticResources/<package name>/<item path>` with backslashes turned to `/` and refuses an absolute path or any `..` segment, and parses with `readJson(path, text, { objectRoot: true })`. `build.ts`: in the entries loop, after `report.files.push`, a theme file goes in a map and `continue`s; after the loop `report.themes = readThemes(...)`, with the report.json object kept from `readReportJson`'s branch. The initial `report` has `themes: {}`.

- [ ] **Step 4: Run them to see them pass**

Run: `npx vitest run packages/core/test/route.test.ts packages/core/test/pbir-themes.test.ts packages/core/test/pbir-build.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

`git commit -m "feat(core): read the themes a report names"`

### Task 2: The CLI reads theme files

**Files:**
- Modify: `packages/cli/src/walk.ts`, `packages/web/content/cli.md:202`
- Test: `packages/cli/test/walk.test.ts`

**Interfaces:**
- Consumes: `THEME_FOLDERS`, `MAX_THEME_BYTES` from `@pbiplint/core`.

`SKIP_DIRS` stays as it is: `readTree` never enters `StaticResources`, and a new `readThemes(w, part, folder)` opens the three folders by name. So a plain folder walk, a project search, and a `.pbix` search behave as before.

- [ ] **Step 1: Write the failing tests**

- Update the test at `walk.test.ts:241`: its fixture's `StaticResources/RegisteredResources/theme.json` is now in `report.files`, and it is retitled to say only theme JSON is read, never `.pbi`.
- `opens only JSON directly in the three theme folders`: a `.png`, a `.tmdl`, a `.pbix`, `sub/a.json`, and `StaticResources/x.json` are not in `files`, and no notice names them.
- `does not read a theme file over the size cap`: a sparse file of `MAX_THEME_BYTES + 1` bytes (`truncateSync`) is not in `files`, with no notice; one of exactly the cap is read.
- `does not follow a link in the way` (`skipIf(noLinks)`): `StaticResources`, `BaseThemes`, and a `.json` file as links each give the unread notice and are on `part.unread`.
- `reads theme files for a report given on its own, or by its definition folder`.
- `reads a legacy report as legacy, whatever StaticResources holds`.
- `does not read theme files in a folder that is no report` and `is refused as before when a report holds nothing but theme files`.

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run packages/cli/test/walk.test.ts`
Expected: FAIL on the new tests.

- [ ] **Step 3: Implement `readThemes` and call it in `reportPart` after the `definition/` check**

Called only once the part is known to be a report, so a run that read nothing keeps its refusal. Checks each folder on the way with `linked`, lists with `attempt`, filters on `.json` before anything is looked at, and in the read's `attempt` compares `statSync(p).size` with the cap first. Correct the `SKIP_DIRS` comment.

- [ ] **Step 4: Rewrite the sentence in `cli.md:202`**

It says in substance: in a report's `StaticResources` it opens only the JSON files directly in `SharedResources/BaseThemes`, `SharedResources/BuiltInThemes`, and `RegisteredResources`, up to 5 MB each, and uses only the themes `report.json` names; it never enters `.pbi`, `.git`, `node_modules`, or `CustomVisuals`. Grep `packages/web/content`, the READMEs, the skill, and `docs/` (not the specs and plans) for any other sentence that says the same, and correct each.

- [ ] **Step 5: Run the CLI's and the site's tests**

Run: `npm run build && npx vitest run packages/cli packages/web/test/content.test.ts`
Expected: PASS, with any exact file list that holds the fixture's `theme.json` updated.

- [ ] **Step 6: Commit**

`git commit -m "feat(cli): read a report's theme files"`

### Task 3: The site reads theme files

**Files:**
- Modify: `packages/web/src/input/read-drop.ts`, `packages/web/src/input/pick-folder.ts`, `packages/web/src/input/project-files.ts`
- Test: `packages/web/test/read-drop.test.ts`, `packages/web/test/pick-folder.test.ts`, `packages/web/test/project-files.test.ts`

**Interfaces:**
- Consumes: `isThemeFile`, `MAX_THEME_BYTES`.
- Produces, from `read-drop.ts`: `skipsFolder(path: string): boolean` (the drop-relative folder path) and `readWanted(path: string, file: File): Promise<string | undefined>` (undefined over the cap).

- [ ] **Step 1: Write the failing tests**

- `wanted`: true for `X.Report/StaticResources/SharedResources/BaseThemes/a.json` and the other two folders; false for `X.Report/StaticResources/x.json`, `.../RegisteredResources/sub/a.json`, `.../RegisteredResources/a.tmdl`, `.../RegisteredResources/a.pbip`, and `Other/StaticResources/RegisteredResources/a.json`.
- `skipsFolder`: false for `X.Report/StaticResources`, `.../SharedResources`, `.../BaseThemes`, `.../BuiltInThemes`, `.../RegisteredResources`; true for `.../RegisteredResources/sub`, `.../SharedResources/other`, `.../StaticResources/definition`, `StaticResources`, `Other/StaticResources`, `.git`, `X.Report/CustomVisuals`.
- `markerOf` is undefined for a `.pbix` under a report's `StaticResources`.
- On each route (`walkEntry`, `walkHandle`, `readDirectoryInput`): a theme file is read; a file over the cap, by a fake `File.size`, has `text()` never called and raises no notice; `sub/` is never listed.
- Update `read-drop.test.ts:96-97` and `:435-455`, and `pick-folder.test.ts:198, 224, 250, 462, 525` only where they now name a folder on the way to a theme folder; each keeps its intent that nothing else is opened.
- `project-files`: `reportRead` carries theme files with report-relative paths; a theme file unread in a report reaches that part's `unread`; a legacy report with theme entries stays legacy, and a `.Report` with only theme entries reads as no report.

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run packages/web/test/read-drop.test.ts packages/web/test/pick-folder.test.ts packages/web/test/project-files.test.ts`
Expected: FAIL on the new tests.

- [ ] **Step 3: Implement**

`wanted` first answers anything below `<name>.Report/StaticResources/` with `isThemeFile` alone. `skipsFolder` replaces the name test in `walkEntry` and `walkHandle` and is applied to each folder of a path in `skipped`. The three read sites call `readWanted`. `reportRead`'s `covers` adds theme files, and each theme folder when `folder` is set, and ranks them after the definition files, as the CLI reads them. Correct the `SKIP_DIRS` comment.

- [ ] **Step 4: Run the site's tests**

Run: `npx vitest run packages/web`
Expected: PASS.

- [ ] **Step 5: Commit**

`git commit -m "feat(web): read a report's theme files"`

### Task 4: Colour maths

**Files:**
- Create: `packages/core/src/colour/colour.ts`
- Test: `packages/core/test/colour.test.ts`

**Interfaces:**
- Produces:

```ts
export interface Rgba { r: number; g: number; b: number; a: number } // channels 0 to 255, a 0 to 1
export function parseHex(text: string): Rgba | undefined;
export function toHex(c: Rgba): string;                // "#RRGGBB", upper case, channels rounded
export function relativeLuminance(c: Rgba): number;
export function contrastRatio(a: Rgba, b: Rgba): number;
export function truncateRatio(ratio: number): number;  // two decimals, down
export function over(top: Rgba, bottom: Rgba): Rgba;   // source-over
```

- [ ] **Step 1: Write the failing tests**

- `parseHex`: `#FFF`, `#ffffff`, `#1F4E79` opaque; `#FFFFFF00` alpha 0 and `#00000080` alpha 128/255 (the last pair is alpha); undefined for `#FFFF`, `#GGGGGG`, `FFFFFF`, `red`, the empty string.
- `contrastRatio`: black on white is exactly 21, in either order; a colour on itself is 1; `#767676` on white truncates to 4.54 and `#777777` on white to 4.47; `#A19F9D` on white to 2.57.
- `relativeLuminance`: white 1, black 0, and a channel of `0.04045 * 255` takes the low branch, the threshold in WCAG 2.2's definition.
- `truncateRatio`: 4.499 gives 4.49, 4.5 gives 4.5, 2.5799 gives 2.57.
- `over`: an opaque top is the top; alpha 0 is the bottom; `#000000` at alpha 0.5 over white is 127.5 on each channel, and `toHex` rounds it to `#808080`.

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run packages/core/test/colour.test.ts`
Expected: FAIL, no such module.

- [ ] **Step 3: Implement `colour.ts`**

`contrastRatio` measures opaque channels as given; a caller blends first. Credit nothing in `NOTICE`, since Microsoft's blend is reused as a formula.

- [ ] **Step 4: Run them to see them pass**

Run: `npx vitest run packages/core/test/colour.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

`git commit -m "feat(core): WCAG contrast and colour maths"`

### Task 5: Reading a written colour

**Files:**
- Create: `packages/core/src/colour/read.ts`
- Test: `packages/core/test/colour-read.test.ts`

**Interfaces:**
- Consumes: `parseHex`, `Rgba`; `Report["themes"]`, `ThemeFile`.
- Produces:

```ts
export type NotKnown =
  "data-dependent" | "percent" | "theme-not-read" | "not-set" | "other-form";
export interface ThemeSetting { file: string; pointer: string; layer: "customTheme" | "baseTheme" }
export type ColourRead =
  | { known: true; colour: Rgba; from?: ThemeSetting }
  | { known: false; why: NotKnown };
export function readColour(value: unknown, themes: Report["themes"]): ColourRead;
export function namedColour(name: string, themes: Report["themes"]): ColourRead;
export function readLiteralNumber(value: unknown): number | undefined;
export function readLiteralBool(value: unknown): boolean | undefined;
```

`from` says which theme line supplied the colour, for PR 2's finding on the theme.

- [ ] **Step 1: Write the failing tests**

- Literal `{solid:{color:{expr:{Literal:{Value:"'#1F4E79'"}}}}}` is that colour with no `from`; a theme file's `{solid:{color:"#1F4E79"}}` and a plain `"#1F4E79"` (a text run, a text class) too.
- `ThemeDataColor` at Percent 0 or with no Percent: ColorId 0 is `background`, 1 is `foreground`, 2 is `dataColors[0]`, 3 is `dataColors[1]`, each with `from` naming `/background`, `/foreground`, `/dataColors/0`, `/dataColors/1`.
- `dataColors` is taken whole: a custom theme's list is used and an index past its end is `not-set`, not the base's; with no list in the custom theme, the base's is used.
- Any Percent other than 0 is `percent`, before any theme is looked at.
- `FillRule`, `Conditional`, `Measure`, and `Aggregation` under `expr` are `data-dependent`; a `gradient`, a `Literal` that is not hex (`'red'`), and a number are `other-form`.
- Named colour `{solid:{color:"foregroundNeutralSecondary"}}`: custom over base; `not-set` when both are read and neither sets it (`selection`, which the schema allows and no theme property holds, too).
- Unread layers: custom named and `absent` is `theme-not-read` even when the base sets the name; base `absent` with a custom that sets it gives the custom's; base `absent` and a custom that does not set it is `theme-not-read`; no theme named at all is `not-set`.
- `readLiteralNumber`: `{expr:{Literal:{Value:"50D"}}}`, `"50L"`, `"50"`, and a plain `50` give 50; `"'50'"` and an expression give undefined. `readLiteralBool`: `"true"`, `"false"`, plain booleans.

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run packages/core/test/colour-read.test.ts`
Expected: FAIL, no such module.

- [ ] **Step 3: Implement `read.ts`**

Uses `literal` from `pbir/build.js`. The layer walk is one helper, `fromThemes(look)`, used for names and `dataColors`: custom then base, stopping with `theme-not-read` at the first named layer not `read`. A named value in a theme must itself be a hex string; anything else there is `other-form`, so no reference is followed twice.

- [ ] **Step 4: Run them to see them pass**

Run: `npx vitest run packages/core/test/colour-read.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

`git commit -m "feat(core): read a colour as a report writes it"`

### Task 6: The cascade

**Files:**
- Create: `packages/core/src/colour/cascade.ts`
- Test: `packages/core/test/colour-cascade.test.ts`

**Interfaces:**
- Consumes: Task 5.
- Produces:

```ts
export type ColourSource = "visual" | "group" | "page" | "customTheme" | "baseTheme";
export interface Own { entries: unknown; source: ColourSource; file: string; pointer: string }
export interface Query {
  themes: Report["themes"];
  own?: Own;                  // the array at e.g. visual.visualContainerObjects.title
  visualType: string;         // a key of visualStyles
  preset?: string;
  object: string;             // "title"
  property: string;           // "fontColor"
  state?: string;             // default "default"
  wildcard?: boolean;         // default true: also visualStyles["*"]["*"]
}
export type Lookup =
  | { found: true; value: unknown; source: ColourSource; file?: string; pointer: string }
  | { found: false; why: "theme-not-read" | "not-set" };
export function lookup(q: Query): Lookup;
export function stylePresetOf(visualJson: unknown): string | undefined;
```

- [ ] **Step 1: Write the failing tests**

- Own over custom over base, each with its `source`, `file`, and pointer (`/visualStyles/card/*/title/0/fontColor`, with `~` and `/` escaped).
- Inside one theme: `[type][preset][object]` over `[type][preset]["*"]` over `[type]["*"][object]` over `[type]["*"]["*"]` over `["*"]["*"][object]` over `["*"]["*"]["*"]`.
- With `wildcard: false`, `["*"]["*"]` is not consulted (a group and a page do not take the theme's every-visual card).
- A custom theme that is named but not read stops the walk at `theme-not-read`, though the base sets the property; so does an unread base when the custom does not set it. An own setting needs neither.
- States: an entry with `selector.id` (own) or `$id` (theme) equal to `state` beats the default entry in the same array; a state with none falls to the default entry; a query for the default ignores a `hover` entry. An own entry with a `metadata` or `data` selector is not the default.
- The last matching entry in an array wins, as the alt text read does.
- `not-set` when the theme files are read and nothing sets it, or a key is `__proto__` or `constructor` (own properties only).
- `stylePresetOf` reads `visual.visualContainerObjects.stylePreset[0].properties.name`.

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run packages/core/test/colour-cascade.test.ts`
Expected: FAIL, no such module.

- [ ] **Step 3: Implement `cascade.ts`**

- [ ] **Step 4: Run them to see them pass**

Run: `npx vitest run packages/core/test/colour-cascade.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

`git commit -m "feat(core): the theme cascade for one formatting property"`

### Task 7: The background stack

**Files:**
- Modify: `packages/core/src/colour/cascade.ts`
- Test: `packages/core/test/colour-stack.test.ts`

**Interfaces:**
- Consumes: Tasks 4 to 6; `Report`, `Page`, `Visual`.
- Produces:

```ts
export interface StackLayer { colour: Rgba; source: ColourSource; file?: string; pointer: string }
export type OpaqueAt = "element" | "visual" | "group" | "page" | "wallpaper";
export type Background =
  | { known: true; colour: Rgba; layers: StackLayer[]; opaqueAt: OpaqueAt }
  | { known: false; why: NotKnown };
export function backgroundOf(
  report: Report, page: Page, visual: Visual, element?: StackLayer,
): Background;
```

`colour` is the blend rounded to whole channels, so a ratio computed from the hex shown is the ratio reported. `opaqueAt` is what PR 2's overlap test reads: an element or visual stack is opaque by its own layers.

- [ ] **Step 1: Write the failing tests**

- An opaque visual background stops the walk: the page is not read, so an unknown page changes nothing, and `opaqueAt` is `visual`.
- `show: false`, or transparency 100, is no layer, and its colour need not be known.
- A visual with `show: true`, transparency 0, and no colour takes the theme's `background`.
- Transparency 50 over a coloured page blends: `#000000` at 50 over `#FFFFFF` is 128 on each channel.
- Page at transparency 100 over a white wallpaper is white (`opaqueAt: "wallpaper"`); page `#FAFAFA` at 14 over wallpaper `#E6E6E6` is `#F7F7F7`, rounded from the exact blend. Page and wallpaper read `page.json` `objects.background` and `objects.outspace`, then `visualStyles.page["*"]`.
- Groups: a transparent visual in a group with a dark fill is the fill, `opaqueAt: "group"`; a group at transparency 50 blends with the page; nested groups blend innermost first; a group that sets nothing is no layer; a cycle of `parentGroupName` ends. The theme's every-visual card does not give a group a background.
- An `element` layer on top: opaque stops the walk with `opaqueAt: "element"`; an alpha 00 colour passes through to the visual.
- Unknown: a visual with `FillRule` as its background is `data-dependent`; a Percent is `percent`; a stack that runs out with nothing opaque is `not-set`; an unread theme a needed layer depends on is `theme-not-read`.
- `layers` lists each layer that contributed, top first, with its source.

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run packages/core/test/colour-stack.test.ts`
Expected: FAIL, `backgroundOf` is not exported.

- [ ] **Step 3: Implement `backgroundOf`**

Walks top down and blends bottom up, in floats, rounding only the result. Image layers and the overlap test are PR 2's, with the other skips.

- [ ] **Step 4: Run the whole suite, the checks, and the end-to-end tests**

Run: `npm run build && npm test && npm run check:browser --workspace @pbiplint/core && npm run test:e2e`
Expected: all PASS, no pinned count moved, and the size budget untouched.

- [ ] **Step 5: Compare a real project before and after**

Lint three real saved projects with base themes from the local corpus, with this branch's CLI and with main's, using `--format json`.
Expected: findings identical; the only difference is the report's file count.

- [ ] **Step 6: Commit**

`git commit -m "feat(core): the background stack behind report text"`
