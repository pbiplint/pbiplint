import { literal } from "../pbir/build.js";

/**
 * A text size in points, as Power BI writes it: a literal in visual.json (`12D`), a text box run's
 * `28pt` or `16px` (0.75 pt per px), or a number in a theme file. Sizes are compared as written,
 * at Actual size.
 */
export function pointSize(value: unknown): number | undefined {
  if (typeof value === "number") return value > 0 ? value : undefined;
  const isLiteral = typeof value === "object" && value !== null;
  const text = isLiteral ? literal(value) : typeof value === "string" ? value : undefined;
  if (
    text === undefined ||
    (isLiteral &&
      /^'/.test(String((value as { expr: { Literal: { Value: unknown } } }).expr?.Literal?.Value)))
  )
    return undefined;
  const m = isLiteral
    ? /^(\d+(?:\.\d+)?)[DLM]?$/.exec(text)
    : /^(\d+(?:\.\d+)?)(pt|px)$/.exec(text);
  if (!m) return undefined;
  const n = Number.parseFloat(m[1]!);
  return m[2] === "px" ? n * 0.75 : n;
}

/**
 * Whether text is bold: a `bold` of true, a font weight of `bold` or 700 and up, or a font family
 * whose first name ends in Bold. Semibold is not bold, the stricter reading (spec section 6).
 */
export function isBold(props: {
  bold?: unknown;
  fontWeight?: unknown;
  fontFamily?: unknown;
}): boolean {
  const text = (v: unknown): string | undefined =>
    typeof v === "string" ? v : typeof v === "object" && v !== null ? literal(v) : undefined;
  if (props.bold === true || text(props.bold) === "true") return true;
  const weight = text(props.fontWeight);
  if (weight !== undefined && (weight === "bold" || Number(weight) >= 700)) return true;
  const family = text(props.fontFamily)?.split(",")[0]?.trim().replace(/^'|'$/g, "");
  return family !== undefined && /(^|\s)Bold$/i.test(family);
}

/**
 * WCAG 2.2's threshold for text of this size and weight: 3 for large scale text, at least 18
 * point or 14 point and bold (https://www.w3.org/TR/WCAG22/#dfn-large-scale), else 4.5. Undefined
 * when the size is not known.
 */
export function requiredRatio(size: number | undefined, bold: boolean): 4.5 | 3 | undefined {
  if (size === undefined) return undefined;
  return size >= 18 || (bold && size >= 14) ? 3 : 4.5;
}
