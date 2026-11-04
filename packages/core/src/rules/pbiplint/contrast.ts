import { toHex, truncateRatio } from "../../colour/colour.js";
import { measureReport, type Measured } from "../../colour/measure.js";
import { suggest } from "../../colour/suggest.js";
import { msg, type Message } from "../../messages/format.js";
import { lineOfPointer } from "../../pbir/json.js";
import { REPORT_LABEL } from "../../pbir/names.js";
import type { Report } from "../../pbir/types.js";
import { reportFinding } from "../report-helpers.js";
import type { RuleFinding } from "../types.js";
import { pbiplintRule } from "./define.js";

/** Below this, text is the same colour as what is behind it: hidden on purpose, most often. */
const SAME_COLOUR = 1.1;

const THEME_SOURCES: ReadonlySet<string> = new Set(["customTheme", "baseTheme"]);

/** Whether both colours of a pair come from the theme files, so the fix is one change to a theme. */
const fromTheme = (m: Measured): boolean =>
  THEME_SOURCES.has(m.foregroundAt.source) &&
  m.backgroundAt.every((l) => THEME_SOURCES.has(l.source));

/** The theme line that supplies a pair's text colour: the hex itself when a name led to it. */
const themeSetting = (m: Measured): { file: string; pointer: string } => ({
  file: m.foregroundAt.from?.file ?? m.foregroundAt.file!,
  pointer: m.foregroundAt.from?.pointer ?? m.foregroundAt.pointer,
});

/** The worst pair of a group: the lowest ratio for the threshold it needs. */
const worst = (pairs: Measured[]): Measured =>
  pairs.reduce((a, b) => (b.ratio / b.required < a.ratio / a.required ? b : a));

function sizeOf(m: Measured): Message {
  return m.fontSize === undefined
    ? msg("LOW_TEXT_CONTRAST.sizeUnknown")
    : msg("LOW_TEXT_CONTRAST.size", { fontSize: m.fontSize, bold: m.bold ? "yes" : "no" });
}

const element = (m: Measured): Message => msg("LOW_TEXT_CONTRAST.element", { element: m.kind });

/** What a pair's message says, on a visual. */
function onVisual(m: Measured, others: number): Message {
  const shared = {
    element: element(m),
    state: m.state ?? "default",
    field: m.field ?? "none",
    foreground: toHex(m.foreground),
    background: toHex(m.background),
    ratio: truncateRatio(m.ratio),
  };
  if (m.ratio < SAME_COLOUR) return msg("LOW_TEXT_CONTRAST.sameColour", shared);
  // With no size known, the suggestion passes the stricter 4.5:1, so it serves any size.
  const better = suggest(m.foreground, m.background, m.fontSize === undefined ? 4.5 : m.required);
  return msg("LOW_TEXT_CONTRAST", {
    ...shared,
    size: sizeOf(m),
    required: m.required,
    suggested: toHex(better.colour),
    suggestedRatio: truncateRatio(better.ratio),
    others,
    foregroundSource: m.foregroundAt.source,
    backgroundSource: m.backgroundAt[0]?.source ?? "page",
  });
}

/** The line of a visual's file the finding points at: the text colour, else the background it sets. */
function pointerOf(m: Measured): string | undefined {
  if (m.foregroundAt.file === m.visual.file) return m.foregroundAt.pointer;
  return m.backgroundAt.find((l) => l.file === m.visual.file)?.pointer;
}

function themeFinding(report: Report, pairs: Measured[]): RuleFinding {
  const m = worst(pairs);
  const { file, pointer } = themeSetting(m);
  const theme = [report.themes.custom, report.themes.base].find((t) => t?.file === file);
  const better = suggest(m.foreground, m.background, m.required);
  const kinds = [...new Set(pairs.map((p) => p.kind))];
  return {
    objectType: "Report",
    objectName: REPORT_LABEL,
    objectId: `${file}#${pointer}`,
    location: { file, line: lineOfPointer(theme?.text ?? "", pointer) },
    message: msg("LOW_TEXT_CONTRAST.theme", {
      setting: pointer.split("/").filter(Boolean).join("."),
      theme: file,
      foreground: toHex(m.foreground),
      background: toHex(m.background),
      ratio: truncateRatio(m.ratio),
      size: sizeOf(m),
      required: m.required,
      visuals: new Set(pairs.map((p) => p.visual)).size,
      elements: kinds.map((kind) => msg("LOW_TEXT_CONTRAST.element", { element: kind })),
      suggested: toHex(better.colour),
      suggestedRatio: truncateRatio(better.ratio),
    }),
  };
}

export const LOW_TEXT_CONTRAST = pbiplintRule({
  id: "LOW_TEXT_CONTRAST",
  name: "Text with too little contrast",
  category: "Accessibility",
  severity: 2,
  scope: ["Visual", "Report"],
  layer: "report",
  // One finding per text element per visual, naming its worst instance or state; a pair whose two
  // colours both come from the theme files is reported once, on the theme setting behind its text
  // colour, wherever it fails (spec section 8).
  check: ({ report }) => {
    if (!report) return [];
    const failing = measureReport(report).measured.filter((m) => m.ratio < m.required);
    const byVisual = new Map<string, Measured[]>();
    const byTheme = new Map<string, Measured[]>();
    for (const m of failing) {
      const [map, key] = fromTheme(m)
        ? [byTheme, `${themeSetting(m).file}#${themeSetting(m).pointer}`]
        : [byVisual, `${m.page.id}/${m.visual.id}/${m.kind}/${m.object}`];
      const list = map.get(key);
      if (list) list.push(m);
      else map.set(key, [m]);
    }
    const onVisuals = [...byVisual.values()].map((pairs) => {
      const m = worst(pairs);
      return reportFinding.visual(m.visual, pointerOf(m), onVisual(m, pairs.length - 1));
    });
    return [...onVisuals, ...[...byTheme.values()].map((pairs) => themeFinding(report, pairs))];
  },
});

export const contrastRules = [LOW_TEXT_CONTRAST];
