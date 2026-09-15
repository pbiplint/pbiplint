// @vitest-environment happy-dom
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { beforeAll, describe, expect, it } from "vitest";

// happy-dom resolves a relative URL against the page's http base, so the file path is built
// from import.meta.url instead of new URL(..., import.meta.url).
const html = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "../index.html"), "utf8");
const body = html
  .slice(html.indexOf("<body>") + 6, html.indexOf("</body>"))
  .replace(/<script[\s\S]*?<\/script>/, "");
const tick = (): Promise<void> => new Promise((r) => setTimeout(r, 0));

describe("home page", () => {
  beforeAll(async () => {
    document.body.innerHTML = body;
    await import("../src/main.js");
  });
  it("lints the sample project from its button", async () => {
    document.getElementById("try-sample")!.click();
    await tick();
    const results = document.getElementById("results")!;
    expect(results.hidden).toBe(false);
    expect(results.querySelector(".summary")!.textContent).toContain("161 findings");
    expect(document.getElementById("status")!.hidden).toBe(true);
  });
  it("lints pasted TMDL and complains about an empty paste", async () => {
    const paste = document.getElementById("paste") as HTMLTextAreaElement;
    paste.value = "";
    document.getElementById("lint-paste")!.click();
    const status = document.getElementById("status")!;
    expect(status.hidden).toBe(false);
    expect(status.textContent).toBe("Paste some TMDL first.");
    paste.value = "table Sales\n\tcolumn Amount\n\t\tdataType: double\n\t\tsourceColumn: Amount\n";
    document.getElementById("lint-paste")!.click();
    await tick();
    expect(status.hidden).toBe(true);
    expect(document.querySelector("#results h2")!.textContent).toBe("Results for pasted TMDL");
    expect(document.querySelector("#results .summary")!.textContent).toContain("in 1 file");
  });
});
