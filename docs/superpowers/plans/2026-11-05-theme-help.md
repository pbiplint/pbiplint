# Theme Help Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The site says, once, that its light or dark theme follows the reader's device, and how to change it: a "Light and dark" section on the About page, and a line in every page's footer that links to it.

**Architecture:** Content and markup only. A section in `packages/web/content/about.md` with a fixed anchor, `light-and-dark`; one footer line in the three places a footer is written (`FOOTER` in `packages/web/src/build/pages.ts`, `packages/web/index.html`, `packages/web/404.html`); and a build check in `checkBuild` (`packages/web/src/build/check-site.ts`) that every page of both builds, pbiplint.com's and the self-hosted copy, carries the footer link and that the About page carries the anchor it points to. No script, no style, nothing stored.

**Tech Stack:** Markdown rendered by the site generator, Vitest for the build check and the footer markup, Playwright with `@axe-core/playwright` for the e2e checks.

**Spec:** issue #266 (its Goal, Decided, The work, and Out of scope sections). There is no separate design document. Background: #223, which added the light theme and decided against a theme button.

## Global Constraints

- The Privacy Promise: no script added, nothing stored in the browser, and the privacy page's Promise and its check stay word for word. `check-site` passes on both builds.
- Every step on the page comes from the maker's own current help page (Apple, Microsoft, Google, Mozilla) and links to it. A browser is listed as able to change what websites see only when its maker's page says so, or a test in that browser shows it. No third-party how-to sites.
- The reason there is no button quotes the Promise's sentence "The site stores nothing in your browser." with a link to [the Promise](https://pbiplint.com/privacy/#the-promise).
- The link in the footer is site-relative (`/about/#light-and-dark`), so it works on pbiplint.com and in a self-hosted copy alike, as the footer's Privacy link does.
- Changes stay in the About page, the three footers, `check-site.ts`, the comment in `main.ts` that lists the footer's links, and their tests, so the pull requests waiting on the site's pages merge cleanly.
- No new dependency. Core is untouched.
- No em dashes. "the Promise" with a capital P.

## The wording

The footer line, in the style of the Privacy line above it:

> Light or dark follows your device's setting: [how to change it](/about/#light-and-dark).

The section sits after "Privacy" and before "Known limits in the browser", as `<h2 id="light-and-dark">Light and dark</h2>` (written as HTML, as the Privacy heading is, so the anchor does not move if the heading's words change). It holds, in this order:

1. One sentence: the site shows a light or a dark theme, following the device's setting.
2. A short list of the systems (macOS, Windows, iPhone and iPad, Android), each with its menu path and a link to the maker's page.
3. The browsers whose own setting changes what websites see, each with its menu path and a link, and a line that Safari follows the system.
4. One line: a dark-mode extension makes every site dark, this one included, whatever the setting.
5. Why there is no button: the choice would have to be stored, and the Promise says "The site stores nothing in your browser."

The exact steps are settled by the research in Task 1, not here.

## Task 1: Research the steps

**Files:** working notes only (not committed).

- [ ] For each system (macOS, Windows 11, iPhone and iPad, Android) find the maker's current help page for light and dark and record the menu path and the URL.
- [ ] For each browser (Chrome, Edge, Firefox, Safari), find the maker's page for its theme setting and record whether that setting changes what websites see (`prefers-color-scheme`) or only the browser's own frame, quoting the page's words. Where the page does not say, mark it unconfirmed; it stays off the list unless a test shows it.
- [ ] Note any platform difference that matters (a desktop browser setting that its phone app lacks, for example).

## Task 2: The build check (TDD)

**Files:** `packages/web/src/build/check-site.ts`, `packages/web/test/check-site.test.ts`.

- [ ] Write failing tests for `checkBuild`: a page whose footer lacks a link to `/about/#light-and-dark` is named ("no link to the Light and dark section in the footer"), in the public build and the self-hosting build; and a build whose `about/index.html` has no element with `id="light-and-dark"` is named. Update the passing fixtures in the existing `checkBuild` and `siteCheckPlugin` tests to carry the link and the anchor.
- [ ] Run them; watch them fail for the right reason.
- [ ] Implement the two checks in `checkBuild`, and update its doc comment.
- [ ] Run the file's tests; they pass.

## Task 3: The footer line (TDD)

**Files:** `packages/web/src/build/pages.ts`, `packages/web/index.html`, `packages/web/404.html`, `packages/web/test/build-info.test.ts` (next to "the footer marker", which already reads all three footers), `packages/web/src/main.ts` (comment only).

- [ ] Write a failing test: every footer (the hand-written home and 404 pages and a generated page) holds `<a href="/about/#light-and-dark">`.
- [ ] Add the line after the Privacy line in all three footers.
- [ ] Update the comment above `siteLinks` in `main.ts`, which lists the footer's links into the site (the new link joins them, so it opens in a new tab while results show, as the Privacy link does).
- [ ] Tests pass.

## Task 4: The section

**Files:** `packages/web/content/about.md`, `packages/web/e2e/site.spec.ts`.

- [ ] Add an e2e test that fails first: from a page's footer, the link reaches `/about/#light-and-dark`, the heading reads "Light and dark" and is in view; and add `["/about/#light-and-dark", "light-and-dark", "Light and dark"]` to the deep-link test. The About page is already in `PAGES`, so the axe scans cover it in light and dark.
- [ ] Write the section from Task 1's notes, every step linked to its maker's page, the Promise quoted and linked.
- [ ] Add an e2e test that every page's footer has the link (`PAGES` loop, as the version test does).
- [ ] Build both ways (`npm run build -w @pbiplint/web` and with `-- --mode self-host`); the site check passes on each.
- [ ] Run the web unit tests and the e2e suite.

## Task 5: Review and screenshots

- [ ] One review of the whole branch: the Promise untouched, no script, wording (no em dashes, plain words, capital P), every step matches its source.
- [ ] Screenshots from a local build: the section and a footer, each in light and dark at desktop width, and the section at phone width. Kept out of the repo.

## Release note

One sentence for the release notes, in the pull request: the About page says how the site's light or dark theme follows the device, and every page's footer links to it.
