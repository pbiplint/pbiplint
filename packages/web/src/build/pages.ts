import { Marked, type Tokens } from "marked";

export const SITE = "https://pbiplint.com";

export const NAV = [
  { href: "/", label: "Lint" },
  { href: "/rules/", label: "Rules" },
  { href: "/about/", label: "About" },
  { href: "https://github.com/pbiplint/pbiplint", label: "GitHub" },
] as const;

/**
 * The sections of the rules index, in order. Core has the same list, but importing it would make
 * this build depend on core's dist, so the copy is deliberate and a test holds the two together.
 */
export const CATEGORY_ORDER = [
  "Performance",
  "Error Prevention",
  "Accessibility",
  "DAX Expressions",
  "Maintenance",
  "Report Design",
  "Formatting",
  "Naming Conventions",
];
const STATUS_LABEL: Record<string, string> = {
  ported: "ported",
  needsLiveModel: "needs a live model",
  builtin: "built in",
};
/** Known source URLs and how the attribution line names them. A URL this map does not name is left out of the attribution line. */
const SOURCE_NAMES: Record<string, string> = {
  "https://github.com/microsoft/Analysis-Services/blob/master/BestPracticeRules/BPARules.json":
    "Microsoft's Best Practice Analyzer ruleset",
};
/** The caption a fenced example carries, by the word after `tmdl` in its info string. */
const EXAMPLE_CAPTION: Record<string, string> = {
  fires: "Fires the rule",
  fixed: "After the fix",
};

export const escapeHtml = (s: string): string =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const str = (v: string | string[] | undefined): string =>
  Array.isArray(v) ? (v[0] ?? "") : (v ?? "");
const list = (v: string | string[] | undefined): string[] => (Array.isArray(v) ? v : v ? [v] : []);

