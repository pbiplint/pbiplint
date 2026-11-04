import type { Page, Report, Visual } from "../pbir/types.js";
import {
  backgroundOf,
  lookup,
  stylePresetOf,
  type ColourSource,
  type Lookup,
  type Own,
  type StackLayer,
} from "./cascade.js";
import { contrastRatio, over, type Rgba } from "./colour.js";
import {
  elementsFor,
  textClass,
  type ElementKind,
  type ElementSpec,
  type Fallback,
} from "./elements.js";
import {
  namedColour,
  readColour,
  readLiteralBool,
  readLiteralNumber,
  type ColourRead,
  type NotKnown,
  type ThemeSetting,
} from "./read.js";
import { isBold, pointSize, requiredRatio } from "./size.js";

/** Why a text element was not measured (spec section 5.4), beside the reasons a colour is not known. */
export type SkipReason =
  NotKnown | "image" | "overlap" | "on-data" | "size-unknown" | "default-not-known";

/** Where a text colour came from: the setting, and the theme line behind a theme reference. */
export interface ColourAt {
  source: ColourSource;
  file?: string;
  pointer: string;
  from?: ThemeSetting;
}

export interface Measured {
  page: Page;
  visual: Visual;
  kind: ElementKind;
  object: string;
  state?: string;
  field?: string;
  foreground: Rgba;
  background: Rgba;
  ratio: number;
  required: 4.5 | 3;
  fontSize?: number;
  bold: boolean;
  foregroundAt: ColourAt;
  backgroundAt: StackLayer[];
}

export interface Skipped {
  page: Page;
  visual: Visual;
  kind: ElementKind;
  why: SkipReason;
}

export interface Measurement {
  measured: Measured[];
  skipped: Skipped[];
}

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);
const member = (v: unknown, key: string): unknown =>
  isRecord(v) && Object.hasOwn(v, key) ? v[key] : undefined;

/** The property that turns an element on, for the elements that can be turned off. */
/**
 * The elements Power BI Desktop shows when nothing sets their `show`, as the first Desktop check
 * saw (spec section 10): a classic card's category label, a chart's axis labels, a slicer's header.
 * Any other element whose `show` nothing sets is not measured, since the files do not say it is there.
 */
const SHOWN_BY_DEFAULT: ReadonlySet<ElementKind> = new Set([
  "cardLabel",
  "axisLabels",
  "slicerHeader",
]);

function toggleOf(spec: ElementSpec): string | undefined {
  if (spec.kind === "axisTitles") return "showAxisTitle";
  const always: readonly ElementKind[] = [
    "cardValue",
    "multiRowCard",
    "kpi",
    "tableHeaders",
    "tableValues",
    "tableTotals",
    "slicerItems",
    "textBox",
  ];
  return always.includes(spec.kind) ? undefined : "show";
}

/** Label positions that put a chart's data label off the data, by the theme schema's labelPosition values. */
const OFF_THE_DATA: ReadonlySet<string> = new Set(["OutsideEnd", "Above", "Under"]);

/** A visual's box on the page: Desktop writes a grouped visual's x and y relative to its group. */
function boxOf(page: Page, visual: Visual): { x: number; y: number; w: number; h: number } {
  let { x, y } = visual.position;
  const seen = new Set<Visual>([visual]);
  for (let id = visual.groupId; id !== undefined;) {
    const group = page.visuals.find((v) => v.id === id && v.isGroup);
    if (!group || seen.has(group)) break;
    seen.add(group);
    x += group.position.x;
    y += group.position.y;
    id = group.groupId;
  }
  return { x, y, w: visual.position.width, h: visual.position.height };
}

/** Whether a visual, or any group around it, is hidden. */
function hidden(page: Page, visual: Visual): boolean {
  const seen = new Set<Visual>();
  for (
    let v: Visual | undefined = visual;
    v && !seen.has(v);
    v = page.visuals.find((g) => g.id === v!.groupId && g.isGroup)
  ) {
    if (v.isHidden) return true;
    seen.add(v);
  }
  return false;
}

/** Whether another visible visual with a lower z on the page overlaps this one's box, groups not counted. */
function overlapsBelow(page: Page, visual: Visual): boolean {
  const a = boxOf(page, visual);
  return page.visuals.some((other) => {
    if (
      other === visual ||
      other.isGroup ||
      hidden(page, other) ||
      other.position.z >= visual.position.z
    )
      return false;
    const b = boxOf(page, other);
    return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
  });
}

