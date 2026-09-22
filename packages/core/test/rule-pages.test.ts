import { existsSync, readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { resolveConfig } from "../src/engine/config.js";
import { lint, type LintFile } from "../src/engine/lint.js";
import { slug } from "../src/model/names.js";
import { defaultRules } from "../src/rules/index.js";
import { BPA_RULES } from "../src/rules/microsoft-bpa/bpa-rules.data.js";
import { INSPECTOR_RULES } from "../src/rules/pbi-inspector/inspector-rules.data.js";
import { SEVERITY_LABEL, type Finding, type Rule } from "../src/rules/types.js";

const rulesDir = new URL("../../../rules/", import.meta.url).pathname;
const rulesetDescription = new Map(BPA_RULES.map((r) => [r.id, r.description]));
const inspectorDescription = new Map(INSPECTOR_RULES.map((r) => [r.id, r.description]));
const ruleIds = new Set(defaultRules.map((r) => r.id));
const RULESET_URL =
  "https://github.com/microsoft/Analysis-Services/blob/master/BestPracticeRules/BPARules.json";
const INSPECTOR_URL = "https://github.com/NatVanG/fab-inspector/blob/main/Rules/Base-rules.json";
/** Pages that exist as scaffolds only; Task 19 fills them and deletes this set. */
const PENDING_PAGES = new Set([
  "remove-unused-custom-visuals",
  "reduce-visuals-on-page",
  "reduce-objects-within-visuals",
  "reduce-topn-filters",
  "reduce-advanced-filters",
  "reduce-pages",
  "avoid-show-items-with-no-data",
  "hide-tooltip-drilltrough-pages",
  "ensure-theme-colours",
  "ensure-pages-do-not-scroll-vertically",
  "ensure-alttext",
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

/** The info string of every fenced block in a section, to tell which example form a page uses. */
const infoStrings = (s: string): string[] =>
  [...s.matchAll(/^```([^\n]*)\n([\s\S]*?)\n```$/gm)].map((m) => m[1]!.trim());
const isPbirInfo = (info: string): boolean => /^pbir(\s|$)/.test(info);
const isTmdlExampleInfo = (info: string): boolean => /^tmdl (fires|fixed)$/.test(info);

const bullets = (s: string): string[] => s.split("\n").filter((l) => l.startsWith("- "));

const run = (tmdl: string): Finding[] => lint([{ path: "example.tmdl", text: tmdl }]).findings;
const hits = (findings: Finding[], id: string): Finding[] =>
  findings.filter((f) => f.ruleId === id);

const PBIR_FENCE = /^pbir (fires|fixed) (\S+)$/;
/** The pbir fences of a section: which kind, and the file each document stands for. */
const pbirFences = (s: string, kind: "fires" | "fixed"): { file: string; text: string }[] =>
  [...s.matchAll(/^```([^\n]*)\n([\s\S]*?)\n```$/gm)]
    .map((m) => ({ info: PBIR_FENCE.exec(m[1]!.trim()), text: m[2]! }))
    .filter((m) => m.info?.[1] === kind)
    .map((m) => ({ file: m.info![2]!, text: m.text }));
/** The optional config fence of a section, applied to both runs. */
const configFence = (s: string): unknown => {
  const [text] = fences(s, "json pbiplint.config.json");
  return text === undefined ? undefined : JSON.parse(text);
};

const STOCK_PAGE = "p1";
const stockReport = (): LintFile[] => [
  {
    path: "definition/report.json",
    text: JSON.stringify({
      $schema:
        "https://developer.microsoft.com/json-schemas/fabric/item/report/definition/report/3.2.0/schema.json",
      themeCollection: { baseTheme: { name: "Fluent2-CY26SU04", type: "SharedResources" } },
    }),
  },
  {
    path: "definition/pages/pages.json",
    text: JSON.stringify({ pageOrder: [STOCK_PAGE], activePageName: STOCK_PAGE }),
  },
  {
    path: `definition/pages/${STOCK_PAGE}/page.json`,
    text: JSON.stringify({
      name: STOCK_PAGE,
      displayName: "Overview",
      displayOption: "FitToPage",
      height: 720,
      width: 1280,
    }),
  },
];
/** The model a project rule's example runs against: Sales with Amount and Region, and the measure Total Sales. */
const STOCK_MODEL: LintFile = {
  path: "definition/tables/Sales.tmdl",
  text: "table Sales\n\tcolumn Amount\n\t\tdataType: decimal\n\t\tsourceColumn: Amount\n\tcolumn Region\n\t\tdataType: string\n\t\tsourceColumn: Region\n\tmeasure 'Total Sales' = SUM('Sales'[Amount])\n\tpartition Sales = m\n\t\tmode: import\n\t\tsource = 1\n",
};

/**
 * The name a document is placed under: its `name`, or `x` when it has none or cannot be read. A
 * PARSE_ISSUE example is malformed on purpose, and it still needs a place in the tree for the
 * reader to report it at.
 */
const placementId = (text: string): string => {
  try {
    const json: unknown = JSON.parse(text);
    return typeof json === "object" &&
      json !== null &&
      "name" in json &&
      typeof json.name === "string"
      ? json.name
      : "x";
  } catch {
    return "x";
  }
};

/** The files a pbir example stands for, placed in the stock tree. */
function pbirFiles(doc: { file: string; text: string }): LintFile[] {
  if (doc.file === "tree.json") {
    // A tree names its files by its keys, so it has to parse, even in a PARSE_ISSUE example.
    const json = JSON.parse(doc.text) as Record<string, unknown>;
    return [
      ...stockReport().filter((f) => !(f.path in json)),
      ...Object.entries(json).map(([path, value]) => ({
        path,
        text: JSON.stringify(value, null, 2),
      })),
    ];
  }
  const id = placementId(doc.text);
  const place: Record<string, string> = {
    "visual.json": `definition/pages/${STOCK_PAGE}/visuals/${id}/visual.json`,
    "page.json": `definition/pages/${id}/page.json`,
    "report.json": "definition/report.json",
    "pages.json": "definition/pages/pages.json",
    "bookmarks.json": "definition/bookmarks/bookmarks.json",
    "reportExtensions.json": "definition/reportExtensions.json",
    "definition.pbir": "definition.pbir",
  };
  const path = doc.file.endsWith(".bookmark.json")
    ? `definition/bookmarks/${doc.file}`
    : place[doc.file];
  if (path === undefined) throw new Error(`${doc.file} is not a file a pbir example can stand for`);
  let files = stockReport().filter((f) => f.path !== path);
  if (doc.file === "page.json" && id !== STOCK_PAGE)
    files = files
      .filter((f) => !f.path.startsWith(`definition/pages/${STOCK_PAGE}/`))
      .map((f) =>
        f.path === "definition/pages/pages.json"
          ? { ...f, text: JSON.stringify({ pageOrder: [id], activePageName: id }) }
          : f,
      );
  if (doc.file.endsWith(".bookmark.json"))
    files.push({
      path: "definition/bookmarks/bookmarks.json",
      text: JSON.stringify({ items: [{ name: id }] }),
    });
  return [...files, { path, text: doc.text }];
}

const runPbir = (
  doc: { file: string; text: string },
  withModel: boolean,
  config: unknown,
): Finding[] =>
  lint([...pbirFiles(doc), ...(withModel ? [STOCK_MODEL] : [])], {
    config: resolveConfig(config),
  }).findings;

/**
 * Proves a page's Example section through the engine: one fires fence the rule flags and one
 * fixed fence it accepts. A model rule shows TMDL; a report or project rule shows the report JSON
 * the example stands for. PARSE_ISSUE spans both layers, so its page keeps the TMDL pair and may
 * add a JSON pair beside it; no other page mixes the two.
 */
function checkExample(rule: Rule, example: string): void {
  const check = (before: Finding[], after: Finding[]): void => {
    expect(hits(before, rule.id).length, "the fires snippet produces a finding").toBeGreaterThan(0);
    if (rule.id !== "PARSE_ISSUE")
      expect(hits(before, "PARSE_ISSUE").map((f) => f.detail)).toEqual([]);
    expect(
      hits(after, rule.id).map((f) => f.objectName),
      "the fixed snippet is clean for this rule",
    ).toEqual([]);
    expect(hits(after, "PARSE_ISSUE").map((f) => f.detail)).toEqual([]);
  };
  const pbirPair = (): void => {
    const [fires, ...moreFires] = pbirFences(example, "fires");
    const [fixed, ...moreFixed] = pbirFences(example, "fixed");
    expect(fires, "one `pbir fires <file>` fence").toBeDefined();
    expect(fixed, "one `pbir fixed <file>` fence").toBeDefined();
    expect(moreFires).toEqual([]);
    expect(moreFixed).toEqual([]);
    // A fix is a fix, not a suppression.
    expect(`${fires!.text}${fixed!.text}`).not.toContain("pbiplint.ignore");
    const config = configFence(example);
    const withModel = rule.layer === "project";
    check(runPbir(fires!, withModel, config), runPbir(fixed!, withModel, config));
  };
  const infos = infoStrings(example);
  if (rule.layer === "model" || rule.id === "PARSE_ISSUE") {
    const [fires, ...moreFires] = fences(example, "tmdl fires");
    const [fixed, ...moreFixed] = fences(example, "tmdl fixed");
    expect(fires, "one `tmdl fires` fence").toBeDefined();
    expect(fixed, "one `tmdl fixed` fence").toBeDefined();
    expect(moreFires).toEqual([]);
    expect(moreFixed).toEqual([]);
    // A fix is a fix, not a suppression.
    expect(`${fires}${fixed}`).not.toContain("pbiplint.ignore");
    check(run(fires!), run(fixed!));
    if (rule.id === "PARSE_ISSUE" && infos.some(isPbirInfo)) pbirPair();
    else expect(infos.filter(isPbirInfo), "pbir fences on a model page").toEqual([]);
    return;
  }
  expect(infos.filter(isTmdlExampleInfo), "tmdl example fences on a report page").toEqual([]);
  pbirPair();
}

describe.each(defaultRules.map((r) => [r.id, r] as const))("rule page for %s", (_id, rule) => {
  const path = `${rulesDir}${slug(rule.id)}.md`;

  if (PENDING_PAGES.has(slug(rule.id))) {
    it("exists as a scaffold, to be written in Task 19", () => {
      expect(existsSync(path), path).toBe(true);
    });
    return;
  }

  it("exists with matching frontmatter and the required sections", () => {
    expect(existsSync(path), path).toBe(true);
    const text = readFileSync(path, "utf8");
    const [, frontmatter = ""] = /^---\n([\s\S]*?)\n---\n/.exec(text) ?? [];
    expect(frontmatter).toContain(`id: ${rule.id}`);
    expect(frontmatter).toContain(`severity: ${SEVERITY_LABEL[rule.severity]}`);
    expect(frontmatter).toContain(`status: ${rule.status}`);
    expect(frontmatter).toContain(`category: ${rule.category}`);
    expect(frontmatter).toContain(`scope: [${rule.scope.join(", ")}]`);
    expect(frontmatter).toContain(`layer: ${rule.layer}`);
    // Every page has these; the template block below checks the rest.
    for (const heading of ["## What it checks", "## Why it matters", "## How to fix it"])
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
    const source = rule.layer === "report" ? inspectorDescription : rulesetDescription;
    const ruleset = source.get(rule.id) ?? "";
    const firstSentence = normalize(ruleset.split(/\.\s|\n/)[0] ?? "");
    if (firstSentence.length >= 30)
      expect(normalize(section(text, "Why it matters"))).not.toContain(firstSentence);
  });

  it("is the source of the rule's description in tool output", () => {
    // rule-summaries.data.ts is generated from the page; rerun scripts/sync-rule-pages.mjs after editing.
    const text = readFileSync(path, "utf8");
    expect(rule.description).toBe(firstParagraph(section(text, "What it checks")));
  });

  describe("meets the complete template", () => {
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
      const expectedSources =
        rule.status === "builtin" ? [] : [rule.layer === "report" ? INSPECTOR_URL : RULESET_URL];
      expect(sources).toEqual(expectedSources);
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
        checkExample(rule, section(readFileSync(path, "utf8"), "Example"));
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

describe("documented deviations", () => {
  const expectationsDir = new URL("../../../tests/expectations/", import.meta.url).pathname;
  const deviations = readdirSync(expectationsDir)
    .filter((f) => f.endsWith(".report.json"))
    .flatMap((f) =>
      Object.entries(
        (
          JSON.parse(readFileSync(expectationsDir + f, "utf8")) as {
            deviations: Record<string, string>;
          }
        ).deviations,
      ),
    );
  it.each(deviations)(
    "%s is named, in the same words, in the page's Quirks section",
    (id, sentence) => {
      const path = `${rulesDir}${slug(id)}.md`;
      // A scaffold is held to existence only, as in the describe.each above; Task 19 writes the Quirks.
      if (PENDING_PAGES.has(slug(id))) {
        expect(existsSync(path), path).toBe(true);
        return;
      }
      expect(section(readFileSync(path, "utf8"), "Quirks")).toContain(sentence);
    },
  );
});

describe("the pbir example hook", () => {
  // Every report page is a scaffold until Task 19, so these prove the hook on examples of its own.
  const ruleById = (id: string): Rule => defaultRules.find((r) => r.id === id)!;
  const fence = (info: string, body: unknown): string =>
    `\`\`\`${info}\n${typeof body === "string" ? body : JSON.stringify(body, null, 2)}\n\`\`\``;
  const example = (...blocks: string[]): string => `\n${blocks.join("\n\n")}\n`;
  const card = (name: string, altText?: string): Record<string, unknown> => ({
    name,
    position: { x: 0, y: 0, z: 0, height: 100, width: 100, tabOrder: 0 },
    visual: {
      visualType: "cardVisual",
      ...(altText === undefined
        ? {}
        : {
            visualContainerObjects: {
              general: [
                { properties: { altText: { expr: { Literal: { Value: `'${altText}'` } } } } },
              ],
            },
          }),
    },
  });
  const altText = ruleById("ENSURE_ALTTEXT");

  it("places a visual.json on the stock page and proves the pair", () => {
    checkExample(
      altText,
      example(
        fence("pbir fires visual.json", card("salesCard")),
        fence("pbir fixed visual.json", card("salesCard", "Total sales")),
      ),
    );
    // The pair is checked, not only read: a fixed document that still fires fails.
    expect(() =>
      checkExample(
        altText,
        example(
          fence("pbir fires visual.json", card("salesCard")),
          fence("pbir fixed visual.json", card("salesCard")),
        ),
      ),
    ).toThrow("the fixed snippet is clean for this rule");
  });

  it("places a page.json under its own name, in place of the stock page", () => {
    const detail = (height: number) => ({
      name: "detail",
      displayName: "Detail",
      displayOption: "FitToPage",
      height,
      width: 1280,
    });
    checkExample(
      ruleById("ENSURE_PAGES_DO_NOT_SCROLL_VERTICALLY"),
      example(
        fence("pbir fires page.json", detail(1440)),
        fence("pbir fixed page.json", detail(720)),
      ),
    );
    const files = pbirFiles({ file: "page.json", text: JSON.stringify(detail(720)) });
    expect(files.map((f) => f.path).sort()).toEqual([
      "definition/pages/detail/page.json",
      "definition/pages/pages.json",
      "definition/report.json",
    ]);
  });

  it("writes each entry of a tree.json as its own file and applies the config fence to both runs", () => {
    const visuals = (...names: string[]) =>
      Object.fromEntries(
        names.map((n) => [`definition/pages/${STOCK_PAGE}/visuals/${n}/visual.json`, card(n, n)]),
      );
    const pair = [
      fence("pbir fires tree.json", visuals("a", "b")),
      fence("pbir fixed tree.json", visuals("a")),
    ];
    const rule = ruleById("REDUCE_VISUALS_ON_PAGE");
    const config = fence("json pbiplint.config.json", {
      rules: { REDUCE_VISUALS_ON_PAGE: { max: 1 } },
    });
    checkExample(rule, example(config, ...pair));
    // Without the config the default of 20 holds and the fires tree is clean, so the fence is what fired it.
    expect(() => checkExample(rule, example(...pair))).toThrow(
      "the fires snippet produces a finding",
    );
  });

  it("places a malformed document for PARSE_ISSUE and runs it beside the TMDL pair", () => {
    const rule = ruleById("PARSE_ISSUE");
    const tmdl = section(readFileSync(`${rulesDir}parse-issue.md`, "utf8"), "Example");
    const malformed = '{ "name": "salesCard", "visual": ';
    const json = [
      fence("pbir fires visual.json", malformed),
      fence("pbir fixed visual.json", card("salesCard", "Total sales")),
    ];
    checkExample(rule, `${tmdl}\n${json.join("\n\n")}\n`);
    // A document that cannot be read has no name to place it by, so it goes under x.
    expect(pbirFiles({ file: "visual.json", text: malformed }).at(-1)!.path).toBe(
      `definition/pages/${STOCK_PAGE}/visuals/x/visual.json`,
    );
    // A tree names its files itself, so it has to parse.
    expect(() => pbirFiles({ file: "tree.json", text: malformed })).toThrow();
    // Half a pair is refused, as on a report page.
    expect(() => checkExample(rule, `${tmdl}\n${json[0]}\n`)).toThrow(
      "one `pbir fixed <file>` fence",
    );
  });

  it("refuses pbir fences on a model page and tmdl example fences on a report page", () => {
    const hideForeignKeys = section(
      readFileSync(`${rulesDir}hide-foreign-keys.md`, "utf8"),
      "Example",
    );
    const json = fence("pbir fires visual.json", card("salesCard"));
    expect(() =>
      checkExample(ruleById("HIDE_FOREIGN_KEYS"), `${hideForeignKeys}\n${json}\n`),
    ).toThrow("pbir fences on a model page");
    expect(() =>
      checkExample(
        altText,
        example(
          fence("pbir fires visual.json", card("salesCard")),
          fence("pbir fixed visual.json", card("salesCard", "Total sales")),
          fence("tmdl fires", "table Sales"),
        ),
      ),
    ).toThrow("tmdl example fences on a report page");
  });
});
