import { cpSync, mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, URL } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { stampVisuals } from "../make-big-report.mjs";

const fixture = fileURLToPath(new URL("../../tests/fixtures/base-rules-fails", import.meta.url));
const pages = (dir) => join(dir, "Base-rules-fails.Report", "definition", "pages");

/** Every visual folder in the report, as [page, folder name]. */
function visualFolders(dir) {
  return readdirSync(pages(dir), { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .flatMap((page) => {
      let names;
      try {
        names = readdirSync(join(pages(dir), page.name, "visuals"));
      } catch {
        return [];
      }
      return names.map((name) => [page.name, name]);
    });
}

describe("stampVisuals", () => {
  const made = [];
  afterEach(() => {
    for (const dir of made.splice(0)) rmSync(dir, { recursive: true, force: true });
  });
  const copy = () => {
    const dir = mkdtempSync(join(tmpdir(), "big-report-"));
    made.push(dir);
    cpSync(fixture, dir, { recursive: true });
    return dir;
  };

  it("fills the report to the total with uniquely named visual folders, stamped on the first page", () => {
    const dir = copy();
    const before = visualFolders(dir);
    expect(stampVisuals(dir, 300)).toBe(300);
    const after = visualFolders(dir);
    expect(after).toHaveLength(300);
    const names = after.map(([, name]) => name);
    expect(new Set(names).size).toBe(300);
    for (const name of names) expect(name).toMatch(/^[0-9a-f]{20}$/);
    // Only the first page in the fixture's page order grew; every other page is as it was.
    const stamped = after.filter(
      ([page, name]) => !before.some(([p, n]) => p === page && n === name),
    );
    expect(stamped).toHaveLength(300 - before.length);
    expect(new Set(stamped.map(([page]) => page))).toEqual(new Set(["ReportSection"]));
    // Each stamped visual.json parses, names its own folder, is a card, and sits inside the page.
    const page = JSON.parse(readFileSync(join(pages(dir), "ReportSection", "page.json"), "utf8"));
    const tabOrders = [];
    for (const [pageName, name] of stamped) {
      const visual = JSON.parse(
        readFileSync(join(pages(dir), pageName, "visuals", name, "visual.json"), "utf8"),
      );
      expect(visual.name).toBe(name);
      expect(visual.visual.visualType).toBe("card");
      const { x, y, width, height, tabOrder } = visual.position;
      expect(x).toBeGreaterThanOrEqual(0);
      expect(y).toBeGreaterThanOrEqual(0);
      expect(x + width).toBeLessThanOrEqual(page.width);
      expect(y + height).toBeLessThanOrEqual(page.height);
      tabOrders.push(tabOrder);
    }
    // The tab order runs in sequence, one step per stamped visual.
    tabOrders.sort((a, b) => a - b);
    expect(tabOrders.every((t, i) => i === 0 || t === tabOrders[i - 1] + 1)).toBe(true);
  });
});
