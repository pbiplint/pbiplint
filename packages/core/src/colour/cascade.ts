import { literal } from "../pbir/build.js";
import { escapePointer } from "../pbir/json.js";
import type { Page, Report, Visual } from "../pbir/types.js";
import { over, type Rgba } from "./colour.js";
import {
  namedColour,
  readColour,
  readLiteralBool,
  readLiteralNumber,
  type ColourRead,
  type NotKnown,
} from "./read.js";

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

/** One colour in the stack behind some text: its alpha counts the layer's transparency. */
export interface StackLayer {
  colour: Rgba;
  source: ColourSource;
  file?: string;
  pointer: string;
}

/** Which layer of the stack is opaque, so nothing behind it shows. */
export type OpaqueAt = "element" | "visual" | "group" | "page" | "wallpaper";

export type Background =
  | { known: true; colour: Rgba; layers: StackLayer[]; opaqueAt: OpaqueAt }
  | { known: false; why: NotKnown };

/** Where one layer's settings are, and how much of the theme applies to it. */
interface LayerPlace {
  kind: OpaqueAt;
  own: Own;
  visualType: string;
  preset?: string;
  object: string;
  wildcard: boolean;
  /** Whether it has a `show` that must say so: a visual's. Others are on unless they say off. */
  showRequired?: boolean;
  /** The theme colour a layer that is on, with no colour set, takes. */
  defaultColour?: string;
}

/** A layer as a stack, painted back to front, meets it: no paint, a colour, or not known. */
type LayerRead = "none" | StackLayer | { why: NotKnown };

function readLayer(themes: Report["themes"], place: LayerPlace): LayerRead {
  const ask = (property: string): Lookup => lookup({ ...place, themes, property });
  const show = ask("show");
  if (show.found) {
    const on = readLiteralBool(show.value);
    if (on === undefined) return { why: "other-form" };
    if (!on) return "none";
  } else if (show.why === "theme-not-read" || place.showRequired) return { why: show.why };

  const clear = ask("transparency");
  let transparency = 0;
  if (clear.found) {
    const t = readLiteralNumber(clear.value);
    if (t === undefined || t < 0 || t > 100) return { why: "other-form" };
    if (t === 100) return "none";
    transparency = t;
  } else if (clear.why === "theme-not-read") return { why: clear.why };

  const set = ask("color");
  let read: ColourRead;
  let at: Pick<StackLayer, "source" | "file" | "pointer"> | undefined;
  if (set.found) {
    read = readColour(set.value, themes);
    at = { source: set.source, ...(set.file ? { file: set.file } : {}), pointer: set.pointer };
  } else if (set.why === "theme-not-read") {
    return { why: set.why };
  } else if (place.defaultColour !== undefined) {
    read = namedColour(place.defaultColour, themes);
  } else {
    // Nothing paints this layer, unless it says how see-through a colour it does not name is.
    return clear.found ? { why: "not-set" } : "none";
  }
  if (!read.known) return { why: read.why };
  const { colour, from } = read;
  const where = at ?? {
    source: from!.layer,
    file: from!.file,
    pointer: from!.pointer,
  };
  return { colour: { ...colour, a: colour.a * (1 - transparency / 100) }, ...where };
}

/** The groups around a visual, innermost first. */
function groupsOf(page: Page, visual: Visual): Visual[] {
  const groups: Visual[] = [];
  for (let id = visual.groupId; id !== undefined;) {
    const group = page.visuals.find((v) => v.id === id && v.isGroup);
    if (!group || groups.includes(group)) break;
    groups.push(group);
    id = group.groupId;
  }
  return groups;
}

/**
 * What sits behind a visual's text, from the top of the stack down: the element's own background,
 * the visual's, each group's from the innermost out, the page's, and the wallpaper. The walk stops
 * at the first opaque layer, so what is under it needs no knowing, and the layers combine by
 * source-over blending (alpha = 1 - transparency / 100). The result is rounded to whole channels,
 * once, so a ratio worked out from the hex a finding shows is the ratio it reports.
 */
export function backgroundOf(
  report: Report,
  page: Page,
  visual: Visual,
  element?: StackLayer,
): Background {
  const objectsOf = (json: unknown, way: string[]): unknown =>
    way.reduce<unknown>((at, key) => member(at, key), json);
  const places: LayerPlace[] = [
    {
      kind: "visual",
      own: {
        entries: objectsOf(visual.json, ["visual", "visualContainerObjects", "background"]),
        source: "visual",
        file: visual.file,
        pointer: "/visual/visualContainerObjects/background",
      },
      visualType: visual.type,
      ...(stylePresetOf(visual.json) !== undefined ? { preset: stylePresetOf(visual.json)! } : {}),
      object: "background",
      wildcard: true,
      showRequired: true,
      defaultColour: "background",
    },
    ...groupsOf(page, visual).map((group): LayerPlace => ({
      kind: "group",
      own: {
        entries: objectsOf(group.json, ["visualGroup", "objects", "background"]),
        source: "group",
        file: group.file,
        pointer: "/visualGroup/objects/background",
      },
      visualType: "group",
      object: "background",
      wildcard: false,
    })),
    ...(["background", "outspace"] as const).map((object): LayerPlace => ({
      kind: object === "background" ? "page" : "wallpaper",
      own: {
        entries: objectsOf(page.json, ["objects", object]),
        source: "page",
        file: page.file,
        pointer: `/objects/${object}`,
      },
      visualType: "page",
      object,
      wildcard: false,
    })),
  ];
  const layers: StackLayer[] = [];
  const stack = (layer: StackLayer, kind: OpaqueAt): Background | undefined => {
    if (layer.colour.a === 0) return undefined;
    layers.push(layer);
    if (layer.colour.a < 1) return undefined;
    const blended = layers.reduceRight<Rgba | undefined>(
      (behind, { colour }) => (behind ? over(colour, behind) : colour),
      undefined,
    )!;
    const whole = (v: number): number => Math.round(v);
    return {
      known: true,
      colour: { r: whole(blended.r), g: whole(blended.g), b: whole(blended.b), a: 1 },
      layers,
      opaqueAt: kind,
    };
  };
  if (element) {
    const done = stack(element, "element");
    if (done) return done;
  }
  for (const place of places) {
    const layer = readLayer(report.themes, place);
    if (layer === "none") continue;
    if ("why" in layer) return { known: false, why: layer.why };
    const done = stack(layer, place.kind);
    if (done) return done;
  }
  return { known: false, why: "not-set" };
}

/** The style preset a visual's visual.json names, which selects the theme's card of that name. */
export function stylePresetOf(visualJson: unknown): string | undefined {
  const objects = member(member(visualJson, "visual"), "visualContainerObjects");
  const presets = member(objects, "stylePreset");
  if (!Array.isArray(presets)) return undefined;
  return literal(member(member(presets[0], "properties"), "name"));
}
