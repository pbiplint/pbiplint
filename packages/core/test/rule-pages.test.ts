import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { lint } from "../src/engine/lint.js";
import { slug } from "../src/model/names.js";
import { defaultRules } from "../src/rules/index.js";
import { BPA_RULES } from "../src/rules/microsoft-bpa/bpa-rules.data.js";
import { SEVERITY_LABEL, type Finding } from "../src/rules/types.js";

const rulesDir = new URL("../../../rules/", import.meta.url).pathname;
const rulesetDescription = new Map(BPA_RULES.map((r) => [r.id, r.description]));
const ruleIds = new Set(defaultRules.map((r) => r.id));
const RULESET_URL =
  "https://github.com/microsoft/Analysis-Services/blob/master/BestPracticeRules/BPARules.json";

/**
 * Pages not yet brought up to the complete template
 * (docs/superpowers/specs/2026-09-19-rule-pages-template-design.md, section 10). A page here meets
 * only the checks every page meets; a page not here meets the whole template. Each batch removes
 * its slugs, and the last batch deletes this set and everything that reads it.
 */
const LEGACY_PAGES = new Set<string>([
  "add-data-category-for-columns",
  "avoid-bi-directional-relationships-against-high-cardinality-columns",
  "avoid-duplicate-measures",
  "avoid-excessive-bi-directional-or-many-to-many-relationships",
  "avoid-floating-point-data-types",
  "avoid-invalid-description-characters",
  "avoid-invalid-name-characters",
  "avoid-structured-data-sources-with-provider-partitions",
  "avoid-the-userelationship-function-and-rls-against-the-same-table",
  "avoid-using-many-to-many-relationships-on-tables-used-for-dynamic-row-level-security",
  "avoid-using-the-iferror-function",
  "calculation-groups-with-no-calculation-items",
  "check-if-bi-directional-and-many-to-many-relationships-are-valid",
  "check-if-dynamic-row-level-security-rls-is-necessary",
  "data-columns-must-have-a-source-column",
  "date-calendar-tables-should-be-marked-as-a-date-table",
  "datecolumn-formatstring",
  "dax-columns-fully-qualified",
  "dax-measures-unqualified",
  "ensure-tables-have-relationships",
  "evaluateandlog-should-not-be-used-in-production-models",
  "expression-reliant-objects-must-have-an-expression",
  "filter-column-values",
  "filter-measure-values-by-columns",
  "first-letter-of-objects-must-be-capitalized",
  "fix-referential-integrity-violations",
  "format-flag-columns-as-yes-no-value-strings",
  "hide-fact-table-columns",
  "inactive-relationships-that-are-never-activated",
  "integer-formatting",
  "isavailableinmdx-false-nonattribute-columns",
  "large-tables-should-be-partitioned",
  "limit-row-level-security-rls-logic",
  "many-to-many-relationships-should-be-single-direction",
  "mark-primary-keys",
  "measures-should-not-be-direct-references-of-other-measures",
  "measures-using-time-intelligence-and-model-is-using-direct-query",
  "minimize-power-query-transformations",
  "model-should-have-a-date-table",
  "model-using-direct-query-and-no-aggregations",
  "month-as-a-string-must-be-sorted",
  "monthcolumn-formatstring",
  "numeric-column-summarize-by",
  "objects-should-not-start-or-end-with-a-space",
  "objects-with-no-description",
  "partition-name-should-match-table-name-for-single-partition-tables",
  "percentage-formatting",
  "perspectives-with-no-objects",
  "provide-format-string-for-measures",
  "reduce-number-of-calculated-columns",
  "reduce-usage-of-calculated-columns-that-use-the-related-function",
  "reduce-usage-of-calculated-tables",
  "reduce-usage-of-long-length-columns-with-high-cardinality",
  "relationship-columns-same-data-type",
  "relationship-columns-should-be-of-integer-data-type",
  "remove-auto-date-table",
  "remove-data-sources-not-referenced-by-any-partitions",
  "remove-redundant-columns-in-related-tables",
  "remove-roles-with-no-members",
  "set-isavailableinmdx-to-true-on-necessary-columns",
  "snowflake-schema-architecture",
  "special-chars-in-object-names",
  "split-date-and-time",
  "trim-object-names",
  "unnecessary-columns",
  "unnecessary-measures",
  "unpivot-pivoted-month-data",
  "use-the-divide-function-for-division",
  "use-the-treatas-function-instead-of-intersect",
]);