/** Whether an image is set in a background array: a visual's, a page's, or the wallpaper. */
const hasImage = (entries: unknown): boolean =>
  Array.isArray(entries) &&
  entries.some((e) => member(member(e, "properties"), "image") !== undefined);

/** A colour from an element's fallback, when nothing sets it. */
function fromFallback(
  fallback: Fallback,
  themes: Report["themes"],
): { colour: ColourRead; size?: number } | undefined {
  if (fallback === "not-known") return undefined;
  if ("textClass" in fallback) return textClass(fallback.textClass, themes);
  return { colour: namedColour(fallback.named, themes) };
}

/** The states an element's own entries set, beside the default; a disabled one is not measured. */
function statesOf(entries: unknown): string[] {
  const states = new Set<string>(["default"]);
  if (Array.isArray(entries))
    for (const e of entries) {
      const id = member(member(e, "selector"), "id");
      if (typeof id === "string" && id !== "disabled") states.add(id);
    }
  return [...states];
}

/** The fields an element's own entries set a colour for, by their metadata selectors. */
function fieldsOf(entries: unknown, property: string): { field: string; index: number }[] {
  if (!Array.isArray(entries)) return [];
  return entries.flatMap((e, index) => {
    const field = member(member(e, "selector"), "metadata");
    return typeof field === "string" && member(member(e, "properties"), property) !== undefined
      ? [{ field, index }]
      : [];
  });
}

interface Context {
  report: Report;
  page: Page;
  visual: Visual;
  preset?: string;
  out: Measurement;
}

/** Finishes one pair: the background stack, the skips that need it, then the ratio and threshold. */
function finish(
  ctx: Context,
  kind: ElementKind,
  object: string,
  foreground: { colour: Rgba; at: ColourAt },
  text: { fontSize?: number; bold: boolean; state?: string; field?: string },
  element?: StackLayer,
  onData = false,
): void {
  const { report, page, visual, out } = ctx;
  const skip = (why: SkipReason): void => void out.skipped.push({ page, visual, kind, why });
  const back = backgroundOf(report, page, visual, element);
  if (!back.known) return skip(back.why);
  if (onData && back.opaqueAt !== "element") return skip("on-data");
  // An image in a layer the stack reached: the visual's own, the page's, or the wallpaper.
  const vco = member(member(visual.json, "visual"), "visualContainerObjects");
  const pageObjects = member(page.json, "objects");
  if (back.opaqueAt !== "element" && hasImage(member(vco, "background"))) return skip("image");
  if (
    (back.opaqueAt === "page" || back.opaqueAt === "wallpaper") &&
    hasImage(member(pageObjects, "background"))
  )
    return skip("image");
  if (back.opaqueAt === "wallpaper" && hasImage(member(pageObjects, "outspace")))
    return skip("image");
  // Something else may show through when the visual's own layers and groups are not opaque.
  if ((back.opaqueAt === "page" || back.opaqueAt === "wallpaper") && overlapsBelow(page, visual))
    return skip("overlap");
  const fg = over(foreground.colour, back.colour);
  const whole: Rgba = { r: Math.round(fg.r), g: Math.round(fg.g), b: Math.round(fg.b), a: 1 };
  const ratio = contrastRatio(whole, back.colour);
  let required = requiredRatio(text.fontSize, text.bold);
  if (required === undefined) {
    // Under 3:1 fails at any size; from 3:1 up to 4.5:1 it depends on a size the files do not give.
    if (ratio >= 3 && ratio < 4.5) return skip("size-unknown");
    required = 4.5;
  }
  out.measured.push({
    page,
    visual,
    kind,
    object,
    ...(text.state && text.state !== "default" ? { state: text.state } : {}),
    ...(text.field ? { field: text.field } : {}),
    foreground: whole,
    background: back.colour,
    ratio,
    required,
    ...(text.fontSize !== undefined ? { fontSize: text.fontSize } : {}),
    bold: text.bold,
    foregroundAt: foreground.at,
    backgroundAt: back.layers,
  });
}

/** A colour read through the cascade, then the element's fallback; undefined when skipped. */
function colourOf(
  ctx: Context,
  spec: ElementSpec,
  found: Lookup,
  skip: (why: SkipReason) => void,
): { colour: Rgba; at: ColourAt; size?: number } | undefined {
  const themes = ctx.report.themes;
  if (found.found) {
    const read = readColour(found.value, themes);
    if (!read.known) return void skip(read.why);
    const at: ColourAt = {
      source: found.source,
      ...(found.file ? { file: found.file } : {}),
      pointer: found.pointer,
      ...(read.from ? { from: read.from } : {}),
    };
    return { colour: read.colour, at };
  }
  if (found.why === "theme-not-read") return void skip("theme-not-read");
  const fallback = fromFallback(spec.fallback, themes);
  if (!fallback) return void skip("default-not-known");
  if (!fallback.colour.known) return void skip(fallback.colour.why);
  const from = fallback.colour.from!;
  return {
    colour: fallback.colour.colour,
    at: { source: from.layer, file: from.file, pointer: from.pointer, from },
    ...(fallback.size !== undefined ? { size: fallback.size } : {}),
  };
}

