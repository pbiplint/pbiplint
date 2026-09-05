import type { LintResult } from "../engine/lint.js";
import { defaultRules } from "../rules/index.js";
import type { Severity } from "../rules/types.js";
import type { FormatOptions } from "./text.js";

const LEVEL: Record<Severity, "error" | "warning" | "note"> = {
  3: "error",
  2: "warning",
  1: "note",
};

export function formatSarif(result: LintResult, options: FormatOptions = {}): string {
  const byId = new Map((options.rules ?? defaultRules).map((r) => [r.id, r]));
  // Code scanning resolves artifact URIs against the repository root, so the caller can prefix the
  // model root's path. Finding locations themselves stay relative to the model root.
  const prefix = options.pathPrefix ?? "";
  const uri = (file: string): string => (prefix ? `${prefix}/${file}` : file);
  const rules = result.groups.map((g) => {
    const full = byId.get(g.rule.id);
    return {
      id: g.rule.id,
      name: g.rule.name,
      shortDescription: { text: g.rule.name },
      fullDescription: { text: full?.description ?? g.rule.name },
      helpUri: g.rule.url,
      defaultConfiguration: { level: LEVEL[g.rule.severity] },
      properties: { category: g.rule.category },
    };
  });
  const results = result.groups.flatMap((g, ruleIndex) =>
    g.findings.map((f) => ({
      ruleId: g.rule.id,
      ruleIndex,
      level: LEVEL[g.rule.severity],
      message: { text: `${f.objectName}: ${g.rule.name}${f.detail ? ` (${f.detail})` : ""}` },
      ...(f.location
        ? {
            locations: [
              {
                physicalLocation: {
                  artifactLocation: { uri: uri(f.location.file) },
                  region: { startLine: f.location.line },
                },
              },
            ],
          }
        : {}),
    })),
  );
  const doc = {
    $schema: "https://json.schemastore.org/sarif-2.1.0.json",
    version: "2.1.0",
    runs: [
      {
        tool: {
          driver: {
            name: "pbiplint",
            version: options.toolVersion ?? "0.0.0",
            informationUri: "https://pbiplint.com",
            rules,
          },
        },
        results,
      },
    ],
  };
  return JSON.stringify(doc, null, 2) + "\n";
}
