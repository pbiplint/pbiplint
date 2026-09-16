import {
  CATEGORY_ORDER,
  SEVERITY_LABEL,
  skippedLine,
  summaryLine,
  topGroups,
  type LintResult,
  type RankedGroup,
  type Severity,
} from "@pbiplint/core";
import { copy, download, exportJson, exportMarkdown } from "./export.js";

export interface RenderOptions {
  /** What was linted, for the heading: "the sample project (11 files)", "pasted TMDL". */
  source: string;
  /**
   * The files that were read, as paths relative to the model root, listed under the results so a
   * file the browser skipped is visible by its absence. Omitted for a paste, where nothing was read.
   */
  files?: string[];
  /** Sentences about the input worth a notice under the summary, such as a model folder that was not linted. */
  notes?: string[];
}

type Child = Node | string | null | undefined;

/** Builds an element. Strings become text nodes, so nothing from a model file is ever parsed as HTML. */
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
const pagePath = (slug: string): string => `/rules/${slug}/`;

/** "1 error", "3 warnings", "106 info": the severity nouns as the text format writes them. */
const count = (n: number, severity: Severity): string => {
  const noun = SEVERITY_LABEL[severity];
  return `${n} ${noun}${n === 1 || noun === "info" ? "" : "s"}`;
};

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
    h("h2", {}, `Results for ${options.source}`),
    // The summary is the live region, not the section around it, so a run reaches a screen reader
    // as one sentence rather than every finding row.
    h(
      "p",
      { class: "summary", "aria-live": "polite" },
      `${summaryLine(result)}. ${skippedLine(result)}.`,
    ),
    ...(options.notes ?? []).map((note) => h("p", { class: "notice" }, note)),
    ...result.summary.unknownRules.map((id) =>
      h("p", { class: "notice" }, `pbiplint.config.json names no rule called "${id}".`),
    ),
  );
  if (result.groups.length === 0) {
    container.append(h("p", { class: "clean" }, "No findings."), ...renderFilesRead(options.files));
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
          h("a", { class: "rule-link", href: pagePath(g.rule.slug) }, "How to fix it"),
        ),
      ),
    ),
    renderExportBar(result),
    renderFilters(result),
    h("div", { class: "groups" }, ...result.groups.map(renderGroup)),
  );
  if (result.summary.ruleErrors.length)
    container.append(
      h(
        "p",
        { class: "notice" },
        "Rule errors (please report these): " +
          result.summary.ruleErrors.map((e) => `${e.id}: ${e.message}`).join("; "),
      ),
    );
  container.append(...renderFilesRead(options.files));
  // One handler for the whole container, so re-rendering never stacks listeners.
  container.onchange = (event) => {
    if ((event.target as HTMLElement).matches("input[data-filter]")) applyFilters(container);
  };
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
  return h(
    "div",
    { class: "export" },
    button("Download Markdown", () => download(exportMarkdown(result))),
    button("Download JSON", () => download(exportJson(result))),
    button("Copy Markdown", (b) => {
      const restore = (): void => {
        setTimeout(() => (b.textContent = "Copy Markdown"), 1500);
      };
      void copy(exportMarkdown(result))
        .then(() => {
          b.textContent = "Copied";
          restore();
        })
        // A browser with no clipboard API, an insecure context, an unfocused document, or a
        // refused permission all land here. Say so on the button instead of failing silently.
        .catch(() => {
          b.textContent = "Copy failed";
          restore();
        });
    }),
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
  return h(
    "fieldset",
    { class: "filters" },
    h("legend", {}, "Show"),
    ...severities.map((s) => box("severity", String(s), titleCase(SEVERITY_LABEL[s]))),
    h("span", { class: "gap" }),
    ...categories.map((c) => box("category", c, c)),
  );
}

/** Hides every group whose severity or category is unchecked. */
export function applyFilters(container: HTMLElement): void {
  const checked = (kind: string): Set<string> =>
    new Set(
      [...container.querySelectorAll<HTMLInputElement>(`input[data-filter="${kind}"]`)]
        .filter((i) => i.checked)
        .map((i) => i.value),
    );
  const severities = checked("severity");
  const categories = checked("category");
  for (const group of container.querySelectorAll<HTMLElement>(".group"))
    group.hidden = !(
      severities.has(group.dataset.severity ?? "") && categories.has(group.dataset.category ?? "")
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
    },
    // The summary is the disclosure control itself, so it holds no focusable child: the rule link
    // sits in the panel below, where activating it can only mean "open the page".
    h(
      "summary",
      {},
      h("span", { class: `badge ${label}` }, label),
      h("span", { class: "name" }, g.rule.name),
      h("span", { class: "count" }, String(g.findings.length)),
    ),
    h(
      "p",
      { class: "meta" },
      h("code", {}, g.rule.id),
      ` · ${g.rule.category} · `,
      h("a", { class: "rule-link", href: pagePath(g.rule.slug) }, "How to fix it"),
    ),
    // The wrapper scrolls sideways on a narrow screen, so a long object name never widens the page.
    h(
      "div",
      { class: "table-wrap" },
      h(
        "table",
        {},
        h(
          "thead",
          {},
          h(
            "tr",
            {},
            h("th", {}, "Object"),
            h("th", {}, "Type"),
            h("th", {}, "Location"),
            h("th", {}, "Detail"),
          ),
        ),
        h("tbody", {}, ...rows),
      ),
    ),
  );
}
