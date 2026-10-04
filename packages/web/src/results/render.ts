import {
  CATEGORY_ORDER,
  LEARN_HELP_URLS,
  plural,
  SEVERITY_LABEL,
  showControls,
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
import {
  copy,
  download,
  exportForAssistant,
  exportJson,
  exportMarkdown,
  type ExportFile,
} from "./export.js";

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
 * setAttribute, so nothing from a model file is ever parsed as HTML. Every child string is also
 * shown through core's `showControls`, as the CLI's text format shows it, so a bidirectional
 * control in a name cannot reorder the text around it on the page, and text a later change adds is
 * covered without a call of its own. pbiplint's own words hold no control characters, so they read
 * as they are, and a string already shown through it reads the same. Attribute values are taken as
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
  for (const child of children)
    if (child != null) el.append(typeof child === "string" ? showControls(child) : child);
  return el;
}

/**
 * What a link that opens in a new tab adds to its accessible name, hidden from the eye, since the
 * stylesheet's arrow on `a[target="_blank"]` says the same thing on screen (WCAG 3.2.5). The
 * generated pages write the same words (NEW_TAB_NOTE in pages.ts).
 */
export const NEW_TAB_NOTE = " (opens in a new tab)";

/**
 * The attributes that open a link in a new tab. `rel` keeps the new page from reaching back into
 * this one through `window.opener` and keeps this page's address out of the request.
 */
export const NEW_TAB = { target: "_blank", rel: "noopener noreferrer" } as const;

/** The note as hidden text, for the end of a link that takes its name from its content. */
export const newTabNote = (): HTMLSpanElement =>
  h("span", { class: "visually-hidden" }, NEW_TAB_NOTE);

/**
 * A link that opens in a new tab, so following it leaves the results on this page where they are.
 * Its name says so: an `aria-label` ends with the note, and a link named by its content ends with
 * the note as hidden text.
 */
function newTabLink(
  attrs: Record<string, string> & { href: string },
  ...children: Child[]
): HTMLAnchorElement {
  const label = attrs["aria-label"];
  return label === undefined
    ? h("a", { ...attrs, ...NEW_TAB }, ...children, newTabNote())
    : h("a", { ...attrs, ...NEW_TAB, "aria-label": `${label}${NEW_TAB_NOTE}` }, ...children);
}

/**
 * Core's Learn URLs, the only text in a message the page links, as a pattern whose one group keeps
 * each URL when a message is split on it. Each is matched literally, so every link's href is one
 * of core's constants: text from the input, a file's name or a config's key, can at most repeat one
 * of those links, never add a destination.
 */
const literal = (text: string): string => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const LINKED = new RegExp(`(${LEARN_HELP_URLS.map(literal).join("|")})`);

/**
 * A message as children for `h`, each of core's Learn URLs in it a link, opening in a new tab as
 * every link off the site does. The status line's refusals and the results' notices both use it,
 * so a .pbix's refusal and a legacy report's notice link alike.
 */
