import type { LintResult } from "../engine/lint.js";
import { defaultRules } from "../rules/index.js";
import type { Severity } from "../rules/types.js";
import { VERSION } from "../version.js";
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
  // Code scanning resolves artifact URIs against the repository root, so the caller can prefix each
  // layer's root path. Finding locations themselves stay relative to their own part's root, and
  // the two parts sit in different folders, so a report finding takes reportPathPrefix.
  const prefixFor = (layer: "model" | "report"): string =>
    (layer === "report" ? (options.reportPathPrefix ?? options.pathPrefix) : options.pathPrefix) ??
    "";
  // SARIF artifact URIs are URIs, so each path segment is percent-encoded: a model folder with a
  // space in its name would otherwise produce a location code scanning cannot resolve.
  const encodePath = (p: string): string => p.split("/").map(encodeURIComponent).join("/");
  // A project's .pbip sits one level above the report root, so its path arrives as ../Demo.pbip.
  // Dot segments are collapsed the POSIX way before encoding, or the URI would name a file that
  // does not exist. A leading .. is kept: a prefix is relative to the working directory and may
  // begin with one itself. This is path normalisation, not analysis.
  const collapse = (p: string): string => {
    const out: string[] = [];
    for (const segment of p.split("/")) {
      if (segment === ".") continue;
      if (segment === ".." && out.length > 0 && out[out.length - 1] !== "..") out.pop();
      else out.push(segment);
    }
    return out.join("/");
  };
  const uri = (file: string, layer: "model" | "report"): string => {
    const prefix = prefixFor(layer);
    return encodePath(collapse(prefix ? `${prefix}/${file}` : file));
  };
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
      properties: { category: g.rule.category, layer: g.rule.layer },
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
                  artifactLocation: { uri: uri(f.location.file, f.layer) },
                  region: { startLine: f.location.line },
                },
              },
            ],
          }
        : {}),
    })),
  );
  // A run that could not read everything says so where a SARIF consumer looks for it, so nothing
  // left unread is mistaken for clean. The other diagnostic kinds describe what was read.
  const incomplete = result.diagnostics.filter(
    (d) => d.kind === "depth-cap" || d.kind === "unread-file",
  );
  const run = {
    tool: {
      driver: {
        name: "pbiplint",
        version: options.toolVersion ?? VERSION,
        informationUri: "https://pbiplint.com",
        rules,
      },
    },
    ...(incomplete.length
      ? {
          invocations: [
            {
              executionSuccessful: true,
              toolExecutionNotifications: incomplete.map((d) => ({
                level: "warning",
                descriptor: { id: d.kind },
                message: { text: d.message },
              })),
            },
          ],
        }
      : {}),
    results,
  };
  const doc = {
    $schema: "https://json.schemastore.org/sarif-2.1.0.json",
    version: "2.1.0",
    runs: [run],
  };
  return JSON.stringify(doc, null, 2) + "\n";
}
