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
  URL.revokeObjectURL(url);
}

export const copy = (file: ExportFile): Promise<void> => navigator.clipboard.writeText(file.text);
