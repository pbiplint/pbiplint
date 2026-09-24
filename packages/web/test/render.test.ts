// @vitest-environment happy-dom
import { defaultRules, lint, type Rule } from "@pbiplint/core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { applyFilters, h, renderResults } from "../src/results/render.js";
import { SAMPLE_FILES } from "../src/sample.js";

const result = lint(SAMPLE_FILES);
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
    renderResults(container, result, { source: "the sample project (14 files)" });
    expect(container.querySelector(".privacy")!.textContent).toContain("Nothing was uploaded");
    expect(container.querySelector("h2")!.textContent).toBe(
      "Results for the sample project (14 files)",
    );
    expect(container.querySelector(".summary")!.textContent).toContain(
      "185 findings (16 errors, 54 warnings, 115 info) in 14 files",
    );
    const first = [...container.querySelectorAll(".fix-first li")];
    expect(first.length).toBe(5);
    expect(first[0]!.querySelector("a")!.getAttribute("href")).toBe(
      `#rule-${result.groups[0]!.rule.slug}`,
    );
  });
  it("counts the severity nouns as the text format does, with info taking no s", () => {
    // Guards the shared pluralisation: "error" and "warning" take an s, "info" is the same word
    // for one finding and many. The sample's top five carry the plural cases; the singular
    // warning and the info case are each rendered from a group of the sample's own, since the
    // top five has neither.
    renderResults(container, result, { source: "x" });
    const top = [...container.querySelectorAll(".fix-first li")].map((li) => li.textContent);
    expect(top[0]).toContain("(2 errors)");
    expect(top[3]).toContain("(3 warnings)");
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
    const g0 = container.querySelector<HTMLElement>(".group")!;
    const r0 = result.groups[0]!;
    expect([...g0.querySelectorAll("th")].map((th) => th.getAttribute("scope"))).toEqual([
      "col",
      "col",
      "col",
      "col",
    ]);
    // "2" beside a rule name is a number with no noun. The digits are for the eye and the phrase
    // for a screen reader, each hidden from the other so the count is never read out twice.
    const count = g0.querySelector(".count")!;
    expect(r0.rule.id).toBe("DAX_COLUMNS_FULLY_QUALIFIED");
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
  it("labels the severity filters in title case, like the category filters", () => {
    renderResults(container, result, { source: "x" });
    const labels = [...container.querySelectorAll("label.filter")].map((l) => l.textContent);
    expect(labels.slice(0, 3)).toEqual(["Error", "Warning", "Info"]);
    expect(labels[3]).toBe("Performance");
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
    expect(details.nextElementSibling).toBe(container.querySelector("h3"));
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
