import { beforeAll, describe, expect, it } from "vitest";
import { backgroundOf, lookup } from "../src/colour/cascade.js";
import { toHex } from "../src/colour/colour.js";
import { measureReport, type Measurement } from "../src/colour/measure.js";
import { readColour } from "../src/colour/read.js";
import { lint, type LintResult } from "../src/engine/lint.js";
import type { Report } from "../src/pbir/types.js";
import { fixturesDir, readProjectFiles } from "./helpers.js";

/**
 * The first Desktop check's project (spec section 10, November 4, 2026), as Power BI Desktop saved
 * it, with a hand-written base theme in place of Microsoft's. Each case below is the colour Desktop
 * painted, read from the check's screenshots, so the resolver is pinned to what Desktop shows.
 */
const files = readProjectFiles(`${fixturesDir}contrast-zoo`);
let result: LintResult;
let report: Report;
let measured: Measurement;
beforeAll(async () => {
  result = await lint([...files.model, ...files.report]);
  report = result.project.report!;
  measured = measureReport(report);
});

const visualOn = (page: string, id: string) => {
  const p = report.pages.find((x) => x.id === page)!;
  return { page: p, visual: p.visuals.find((v) => v.id === id)! };
};
const fillOf = (page: string, id: string): string => {
  const { page: p, visual } = visualOn(page, id);
  const b = backgroundOf(report, p, visual);
  return b.known ? toHex(b.colour) : b.why;
};

/** ColorId and Percent as each swatch is named: c<id>_<percent>, with m for minus. */
const SWATCHES: [string, string][] = [
  ["c0_m06", "#666666"],
  ["c0_m02", "#CCCCCC"],
  ["c0_0", "#FFFFFF"],
  ["c0_02", "#FFFFFF"],
  ["c0_06", "#FFFFFF"],
  ["c1_m06", "#000000"],
  ["c1_m02", "#000000"],
  ["c1_0", "#000000"],
  ["c1_02", "#333333"],
  ["c1_06", "#999999"],
  ["c2_m06", "#123823"],
  ["c2_m02", "#256F46"],
  ["c2_0", "#2E8B57"],
  ["c2_02", "#58A279"],
  ["c2_06", "#ABD1BC"],
  ["c3_m06", "#4A3604"],
  ["c3_m02", "#936B09"],
  ["c3_0", "#B8860B"],
  ["c3_02", "#C69E3C"],
  ["c3_06", "#E3CF9D"],
];

describe("the contrast fixture against the first Desktop check", () => {
  it("is read whole, with both themes, and nothing it could not parse", () => {
    expect(report.themes.base?.state).toBe("read");
    expect(report.themes.custom?.state).toBe("read");
    expect(result.findings.filter((f) => f.ruleId === "PARSE_ISSUE")).toEqual([]);
  });
  it.each(SWATCHES)("paints swatch %s as a fill the colour Desktop showed, %s", (id, hex) => {
    expect(fillOf("p1", id)).toBe(hex);
  });
  it.each(SWATCHES)("paints title %s the colour Desktop showed, %s", (id, hex) => {
    const { visual } = visualOn("p2", id);
    const vco = (visual.json as { visual: { visualContainerObjects: Record<string, unknown> } })
      .visual.visualContainerObjects;
    const found = lookup({
      themes: report.themes,
      own: { entries: vco.title, source: "visual", file: visual.file, pointer: "" },
      visualType: "textbox",
      object: "title",
      property: "fontColor",
    });
    const read = found.found ? readColour(found.value, report.themes) : undefined;
    expect(read?.known && toHex(read.colour)).toBe(hex);
  });
  it.each([
    ["p4", "half", "#7F6B40"],
    ["p4", "none", "#FFD700"],
    ["p4", "solid", "#FF0000"],
    ["p5", "solidOnClear", "#00FF00"],
    ["p5", "halfOnClear", "#40803F"],
    ["p5", "noneOnClear", "#80007F"],
    ["p6", "fluentSolid", "#FFFFFF"],
    // Desktop shows #F8F8F8 here, one unit lighter: the known difference the spec records.
    ["p6", "fluentNone", "#F7F7F7"],
    ["p7", "inDark", "#222222"],
    ["p7", "inHalf", "#907C11"],
    ["p7", "inNone", "#FFD700"],
    ["p7", "inOff", "#FFD700"],
  ])("blends %s %s to %s, as Desktop showed", (page, id, hex) => {
    expect(fillOf(page, id)).toBe(hex);
  });
  it("takes the defaults Desktop showed where nothing sets a colour", () => {
    const colours = (id: string) =>
      [
        ...new Set(
          measured.measured
            .filter((m) => m.visual.id === id)
            .map((m) => `${m.kind} ${toHex(m.foreground)}`),
        ),
      ].sort();
    expect(colours("runNoColour")).toEqual(["textBox #AA3344"]);
    expect(colours("titleNamedCustom")).toEqual(["title #3366AA"]);
    expect(colours("titleNamedBase")).toEqual(["title #C8C6C4"]);
    expect(colours("card")).toContain("cardLabel #CC5500");
    expect(colours("table")).toEqual(["tableHeaders #7A1F5C", "tableValues #7A1F5C"]);
    expect(colours("slicer")).toContain("slicerItems #7A1F5C");
    expect(colours("chart")).toContain("axisLabels #0F7B6C");
  });
  it("measures table text against the theme's background as the cells' own", () => {
    const values = measured.measured.find(
      (m) => m.visual.id === "table" && m.kind === "tableValues",
    )!;
    expect(toHex(values.background)).toBe("#FFF8E7");
  });
});
