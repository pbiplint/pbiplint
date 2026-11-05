// @vitest-environment happy-dom
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { lint, resolveConfig } from "@pbiplint/core";
import { describe, expect, it } from "vitest";
import { renderResults } from "../src/results/render.js";
import { SAMPLE_CONFIG, SAMPLE_FILES } from "../src/sample.js";

const here = dirname(fileURLToPath(import.meta.url));
const css = readFileSync(join(here, "../src/styles.css"), "utf8");
const indexHtml = readFileSync(join(here, "../index.html"), "utf8");

/** Every class name used anywhere in a tree. */
function classesIn(root: ParentNode): Set<string> {
  const out = new Set<string>();
  for (const el of root.querySelectorAll("*")) for (const c of el.classList) out.add(c);
  return out;
}

/** The declarations of the rule whose selector is exactly this one, at the start of a line. */
const rule = (selector: string): string =>
  new RegExp(`(?:^|\\n)${selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")} \\{([^}]*)\\}`).exec(
    css,
  )?.[1] ?? "";

/** The two themes: dark is the :root rule, and light is that with the light block's values on top. */
const SCHEMES = ["dark", "light"] as const;
type Scheme = (typeof SCHEMES)[number];

/** The light block: the :root rule inside `@media (prefers-color-scheme: light)`. */
const light = /@media \(prefers-color-scheme: light\) \{\s*:root \{([^}]*)\}\s*\}/.exec(css);

/** A block's custom properties, in order. */
const tokensIn = (block: string): Map<string, string> =>
  new Map([...block.matchAll(/(--[a-z0-9-]+): ([^;]+);/g)].map((m) => [m[1]!, m[2]!.trim()]));

/** A theme's tokens. */
function palette(scheme: Scheme): Map<string, string> {
  const tokens = tokensIn(rule(":root"));
  if (scheme === "light") for (const [k, v] of tokensIn(light?.[1] ?? "")) tokens.set(k, v);
  return tokens;
}

/** A token's colour as red, green, and blue (0 to 255) and alpha (0 to 1). */
function channels(token: string, scheme: Scheme): number[] {
  const value = palette(scheme).get(token) ?? "";
  const hex = /^#([0-9a-f]{6})$/.exec(value)?.[1];
  if (hex !== undefined) return [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16)).concat(1);
  const fn = /^rgba\((\d+), (\d+), (\d+), ([\d.]+)\)$/.exec(value);
  if (fn) return fn.slice(1).map(Number);
  throw new Error(`no colour for ${token} in the ${scheme} theme`);
}

/**
 * A colour as it reaches the screen: a token, or "--tint over --base" for a translucent token laid
 * on an opaque one, composited the way the browser does.
 */
function screen(colour: string, scheme: Scheme): number[] {
  const [top, base] = colour.split(" over ");
  const [red, green, blue, alpha] = channels(top!, scheme);
  if (base === undefined) {
    if (alpha !== 1) throw new Error(`${top} is translucent; say what it lies over`);
    return [red!, green!, blue!];
  }
  const under = screen(base, scheme);
  return [red!, green!, blue!].map((c, i) => c * alpha! + under[i]! * (1 - alpha!));
}

