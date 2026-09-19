import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ConfigEnv, UserConfig } from "vite";
import {
  CATEGORY_ORDER as CORE_CATEGORY_ORDER,
  ignoreHelp as coreIgnoreHelp,
} from "@pbiplint/core";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { generatePlugin, generateSite, pageEntries, RULES_DIR } from "../src/build/generate.js";
import {
  attribution,
  CATEGORY_ORDER,
  contentPage,
  ignoreHelp,
  NAV,
  parseFrontmatter,
  ruleLinks,
  rulePage,
  rulesIndex,
  type RuleMeta,
  withIgnoreHelp,
} from "../src/build/pages.js";

const read = (slug: string): string => readFileSync(join(RULES_DIR, `${slug}.md`), "utf8");
const home = readFileSync(new URL("../index.html", import.meta.url), "utf8");

describe("parseFrontmatter", () => {
  it("reads scalars, bracket lists, dash lists, and empty keys", () => {
    const { data, body } = parseFrontmatter(
      read("hide-foreign-keys"),
      "rules/hide-foreign-keys.md",
    );
    expect(data.id).toBe("HIDE_FOREIGN_KEYS");
    expect(data.name).toBe("Hide foreign keys");
    expect(data.scope).toEqual(["Column", "CalculatedColumn", "CalculatedTableColumn"]);
    expect(data.sources).toEqual([
      "https://github.com/microsoft/Analysis-Services/blob/master/BestPracticeRules/BPARules.json",
    ]);
    expect(data.video).toEqual([]);
    expect(body.trim().startsWith("# Hide foreign keys")).toBe(true);
  });
});

describe("parseFrontmatter errors", () => {
  const source = "rules/made-up.md";
  it("names the page when there is no frontmatter at all", () => {
    expect(() => parseFrontmatter("# No frontmatter\n", source)).toThrow(
      "rules/made-up.md: no frontmatter (the page must open with a --- block)",
    );
  });
  it("refuses a frontmatter line it cannot read rather than dropping it", () => {
    // A key silently skipped is a rule page that renders with a field missing and no sign of why.
    expect(() => parseFrontmatter("---\nid: X\nstray line\n---\nbody\n", source)).toThrow(
      'rules/made-up.md: cannot read frontmatter line "stray line" (expected `key: value` or an indented `- item`)',
    );
  });
  it("allows a blank line between frontmatter keys", () => {
    const { data } = parseFrontmatter("---\nid: X\n\nname: Y\n---\nbody\n", source);
    expect(data).toEqual({ id: "X", name: "Y" });
  });
  it("unescapes a quoted value rather than passing the backslashes through", () => {
    const { data } = parseFrontmatter(
      '---\nname: "A \\"quoted\\" name, C:\\\\path"\n---\nbody\n',
      source,
    );
    expect(data.name).toBe('A "quoted" name, C:\\path');
  });
  it("names the file the reader would have to edit, from either caller", () => {
    expect(() => rulePage("# No frontmatter\n", "made-up")).toThrow("rules/made-up.md:");
    expect(() => contentPage("# No frontmatter\n", "/about/", "content/about.md")).toThrow(
      "content/about.md:",
    );
  });
});

