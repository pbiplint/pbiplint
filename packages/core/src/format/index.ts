import type { LintResult } from "../engine/lint.js";
import { formatJson } from "./json.js";
import { formatMarkdown } from "./markdown.js";
import { formatSarif } from "./sarif.js";
import { formatText, type FormatOptions } from "./text.js";

export const FORMATS = ["text", "json", "markdown", "sarif"] as const;
export type FormatName = (typeof FORMATS)[number];

export function formatResult(
  name: FormatName,
  result: LintResult,
  options: FormatOptions = {},
): string {
  switch (name) {
    case "text":
      return formatText(result, options);
    case "json":
      return formatJson(result, options);
    case "markdown":
      return formatMarkdown(result, options);
    case "sarif":
      return formatSarif(result, options);
    default:
      throw new Error(`Unknown format: ${String(name)}`);
  }
}

export { formatJson, formatMarkdown, formatSarif, formatText };
export type { FormatOptions };
