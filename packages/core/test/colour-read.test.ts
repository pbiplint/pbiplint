import { describe, expect, it } from "vitest";
import { parseHex } from "../src/colour/colour.js";
import {
  namedColour,
  readColour,
  readLiteralBool,
  readLiteralNumber,
} from "../src/colour/read.js";
import type { Report, ThemeFile } from "../src/pbir/types.js";

const BASE_FILE = "StaticResources/SharedResources/BaseThemes/B.json";
const CUSTOM_FILE = "StaticResources/RegisteredResources/C.json";
const read = (json: Record<string, unknown>, file: string): ThemeFile => ({
  name: file,
  state: "read",
  file,
  text: JSON.stringify(json),
  json,
});
const absent: ThemeFile = { name: "gone", state: "absent" };

const BASE = read(
  {
    background: "#FFFFFF",
    foreground: "#252423",
    foregroundNeutralSecondary: "#605E5C",
    dataColors: ["#118DFF", "#12239E"],
    odd: { not: "a colour" },
  },
  BASE_FILE,
);
const baseOnly: Report["themes"] = { base: BASE };

const literal = (hex: string) => ({
  solid: { color: { expr: { Literal: { Value: `'${hex}'` } } } },
});
const themeRef = (ColorId: number, Percent?: number) => ({
  solid: {
    color: { expr: { ThemeDataColor: { ColorId, ...(Percent === undefined ? {} : { Percent }) } } },
  },
});
const colour = (hex: string) => parseHex(hex)!;

describe("readColour on a written colour", () => {
  it("reads a quoted hex literal, a theme file's solid colour, and a plain string", () => {
    for (const value of [literal("#1F4E79"), { solid: { color: "#1F4E79" } }, "#1F4E79"])
      expect(readColour(value, {})).toEqual({ known: true, colour: colour("#1F4E79") });
  });
  it("keeps an 8-digit colour's alpha", () => {
    expect(readColour({ solid: { color: "#FFFFFF00" } }, {})).toEqual({
      known: true,
      colour: { r: 255, g: 255, b: 255, a: 0 },
    });
  });
  it("treats any other expression as depending on the data", () => {
    for (const expr of [
      { FillRule: {} },
      { Conditional: {} },
      { Measure: {} },
      { Aggregation: {} },
      { Unknown: {} },
    ])
      expect(readColour({ solid: { color: { expr } } }, baseOnly)).toEqual({
        known: false,
        why: "data-dependent",
      });
  });
  it("calls any other shape another form, and never guesses", () => {
    for (const value of [
      { gradient: { startColor: "#000000", endColor: "#FFFFFF" } },
      literal("red"),
      literal("#12"),
      4,
      null,
      undefined,
      { solid: {} },
    ])
      expect(readColour(value, baseOnly)).toEqual({ known: false, why: "other-form" });
  });
});

describe("readColour on a theme colour reference", () => {
  it("maps ColorId 0 to background, 1 to foreground, and 2 and up to dataColors, saying which line", () => {
    const cases: [number, string, string][] = [
      [0, "#FFFFFF", "/background"],
      [1, "#252423", "/foreground"],
      [2, "#118DFF", "/dataColors/0"],
      [3, "#12239E", "/dataColors/1"],
    ];
    for (const [id, hex, pointer] of cases)
      expect(readColour(themeRef(id, 0), baseOnly)).toEqual({
        known: true,
        colour: colour(hex),
        from: { file: BASE_FILE, pointer, layer: "baseTheme" },
      });
  });
  it("takes a missing Percent as 0", () => {
    expect(readColour(themeRef(1), baseOnly)).toMatchObject({
      known: true,
      colour: colour("#252423"),
    });
  });
  it("does not know a Percent other than 0, whatever the themes say", () => {
    for (const p of [0.2, -0.6, 1])
      expect(readColour(themeRef(1, p), baseOnly)).toEqual({ known: false, why: "percent" });
    expect(readColour(themeRef(1, 0.2), {})).toEqual({ known: false, why: "percent" });
  });
  it("takes dataColors whole: a custom theme's list ends where it ends", () => {
    const themes = { base: BASE, custom: read({ dataColors: ["#AAAAAA"] }, CUSTOM_FILE) };
    expect(readColour(themeRef(2), themes)).toEqual({
      known: true,
      colour: colour("#AAAAAA"),
      from: { file: CUSTOM_FILE, pointer: "/dataColors/0", layer: "customTheme" },
    });
    expect(readColour(themeRef(3), themes)).toEqual({ known: false, why: "not-set" });
  });
  it("uses the base's dataColors when the custom theme has none", () => {
    const themes = { base: BASE, custom: read({ foreground: "#000000" }, CUSTOM_FILE) };
    expect(readColour(themeRef(3), themes)).toMatchObject({ colour: colour("#12239E") });
  });
  it("refuses a ColorId that is not a whole number from 0", () => {
    for (const id of [-1, 1.5])
      expect(readColour(themeRef(id), baseOnly)).toEqual({ known: false, why: "other-form" });
  });
});

