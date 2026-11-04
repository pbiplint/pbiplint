import { describe, expect, it } from "vitest";
import { toHex, truncateRatio } from "../src/colour/colour.js";
import { measureReport, type Measurement } from "../src/colour/measure.js";
import type { LintFile } from "../src/engine/lint.js";
import { buildReport } from "../src/pbir/build.js";

const lit = (Value: string) => ({ expr: { Literal: { Value } } });
const fill = (hex: string) => ({ solid: { color: lit(`'${hex}'`) } });
const props = (o: object, selector?: object) => [
  { properties: o, ...(selector ? { selector } : {}) },
];
const WHITE_BG = props({ show: lit("true"), color: fill("#FFFFFF"), transparency: lit("0D") });
const BASE_FILE = "StaticResources/SharedResources/BaseThemes/B.json";

interface V {
  name?: string;
  type?: string;
  x?: number;
  y?: number;
  z?: number;
  w?: number;
  h?: number;
  parent?: string;
  hidden?: boolean;
  objects?: Record<string, unknown>;
  vco?: Record<string, unknown>;
  group?: Record<string, unknown>;
}

/** A report with one page of these visuals, through the real reader; a base theme when given. */
function measure(
  visuals: V[],
  { theme, page, all }: { theme?: object; page?: object; all?: boolean } = {},
): Measurement {
  const files: LintFile[] = [
    {
      path: "definition/report.json",
      text: JSON.stringify(
        theme
          ? {
              themeCollection: { baseTheme: { name: "B", type: "SharedResources" } },
              resourcePackages: [
                { name: "SharedResources", items: [{ name: "B", path: "BaseThemes/B.json" }] },
              ],
            }
          : {},
      ),
    },
    {
      path: "definition/pages/p/page.json",
      text: JSON.stringify({ name: "p", ...(page ? { objects: page } : {}) }),
    },
    ...visuals.map((v, i) => ({
      path: `definition/pages/p/visuals/${v.name ?? `v${i}`}/visual.json`,
      text: JSON.stringify({
        name: v.name ?? `v${i}`,
        position: {
          x: v.x ?? 0,
          y: v.y ?? 0,
          z: v.z ?? (i + 1) * 1000,
          width: v.w ?? 100,
          height: v.h ?? 100,
        },
        ...(v.parent ? { parentGroupName: v.parent } : {}),
        ...(v.hidden ? { isHidden: true } : {}),
        ...(v.group
          ? { visualGroup: v.group }
          : {
              visual: {
                visualType: v.type ?? "shape",
                objects: v.objects ?? {},
                visualContainerObjects: { background: WHITE_BG, ...v.vco },
              },
            }),
      }),
    })),
    ...(theme ? [{ path: BASE_FILE, text: JSON.stringify(theme) }] : []),
  ];
  const m = measureReport(buildReport(files).report);
  // Every visual counts its unsettled subtitle and the like; tests about other things leave it out.
  return all ? m : { ...m, skipped: m.skipped.filter((s) => s.why !== "visibility-not-known") };
}

const title = (o: object, selector?: object) => ({
  title: props({ show: lit("true"), fontSize: lit("12D"), ...o }, selector),
});
const hexes = (m: Measurement) =>
  m.measured.map((x) => `${x.kind} ${toHex(x.foreground)} on ${toHex(x.background)}`);

