import type { LintResult } from "../engine/lint.js";
import type { FormatOptions } from "./text.js";

export function formatJson(result: LintResult, options: FormatOptions = {}): string {
  const doc = {
    version: 1,
    tool: { name: "pbiplint", version: options.toolVersion ?? "0.0.0" },
    summary: result.summary,
    groups: result.groups.map((g) => ({
      rule: g.rule,
      count: g.findings.length,
      findings: g.findings.map((f) => ({
        objectType: f.objectType,
        objectName: f.objectName,
        ...(f.location ? { file: f.location.file, line: f.location.line } : {}),
        ...(f.detail !== undefined ? { detail: f.detail } : {}),
      })),
    })),
  };
  return JSON.stringify(doc, null, 2) + "\n";
}
