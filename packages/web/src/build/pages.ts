import { Marked, type Tokens } from "marked";

export const SITE = "https://pbiplint.com";

export const NAV = [
  { href: "/", label: "Lint" },
  { href: "/rules/", label: "Rules" },
  { href: "/about/", label: "About" },
  { href: "https://github.com/pbiplint/pbiplint", label: "GitHub" },
] as const;

const CATEGORY_ORDER = [
  "Performance",
  "Error Prevention",
  "DAX Expressions",
  "Maintenance",
  "Formatting",
  "Naming Conventions",
];
const STATUS_LABEL: Record<string, string> = {
  ported: "ported",
  needsLiveModel: "needs a live model",
  builtin: "built in",
};

export const escapeHtml = (s: string): string =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export type Frontmatter = Record<string, string | string[]>;

/** The frontmatter the rule pages use: `key: value`, `key: [a, b]`, and `key:` followed by `  - item` lines. */
export function parseFrontmatter(text: string): { data: Frontmatter; body: string } {
  const m = /^---\n([\s\S]*?)\n---\n([\s\S]*)$/.exec(text);
  if (!m) throw new Error("The page has no frontmatter");
  const data: Frontmatter = {};
  let list: string[] | null = null;
  for (const line of m[1]!.split("\n")) {
    const item = /^\s+- (.*)$/.exec(line);
    if (item && list) {
      list.push(item[1]!.trim());
      continue;
    }
    const kv = /^([A-Za-z_]+):\s*(.*)$/.exec(line);
    if (!kv) continue;
    const key = kv[1]!;
    const value = kv[2]!.trim();
    list = null;
    if (value === "") {
      list = [];
      data[key] = list;
    } else if (value.startsWith("[") && value.endsWith("]")) {
      data[key] = value
        .slice(1, -1)
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
    } else {
      data[key] = value.replace(/^"(.*)"$/, "$1");
    }
  }
  return { data, body: m[2]! };
}

const str = (v: string | string[] | undefined): string =>
  Array.isArray(v) ? (v[0] ?? "") : (v ?? "");
const list = (v: string | string[] | undefined): string[] => (Array.isArray(v) ? v : v ? [v] : []);
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

// marked adds no heading ids of its own since v8, so the renderer adds them here.
const md = new Marked({
  renderer: {
    heading({ tokens, depth, text }: Tokens.Heading): string {
      return `<h${depth} id="${headingId(text)}">${this.parser.parseInline(tokens)}</h${depth}>\n`;
    },
  },
});
const render = (markdown: string): string => md.parse(markdown, { async: false }) as string;
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

export function rulePage(markdown: string, slug: string): { html: string; meta: RuleMeta } {
  const { data, body } = parseFrontmatter(markdown);
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
  ${render(body.replace(/^# .+\n/m, ""))}
  <p class="cta"><a class="button" href="/">Check a model for this</a> <a href="https://github.com/pbiplint/pbiplint/edit/main/rules/${escapeHtml(slug)}.md">Improve this page</a></p>
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
      throw new Error(`${m.slug}: unknown category "${m.category}"`);
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
export function contentPage(markdown: string, path: string): string {
  const { data, body } = parseFrontmatter(markdown);
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
