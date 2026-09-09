import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { slug } from "../src/model/names.js";
import { defaultRules } from "../src/rules/index.js";
import { SEVERITY_LABEL } from "../src/rules/types.js";

const rulesDir = new URL("../../../rules/", import.meta.url).pathname;

const normalize = (s: string): string =>
  s.toLowerCase().replace(/["'`]/g, "").replace(/\s+/g, " ").trim();

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
    const firstSentence = normalize(rule.description.split(/\.\s|\n/)[0] ?? "");
    if (firstSentence.length >= 30)
      expect(normalize(section(text, "Why it matters"))).not.toContain(firstSentence);
  });
});
