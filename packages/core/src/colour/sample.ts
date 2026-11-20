/**
 * A labelled sample of a contrast finding's colours, for the site: generic sample text drawn by the
 * browser in the finding's two colours, beside the same text in the suggested colour, as an image
 * whose `src` is a `data:` SVG. The text is never the report's own, so the sample claims nothing
 * about how the visual looks (#182's spec, section 11). Only six-digit upper-case hex reaches the
 * SVG; anything else draws no sample.
 */
const HEX = /^#[0-9A-F]{6}$/;
const SAMPLE_TEXT = "Sample text 123";
const CAPTION = { fill: "#000000", band: "#FFFFFF", size: 11 };

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);
const hexOf = (v: unknown): string | undefined =>
  typeof v === "string" && HEX.test(v) ? v : undefined;
const numberOf = (v: unknown): number | undefined =>
  typeof v === "number" && Number.isFinite(v) ? v : undefined;

/** The finding's size, from its nested size message: points, capped so it fits a table cell. */
function sizeOf(params: Record<string, unknown>): { pt: number; bold: boolean } {
  const inner = isRecord(params.size) && isRecord(params.size.params) ? params.size.params : {};
  const pt = numberOf(inner.fontSize);
  return { pt: Math.min(pt ?? 12, 24), bold: inner.bold === "yes" };
}

function panel(
  x: number,
  width: number,
  height: number,
  text: string,
  back: string,
  font: { pt: number; bold: boolean },
  caption: string,
): string {
  const textY = Math.round(height / 2 + font.pt * 0.45);
  return (
    `<rect x="${x}" y="0" width="${width}" height="${height}" fill="${back}"/>` +
    `<text x="${x + 12}" y="${textY}" fill="${text}" font-family="Segoe UI, sans-serif" font-size="${font.pt}pt"${font.bold ? ' font-weight="bold"' : ""}>${SAMPLE_TEXT}</text>` +
    `<rect x="${x}" y="${height}" width="${width}" height="22" fill="${CAPTION.band}"/>` +
    `<text x="${x + 12}" y="${height + 15}" fill="${CAPTION.fill}" font-family="Segoe UI, sans-serif" font-size="${CAPTION.size}px">${caption}</text>`
  );
}

export function contrastSample(
  params: Readonly<Record<string, unknown>>,
): { src: string; alt: string } | undefined {
  const foreground = hexOf(params.foreground);
  const background = hexOf(params.background);
  const ratio = numberOf(params.ratio);
  if (!foreground || !background || ratio === undefined) return undefined;
  const hasSuggestion = params.suggested !== undefined;
  const suggested = hexOf(params.suggested);
  const suggestedRatio = numberOf(params.suggestedRatio);
  if (hasSuggestion && (!suggested || suggestedRatio === undefined)) return undefined;
  const font = sizeOf(params);
  const width = Math.round(Math.max(200, font.pt * 12));
  const height = Math.round(font.pt * 2.4 + 16);
  const found = panel(0, width, height, foreground, background, font, `as found, ${ratio}:1`);
  const better =
    suggested && suggestedRatio !== undefined
      ? panel(
          width + 8,
          width,
          height,
          suggested,
          background,
          font,
          `suggested, ${suggestedRatio}:1`,
        )
      : "";
  const total = better ? width * 2 + 8 : width;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${total}" height="${height + 22}" viewBox="0 0 ${total} ${height + 22}">${found}${better}</svg>`;
  const alt =
    `Sample text drawn by the browser in ${foreground} on ${background}, ${ratio}:1` +
    (better ? `, beside the suggested ${suggested}, ${suggestedRatio}:1` : "");
  return { src: `data:image/svg+xml,${encodeURIComponent(svg)}`, alt };
}
