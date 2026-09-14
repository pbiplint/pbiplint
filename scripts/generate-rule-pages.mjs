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
  const sources = rule.status === "builtin" ? rule.references : [RULESET_URL, ...rule.references];
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
    "",
    "## Why it matters",
    "",
    "TODO: the practical consequence for a report author or a refresh, in pbiplint's own words.",
    "",
    "## How to fix it",
    "",
    "TODO: a route that needs no third-party tool: Power BI Desktop, Power Query, the source, or the TMDL file.",
    ...(rule.status === "needsLiveModel"
      ? [
          "",
          "pbiplint cannot evaluate this rule from files; it appears in `pbiplint rules` as needing a live model.",
        ]
      : []),
    "",
    "## Links",
    "",
    ...sources.map((u) => `- ${u}`),
    "",
  ];
  writeFileSync(path, lines.join("\n"));
  written++;
}
console.log(`wrote ${written} rule page(s)`);
