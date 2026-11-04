import type { Report } from "../pbir/types.js";
import { fromThemes, themeValue, type ColourRead } from "./read.js";

/** The kinds of text the rule measures (spec section 6), each one setting an author changes. */
export type ElementKind =
  | "title"
  | "subtitle"
  | "dataLabels"
  | "axisLabels"
  | "axisTitles"
  | "legend"
  | "cardValue"
  | "cardLabel"
  | "newCard"
  | "multiRowCard"
  | "kpi"
  | "tableHeaders"
  | "tableValues"
  | "tableTotals"
  | "slicerHeader"
  | "slicerItems"
  | "buttonSlicer"
  | "textBox"
  | "buttonText";

/**
 * Where an element's colour comes from when nothing sets it: a theme text class, a theme colour
 * by name, a list of those tried in order (a text class no theme sets falls to the next), or not
 * known. Each known one is what a Desktop check showed (spec section 10); every
 * other is not known, so what depends on it is skipped and counted, never guessed.
 */
export type FallbackStep = { textClass: string } | { named: string };
export type Fallback = FallbackStep | readonly FallbackStep[] | "not-known";

/** An element's own background, painted between the text and the visual's background. */
export interface OwnBackground {
  object: string;
  /** Each a colour property; a banded table's two are measured as two instances. */
  colour: readonly string[];
  transparency?: string;
  /** The property that turns it on, where it has one. */
  show?: string;
  /** Whether it is on when nothing sets that property, as a Desktop check showed. */
  defaultOn?: boolean;
  fallback?: Fallback;
}

export interface ElementSpec {
  kind: ElementKind;
  /** The visual types it applies to; "*" for every visual. */
  visualTypes: readonly string[] | "*";
  /** In `visual.visualContainerObjects` (title, subtitle) rather than `visual.objects`. */
  container: boolean;
  object: string;
  /** Its colour properties, each an instance of the element. */
  colour: readonly string[];
  size: string;
  bold?: string;
  background?: OwnBackground;
  fallback: Fallback;
}

const TABLES = ["tableEx", "pivotTable"] as const;
const CHARTS = "*charts*";

/**
 * Each text element, its properties as Microsoft's report theme schema (2.159) names them for each
 * visual type's `visualStyles` card, and its default. Charts are every visual type with a
 * `legend`, `labels`, or axis object; `elementsFor` reads CHARTS so.
 */
