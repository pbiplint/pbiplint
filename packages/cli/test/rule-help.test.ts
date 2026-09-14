import { readFileSync } from "node:fs";
import { defaultRules, ruleUrl, slug } from "@pbiplint/core";
import { describe, expect, it } from "vitest";
import { RULE_HELP } from "../src/rule-help.data.js";

const rulesDir = new URL("../../../rules/", import.meta.url).pathname;

const normalize = (s: string): string => s.replace(/\s+/g, " ").trim();

/** The section between one `## ` heading and the next, or "" when the page has none. */
const section = (text: string, heading: string): string =>
  text.split(`## ${heading}`)[1]?.split(/\n## /)[0] ?? "";

// rule-help.data.ts is generated from the pages by scripts/sync-rule-pages.mjs; these checks fail
// when a page changes and the script was not rerun.
describe.each(defaultRules.map((r) => [r.id, r] as const))("SARIF help for %s", (_id, rule) => {
  const page = readFileSync(`${rulesDir}${slug(rule.id)}.md`, "utf8");
  const help = RULE_HELP[rule.id];

  it("carries the page's Why, How to fix, and Quirks sections and links to the page", () => {
    expect(help).toBeDefined();
    const markdown = normalize(help!.markdown);
    for (const heading of ["Why it matters", "How to fix it", "Quirks"]) {
      const body = normalize(section(page, heading));
      if (body) expect(markdown, heading).toContain(body);
    }
    expect(markdown).toContain(`Read more: ${ruleUrl(rule.id)}`);
  });

  it("has a plain-text form with no Markdown syntax", () => {
    expect(help!.text).not.toContain("`");
    expect(help!.text).not.toContain("### ");
    expect(help!.text).not.toMatch(/\]\(/);
    expect(help!.text).toContain("Read more: ");
  });
});
