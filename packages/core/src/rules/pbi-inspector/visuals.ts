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

/**
 * JSON pointers to the `Value` of every `Literal` holding a hex inside one colour: the plain value,
 * a conditional formatting case, or a gradient stop. Each is a colour set by hand, and the pointer
 * ends at the value so a finding's line is the hex's own.
 */
function hexLiterals(node: unknown, pointer: string): string[] {
  if (Array.isArray(node)) return node.flatMap((item, i) => hexLiterals(item, `${pointer}/${i}`));
  if (!isRecord(node)) return [];
  const value = isRecord(node.Literal) ? literal({ expr: { Literal: node.Literal } }) : undefined;
  const here = value !== undefined && HEX.test(value) ? [`${pointer}/Literal/Value`] : [];
  return [
    ...here,
    ...Object.entries(node).flatMap(([key, child]) =>
      hexLiterals(child, `${pointer}/${escapePointer(key)}`),
    ),
  ];
}

/** JSON pointers of every hex literal under a `solid.color`, which is where PBIR writes a colour property. */
function hexColourPointers(node: unknown, pointer = ""): string[] {
  if (Array.isArray(node))
    return node.flatMap((item, i) => hexColourPointers(item, `${pointer}/${i}`));
  if (!isRecord(node)) return [];
  return Object.entries(node).flatMap(([key, value]) => {
    const at = `${pointer}/${escapePointer(key)}`;
    return key === "solid" && isRecord(value)
      ? hexLiterals(value.color, `${at}/color`)
      : hexColourPointers(value, at);
  });
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
 * empty one, since the visual fires), or the container objects when no entry carries one. A
 * visual group keeps its objects under `visualGroup` rather than `visual`, so its pointer starts
 * there. The segments are fixed keys and array indexes, so none needs escaping.
 */
function altTextPointer(json: unknown): string {
  const group = isRecord(json) && isRecord(json.visualGroup) ? json.visualGroup : undefined;
  const base = group ? "/visualGroup/objects" : "/visual/visualContainerObjects";
  const objects = group
    ? group.objects
    : isRecord(json) && isRecord(json.visual)
      ? json.visual.visualContainerObjects
      : undefined;
  const general = isRecord(objects) && Array.isArray(objects.general) ? objects.general : [];
  const i = general.findIndex(
    (entry) => isRecord(entry) && isRecord(entry.properties) && "altText" in entry.properties,
  );
  return i === -1 ? base : `${base}/general/${i}/properties/altText`;
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
