#!/usr/bin/env node
// Usage: npm run build -w @pbiplint/core && node scripts/generate-rule-pages.mjs
//
// Scaffolds rules/<slug>.md for any rule that has no page yet. Existing pages are never touched:
// they are written by hand, in pbiplint's own words, and the rule-pages test fails while a page
// still carries the TODO placeholders below. The script never copies prose from the ruleset.
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { defaultRules, SEVERITY_LABEL, slug } from "@pbiplint/core";

const RULESET_URL =
  "https://github.com/microsoft/Analysis-Services/blob/master/BestPracticeRules/BPARules.json";

mkdirSync("rules", { recursive: true });
let written = 0;
for (const rule of defaultRules) {
  const path = `rules/${slug(rule.id)}.md`;
  if (existsSync(path)) continue;
  const sources = rule.status === "builtin" ? [] : [RULESET_URL];
  // A live-model rule never runs, so it has no example to show and no finding to ignore.
  const runs = rule.status !== "needsLiveModel";
  const lines = [
    "---",
    `id: ${rule.id}`,
    `name: ${JSON.stringify(rule.name)}`,
    `category: ${rule.category}`,
    `severity: ${SEVERITY_LABEL[rule.severity]}`,
    `scope: [${rule.scope.join(", ")}]`,
    `status: ${rule.status}`,
    "video:",
    "sources:",
    ...sources.map((u) => `  - ${u}`),
    "---",
    "",
    `# ${rule.name}`,
    "",
    "## What it checks",
    "",
    "TODO: the exact condition the rule tests, in one or two sentences.",
    ...(runs
      ? []
      : [
          "",
          "TODO: after the condition, say that pbiplint lists this rule but does not run it, because it needs column statistics that only a live model carries and a TMDL file does not.",
        ]),
    ...(runs
      ? [
          "",
          "## Example",
          "",
          "```tmdl fires",
          "TODO: the smallest TMDL that fires the rule",
          "```",
          "",
          "```tmdl fixed",
          "TODO: the same TMDL with the fix applied",
          "```",
        ]
      : []),
    "",
    "## Why it matters",
    "",
    "TODO: the practical consequence for a report author or a refresh, in pbiplint's own words.",
    "",
    "## How to fix it",
    "",
    "TODO: a route that needs no third-party tool: Power BI Desktop, Power Query, the source, or the TMDL file. Name the Desktop route and the TMDL property where both exist.",
    ...(runs
      ? [
          "",
          "## When to ignore it",
          "",
          "TODO: the situations in which the finding is noise, or one sentence saying there are none. The annotation and config lines are generated; do not write them here.",
        ]
      : []),
    ...(rule.references.length > 0
      ? ["", "## Links", "", ...rule.references.map((u) => `- [TODO: what this is](${u})`)]
      : []),
    "",
  ];
  writeFileSync(path, lines.join("\n"));
  written++;
}
console.log(`wrote ${written} rule page(s)`);
