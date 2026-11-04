import { describe, expect, it } from "vitest";
import { contrastSample } from "../src/colour/sample.js";

const size = (fontSize: number, bold = "no") => ({
  id: "LOW_TEXT_CONTRAST.size",
  params: { fontSize, bold },
});
const PARAMS = {
  foreground: "#A19F9D",
  background: "#FFFFFF",
  ratio: 2.63,
  size: size(12),
  required: 4.5,
  suggested: "#767676",
  suggestedRatio: 4.54,
};
const svgOf = (src: string): string =>
  decodeURIComponent(src.replace(/^data:image\/svg\+xml,/, ""));

describe("contrastSample", () => {
  it("draws the two colours beside the suggested one, as a data: SVG", () => {
    const sample = contrastSample(PARAMS)!;
    expect(sample.src.startsWith("data:image/svg+xml,")).toBe(true);
    const svg = svgOf(sample.src);
    for (const hex of ["#A19F9D", "#FFFFFF", "#767676"]) expect(svg).toContain(hex);
    expect(svg).toContain("Sample text 123");
    expect(svg).toContain("as found, 2.63:1");
    expect(svg).toContain("suggested, 4.54:1");
  });
  it("says in its alt text that the browser drew it, with the numbers", () => {
    expect(contrastSample(PARAMS)!.alt).toBe(
      "Sample text drawn by the browser in #A19F9D on #FFFFFF, 2.63:1, beside the suggested #767676, 4.54:1",
    );
  });
  it("draws one panel for text the same colour as its background", () => {
    const same = contrastSample({ foreground: "#FEFEFE", background: "#FFFFFF", ratio: 1 })!;
    expect(svgOf(same.src)).not.toContain("suggested");
    expect(same.alt).toBe("Sample text drawn by the browser in #FEFEFE on #FFFFFF, 1:1");
  });
  it("draws nothing for a colour that is missing or not six-digit hex", () => {
    for (const bad of ["#fff", "red", '#FFFFFF"><script>', "#ffffff", undefined, 7])
      expect(contrastSample({ ...PARAMS, foreground: bad }), String(bad)).toBeUndefined();
    expect(contrastSample({ ...PARAMS, suggested: "url(x)" })).toBeUndefined();
  });
  it("sizes the text from the finding, capped, and bold when it is", () => {
    expect(svgOf(contrastSample({ ...PARAMS, size: size(10) })!.src)).toContain('font-size="10pt"');
    expect(svgOf(contrastSample({ ...PARAMS, size: size(60) })!.src)).toContain('font-size="24pt"');
    expect(svgOf(contrastSample({ ...PARAMS, size: size(14, "yes") })!.src)).toContain(
      'font-weight="bold"',
    );
    // Unknown size: a middling one.
    expect(svgOf(contrastSample({ ...PARAMS, size: { id: "x", params: {} } })!.src)).toContain(
      'font-size="12pt"',
    );
  });
  it("holds no script, no external reference, and no style attribute", () => {
    const svg = svgOf(contrastSample(PARAMS)!.src);
    expect(svg).not.toMatch(/<script|href|style=|url\(/i);
  });
});
