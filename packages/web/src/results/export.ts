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
 * Copies the text with the async clipboard API. The write goes out in the caller's own turn rather
 * than from a later microtask, because a clipboard write is gesture gated and WebKit wants the
 * gesture still on the stack. Whatever the environment does about that, the caller sees one
 * failure path: a throw from reading the property and a throw from the call itself both come back
 * as a rejection, alongside the rejection a refused permission gives. An insecure context or an
 * older browser has no `navigator.clipboard` at all, which is the case the explicit throw covers.
 */
export function copy(file: ExportFile): Promise<void> {
  try {
    const clipboard: Clipboard | undefined = navigator.clipboard;
    if (!clipboard) throw new Error("Clipboard access is not available");
    return Promise.resolve(clipboard.writeText(file.text));
  } catch (e) {
    return Promise.reject(e instanceof Error ? e : new Error(String(e)));
  }
}
