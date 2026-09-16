// @vitest-environment happy-dom
import { lint } from "@pbiplint/core";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { applyFilters, renderResults } from "../src/results/render.js";
import { SAMPLE_FILES } from "../src/sample.js";

const result = lint(SAMPLE_FILES);
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
    renderResults(container, result, { source: "the sample project (11 files)" });
    expect(container.querySelector(".privacy")!.textContent).toContain("Nothing was uploaded");
    expect(container.querySelector("h2")!.textContent).toBe(
      "Results for the sample project (11 files)",
    );
    expect(container.querySelector(".summary")!.textContent).toContain(
      "161 findings (16 errors, 39 warnings, 106 info) in 11 files",
    );
    const first = [...container.querySelectorAll(".fix-first li")];
    expect(first.length).toBe(5);
    expect(first[0]!.querySelector("a")!.getAttribute("href")).toBe(
      `#rule-${result.groups[0]!.rule.slug}`,
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
  it("puts no live region inside the results: the page announces a run through a persistent one", () => {
    renderResults(container, result, { source: "x" });
    expect(container.querySelectorAll("[aria-live], [role=status]").length).toBe(0);
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
  it("lists the files it read, collapsed, between the export buttons and the filters", () => {
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
    expect(details.previousElementSibling).toBe(container.querySelector(".export"));
    expect(details.nextElementSibling).toBe(container.querySelector(".filters"));
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
