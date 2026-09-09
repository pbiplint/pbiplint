import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { slug } from "../src/model/names.js";
import { defaultRules } from "../src/rules/index.js";
import { BPA_RULES } from "../src/rules/microsoft-bpa/bpa-rules.data.js";
import { SEVERITY_LABEL } from "../src/rules/types.js";

const rulesDir = new URL("../../../rules/", import.meta.url).pathname;
const rulesetDescription = new Map(BPA_RULES.map((r) => [r.id, r.description]));

const normalize = (s: string): string =>
  s.toLowerCase().replace(/["'`]/g, "").replace(/\s+/g, " ").trim();

/** The first paragraph of a section, whitespace collapsed, as scripts/sync-rule-summaries.mjs reads it. */
const firstParagraph = (s: string): string =>
  s
    .trim()
    .split(/\n\s*\n/)[0]
    ?.replace(/\s+/g, " ")
    .trim() ?? "";

/** The section between one `## ` heading and the next. */
const section = (text: string, heading: string): string =>
  text.split(`## ${heading}`)[1]?.split(/\n## /)[0] ?? "";

describe.each(defaultRules.map((r) => [r.id, r] as const))("rule page for %s", (_id, rule) => {
  const path = `${rulesDir}${slug(rule.id)}.md`;
  it("exists with matching frontmatter and the required sections", () => {
    expect(existsSync(path), path).toBe(true);
    const text = readFileSync(path, "utf8");
    const [, frontmatter = ""] = /^---\n([\s\S]*?)\n---\n/.exec(text) ?? [];
    expect(frontmatter).toContain(`id: ${rule.id}`);
    expect(frontmatter).toContain(`severity: ${SEVERITY_LABEL[rule.severity]}`);
    expect(frontmatter).toContain(`status: ${rule.status}`);
    expect(frontmatter).toContain(`category: ${rule.category}`);
    for (const heading of [
      "## What it checks",
      "## Why it matters",
      "## How to fix it",
      "## Links",
    ])
      expect(text, heading).toContain(heading);
    expect(text).not.toContain("TODO");
    expect(text).not.toContain("—");
  });

  it("is written in pbiplint's own words, with no Tabular Editor fix expressions", () => {
    const text = readFileSync(path, "utf8");
    // Fixes are described for Power BI Desktop, Power Query, the source, or the TMDL file,
    // never as a C# expression for another tool.
    expect(text).not.toMatch(/fix expression/i);
    // The ruleset's description is data the engine carries, not prose for the page. The
    // page's Why section must not reuse its opening sentence.
    const ruleset = rulesetDescription.get(rule.id) ?? "";
    const firstSentence = normalize(ruleset.split(/\.\s|\n/)[0] ?? "");
    if (firstSentence.length >= 30)
      expect(normalize(section(text, "Why it matters"))).not.toContain(firstSentence);
  });

  it("is the source of the rule's description in tool output", () => {
    // rule-summaries.data.ts is generated from the page; rerun scripts/sync-rule-summaries.mjs after editing.
    const text = readFileSync(path, "utf8");
    expect(rule.description).toBe(firstParagraph(section(text, "What it checks")));
  });
});
