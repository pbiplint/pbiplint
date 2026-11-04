import { describe, expect, it } from "vitest";
import { parseHex } from "../src/colour/colour.js";
import { ELEMENTS, elementsFor, textClass, type ElementKind } from "../src/colour/elements.js";
import type { ThemeFile } from "../src/pbir/types.js";

const read = (json: Record<string, unknown>, file: string): ThemeFile => ({
  name: file,
  state: "read",
  file,
  json,
});
const BASE_FILE = "StaticResources/SharedResources/BaseThemes/B.json";
const CUSTOM_FILE = "StaticResources/RegisteredResources/C.json";
const fallbackOf = (kind: ElementKind) =>
  ELEMENTS.filter((e) => e.kind === kind).map((e) => e.fallback);

describe("ELEMENTS", () => {
  it("names each colour, size, and weight property as Microsoft's theme schema does", () => {
    const row = (type: string, object: string) =>
      elementsFor(type).find((e) => e.object === object);
    expect(row("card", "title")).toMatchObject({
      container: true,
      colour: ["fontColor"],
      size: "fontSize",
      bold: "bold",
    });
    expect(row("clusteredColumnChart", "labels")).toMatchObject({
      colour: ["color"],
      size: "fontSize",
    });
    expect(row("clusteredColumnChart", "legend")).toMatchObject({ colour: ["labelColor"] });
    expect(row("slicer", "items")).toMatchObject({ colour: ["fontColor"], size: "textSize" });
    expect(row("tableEx", "values")).toMatchObject({
      colour: ["fontColor", "fontColorPrimary", "fontColorSecondary"],
      background: { colour: ["backColor", "backColorPrimary", "backColorSecondary"] },
    });
    expect(row("cardVisual", "value")).toMatchObject({ colour: ["fontColor"] });
    expect(row("kpi", "goals")).toMatchObject({ colour: ["goalFontColor", "distanceFontColor"] });
    expect(row("actionButton", "text")).toMatchObject({
      colour: ["fontColor"],
      background: { object: "fill", colour: ["fillColor"], transparency: "transparency" },
    });
  });
  it("takes the defaults the first Desktop check showed (spec section 10)", () => {
    expect(fallbackOf("textBox")).toEqual([{ textClass: "label" }]);
    expect(fallbackOf("cardLabel")).toEqual([{ textClass: "largeLightLabel" }]);
    for (const kind of ["tableHeaders", "tableValues", "slicerItems"] as const)
      expect(new Set(fallbackOf(kind).map((f) => JSON.stringify(f)))).toEqual(
        new Set([JSON.stringify({ named: "foreground" })]),
      );
    expect(ELEMENTS.find((e) => e.object === "values")?.background?.fallback).toEqual({
      named: "background",
    });
  });
  it("takes the defaults the second Desktop check showed (spec section 10)", () => {
    const smallLight = [{ textClass: "smallLightLabel" }, { named: "foregroundNeutralSecondary" }];
    expect(fallbackOf("axisLabels")).toEqual([smallLight, smallLight]);
    expect(fallbackOf("title")).toEqual([[{ textClass: "largeTitle" }, { textClass: "title" }]]);
    expect(fallbackOf("subtitle")).toEqual([{ textClass: "lightLabel" }]);
    expect(fallbackOf("legend")).toEqual([{ textClass: "lightLabel" }]);
    expect(fallbackOf("axisTitles")).toEqual([{ textClass: "title" }, { textClass: "title" }]);
    expect(fallbackOf("cardValue")).toEqual([{ textClass: "callout" }]);
    expect(fallbackOf("slicerHeader")).toEqual([{ textClass: "title" }]);
    expect(fallbackOf("dataLabels")).toEqual([{ named: "foregroundNeutralSecondary" }]);
    const newCard = ELEMENTS.filter((e) => e.kind === "newCard");
    expect(newCard.find((e) => e.object === "value")?.fallback).toEqual({ named: "foreground" });
    expect(newCard.find((e) => e.object === "label")?.fallback).toEqual({
      named: "foregroundNeutralSecondary",
    });
    for (const e of [...newCard.slice(0, 2), ...ELEMENTS.filter((x) => x.kind === "buttonSlicer")])
      expect(e.background, e.object).toMatchObject({
        object: "fillCustom",
        defaultOn: true,
        fallback: { named: "background" },
      });
    expect(
      ELEMENTS.find((e) => e.kind === "buttonSlicer" && e.object === "value")?.fallback,
    ).toEqual({ named: "foreground" });
  });
  it("leaves every default the checks have not shown as not known", () => {
    for (const kind of ["multiRowCard", "kpi", "tableTotals", "buttonText"] as const)
      for (const f of fallbackOf(kind)) expect(f, kind).toBe("not-known");
    for (const object of ["referenceLabelTitle", "referenceLabelValue", "referenceLabelDetail"])
      expect(ELEMENTS.find((e) => e.object === object)?.fallback, object).toBe("not-known");
    expect(ELEMENTS.find((e) => e.kind === "buttonSlicer" && e.object === "label")?.fallback).toBe(
      "not-known",
    );
  });
  it("gives titles and subtitles to every visual type, and the rest to their own", () => {
    expect(elementsFor("tableEx").map((e) => e.object)).toEqual(
      expect.arrayContaining(["title", "subTitle", "columnHeaders", "values", "total"]),
    );
    expect(elementsFor("tableEx").map((e) => e.object)).not.toContain("legend");
    expect(elementsFor("textbox").some((e) => e.kind === "textBox")).toBe(true);
    expect(elementsFor("someCustomVisual1234").map((e) => e.kind)).toEqual(["title", "subtitle"]);
  });
});

describe("textClass", () => {
  const base = read({ textClasses: { label: { color: "#252423", fontSize: 10 } } }, BASE_FILE);
  it("reads the custom theme's class, then the base's, with its size", () => {
    const custom = read({ textClasses: { label: { color: "#AA3344" } } }, CUSTOM_FILE);
    expect(textClass("label", { base, custom })).toEqual({
      colour: {
        known: true,
        colour: parseHex("#AA3344"),
        from: { file: CUSTOM_FILE, pointer: "/textClasses/label/color", layer: "customTheme" },
      },
    });
    expect(textClass("label", { base })).toEqual({
      colour: {
        known: true,
        colour: parseHex("#252423"),
        from: { file: BASE_FILE, pointer: "/textClasses/label/color", layer: "baseTheme" },
      },
      size: 10,
    });
  });
  it("stops at a theme that was not read, and is not set when neither theme has the class", () => {
    expect(textClass("label", { base, custom: { name: "x", state: "absent" } }).colour).toEqual({
      known: false,
      why: "theme-not-read",
    });
    expect(textClass("callout", { base }).colour).toEqual({ known: false, why: "not-set" });
  });
});
