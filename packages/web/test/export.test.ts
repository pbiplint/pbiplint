// @vitest-environment happy-dom
import { lint, resolveConfig, VERSION } from "@pbiplint/core";
import { afterEach, describe, expect, it, vi } from "vitest";
import { copy, download, exportJson, exportMarkdown } from "../src/results/export.js";
import { SAMPLE_CONFIG, SAMPLE_FILES } from "../src/sample.js";

/** The sample as the page lints it: both parts, under the sample's own config. */
const result = lint(SAMPLE_FILES, { config: resolveConfig(JSON.parse(SAMPLE_CONFIG)) });
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
    vi.useRealTimers();
  });
  it("produces the same Markdown and JSON reports as the CLI", () => {
    const md = exportMarkdown(result);
    expect(md.name).toBe("pbiplint-report.md");
    expect(md.text.startsWith("# pbiplint report")).toBe(true);
    const json = exportJson(result);
    expect(json.name).toBe("pbiplint-report.json");
    const doc = JSON.parse(json.text);
    expect(doc.summary.findings).toBe(257);
    expect(doc.layers).toEqual({
      model: { present: true, files: 14 },
      report: { present: true, files: 78 },
    });
    expect(md.text).toContain("Report at a glance");
    expect(doc.tool.version).toBe(VERSION);
  });
  it("downloads through a blob URL and revokes it only once the download can have started", () => {
    vi.useFakeTimers();
    const create = vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:test");
    const revoke = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);
    const click = vi
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(() => undefined);
    download(file);
    expect(create).toHaveBeenCalledTimes(1);
    expect(create.mock.calls[0]![0]).toBeInstanceOf(Blob);
    expect(click).toHaveBeenCalledTimes(1);
    expect(document.body.querySelector("a")).toBeNull();
    // Still live right after the click: Safari cancels a download whose URL is revoked too early.
    expect(revoke).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1000);
    expect(revoke).toHaveBeenCalledWith("blob:test");
  });
  it("copies through the clipboard API when there is one", async () => {
    const writeText = vi.fn<(text: string) => Promise<void>>().mockResolvedValue(undefined);
    setClipboard({ writeText });
    await expect(copy(file)).resolves.toBeUndefined();
    expect(writeText).toHaveBeenCalledWith("# x");
  });
  it("writes in the caller's own turn rather than from a later microtask", async () => {
    // A clipboard write is gesture gated, and WebKit wants the gesture still on the stack, so the
    // write has to go out before the click handler yields. Nothing is awaited before the
    // assertion: any await here would drain the microtask queue and hide a deferred write.
    const writeText = vi.fn<(text: string) => Promise<void>>().mockResolvedValue(undefined);
    setClipboard({ writeText });
    const promise = copy(file);
    expect(writeText).toHaveBeenCalledWith("# x");
    await expect(promise).resolves.toBeUndefined();
  });
  it("rejects rather than throws when there is no clipboard", async () => {
    setClipboard(undefined);
    // The call itself must not throw: the caller has one failure path, the rejection.
    const promise = copy(file);
    expect(promise).toBeInstanceOf(Promise);
    await expect(promise).rejects.toThrow("Clipboard access is not available");
  });
  it("rejects rather than throws when writeText itself throws", async () => {
    setClipboard({
      writeText: () => {
        throw new Error("Write permission denied by policy");
      },
    });
    const promise = copy(file);
    expect(promise).toBeInstanceOf(Promise);
    await expect(promise).rejects.toThrow("Write permission denied by policy");
  });
  it("rejects rather than throws when reading navigator.clipboard throws", async () => {
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      get() {
        throw new Error("Blocked by permissions policy");
      },
    });
    await expect(copy(file)).rejects.toThrow("Blocked by permissions policy");
  });
});
