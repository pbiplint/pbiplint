// @vitest-environment happy-dom
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { beforeEach, describe, expect, it, vi } from "vitest";

// main.ts reads the page's elements as it loads, so each case here needs its own module instance:
// a fresh body, the registry reset, and a fresh import.
const html = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "../index.html"), "utf8");
const body = html
  .slice(html.indexOf("<body>") + 6, html.indexOf("</body>"))
  .replace(/<script[\s\S]*?<\/script>/, "");

describe("the elements the home page needs", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("loads against the page it ships with", async () => {
    document.body.innerHTML = body;
    await expect(import("../src/main.js")).resolves.toBeDefined();
  });

  it("says which element is missing", async () => {
    document.body.innerHTML = body.replace(/ id="announce"/, "");
    await expect(import("../src/main.js")).rejects.toThrow("The home page has no #announce");
  });

  it("says which element is the wrong type, rather than trusting the cast", async () => {
    // A #paste that stopped being a textarea would read .value as undefined and lint an empty
    // paste, with nothing to say where the mistake was.
    document.body.innerHTML = body.replace(
      /<textarea[\s\S]*?<\/textarea>/,
      '<div id="paste"></div>',
    );
    await expect(import("../src/main.js")).rejects.toThrow(
      "The home page's #paste is a div, not HTMLTextAreaElement",
    );
  });
});
