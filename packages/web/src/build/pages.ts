import { Marked, Renderer, type Tokens } from "marked";

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
  "https://github.com/NatVanG/fab-inspector/blob/main/Rules/Base-rules.json":
    "PBI Inspector's base rules by Nat Van Gulck",
};
/** The caption a fenced example carries, by the word after `tmdl` or `pbir` in its info string. */
const EXAMPLE_CAPTION: Record<string, string> = {
  fires: "Fires the rule",
  fixed: "After the fix",
};
/**
 * The info string of the fence a policy rule's page uses for the config its example runs under.
 * It renders as a figure captioned with the file name, and is neither an example that fires nor
 * one that is fixed.
 */
const CONFIG_FENCE = "json pbiplint.config.json";

export const escapeHtml = (s: string): string =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const str = (v: string | string[] | undefined): string =>
  Array.isArray(v) ? (v[0] ?? "") : (v ?? "");
const list = (v: string | string[] | undefined): string[] => (Array.isArray(v) ? v : v ? [v] : []);

/**
 * A C0 control character other than tab, line feed, and carriage return, or U+007F. A rule page
 * can need one in an example, such as the U+0001 the invalid-character pages show, which a copy of
 * the example has to keep to fire the rule. Written raw, it is an invisible byte in the page that
 * an HTML parser reports as a parse error, so the renderer writes each as a character reference
 * (characterReferences below), and check-site.ts fails the build on one that reaches a page raw.
 * The reference is visible in the page's source and in a diff. It is not valid HTML either: the
 * standard makes a reference to a control character a parse error too, which parse5 names
 * control-character-reference, except for U+000C, which HTML counts as whitespace. A browser
 * recovers from both the same way.
 */
// eslint-disable-next-line no-control-regex -- matching control characters is the whole point
export const CONTROL_CHARACTER = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;

/**
 * Each CONTROL_CHARACTER as a decimal character reference, `&#1;` for U+0001, the form marked
 * uses for the apostrophe. A browser parses the reference to the same character, so the text it
 * shows, and the text a reader copies, is unchanged. U+0000 is the exception: a browser drops it
 * raw and reads `&#0;` as U+FFFD, and no page carries one.
 */
const characterReferences = (s: string): string =>
  s.replace(CONTROL_CHARACTER, (c) => `&#${c.charCodeAt(0)};`);

/**
 * escapeHtml plus the apostrophe, for text inside <code>, matching what marked writes there, with
 * each control character a reference.
 */