export function withLearnLinks(text: string): (string | HTMLAnchorElement)[] {
  // Once a message is split on core's URLs, its odd parts are those URLs, which become links; a
  // message with none is one part and stays plain text.
  return text.split(LINKED).map((part, i) => (i % 2 ? newTabLink({ href: part }, part) : part));
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
 * "Results for the sample project (model, 14 files · report, 78 files)": the source, then each
 * layer the run read with its file count. Present layers only, so a run given one part says nothing
 * about the part it was not given (decision 14), and a run that read neither part names no count.
 * The page also announces these words ahead of the summary sentence, in #announce, which `h` does
 * not build, so the source, a dropped folder's name, is shown through `showControls` here.
 */
export function heading(result: LintResult, source: string): string {
  const layers = LAYERS.flatMap((name) => {
    const layer = result.layers[name];
    return layer.present ? [`${name}, ${plural(layer.files, "file")}`] : [];
  });
  const shown = showControls(source);
  return layers.length ? `Results for ${shown} (${layers.join(" · ")})` : `Results for ${shown}`;
}

/**
 * Renders a run into `container`. Every string from the input (a name, a path, a location, a
 * detail, a fact's label, value, and detail, a notice, an absent layer's reason, a config's rule
 * id, a rule's error) reaches the page as a child string of `h`, which shows it through core's
 * `showControls`, so the page and the terminal show the same text.
 *
 * The run lives only in this page, so every link that would leave it opens in a new tab: a rule's
 * page, the Privacy Promise, and Learn. Links within the results, to a group, stay in this tab.
 */
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
      newTabLink({ href: "/privacy/" }, "The pbiplint Privacy Promise"),
    ),
    h("h2", {}, heading(result, options.source)),
    // The summary is not a live region: everything is rebuilt on each run, and a region inserted
    // with its text already set may not be announced. The page announces it through #announce.
    h("p", { class: "summary" }, `${summaryLine(result)}. ${skippedLine(result)}.`),
    ...(options.notes ?? []).map((note) => h("p", { class: "notice" }, note)),
    // What the reader could not read, or read as a legacy part, follows the input's notes, so no
    // read failure is silent.
    ...result.diagnostics.map((d) => h("p", { class: "notice" }, ...withLearnLinks(d.message))),
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
    // report, 78 files)" expands into which ones.
    ...renderFilesRead(options.files),
    // What the report will do, whether or not anything fired: after everything that says what
    // was read, before what to fix. A run with no report has no facts and no panel.
    ...renderFacts(result),
  );
  // Cleared on every render and set again below only when there are filters to change and groups
  // to link to, so a run with no findings cannot leave the previous run's handlers on the container.
  container.onchange = null;
  container.onclick = null;
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
      // reachable from inside the group once it is expanded. The tag sits between the count and
      // that link, where the approved mockup puts it.
      ...topGroups(result).map((g) =>
        h(
          "li",
          {},
          h("a", { href: `#rule-${g.rule.slug}` }, g.rule.name),
          ` (${count(g.findings.length, g.rule.severity)}) `,
          layerTag(g),
          " · ",
          fixLink(g),
        ),
      ),
    ),
    ...renderExportBar(result),
    renderFilters(result),
    h("div", { class: "groups" }, ...result.groups.map(renderGroup)),
  );
  // One handler of each kind for the whole container, assigned rather than added, so re-rendering
  // replaces them instead of stacking a second one.
  container.onchange = (event) => {
    if ((event.target as HTMLElement).matches("input[data-filter]")) applyFilters(container);
  };
  // A link to a group lands on its findings: a fact flag or a fix-first name whose group a filter
  // hid would otherwise do nothing visible. The handler runs before the browser follows the link
  // and never cancels it, so the browser scrolls to the group once it is shown, as it does for a
  // shown one. Enter on a focused link fires the same click. A click with a modifier held opens
  // the link somewhere else, so this page is left as it is.
  container.onclick = (event) => {
    if (event.defaultPrevented || event.button !== 0) return;
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const link = event.target instanceof Element ? event.target.closest("a[href^='#rule-']") : null;
    const id = link?.getAttribute("href")?.slice(1);
    const group = [...container.querySelectorAll<HTMLDetailsElement>("details.group")].find(
      (g) => g.id === id,
    );
    if (!group) return;
    reveal(container, group);
    // Following the link, the browser runs its focusing steps on the group. A group cannot take
    // focus, so every engine gives it to the page itself, and WebKit's next Tab then skips the
    // whole group. Focusable for that one moment, the group takes the focus instead, whenever the
    // engine gets there (Firefox does in a later task), and hands it straight to its summary,
    // where the view already is.
    group.tabIndex = -1;
    group.addEventListener(
      "focus",
      () => {
        group.removeAttribute("tabindex");
        group.querySelector("summary")?.focus({ preventScroll: true });
      },
      { once: true },
    );
  };
}

/**
 * Shows a group a filter hid and opens it. Only the boxes that hide it are checked again (its
 * severity, its category, and its layer when there are layer boxes) and every other box stays as
 * the reader set it. A project group shows while either layer is checked, so both layer boxes are
 * checked only when neither is.
 */
function reveal(container: HTMLElement, group: HTMLDetailsElement): void {
  if (group.hidden) {
    const { severity = "", category = "", layer = "" } = group.dataset;
    const check = (box: HTMLInputElement | undefined): void => {
      if (box) box.checked = true;
    };
    check(filterBoxes(container, "severity").find((b) => b.value === severity));
    check(filterBoxes(container, "category").find((b) => b.value === category));
    const layers = filterBoxes(container, "layer");
    if (layer === "project") {
      if (!layers.some((b) => b.checked)) layers.forEach(check);
    } else check(layers.find((b) => b.value === layer));
    applyFilters(container);
  }
  group.open = true;
}

/** The Show filter's boxes of one kind: severity, category, or layer. */
function filterBoxes(container: HTMLElement, kind: string): HTMLInputElement[] {
  return [...container.querySelectorAll<HTMLInputElement>(`input[data-filter="${kind}"]`)];
}

/** A group's layer, as the tag on its row and on its fix-first item: model, report, or project. */
const layerTag = (g: RankedGroup): HTMLElement =>
  h("span", { class: `layer ${g.rule.layer}` }, g.rule.layer);

/**
 * "How to fix it", on a fix-first item and in a group's panel: the rule's page. Up to ten of them
 * read the same, so the accessible name says which rule each one opens.
 */
