import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { slug } from "../src/model/names.js";
import { defaultRules } from "../src/rules/index.js";
import { SEVERITY_LABEL } from "../src/rules/types.js";

const rulesDir = new URL("../../../rules/", import.meta.url).pathname;

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
    expect(text).not.toContain("\u2014");
  });
});
