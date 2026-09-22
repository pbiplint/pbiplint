import { escapePointer } from "../../pbir/refs.js";
import { literal } from "../../pbir/build.js";
import { allVisuals, reportFinding } from "../report-helpers.js";
import { inspectorRule } from "./define.js";

export const AVOID_SHOW_ITEMS_WITH_NO_DATA = inspectorRule(
  "AVOID_SHOW_ITEMS_WITH_NO_DATA",
  { category: "Performance", scope: ["Visual"] },
  (report) =>
    allVisuals(report)
      .filter((v) => v.showAllRoles.length > 0)
      .map((v) =>
        reportFinding.visual(
          v,
          `/visual/query/queryState/${escapePointer(v.showAllRoles[0]!)}/showAll`,
          `Show items with no data is on for ${v.showAllRoles.join(", ")}`,
        ),
      ),
);

const HEX = /^#(?:[A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/;
const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

/** JSON pointers of every `solid.color` literal that is a hex value, which is how PBIR writes a colour set by hand. */
function hexColourPointers(node: unknown, pointer = ""): string[] {
  if (Array.isArray(node))
    return node.flatMap((item, i) => hexColourPointers(item, `${pointer}/${i}`));
  if (!isRecord(node)) return [];
  const out: string[] = [];
  if (isRecord(node.solid)) {
    const value = literal(node.solid.color);
    if (value !== undefined && HEX.test(value)) out.push(`${pointer}/solid/color`);
  }
  for (const [key, value] of Object.entries(node))
    out.push(...hexColourPointers(value, `${pointer}/${escapePointer(key)}`));
  return out;
}

/** Deviation: hex literals in colour properties only, where the source matches the pattern anywhere in the visual's text. */
export const ENSURE_THEME_COLOURS = inspectorRule(
  "ENSURE_THEME_COLOURS",
  { category: "Report Design", scope: ["Visual"] },
  (report) =>
    allVisuals(report)
      .filter((v) => v.type !== "textbox")
      .flatMap((v) => {
        const pointers = hexColourPointers(v.json);
        return pointers.length
          ? [
              reportFinding.visual(
                v,
                pointers[0],
                `${pointers.length} colour${pointers.length === 1 ? "" : "s"} set to a hex value instead of a theme colour`,
              ),
            ]
          : [];
      }),
);

/**
 * Where an alt text finding points: the first `general` entry that carries an `altText` key (an
 * empty one, since the visual fires), or the container objects when no entry carries one. The
 * segments are fixed keys and array indexes, so none needs escaping.
 */
function altTextPointer(json: unknown): string {
  const vco =
    isRecord(json) && isRecord(json.visual) && isRecord(json.visual.visualContainerObjects)
      ? json.visual.visualContainerObjects
      : undefined;
  const general = vco && Array.isArray(vco.general) ? vco.general : [];
  const i = general.findIndex(
    (entry) => isRecord(entry) && isRecord(entry.properties) && "altText" in entry.properties,
  );
  return i === -1
    ? "/visual/visualContainerObjects"
    : `/visual/visualContainerObjects/general/${i}/properties/altText`;
}

export const ENSURE_ALTTEXT = inspectorRule(
  "ENSURE_ALTTEXT",
  { category: "Accessibility", scope: ["Visual"] },
  (report) =>
    allVisuals(report)
      .filter((v) => v.type !== "shape" && v.altText === undefined)
      .map((v) => reportFinding.visual(v, altTextPointer(v.json), "no alt text")),
);

export const visualRules = [AVOID_SHOW_ITEMS_WITH_NO_DATA, ENSURE_THEME_COLOURS, ENSURE_ALTTEXT];
