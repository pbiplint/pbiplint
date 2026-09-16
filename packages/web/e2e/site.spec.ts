import { AxeBuilder } from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

// The generated pages and the properties every page shares: the policy, the build marker, the
// deep-link anchors, and an accessibility scan of the home page before and after a run.

test("every page carries the policy and the build marker", async ({ page }) => {
  for (const path of ["/", "/rules/", "/rules/hide-foreign-keys/", "/about/"]) {
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
  await page.goto("/rules/hide-foreign-keys/#how-to-fix-it");
  await expect(page.locator("h2#how-to-fix-it")).toHaveText("How to fix it");
  await expect(page.locator("h2#how-to-fix-it")).toBeInViewport();
  await page.goto("/rules/#formatting");
  await expect(page.locator("h2#formatting")).toBeInViewport();
  await page.goto("/about/#verify");
  await expect(page.locator("h2#verify")).toBeInViewport();
});

test("the home page has no accessibility violations before or after a run", async ({ page }) => {
  await page.goto("/");
  const before = await new AxeBuilder({ page }).analyze();
  expect(before.violations).toEqual([]);
  await page.getByRole("button", { name: "Try the sample project" }).click();
  await expect(page.locator("#results")).toBeVisible();
  await page.locator("#results .group").first().locator("summary").click();
  const after = await new AxeBuilder({ page }).analyze();
  expect(after.violations).toEqual([]);
});

test("a rule page has no accessibility violations", async ({ page }) => {
  await page.goto("/rules/hide-foreign-keys/");
  const scan = await new AxeBuilder({ page }).analyze();
  expect(scan.violations).toEqual([]);
});