describe("rulePage", () => {
  it("renders the page inside the site shell with the rule's metadata", () => {
    const { html, meta } = rulePage(read("hide-foreign-keys"), "hide-foreign-keys");
    expect(meta).toMatchObject({
      slug: "hide-foreign-keys",
      id: "HIDE_FOREIGN_KEYS",
      title: "Hide foreign keys",
      category: "Formatting",
      severity: "warning",
      status: "ported",
    });
    expect(meta.summary.startsWith("Visible columns whose name matches")).toBe(true);
    expect(html).toContain("<h1>Hide foreign keys</h1>");
    expect(html).toContain('<h2 id="what-it-checks">What it checks</h2>');
    expect(html).toContain(
      '<link rel="canonical" href="https://pbiplint.com/rules/hide-foreign-keys/" />',
    );
    expect(html).toContain(
      'href="https://github.com/pbiplint/pbiplint/edit/main/rules/hide-foreign-keys.md"',
    );
    expect(html).toContain('<link rel="stylesheet" href="/src/styles.css" />');
    expect(html).not.toContain("<script");
  });
  it("gives every section heading an id, so a section can be linked to", () => {
    const { html } = rulePage(read("hide-foreign-keys"), "hide-foreign-keys");
    const ids = [...html.matchAll(/<h2 id="([^"]*)">/g)].map((m) => m[1]);
    expect(ids).toEqual(["what-it-checks", "why-it-matters", "how-to-fix-it", "quirks", "links"]);
    expect(html).not.toMatch(/<h[2-6]>/);
    // A heading with inline code or punctuation still gets a plain slug.
    const odd = rulePage(
      read("hide-foreign-keys").replace("## Quirks", "## Quirks: `FILTER('T')` & more"),
      "x",
    );
    expect(odd.html).toContain('<h2 id="quirks-filtert-more">');
  });
  it("marks a live-model rule and shows a video link only when the page has one", () => {
    const live = rulePage(
      read("avoid-bi-directional-relationships-against-high-cardinality-columns"),
      "x",
    );
    expect(live.html).toContain("needs a live model");
    expect(live.html).not.toContain("Watch the video");
    const withVideo = rulePage(
      read("hide-foreign-keys").replace("video:\n", "video: https://youtu.be/abc\n"),
      "hide-foreign-keys",
    );
    expect(withVideo.html).toContain('href="https://youtu.be/abc"');
  });
  it("renders an example fence as a captioned figure and leaves other fences alone", () => {
    const page = read("hide-foreign-keys").replace(
      "## Why it matters",
      "## Example\n\n```tmdl fires\ntable T\n\tcolumn 'A'\n```\n\n```tmdl fixed\ntable T\n```\n\n```\nDAX here\n```\n\n## Why it matters",
    );
    const { html } = rulePage(page, "hide-foreign-keys");
    expect(html).toContain(
      '<figure class="example fires">\n<figcaption>Fires the rule</figcaption>\n<pre><code class="language-tmdl">table T\n\tcolumn &#39;A&#39;\n</code></pre>\n</figure>',
    );
    expect(html).toContain(
      '<figure class="example fixed">\n<figcaption>After the fix</figcaption>',
    );
    expect(html).toContain("<pre><code>DAX here\n</code></pre>");
    expect(html).toContain('<h2 id="example">Example</h2>');
  });
  it("links a code span that names another rule, and only another rule", () => {
    const page = read("hide-foreign-keys").replace(
      "## Quirks",
      "See `MARK_PRIMARY_KEYS`, `HIDE_FOREIGN_KEYS`, and `MADE_UP`.\n\n## Quirks",
    );
    const links = new Map([
      ["MARK_PRIMARY_KEYS", "mark-primary-keys"],
      ["HIDE_FOREIGN_KEYS", "hide-foreign-keys"],
    ]);
    const { html } = rulePage(page, "hide-foreign-keys", links);
    expect(html).toContain(
      '<a href="/rules/mark-primary-keys/"><code>MARK_PRIMARY_KEYS</code></a>',
    );
    expect(html).toContain("<code>HIDE_FOREIGN_KEYS</code>");
    expect(html).not.toContain('<a href="/rules/hide-foreign-keys/">');
    expect(html).toContain("<code>MADE_UP</code>");
    expect(html).not.toContain("made-up");
    // With no link table, nothing is linked.
    expect(rulePage(page, "hide-foreign-keys").html).not.toContain("/rules/mark-primary-keys/");
  });
  it("appends the ignore mechanics to When to ignore it, in core's words", () => {
    const page = read("hide-foreign-keys").replace(
      "## Quirks",
      "## When to ignore it\n\nRarely.\n\n## Quirks",
    );
    const { html } = rulePage(page, "hide-foreign-keys");
    expect(html).toContain(
      "<p>Rarely.</p>\n<p>To ignore this rule on one object, add <code>annotation pbiplint.ignore = HIDE_FOREIGN_KEYS</code>",
    );
    expect(html).toContain("<code>&quot;HIDE_FOREIGN_KEYS&quot;: &quot;off&quot;</code>");
    // The build cannot import core (see CATEGORY_ORDER), so the text is copied and held equal here.
    expect(ignoreHelp("X", ["Column"])).toBe(coreIgnoreHelp("X", ["Column"]));
    expect(ignoreHelp("X", ["File"])).toBe(coreIgnoreHelp("X", ["File"]));
    // A page without the section gets nothing appended.
    const live = read("avoid-bi-directional-relationships-against-high-cardinality-columns");
    expect(rulePage(live, "x").html).not.toContain("pbiplint.ignore");
  });
  it("prints where the rule was ported from, and nothing for a rule with no source", () => {
    const { html } = rulePage(read("hide-foreign-keys"), "hide-foreign-keys");
    expect(html).toContain(
      `<p class="sources">Ported from <a href="https://github.com/microsoft/Analysis-Services/blob/master/BestPracticeRules/BPARules.json">Microsoft's Best Practice Analyzer ruleset</a>.</p>`,
    );
    const none = rulePage(
      read("hide-foreign-keys").replace(/sources:\n( {2}- .*\n)+/, "sources:\n"),
      "x",
    );
    expect(none.html).not.toContain('class="sources"');
    const other = rulePage(
      read("hide-foreign-keys").replace(
        /sources:\n( {2}- .*\n)+/,
        "sources:\n  - https://learn.microsoft.com/x\n",
      ),
      "x",
    );
    expect(other.html).toContain('<a href="https://learn.microsoft.com/x">learn.microsoft.com</a>');
  });
});

