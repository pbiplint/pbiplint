import { AxeBuilder } from "@axe-core/playwright";
import type { Page } from "@playwright/test";
import { cpSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test, type Seen } from "./fixtures.js";
import { setFolder } from "./folder-input.js";
import { withTempFolder } from "./temp-folder.js";

// A team's own rules on the site: a folder whose pbiplint.config.json names rule files, given to
// the page as a folder is. The unit tests hold the reader, the results' DOM, and the export; this
// holds what a real browser does with them, and the requests around a drop. The custom rules code
// is the site's own chunk, fetched once the page is idle and before anything is given to it, so
// the Privacy Promise's first check stays true word for word: no request follows a drop.

const model = fileURLToPath(
  new URL("../../../tests/fixtures/custom-rules.SemanticModel", import.meta.url),
);
const cliFixture = fileURLToPath(new URL("../../cli/test/fixtures/custom-rules", import.meta.url));
const fixtureConfig = readFileSync(join(cliFixture, "pbiplint.config.json"), "utf8");

/** Team/: the CLI's custom rules fixture (config and rule files) beside the model it lints. */
function team(dir: string, config = fixtureConfig): void {
  const root = join(dir, "Team");
  cpSync(model, join(root, "custom-rules.SemanticModel"), { recursive: true });
  cpSync(join(cliFixture, "rules"), join(root, "rules"), { recursive: true });
  writeFileSync(join(root, "pbiplint.config.json"), config);
}

const chunkOn = (origin: string) => (url: string) =>
  url.startsWith(`${origin}/assets/custom-rules-`) && url.endsWith(".js");

/**
 * Waits for the custom rules chunk, which the page asks for once it is idle, and for the network to
 * settle after it; returns how many requests the page had made by then. The chunk is asked for
 * exactly once, from the page's own origin.
 */
async function settledWithChunk(page: Page, seen: Seen, baseURL: string): Promise<number> {
  const origin = new URL(baseURL).origin;
  await expect.poll(() => seen.requests.filter(chunkOn(origin)).length).toBe(1);
  await page.waitForLoadState("networkidle");
  await page.evaluate(() => document.fonts.ready);
  return seen.requests.length;
}

/** Two frames and the fonts, so whatever the results need has been asked for by now. */
async function painted(page: Page): Promise<void> {
  await page.evaluate(
    () => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))),
  );
  await page.evaluate(() => document.fonts.ready);
}

