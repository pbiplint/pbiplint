import type { LintResult } from "../engine/lint.js";
import { defaultRules } from "../rules/index.js";
import type { Severity } from "../rules/types.js";
import type { FormatOptions, RuleHelp } from "./text.js";

const LEVEL: Record<Severity, "error" | "warning" | "note"> = {
  3: "error",
  2: "warning",
  1: "note",
};

/** Rule summaries are Markdown with inline code; SARIF's plain-text slot gets them without the backticks. */
const plain = (markdown: string): string => markdown.replace(/`/g, "");

export function formatSarif(result: LintResult, options: FormatOptions = {}): string {
  const byId = new Map((options.rules ?? defaultRules).map((r) => [r.id, r]));
  // Code scanning resolves artifact URIs against the repository root, so the caller can prefix the
  // model root's path. Finding locations themselves stay relative to the model root.
  const prefix = options.pathPrefix ?? "";
  const uri = (file: string): string => (prefix ? `${prefix}/${file}` : file);
  // GitHub renders help.markdown beside the alert and ignores helpUri, so the page link rides
  // inside the help block as well.
  const helpFor = (id: string, description: string, url: string): RuleHelp =>
    options.help?.[id] ?? {
      text: `${plain(description)}\n\nRead more: ${url}`,
      markdown: `${description}\n\nRead more: ${url}`,
    };
  const rules = result.groups.map((g) => {
    const full = byId.get(g.rule.id);
    return {
      id: g.rule.id,
      name: g.rule.name,
      shortDescription: { text: g.rule.name },
      fullDescription: full
        ? { text: plain(full.description), markdown: full.description }
        : { text: g.rule.name },
      help: helpFor(g.rule.id, full?.description ?? g.rule.name, g.rule.url),
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
