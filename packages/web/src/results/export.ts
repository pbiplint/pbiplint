import { formatJson, formatMarkdown, VERSION, type LintResult } from "@pbiplint/core";

export interface ExportFile {
  name: string;
  type: string;
  text: string;
}

/** The same reports the CLI writes with --format markdown and --format json. */
export const exportMarkdown = (result: LintResult): ExportFile => ({
  name: "pbiplint-report.md",
  type: "text/markdown",
  text: formatMarkdown(result, { toolVersion: VERSION }),
});

export const exportJson = (result: LintResult): ExportFile => ({
  name: "pbiplint-report.json",
  type: "application/json",
  text: formatJson(result, { toolVersion: VERSION }),
});

/** Offers the text as a download through a same-origin blob URL. No request leaves the page. */
export function download(file: ExportFile): void {
  const url = URL.createObjectURL(new Blob([file.text], { type: file.type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = file.name;
  document.body.append(a);
  a.click();
  a.remove();
  // Revoked late, not right after the click: Safari has cancelled downloads whose blob URL was
  // released before the navigation it started had a chance to begin.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * Copies the text with the async clipboard API. An insecure context or an older browser has no
 * `navigator.clipboard` at all, so the miss comes back as a rejected promise rather than a throw:
 * callers then have one failure path to handle instead of two.
 */
export function copy(file: ExportFile): Promise<void> {
  const clipboard: Clipboard | undefined = navigator.clipboard;
  return clipboard
    ? clipboard.writeText(file.text)
    : Promise.reject(new Error("Clipboard access is not available"));
}
