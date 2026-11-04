import { describe, expect, it } from "vitest";
import { contrastRatio, parseHex, toHex, type Rgba } from "../src/colour/colour.js";
import { oklch, suggest } from "../src/colour/suggest.js";

const hex = (s: string): Rgba => parseHex(s)!;
const fromHex = (c: Rgba): Rgba => hex(toHex(c));

/** A small seeded generator, so the sweep is the same on every run. */
function random(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

describe("suggest", () => {
  it("keeps the hue and moves the lightness the shortest way", () => {
    const fg = hex("#2E8B57");
    const { colour, ratio } = suggest(fg, hex("#FFFFFF"), 4.5);
    expect(ratio).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(fromHex(colour), hex("#FFFFFF"))).toBe(ratio);
    expect(oklch(colour).l).toBeLessThan(oklch(fg).l);
    expect(Math.abs(oklch(colour).h - oklch(fg).h)).toBeLessThan(3);
  });
  it("gives a grey for a grey", () => {
    const { colour } = suggest(hex("#A19F9D"), hex("#FFFFFF"), 4.5);
    const c = fromHex(colour);
    expect(Math.max(c.r, c.g, c.b) - Math.min(c.r, c.g, c.b)).toBeLessThanOrEqual(3);
  });
  it("lightens text on a dark background", () => {
    const { colour, ratio } = suggest(hex("#404040"), hex("#202020"), 4.5);
    expect(ratio).toBeGreaterThanOrEqual(4.5);
    expect(oklch(colour).l).toBeGreaterThan(oklch(hex("#404040")).l);
  });
  it("goes the other way when the nearer one cannot reach the threshold", () => {
    // On mid grey, lightening a slightly light grey cannot reach 4.5:1, so it goes dark.
    const bg = hex("#777777");
    const { ratio } = suggest(hex("#7A7A7A"), bg, 4.5);
    expect(ratio).toBeGreaterThanOrEqual(4.5);
  });
  it("always passes once rounded to hex", () => {
    const next = random(182);
    const channel = () => Math.floor(next() * 256);
    for (let i = 0; i < 2000; i++) {
      const fg = { r: channel(), g: channel(), b: channel(), a: 1 };
      const bg = { r: channel(), g: channel(), b: channel(), a: 1 };
      const required = next() < 0.5 ? 4.5 : 3;
      const { colour, ratio } = suggest(fg, bg, required);
      expect(ratio, `${toHex(fg)} on ${toHex(bg)}`).toBeGreaterThanOrEqual(required);
      expect(contrastRatio(fromHex(colour), bg)).toBe(ratio);
    }
  });
});
