import { describe, expect, it } from "vitest";
import { backgroundOf, type Background, type StackLayer } from "../src/colour/cascade.js";
import { parseHex, toHex } from "../src/colour/colour.js";
import type { LintFile } from "../src/engine/lint.js";
import { buildReport } from "../src/pbir/build.js";

const BASE_FILE = "StaticResources/SharedResources/BaseThemes/B.json";
const lit = (Value: string) => ({ expr: { Literal: { Value } } });
const fill = (hex: string) => ({ solid: { color: lit(`'${hex}'`) } });

interface Back {
  show?: boolean;
  color?: unknown;
  transparency?: number;
}
const background = ({ show, color, transparency }: Back) => [
  {
    properties: {
      ...(show === undefined ? {} : { show: lit(String(show)) }),
      ...(color === undefined ? {} : { color }),
      ...(transparency === undefined ? {} : { transparency: lit(`${transparency}D`) }),
    },
  },
];

interface Setup {
  theme?: Record<string, unknown> | "absent";
  page?: { background?: Back; outspace?: Back };
  visual?: Back;
  /** The visual's parent, then that group's, innermost first; each a group's background. */
  groups?: (Back | undefined)[];
}

/** A report with one page, one text box `v`, and the groups around it, through the real reader. */
function setup({ theme, page, visual, groups = [] }: Setup) {
  const group = (i: number) => `g${i}`;
  const files: LintFile[] = [
    {
      path: "definition/report.json",
      text: JSON.stringify(
        theme
          ? {
              themeCollection: { baseTheme: { name: "B", type: "SharedResources" } },
              resourcePackages: [
                {
                  name: "SharedResources",
                  items: [{ name: "B", path: "BaseThemes/B.json" }],
                },
              ],
            }
          : {},
      ),
    },
    {
      path: "definition/pages/p/page.json",
      text: JSON.stringify({
        name: "p",
        objects: {
          ...(page?.background ? { background: background(page.background) } : {}),
          ...(page?.outspace ? { outspace: background(page.outspace) } : {}),
        },
      }),
    },
    {
      path: "definition/pages/p/visuals/v/visual.json",
      text: JSON.stringify({
        name: "v",
        ...(groups.length ? { parentGroupName: group(0) } : {}),
        visual: {
          visualType: "textbox",
          visualContainerObjects: visual ? { background: background(visual) } : {},
        },
      }),
    },
    ...groups.map((g, i) => ({
      path: `definition/pages/p/visuals/${group(i)}/visual.json`,
      text: JSON.stringify({
        name: group(i),
        ...(i + 1 < groups.length ? { parentGroupName: group(i + 1) } : {}),
        visualGroup: { displayName: group(i), objects: g ? { background: background(g) } : {} },
      }),
    })),
    ...(theme && theme !== "absent" ? [{ path: BASE_FILE, text: JSON.stringify(theme) }] : []),
  ];
  const { report } = buildReport(files);
  const p = report.pages[0]!;
  return { report, page: p, visual: p.visuals.find((v) => v.id === "v")! };
}

const backOf = (s: Setup, element?: StackLayer): Background => {
  const { report, page, visual } = setup(s);
  return backgroundOf(report, page, visual, element);
};

const expectColour = (b: Background, hex: string, at: string): void => {
  expect(b).toMatchObject({ known: true, opaqueAt: at });
  expect(b.known && toHex(b.colour)).toBe(hex);
};

const OPAQUE: Back = { show: true, color: fill("#102030"), transparency: 0 };
const PAGE_WHITE = { background: { color: fill("#FFFFFF"), transparency: 0 } };

