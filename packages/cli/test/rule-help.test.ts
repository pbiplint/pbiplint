import { readFileSync } from "node:fs";
import { defaultRules, ignoreHelp, ruleUrl, slug } from "@pbiplint/core";
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

  it("carries the page's Why, How to fix, When to ignore, and Quirks sections and links to the page", () => {
    expect(help).toBeDefined();
    const markdown = normalize(help!.markdown);
    for (const heading of ["Why it matters", "How to fix it", "When to ignore it", "Quirks"]) {
      const body = normalize(section(page, heading));
      if (body) expect(markdown, heading).toContain(body);
    }
    if (section(page, "When to ignore it"))
      expect(markdown).toContain(normalize(ignoreHelp(rule.id, rule.scope)));
    if (section(page, "Example")) {
      // The template allows a sentence or two around the fences, so pin the captions and their
      // reduced info strings within the Example section rather than right after its heading. A
      // tmdl fence reduces to tmdl; a pbir fence reduces to json and its caption names the file
      // the document stands for, except a tree.json, whose keys name its files.
      const example = markdown.split("### Example")[1]?.split("### Why it matters")[0] ?? "";
      expect(example).not.toBe("");
      const fences = [
        ...section(page, "Example").matchAll(/^```(tmdl|pbir) (fires|fixed)(?: (\S+))?[ \t]*$/gm),
      ];
      expect(new Set(fences.map((m) => m[2]))).toEqual(new Set(["fires", "fixed"]));
      for (const [, form, kind, file] of fences) {
        const caption = kind === "fires" ? "Fires the rule" : "After the fix";
        const named = form === "pbir" && file !== "tree.json" ? ` in ${file}` : "";
        const language = form === "pbir" ? "json" : "tmdl";
        expect(example).toContain(`**${caption}${named}** \`\`\`${language}`);
      }
      // A page whose example runs under a config shows that config. The help captions it with the
      // file and hands a Markdown reader a plain json fence, not the page's info string.
      if (/^```json pbiplint\.config\.json[ \t]*$/m.test(section(page, "Example")))
        expect(example).toContain("**pbiplint.config.json** ```json");
      expect(example).not.toContain("json pbiplint.config.json");
    }
    expect(markdown).toContain(`Read more: ${ruleUrl(rule.id)}`);
  });

  it("has a plain-text form with no Markdown syntax", () => {
    // A code span leaves this shape behind once its delimiters are gone. Backticks a sentence is
    // about, such as the ``` that opens a TMDL expression block, are its content rather than
    // syntax, so they stay: PARSE_ISSUE reads "open and close with ``` on their own lines".
    expect(help!.text).not.toMatch(/`[^`\n]+`/);
    expect(help!.text).not.toMatch(/^```/m);
    expect(help!.text).not.toContain("### ");
    expect(help!.text).not.toContain("**");
    expect(help!.text).not.toMatch(/\]\(/);
    expect(help!.text).toContain("Read more: ");
  });
});