const escapeCode = (s: string): string => characterReferences(escapeHtml(s).replace(/'/g, "&#39;"));

/** Report objects whose page.json or visual.json carries an `annotations` array an ignore can go in. */
const REPORT_ANNOTATED = new Set(["Page", "Visual"]);
/** The other report objects: a rule scoped to these alone is turned off for the project instead. */
const REPORT_ONLY = new Set(["Report", "Bookmark", "ReportMeasure"]);

/**
 * How to silence a rule, appended to a page's "When to ignore it" section. Core exports the same
 * text as ignoreHelp; this copy is deliberate for the reason CATEGORY_ORDER gives, and a test
 * holds the two equal.
 */
export function ignoreHelp(ruleId: string, scope: readonly string[] = []): string {
  const project = `To turn the rule off for a whole project, set \`"${ruleId}": "off"\` under \`rules\` in \`pbiplint.config.json\`.`;
  if (scope.length > 0 && scope.every((s) => s === "File"))
    return `This rule reports on files, so there is no object to annotate. ${project}`;
  if (scope.length > 0 && scope.every((s) => s === "ReportMeasure"))
    return `This rule reports on measures defined in the report, and pbiplint reads no annotation on them, so there is no object to annotate. ${project}`;
  if (scope.length > 0 && scope.every((s) => s === "Bookmark"))
    return `This rule reports on bookmarks, and a bookmark's file has no place for an annotation, so there is no object to annotate. ${project}`;
  const reportScoped =
    scope.length > 0 && scope.every((s) => REPORT_ANNOTATED.has(s) || REPORT_ONLY.has(s));
  const page = scope.includes("Page");
  const visual = scope.includes("Visual");
  if (reportScoped && (page || visual)) {
    const [object, file] =
      page && visual
        ? ["page or visual", "page.json or visual.json"]
        : page
          ? ["page", "page.json"]
          : ["visual", "visual.json"];
    return (
      `To ignore this rule on one ${object}, add \`{ "name": "pbiplint.ignore", "value": "${ruleId}" }\` to the ` +
      `\`annotations\` array of its ${file}. Power BI Desktop keeps the annotation. ${project}`
    );
  }
  if (reportScoped)
    return `This rule reports on the report itself, so there is no object to annotate. ${project}`;
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
 * distinguishes nothing, so the index's badge and the rule page's layer item both wait on
 * showsLayers below.
 */
export const SITE_LAYERS: readonly SiteLayer[] = ["model"];

/**
 * Whether the site names a rule's layer: the badge on each row of the rules index and the item in
 * a rule page's meta line. Only when more than one family is published, since with one every
 * published page would carry the same word. The index and the page take the published list as an
 * argument defaulting to SITE_LAYERS, so a test can render the two-family site before it exists.
 */
export const showsLayers = (published: readonly SiteLayer[] = SITE_LAYERS): boolean =>
  new Set(published).size > 1;

/**
 * The layer a page's frontmatter declares, which decides whether the site publishes the page
 * (decision 15). A page with no `layer` key at all counts as `model`. A key that is present but
 * empty, or names no layer, is an error rather than a fall back to `model`: the site publishes the
 * model layer, so reading a blank or mistyped key as `model` is how a report page would reach the
 * site by accident. `source` names the page in the error, as parseFrontmatter's errors do.
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
 * How a page's nth plain code block opens: as a tab stop, so a block whose long line scrolls
 * sideways can be scrolled from the keyboard, and as a named region, so a screen reader that lands
 * on the tab stop says what it has reached. A plain fence has no caption to take a name from, so
 * it is "Code block 1", "Code block 2", and so on in document order, counted apart from the
 * figures. The number keeps two of them on one page apart: axe's landmark-unique check fails two
 * regions with one name, and a screen reader's list of regions could not tell them apart either.
 * A figure's block is named by its caption (figurePre below).
 */
const plainPre = (n: number): string =>
  `<pre tabindex="0" role="region" aria-label="Code block ${n}">`;
/**
 * How a figure's code block opens: plainPre's tab stop and region, named by the figure's caption,
 * so a screen reader announces "Fires the rule in visual.json, region" when the block takes focus.
 */
const figurePre = (id: string): string =>
  `<pre tabindex="0" role="region" aria-labelledby="${id}">`;
/**
 * The id of a page's nth figure caption, counted from 1 in document order. The underscore is one
 * character headingId never writes, so no heading on the page can take a caption's id.
 */
const captionId = (n: number): string => `code_${n}`;
/**
 * marked's own fence renderer, for a fence that is not a figure, whose output gains plainPre and
 * has its control characters written as references, which marked's escaping leaves raw.
 */
const plainFence = new Renderer();

/**
 * The site's Markdown renderer. marked adds no heading ids of its own since v8, so headings get
 * them here. On a rule page, a fence whose info string is `tmdl fires` or `tmdl fixed` renders as
 * a captioned figure, and so does `pbir fires <file>` or `pbir fixed <file>`, as JSON with the
 * file it stands for in the caption (a `tree.json` document names its files by its keys, so its
 * caption stays bare). A `json pbiplint.config.json` fence renders as a JSON figure captioned
 * `pbiplint.config.json`, without the fires or fixed class, since it is the config an example
 * runs under rather than an example. Any other fence renders as marked writes it.
 *
 * Every code block is a tab stop, since a long line scrolls inside it and a keyboard could not
 * otherwise reach what is out of view (WCAG 2.1.1), and a named region, so the stop is announced
 * as something: a figure's block is labelled by its caption, whose id (captionId) counts the
 * page's figures in document order, and any other block is "Code block" with its own count,
 * "Code block 1", "Code block 2" (plainPre). Both counts start again with each document parsed,
 * so every page starts at `code_1` and "Code block 1" whichever renderer parses it.
 *
 * Every code block and code span writes a control character as a character reference
 * (CONTROL_CHARACTER). A code span naming another rule links to its page; the renderer writes
 * every other code span too, rather than handing it back to marked, whose escaping would leave a
 * control character raw.
 */
function siteMarkdown(links: RuleLinks = new Map(), self = ""): Marked {
  let figures = 0;
  let plainBlocks = 0;
  return new Marked({
    hooks: {
      preprocess(markdown: string): string {
        figures = 0;
        plainBlocks = 0;
        return markdown;
      },
    },
    renderer: {
      heading({ tokens, depth, text }: Tokens.Heading): string {
        return `<h${depth} id="${headingId(text)}">${this.parser.parseInline(tokens)}</h${depth}>\n`;
      },
      code(token: Tokens.Code): string {
        const { text, lang, escaped } = token;
        const code = (escaped ? characterReferences(text) : escapeCode(text)).replace(/\n$/, "");
        const figure = (classes: string, caption: string, language: string): string => {
          const id = captionId(++figures);
          return `<figure class="${classes}">\n<figcaption id="${id}">${caption}</figcaption>\n${figurePre(id)}<code class="language-${language}">${code}\n</code></pre>\n</figure>\n`;
        };
        if (lang === CONFIG_FENCE) return figure("example", "pbiplint.config.json", "json");
        const example = /^(tmdl|pbir) (fires|fixed)(?: (\S+))?$/.exec(lang ?? "");
        if (!example)
          return characterReferences(plainFence.code(token)).replace(
            /^<pre>/,
            plainPre(++plainBlocks),
          );
        const language = example[1] === "pbir" ? "json" : "tmdl";
        const kind = example[2]!;
        const file = example[3];
        const caption =
          file !== undefined && file !== "tree.json"
            ? `${EXAMPLE_CAPTION[kind]} in ${escapeHtml(file)}`
            : EXAMPLE_CAPTION[kind]!;
        return figure(`example ${kind}`, caption, language);
      },
      codespan({ text }: Tokens.Codespan): string {
        const code = `<code>${escapeCode(text)}</code>`;
        const slug = links.get(text);
        if (slug === undefined || text === self) return code;
        return `<a href="/rules/${escapeHtml(slug)}/">${code}</a>`;
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
  layer: RuleLayer;
  summary: string;
}

/**
 * A rule page and the metadata the index lists it by. `published` is the list showsLayers reads,
 * SITE_LAYERS unless a test renders the two-family site.
 */
export function rulePage(
  markdown: string,
  slug: string,
  links: RuleLinks = new Map(),
  published: readonly SiteLayer[] = SITE_LAYERS,
): { html: string; meta: RuleMeta } {
  const source = `rules/${slug}.md`;
  const { data, body } = parseFrontmatter(markdown, source);
  const title = /^# (.+)$/m.exec(body)?.[1] ?? str(data.name);
  const meta: RuleMeta = {
    slug,
    id: str(data.id),
    title,
    category: str(data.category),
    severity: str(data.severity),
    status: str(data.status),
    layer: pageLayer(data, source),
    summary: firstParagraph(section(body, "What it checks")),
  };
  const layerItem = showsLayers(published) ? ` · ${escapeHtml(meta.layer)} layer` : "";
  const video = str(data.video);
  const main = `<article class="rule">
  <p class="eyebrow"><a href="/rules/">Rules</a> / ${escapeHtml(meta.category)}</p>
  <h1>${escapeHtml(title)}</h1>
  <p class="meta"><span class="badge ${escapeHtml(meta.severity)}">${escapeHtml(meta.severity)}</span> <code>${escapeHtml(meta.id)}</code> · ${escapeHtml(STATUS_LABEL[meta.status] ?? meta.status)}${layerItem} · scope: ${escapeHtml(list(data.scope).join(", "))}</p>
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

/** The rules index. `published` is the list showsLayers reads, as rulePage's is. */
export function rulesIndex(
  metas: RuleMeta[],
  published: readonly SiteLayer[] = SITE_LAYERS,
): string {
  // CATEGORY_ORDER drives the sections, so a rule with any other category would be in the count
  // at the top of the page and in no list below it. Fail the build rather than ship a rule page
  // nothing links to.
  for (const m of metas)
    if (!CATEGORY_ORDER.includes(m.category))
      throw new Error(
        `${m.slug}: unknown category "${m.category}" (add it to CATEGORY_ORDER in packages/web/src/build/pages.ts)`,
      );
  const count = (status: string, layer?: RuleLayer): number =>
    metas.filter((m) => m.status === status && (layer === undefined || m.layer === layer)).length;
  // A clause whose count is zero is left out. Until pull request 7 the site publishes no report
  // page (decision 15), and "0 report rules ported from PBI Inspector's base rules" on the live
  // index advertises a source the page below lists nothing from, which is the promise this gate
  // exists to avoid making. Written as a rule rather than a fixed string, so it stays right as the
  // counts move and when the gate opens.
  const clauses: [number, string][] = [
    [
      count("ported", "model"),
      "model rules ported from Microsoft's Best Practice Analyzer ruleset so the results match Tabular Editor",
    ],
    [
      count("needsLiveModel"),
      "listed but not run because they need statistics only a live model has",
    ],
    [count("ported", "report"), "report rules ported from PBI Inspector's base rules"],
    [count("builtin"), "built into pbiplint"],
  ];
  const parts = clauses.filter(([n]) => n > 0).map(([n, text]) => `${n} ${text}`);
  // Two clauses read "A and B"; three or more take a serial comma, "A, B, and C".
  const sources =
    parts.length > 2
      ? `${parts.slice(0, -1).join(", ")}, and ${parts.at(-1)}`
      : parts.join(" and ");
  const layerBadge = (m: RuleMeta): string =>
    showsLayers(published)
      ? ` <span class="layer ${escapeHtml(m.layer)}">${escapeHtml(m.layer)}</span>`
      : "";
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
          `  <li><a href="/rules/${escapeHtml(m.slug)}/">${escapeHtml(m.title)}</a> <span class="badge ${escapeHtml(m.severity)}">${escapeHtml(m.severity)}</span>${layerBadge(m)}${m.status === "needsLiveModel" ? ' <span class="badge muted">needs a live model</span>' : ""}<br /><span class="summary">${renderInline(m.summary)}</span></li>`,
      )
      .join("\n");
    return `<h2 id="${headingId(category)}">${escapeHtml(category)}</h2>\n<ul class="rule-list">\n${items}\n</ul>`;
  }).join("\n");
  const main = `<article class="prose">
<h1>Rules</h1>
<p>${metas.length} rules: ${sources}. Ranked by severity, then category, then how many objects they hit.</p>
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