describe("backgroundOf", () => {
  it("stops at an opaque visual, so nothing under it matters", () => {
    const b = backOf({
      visual: OPAQUE,
      page: { background: { color: { expr: { Measure: {} } } } },
    });
    expectColour(b, "#102030", "visual");
    expect(b).toMatchObject({
      layers: [
        {
          source: "visual",
          file: "definition/pages/p/visuals/v/visual.json",
          pointer: "/visual/visualContainerObjects/background/0/properties/color",
        },
      ],
    });
  });
  it("passes over a visual background that is off, or fully transparent, whatever its colour", () => {
    for (const visual of [
      { show: false, color: { expr: { Measure: {} } }, transparency: 0 },
      { show: true, color: { expr: { Measure: {} } }, transparency: 100 },
    ])
      expectColour(backOf({ visual, page: PAGE_WHITE }), "#FFFFFF", "page");
  });
  it("takes the theme's background for a visual with show on and no colour", () => {
    const theme = {
      background: "#ABCDEF",
      visualStyles: { "*": { "*": { background: [{ show: true, transparency: 0 }] } } },
    };
    const b = backOf({ theme });
    expectColour(b, "#ABCDEF", "visual");
    expect(b).toMatchObject({
      layers: [{ source: "baseTheme", file: BASE_FILE, pointer: "/background" }],
    });
  });
  it("blends a part-transparent visual over the page, rounding once", () => {
    const b = backOf({
      visual: { show: true, color: fill("#000000"), transparency: 50 },
      page: PAGE_WHITE,
    });
    expectColour(b, "#808080", "page");
    expect(b.known && b.colour).toEqual({ r: 128, g: 128, b: 128, a: 1 });
    expect(b.known && b.layers.map((l) => l.source)).toEqual(["visual", "page"]);
  });
  it("blends the page over the wallpaper, as Microsoft's themes set them", () => {
    const cy = {
      visualStyles: {
        page: {
          "*": {
            outspace: [{ color: { solid: { color: "#FFFFFF" } } }],
            background: [{ transparency: 100 }],
          },
        },
      },
    };
    expectColour(backOf({ theme: cy, visual: { show: false } }), "#FFFFFF", "wallpaper");
    const fluent = {
      visualStyles: {
        page: {
          "*": {
            outspace: [{ color: { solid: { color: "#E6E6E6" } } }],
            background: [{ color: { solid: { color: "#FAFAFA" } }, transparency: 14 }],
          },
        },
      },
    };
    expectColour(backOf({ theme: fluent, visual: { show: false } }), "#F7F7F7", "wallpaper");
  });
  it("takes the page's own settings over the theme's", () => {
    const theme = {
      visualStyles: { page: { "*": { background: [{ color: { solid: { color: "#111111" } } }] } } },
    };
    expectColour(backOf({ theme, visual: { show: false }, page: PAGE_WHITE }), "#FFFFFF", "page");
  });
  it("does not give a page or a group the theme's every-visual background", () => {
    const theme = {
      background: "#ABCDEF",
      visualStyles: { "*": { "*": { background: [{ show: true, transparency: 0 }] } } },
    };
    const b = backOf({ theme, visual: { show: false }, groups: [undefined] });
    expect(b).toEqual({ known: false, why: "not-set" });
  });
});

describe("backgroundOf and groups", () => {
  it("stops at a group's opaque fill, with a transparent visual inside it", () => {
    const b = backOf({
      visual: { show: false },
      groups: [{ show: true, color: fill("#222222"), transparency: 0 }],
    });
    expectColour(b, "#222222", "group");
    expect(b).toMatchObject({
      layers: [
        {
          source: "group",
          file: "definition/pages/p/visuals/g0/visual.json",
          pointer: "/visualGroup/objects/background/0/properties/color",
        },
      ],
    });
  });
  it("blends a part-transparent group with the page", () => {
    expectColour(
      backOf({
        visual: { show: false },
        groups: [{ show: true, color: fill("#000000"), transparency: 50 }],
        page: PAGE_WHITE,
      }),
      "#808080",
      "page",
    );
  });
  it("blends nested groups, innermost on top", () => {
    const b = backOf({
      visual: { show: false },
      groups: [
        { color: fill("#FF0000"), transparency: 50 },
        { color: fill("#0000FF"), transparency: 0 },
      ],
    });
    expectColour(b, "#800080", "group");
    expect(b.known && b.layers.map((l) => l.file)).toEqual([
      "definition/pages/p/visuals/g0/visual.json",
      "definition/pages/p/visuals/g1/visual.json",
    ]);
  });
  it("takes a group that sets nothing, or is off, as no layer", () => {
    for (const group of [undefined, { show: false, color: fill("#000000"), transparency: 0 }])
      expectColour(
        backOf({ visual: { show: false }, groups: [group], page: PAGE_WHITE }),
        "#FFFFFF",
        "page",
      );
  });
  it("ends on a cycle of parent groups, and on a parent that is not there", () => {
    const { report, page, visual } = setup({
      visual: { show: false },
      page: PAGE_WHITE,
      groups: [undefined],
    });
    const group = page.visuals.find((v) => v.id === "g0")!;
    group.groupId = "g0";
    expectColour(backgroundOf(report, page, visual), "#FFFFFF", "page");
    visual.groupId = "nowhere";
    expectColour(backgroundOf(report, page, visual), "#FFFFFF", "page");
  });
});