describe("withIgnoreHelp", () => {
  it("appends to the section whether or not another section follows it", () => {
    const help = ignoreHelp("X", ["Column"]);
    expect(
      withIgnoreHelp("## When to ignore it\n\nRarely.\n\n## Quirks\n\n- Q\n", "X", ["Column"]),
    ).toBe(`## When to ignore it\n\nRarely.\n\n${help}\n\n## Quirks\n\n- Q\n`);
    expect(withIgnoreHelp("## When to ignore it\n\nRarely.\n", "X", ["Column"])).toBe(
      `## When to ignore it\n\nRarely.\n\n${help}\n`,
    );
    expect(withIgnoreHelp("## Quirks\n\n- Q\n", "X", ["Column"])).toBe("## Quirks\n\n- Q\n");
  });
});

describe("ruleLinks and attribution", () => {
  it("maps every page's id to its slug", () => {
    const links = ruleLinks([{ slug: "hide-foreign-keys", markdown: read("hide-foreign-keys") }]);
    expect([...links]).toEqual([["HIDE_FOREIGN_KEYS", "hide-foreign-keys"]]);
  });
  it("names a known source and falls back to the hostname", () => {
    expect(attribution([])).toBe("");
    expect(
      attribution([
        "https://github.com/microsoft/Analysis-Services/blob/master/BestPracticeRules/BPARules.json",
      ]),
    ).toBe(
      `<p class="sources">Ported from <a href="https://github.com/microsoft/Analysis-Services/blob/master/BestPracticeRules/BPARules.json">Microsoft's Best Practice Analyzer ruleset</a>.</p>\n`,
    );
    expect(attribution(["https://example.org/a?b=1"])).toBe(
      `<p class="sources">Ported from <a href="https://example.org/a?b=1">example.org</a>.</p>\n`,
    );
  });
});

