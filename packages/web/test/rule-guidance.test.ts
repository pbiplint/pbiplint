import { readFileSync } from "node:fs";
import { defaultRules, ignoreHelp, slug } from "@pbiplint/core";
import { describe, expect, it } from "vitest";
import { RULE_GUIDANCE } from "../src/results/rule-guidance.data.js";

const rulesDir = new URL("../../../rules/", import.meta.url).pathname;

/** The section between one `## ` heading and the next, trimmed, or "" when the page has none. */
const section = (text: string, heading: string): string =>
  (text.split(`\n## ${heading}\n`)[1]?.split(/\n## /)[0] ?? "").trim();

// rule-guidance.data.ts is generated from the pages by scripts/sync-rule-pages.mjs; these checks
// fail when a page changes and the script was not rerun.
describe.each(defaultRules.map((r) => [r.id, r] as const))("guidance for %s", (_id, rule) => {
  const page = readFileSync(`${rulesDir}${slug(rule.id)}.md`, "utf8");
  const guidance = RULE_GUIDANCE[rule.id];

  it("is the page's How to fix it and When to ignore it, with the ignore line", () => {
    expect(guidance).toBeDefined();
    expect(guidance!.fix).toBe(section(page, "How to fix it"));
    const ignore = section(page, "When to ignore it");
    if (ignore) expect(guidance!.ignore).toBe(`${ignore}\n\n${ignoreHelp(rule.id, rule.scope)}`);
    else expect(guidance!.ignore).toBeUndefined();
  });
});

it("carries no rule the engine does not have", () => {
  expect(Object.keys(RULE_GUIDANCE).sort()).toEqual(defaultRules.map((r) => r.id).sort());
});