/** The element's own background, as a layer of the stack, or undefined when it paints nothing. */
function ownBackground(
  ctx: Context,
  spec: ElementSpec,
  own: Own,
  colourProp: string,
  state: string,
): StackLayer | "not-known" | undefined {
  const bg = spec.background;
  if (!bg) return undefined;
  const ask = (property: string): Lookup =>
    lookup({
      themes: ctx.report.themes,
      own: {
        ...own,
        entries: ownEntries(ctx.visual, spec.container, bg.object),
        pointer: ownPointer(spec.container, bg.object),
      },
      visualType: ctx.visual.type,
      ...(ctx.preset ? { preset: ctx.preset } : {}),
      object: bg.object,
      property,
      state,
    });
  if (bg.show) {
    const on = ask(bg.show);
    if (!on.found || readLiteralBool(on.value) !== true)
      return on.found || on.why === "not-set" ? undefined : "not-known";
  }
  const set = ask(colourProp);
  let read: ColourRead;
  let at: Pick<StackLayer, "source" | "file" | "pointer">;
  if (set.found) {
    read = readColour(set.value, ctx.report.themes);
    at = { source: set.source, ...(set.file ? { file: set.file } : {}), pointer: set.pointer };
  } else if (
    set.why === "not-set" &&
    bg.fallback &&
    bg.fallback !== "not-known" &&
    "named" in bg.fallback
  ) {
    read = namedColour(bg.fallback.named, ctx.report.themes);
    if (!read.known) return "not-known";
    at = { source: read.from!.layer, file: read.from!.file, pointer: read.from!.pointer };
  } else return set.found || set.why === "not-set" ? undefined : "not-known";
  if (!read.known) return "not-known";
  let transparency = 0;
  if (bg.transparency) {
    const t = ask(bg.transparency);
    if (t.found) transparency = readLiteralNumber(t.value) ?? 0;
  }
  const alpha = Math.round(read.colour.a * (1 - transparency / 100) * 255) / 255;
  return { colour: { ...read.colour, a: alpha }, ...at };
}

const ownEntries = (visual: Visual, container: boolean, object: string): unknown =>
  member(
    member(member(visual.json, "visual"), container ? "visualContainerObjects" : "objects"),
    object,
  );
const ownPointer = (container: boolean, object: string): string =>
  `/visual/${container ? "visualContainerObjects" : "objects"}/${object}`;