test("lints a folder with the team's rules its config names, with no request after the drop", async ({
  page,
  seen,
  baseURL,
  context,
  browserName,
}) => {
  if (browserName === "chromium")
    await context.grantPermissions(["clipboard-write", "clipboard-read"]);
  const before = await settledWithChunk(page, seen, baseURL!);
  await withTempFolder("pbiplint-custom-rules-", team, async (dir) => {
    await setFolder(page.locator("#folder-input"), join(dir, "Team"));
    const results = page.locator("#results");
    await expect(results.locator("h2").first()).toHaveText(/^Results for Team \(model, /);
    await expect(page.locator("#status")).toBeHidden();

    // The team's group: tagged as the team's, with its file and description, and no rule page.
    const group = results.locator("details.group", { hasText: "Measures sit in a display folder" });
    await expect(group).toHaveCount(1);
    await expect(group.locator(".team-tag")).toHaveText("Your team's rule");
    await group.locator("summary").click();
    await expect(group).toContainText(
      "TEAM_MEASURES_IN_FOLDERS · Team conventions · rules/team.json",
    );
    await expect(group.locator(".rule-description")).toHaveText(
      "Every measure goes in a display folder, so the field list stays easy to browse as the model grows.",
    );
    await expect(group.locator("a[href*='/rules/']")).toHaveCount(0);

    // The team's rule that could not run, named with its file among the notices.
    await expect(
      results.locator(".notice", { hasText: "The custom rule TEAM_VISIBLE in rules/team.json" }),
    ).toHaveCount(1);

    // The team's category has a filter of its own, after the eight, and it works.
    const filter = results.getByRole("checkbox", { name: "Team conventions", exact: true });
    await expect(filter).toBeChecked();
    await filter.uncheck();
    await expect(group).toBeHidden();
    await filter.check();
    await expect(group).toBeVisible();

    // The rule files are among the files read.
    await results.locator("details.files summary").click();
    await expect(results.locator("details.files li", { hasText: "(custom rules)" })).toHaveText([
      "rules/more.json (custom rules)",
      "rules/team.json (custom rules)",
    ]);

    // The results pass the scan in both themes.
    for (const colorScheme of ["light", "dark"] as const) {
      await page.emulateMedia({ colorScheme });
      const scan = await new AxeBuilder({ page }).analyze();
      expect(
        scan.violations.map((v) => `${v.id} (${v.impact}): ${v.nodes.length} node(s)`),
        colorScheme,
      ).toEqual([]);
    }

    // The copy for an assistant names the team's rule and its file. Only Chromium lets a test read
    // the clipboard back; the unit tests hold the copy's text in every engine.
    const copy = page.locator(".export button").nth(1);
    await expect(copy).toHaveText("Copy for an AI assistant");
    await copy.click();
    await expect(copy).toHaveText("Copied");
    if (browserName === "chromium") {
      const text = await page.evaluate(() => navigator.clipboard.readText());
      expect(text).toContain("A rule marked as the team's own comes from the team's rule file");
      expect(text).toContain("TEAM_MEASURES_IN_FOLDERS");
      expect(text).toContain("rules/team.json");
      expect(text).toContain("Custom rules in pbiplint: https://pbiplint.com/custom-rules/");
    }

    // Nothing at all was asked for once the folder was given: the chunk came before it.
    await painted(page);
    expect(seen.requests.slice(before)).toEqual([]);
  });
});

test("the sample makes no request, the custom rules chunk having come at idle", async ({
  page,
  seen,
  baseURL,
}) => {
  const before = await settledWithChunk(page, seen, baseURL!);
  await page.getByRole("button", { name: "Try the sample project" }).click();
  await expect(page.locator("#results .summary")).toContainText("findings");
  await expect(page.locator("#results .team-tag")).toHaveCount(0);
  await painted(page);
  expect(seen.requests.slice(before)).toEqual([]);
});

test("a folder whose config names no rule files makes no request and shows no team's rule", async ({
  page,
  seen,
  baseURL,
}) => {
  const before = await settledWithChunk(page, seen, baseURL!);
  await withTempFolder(
    "pbiplint-no-custom-rules-",
    (dir) => team(dir, '{ "rules": { "PARSE_ISSUE": "warning" } }'),
    async (dir) => {
      await setFolder(page.locator("#folder-input"), join(dir, "Team"));
      const results = page.locator("#results");
      await expect(results.locator("h2").first()).toHaveText(/^Results for Team \(model, /);
      await expect(results.locator(".team-tag")).toHaveCount(0);
      await results.locator("details.files summary").click();
      await expect(results.locator("details.files li", { hasText: "(custom rules)" })).toHaveCount(
        0,
      );
      await painted(page);
      expect(seen.requests.slice(before)).toEqual([]);
    },
  );
});

test("refuses a rule file outside the folder given, and lints nothing", async ({ page }) => {
  await withTempFolder(
    "pbiplint-custom-rules-outside-",
    (dir) => {
      team(dir);
      writeFileSync(
        join(dir, "Team", "custom-rules.SemanticModel", "pbiplint.config.json"),
        '{ "customRules": ["../rules/team.json"] }',
      );
    },
    async (dir) => {
      await setFolder(
        page.locator("#folder-input"),
        join(dir, "Team", "custom-rules.SemanticModel"),
      );
      await expect(page.locator("#status")).toContainText(
        "customRules: ../rules/team.json is outside the folder you dropped or chose; drop or choose the folder that holds both the project and its rule files",
      );
      await expect(page.locator("#results")).toBeHidden();
    },
  );
});

test("refuses a rule file that is not in the folder given, and lints nothing", async ({ page }) => {
  await withTempFolder(
    "pbiplint-custom-rules-missing-",
    (dir) => team(dir, '{ "customRules": ["rules/gone.json"] }'),
    async (dir) => {
      await setFolder(page.locator("#folder-input"), join(dir, "Team"));
      await expect(page.locator("#status")).toContainText(
        "customRules: rules/gone.json is not in the folder you dropped or chose; the path is relative to the folder pbiplint.config.json is in",
      );
      await expect(page.locator("#results")).toBeHidden();
    },
  );
});