describe("generateSite", () => {
  it("writes every rule page, the index, the about page, and the sitemap", () => {
    const out = mkdtempSync(join(tmpdir(), "pbiplint-site-"));
    const metas = generateSite({ outDir: out });
    expect(metas.length).toBe(72);
    expect(readdirSync(join(out, "rules")).filter((d) => d !== "index.html").length).toBe(72);
    expect(existsSync(join(out, "rules/hide-foreign-keys/index.html"))).toBe(true);
    const index = readFileSync(join(out, "rules/index.html"), "utf8");
    expect(index).toContain("72 rules: 66 ported");
    expect(index).toContain('<h2 id="error-prevention">Error Prevention</h2>');
    expect((index.match(/needs a live model/g) ?? []).length).toBe(5);
    for (const m of metas) expect(index).toContain(`href="/rules/${m.slug}/"`);
    const summaries = [...index.matchAll(/<span class="summary">([\s\S]*?)<\/span>/g)].map(
      (m) => m[1]!,
    );
    expect(summaries.length).toBe(72);
    expect(summaries.some((s) => s.includes("<code>///</code>"))).toBe(true);
    expect(summaries.filter((s) => s.includes("`"))).toEqual([]);
    const parseIssue = readFileSync(join(out, "rules/parse-issue/index.html"), "utf8");
    const description = /<meta name="description" content="([^"]*)"/.exec(parseIssue)?.[1] ?? "";
    expect(description).toContain("an unterminated code fence");
    expect(description).not.toContain("`");
    const about = readFileSync(join(out, "about/index.html"), "utf8");
    expect(about).toContain('<h2 id="verify">');
    expect(about).toContain('<h2 id="known-limits-in-the-browser">');
    expect(about).toContain("<title>About pbiplint");
    const sitemap = readFileSync(join(out, "public/sitemap.xml"), "utf8");
    expect(sitemap).toContain("<loc>https://pbiplint.com/rules/hide-foreign-keys/</loc>");
    expect(Object.keys(pageEntries(out)).sort()).toEqual(
      ["about", "rules", ...metas.map((m) => `rules/${m.slug}`)].sort(),
    );
  });
  it("clears the generated rules tree, so a renamed rule leaves no orphan page", () => {
    const out = mkdtempSync(join(tmpdir(), "pbiplint-stale-"));
    mkdirSync(join(out, "rules", "renamed-away"), { recursive: true });
    writeFileSync(join(out, "rules", "renamed-away", "index.html"), "<html>stale</html>");
    generateSite({ outDir: out });
    expect(existsSync(join(out, "rules", "renamed-away", "index.html"))).toBe(false);
    expect(existsSync(join(out, "rules", "hide-foreign-keys", "index.html"))).toBe(true);
    expect(existsSync(join(out, "rules", "index.html"))).toBe(true);
  });
  it("leaves the previous build alone when the index refuses a rule", () => {
    const out = mkdtempSync(join(tmpdir(), "pbiplint-atomic-"));
    mkdirSync(join(out, "rules", "kept"), { recursive: true });
    writeFileSync(join(out, "rules", "kept", "index.html"), "<html>previous</html>");
    const rules = mkdtempSync(join(tmpdir(), "pbiplint-badrules-"));
    writeFileSync(
      join(rules, "invented.md"),
      read("hide-foreign-keys").replace("category: Formatting", "category: Invented"),
    );
    expect(() => generateSite({ outDir: out, rulesDir: rules })).toThrow(
      'unknown category "Invented"',
    );
    expect(readFileSync(join(out, "rules", "kept", "index.html"), "utf8")).toBe(
      "<html>previous</html>",
    );
  });
  it("refuses an outDir whose rules folder is the rule sources it reads", () => {
    // A temporary tree stands in for the repo root here, so a regression in the guard costs a
    // temp folder rather than the checked-in rules/ the real default would point at.
    const out = mkdtempSync(join(tmpdir(), "pbiplint-selfdelete-"));
    const rules = join(out, "rules");
    mkdirSync(rules, { recursive: true });
    writeFileSync(join(rules, "hide-foreign-keys.md"), read("hide-foreign-keys"));
    expect(() => generateSite({ outDir: out, rulesDir: rules })).toThrow(
      "would delete the rule sources",
    );
    expect(existsSync(join(rules, "hide-foreign-keys.md"))).toBe(true);
  });
});

