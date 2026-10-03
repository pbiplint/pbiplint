import { AxeBuilder } from "@axe-core/playwright";
import { expect, test } from "./fixtures.js";

// The generated pages and the properties every page shares: the policy, the build marker, the
// referrer policy, the deep-link anchors, the names code blocks carry, and an accessibility scan of
// each page template.
// Every test also ends by proving no console error was written and no request left the origin
// (see fixtures.ts).

const PAGES = [
  "/",
  "/rules/",
  "/rules/hide-foreign-keys/",
  "/rules/parse-issue/",
  "/rules/broken-field-reference/", // the first published native rule page
  "/rules/filters-pane-state/", // a report page whose example runs under a config
  "/rules/ensure-alttext/", // a report page with a visual.json figure
  "/about/",
  "/privacy/",
  "/cli/",
  "/pipelines/",
  "/404.html",
];

/** Violations as one line each, so a failure reads as a list of rule ids rather than a node dump. */
async function violations(page: import("@playwright/test").Page): Promise<string[]> {
  const scan = await new AxeBuilder({ page }).analyze();
  return scan.violations.map((v) => `${v.id} (${v.impact}): ${v.nodes.length} node(s)`);
}

test("every page carries the policy and the build marker", async ({ page }) => {
  for (const path of PAGES) {
    await page.goto(path);
    await expect(page.locator('meta[http-equiv="Content-Security-Policy"]')).toHaveAttribute(
      "content",
      /connect-src 'none'/,
    );
    await expect(page.locator('meta[name="pbiplint-build"]')).toHaveAttribute(
      "content",
      /^(dev|[0-9a-f]{7})$/,
    );
    // A link off the site that missed its rel still sends no Referer.
    await expect(page.locator('meta[name="referrer"]')).toHaveAttribute("content", "no-referrer");
  }
});

test("How to fix it opens the rule's page in a new tab, and the results stay put", async ({
  page,
  context,
}) => {
  await page.getByRole("button", { name: "Try the sample project" }).click();
  const groups = page.locator("#results .group");
  await expect(groups.first()).toBeVisible();
  const count = await groups.count();
  const fix = page.locator("#results .fix-first a.rule-link").first();
  const href = await fix.getAttribute("href");
  expect(href).toMatch(/^\/rules\/[a-z0-9-]+\/$/);
  const [opened] = await Promise.all([context.waitForEvent("page"), fix.click()]);
  await opened.waitForLoadState();
  expect(new URL(opened.url()).pathname).toBe(href);
  await expect(opened.locator("article.rule h1")).toBeVisible();
  await opened.close();
  expect(new URL(page.url()).pathname).toBe("/");
  await expect(groups).toHaveCount(count);
  await expect(groups.first()).toBeVisible();
});

test("a sentence copied from a page leaves out the note a link off the site carries", async ({
  page,
}) => {
  await page.goto("/rules/hide-foreign-keys/");
  const credit = page.locator(".site-footer p").last();
  // The note is still in the name a screen reader hears.
  await expect(
    credit.getByRole("link", { name: "The Data Practitioner (opens in a new tab)", exact: true }),
  ).toHaveCount(1);
  const copied = await credit.evaluate((p) => {
    const range = document.createRange();
    range.selectNodeContents(p);
    const selection = window.getSelection()!;
    selection.removeAllRanges();
    selection.addRange(range);
    return selection.toString();
  });
  expect(copied).toContain("from the makers of The Data Practitioner");
  expect(copied).not.toContain("opens in a new tab");
});

test("a contrast theme still shows the mark on a link that opens in a new tab", async ({
  page,
  browserName,
}) => {
  test.skip(browserName !== "chromium", "only Chromium emulates forced colors");
  await page.emulateMedia({ forcedColors: "active" });
  await page.goto("/rules/hide-foreign-keys/");
  const colours = await page.locator(".site-footer a[target='_blank']").evaluate((a) => ({
    mark: getComputedStyle(a, "::after").backgroundColor,
    page: getComputedStyle(document.documentElement).backgroundColor,
  }));
  expect(colours.mark).not.toBe(colours.page);
});

test("a section of a rule page, the rules index, the About page, and the Privacy Promise can be deep-linked", async ({
  page,
}) => {
  // Each heading must be in view and the page must have scrolled to get there, since a heading
  // near the top would be in view even if the fragment were ignored.
  for (const [path, id, text] of [
    ["/rules/hide-foreign-keys/#how-to-fix-it", "how-to-fix-it", "How to fix it"],
    ["/rules/#formatting", "formatting", "Formatting"],
    ["/about/#verify", "verify", "Privacy"],
    ["/privacy/#check", "check", "How to check it"],
    ["/privacy/#in-the-github-action", "in-the-github-action", "In your pipelines"],
  ]) {
    await page.goto(path!);
    const heading = page.locator(`#${id}`);
    await expect(heading).toHaveText(text!);
    await expect(heading).toBeInViewport();
    expect(await page.evaluate(() => window.scrollY)).toBeGreaterThan(0);
  }
});