describe("measureReport", () => {
  it("measures a title against the visual's background, with both sources", () => {
    const m = measure([{ vco: title({ fontColor: fill("#A19F9D") }) }]);
    expect(hexes(m)).toEqual(["title #A19F9D on #FFFFFF"]);
    expect(m.measured[0]).toMatchObject({
      required: 4.5,
      fontSize: 12,
      bold: false,
      foregroundAt: {
        source: "visual",
        pointer: "/visual/visualContainerObjects/title/0/properties/fontColor",
      },
      backgroundAt: [{ source: "visual" }],
    });
    expect(truncateRatio(m.measured[0]!.ratio)).toBe(2.63);
  });
  it("does not measure or count a turned-off element or a hidden visual or group", () => {
    expect(
      measure([{ vco: { title: props({ show: lit("false"), fontColor: fill("#A19F9D") }) } }]),
    ).toEqual({
      measured: [],
      skipped: [],
    });
    expect(
      measure([{ hidden: true, vco: title({ fontColor: fill("#A19F9D") }) }]).measured,
    ).toEqual([]);
    const inHidden = measure([
      { name: "g", group: { displayName: "g" }, hidden: true },
      { name: "v", parent: "g", vco: title({ fontColor: fill("#A19F9D") }) },
    ]);
    expect(inHidden).toEqual({ measured: [], skipped: [] });
  });
  it("measures each state the file sets, and not a disabled one", () => {
    const m = measure([
      {
        vco: {
          title: [
            { properties: { show: lit("true"), fontSize: lit("12D"), fontColor: fill("#000000") } },
            { properties: { fontColor: fill("#A19F9D") }, selector: { id: "hover" } },
            { properties: { fontColor: fill("#EEEEEE") }, selector: { id: "disabled" } },
          ],
        },
      },
    ]);
    expect(m.measured.map((x) => [x.state ?? "default", toHex(x.foreground)])).toEqual([
      ["default", "#000000"],
      ["hover", "#A19F9D"],
    ]);
    expect(m.skipped).toEqual([]);
  });
  it("measures each field's colour as its own instance", () => {
    const m = measure(
      [
        {
          type: "tableEx",
          objects: {
            values: props({ fontColor: fill("#000000"), fontSize: lit("12D") }),
            columnFormatting: [
              {
                properties: { fontColor: fill("#BBBBBB") },
                selector: { metadata: "Sales.Amount" },
              },
              { properties: { fontColor: fill("#CCCCCC") }, selector: { metadata: "Sales.Cost" } },
            ],
          },
        },
      ],
      { theme: { background: "#FFFFFF" } },
    );
    expect(m.measured.filter((x) => x.field).map((x) => [x.field, toHex(x.foreground)])).toEqual([
      ["Sales.Amount", "#BBBBBB"],
      ["Sales.Cost", "#CCCCCC"],
    ]);
  });
  it("measures a field's colour against the table cell's background, its own or the theme's", () => {
    const m = measure(
      [
        {
          type: "tableEx",
          vco: {
            background: props({
              show: lit("true"),
              color: fill("#1A3A5C"),
              transparency: lit("0D"),
            }),
          },
          objects: {
            values: props({ fontSize: lit("12D") }),
            columnFormatting: [
              {
                properties: { fontColor: fill("#000000") },
                selector: { metadata: "Sales.Amount" },
              },
              {
                properties: { fontColor: fill("#000000"), backColor: fill("#EEEEEE") },
                selector: { metadata: "Sales.Cost" },
              },
            ],
          },
        },
      ],
      { theme: { background: "#FFFFFF", foreground: "#000000" } },
    );
    expect(m.measured.filter((x) => x.field).map((x) => [x.field, toHex(x.background)])).toEqual([
      ["Sales.Amount", "#FFFFFF"],
      ["Sales.Cost", "#EEEEEE"],
    ]);
  });
  it("takes Fluent 2's documented defaults: titles and subtitles on, axis titles off", () => {
    const files = (base: string): LintFile[] => [
      {
        path: "definition/report.json",
        text: JSON.stringify({
          themeCollection: { baseTheme: { name: base, type: "SharedResources" } },
        }),
      },
      { path: "definition/pages/p/page.json", text: JSON.stringify({ name: "p" }) },
      {
        path: "definition/pages/p/visuals/v/visual.json",
        text: JSON.stringify({
          name: "v",
          position: { x: 0, y: 0, z: 0, width: 100, height: 100 },
          visual: {
            visualType: "clusteredColumnChart",
            objects: { valueAxis: props({ titleColor: fill("#000000") }) },
            visualContainerObjects: {
              background: WHITE_BG,
              title: props({ fontColor: fill("#000000"), fontSize: lit("12D") }),
              subTitle: props({ fontColor: fill("#000000"), fontSize: lit("12D") }),
            },
          },
        }),
      },
    ];
    const fluent = measureReport(buildReport(files("Fluent2-CY26SU04")).report);
    // Both are on. The subtitle is measured; the title has a background of its own, which the
    // Fluent 2 file, not in the project, may set, so the title is skipped rather than guessed.
    expect(fluent.measured.map((m) => m.kind)).toEqual(["subtitle"]);
    expect(fluent.skipped.filter((s) => s.kind === "title").length).toBe(1);
    expect(fluent.skipped.some((s) => s.why === "visibility-not-known")).toBe(false);
    expect(fluent.skipped.filter((s) => s.kind === "axisTitles")).toEqual([]);
    const cy = measureReport(buildReport(files("CY24SU10")).report);
    expect(cy.measured.map((m) => m.kind)).toEqual([]);
  });
  it("counts an element whose visibility the files do not settle as not known", () => {
    const m = measure([{ vco: { subTitle: props({ fontColor: fill("#000000") }) } }], {
      theme: {},
      all: true,
    });
    expect(m.skipped.map((s) => [s.kind, s.why])).toEqual([
      ["title", "visibility-not-known"],
      ["subtitle", "visibility-not-known"],
      ["buttonText", "visibility-not-known"],
    ]);
  });
  it("blends a text colour that has alpha over its background first", () => {
    const m = measure([{ vco: title({ fontColor: { solid: { color: lit("'#00000080'") } } }) }]);
    expect(hexes(m)).toEqual(["title #7F7F7F on #FFFFFF"]);
  });
  it("measures a text box's runs one by one, and not an empty run", () => {
    const run = (value: string, color?: string) => ({
      value,
      textStyle: { fontSize: "20pt", ...(color ? { color } : {}) },
    });
    const m = measure([
      {
        type: "textbox",
        objects: {
          general: props({
            paragraphs: [
              { textRuns: [run("Hello", "#BBBBBB"), run("  ", "#000000")] },
              { textRuns: [run("World", "#222222")] },
            ],
          }),
        },
      },
    ]);
    expect(m.measured.map((x) => [toHex(x.foreground), x.fontSize, x.required])).toEqual([
      ["#BBBBBB", 20, 3],
      ["#222222", 20, 3],
    ]);
    expect(m.measured[1]!.foregroundAt.pointer).toBe(
      "/visual/objects/general/0/properties/paragraphs/1/textRuns/0/textStyle/color",
    );
  });
  it("takes a text box run's default from the label text class", () => {
    const theme = { textClasses: { label: { color: "#AA3344", fontSize: 10 } } };
    const m = measure(
      [
        {
          type: "textbox",
          objects: { general: props({ paragraphs: [{ textRuns: [{ value: "Hi" }] }] }) },
        },
      ],
      { theme },
    );
    expect(m.measured[0]).toMatchObject({
      fontSize: 10,
      foregroundAt: { source: "baseTheme", pointer: "/textClasses/label/color" },
    });
    expect(toHex(m.measured[0]!.foreground)).toBe("#AA3344");
  });
});