describe("backgroundOf and the element's own background", () => {
  const element = (hex: string): StackLayer => ({
    colour: parseHex(hex)!,
    source: "visual",
    pointer: "/x",
  });
  it("stops at an opaque element", () => {
    expectColour(backOf({}, element("#123456")), "#123456", "element");
  });
  it("passes through an alpha 00 element to the visual", () => {
    const b = backOf({ visual: OPAQUE }, element("#FFFFFF00"));
    expectColour(b, "#102030", "visual");
    expect(b.known && b.layers).toHaveLength(1);
  });
});

describe("backgroundOf and a report file that could not be read", () => {
  const CY = {
    visualStyles: {
      page: {
        "*": {
          outspace: [{ color: { solid: { color: "#FFFFFF" } } }],
          background: [{ transparency: 100 }],
        },
      },
    },
  };
  const NOT_READ = { known: false, why: "file-not-read" };
  const VISUAL = "definition/pages/p/visuals/v/visual.json";
  const stack = (files: LintFile[], unreadPaths: string[] = []): Background => {
    const { report } = buildReport(files, unreadPaths);
    const page = report.pages[0]!;
    return backgroundOf(
      report,
      page,
      page.visuals.find((v) => v.id === "v")!,
    );
  };
  const withVisual = (json: object, parent?: string): LintFile => ({
    path: VISUAL,
    text: JSON.stringify({
      name: "v",
      ...(parent ? { parentGroupName: parent } : {}),
      visual: {
        visualType: "textbox",
        visualContainerObjects: { background: background(json) },
      },
    }),
  });
  const pageFile = (text: string): LintFile => ({ path: "definition/pages/p/page.json", text });
  const REPORT: LintFile = {
    path: "definition/report.json",
    text: JSON.stringify({
      themeCollection: { baseTheme: { name: "B", type: "SharedResources" } },
      resourcePackages: [
        { name: "SharedResources", items: [{ name: "B", path: "BaseThemes/B.json" }] },
      ],
    }),
  };
  const THEME: LintFile = { path: BASE_FILE, text: JSON.stringify(CY) };

  it("does not take the theme's word for a page whose page.json did not parse", () => {
    const off = withVisual({ show: false });
    expect(stack([REPORT, THEME, pageFile("{ not json"), off])).toEqual(NOT_READ);
    expect(stack([REPORT, THEME, off], ["definition/pages/p/page.json"])).toEqual(NOT_READ);
  });
  it("still knows an opaque visual on such a page", () => {
    expectColour(
      stack([REPORT, THEME, pageFile("{ not json"), withVisual(OPAQUE)]),
      "#102030",
      "visual",
    );
  });
  const PAGE = pageFile(
    JSON.stringify({
      name: "p",
      objects: { background: background({ color: fill("#111111"), transparency: 0 }) },
    }),
  );
  it("does not skip a parent group whose file could not be read", () => {
    const inGroup = withVisual({ show: false }, "g");
    const groupFile = "definition/pages/p/visuals/g/visual.json";
    expect(stack([PAGE, inGroup, { path: groupFile, text: "{ not json" }])).toEqual(NOT_READ);
    expect(stack([PAGE, inGroup], [groupFile])).toEqual(NOT_READ);
    expect(stack([PAGE, inGroup], ["definition/pages/p/visuals/"])).toEqual(NOT_READ);
  });
  it("still knows an opaque visual in such a group, and passes over a parent that is simply absent", () => {
    expectColour(
      stack([PAGE, withVisual(OPAQUE, "g")], [VISUAL.replace("/v/", "/g/")]),
      "#102030",
      "visual",
    );
    expectColour(stack([PAGE, withVisual({ show: false }, "g")]), "#111111", "page");
  });
  it("counts the themes as not read when report.json could not be", () => {
    const page = pageFile(
      JSON.stringify({
        name: "p",
        objects: { background: background({ color: fill("#111111") }) },
      }),
    );
    const off = withVisual({ show: false });
    const broken = { path: "definition/report.json", text: "{ not json" };
    expect(stack([broken, page, off])).toEqual({ known: false, why: "theme-not-read" });
    expect(stack([page, off], ["definition/report.json"])).toEqual({
      known: false,
      why: "theme-not-read",
    });
    expect(stack([page, off], ["definition/"])).toEqual({ known: false, why: "file-not-read" });
    expect(buildReport([broken]).report.issues).toHaveLength(1);
  });
});