export const ELEMENTS: readonly ElementSpec[] = [
  {
    kind: "title",
    visualTypes: "*",
    container: true,
    object: "title",
    colour: ["fontColor"],
    size: "fontSize",
    bold: "bold",
    background: { object: "title", colour: ["background"] },
    fallback: [{ textClass: "largeTitle" }, { textClass: "title" }],
  },
  {
    kind: "subtitle",
    visualTypes: "*",
    container: true,
    object: "subTitle",
    colour: ["fontColor"],
    size: "fontSize",
    bold: "bold",
    fallback: { textClass: "lightLabel" },
  },
  {
    kind: "dataLabels",
    visualTypes: [CHARTS],
    container: false,
    object: "labels",
    colour: ["color"],
    size: "fontSize",
    bold: "bold",
    background: {
      object: "labels",
      colour: ["backgroundColor"],
      transparency: "backgroundTransparency",
      show: "enableBackground",
    },
    fallback: { named: "foregroundNeutralSecondary" },
  },
  {
    kind: "axisLabels",
    visualTypes: [CHARTS],
    container: false,
    object: "categoryAxis",
    colour: ["labelColor"],
    size: "fontSize",
    bold: "bold",
    fallback: [{ textClass: "smallLightLabel" }, { named: "foregroundNeutralSecondary" }],
  },
  {
    kind: "axisLabels",
    visualTypes: [CHARTS],
    container: false,
    object: "valueAxis",
    colour: ["labelColor"],
    size: "fontSize",
    bold: "bold",
    fallback: [{ textClass: "smallLightLabel" }, { named: "foregroundNeutralSecondary" }],
  },
  {
    kind: "axisTitles",
    visualTypes: [CHARTS],
    container: false,
    object: "categoryAxis",
    colour: ["titleColor"],
    size: "titleFontSize",
    bold: "titleBold",
    fallback: { textClass: "title" },
  },
  {
    kind: "axisTitles",
    visualTypes: [CHARTS],
    container: false,
    object: "valueAxis",
    colour: ["titleColor"],
    size: "titleFontSize",
    bold: "titleBold",
    fallback: { textClass: "title" },
  },
  {
    kind: "legend",
    visualTypes: [CHARTS],
    container: false,
    object: "legend",
    colour: ["labelColor"],
    size: "fontSize",
    bold: "bold",
    fallback: { textClass: "lightLabel" },
  },
  {
    kind: "cardValue",
    visualTypes: ["card"],
    container: false,
    object: "labels",
    colour: ["color"],
    size: "fontSize",
    bold: "bold",
    fallback: { textClass: "callout" },
  },
  {
    kind: "cardLabel",
    visualTypes: ["card"],
    container: false,
    object: "categoryLabels",
    colour: ["color"],
    size: "fontSize",
    bold: "bold",
    fallback: { textClass: "largeLightLabel" },
  },
  {
    kind: "newCard",
    visualTypes: ["cardVisual"],
    container: false,
    object: "value",
    colour: ["fontColor"],
    size: "fontSize",
    bold: "bold",
    background: {
      object: "fillCustom",
      colour: ["fillColor"],
      transparency: "transparency",
      show: "show",
      defaultOn: true,
      fallback: { named: "background" },
    },
    fallback: { named: "foreground" },
  },
  {
    kind: "newCard",
    visualTypes: ["cardVisual"],
    container: false,
    object: "label",
    colour: ["fontColor"],
    size: "fontSize",
    bold: "bold",
    background: {
      object: "fillCustom",
      colour: ["fillColor"],
      transparency: "transparency",
      show: "show",
      defaultOn: true,
      fallback: { named: "background" },
    },
    fallback: { named: "foregroundNeutralSecondary" },
  },
  {
    kind: "newCard",
    visualTypes: ["cardVisual"],
    container: false,
    object: "referenceLabelTitle",
    colour: ["titleFontColor"],
    size: "titleFontSize",
    bold: "titleBold",
    background: {
      object: "referenceLabel",
      colour: ["backgroundColor"],
      transparency: "backgroundTransparency",
      show: "backgroundShow",
    },
    fallback: "not-known",
  },
  {
    kind: "newCard",
    visualTypes: ["cardVisual"],
    container: false,
    object: "referenceLabelValue",
    colour: ["valueFontColor"],
    size: "valueFontSize",
    bold: "valueBold",
    background: {
      object: "referenceLabel",
      colour: ["backgroundColor"],
      transparency: "backgroundTransparency",
      show: "backgroundShow",
    },
    fallback: "not-known",
  },
  {
    kind: "newCard",
    visualTypes: ["cardVisual"],
    container: false,
    object: "referenceLabelDetail",
    colour: ["detailFontColor"],
    size: "detailFontSize",
    bold: "detailBold",
    background: {
      object: "referenceLabel",
      colour: ["backgroundColor"],
      transparency: "backgroundTransparency",
      show: "backgroundShow",
    },
    fallback: "not-known",
  },
  {
    kind: "multiRowCard",
    visualTypes: ["multiRowCard"],
    container: false,
    object: "dataLabels",
    colour: ["color"],
    size: "fontSize",
    bold: "bold",
    fallback: "not-known",
  },
  {
    kind: "multiRowCard",
    visualTypes: ["multiRowCard"],
    container: false,
    object: "categoryLabels",
    colour: ["color"],
    size: "fontSize",
    bold: "bold",
    fallback: "not-known",
  },
  {
    kind: "multiRowCard",
    visualTypes: ["multiRowCard"],
    container: false,
    object: "cardTitle",
    colour: ["color"],
    size: "fontSize",
    bold: "bold",
    fallback: "not-known",
  },
  {
    kind: "kpi",
    visualTypes: ["kpi"],
    container: false,
    object: "indicator",
    colour: ["fontColor"],
    size: "fontSize",
    bold: "bold",
    fallback: "not-known",
  },
  {
    kind: "kpi",
    visualTypes: ["kpi"],
    container: false,
    object: "goals",
    colour: ["goalFontColor", "distanceFontColor"],
    size: "fontSize",
    bold: "bold",
    fallback: "not-known",
  },
  {
    kind: "kpi",
    visualTypes: ["kpi"],
    container: false,
    object: "lastDate",
    colour: ["lastDateFontColor"],
    size: "fontSize",
    bold: "bold",
    fallback: "not-known",
  },
  {
    kind: "tableHeaders",
    visualTypes: TABLES,
    container: false,
    object: "columnHeaders",
    colour: ["fontColor"],
    size: "fontSize",
    bold: "bold",
    background: {
      object: "columnHeaders",
      colour: ["backColor"],
      fallback: { named: "background" },
    },
    fallback: { named: "foreground" },
  },
  {
    kind: "tableHeaders",
    visualTypes: ["pivotTable"],
    container: false,
    object: "rowHeaders",
    colour: ["fontColor"],
    size: "fontSize",
    bold: "bold",
    background: { object: "rowHeaders", colour: ["backColor"], fallback: { named: "background" } },
    fallback: { named: "foreground" },
  },
  {
    kind: "tableValues",
    visualTypes: TABLES,
    container: false,
    object: "values",
    colour: ["fontColor", "fontColorPrimary", "fontColorSecondary"],
    size: "fontSize",
    bold: "bold",
    background: {
      object: "values",
      colour: ["backColor", "backColorPrimary", "backColorSecondary"],
      fallback: { named: "background" },
    },
    fallback: { named: "foreground" },
  },
  {
    kind: "tableValues",
    visualTypes: TABLES,
    container: false,
    object: "columnFormatting",
    colour: ["fontColor"],
    size: "fontSize",
    bold: "bold",
    background: {
      object: "columnFormatting",
      colour: ["backColor"],
      fallback: { named: "background" },
    },
    fallback: { named: "foreground" },
  },
  ...(["total", "subTotals", "rowTotal", "columnTotal"] as const).map((object): ElementSpec => ({
    kind: "tableTotals",
    visualTypes: object === "total" ? TABLES : ["pivotTable"],
    container: false,
    object,
    colour: ["fontColor"],
    size: "fontSize",
    bold: "bold",
    background: { object, colour: ["backColor"] },
    fallback: "not-known",
  })),
  {
    kind: "slicerHeader",
    visualTypes: ["slicer"],
    container: false,
    object: "header",
    colour: ["fontColor"],
    size: "textSize",
    bold: "bold",
    background: { object: "header", colour: ["background"] },
    fallback: { textClass: "title" },
  },
  {
    kind: "slicerItems",
    visualTypes: ["slicer"],
    container: false,
    object: "items",
    colour: ["fontColor"],
    size: "textSize",
    bold: "bold",
    background: { object: "items", colour: ["background"] },
    fallback: { named: "foreground" },
  },
  {
    kind: "buttonSlicer",
    visualTypes: ["advancedSlicerVisual"],
    container: false,
    object: "value",
    colour: ["fontColor"],
    size: "fontSize",
    bold: "bold",
    background: {
      object: "fillCustom",
      colour: ["fillColor"],
      transparency: "transparency",
      show: "show",
      defaultOn: true,
      fallback: { named: "background" },
    },
    fallback: { named: "foreground" },
  },
  {
    kind: "buttonSlicer",
    visualTypes: ["advancedSlicerVisual"],
    container: false,
    object: "label",
    colour: ["fontColor"],
    size: "fontSize",
    bold: "bold",
    background: {
      object: "fillCustom",
      colour: ["fillColor"],
      transparency: "transparency",
      show: "show",
      defaultOn: true,
      fallback: { named: "background" },
    },
    fallback: "not-known",
  },
  // A text box's runs are read by measure.ts; this row holds its default and nothing else.
  {
    kind: "textBox",
    visualTypes: ["textbox"],
    container: false,
    object: "general",
    colour: [],
    size: "fontSize",
    fallback: { textClass: "label" },
  },
  {
    kind: "buttonText",
    visualTypes: ["actionButton", "shape"],
    container: false,
    object: "text",
    colour: ["fontColor"],
    size: "fontSize",
    bold: "bold",
    background: {
      object: "fill",
      colour: ["fillColor"],
      transparency: "transparency",
      show: "show",
    },
    fallback: "not-known",
  },
];

