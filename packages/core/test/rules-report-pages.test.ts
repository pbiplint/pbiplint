import { describe, expect, it } from "vitest";
import { lint } from "../src/engine/lint.js";
import {
  HIDE_TOOLTIP_DRILLTROUGH_PAGES,
  ENSURE_PAGES_DO_NOT_SCROLL_VERTICALLY,
} from "../src/rules/pbi-inspector/pages.js";
import { REMOVE_UNUSED_CUSTOM_VISUALS } from "../src/rules/pbi-inspector/report.js";
import { customVisualUseUnknown } from "../src/rules/report-helpers.js";
import { j, page, pretty, reportObjectIds, visual } from "./report-helpers.js";

describe("REMOVE_UNUSED_CUSTOM_VISUALS", () => {
  it("names each registered custom visual no visual uses", () => {
    const files = [
      {
        path: "definition/report.json",
        text: j({ publicCustomVisuals: ["ChicletSlicer1448559807354", "Used123"] }),
      },
      page("p"),
      visual("p", "v", "Used123"),
    ];
    expect(reportObjectIds(REMOVE_UNUSED_CUSTOM_VISUALS, files)).toEqual([
      "ChicletSlicer1448559807354",
    ]);
    expect(
      reportObjectIds(REMOVE_UNUSED_CUSTOM_VISUALS, [
        { path: "definition/report.json", text: j({}) },
        page("p"),
      ]),
    ).toEqual([]);
  });
  it("is skipped while a visual.json could not be read, since that visual could be of any registered type", () => {
    const files = [
      {
        path: "definition/report.json",
        text: j({ publicCustomVisuals: ["ChicletSlicer1448559807354", "Used123"] }),
      },
      page("p"),
      visual("p", "v", "Used123"),
    ];
    const run = (...extra: { path: string; text: string }[]) =>
      lint([...files, ...extra], { rules: [REMOVE_UNUSED_CUSTOM_VISUALS] });
    const unread = run({
      path: "definition/pages/p/visuals/w/visual.json",
      text: '{ "name": "w", ',
    });
    expect(unread.summary.rulesSkipped).toEqual([
      { id: "REMOVE_UNUSED_CUSTOM_VISUALS", reason: "reportFileUnread" },
    ]);
    expect(unread.findings).toEqual([]);
    // A page.json, a mobile.json, or pages.json that could not be read holds no visual's type.
    for (const file of [
      { path: "definition/pages/q/page.json", text: "{" },
      { path: "definition/pages/p/visuals/v/mobile.json", text: "{" },
      { path: "definition/pages/pages.json", text: "<<<<<<< HEAD\n{}\n" },
    ]) {
      const r = run(file);
      expect(r.summary.rulesSkipped, file.path).toEqual([]);
      expect(
        r.findings.map((f) => f.objectId),
        file.path,
      ).toEqual(["ChicletSlicer1448559807354"]);
    }
    expect(REMOVE_UNUSED_CUSTOM_VISUALS.skipWhenUnread).toBe(customVisualUseUnknown);
  });
  it("runs while a visual.json could not be read when the unread visual could not change its answer", () => {
    const unread = { path: "definition/pages/p/visuals/w/visual.json", text: '{ "name": "w", ' };
    const run = (registered: string[] | undefined) =>
      lint(
        [
          {
            path: "definition/report.json",
            text: j(registered === undefined ? {} : { publicCustomVisuals: registered }),
          },
          page("p"),
          visual("p", "v", "Used123"),
          unread,
        ],
        { rules: [REMOVE_UNUSED_CUSTOM_VISUALS] },
      );
    // No custom visual registered, or every registered type used by a visual that was read.
    for (const registered of [undefined, [], ["Used123"]]) {
      const r = run(registered);
      expect(r.summary.rulesSkipped, String(registered)).toEqual([]);
      expect(r.summary.rulesRun, String(registered)).toBe(1);
      expect(r.findings, String(registered)).toEqual([]);
    }
    // A registered type no visual that was read uses: the unread one could, so the rule is skipped.
    expect(run(["Used123", "ChicletSlicer1448559807354"]).summary.rulesSkipped).toEqual([
      { id: "REMOVE_UNUSED_CUSTOM_VISUALS", reason: "reportFileUnread" },
    ]);
  });
});

