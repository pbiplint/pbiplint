# Light Mode Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** pbiplint.com follows the reader's system setting: a reader whose system is set to light gets a light theme, everyone else keeps today's dark one.

**Architecture:** CSS only. The tokens at the top of `packages/web/src/styles.css` get light values in one `@media (prefers-color-scheme: light) { :root { ... } }` block, and every colour the stylesheet writes outside the token blocks becomes a token. No script, nothing stored, no markup change.

**Tech Stack:** CSS custom properties, Vitest (happy-dom) for the stylesheet tests, Playwright with `@axe-core/playwright` for the e2e scans.

**Spec:** issue #223 (its Goal, Decided, The work, and Out of scope sections). There is no separate design document.

## Global Constraints

- The site stores nothing in the browser and adds no script. The privacy page's Promise and its check stay word for word. `check-site` (run by the build) passes.
- Text at least 4.5:1 ([WCAG 2.2, 1.4.3 Contrast (Minimum)](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html)) and graphics at least 3:1 ([1.4.11 Non-text Contrast](https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast.html)) against their background, in both palettes, checked by the tests. Cite only WCAG 2.2 and its Understanding pages.
- The light palette uses darker steps of the brand's own hues for text and marks.
- Dark stays the default: only `prefers-color-scheme: light` switches.
- The favicon keeps its dark tile, and `favicon.svg` is not edited. No light logo, banners, or profile picture.
- No new dependency. Core is untouched.
- No em dashes. "the Promise" with a capital P.

## The light palette

Values chosen so every pair in Task 1's tables clears its bar (worst text pair: `--fg-2` on `--surface-3`, 6.10:1; worst graphic pair: `--brand-teal` on `--surface-1`, 4.80:1).

| Token | Dark (today) | Light |
|---|---|---|
| `--canvas` | `#0a0e1a` | `#f7f9fc` |
| `--surface-1` | `#11172a` | `#ffffff` |
| `--surface-2` | `#18203a` | `#eaeef5` |
| `--surface-3` | `#1f2a4a` | `#dde3ee` |
| `--surface-inset` | `#070a14` | `#eef1f6` |
| `--fg-1` | `#e6edf6` | `#0a0e1a` (the brand canvas) |
| `--fg-2` | `#a9b4c7` | `#45526b` |
| `--fg-3` | `#6b7894` | `#6a7790` |
| `--line-1/2/3` | `rgba(230, 237, 246, 0.08/0.14/0.22)` | `rgba(10, 14, 26, 0.1/0.16/0.26)` |
| `--brand-blue` (button fill) | `#2d7dd2` | `#1f63ad` |
| `--brand-blue-soft` (hover fill, project tag) | `#4f9de8` | `#1a5596` |
| `--brand-teal` (focus ring, marks) | `#00a9a5` | `#00807c` |
| `--brand-teal-soft` (links) | `#3fc7c3` | `#006e6b` |
| `--layer-powerquery` | `#b392f0` | `#6e3fc0` |
| `--warning` | `#f0b429` | `#8a5b00` |
| `--danger` | `#e5484d` | `#c7282e` |
| `--success` | `#46a758` | `#2f7d3e` |

New tokens (Task 1), dark value first, light second:

| Token | Replaces | Dark | Light |
|---|---|---|---|
| `--badge-error-bg` / `--badge-error-fg` | `.badge.error` | `rgba(229, 72, 77, 0.18)` / `#ff8a8e` | `rgba(199, 40, 46, 0.12)` / `#a51d23` |
| `--badge-warning-bg` / `--badge-warning-fg` | `.badge.warning` | `rgba(240, 180, 41, 0.18)` / `#ffd166` | `rgba(176, 120, 0, 0.16)` / `#7a4f00` |
| `--badge-info-bg` / `--badge-info-fg` | `.badge.info` | `rgba(45, 125, 210, 0.2)` / `#8ec3ff` | `rgba(31, 99, 173, 0.12)` / `#1a5596` |
| `--teal-tint` | `.drop.over` background | `rgba(0, 169, 165, 0.08)` | `rgba(0, 128, 124, 0.08)` |
| `--teal-tint-faint` | `.facts` background | `rgba(0, 169, 165, 0.06)` | `rgba(0, 128, 124, 0.06)` |
| `--teal-edge` | `.facts` border | `rgba(0, 169, 165, 0.35)` | `rgba(0, 128, 124, 0.35)` |

`color-scheme` is `dark` on `:root` and `light` in the light block. The `@media print` block keeps its `#000`, since print is not a theme.

## Review Focus

- A browser that does not support `prefers-color-scheme` gets dark, as today: dark is the default and only a light setting switches. (Current Chromium and Firefox report `light` when no preference is set, as Media Queries 5 says, so `no-preference` is not tested.) Pinned by Task 1's one-media-query test.
- A badge or tag sits on `--surface-1` inside a group and on `--canvas` on a rule page: both backgrounds are in Task 1's tables.
- The facts panel's text sits on a teal tint over the canvas, not on the canvas: Task 1 composites the tint before measuring.
- A hard-coded colour added later would skip the light palette: Task 1's test fails on any hex or `rgba()` outside the token blocks and the print block.
- The Firefox axe scan, already near its 30 s limit, doubles: Task 2 splits it into one test per page and scheme rather than raising the limit.

---

### Task 1: The light palette and its contrast tests

