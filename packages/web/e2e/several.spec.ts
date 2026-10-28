import { AxeBuilder } from "@axe-core/playwright";
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "./fixtures.js";
import { setFolder } from "./folder-input.js";

// A folder that holds several projects, given to the page as a folder is (#237, spec section 7):
// one section per project, each with its own export bar. The unit tests hold the sections' DOM;
// this holds what a real browser does with three of them on one page.

const sample = fileURLToPath(new URL("../../../examples/messy-sales", import.meta.url));
const j = (v: unknown) => JSON.stringify(v);

/**
 * #236's monorepo, from copies of the sample, as the CLI's several.test.ts builds it:
 * reports/Finance and reports/Sales, each a .pbip whose report reads models/Shared.SemanticModel
 * by path, and models/Standalone.SemanticModel, a project of its own.
 */
function monorepo(root: string): void {
  const model = join(sample, "Messy Sales Demo.SemanticModel");
  cpSync(model, join(root, "models", "Shared.SemanticModel"), { recursive: true });
  cpSync(model, join(root, "models", "Standalone.SemanticModel"), { recursive: true });
  for (const name of ["Finance", "Sales"]) {
    const dir = join(root, "reports", name);
    cpSync(join(sample, "Messy Sales Demo.Report"), join(dir, `${name}.Report`), {
      recursive: true,
    });
    writeFileSync(
      join(dir, `${name}.pbip`),
      j({ version: "1.0", artifacts: [{ report: { path: `${name}.Report` } }] }),
    );
    writeFileSync(
      join(dir, `${name}.Report`, "definition.pbir"),
      j({
        version: "4.0",
        datasetReference: { byPath: { path: "../../../models/Shared.SemanticModel" } },
      }),
    );
  }
}

test("lints a folder of several projects as a section each, and copies one project's report", async ({
  page,
  context,
  browserName,
}) => {
  if (browserName === "chromium")
    await context.grantPermissions(["clipboard-write", "clipboard-read"]);
  const dir = mkdtempSync(join(tmpdir(), "pbiplint-several-"));
  try {
    monorepo(dir);
    await setFolder(page.locator("#folder-input"), dir);
    const results = page.locator("#results");
    const sections = results.locator("section.project");
    await expect(sections).toHaveCount(3);
    await expect(sections.locator(":scope > h2")).toHaveText([
      "Project 1 of 3: models/Standalone.SemanticModel",
      "Project 2 of 3: reports/Finance/Finance.pbip",
      "Project 3 of 3: reports/Sales/Sales.pbip",
    ]);
    await expect(results.locator(":scope > .summary")).toHaveText(/^3 projects, \d+ findings /);
    await expect(page.locator("#announce")).toHaveText(/^3 projects: 3 projects, \d+ findings /);
    await expect(page.locator("#status")).toBeHidden();
    // The list of projects links each section.
    await results.locator("nav a").nth(2).click();
    await expect(page).toHaveURL(/#project-3$/);
    // The model both reports read is listed under Finance, and Sales says where.
    await expect(sections.nth(2)).toContainText(
      "the model at models/Shared.SemanticModel is shared with reports/Finance/Finance.pbip; its findings are listed there",
    );

    const second = sections.nth(1);
    const copy = second.locator(".export button").nth(1);
    await expect(copy).toHaveText("Copy for an AI assistant");
    await copy.click();
    await expect(copy).toHaveText("Copied");
    await expect(second.locator(".export [role='status']")).toHaveText(
      "Report and guidance copied to the clipboard",
    );
    // The other sections' copy status stays quiet.
    await expect(sections.nth(2).locator(".export [role='status']")).toHaveText("");
    if (browserName === "chromium") {
      const text = await page.evaluate(() => navigator.clipboard.readText());
      expect(text).toContain("# pbiplint report");
      expect(text).toContain(
        "the model at models/Shared.SemanticModel is shared with reports/Sales/Sales.pbip",
      );
      expect(text).not.toContain("its findings are listed there");
    }

    // A group opened from one section's fix-first list is that section's.
    const jump = second.locator(".fix-first li a").first();
    const target = (await jump.getAttribute("href"))!;
    expect(target).toMatch(/^#project-2-rule-/);
    await jump.click();
    await expect(page.locator(`${target}`)).toHaveAttribute("open", "");

    // Every section's ids are its own, so the page passes the scan one project passes.
    const scan = await new AxeBuilder({ page }).analyze();
    expect(scan.violations.map((v) => `${v.id} (${v.impact}): ${v.nodes.length} node(s)`)).toEqual(
      [],
    );
    // The download is one project's too.
    const [download] = await Promise.all([
      page.waitForEvent("download"),
      sections.nth(0).getByRole("button", { name: "Download Markdown" }).click(),
    ]);
    const md = readFileSync((await download.path())!, "utf8");
    expect(md).toContain("# pbiplint report");
    expect(md).not.toContain("shared with");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
