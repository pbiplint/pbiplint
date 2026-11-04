import { contrastRatio, parseHex, toHex, type Rgba } from "./colour.js";

/** sRGB channel (0 to 255) to linear light, and back, as the sRGB standard defines them. */
const toLinear = (v: number): number => {
  const s = v / 255;
  return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
};
const fromLinear = (l: number): number =>
  255 * (l <= 0.0031308 ? 12.92 * l : 1.055 * l ** (1 / 2.4) - 0.055);

/**
 * A colour in OKLCH, the polar form of OKLab, whose lightness tracks how light a colour looks and
 * whose hue holds as lightness moves. The matrices are Björn Ottosson's published OKLab definition
 * (https://bottosson.github.io/posts/oklab/).
 */
export function oklch(c: Rgba): { l: number; c: number; h: number } {
  const [r, g, b] = [toLinear(c.r), toLinear(c.g), toLinear(c.b)];
  const l_ = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m_ = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s_ = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  const L = 0.2104542553 * l_ + 0.793617785 * m_ - 0.0040720468 * s_;
  const A = 1.9779984951 * l_ - 2.428592205 * m_ + 0.4505937099 * s_;
  const B = 0.0259040371 * l_ + 0.7827717662 * m_ - 0.808675766 * s_;
  return { l: L, c: Math.hypot(A, B), h: (Math.atan2(B, A) * 180) / Math.PI };
}

/** OKLCH back to sRGB channels, or undefined when the colour is outside sRGB. */
function fromOklch(l: number, c: number, h: number): Rgba | undefined {
  const A = c * Math.cos((h * Math.PI) / 180);
  const B = c * Math.sin((h * Math.PI) / 180);
  const l_ = (l + 0.3963377774 * A + 0.2158037573 * B) ** 3;
  const m_ = (l - 0.1055613458 * A - 0.0638541728 * B) ** 3;
  const s_ = (l - 0.0894841775 * A - 1.291485548 * B) ** 3;
  const lin = [
    4.0767416621 * l_ - 3.3077115913 * m_ + 0.2309699292 * s_,
    -1.2684380046 * l_ + 2.6097574011 * m_ - 0.3413193965 * s_,
    -0.0041960863 * l_ - 0.7034186147 * m_ + 1.707614701 * s_,
  ];
  if (lin.some((v) => v < -1e-6 || v > 1 + 1e-6)) return undefined;
  const [r, g, b] = lin.map((v) => fromLinear(Math.min(1, Math.max(0, v))));
  return { r: r!, g: g!, b: b!, a: 1 };
}

/** The colour at lightness `l`, with the hue kept and chroma reduced until it fits in sRGB. */
function atLightness(l: number, c: number, h: number): Rgba {
  for (let chroma = c; chroma > 0; chroma -= c / 64) {
    const rgb = fromOklch(l, chroma, h);
    if (rgb) return rgb;
  }
  return fromOklch(l, 0, h)!;
}

/** Rounded to whole channels, as a hex colour holds it. */
const rounded = (c: Rgba): Rgba => parseHex(toHex(c))!;

/**
 * The text colour nearest `foreground` that reaches `required` against `background` (spec section
 * 7): its OKLCH hue kept, its lightness moved the shortest way that reaches the threshold, then
 * rounded to hex and checked again. Black or white always reaches 4.5:1 against any background,
 * so when the nearer direction cannot, the other one does.
 */
export function suggest(
  foreground: Rgba,
  background: Rgba,
  required: number,
): { colour: Rgba; ratio: number } {
  const { l, c, h } = oklch(foreground);
  const passes = (rgb: Rgba): boolean => contrastRatio(rounded(rgb), background) >= required;
  // Lighter when the text is lighter than the background, darker otherwise; then the other way.
  const lighterFirst = oklch(background).l < l;
  for (const lighter of lighterFirst ? [true, false] : [false, true]) {
    const end = lighter ? 1 : 0;
    if (!passes(atLightness(end, c, h))) continue;
    // Binary search between the colour's own lightness and the end that passes.
    let [near, far] = [l, end];
    for (let i = 0; i < 40; i++) {
      const mid = (near + far) / 2;
      if (passes(atLightness(mid, c, h))) far = mid;
      else near = mid;
    }
    const colour = rounded(atLightness(far, c, h));
    return { colour, ratio: contrastRatio(colour, background) };
  }
  // Not reached for WCAG's thresholds: black or white reaches 4.5:1 against any background.
  const black = parseHex("#000000")!;
  const white = parseHex("#FFFFFF")!;
  const best = contrastRatio(black, background) >= contrastRatio(white, background) ? black : white;
  return { colour: best, ratio: contrastRatio(best, background) };
}