**Files:**
- Modify: `packages/web/src/styles.css` (the `:root` block, a new light block after it, `.drop.over`, `.badge.error/.warning/.info`, `.facts`)
- Test: `packages/web/test/styles.test.ts`

**Interfaces:**
- Produces (test file only): `palette(scheme: "dark" | "light"): Map<string, string>` (the `:root` tokens, then the light block's on top for light); `contrast(fg: string, bg: string, scheme)`, where either side may be a token or `token over token` for an `rgba()` composited on an opaque token.

- [ ] **Step 1: Write the failing tests**

Change the existing `contrast` helper to take a scheme and resolve through `palette`; every existing contrast assertion runs in a `for (const scheme of SCHEMES)` loop. New tests:

```ts
it("gives the light theme a value for colour tokens only, and only tokens the dark theme has", ...)
  // light block's selectors are exactly ":root"; each name in it exists in the dark :root
it("switches color-scheme with the theme", ...)
  // dark :root has `color-scheme: dark`; light block has `color-scheme: light`; `prefers-color-scheme` appears once
it("writes every colour as a token, outside print", ...)
  // css with the :root block, the light block, and @media print removed has no /#[0-9a-f]{3,8}\b/i and no /rgba?\(/
it.each(SCHEMES)("meets 4.5:1 for text in the %s theme", ...)
it.each(SCHEMES)("meets 3:1 for graphics in the %s theme", ...)
```

Text pairs (4.5): `--fg-1` and `--fg-2` on canvas, surface-1, surface-2, surface-3, surface-inset; `--brand-teal-soft`, `--brand-blue-soft`, `--layer-powerquery` on canvas and surface-1; `--canvas` on `--brand-blue` and `--brand-blue-soft` (button text); each `--badge-*-fg` on its `--badge-*-bg over --surface-1` and `over --canvas`; `--fg-1`, `--fg-2`, `--brand-teal-soft`, `--warning` on `--teal-tint-faint over --canvas` (facts panel).

Graphic pairs (3): `--danger`, `--success`, `--warning` on canvas; `--danger` on surface-2 (status bar); `--brand-teal` on canvas and surface-1 (focus ring, report tag edge); `--fg-3` on surface-1 (a group's disclosure mark).

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run packages/web/test/styles.test.ts`
Expected: FAIL (no light block, hex colours in the badge rules).

- [ ] **Step 3: Implement the palette table above in `styles.css`**

Add the six new tokens to `:root`, the light block right after `:root`, and point the four rules at the new tokens. Note in a comment why the light "soft" steps are darker (they are the readable step, and on a light page that is the darker one). Remove the stale "#223's light palette" note on `--layer-powerquery`.

- [ ] **Step 4: Run to verify they pass**

Run: `npx vitest run packages/web/test/styles.test.ts`
Expected: PASS.

- [ ] **Step 5: Add a line for the light palette to `brand/README.md`'s Colors section**

The canvas row stays "every background" for the brand files; one sentence after the table says the site has a light palette for readers whose system is set to light, defined in the same stylesheet, and the favicon keeps its dark tile there.

- [ ] **Step 6: Commit**

`feat(web): a light palette that follows the system setting`

### Task 2: The e2e scans in both schemes, and the system-setting test

**Files:**
- Modify: `packages/web/e2e/site.spec.ts`

**Interfaces:**
- Consumes: Task 1's light `--canvas` (`#f7f9fc`, `rgb(247, 249, 252)`) and dark `--canvas` (`#0a0e1a`, `rgb(10, 14, 26)`).

- [ ] **Step 1: Write the tests**

- Replace `no page template has an accessibility violation` with one test per page and scheme, inside `for (const colorScheme of ["dark", "light"] as const)` and a `test.describe` that calls `test.use({ colorScheme })`: named `` `${path} has no accessibility violation in ${colorScheme}` ``. Each test takes a few seconds, so none nears the 30 s default, and `fullyParallel` spreads them across workers.
- Run `the home page has no accessibility violation after a run with a group open` in both schemes the same way.
- New: `the site follows the system setting`: `page.emulateMedia({ colorScheme })` for `light` and `dark`, on `/` and `/privacy/`; `getComputedStyle(document.documentElement)` gives `backgroundColor` `rgb(247, 249, 252)` for light and `rgb(10, 14, 26)` for dark, and `colorScheme` `light` or `dark` to match.

- [ ] **Step 2: Run**

Run: `npm run test:e2e -- e2e/site.spec.ts`
Expected: PASS in all three browsers. A light-mode axe failure here means a pair Task 1 missed: add the pair to Task 1's table, then fix the token.

- [ ] **Step 3: Commit**

`test(web): scan every page in light and dark, and check the site follows the system setting`

### Task 3: Verify, measure, review

- [ ] **Step 1:** `npm run build && npm test && npm run typecheck && npm run lint`; all pass, and the build's `check-site` reports no problem.
- [ ] **Step 2:** Confirm `git diff main -- packages/web/content/privacy.md packages/web/public packages/core` is empty and no `.ts`, `.js`, or `.html` file under `packages/web/src` or `packages/web/index.html` changed.
- [ ] **Step 3:** One whole-branch review against #223's boxes and this plan; fix what it finds.
- [ ] **Step 4:** Open the PR. After CI, record the slowest per-page Firefox scan from the CI log in the PR body, with how this split combines with the pending colour sample work (that change adds its page to `PAGES` and needs no timeout of its own).
