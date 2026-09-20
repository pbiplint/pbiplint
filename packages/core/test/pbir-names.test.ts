import { describe, expect, it } from "vitest";
import { buildReport } from "../src/pbir/build.js";
import {
  bookmarkLabel,
  pageFilterLabel,
  pageLabel,
  reportMeasureLabel,
  visualLabel,
} from "../src/pbir/names.js";
import { reportFinding } from "../src/rules/report-helpers.js";

const j = (v: unknown) => JSON.stringify(v, null, 2);
const { report } = buildReport([
  { path: "definition/pages/p1/page.json", text: j({ name: "p1", displayName: "Overview" }) },
  {
    path: "definition/pages/p1/visuals/9f2e4c1a0000/visual.json",
    text: j({
      name: "9f2e4c1a0000",
      position: { x: 1, y: 2 },
      visual: {
        visualType: "tableEx",
        visualContainerObjects: {
          title: [{ properties: { text: { expr: { Literal: { Value: "'Top products'" } } } } }],
        },
      },
    }),
  },
  {
    path: "definition/pages/p1/visuals/b07d00000000/visual.json",
    text: j({ name: "b07d00000000", position: {}, visual: { visualType: "cardVisual" } }),
  },
  { path: "definition/bookmarks/b1.bookmark.json", text: j({ name: "b1", displayName: "Reset" }) },
  {
    path: "definition/reportExtensions.json",
    text: j({ entities: [{ name: "Sales", measures: [{ name: "Net Margin", expression: "1" }] }] }),
  },
]);

describe("report finding names", () => {
  it("follow the spec's shapes", () => {
    const page = report.pages[0]!;
    const [titled, untitled] = page.visuals;
    expect(pageLabel(page)).toBe('Page "Overview"');
    expect(visualLabel(titled!)).toBe('"Top products" on "Overview"');
    expect(visualLabel(untitled!)).toBe('cardVisual (b07d00) on "Overview"');
    expect(bookmarkLabel(report.bookmarks[0]!)).toBe('Bookmark "Reset"');
    expect(reportMeasureLabel(report.measures[0]!)).toBe("[Net Margin] (report)");
    expect(pageFilterLabel(page)).toBe('Page filter on "Overview"');
  });
  it("build findings with the object id, a line from the pointer, and the object for the ignore check", () => {
    const page = report.pages[0]!;
    const v = page.visuals[0]!;
    expect(reportFinding.visual(v, "/position/y", "why")).toEqual({
      objectType: "Visual",
      objectName: '"Top products" on "Overview"',
      objectId: "9f2e4c1a0000",
      location: { file: "definition/pages/p1/visuals/9f2e4c1a0000/visual.json", line: 5 },
      detail: "why",
      object: v,
    });
    expect(reportFinding.page(page)).toMatchObject({
      objectType: "Page",
      objectId: "p1",
      location: { file: "definition/pages/p1/page.json", line: 1 },
    });
    expect(reportFinding.report(report)).toMatchObject({
      objectType: "Report",
      objectName: "Report",
      objectId: "report",
    });
    expect(reportFinding.report(report, "unused", "ChicletSlicer")).toMatchObject({
      objectId: "ChicletSlicer",
      detail: "unused",
    });
    expect(reportFinding.bookmark(report.bookmarks[0]!)).toMatchObject({
      objectType: "Bookmark",
      objectId: "b1",
    });
    expect(reportFinding.reportMeasure(report.measures[0]!)).toMatchObject({
      objectType: "ReportMeasure",
      objectId: "Sales.Net Margin",
      location: { file: "definition/reportExtensions.json" },
    });
  });
});
