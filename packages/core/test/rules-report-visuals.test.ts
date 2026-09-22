import { describe, expect, it } from "vitest";
import { lint } from "../src/engine/lint.js";
import {
  AVOID_SHOW_ITEMS_WITH_NO_DATA,
  ENSURE_ALTTEXT,
  ENSURE_THEME_COLOURS,
} from "../src/rules/pbi-inspector/visuals.js";
import { column, lit, page, reportObjectIds, visual } from "./report-helpers.js";

const solid = (value: string) => ({ solid: { color: lit(value) } });

describe("AVOID_SHOW_ITEMS_WITH_NO_DATA", () => {
  it("fires on a visual with showAll on any role", () => {
    const files = [
      page("p"),
      visual(
        "p",
        "cat",
        "clusteredBarChart",
        {},
        {
          query: {
            queryState: {
              Category: { projections: [{ field: column("T", "C") }], showAll: true },
            },
          },
        },
      ),
      visual(
        "p",
        "rows",
        "pivotTable",
        {},
        {
          query: {
            queryState: { Rows: { projections: [{ field: column("T", "C") }], showAll: true } },
          },
        },
      ),
      visual(
        "p",
        "off",
        "clusteredBarChart",
        {},
        {
          query: {
            queryState: {
              Category: { projections: [{ field: column("T", "C") }], showAll: false },
            },
          },
        },
      ),
    ];
    expect(reportObjectIds(AVOID_SHOW_ITEMS_WITH_NO_DATA, files)).toEqual(["cat", "rows"]);
  });
});

describe("ENSURE_THEME_COLOURS", () => {
  it("fires on a hex literal in a colour property, not on hex-looking text, and never on a text box", () => {
    const files = [
      page("p"),
      visual(
        "p",
        "hex",
        "cardVisual",
        {},
        { objects: { dataPoint: [{ properties: { fill: solid("'#1F77B4'") } }] } },
      ),
      visual(
        "p",
        "short",
        "cardVisual",
        {},
        { visualContainerObjects: { background: [{ properties: { color: solid("'#FFF'") } }] } },
      ),
      visual(
        "p",
        "theme",
        "cardVisual",
        {},
        {
          objects: {
            dataPoint: [
              {
                properties: {
                  fill: {
                    solid: { color: { expr: { ThemeDataColor: { ColorId: 1, Percent: 0 } } } },
                  },
                },
              },
            ],
          },
        },
      ),
      visual(
        "p",
        "text",
        "cardVisual",
        {},
        { visualContainerObjects: { title: [{ properties: { text: lit("'Ref #ABCDEF'") } }] } },
      ),
      visual(
        "p",
        "textbox",
        "textbox",
        {},
        {
          objects: {
            general: [
              {
                properties: {
                  paragraphs: [{ textRuns: [{ value: "x", textStyle: { color: "#FF0000" } }] }],
                },
              },
            ],
          },
        },
      ),
    ];
    expect(reportObjectIds(ENSURE_THEME_COLOURS, files)).toEqual(["hex", "short"]);
  });
});

describe("ENSURE_ALTTEXT", () => {
  const empty = visual(
    "p",
    "empty",
    "cardVisual",
    {},
    { visualContainerObjects: { general: [{ properties: { altText: lit("''") } }] } },
  );

  it("fires on a visual with no alt text or empty alt text, and not on a shape or a bound expression", () => {
    const files = [
      page("p"),
      visual("p", "none", "cardVisual"),
      empty,
      visual(
        "p",
        "text",
        "cardVisual",
        {},
        {
          visualContainerObjects: {
            general: [{ properties: { altText: lit("'Total sales as a card'") } }],
          },
        },
      ),
      visual(
        "p",
        "bound",
        "cardVisual",
        {},
        {
          visualContainerObjects: {
            general: [
              {
                properties: {
                  altText: { expr: { Aggregation: { Expression: column("T", "C"), Function: 0 } } },
                },
              },
            ],
          },
        },
      ),
      visual("p", "shape", "shape"),
    ];
    // Visuals on a page come out in id order, since the reader walks files sorted by path.
    expect(reportObjectIds(ENSURE_ALTTEXT, files)).toEqual(["empty", "none"]);
  });

  it("points an empty alt text's finding at the altText line", () => {
    // Pretty-printed, as Desktop writes it, so each property has a line of its own.
    const text = JSON.stringify(JSON.parse(empty.text), null, 2);
    const { findings } = lint([page("p"), { ...empty, text }], {
      rules: [ENSURE_ALTTEXT],
      config: { failOn: "none" },
    });
    const line = findings[0]!.location!.line;
    expect(line).toBeGreaterThan(1);
    expect(text.split("\n")[line - 1]).toContain('"altText"');
  });
});
