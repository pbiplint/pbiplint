import { literal } from "../pbir/build.js";
import { escapePointer } from "../pbir/json.js";
import type { Report } from "../pbir/types.js";

export type ColourSource = "visual" | "group" | "page" | "customTheme" | "baseTheme";

/** A formatting object's own array: `visual.visualContainerObjects.title`, say. */
export interface Own {
  entries: unknown;
  source: ColourSource;
  file: string;
  pointer: string;
}

/** One property of one formatting object, on one visual type. */
export interface Query {
  themes: Report["themes"];
  own?: Own;
  /** A key of the theme's `visualStyles`. */
  visualType: string;
  preset?: string;
  object: string;
  property: string;
  /** Which state's setting: `hover`, `selected`. The default state's when not given. */
  state?: string;
  /**
   * Whether the theme's every-visual card, `visualStyles["*"]["*"]`, applies. True by default; a
   * page and a group are not visuals, and it would give them a visual's background.
   */
  wildcard?: boolean;
}

export type Lookup =
  | { found: true; value: unknown; source: ColourSource; file?: string; pointer: string }
  | { found: false; why: "theme-not-read" | "not-set" };

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

const member = (v: unknown, key: string): unknown =>
  isRecord(v) && Object.hasOwn(v, key) ? v[key] : undefined;

/** Which entry of an array answers for the state: its own, else the default's; the last of either. */
function entryFor(
  entries: unknown,
  state: string,
  props: (entry: Record<string, unknown>) => unknown,
  id: (entry: Record<string, unknown>) => string | undefined,
  property: string,
): number | undefined {
  if (!Array.isArray(entries)) return undefined;
  let exact: number | undefined;
  let fallback: number | undefined;
  entries.forEach((entry, i) => {
    if (!isRecord(entry) || member(props(entry), property) === undefined) return;
    const at = id(entry) ?? "default";
    if (at === state) exact = i;
    if (at === "default") fallback = i;
  });
  return exact ?? fallback;
}

/** A visual.json entry's state. One for a field or a data point answers for no state of the element. */
function ownState(entry: Record<string, unknown>): string | undefined {
  const selector = entry.selector;
  if (!isRecord(selector)) return undefined;
  if ("metadata" in selector || "data" in selector) return "(one instance)";
  return typeof selector.id === "string" ? selector.id : undefined;
}

/**
 * The cards of one theme that could set the property, most specific first (inferred from real
 * files; the Desktop check confirms it): the visual type's named preset, then its `*`, then every
 * visual's, and in each the named object over the `*` object.
 */
function cardsOf(q: Query): [string, string, string][] {
  const { visualType: type, preset, object } = q;
  return [
    ...(preset !== undefined && preset !== "*"
      ? ([
          [type, preset, object],
          [type, preset, "*"],
        ] as [string, string, string][])
      : []),
    [type, "*", object],
    [type, "*", "*"],
    ...(q.wildcard === false
      ? []
      : ([
          ["*", "*", object],
          ["*", "*", "*"],
        ] as [string, string, string][])),
  ];
}

/**
 * The setting for a formatting property, from the most specific place to the least: the visual's
 * own, the custom theme's, the base theme's ([Use report themes](https://learn.microsoft.com/en-us/power-bi/create-reports/desktop-report-themes#understand-how-the-report-uses-themes)).
 * A theme that is named but not read stops the walk: it may set what a later layer would answer.
 */
export function lookup(q: Query): Lookup {
  const state = q.state ?? "default";
  if (q.own) {
    const i = entryFor(q.own.entries, state, (e) => e.properties, ownState, q.property);
    if (i !== undefined) {
      const entry = (q.own.entries as Record<string, unknown>[])[i]!;
      return {
        found: true,
        value: member(entry.properties, q.property),
        source: q.own.source,
        file: q.own.file,
        pointer: `${q.own.pointer}/${i}/properties/${escapePointer(q.property)}`,
      };
    }
  }
  const layers = [
    [q.themes.custom, "customTheme"],
    [q.themes.base, "baseTheme"],
  ] as const;
  for (const [theme, source] of layers) {
    if (!theme) continue;
    if (theme.state !== "read" || !theme.json) return { found: false, why: "theme-not-read" };
    const styles = theme.json.visualStyles;
    for (const [type, preset, object] of cardsOf(q)) {
      const entries = member(member(member(styles, type), preset), object);
      const i = entryFor(
        entries,
        state,
        (e) => e,
        (e) => (typeof e.$id === "string" ? e.$id : undefined),
        q.property,
      );
      if (i === undefined) continue;
      const pointer = ["visualStyles", type, preset, object, String(i), q.property]
        .map(escapePointer)
        .join("/");
      return {
        found: true,
        value: member((entries as unknown[])[i], q.property),
        source,
        file: theme.file!,
        pointer: `/${pointer}`,
      };
    }
  }
  return { found: false, why: "not-set" };
}

/** The style preset a visual's visual.json names, which selects the theme's card of that name. */
export function stylePresetOf(visualJson: unknown): string | undefined {
  const objects = member(member(visualJson, "visual"), "visualContainerObjects");
  const presets = member(objects, "stylePreset");
  if (!Array.isArray(presets)) return undefined;
  return literal(member(member(presets[0], "properties"), "name"));
}