/** The visual types whose charts carry legends, data labels, and axes. */
const CHART_TYPES: ReadonlySet<string> = new Set([
  "areaChart",
  "barChart",
  "clusteredBarChart",
  "clusteredColumnChart",
  "columnChart",
  "donutChart",
  "funnel",
  "hundredPercentStackedAreaChart",
  "hundredPercentStackedBarChart",
  "hundredPercentStackedColumnChart",
  "lineChart",
  "lineClusteredColumnComboChart",
  "lineStackedColumnComboChart",
  "pieChart",
  "ribbonChart",
  "scatterChart",
  "stackedAreaChart",
  "treemap",
  "waterfallChart",
]);

/** The elements a visual of this type carries; a custom visual's own objects are not read. */
export const elementsFor = (visualType: string): ElementSpec[] =>
  ELEMENTS.filter(
    (e) =>
      e.visualTypes === "*" ||
      e.visualTypes.includes(visualType) ||
      (e.visualTypes.includes(CHARTS) && CHART_TYPES.has(visualType)),
  );

/** A theme text class's colour, custom over base, and the size the class that answered sets. */
export function textClass(
  name: string,
  themes: Report["themes"],
): { colour: ColourRead; size?: number } {
  let size: number | undefined;
  const colour = fromThemes(themes, (json, theme, layer) => {
    const classes = json.textClasses;
    const cls =
      typeof classes === "object" && classes !== null && Object.hasOwn(classes, name)
        ? (classes as Record<string, unknown>)[name]
        : undefined;
    if (typeof cls !== "object" || cls === null || !Object.hasOwn(cls, "color")) return undefined;
    const { color, fontSize } = cls as { color: unknown; fontSize?: unknown };
    if (typeof fontSize === "number") size = fontSize;
    return themeValue(color, theme, `/textClasses/${name}/color`, layer);
  });
  return size === undefined ? { colour } : { colour, size };
}