/** The sections a complete page may have, in the only order they may appear. */
const SECTION_ORDER = [
  "What it checks",
  "Example",
  "Why it matters",
  "How to fix it",
  "When to ignore it",
  "Quirks",
  "Related rules",
  "Links",
];
const RUNS = ["What it checks", "Example", "Why it matters", "How to fix it", "When to ignore it"];
const REQUIRED: Record<string, string[]> = {
  ported: RUNS,
  builtin: RUNS,
  needsLiveModel: ["What it checks", "Why it matters", "How to fix it"],
};
/** A live-model rule never runs, so it can show no example that fires and has no finding to ignore. */
const FORBIDDEN: Record<string, string[]> = {
  ported: [],
  builtin: [],
  needsLiveModel: ["Example", "When to ignore it"],
};

const normalize = (s: string): string =>
  s.toLowerCase().replace(/["'`]/g, "").replace(/\s+/g, " ").trim();

/** The first paragraph of a section, whitespace collapsed, as scripts/sync-rule-pages.mjs reads it. */
const firstParagraph = (s: string): string =>
  s
    .trim()
    .split(/\n\s*\n/)[0]
    ?.replace(/\s+/g, " ")
    .trim() ?? "";

/** The section between one `## ` heading and the next. */
const section = (text: string, heading: string): string =>
  text.split(`## ${heading}`)[1]?.split(/\n## /)[0] ?? "";

const headings = (text: string): string[] =>
  [...text.matchAll(/^## (.+)$/gm)].map((m) => m[1]!.trim());

/** The `sources` list in the frontmatter, as the site's parseFrontmatter would read it. */
const sourcesOf = (text: string): string[] => {
  const frontmatter = /^---\n([\s\S]*?)\n---\n/.exec(text)?.[1] ?? "";
  const block = /^sources:\n((?: {2}- .*\n?)*)/m.exec(frontmatter)?.[1] ?? "";
  return block
    .split("\n")
    .filter((l) => l.startsWith("  - "))
    .map((l) => l.slice(4).trim());
};

/** The contents of every fenced block in a section whose info string is exactly `info`. */
const fences = (s: string, info: string): string[] =>
  [...s.matchAll(/^```([^\n]*)\n([\s\S]*?)\n```$/gm)]
    .filter((m) => m[1]!.trim() === info)
    .map((m) => m[2]!);

const bullets = (s: string): string[] => s.split("\n").filter((l) => l.startsWith("- "));

const run = (tmdl: string): Finding[] => lint([{ path: "example.tmdl", text: tmdl }]).findings;
const hits = (findings: Finding[], id: string): Finding[] =>
  findings.filter((f) => f.ruleId === id);

describe("LEGACY_PAGES", () => {
  it("names only pages that exist and have not been migrated", () => {
    for (const s of LEGACY_PAGES) {
      const path = `${rulesDir}${s}.md`;
      expect(existsSync(path), path).toBe(true);
      const text = readFileSync(path, "utf8");
      expect(text, `${s} is migrated: remove it from LEGACY_PAGES`).not.toContain(
        "## When to ignore it",
      );
      // A page not yet migrated repeats its sources as bare URLs under Links; a migrated page
      // never has a bare URL there, whatever its status. So this catches a migrated live-model
      // page left in the set, which the check above cannot.
      expect(section(text, "Links"), `${s} is migrated: remove it from LEGACY_PAGES`).toMatch(
        /^- https?:\/\//m,
      );
    }
  });
});

describe.each(defaultRules.map((r) => [r.id, r] as const))("rule page for %s", (_id, rule) => {
  const path = `${rulesDir}${slug(rule.id)}.md`;
  const migrated = !LEGACY_PAGES.has(slug(rule.id));

  it("exists with matching frontmatter and the required sections", () => {
    expect(existsSync(path), path).toBe(true);
    const text = readFileSync(path, "utf8");
    const [, frontmatter = ""] = /^---\n([\s\S]*?)\n---\n/.exec(text) ?? [];
    expect(frontmatter).toContain(`id: ${rule.id}`);
    expect(frontmatter).toContain(`severity: ${SEVERITY_LABEL[rule.severity]}`);
    expect(frontmatter).toContain(`status: ${rule.status}`);
    expect(frontmatter).toContain(`category: ${rule.category}`);
    expect(frontmatter).toContain(`scope: [${rule.scope.join(", ")}]`);
    // Links is required on a page that has not been migrated; on the template it is further
    // reading only, present when there is some.
    for (const heading of [
      "## What it checks",
      "## Why it matters",
      "## How to fix it",
      ...(migrated ? [] : ["## Links"]),
    ])
      expect(text, heading).toContain(heading);
    expect(text).not.toContain("TODO");
    expect(text).not.toContain("\u2014");
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
    // rule-summaries.data.ts is generated from the page; rerun scripts/sync-rule-pages.mjs after editing.
    const text = readFileSync(path, "utf8");
    expect(rule.description).toBe(firstParagraph(section(text, "What it checks")));
  });

  describe.runIf(migrated)("meets the complete template", () => {
    it("has its sections in order, with the ones its status requires and none it forbids", () => {
      const found = headings(readFileSync(path, "utf8"));
      expect(found).toEqual([...new Set(found)]);
      for (const h of found) expect(SECTION_ORDER, h).toContain(h);
      expect(found).toEqual(SECTION_ORDER.filter((h) => found.includes(h)));
      for (const h of REQUIRED[rule.status]!) expect(found, h).toContain(h);
      for (const h of FORBIDDEN[rule.status]!) expect(found, h).not.toContain(h);
    });

    it("attributes its source and keeps further reading apart from it", () => {
      const text = readFileSync(path, "utf8");
      const sources = sourcesOf(text);
      expect(sources).toEqual(rule.status === "builtin" ? [] : [RULESET_URL]);
      if (!text.includes("## Links")) return;
      const items = bullets(section(text, "Links"));
      expect(items.length).toBeGreaterThan(0);
      for (const item of items) {
        const url = /^- \[[^\]]+\]\(([^)]+)\)/.exec(item)?.[1];
        expect(url, item).toBeDefined();
        expect(sources).not.toContain(url);
      }
    });

    it.runIf(rule.status !== "needsLiveModel")(
      "shows an example the engine flags and a fix it accepts",
      () => {
        const example = section(readFileSync(path, "utf8"), "Example");
        const [fires, ...moreFires] = fences(example, "tmdl fires");
        const [fixed, ...moreFixed] = fences(example, "tmdl fixed");
        expect(fires, "one `tmdl fires` fence").toBeDefined();
        expect(fixed, "one `tmdl fixed` fence").toBeDefined();
        expect(moreFires).toEqual([]);
        expect(moreFixed).toEqual([]);
        // A fix is a fix, not a suppression.
        expect(`${fires}${fixed}`).not.toContain("pbiplint.ignore");
        const before = run(fires!);
        expect(
          hits(before, rule.id).length,
          "the fires snippet produces a finding",
        ).toBeGreaterThan(0);
        if (rule.id !== "PARSE_ISSUE")
          expect(hits(before, "PARSE_ISSUE").map((f) => f.detail)).toEqual([]);
        const after = run(fixed!);
        expect(
          hits(after, rule.id).map((f) => f.objectName),
          "the fixed snippet is clean for this rule",
        ).toEqual([]);
        expect(hits(after, "PARSE_ISSUE").map((f) => f.detail)).toEqual([]);
      },
    );

    it.runIf(rule.status !== "needsLiveModel")(
      "writes the judgment on ignoring and leaves the mechanics to the generator",
      () => {
        const s = section(readFileSync(path, "utf8"), "When to ignore it");
        expect(s.trim()).not.toBe("");
        expect(s).not.toContain("pbiplint.ignore");
        expect(s).not.toContain('"off"');
      },
    );

    it("names only real rules under Related rules, never itself", () => {
      const text = readFileSync(path, "utf8");
      if (!text.includes("## Related rules")) return;
      const items = bullets(section(text, "Related rules"));
      expect(items.length).toBeGreaterThan(0);
      for (const item of items) {
        const id = /^- `([^`]+)`/.exec(item)?.[1];
        expect(id, item).toBeDefined();
        expect(ruleIds.has(id!), item).toBe(true);
        expect(id).not.toBe(rule.id);
      }
    });
  });
});
