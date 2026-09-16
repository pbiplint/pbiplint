// @vitest-environment happy-dom
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { beforeAll, describe, expect, it } from "vitest";

// The home page on a browser with the File System Access API: window.showDirectoryPicker exists
// before main.ts loads, so the "Choose a folder" button takes the picker route.
const html = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "../index.html"), "utf8");
const body = html
  .slice(html.indexOf("<body>") + 6, html.indexOf("</body>"))
  .replace(/<script[\s\S]*?<\/script>/, "");
const settle = async (): Promise<void> => {
  for (let i = 0; i < 5; i++) await new Promise((r) => setTimeout(r, 0));
};

type Handle =
  | { kind: "file"; name: string; getFile(): Promise<File> }
  | { kind: "directory"; name: string; values(): AsyncIterable<Handle> };

let pick: () => Promise<Handle>;
const statusText = (): string => document.getElementById("status")!.textContent ?? "";

describe("home page with a folder picker", () => {
  beforeAll(async () => {
    document.body.innerHTML = body;
    Object.assign(window, { showDirectoryPicker: () => pick() });
    await import("../src/main.js");
  });
  it("says it is reading files once a folder is chosen, then shows the results", async () => {
    const seen: string[] = [];
    pick = async () => {
      seen.push(`picked:${statusText()}`);
      return {
        kind: "directory",
        name: "Demo.SemanticModel",
        async *values() {
          seen.push(`walk:${statusText()}`);
          yield {
            kind: "file",
            name: "model.tmdl",
            getFile: async () => new File(["model Model\n"], "model.tmdl"),
          };
        },
      };
    };
    document.getElementById("choose-folder")!.click();
    await settle();
    expect(seen).toEqual(["picked:", "walk:Reading files..."]);
    expect(document.getElementById("status")!.hidden).toBe(true);
    expect(document.querySelector("#results h2")!.textContent).toBe(
      "Results for Demo.SemanticModel (1 file)",
    );
  });
  it("leaves the status line alone when the dialog is cancelled", async () => {
    pick = async () => {
      throw new DOMException("cancelled", "AbortError");
    };
    document.getElementById("choose-folder")!.click();
    await settle();
    expect(document.getElementById("status")!.hidden).toBe(true);
    expect(document.getElementById("results")!.hidden).toBe(false);
  });
});
