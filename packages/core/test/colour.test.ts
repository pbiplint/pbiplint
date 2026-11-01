import { describe, expect, it } from "vitest";
import {
  contrastRatio,
  over,
  parseHex,
  relativeLuminance,
  toHex,
  truncateRatio,
  type Rgba,
} from "../src/colour/colour.js";

const hex = (s: string): Rgba => parseHex(s)!;
const WHITE = hex("#FFFFFF");
const BLACK = hex("#000000");

describe("parseHex", () => {
  it("reads 3, 6, and 8 digits, in either case", () => {
    expect(parseHex("#FFF")).toEqual({ r: 255, g: 255, b: 255, a: 1 });
    expect(parseHex("#abc")).toEqual({ r: 0xaa, g: 0xbb, b: 0xcc, a: 1 });
    expect(parseHex("#1F4E79")).toEqual({ r: 0x1f, g: 0x4e, b: 0x79, a: 1 });
    expect(parseHex("#1f4e79")).toEqual({ r: 0x1f, g: 0x4e, b: 0x79, a: 1 });
  });
  it("takes the last pair of 8 digits as alpha", () => {
    expect(parseHex("#FFFFFF00")).toEqual({ r: 255, g: 255, b: 255, a: 0 });
    expect(parseHex("#00000080")).toEqual({ r: 0, g: 0, b: 0, a: 128 / 255 });
  });
  it("refuses anything else", () => {
    for (const s of ["#FFFF", "#GGGGGG", "FFFFFF", "red", "", "#FFFFF", "#FFFFFFF", " #FFFFFF"])
      expect(parseHex(s), s).toBeUndefined();
  });
});

describe("toHex", () => {
  it("writes six upper-case digits, rounding each channel and dropping alpha", () => {
    expect(toHex(hex("#1f4e79"))).toBe("#1F4E79");
    expect(toHex({ r: 127.5, g: 0.4, b: 255, a: 0.5 })).toBe("#8000FF");
  });
});

describe("WCAG's relative luminance and contrast ratio", () => {
  it("gives white 1 and black 0", () => {
    expect(relativeLuminance(WHITE)).toBe(1);
    expect(relativeLuminance(BLACK)).toBe(0);
  });
  it("uses WCAG 2.2's 0.04045 between the two branches", () => {
    const channel = (v: number) => relativeLuminance({ r: v, g: v, b: v, a: 1 });
    expect(channel(0.04045 * 255)).toBeCloseTo(0.04045 / 12.92, 10);
    expect(channel(0.05 * 255)).toBeCloseTo(((0.05 + 0.055) / 1.055) ** 2.4, 10);
  });
  it("runs from 1 to exactly 21, in either order", () => {
    expect(contrastRatio(BLACK, WHITE)).toBe(21);
    expect(contrastRatio(WHITE, BLACK)).toBe(21);
    expect(contrastRatio(hex("#777777"), hex("#777777"))).toBe(1);
  });
  it("sits either side of 4.5:1 where it should, unrounded", () => {
    const on = (s: string) => contrastRatio(hex(s), WHITE);
    expect(truncateRatio(on("#767676"))).toBe(4.54);
    expect(on("#767676")).toBeGreaterThanOrEqual(4.5);
    expect(truncateRatio(on("#777777"))).toBe(4.47);
    expect(on("#777777")).toBeLessThan(4.5);
    expect(truncateRatio(on("#A19F9D"))).toBe(2.63);
  });
});

describe("truncateRatio", () => {
  it("cuts to two decimals and never rounds up, as WCAG compares unrounded", () => {
    expect(truncateRatio(4.499)).toBe(4.49);
    expect(truncateRatio(4.5)).toBe(4.5);
    expect(truncateRatio(2.5799)).toBe(2.57);
    expect(truncateRatio(21)).toBe(21);
  });
});

describe("over", () => {
  it("is the top when opaque, the bottom when clear, and a blend between", () => {
    expect(over(BLACK, WHITE)).toEqual(BLACK);
    expect(over({ ...BLACK, a: 0 }, WHITE)).toEqual(WHITE);
    const half = over({ ...BLACK, a: 0.5 }, WHITE);
    expect(half).toEqual({ r: 127.5, g: 127.5, b: 127.5, a: 1 });
    expect(toHex(half)).toBe("#808080");
  });
  it("blends over a bottom that is itself not opaque", () => {
    const blended = over({ r: 255, g: 0, b: 0, a: 0.5 }, { r: 0, g: 0, b: 255, a: 0.5 });
    expect(blended.a).toBeCloseTo(0.75);
    expect(blended.r).toBeCloseTo(170);
    expect(blended.b).toBeCloseTo(85);
  });
});
