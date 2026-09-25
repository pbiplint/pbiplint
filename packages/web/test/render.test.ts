// @vitest-environment happy-dom
import { defaultRules, lint, resolveConfig, type LintResult, type Rule } from "@pbiplint/core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { applyFilters, h, heading, renderResults } from "../src/results/render.js";
import { SAMPLE_CONFIG, SAMPLE_FILES } from "../src/sample.js";

/** The sample as the page lints it: both parts, under the sample's own config. */
const result = lint(SAMPLE_FILES, { config: resolveConfig(JSON.parse(SAMPLE_CONFIG)) });
const bare = [{ path: "m.tmdl", text: "model Model\n" }];
/** A rule that throws, so a run has a rule error to report. */
const boom: Rule = {
  id: "BOOM",
  name: "Boom",
  category: "Performance",
  severity: 3,
  scope: ["Model"],
  layer: "model",
  needs: ["model"],
  description: "Throws.",
  references: [],
  status: "builtin",
  check: () => {
    throw new Error("kaboom");
  },
};
let container: HTMLElement;

const original = Object.getOwnPropertyDescriptor(navigator, "clipboard");

beforeEach(() => {
  document.body.innerHTML = '<section id="results"></section>';
  container = document.getElementById("results")!;
});

afterEach(() => {
  if (original) Object.defineProperty(navigator, "clipboard", original);
  else Reflect.deleteProperty(navigator, "clipboard");
});