describe("backgroundOf when it cannot know", () => {
  it("does not take a group that is on with no colour for one with no paint", () => {
    const group = { show: true };
    expect(backOf({ visual: { show: false }, groups: [group], page: PAGE_WHITE })).toEqual({
      known: false,
      why: "not-set",
    });
  });
  it("says a colour depends on the data", () => {
    expect(
      backOf({ visual: { show: true, color: { solid: { color: { expr: { FillRule: {} } } } } } }),
    ).toEqual({ known: false, why: "data-dependent" });
  });
  it("says a colour has a Percent", () => {
    const color = { solid: { color: { expr: { ThemeDataColor: { ColorId: 0, Percent: 0.2 } } } } };
    expect(
      backOf({ visual: { show: true, color, transparency: 0 }, theme: { background: "#FFFFFF" } }),
    ).toEqual({
      known: false,
      why: "percent",
    });
  });
  it("says a theme a needed layer depends on was not read", () => {
    expect(backOf({ theme: "absent" })).toEqual({ known: false, why: "theme-not-read" });
    expect(backOf({ theme: "absent", visual: { show: false } })).toEqual({
      known: false,
      why: "theme-not-read",
    });
  });
  it("needs no theme for a fully explicit visual", () => {
    expectColour(backOf({ theme: "absent", visual: OPAQUE }), "#102030", "visual");
  });
  it("says so when the stack runs out with nothing opaque", () => {
    expect(backOf({ visual: { show: false } })).toEqual({ known: false, why: "not-set" });
    expect(
      backOf({
        visual: { show: false },
        page: { background: { color: fill("#FFFFFF"), transparency: 50 } },
      }),
    ).toEqual({ known: false, why: "not-set" });
  });
  it("says so when a visual's show is not known", () => {
    expect(backOf({ theme: {} })).toEqual({ known: false, why: "not-set" });
  });
  it("calls a transparency it cannot read another form", () => {
    const { report, page, visual } = setup({ visual: OPAQUE });
    const json = visual.json as {
      visual: { visualContainerObjects: { background: { properties: Record<string, unknown> }[] } };
    };
    json.visual.visualContainerObjects.background[0]!.properties.transparency = {
      expr: { Measure: {} },
    };
    expect(backgroundOf(report, page, visual)).toEqual({ known: false, why: "other-form" });
    json.visual.visualContainerObjects.background[0]!.properties.transparency = lit("150D");
    expect(backgroundOf(report, page, visual)).toEqual({ known: false, why: "other-form" });
  });
});
