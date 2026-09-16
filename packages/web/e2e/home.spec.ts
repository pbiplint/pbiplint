import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test, type Page } from "@playwright/test";

// The home page in a real browser: the inputs, the results, and the behaviours the happy-dom unit
// tests can only approximate (drag events, a folder input, downloads, focus, network silence).

const zoo = fileURLToPath(
  new URL("../../../tests/fixtures/rule-zoo.SemanticModel", import.meta.url),
);

/** Console errors and off-origin requests, collected from page load until the assertion. */
function watch(page: Page): { errors: string[]; offOrigin: string[] } {
  const errors: string[] = [];
  const offOrigin: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("request", (request) => {
    const url = request.url();
    if (/^https?:/.test(url) && !url.startsWith("http://localhost:")) offOrigin.push(url);
  });
  return { errors, offOrigin };
}

test.beforeEach(async ({ page }) => {
  await page.goto("/");
});

test("lints the sample project, announces the result, and touches no other origin", async ({
  page,
}) => {
  const seen = watch(page);
  await page.getByRole("button", { name: "Try the sample project" }).click();
  const results = page.locator("#results");
  await expect(results).toBeVisible();
  await expect(results.locator(".summary")).toContainText(
    "161 findings (16 errors, 39 warnings, 106 info) in 11 files",
  );
  await expect(page.locator("#announce")).toHaveText(
    /^Results for the sample project \(11 files\): 161 findings/,
  );
  await expect(results.locator(".fix-first li")).toHaveCount(5);
  await expect(results.locator("details.files summary")).toHaveText("Files read (11)");
  await expect(page.locator("#status")).toBeHidden();
  expect(seen.errors).toEqual([]);
  expect(seen.offOrigin).toEqual([]);
});

test("lints pasted TMDL, and an empty paste keeps the textarea in view", async ({ page }) => {
  const lint = page.getByRole("button", { name: "Lint pasted TMDL" });
  await lint.click();
  await expect(page.locator("#status")).toHaveText("Paste some TMDL first.");
  await expect(page.locator("#paste")).toBeInViewport();
  await expect(page.locator("#results")).toBeHidden();
  await page
    .locator("#paste")
    .fill("table Sales\n\tcolumn Amount\n\t\tdataType: double\n\t\tsourceColumn: Amount\n");
  await lint.click();
  await expect(page.locator("#results h2")).toHaveText("Results for pasted TMDL");
  await expect(page.locator("#status")).toBeHidden();
  await expect(page.locator("#results details.files")).toHaveCount(0);
});

test("reads a whole model from the folder input, including a file whose name starts with a space", async ({
  page,
}) => {
  // The "Choose a folder" button opens the browser's own dialog, which no test can drive; the
  // input behind it is what Firefox and Safari use, and what a test can feed a directory.
  await page.locator("#folder-input").setInputFiles(zoo);
  const results = page.locator("#results");
  await expect(results.locator("h2")).toHaveText("Results for rule-zoo.SemanticModel (17 files)");
  await results.locator("details.files summary").click();
  await expect(results.locator("details.files li")).toHaveCount(17);
  await expect(
    results.locator("details.files li", { hasText: "tables/ Spaced .tmdl" }),
  ).toHaveCount(1);
});

test("lints files dropped onto the drop zone", async ({ page }) => {
  const files: [string, string][] = ["model.tmdl", "tables/Sales.tmdl"].map((name) => [
    name.split("/").pop()!,
    readFileSync(join(zoo, "definition", name), "utf8"),
  ]);
  const dataTransfer = await page.evaluateHandle((entries: [string, string][]) => {
    const dt = new DataTransfer();
    for (const [name, text] of entries) dt.items.add(new File([text], name));
    return dt;
  }, files);
  await page.dispatchEvent("#drop", "drop", { dataTransfer });
  await expect(page.locator("#results .summary")).toContainText("in 2 files");
  await expect(page.locator("#drop")).not.toHaveClass(/over/);
});

test("keeps the drop zone lit across its children and unlights it when the drag ends", async ({
  page,
}) => {
  const zone = page.locator("#drop");
  const child = zone.locator("p");
  await zone.dispatchEvent("dragenter");
  await expect(zone).toHaveClass(/over/);
  // Entering the child fires dragenter on it and dragleave on the zone, in that order.
  await child.dispatchEvent("dragenter");
  await zone.dispatchEvent("dragleave");
  await expect(zone).toHaveClass(/over/);
  await zone.dispatchEvent("dragenter");
  await child.dispatchEvent("dragleave");
  await zone.dispatchEvent("dragleave");
  await expect(zone).not.toHaveClass(/over/);
  // A drag that stops sending dragover (cancelled, or gone out of the window) unlights by itself.
  await zone.dispatchEvent("dragenter");
  await zone.dispatchEvent("dragover");
  await expect(zone).toHaveClass(/over/);
  await expect(zone).not.toHaveClass(/over/, { timeout: 3000 });
});

test("downloads the Markdown report", async ({ page }) => {
  await page.getByRole("button", { name: "Try the sample project" }).click();
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "Download Markdown" }).click(),
  ]);
  expect(download.suggestedFilename()).toMatch(/\.md$/);
  const text = readFileSync((await download.path())!, "utf8");
  expect(text).toContain("161 findings");
});

test("a keyboard user can reach a findings table that scrolls sideways", async ({ page }) => {
  await page.setViewportSize({ width: 400, height: 800 });
  await page.getByRole("button", { name: "Try the sample project" }).click();
  const group = page.locator("#results .group").first();
  await group.locator("summary").click();
  const wrap = group.locator(".table-wrap");
  await expect(wrap).toHaveAttribute("tabindex", "0");
  await expect(wrap).toHaveRole("region");
  await wrap.focus();
  await expect(wrap).toBeFocused();
  const scrollable = await wrap.evaluate((el) => el.scrollWidth > el.clientWidth);
  expect(scrollable).toBe(true);
});
