import {
  CATEGORY_ORDER,
  plural,
  SEVERITY_LABEL,
  skippedLine,
  slug,
  summaryLine,
  topGroups,
  type Fact,
  type LayerName,
  type LintResult,
  type RankedGroup,
  type Severity,
} from "@pbiplint/core";
import { copy, download, exportJson, exportMarkdown } from "./export.js";

export interface RenderOptions {
  /**
   * What was linted, without counts: "the sample project", "pasted TMDL", or a dropped folder's
   * name. The heading adds each layer's file count from the result (see heading).
   */
  source: string;
  /**
   * The files that were read, as paths relative to the project root, listed under the results so
   * a file the browser skipped is visible by its absence. Omitted for a paste, where nothing was
   * read.
   */
  files?: string[];
  /** Sentences about the input worth a notice under the summary, such as a model folder that was not linted. */
  notes?: string[];
}

type Child = Node | string | null | undefined;

/**
 * Builds an element. Every child string becomes a text node and every attribute is written with
 * setAttribute, so nothing from a model file is ever parsed as HTML. Attribute values are taken as
 * given, though: a href or a handler name would be set exactly as passed, which is why every
 * attribute here is built from pbiplint's own strings and never from model text.
 */
export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | boolean> = {},
  ...children: Child[]
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [name, value] of Object.entries(attrs)) {
    if (value === false) continue;
    el.setAttribute(name, value === true ? "" : value);
  }
  for (const child of children) if (child != null) el.append(child);
  return el;
}

const SEVERITIES: readonly Severity[] = [3, 2, 1];
const LAYERS: readonly LayerName[] = ["model", "report"];
const pagePath = (slug: string): string => `/rules/${slug}/`;

/** "1 error", "3 warnings", "106 info": the severity nouns as the text format writes them. */
const count = (n: number, severity: Severity): string => {
  const noun = SEVERITY_LABEL[severity];
  // "info" reads the same for one finding and for many, which is the case core's plural leaves
  // to its caller.
  return noun === "info" ? `${n} ${noun}` : plural(n, noun);
};

/**
 * "Results for the sample project (model, 14 files · report, 77 files)": the source, then each
 * layer the run read with its file count. Present layers only, so a run given one part says nothing
 * about the part it was not given (decision 14), and a run that read neither part names no count.
 * The page announces the same words ahead of the summary sentence.
 */
export function heading(result: LintResult, source: string): string {
  const layers = LAYERS.flatMap((name) => {
    const layer = result.layers[name];
    return layer.present ? [`${name}, ${plural(layer.files, "file")}`] : [];
  });
  return layers.length ? `Results for ${source} (${layers.join(" · ")})` : `Results for ${source}`;
}

export function renderResults(
  container: HTMLElement,
  result: LintResult,
  options: RenderOptions,
): void {
  container.replaceChildren(
    h(
      "p",
      { class: "privacy" },
      "Nothing was uploaded. The analysis ran in this browser tab. ",
      h("a", { href: "/about/#verify" }, "How to check that"),
    ),
    h("h2", {}, heading(result, options.source)),
    // The summary is not a live region: everything is rebuilt on each run, and a region inserted
    // with its text already set may not be announced. The page announces it through #announce.
    h("p", { class: "summary" }, `${summaryLine(result)}. ${skippedLine(result)}.`),
    ...(options.notes ?? []).map((note) => h("p", { class: "notice" }, note)),
    // What the reader could not read, or read as a legacy part, follows the input's notes, so no
    // read failure is silent.
    ...result.diagnostics.map((d) => h("p", { class: "notice" }, d.message)),
    ...result.summary.unknownRules.map((id) =>
      h("p", { class: "notice" }, `pbiplint.config.json names no rule called "${id}".`),
    ),
    // Beside the other notices rather than below the groups: a rule that threw is worth reporting
    // whether or not the rules that ran found anything, and a clean run stops before the groups.
    ...(result.summary.ruleErrors.length
      ? [
          h(
            "p",
            { class: "notice" },
            "Rule errors (please report these): " +
              result.summary.ruleErrors.map((e) => `${e.id}: ${e.message}`).join("; "),
          ),
        ]
      : []),
    // Right under the sentence that counts the files, so the heading's "(model, 14 files ·
    // report, 77 files)" expands into which ones.
    ...renderFilesRead(options.files),
    // What the report will do, whether or not anything fired: after everything that says what
    // was read, before what to fix. A run with no report has no facts and no panel.
    ...renderFacts(result),
  );
  // Cleared on every render and set again below only when there are filters to change, so a run
  // with no findings cannot leave the previous run's handler on the container.
  container.onchange = null;
  if (result.groups.length === 0) {
    container.append(h("p", { class: "clean" }, "No findings."));
    return;
  }
  container.append(
    h("h3", {}, "Fix these first"),
    h(
      "ol",
      { class: "fix-first" },
      // The name jumps to the group; the second link opens the rule page, which is otherwise only
      // reachable from inside the group once it is expanded.
      ...topGroups(result).map((g) =>
        h(
          "li",
          {},
          h("a", { href: `#rule-${g.rule.slug}` }, g.rule.name),
          ` (${count(g.findings.length, g.rule.severity)}) · `,
          h(
            "a",
            {
              class: "rule-link",
              href: pagePath(g.rule.slug),
              "aria-label": `How to fix it: ${g.rule.name}`,
            },
            "How to fix it",
          ),
          " ",
          layerTag(g),
        ),
      ),
    ),
    renderExportBar(result),
    renderFilters(result),
    h("div", { class: "groups" }, ...result.groups.map(renderGroup)),
  );
  // One handler for the whole container, assigned rather than added, so re-rendering replaces it
  // instead of stacking a second one.
  container.onchange = (event) => {
    if ((event.target as HTMLElement).matches("input[data-filter]")) applyFilters(container);
  };
}