describe("renderResults", () => {
  it("opens with the privacy line, the summary, and the five groups to fix first", () => {
    renderResults(container, result, { source: "the sample project" });
    expect(container.querySelector(".privacy")!.textContent).toContain("Nothing was uploaded");
    expect(container.querySelector("h2")!.textContent).toBe(
      "Results for the sample project (model, 14 files · report, 77 files)",
    );
    expect(container.querySelector(".summary")!.textContent).toContain(
      "256 findings (19 errors, 77 warnings, 160 info) in 91 files",
    );
    const first = [...container.querySelectorAll(".fix-first li")];
    expect(first.length).toBe(5);
    expect(first[0]!.querySelector("a")!.getAttribute("href")).toBe(
      `#rule-${result.groups[0]!.rule.slug}`,
    );
  });
  it("counts the severity nouns as the text format does, with info taking no s", () => {
    // Guards the shared pluralisation: "error" and "warning" take an s, "info" is the same word
    // for one finding and many. The sample's top five carry both error cases; each warning case
    // and the info case are rendered from a group of the sample's own, since the top five has
    // none of them.
    renderResults(container, result, { source: "x" });
    const top = [...container.querySelectorAll(".fix-first li")].map((li) => li.textContent);
    expect(top[0]).toContain("(1 error)");
    expect(top[3]).toContain("(2 errors)");
    const many = result.groups.find((g) => g.rule.severity === 2 && g.findings.length === 3)!;
    renderResults(container, { ...result, groups: [many] }, { source: "x" });
    expect(container.querySelector(".fix-first li")!.textContent).toContain("(3 warnings)");
    const one = result.groups.find((g) => g.rule.severity === 2 && g.findings.length === 1)!;
    renderResults(container, { ...result, groups: [one] }, { source: "x" });
    expect(container.querySelector(".fix-first li")!.textContent).toContain("(1 warning)");
    const info = result.groups.find((g) => g.rule.severity === 1)!;
    renderResults(container, { ...result, groups: [info] }, { source: "x" });
    expect(container.querySelector(".fix-first li")!.textContent).toContain(
      `(${info.findings.length} info)`,
    );
  });
  it("links each fix-first item to its rule page as well as to its group", () => {
    renderResults(container, result, { source: "x" });
    const items = [...container.querySelectorAll(".fix-first li")];
    items.forEach((li, i) => {
      const { slug, name } = result.groups[i]!.rule;
      expect(li.querySelector("a")!.getAttribute("href")).toBe(`#rule-${slug}`);
      const link = li.querySelector("a.rule-link")!;
      expect(link.getAttribute("href")).toBe(`/rules/${slug}/`);
      // Up to ten links read "How to fix it"; the accessible name says which rule each one opens.
      expect(link.getAttribute("aria-label")).toBe(`How to fix it: ${name}`);
    });
    const group = container.querySelector(".group a.rule-link")!;
    expect(group.getAttribute("aria-label")).toBe(`How to fix it: ${result.groups[0]!.rule.name}`);
  });
  it("renders one group per rule with the objects, a page link, and severity and category data", () => {
    renderResults(container, result, { source: "x" });
    const groups = [...container.querySelectorAll<HTMLElement>(".group")];
    expect(groups.length).toBe(result.groups.length);
    const g0 = groups[0]!;
    const r0 = result.groups[0]!;
    expect(g0.id).toBe(`rule-${r0.rule.slug}`);
    expect(g0.dataset.severity).toBe(String(r0.rule.severity));
    expect(g0.dataset.category).toBe(r0.rule.category);
    expect(g0.querySelector("a.rule-link")!.getAttribute("href")).toBe(`/rules/${r0.rule.slug}/`);
    // The summary is the disclosure control, so it holds nothing else focusable (WCAG 4.1.2).
    expect(g0.querySelector("summary a")).toBeNull();
    expect(g0.querySelectorAll("tbody tr").length).toBe(r0.findings.length);
    expect(g0.querySelector("tbody td")!.textContent).toBe(r0.findings[0]!.objectName);
  });
  it("hides groups whose severity or category is unchecked", () => {
    renderResults(container, result, { source: "x" });
    const errors = container.querySelector<HTMLInputElement>(
      'input[data-filter="severity"][value="3"]',
    )!;
    errors.checked = false;
    errors.dispatchEvent(new Event("change", { bubbles: true }));
    const hidden = [...container.querySelectorAll<HTMLElement>(".group")].filter((g) => g.hidden);
    expect(hidden.length).toBe(result.groups.filter((g) => g.rule.severity === 3).length);
    expect(hidden.every((g) => g.dataset.severity === "3")).toBe(true);
    errors.checked = true;
    applyFilters(container);
    expect(container.querySelectorAll<HTMLElement>(".group[hidden]").length).toBe(0);
  });
  it("marks its header cells as column headers and says what the count counts", () => {
    renderResults(container, result, { source: "x" });
    // Found by its rule rather than its rank, so a change in the ranking cannot change the case.
    const g0 = container.querySelector<HTMLElement>("#rule-dax-columns-fully-qualified")!;
    expect([...g0.querySelectorAll("th")].map((th) => th.getAttribute("scope"))).toEqual([
      "col",
      "col",
      "col",
      "col",
    ]);
    // "2" beside a rule name is a number with no noun. The digits are for the eye and the phrase
    // for a screen reader, each hidden from the other so the count is never read out twice.
    const count = g0.querySelector(".count")!;
    expect(count.querySelector("[aria-hidden='true']")!.textContent).toBe("2");
    expect(count.querySelector(".visually-hidden")!.textContent).toBe("2 errors");
  });
  it("wraps each findings table so a long object name scrolls instead of overflowing the page", () => {
    renderResults(container, result, { source: "x" });
    const groups = [...container.querySelectorAll<HTMLElement>(".group")];
    expect(groups.every((g) => g.querySelector(".table-wrap > table") !== null)).toBe(true);
    // A scroll container with nothing focusable inside needs a tab stop and a name, or a keyboard
    // user on a narrow screen cannot scroll it (WCAG 2.1.1).
    const wrap = groups[0]!.querySelector(".table-wrap")!;
    expect(wrap.getAttribute("tabindex")).toBe("0");
    expect(wrap.getAttribute("role")).toBe("region");
    expect(wrap.getAttribute("aria-label")).toBe(`${result.groups[0]!.rule.name} findings`);
  });
  it("inserts every live region empty: the page announces a run through a persistent one", () => {
    renderResults(container, result, { source: "x" });
    const regions = [...container.querySelectorAll("[aria-live], [role=status]")];
    // The copy status is the only one, and it holds nothing yet. A region inserted with its text
    // already set may not be announced, and this block is rebuilt on every run, so nothing in here
    // narrates the run itself: #announce on the page does that.
    expect(regions.length).toBe(1);
    expect(regions[0]).toBe(container.querySelector(".export [role='status']"));
    expect(regions[0]!.textContent).toBe("");
  });
  it("labels the severity filters in title case, like the layer and category filters", () => {
    renderResults(container, result, { source: "x" });
    const labels = [...container.querySelectorAll("label.filter")].map((l) => l.textContent);
    expect(labels.slice(0, 3)).toEqual(["Error", "Warning", "Info"]);
    expect(labels.slice(3, 5)).toEqual(["Model", "Report"]);
    expect(labels[5]).toBe("Performance");
    expect(
      [...container.querySelectorAll<HTMLInputElement>('input[data-filter="severity"]')].map(
        (i) => i.value,
      ),
    ).toEqual(["3", "2", "1"]);
  });
  it("offers Markdown and JSON export", () => {
    renderResults(container, result, { source: "x" });
    expect([...container.querySelectorAll(".export button")].map((b) => b.textContent)).toEqual([
      "Download Markdown",
      "Download JSON",
      "Copy Markdown",
    ]);
  });
  it("says so on the button when the copy is refused", async () => {
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText: () => Promise.reject(new Error("NotAllowedError")) },
    });
    renderResults(container, result, { source: "x" });
    const buttons = [...container.querySelectorAll<HTMLButtonElement>(".export button")];
    const copyButton = buttons.at(-1)!;
    copyButton.click();
    // A macrotask flushes every pending microtask, well before the 1500 ms label reset.
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(copyButton.textContent).toBe("Copy failed");
  });
  it("keeps one reset timer, so a second copy cannot flip the label back early", async () => {
    const writeText = vi.fn<(text: string) => Promise<void>>().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
    vi.useFakeTimers();
    try {
      renderResults(container, result, { source: "x" });
      const button = [...container.querySelectorAll("button")].find(
        (b) => b.textContent === "Copy Markdown",
      )!;
      button.click();
      await vi.advanceTimersByTimeAsync(0);
      expect(button.textContent).toBe("Copied");
      await vi.advanceTimersByTimeAsync(1000);
      button.click();
      await vi.advanceTimersByTimeAsync(0);
      expect(button.textContent).toBe("Copied");
      // The first click's reset was due here; the second click cleared it.
      await vi.advanceTimersByTimeAsync(600);
      expect(button.textContent).toBe("Copied");
      await vi.advanceTimersByTimeAsync(900);
      expect(button.textContent).toBe("Copy Markdown");
    } finally {
      vi.useRealTimers();
    }
  });
  it("announces the copy result through its own status region", async () => {
    const writeText = vi.fn<(text: string) => Promise<void>>().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
    renderResults(container, result, { source: "x" });
    const region = container.querySelector(".export [role='status']")!;
    expect(region.textContent).toBe("");
    expect(region.classList.contains("visually-hidden")).toBe(true);
    [...container.querySelectorAll("button")]
      .find((b) => b.textContent === "Copy Markdown")!
      .click();
    await new Promise((r) => setTimeout(r, 0));
    expect(region.textContent).toBe("Report copied to the clipboard");
  });
  it("says so when there is nothing to report", () => {
    // No model small enough to write here is actually clean (a bare model trips the date table
    // rule, a model with a date table trips four more), so the empty result comes from an empty
    // rule set, the way the core format tests shape one.
    renderResults(container, lint([{ path: "m.tmdl", text: "model Model\n" }], { rules: [] }), {
      source: "pasted TMDL",
    });
    expect(container.textContent).toContain("No findings.");
    expect(container.querySelector(".filters")).toBeNull();
  });
  it("lists the files it read, collapsed, right under the summary that counts them", () => {
    const files = [
      "definition/model.tmdl",
      "definition/tables/T.tmdl",
      "../pbiplint.config.json (config)",
    ];
    renderResults(container, result, { source: "x", files });
    const details = container.querySelector<HTMLDetailsElement>("details.files")!;
    expect(details.open).toBe(false);
    expect(details.querySelector("summary")!.textContent).toBe("Files read (3)");
    expect([...details.querySelectorAll("li")].map((li) => li.textContent)).toEqual(files);
    expect(details.previousElementSibling).toBe(container.querySelector(".summary"));
    // The sample has a report, so Report at a glance follows the list.
    expect(details.nextElementSibling).toBe(container.querySelector("section.facts"));
    // A notice about the input stays with the summary; the list follows both.
    renderResults(container, result, {
      source: "x",
      files,
      notes: ["Old.SemanticModel was skipped."],
    });
    const after = container.querySelector<HTMLDetailsElement>("details.files")!;
    expect(after.previousElementSibling).toBe(container.querySelector(".notice"));
  });
  it("lists the files it read even when there are no findings, and nothing for a paste", () => {
    const clean = lint([{ path: "m.tmdl", text: "model Model\n" }], { rules: [] });
    renderResults(container, clean, { source: "x", files: ["m.tmdl"] });
    expect(container.querySelector("details.files li")!.textContent).toBe("m.tmdl");
    renderResults(container, result, { source: "pasted TMDL" });
    expect(container.querySelector("details.files")).toBeNull();
  });
  it("shows each note from the input as a notice under the summary", () => {
    renderResults(container, result, { source: "x", notes: ["Old.SemanticModel was skipped."] });
    const notice = container.querySelector(".notice")!;
    expect(notice.textContent).toBe("Old.SemanticModel was skipped.");
    expect(notice.previousElementSibling).toBe(container.querySelector(".summary"));
  });
  it("shows each of the run's diagnostics as a notice after the input's notes", () => {
    // Until the results page renders them in their own place, a notice is where a file pbiplint
    // could not read is named, so no read failure is silent.
    const message = "M/x.tmdl could not be read (locked), so it was not linted";
    const run = lint(bare, { diagnostics: [{ kind: "unread-file", path: "M/x.tmdl", message }] });
    renderResults(container, run, { source: "x", notes: ["Old.SemanticModel was skipped."] });
    expect([...container.querySelectorAll(".notice")].map((n) => n.textContent)).toEqual([
      "Old.SemanticModel was skipped.",
      message,
    ]);
  });
  it("names every rule id the config asked for that matches no rule", () => {
    const configured = lint(SAMPLE_FILES, { config: { rules: { NOPE: "off", TYPOED: "error" } } });
    renderResults(container, configured, { source: "x" });
    expect([...container.querySelectorAll(".notice")].map((n) => n.textContent)).toEqual([
      'pbiplint.config.json names no rule called "NOPE".',
      'pbiplint.config.json names no rule called "TYPOED".',
    ]);
  });
  it("reports a rule that threw, with or without findings beside it", () => {
    renderResults(container, lint(SAMPLE_FILES, { rules: [...defaultRules, boom] }), {
      source: "x",
    });
    const notice = container.querySelector(".notice")!;
    expect(notice.textContent).toBe("Rule errors (please report these): BOOM: kaboom");
    // With the summary and the other notices, not below every group, where a reader who never
    // scrolls that far never learns a rule broke.
    expect(notice.previousElementSibling).toBe(container.querySelector(".summary"));
    // Nothing to rank, so the render stops early. The rule still broke, and saying so is the only
    // way anyone reports it.
    const nothing = lint(bare, { rules: [boom] });
    expect(nothing.groups).toHaveLength(0);
    renderResults(container, nothing, { source: "x" });
    expect(container.querySelector(".notice")!.textContent).toBe(
      "Rule errors (please report these): BOOM: kaboom",
    );
  });
  it("sets its change handler on every render and leaves none behind on a clean one", () => {
    renderResults(container, result, { source: "x" });
    const first = container.onchange;
    expect(typeof first).toBe("function");
    renderResults(container, result, { source: "x" });
    // Assigned, never added: a re-render replaces the handler rather than stacking a second one.
    expect(container.onchange).not.toBe(first);
    const errors = container.querySelector<HTMLInputElement>(
      'input[data-filter="severity"][value="3"]',
    )!;
    errors.checked = false;
    errors.dispatchEvent(new Event("change", { bubbles: true }));
    expect(
      [...container.querySelectorAll<HTMLElement>(".group")].every(
        (g) => g.hidden === (g.dataset.severity === "3"),
      ),
    ).toBe(true);
    renderResults(container, lint(bare, { rules: [] }), { source: "x" });
    expect(container.onchange).toBeNull();
  });
  it("names both layers with their file counts in the heading", () => {
    renderResults(container, result, { source: "the sample project" });
    expect(container.querySelector("h2")!.textContent).toBe(
      `Results for the sample project (model, ${result.layers.model.present ? result.layers.model.files : 0} files · report, ${result.layers.report.present ? result.layers.report.files : 0} files)`,
    );
    // Present layers only: a run given one part says nothing about the part it was not given.
    const modelOnly = lint(SAMPLE_FILES.filter((f) => f.path.endsWith(".tmdl")));
    renderResults(container, modelOnly, { source: "x" });
    expect(container.querySelector("h2")!.textContent).toBe("Results for x (model, 14 files)");
    const reportOnly = lint(SAMPLE_FILES.filter((f) => !f.path.endsWith(".tmdl")));
    renderResults(container, reportOnly, { source: "x" });
    expect(container.querySelector("h2")!.textContent).toBe("Results for x (report, 77 files)");
    // One file takes no s, and a run that read neither part has no counts to give.
    expect(heading(lint([{ path: "pasted.tmdl", text: "table T\n" }]), "pasted TMDL")).toBe(
      "Results for pasted TMDL (model, 1 file)",
    );
    expect(heading(lint([]), "Proj")).toBe("Results for Proj");
  });
  it("shows the facts panel under the files list with links to a group on the page or to the rule page", () => {
    renderResults(container, result, { source: "x", files: ["a.tmdl"] });
    const facts = container.querySelector("section.facts")!;
    expect(facts.previousElementSibling!.classList.contains("files")).toBe(true);
    expect(facts.nextElementSibling!.textContent).toBe("Fix these first");
    expect(facts.querySelector("h3")!.textContent).toBe("Report at a glance");
    const rows = [...facts.querySelectorAll("dt")].map((dt) => dt.textContent);
    expect(rows).toEqual([
      "Opens on",
      "Filters pane",
      "Pages",
      "Visuals",
      "Report measures",
      "Slicers",
      "Mobile layouts",
      "Schema versions",
      "Model",
    ]);
    const opens = facts.querySelector("dd a.fact.flag")!;
    expect(opens.getAttribute("href")).toBe("#rule-opening-page-invalid");
    const plain = [...facts.querySelectorAll("dd")].find(
      (dd) => dd.textContent!.startsWith("none") || /^\d+ of \d+ pages$/.test(dd.textContent ?? ""),
    )!;
    expect(plain.querySelector("a")).toBeNull();
    // A fact whose rule ran and produced no finding links to the rule page. FILTERS_PANE_STATE
    // runs only under a policy, and the sample saves the pane open, so expecting it open runs the
    // rule and finds nothing.
    const quiet = lint(SAMPLE_FILES, {
      config: resolveConfig({ rules: { FILTERS_PANE_STATE: { expect: "open" } } }),
    });
    renderResults(container, quiet, { source: "x" });
    const page = container.querySelector("section.facts dd a[href='/rules/filters-pane-state/']")!;
    expect(page).not.toBeNull();
    expect(page.className).toBe("fact");
    // A rule that did not run links nothing: the fact is plain text.
    const off = lint(SAMPLE_FILES, {
      config: resolveConfig({ rules: { FILTERS_PANE_STATE: "off" } }),
    });
    renderResults(container, off, { source: "x" });
    const pane = [...container.querySelectorAll("section.facts dt")].find(
      (dt) => dt.textContent === "Filters pane",
    )!.nextElementSibling!;
    expect(pane.textContent).toBe("open");
    expect(pane.querySelector("a")).toBeNull();
  });
  it("pins the sample's Report at a glance: every row, value, detail, and link", () => {
    // The CLI pins the same facts in packages/cli/test/cli.test.ts. The panel renders what core
    // gives and nothing else: a value links when its fact names a rule, to the group when the run
    // has one and to the rule page when it does not.
    renderResults(container, result, { source: "x" });
    const facts = container.querySelector("section.facts")!;
    const dds = [...facts.querySelectorAll("dd")];
    const rows = [...facts.querySelectorAll("dt")].map((dt, i) => {
      const dd = dds[i]!;
      const link = dd.querySelector("a");
      return {
        label: dt.textContent,
        value: link?.textContent ?? dd.firstChild!.textContent,
        detail: dd.querySelector(".detail")?.textContent,
        link: link ? `${link.className} ${link.getAttribute("href")}` : undefined,
      };
    });
    expect(rows).toEqual([
      {
        label: "Opens on",
        value: "Scratch (hidden)",
        detail: "the page open when it was saved; no landing page set",
        link: "fact flag #rule-opening-page-invalid",
      },
      {
        label: "Filters pane",
        value: "open",
        detail: undefined,
        link: "fact flag #rule-filters-pane-state",
      },
      {
        label: "Pages",
        value: "11",
        detail: "1 hidden, 1 tooltip",
        link: "fact flag #rule-hide-tooltip-drilltrough-pages",
      },
      {
        label: "Visuals",
        value: "55",
        detail: "4 hidden; 1 custom visual type registered, 0 used",
        link: "fact flag #rule-hidden-visual-with-fields",
      },
      {
        label: "Report measures",
        value: "2",
        detail: "defined in the report, not the model",
        link: "fact flag #rule-report-level-measures",
      },
      {
        label: "Slicers",
        value: "1",
        detail: "1 saved selection",
        link: "fact flag #rule-slicer-selection-saved",
      },
      { label: "Mobile layouts", value: "none", detail: undefined, link: undefined },
      {
        label: "Schema versions",
        value: "report 3.2.0, page 2.1.0, visual 2.8.0",
        detail: undefined,
        link: undefined,
      },
      {
        label: "Model",
        value: "8 tables, 73 columns, 14 measures",
        detail: "37 columns and 2 measures not reached from this report",
        link: "fact flag #rule-not-reached-from-report",
      },
    ]);
    // Every link on the page lands on a group the page rendered.
    for (const a of facts.querySelectorAll("a.flag"))
      expect(container.querySelector(a.getAttribute("href")!)).not.toBeNull();
    // The value and its detail read as one line: "11 · 1 hidden, 1 tooltip".
    expect(dds[2]!.textContent).toBe("11 · 1 hidden, 1 tooltip");
  });
  it("places the facts panel after the last notice or the summary when no files were listed", () => {
    renderResults(container, result, { source: "x" });
    expect(container.querySelector("section.facts")!.previousElementSibling).toBe(
      container.querySelector(".summary"),
    );
    renderResults(container, result, { source: "x", notes: ["Old.SemanticModel was skipped."] });
    expect(container.querySelector("section.facts")!.previousElementSibling).toBe(
      container.querySelector(".notice"),
    );
  });
  it("leaves the facts panel out, heading and all, when the run has no report", () => {
    const modelOnly = lint(SAMPLE_FILES.filter((f) => f.path.endsWith(".tmdl")));
    expect(modelOnly.facts).toEqual([]);
    renderResults(container, modelOnly, { source: "x" });
    expect(container.querySelector(".facts")).toBeNull();
    expect(container.textContent).not.toContain("Report at a glance");
  });
  it("keeps the facts panel on a run with nothing to fix", () => {
    const clean = lint(SAMPLE_FILES, { rules: [] });
    renderResults(container, clean, { source: "x" });
    expect(container.querySelector("section.facts")).not.toBeNull();
    expect(container.querySelector(".clean")!.previousElementSibling).toBe(
      container.querySelector("section.facts"),
    );
    // No rule ran, so no fact links a rule.
    expect(container.querySelector("section.facts a")).toBeNull();
  });
  it("tags fix-first items and groups with their layer, offers a layer filter, and hides a layer when unchecked", () => {
    renderResults(container, result, { source: "x" });
    expect(container.querySelector(".fix-first li .layer")).not.toBeNull();
    // Each item ends with its group's tag.
    [...container.querySelectorAll(".fix-first li")].forEach((li, i) => {
      const layer = result.groups[i]!.rule.layer;
      expect(li.lastElementChild!.className).toBe(`layer ${layer}`);
      expect(li.lastElementChild!.textContent).toBe(layer);
    });
    const tags = [...container.querySelectorAll(".group summary .layer")].map((t) => t.textContent);
    expect(tags).toContain("report");
    expect(tags).toContain("model");
    // After the rule's name, and the same layer the group carries as data.
    for (const g of container.querySelectorAll<HTMLElement>(".group")) {
      const tag = g.querySelector("summary .layer")!;
      expect(tag.previousElementSibling!.className).toBe("name");
      expect(tag.textContent).toBe(g.dataset.layer);
    }
    const boxes = [...container.querySelectorAll<HTMLInputElement>('input[data-filter="layer"]')];
    expect(boxes.map((b) => b.value)).toEqual(["model", "report"]);
    expect(boxes.map((b) => b.parentElement!.textContent)).toEqual(["Model", "Report"]);
    // Between the severities and the categories, with a gap on each side.
    const legendAndBoxes = [...container.querySelector(".filters")!.children].map((el) =>
      el.tagName === "SPAN" ? "gap" : (el.textContent ?? ""),
    );
    expect(legendAndBoxes.slice(0, 8)).toEqual([
      "Show",
      "Error",
      "Warning",
      "Info",
      "gap",
      "Model",
      "Report",
      "gap",
    ]);
    boxes[1]!.checked = false;
    applyFilters(container);
    for (const g of container.querySelectorAll<HTMLElement>(".group"))
      expect(g.hidden).toBe(g.dataset.layer === "report");
    // The change handler reads the layer boxes too.
    boxes[1]!.checked = true;
    boxes[0]!.dispatchEvent(new Event("change", { bubbles: true }));
    expect(container.querySelectorAll(".group[hidden]").length).toBe(0);
    boxes[0]!.checked = false;
    boxes[0]!.dispatchEvent(new Event("change", { bubbles: true }));
    for (const g of container.querySelectorAll<HTMLElement>(".group"))
      expect(g.hidden).toBe(g.dataset.layer === "model");
  });
  it("offers no layer filter unless both layers have groups", () => {
    const modelOnly = lint(SAMPLE_FILES.filter((f) => f.path.endsWith(".tmdl")));
    renderResults(container, modelOnly, { source: "x" });
    expect(container.querySelector('input[data-filter="layer"]')).toBeNull();
    // One gap, between the severities and the categories, as before the report layer.
    expect(container.querySelectorAll(".filters .gap").length).toBe(1);
    // Every group still carries its tag, and every group stays shown.
    expect(container.querySelectorAll(".group summary .layer.model").length).toBe(
      modelOnly.groups.length,
    );
    applyFilters(container);
    expect(container.querySelectorAll(".group[hidden]").length).toBe(0);
  });
  it("keeps a project group shown while either layer is checked", () => {
    // A project rule whose findings fall on both layers keeps the project tag. The sample has no
    // such group, so one of its groups is relabelled.
    const mixed: LintResult = {
      ...result,
      groups: result.groups.map((g) =>
        g.rule.id === "BROKEN_FIELD_REFERENCE"
          ? { ...g, rule: { ...g.rule, layer: "project" } }
          : g,
      ),
    };
    renderResults(container, mixed, { source: "x" });
    const group = container.querySelector<HTMLElement>("#rule-broken-field-reference")!;
    expect(group.dataset.layer).toBe("project");
    expect(group.querySelector("summary .layer")!.className).toBe("layer project");
    const [model, report] = [
      ...container.querySelectorAll<HTMLInputElement>('input[data-filter="layer"]'),
    ];
    model!.checked = false;
    applyFilters(container);
    expect(group.hidden).toBe(false);
    model!.checked = true;
    report!.checked = false;
    applyFilters(container);
    expect(group.hidden).toBe(false);
    model!.checked = false;
    applyFilters(container);
    expect(group.hidden).toBe(true);
  });
  it("renders diagnostics as notices after the input notes", () => {
    const withNotice = lint(SAMPLE_FILES, {
      diagnostics: [
        {
          kind: "depth-cap",
          message: "the walk stopped 64 folders deep at Deep, so files below it were not read",
          path: "Deep",
        },
      ],
    });
    renderResults(container, withNotice, {
      source: "x",
      notes: ["Old.SemanticModel holds no .tmdl files."],
    });
    expect([...container.querySelectorAll(".notice")].map((n) => n.textContent)).toEqual([
      "Old.SemanticModel holds no .tmdl files.",
      "the walk stopped 64 folders deep at Deep, so files below it were not read",
    ]);
  });
  it("never parses model text as HTML", () => {
    const hostile = lint([
      {
        path: "t.tmdl",
        text: "table '<img src=x onerror=alert(1)>'\n\tcolumn A\n\t\tdataType: string\n",
      },
    ]);
    renderResults(container, hostile, { source: "x" });
    expect(container.querySelector("img")).toBeNull();
    expect(container.textContent).toContain("<img src=x onerror=alert(1)>");
  });
});

describe("h", () => {
  it("writes every attribute as data, and a false one not at all", () => {
    const el = h("input", {
      type: "checkbox",
      checked: true,
      disabled: false,
      value: '"><img src=x onerror=alert(1)>',
    });
    expect(el.getAttribute("type")).toBe("checkbox");
    // true is the empty string HTML writes for a boolean attribute; false leaves it off entirely.
    expect(el.getAttribute("checked")).toBe("");
    expect(el.hasAttribute("disabled")).toBe(false);
    expect(el.getAttribute("value")).toBe('"><img src=x onerror=alert(1)>');
    expect(el.querySelector("img")).toBeNull();
  });
});
