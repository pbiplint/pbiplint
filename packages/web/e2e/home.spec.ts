import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "./fixtures.js";

// The home page in a real browser: the inputs, the results, and the behaviours the happy-dom unit
// tests can only approximate (drag events, a folder input, downloads, focus). Every test also ends
// by proving no console error was written and no request left the origin (see fixtures.ts).
//
// Not covered here, and only checked by hand: the "Choose a folder" button in Chromium, which
// takes the File System Access picker and its native dialog; a screen reader actually speaking
// the live region (the test checks its text); and a drop of real files from the desktop in
// Chromium, where a synthetic File has no directory entry, so the drop test below takes the flat
// file fallback there while Firefox and WebKit take the entries branch.

const zoo = fileURLToPath(
  new URL("../../../tests/fixtures/rule-zoo.SemanticModel", import.meta.url),
);

test("lints the sample project and announces the result", async ({ page }) => {
  await page.getByRole("button", { name: "Try the sample project" }).click();
  const results = page.locator("#results");
  await expect(results).toBeVisible();
  await expect(results.locator("h2")).toHaveText(
    "Results for the sample project (model, 14 files · report, 77 files)",
  );
  await expect(results.locator(".summary")).toContainText(
    "256 findings (19 errors, 77 warnings, 160 info) in 91 files",
  );
  await expect(page.locator("#announce")).toHaveText(
    /^Results for the sample project \(model, 14 files · report, 77 files\): 256 findings/,
  );
  await expect(results.locator("section.facts h3")).toHaveText("Report at a glance");
  await expect(results.locator(".fix-first li")).toHaveCount(5);
  await expect(results.locator("details.files summary")).toHaveText("Files read (92)");
  await expect(page.locator("#status")).toBeHidden();
  // Unchecking Report hides the report's groups and leaves the model's.
  await results.getByRole("checkbox", { name: "Report", exact: true }).uncheck();
  await expect(results.locator('.group[data-layer="report"]').first()).toBeHidden();
  await expect(results.locator('.group[data-layer="model"]').first()).toBeVisible();
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
  await expect(page.locator("#results h2")).toHaveText("Results for pasted TMDL (model, 1 file)");
  await expect(page.locator("#status")).toBeHidden();
  await expect(page.locator("#results details.files")).toHaveCount(0);
});

test("reads a whole model from the folder input, including a file whose name starts with a space", async ({
  page,
}) => {
  await page.locator("#folder-input").setInputFiles(zoo);
  const results = page.locator("#results");
  await expect(results.locator("h2")).toHaveText(
    "Results for rule-zoo.SemanticModel (model, 17 files)",
  );
  await results.locator("details.files summary").click();
  await expect(results.locator("details.files li")).toHaveCount(17);
  await expect(
    results.locator("details.files li", { hasText: "tables/ Spaced .tmdl" }),
  ).toHaveCount(1);
});

test("the Choose a folder button opens the browser's file chooser where there is no folder picker", async ({
  page,
  browserName,
}) => {
  test.skip(
    browserName === "chromium",
    "Chromium has showDirectoryPicker, whose native dialog no test can drive",
  );
  const [chooser] = await Promise.all([
    page.waitForEvent("filechooser"),
    page.getByRole("button", { name: "Choose a folder" }).click(),
  ]);
  await chooser.setFiles(zoo);
  await expect(page.locator("#results h2")).toHaveText(
    "Results for rule-zoo.SemanticModel (model, 17 files)",
  );
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
  // A drag that stops sending dragover (cancelled, or gone out of the window) unlights by itself
  // one second after the last dragover, so the relight is checked well inside that second.
  await zone.dispatchEvent("dragenter");
  await zone.dispatchEvent("dragover");
  await expect(zone).toHaveClass(/over/, { timeout: 500 });
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
  expect(text).toContain("256 findings");
});

test("copies the Markdown report from the button beside the downloads", async ({
  page,
  context,
  browserName,
}) => {
  // Chrome grants clipboard-write to the focused tab by itself, but a Playwright context starts at
  // "prompt" and denies the write with nobody there to answer, so granting it is what restores the
  // visitor's Chrome. Firefox and WebKit have no such permission to grant and reject the name.
  if (browserName === "chromium") await context.grantPermissions(["clipboard-write"]);
  await page.getByRole("button", { name: "Try the sample project" }).click();
  // Found by position rather than by name, because the name is the thing that changes: a name
  // locator stops matching the moment the copy lands.
  const copy = page.locator(".export button").last();
  await expect(copy).toHaveText("Copy Markdown");
  await copy.click();
  // The label, not the clipboard contents: reading the clipboard needs a permission that is not
  // grantable in all three engines, while the label is observable everywhere and is exactly what a
  // visitor sees. This is the only real-browser cover the copy path has. It does not prove the
  // write rides the click's own gesture, which is what Safari requires: none of the three engines
  // enforces that gate here, so only the unit tests and the shape of copy() speak to it.
  await expect(copy).toHaveText("Copied");
});

test("a keyboard user can reach a findings table that scrolls sideways, and the page itself does not", async ({
  page,
}) => {
  // 320 CSS pixels is the width WCAG's reflow criterion (1.4.10) asks a page to fit without
  // scrolling sideways; a data table is exempt and scrolls in its own region instead, which is what
  // this checks. At 400 the sample's table fit in Firefox once its line numbers grew shorter.
  await page.setViewportSize({ width: 320, height: 800 });
  await page.getByRole("button", { name: "Try the sample project" }).click();
  // Pinned to one rule's group, so the ranking cannot change which table is checked. Its Location
  // column, `definition/tables/Sales.tmdl:N` in a monospaced font, is what makes it wider than the
  // viewport, and Firefox lays that column out narrowest of the three engines.
  const group = page.locator("#rule-integer-formatting");
  await group.locator("summary").click();
  const wrap = group.locator(".table-wrap");
  await expect(wrap).toHaveAttribute("tabindex", "0");
  await expect(wrap).toHaveRole("region");
  await wrap.focus();
  await expect(wrap).toBeFocused();
  const scrollable = await wrap.evaluate((el) => el.scrollWidth > el.clientWidth);
  expect(scrollable).toBe(true);
  // Everything else reflows: the header's links wrap to a second line, and a long rule id in a
  // group's meta line and a long path in the files read list break, so the page itself never
  // scrolls sideways. The sample's longest id, RELATIONSHIP_COLUMNS_SHOULD_BE_OF_INTEGER_DATA_TYPE,
  // has no hyphen to break at, and neither has a report path.
  await page.locator("#rule-relationship-columns-should-be-of-integer-data-type summary").click();
  await page.locator("#results details.files summary").click();
  const pageWidth = await page.evaluate(() => ({
    scroll: document.documentElement.scrollWidth,
    client: document.documentElement.clientWidth,
  }));
  expect(pageWidth.scroll).toBeLessThanOrEqual(pageWidth.client);
});
