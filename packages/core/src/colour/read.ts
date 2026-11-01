import { literal } from "../pbir/build.js";
import type { Report, ThemeFile } from "../pbir/types.js";
import { parseHex, type Rgba } from "./colour.js";

/**
 * Why a colour cannot be known from the project's files, so nothing is said about it: it depends on
 * the data; it has a Percent, whose formula Microsoft does not document; a theme it depends on was
 * not read; a report file it depends on was not read; nothing sets it; or it is written in a form
 * this does not read.
 */
export type NotKnown =
  "data-dependent" | "percent" | "theme-not-read" | "file-not-read" | "not-set" | "other-form";

/** The line of a theme file that supplied a colour. */
export interface ThemeSetting {
  file: string;
  pointer: string;
  layer: "customTheme" | "baseTheme";
}

export type ColourRead =
  { known: true; colour: Rgba; from?: ThemeSetting } | { known: false; why: NotKnown };

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

const notKnown = (why: NotKnown): ColourRead => ({ known: false, why });

/**
 * The custom theme, then the base theme, as Learn says the one layers on the other. `look` answers
 * for one theme's JSON: a colour, or undefined when that theme does not set it. A theme that is
 * named but not read stops the walk, since it may set what a later layer would otherwise answer.
 */
function fromThemes(
  themes: Report["themes"],
  look: (
    json: Record<string, unknown>,
    theme: ThemeFile,
    layer: ThemeSetting["layer"],
  ) => ColourRead | undefined,
): ColourRead {
  const layers = [
    [themes.custom, "customTheme"],
    [themes.base, "baseTheme"],
  ] as const;
  for (const [theme, layer] of layers) {
    if (!theme) continue;
    if (theme.state !== "read" || !theme.json) return notKnown("theme-not-read");
    const answer = look(theme.json, theme, layer);
    if (answer) return answer;
  }
  return notKnown("not-set");
}

/** A value a theme holds for a colour: a hex string, never a reference to another name. */
function themeValue(
  value: unknown,
  theme: ThemeFile,
  pointer: string,
  layer: ThemeSetting["layer"],
): ColourRead {
  const colour = typeof value === "string" ? parseHex(value) : undefined;
  if (!colour) return notKnown("other-form");
  return { known: true, colour, from: { file: theme.file!, pointer, layer } };
}

/** A theme's own colour by name: `foreground`, `foregroundNeutralSecondary`, and the rest. */
export const namedColour = (name: string, themes: Report["themes"]): ColourRead =>
  fromThemes(themes, (json, theme, layer) =>
    Object.hasOwn(json, name) ? themeValue(json[name], theme, `/${name}`, layer) : undefined,
  );

/**
 * `ThemeDataColor`. The ColorId mapping is inferred from real files: 0 is the theme's background, 1
 * its foreground, n from 2 the theme's `dataColors[n - 2]`. A theme's `dataColors` is one list, so
 * an id past the end of a custom theme's list is not looked up in the base's.
 */
function themeDataColour(ref: Record<string, unknown>, themes: Report["themes"]): ColourRead {
  const percent = ref.Percent ?? 0;
  if (percent !== 0) return notKnown("percent");
  const id = ref.ColorId;
  if (typeof id !== "number" || !Number.isInteger(id) || id < 0) return notKnown("other-form");
  if (id === 0) return namedColour("background", themes);
  if (id === 1) return namedColour("foreground", themes);
  return fromThemes(themes, (json, theme, layer) => {
    if (!Array.isArray(json.dataColors)) return undefined;
    const at = id - 2;
    return at < json.dataColors.length
      ? themeValue(json.dataColors[at], theme, `/dataColors/${at}`, layer)
      : notKnown("not-set");
  });
}

/**
 * A colour as a report writes it: `{solid: {color: ...}}` or, in a text run or a text class, the
 * plain string, the colour being a hex string, in a theme a theme colour's name, or an expression.
 * In visual.json a hex is a quoted literal. Any other expression (FillRule, Conditional, Measure,
 * Aggregation) depends on the data.
 */
export function readColour(value: unknown, themes: Report["themes"]): ColourRead {
  const written = isRecord(value) && isRecord(value.solid) ? value.solid.color : value;
  if (typeof written === "string") {
    const colour = parseHex(written);
    if (colour) return { known: true, colour };
    return written.startsWith("#") ? notKnown("other-form") : namedColour(written, themes);
  }
  if (!isRecord(written) || !isRecord(written.expr)) return notKnown("other-form");
  const { expr } = written;
  if (isRecord(expr.ThemeDataColor)) return themeDataColour(expr.ThemeDataColor, themes);
  if (!("Literal" in expr)) return notKnown("data-dependent");
  const colour = parseHex(literal(written) ?? "");
  return colour ? { known: true, colour } : notKnown("other-form");
}

/**
 * A number as a report writes it: a literal in visual.json (`50D`, `50L`, `50`), a plain number in
 * a theme file. Undefined for a string or anything bound to an expression.
 */
export function readLiteralNumber(value: unknown): number | undefined {
  if (typeof value === "number") return value;
  const text = literal(value);
  return text !== undefined && /^-?\d+(\.\d+)?[DLM]?$/.test(text) && !isQuoted(value)
    ? Number.parseFloat(text)
    : undefined;
}

/** Whether a literal is written as a quoted string, which is text whatever it holds. */
const isQuoted = (value: unknown): boolean =>
  isRecord(value) &&
  isRecord(value.expr) &&
  isRecord(value.expr.Literal) &&
  String(value.expr.Literal.Value).startsWith("'");

/** A boolean as a report writes it: a literal in visual.json, a plain boolean in a theme file. */
export function readLiteralBool(value: unknown): boolean | undefined {
  if (typeof value === "boolean") return value;
  const text = literal(value);
  return text === "true" ? true : text === "false" ? false : undefined;
}