/** A group's layer, as the tag on its row and on its fix-first item: model, report, or project. */
const layerTag = (g: RankedGroup): HTMLElement =>
  h("span", { class: `layer ${g.rule.layer}` }, g.rule.layer);

/**
 * "Report at a glance": what the report will do, one row per fact core gives, and nothing when it
 * gives none (a run with no report). A fact whose rule ran links its value: to the rule's group on
 * this page when the run has one, flagged, since there is something to fix, and to the rule's page
 * when the rule found nothing. Every href is built from the rule id, never from report text.
 */
function renderFacts(result: LintResult): HTMLElement[] {
  if (result.facts.length === 0) return [];
  const onPage = new Map(result.groups.map((g) => [g.rule.id, g.rule.slug]));
  const value = (f: Fact): Node | string => {
    if (f.ruleId === undefined) return f.value;
    const here = onPage.get(f.ruleId);
    return here === undefined
      ? h("a", { class: "fact", href: pagePath(slug(f.ruleId)) }, f.value)
      : h("a", { class: "fact flag", href: `#rule-${here}` }, f.value);
  };
  return [
    h(
      "section",
      { class: "facts" },
      h("h3", {}, "Report at a glance"),
      h(
        "dl",
        {},
        ...result.facts.flatMap((f) => [
          h("dt", {}, f.label),
          h(
            "dd",
            {},
            value(f),
            ...(f.detail === undefined ? [] : [" · ", h("span", { class: "detail" }, f.detail)]),
          ),
        ]),
      ),
    ),
  ];
}

/** The files that were read, collapsed: the count is enough until a file seems to be missing. */
function renderFilesRead(files: string[] | undefined): HTMLElement[] {
  if (!files) return [];
  return [
    h(
      "details",
      { class: "files" },
      h("summary", {}, `Files read (${files.length})`),
      h("ul", {}, ...files.map((path) => h("li", { class: "mono" }, path))),
    ),
  ];
}

function renderExportBar(result: LintResult): HTMLElement {
  const button = (label: string, onClick: (b: HTMLButtonElement) => void): HTMLButtonElement => {
    const b = h("button", { type: "button", class: "secondary" }, label);
    b.addEventListener("click", () => onClick(b));
    return b;
  };
  // One handle for the copy button's reset: a second click before the first reset lands would
  // otherwise schedule a second one that flips the label back early.
  let restoreTimer: ReturnType<typeof setTimeout> | undefined;
  // The button label flips for everyone who can see it; this says the same thing out loud. It is
  // empty until a copy happens, so it never competes with the #announce region on the page.
  const announce = h("span", { class: "visually-hidden", role: "status" });
  return h(
    "div",
    { class: "export" },
    button("Download Markdown", () => download(exportMarkdown(result))),
    button("Download JSON", () => download(exportJson(result))),
    button("Copy Markdown", (b) => {
      const flash = (label: string, spoken: string): void => {
        b.textContent = label;
        announce.textContent = spoken;
        clearTimeout(restoreTimer);
        restoreTimer = setTimeout(() => (b.textContent = "Copy Markdown"), 1500);
      };
      void copy(exportMarkdown(result))
        .then(() => flash("Copied", "Report copied to the clipboard"))
        // A browser with no clipboard API, an insecure context, an unfocused document, or a
        // refused permission all land here. Say so on the button and in the status region beside
        // it instead of failing silently.
        .catch(() => flash("Copy failed", "Copying to the clipboard failed"));
    }),
    announce,
  );
}