describe("measureReport skips, by reason", () => {
  it("skips an element whose default no check has shown", () => {
    const m = measure([{ objects: { text: props({ show: lit("true"), fontSize: lit("12D") }) } }], {
      theme: {},
    });
    expect(m.skipped.map((s) => [s.kind, s.why])).toEqual([["buttonText", "default-not-known"]]);
  });
  it("still measures a button's text colour and fill that are set", () => {
    const m = measure([
      {
        type: "actionButton",
        objects: {
          text: props({ show: lit("true"), fontColor: fill("#A19F9D"), fontSize: lit("12D") }),
          fill: props({ show: lit("true"), fillColor: fill("#FFFFFF"), transparency: lit("0D") }),
        },
      },
    ]);
    expect(hexes(m)).toEqual(["buttonText #A19F9D on #FFFFFF"]);
    expect(m.measured[0]!.backgroundAt[0]).toMatchObject({
      pointer: "/visual/objects/fill/0/properties/fillColor",
    });
  });
  it("takes a text class no theme sets as the next step of the default", () => {
    // Axis labels: smallLightLabel, then foregroundNeutralSecondary (spec section 10).
    const chart = {
      type: "clusteredColumnChart",
      objects: { categoryAxis: props({ fontSize: lit("12D") }) },
    };
    const set = measure([chart], {
      theme: {
        foregroundNeutralSecondary: "#0F7B6C",
        textClasses: { smallLightLabel: { color: "#C0FFC0" } },
      },
    });
    // Both axes: each is shown when nothing turns it off.
    expect(hexes(set).filter((h) => h.startsWith("axisLabels"))).toEqual([
      "axisLabels #C0FFC0 on #FFFFFF",
      "axisLabels #C0FFC0 on #FFFFFF",
    ]);
    const unset = measure([chart], { theme: { foregroundNeutralSecondary: "#0F7B6C" } });
    expect(hexes(unset).filter((h) => h.startsWith("axisLabels"))).toEqual([
      "axisLabels #0F7B6C on #FFFFFF",
      "axisLabels #0F7B6C on #FFFFFF",
    ]);
  });
  it("skips text over an image on the visual or the page", () => {
    const image = { image: { name: lit("'bg.png'") } };
    const onVisual = measure(
      [
        {
          vco: {
            ...title({ fontColor: fill("#000000") }),
            background: props({
              show: lit("true"),
              color: fill("#FFFFFF"),
              transparency: lit("50D"),
              ...image,
            }),
          },
        },
      ],
      { page: { background: props({ color: fill("#FFFFFF"), transparency: lit("0D") }) } },
    );
    expect(onVisual.skipped.map((s) => s.why)).toEqual(["image"]);
    const onPage = measure(
      [
        {
          vco: {
            ...title({ fontColor: fill("#000000") }),
            background: props({ show: lit("false") }),
          },
        },
      ],
      {
        page: { background: props({ color: fill("#FFFFFF"), transparency: lit("0D"), ...image }) },
      },
    );
    expect(onPage.skipped.map((s) => s.why)).toEqual(["image"]);
  });
  const clear = { background: props({ show: lit("false") }) };
  const PAGE = { page: { background: props({ color: fill("#FFFFFF"), transparency: lit("0D") }) } };
  it("skips a transparent visual over a lower one, and measures an opaque one", () => {
    const below = { name: "below", x: 0, y: 0, z: 1000 };
    const over = measure(
      [
        below,
        {
          name: "top",
          x: 50,
          y: 50,
          z: 2000,
          vco: { ...title({ fontColor: fill("#000000") }), ...clear },
        },
      ],
      PAGE,
    );
    expect(over.skipped.filter((s) => s.visual.id === "top").map((s) => s.why)).toEqual([
      "overlap",
    ]);
    const opaque = measure(
      [below, { name: "top", x: 50, y: 50, z: 2000, vco: title({ fontColor: fill("#000000") }) }],
      PAGE,
    );
    expect(opaque.measured.some((x) => x.visual.id === "top")).toBe(true);
  });
  it("places a grouped visual through its groups, and does not count a group's own box", () => {
    const m = measure(
      [
        { name: "below", x: 0, y: 0, z: 1000 },
        { name: "g", x: 500, y: 500, z: 500, group: { displayName: "g" } },
        {
          name: "top",
          parent: "g",
          x: 10,
          y: 10,
          z: 2000,
          vco: { ...title({ fontColor: fill("#000000") }), ...clear },
        },
      ],
      PAGE,
    );
    expect(m.measured.map((x) => x.visual.id)).toContain("top");
  });
  it("skips a data label on the data, and measures one outside it or on its own background", () => {
    const chart = (labels: object) => ({
      type: "clusteredColumnChart",
      objects: {
        labels: props({
          show: lit("true"),
          color: fill("#000000"),
          fontSize: lit("12D"),
          ...labels,
        }),
      },
    });
    expect(measure([chart({})]).skipped.map((s) => s.why)).toContain("on-data");
    expect(
      measure([chart({ labelPosition: lit("'OutsideEnd'") })]).measured.map((x) => x.kind),
    ).toContain("dataLabels");
    const onOwn = measure([
      chart({
        enableBackground: lit("true"),
        backgroundColor: fill("#FFFFFF"),
        backgroundTransparency: lit("0D"),
      }),
    ]);
    expect(onOwn.measured.map((x) => x.kind)).toContain("dataLabels");
  });
  it("skips a ratio from 3 to 4.5 with no size, and measures one under 3", () => {
    const noSize = (hex: string) =>
      measure([{ vco: { title: props({ show: lit("true"), fontColor: fill(hex) }) } }], {
        theme: {},
      });
    expect(noSize("#767676").measured).toHaveLength(1);
    expect(noSize("#8A8A8A").skipped.map((s) => s.why)).toEqual(["size-unknown"]);
    expect(noSize("#BBBBBB").measured[0]).toMatchObject({ required: 4.5 });
  });
});