describe("a named theme colour", () => {
  it("resolves in a theme file's solid form and directly, custom over base", () => {
    const value = { solid: { color: "foregroundNeutralSecondary" } };
    expect(readColour(value, baseOnly)).toEqual({
      known: true,
      colour: colour("#605E5C"),
      from: { file: BASE_FILE, pointer: "/foregroundNeutralSecondary", layer: "baseTheme" },
    });
    const themes = {
      base: BASE,
      custom: read({ foregroundNeutralSecondary: "#000" }, CUSTOM_FILE),
    };
    expect(namedColour("foregroundNeutralSecondary", themes)).toEqual({
      known: true,
      colour: colour("#000000"),
      from: { file: CUSTOM_FILE, pointer: "/foregroundNeutralSecondary", layer: "customTheme" },
    });
  });
  it("is not set when the themes are read and neither sets it", () => {
    expect(namedColour("selection", baseOnly)).toEqual({ known: false, why: "not-set" });
    expect(namedColour("foreground", {})).toEqual({ known: false, why: "not-set" });
  });
  it("is another form when a theme's value is not a hex colour, so no reference is followed", () => {
    expect(namedColour("odd", baseOnly)).toEqual({ known: false, why: "other-form" });
    const looped = { base: read({ foreground: "foreground" }, BASE_FILE) };
    expect(namedColour("foreground", looped)).toEqual({ known: false, why: "other-form" });
  });
  it("does not take an object's inherited names for theme colours", () => {
    for (const name of ["constructor", "__proto__", "toString"])
      expect(namedColour(name, baseOnly)).toEqual({ known: false, why: "not-set" });
  });
});

describe("a theme that was not read", () => {
  it("stops at a custom theme not read, though the base sets the colour", () => {
    const themes = { base: BASE, custom: absent };
    expect(namedColour("foreground", themes)).toEqual({ known: false, why: "theme-not-read" });
    expect(readColour(themeRef(1), themes)).toEqual({ known: false, why: "theme-not-read" });
  });
  it("needs the base only when the custom theme does not set the colour", () => {
    const themes = { base: absent, custom: read({ foreground: "#000000" }, CUSTOM_FILE) };
    expect(namedColour("foreground", themes)).toMatchObject({ known: true });
    expect(namedColour("background", themes)).toEqual({ known: false, why: "theme-not-read" });
  });
  it("counts a theme that did not parse as not read", () => {
    const themes = { base: { name: "x", state: "unparsed", file: BASE_FILE } as ThemeFile };
    expect(namedColour("foreground", themes)).toEqual({ known: false, why: "theme-not-read" });
  });
  it("needs no theme for a literal", () => {
    expect(readColour(literal("#000000"), { base: absent, custom: absent })).toMatchObject({
      known: true,
    });
  });
});

describe("literals", () => {
  it("reads a number as visual.json and a theme file write it", () => {
    for (const Value of ["50D", "50L", "50M", "50"])
      expect(readLiteralNumber({ expr: { Literal: { Value } } }), Value).toBe(50);
    expect(readLiteralNumber(50)).toBe(50);
    expect(readLiteralNumber({ expr: { Literal: { Value: "12.5D" } } })).toBe(12.5);
    for (const v of [{ expr: { Literal: { Value: "'50'" } } }, { expr: { Measure: {} } }, "50"])
      expect(readLiteralNumber(v)).toBeUndefined();
  });
  it("reads a boolean as visual.json and a theme file write it", () => {
    expect(readLiteralBool({ expr: { Literal: { Value: "true" } } })).toBe(true);
    expect(readLiteralBool({ expr: { Literal: { Value: "false" } } })).toBe(false);
    expect(readLiteralBool(true)).toBe(true);
    expect(readLiteralBool(false)).toBe(false);
    expect(readLiteralBool({ expr: { Measure: {} } })).toBeUndefined();
    expect(readLiteralBool("true")).toBeUndefined();
  });
});
