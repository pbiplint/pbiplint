/** A colour: red, green, and blue from 0 to 255, not always whole after a blend, alpha from 0 to 1. */
export interface Rgba {
  r: number;
  g: number;
  b: number;
  a: number;
}

/**
 * A colour written as Microsoft's theme schema allows: 3, 6, or 8 hex digits after a `#`, the last
 * pair of 8 being alpha (`#FFFFFF00` is transparent).
 */
export function parseHex(text: string): Rgba | undefined {
  const m = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/.exec(text);
  if (!m) return undefined;
  const digits = m[1]!.length === 3 ? m[1]!.replace(/./g, "$&$&") : m[1]!;
  const pair = (at: number): number => parseInt(digits.slice(at, at + 2), 16);
  return { r: pair(0), g: pair(2), b: pair(4), a: digits.length === 8 ? pair(6) / 255 : 1 };
}

/** `#RRGGBB`, upper case, each channel rounded. Alpha is not written: blend first. */
export function toHex(c: Rgba): string {
  const pair = (v: number): string => Math.round(v).toString(16).padStart(2, "0");
  return `#${pair(c.r)}${pair(c.g)}${pair(c.b)}`.toUpperCase();
}

/** One channel of WCAG 2.2's relative luminance definition. */
const linear = (channel: number): number => {
  const s = channel / 255;
  return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
};

/** WCAG 2.2's relative luminance, from https://www.w3.org/TR/WCAG22/#dfn-relative-luminance */
export const relativeLuminance = (c: Rgba): number =>
  0.2126 * linear(c.r) + 0.7152 * linear(c.g) + 0.0722 * linear(c.b);

/**
 * WCAG 2.2's contrast ratio of two opaque colours, from 1 to 21, unrounded, since WCAG compares it
 * unrounded with a threshold (https://www.w3.org/TR/WCAG22/#dfn-contrast-ratio). A colour with
 * alpha is blended first (`over`).
 */
export function contrastRatio(a: Rgba, b: Rgba): number {
  const [la, lb] = [relativeLuminance(a), relativeLuminance(b)];
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/** A ratio to show: two decimals, cut rather than rounded, so a shown 4.50 always meets 4.5:1. */
export const truncateRatio = (ratio: number): number => Math.floor(ratio * 100) / 100;

/**
 * `top` painted over `bottom` by source-over blending. Channels stay unrounded, so a stack of
 * layers rounds once, at the end.
 */
export function over(top: Rgba, bottom: Rgba): Rgba {
  const a = top.a + bottom.a * (1 - top.a);
  if (a === 0) return { r: 0, g: 0, b: 0, a: 0 };
  const mix = (t: number, b: number): number =>
    (t * top.a + b * bottom.a * (1 - top.a)) / a;
  return { r: mix(top.r, bottom.r), g: mix(top.g, bottom.g), b: mix(top.b, bottom.b), a };
}
