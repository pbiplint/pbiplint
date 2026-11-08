import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { Page } from "@playwright/test";
import { expect, test } from "./fixtures.js";

// A script copied from Power BI Desktop's TMDL view, pasted into the box, gives the findings of
// the objects it holds (#274). TMDL view writes `createOrReplace`, a blank line, and the object's
// TMDL one tab deeper; a single measure goes under a `ref table` line.

const customer = readFileSync(
  fileURLToPath(
    new URL(
      "../../../examples/messy-sales/Messy Sales Demo.SemanticModel/definition/tables/Customer.tmdl",
      import.meta.url,
    ),
  ),
  "utf8",
);
const asScript = (text: string): string =>
  `createOrReplace\n\n${text
    .split("\n")
    .map((l) => (l.trim() === "" ? l : `\t${l}`))
    .join("\n")}`;

/** Pastes `text`, lints it, and gives back the summary line once the results show. */
async function lintPaste(page: Page, text: string): Promise<string> {
  await page.locator("#paste").fill(text);
  await page.getByRole("button", { name: "Lint pasted TMDL" }).click();
  await expect(page.locator("#results h2")).toHaveText("Results for pasted TMDL (model, 1 file)");
  return (await page.locator("#results p.summary").textContent()) ?? "";
}

test("a table copied from TMDL view gives the same findings as its file", async ({ page }) => {
  const plain = await lintPaste(page, customer);
  expect(plain).toMatch(/^\d+ findings/);
  expect(plain).toContain("rules skipped (the input is part of a model)");
  const script = await lintPaste(page, asScript(customer));
  expect(script).toBe(plain);
});

test("a measure copied from TMDL view is linted under its table", async ({ page }) => {
  await lintPaste(
    page,
    "createOrReplace\n\n\tref table Sales\n\n\t\tmeasure 'Total Units' = SUM(Sales[Units])\n",
  );
  await expect(page.locator("#results")).toContainText("PROVIDE_FORMAT_STRING_FOR_MEASURES");
  await expect(page.locator("#results")).not.toContainText("PARSE_ISSUE");
});