const fixLink = (g: RankedGroup): HTMLAnchorElement =>
  newTabLink(
    {
      class: "rule-link",
      href: pagePath(g.rule.slug),
      "aria-label": `How to fix it: ${g.rule.name}`,
    },
    "How to fix it",
  );

/**
 * "Report at a glance": what the report will do, one row per fact core gives, and nothing when it
 * gives none (a run with no report). A fact whose rule ran links its value: to the rule's group on
 * this page when the run has one, flagged, since there is something to fix, and to the rule's page,
 * in a new tab, when the rule found nothing. Every href is built from the rule id, never from report
 * text.
 */
function renderFacts(result: LintResult): HTMLElement[] {
  if (result.facts.length === 0) return [];
  const onPage = new Map(result.groups.map((g) => [g.rule.id, g.rule.slug]));
  const value = (f: Fact): Node | string => {
    if (f.ruleId === undefined) return f.value;
    const here = onPage.get(f.ruleId);
    return here === undefined
      ? newTabLink({ class: "fact", href: pagePath(slug(f.ruleId)) }, f.value)
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

function renderExportBar(result: LintResult): HTMLElement[] {
  const button = (label: string, onClick: (b: HTMLButtonElement) => void): HTMLButtonElement => {
    const b = h("button", { type: "button", class: "secondary" }, label);
    b.addEventListener("click", () => onClick(b));
    return b;
  };
  // The button label flips for everyone who can see it; this says the same thing out loud. It is
  // empty until a copy happens, so it never competes with the #announce region on the page. Both
  // copy buttons speak through it.
  const announce = h("span", { class: "visually-hidden", role: "status" });
  const copyButton = (label: string, file: () => ExportFile, copied: string): HTMLButtonElement => {
    // One handle per button for its reset: a second click before the first reset lands would
    // otherwise schedule a second one that flips the label back early.
    let restoreTimer: ReturnType<typeof setTimeout> | undefined;
    return button(label, (b) => {
      const flash = (shown: string, spoken: string): void => {
        b.textContent = shown;
        announce.textContent = spoken;
        clearTimeout(restoreTimer);
        restoreTimer = setTimeout(() => (b.textContent = label), 1500);
      };
      void copy(file())
        .then(() => flash("Copied", copied))
        // A browser with no clipboard API, an insecure context, an unfocused document, or a
        // refused permission all land here. Say so on the button and in the status region beside
        // it instead of failing silently.
        .catch(() => flash("Copy failed", "Copying to the clipboard failed"));
    });
  };
  const assistantButton = copyButton(
    "Copy for an AI assistant",
    () => exportForAssistant(result),
    "Report and guidance copied to the clipboard",
  );
  // The note under the bar says what this copy holds, so a screen reader hears it on the button.
  // One results block is on the page at a time, so the id is unique.
  assistantButton.setAttribute("aria-describedby", "export-note");
  return [
    h(
      "div",
      { class: "export" },
      button("Download Markdown", () => download(exportMarkdown(result))),
      button("Download JSON", () => download(exportJson(result))),
      copyButton("Copy Markdown", () => exportMarkdown(result), "Report copied to the clipboard"),
      assistantButton,
      announce,
    ),
    // Item 5 of the Promise, said where the copy is made: the paste, not pbiplint, sends it.
    h(
      "p",
      { class: "export-note", id: "export-note" },
      "Copy for an AI assistant adds each rule's guidance to the report. Like the report, it holds the names in your project, such as its tables, columns, measures, pages, and visuals, and its file paths. pbiplint sends nothing: what you paste goes to the service you paste it into. ",
      newTabLink({ href: "/privacy/" }, "The pbiplint Privacy Promise"),
      " covers pbiplint, not that service.",
    ),
  ];
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
  const checked = (kind: string): Set<string> =>
    new Set(
      filterBoxes(container, kind)
        .filter((i) => i.checked)
        .map((i) => i.value),
    );
  const severities = checked("severity");
  const categories = checked("category");
  const byLayer = filterBoxes(container, "layer").length > 0;
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
    // sits in the panel below, where activating it can only mean "open the page". The layer tag
    // sits between the badge and the name, where the approved mockup puts it.
    h(
      "summary",
      {},
      h("span", { class: `badge ${label}` }, label),
      layerTag(g),
      h("span", { class: "name" }, g.rule.name),
      // The digits are for the eye, the phrase for a screen reader: "2" beside a rule name is a
      // number with no noun, and both in the open would read the count out twice.
      h(
        "span",
        { class: "count" },
        h("span", { "aria-hidden": "true" }, String(g.findings.length)),
        h("span", { class: "visually-hidden" }, count(g.findings.length, g.rule.severity)),
      ),
    ),
    h("p", { class: "meta" }, h("code", {}, g.rule.id), ` · ${g.rule.category} · `, fixLink(g)),
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
