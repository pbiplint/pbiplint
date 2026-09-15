// @vitest-environment happy-dom
import { lint, VERSION } from "@pbiplint/core";
import { afterEach, describe, expect, it, vi } from "vitest";
import { download, exportJson, exportMarkdown } from "../src/results/export.js";
import { SAMPLE_FILES } from "../src/sample.js";

const result = lint(SAMPLE_FILES);

describe("export", () => {
  afterEach(() => vi.restoreAllMocks());
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
    download({ name: "x.md", type: "text/markdown", text: "# x" });
    expect(create).toHaveBeenCalledTimes(1);
    expect(create.mock.calls[0]![0]).toBeInstanceOf(Blob);
    expect(click).toHaveBeenCalledTimes(1);
    expect(revoke).toHaveBeenCalledWith("blob:test");
    expect(document.body.querySelector("a")).toBeNull();
  });
});
