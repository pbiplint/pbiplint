import { describe, expect, it } from "vitest";
import { isBold, pointSize, requiredRatio } from "../src/colour/size.js";

const lit = (Value: string) => ({ expr: { Literal: { Value } } });

describe("pointSize", () => {
  it("reads a size as visual.json, a text box, and a theme write it", () => {
    expect(pointSize(lit("12D"))).toBe(12);
    expect(pointSize(lit("12L"))).toBe(12);
    expect(pointSize("28pt")).toBe(28);
    expect(pointSize("16px")).toBe(12);
    expect(pointSize(12)).toBe(12);
    expect(pointSize("10.5pt")).toBe(10.5);
  });
  it("is undefined for anything else", () => {
    for (const v of [lit("'12'"), "12", "large", undefined, { expr: { Measure: {} } }, -3])
      expect(pointSize(v)).toBeUndefined();
  });
});

describe("isBold", () => {
  it("reads bold, a font weight, or a family whose name ends in Bold", () => {
    expect(isBold({ bold: lit("true") })).toBe(true);
    expect(isBold({ bold: true })).toBe(true);
    expect(isBold({ fontWeight: "bold" })).toBe(true);
    expect(isBold({ fontWeight: "700" })).toBe(true);
    expect(isBold({ fontWeight: "800" })).toBe(true);
    expect(isBold({ fontFamily: lit("'Segoe UI Bold'") })).toBe(true);
    expect(isBold({ fontFamily: "'Segoe UI Bold', wf_segoe-ui_bold, helvetica" })).toBe(true);
  });
  it("does not take Semibold, normal weight, or nothing for bold", () => {
    expect(isBold({ fontFamily: lit("'Segoe UI Semibold'") })).toBe(false);
    expect(isBold({ fontWeight: "600" })).toBe(false);
    expect(isBold({ fontWeight: "normal" })).toBe(false);
    expect(isBold({ bold: lit("false") })).toBe(false);
    expect(isBold({})).toBe(false);
  });
});

describe("requiredRatio", () => {
  it("needs 3:1 for large text, at least 18 point or 14 point and bold, and 4.5:1 below", () => {
    expect(requiredRatio(18, false)).toBe(3);
    expect(requiredRatio(14, true)).toBe(3);
    expect(requiredRatio(17.9, false)).toBe(4.5);
    expect(requiredRatio(14, false)).toBe(4.5);
    expect(requiredRatio(13.9, true)).toBe(4.5);
    expect(requiredRatio(undefined, true)).toBeUndefined();
  });
});