/** escapeHtml plus the apostrophe, for text inside <code>, matching what marked writes there. */
const escapeCode = (s: string): string => escapeHtml(s).replace(/'/g, "&#39;");

/**
 * How to silence a rule, appended to a page's "When to ignore it" section. Core exports the same
 * text as ignoreHelp; this copy is deliberate for the reason CATEGORY_ORDER gives, and a test
 * holds the two equal.
 */
export function ignoreHelp(ruleId: string, scope: readonly string[] = []): string {
  const project = `To turn the rule off for a whole project, set \`"${ruleId}": "off"\` under \`rules\` in \`pbiplint.config.json\`.`;
  if (scope.length > 0 && scope.every((s) => s === "File"))
    return `This rule reports on files, so there is no object to annotate. ${project}`;
  return (
    `To ignore this rule on one object, add \`annotation pbiplint.ignore = ${ruleId}\` under ` +
    `the object in its TMDL file. Power BI Desktop keeps the annotation. ${project}`
  );
}

/** The body with the ignore mechanics as the last paragraph of "When to ignore it", when the page has that section. */
export function withIgnoreHelp(body: string, ruleId: string, scope: readonly string[]): string {
  // Both searches are line-anchored, so "## When to ignore it" in the middle of a prose line is
  // never taken for the heading and a mid-line "## " never for the section that ends it.
  const heading = /^## When to ignore it[ \t]*$/m.exec(body);
  if (!heading) return body;
  const after = heading.index + heading[0].length;
  const next = /^## /m.exec(body.slice(after));
  // A match is the next heading itself, and the section ends at the newline in front of it.
  const end = next ? after + next.index - 1 : body.length;
  return `${body.slice(0, end).trimEnd()}\n\n${ignoreHelp(ruleId, scope)}\n${body.slice(end)}`;
}

/** Rule id to page slug; a code span that names a rule in this map links to its page. */
export type RuleLinks = ReadonlyMap<string, string>;

/** The link table for a set of pages, read from their frontmatter before any page is rendered. */
export function ruleLinks(pages: { slug: string; markdown: string }[]): RuleLinks {
  return new Map(
    pages.map(({ slug, markdown }) => [
      str(parseFrontmatter(markdown, `rules/${slug}.md`).data.id),
      slug,
    ]),
  );
}

/**
 * The attribution line under a rule page, naming only the sources SOURCE_NAMES knows. A page not
 * yet on the template still carries a further-reading URL in `sources`, and that URL is under its
 * Links too, so crediting it as a port source would be false. Nothing when no source is named.
 */
export function attribution(sources: string[]): string {
  const links = sources
    .filter((url) => SOURCE_NAMES[url] !== undefined)
    .map((url) => `<a href="${escapeHtml(url)}">${escapeHtml(SOURCE_NAMES[url]!)}</a>`);
  if (links.length === 0) return "";
  return `<p class="sources">Ported from ${links.join(" and ")}.</p>\n`;
}

export type Frontmatter = Record<string, string | string[]>;

/** A double-quoted scalar, with the escapes a quoted value is allowed to carry resolved. */
const unquote = (value: string): string => {
  const quoted = /^"(.*)"$/.exec(value);
  return quoted ? quoted[1]!.replace(/\\(["\\])/g, "$1") : value;
};

/**
 * The frontmatter the rule pages use: `key: value`, `key: [a, b]`, and `key:` followed by
 * `  - item` lines. Blank lines are allowed between keys; anything else it cannot read is an
 * error rather than a skip, because a key dropped in silence renders a page with a field missing
 * and nothing to say why. `source` is the file a reader would open to fix that, such as
 * `rules/<slug>.md`, and it names the page in every error thrown here.
 */
export function parseFrontmatter(
  text: string,
  source: string,
): { data: Frontmatter; body: string } {
  const m = /^---\n([\s\S]*?)\n---\n([\s\S]*)$/.exec(text);
  if (!m) throw new Error(`${source}: no frontmatter (the page must open with a --- block)`);
  const data: Frontmatter = {};
  let items: string[] | null = null;
  for (const line of m[1]!.split("\n")) {
    const item = /^\s+- (.*)$/.exec(line);
    if (item && items) {
      items.push(item[1]!.trim());
      continue;
    }
    if (line.trim() === "") continue;
    const kv = /^([A-Za-z_]+):\s*(.*)$/.exec(line);
    if (!kv)
      throw new Error(
        `${source}: cannot read frontmatter line ${JSON.stringify(line)} ` +
          "(expected `key: value` or an indented `- item`)",
      );
    const key = kv[1]!;
    const value = kv[2]!.trim();
    items = null;
    if (value === "") {
      items = [];
      data[key] = items;
    } else if (value.startsWith("[") && value.endsWith("]")) {
      data[key] = value
        .slice(1, -1)
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
    } else {
      data[key] = unquote(value);
    }
  }
  return { data, body: m[2]! };
}

/** A file family a project can hold, and so a family the site can lint: core calls these `LayerName`. */
export type SiteLayer = "model" | "report";

/**
 * The layer a rule page declares, the site's copy of core's `Layer`: a file family, or `project`
 * for a rule that reads both and can fire on either. The copy is deliberate for the reason
 * CATEGORY_ORDER gives, this build imports nothing from core.
 */
export type RuleLayer = SiteLayer | "project";

/** Every layer a page may declare, and the list the error names when a page declares another. */
const RULE_LAYERS: readonly RuleLayer[] = ["model", "report", "project"];

/**
 * The file families pbiplint.com publishes. A rule page whose layer is not published is not
 * rendered, not in the rules index, not in the sitemap, and not in the rule-id link map, so its
 * id stays plain code on the pages that mention it. A page with no `layer` key counts as `model`.
 *
 * `project` is not a member and never becomes one: it is not a file family, and a `project` page
 * publishes whenever this list names either family, because a project rule fires on any input the
 * site can lint. `PARSE_ISSUE` is the page that shows it, on the site today and on a model-only
 * run. Keeping `project` out also leaves "more than one layer published" a question about the two
 * families, which is what the layer column below turns on.
 *
 * The gate is here because the site deploys from main on every push while the ported report rules
 * land on main several pull requests before the browser can lint a report: without it, pbiplint.com
 * would carry pages for rules no published tool runs, for weeks. Pull request 7, where the browser
 * reads a report, sets this to both families and moves the value pinned in generate.test.ts and
 * the site's pinned counts with it.
 *
 * While this list names one family, no report page is published, so the attribution the ported
 * report set adds has no page to sit on: that one holds by construction and needs no flag. A layer
 * column does not. A badge on every row would read `model` on all of them, a column that
 * distinguishes nothing, so the pull request that adds the column renders it only when this list
 * names more than one family.
 */
export const SITE_LAYERS: readonly SiteLayer[] = ["model"];

/**
 * The layer a page declares, `model` when its frontmatter has no `layer` key at all, because the
 * pages predate the key. A key that is present and says nothing readable is an error rather than a
 * fall back to `model`: `layer:` on its own is the form a scaffolded page carries, the way `video:`
 * does on every page today, and reading it as the model layer is how a report page would reach the
 * site by accident. A typo is an error for the same reason parseFrontmatter gives, and `source`
 * names the page the way it does.
 */
export function pageLayer(data: Frontmatter, source: string): RuleLayer {
  // An absent key and a present but empty one are different things in the parsed frontmatter, and
  // only str() reads them alike, so the key is tested before its value is.
  if (data.layer === undefined) return "model";
  const value = str(data.layer);
  const layer = RULE_LAYERS.find((l) => l === value);
  if (!layer)
    throw new Error(
      `${source}: unknown layer ${JSON.stringify(value)} ` +
        `(expected one of ${RULE_LAYERS.join(", ")}, or no layer key at all)`,
    );
  return layer;
}

/**
 * Whether the site publishes a page on a layer, and so whether it is generated at all. A `project`
 * page publishes as soon as either family does, because a project rule can fire on any input the
 * site can lint.
 */
export const publishesLayer = (layer: RuleLayer): boolean =>
  layer === "project" ? SITE_LAYERS.length > 0 : SITE_LAYERS.includes(layer);

const section = (body: string, heading: string): string =>
  body.split(`## ${heading}`)[1]?.split(/\n## /)[0] ?? "";
const firstParagraph = (s: string): string =>
  s
    .trim()
    .split(/\n\s*\n/)[0]
    ?.replace(/\s+/g, " ")
    .trim() ?? "";
/** A Markdown paragraph as prose: code marks dropped, whitespace collapsed. For a meta description. */
const plainText = (markdown: string): string =>
  markdown.replace(/`+/g, "").replace(/\s+/g, " ").trim();

/**
 * The id a heading gets, so a section can be linked to: the text in lower case with code marks
 * and punctuation dropped and each run of spaces a hyphen. "How to fix it" is "how-to-fix-it".
 */
export const headingId = (text: string): string =>
  plainText(text)
    .toLowerCase()
    .replace(/[^\p{L}\p{N} -]/gu, "")
    .trim()
    .replace(/\s+/g, "-");

/**
 * The site's Markdown renderer. marked adds no heading ids of its own since v8, so headings get
 * them here. On a rule page, a fence whose info string is `tmdl fires` or `tmdl fixed` renders as
 * a captioned figure, and a code span naming another rule links to its page; returning false
 * from an override hands the token back to marked's default renderer.
 */
function siteMarkdown(links: RuleLinks = new Map(), self = ""): Marked {
  return new Marked({
    renderer: {
      heading({ tokens, depth, text }: Tokens.Heading): string {
        return `<h${depth} id="${headingId(text)}">${this.parser.parseInline(tokens)}</h${depth}>\n`;
      },
      code({ text, lang, escaped }: Tokens.Code): string | false {
        const example = /^tmdl (fires|fixed)$/.exec(lang ?? "");
        if (!example) return false;
        const kind = example[1]!;
        const code = (escaped ? text : escapeCode(text)).replace(/\n$/, "");
        return `<figure class="example ${kind}">\n<figcaption>${EXAMPLE_CAPTION[kind]!}</figcaption>\n<pre><code class="language-tmdl">${code}\n</code></pre>\n</figure>\n`;
      },
      codespan({ text }: Tokens.Codespan): string | false {
        const slug = links.get(text);
        if (slug === undefined || text === self) return false;
        return `<a href="/rules/${escapeHtml(slug)}/"><code>${escapeCode(text)}</code></a>`;
      },
    },
  });
}
const md = siteMarkdown();
const render = (markdown: string, links?: RuleLinks, self?: string): string =>
  (links ? siteMarkdown(links, self) : md).parse(markdown, { async: false }) as string;
/**
 * A Markdown paragraph as inline HTML, so `FILTER('Table')` in a summary reads as code. A backtick
 * run marked leaves literal, such as the unterminated fence the parse-issue page names, is dropped.
 */
const renderInline = (markdown: string): string =>
  plainText(md.parseInline(markdown, { async: false }) as string);

function header(path: string): string {
  const current = (href: string): boolean =>
    href === path || (href !== "/" && !href.startsWith("http") && path.startsWith(href));
  return `<header class="site-header">
      <div class="container">
        <a class="brand" href="/"><img src="/favicon.svg" alt="" width="28" height="28" /> pbiplint</a>
        <nav>
          ${NAV.map((n) => `<a href="${n.href}"${current(n.href) ? ' aria-current="page"' : ""}>${n.label}</a>`).join("")}
        </nav>
      </div>
    </header>`;
}

const FOOTER = `<footer class="site-footer">
      <div class="container">
        <p>Nothing you lint leaves your browser. <a href="/about/#verify">How to check that</a>.</p>
        <p>
          Free software under the AGPL-3.0-or-later license, from the makers of
          <a href="https://www.youtube.com/@TheDataPractitioner">The Data Practitioner</a>. pbiplint
          and its logo are trademarks of McKinley Consulting.
        </p>
      </div>
    </footer>`;

export interface PageOptions {
  title: string;
  description: string;
  /** Site path with a trailing slash, e.g. `/rules/hide-foreign-keys/`. */
  path: string;
  /** HTML for the inside of <main>. */
  main: string;
}

/** The shell every generated page shares. The home page (index.html) carries the same header and footer by hand. */
export function page({ title, description, path, main }: PageOptions): string {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(title)}</title>
    <meta name="description" content="${escapeHtml(description)}" />
    <link rel="canonical" href="${SITE}${escapeHtml(path)}" />
    <meta property="og:title" content="${escapeHtml(title)}" />
    <meta property="og:description" content="${escapeHtml(description)}" />
    <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
    <link rel="stylesheet" href="/src/styles.css" />
  </head>
  <body>
    ${header(path)}
    <main class="container">
${main}
    </main>
    ${FOOTER}
  </body>
</html>
`;
}

export interface RuleMeta {
  slug: string;
  id: string;
  title: string;
  category: string;
  severity: string;
  status: string;
  summary: string;
}

export function rulePage(
  markdown: string,
  slug: string,
  links: RuleLinks = new Map(),
): { html: string; meta: RuleMeta } {
  const { data, body } = parseFrontmatter(markdown, `rules/${slug}.md`);
  const title = /^# (.+)$/m.exec(body)?.[1] ?? str(data.name);
  const meta: RuleMeta = {
    slug,
    id: str(data.id),
    title,
    category: str(data.category),
    severity: str(data.severity),
    status: str(data.status),
    summary: firstParagraph(section(body, "What it checks")),
  };
  const video = str(data.video);
  const main = `<article class="rule">
  <p class="eyebrow"><a href="/rules/">Rules</a> / ${escapeHtml(meta.category)}</p>
  <h1>${escapeHtml(title)}</h1>
  <p class="meta"><span class="badge ${escapeHtml(meta.severity)}">${escapeHtml(meta.severity)}</span> <code>${escapeHtml(meta.id)}</code> · ${escapeHtml(STATUS_LABEL[meta.status] ?? meta.status)} · scope: ${escapeHtml(list(data.scope).join(", "))}</p>
  ${video ? `<p class="video"><a href="${escapeHtml(video)}">Watch the video for this rule</a></p>` : ""}
  ${render(withIgnoreHelp(body.replace(/^# .+\n/m, ""), meta.id, list(data.scope)), links, meta.id)}
  ${attribution(list(data.sources))}<p class="cta"><a class="button" href="/">Check a model for this</a> <a href="https://github.com/pbiplint/pbiplint/edit/main/rules/${escapeHtml(slug)}.md">Improve this page</a></p>
</article>`;
  return {
    html: page({
      title: `${title} · pbiplint`,
      description: plainText(meta.summary),
      path: `/rules/${slug}/`,
      main,
    }),
    meta,
  };
}

export function rulesIndex(metas: RuleMeta[]): string {
  // CATEGORY_ORDER drives the sections, so a rule with any other category would be in the count
  // at the top of the page and in no list below it. Fail the build rather than ship a rule page
  // nothing links to.
  for (const m of metas)
    if (!CATEGORY_ORDER.includes(m.category))
      throw new Error(
        `${m.slug}: unknown category "${m.category}" (add it to CATEGORY_ORDER in packages/web/src/build/pages.ts)`,
      );
  const count = (status: string): number => metas.filter((m) => m.status === status).length;
  const sections = CATEGORY_ORDER.map((category) => {
    const rows = metas
      .filter((m) => m.category === category)
      // An explicit locale: with none, the order comes from the build machine's default and the
      // same rule set can generate a different index on a different machine.
      .sort((a, b) => a.title.localeCompare(b.title, "en"));
    if (rows.length === 0) return "";
    const items = rows
      .map(
        (m) =>
          `  <li><a href="/rules/${escapeHtml(m.slug)}/">${escapeHtml(m.title)}</a> <span class="badge ${escapeHtml(m.severity)}">${escapeHtml(m.severity)}</span>${m.status === "needsLiveModel" ? ' <span class="badge muted">needs a live model</span>' : ""}<br /><span class="summary">${renderInline(m.summary)}</span></li>`,
      )
      .join("\n");
    return `<h2 id="${headingId(category)}">${escapeHtml(category)}</h2>\n<ul class="rule-list">\n${items}\n</ul>`;
  }).join("\n");
  const main = `<article class="prose">
<h1>Rules</h1>
<p>${metas.length} rules: ${count("ported")} ported from the Microsoft Best Practice Analyzer ruleset so the results match Tabular Editor, ${count("needsLiveModel")} listed but not run because they need statistics only a live model has, and ${count("builtin")} built into pbiplint. Ranked by severity, then category, then how many objects they hit.</p>
${sections}
</article>`;
  return page({
    title: "Rules · pbiplint",
    description: "Every rule pbiplint checks: what it checks, why it matters, and how to fix it.",
    path: "/rules/",
    main,
  });
}

/** A Markdown page with `title` and `description` frontmatter, such as content/about.md. */
export function contentPage(markdown: string, path: string, source: string): string {
  const { data, body } = parseFrontmatter(markdown, source);
  return page({
    title: `${str(data.title)} · pbiplint`,
    description: str(data.description),
    path,
    main: `<article class="prose">\n${render(body)}\n</article>`,
  });
}

export function sitemap(paths: string[]): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${paths.map((p) => `  <url><loc>${SITE}${escapeHtml(p)}</loc></url>`).join("\n")}
</urlset>
`;
}
