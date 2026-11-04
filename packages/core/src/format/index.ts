import type { LintResult } from "../engine/lint.js";
import { formatJson } from "./json.js";
import { formatMarkdown, markdownText } from "./markdown.js";
import { formatSarif } from "./sarif.js";
import {
  COLOUR_STYLE,
  countsLine,
  factsLines,
  formatText,
  layersLine,
  layerTag,
  locationOf,
  noticeLines,
  paintCounts,
  plural,
  ruleErrorNotices,
  skippedLine,
  summaryLine,
  topGroups,
  type CountedRun,
  type FormatOptions,
  type Paint,
  type RuleHelp,
  type TextStyle,
} from "./text.js";

export const FORMATS = ["text", "json", "markdown", "sarif"] as const;
export type FormatName = (typeof FORMATS)[number];

/**
 * A lint result written out in the named format: plain text for a terminal, JSON, Markdown, or
 * SARIF for code scanning. The same as calling that format's own function, for a caller that
 * holds the format as a name, such as the CLI's `--format`.
 */
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

export {
  COLOUR_STYLE,
  countsLine,
  factsLines,
  formatJson,
  formatMarkdown,
  formatSarif,
  formatText,
  layersLine,
  layerTag,
  locationOf,
  markdownText,
  noticeLines,
  paintCounts,
  plural,
  ruleErrorNotices,
  skippedLine,
  summaryLine,
  topGroups,
};
export type { CountedRun, FormatOptions, Paint, RuleHelp, TextStyle };
