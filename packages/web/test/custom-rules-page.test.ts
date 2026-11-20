import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { lint, resolveConfig } from "@pbiplint/core";
import { readCustomRules, teReference } from "@pbiplint/core/custom-rules";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { fixturesDir, readModelFiles } from "../../core/test/helpers.js";
import { makeTempDir, removeTempDir } from "../../../tests/support/temp-dir.js";
import { referenceHtml } from "../src/build/custom-rules-reference.js";
import { TE_REFERENCE } from "../src/build/custom-rules-reference.data.js";
import { CONTENT_DIR, CONTENT_PAGES, generateSite, WEB_ROOT } from "../src/build/generate.js";

// The custom rules page (#118, spec section 10): what custom rules are, how to set them up, the
// format, and the reference, generated from the evaluator's own tables.

const EM_DASH = String.fromCharCode(0x2014);
const source = readFileSync(join(CONTENT_DIR, "custom-rules.md"), "utf8");
const skill = readFileSync(
  new URL("../../cli/skill/pbiplint-custom-rules/SKILL.md", import.meta.url),
  "utf8",
);

/** A `## ` section's Markdown, up to the next `## ` heading or `<h2`, or the end. */
const section = (text: string, heading: RegExp): string => {
  const start = text.search(heading);
  expect(start, String(heading)).toBeGreaterThanOrEqual(0);
  const rest = text.slice(start + 1);
  const end = rest.search(/^(## |<h2 )/m);
  return end < 0 ? rest : rest.slice(0, end);
};
const jsonFences = (markdown: string): string[] =>
  [...markdown.matchAll(/^```json\n([\s\S]*?)\n```$/gm)].map((m) => m[1]!);

/** HTML as the text a reader sees: tags dropped, the five escapes HTML uses read back. */
const textOf = (html: string): string =>
  html
    .replace(/<[^>]+>/g, "")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&");

let out: string;
let page: string;
beforeAll(() => {
  out = makeTempDir("custom-rules-page");
  generateSite({ outDir: out });
  page = readFileSync(join(out, "custom-rules", "index.html"), "utf8");
});
afterAll(() => removeTempDir(out));

describe("the custom rules page", () => {
  it("is a content page at /custom-rules/, with its title", () => {
    expect(CONTENT_PAGES).toContain("custom-rules");
    expect(page).toContain("<title>Custom rules · pbiplint</title>");
    expect(page).toContain('<h1 id="custom-rules">Custom rules</h1>');
  });

  it("has every section the plan lists, in order", () => {
    const ids = [...page.matchAll(/<h2 id="([^"]+)"/g)].map((m) => m[1]);
    expect(ids).toEqual([
      "set-up",
      "format",
      "built-in-ids",
      "ignore-annotation",
      "cannot-run",
      "output",
      "on-this-site",
      "pipelines",
      "assistant",
      "examples",
      "not-run",
      "reference",
    ]);
  });

  it("says how Severity numbers map, and that Tabular Editor's command line labels 1 a warning", () => {
    const format = textOf(section(page, /<h2 id="format"/));
    expect(format).toMatch(/Tabular Editor's own command line labels\s+Severity\s+1 as a warning/);
    expect(format).toMatch(/pbiplint reads 1 as info, as its built-in rules read Microsoft's/);
  });

  it("ends with the reference, which lists every scope and every reason a rule is not run", () => {
    const reference = page.slice(page.indexOf('<h2 id="reference"'));
    expect(reference).toContain(referenceHtml(TE_REFERENCE));
    const text = textOf(reference);
    for (const scope of TE_REFERENCE.scopes)
      expect(reference).toContain(`<code>${scope.name}</code>`);
    for (const n of TE_REFERENCE.notRun) expect(text).toContain(n.reason.replace(/`/g, ""));
    for (const t of TE_REFERENCE.types)
      expect(reference).toContain(`<summary><code>${t.name}</code></summary>`);
    for (const l of TE_REFERENCE.limits) expect(text).toContain(l.value.toLocaleString("en"));
  });

  it("shows the skill's worked examples exactly as the skill does, so the two cannot drift", () => {
    const ours = jsonFences(section(source, /^<h2 id="examples"/m));
    const theirs = jsonFences(section(skill, /^## Worked examples$/m));
    expect(theirs).toHaveLength(4);
    expect(ours).toEqual(theirs);
  });

  it("gives a format example that reads and runs, and a config that resolves", async () => {
    const fences = jsonFences(section(source, /^<h2 id="format"/m));
    expect(fences.length).toBeGreaterThan(0);
    const set = readCustomRules([{ path: "rules/team.json", text: fences[0]! }]);
    expect(set.notices).toEqual([]);
    for (const rule of set.rules) expect(rule.custom?.readProblem, rule.id).toBeUndefined();
    const result = await lint(readModelFiles(`${fixturesDir}custom-rules.SemanticModel`), {
      customRules: set,
    });
    expect(result.summary.ruleErrors).toEqual([]);
    expect(result.groups.find((g) => g.rule.id === "RULE_COULD_NOT_FINISH")).toBeUndefined();
    expect(result.groups.map((g) => g.rule.id)).toContain("TEAM_MEASURE_DESCRIPTIONS");
    const configs = [...source.matchAll(/^```json pbiplint\.config\.json\n([\s\S]*?)\n```$/gm)];
    expect(configs.length).toBeGreaterThan(0);
    for (const c of configs) expect(() => resolveConfig(JSON.parse(c[1]!))).not.toThrow();
  });

  it("names no scope the reference does not list", () => {
    const scopes = new Set(teReference().scopes.map((s) => s.name));
    for (const fence of jsonFences(source)) {
      const rules = [JSON.parse(fence)].flat() as Record<string, unknown>[];
      for (const rule of rules)
        if (typeof rule.Scope === "string")
          for (const s of rule.Scope.split(",").map((x) => x.trim()))
            expect(scopes.has(s), s).toBe(true);
    }
  });

  it("has no em dash, in its source or the page built from it", () => {
    expect(source).not.toContain(EM_DASH);
    expect(page).not.toContain(EM_DASH);
  });
});

describe("where the site links the custom rules page", () => {
  const built = (path: string): string => readFileSync(join(out, path), "utf8");
  it("is in the sitemap, llms.txt, and the rules index", () => {
    expect(built("public/sitemap.xml")).toContain("<loc>https://pbiplint.com/custom-rules/</loc>");
    expect(built("public/llms.txt")).toContain("(https://pbiplint.com/custom-rules/)");
    expect(built("rules/index.html")).toContain('<a href="/custom-rules/">');
  });
  it("is linked from the CLI page's Write a custom rule section and its configuration, and from About", () => {
    const cli = built("cli/index.html");
    const write = cli.slice(
      cli.indexOf('<h3 id="custom-rule">'),
      cli.indexOf('<h3 id="gate-a-build-on-it">'),
    );
    expect(write).toContain('<a href="/custom-rules/');
    const configure = cli.slice(
      cli.indexOf('<h3 id="configure-it">'),
      cli.indexOf('<h2 id="contract">'),
    );
    expect(configure).toContain('<a href="/custom-rules/');
    expect(built("about/index.html")).toContain('<a href="/custom-rules/">');
  });
  it("is linked from the rule-could-not-finish page's paragraph on a custom rule", () => {
    const rcnf = built("rules/rule-could-not-finish/index.html");
    expect(rcnf).toMatch(/custom rule[\s\S]*href="https:\/\/pbiplint\.com\/custom-rules\//);
  });
});

describe("the links on the site's content pages", () => {
  it("each lead to a page the build writes, or a file the site serves, with the section it names", () => {
    // Every link on a content page, the rules index, and the rule page that names custom rules:
    // a path on the site must be a page or a public file, and an anchor must be an id on it. A
    // link to https://pbiplint.com/ is held to the same, since it names a page of this site.
    const pages = [
      ...CONTENT_PAGES.map((n) => `${n}/index.html`),
      "rules/index.html",
      "rules/rule-could-not-finish/index.html",
    ];
    const htmlAt = (path: string): string | undefined => {
      if (path === "/") return readFileSync(join(WEB_ROOT, "index.html"), "utf8");
      const file = join(out, path.replace(/^\//, ""), "index.html");
      return existsSync(file) ? readFileSync(file, "utf8") : undefined;
    };
    const broken: string[] = [];
    for (const rel of pages) {
      const html = readFileSync(join(out, rel), "utf8");
      const self = `/${rel.replace(/index\.html$/, "")}`;
      for (const m of html.matchAll(/<a [^>]*href="([^"]+)"/g)) {
        const href = m[1]!.replace(/&amp;/g, "&");
        const local = href.startsWith("https://pbiplint.com/")
          ? href.slice("https://pbiplint.com".length)
          : href;
        if (/^(https?:|mailto:)/.test(local)) continue;
        const [pathPart, anchor] = local.split("#") as [string, string | undefined];
        const path = (pathPart === "" ? self : pathPart).replace(/\?.*$/, "");
        const target = htmlAt(path);
        if (target === undefined) {
          if (!existsSync(join(WEB_ROOT, "public", path))) broken.push(`${rel}: ${href}`);
          continue;
        }
        if (anchor && !target.includes(`id="${anchor}"`)) broken.push(`${rel}: ${href}`);
      }
    }
    expect(broken).toEqual([]);
  });
});

describe("referenceHtml", () => {
  it("writes code spans as code, escapes the rest, and shows a control character as its escape", () => {
    const html = referenceHtml({
      ...TE_REFERENCE,
      limits: [{ name: "x<y", value: 1048576, description: "Holds `a & b`." }],
      regex: {
        runs: [{ construct: "Dot", example: "a.c", matches: "abc", doesNotMatch: "a\nc" }],
        refused: [],
      },
    });
    expect(html).toContain(
      "<td><code>x&lt;y</code></td><td>1,048,576</td><td>Holds <code>a &amp; b</code>.</td>",
    );
    expect(html).toContain("<code>&quot;a\\u000ac&quot;</code>");
    // eslint-disable-next-line no-control-regex -- finding control characters is what this is for
    expect(html).not.toMatch(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/);
  });
  it("gives each section an id of its own", () => {
    const ids = [...referenceHtml(TE_REFERENCE).matchAll(/ id="([^"]+)"/g)].map((m) => m[1]);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id).toMatch(/^reference-/);
  });
});

describe("the pages that list what pbiplint opens or writes", () => {
  const built = (path: string): string => readFileSync(join(out, path), "utf8");
  const privacy = readFileSync(join(CONTENT_DIR, "privacy.md"), "utf8");
  const sha256 = (s: string): string => createHash("sha256").update(s).digest("hex");

  it("keep the Promise's five items and its checks word for word", () => {
    // A change to either is a change to the Promise itself, which needs its own decision: update
    // these only with one.
    const promise = privacy.slice(
      privacy.indexOf("## The Promise"),
      privacy.indexOf("## Where it holds"),
    );
    const checks = privacy.slice(
      privacy.indexOf('<h2 id="check">'),
      privacy.indexOf("These checks show"),
    );
    expect(sha256(promise)).toBe(
      "54eaacd2d5bcff73721942714da7bee581cb93d7442a2809e4aae0119bba11f5",
    );
    expect(sha256(checks)).toBe("7a26225773f2cbf4a523fb5fa121044e93a9ae0b8f26748391e19f55981767d7");
  });

  it("date the site's rule files true for pbiplint.com, which runs main, and for a self-hosted copy", () => {
    expect(privacy).toContain(
      "`pbiplint.config.json`, and the rule files its `customRules` names inside that folder (on pbiplint.com now, and in a copy your firm hosts from 0.4.0).",
    );
  });

  it("name the rule files among what the command line opens, and both skills among what it writes", () => {
    expect(privacy).toContain(
      "along with the nearest `pbiplint.config.json` or the one `--config` names, and from 0.4.0 the rule files its `customRules` names.",
    );
    expect(privacy).toContain(
      "it writes two files (one before 0.4.0), each named `SKILL.md`, into that assistant's skills folder below the current folder (`.claude/skills/pbiplint/` and `.claude/skills/pbiplint-custom-rules/` for Claude Code), or one with `--name`, and reads any copy already there first, so it does not overwrite one you have edited.",
    );
    expect(privacy).not.toContain("it writes one file, `SKILL.md`");
  });

  it("say what pbiplint mcp's tools read given a path, and that the reference tool reads nothing", () => {
    expect(privacy).toContain(
      "From 0.4.0, `explain_rule` and `list_rules`, given a `path`, also read the nearest `pbiplint.config.json` from that path up and the rule files its `customRules` names, and `custom_rules_reference` reads nothing.",
    );
  });

  it("name the rule files in both pipelines' lint steps", () => {
    const pipelines = readFileSync(join(CONTENT_DIR, "pipelines.md"), "utf8");
    const lint = [...pipelines.matchAll(/^2\. \*\*The lint\.\*\*.*$/gm)].map((m) => m[0]);
    expect(lint).toHaveLength(2);
    for (const line of lint)
      expect(line).toMatch(/rule files .*customRules|customRules.*rule files/);
  });

  it("mark the CLI page's second skill folders from 0.4.0, as its section does", () => {
    const cli = readFileSync(join(CONTENT_DIR, "cli.md"), "utf8");
    const table = cli.slice(
      cli.indexOf("| Assistant | Folders it writes |"),
      cli.indexOf("GitHub Copilot reads"),
    );
    const rows = table.split("\n").filter((l) => l.startsWith("| `"));
    expect(rows).toHaveLength(3);
    for (const row of rows)
      expect(row).toMatch(/, and from 0\.4\.0 `[^`]+pbiplint-custom-rules\/`/);
  });

  it("set up customRules in the CLI page's configuration section, from 0.4.0", () => {
    const cli = built("cli/index.html");
    const configure = cli.slice(
      cli.indexOf('<h3 id="configure-it">'),
      cli.indexOf('<h2 id="contract">'),
    );
    expect(configure).toContain("<code>customRules</code>");
    expect(configure).toMatch(/From 0\.4\.0, <code>customRules<\/code>/);
  });
});