function measureElement(ctx: Context, spec: ElementSpec): void {
  const { report, page, visual, out } = ctx;
  const themes = report.themes;
  const skip = (why: SkipReason): void =>
    void out.skipped.push({ page, visual, kind: spec.kind, why });
  const own: Own = {
    entries: ownEntries(visual, spec.container, spec.object),
    source: "visual",
    file: visual.file,
    pointer: ownPointer(spec.container, spec.object),
  };
  const ask = (property: string, state = "default"): Lookup =>
    lookup({
      themes,
      own,
      visualType: visual.type,
      ...(ctx.preset ? { preset: ctx.preset } : {}),
      object: spec.object,
      property,
      state,
    });
  const toggle = toggleOf(spec);
  if (toggle) {
    const on = ask(toggle);
    if (!on.found && on.why === "theme-not-read") return skip("theme-not-read");
    const shown = on.found ? readLiteralBool(on.value) === true : SHOWN_BY_DEFAULT.has(spec.kind);
    if (!shown) return;
  }
  let onData = false;
  if (spec.kind === "dataLabels") {
    const position = ask("labelPosition");
    onData = !(
      position.found &&
      OFF_THE_DATA.has(
        String(
          readLiteralNumber(position.value) ??
            (typeof position.value === "string" ? position.value : literalText(position.value)),
        ),
      )
    );
  }
  const sizeAt = ask(spec.size);
  const boldAt = spec.bold ? ask(spec.bold) : undefined;
  const familyAt = ask("fontFamily");
  const bold = isBold({
    bold: boldAt?.found ? boldAt.value : undefined,
    fontFamily: familyAt.found ? familyAt.value : undefined,
  });
  for (const state of statesOf(own.entries)) {
    // The first colour property is the element's; the others (a table's banded rows) only when set.
    spec.colour.forEach((property, i) => {
      const found = ask(property, state);
      if (i > 0 && !found.found) return;
      const fg = colourOf(ctx, spec, found, skip);
      if (!fg) return;
      const fontSize = (sizeAt.found ? pointSize(sizeAt.value) : undefined) ?? fg.size;
      const bgProp = spec.background?.colour[Math.min(i, spec.background.colour.length - 1)];
      const element = bgProp ? ownBackground(ctx, spec, own, bgProp, state) : undefined;
      if (element === "not-known") return skip("not-set");
      finish(
        ctx,
        spec.kind,
        spec.object,
        fg,
        { ...(fontSize !== undefined ? { fontSize } : {}), bold, state },
        element,
        onData,
      );
    });
  }
  // Each field's own colour, from a metadata selector, is an instance of its own.
  for (const property of spec.colour)
    for (const { field, index } of fieldsOf(own.entries, property)) {
      const entries = own.entries as Record<string, unknown>[];
      const value = member(entries[index]!.properties, property);
      const pointer = `${own.pointer}/${index}/properties/${property}`;
      const fg = colourOf(
        ctx,
        spec,
        { found: true, value, source: "visual", file: visual.file, pointer },
        skip,
      );
      if (!fg) continue;
      const fontSize = sizeAt.found ? pointSize(sizeAt.value) : undefined;
      finish(
        ctx,
        spec.kind,
        spec.object,
        fg,
        { ...(fontSize !== undefined ? { fontSize } : {}), bold, field },
        undefined,
        onData,
      );
    }
}

function literalText(v: unknown): string {
  const value = member(member(member(v, "expr"), "Literal"), "Value");
  return typeof value === "string" ? value.replace(/^'|'$/g, "") : "";
}

/** A text box's runs, each an instance: its own colour, else the theme's label text class. */
function measureTextBox(ctx: Context, spec: ElementSpec): void {
  const { report, page, visual, out } = ctx;
  const general = member(member(member(visual.json, "visual"), "objects"), "general");
  const paragraphs = member(
    member(Array.isArray(general) ? general[0] : undefined, "properties"),
    "paragraphs",
  );
  if (!Array.isArray(paragraphs)) return;
  const skip = (why: SkipReason): void =>
    void out.skipped.push({ page, visual, kind: "textBox", why });
  paragraphs.forEach((paragraph, p) => {
    const runs = member(paragraph, "textRuns");
    if (!Array.isArray(runs)) return;
    runs.forEach((run, r) => {
      const value = member(run, "value");
      if (typeof value !== "string" || value.trim() === "") return;
      const style = member(run, "textStyle");
      const pointer = `/visual/objects/general/0/properties/paragraphs/${p}/textRuns/${r}/textStyle/color`;
      const colour = member(style, "color");
      const found: Lookup =
        colour === undefined
          ? { found: false, why: "not-set" }
          : { found: true, value: colour, source: "visual", file: visual.file, pointer };
      const fg = colourOf(ctx, spec, found, skip);
      if (!fg) return;
      const fontSize = pointSize(member(style, "fontSize")) ?? fg.size;
      const bold = isBold({
        fontWeight: member(style, "fontWeight"),
        fontFamily: member(style, "fontFamily"),
      });
      finish(ctx, "textBox", "general", fg, {
        ...(fontSize !== undefined ? { fontSize } : {}),
        bold,
      });
    });
  });
  void report;
}

/**
 * Every text element of every visible visual the report's files describe, each instance and state
 * of it measured against what sits behind it, or skipped with the reason (spec sections 5 and 6).
 * Hidden and tooltip pages are measured, since readers reach them; hidden visuals and turned-off
 * elements are not, and are not counted.
 */
export function measureReport(report: Report): Measurement {
  const out: Measurement = { measured: [], skipped: [] };
  for (const page of report.pages)
    for (const visual of page.visuals) {
      if (visual.isGroup || hidden(page, visual)) continue;
      const preset = stylePresetOf(visual.json);
      const ctx: Context = {
        report,
        page,
        visual,
        ...(preset !== undefined ? { preset } : {}),
        out,
      };
      for (const spec of elementsFor(visual.type)) {
        if (spec.kind === "textBox") measureTextBox(ctx, spec);
        else measureElement(ctx, spec);
      }
    }
  return out;
}