/** WCAG's contrast ratio between two colours of a theme (see screen for the forms a colour takes). */
function contrast(fg: string, bg: string, scheme: Scheme): number {
  const luminance = (colour: string): number => {
    const [red, green, blue] = screen(colour, scheme).map((v) => {
      const c = v / 255;
      return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * red! + 0.7152 * green! + 0.0722 * blue!;
  };
  const [hi, lo] = [luminance(fg), luminance(bg)].sort((x, y) => y - x);
  return (hi! + 0.05) / (lo! + 0.05);
}

describe("styles.css", () => {
  it("has a rule for every class the results and the home page use", async () => {
    document.body.innerHTML = indexHtml
      .slice(indexHtml.indexOf("<body>") + 6, indexHtml.indexOf("</body>"))
      .replace(/<script[\s\S]*?<\/script>/, "");
    const container = document.createElement("section");
    document.body.append(container);
    const sample = await lint(SAMPLE_FILES, { config: resolveConfig(JSON.parse(SAMPLE_CONFIG)) });
    renderResults(container, sample, {
      source: "the sample project",
      files: SAMPLE_FILES.map((f) => f.path),
      notes: ["Old.SemanticModel holds no .tmdl files."],
    });
    // The clean run renders a different paragraph, so both shapes contribute their classes.
    const withFindings = classesIn(document.body);
    // A project rule whose findings fall on both layers is tagged project. The sample has no such
    // group, so one of its groups is relabelled to bring the tag's class in.
    const [first] = sample.groups;
    renderResults(
      container,
      { ...sample, groups: [{ ...first!, rule: { ...first!.rule, layer: "project" } }] },
      { source: "the sample project" },
    );
    const project = classesIn(document.body);
    renderResults(
      container,
      await lint([{ path: "m.tmdl", text: "model Model\n" }], { rules: [] }),
      {
        source: "pasted TMDL",
      },
    );
    const used = [...new Set([...withFindings, ...project, ...classesIn(document.body)])].sort();
    for (const c of ["facts", "fact", "flag", "detail", "layer", "model", "report", "project"])
      expect(used).toContain(c);
    expect(used.length).toBeGreaterThan(20);
    // A class in the markup with no rule behind it is either a dead hook or a style someone meant
    // to write; either way the markup and the stylesheet have drifted apart.
    expect(used.filter((c) => !new RegExp(`\\.${c}\\b`).test(css))).toEqual([]);
  });
  it("sets a caption's file name in its own case, under the caption's capitals", () => {
    // The renderer wraps the file name in code (pages.ts); the caption around it is upper case.
    expect(/\.example figcaption \{[^}]*text-transform: uppercase/.test(css)).toBe(true);
    expect(/\.example figcaption code \{[^}]*text-transform: none/.test(css)).toBe(true);
  });
  it("marks an example that fires in the danger tone and its fix in the success tone", () => {
    // A bar beside each figure, so the pair reads as before and after without reading the
    // captions (pages.ts writes the fires and fixed classes). The config figure has only the
    // example class, since it is the config an example runs under, and so has no bar.
    expect(rule(".example.fires")).toMatch(/border-left: 3px solid var\(--danger\)/);
    expect(rule(".example.fixed")).toMatch(/border-left: 3px solid var\(--success\)/);
    expect(rule(".example")).toMatch(/margin: 16px 0/);
    expect(rule(".example")).not.toMatch(/border(-left)?:/);
    // WCAG 1.4.11 asks 3:1 of a graphic against the colour beside it, here the canvas.
    for (const scheme of SCHEMES) {
      expect(contrast("--danger", "--canvas", scheme)).toBeGreaterThanOrEqual(3);
      expect(contrast("--success", "--canvas", scheme)).toBeGreaterThanOrEqual(3);
    }
  });
  it("tags a Power Query rule in its own colour and outline, readable on the canvas", () => {
    expect(rule(".layer.powerquery")).toMatch(/border-style: dotted/);
    expect(rule(".layer.powerquery")).toMatch(/color: var\(--layer-powerquery\)/);
    // Text, so WCAG 1.4.3's 4.5:1.
    for (const scheme of SCHEMES) {
      expect(contrast("--layer-powerquery", "--canvas", scheme)).toBeGreaterThanOrEqual(4.5);
      expect(contrast("--layer-powerquery", "--surface-1", scheme)).toBeGreaterThanOrEqual(4.5);
    }
  });
  it("gives the light theme values for tokens only, and only for tokens the dark theme has", () => {
    // The light theme repaints; it never restyles. A selector or a new name here would be a rule
    // the dark theme lacks.
    expect(light).not.toBeNull();
    const dark = tokensIn(rule(":root"));
    const names = [...tokensIn(light![1]!).keys()];
    expect(names.length).toBeGreaterThan(15);
    expect(names.filter((name) => !dark.has(name))).toEqual([]);
    expect(
      light![1]!
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/(--[a-z0-9-]+|color-scheme): [^;]+;/g, "")
        .trim(),
    ).toBe("");
  });
  it("switches the browser's own controls with the theme, and only a light setting switches it", () => {
    // color-scheme paints form controls, the textarea, and scrollbars.
    expect(rule(":root")).toMatch(/color-scheme: dark;/);
    expect(light![1]).toMatch(/color-scheme: light;/);
    // Only a light setting switches, so a browser that does not support the query keeps dark.
    expect(css.match(/prefers-color-scheme/g)).toHaveLength(1);
  });
  it("writes every colour as a token, so both themes reach it", () => {
    // Print is not a theme: it keeps black on paper.
    const outside = css
      .replace(/(?:^|\n):root \{[^}]*\}/, "")
      .replace(light![0], "")
      .replace(/@media print \{[\s\S]*$/, "")
      // A comment's issue number, such as #237, is not a colour.
      .replace(/\/\*[\s\S]*?\*\//g, "");
    expect(outside.match(/#[0-9a-f]{3,8}\b|\b(?:rgba?|hsla?|color-mix)\(/gi)).toBeNull();
    // Nothing after the print block, so the cut above drops only print: the block's braces close
    // at the end of the file and nowhere before it.
    const print = css.slice(css.indexOf("@media print"));
    let depth = 0;
    const closes = [...print].flatMap((c, i) =>
      c === "{" ? (depth++, []) : c === "}" && --depth === 0 ? [i] : [],
    );
    expect(closes).toEqual([print.trimEnd().length - 1]);
  });
  // Every text colour on every background it sits on: WCAG 1.4.3 asks 4.5:1 of text this size
  // (https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html).
  const TEXT: [string, string][] = [
    ...["--fg-1", "--fg-2"].flatMap((fg) =>
      ["--canvas", "--surface-1", "--surface-2", "--surface-3", "--surface-inset"].map(
        (bg): [string, string] => [fg, bg],
      ),
    ),
    // Links, the project tag, and the Power Query tag, on a rule page and inside a group.
    ...["--brand-teal-soft", "--brand-blue-soft", "--layer-powerquery"].flatMap((fg) =>
      ["--canvas", "--surface-1"].map((bg): [string, string] => [fg, bg]),
    ),
    // A button's label on its fill and on its hover fill.
    ["--canvas", "--brand-blue"],
    ["--canvas", "--brand-blue-soft"],
    // A severity badge, in a group and on a rule page.
    ...["error", "warning", "info"].flatMap((s) =>
      ["--surface-1", "--canvas"].map((bg): [string, string] => [
        `--badge-${s}-fg`,
        `--badge-${s}-bg over ${bg}`,
      ]),
    ),
    // The report-at-a-glance panel's text on its tint.
    ...["--fg-1", "--fg-2", "--brand-teal-soft", "--warning"].map((fg): [string, string] => [
      fg,
      "--teal-tint-faint over --canvas",
    ]),
  ];
  // Every mark a reader needs to see: WCAG 1.4.11 asks 3:1 of a graphic against what is beside it
  // (https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast.html).
  const GRAPHICS: [string, string][] = [
    // The bars beside a notice, an example that fires, and its fix.
    ["--danger", "--canvas"],
    ["--success", "--canvas"],
    ["--warning", "--canvas"],
    // The bar beside an error in the status line.
    ["--danger", "--surface-2"],
    // The focus ring and a report tag's edge.
    ["--brand-teal", "--canvas"],
    ["--brand-teal", "--surface-1"],
    // A group's disclosure mark.
    ["--fg-3", "--surface-1"],
  ];
  it.each(SCHEMES)("gives text 4.5:1 in the %s theme", (scheme) => {
    const low = TEXT.filter(([fg, bg]) => contrast(fg, bg, scheme) < 4.5);
    expect(low.map(([fg, bg]) => `${fg} on ${bg}: ${contrast(fg, bg, scheme).toFixed(2)}`)).toEqual(
      [],
    );
  });
  it.each(SCHEMES)("gives marks 3:1 in the %s theme", (scheme) => {
    const low = GRAPHICS.filter(([fg, bg]) => contrast(fg, bg, scheme) < 3);
    expect(low.map(([fg, bg]) => `${fg} on ${bg}: ${contrast(fg, bg, scheme).toFixed(2)}`)).toEqual(
      [],
    );
  });
  it("lets the header's links and a long rule id wrap, so a narrow page does not scroll sideways", () => {
    // At 320 pixels the brand and the links do not fit on one row, and a rule id such as
    // RELATIONSHIP_COLUMNS_SHOULD_BE_OF_INTEGER_DATA_TYPE has no hyphen to break at. The e2e suite
    // measures the page itself at that width.
    expect(rule(".site-header .container")).toMatch(/flex-wrap: wrap/);
    expect(rule(".site-header .container")).not.toMatch(/(^|\s)height:/);
    expect(rule(".site-header .nav-row")).toMatch(/flex-wrap: wrap/);
    // Every inline code span, a group's meta line and a rule page's among them; a code block
    // keeps its lines and scrolls.
    expect(rule(":not(pre) > code")).toMatch(/overflow-wrap: anywhere/);
    // A report's paths in the files read list run long with nothing to break at, too.
    expect(rule(".files li")).toMatch(/overflow-wrap: anywhere/);
    // So do the Learn URLs that end the .pbix refusal in the status line.
    expect(rule(".status")).toMatch(/overflow-wrap: anywhere/);
  });
  it("marks a link that opens in a new tab in its own colour, in a contrast theme too, and keeps its note out of a copy", () => {
    // The mark is the link's colour cut by a mask, so it follows the link's colour through hover.
    expect(rule('a[target="_blank"]::after')).toMatch(/background-color: currentColor/);
    expect(rule('a[target="_blank"]::after')).toMatch(/(^|\s)mask: url\("data:image\/svg\+xml,/);
    // A contrast theme would repaint that background in the page's colour; there it is LinkText.
    expect(css).toMatch(
      /@media \(forced-colors: active\) \{\s*a\[target="_blank"\]::after \{\s*forced-color-adjust: none;\s*background-color: LinkText;/,
    );
    expect(rule('a[target="_blank"] > .visually-hidden')).toMatch(/(^|\s)user-select: none/);
  });
});

it("keeps every page's content clear of the header's line and the footer's divider", () => {
  // main carries .container, so a bare `main` rule loses to its padding shorthand.
  expect(rule("main.container")).toContain("padding-top: 32px");
  expect(rule("main.container")).toContain("padding-bottom: 64px");
  expect(rule("main")).toBe("");
});