describe("rulesIndex", () => {
  // Generated inside beforeAll rather than at collection time: a rule the index refuses would
  // otherwise fail the whole file with a collection error instead of the one test that covers it,
  // and the work would run even when the file is filtered to an unrelated test.
  let metas: RuleMeta[];
  beforeAll(() => {
    metas = generateSite({ outDir: mkdtempSync(join(tmpdir(), "pbiplint-index-")) });
  });
  it("sorts with an explicit locale, so the order does not depend on the build machine", () => {
    // Intl.LocalesArgument, not string | string[], because ES2020 widened the parameter and the
    // mock has to match the signature it stands in for.
    const seen: Intl.LocalesArgument[] = [];
    const real = String.prototype.localeCompare;
    const spy = vi.spyOn(String.prototype, "localeCompare").mockImplementation(function (
      this: string,
      that: string,
      locales?: Intl.LocalesArgument,
    ) {
      seen.push(locales);
      return real.call(this, that, locales);
    });
    try {
      rulesIndex(metas);
    } finally {
      spy.mockRestore();
    }
    expect(seen.length).toBeGreaterThan(0);
    expect([...new Set(seen)]).toEqual(["en"]);
  });
  it("refuses a rule whose category has no section, rather than dropping it from the index", () => {
    const invented = { ...metas[0]!, slug: "invented", category: "Invented" };
    expect(() => rulesIndex([invented])).toThrow(
      'invented: unknown category "Invented" (add it to CATEGORY_ORDER in packages/web/src/build/pages.ts)',
    );
    // Every real rule still passes.
    expect(() => rulesIndex(metas)).not.toThrow();
  });
});

describe("CATEGORY_ORDER", () => {
  it("still matches core's list, which the index now hard-fails on any drift from", () => {
    // Only the test imports core: pages.ts is a build-time module, and core resolves to its dist,
    // so importing it there would make generating the site wait on core being built.
    expect(CATEGORY_ORDER).toEqual([...CORE_CATEGORY_ORDER]);
  });
});

describe("pageEntries", () => {
  it("never takes a Playwright report or result as a site page", () => {
    const out = mkdtempSync(join(tmpdir(), "pbiplint-entries-"));
    for (const dir of ["playwright-report", "test-results/x", "e2e", "rules/a", "test-suite"]) {
      mkdirSync(join(out, dir), { recursive: true });
      writeFileSync(join(out, dir, "index.html"), "<html></html>");
    }
    writeFileSync(join(out, "index.html"), "<html></html>");
    expect(Object.keys(pageEntries(out)).sort()).toEqual(["home", "rules/a", "test-suite"]);
  });
  it("skips the package's own folders by name, and only where they sit", () => {
    const out = mkdtempSync(join(tmpdir(), "pbiplint-entries-"));
    for (const dir of ["node_modules/p", "dist", "public", "src", "test", "content", "rules/src"]) {
      mkdirSync(join(out, dir), { recursive: true });
      writeFileSync(join(out, dir, "index.html"), "<html></html>");
    }
    writeFileSync(join(out, "404.html"), "<html></html>");
    expect(Object.keys(pageEntries(out)).sort()).toEqual(["404", "rules/src"]);
  });
  it("does not read what it skips, so a folder it cannot open is no reason to fail", () => {
    const out = mkdtempSync(join(tmpdir(), "pbiplint-entries-"));
    mkdirSync(join(out, "node_modules/p"), { recursive: true });
    writeFileSync(join(out, "node_modules/p/index.html"), "<html></html>");
    mkdirSync(join(out, "rules/a"), { recursive: true });
    writeFileSync(join(out, "rules/a/index.html"), "<html></html>");
    // Unreadable, so a walk that descends into it first and filters afterwards fails loudly here.
    chmodSync(join(out, "node_modules"), 0o000);
    try {
      expect(Object.keys(pageEntries(out))).toEqual(["rules/a"]);
    } finally {
      chmodSync(join(out, "node_modules"), 0o755);
    }
  });
});

describe("generatePlugin", () => {
  it("generates for a build and for the dev server, but not for a preview", () => {
    const apply = generatePlugin().apply as (c: UserConfig, env: ConfigEnv) => boolean;
    expect(apply({}, { command: "build", mode: "production" })).toBe(true);
    expect(apply({}, { command: "serve", mode: "development" })).toBe(true);
    // vite preview resolves the config as a serve, and the pages it would generate land in the
    // source tree while the server is only there to hand back what the build already wrote.
    expect(apply({}, { command: "serve", mode: "production", isPreview: true })).toBe(false);
  });
});

describe("home page shell", () => {
  it("has the same navigation and privacy footer as the generated pages", () => {
    for (const n of NAV) {
      expect(home).toContain(`href="${n.href}"`);
      expect(home).toMatch(new RegExp(`>\\s*${n.label}\\s*</a`));
    }
    expect(home).toContain("Nothing you lint leaves your browser.");
  });
});
