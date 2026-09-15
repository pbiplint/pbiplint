// @vitest-environment happy-dom
import { lint, VERSION } from "@pbiplint/core";
import { afterEach, describe, expect, it, vi } from "vitest";
import { copy, download, exportJson, exportMarkdown } from "../src/results/export.js";
import { SAMPLE_FILES } from "../src/sample.js";

const result = lint(SAMPLE_FILES);
const file = { name: "x.md", type: "text/markdown", text: "# x" };

/** Replaces navigator.clipboard for one test. `undefined` shadows whatever happy-dom provides. */
const original = Object.getOwnPropertyDescriptor(navigator, "clipboard");
const setClipboard = (value: unknown): void => {
  Object.defineProperty(navigator, "clipboard", { configurable: true, value });
};
const restoreClipboard = (): void => {
  if (original) Object.defineProperty(navigator, "clipboard", original);
  else Reflect.deleteProperty(navigator, "clipboard");
};

describe("export", () => {
  afterEach(() => {
    restoreClipboard();
    vi.restoreAllMocks();
  });
  it("produces the same Markdown and JSON reports as the CLI", () => {
    const md = exportMarkdown(result);
    expect(md.name).toBe("pbiplint-report.md");
    expect(md.text.startsWith("# pbiplint report")).toBe(true);
    const json = exportJson(result);
    expect(json.name).toBe("pbiplint-report.json");
    const doc = JSON.parse(json.text);
    expect(doc.summary.findings).toBe(161);
    expect(doc.tool.version).toBe(VERSION);
  });
  it("downloads through a blob URL and cleans up after itself", () => {
    const create = vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:test");
    const revoke = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);
    const click = vi
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(() => undefined);
    download(file);
    expect(create).toHaveBeenCalledTimes(1);
    expect(create.mock.calls[0]![0]).toBeInstanceOf(Blob);
    expect(click).toHaveBeenCalledTimes(1);
    expect(revoke).toHaveBeenCalledWith("blob:test");
    expect(document.body.querySelector("a")).toBeNull();
  });
  it("copies through the clipboard API when there is one", async () => {
    const writeText = vi.fn<(text: string) => Promise<void>>().mockResolvedValue(undefined);
    setClipboard({ writeText });
    await expect(copy(file)).resolves.toBeUndefined();
    expect(writeText).toHaveBeenCalledWith("# x");
  });
  it("rejects rather than throws when there is no clipboard", async () => {
    setClipboard(undefined);
    // The call itself must not throw: the caller has one failure path, the rejection.
    const promise = copy(file);
    expect(promise).toBeInstanceOf(Promise);
    await expect(promise).rejects.toThrow("Clipboard access is not available");
  });
});
