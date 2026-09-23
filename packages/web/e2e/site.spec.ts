import { AxeBuilder } from "@axe-core/playwright";
import { expect, test } from "./fixtures.js";

// The generated pages and the properties every page shares: the policy, the build marker, the
// deep-link anchors, and an accessibility scan of each page template. Every test also ends by
// proving no console error was written and no request left the origin (see fixtures.ts).

const PAGES = [
  "/",
  "/rules/",
  "/rules/hide-foreign-keys/",
  "/rules/parse-issue/",
  "/rules/broken-field-reference/", // the first published native rule page
  "/about/",
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
  }
});

test("a section of a rule page, the rules index, and the About page can be deep-linked", async ({
  page,
}) => {
  // Each heading must be in view and the page must have scrolled to get there, since a heading
  // near the top would be in view even if the fragment were ignored.
  for (const [path, id, text] of [
    ["/rules/hide-foreign-keys/#how-to-fix-it", "how-to-fix-it", "How to fix it"],
    ["/rules/#formatting", "formatting", "Formatting"],
    ["/about/#verify", "verify", "How to check that nothing is uploaded"],
  ]) {
    await page.goto(path!);
    const heading = page.locator(`h2#${id}`);
    await expect(heading).toHaveText(text!);
    await expect(heading).toBeInViewport();
    expect(await page.evaluate(() => window.scrollY)).toBeGreaterThan(0);
  }
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
  await page.locator("#results .group").first().locator("summary").click();
  expect(await violations(page)).toEqual([]);
});