function renderFilters(result: LintResult): HTMLElement {
  const box = (kind: string, value: string, label: string): HTMLElement =>
    h(
      "label",
      { class: "filter" },
      h("input", { type: "checkbox", checked: true, "data-filter": kind, value }),
      label,
    );
  const severities = SEVERITIES.filter((s) => result.groups.some((g) => g.rule.severity === s));
  const categories = CATEGORY_ORDER.filter((c) => result.groups.some((g) => g.rule.category === c));
  // "Error", not "error": the category labels beside them are title case.
  const titleCase = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);
  // A Model and Report pair only when both layers have groups: with one, unchecking it would only
  // hide everything, which the severity boxes already do.
  const layers = LAYERS.filter((l) => result.groups.some((g) => g.rule.layer === l));
  return h(
    "fieldset",
    { class: "filters" },
    h("legend", {}, "Show"),
    ...severities.map((s) => box("severity", String(s), titleCase(SEVERITY_LABEL[s]))),
    ...(layers.length === LAYERS.length
      ? [h("span", { class: "gap" }), ...layers.map((l) => box("layer", l, titleCase(l)))]
      : []),
    h("span", { class: "gap" }),
    ...categories.map((c) => box("category", c, c)),
  );
}

/**
 * Hides every group whose severity, category, or layer is unchecked. A project group, whose
 * findings fall on both layers, stays shown while either layer is checked. With no layer boxes,
 * a run with groups on one layer, the layer hides nothing.
 */
export function applyFilters(container: HTMLElement): void {
  const boxes = (kind: string): HTMLInputElement[] => [
    ...container.querySelectorAll<HTMLInputElement>(`input[data-filter="${kind}"]`),
  ];
  const checked = (kind: string): Set<string> =>
    new Set(
      boxes(kind)
        .filter((i) => i.checked)
        .map((i) => i.value),
    );
  const severities = checked("severity");
  const categories = checked("category");
  const byLayer = boxes("layer").length > 0;
  const layers = checked("layer");
  const layerShown = (layer: string): boolean =>
    !byLayer || (layer === "project" ? layers.size > 0 : layers.has(layer));
  for (const group of container.querySelectorAll<HTMLElement>(".group"))
    group.hidden = !(
      severities.has(group.dataset.severity ?? "") &&
      categories.has(group.dataset.category ?? "") &&
      layerShown(group.dataset.layer ?? "")
    );
}

function renderGroup(g: RankedGroup): HTMLElement {
  const label = SEVERITY_LABEL[g.rule.severity];
  const rows = g.findings.map((f) =>
    h(
      "tr",
      {},
      h("td", { class: "mono" }, f.objectName),
      h("td", {}, f.objectType),
      h("td", { class: "mono" }, f.location ? `${f.location.file}:${f.location.line}` : ""),
      h("td", {}, f.detail ?? ""),
    ),
  );
  return h(
    "details",
    {
      class: "group",
      id: `rule-${g.rule.slug}`,
      "data-severity": String(g.rule.severity),
      "data-category": g.rule.category,
      "data-layer": g.rule.layer,
    },
    // The summary is the disclosure control itself, so it holds no focusable child: the rule link
    // sits in the panel below, where activating it can only mean "open the page".
    h(
      "summary",
      {},
      h("span", { class: `badge ${label}` }, label),
      h("span", { class: "name" }, g.rule.name),
      layerTag(g),
      // The digits are for the eye, the phrase for a screen reader: "2" beside a rule name is a
      // number with no noun, and both in the open would read the count out twice.
      h(
        "span",
        { class: "count" },
        h("span", { "aria-hidden": "true" }, String(g.findings.length)),
        h("span", { class: "visually-hidden" }, count(g.findings.length, g.rule.severity)),
      ),
    ),
    h(
      "p",
      { class: "meta" },
      h("code", {}, g.rule.id),
      ` · ${g.rule.category} · `,
      h(
        "a",
        {
          class: "rule-link",
          href: pagePath(g.rule.slug),
          "aria-label": `How to fix it: ${g.rule.name}`,
        },
        "How to fix it",
      ),
    ),
    // The wrapper scrolls sideways on a narrow screen, so a long object name never widens the page.
    // Nothing inside it takes focus, so it is a named tab stop of its own for keyboard scrolling.
    h(
      "div",
      {
        class: "table-wrap",
        tabindex: "0",
        role: "region",
        "aria-label": `${g.rule.name} findings`,
      },
      h(
        "table",
        {},
        h(
          "thead",
          {},
          h(
            "tr",
            {},
            // scope="col", so a screen reader naming a cell's column reads the right heading
            // rather than guessing from the table's shape.
            h("th", { scope: "col" }, "Object"),
            h("th", { scope: "col" }, "Type"),
            h("th", { scope: "col" }, "Location"),
            h("th", { scope: "col" }, "Detail"),
          ),
        ),
        h("tbody", {}, ...rows),
      ),
    ),
  );
}