test("a code block is a region a screen reader names, by its caption when it has one", async ({
  page,
}) => {
  // The name the browser computes is what a screen reader announces when the block takes focus.
  await page.goto("/rules/broken-field-reference/");
  const fires = page.getByRole("region", { name: "Fires the rule in visual.json", exact: true });
  await expect(fires).toHaveCount(1);
  await fires.focus();
  await expect(fires).toBeFocused();
  await expect(
    page.getByRole("region", { name: "After the fix in visual.json", exact: true }),
  ).toHaveCount(1);
  // A plain fence has no caption, so it is named for what it is and its place among the page's
  // plain blocks, which keeps two of them on one page apart.
  await page.goto("/rules/avoid-duplicate-measures/");
  await expect(page.getByRole("region", { name: "Code block 1", exact: true })).toHaveCount(1);
});

test("a control character an example needs reaches the page's text, so a copy of it still fires the rule", async ({
  page,
}) => {
  // The page writes U+0001 as a character reference; the browser parses it back to the character.
  await page.goto("/rules/avoid-invalid-name-characters/");
  const fires = page.getByRole("region", { name: "Fires the rule", exact: true });
  expect(await fires.textContent()).toContain("column 'Order\u0001ID'");
});

test("no page template has an accessibility violation", async ({ page }) => {
  for (const path of PAGES) {
    await page.goto(path);
    expect(await violations(page), path).toEqual([]);
  }
});

test("the home page has no accessibility violation after a run with a group open", async ({
  page,
}) => {
  await page.getByRole("button", { name: "Try the sample project" }).click();
  await expect(page.locator("#results")).toBeVisible();
  // The sample has its report, so the scan covers the facts panel too.
  await expect(page.locator("#results section.facts")).toBeVisible();
  await page.locator("#results .group").first().locator("summary").click();
  expect(await violations(page)).toEqual([]);
});

test("no page scrolls sideways at 320 CSS pixels", async ({ page }) => {
  // WCAG's reflow criterion (1.4.10): at 320 CSS pixels a page fits without scrolling sideways. A
  // code block may scroll in its own region, which leaves the page's own width alone.
  await page.setViewportSize({ width: 320, height: 800 });
  const wide: string[] = [];
  for (const path of PAGES) {
    await page.goto(path);
    const { scroll, client } = await page.evaluate(() => ({
      scroll: document.documentElement.scrollWidth,
      client: document.documentElement.clientWidth,
    }));
    if (scroll > client) wide.push(`${path}: ${scroll} > ${client}`);
  }
  expect(wide).toEqual([]);
});

test("the header shows its links in a row on a wide screen and behind a Menu button on a narrow one", async ({
  page,
  browserName,
}) => {
  const sideways = () =>
    page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
    );
  const row = page.locator(".site-header .nav-row");
  const button = page.locator(".site-header .nav-menu > summary");
  const panel = page.locator(".site-header .nav-panel");
  for (const path of ["/", "/pipelines/"]) {
    // Wide: the seven links on one row, measured once the site's font has loaded, and no button.
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto(path);
    await page.evaluate(() => document.fonts.ready);
    await expect(row.locator("a")).toHaveCount(7);
    const middles = await row
      .locator("a")
      .evaluateAll((links) =>
        links.map((a) => a.getBoundingClientRect().top + a.getBoundingClientRect().height / 2),
      );
    expect(Math.max(...middles) - Math.min(...middles), path).toBeLessThan(10);
    await expect(button).toBeHidden();
    expect(await sideways(), path).toBe(false);

    // Narrow: a Menu button, big enough to tap, in place of the row.
    await page.setViewportSize({ width: 360, height: 800 });
    await expect(row).toBeHidden();
    await expect(button).toBeVisible();
    await expect(button).toHaveAccessibleName("Menu");
    const box = (await button.boundingBox())!;
    expect(box.width).toBeGreaterThanOrEqual(44);
    expect(box.height).toBeGreaterThanOrEqual(44);
    await expect(panel).toBeHidden();
    expect(await sideways(), path).toBe(false);

    // The keyboard opens it on the button, and Escape closes it and gives the button focus back.
    await button.focus();
    await page.keyboard.press("Enter");
    await expect(panel).toBeVisible();
    await expect(panel.locator("a")).toHaveCount(7);
    await expect(panel.locator('a[aria-current="page"]')).toHaveCount(1);
    expect(await sideways(), path).toBe(false);
    // Tab goes from the button into the list. WebKit, like Safari by default, skips links on Tab.
    if (browserName !== "webkit") {
      await page.keyboard.press("Tab");
      await expect(panel.locator("a").first()).toBeFocused();
    }
    await page.keyboard.press("Escape");
    await expect(panel).toBeHidden();
    await expect(button).toBeFocused();

    // A tap outside the open menu closes it.
    await button.click();
    await expect(panel).toBeVisible();
    await page.mouse.click(180, 700);
    await expect(panel).toBeHidden();
  }
});