describe("HIDE_TOOLTIP_DRILLTROUGH_PAGES", () => {
  it("fires on a tooltip or drillthrough page that readers can see", () => {
    const files = [
      page("tip", { pageBinding: { type: "Tooltip" } }),
      page("drill", { pageBinding: { type: "Drillthrough" }, visibility: "AlwaysVisible" }),
      page("hiddenTip", { pageBinding: { type: "Tooltip" }, visibility: "HiddenInViewMode" }),
      page("plain"),
    ];
    // With no pages.json to give an order, pages come out in id order.
    expect(reportObjectIds(HIDE_TOOLTIP_DRILLTROUGH_PAGES, files)).toEqual(["drill", "tip"]);
  });

  // The documented deviation: Microsoft's page schema also marks a tooltip page by page.json's own
  // `type` ("Page to be used as tooltip."), and Desktop-saved reports mark most tooltip pages by it
  // alone. PBI Inspector reads only `pageBinding.type`; no oracle fixture has a page marked by
  // `type` alone, so these pin it. A drillthrough page is read from its `pageBinding` alone, as PBI
  // Inspector reads it: in the research corpus `type` Drillthrough alone marks pages that are no
  // drillthrough target, and every drillthrough target carries the binding.
  /** Lint one pretty-printed page with the rule; the finding's detail and the text of its line. */
  const lintPage = (name: string, extra: Record<string, unknown>) => {
    const file = page(name, extra);
    const text = pretty(JSON.parse(file.text));
    const { findings } = lint([{ ...file, text }], {
      rules: [HIDE_TOOLTIP_DRILLTROUGH_PAGES],
      config: { failOn: "none" },
    });
    return findings.map((f) => ({
      objectId: f.objectId,
      detail: f.detail,
      line: text.split("\n")[f.location!.line - 1]!.trim(),
    }));
  };

  it("fires on a visible page marked as a tooltip by page.json's own type alone, at the type line", () => {
    expect(lintPage("tip", { type: "Tooltip" })).toEqual([
      { objectId: "tip", detail: "tooltip page is visible to readers", line: '"type": "Tooltip"' },
    ]);
  });

  it("leaves a visible page marked as a drillthrough by page.json's own type alone", () => {
    expect(lintPage("drill", { type: "Drillthrough", visibility: "AlwaysVisible" })).toEqual([]);
    // The schema's third binding type, Default, is "No specific usage of this binding."
    expect(
      lintPage("drill", { type: "Drillthrough", pageBinding: { name: "b", type: "Default" } }),
    ).toEqual([]);
  });

  it("leaves a hidden page marked by type alone", () => {
    const files = [
      page("hiddenTip", { type: "Tooltip", visibility: "HiddenInViewMode" }),
      page("hiddenDrill", { type: "Drillthrough", visibility: "HiddenInViewMode" }),
    ];
    expect(reportObjectIds(HIDE_TOOLTIP_DRILLTROUGH_PAGES, files)).toEqual([]);
  });

  it("fires once on a page with both markings, at the pageBinding line", () => {
    for (const kind of ["Tooltip", "Drillthrough"]) {
      expect(lintPage("both", { type: kind, pageBinding: { name: "b", type: kind } })).toEqual([
        {
          objectId: "both",
          detail: `${kind.toLowerCase()} page is visible to readers`,
          line: '"pageBinding": {',
        },
      ]);
    }
  });

  it("reads page.json's own type when the pageBinding marks no tooltip or drillthrough", () => {
    // The schema's third binding type, Default, is "No specific usage of this binding."
    expect(
      lintPage("tip", { type: "Tooltip", pageBinding: { name: "b", type: "Default" } }),
    ).toEqual([
      { objectId: "tip", detail: "tooltip page is visible to readers", line: '"type": "Tooltip",' },
    ]);
  });
});

describe("ENSURE_PAGES_DO_NOT_SCROLL_VERTICALLY", () => {
  it("fires on a visible page taller than maxHeight", () => {
    const files = [
      page("tall", { height: 721 }),
      page("ok", { height: 720 }),
      page("hiddenTall", { height: 2000, visibility: "HiddenInViewMode" }),
    ];
    expect(reportObjectIds(ENSURE_PAGES_DO_NOT_SCROLL_VERTICALLY, files)).toEqual(["tall"]);
    expect(
      reportObjectIds(ENSURE_PAGES_DO_NOT_SCROLL_VERTICALLY, files, undefined, { maxHeight: 1080 }),
    ).toEqual([]);
  });

  it("points the finding at the height line", () => {
    // Pretty-printed, as Desktop writes it, so a mistyped pointer cannot fall back to line 1 unseen.
    const tall = page("tall", { height: 721 });
    const text = JSON.stringify(JSON.parse(tall.text), null, 2);
    const { findings } = lint([{ ...tall, text }], {
      rules: [ENSURE_PAGES_DO_NOT_SCROLL_VERTICALLY],
      config: { failOn: "none" },
    });
    expect(findings).toHaveLength(1);
    const line = findings[0]!.location!.line;
    expect(line).toBeGreaterThan(1);
    expect(text.split("\n")[line - 1]).toContain('"height"');
  });
});
