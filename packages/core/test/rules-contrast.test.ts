import { describe, expect, it } from "vitest";
import { LOW_TEXT_CONTRAST } from "../src/rules/pbiplint/contrast.js";
import { j, lit, page, reportFindings, visual } from "./report-helpers.js";

const fill = (hex: string) => ({ solid: { color: lit(`'${hex}'`) } });
const props = (o: object, selector?: object) => ({
  properties: o,
  ...(selector ? { selector } : {}),
});
const WHITE = [props({ show: lit("true"), color: fill("#FFFFFF"), transparency: lit("0D") })];
const BASE = "StaticResources/SharedResources/BaseThemes/B.json";

/** A shape on page p with a title in these entries, on a white background of its own. */
const titled = (name: string, entries: object[], extra: object = {}) =>
  visual(
    "p",
    name,
    "shape",
    { position: { x: 0, y: 0, z: 0, width: 100, height: 100 }, ...extra },
    {
      visualContainerObjects: { title: entries, background: WHITE },
    },
  );
const titleIn = (hex: string, size = "12D") =>
  props({ show: lit("true"), fontSize: lit(size), fontColor: fill(hex) });
const findings = (files: { path: string; text: string }[]) =>
  reportFindings(LOW_TEXT_CONTRAST, [page("p"), ...files]);

describe("LOW_TEXT_CONTRAST", () => {
  it("is a warning on visuals and the report, in Accessibility, built in", () => {
    expect(LOW_TEXT_CONTRAST).toMatchObject({
      id: "LOW_TEXT_CONTRAST",
      name: "Text with too little contrast",
      category: "Accessibility",
      severity: 2,
      layer: "report",
      status: "builtin",
    });
  });
  it("reports a title below 4.5:1, once, naming the worst state and counting the rest", () => {
    const f = findings([
      titled("v", [titleIn("#A19F9D"), props({ fontColor: fill("#BBBBBB") }, { id: "hover" })]),
    ]);
    expect(f).toHaveLength(1);
    expect(f[0]).toMatchObject({
      objectType: "Visual",
      objectId: "v",
      messageId: "LOW_TEXT_CONTRAST",
    });
    expect(f[0]!.detail).toBe(
      "Title (hover): #BBBBBB on #FFFFFF is 1.91:1, and 12 pt text needs 4.5:1. #767676 would be 4.54:1; 1 more state or field also falls short. Text colour from the visual, background from the visual",
    );
    expect(f[0]!.params).toMatchObject({
      ratio: 1.91,
      required: 4.5,
      foreground: "#BBBBBB",
      others: 1,
    });
  });
  it("does not report 4.5:1 and up, or 3:1 and up for large text, and reports just under", () => {
    expect(findings([titled("v", [titleIn("#767676")])])).toEqual([]);
    expect(findings([titled("v", [titleIn("#777777")])])).toHaveLength(1);
    expect(findings([titled("v", [titleIn("#949494", "18D")])])).toEqual([]);
    expect(findings([titled("v", [titleIn("#949494", "12D")])])).toHaveLength(1);
  });
  it("points at the text colour's line when the visual sets it", () => {
    const v = titled("v", [titleIn("#A19F9D")]);
    const line = v.text.split("\n").findIndex((l) => l.includes('"fontColor"')) + 1;
    expect(findings([v])[0]!.location).toEqual({ file: v.path, line });
  });
  it("says the same colour below 1.1:1 in its own words", () => {
    const f = findings([titled("v", [titleIn("#FEFEFE")])]);
    expect(f[0]!.messageId).toBe("LOW_TEXT_CONTRAST.sameColour");
    expect(f[0]!.detail).toBe(
      "Title: #FEFEFE on #FFFFFF is 1:1, the same colour as what is behind it, so it cannot be read",
    );
  });
});

describe("LOW_TEXT_CONTRAST on a theme setting", () => {
  const theme = {
    foregroundNeutralSecondary: "#C8C6C4",
    visualStyles: {
      "*": {
        "*": {
          title: [
            {
              show: true,
              fontSize: 12,
              fontColor: { solid: { color: "foregroundNeutralSecondary" } },
            },
          ],
          background: [{ show: true, transparency: 0, color: { solid: { color: "#FFFFFF" } } }],
        },
      },
    },
  };
  const files = (n: number) => [
    {
      path: "definition/report.json",
      text: j({
        themeCollection: { baseTheme: { name: "B", type: "SharedResources" } },
        resourcePackages: [
          { name: "SharedResources", items: [{ name: "B", path: "BaseThemes/B.json" }] },
        ],
      }),
    },
    { path: BASE, text: JSON.stringify(theme, null, 2) },
    ...Array.from({ length: n }, (_, i) => visual("p", `v${i}`, "shape")),
  ];
  it("reports a failing theme setting once, on the theme, at its line", () => {
    const f = findings(files(20));
    expect(f).toHaveLength(1);
    expect(f[0]).toMatchObject({
      objectType: "Report",
      messageId: "LOW_TEXT_CONTRAST.theme",
      location: { file: BASE, line: 2 },
      params: { visuals: 20 },
    });
    expect(f[0]!.detail).toBe(
      "foregroundNeutralSecondary in StaticResources/SharedResources/BaseThemes/B.json gives #C8C6C4 on #FFFFFF, 1.7:1, where 12 pt text needs 4.5:1, on 20 visuals (Title). #787675 would be 4.51:1",
    );
  });
  it("still reports a visual that sets one of the two colours itself", () => {
    const own = visual("p", "mine", "shape", {}, { visualContainerObjects: { background: WHITE } });
    const f = findings([...files(2), own]);
    expect(f.map((x) => x.objectId).sort()).toEqual(
      ["mine", expect.stringContaining("B.json")].sort(),
    );
  });
});
